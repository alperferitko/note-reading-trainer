"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { DEMO_PIECE, layout, measureCount, midiOf, schedule, toMusicXml } from "@/lib/demo-piece.mjs";
import { playSequence, stopAllSound } from "./music";
import { ScoreStaff, type ScoreEvent } from "./score-staff";

type Locale = "tr" | "en";

const TEXT = {
  tr: {
    title: "Kâğıttaki partisyon, çalışabileceğin bir parçaya dönüşür",
    lead: "Solda taranmış bir sayfa, sağda aynı müzik NotaNota'da: ölçüler numaralı, çalan nota vurgulu, tempo ayarlı.",
    sample: "Örnek dönüşüm",
    sampleNote: "Bu gösterim hazırlanmış bir örnektir; sayfa tanıma henüz bağlı değil.",
    slider: "Taranmış sayfa ile NotaNota görünümünü karşılaştır",
    sliderValue: (v: number) => `Taranmış sayfa yüzde ${v}`,
    drag: "Karşılaştırmak için kolu sürükle",
    printed: "Taranmış sayfa",
    digital: "NotaNota",
    play: "Dinle",
    stop: "Durdur",
    bar: (n: number, of: number) => `Ölçü ${n} / ${of}`,
    tryIt: "Stüdyoda dene",
    staffPrinted: "Taranmış sayfada üç ölçülük ezgi: diyez, bemol, sus, sekizlikler ve noktalı ikilik",
    staffDigital: "Aynı ezginin NotaNota görünümü",
    tempo: "Yürür adımla",
  },
  en: {
    title: "A score on paper becomes a piece you can practise",
    lead: "A scanned page on the left, the same music in NotaNota on the right: numbered bars, the playing note highlighted, the tempo set.",
    sample: "Sample conversion",
    sampleNote: "This is a prepared example; page recognition is not connected yet.",
    slider: "Compare the scanned page with the NotaNota view",
    sliderValue: (v: number) => `Scanned page ${v} percent`,
    drag: "Drag the handle to compare",
    printed: "Scanned page",
    digital: "NotaNota",
    play: "Listen",
    stop: "Stop",
    bar: (n: number, of: number) => `Bar ${n} / ${of}`,
    tryIt: "Try it in the studio",
    staffPrinted: "A three-bar tune on the scanned page: a sharp, a flat, rests, eighth notes and a dotted half",
    staffDigital: "The same tune in NotaNota",
    tempo: "At a walking pace",
  },
} as const;

