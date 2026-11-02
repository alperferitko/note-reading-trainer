// The four colour models of NotaNota. One layout, one set of components; only these tokens change.
// scripts/build-palettes.mjs writes app/palettes.css and the logo variants from this file.

export const PALETTE_KEY = 'notanota-palette-v1';
export const DEFAULT_PALETTE = 'bordo';

const tokens = (light, dark) => ({ light, dark });

export const PALETTES = [
  {
    id: 'bordo',
    emblem: 'note',
    name: { tr: 'Bordo / Krem', en: 'Burgundy / Cream' },
    purpose: { tr: 'Logonun bordosu; varsayılan', en: 'The logo burgundy; default' },
    ...tokens(
      { background: '#faf6f1', deep: '#f1e9df', surface: '#fffdfa', elevated: '#ffffff', foreground: '#2b2326', muted: '#67595b', primary: '#8b2435', hover: '#741c2b', active: '#5f1623', onPrimary: '#ffffff', soft: '#f4e2e1', border: '#e7dbd3', strong: '#d3c3b8', support: '#b9898d' },
      { background: '#1c1517', deep: '#241b1e', surface: '#2a2023', elevated: '#33272a', foreground: '#f2e9e7', muted: '#bfaeae', primary: '#e3929d', hover: '#eca6af', active: '#d47b88', onPrimary: '#2a0d13', soft: '#43272c', border: '#3d2e31', strong: '#574347', support: '#8f6a6f' },
    ),
  },
  {
    id: 'petrol',
    emblem: 'leaf',
    name: { tr: 'Petrol / Adaçayı', en: 'Petrol / Sage' },
    purpose: { tr: 'Sakin ve odaklı', en: 'Calm and focused' },
    ...tokens(
      { background: '#f3f6f2', deep: '#e4ebe3', surface: '#fffffb', elevated: '#ffffff', foreground: '#1b2a2b', muted: '#536664', primary: '#0e5561', hover: '#0a4650', active: '#083940', onPrimary: '#ffffff', soft: '#dbe8e4', border: '#d9e3dc', strong: '#bfcfc6', support: '#b98a2c' },
      { background: '#111b1c', deep: '#172426', surface: '#1b2a2c', elevated: '#223436', foreground: '#e6efed', muted: '#a3b6b3', primary: '#5fb7bf', hover: '#77c4cb', active: '#48a1a9', onPrimary: '#06191b', soft: '#173a3d', border: '#29393b', strong: '#3b5153', support: '#c99a3e' },
    ),
  },
  {
    id: 'indigo',
    emblem: 'star',
    name: { tr: 'İndigo / Lavanta', en: 'Indigo / Lavender' },
    purpose: { tr: 'Modern ve yaratıcı', en: 'Modern and creative' },
    ...tokens(
      { background: '#f6f5fb', deep: '#eae8f5', surface: '#ffffff', elevated: '#ffffff', foreground: '#1e1c35', muted: '#5b5875', primary: '#3d3b94', hover: '#33317d', active: '#29286a', onPrimary: '#ffffff', soft: '#e5e3f6', border: '#e1def0', strong: '#c9c5e0', support: '#9b97d6' },
      { background: '#15142a', deep: '#1c1b35', surface: '#222140', elevated: '#2a284c', foreground: '#ebeaf7', muted: '#b0aed0', primary: '#a9a6f2', hover: '#bcbaf6', active: '#9592e6', onPrimary: '#15143a', soft: '#2f2d5c', border: '#2f2d4f', strong: '#45436b', support: '#6f6bb8' },
    ),
  },
  {
    id: 'kiremit',
    emblem: 'sun',
    name: { tr: 'Kiremit / Kum', en: 'Terracotta / Sand' },
    purpose: { tr: 'Samimi ve sanatsal', en: 'Warm and artistic' },
    ...tokens(
      { background: '#f8f1e8', deep: '#eee2d2', surface: '#fffaf3', elevated: '#ffffff', foreground: '#3a2a21', muted: '#6c5b4f', primary: '#a3412a', hover: '#8b3522', active: '#742c1c', onPrimary: '#ffffff', soft: '#f4dfd3', border: '#e8d9c6', strong: '#d6c2aa', support: '#c99a6b' },
      { background: '#1d1612', deep: '#261d18', surface: '#2c221c', elevated: '#352921', foreground: '#f3e8df', muted: '#c3ae9f', primary: '#ec9a7c', hover: '#f2ae95', active: '#e08563', onPrimary: '#2e120a', soft: '#4a2a1e', border: '#3e3027', strong: '#574538', support: '#9a6f50' },
    ),
  },
  {
    id: 'meta',
    name: { tr: 'Meta', en: 'Meta' },
    purpose: { tr: 'Meta mavisi ve sakin nötrler', en: 'Meta blue with calm neutrals' },
    emblem: 'meta',
    ...tokens(
      { background: '#f4f6f9', deep: '#e8edf3', surface: '#ffffff', elevated: '#ffffff', foreground: '#1c2b33', muted: '#4f5f69', primary: '#0064e0', hover: '#0055c2', active: '#0048a5', onPrimary: '#ffffff', soft: '#e3eefc', border: '#dce3ea', strong: '#c3ced8', support: '#0082fb' },
      { background: '#0e1418', deep: '#141c22', surface: '#18232a', elevated: '#1f2c34', foreground: '#e8eef2', muted: '#a3b1ba', primary: '#4f9dff', hover: '#6aadff', active: '#3a8cf5', onPrimary: '#06182e', soft: '#132f4f', border: '#24323b', strong: '#36474f', support: '#0082fb' },
    ),
  },
];

export const PALETTE_IDS = PALETTES.map((palette) => palette.id);

export function validPalette(id) {
  return PALETTE_IDS.includes(id) ? id : DEFAULT_PALETTE;
}

export function readPalette(storage = globalThis.localStorage) {
  try { return validPalette(storage?.getItem(PALETTE_KEY)); } catch { return DEFAULT_PALETTE; }
}

export function writePalette(id, storage = globalThis.localStorage) {
  const value = validPalette(id);
  try { storage?.setItem(PALETTE_KEY, value); } catch { /* Storage is optional. */ }
  return value;
}

/** Relative luminance and WCAG contrast, used by the tests and the design review page. */
function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const MODE_KEY = 'notanota-theme';
export const MODES = ['system', 'light', 'dark'];

export function readMode(storage = globalThis.localStorage) {
  try { const v = storage?.getItem(MODE_KEY); return MODES.includes(v) ? v : 'system'; } catch { return 'system'; }
}

/** The inline script that applies the saved palette and light/dark mode before the first paint. */
export const PALETTE_BOOT_SCRIPT = `try{var d=document.documentElement,p=localStorage.getItem(${JSON.stringify(PALETTE_KEY)});d.dataset.palette=${JSON.stringify(PALETTE_IDS)}.indexOf(p)>-1?p:${JSON.stringify(DEFAULT_PALETTE)};var m=localStorage.getItem(${JSON.stringify('notanota-theme')});d.dataset.theme=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"}catch(e){}`;
