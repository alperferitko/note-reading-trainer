import { createAIGateway } from './gateway.mjs';
import { createModelRegistry } from './model-registry.mjs';
import { createPostgresUsageStore } from './postgres-store.mjs';
import { createMetaAdapter } from './providers/meta.mjs';
import { isStagingAuthorization } from './staging-config.mjs';

export function createStagingGateway({ config, createClient, transport }) {
  if (!isStagingAuthorization(config)) throw new Error('staging_not_authorized');
  const client = createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const store = createPostgresUsageStore({ client, projectRef: config.projectRef, modelId: config.modelId });
  const registry = createModelRegistry([{ provider: 'meta', modelId: config.modelId, mode: 'live',
    verifiedAt: config.verifiedAt, verificationSource: 'https://api.meta.ai/v1/models',
    tasks: ['practice-feedback', 'adaptive-exercises'], maxInputChars: config.maxInputChars,
    maxOutputTokens: config.maxOutputTokens, inputUsdPerMillion: config.inputRate, outputUsdPerMillion: config.outputRate }]);
  const adapter = createMetaAdapter({ modelId: config.modelId, apiKey: config.apiKey, transport, responseFormat: config.responseFormat,
    maxInputChars: config.maxInputChars, maxOutputTokens: config.maxOutputTokens });
  return createAIGateway({ registry, adapters: [adapter], store, stagingAuthorization: config,
    policy: { maxRequestUsd: config.reservedUsd }, });
}