import { AIError, SUPPORTED_TASKS } from './contracts.mjs';

/** No real model IDs or prices are guessed. An empty registry is safe by default. */
export function createModelRegistry(entries = []) {
  const seen = new Set();
  const models = entries.map(entry => {
    if (!entry || !['meta', 'baseten', 'claude'].includes(entry.provider)
      || !['mock', 'live'].includes(entry.mode) || typeof entry.modelId !== 'string' || !entry.modelId.trim()
      || !Array.isArray(entry.tasks) || !entry.tasks.length || !entry.tasks.every(task => SUPPORTED_TASKS.includes(task))
      || !Number.isSafeInteger(entry.maxInputChars) || entry.maxInputChars < 1
      || !Number.isSafeInteger(entry.maxOutputTokens) || entry.maxOutputTokens < 1
      || ![entry.inputUsdPerMillion, entry.outputUsdPerMillion].every(price => price === null || (Number.isFinite(price) && price >= 0))
      || (entry.mode === 'live' && (!Number.isFinite(Date.parse(entry.verifiedAt)) || typeof entry.verificationSource !== 'string' || !entry.verificationSource.trim()))) {
      throw new AIError('invalid_model_configuration', 503);
    }
    const key = `${entry.provider}:${entry.modelId}`;
    if (seen.has(key)) throw new AIError('invalid_model_configuration', 503);
    seen.add(key);
    return Object.freeze({ ...entry, tasks: Object.freeze([...entry.tasks]) });
  });
  return Object.freeze({
    select(task, providers) {
      for (const provider of providers) {
        const found = models.find(model => model.provider === provider && model.tasks.includes(task));
        if (found) return found;
      }
      return null;
    },
  });
}