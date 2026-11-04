import { EVIDENCE_LIMIT, EVIDENCE_MODULES, validEvidenceRecord } from '../vendor/practice-evidence.mjs';
import { AIError, SUPPORTED_TASKS } from './contracts.mjs';
import { ASK_FIELDS, PLAN_DAY_MINUTES, PLAN_FOCUS_CHARS, WEEK_DAYS, CHAT_LIMITS, CHAT_REPLY_CHARS, LESSON_IDS, MAX_INTERESTS_CHARS, MAX_WEEKLY_MINUTES, PROFILE_ENUMS, PROFILE_FIELDS,
  SCREEN_CATEGORIES, SCREEN_HANDWRITING, SCREEN_LIMITS, SCREEN_VERDICTS, STRUGGLE_NOTE, STUDIO_IDS, SUGGESTION_LABEL_CHARS, TREBLE_NOTE_IDS, WEEKLY_LIMITS } from './catalog.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const invalid = () => { throw new AIError('invalid_request'); };
const RECORD_KEYS = ['id', 'module', 'task', 'item', 'session', 'correct', 'firstAttempt', 'assisted', 'timedOut', 'responseMs', 'timeLimitMs', 'at', 'clef', 'midi', 'octave', 'position', 'accidental', 'keySignature', 'answer', 'rhythm'];

export function validateRequest(input, now, maxInputChars) {
  // Bound serialized input before analysing it. The future HTTP boundary must also
  // impose a byte limit while reading the request body, before JSON.parse.
  let encoded;
  try { encoded = JSON.stringify(input); } catch { invalid(); }
  if (typeof encoded !== 'string') invalid();
  // The screening image is the only request allowed above the usual bound, and only up to its own cap.
  const cap = object(input) && input.task === 'score-screen' ? SCREEN_LIMITS.maxBodyBytes : maxInputChars;
  if (encoded.length > cap) throw new AIError('request_too_large', 413);
  if (!object(input) || input.schemaVersion !== '1' || !['tr', 'en'].includes(input.locale)) invalid();
  if (input.task === 'quality-evaluation') throw new AIError('task_not_enabled', 403);
  if (!SUPPORTED_TASKS.includes(input.task)) invalid();
  if (input.task === 'teacher-chat') return validateChatRequest(input, now);
  if (input.task === 'weekly-report') return validateWeeklyRequest(input, now);
  if (input.task === 'score-screen') return validateScreenRequest(input);
  if (!keys(input, ['schemaVersion', 'task', 'locale', 'scope', 'evidence'])) invalid();
  if (!keys(input.scope, ['module', 'sessionId']) || !EVIDENCE_MODULES.includes(input.scope.module)
    || (input.scope.sessionId !== undefined && !text(input.scope.sessionId, 80))) invalid();
  if (!keys(input.evidence, ['records']) || !Array.isArray(input.evidence.records)) invalid();
  if (input.evidence.records.length > EVIDENCE_LIMIT) throw new AIError('request_too_large', 413);
  const records = projectRecords(input.evidence.records, now, row => row.module === input.scope.module
    && (input.scope.sessionId === undefined || row.session === input.scope.sessionId));
  return { schemaVersion: '1', task: input.task, locale: input.locale, scope: { ...input.scope }, evidence: { records } };
}

function projectRecords(rows, now, accept = () => true) {
  const ids = new Set();
  return rows.map(row => {
    if (!keys(row, RECORD_KEYS) || !validEvidenceRecord(row, now) || ids.has(row.id)
      || Date.parse(row.at) > now || !accept(row)) invalid();
    ids.add(row.id);
    // Explicit projection: free answers and unknown properties never reach a model.
    const clean = validEvidenceRecord(row, now);
    delete clean.answer;
    return clean;
  });
}

// Free text from users and models: bounded, non-blank, and without control characters other than
// tab and newline. It is data for the model and the UI, never markup or instructions.
const plain = (value, max) => text(value, max) && ![...value].some(char => {
  const code = char.charCodeAt(0);
  return (code < 32 && code !== 9 && code !== 10) || code === 127;
});
const int = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const DAY = 86400000;
const dayValue = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  return new Date(at).toISOString().slice(0, 10) === value ? at : null;
};

