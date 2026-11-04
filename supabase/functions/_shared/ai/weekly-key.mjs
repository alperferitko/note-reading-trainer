import { cleanWeeklyMetrics } from './validation.mjs';

const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * SHA-256 of the checked metrics in their fixed key order, so equal numbers always hash equally
 * (absent optional fields count as null). Throws invalid_request for invalid metrics.
 */
export async function metricsHash(metrics) {
  const canonical = JSON.stringify(cleanWeeklyMetrics(metrics));
  return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
}

/**
 * The only idempotency key the gateway accepts for a weekly report. An unchanged period and
 * unchanged numbers give the same key, so a second request replays the stored answer instead of
 * paying for a new generation.
 */
export async function weeklyReportKey(period, metrics) {
  return `weekly-${period.start}-${(await metricsHash(metrics)).slice(0, 40)}`;
}
