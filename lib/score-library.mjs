// Client side of "Eserlerim" (the user's own scores) and the shared library ("Ortak kütüphane").
// Thin wrappers over a supabase-js client: every write is one of the security definer RPCs in
// supabase/migrations/202611040001_score_library.sql, which own all authorization and status
// rules. Reads go through RLS. Errors surface as ScoreLibraryError with a stable `code`.

export const SCORE_BUCKET = 'score-sources';
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const SCORE_STATUSES = Object.freeze(['processing', 'needs_correction', 'ready_personal', 'pending_review', 'published', 'rejected']);
export const SCORE_LICENSES = Object.freeze(['public_domain', 'cc_by', 'cc_by_sa', 'own_work', 'permission', 'unknown']);
export const SCORE_DIFFICULTIES = Object.freeze(['beginner', 'intermediate', 'advanced']);
export const SOURCE_TYPES = Object.freeze({
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.recordare.musicxml+xml': 'musicxml',
  'application/vnd.recordare.musicxml': 'mxl',
});

/** Codes raised by the RPCs, plus the client-side ones below. Anything else is `unknown_error`. */
export const SCORE_ERROR_CODES = Object.freeze([
  'authentication_required', 'not_found', 'invalid_input', 'invalid_hash', 'invalid_musicxml', 'invalid_transition',
  'license_required', 'share_statement_required', 'admin_required', 'checks_incomplete', 'reason_required',
  'invalid_report', 'rate_limited', 'unsupported_type', 'file_too_large', 'source_exists', 'source_missing',
  'version_mismatch', 'forbidden', 'network_error', 'unknown_error',
]);
const KNOWN = new Set(SCORE_ERROR_CODES);

export class ScoreLibraryError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'ScoreLibraryError';
    /** @type {string} */
    this.code = code;
  }
}

/**
 * Maps a supabase-js / PostgREST / Storage error to one stable code.
 * @param {any} error
 * @returns {string}
 */
export function scoreErrorCode(error) {
  if (!error) return 'unknown_error';
  if (error instanceof ScoreLibraryError) return error.code;
  const message = String(error.message ?? '');
  if (KNOWN.has(message)) return message;
  const status = String(error.statusCode ?? error.status ?? '');
  if (error.code === '42501' || status === '401' || status === '403' || /permission denied|row-level security/i.test(message)) return 'forbidden';
  if (error.code === 'PGRST116' || status === '404') return 'not_found';
  if (status === '413' || /maximum allowed size|too large/i.test(message)) return 'file_too_large';
  if (/invalid mime|mime type/i.test(message)) return 'unsupported_type';
  if (/fetch|network|timeout/i.test(message) || error.name === 'TypeError' || error.name === 'AbortError') return 'network_error';
  return 'unknown_error';
}

const fail = error => new ScoreLibraryError(scoreErrorCode(error), error);

/** @param {any} client @param {string} fn @param {Record<string, unknown>} args */
async function rpc(client, fn, args) {
  let result;
  try { result = await client.rpc(fn, args); } catch (error) { throw fail(error); }
  if (result.error) throw fail(result.error);
  return result.data;
}

/** @param {PromiseLike<{ data: any, error: any }>} query */
async function read(query) {
  let result;
  try { result = await query; } catch (error) { throw fail(error); }
  if (result.error) throw fail(result.error);
  return result.data;
}

/** @param {any} client @returns {Promise<string>} */
async function currentUserId(client) {
  let result;
  try { result = await client.auth.getUser(); } catch (error) { throw fail(error); }
  const id = result?.data?.user?.id;
  if (result?.error || !id) throw new ScoreLibraryError('authentication_required', result?.error ?? undefined);
  return id;
}

/**
 * Lowercase hex SHA-256 of the uploaded bytes (or of the MusicXML text for direct imports).
 * @param {ArrayBuffer | ArrayBufferView | string} data
 */
export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The only storage path the server accepts for a raw source: {owner_id}/{source_hash}.{ext}.
 * @param {string} ownerId @param {string} sourceHash @param {string} mime
 */
export function sourcePath(ownerId, sourceHash, mime) {
  const ext = SOURCE_TYPES[/** @type {keyof typeof SOURCE_TYPES} */ (mime)];
  if (!ext) throw new ScoreLibraryError('unsupported_type');
  if (!/^[a-f0-9]{64}$/.test(sourceHash ?? '')) throw new ScoreLibraryError('invalid_hash');
  if (!/^[0-9a-f-]{36}$/.test(ownerId ?? '')) throw new ScoreLibraryError('authentication_required');
  return `${ownerId}/${sourceHash}.${ext}`;
}