/** IANA zone names (and UTC) that this runtime's Intl knows. */
export function validTimeZone(value) {
  if (typeof value !== 'string' || value.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}

/**
 * A partial learner profile. `null` fields mean "not known" and are left out of the result.
 * @param {unknown} value @param {() => never} [fail]
 */
export function cleanProfile(value, fail = invalid) {
  if (value === null || value === undefined) return null;
  if (!keys(value, PROFILE_FIELDS)) fail();
  const out = {};
  for (const field of PROFILE_FIELDS) {
    const item = value[field];
    if (item === undefined || item === null) continue;
    const ok = field === 'weeklyMinutes' ? int(item, 0, MAX_WEEKLY_MINUTES)
      : field === 'interests' ? plain(item, MAX_INTERESTS_CHARS) : PROFILE_ENUMS[field].includes(item);
    if (!ok) fail();
    out[field] = item;
  }
  return out;
}

function validateChatRequest(input, now) {
  if (!keys(input, ['schemaVersion', 'task', 'locale', 'messages', 'profile', 'evidence'])) invalid();
  const { messages } = input;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > CHAT_LIMITS.maxTurns) invalid();
  let total = 0;
  const turns = messages.map(message => {
    if (!keys(message, ['role', 'text']) || !['user', 'teacher'].includes(message.role)
      || !plain(message.text, CHAT_LIMITS.maxMessageChars)) invalid();
    total += message.text.length;
    return { role: message.role, text: message.text };
  });
  // The conversation always ends with the message being answered.
  if (total > CHAT_LIMITS.maxTotalChars || turns.at(-1).role !== 'user') invalid();
  let evidence = null;
  if (input.evidence !== undefined && input.evidence !== null) {
    if (!keys(input.evidence, ['records']) || !Array.isArray(input.evidence.records)) invalid();
    if (input.evidence.records.length > EVIDENCE_LIMIT) throw new AIError('request_too_large', 413);
    const records = projectRecords(input.evidence.records, now);
    if (records.length) evidence = { records };
  }
  return { schemaVersion: '1', task: 'teacher-chat', locale: input.locale, messages: turns,
    profile: cleanProfile(input.profile), evidence };
}

/**
 * The app's own weekly numbers, checked and copied in a fixed key order (the idempotency hash
 * depends on it). Missing measurements are null, never 0: a measurement without samples is rejected.
 * @param {unknown} value @param {{days?:number, nested?:boolean, fail?:() => never}} [options]
 */
export function cleanWeeklyMetrics(value, { days = 7, nested = false, fail = invalid } = {}) {
  const L = WEEKLY_LIMITS;
  const allowed = ['sessions', 'practiceDays', 'answers', 'noteStruggles', 'responseTimeMs', 'rhythmTiming', 'dataQuality',
    ...(nested ? [] : ['pieces', 'previous'])];
  if (!keys(value, allowed) || !int(value.sessions, 0, L.maxSessions) || !int(value.practiceDays, 0, days)
    || !keys(value.answers, ['correct', 'wrong']) || !int(value.answers.correct, 0, L.maxCount) || !int(value.answers.wrong, 0, L.maxCount)
    || !Array.isArray(value.noteStruggles) || value.noteStruggles.length > L.maxStruggles
    || !['none', 'thin', 'ok'].includes(value.dataQuality)) fail();
  const seen = new Set();
  const noteStruggles = value.noteStruggles.map(row => {
    if (!keys(row, ['note', 'attempts', 'errors']) || typeof row.note !== 'string' || !STRUGGLE_NOTE.test(row.note) || seen.has(row.note)
      || !int(row.attempts, 1, L.maxCount) || !int(row.errors, 1, row.attempts)) fail();
    seen.add(row.note);
    return { note: row.note, attempts: row.attempts, errors: row.errors };
  });
  const measured = (item, field, max) => {
    if (item === undefined || item === null) return null;
    if (!keys(item, [field, 'sampleSize']) || !int(item[field], 0, max) || !int(item.sampleSize, 1, L.maxCount)) fail();
    return { [field]: item[field], sampleSize: item.sampleSize };
  };
  const responseTimeMs = measured(value.responseTimeMs, 'median', 3600000);
  const rhythmTiming = measured(value.rhythmTiming, 'meanAbsOffsetMs', 60000);
  const total = value.answers.correct + value.answers.wrong;
  // 'none' means no answer at all, and then there is nothing else to report either.
  if ((total === 0) !== (value.dataQuality === 'none')
    || (total === 0 && (value.sessions || value.practiceDays || noteStruggles.length || responseTimeMs || rhythmTiming))
    || (total > 0 && (value.sessions < 1 || value.practiceDays < 1))) fail();
  const out = { sessions: value.sessions, practiceDays: value.practiceDays,
    answers: { correct: value.answers.correct, wrong: value.answers.wrong }, noteStruggles, responseTimeMs, rhythmTiming };
  if (!nested) {
    if (!Array.isArray(value.pieces) || value.pieces.length > L.maxPieces) fail();
    out.pieces = value.pieces.map(piece => {
      if (!keys(piece, ['title', 'from', 'to']) || !plain(piece.title, L.maxPieceTitleChars)
        || !int(piece.from, 0, 100) || !int(piece.to, 0, 100)) fail();
      return { title: piece.title, from: piece.from, to: piece.to };
    });
    out.previous = value.previous === undefined || value.previous === null ? null : cleanWeeklyMetrics(value.previous, { nested: true, fail });
  }
  out.dataQuality = value.dataQuality;
  return out;
}

