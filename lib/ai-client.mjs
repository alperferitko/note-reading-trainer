// Browser side of the AI teacher. It turns this session's measured evidence into a schema-v1
// request, calls the authorised gateway once (no automatic retry), and validates the answer with
// the same rules the gateway uses. Without a configured gateway, a signed-in user or a valid answer,
// it returns the deterministic evaluation built from the same evidence, labelled as such.
import { buildEvidenceSummary, deterministicFeedback } from '../supabase/functions/_shared/ai/evidence-summary.mjs';
import { cleanWeeklyMetrics, validateFeedback, validateRequest, validateScoreScreen, validateTeacherChat, validateWeeklyReport, validTimeZone } from '../supabase/functions/_shared/ai/validation.mjs';
import { CHAT_LIMITS } from '../supabase/functions/_shared/ai/catalog.mjs';
import { metricsHash, weeklyReportKey } from '../supabase/functions/_shared/ai/weekly-key.mjs';
import { screenKey } from '../supabase/functions/_shared/ai/screen-key.mjs';
import { EVIDENCE_LIMIT, validEvidence } from './practice-evidence.mjs';
import { pitchAt } from './music-pitch.mjs';
import pins from '../supabase/ai-staging-target.json' with { type: 'json' };

// The allowlists a teacher suggestion may name, for the UI that acts on them.
export { LESSON_IDS, PROFILE_ENUMS, PROFILE_FIELDS, STUDIO_IDS, TREBLE_NOTE_IDS } from '../supabase/functions/_shared/ai/catalog.mjs';
export { metricsHash, weeklyReportKey, screenKey };
export { SCREEN_LIMITS } from '../supabase/functions/_shared/ai/catalog.mjs';

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

// ---------------------------------------------------------------------------------------------
// Teacher chat and weekly report. Both call the same gateway once, with the same endpoint, auth
// and error-code handling as requestTeacherFeedback. Neither has a deterministic text fallback:
// a failure returns { ok: false, mode: 'unavailable', reason } and the app keeps its own UI.

const unavailable = reason => ({ schemaVersion: '1', ok: false, mode: 'unavailable', reason, result: null });
const ACCEPT_FAILURES = new Set(['invalid_response', 'invalid_provenance', 'metrics_mismatch', 'invalid_model_response']);

/** A fresh key for one user message. Re-sending that message with the same key replays the stored answer. */
export function newIdempotencyKey(prefix = 'nn') {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${raw}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
}

