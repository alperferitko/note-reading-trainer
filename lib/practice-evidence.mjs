// Question-level practice evidence kept only in this browser.
// Each record describes one answered prompt in its written context, so a
// weakness in one clef, octave or accidental is never generalised to another.

/**
 * @typedef {'reading'|'score'|'guitar'|'piano'|'violin'|'ear'|'rhythm'} EvidenceModule
 * @typedef {'insufficient'|'needs-work'|'developing'|'secure'|'stale'} EvidenceStatus
 * @typedef {{id:string, module:EvidenceModule, task:string, item:string, session:string, correct:boolean,
 *   firstAttempt:boolean, assisted:boolean, timedOut:boolean, responseMs:number|null, timeLimitMs:number|null, at:string,
 *   clef?:'treble'|'bass', midi?:number, octave?:number, position?:number, accidental?:number, keySignature?:number,
 *   answer?:string, rhythm?:string}} EvidenceRecord
 * @typedef {Record<string, unknown>} EvidenceFilter
 * @typedef {{key:string, module:EvidenceModule, task:string, item:string, clef?:'treble'|'bass', midi?:number,
 *   octave?:number, position?:number, accidental?:number, attempts:number, unaidedAttempts:number,
 *   assistedAttempts:number, recentAttempts:number, recentErrors:number, timeouts:number, errorRate:number,
 *   commonAnswer:string|null, lastSeen:string, status:EvidenceStatus}} ItemSummary
 * @typedef {{key:string, items:ItemSummary[], status:EvidenceStatus, attempts:number, unaidedAttempts:number, lastSeen:string}} SkillGroup
 * @typedef {{filter:EvidenceFilter, minAttempts:number, minAccuracy:number, predicate?:(row:EvidenceRecord)=>boolean}} ApplicationCriterion
 */

export const EVIDENCE_KEY = 'notanota-question-evidence-v1';
export const EVIDENCE_LIMIT = 800;
export const EVIDENCE_EVENT = 'notanota-evidence';
const DAY = 86400000;

export const EVIDENCE_MODULES = Object.freeze(['reading', 'score', 'guitar', 'piano', 'violin', 'ear', 'rhythm']);
const CLEFS = new Set(['treble', 'bass']);
const RHYTHMS = new Set(['whole', 'half', 'quarter', 'dottedQuarter', 'eighth', 'sixteenth', 'triplet']);

// Thresholds are deliberately conservative: a single bad answer is noise.
export const WEAKNESS_RULES = Object.freeze({
  window: 6,          // latest comparable attempts per item
  minAttempts: 3,     // unaided attempts needed before any diagnosis
  minErrors: 2,
  minErrorRate: 0.4,
  maxAgeDays: 45,     // older evidence no longer describes current skill
});
export const SECURE_RULES = Object.freeze({ window: 5, minAttempts: 5, minAccuracy: 0.9, staleDays: 30 });

/** @param {unknown} value @param {number} min @param {number} max */
const isInt = (value, min, max) => Number.isInteger(value) && /** @type {number} */ (value) >= min && /** @type {number} */ (value) <= max;
/** @param {unknown} value @param {number} [max] */
const isText = (value, max = 80) => typeof value === 'string' && value.length > 0 && value.length <= max;

/**
 * Validates one stored record. Unknown or malformed data is dropped, never repaired.
 * @param {any} row
 * @param {number} [now]
 * @returns {EvidenceRecord|null}
 */
export function validEvidenceRecord(row, now = Date.now()) {
  if (!row || typeof row !== 'object') return null;
  const at = Date.parse(row.at);
  if (!isText(row.id, 120) || !EVIDENCE_MODULES.includes(row.module) || !isText(row.task, 40) || !isText(row.item, 60)
    || !isText(row.session, 80) || !Number.isFinite(at) || at > now + 60000
    || typeof row.correct !== 'boolean' || typeof row.firstAttempt !== 'boolean'
    || typeof row.assisted !== 'boolean' || typeof row.timedOut !== 'boolean') return null;
  if (row.timedOut && row.correct) return null;
  if (row.clef !== undefined && !CLEFS.has(row.clef)) return null;
  if (row.midi !== undefined && !isInt(row.midi, 0, 127)) return null;
  if (row.octave !== undefined && !isInt(row.octave, -1, 9)) return null;
  if (row.position !== undefined && !isInt(row.position, -30, 30)) return null;
  if (row.accidental !== undefined && !isInt(row.accidental, -1, 1)) return null;
  if (row.keySignature !== undefined && !isInt(row.keySignature, -7, 7)) return null;
  if (row.answer !== undefined && row.answer !== null && !isText(row.answer, 24)) return null;
  if (row.rhythm !== undefined && !RHYTHMS.has(row.rhythm)) return null;
  if (row.responseMs !== null && row.responseMs !== undefined && !(Number.isFinite(row.responseMs) && row.responseMs >= 0 && row.responseMs < 3600000)) return null;
  if (row.timeLimitMs !== null && row.timeLimitMs !== undefined && !(Number.isFinite(row.timeLimitMs) && row.timeLimitMs > 0 && row.timeLimitMs < 600000)) return null;
  /** @type {EvidenceRecord & Record<string, unknown>} */
  const clean = {
    id: row.id, module: row.module, task: row.task, item: row.item, session: row.session,
    correct: row.correct, firstAttempt: row.firstAttempt, assisted: row.assisted, timedOut: row.timedOut,
    responseMs: row.responseMs ?? null, timeLimitMs: row.timeLimitMs ?? null, at: new Date(at).toISOString(),
  };
  for (const key of ['clef', 'midi', 'octave', 'position', 'accidental', 'keySignature', 'answer', 'rhythm']) {
    if (row[key] !== undefined && row[key] !== null) clean[key] = row[key];
  }
  return clean;
}

