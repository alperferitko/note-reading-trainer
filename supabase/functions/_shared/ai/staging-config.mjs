import { DEFAULT_TASKS, SUPPORTED_TASKS } from './contracts.mjs';

const approved = new WeakSet();
const ref = value => typeof value === 'string' && /^[a-z]{20}$/.test(value);

/** Pin file must be reviewed before use. No remote/local heuristics can enable live. */
export function stagingConfig(get, pins, now = Date.now()) {
  try {
    if (get('AI_BACKEND_MODE') !== 'staging-meta' || get('AI_STAGING_LIVE_APPROVAL') !== 'APPROVED_BOUNDED_META_STAGING'
      || !ref(pins?.stagingProjectRef) || !ref(pins?.productionProjectRef)
      || pins.stagingProjectRef === pins.productionProjectRef
      || get('AI_STAGING_PROJECT_REF') !== pins.stagingProjectRef
      || get('AI_PRODUCTION_PROJECT_REF') !== pins.productionProjectRef
      || get('SUPABASE_URL') !== `https://${pins.stagingProjectRef}.supabase.co`
      || !get('DENO_DEPLOYMENT_ID')?.startsWith(`${pins.stagingProjectRef}_`)) return null;
    const expiry = Date.parse(get('AI_STAGING_APPROVAL_EXPIRES_AT'));
    const verified = Date.parse(get('META_MODEL_VERIFIED_AT'));
    if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 24 * 3600000
      || !Number.isFinite(verified) || verified > now || now - verified > 7 * 86400000
      || get('META_MODEL_VERIFICATION_SOURCE') !== 'https://api.meta.ai/v1/models'
      || get('META_TOKEN_BOUND_VERIFIED') !== 'true') return null;
    const modelId = get('META_MODEL_ID');
    const apiKey = get('META_API_KEY');
    const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
    const publishableKey = get('SUPABASE_ANON_KEY');
    const inputRate = Number(get('META_INPUT_USD_PER_MILLION'));
    const outputRate = Number(get('META_OUTPUT_USD_PER_MILLION'));
    // Default is the strict json_schema format; json_object only after the model is shown not to
    // support json_schema. Either way the answer is validated against schema v1 and the evidence.
    const responseFormat = get('META_RESPONSE_FORMAT') || 'json_schema';
    if (!['json_schema', 'json_object'].includes(responseFormat)) return null;
    if (!modelId || modelId.length > 200 || !apiKey || !serviceKey || !publishableKey
      || !get('META_INPUT_USD_PER_MILLION') || !get('META_OUTPUT_USD_PER_MILLION')
      || ![inputRate, outputRate].every(value => Number.isFinite(value) && value > 0)) return null;
    // The wire body is pure ASCII (providers/meta.mjs asciiJson), so characters equal UTF-8 bytes; a
    // byte-level tokenizer emits at most one token per byte, plus a reviewed template margin.
    // META_TOKEN_BOUND_VERIFIED attests that this bound holds for the configured model.
    const maxInputChars = 8000;
    const maxInputTokens = maxInputChars + 4096;
    const maxOutputTokens = 800;
    const reservedUsd = Math.ceil((maxInputTokens * inputRate + maxOutputTokens * outputRate)) / 1000000;
    if (reservedUsd <= 0 || reservedUsd > 0.02) return null;
    // Tasks served live. Unset keeps the reviewed B4 pair; the chat and weekly report must be listed
    // explicitly. An unknown or repeated name disables the whole configuration (fail closed).
    const tasks = get('AI_STAGING_TASKS') ? get('AI_STAGING_TASKS').split(',').map(value => value.trim()) : [...DEFAULT_TASKS];
    if (!tasks.length || !tasks.every(task => SUPPORTED_TASKS.includes(task)) || new Set(tasks).size !== tasks.length) return null;
    const allowedOrigins = (get('AI_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!allowedOrigins.length || !Array.isArray(pins.stagingOrigins) || !pins.stagingOrigins.length
      || !Array.isArray(pins.productionOrigins) || !pins.productionOrigins.length
      || allowedOrigins.some(value => {
        const url = new URL(value);
        return url.origin !== value || url.protocol !== 'https:' || !pins.stagingOrigins.includes(value)
          || pins.productionOrigins.includes(value);
      })) return null;
    const config = Object.freeze({ projectRef: pins.stagingProjectRef, url: get('SUPABASE_URL'),
      publishableKey, serviceKey, apiKey, modelId, responseFormat, inputRate, outputRate,
      verifiedAt: new Date(verified).toISOString(), expiresAt: expiry,
      maxInputChars, maxInputTokens, maxOutputTokens, reservedUsd, tasks: Object.freeze(tasks),
      allowedOrigins: Object.freeze(allowedOrigins) });
    approved.add(config);
    return config;
  } catch { return null; }
}

export function isStagingAuthorization(config, now = Date.now()) {
  return approved.has(config) && config.expiresAt > now;
}