/**
 * @typedef {Object} Score
 * @property {string} id
 * @property {string} title
 * @property {string|null} composer
 * @property {string|null} instrument
 * @property {string|null} difficulty
 * @property {string|null} sourceNote
 * @property {string} license
 * @property {string|null} shareStatement
 * @property {string} status
 * @property {string|null} currentVersionId
 * @property {string|null} submittedAt
 * @property {string|null} publishedAt
 * @property {string} createdAt
 * @property {string} updatedAt
 */
const SCORE_COLUMNS = 'id,title,composer,instrument,difficulty,source_note,license,share_statement,status,current_version_id,submitted_at,published_at,created_at,updated_at';
/** @returns {Score} */
const toScore = row => ({
  id: row.id, title: row.title, composer: row.composer, instrument: row.instrument, difficulty: row.difficulty,
  sourceNote: row.source_note, license: row.license, shareStatement: row.share_statement, status: row.status,
  currentVersionId: row.current_version_id, submittedAt: row.submitted_at, publishedAt: row.published_at,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

/**
 * Creates a score, or returns the caller's existing one with the same source hash (`duplicate`).
 * Pass `musicxml` for a direct MusicXML import (no OMR); otherwise upload the file next.
 * @param {any} client
 * @param {{ title: string, composer?: string|null, instrument?: string|null, difficulty?: string|null,
 *   sourceNote?: string|null, license?: string, sourceHash?: string|null, musicxml?: string|null }} input
 * @returns {Promise<{ scoreId: string, duplicate: boolean, status: string }>}
 */
export function createScore(client, { title, composer = null, instrument = null, difficulty = null, sourceNote = null,
  license = 'unknown', sourceHash = null, musicxml = null }) {
  return rpc(client, 'score_create', {
    p_title: title, p_composer: composer, p_instrument: instrument, p_difficulty: difficulty,
    p_source_note: sourceNote, p_license: license, p_source_hash: sourceHash, p_musicxml: musicxml,
  });
}

/**
 * Uploads the raw file to the private bucket and records it; PDF/images queue the OMR job.
 * Re-uploading the same file is harmless: same hash, same path.
 * @param {any} client
 * @param {{ scoreId: string, sourceHash: string, file: Blob | ArrayBuffer | Uint8Array, mime: string,
 *   bytes?: number, pageCount?: number|null, selectedPages?: number[]|null }} input
 * @returns {Promise<{ storagePath: string, jobId: string|null }>}
 */
export async function uploadSource(client, { scoreId, sourceHash, file, mime, bytes, pageCount = null, selectedPages = null }) {
  const size = bytes ?? /** @type {any} */ (file)?.size ?? /** @type {any} */ (file)?.byteLength;
  if (!SOURCE_TYPES[/** @type {keyof typeof SOURCE_TYPES} */ (mime)]) throw new ScoreLibraryError('unsupported_type');
  if (!Number.isInteger(size) || size < 1) throw new ScoreLibraryError('invalid_input');
  if (size > MAX_SOURCE_BYTES) throw new ScoreLibraryError('file_too_large');
  const path = sourcePath(await currentUserId(client), sourceHash, mime);
  let upload;
  try {
    upload = await client.storage.from(SCORE_BUCKET).upload(path, file, { contentType: mime, upsert: false });
  } catch (error) { throw fail(error); }
  const duplicate = upload?.error && (String(upload.error.statusCode ?? upload.error.status) === '409'
    || /already exists|duplicate/i.test(String(upload.error.message)));
  if (upload?.error && !duplicate) throw fail(upload.error);
  return rpc(client, 'score_attach_source', {
    p_score_id: scoreId, p_mime: mime, p_bytes: size, p_page_count: pageCount, p_selected_pages: selectedPages,
  });
}

/** The caller's own scores, most recently changed first. @param {any} client @returns {Promise<Score[]>} */
export async function listMyScores(client) {
  const owner = await currentUserId(client);
  const rows = await read(client.from('scores').select(SCORE_COLUMNS).eq('owner_id', owner).order('updated_at', { ascending: false }));
  return (rows ?? []).map(toScore);
}

/**
 * One of the caller's scores with its current version (MusicXML, warnings) and latest job.
 * @param {any} client @param {string} scoreId
 */
export async function getScore(client, scoreId) {
  const row = await read(client.from('scores').select(SCORE_COLUMNS).eq('id', scoreId).maybeSingle());
  if (!row) throw new ScoreLibraryError('not_found');
  const score = toScore(row);
  const version = score.currentVersionId
    ? await read(client.from('score_versions').select('id,kind,musicxml,warnings,corrections,engine,engine_version,created_at')
      .eq('id', score.currentVersionId).maybeSingle())
    : null;
  return {
    ...score,
    version: version && { id: version.id, kind: version.kind, musicxml: version.musicxml, warnings: version.warnings ?? [],
      corrections: version.corrections, engine: version.engine, engineVersion: version.engine_version, createdAt: version.created_at },
    job: await jobStatus(client, scoreId),
  };
}

/**
 * Saves the user's corrections as a new immutable version. `confirm` marks it ready for personal use.
 * @param {any} client
 * @param {{ scoreId: string, musicxml: string, corrections?: unknown[], warnings?: unknown[], confirm?: boolean }} input
 * @returns {Promise<{ versionId: string, status: string }>}
 */
export function saveCorrection(client, { scoreId, musicxml, corrections = [], warnings = [], confirm = false }) {
  return rpc(client, 'score_save_correction', {
    p_score_id: scoreId, p_musicxml: musicxml, p_corrections: corrections, p_warnings: warnings, p_confirm: confirm,
  });
}

/**
 * Asks for publication in the shared library. Requires a known license and the confirmed statement.
 * @param {any} client @param {{ scoreId: string, license: string, shareStatement: string }} input
 */
export function submitForReview(client, { scoreId, license, shareStatement }) {
  return rpc(client, 'score_submit_for_review', { p_score_id: scoreId, p_license: license, p_share_statement: shareStatement });
}

/** Queues recognition again after a failed job; returns the active job if there is one. */
export function requestRecognition(/** @type {any} */ client, /** @type {string} */ scoreId) {
  return rpc(client, 'score_request_recognition', { p_score_id: scoreId });
}

/** Deletes a score that is not published or under review, then its raw file. */
export async function deleteScore(/** @type {any} */ client, /** @type {string} */ scoreId) {
  const result = await rpc(client, 'score_delete', { p_score_id: scoreId });
  if (result?.storagePath) {
    // The rows are gone either way; a leftover object stays private to its owner.
    try { await client.storage.from(SCORE_BUCKET).remove([result.storagePath]); } catch { /* best effort */ }
  }
  return { deleted: true };
}

/**
 * Published library entries. `search` matches title or composer.
 * @param {any} client
 * @param {{ instrument?: string, difficulty?: string, search?: string, limit?: number, offset?: number }} [filters]
 */
export async function listLibrary(client, { instrument, difficulty, search, limit = 50, offset = 0 } = {}) {
  const size = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
  const start = Math.max(Math.trunc(offset) || 0, 0);
  let query = client.from('library_scores').select('*').order('published_at', { ascending: false }).range(start, start + size - 1);
  if (instrument) query = query.eq('instrument', instrument);
  if (difficulty) query = query.eq('difficulty', difficulty);
  const term = String(search ?? '').replace(/[%,()*\\"'.:]/g, ' ').trim().slice(0, 80);
  if (term) query = query.or(`title.ilike.*${term}*,composer.ilike.*${term}*`);
  const rows = await read(query);
  return (rows ?? []).map(row => ({
    scoreId: row.score_id, title: row.title, composer: row.composer, instrument: row.instrument, difficulty: row.difficulty,
    license: row.license, sourceNote: row.source_note, publishedVersionId: row.published_version_id, publishedAt: row.published_at,
  }));
}

/** The latest published MusicXML of a library score, for anyone. @param {any} client @param {string} scoreId */
export async function openLibraryScore(client, scoreId) {
  const data = await rpc(client, 'library_score_open', { p_score_id: scoreId });
  if (!data) throw new ScoreLibraryError('not_found');
  return data;
}

/** Reports an error in a published score (signed-in users). @param {any} client @param {{ scoreId: string, measure: number, message: string }} input */
export function reportError(client, { scoreId, measure, message }) {
  return rpc(client, 'score_report_error', { p_score_id: scoreId, p_measure: measure, p_message: message });
}

/**
 * The most recent recognition job of one of the caller's scores, or null.
 * @param {any} client @param {string} scoreId
 * @returns {Promise<{ id: string, state: string, progress: number, attempts: number, maxAttempts: number, errorCode: string|null, updatedAt: string } | null>}
 */
export async function jobStatus(client, scoreId) {
  const row = await read(client.from('score_jobs').select('id,state,progress,attempts,max_attempts,error_code,updated_at')
    .eq('score_id', scoreId).order('created_at', { ascending: false }).limit(1).maybeSingle());
  return row ? { id: row.id, state: row.state, progress: row.progress, attempts: row.attempts, maxAttempts: row.max_attempts,
    errorCode: row.error_code, updatedAt: row.updated_at } : null;
}
