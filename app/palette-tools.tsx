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
export function useMode() {
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

/** The original N mark continued as "otaNota": one wordmark, coloured from CSS through a mask. */
export function BrandWordmark({ className = "" }: { className?: string }) {
  return <span className={`brand-wordmark ${className}`} aria-hidden="true" />;
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

/**
 * The navbar's theme picker: colour theme and light/dark, without leaving the page. A small menu that
 * closes with Escape or a click outside; the choices are radio groups, so the keyboard works, and they
 * are saved like the ones in Settings.
 */
export function NavThemeMenu({ locale, onSettings }: { locale: Locale; onSettings: () => void }) {
  const tr = locale === "tr";
  const palette = usePalette();
  const [mode, setMode] = useMode();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const modes: [Mode, string][] = tr ? [["light", "Açık"], ["dark", "Koyu"], ["system", "Sistem"]] : [["light", "Light"], ["dark", "Dark"], ["system", "System"]];
  return (
    <div className="nav-menu theme-menu" ref={box}>
      <button ref={button} type="button" className="nav-theme-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2-.9 2-1.9 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.9-1.7h1.9a3.7 3.7 0 0 0 3.7-3.8C20.5 6.9 16.7 3.5 12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="7.6" cy="11.2" r="1.2" fill="currentColor" /><circle cx="10.4" cy="7.4" r="1.2" fill="currentColor" /><circle cx="14.9" cy="7.6" r="1.2" fill="currentColor" />
        </svg>
        <span>{tr ? "Tema" : "Theme"}</span>
      </button>
      {open && (
        <div id={id} className="theme-menu-panel" role="group" aria-label={tr ? "Tema" : "Theme"}>
          <fieldset>
            <legend>{tr ? "Renk" : "Colour"}</legend>
            <div className="theme-menu-palettes">
              {PALETTES.map((item) => (
                <label key={item.id} className={palette === item.id ? "is-on" : ""}>
                  <input type="radio" name={`${id}-palette`} value={item.id} checked={palette === item.id} onChange={() => applyPalette(item.id)} />
                  <span className="theme-menu-swatch" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${item.light.primary} 50%, ${item.dark.primary} 50%)` }} />
                  <span>{item.name[locale]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{tr ? "Görünüm" : "Appearance"}</legend>
            <div className="theme-menu-modes">
              {modes.map(([value, label]) => (
                <label key={value} className={mode === value ? "is-on" : ""}>
                  <input type="radio" name={`${id}-mode`} value={value} checked={mode === value} onChange={() => setMode(value)} />{label}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className="theme-menu-more" onClick={() => { setOpen(false); onSettings(); }}>{tr ? "Tüm ayarlar" : "All settings"}</button>
        </div>
      )}
    </div>
  );
}
