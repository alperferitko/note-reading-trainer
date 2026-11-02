"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MusicStaff } from "./notation";
import { AITeacher } from "./ai-teacher";
import { useEvidence } from "./targeted-review";
import { useMicPitch } from "./use-mic-pitch";
import { judgePitch, midiLabel, summarizeMic } from "@/lib/pitch-detect.mjs";
import { pitchAt, pitchName } from "@/lib/music-pitch.mjs";
import { saveEvidence } from "@/lib/practice-evidence.mjs";
import "./practice-lab.css";

type Locale = "tr" | "en";
type Instrument = "piano" | "guitar" | "violin";
type Result = { position: number; midi: number; result: "correct" | "wrong" | "skipped"; heard?: number; octaveOff?: boolean; responseMs?: number };

// Written ranges on the treble staff (position 0 = bottom line E4), natural notes only.
const RANGES: Record<Instrument, [number, number]> = { piano: [-2, 8], guitar: [-5, 8], violin: [-5, 8] };
const COUNT = 10;

const T = {
  tr: {
    title: "Mikrofonla çal",
    lead: "Portedeki notayı enstrümanınla çal. NotaNota duyduğu perdeyi beklenen notayla karşılaştırır.",
    privacy: "Ses yalnızca bu sayfada işlenir; kaydedilmez ve hiçbir yere gönderilmez. Yalnızca perde ölçülür; ritim, ses gücü ve ton ölçülmez.",
    instrument: "Enstrüman", piano: "Piyano", guitar: "Gitar", violin: "Keman",
    guitarNote: "Gitar yazıldığından bir oktav pes duyulur; karşılaştırma bunu hesaba katar.",
    start: "Mikrofonu aç ve başla",
    asking: "Tarayıcı mikrofon izni istiyor…",
    denied: "Mikrofon izni verilmedi. Tarayıcının adres çubuğundan izni açabilir ya da ekranda cevaplayarak çalışabilirsin.",
    unavailable: "Bu cihazda kullanılabilir bir mikrofon bulunamadı. Ekranda cevaplayarak çalışabilirsin.",
    error: "Mikrofon başlatılamadı. Ekranda cevaplayarak çalışabilirsin.",
    onScreen: "Ekranda cevapla",
    question: (i: number) => `${i} / ${COUNT}`,
    waiting: "Ses bekleniyor", unclear: "Ses net değil; tek bir notayı tutarak çal",
    heard: (label: string, cents: number) => `Duyulan: ${label} (${cents > 0 ? "+" : ""}${cents} sent)`,
    right: "Doğru perde.",
    wrong: (heard: string, expected: string, octave: boolean) => `Duyulan ${heard}, beklenen ${expected}${octave ? "; doğru nota, yanlış oktav" : ""}. Tekrar dene ya da geç.`,
    skip: "Bu notayı geç", finish: "Bitir",
    resultsH: "Sonuç",
    stats: (s: ReturnType<typeof summarizeMic>) => [
      ["Doğru perde", `${s.correct}`], ["Yanlış perde", `${s.wrong}`], ["Geçilen", `${s.skipped}`],
      ["Perde doğruluğu", s.pitchAccuracy === null ? "ölçülemedi" : `%${Math.round(s.pitchAccuracy * 100)}`],
      ["Doğru perdeye ortalama süre", s.averageMs === null ? "ölçülemedi" : `${(s.averageMs / 1000).toFixed(1).replace(".", ",")} sn`],
      ["Oktav hatası", `${s.octaveErrors}`],
    ],
    notMeasured: "Bu turda ölçülmeyenler: ritim, ses gücü, ton ve entonasyonun sent düzeyindeki ayrıntısı.",
    again: "Yeni tur", back: "Müzik aletleri",
  },
  en: {
    title: "Play to the microphone",
    lead: "Play the note on the staff on your instrument. NotaNota compares the pitch it hears with the note expected.",
    privacy: "Sound is processed in this page only; it is not recorded or sent anywhere. Only pitch is measured; rhythm, loudness and tone are not.",
    instrument: "Instrument", piano: "Piano", guitar: "Guitar", violin: "Violin",
    guitarNote: "Guitar sounds an octave below written; the comparison accounts for it.",
    start: "Turn on the microphone and start",
    asking: "The browser is asking for microphone permission…",
    denied: "Microphone permission was not given. You can allow it from the address bar, or practise by answering on screen.",
    unavailable: "No usable microphone was found on this device. You can practise by answering on screen.",
    error: "The microphone could not start. You can practise by answering on screen.",
    onScreen: "Answer on screen",
    question: (i: number) => `${i} / ${COUNT}`,
    waiting: "Waiting for sound", unclear: "Sound is unclear; hold a single note",
    heard: (label: string, cents: number) => `Heard: ${label} (${cents > 0 ? "+" : ""}${cents} cents)`,
    right: "Right pitch.",
    wrong: (heard: string, expected: string, octave: boolean) => `Heard ${heard}, expected ${expected}${octave ? "; right note, wrong octave" : ""}. Try again or skip.`,
    skip: "Skip this note", finish: "Finish",
    resultsH: "Results",
    stats: (s: ReturnType<typeof summarizeMic>) => [
      ["Right pitch", `${s.correct}`], ["Wrong pitch", `${s.wrong}`], ["Skipped", `${s.skipped}`],
      ["Pitch accuracy", s.pitchAccuracy === null ? "not measured" : `${Math.round(s.pitchAccuracy * 100)}%`],
      ["Average time to the right pitch", s.averageMs === null ? "not measured" : `${(s.averageMs / 1000).toFixed(1)} s`],
      ["Octave errors", `${s.octaveErrors}`],
    ],
    notMeasured: "Not measured in this round: rhythm, loudness, tone and cent-level intonation detail.",
    again: "New round", back: "Instruments",
  },
} as const;

