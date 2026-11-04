import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createAIHttpHandler } from '../supabase/functions/_shared/ai/http-handler.mjs';
import { createSupabaseAuthenticator } from '../supabase/functions/_shared/ai/supabase-auth.mjs';
import { createLocalMockGateway, createLocalMockStore, localMockConfig } from '../supabase/functions/_shared/ai/local-mock.mjs';
import { createAIGateway } from '../supabase/functions/_shared/ai/gateway.mjs';
import { createModelRegistry } from '../supabase/functions/_shared/ai/model-registry.mjs';
import { createUsagePolicy } from '../supabase/functions/_shared/ai/usage-policy.mjs';
import { request, model, mockAdapter, NOW } from './fixtures/ai/offline.mjs';

const origin = 'http://localhost:5173';
const jwt = 'header.payload.signature';
const nativeFetch = globalThis.fetch;
before(() => { globalThis.fetch = () => { throw new Error('External network forbidden'); }; });
after(() => { globalThis.fetch = nativeFetch; });
const makeRequest = (payload = request(), overrides = {}) => new Request('http://localhost/functions/v1/ai-gateway', {
  method: 'POST', headers: { origin, authorization: `Bearer ${jwt}`, 'content-type': 'application/json', 'idempotency-key': 'test-key' },
  body: JSON.stringify(payload), ...overrides,
});
const setup = (options = {}) => createAIHttpHandler({ gateway: createLocalMockGateway(),
  authenticate: async token => token === jwt ? { id: 'verified-user' } : null, allowedOrigins: [origin], ...options });

test('HTTP successful mock response is versioned, private and has exact CORS origin', async () => {
  const response = await setup()(makeRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.mode, 'mock');
  assert.equal(body.schemaVersion, '1');
  assert.equal(body.provenance.provider, 'meta');
  assert.equal(body.requestId, response.headers.get('x-request-id'));
  assert.ok(!JSON.stringify(body).includes(jwt));
});

test('missing, malformed, invalid/expired JWTs fail; syntactically valid forged JWT is verified', async () => {
  let calls = 0;
  const handler = setup({ authenticate: async () => { calls++; return null; } });
  for (const authorization of ['', 'Basic abc', 'Bearer plain', 'Bearer forged.payload.signature']) {
    const response = await handler(makeRequest(request(), { headers: { authorization, 'content-type': 'application/json', 'idempotency-key': 'jwt-test' } }));
    assert.equal(response.status, 401);
  }
  assert.equal(calls, 1);
  const invalid = setup({ authenticate: createSupabaseAuthenticator({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: new Error('expired private details') }) } }), url: 'http://localhost', publishableKey: 'public' }) });
  assert.equal((await invalid(makeRequest())).status, 401);
});

test('authenticator uses getUser token verification, ignores email/metadata, rejects anonymous auth', async () => {
  let received;
  const authenticate = createSupabaseAuthenticator({ url: 'http://localhost', publishableKey: 'public', createClient: (_url, _key, config) => {
    assert.equal(config.auth.persistSession, false);
    return { auth: { getUser: async token => { received = token; return { data: { user: { id: 'verified-id', email: 'private', user_metadata: { id: 'spoofed' } } }, error: null }; } } };
  } });
  assert.deepEqual(await authenticate(jwt, new AbortController().signal), { id: 'verified-id' });
  assert.equal(received, jwt);
  const anonymous = createSupabaseAuthenticator({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'x', is_anonymous: true } }, error: null }) } }) });
  assert.equal(await anonymous(jwt), null);
});

test('only verified identity is passed to gateway; supplied body identity is rejected', async () => {
  let user;
  const gateway = { execute: async auth => { user = auth; return { schemaVersion: '1' }; } };
  await setup({ gateway })(makeRequest());
  assert.deepEqual(user, { authenticated: true, userId: 'verified-user' });
  assert.equal((await setup()(makeRequest(request({ userId: 'attacker' })))).status, 400);
});

test('CORS preflight requires exact local origin, POST and allowed headers', async () => {
  const handler = setup();
  const options = (o, headers) => new Request('http://localhost', { method: 'OPTIONS', headers: { origin: o, 'access-control-request-method': 'POST', 'access-control-request-headers': headers } });
  assert.equal((await handler(options(origin, 'authorization, idempotency-key'))).status, 204);
  const denied = await handler(options('https://evil.example', 'authorization'));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal((await handler(options(origin, 'x-unknown'))).status, 400);
  assert.throws(() => setup({ allowedOrigins: ['*'] }));
});

