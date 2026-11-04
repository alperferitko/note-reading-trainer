import { DEFAULT_USAGE_POLICY } from '../../../supabase/functions/_shared/ai/usage-policy.mjs';

export const NOW = Date.parse('2026-10-30T12:00:00Z');
export const auth = { userId: 'user-1', authenticated: true };
export const context = { requestId: 'request-1', idempotencyKey: 'key-1' };
export const model = {
  provider: 'meta', modelId: 'offline-meta-fixture', mode: 'mock', verifiedAt: null,
  tasks: ['practice-feedback', 'adaptive-exercises'], maxInputChars: 20000, maxOutputTokens: 800,
  inputUsdPerMillion: 0, outputUsdPerMillion: 0, verificationSource: null,
};

export function request(overrides = {}) {
  return { schemaVersion: '1', task: 'practice-feedback', locale: 'tr', scope: { module: 'reading' },
    evidence: { records: Array.from({ length: 4 }, (_, index) => ({
      id: `record-${index}`, module: 'reading', task: 'name', item: 'treble:f4', session: 'session-1',
      correct: index === 0, firstAttempt: true, assisted: false, timedOut: false,
      responseMs: 1200, timeLimitMs: null, clef: 'treble', midi: 65,
      at: new Date(NOW - (4 - index) * 60000).toISOString(),
    })) }, ...overrides };
}

export function feedback() {
  return { summary: 'Bu bağlamı kısa bir turla tekrar edebilirsin.',
    observations: [{ text: 'Karşılaştırılabilir yanıtlarda tekrar gerektiren bir örüntü var.', evidenceRefs: ['context-1:accuracy'] }],
    exercises: [{ id: 'context-review', contextRef: 'context-1', repetitions: 3 }], limitations: [] };
}

export function mockAdapter(generate = async () => ({ output: feedback(), usage: { inputTokens: 100, outputTokens: 50 }, finishReason: 'stop' })) {
  return { provider: 'meta', mode: 'mock', generate };
}

/** TEST ONLY. Synchronous mutation before resolving emulates an atomic transaction.
 * Not durable, not a production quota implementation. Never imported by app code.
 * Gateway passes a digest rather than retained evidence JSON.
 */
export function memoryUsageStore() {
  const entries = [];
  let serial = 0;
  return {
    entries,
    async reserve({ userId, idempotencyKey, fingerprint, now, policy = DEFAULT_USAGE_POLICY, reservedUsd }) {
      const existing = entries.find(row => row.userId === userId && row.key === idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return { status: 'conflict' };
        return existing.response ? { status: 'replay', response: structuredClone(existing.response) } : { status: 'conflict' };
      }
      const day = Math.floor(now / 86400000);
      const daily = entries.filter(row => row.day === day);
      const mine = entries.filter(row => row.userId === userId);
      if (mine.filter(row => now - row.at < 60000).length >= policy.requestsPerMinute
        || mine.filter(row => row.day === day).length >= policy.requestsPerDay
        || mine.filter(row => !row.response).length >= policy.maxConcurrent
        || daily.filter(row => row.userId === userId).reduce((sum, row) => sum + row.chargedUsd, 0) + reservedUsd > policy.userDailyUsd
        || daily.reduce((sum, row) => sum + row.chargedUsd, 0) + reservedUsd > policy.globalDailyUsd) return { status: 'limited' };
      const id = `reservation-${++serial}`;
      entries.push({ id, userId, key: idempotencyKey, fingerprint, at: now, day, chargedUsd: reservedUsd, response: null });
      return { status: 'reserved', reservationId: id };
    },
    async settle(id, { response, actualUsd }) {
      const row = entries.find(entry => entry.id === id);
      if (!row) throw new Error('missing reservation');
      row.response = structuredClone(response);
      if (actualUsd !== null) row.chargedUsd = Math.max(actualUsd, 0);
    },
  };
}