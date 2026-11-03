import { analyzeItems, contextKey, validEvidence, WEAKNESS_RULES } from '../vendor/practice-evidence.mjs';
import { ANALYSIS_VERSION, SCHEMA_VERSION } from './contracts.mjs';

const DAY = 86400000;
const mean = rows => rows.length ? Math.round(rows.reduce((sum, row) => sum + row.responseMs, 0) / rows.length) : null;

/** Accepts validated records; independently sanitizes for direct/offline callers. */
export function buildEvidenceSummary(records, now = Date.now()) {
  const rows = validEvidence(records, now).filter(row => Date.parse(row.at) <= now).map(row => {
    const clean = { ...row };
    delete clean.answer;
    return clean;
  });
  const measurements = [];
  const contexts = analyzeItems(rows, {}, now).map((item, index) => {
    const id = `context-${index + 1}`;
    const recent = rows.filter(row => contextKey(row) === item.key && !row.assisted && now - Date.parse(row.at) <= WEAKNESS_RULES.maxAgeDays * DAY).slice(-WEAKNESS_RULES.window);
    const measured = recent.filter(row => row.responseMs !== null);
    const tapping = item.module === 'rhythm' && ['tap-pulse', 'tap-pattern'].includes(item.task);
    measurements.push({ id: `${id}:accuracy`, context: id, kind: 'accuracy', value: recent.length ? Math.round(recent.filter(row => row.correct).length / recent.length * 100) : null, unit: 'percent', sampleSize: recent.length });
    measurements.push({ id: `${id}:timing`, context: id, kind: tapping ? 'tap-timing-error' : 'response-time', value: mean(measured), unit: 'ms', sampleSize: measured.length });
    // Do not expose session IDs, raw answers, user IDs or item/task free text.
    // Context names are intentionally opaque until a trusted catalogue is added.
    return { id, module: item.module, clef: item.clef ?? null, timed: item.key.endsWith('|timed'), attempts: item.attempts,
      unaidedAttempts: item.unaidedAttempts, recentAttempts: item.recentAttempts, status: item.status };
  });
  const eligible = contexts.some(item => item.recentAttempts >= WEAKNESS_RULES.minAttempts);
  return {
    schemaVersion: SCHEMA_VERSION, analysisVersion: ANALYSIS_VERSION, source: 'client-reported',
    generatedAt: new Date(now).toISOString(),
    period: { from: rows[0]?.at ?? null, to: rows.at(-1)?.at ?? null }, sampleSize: rows.length,
    eligible, contexts, measurements,
    limitations: ['client_reported_not_verified', 'no_audio_pitch_measurement', 'historical_tap_details_unavailable',
      ...(!eligible ? ['insufficient_recent_unaided_evidence'] : [])],
  };
}

export function deterministicFeedback(summary, locale) {
  return {
    summary: locale === 'tr' ? 'Ölçümler aşağıdaki kanıt özetindedir. Mevcut ücretsiz alıştırmalarla devam edebilirsin.'
      : 'Measurements are available in the evidence summary. You can continue with the existing free exercises.',
    observations: [], exercises: [], limitations: [...summary.limitations],
  };
}