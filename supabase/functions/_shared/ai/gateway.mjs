import { AIError } from './contracts.mjs';
import { buildEvidenceSummary, deterministicFeedback } from './evidence-summary.mjs';
import { createModelRegistry } from './model-registry.mjs';
import { TOKEN_TEMPLATE_MARGIN, createUsagePolicy, usageCost } from './usage-policy.mjs';
import { validateProviderResult, validateRequest, validateTaskOutput } from './validation.mjs';
import { isStagingAuthorization } from './staging-config.mjs';
import { weeklyReportKey } from './weekly-key.mjs';
import { screenKey } from './screen-key.mjs';
import { SCREEN_LIMITS, screenImageTokens } from './catalog.mjs';

const LIMIT_CODES = Object.freeze({ minute: 'rate_limited', day: 'quota_exceeded', trial: 'trial_quota_exceeded', global: 'service_busy' });
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
const fingerprint = async request => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(request)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};
/** Only what each task's prompt needs; the user id, keys and raw records never reach an adapter. */
function adapterRequest(request, summary, modelId, maxOutputTokens) {
  const base = { task: request.task, locale: request.locale, modelId, maxOutputTokens };
  if (request.task === 'teacher-chat') {
    return { ...base, evidenceSummary: summary ? structuredClone(summary) : null,
      conversation: { messages: structuredClone(request.messages), profile: structuredClone(request.profile) } };
  }
  if (request.task === 'weekly-report') {
    return { ...base, evidenceSummary: null,
      report: { timezone: request.timezone, period: { ...request.period }, metrics: structuredClone(request.metrics) } };
  }
  if (request.task === 'score-screen') {
    return { ...base, evidenceSummary: null, screen: { image: { ...request.image }, pages: request.pages } };
  }
  return { ...base, evidenceSummary: structuredClone(summary) };
}
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

/**
 * auth is a TRUSTED, previously verified context,
 * not a JWT validator and never a substitute for endpoint authentication.
 * Live transport requires branded staging authorization AND durable repository.
 */