export function PdfCompare({ locale, onPractise }: { locale: Locale; onPractise: (xml: string) => void }) {
  const t = TEXT[locale];
  const [split, setSplit] = useState(52);
  const [beat, setBeat] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const dragging = useRef(false);
  // On a phone three bars would shrink the notes too far; the first two bars carry every kind of sign.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 560px)");
    const update = () => setNarrow(media.matches);
    const timer = window.setTimeout(update, 0);
    media.addEventListener("change", update);
    return () => { window.clearTimeout(timer); media.removeEventListener("change", update); };
  }, []);
  const notes = useMemo(() => (narrow ? DEMO_PIECE.notes.slice(0, 9) : DEMO_PIECE.notes), [narrow]);
  const events = useMemo(() => layout(notes) as ScoreEvent[], [notes]);
  const measures = measureCount(notes);
  const timed = useMemo(() => schedule(notes), [notes]);
  const playing = beat === null ? null : timed.find((e) => beat >= e.start && beat < e.start + e.beats) ?? null;
  const playingEvent = playing ? events.find((e) => e.id === playing.id) ?? null : null;
  const bar = playingEvent ? playingEvent.measure : 1;

  useEffect(() => () => { stopRef.current?.(); stopAllSound(); }, []);

  function listen() {
    if (stopRef.current) { stopRef.current(); stopRef.current = null; return; }
    const notes = timed.filter((e) => !e.rest).map((e) => ({ midi: midiOf(e as { step: string; octave: number; alter?: number }), start: e.start, beats: e.beats }));
    stopRef.current = playSequence(notes, DEMO_PIECE.tempo, (b) => { setBeat(b); if (b === null) stopRef.current = null; });
  }

  function moveTo(clientX: number) {
    const rect = frame.current?.getBoundingClientRect();
    if (rect) setSplit(Math.round(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))));
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    // On touch screens only the handle drags, so a vertical swipe over the picture still scrolls.
    if (event.pointerType === "touch" && !target.closest(".pdf-handle")) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) { if (dragging.current) moveTo(event.clientX); }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onSliderKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    const next = event.key === "ArrowLeft" || event.key === "ArrowDown" ? split - step
      : event.key === "ArrowRight" || event.key === "ArrowUp" ? split + step
        : event.key === "Home" ? 0 : event.key === "End" ? 100 : event.key === "PageDown" ? split - 25 : event.key === "PageUp" ? split + 25 : null;
    if (next === null) return;
    event.preventDefault();
    setSplit(Math.min(100, Math.max(0, next)));
  }

  return (
    <section className="lp-section lp-pdf" aria-labelledby="lp-pdf-title">
      <div className="lp-section-head lp-section-head--center">
        <h2 id="lp-pdf-title">{t.title}</h2>
        <p>{t.lead}</p>
      </div>

      <div className="pdf-stage" data-clef-host="">
        <div ref={frame} className="pdf-frame" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ ["--split" as string]: `${split}%` }}>
          <div className="pdf-layer pdf-layer--print">
            <svg className="pdf-grain" aria-hidden="true"><filter id="pdf-noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.16 0" /></filter><rect width="100%" height="100%" filter="url(#pdf-noise)" /></svg>
            <div className="pdf-sheet">
              <div className="pdf-sheet-head">
                <span className="pdf-tempo-mark">{t.tempo} <span aria-hidden="true">♩</span> = {DEMO_PIECE.tempo}</span>
                <strong>{DEMO_PIECE.title[locale]}</strong>
                <span className="pdf-composer">{DEMO_PIECE.composer}</span>
              </div>
              <ScoreStaff className="score-staff--print" events={events} measures={measures} space={13} width={760} label={t.staffPrinted} />
            </div>
            <span className="pdf-page-no">— 1 —</span>
          </div>

          <div className="pdf-layer pdf-layer--digital" aria-hidden={split >= 100 ? true : undefined}>
            <div className="pdf-app-bar">
              <strong>{DEMO_PIECE.title[locale]}</strong>
              <span className="pdf-chip"><span aria-hidden="true">♩</span> = {DEMO_PIECE.tempo}</span>
              <span className="pdf-chip pdf-chip--quiet">{t.bar(bar, measures)}</span>
              <button type="button" className="pdf-play" onClick={listen} aria-pressed={beat !== null}>
                {beat !== null
                  ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
                  : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" /></svg>}
                {beat !== null ? t.stop : t.play}
              </button>
            </div>
            <ScoreStaff className="score-staff--app" events={events} measures={measures} space={13} width={760} anchor="pdf" anchorOrder={2} numbers highlight={playing?.rest ? null : playing?.id ?? null} playhead={playingEvent ? playingEvent.x : null} label={t.staffDigital} />
          </div>

          <div className="pdf-handle" role="slider" tabIndex={0} aria-label={t.slider} aria-valuemin={0} aria-valuemax={100} aria-valuenow={split} aria-valuetext={t.sliderValue(split)} onKeyDown={onSliderKey}>
            <span className="pdf-handle-knob" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          </div>
          <span className="pdf-tag pdf-tag--left" aria-hidden="true">{t.printed}</span>
          <span className="pdf-tag pdf-tag--right" aria-hidden="true">{t.digital}</span>
        </div>
        <div className="pdf-foot">
          <p><span className="lp-sample-chip">{t.sample}</span> {t.sampleNote} <span className="pdf-drag-hint">{t.drag}</span></p>
          <button type="button" className="secondary-button" onClick={() => { stopRef.current?.(); onPractise(toMusicXml()); }}>{t.tryIt}</button>
        </div>
      </div>
    </section>
  );
}
