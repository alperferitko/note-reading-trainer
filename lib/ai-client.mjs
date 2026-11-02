// Browser side of the AI teacher. It turns this session's measured evidence into a schema-v1
// request, calls the authorised gateway once (no automatic retry), and validates the answer with
// the same rules the gateway uses. Without a configured gateway, a signed-in user or a valid answer,
// it returns the deterministic evaluation built from the same evidence, labelled as such.
import { buildEvidenceSummary, deterministicFeedback } from '../supabase/functions/_shared/ai/evidence-summary.mjs';
import { validateFeedback } from '../supabase/functions/_shared/ai/validation.mjs';
import { validEvidence } from './practice-evidence.mjs';
import pins from '../supabase/ai-staging-target.json' with { type: 'json' };

export const AI_MODES = Object.freeze(['live', 'mock', 'deterministic']);
const REQUEST_KEYS = ['id', 'module', 'task', 'item', 'session', 'correct', 'firstAttempt', 'assisted', 'timedOut', 'responseMs', 'timeLimitMs', 'at', 'clef', 'midi', 'octave', 'position', 'accidental', 'keySignature', 'rhythm'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Accepts only the pinned staging project's ai-gateway, or a loopback mock during development.
 * A production project URL is never accepted, whatever the build variables say.
 * @param {string|undefined|null} raw
 */
export function gatewayEndpoint(raw, target = pins) {
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.search || url.hash || url.username || url.password) return null;
  if (LOCAL_HOSTS.has(url.hostname) && url.protocol === 'http:') return { url: url.href, kind: 'local' };
  const ref = target?.stagingProjectRef;
  if (url.protocol !== 'https:' || !/^[a-z]{20}$/.test(ref ?? '')) return null;
  if (target.productionProjectRef && url.hostname.startsWith(`${target.productionProjectRef}.`)) return null;
  if (url.hostname !== `${ref}.supabase.co` || url.pathname !== '/functions/v1/ai-gateway') return null;
  return { url: url.href, kind: 'staging' };
}

/**
 * The module's most recent records, newest kept first when trimming, projected to the request
 * schema. History matters: a weakness needs three unaided attempts on the same note, which one
 * short session rarely has. The serialized request stays under the gateway's character bound.
 * Free answers never leave the device.
 */
export function buildFeedbackRequest(records, { session, module, locale = 'tr', now = Date.now(), maxSummaryChars = 11000, maxRecords = 800 }) {
  const rows = validEvidence(records, now).filter(row => row.module === module && Date.parse(row.at) <= now
    && now - Date.parse(row.at) <= 45 * 86400000);
  const project = row => { const out = {}; for (const key of REQUEST_KEYS) if (row[key] !== undefined) out[key] = row[key]; return out; };
  const body = records => ({ schemaVersion: '1', task: 'practice-feedback', locale, scope: { module }, evidence: { records } });
  const ordered = [...rows.filter(row => row.session === session).reverse(), ...rows.filter(row => row.session !== session).reverse()];
  const picked = [];
  for (const row of ordered) {
    if (picked.length >= maxRecords) break;
    const candidate = [...picked, project(row)];
    // The gateway bounds the evidence summary it sends to the model; stay inside that bound.
    if (JSON.stringify(buildEvidenceSummary(candidate, now)).length > maxSummaryChars) break;
    picked.push(project(row));
  }
  picked.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return body(picked);
}

/** The evaluation shown when no model is used. Same summary and rules as the gateway's own fallback. */
export function deterministicResult(request, reason, now = Date.now()) {
  const summary = buildEvidenceSummary(request.evidence.records, now);
  return {
    schemaVersion: '1', mode: 'deterministic', reason, evidenceSummary: summary,
    result: deterministicFeedback(summary, request.locale),
    provenance: { provider: 'none', modelId: null, analysisVersion: summary.analysisVersion },
    usage: null, limitations: summary.limitations,
  };
}

/**
 * Checks a gateway response before anything in it is shown. The response must refer only to
 * measurements present in its own evidence summary, which must match the evidence sent.
 */