function validateWeeklyRequest(input, now) {
  if (!keys(input, ['schemaVersion', 'task', 'locale', 'timezone', 'period', 'metrics']) || !validTimeZone(input.timezone)
    || !keys(input.period, ['start', 'end'])) invalid();
  const start = dayValue(input.period.start);
  const end = dayValue(input.period.end);
  // At most seven local days, and never a period that has not yet started in any time zone.
  if (start === null || end === null || end < start || end - start > 6 * DAY || start > now + 14 * 3600000) invalid();
  const metrics = cleanWeeklyMetrics(input.metrics, { days: (end - start) / DAY + 1 });
  return { schemaVersion: '1', task: 'weekly-report', locale: input.locale, timezone: input.timezone,
    period: { start: input.period.start, end: input.period.end }, metrics };
}

// Standard padded base64 only: no data: prefix, whitespace or URL-safe alphabet.
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const required = (value, fields) => keys(value, fields) && fields.every(field => Object.hasOwn(value, field));

/** True when a base64 string decodes to bytes that start with the JPEG marker FF D8 FF. */
export function isJpegBase64(data) {
  if (typeof data !== 'string' || data.length < 8 || !BASE64.test(data)) return false;
  const head = atob(data.slice(0, 4));
  return head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8 && head.charCodeAt(2) === 0xff;
}

/** One JPEG contact sheet of 1-8 pages. Every field is required and nothing else is accepted. */
function validateScreenRequest(input) {
  const L = SCREEN_LIMITS;
  const { image } = input;
  if (!required(input, ['schemaVersion', 'task', 'locale', 'image', 'pages']) || !int(input.pages, 1, L.maxPages)
    || !required(image, ['mime', 'data', 'width', 'height']) || image.mime !== 'image/jpeg'
    || typeof image.data !== 'string' || image.data.length > L.maxDataChars || !isJpegBase64(image.data)
    || !int(image.width, L.minSide, L.maxSide) || !int(image.height, L.minSide, L.maxSide)) invalid();
  return { schemaVersion: '1', task: 'score-screen', locale: input.locale,
    image: { mime: 'image/jpeg', data: image.data, width: image.width, height: image.height }, pages: input.pages };
}

const modelFail = () => { throw new AIError('invalid_model_response', 503); };

/** One suggestion of the shared union. Unknown kinds, ids and extra fields are rejected, never dropped. */
export function validateSuggestion(item) {
  if (!object(item) || !plain(item.label, SUGGESTION_LABEL_CHARS)) modelFail();
  if (item.kind === 'focus-drill') {
    if (!keys(item, ['kind', 'notes', 'repetitions', 'label']) || !Array.isArray(item.notes) || item.notes.length < 1 || item.notes.length > 6
      || new Set(item.notes).size !== item.notes.length || !item.notes.every(note => TREBLE_NOTE_IDS.includes(note))
      || !int(item.repetitions, 1, 6)) modelFail();
    return { kind: 'focus-drill', notes: [...item.notes], repetitions: item.repetitions, label: item.label };
  }
  if (item.kind === 'studio') {
    if (!keys(item, ['kind', 'studio', 'label']) || !STUDIO_IDS.includes(item.studio)) modelFail();
    return { kind: 'studio', studio: item.studio, label: item.label };
  }
  if (item.kind === 'lesson') {
    if (!keys(item, ['kind', 'lesson', 'label']) || !LESSON_IDS.includes(item.lesson)) modelFail();
    return { kind: 'lesson', lesson: item.lesson, label: item.label };
  }
  return modelFail();
}

const suggestionList = value => {
  if (!Array.isArray(value) || value.length > 3) modelFail();
  return value.map(validateSuggestion);
};

/** A proposed week: every day once, in order, minutes per day (0 = rest day) and a short focus. */
function weekPlan(value) {
  if (value === undefined || value === null) return null;
  if (!keys(value, ['days']) || !Array.isArray(value.days) || value.days.length !== WEEK_DAYS.length) modelFail();
  const days = value.days.map((day, i) => {
    if (!keys(day, ['day', 'minutes', 'focus']) || day.day !== WEEK_DAYS[i] || !int(day.minutes, 0, PLAN_DAY_MINUTES)
      || !(day.minutes === 0 ? day.focus === '' || plain(day.focus, PLAN_FOCUS_CHARS) : plain(day.focus, PLAN_FOCUS_CHARS))) modelFail();
    return { day: day.day, minutes: day.minutes, focus: day.focus };
  });
  if (days.reduce((sum, day) => sum + day.minutes, 0) > MAX_WEEKLY_MINUTES) modelFail();
  return { days };
}

