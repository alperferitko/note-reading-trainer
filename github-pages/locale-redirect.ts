// Imported first by main.tsx so the redirect happens before the app renders.
import { LOCALE_CHOICE_KEY, localeRedirect } from "../lib/locale-default.mjs";

try {
  const target = localeRedirect({
    pathname: window.location.pathname,
    root: new URL(document.baseURI).pathname,
    search: window.location.search,
    hash: window.location.hash,
    languages: navigator.languages?.length ? navigator.languages : [navigator.language],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    choice: localStorage.getItem(LOCALE_CHOICE_KEY),
    userAgent: navigator.userAgent,
  });
  if (target) window.location.replace(target);
} catch { /* Without storage or Intl the Turkish page simply stays. */ }
