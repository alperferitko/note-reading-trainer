export const EMAIL_MAX_LENGTH = 254;

const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_PATTERN = /^[A-Z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

export function normalizeValidEmail(value) {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > EMAIL_MAX_LENGTH || /\s/.test(normalized)) return null;

  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf("@")) return null;

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  if (
    local.length > EMAIL_LOCAL_MAX_LENGTH
    || local.startsWith(".")
    || local.endsWith(".")
    || local.includes("..")
    || domain.length > 253
  ) return null;

  return EMAIL_PATTERN.test(normalized) ? normalized : null;
}
