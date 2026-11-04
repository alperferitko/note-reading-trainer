import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLearning, requestTeacherDemo, analyzeTeacherRhythm } from '../lib/ai-learning.mjs';
import { createMetaAdapter } from '../supabase/functions/_shared/ai/providers/meta.mjs';
import { buildEvidenceSummary } from '../supabase/functions/_shared/ai/evidence-summary.mjs';
import { request, NOW, feedback } from './fixtures/ai/offline.mjs';

const records = () => request().evidence.records.map(row => ({ ...row, position: 1 }));
const summary = () => buildEvidenceSummary(records(), NOW);
const input = () => ({ modelId: 'test-only-model', task: 'practice-feedback', locale: 'tr', evidenceSummary: summary(), maxOutputTokens: 200 });
const wire = (overrides = {}) => Response.json({ model: 'test-only-model', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(feedback()) } }], usage: { prompt_tokens: 100, completion_tokens: 50 }, ...overrides });
const adapter = (transport, config = {}) => createMetaAdapter({ modelId: 'test-only-model', apiKey: 'test-key-not-real', transport, ...config });

test('Meta adapter is disabled without injected transport, even if credentials exist', async () => {
  await assert.rejects(adapter().generate(input()), { code: 'live_calls_disabled' });
});

test('Meta wire format, bearer, output cap and schema validated using mocked transport', async () => {
  let payload;
  const result = await adapter(async (url, init) => {
    assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer test-key-not-real');
    payload = JSON.parse(init.body);
    return wire();
  }).generate(input());
  assert.equal(payload.model, 'test-only-model');
  assert.equal(payload.max_completion_tokens, 200);
  assert.equal(payload.response_format.type, 'json_schema');
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.ok(!JSON.stringify(payload).includes('session-1'));
  assert.equal(result.usage.inputTokens, 100);
});

test('no invented default model, untrusted URL, oversized input or response accepted', async () => {
  for (const config of [{ modelId: undefined }, { endpoint: 'https://evil.example/v1/chat/completions' }, { maxInputChars: 1 }]) {
    await assert.rejects(adapter(async () => { throw new Error('must not send'); }, config).generate(input()));
  }
  await assert.rejects(adapter(async () => new Response('x'.repeat(65537))).generate(input()), { code: 'invalid_model_response' });
});

test('Meta output rejects invalid JSON, measurement invention, truncation, refusal and model mismatch', async () => {
  for (const overrides of [
    { model: 'other' },
    { choices: [{ finish_reason: 'length', message: { content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { refusal: 'no', content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...feedback(), cents: 2 }) } }] },
    { usage: { prompt_tokens: 1, completion_tokens: 201 } },
  ]) await assert.rejects(adapter(async () => wire(overrides)).generate(input()), { code: 'invalid_model_response' });
});

test('Meta timeout aborts transport, errors hide provider details and missing usage stays unknown', async () => {
  let signal;
  await assert.rejects(adapter((_url, init) => { signal = init.signal; return new Promise(() => {}); }, { timeoutMs: 5 }).generate(input()), { code: 'provider_timeout' });
  assert.equal(signal.aborted, true);
  await assert.rejects(adapter(async () => new Response('SECRET private body', { status: 429 })).generate(input()), error => error.code === 'provider_unavailable' && !error.message.includes('SECRET'));
  const result = await adapter(async () => wire({ usage: undefined })).generate(input());
  assert.deepEqual(result.usage, { inputTokens: null, outputTokens: null });
});

test('learning assessment measures session, finds only established contextual weaknesses and names written pitch', () => {
  const result = assessLearning(records(), 'session-1', 'tr', NOW);
  assert.equal(result.correct, 1);
  assert.equal(result.wrong, 3);
  assert.equal(result.weaknesses[0].label, 'Fa4 · sol anahtarı');
  assert.equal(result.suggestions.length, 3);
  assert.ok(result.suggestions.every(item => ['repeat', 'lesson', 'progress'].includes(item.target)));
});

test('many distinct single errors are not a repeated-weakness diagnosis; assistance/sparse data is insufficient', () => {
  assert.equal(assessLearning(records().map((row, index) => ({ ...row, item: `different-${index}` })), 'session-1', 'en', NOW).weaknesses.length, 0);
  assert.equal(assessLearning(records().slice(0, 2), 'session-1', 'en', NOW).eligible, false);
  assert.equal(assessLearning(records().map(row => ({ ...row, assisted: true })), 'session-1', 'en', NOW).eligible, false);
  assert.equal(assessLearning(records(), 'other-session', 'en', NOW).attempts, 0);
});

test('demo is explicitly mock, local and cancelable; rhythm measurements reuse evaluator', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('no external network'); };
  try {
    const result = await requestTeacherDemo(assessLearning(records(), 'session-1', 'en', NOW), { delayMs: 0 });
    assert.equal(result.mode, 'mock');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(requestTeacherDemo({}, { signal: controller.signal }), /demo_cancelled/);
    assert.equal(analyzeTeacherRhythm([], 60, 'eighths').meanAbsoluteMs, null);
    assert.throws(() => analyzeTeacherRhythm([], 60, 'unknown'));
  } finally { globalThis.fetch = original; }
});