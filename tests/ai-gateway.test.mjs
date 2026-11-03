import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createAIGateway } from '../supabase/functions/_shared/ai/gateway.mjs';
import { createModelRegistry } from '../supabase/functions/_shared/ai/model-registry.mjs';
import { NOW, auth, context, feedback, memoryUsageStore, mockAdapter, model, request } from './fixtures/ai/offline.mjs';

const originalFetch = globalThis.fetch;
before(() => { globalThis.fetch = () => { throw new Error('Network access forbidden in offline AI tests'); }; });
after(() => { globalThis.fetch = originalFetch; });
const setup = (options = {}) => createAIGateway({ registry: createModelRegistry([model]), adapters: [mockAdapter()], store: memoryUsageStore(), clock: () => NOW, ...options });

test('authenticated mock feedback works without network or provider keys', async () => {
  const response = await setup().execute(auth, request(), context);
  assert.equal(response.mode, 'mock');
  assert.equal(response.provenance.provider, 'meta');
  assert.equal(response.usage.estimatedUsd, 0);
  assert.ok(response.limitations.includes('mock_not_live_inference'));
});

test('auth is required; client-provided identity/model keys are not accepted', async () => {
  const gateway = setup();
  assert.equal((await gateway.execute(null, request(), context)).error.status, 401);
  assert.equal((await gateway.execute({ userId: 'x', authenticated: false }, request(), context)).error.status, 401);
  assert.equal((await gateway.execute(auth, request({ userId: 'other' }), context)).error.code, 'invalid_request');
});

test('unconfigured or insufficient AI uses deterministic feedback without reserving budget', async () => {
  const store = memoryUsageStore();
  const gateway = setup({ store, registry: createModelRegistry() });
  assert.equal((await gateway.execute(auth, request(), context)).mode, 'deterministic');
  assert.equal((await setup({ store }).execute(auth, request({ evidence: { records: [] } }), context)).mode, 'deterministic');
  assert.equal(store.entries.length, 0);
});

test('live models and missing quota storage fail closed before invoking adapter', async () => {
  let calls = 0;
  const adapter = mockAdapter(async () => { calls++; throw new Error('must not run'); });
  const live = { ...model, mode: 'live', verifiedAt: new Date(NOW).toISOString(), verificationSource: 'manually verified fixture' };
  const response = await setup({ registry: createModelRegistry([live]), adapters: [adapter] }).execute(auth, request(), context);
  assert.equal(response.error.code, 'live_calls_disabled');
  assert.equal((await setup({ store: undefined, adapters: [adapter] }).execute(auth, request(), context)).error.code, 'usage_store_unavailable');
  assert.equal(calls, 0);
});

test('idempotency replays once per user and rejects changed input', async () => {
  let calls = 0;
  const store = memoryUsageStore();
  const gateway = setup({ store, adapters: [mockAdapter(async () => { calls++; return { output: feedback(), usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop' }; })] });
  await gateway.execute(auth, request(), context);
  assert.match(store.entries[0].fingerprint, /^[a-f0-9]{64}$/);
  const replay = await gateway.execute(auth, request(), { ...context, requestId: 'new-request' });
  assert.equal(replay.requestId, 'new-request');
  assert.equal(calls, 1);
  assert.equal((await gateway.execute(auth, request({ locale: 'en' }), context)).error.code, 'idempotency_conflict');
  await gateway.execute({ userId: 'user-2', authenticated: true }, request(), context);
  assert.equal(calls, 2);
});

test('concurrent requests reserve atomically and do not overshoot maxConcurrent', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const gateway = setup({ adapters: [mockAdapter(() => pending)] });
  const first = gateway.execute(auth, request(), context);
  const second = await gateway.execute(auth, request(), { requestId: 'r2', idempotencyKey: 'k2' });
  assert.equal(second.error.code, 'quota_exceeded');
  release({ output: feedback(), usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop' });
  assert.equal((await first).mode, 'mock');
});

test('minute, daily and global spend quotas reject before inference', async () => {
  for (const policy of [{ requestsPerMinute: 1 }, { requestsPerDay: 1 }]) {
    const gateway = setup({ policy });
    await gateway.execute(auth, request(), context);
    assert.equal((await gateway.execute(auth, request(), { requestId: 'r2', idempotencyKey: 'k2' })).error.status, 429);
  }
  for (const policy of [{ globalDailyUsd: 0 }, { userDailyUsd: 0 }]) {
    assert.equal((await setup({ policy }).execute(auth, request(), context)).error.code, 'quota_exceeded');
  }
});

test('timeout aborts adapter and preserves conservative reservation without retry', async () => {
  const store = memoryUsageStore();
  let signal;
  let calls = 0;
  const gateway = setup({ store, policy: { timeoutMs: 10 }, adapters: [mockAdapter((_, received) => { signal = received; calls++; return new Promise(() => {}); })] });
  const response = await gateway.execute(auth, request(), context);
  assert.equal(response.error.code, 'provider_timeout');
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  assert.equal(store.entries[0].chargedUsd, 0.02);
});

test('malformed output falls back to a safe error with no raw provider details', async () => {
  for (const generate of [async () => { throw new Error('API_KEY=secret private-answer'); },
    async () => ({ output: { ...feedback(), inventedMeasurement: 99 }, usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop' })]) {
    const logs = [];
    const response = await setup({ logger: event => logs.push(event), adapters: [mockAdapter(generate)] }).execute(auth, request(), context);
    assert.equal(response.error.status, 503);
    for (const secret of ['API_KEY', 'private-answer', 'user-1', 'record-0']) assert.ok(!JSON.stringify([response, logs]).includes(secret));
  }
});

test('unknown usage retains reservation; unavailable quota store cannot invoke model', async () => {
  const store = memoryUsageStore();
  const gateway = setup({ store, adapters: [mockAdapter(async () => ({ output: feedback(), usage: { inputTokens: null, outputTokens: null }, finishReason: 'stop' }))] });
  assert.equal((await gateway.execute(auth, request(), context)).usage.estimatedUsd, null);
  assert.equal(store.entries[0].chargedUsd, 0.02);
  let calls = 0;
  const broken = setup({ store: { reserve: async () => { throw new Error('db secret'); }, settle: async () => {} }, adapters: [mockAdapter(async () => { calls++; })] });
  assert.equal((await broken.execute(auth, request(), context)).error.code, 'ai_unavailable');
  assert.equal(calls, 0);
});

test('mock inputs are minimized and immutable; logging failure does not break learning', async () => {
  const response = await setup({ logger: () => { throw new Error('logger failed'); }, adapters: [mockAdapter(async input => {
    assert.ok(Object.isFrozen(input.evidenceSummary));
    assert.ok(!JSON.stringify(input).includes('session-1'));
    return { output: feedback(), usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop' };
  })] }).execute(auth, request({ task: 'adaptive-exercises' }), context);
  assert.equal(response.mode, 'mock');
});