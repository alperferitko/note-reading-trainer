import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptGatewayResponse, buildFeedbackRequest, deterministicResult, gatewayEndpoint, idempotencyKeyFor, requestTeacherFeedback } from '../lib/ai-client.mjs';
import { validateRequest } from '../supabase/functions/_shared/ai/validation.mjs';
import { buildEvidenceSummary } from '../supabase/functions/_shared/ai/evidence-summary.mjs';
import { createAIHttpHandler } from '../supabase/functions/_shared/ai/http-handler.mjs';
import { createLocalMockGateway } from '../supabase/functions/_shared/ai/local-mock.mjs';

const NOW = Date.parse('2026-11-02T10:00:00Z');
const PINS = { stagingProjectRef: 'coftskrofgcfzsuqdtpn', productionProjectRef: 'prodprodprodprodprod', stagingOrigins: [], productionOrigins: [] };
const STAGING = 'https://coftskrofgcfzsuqdtpn.supabase.co/functions/v1/ai-gateway';
const USER = '10000000-0000-4000-8000-000000000001';

function record(i, { session = 'notes-1', item = 'treble:f5', correct = false, module = 'reading', minutesAgo = 10 - i * 0.1 } = {}) {
  return { id: `${session}-${item}-${i}`, module, task: 'staff-name', item, session, clef: 'treble', midi: 77, position: 8, accidental: 0,
    correct, firstAttempt: true, assisted: false, timedOut: false, responseMs: 1500 + i * 10, timeLimitMs: null, answer: 'Mi',
    at: new Date(NOW - minutesAgo * 60000).toISOString() };
}
const eligible = () => [0, 1, 2, 3].map(i => record(i, { correct: i === 0 }));

test('only the pinned staging gateway or a loopback mock is accepted', () => {
  assert.deepEqual(gatewayEndpoint(STAGING, PINS), { url: STAGING, kind: 'staging' });
  assert.equal(gatewayEndpoint('http://localhost:54321/functions/v1/ai-gateway', PINS).kind, 'local');
  for (const bad of [
    'https://prodprodprodprodprod.supabase.co/functions/v1/ai-gateway',
    'https://otherotherotherother.supabase.co/functions/v1/ai-gateway',
    `${STAGING}?x=1`, `${STAGING}#a`, STAGING.replace('https:', 'http:'), 'https://coftskrofgcfzsuqdtpn.supabase.co/functions/v1/other',
    'https://evil.example/functions/v1/ai-gateway', 'not a url', '', null,
  ]) assert.equal(gatewayEndpoint(bad, PINS), null, String(bad));
  assert.equal(gatewayEndpoint(STAGING, { ...PINS, stagingProjectRef: null }), null);
});

test('the request uses only this module, drops free answers and passes the gateway validator', () => {
  const rows = [...eligible(), record(9, { module: 'guitar' }), record(10, { session: 'notes-0', item: 'treble:e4', correct: true, minutesAgo: 60 })];
  const request = buildFeedbackRequest(rows, { session: 'notes-1', module: 'reading', locale: 'tr', now: NOW });
  assert.equal(request.evidence.records.length, 5);
  assert.ok(request.evidence.records.every(row => row.module === 'reading' && !('answer' in row)));
  assert.deepEqual(request.scope, { module: 'reading' });
  const validated = validateRequest(request, NOW, 262144);
  assert.equal(validated.evidence.records.length, 5);
});

test('history is trimmed to fit the model-input bound, keeping this session first', () => {
  const rows = [];
  for (let i = 0; i < 300; i++) rows.push(record(i, { session: `old-${i % 30}`, item: `treble:n${i % 120}`, minutesAgo: 500 - i }));
  rows.push(...eligible());
  const request = buildFeedbackRequest(rows, { session: 'notes-1', module: 'reading', now: NOW, maxSummaryChars: 4000 });
  assert.ok(JSON.stringify(buildEvidenceSummary(request.evidence.records, NOW)).length <= 4000);
  assert.ok(request.evidence.records.filter(row => row.session === 'notes-1').length === 4);
});

test('without gateway, sign-in or enough evidence the result is deterministic and no request is made', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('should not be called'); };
  const request = buildFeedbackRequest(eligible(), { session: 'notes-1', module: 'reading', now: NOW });
  const base = { request, idempotencyKey: 'k', fetchImpl, now: NOW, apiKey: null };
  assert.equal((await requestTeacherFeedback({ ...base, endpoint: null, accessToken: 't' })).reason, 'gateway_not_configured');
  assert.equal((await requestTeacherFeedback({ ...base, endpoint: { url: STAGING }, accessToken: null })).reason, 'sign_in_required');
  const thin = buildFeedbackRequest(eligible().slice(0, 2), { session: 'notes-1', module: 'reading', now: NOW });
  const result = await requestTeacherFeedback({ ...base, request: thin, endpoint: { url: STAGING }, accessToken: 't' });
  assert.equal(result.mode, 'deterministic');
  assert.equal(result.reason, 'insufficient_evidence');
  assert.equal(calls, 0);
  assert.equal(deterministicResult(request, 'x', NOW).provenance.provider, 'none');
});