/**
 * @param {unknown} value
 * @param {number} [now]
 * @returns {EvidenceRecord[]}
 */
export function validEvidence(value, now = Date.now()) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  /** @type {EvidenceRecord[]} */
  const rows = [];
  for (const row of value) {
    const clean = validEvidenceRecord(row, now);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    rows.push(clean);
  }
  return rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-EVIDENCE_LIMIT);
}

/**
 * Appends records; the oldest evidence is discarded once the local limit is reached.
 * @param {unknown} existing
 * @param {unknown} additions
 * @param {number} [now]
 * @returns {EvidenceRecord[]}
 */
export function appendEvidence(existing, additions, now = Date.now()) {
  const rows = validEvidence(existing, now);
  const ids = new Set(rows.map(row => row.id));
  const fresh = validEvidence(additions, now).filter(row => !ids.has(row.id));
  return validEvidence([...rows, ...fresh], now);
}

/**
 * The context that makes two attempts comparable. Timed and untimed answers are kept apart.
 * @param {Pick<EvidenceRecord,'module'|'task'|'clef'|'item'|'timeLimitMs'>} row
 */
export function contextKey(row) {
  return [row.module, row.task, row.clef ?? '-', row.item, row.timeLimitMs ? 'timed' : 'free'].join('|');
}

/** @param {EvidenceRecord} row @param {EvidenceFilter} [filter] */
function matchesFilter(row, filter = {}) {
  const values = /** @type {Record<string, unknown>} */ (row);
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    if (Array.isArray(value) ? !value.includes(values[key]) : values[key] !== value) return false;
  }
  return true;
}

/**
 * Summarises each comparable context. Assisted answers are counted but never
 * used as evidence of either weakness or security.
 * @param {unknown} records
 * @param {EvidenceFilter} [filter]
 * @param {number} [now]
 * @returns {ItemSummary[]}
 */