export function acceptGatewayResponse(body, request, now = Date.now()) {
  if (!body || typeof body !== 'object' || body.schemaVersion !== '1') throw new Error('invalid_response');
  if (body.error) { const error = new Error(body.error.code || 'gateway_error'); error.code = body.error.code; error.status = body.error.status; throw error; }
  if (!AI_MODES.includes(body.mode)) throw new Error('invalid_response');
  const local = buildEvidenceSummary(request.evidence.records, now);
  const summary = body.evidenceSummary;
  if (!summary || summary.sampleSize !== local.sampleSize || !Array.isArray(summary.measurements)) throw new Error('evidence_mismatch');
  const known = new Map(local.measurements.map(m => [m.id, m.value]));
  for (const m of summary.measurements) if (!known.has(m.id) || known.get(m.id) !== m.value) throw new Error('evidence_mismatch');
  const result = validateFeedback(body.result, local);
  const provenance = body.provenance && typeof body.provenance === 'object' ? body.provenance : {};
  if (body.mode === 'live' && (provenance.provider !== 'meta' || typeof provenance.modelId !== 'string' || !provenance.modelId)) throw new Error('invalid_provenance');
  return {
    schemaVersion: '1', mode: body.mode, reason: null, requestId: typeof body.requestId === 'string' ? body.requestId : null,
    evidenceSummary: local, result,
    provenance: { provider: provenance.provider ?? null, modelId: provenance.modelId ?? null, analysisVersion: provenance.analysisVersion ?? local.analysisVersion },
    usage: body.usage ?? null, limitations: Array.isArray(body.limitations) ? body.limitations.filter(item => typeof item === 'string').slice(0, 8) : [],
  };
}

/** One idempotency key per session and module, so a reload replays instead of paying twice. */
export function idempotencyKeyFor(session, module, storage = globalThis.sessionStorage) {
  const name = `notanota-ai-key:${module}:${session}`;
  try {
    const saved = storage?.getItem(name);
    if (saved && /^[A-Za-z0-9_-]{1,120}$/.test(saved)) return saved;
  } catch { /* storage is optional */ }
  const key = `nn-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 120);
  try { storage?.setItem(name, key); } catch { /* the key still applies to this call */ }
  return key;
}

/**
 * Calls the gateway once. Any failure returns the deterministic evaluation with the reason.
 * @param {{endpoint:{url:string}|null, accessToken:string|null, apiKey:string|null, request:object, idempotencyKey:string, timeoutMs?:number, fetchImpl?:typeof fetch, signal?:AbortSignal, now?:number}} options
 */
export async function requestTeacherFeedback({ endpoint, accessToken, apiKey, request, idempotencyKey, timeoutMs = 20000, fetchImpl = globalThis.fetch, signal, now = Date.now() }) {
  if (!request.evidence.records.length) return deterministicResult(request, 'no_evidence', now);
  if (!endpoint) return deterministicResult(request, 'gateway_not_configured', now);
  if (!accessToken) return deterministicResult(request, 'sign_in_required', now);
  const local = buildEvidenceSummary(request.evidence.records, now);
  if (!local.eligible) return deterministicResult(request, 'insufficient_evidence', now);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forward = () => controller.abort();
  signal?.addEventListener('abort', forward, { once: true });
  try {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${accessToken}`, 'idempotency-key': idempotencyKey };
    if (apiKey) headers.apikey = apiKey;
    const response = await fetchImpl(endpoint.url, { method: 'POST', headers, body: JSON.stringify(request), signal: controller.signal, credentials: 'omit', redirect: 'error' });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) return deterministicResult(request, body?.error?.code ?? `http_${response.status}`, now);
    return acceptGatewayResponse(body, request, now);
  } catch (error) {
    const code = controller.signal.aborted ? (signal?.aborted ? 'cancelled' : 'timeout') : (error?.message ?? 'network_error');
    return deterministicResult(request, code, now);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}

/** Human-readable label of a measurement id, built only from the evidence summary. */
export function describeMeasurement(summary, id, locale = 'tr') {
  const m = summary.measurements.find(item => item.id === id);
  if (!m || m.value === null) return null;
  const tr = locale === 'tr';
  if (m.kind === 'accuracy') return tr ? `%${m.value} doğru (${m.sampleSize} deneme)` : `${m.value}% correct (${m.sampleSize} attempts)`;
  const seconds = (m.value / 1000).toFixed(1);
  return tr ? `ortalama ${seconds.replace('.', ',')} sn (${m.sampleSize} cevap)` : `${seconds} s average (${m.sampleSize} answers)`;
}