test('unsupported methods/media types, malformed JSON and unknown versions rejected', async () => {
  const handler = setup();
  assert.equal((await handler(new Request('http://localhost'))).status, 405);
  const headers = { authorization: `Bearer ${jwt}`, 'idempotency-key': 'test-key', 'content-type': 'text/plain' };
  assert.equal((await handler(makeRequest(request(), { headers }))).status, 415);
  assert.equal((await handler(makeRequest(request(), { body: '{' }))).status, 400);
  assert.equal((await handler(makeRequest(request({ schemaVersion: '2' })))).status, 400);
  assert.equal((await handler(makeRequest(request(), { headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': 'bad key' } }))).status, 400);
});

test('byte limit handles absent/lying content length and multibyte UTF-8', async () => {
  const handler = setup({ maxBodyBytes: 32 });
  assert.equal((await handler(makeRequest({}, { body: '"' + 'ş'.repeat(20) + '"' }))).status, 413);
  assert.equal((await handler(makeRequest({}, { headers: { authorization: `Bearer ${jwt}`, 'idempotency-key': 'k', 'content-type': 'application/json', 'content-length': '1' }, body: 'x'.repeat(40) }))).status, 413);
});

test('body/auth deadline terminates stalled work safely', async () => {
  const handler = setup({ deadlineMs: 10, authenticate: () => new Promise(() => {}) });
  assert.equal((await handler(makeRequest())).status, 408);
  let canceled = false;
  const stream = new ReadableStream({ cancel() { canceled = true; } });
  const slow = makeRequest({}, { body: stream, duplex: 'half' });
  assert.equal((await setup({ deadlineMs: 10 })(slow)).status, 408);
  assert.equal(canceled, true);
});

test('provider errors and timeout map to HTTP without exposing private errors', async () => {
  for (const [generate, status] of [[async () => { throw new Error('secret-provider-system-detail'); }, 503], [() => new Promise(() => {}), 504]]) {
    const gateway = createAIGateway({ registry: createModelRegistry([model]), adapters: [mockAdapter(generate)], store: createLocalMockStore(), clock: () => NOW, policy: { timeoutMs: 10 } });
    const response = await setup({ gateway })(makeRequest());
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes('secret-provider-system-detail'));
  }
  const response = await setup({ authenticate: async () => { throw new Error('private auth details'); } })(makeRequest());
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private auth details'));
});

test('HTTP idempotency, user isolation and quotas use local mock store', async () => {
  const handler = setup();
  assert.equal((await handler(makeRequest())).status, 200);
  assert.equal((await handler(makeRequest())).status, 200);
  assert.equal((await handler(makeRequest(request({ locale: 'en' })))).status, 409);
  for (let index = 0; index < 3; index++) {
    const response = await handler(makeRequest(request(), { headers: { authorization: `Bearer ${jwt}`, 'idempotency-key': `unique-${index}`, 'content-type': 'application/json' } }));
    assert.equal(response.status, index < 2 ? 200 : 429);
  }
});

test('local mock environment rejects remote Supabase and production origins', () => {
  const env = { AI_BACKEND_MODE: 'local-mock', SUPABASE_URL: 'http://kong:8000', SUPABASE_ANON_KEY: 'public', AI_ALLOWED_ORIGINS: origin };
  assert.ok(localMockConfig(key => env[key]));
  for (const patch of [{ AI_BACKEND_MODE: '' }, { SUPABASE_URL: 'https://prod.supabase.co' }, { AI_ALLOWED_ORIGINS: 'https://notanota.online' }, { AI_ALLOWED_ORIGINS: '*' }]) {
    assert.equal(localMockConfig(key => ({ ...env, ...patch })[key]), null);
  }
});

test('same HTTP idempotency key cannot replay another verified users response', async () => {
  const handler = setup({ authenticate: async token => ({ id: token === jwt ? 'user-one' : 'user-two' }) });
  const first = await handler(makeRequest());
  assert.equal(first.status, 200);
  const second = await handler(makeRequest(request({ locale: 'en' }), { headers: {
    authorization: 'Bearer other.payload.signature', 'idempotency-key': 'test-key', 'content-type': 'application/json',
  } }));
  assert.equal(second.status, 200);
  assert.equal((await second.json()).result.summary.startsWith('This is'), true);
});

test('local store bounds capacity and atomically blocks concurrent reservations', async () => {
  const store = createLocalMockStore({ maxEntries: 2 });
  const input = { userId: 'user', idempotencyKey: 'a', fingerprint: 'digest', now: NOW,
    policy: createUsagePolicy(), reservedUsd: 0.02 };
  const [one, two] = await Promise.all([store.reserve(input), store.reserve({ ...input, idempotencyKey: 'b' })]);
  assert.equal(one.status, 'reserved');
  assert.equal(two.status, 'limited');
  await store.settle(one.reservationId, { response: { schemaVersion: '1' }, actualUsd: null });
  const second = await store.reserve({ ...input, idempotencyKey: 'b' });
  assert.equal(second.status, 'reserved');
  assert.equal((await store.reserve({ ...input, userId: 'other', idempotencyKey: 'c' })).status, 'limited');
});

test('local store retains unknown charges and enforces user/global daily budgets', async () => {
  for (const policy of [createUsagePolicy({ userDailyUsd: 0.02 }), createUsagePolicy({ globalDailyUsd: 0.02 })]) {
    const store = createLocalMockStore();
    const input = { userId: 'user', idempotencyKey: 'a', fingerprint: 'digest', now: NOW, policy, reservedUsd: 0.02 };
    const first = await store.reserve(input);
    await store.settle(first.reservationId, { response: { schemaVersion: '1' }, actualUsd: null });
    assert.equal((await store.reserve({ ...input, idempotencyKey: 'b' })).status, 'limited');
  }
});

test('disabled backend returns safe unavailable response and no auth invocation', async () => {
  const response = await setup({ enabled: false, authenticate: () => { throw new Error('must not run'); } })(makeRequest());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'backend_not_configured');
});

test('real loopback HTTP roundtrip exercises handler, without external services', async () => {
  const handler = setup();
  const server = createServer(async (incoming, outgoing) => {
    const response = await handler(new Request('http://localhost/functions/v1/ai-gateway', { method: incoming.method,
      headers: incoming.headers, body: incoming, duplex: 'half' }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await nativeFetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST',
      headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json', 'idempotency-key': 'loopback' }, body: JSON.stringify(request()) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mode, 'mock');
  } finally { await new Promise(resolve => server.close(resolve)); }
});