export function analyzeItems(records, filter = {}, now = Date.now()) {
  const rows = validEvidence(records, now).filter(row => matchesFilter(row, filter));
  /** @type {Map<string, EvidenceRecord[]>} */
  const groups = new Map();
  for (const row of rows) {
    const key = contextKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const maxAge = WEAKNESS_RULES.maxAgeDays * DAY;
  return [...groups.entries()].map(([key, group]) => {
    const unaided = group.filter(row => !row.assisted);
    const recentUnaided = unaided.filter(row => now - Date.parse(row.at) <= maxAge).slice(-WEAKNESS_RULES.window);
    const errors = recentUnaided.filter(row => !row.correct);
    const secureWindow = unaided.slice(-SECURE_RULES.window);
    const sample = /** @type {EvidenceRecord} */ (group.at(-1));
    const lastSeen = sample.at;
    /** @type {Map<string, number>} */
    const answers = new Map();
    for (const row of errors) if (row.answer) answers.set(row.answer, (answers.get(row.answer) ?? 0) + 1);
    const commonAnswer = [...answers.entries()].sort((a, b) => b[1] - a[1])[0];
    const errorRate = recentUnaided.length ? errors.length / recentUnaided.length : 0;
    const weak = recentUnaided.length >= WEAKNESS_RULES.minAttempts && errors.length >= WEAKNESS_RULES.minErrors
      && errorRate >= WEAKNESS_RULES.minErrorRate;
    const stale = now - Date.parse(lastSeen) > SECURE_RULES.staleDays * DAY;
    const secure = !weak && secureWindow.length >= SECURE_RULES.minAttempts
      && secureWindow.filter(row => row.correct).length / secureWindow.length >= SECURE_RULES.minAccuracy;
    /** @type {EvidenceStatus} */
    const status = recentUnaided.length < WEAKNESS_RULES.minAttempts ? 'insufficient'
      : weak ? 'needs-work' : secure ? (stale ? 'stale' : 'secure') : 'developing';
    return {
      key, module: sample.module, task: sample.task, item: sample.item, clef: sample.clef,
      midi: sample.midi, octave: sample.octave, position: sample.position, accidental: sample.accidental,
      attempts: group.length, unaidedAttempts: unaided.length, assistedAttempts: group.length - unaided.length,
      recentAttempts: recentUnaided.length, recentErrors: errors.length,
      timeouts: errors.filter(row => row.timedOut).length,
      errorRate: Math.round(errorRate * 100) / 100,
      commonAnswer: commonAnswer && commonAnswer[1] >= 2 ? commonAnswer[0] : null,
      lastSeen, status,
    };
  });
}

/**
 * Items that have repeatedly been answered wrongly in comparable, unaided conditions.
 * @param {unknown} records
 * @param {EvidenceFilter} [filter]
 * @param {number} [now]
 * @returns {ItemSummary[]}
 */
export function findWeakItems(records, filter = {}, now = Date.now()) {
  return analyzeItems(records, filter, now)
    .filter(item => item.status === 'needs-work')
    .sort((a, b) => b.errorRate - a.errorRate || b.recentErrors - a.recentErrors || Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
}

/** @param {() => number} rng */
function draw(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random value');
  return value;
}

/**
 * Adds a limited number of extra repetitions for weak items to an existing
 * question pool. The pool itself is never reduced, so the session still
 * re-measures every item alongside the targeted ones.
 * @template T
 * @param {T[]} pool
 * @param {Iterable<string>} weakKeys
 * @param {{itemKey?:(item:T)=>string, maxShare?:number, maxExtra?:number, rng?:()=>number}} [options]
 * @returns {{pool:T[], targeted:T[]}}
 */
export function buildTargetedPool(pool, weakKeys, { itemKey = item => /** @type {any} */ (item).id, maxShare = 0.3, maxExtra = 6, rng = Math.random } = {}) {
  if (!Array.isArray(pool) || !pool.length) return { pool: [], targeted: [] };
  const wanted = new Set(weakKeys);
  const candidates = pool.filter(item => wanted.has(itemKey(item)));
  const limit = Math.max(0, Math.min(maxExtra, Math.floor(pool.length * maxShare), candidates.length));
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(draw(rng) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const targeted = shuffled.slice(0, limit);
  return { pool: [...pool, ...targeted], targeted };
}

/**
 * Whether the remaining items can still be ordered without a repeat after `lastKey`.
 * @template T
 * @param {T[]} pool
 * @param {(item:T)=>string} itemKey
 * @param {string} lastKey
 */
function canSpread(pool, itemKey, lastKey) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const item of pool) counts.set(itemKey(item), (counts.get(itemKey(item)) ?? 0) + 1);
  const size = pool.length;
  return [...counts.entries()].every(([key, count]) => count <= (key === lastKey ? Math.floor(size / 2) : Math.ceil(size / 2)));
}

/**
 * Spreads repeated items so the same prompt never appears twice in a row when that is possible.
 * @template T
 * @param {T[]} items
 * @param {(item:T)=>string} [itemKey]
 * @param {()=>number} [rng]
 * @returns {T[]}
 */
export function spreadRepeats(items, itemKey = item => /** @type {any} */ (item).id, rng = Math.random) {
  const pool = [...items];
  /** @type {T[]} */
  const result = [];
  while (pool.length) {
    const previous = result.at(-1);
    const indexes = pool.map((_, index) => index);
    const start = Math.floor(draw(rng) * indexes.length);
    const ordered = [...indexes.slice(start), ...indexes.slice(0, start)];
    const safe = ordered.filter(index => previous === undefined || itemKey(pool[index]) !== itemKey(previous));
    const feasible = safe.find(index => canSpread(pool.filter((_, i) => i !== index), itemKey, itemKey(pool[index])));
    const picked = feasible ?? safe[0] ?? ordered[0];
    result.push(pool[picked]);
    pool.splice(picked, 1);
  }
  return result;
}

/**
 * Groups evidence into a skill map with sample size and recency always visible.
 * @param {unknown} records
 * @param {EvidenceFilter} [filter]
 * @param {(item:ItemSummary)=>string} [groupBy]
 * @param {number} [now]
 * @returns {SkillGroup[]}
 */
export function buildSkillMap(records, filter = {}, groupBy = item => item.item, now = Date.now()) {
  /** @type {Map<string, ItemSummary[]>} */
  const groups = new Map();
  for (const item of analyzeItems(records, filter, now)) {
    const key = groupBy(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  /** @type {Record<EvidenceStatus, number>} */
  const rank = { 'needs-work': 0, developing: 1, stale: 2, secure: 3, insufficient: 4 };
  return [...groups.entries()].map(([key, items]) => {
    const known = items.filter(item => item.status !== 'insufficient');
    const status = known.length ? known.map(item => item.status).sort((a, b) => rank[a] - rank[b])[0] : 'insufficient';
    return {
      key, items, status,
      attempts: items.reduce((sum, item) => sum + item.attempts, 0),
      unaidedAttempts: items.reduce((sum, item) => sum + item.unaidedAttempts, 0),
      lastSeen: /** @type {string} */ (items.map(item => item.lastSeen).sort().at(-1)),
    };
  });
}

/**
 * Unaided accuracy in two consecutive windows of equal length, for one set of
 * comparable conditions. No change is reported until both windows have enough answers.
 * @param {unknown} records
 * @param {EvidenceFilter} filter
 * @param {{days?:number, minAttempts?:number}} [options]
 * @param {number} [now]
 */
export function compareWindows(records, filter, { days = 14, minAttempts = 10 } = {}, now = Date.now()) {
  const span = days * DAY;
  const rows = validEvidence(records, now).filter(row => !row.assisted && matchesFilter(row, filter));
  /** @param {number} from @param {number} to */
  const window = (from, to) => {
    const inside = rows.filter(row => { const at = Date.parse(row.at); return at > from && at <= to; });
    const correct = inside.filter(row => row.correct).length;
    return { attempts: inside.length, correct, accuracy: inside.length ? Math.round(correct / inside.length * 100) : null };
  };
  const recent = window(now - span, now);
  const previous = window(now - 2 * span, now - span);
  const comparable = recent.attempts >= minAttempts && previous.attempts >= minAttempts;
  return { recent, previous, comparable, change: comparable ? /** @type {number} */ (recent.accuracy) - /** @type {number} */ (previous.accuracy) : null };
}

/**
 * Evidence of applying a lesson in practice after its knowledge check was passed.
 * @param {unknown} records
 * @param {ApplicationCriterion|null|undefined} criterion
 * @param {string|undefined} since
 * @param {number} [now]
 * @returns {{applied:boolean, attempts:number, correct:number, required:number}}
 */
export function practiceApplication(records, criterion, since, now = Date.now()) {
  if (!criterion) return { applied: false, attempts: 0, correct: 0, required: 0 };
  const start = Date.parse(since ?? '');
  if (!Number.isFinite(start)) return { applied: false, attempts: 0, correct: 0, required: criterion.minAttempts };
  const rows = validEvidence(records, now)
    .filter(row => Date.parse(row.at) >= start && !row.assisted && matchesFilter(row, criterion.filter)
      && (!criterion.predicate || criterion.predicate(row)));
  const recent = rows.slice(-Math.max(criterion.minAttempts, 12));
  const correct = recent.filter(row => row.correct).length;
  return {
    applied: recent.length >= criterion.minAttempts && correct / recent.length >= criterion.minAccuracy,
    attempts: recent.length, correct, required: criterion.minAttempts,
  };
}

/**
 * Removes matching records; an empty filter removes everything.
 * @param {unknown} records
 * @param {EvidenceFilter} [filter]
 * @param {number} [now]
 * @returns {EvidenceRecord[]}
 */
export function clearEvidence(records, filter = {}, now = Date.now()) {
  if (!Object.keys(filter).length) return [];
  return validEvidence(records, now).filter(row => !matchesFilter(row, filter));
}

// Browser helpers. Every read and write degrades to an in-memory no-op.
/**
 * @param {Pick<Storage,'getItem'>|undefined} [storage]
 * @param {number} [now]
 * @returns {EvidenceRecord[]}
 */
export function readEvidence(storage = globalThis.localStorage, now = Date.now()) {
  try { return validEvidence(JSON.parse(storage?.getItem(EVIDENCE_KEY) || '[]'), now); } catch { return []; }
}

/**
 * @param {unknown[]} additions
 * @param {Pick<Storage,'getItem'|'setItem'>|undefined} [storage]
 * @param {number} [now]
 */
export function saveEvidence(additions, storage = globalThis.localStorage, now = Date.now()) {
  try {
    const next = appendEvidence(readEvidence(storage, now), additions, now);
    storage?.setItem(EVIDENCE_KEY, JSON.stringify(next));
    globalThis.dispatchEvent?.(new Event(EVIDENCE_EVENT));
    return true;
  } catch { return false; }
}

/**
 * @param {EvidenceRecord[]} rows
 * @param {Pick<Storage,'setItem'>|undefined} [storage]
 */
export function writeEvidence(rows, storage = globalThis.localStorage) {
  try {
    storage?.setItem(EVIDENCE_KEY, JSON.stringify(rows));
    globalThis.dispatchEvent?.(new Event(EVIDENCE_EVENT));
    return true;
  } catch { return false; }
}
