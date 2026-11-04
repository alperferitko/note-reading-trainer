import { createAIGateway } from './gateway.mjs';
import { createModelRegistry } from './model-registry.mjs';

/** Local-only configuration. Remote project URLs and production origins fail closed. */
export function localMockConfig(get) {
  try {
    if (get('AI_BACKEND_MODE') !== 'local-mock') return null;
    const url = new URL(get('SUPABASE_URL'));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash
      || !['localhost', '127.0.0.1', '[::1]', 'kong', 'host.docker.internal'].includes(url.hostname)) return null;
    const publishableKey = get('SUPABASE_ANON_KEY');
    const allowedOrigins = (get('AI_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!publishableKey || !allowedOrigins.length || allowedOrigins.some(value => {
      const origin = new URL(value);
      return origin.origin !== value || !['http:', 'https:'].includes(origin.protocol)
        || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    })) return null;
    return { url: url.href.replace(/\/$/, ''), publishableKey, allowedOrigins };
  } catch { return null; }
}

/** Ephemeral per-isolate mock store. NEVER a production quota or durable ledger. */
export function createLocalMockStore({ maxEntries = 1000 } = {}) {
  const entries = new Map();
  return {
    async reserve({ userId, idempotencyKey, fingerprint, now, policy, reservedUsd }) {
      // Keep a bounded 48h replay window. In-flight entries are never pruned here.
      for (const [id, row] of entries) if (row.response && now - row.at > 48 * 3600000) entries.delete(id);
      const rows = [...entries.values()];
      const existing = rows.find(row => row.userId === userId && row.key === idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint || !existing.response) return { status: 'conflict' };
        return { status: 'replay', response: structuredClone(existing.response) };
      }
      const day = Math.floor(now / 86400000);
      const daily = rows.filter(row => row.day === day);
      const mine = rows.filter(row => row.userId === userId);
      if (rows.length >= maxEntries || mine.filter(row => now - row.at < 60000).length >= policy.requestsPerMinute
        || mine.filter(row => row.day === day).length >= policy.requestsPerDay
        || mine.filter(row => !row.response).length >= policy.maxConcurrent
        || daily.filter(row => row.userId === userId).reduce((sum, row) => sum + row.chargedUsd, 0) + reservedUsd > policy.userDailyUsd
        || daily.reduce((sum, row) => sum + row.chargedUsd, 0) + reservedUsd > policy.globalDailyUsd) return { status: 'limited' };
      const reservationId = globalThis.crypto.randomUUID();
      entries.set(reservationId, { userId, key: idempotencyKey, fingerprint, at: now, day, chargedUsd: reservedUsd, response: null });
      return { status: 'reserved', reservationId };
    },
    async settle(id, { response, actualUsd }) {
      const row = entries.get(id);
      if (!row) throw new Error('reservation_unavailable');
      row.response = structuredClone(response);
      if (actualUsd !== null) row.chargedUsd = Math.max(actualUsd, 0);
    },
  };
}

export function createLocalMockGateway() {
  const registry = createModelRegistry([{ provider: 'meta', modelId: 'local-meta-mock-v1', mode: 'mock', verifiedAt: null,
    verificationSource: null, tasks: ['practice-feedback', 'adaptive-exercises', 'teacher-chat', 'weekly-report', 'score-screen'], maxInputChars: 262144,
    maxOutputTokens: 800, inputUsdPerMillion: 0, outputUsdPerMillion: 0 }]);
  const adapter = { provider: 'meta', mode: 'mock', async generate({ task, locale, evidenceSummary, conversation }) {
    const tr = locale === 'tr';
    const usage = { inputTokens: 0, outputTokens: 0 };
    if (task === 'teacher-chat') {
      const ask = ['purpose', 'instrument', 'level', 'weeklyMinutes', 'interests'].find(field => conversation.profile?.[field] === undefined) ?? null;
      return { output: { reply: tr ? 'Bu bir mock yanıttır; gerçek AI kullanılmadı.' : 'This is a mock reply; no live AI was used.',
        ask, profileUpdates: null, suggestions: [{ kind: 'studio', studio: 'reading', label: tr ? 'Nota okumaya başla' : 'Start note reading' }] }, usage, finishReason: 'stop' };
    }
    if (task === 'weekly-report') {
      return { output: { headline: tr ? 'Mock haftalık rapor' : 'Mock weekly report',
        narrative: tr ? 'Bu bir mock yanıttır; sayılar uygulamanın kendi ölçümleridir.' : 'This is a mock response; the numbers are the app\'s own measurements.',
        highlights: [], nextWeek: [{ kind: 'focus-drill', notes: ['g4', 'a4'], repetitions: 3, label: tr ? 'Sol ve La' : 'G and A' }] }, usage, finishReason: 'stop' };
    }
    if (task === 'score-screen') {
      // Deterministic: the mock never looks at the image.
      return { output: { verdict: 'score', inappropriate: false, category: 'none', handwriting: 'none',
        notes: tr ? 'Bu bir mock yanıttır; görsel incelenmedi.' : 'This is a mock reply; the image was not inspected.' }, usage, finishReason: 'stop' };
    }
    const context = evidenceSummary.contexts.find(item => item.recentAttempts >= 3);
    return { output: {
      summary: locale === 'tr' ? 'Bu bir mock yanıttır; gerçek AI analizi yapılmadı.' : 'This is a mock response; no live AI analysis was performed.',
      observations: [], exercises: context ? [{ id: 'context-review', contextRef: context.id, repetitions: 3 }] : [],
      limitations: ['mock_not_live_inference'],
    }, usage: { inputTokens: 0, outputTokens: 0 }, finishReason: 'stop' };
  } };
  return createAIGateway({ registry, adapters: [adapter], store: createLocalMockStore() });
}