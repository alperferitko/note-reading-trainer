// Static hosting has no server to read the visitor's country, so the browser decides: a visitor
// whose languages and time zone are both non-Turkish opens the English site. An explicit choice
// (Settings or the ?lang= parameter) always wins, and crawlers are never redirected.
export const LOCALE_CHOICE_KEY = 'notanota-locale-choice';

/** True when the browser looks like someone in Turkey or a Turkish speaker. */
export function looksTurkish({ languages = [], timeZone = '' } = {}) {
  return timeZone === 'Europe/Istanbul' || languages.some(lang => /^tr\b/i.test(String(lang)));
}

/**
 * Where a first page load should go, or null to stay.
 * @param {{pathname:string, root:string, search?:string, hash?:string, languages?:readonly string[], timeZone?:string, choice?:string|null, userAgent?:string}} visit
 */
export function localeRedirect({ pathname, root, search = '', hash = '', languages = [], timeZone = '', choice = null, userAgent = '' }) {
  if (/bot|crawl|spider|slurp|lighthouse|headless/i.test(userAgent)) return null;
  if (/[?&]lang=(tr|en)\b/.test(search)) return null;
  if (!pathname.startsWith(root)) return null;
  const relative = pathname.slice(root.length);
  if (relative === 'en' || relative.startsWith('en/')) return null;
  const wantsEnglish = choice === 'en' || (choice !== 'tr' && !looksTurkish({ languages, timeZone }));
  return wantsEnglish ? `${root}en/${relative}${search}${hash}` : null;
}
