import { DEFAULT_TASKS, SUPPORTED_TASKS } from './contracts.mjs';
import { TOKEN_TEMPLATE_MARGIN } from './usage-policy.mjs';

const approved = new WeakSet();
const ref = value => typeof value === 'string' && /^[a-z]{20}$/.test(value);

const DAY = 86400000;
/**
 * The two reviewed live targets. Staging: a 24-hour approval and a model check at most 7 days old,
 * origins from the staging list only. Production (the live site, with the free trial enforced by the
 * ledger): its own approval word, at most 62 days, origins from the production list only.
 */
const TARGETS = Object.freeze({
  staging: Object.freeze({ mode: 'staging-meta', approvalName: 'AI_STAGING_LIVE_APPROVAL', approval: 'APPROVED_BOUNDED_META_STAGING',
    expiresName: 'AI_STAGING_APPROVAL_EXPIRES_AT', maxApprovalMs: DAY, maxVerifiedAgeMs: 7 * DAY, tasksName: 'AI_STAGING_TASKS',
    projectRef: pins => pins.stagingProjectRef, origins: pins => pins.stagingOrigins, forbiddenOrigins: pins => pins.productionOrigins }),
  production: Object.freeze({ mode: 'production-meta', approvalName: 'AI_PRODUCTION_LIVE_APPROVAL', approval: 'APPROVED_BOUNDED_META_PRODUCTION',
    expiresName: 'AI_PRODUCTION_APPROVAL_EXPIRES_AT', maxApprovalMs: 62 * DAY, maxVerifiedAgeMs: 62 * DAY, tasksName: 'AI_PRODUCTION_TASKS',
    projectRef: pins => pins.productionProjectRef, origins: pins => pins.productionOrigins, forbiddenOrigins: pins => pins.stagingOrigins }),
});

/** Pin file must be reviewed before use. No remote/local heuristics can enable live. */
export function stagingConfig(get, pins, now = Date.now()) { return liveConfig(TARGETS.staging, get, pins, now); }

/** The live site's configuration; null unless every production secret and pin agrees. */
export function productionConfig(get, pins, now = Date.now()) { return liveConfig(TARGETS.production, get, pins, now); }

function liveConfig(target, get, pins, now) {
  try {
    const projectRef = target.projectRef(pins ?? {});
    if (get('AI_BACKEND_MODE') !== target.mode || get(target.approvalName) !== target.approval
      || !ref(pins?.stagingProjectRef) || !ref(pins?.productionProjectRef)
      || pins.stagingProjectRef === pins.productionProjectRef
      || get('AI_STAGING_PROJECT_REF') !== pins.stagingProjectRef
      || get('AI_PRODUCTION_PROJECT_REF') !== pins.productionProjectRef
      || get('SUPABASE_URL') !== `https://${projectRef}.supabase.co`
      || !get('DENO_DEPLOYMENT_ID')?.startsWith(`${projectRef}_`)) return null;
    const expiry = Date.parse(get(target.expiresName));
    const verified = Date.parse(get('META_MODEL_VERIFIED_AT'));
    if (!Number.isFinite(expiry) || expiry <= now || expiry > now + target.maxApprovalMs
      || !Number.isFinite(verified) || verified > now || now - verified > target.maxVerifiedAgeMs
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
    const maxInputTokens = maxInputChars + TOKEN_TEMPLATE_MARGIN;
    const maxOutputTokens = 800;
    const reservedUsd = Math.ceil((maxInputTokens * inputRate + maxOutputTokens * outputRate)) / 1000000;
    if (reservedUsd <= 0 || reservedUsd > 0.02) return null;
    // Tasks served live. Unset keeps the reviewed B4 pair; the chat, weekly report and score screen must be listed
    // explicitly. An unknown or repeated name disables the whole configuration (fail closed).
    const tasks = get(target.tasksName) ? get(target.tasksName).split(',').map(value => value.trim()) : [...DEFAULT_TASKS];
    if (!tasks.length || !tasks.every(task => SUPPORTED_TASKS.includes(task)) || new Set(tasks).size !== tasks.length) return null;
    const allowedOrigins = (get('AI_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean);
    const origins = target.origins(pins);
    const forbidden = target.forbiddenOrigins(pins);
    if (!allowedOrigins.length || !Array.isArray(pins.stagingOrigins) || !pins.stagingOrigins.length
      || !Array.isArray(pins.productionOrigins) || !pins.productionOrigins.length
      || allowedOrigins.some(value => {
        const url = new URL(value);
        return url.origin !== value || url.protocol !== 'https:' || !origins.includes(value) || forbidden.includes(value);
      })) return null;
    const config = Object.freeze({ target: target.mode, projectRef, url: get('SUPABASE_URL'),
      publishableKey, serviceKey, apiKey, modelId, responseFormat, inputRate, outputRate,
      verifiedAt: new Date(verified).toISOString(), expiresAt: expiry,
      maxInputChars, maxInputTokens, maxOutputTokens, reservedUsd, tasks: Object.freeze(tasks),
      allowedOrigins: Object.freeze(allowedOrigins) });
    approved.add(config);
    return config;
  } catch { return null; }
}

/** True for a configuration built above (staging or production) whose approval has not expired. */
export function isStagingAuthorization(config, now = Date.now()) {
  return approved.has(config) && config.expiresAt > now;
}