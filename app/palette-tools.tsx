"use client";
/* eslint-disable @next/next/no-img-element -- Relative public assets must work on both the custom domain and GitHub Pages subpath. */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DEFAULT_PALETTE, MODE_KEY, PALETTES, readMode, readPalette, writePalette } from "@/lib/palettes.mjs";

const EVENT = "notanota-palette";
type Locale = "tr" | "en";
type Mode = "system" | "light" | "dark";

/** The palette in use; follows the picker and other tabs. */
export function usePalette() {
  const [palette, setPalette] = useState<string>(DEFAULT_PALETTE);
  useEffect(() => {
    const sync = () => setPalette(readPalette());
    const timer = window.setTimeout(sync, 0);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.clearTimeout(timer); window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return palette;
}

export function applyPalette(id: string) {
  const value = writePalette(id);
  document.documentElement.dataset.palette = value;
  window.dispatchEvent(new Event(EVENT));
}

/** Light, dark or follow the system; independent of the palette. */
function useMode() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => { const timer = window.setTimeout(() => setMode(readMode() as Mode), 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = mode === "system" ? (media.matches ? "dark" : "light") : mode; };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);
  const choose = useCallback((next: Mode) => {
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* Storage is optional. */ }
  }, []);
  return [mode, choose] as const;
}

/** The original NotaNota mark in the palette's colours, inside a rounded square. */
export function BrandLogo({ palette, className = "" }: { palette: string; className?: string }) {
  return (
    <span className={`brand-logo ${className}`} aria-hidden="true">
      <img className="brand-logo-light" src={`./brand/notanota-${palette}.svg`} alt="" width={40} height={40} />
      <img className="brand-logo-dark" src={`./brand/notanota-${palette}-dark.svg`} alt="" width={40} height={40} />
    </span>
  );
}

/** Small original emblems for the colour themes; the Meta theme shows the Meta symbol. */
export function PaletteEmblem({ kind }: { kind: string }) {
  if (kind === "meta") return <img className="palette-emblem palette-emblem--meta" src="./brand/meta-symbol.svg" alt="" width={20} height={13} />;
  const paths: Record<string, ReactNode> = {
    note: <><ellipse cx="9" cy="16" rx="4" ry="3" transform="rotate(-20 9 16)" fill="currentColor" /><path d="M12.6 15V4.5l5 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
    leaf: <><path d="M5 18C5 9 11 4.5 19 5c.3 8-4.5 13-13 13Z" fill="currentColor" /><path d="M6 17c3-4 6-6.5 9-8" stroke="var(--surface)" strokeWidth="1.3" fill="none" strokeLinecap="round" /></>,
    star: <path d="M12 3.5l1.9 5.4 5.6.3-4.4 3.5 1.5 5.5L12 15l-4.6 3.2 1.5-5.5-4.4-3.5 5.6-.3Z" fill="currentColor" />,
    sun: <><circle cx="12" cy="12" r="4.2" fill="currentColor" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1="12" y1="3.2" x2="12" y2="5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />)}</>,
  };
  return <svg className="palette-emblem" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">{paths[kind]}</svg>;
}

/** A button with a panel: Escape and an outside click close it, focus returns to the button. */
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback((refocus = false) => { setOpen(false); if (refocus) button.current?.focus(); }, []);
  return { open, toggle, close, button, panel, id };
}

const TEXT = {
  tr: { theme: "Tema", colour: "Renk teması", mode: "Mod", modes: { system: "Sistem", light: "Açık", dark: "Koyu" }, sound: "Nota sesi", on: "Açık", off: "Kapalı", compare: "Temaları karşılaştır", language: "Dil" },
  en: { theme: "Theme", colour: "Colour theme", mode: "Mode", modes: { system: "System", light: "Light", dark: "Dark" }, sound: "Note sound", on: "On", off: "Off", compare: "Compare themes", language: "Language" },
} as const;

export function ThemeMenu({ locale, soundEnabled, onToggleSound, onCompare }: { locale: Locale; soundEnabled: boolean; onToggleSound: () => void; onCompare: () => void }) {
  const t = TEXT[locale];
  const palette = usePalette();
  const [mode, setMode] = useMode();
  const { open, toggle, close, button, panel, id } = useDropdown();
  const current = PALETTES.find((p) => p.id === palette) ?? PALETTES[0];
  return (
    <div className="nav-menu">
      <button type="button" className="nav-icon-button nav-theme-button" aria-label={t.theme} ref={button} aria-expanded={open} aria-controls={id} onClick={toggle}>
        <span className="palette-dot" aria-hidden="true"><PaletteEmblem kind={current.emblem} /></span>
        <span className="nav-theme-label" aria-hidden="true">{t.theme}</span>
      </button>
      {open && (
        <div className="nav-panel nav-panel--theme" id={id} ref={panel}>
          <fieldset className="theme-palettes">
            <legend>{t.colour}</legend>
            {PALETTES.map((item) => (
              <label key={item.id} className={palette === item.id ? "is-on" : ""}>
                <input type="radio" name="notanota-palette" value={item.id} checked={palette === item.id} onChange={() => applyPalette(item.id)} />
                <span className="theme-emblem" style={{ color: item.light.primary }}><PaletteEmblem kind={item.emblem} /></span>
                <span className="theme-name">{item.name[locale]}</span>
                <span className="theme-swatch" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${item.light.primary} 50%, ${item.dark.primary} 50%)` }} />
                {palette === item.id && <svg className="theme-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </label>
            ))}
          </fieldset>
          <fieldset className="theme-modes">
            <legend>{t.mode}</legend>
            <div className="segmented">
              {(["system", "light", "dark"] as Mode[]).map((m) => (
                <label key={m} className={mode === m ? "is-on" : ""}>
                  <input type="radio" name="notanota-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                  {t.modes[m]}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" role="switch" aria-checked={soundEnabled} className="theme-sound" onClick={onToggleSound}>
            <span>{t.sound}</span><b>{soundEnabled ? t.on : t.off}</b>
          </button>
          <button type="button" className="nav-panel-link" onClick={() => { close(); onCompare(); }}>{t.compare}</button>
        </div>
      )}
    </div>
  );
}

const LANGUAGES = [{ id: "tr", name: "Türkçe" }, { id: "en", name: "English" }] as const;

export function LanguageMenu({ locale, onChange }: { locale: Locale; onChange: (next: Locale) => void }) {
  const { open, toggle, close, button, panel, id } = useDropdown();
  return (
    <div className="nav-menu">
      <button type="button" className="nav-icon-button" ref={button} aria-expanded={open} aria-controls={id} onClick={toggle} aria-label={`${TEXT[locale].language}: ${LANGUAGES.find((l) => l.id === locale)!.name}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 12h17M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5c-2.6-2.6-3.6-5.4-3.6-8.5s1-5.9 3.6-8.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        <span className="nav-lang-code">{locale.toUpperCase()}</span>
      </button>
      {open && (
        <div className="nav-panel nav-panel--lang" id={id} ref={panel} role="group" aria-label={TEXT[locale].language}>
          {LANGUAGES.map((lang) => (
            <button key={lang.id} type="button" className={`nav-panel-item${locale === lang.id ? " is-on" : ""}`} aria-pressed={locale === lang.id} lang={lang.id}
              onClick={() => { onChange(lang.id); close(true); }}>{lang.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
