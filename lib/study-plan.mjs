// "Add to my plan": a short, local list of suggested practice items, kept per account on this device.

export const PLAN_KEY = 'notanota-study-plan-v1';
export const PLAN_LIMIT = 12;

export function planKey(owner) {
  return `${PLAN_KEY}:${owner || 'guest'}`;
}

function valid(item) {
  return item && typeof item.id === 'string' && item.id.length <= 80 && typeof item.title === 'string' && item.title.length <= 160
    && typeof item.addedAt === 'string' && !Number.isNaN(Date.parse(item.addedAt))
    && (item.action === undefined || (typeof item.action === 'object' && item.action !== null));
}

export function readPlan(owner, storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(planKey(owner)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(valid).slice(0, PLAN_LIMIT) : [];
  } catch { return []; }
}

function write(owner, items, storage) {
  try { storage?.setItem(planKey(owner), JSON.stringify(items)); } catch { /* Storage is optional. */ }
  return items;
}

/** Adds an item once; adding the same id again keeps the first entry. Newest first. */
export function addToPlan(owner, { id, title, action }, { storage = globalThis.localStorage, now = new Date() } = {}) {
  const items = readPlan(owner, storage);
  if (items.some((item) => item.id === id)) return items;
  const entry = { id: String(id).slice(0, 80), title: String(title).slice(0, 160), addedAt: now.toISOString(), ...(action ? { action } : {}) };
  return write(owner, [entry, ...items].slice(0, PLAN_LIMIT), storage);
}

export function removeFromPlan(owner, id, storage = globalThis.localStorage) {
  return write(owner, readPlan(owner, storage).filter((item) => item.id !== id), storage);
}
