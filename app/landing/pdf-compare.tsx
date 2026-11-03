"use client";
/* eslint-disable @next/next/no-img-element -- static Pages export: the source page is a plain image file. */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { midiOf } from "@/lib/demo-piece.mjs";
import { ODE_SOURCE, ODE_VOICES, closeScoreMusicXml, voiceBars, voiceMusicXml } from "@/lib/samples/ode-satb.mjs";
import { playSequence, stopAllSound } from "./music";
import { OsmdView } from "./osmd-view";

type Locale = "tr" | "en";

const TEXT = {
  tr: {
    title: "Kâğıttaki partisyon, çalışabileceğin bir parçaya dönüşür",
    lead: "Solda gerçek bir PDF sayfası, sağda aynı ölçüler NotaNota'da: dört ses, iki porte, aynı notalar.",
    sample: "Önceden hazırlanmış sonuç",
    sampleNote: "Dijital sonuç bu PDF'ten elle hazırlandı ve LilyPond kaynağıyla nota nota karşılaştırıldı; sayfa tanıma henüz bağlı değil.",
    source: "Kaynak: Mutopia Project #528, kamu malı",
    slider: "Kaynak PDF ile NotaNota görünümünü karşılaştır",
    sliderValue: (v: number) => `Kaynak PDF yüzde ${v}`,
    drag: "Karşılaştırmak için kolu sürükle",
    printed: "Kaynak PDF",
    digital: "NotaNota",
    play: "Dinle",
    stop: "Durdur",
    bar: (n: number, of: number) => `Ölçü ${n} / ${of}`,
    tryIt: "Soprano partisini çalış",
    sourceAlt: (to: number) => `Ode to Joy, Mutopia PDF sayfasından 1–${to}. ölçüler: soprano ve alto sol anahtarında, tenor ve bas fa anahtarında`,
    digitalLabel: (to: number) => `Aynı 1–${to}. ölçüler NotaNota'da çizildi`,
    loading: "Nota çiziliyor…",
    failed: "Nota çizilemedi; kaynak PDF solda duruyor.",
  },
  en: {
    title: "A score on paper becomes a piece you can practise",
    lead: "A real PDF page on the left, the same bars in NotaNota on the right: four voices, two staves, the same notes.",
    sample: "Prepared result",
    sampleNote: "The digital result was prepared by hand from this PDF and checked note by note against the LilyPond source; page recognition is not connected yet.",
    source: "Source: Mutopia Project #528, public domain",
    slider: "Compare the source PDF with the NotaNota view",
    sliderValue: (v: number) => `Source PDF ${v} percent`,
    drag: "Drag the handle to compare",
    printed: "Source PDF",
    digital: "NotaNota",
    play: "Listen",
    stop: "Stop",
    bar: (n: number, of: number) => `Bar ${n} / ${of}`,
    tryIt: "Practise the soprano part",
    sourceAlt: (to: number) => `Ode to Joy, bars 1–${to} from the Mutopia PDF page: soprano and alto in treble clef, tenor and bass in bass clef`,
    digitalLabel: (to: number) => `The same bars 1–${to} engraved in NotaNota`,
    loading: "Engraving the score…",
    failed: "The score could not be drawn; the source PDF is on the left.",
  },
} as const;

export function PdfCompare({ locale, onPractise }: { locale: Locale; onPractise: (xml: string) => void }) {
  const t = TEXT[locale];
  const [split, setSplit] = useState(52);
  const [beat, setBeat] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const dragging = useRef(false);
  // On a phone four bars would shrink the notes too far; the first two bars show every voice.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 560px)");
    const update = () => setNarrow(media.matches);
    const timer = window.setTimeout(update, 0);
    media.addEventListener("change", update);
    return () => { window.clearTimeout(timer); media.removeEventListener("change", update); };
  }, []);
  const to = narrow ? 2 : 4;
  const xml = useMemo(() => closeScoreMusicXml({ from: 1, to }), [to]);
  // All four voices sound together, from the same note data the staves are drawn from.
  const sound = useMemo(() => ODE_VOICES.flatMap((voice) => {
    let at = 0;
    return voiceBars(voice.id).slice(0, to).flat().map((n) => { const note = { midi: midiOf(n), start: at, beats: n.beats }; at += n.beats; return note; });
  }), [to]);
  const bar = beat === null ? 1 : Math.min(to, Math.floor(beat / ODE_SOURCE.beats) + 1);

  useEffect(() => () => { stopRef.current?.(); stopAllSound(); }, []);

  function listen() {
    if (stopRef.current) { stopRef.current(); stopRef.current = null; return; }
    stopRef.current = playSequence(sound, ODE_SOURCE.tempo, (b) => { setBeat(b); if (b === null) stopRef.current = null; });
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

      <div className="pdf-stage">
        <div ref={frame} className="pdf-frame pdf-frame--source" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ ["--split" as string]: `${split}%` }}>
          <div className="pdf-layer pdf-layer--print">
            <div className="pdf-sheet-head">
              <strong>{ODE_SOURCE.title}</strong>
              <span className="pdf-composer">L. v. Beethoven</span>
            </div>
            <img className="pdf-source-img" src={`./samples/ode-to-joy-mutopia-528-bars-1-${to}.png`} width={to === 4 ? 1558 : 916} height={450} alt={t.sourceAlt(to)} draggable={false} />
          </div>

          <div className="pdf-layer pdf-layer--digital" aria-hidden={split >= 100 ? true : undefined}>
            <div className="pdf-app-bar">
              <strong>{ODE_SOURCE.title}</strong>
              <span className="pdf-chip"><span aria-hidden="true">♩</span> = {ODE_SOURCE.tempo}</span>
              <span className="pdf-chip pdf-chip--quiet">{t.bar(bar, to)}</span>
              <button type="button" className="pdf-play" onClick={listen} aria-pressed={beat !== null}>
                {beat !== null
                  ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
                  : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" /></svg>}
                {beat !== null ? t.stop : t.play}
              </button>
            </div>
            <OsmdView key={xml} xml={xml} zoom={narrow ? 0.62 : 1} label={t.digitalLabel(to)} failLabel={t.failed} className="pdf-osmd" />
          </div>

          <div className="pdf-handle" role="slider" tabIndex={0} aria-label={t.slider} aria-valuemin={0} aria-valuemax={100} aria-valuenow={split} aria-valuetext={t.sliderValue(split)} onKeyDown={onSliderKey}>
            <span className="pdf-handle-knob" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          </div>
          <span className="pdf-tag pdf-tag--left" aria-hidden="true">{t.printed}</span>
          <span className="pdf-tag pdf-tag--right" aria-hidden="true">{t.digital}</span>
        </div>
        <div className="pdf-foot">
          <p><span className="lp-sample-chip">{t.sample}</span> {t.sampleNote} <a href={ODE_SOURCE.page} target="_blank" rel="noreferrer">{t.source}</a> <span className="pdf-drag-hint">{t.drag}</span></p>
          <button type="button" className="secondary-button" onClick={() => { stopRef.current?.(); onPractise(voiceMusicXml("soprano", { locale })); }}>{t.tryIt}</button>
        </div>
      </div>
    </section>
  );
}
