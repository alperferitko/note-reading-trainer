import { AIError } from './contracts.mjs';

export const DEFAULT_USAGE_POLICY = Object.freeze({
  liveEnabled: false, providerOrder: Object.freeze(['meta']),
  requestsPerMinute: 3, requestsPerDay: 20, maxConcurrent: 1,
  timeoutMs: 10000, maxInputChars: 262144, maxOutputTokens: 800,
  maxRequestUsd: 0.02, userDailyUsd: 0.20, globalDailyUsd: 2,
});

/**
 * Template margin of the input-token bound: the wire text is pure ASCII and a byte-level tokenizer
 * emits at most one token per byte, plus this reviewed margin (staging-config, score-screen guard).
 */
export const TOKEN_TEMPLATE_MARGIN = 4096;

export function createUsagePolicy(overrides = {}) {
  const policy = { ...DEFAULT_USAGE_POLICY, ...overrides };
  if (Object.keys(overrides).some(key => !Object.hasOwn(DEFAULT_USAGE_POLICY, key)) || policy.liveEnabled !== false
    || !Array.isArray(policy.providerOrder) || policy.providerOrder[0] !== 'meta'
    || policy.providerOrder.some(provider => !['meta', 'baseten'].includes(provider))
    || new Set(policy.providerOrder).size !== policy.providerOrder.length
    || !['requestsPerMinute', 'requestsPerDay', 'maxConcurrent', 'timeoutMs', 'maxInputChars', 'maxOutputTokens']
      .every(key => Number.isSafeInteger(policy[key]) && policy[key] > 0)
    || policy.timeoutMs > 20000
    || !['maxRequestUsd', 'userDailyUsd', 'globalDailyUsd'].every(key => Number.isFinite(policy[key]) && policy[key] >= 0)) {
    throw new AIError('invalid_usage_policy', 503);
  }
  return Object.freeze({ ...policy, providerOrder: Object.freeze([...policy.providerOrder]) });
}

/** Unknown price is unknown, never free. Mock models may explicitly use zero. */
export function usageCost(model, usage) {
  if (model.inputUsdPerMillion === null || model.outputUsdPerMillion === null
    || usage.inputTokens === null || usage.outputTokens === null) return null;
  return (usage.inputTokens * model.inputUsdPerMillion + usage.outputTokens * model.outputUsdPerMillion) / 1000000;
}