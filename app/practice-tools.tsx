"use client";
import { useEffect, useRef, useState } from "react";
export type Clef = "treble" | "bass";
export type AccidentalMode = "natural" | "sharp" | "flat" | "mixed";
export function NotationOptions({ locale, clef, setClef, accidentals, setAccidentals }: { locale: "tr" | "en"; clef: Clef; setClef: (value: Clef) => void; accidentals: AccidentalMode; setAccidentals: (value: AccidentalMode) => void }) {
  const tr = locale === "tr";
  return <div className="notation-options"><label>{tr ? "Anahtar" : "Clef"}<select value={clef} onChange={e => setClef(e.target.value as Clef)}><option value="treble">{tr ? "Sol anahtarı" : "Treble clef"}</option><option value="bass">{tr ? "Fa anahtarı" : "Bass clef"}</option></select></label><label>{tr ? "Nota türleri" : "Note types"}<select value={accidentals} onChange={e => setAccidentals(e.target.value as AccidentalMode)}><option value="natural">{tr ? "Doğal" : "Natural"}</option><option value="sharp">{tr ? "Diyez ♯" : "Sharps ♯"}</option><option value="flat">{tr ? "Bemol ♭" : "Flats ♭"}</option><option value="mixed">{tr ? "Karışık ♮ ♯ ♭" : "Mixed ♮ ♯ ♭"}</option></select></label></div>;
}
export function usePracticeNavigation({ active, feedback, choices, onAnswer, onNext }: { active: boolean; feedback: boolean; choices: string[]; onAnswer: (value: string) => void; onNext: () => void }) {
  const callbacks = useRef({ onAnswer, onNext, choices });
  const [automatic, setAutomatic] = useState(false);
  useEffect(() => { callbacks.current = { onAnswer, onNext, choices }; });
  useEffect(() => {
    if (!active) return;
    function key(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('[role="dialog"]')) return;
      if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable)) return;
      if (feedback && event.key === 'Enter') { event.preventDefault(); callbacks.current.onNext(); return; }
      const index = Number(event.key) - 1;
      if (!feedback && /^[1-7]$/.test(event.key) && callbacks.current.choices[index]) { event.preventDefault(); callbacks.current.onAnswer(callbacks.current.choices[index]); }
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [active, feedback]);
  useEffect(() => {
    if (!active || !feedback || !automatic) return;
    const timer = window.setTimeout(() => { if (!document.hidden) callbacks.current.onNext(); }, 1800);
    return () => window.clearTimeout(timer);
  }, [active, feedback, automatic]);
  return { automatic, setAutomatic };
}
export function NavigationOptions({ locale, automatic, setAutomatic, numbers = true }: { locale: "tr" | "en"; automatic: boolean; setAutomatic: (value: boolean) => void; numbers?: boolean }) {
  return <div className="practice-navigation"><label><input type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)} />{locale === 'tr' ? 'Cevaptan 1,8 sn sonra otomatik ilerle' : 'Advance automatically after 1.8 seconds'}</label><small>{numbers ? (locale === 'tr' ? '1–7: notayı seç · ' : '1–7: choose a note · ') : ''}{locale === 'tr' ? 'Enter: sonraki' : 'Enter: next'}</small></div>;
}
