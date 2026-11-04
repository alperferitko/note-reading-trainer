import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingConfig } from '../supabase/functions/_shared/ai/staging-config.mjs';
import { createStagingGateway } from '../supabase/functions/_shared/ai/staging-gateway.mjs';
import { feedback, request } from './fixtures/ai/offline.mjs';

const s = 's'.repeat(20), p = 'p'.repeat(20);
const pins = { stagingProjectRef: s, productionProjectRef: p, stagingOrigins: ['https://ai-stage.example'], productionOrigins: ['https://production.example'] };
const env = (overrides = {}) => ({ AI_BACKEND_MODE: 'staging-meta', AI_STAGING_LIVE_APPROVAL: 'APPROVED_BOUNDED_META_STAGING',
  AI_STAGING_PROJECT_REF: s, AI_PRODUCTION_PROJECT_REF: p, SUPABASE_URL: `https://${s}.supabase.co`,
  DENO_DEPLOYMENT_ID: `${s}_test_revision`, AI_STAGING_APPROVAL_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
  META_MODEL_VERIFIED_AT: new Date().toISOString(), META_MODEL_VERIFICATION_SOURCE: 'https://api.meta.ai/v1/models',
  META_TOKEN_BOUND_VERIFIED: 'true', META_MODEL_ID: 'verified-model-id', META_API_KEY: 'fixture-not-real', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
  SUPABASE_ANON_KEY: 'fixture-anon', META_INPUT_USD_PER_MILLION: '0.1', META_OUTPUT_USD_PER_MILLION: '0.2',
  AI_ALLOWED_ORIGINS: 'https://ai-stage.example', ...overrides });
const config = overrides => { const values = env(overrides); return stagingConfig(name => values[name], pins); };
const rpc = () => ({ rpc: async (name, args) => name === 'ai_usage_reserve'
  ? { data: { status: 'reserved', reservationId: '00000000-0000-4000-8000-000000000001' }, error: null }
  : { data: { status: 'settled', args }, error: null } });
const body = () => { const value = request(); value.evidence.records = value.evidence.records.map((row, i) => ({ ...row, at: new Date(Date.now() - 10000 + i * 1000).toISOString() })); return value; };
const user = { authenticated: true, userId: '10000000-0000-0000-0000-000000000001' };

test('the model ID and response format come from reviewed configuration, never from code defaults', () => {
  assert.equal(config().responseFormat, 'json_schema');
  assert.equal(config({ META_RESPONSE_FORMAT: 'json_object' }).responseFormat, 'json_object');
  assert.equal(config({ META_RESPONSE_FORMAT: 'text' }), null);
  assert.equal(config({ META_MODEL_ID: undefined }), null);
  assert.equal(config({ META_MODEL_ID: 'x'.repeat(201) }), null);
  // The live config stays closed while the pins still lack a production deny-ref or origins.
  const values = env();
  assert.equal(stagingConfig(name => values[name], { ...pins, productionProjectRef: null }), null);
  assert.equal(stagingConfig(name => values[name], { ...pins, stagingOrigins: [] }), null);
});

for (const format of ['json_schema', 'json_object']) {
  test(`the Meta wire request uses the configured ${format} format and the exact model ID`, async () => {
    let sent = null; let calls = 0;
    const gateway = createStagingGateway({ config: config({ META_RESPONSE_FORMAT: format }), createClient: () => rpc(), transport: async (url, init) => {
      calls++; sent = { url, body: JSON.parse(init.body), auth: init.headers.authorization ?? init.headers.Authorization };
      return Response.json({ model: 'verified-model-id', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(feedback()) } }], usage: { prompt_tokens: 120, completion_tokens: 60 } });
    } });
    const result = await gateway.execute(user, body(), { requestId: 'r', idempotencyKey: `k-${format}` });
    assert.equal(calls, 1);
    assert.equal(sent.url, 'https://api.meta.ai/v1/chat/completions');
    assert.equal(sent.body.model, 'verified-model-id');
    assert.equal(sent.body.response_format.type, format);
    assert.equal(sent.body.stream, false);
    assert.ok(sent.body.max_completion_tokens <= 800);
    assert.equal(result.mode, 'live');
    assert.equal(result.provenance.modelId, 'verified-model-id');
  });
}

