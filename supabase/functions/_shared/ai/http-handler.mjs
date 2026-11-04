import { AIError } from './contracts.mjs';
import { SCREEN_LIMITS } from './catalog.mjs';

const IDEMPOTENCY = /^[A-Za-z0-9_-]{1,120}$/;
const HEADERS = ['authorization', 'apikey', 'content-type', 'idempotency-key', 'x-client-info'];
const HTTP_ERRORS = new Set(['authentication_required', 'origin_not_allowed', 'method_not_allowed',
  'unsupported_media_type', 'invalid_request', 'request_too_large', 'request_timeout', 'backend_not_configured']);

/**
 * Read a byte-bounded stream BEFORE parsing JSON, including absent/false Content-Length.
 * Up to readBytes are read; a body above maxBytes is accepted only as a score-screen request.
 */
async function readJson(request, maxBytes, readBytes, signal) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > readBytes)) {
    throw new AIError('request_too_large', 413);
  }
  if (!request.body) throw new AIError('invalid_request');
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new AIError('request_timeout', 408, true);
      const { done, value } = await reader.read();
      if (signal.aborted) throw new AIError('request_timeout', 408, true);
      if (done) break;
      size += value.byteLength;
      if (size > readBytes) { cancel(); throw new AIError('request_too_large', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let payload;
    try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new AIError(size > maxBytes ? 'request_too_large' : 'invalid_request', size > maxBytes ? 413 : 400); }
    // Every other task keeps the usual cap; only the screening image may be larger.
    if (size > maxBytes && payload?.task !== 'score-screen') throw new AIError('request_too_large', 413);
    return payload;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/**
 * Web-standard handler shared by Deno and offline Node tests. No test auth bypass.
 * @param {{gateway?: {execute: Function}|null, authenticate?: (jwt: string, signal?: AbortSignal) => Promise<{id: string}|null>,
 *   allowedOrigins?: string[], enabled?: boolean, maxBodyBytes?: number, screenBodyBytes?: number, deadlineMs?: number}} [options]
 */
export function createAIHttpHandler({ gateway, authenticate, allowedOrigins = [], enabled = true,
  maxBodyBytes = 262144, screenBodyBytes = SCREEN_LIMITS.maxBodyBytes, deadlineMs = 15000 } = {}) {
  const origins = new Set(allowedOrigins);
  if ([...origins].some(origin => {
    try { return new URL(origin).origin !== origin || !['http:', 'https:'].includes(new URL(origin).protocol); }
    catch { return true; }
  }) || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || !Number.isSafeInteger(screenBodyBytes) || screenBodyBytes < 1
    || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1) throw new Error('invalid_http_configuration');

  return async request => {
    // Ignore client request IDs; never reflect headers/payload/errors in diagnostics.
    const requestId = globalThis.crypto.randomUUID();
    const origin = request.headers.get('origin');
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin', 'X-Request-Id': requestId });
    if (origin && origins.has(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', HEADERS.join(', '));
      headers.set('Access-Control-Expose-Headers', 'x-request-id');
    }
    const json = (body, status) => Response.json(body, { status, headers });
    const failure = (code, status, retryable = false) => json({ schemaVersion: '1', requestId, error: { code, status, retryable } }, status);
    if (origin && !origins.has(origin)) return failure('origin_not_allowed', 403);
    if (request.method === 'OPTIONS') {
      const method = request.headers.get('access-control-request-method');
      const requested = (request.headers.get('access-control-request-headers') || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
      if (!origin || method !== 'POST' || requested.some(header => !HEADERS.includes(header))) return failure('invalid_request', 400);
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') { headers.set('Allow', 'POST, OPTIONS'); return failure('method_not_allowed', 405); }
    const authorization = request.headers.get('authorization');
    const match = authorization && /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
    if (!match || authorization.length > 8192) return failure('authentication_required', 401);
    if (!enabled || !gateway || typeof authenticate !== 'function') return failure('backend_not_configured', 503);
    if (!IDEMPOTENCY.test(request.headers.get('idempotency-key') || '')) return failure('invalid_request', 400);
    if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json'
      || request.headers.has('content-encoding')) return failure('unsupported_media_type', 415);

    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) controller.abort();
    let timer;
    let rejectAborted;
    const onAbort = () => rejectAborted(new AIError('request_timeout', 408, true));
    try {
      const interrupted = new Promise((_, reject) => { rejectAborted = reject; });
      controller.signal.addEventListener('abort', onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
      timer = setTimeout(abort, deadlineMs);
      const operation = async () => {
        const user = await authenticate(match[1], controller.signal);
        if (controller.signal.aborted) throw new AIError('request_timeout', 408, true);
        if (!user || typeof user.id !== 'string' || !IDEMPOTENCY.test(user.id)) throw new AIError('authentication_required', 401);
        const payload = await readJson(request, maxBodyBytes, Math.max(maxBodyBytes, screenBodyBytes), controller.signal);
        if (controller.signal.aborted) throw new AIError('request_timeout', 408, true);
        return gateway.execute({ authenticated: true, userId: user.id }, payload,
          { requestId, idempotencyKey: request.headers.get('idempotency-key'), signal: controller.signal });
      };
      const result = await Promise.race([operation(), interrupted]);
      return json(result, result.error?.status ?? 200);
    } catch (error) {
      if (error instanceof AIError && HTTP_ERRORS.has(error.code)) return failure(error.code, error.status, error.retryable);
      return failure('ai_unavailable', 503, true);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      request.signal.removeEventListener('abort', abort);
    }
  };
}