test('the real local mock gateway answers in mock mode, validated against the evidence sent', async () => {
  const handler = createAIHttpHandler({ gateway: createLocalMockGateway(), authenticate: async () => ({ id: USER }), allowedOrigins: ['http://localhost:5199'] });
  let calls = 0;
  const fetchImpl = async (url, init) => { calls++; const headers = new Headers(init.headers); headers.set('origin', 'http://localhost:5199');
    return handler(new Request(url, { method: init.method, headers, body: init.body, signal: init.signal })); };
  const request = buildFeedbackRequest(eligible(), { session: 'notes-1', module: 'reading', locale: 'en', now: Date.now() });
  // The mock gateway uses the real clock; build evidence relative to it.
  const live = eligible().map(row => ({ ...row, at: new Date(Date.now() - 60000).toISOString() }));
  const req = buildFeedbackRequest(live, { session: 'notes-1', module: 'reading', locale: 'en' });
  const result = await requestTeacherFeedback({ endpoint: { url: 'http://localhost:54321/functions/v1/ai-gateway' }, accessToken: 'aaaa.bbbb.cccc', apiKey: null,
    request: req, idempotencyKey: 'session-key-1', fetchImpl });
  assert.equal(result.mode, 'mock');
  assert.equal(result.provenance.modelId, 'local-meta-mock-v1');
  assert.ok(result.limitations.includes('mock_not_live_inference'));
  assert.equal(result.result.exercises.length, 1);
  // Same key, same body: replay, not a second inference.
  const again = await requestTeacherFeedback({ endpoint: { url: 'http://localhost:54321/functions/v1/ai-gateway' }, accessToken: 'aaaa.bbbb.cccc', apiKey: null,
    request: req, idempotencyKey: 'session-key-1', fetchImpl });
  assert.equal(again.mode, 'mock');
  assert.equal(calls, 2);
  assert.ok(request);
});

test('responses that cite unknown measurements, claim live without provenance or fail are not shown', async () => {
  const request = buildFeedbackRequest(eligible(), { session: 'notes-1', module: 'reading', now: NOW });
  const summary = buildEvidenceSummary(request.evidence.records, NOW);
  const good = { schemaVersion: '1', mode: 'live', evidenceSummary: summary, provenance: { provider: 'meta', modelId: 'verified-model' },
    result: { summary: 'ok', observations: [{ text: 'F5 was hard.', evidenceRefs: ['context-1:accuracy'] }], exercises: [], limitations: [] } };
  assert.equal(acceptGatewayResponse(good, request, NOW).mode, 'live');
  assert.throws(() => acceptGatewayResponse({ ...good, result: { ...good.result, observations: [{ text: 'You rushed the rhythm.', evidenceRefs: ['context-9:timing'] }] } }, request, NOW));
  assert.throws(() => acceptGatewayResponse({ ...good, provenance: { provider: 'meta' } }, request, NOW), /invalid_provenance/);
  const altered = structuredClone(summary); altered.measurements[0].value = 99;
  assert.throws(() => acceptGatewayResponse({ ...good, evidenceSummary: altered }, request, NOW), /evidence_mismatch/);

  let calls = 0;
  const failing = async () => { calls++; return new Response(JSON.stringify({ schemaVersion: '1', error: { code: 'provider_unavailable', status: 503, retryable: true } }), { status: 503 }); };
  const result = await requestTeacherFeedback({ endpoint: { url: STAGING }, accessToken: 't', apiKey: 'pk', request, idempotencyKey: 'k', fetchImpl: failing, now: NOW });
  assert.equal(result.mode, 'deterministic');
  assert.equal(result.reason, 'provider_unavailable');
  assert.equal(calls, 1, 'no automatic retry');

  const hanging = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const timedOut = await requestTeacherFeedback({ endpoint: { url: STAGING }, accessToken: 't', apiKey: null, request, idempotencyKey: 'k', fetchImpl: hanging, timeoutMs: 20, now: NOW });
  assert.equal(timedOut.reason, 'timeout');
});

test('the idempotency key is stable for a session and differs between sessions', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const a = idempotencyKeyFor('notes-1', 'reading', storage);
  assert.match(a, /^[A-Za-z0-9_-]{1,120}$/);
  assert.equal(idempotencyKeyFor('notes-1', 'reading', storage), a);
  assert.notEqual(idempotencyKeyFor('notes-2', 'reading', storage), a);
});