test('an alias answer (different model in the response) is rejected rather than billed as the verified model', async () => {
  let calls = 0;
  const gateway = createStagingGateway({ config: config(), createClient: () => rpc(), transport: async () => {
    calls++;
    return Response.json({ model: 'some-alias', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(feedback()) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  } });
  const result = await gateway.execute(user, body(), { requestId: 'r', idempotencyKey: 'alias' });
  assert.equal(calls, 1, 'no retry');
  assert.ok(result.error);
  assert.equal(result.error.status, 503);
});

test('official muse-spark-1.3 standard prices fit the unchanged $0.02 request cap, and the wire body is pure ASCII', async () => {
  // dev.meta.ai/docs/pricing-rate-limits, read 2026-11-03: $1.25 input, $4.25 output per million tokens.
  const live = config({ META_INPUT_USD_PER_MILLION: '1.25', META_OUTPUT_USD_PER_MILLION: '4.25' });
  assert.ok(live, 'config opens with the official prices');
  assert.equal(live.maxInputTokens, live.maxInputChars + 4096);
  assert.ok(live.reservedUsd <= 0.02, `reserved ${live.reservedUsd}`);
  // A slightly dearer model is still refused: the cap is not raised.
  assert.equal(config({ META_INPUT_USD_PER_MILLION: '1.4', META_OUTPUT_USD_PER_MILLION: '4.25' }), null);
  let raw = null;
  const gateway = createStagingGateway({ config: live, createClient: () => rpc(), transport: async (url, init) => {
    raw = init.body;
    return Response.json({ model: 'verified-model-id', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(feedback()) } }], usage: { prompt_tokens: 120, completion_tokens: 60 } });
  } });
  const value = body(); value.locale = 'tr';
  await gateway.execute(user, value, { requestId: 'r', idempotencyKey: 'ascii' });
  assert.ok(raw && /^[\x20-\x7e]*$/.test(raw), 'ASCII only');
  assert.equal(Buffer.byteLength(raw, 'utf8'), raw.length);
  assert.ok(raw.length <= live.maxInputChars);
  assert.equal(JSON.parse(raw).reasoning_effort, 'minimal');
  assert.match(JSON.parse(raw).messages[0].content, /supportive music-reading teacher/);
});

test('a long history is trimmed to the weakest contexts so the Meta body stays under the limit', async () => {
  const { createMetaAdapter, MAX_MODEL_CONTEXTS } = await import('../supabase/functions/_shared/ai/providers/meta.mjs');
  const contexts = Array.from({ length: 30 }, (_, i) => ({ id: `context-${i + 1}`, module: 'reading', clef: 'treble', timed: false, recentAttempts: 3 + (i % 4), status: i === 29 ? 'needs-work' : 'secure' }));
  const measurements = contexts.map(c => ({ id: `${c.id}-accuracy`, context: c.id, kind: 'accuracy', value: 50, unit: 'percent', sampleSize: 3 }));
  let sent = null;
  const transport = async (_url, init) => { sent = JSON.parse(init.body); throw new Error('stop after capture'); };
  const adapter = createMetaAdapter({ modelId: 'm', apiKey: 'k', maxInputChars: 8000, maxOutputTokens: 800, transport, responseFormat: 'json_schema' });
  await assert.rejects(adapter.generate({ task: 'practice-feedback', locale: 'tr', modelId: 'm', maxOutputTokens: 800, evidenceSummary: { eligible: true, contexts, measurements } }));
  const evidence = JSON.parse(sent.messages[1].content).evidence;
  assert.equal(evidence.contexts.length, MAX_MODEL_CONTEXTS);
  assert.ok(evidence.contexts.some(c => c.id === 'context-30'), 'the weak context is kept');
  assert.ok(evidence.measurements.every(m => evidence.contexts.some(c => c.id === m.context)));
});

test('non-ASCII ids that escape to six characters each shrink the body below the limit, weakest first', async () => {
  const { createMetaAdapter, MAX_MODEL_CONTEXTS } = await import('../supabase/functions/_shared/ai/providers/meta.mjs');
  // Every Turkish letter becomes \uXXXX on the wire, so ten of these are far over 8,000 characters.
  const tr = 'şğıüöçİŞĞÜÖÇ'.repeat(3);
  const contexts = Array.from({ length: 30 }, (_, i) => ({ id: `okuma-${tr}-${i + 1}`, module: `okuma-${tr}`, clef: 'treble', timed: false,
    recentAttempts: 3 + (i % 4), status: i >= 27 ? 'needs-work' : i >= 24 ? 'developing' : 'secure' }));
  const measurements = contexts.map(c => ({ id: `${c.id}-doğruluk`, context: c.id, kind: 'accuracy', value: 42.5, unit: 'percent', sampleSize: 7 }));
  let raw = null;
  const transport = async (_url, init) => { raw = init.body; throw new Error('stop after capture'); };
  const adapter = createMetaAdapter({ modelId: 'm', apiKey: 'k', maxInputChars: 8000, maxOutputTokens: 800, transport, responseFormat: 'json_schema' });
  await assert.rejects(adapter.generate({ task: 'practice-feedback', locale: 'tr', modelId: 'm', maxOutputTokens: 800, evidenceSummary: { eligible: true, contexts, measurements } }));
  assert.ok(raw, 'the shrunken body was sent');
  assert.ok(raw.length <= 8000, `wire ${raw.length}`);
  assert.equal(Buffer.byteLength(raw, 'utf8'), raw.length);
  const evidence = JSON.parse(JSON.parse(raw).messages[1].content).evidence;
  assert.ok(evidence.contexts.length >= 1 && evidence.contexts.length < MAX_MODEL_CONTEXTS, `kept ${evidence.contexts.length}`);
  const kept = new Set(evidence.contexts.map(c => c.id));
  // Ranking holds: every kept context is at least as weak as every dropped one, so needs-work stays.
  const order = { 'needs-work': 0, developing: 1, secure: 3 };
  const dropped = contexts.filter(c => !kept.has(c.id));
  assert.ok(Math.max(...evidence.contexts.map(c => order[c.status])) <= Math.min(...dropped.map(c => order[c.status])));
  assert.ok(evidence.contexts.some(c => c.status === 'needs-work'), 'the weakest context is kept');
  // Nothing is truncated: kept contexts and their measurements are byte-identical to the source.
  for (const c of evidence.contexts) assert.deepEqual(c, contexts.find(s => s.id === c.id));
  assert.deepEqual(evidence.measurements, measurements.filter(m => kept.has(m.context)));
});