/** POSTs a checked request once. accept() validates the body; every failure becomes a stable reason code. */
async function callGateway({ endpoint, accessToken, apiKey, body, idempotencyKey, timeoutMs, fetchImpl, signal, accept }) {
  if (!endpoint) return unavailable('gateway_not_configured');
  if (!accessToken) return unavailable('sign_in_required');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forward = () => controller.abort();
  signal?.addEventListener('abort', forward, { once: true });
  if (signal?.aborted) controller.abort();
  let parsed = null;
  try {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${accessToken}`, 'idempotency-key': idempotencyKey };
    if (apiKey) headers.apikey = apiKey;
    const response = await fetchImpl(endpoint.url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, credentials: 'omit', redirect: 'error' });
    try { parsed = await response.json(); } catch { parsed = null; }
    if (!response.ok) return unavailable(typeof parsed?.error?.code === 'string' ? parsed.error.code : `http_${response.status}`);
  } catch {
    // Network failures carry browser-specific messages; only stable codes leave this function.
    return unavailable(controller.signal.aborted ? (signal?.aborted ? 'cancelled' : 'timeout') : 'network_error');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
  if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== '1') return unavailable('invalid_response');
  if (parsed.error) return unavailable(typeof parsed.error.code === 'string' ? parsed.error.code : 'gateway_error');
  const provenance = parsed.provenance && typeof parsed.provenance === 'object' ? parsed.provenance : {};
  if (!['live', 'mock'].includes(parsed.mode) || parsed.task !== body.task) return unavailable('invalid_response');
  if (parsed.mode === 'live' && (provenance.provider !== 'meta' || typeof provenance.modelId !== 'string' || !provenance.modelId)) return unavailable('invalid_provenance');
  let accepted;
  try { accepted = await accept(parsed); } catch (error) { return unavailable(ACCEPT_FAILURES.has(error?.code) ? error.code : 'invalid_response'); }
  return {
    schemaVersion: '1', ok: true, mode: parsed.mode, reason: null, requestId: typeof parsed.requestId === 'string' ? parsed.requestId : null,
    ...accepted, provenance: { provider: provenance.provider ?? null, modelId: provenance.modelId ?? null },
    usage: parsed.usage ?? null, limitations: Array.isArray(parsed.limitations) ? parsed.limitations.filter(item => typeof item === 'string').slice(0, 8) : [],
  };
}

/**
 * The chat request: the newest turns that fit the gateway's bounds, the saved profile and,
 * optionally, recent practice evidence (free answers never leave the device). Without evidence
 * the teacher is told there is no history and must not claim any.
 * @param {{messages:{role:'user'|'teacher', text:string}[], profile?:object|null, locale?:'tr'|'en', evidenceRecords?:unknown[]|null, now?:number, maxRecords?:number}} input
 */
export function buildTeacherChatRequest({ messages, profile = null, locale = 'tr', evidenceRecords = null, now = Date.now(), maxRecords = 300 }) {
  const turns = [];
  let total = 0;
  for (const message of [...(Array.isArray(messages) ? messages : [])].reverse()) {
    const size = typeof message?.text === 'string' ? message.text.length : 0;
    if (turns.length >= CHAT_LIMITS.maxTurns || total + size > CHAT_LIMITS.maxTotalChars) break;
    turns.unshift({ role: message?.role, text: message?.text });
    total += size;
  }
  const request = { schemaVersion: '1', task: 'teacher-chat', locale, messages: turns, profile: profile ?? null };
  if (Array.isArray(evidenceRecords)) {
    const rows = validEvidence(evidenceRecords, now).filter(row => Date.parse(row.at) <= now && now - Date.parse(row.at) <= 45 * 86400000)
      .slice(-Math.min(maxRecords, EVIDENCE_LIMIT));
    const project = row => { const out = {}; for (const key of REQUEST_KEYS) if (row[key] !== undefined) out[key] = row[key]; return out; };
    if (rows.length) request.evidence = { records: rows.map(project) };
  }
  return request;
}

/**
 * One teacher turn. `idempotencyKey` belongs to the user message being answered (newIdempotencyKey()):
 * a retry of the same message replays the stored answer instead of paying again.
 * @param {{endpoint:{url:string}|null, accessToken:string|null, apiKey:string|null, request:object, idempotencyKey:string, timeoutMs?:number, fetchImpl?:typeof fetch, signal?:AbortSignal, now?:number}} options
 */
export async function requestTeacherChat({ endpoint, accessToken, apiKey, request, idempotencyKey, timeoutMs = 20000, fetchImpl = globalThis.fetch, signal, now = Date.now() }) {
  let checked;
  try { checked = validateRequest(request, now, 262144); } catch { return unavailable('invalid_request'); }
  if (checked.task !== 'teacher-chat' || !/^[A-Za-z0-9_-]{1,120}$/.test(idempotencyKey ?? '')) return unavailable('invalid_request');
  // The checked copy is sent: free answers and unknown fields are projected away before the network.
  return callGateway({ endpoint, accessToken, apiKey, body: checked, idempotencyKey, timeoutMs, fetchImpl, signal,
    accept: body => ({ result: validateTeacherChat(body.result) }) });
}

const DAY = 86400000;
const shiftDay = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
function dayFormatter(timezone) {
  if (!validTimeZone(timezone)) throw new RangeError('invalid_timezone');
  const format = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return ms => {
    const parts = Object.fromEntries(format.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

/** The seven local days ending today in `timezone`, as YYYY-MM-DD dates. */
export function weeklyPeriod({ timezone, now = Date.now() }) {
  const end = dayFormatter(timezone)(now);
  return { start: shiftDay(end, -6), end };
}

const TAP_TASKS = new Set(['tap-pulse', 'tap-pattern']);
const isTap = row => row.module === 'rhythm' && TAP_TASKS.has(row.task);
/** Written pitch of a staff answer, e.g. 'treble:g4' or 'bass:f3#'; null for items that are not notes. */
function noteOf(row) {
  if (!row.clef || !Number.isInteger(row.position) || isTap(row)) return null;
  const id = pitchAt(row.position, row.clef, row.accidental ?? 0).id;
  return /^[a-g][0-8](#|b)?$/.test(id) ? `${row.clef}:${id}` : null;
}
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
};

/** Thresholds of the weekly numbers. A struggle needs repetition, as in practice-evidence. */
export const WEEKLY_RULES = Object.freeze({ thinAnswers: 20, thinDays: 2, struggleAttempts: 3, struggleErrors: 2, maxStruggles: 10 });

function weekMetrics(rows) {
  const correct = rows.filter(row => row.correct).length;
  const notes = new Map();
  for (const row of rows) {
    const note = !row.assisted && noteOf(row);
    if (!note) continue;
    const entry = notes.get(note) ?? { note, attempts: 0, errors: 0 };
    entry.attempts += 1;
    if (!row.correct) entry.errors += 1;
    notes.set(note, entry);
  }
  const noteStruggles = [...notes.values()]
    .filter(item => item.attempts >= WEEKLY_RULES.struggleAttempts && item.errors >= WEEKLY_RULES.struggleErrors)
    .sort((a, b) => b.errors / b.attempts - a.errors / a.attempts || b.errors - a.errors || a.note.localeCompare(b.note))
    .slice(0, WEEKLY_RULES.maxStruggles);
  // Answer speed only where it was measured: unaided, not timed out, and never a tap offset.
  const times = rows.filter(row => !isTap(row) && !row.assisted && !row.timedOut && row.responseMs !== null).map(row => row.responseMs);
  // For a tap run, responseMs is the run's mean absolute offset from the beat: one sample per run.
  const offsets = rows.filter(row => isTap(row) && row.responseMs !== null).map(row => row.responseMs);
  const days = new Set(rows.map(row => row.day)).size;
  return {
    sessions: new Set(rows.map(row => row.session)).size, practiceDays: days,
    answers: { correct, wrong: rows.length - correct }, noteStruggles,
    responseTimeMs: times.length ? { median: median(times), sampleSize: times.length } : null,
    rhythmTiming: offsets.length ? { meanAbsOffsetMs: Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length), sampleSize: offsets.length } : null,
    dataQuality: rows.length === 0 ? 'none' : rows.length < WEEKLY_RULES.thinAnswers || days < WEEKLY_RULES.thinDays ? 'thin' : 'ok',
  };
}

/**
 * The weekly numbers, computed on the device from practice evidence; the model only narrates them.
 * - Days are calendar days in the user's `timezone` (Intl), so an answer at 23:30 local time counts for that local day.
 * - answers counts every stored answer of the period; sessions counts distinct session ids.
 * - noteStruggles: written notes (clef + pitch) with >= 3 unaided attempts and >= 2 errors, worst first, at most 10.
 * - responseTimeMs: median of measured, unaided, not timed-out answers; tap offsets never count. null if none.
 * - rhythmTiming: mean of rhythm tap runs' (tap-pulse/tap-pattern) mean absolute offsets, one sample per run; null if none.
 * - previous: the 7 days before the period, or null when no evidence is older than the period
 *   (not tracked yet) or when the full local store starts inside that week (part of it was discarded).
 * - dataQuality: 'none' without answers, 'thin' under 20 answers or on a single day, otherwise 'ok'.
 * A measurement that was not taken is null, never 0.
 * @param {unknown[]} evidenceRecords
 * @param {{timezone:string, now?:number, period?:{start:string,end:string}, pieces?:{title:string,from:number,to:number}[]}} options
 */
export function buildWeeklyMetrics(evidenceRecords, { timezone, now = Date.now(), period, pieces = [] }) {
  const dayOf = dayFormatter(timezone);
  const { start, end } = period ?? weeklyPeriod({ timezone, now });
  const rows = validEvidence(evidenceRecords, now).filter(row => Date.parse(row.at) <= now).map(row => ({ ...row, day: dayOf(Date.parse(row.at)) }));
  const previousStart = shiftDay(start, -7);
  const previousEnd = shiftDay(start, -1);
  const inside = (row, from, to) => row.day >= from && row.day <= to;
  const truncated = rows.length >= EVIDENCE_LIMIT && rows[0].day >= previousStart;
  const tracked = rows.some(row => row.day < start);
  // The gateway's own rules: the result is always a valid request body, in the hashed key order.
  return cleanWeeklyMetrics({
    ...weekMetrics(rows.filter(row => inside(row, start, end))),
    pieces: pieces.map(({ title, from, to }) => ({ title, from, to })),
    previous: tracked && !truncated ? weekMetrics(rows.filter(row => inside(row, previousStart, previousEnd))) : null,
  }, { days: (Date.parse(end) - Date.parse(start)) / DAY + 1 });
}

/** A complete weekly-report request body for the current local week. */
export function buildWeeklyReportRequest(evidenceRecords, { timezone, locale = 'tr', now = Date.now(), pieces = [] }) {
  const period = weeklyPeriod({ timezone, now });
  return { schemaVersion: '1', task: 'weekly-report', locale, timezone, period, metrics: buildWeeklyMetrics(evidenceRecords, { timezone, now, period, pieces }) };
}

/**
 * The narrated weekly report. The idempotency key comes from the period and the numbers
 * (weeklyReportKey), so asking again about an unchanged week replays the stored answer at no cost.
 * The response must echo exactly the numbers sent. metricsHash is what public.weekly_reports stores.
 * @param {{endpoint:{url:string}|null, accessToken:string|null, apiKey:string|null, request:object, timeoutMs?:number, fetchImpl?:typeof fetch, signal?:AbortSignal, now?:number}} options
 */
export async function requestWeeklyReport({ endpoint, accessToken, apiKey, request, timeoutMs = 20000, fetchImpl = globalThis.fetch, signal, now = Date.now() }) {
  let checked;
  let idempotencyKey;
  let hash;
  try {
    checked = validateRequest(request, now, 262144);
    if (checked.task !== 'weekly-report') return unavailable('invalid_request');
    hash = await metricsHash(checked.metrics);
    idempotencyKey = await weeklyReportKey(checked.period, checked.metrics);
  } catch { return unavailable('invalid_request'); }
  return callGateway({ endpoint, accessToken, apiKey, body: checked, idempotencyKey, timeoutMs, fetchImpl, signal,
    accept: body => {
      if (JSON.stringify(body.metrics) !== JSON.stringify(checked.metrics) || JSON.stringify(body.period) !== JSON.stringify(checked.period)) {
        const error = new Error('metrics_mismatch');
        error.code = 'metrics_mismatch';
        throw error;
      }
      return { period: checked.period, timezone: checked.timezone, metrics: checked.metrics, metricsHash: hash, result: validateWeeklyReport(body.result) };
    } });
}

/**
 * A score-screen request for one JPEG contact sheet of the file's pages. `data` is the base64 string
 * without the `data:` prefix (a leading `data:image/jpeg;base64,` is removed if present).
 * @param {{locale?:'tr'|'en', data:string, width:number, height:number, pages:number}} input
 */
export function buildScoreScreenRequest({ locale = 'tr', data, width, height, pages }) {
  const prefix = 'data:image/jpeg;base64,';
  const raw = typeof data === 'string' && data.startsWith(prefix) ? data.slice(prefix.length) : data;
  return { schemaVersion: '1', task: 'score-screen', locale, image: { mime: 'image/jpeg', data: raw, width, height }, pages };
}

/**
 * Screens the uploaded file's pages before it is saved. The idempotency key comes from the image
 * (screenKey), so screening the same image again replays the stored verdict at no cost.
 * @param {{endpoint:{url:string}|null, accessToken:string|null, apiKey:string|null, request:object, timeoutMs?:number, fetchImpl?:typeof fetch, signal?:AbortSignal, now?:number}} options
 */
export async function requestScoreScreen({ endpoint, accessToken, apiKey, request, timeoutMs = 25000, fetchImpl = globalThis.fetch, signal, now = Date.now() }) {
  let checked;
  let idempotencyKey;
  try {
    checked = validateRequest(request, now, 262144);
    if (checked.task !== 'score-screen') return unavailable('invalid_request');
    idempotencyKey = await screenKey(checked.image.data);
  } catch { return unavailable('invalid_request'); }
  return callGateway({ endpoint, accessToken, apiKey, body: checked, idempotencyKey, timeoutMs, fetchImpl, signal,
    accept: body => ({ result: validateScoreScreen(body.result) }) });
}