/** The teacher's reply. profileUpdates and weekPlan are proposals only: the app saves them after the user confirms. */
export function validateTeacherChat(value) {
  if (!keys(value, ['reply', 'ask', 'profileUpdates', 'suggestions', 'weekPlan']) || !plain(value.reply, CHAT_REPLY_CHARS)
    || !(value.ask === undefined || value.ask === null || ASK_FIELDS.includes(value.ask))) modelFail();
  const updates = cleanProfile(value.profileUpdates, modelFail);
  return { reply: value.reply, ask: value.ask ?? null,
    profileUpdates: updates && Object.keys(updates).length ? updates : null, suggestions: suggestionList(value.suggestions), weekPlan: weekPlan(value.weekPlan) };
}

/** Narration of the app's numbers; no number is ever taken from the model. */
export function validateWeeklyReport(value) {
  const L = WEEKLY_LIMITS;
  if (!keys(value, ['headline', 'narrative', 'highlights', 'nextWeek']) || !plain(value.headline, L.headlineChars)
    || !plain(value.narrative, L.narrativeChars) || !Array.isArray(value.highlights) || value.highlights.length > L.maxHighlights
    || !value.highlights.every(item => plain(item, L.highlightChars))) modelFail();
  return { headline: value.headline, narrative: value.narrative, highlights: [...value.highlights], nextWeek: suggestionList(value.nextWeek) };
}

/**
 * The screening verdict. inappropriate and category must agree: false only with 'none', true never
 * with 'none'. notes is one short plain sentence; every field is required and nothing else is accepted.
 */
export function validateScoreScreen(value) {
  if (!required(value, ['verdict', 'inappropriate', 'category', 'handwriting', 'notes']) || !SCREEN_VERDICTS.includes(value.verdict)
    || typeof value.inappropriate !== 'boolean' || !SCREEN_CATEGORIES.includes(value.category)
    || value.inappropriate !== (value.category !== 'none') || !SCREEN_HANDWRITING.includes(value.handwriting)
    || !plain(value.notes, SCREEN_LIMITS.notesChars)) modelFail();
  return { verdict: value.verdict, inappropriate: value.inappropriate, category: value.category, handwriting: value.handwriting, notes: value.notes };
}

/** Each task's output validator. */
export function validateTaskOutput(task, value, summary) {
  if (task === 'teacher-chat') return validateTeacherChat(value);
  if (task === 'weekly-report') return validateWeeklyReport(value);
  if (task === 'score-screen') return validateScoreScreen(value);
  return validateFeedback(value, summary);
}

export function validateFeedback(value, summary) {
  const fail = () => { throw new AIError('invalid_model_response', 503); };
  if (!keys(value, ['summary', 'observations', 'exercises', 'limitations']) || !text(value.summary, 600)
    || !Array.isArray(value.observations) || value.observations.length > 5
    || !Array.isArray(value.exercises) || value.exercises.length > 3
    || !Array.isArray(value.limitations) || value.limitations.length > 5
    || !value.limitations.every(item => text(item, 240))) fail();
  const refs = new Set(summary.measurements.filter(item => item.value !== null).map(item => item.id));
  for (const observation of value.observations) {
    if (!keys(observation, ['text', 'evidenceRefs']) || !text(observation.text, 400)
      || !Array.isArray(observation.evidenceRefs) || observation.evidenceRefs.length < 1
      || observation.evidenceRefs.length > 5 || !observation.evidenceRefs.every(ref => refs.has(ref))) fail();
  }
  const contexts = new Set(summary.contexts.filter(item => item.recentAttempts >= 3).map(item => item.id));
  for (const exercise of value.exercises) {
    if (!keys(exercise, ['id', 'contextRef', 'repetitions']) || exercise.id !== 'context-review'
      || !contexts.has(exercise.contextRef) || !Number.isInteger(exercise.repetitions)
      || exercise.repetitions < 1 || exercise.repetitions > 6) fail();
  }
  // Return a detached value; model output is data, never HTML or executable code.
  return JSON.parse(JSON.stringify(value));
}

export function validateProviderResult(result, model) {
  const validToken = value => value === null || (Number.isSafeInteger(value) && value >= 0);
  if (!keys(result, ['output', 'usage', 'finishReason']) || result.finishReason !== 'stop'
    || !keys(result.usage, ['inputTokens', 'outputTokens'])
    || !validToken(result.usage.inputTokens) || !validToken(result.usage.outputTokens)
    || result.usage.inputTokens === undefined || result.usage.outputTokens === undefined
    || (result.usage.outputTokens !== null && result.usage.outputTokens > model.maxOutputTokens)) {
    throw new AIError('invalid_model_response', 503);
  }
  return result;
}