test('a single context too large on its own is refused before sending, at zero billed usage', async () => {
  const { createMetaAdapter } = await import('../supabase/functions/_shared/ai/providers/meta.mjs');
  const id = `okuma-${'ş'.repeat(1500)}`;
  let calls = 0;
  const adapter = createMetaAdapter({ modelId: 'm', apiKey: 'k', maxInputChars: 8000, maxOutputTokens: 800, transport: async () => { calls++; throw new Error('must not send'); } });
  await assert.rejects(adapter.generate({ task: 'practice-feedback', locale: 'tr', modelId: 'm', maxOutputTokens: 800,
    evidenceSummary: { eligible: true, contexts: [{ id, module: 'reading', clef: 'treble', timed: false, recentAttempts: 3, status: 'needs-work' }],
      measurements: [{ id: `${id}-a`, context: id, kind: 'accuracy', value: 50, unit: 'percent', sampleSize: 3 }] } }),
  error => error.code === 'request_too_large' && error.status === 413
    && error.billingUsage?.inputTokens === 0 && error.billingUsage?.outputTokens === 0);
  assert.equal(calls, 0);
});

test('failures are classed: refused before sending and a definite 4xx settle at zero, 5xx stays uncertain', async () => {
  const { createMetaAdapter } = await import('../supabase/functions/_shared/ai/providers/meta.mjs');
  const request = { task: 'practice-feedback', locale: 'tr', modelId: 'm', maxOutputTokens: 800,
    evidenceSummary: { eligible: true, contexts: [{ id: 'c1', module: 'reading', clef: 'treble', timed: false, recentAttempts: 3, status: 'needs-work' }],
      measurements: [{ id: 'c1-a', context: 'c1', kind: 'accuracy', value: 50, unit: 'percent', sampleSize: 3 }] } };
  const zero = error => error.billingUsage?.inputTokens === 0 && error.billingUsage?.outputTokens === 0;
  let calls = 0;
  const misconfigured = createMetaAdapter({ modelId: 'm', endpoint: 'https://example.com/v1/chat/completions', apiKey: 'k', transport: async () => { calls++; } });
  await assert.rejects(misconfigured.generate(request), error => error.code === 'invalid_model_configuration' && error.failureClass === 'not_sent' && zero(error));
  assert.equal(calls, 0);
  const answering = status => createMetaAdapter({ modelId: 'm', apiKey: 'k', transport: async () => new Response('{"error":"x"}', { status }) });
  await assert.rejects(answering(400).generate(request), error => error.failureClass === 'provider_rejected' && zero(error) && !error.retryable);
  await assert.rejects(answering(429).generate(request), error => error.failureClass === 'provider_rejected' && zero(error) && error.retryable);
  await assert.rejects(answering(503).generate(request), error => error.failureClass === 'provider_error' && !error.billingUsage);
  await assert.rejects(answering(408).generate(request), error => error.failureClass === 'provider_error' && !error.billingUsage);
});

test('a perfect round (every note right, nothing to work on) is a valid live answer with no exercises', async () => {
  const live = config({ META_INPUT_USD_PER_MILLION: '1.25', META_OUTPUT_USD_PER_MILLION: '4.25' });
  let sent = null;
  const value = body();
  value.evidence.records = value.evidence.records.map((row) => ({ ...row, correct: true, answer: row.expected ?? row.answer }));
  const gateway = createStagingGateway({ config: live, createClient: () => rpc(), transport: async (_url, init) => {
    sent = JSON.parse(init.body);
    const evidence = JSON.parse(sent.messages[1].content).evidence;
    const ref = evidence.measurements[0]?.id;
    const output = { summary: 'Bu turda bütün notaları doğru okudun.', observations: ref ? [{ text: 'Sol anahtarındaki notalar bu turda sağlamdı.', evidenceRefs: [ref] }] : [], exercises: [], limitations: [] };
    return Response.json({ model: 'verified-model-id', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 900, completion_tokens: 80 } });
  } });
  const result = await gateway.execute(user, value, { requestId: 'r', idempotencyKey: 'perfect-round' });
  assert.ok(sent, 'the request was sent');
  assert.match(sent.messages[0].content, /invent no difficulty/);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  assert.equal(result.mode, 'live');
  assert.deepEqual(result.result.exercises, []);
});
