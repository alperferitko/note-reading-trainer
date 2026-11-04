import { AIError } from './contracts.mjs';

const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * The only idempotency key the gateway accepts for a score screen: `screen-` and the first 40 hex
 * characters of the SHA-256 of the base64 data string. The same image always gives the same key, so
 * screening it again replays the stored verdict instead of paying for a second one.
 */
export async function screenKey(data) {
  if (typeof data !== 'string' || !data) throw new AIError('invalid_request');
  return `screen-${hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))).slice(0, 40)}`;
}
