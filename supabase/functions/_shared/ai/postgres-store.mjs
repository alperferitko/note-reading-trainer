import { AIError } from './contracts.mjs';

export function usdToMicro(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1000) throw new AIError('usage_store_unavailable', 503);
  return Math.ceil(value * 1000000);
}

/** Backend client has service role; user JWT is never attached to this client. */
export function createPostgresUsageStore({ client, projectRef, modelId }) {
  const owners = new Map();
  const rpc = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error || !data) throw new AIError('usage_store_unavailable', 503);
    return data;
  };
  return Object.freeze({ kind: 'postgres',
    async reserve({ userId, idempotencyKey, fingerprint, reservedUsd }) {
      const result = await rpc('ai_usage_reserve', { p_project_ref: projectRef, p_user_id: userId,
        p_idempotency_key: idempotencyKey, p_fingerprint: fingerprint,
        p_reserved_micro: usdToMicro(reservedUsd), p_model_id: modelId });
      if (!['reserved', 'replay', 'conflict', 'limited', 'trial_ended'].includes(result.status)
        || (result.status === 'replay' && (!result.response || result.response.schemaVersion !== '1'))
        || (result.status === 'reserved' && !/^[a-f0-9-]{36}$/.test(result.reservationId))) throw new AIError('usage_store_unavailable', 503);
      if (result.status === 'reserved') owners.set(result.reservationId, userId);
      return result;
    },
    async settle(id, { response, actualUsd, usage = null }) {
      const userId = owners.get(id);
      if (!userId) throw new AIError('usage_store_unavailable', 503);
      await rpc('ai_usage_settle', { p_project_ref: projectRef, p_user_id: userId, p_id: id,
        p_response: response, p_actual_micro: actualUsd === null ? null : usdToMicro(actualUsd),
        p_input_tokens: usage?.inputTokens ?? null, p_output_tokens: usage?.outputTokens ?? null });
      owners.delete(id);
    },
  });
}