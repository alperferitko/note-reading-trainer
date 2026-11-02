import { EVIDENCE_LIMIT, EVIDENCE_MODULES, validEvidenceRecord } from '../vendor/practice-evidence.mjs';
import { AIError, SUPPORTED_TASKS } from './contracts.mjs';

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
  if (encoded.length > maxInputChars) throw new AIError('request_too_large', 413);
  if (!keys(input, ['schemaVersion', 'task', 'locale', 'scope', 'evidence']) || input.schemaVersion !== '1'
    || !['tr', 'en'].includes(input.locale)) invalid();
  if (['weekly-report', 'quality-evaluation'].includes(input.task)) throw new AIError('task_not_enabled', 403);
  if (!SUPPORTED_TASKS.includes(input.task)) invalid();
  if (!keys(input.scope, ['module', 'sessionId']) || !EVIDENCE_MODULES.includes(input.scope.module)
    || (input.scope.sessionId !== undefined && !text(input.scope.sessionId, 80))) invalid();
  if (!keys(input.evidence, ['records']) || !Array.isArray(input.evidence.records)) invalid();
  if (input.evidence.records.length > EVIDENCE_LIMIT) throw new AIError('request_too_large', 413);
  const ids = new Set();
  const records = input.evidence.records.map(row => {
    if (!keys(row, RECORD_KEYS) || !validEvidenceRecord(row, now) || ids.has(row.id)
      || Date.parse(row.at) > now || row.module !== input.scope.module
      || (input.scope.sessionId !== undefined && row.session !== input.scope.sessionId)) invalid();
    ids.add(row.id);
    // Explicit projection: free answers and unknown properties never reach a model.
    const clean = validEvidenceRecord(row, now);
    delete clean.answer;
    return clean;
  });
  return { schemaVersion: '1', task: input.task, locale: input.locale, scope: { ...input.scope }, evidence: { records } };
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