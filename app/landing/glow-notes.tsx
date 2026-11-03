"use client";

import { useEffect, useRef, useState } from "react";
import { pitchAt, pitchName } from "@/lib/music-pitch.mjs";
import { playPracticeNote } from "@/lib/practice-audio";
import { Staff } from "./music";

type Locale = "tr" | "en";

// Do4–La4 on the treble staff (position 0 is the bottom line, Mi4; Do4 sits on the first ledger line).
// The glowing notes are decoration: where they float says nothing about pitch; the question is asked on a real staff.
const QUESTIONS = [-2, -1, 0, 1, 2, 3].map((position) => pitchAt(position, "treble"));
// The golden notes ride the hero's staff (#hero-ribbon-path, its middle line) like the grey ones:
// where each starts along it (0..1) and its staff step from the middle line (+ is higher).
const RIDERS: [number, number][] = [[0.04, 1], [0.24, -1], [0.44, 2], [0.64, 0], [0.84, -2]];
const LOOP = 52; // seconds for a golden note to cross the whole staff, a little slower than the grey ones
const STEP = 13 / 2; // half a staff space on the ribbon, in px
// The head of the note sits at this point of its 48 x 64 button (the glyph is drawn into inset 8px 10px).
const HEAD: [number, number] = [22, 50];

const TEXT = {
  tr: {
    invite: "Bu notanın adını tahmin etmek ister misin?", open: (i: number) => `Nota sorusu ${i + 1}`, title: "Bu notanın adı ne?", eyebrow: "Küçük bir başlangıç",
    staff: "Sol anahtarlı porte üzerinde tek bir nota", start: "Sol anahtarı · Notaları alttan yukarı oku.",
    right: (n: string) => `Doğru, bu ${n}. İstersen sesini dinle.`, wrong: "Bir daha dene. Sol anahtarında en alt çizgi Mi, alttan ikinci çizgi Sol, alttaki ek çizgi Do.",
    listen: "Sesi dinle", next: "Başka nota", close: "Kapat", studio: "Nota okumaya geç",
  },
  en: {
    invite: "Want to guess this note's name?", open: (i: number) => `Note question ${i + 1}`, title: "What is this note?", eyebrow: "A small start",
    staff: "A single note on a treble staff", start: "Treble clef · read the notes from the bottom up.",
    right: (n: string) => `Right, this is ${n}. Listen to it if you like.`, wrong: "Try again. In the treble clef the bottom line is E, the second line G and the ledger line below is C.",
    listen: "Listen", next: "Another note", close: "Close", studio: "Go to note reading",
  },
} as const;

/**
 * Golden notes that glide along the hero's staff and glow softly; each opens the same small question
 * on a real staff. A note under the pointer or keyboard focus waits where it is, so its invitation can be
 * read and it is easy to hit; with reduced motion all of them stand still on the staff, still clickable.
 * Buttons are never removed or re-created, so focus is never lost when a note wraps around.
 */