export function createAIGateway({ registry = createModelRegistry(), adapters = [], store, stagingAuthorization = null, policy: suppliedPolicy = {}, clock = Date.now, logger = () => {} } = {}) {
  const policy = createUsagePolicy(suppliedPolicy);
  const transports = [...adapters];
  const log = event => { try { logger(Object.freeze(event)); } catch { /* Logging cannot affect learning. */ } };

  return Object.freeze({
    async execute(auth, input, context) {
      const requestId = identifier(context?.requestId) ? context.requestId : 'invalid-request-id';
      let reservationId = null;
      let actualUsd = null;
      let measuredUsage = null;
      let failureClass = null;
      let task = null;
      const started = clock();
      const errorResponse = error => ({ schemaVersion: '1', requestId, error: { code: error.code, status: error.status, retryable: error.retryable } });
      try {
        if (auth?.authenticated !== true || !identifier(auth.userId)) throw new AIError('authentication_required', 401);
        if (!identifier(context?.requestId) || !identifier(context?.idempotencyKey)) throw new AIError('invalid_request');
        const request = validateRequest(input, started, policy.maxInputChars);
        ({ task } = request);
        const feedbackTask = task === 'practice-feedback' || task === 'adaptive-exercises';
        // Teacher chat may come without evidence; then the model is told there is no history at all.
        const summary = feedbackTask || request.evidence ? buildEvidenceSummary(request.evidence.records, started) : null;
        const baseline = reason => ({ schemaVersion: '1', requestId, mode: 'deterministic', evidenceSummary: summary,
          result: deterministicFeedback(summary, request.locale), provenance: null, usage: null, limitations: [...summary.limitations, reason] });
        if (feedbackTask && !summary.eligible) return baseline('insufficient_evidence');
        // One paid generation per period and set of numbers: any other key could buy a second one.
        if (task === 'weekly-report' && context.idempotencyKey !== await weeklyReportKey(request.period, request.metrics)) {
          throw new AIError('invalid_request');
        }
        // Same for a screened image: the same picture is judged, and paid for, once.
        if (task === 'score-screen' && context.idempotencyKey !== await screenKey(request.image.data)) throw new AIError('invalid_request');
        const model = registry.select(task, policy.providerOrder);
        if (!model) {
          if (feedbackTask) return baseline('ai_not_configured');
          throw new AIError('task_not_enabled', 403);
        }
        const live = model.mode === 'live';
        if (live && (!isStagingAuthorization(stagingAuthorization) || store?.kind !== 'postgres' || model.provider !== 'meta'
          || model.modelId !== stagingAuthorization.modelId)) throw new AIError('live_calls_disabled', 503);
        const adapter = transports.find(item => item.provider === model.provider && item.mode === model.mode);
        if (!adapter || typeof adapter.generate !== 'function') throw new AIError('provider_unavailable', 503, true);
        if (!store || typeof store.reserve !== 'function' || typeof store.settle !== 'function') throw new AIError('usage_store_unavailable', 503);
        const outputLimit = Math.min(policy.maxOutputTokens, model.maxOutputTokens, task === 'score-screen' ? SCREEN_LIMITS.maxOutputTokens : Infinity);
        if (task === 'score-screen') {
          // The image is not counted in the text bound, so it is priced here before anything is reserved
          // or sent: the text token bound, a conservative image estimate and the whole output budget at
          // the model's rates must fit the per-request reservation. Unknown prices are never free.
          const estimate = usageCost(model, { inputTokens: model.maxInputChars + TOKEN_TEMPLATE_MARGIN
            + screenImageTokens(request.image.width, request.image.height), outputTokens: outputLimit });
          if (estimate === null || estimate > policy.maxRequestUsd) throw new AIError('request_too_large', 413);
        }
        // Chat context is shrunk by the adapter (oldest turns, then evidence contexts) before sending.
        if (feedbackTask && JSON.stringify(summary).length > model.maxInputChars) throw new AIError('request_too_large', 413);
        const reservation = await store.reserve({ userId: auth.userId, idempotencyKey: context.idempotencyKey,
          fingerprint: await fingerprint(request), now: started, policy, reservedUsd: policy.maxRequestUsd });
        if (reservation.status === 'replay') return { ...structuredClone(reservation.response), requestId };
        if (reservation.status === 'conflict') throw new AIError('idempotency_conflict', 409);
        // The ledger says which limit was hit, so the learner is told the right thing (wait a minute,
        // come back tomorrow, the trial is over); anything unexpected stays a plain quota error.
        if (reservation.status === 'trial_ended') throw new AIError('trial_ended', 403);
        if (reservation.status !== 'reserved' || !identifier(reservation.reservationId)) {
          throw new AIError(LIMIT_CODES[reservation.scope] ?? 'quota_exceeded', 429, reservation.scope !== 'trial');
        }
        reservationId = reservation.reservationId;
        if (context?.signal?.aborted || (live && !isStagingAuthorization(stagingAuthorization))) {
          // Still nothing sent: the reservation is released at zero instead of staying uncertain.
          measuredUsage = { inputTokens: 0, outputTokens: 0 };
          actualUsd = 0;
          throw new AIError('provider_timeout', 504, true);
        }
        const controller = new AbortController();
        const cancel = () => controller.abort();
        context?.signal?.addEventListener('abort', cancel, { once: true });
        let timer;
        let generated;
        try {
          generated = await Promise.race([
            Promise.resolve().then(() => adapter.generate(freeze(adapterRequest(request, summary, model.modelId, outputLimit)), controller.signal)),
            new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AIError('provider_timeout', 504, true)); }, policy.timeoutMs); }),
          ]);
        } catch (error) {
          if (live && error instanceof AIError && error.billingUsage) {
            measuredUsage = error.billingUsage;
            actualUsd = usageCost(model, measuredUsage);
          }
          failureClass = error instanceof AIError && error.failureClass ? error.failureClass : 'uncertain';
          throw error;
        } finally { clearTimeout(timer); context?.signal?.removeEventListener('abort', cancel); }
        const providerResult = validateProviderResult(generated, { ...model, maxOutputTokens: outputLimit });
        measuredUsage = providerResult.usage;
        actualUsd = usageCost(model, measuredUsage);
        const result = validateTaskOutput(task, providerResult.output, summary);
        const cost = actualUsd;
        if (cost !== null && cost > policy.maxRequestUsd) throw new AIError('usage_limit_exceeded', 503);
        const limitations = [...(summary?.limitations ?? []), ...(task === 'teacher-chat' && !summary ? ['no_practice_history_supplied'] : []),
          ...(task === 'weekly-report' ? ['metrics_computed_by_app'] : []), ...(task === 'score-screen' ? ['judged_from_page_thumbnails'] : []),
          ...(!live ? ['mock_not_live_inference'] : [])];
        const response = { schemaVersion: '1', requestId, ...(feedbackTask ? {} : { task }), mode: live ? 'live' : 'mock',
          // The screened image is never echoed back or stored with the answer.
          ...(task === 'weekly-report' ? { timezone: request.timezone, period: request.period, metrics: request.metrics }
            : task === 'score-screen' ? { pages: request.pages } : { evidenceSummary: summary }),
          result, provenance: { provider: model.provider, modelId: model.modelId, analysisVersion: summary?.analysisVersion ?? null },
          usage: { ...providerResult.usage, estimatedUsd: cost }, limitations };
        await store.settle(reservationId, { response: structuredClone(response), actualUsd: cost, usage: measuredUsage });
        reservationId = null;
        // Sizes and codes only: never the image, its base64 or the model's notes.
        const screen = task === 'score-screen' ? { imageChars: request.image.data.length, width: request.image.width, height: request.image.height,
          pages: request.pages, verdict: result.verdict, inappropriate: result.inappropriate, category: result.category, handwriting: result.handwriting } : {};
        log({ requestId, task, provider: model.provider, mode: response.mode, durationMs: Math.max(0, clock() - started), inputTokens: providerResult.usage.inputTokens, outputTokens: providerResult.usage.outputTokens, estimatedUsd: cost, ...screen });
        return response;
      } catch (caught) {
        // Only internal allowlisted error codes may cross the boundary.
        const safeCodes = ['authentication_required', 'invalid_request', 'request_too_large', 'task_not_enabled', 'live_calls_disabled', 'provider_unavailable', 'usage_store_unavailable', 'idempotency_conflict', 'quota_exceeded', 'rate_limited', 'trial_quota_exceeded', 'trial_ended', 'service_busy', 'provider_timeout', 'invalid_model_response', 'usage_limit_exceeded'];
        const error = caught instanceof AIError && safeCodes.includes(caught.code) ? caught : new AIError('ai_unavailable', 503, true);
        const response = errorResponse(error);
        if (reservationId) {
          try { await store.settle(reservationId, { response: structuredClone(response), actualUsd, usage: measuredUsage }); }
          catch { /* Fail closed: reservation must remain charged until reconciled. */ }
        }
        log({ requestId, task, code: error.code, failureClass: reservationId ? (actualUsd === null ? 'uncertain' : failureClass ?? 'settled') : 'not_reserved', durationMs: Math.max(0, clock() - started) });
        return response;
      }
    },
  });
}