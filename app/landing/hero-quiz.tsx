"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Staff, playMidi } from "./music";

type Locale = "tr" | "en";
type Phase = "show" | "ask" | "hint" | "right" | "reveal";
const NAMES = { tr: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"], en: ["C", "D", "E", "F", "G", "A", "B"] } as const;
const SEMI = [0, 2, 4, 5, 7, 9, 11];
// Treble-staff positions, E4 (bottom line) to F5 (top line), in a fixed order so server and browser agree.
const ROUND = [2, 4, 0, 5, 3, 7, 1, 6, 8];

const degreeOf = (position: number) => (position + 2) % 7;
const midiOf = (position: number) => 60 + 12 * Math.floor((position + 2) / 7) + SEMI[degreeOf(position)];

function placeText(position: number, locale: Locale) {
  if (position % 2 === 0) return locale === "tr" ? `alttan ${position / 2 + 1}. çizgi` : `line ${position / 2 + 1} from the bottom`;
  return locale === "tr" ? `alttan ${(position + 1) / 2}. aralık` : `space ${(position + 1) / 2} from the bottom`;
}

function landmark(position: number, locale: Locale) {
  const tr: Record<number, string> = { 0: "En alt çizgi mi.", 2: "Anahtarın kıvrımı bu çizgiyi sarar: sol.", 4: "Ortadaki çizgi si.", 8: "En üst çizgi fa." };
  const en: Record<number, string> = { 0: "The bottom line is E.", 2: "The clef's curl wraps this line: G.", 4: "The middle line is B.", 8: "The top line is F." };
  const near = [0, 2, 4, 8].reduce((best, p) => (Math.abs(p - position) < Math.abs(best - position) ? p : best), 2);
  const base = (locale === "tr" ? tr : en)[near];
  if (near === position) return base;
  const steps = position - near;
  return locale === "tr" ? `${base} Bu nota ondan ${Math.abs(steps)} adım ${steps > 0 ? "yukarıda" : "aşağıda"}.` : `${base} This note is ${Math.abs(steps)} step${Math.abs(steps) > 1 ? "s" : ""} ${steps > 0 ? "higher" : "lower"}.`;
}

const TEXT = {
  tr: {
    guess: "Tahmin et", question: "Bu nota hangisi?", back: "Önizlemeye dön", next: "Bir tane daha", studio: "Stüdyoya geç",
    right: (n: string) => `Doğru, bu ${n}.`, hint: (place: string, mark: string) => `Tekrar dene: nota ${place}da. ${mark}`, reveal: (n: string, place: string) => `Bu ${n}, ${place}da.`,
    listen: "Dinle", staff: "Sol anahtarlı porte üzerinde değişen tek bir nota", keys: "1–7 tuşları da çalışır. Bu deneme kaydedilmez.",
  },
  en: {
    guess: "Guess it", question: "Which note is this?", back: "Back to the preview", next: "One more", studio: "Go to the studio",
    right: (n: string) => `Right, this is ${n}.`, hint: (place: string, mark: string) => `Try again: the note is on ${place}. ${mark}`, reveal: (n: string, place: string) => `This is ${n}, on ${place}.`,
    listen: "Listen", staff: "A single changing note on a treble staff", keys: "Keys 1–7 work too. This try is not saved.",
  },
} as const;

/**
 * The first screen shows notes changing on a real staff, named as they pass. "Guess it" freezes the
 * current note and opens the answers; while answering the note never changes on its own.
 */
export function HeroQuiz({ locale, soundEnabled, onOpenStudio, compact = false }: { locale: Locale; soundEnabled: boolean; onOpenStudio: () => void; compact?: boolean }) {
  const t = TEXT[locale];
  const names = NAMES[locale];
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("show");
  const [misses, setMisses] = useState(0);
  const firstKey = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const position = ROUND[index % ROUND.length];
  const answer = degreeOf(position);
  const settled = phase === "right" || phase === "reveal";

  // The showcase advances by itself only while nobody is answering, the tab is visible and motion is allowed.
  useEffect(() => {
    if (phase !== "show" || compact) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => { if (!document.hidden) setIndex((i) => i + 1); }, 2200);
    return () => window.clearInterval(timer);
  }, [phase, compact]);
  useEffect(() => { if (phase === "ask") firstKey.current?.focus({ preventScroll: true }); if (settled) nextButton.current?.focus({ preventScroll: true }); }, [phase, settled]);

  function choose(i: number) {
    if (phase === "show" || settled) return;
    if (i === answer) { setPhase("right"); if (soundEnabled) playMidi(midiOf(position)); return; }
    if (misses === 0) { setMisses(1); setPhase("hint"); return; }
    setPhase("reveal");
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const digit = Number(event.key);
    if (phase !== "show" && digit >= 1 && digit <= 7 && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); choose(digit - 1); }
  }

  const status = phase === "right" ? t.right(names[answer]) : phase === "hint" ? t.hint(placeText(position, locale), landmark(position, locale)) : phase === "reveal" ? t.reveal(names[answer], placeText(position, locale)) : t.keys;
  const tone = phase === "right" ? "ok" : phase === "reveal" ? "no" : phase === "hint" ? "focus" : "idle";

  return (
    <div className="hero-quiz" role="group" aria-label={phase === "show" ? t.staff : t.question} onKeyDown={onKey} data-state={phase} data-clef-host="">
      <div className="hero-quiz-stage">
        <Staff className="hero-quiz-staff" space={16} width={520} anchor={compact ? undefined : "hero"} anchorOrder={0}
          label={phase === "show" ? `${t.staff}: ${names[answer]}` : t.question}
          notes={[{ id: `q${index}`, position, x: 0.46, tone, label: phase === "show" || settled ? names[answer] : undefined }]} />
        {phase === "show" && <p className="hero-quiz-caption" aria-live="off"><b>{names[answer]}</b> · {placeText(position, locale)}</p>}
      </div>

      {phase === "show" ? (
        <div className="hero-quiz-actions">
          <button type="button" className="primary-button" onClick={() => { setMisses(0); setPhase("ask"); }}>{t.guess}</button>
          <button type="button" className="ghost-button" onClick={() => playMidi(midiOf(position))}>{t.listen}</button>
        </div>
      ) : (
        <div className="hero-quiz-answer">
          <p className="hero-quiz-q">{t.question}</p>
          <div className="hero-quiz-keys">
            {names.map((name, i) => (
              <button key={name} ref={i === 0 ? firstKey : undefined} type="button" className={`hero-key${settled && i === answer ? " is-answer" : ""}`} onClick={() => choose(i)} disabled={settled && i !== answer} aria-keyshortcuts={String(i + 1)}>
                <kbd aria-hidden="true">{i + 1}</kbd>{name}
              </button>
            ))}
          </div>
          <p className="hero-quiz-status" aria-live="polite">
            {phase === "right" && <span className="mark mark--ok" aria-hidden="true">✓</span>}
            {(phase === "hint" || phase === "reveal") && <span className="mark mark--hint" aria-hidden="true">!</span>}
            {status}
          </p>
          <div className="hero-quiz-actions">
            {settled && <button ref={nextButton} type="button" className="primary-button" onClick={() => { setIndex((i) => i + 1); setMisses(0); setPhase("ask"); }}>{t.next}</button>}
            {settled && <button type="button" className="ghost-button" onClick={onOpenStudio}>{t.studio}</button>}
            <button type="button" className="ghost-button" onClick={() => setPhase("show")}>{t.back}</button>
          </div>
        </div>
      )}
    </div>
  );
}