export function GlowNotes({ locale, onStudio }: { locale: Locale; onStudio: () => void }) {
  const t = TEXT[locale];
  const layer = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [current, setCurrent] = useState(0);
  const [feedback, setFeedback] = useState<string>(t.start);
  const note = QUESTIONS[current];

  useEffect(() => {
    const box = layer.current;
    const hero = box?.closest(".lp-hero");
    if (!box || !hero) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const buttons = [...box.querySelectorAll<HTMLButtonElement>(".glow-note")];
    const progress = RIDERS.map(([start]) => start);
    const held = RIDERS.map(() => false);
    let visible = true, frame = 0, last = 0, path: SVGPathElement | null = null, length = 0, dx = 0, dy = 0, boxLeft = 0;
    const measure = () => {
      path = hero.querySelector<SVGPathElement>("#hero-ribbon-path");
      const svg = path?.ownerSVGElement;
      if (!path || !svg) { length = 0; return; }
      length = path.getTotalLength();
      const a = svg.getBoundingClientRect(), b = box.getBoundingClientRect();
      dx = a.left - b.left; dy = a.top - b.top; boxLeft = b.left;
    };
    const draw = () => {
      if (!path || !length) measure();
      buttons.forEach((button, i) => {
        if (!path || !length) { button.style.visibility = "hidden"; return; }
        const u = progress[i];
        const point = path.getPointAtLength(u * length);
        const x = point.x + dx - HEAD[0], y = point.y + dy - RIDERS[i][1] * STEP - HEAD[1];
        button.style.visibility = "";
        button.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        // The invitation opens toward the middle near either edge of the screen, never off it.
        const screenX = x + boxLeft;
        button.dataset.tip = screenX < 130 ? "start" : screenX > window.innerWidth - 150 ? "end" : "";
        // Soft in and out at the ends of the staff, where the painting's edge takes it; a held note stays lit.
        const edge = Math.min(1, u / 0.05, (1 - u) / 0.07);
        button.style.opacity = held[i] ? "1" : Math.max(0, edge).toFixed(2);
        button.classList.toggle("is-inviting", i === 0 && u > 0.18 && u < 0.62 && !buttons.some((b, j) => j !== i && held[j]));
      });
    };
    const tick = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      progress.forEach((u, i) => { if (!held[i]) progress[i] = (u + dt / LOOP) % 1; });
      draw();
      frame = window.requestAnimationFrame(tick);
    };
    const sync = () => {
      const run = visible && !document.hidden && !reduced.matches;
      box.classList.toggle("is-paused", !run);
      if (run && !frame) { last = 0; frame = window.requestAnimationFrame(tick); }
      if (!run && frame) { window.cancelAnimationFrame(frame); frame = 0; }
      if (!run) draw();
    };
    const hold = (i: number, on: boolean) => () => { held[i] = on || buttons[i] === document.activeElement || buttons[i].matches(":hover"); if (!frame) draw(); };
    const listeners = buttons.flatMap((button, i) => {
      const pairs: [string, () => void][] = [["pointerenter", hold(i, true)], ["pointerleave", hold(i, false)], ["focus", hold(i, true)], ["blur", hold(i, false)]];
      pairs.forEach(([type, fn]) => button.addEventListener(type, fn));
      return pairs.map(([type, fn]) => () => button.removeEventListener(type, fn));
    });
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    seen.observe(box);
    const resize = new ResizeObserver(() => { measure(); draw(); });
    resize.observe(hero);
    // The ribbon is drawn after the first layout pass; look for it again once it exists.
    const ribbon = new MutationObserver(() => { measure(); draw(); });
    ribbon.observe(hero, { childList: true, subtree: true, attributes: true, attributeFilter: ["d"] });
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    measure();
    sync();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      seen.disconnect(); resize.disconnect(); ribbon.disconnect();
      listeners.forEach((off) => off());
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, []);

  function open(index: number, from: HTMLButtonElement) {
    trigger.current = from;
    setCurrent(index);
    setFeedback(t.start);
    dialog.current?.showModal();
  }

  return (
    <>
      <div className="glow-notes" ref={layer}>
        {RIDERS.map((_, i) => (
          <button key={i} type="button" className={`glow-note glow-note--${i % 2 ? "eighth" : "quarter"}`} style={{ animationDelay: `${-i * 0.9}s`, visibility: "hidden" }}
            aria-label={`${t.open(i)}: ${t.invite}`} onClick={(event) => open(i, event.currentTarget)}>
            <span className="glow-note-tip" aria-hidden="true">{t.invite}</span>
          </button>
        ))}
      </div>
      <dialog className="glow-quiz" ref={dialog} aria-labelledby="glow-quiz-title" onClose={() => trigger.current?.focus()}>
        <button type="button" className="glow-quiz-close" aria-label={t.close} onClick={() => dialog.current?.close()}>×</button>
        <p className="glow-quiz-eyebrow">{t.eyebrow}</p>
        <h2 id="glow-quiz-title">{t.title}</h2>
        <Staff space={11} width={320} label={t.staff} notes={[{ id: note.id, position: note.position, x: 0.5 }]} className="glow-quiz-staff" />
        <div className="glow-quiz-answers">
          {QUESTIONS.map((option, i) => (
            <button key={option.id} type="button" onClick={() => setFeedback(i === current ? t.right(pitchName(option, locale)) : t.wrong)}>{pitchName(option, locale)}</button>
          ))}
        </div>
        <p className="glow-quiz-feedback" role="status" aria-live="polite">{feedback}</p>
        <div className="glow-quiz-actions">
          <button type="button" className="secondary-button" onClick={() => playPracticeNote(note.midi, true)}>{t.listen}</button>
          <button type="button" className="secondary-button" onClick={() => { setCurrent((current + 1) % QUESTIONS.length); setFeedback(t.start); }}>{t.next} →</button>
          <button type="button" className="primary-button" onClick={() => { dialog.current?.close(); onStudio(); }}>{t.studio}</button>
        </div>
      </dialog>
    </>
  );
}