function drawNotes(instrument: Instrument) {
  const [lo, hi] = RANGES[instrument];
  const out: number[] = [];
  while (out.length < COUNT) {
    const p = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (out[out.length - 1] !== p) out.push(p);
  }
  return out;
}

export function MicPractice({ locale, onNavigate }: { locale: Locale; onNavigate: (stage: "instruments" | "piano" | "guitar" | "violin" | "progress") => void }) {
  const t = T[locale];
  const evidence = useEvidence();
  const [instrument, setInstrument] = useState<Instrument>("guitar");
  const [notes, setNotes] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "no"; text: string } | null>(null);
  const [session, setSession] = useState("");
  const [phase, setPhase] = useState<"setup" | "playing" | "done">("setup");
  const shownAt = useRef(0);
  const decided = useRef(false);
  const serial = useRef(0);
  const pendingWrong = useRef<Result | null>(null);

  const current = notes[index];
  const written = current === undefined ? null : pitchAt(current, "treble", 0);

  const finish = useCallback((final: Result[]) => { setResults(final); setPhase("done"); }, []);

  const advance = useCallback((entry: Result) => {
    setResults((list) => {
      const next = [...list, entry];
      if (index + 1 >= notes.length) window.setTimeout(() => finish(next), 0);
      return next;
    });
    setMessage(null);
    decided.current = false;
    shownAt.current = performance.now();
    setIndex((i) => i + 1);
  }, [index, notes.length, finish]);

  const record = useCallback((heard: number, correct: boolean) => {
    if (!written) return;
    serial.current += 1;
    saveEvidence([{ id: `${session}-${serial.current}`, module: instrument, task: "mic-pitch", item: `treble:${written.id}`, session,
      clef: "treble", midi: written.midi, octave: written.octave, position: written.position, accidental: 0,
      correct, firstAttempt: true, assisted: false, timedOut: false, responseMs: Math.round(performance.now() - shownAt.current), timeLimitMs: null,
      at: new Date().toISOString() }]);
  }, [instrument, session, written]);

  const onStable = useCallback((heard: number) => {
    if (phase !== "playing" || !written) return;
    const verdict = judgePitch(heard, written.midi, instrument);
    const first = !decided.current;
    if (first) { decided.current = true; record(heard, verdict.result === "correct"); }
    if (verdict.result === "correct") {
      setMessage({ kind: "ok", text: t.right });
      const responseMs = Math.round(performance.now() - shownAt.current);
      const entry: Result = first ? { position: written.position, midi: written.midi, result: "correct", heard, responseMs }
        : { position: written.position, midi: written.midi, result: "wrong", heard, octaveOff: false };
      window.setTimeout(() => advance(entry), 700);
    } else {
      setMessage({ kind: "no", text: t.wrong(midiLabel(heard, locale), midiLabel(verdict.expected, locale), Boolean(verdict.octaveOff)) });
      pendingWrong.current = { position: written.position, midi: written.midi, result: "wrong", heard, octaveOff: verdict.octaveOff };
    }
  }, [phase, written, instrument, record, t, locale, advance]);

  const mic = useMicPitch(onStable);
  const { stop: stopMic, resetDecision } = mic;

  useEffect(() => { if (phase === "done") stopMic(); }, [phase, stopMic]);

  async function begin() {
    const drawn = drawNotes(instrument);
    setNotes(drawn); setIndex(0); setResults([]); setMessage(null);
    setSession(`mic-${instrument}-${Date.now()}`); serial.current = 0; decided.current = false; pendingWrong.current = null;
    shownAt.current = performance.now();
    setPhase("playing");
    await mic.start();
  }

  function skip() {
    if (!written) return;
    const entry = pendingWrong.current ?? { position: written.position, midi: written.midi, result: "skipped" as const };
    pendingWrong.current = null;
    mic.resetDecision();
    advance(entry);
  }

  useEffect(() => { pendingWrong.current = null; resetDecision(); }, [index, resetDecision]);

  const summary = summarizeMic(results);
  const micBlocked = mic.state === "denied" || mic.state === "unavailable" || mic.state === "error";

  return (
    <section className="lab" aria-labelledby="mic-title">
      <header className="lab-head">
        <h1 id="mic-title">{t.title}</h1>
        <p className="lab-lead">{t.lead}</p>
        <p className="lab-note">{t.privacy}</p>
      </header>

      {phase === "setup" && (
        <div className="lab-panel">
          <fieldset className="lab-choice">
            <legend>{t.instrument}</legend>
            {(["piano", "guitar", "violin"] as const).map((id) => (
              <label key={id} className={instrument === id ? "is-on" : ""}><input type="radio" name="mic-instrument" value={id} checked={instrument === id} onChange={() => setInstrument(id)} />{t[id]}</label>
            ))}
          </fieldset>
          {instrument === "guitar" && <p className="lab-note">{t.guitarNote}</p>}
          <div className="lab-actions">
            <button type="button" className="primary-button" onClick={begin}>{t.start}</button>
            <button type="button" className="secondary-button" onClick={() => onNavigate(instrument)}>{t.onScreen}</button>
          </div>
        </div>
      )}

      {phase === "playing" && written && (
        <div className="lab-panel lab-play">
          <div className="lab-locator"><span>{t.question(index + 1)}</span><span>{t[instrument]}</span></div>
          <MusicStaff position={written.position} clef="treble" label={pitchName(written, locale, true)} />
          <p className="lab-live" aria-live="polite">
            {mic.state === "asking" ? t.asking
              : mic.state === "listening" ? (mic.reading.state === "silence" ? t.waiting : mic.reading.state === "unclear" ? t.unclear
                : typeof mic.reading.midi === "number" ? t.heard(midiLabel(mic.reading.midi, locale), mic.reading.cents ?? 0) : t.waiting)
                : ""}
          </p>
          {message && <p className={`lab-feedback lab-feedback--${message.kind}`} role="status">{message.text}</p>}
          {micBlocked && <div className="lab-feedback lab-feedback--no" role="alert"><p>{t[mic.state as "denied" | "unavailable" | "error"]}</p><button type="button" className="secondary-button" onClick={() => onNavigate(instrument)}>{t.onScreen}</button></div>}
          <div className="lab-actions">
            <button type="button" className="secondary-button" onClick={skip}>{t.skip}</button>
            <button type="button" className="ghost-button" onClick={() => finish(results)}>{t.finish}</button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="lab-panel">
          <h2>{t.resultsH}</h2>
          <dl className="lab-stats">{t.stats(summary).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <p className="lab-note">{t.notMeasured}</p>
          <div className="lab-actions">
            <button type="button" className="primary-button" onClick={begin}>{t.again}</button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("instruments")}>{t.back}</button>
          </div>
          <AITeacher locale={locale} session={session} module={instrument} evidence={evidence} onRepeat={begin} onProgress={() => onNavigate("progress")} />
        </div>
      )}
    </section>
  );
}
