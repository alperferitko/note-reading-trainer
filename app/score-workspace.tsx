"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { MusicStaff } from "./notation";
import { AITeacher } from "./ai-teacher";
import { useEvidence } from "./targeted-review";
import { ScoreShelf } from "./score-library";
import { useMicPitch } from "./use-mic-pitch";
import { checkFile, practiceEvents, practiceQueue, readMusicXml, supportSummary, MusicXmlError } from "@/lib/musicxml.mjs";
import { judgePitch, midiLabel } from "@/lib/pitch-detect.mjs";
import { saveEvidence } from "@/lib/practice-evidence.mjs";
import sampleXml from "@/lib/samples/ode-to-joy.musicxml?raw";
import "./practice-lab.css";

type Locale = "tr" | "en";
type Score = ReturnType<typeof readMusicXml>;
type Measures = ReturnType<typeof practiceEvents>;
type Item = ReturnType<typeof practiceQueue>[number];
type Answer = { item: Item; correct: boolean; given: string; ms: number };

const NAMES = { tr: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"], en: ["C", "D", "E", "F", "G", "A", "B"] } as const;
const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const ACC = { [-1]: "♭", 0: "", 1: "♯" } as Record<number, string>;

const T = {
  tr: {
    title: "Nota dosyasıyla eser çalış",
    lead: "Kendi eserini aç, partisyonu gör ve seçtiğin ölçüleri nota nota çalış. Sonuçlar diğer çalışmalarınla aynı ilerleme kaydına girer.",
    supported: "Desteklenenler: sıkıştırılmamış .musicxml ve .xml dosyaları (en fazla 2 MB), score-partwise biçimi, sol ve fa anahtarı, tek sesli satırlar, diyez ve bemoller, bağlı notalar.",
    unsupported: "Desteklenmeyenler: sıkıştırılmış .mxl, akorlar ve çok sesli ölçüler (atlanır), C anahtarları, çift diyez ve çift bemol, süsleme notaları (sorulmaz). PDF ya da fotoğraftan nota okuma (OMR) henüz yok.",
    choose: "Nota dosyası aç", sample: "Örnek eseri aç (Neşeye Övgü)",
    privacy: "Dosya bu tarayıcıda okunur, hiçbir yere yüklenmez.",
    errors: {
      unsupported_extension: "Bu dosya türü desteklenmiyor. .musicxml ya da .xml seç; .mxl dosyasını önce notasyon programından sıkıştırılmamış MusicXML olarak dışa aktar.",
      empty_file: "Dosya boş.", too_large: "Dosya 2 MB sınırını aşıyor.",
      entities_not_allowed: "Dosya güvenlik nedeniyle açılmadı: XML varlık (ENTITY) tanımı içeriyor.",
      internal_subset_not_allowed: "Dosya güvenlik nedeniyle açılmadı: DOCTYPE iç tanım içeriyor.",
      timewise_not_supported: "score-timewise biçimi desteklenmiyor; dosyayı score-partwise olarak dışa aktar.",
      not_musicxml: "Bu dosya MusicXML değil.", no_parts: "Dosyada çalgı partisi yok.",
      default: "Dosya okunamadı; MusicXML yapısı bozuk görünüyor.",
    } as Record<string, string>,
    part: "Parti", staff: "Porte", staffN: (n: number) => `${n}. porte`,
    summary: (s: ReturnType<typeof supportSummary>) => `${s.measures} ölçünün ${s.supported} tanesi çalışılabilir${s.skipped ? `; ${s.skipped} ölçü atlanacak` : ""}.`,
    issues: { chords: "akor", multiple_voices: "birden fazla ses", unsupported_clef: "desteklenmeyen anahtar", double_accidental: "çift diyez/bemol", grace_notes_skipped: "süsleme notası (atlanır, ölçü çalışılır)", invalid_pitch: "okunamayan perde", invalid_note: "okunamayan nota", unpitched: "perdesiz vurmalı nota" } as Record<string, string>,
    skippedList: "Atlanan ölçüler", measure: "Ölçü",
    from: "Başlangıç ölçüsü", to: "Bitiş ölçüsü", mode: "Cevap", byName: "Notanın adıyla", byMic: "Mikrofonla çal",
    instrument: "Enstrüman", piano: "Piyano", guitar: "Gitar", violin: "Keman",
    start: "Çalışmaya başla", noNotes: "Seçili ölçülerde çalışılabilir nota yok.",
    render: "Partisyon çiziliyor…", renderFail: "Partisyon çizilemedi; notaları yine de çalışabilirsin.",
    where: (m: string, i: number, n: number, a: string, b: string, k: number, total: number) => `Ölçü ${m} · ${i}. nota / ${n} · Bölüm: ölçü ${a}–${b} · ${k}/${total}`,
    q: "Bu notanın adı ne?", accLabel: "İşaret", natural: "♮ yok",
    right: "Doğru.", wrong: (name: string) => `Doğrusu ${name}.`, next: "Sonraki",
    heard: (l: string) => `Duyulan: ${l}`, waiting: "Ses bekleniyor", skip: "Geç", finish: "Bitir",
    resultsH: "Sonuç", correct: "Doğru", wrongs: "Yanlış", avg: "Ortalama cevap süresi",
    hard: "Hata yaptığın ölçüler", none: "Hiç hata yok.", repeatHard: "Hatalı ölçüleri tekrar çalış", again: "Bölümü tekrar çalış", other: "Başka ölçüler seç",
    measured: "Ölçülen: nota adı (ya da mikrofonla perde) ve cevap süresi. Ölçülmeyen: ritim, tempo, ses gücü ve ifade.",
    micDenied: "Mikrofon kullanılamıyor; ad ile cevaplamaya geçildi.",
  },
  en: {
    title: "Practise a piece from a score file",
    lead: "Open your own piece, see the score and practise the bars you choose note by note. Results join the same progress record as your other practice.",
    supported: "Supported: uncompressed .musicxml and .xml files (up to 2 MB), score-partwise, treble and bass clef, single-line parts, sharps and flats, tied notes.",
    unsupported: "Not supported: compressed .mxl, chords and multi-voice bars (skipped), C clefs, double sharps and flats, grace notes (not asked). Reading from PDF or photos (OMR) is not available yet.",
    choose: "Open a score file", sample: "Open the sample piece (Ode to Joy)",
    privacy: "The file is read in this browser and not uploaded anywhere.",
    errors: {
      unsupported_extension: "This file type is not supported. Choose .musicxml or .xml; export .mxl files as uncompressed MusicXML first.",
      empty_file: "The file is empty.", too_large: "The file is over the 2 MB limit.",
      entities_not_allowed: "Not opened for safety: the file declares XML entities.",
      internal_subset_not_allowed: "Not opened for safety: the DOCTYPE has an internal subset.",
      timewise_not_supported: "score-timewise is not supported; export as score-partwise.",
      not_musicxml: "This file is not MusicXML.", no_parts: "The file has no parts.",
      default: "The file could not be read; the MusicXML structure looks broken.",
    } as Record<string, string>,
    part: "Part", staff: "Staff", staffN: (n: number) => `Staff ${n}`,
    summary: (s: ReturnType<typeof supportSummary>) => `${s.supported} of ${s.measures} bars can be practised${s.skipped ? `; ${s.skipped} bars will be skipped` : ""}.`,
    issues: { chords: "chords", multiple_voices: "several voices", unsupported_clef: "unsupported clef", double_accidental: "double sharp/flat", grace_notes_skipped: "grace notes (skipped, bar practised)", invalid_pitch: "unreadable pitch", invalid_note: "unreadable note", unpitched: "unpitched percussion" } as Record<string, string>,
    skippedList: "Skipped bars", measure: "Bar",
    from: "From bar", to: "To bar", mode: "Answer", byName: "By note name", byMic: "Play to the microphone",
    instrument: "Instrument", piano: "Piano", guitar: "Guitar", violin: "Violin",
    start: "Start practice", noNotes: "No practisable notes in the chosen bars.",
    render: "Drawing the score…", renderFail: "The score could not be drawn; you can still practise its notes.",
    where: (m: string, i: number, n: number, a: string, b: string, k: number, total: number) => `Bar ${m} · note ${i} of ${n} · Section: bars ${a}–${b} · ${k}/${total}`,
    q: "What is this note?", accLabel: "Sign", natural: "♮ none",
    right: "Right.", wrong: (name: string) => `It is ${name}.`, next: "Next",
    heard: (l: string) => `Heard: ${l}`, waiting: "Waiting for sound", skip: "Skip", finish: "Finish",
    resultsH: "Results", correct: "Correct", wrongs: "Wrong", avg: "Average answer time",
    hard: "Bars with mistakes", none: "No mistakes.", repeatHard: "Practise the bars with mistakes", again: "Practise the section again", other: "Choose other bars",
    measured: "Measured: note name (or pitch by microphone) and answer time. Not measured: rhythm, tempo, loudness and expression.",
    micDenied: "The microphone is unavailable; switched to answering by name.",
  },
} as const;

function nameOf(item: Item, locale: Locale) { return `${NAMES[locale][STEPS.indexOf(item.step)]}${ACC[item.alter] ?? ""}${item.octave}`; }

export function ScoreView({ xml, label, failLabel }: { xml: string; label: string; failLabel: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    let cancelled = false;
    const node = box.current;
    if (!node) return;
    (async () => {
      try {
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled) return;
        node.innerHTML = "";
        const osmd = new OpenSheetMusicDisplay(node, { autoResize: true, backend: "svg", drawTitle: true, drawComposer: true, drawPartNames: true, drawingParameters: "compacttight" });
        await osmd.load(xml);
        if (cancelled) return;
        osmd.render();
        setState("ready");
      } catch { if (!cancelled) setState("failed"); }
    })();
    return () => { cancelled = true; node.innerHTML = ""; };
  }, [xml]);
  return <div className="lab-score-wrap">
    {state === "loading" && <p className="lab-note">{label}</p>}
    {state === "failed" && <p className="lab-note" role="status">{failLabel}</p>}
    <div ref={box} className="lab-score" aria-hidden={state !== "ready"} />
  </div>;
}

export function ScoreWorkspace({ locale, onNavigate, initial = null }: { locale: Locale; noteSoundEnabled: boolean; onNavigate: (stage: "pieces" | "progress" | "listen-play") => void; initial?: { xml: string; from?: number; to?: number } | null }) {
  const t = T[locale];
  const evidence = useEvidence();
  const [xml, setXml] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partIndex, setPartIndex] = useState(0);
  const [staff, setStaff] = useState(1);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [mode, setMode] = useState<"name" | "mic">("name");
  const [instrument, setInstrument] = useState<"piano" | "guitar" | "violin">("piano");
  const [phase, setPhase] = useState<"pick" | "ready" | "play" | "done">("pick");
  const [queue, setQueue] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [accidental, setAccidental] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [session, setSession] = useState("");
  const shownAt = useRef(0);
  const serial = useRef(0);

  const part = score?.parts[partIndex];
  const measures: Measures = useMemo(() => (part ? practiceEvents(part, staff) : []), [part, staff]);
  const summary = useMemo(() => supportSummary(measures), [measures]);

  function open(text: string) {
    try {
      const parsed = readMusicXml(text);
      setScore(parsed); setXml(text); setError(null); setPartIndex(0); setStaff(1);
      setPhase("ready");
    } catch (err) {
      setScore(null); setXml(null);
      setError(err instanceof MusicXmlError ? (t.errors[err.code] ?? t.errors.default) : t.errors.default);
    }
  }
  // A piece handed over from another page opens at once, on the bars it asked for.
  const pendingRange = useRef<[number, number] | null>(initial ? [Math.max(0, (initial.from ?? 1) - 1), Math.max(0, (initial.to ?? initial.from ?? 1) - 1)] : null);
  useEffect(() => {
    if (!initial) return;
    const timer = window.setTimeout(() => open(initial.xml), 0);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- opens the handed-over piece once
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const last = Math.max(0, measures.length - 1);
      const wanted = measures.length ? pendingRange.current : null;
      if (wanted) pendingRange.current = null;
      setRange(wanted ? [Math.min(wanted[0], last), Math.min(Math.max(wanted[0], wanted[1]), last)] : [0, last]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [measures.length]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { checkFile(file.name, file.size); } catch (err) { setError(err instanceof MusicXmlError ? (t.errors[err.code] ?? t.errors.default) : t.errors.default); return; }
    open(await file.text());
  }

  const current = queue[index];
  const finish = useCallback(() => setPhase("done"), []);

  const record = useCallback((item: Item, correct: boolean, given: string) => {
    serial.current += 1;
    const ms = Math.round(performance.now() - shownAt.current);
    saveEvidence([{ id: `${session}-${serial.current}`, module: "score", task: mode === "mic" ? "score-mic" : "score-name",
      item: `${item.clef}:${item.step.toLowerCase()}${item.octave}${item.alter === 1 ? "#" : item.alter === -1 ? "b" : ""}`, session,
      clef: item.clef, midi: item.midi, octave: item.octave, position: item.position, accidental: item.alter,
      correct, firstAttempt: true, assisted: false, timedOut: false, responseMs: ms, timeLimitMs: null, answer: given.slice(0, 24), at: new Date().toISOString() }]);
    setAnswers((list) => [...list, { item, correct, given, ms }]);
  }, [session, mode]);

  const advance = useCallback(() => {
    setFeedback(null); setAccidental(0);
    shownAt.current = performance.now();
    setIndex((i) => { if (i + 1 >= queue.length) { window.setTimeout(finish, 0); return i; } return i + 1; });
  }, [queue.length, finish]);

  const decided = useRef(false);
  const onStable = useCallback((heard: number) => {
    if (phase !== "play" || mode !== "mic" || !current || decided.current) return;
    decided.current = true;
    const verdict = judgePitch(heard, current.midi, instrument);
    record(current, verdict.result === "correct", midiLabel(heard, locale));
    setFeedback({ ok: verdict.result === "correct", text: verdict.result === "correct" ? t.right : `${t.heard(midiLabel(heard, locale))}. ${t.wrong(nameOf(current, locale))}` });
    window.setTimeout(() => { decided.current = false; advance(); }, verdict.result === "correct" ? 700 : 1500);
  }, [phase, mode, current, instrument, record, locale, t, advance]);
  const mic = useMicPitch(onStable);
  const { stop: stopMic, start: startMic, resetDecision } = mic;
  useEffect(() => { if (phase !== "play") stopMic(); }, [phase, stopMic]);
  useEffect(() => { resetDecision(); }, [index, resetDecision]);
  useEffect(() => {
    if (mode === "mic" && (mic.state === "denied" || mic.state === "unavailable" || mic.state === "error")) {
      const timer = window.setTimeout(() => { setMode("name"); setFeedback({ ok: false, text: t.micDenied }); }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [mic.state, mode, t]);

  function begin(from = range[0], to = range[1]) {
    const q = practiceQueue(measures, from, to);
    if (!q.length) { setError(t.noNotes); return; }
    setError(null); setQueue(q); setIndex(0); setAnswers([]); setFeedback(null); setAccidental(0);
    setSession(`score-${Date.now()}`); serial.current = 0; decided.current = false;
    shownAt.current = performance.now();
    setRange([from, to]);
    setPhase("play");
    if (mode === "mic") void startMic();
  }

  function answerName(letterIndex: number) {
    if (!current || feedback) return;
    const correct = STEPS[letterIndex] === current.step && accidental === current.alter;
    const given = `${NAMES[locale][letterIndex]}${ACC[accidental] ?? ""}`;
    record(current, correct, given);
    setFeedback({ ok: correct, text: correct ? t.right : t.wrong(nameOf(current, locale)) });
    if (correct) window.setTimeout(advance, 600);
  }

  const notesInMeasure = current ? queue.filter((q) => q.measureIndex === current.measureIndex) : [];
  const positionInMeasure = current ? notesInMeasure.indexOf(current) + 1 : 0;
  const wrongMeasures = [...new Set(answers.filter((a) => !a.correct).map((a) => a.item.measureIndex))].sort((a, b) => a - b);
  const correctCount = answers.filter((a) => a.correct).length;
  const avg = answers.length ? answers.reduce((s, a) => s + a.ms, 0) / answers.length / 1000 : null;
  const label = (i: number) => measures[i]?.number ?? String(i + 1);

  return (
    <section className="lab" aria-labelledby="score-title">
      <header className="lab-head">
        <h1 id="score-title">{t.title}</h1>
        <p className="lab-lead">{t.lead}</p>
      </header>

      {(phase === "pick" || phase === "ready") && (
        <div className="lab-panel">
          <div className="lab-actions">
            <label className="primary-button lab-file">{t.choose}<input type="file" accept=".musicxml,.xml,application/vnd.recordare.musicxml+xml,application/xml,text/xml" onChange={onFile} /></label>
            <button type="button" className="secondary-button" onClick={() => open(sampleXml)}>{t.sample}</button>
          </div>
          <p className="lab-note">{t.privacy}</p>
          <details className="lab-details"><summary>{locale === "tr" ? "Ne destekleniyor?" : "What is supported?"}</summary><p>{t.supported}</p><p>{t.unsupported}</p></details>
          {error && <p className="lab-feedback lab-feedback--no" role="alert">{error}</p>}
        </div>
      )}
      {phase === "pick" && <ScoreShelf locale={locale} onOpen={({ xml: text }) => open(text)} />}

      {phase === "ready" && score && part && (
        <div className="lab-panel">
          <h2>{score.title ?? (locale === "tr" ? "Adsız eser" : "Untitled piece")}{score.composer ? <small> · {score.composer}</small> : null}</h2>
          <div className="lab-grid">
            {score.parts.length > 1 && <label>{t.part}<select value={partIndex} onChange={(e) => { setPartIndex(Number(e.target.value)); setStaff(1); }}>{score.parts.map((p, i) => <option key={i} value={i}>{p.name}</option>)}</select></label>}
            {part.staves > 1 && <label>{t.staff}<select value={staff} onChange={(e) => setStaff(Number(e.target.value))}>{Array.from({ length: part.staves }, (_, i) => <option key={i} value={i + 1}>{t.staffN(i + 1)}</option>)}</select></label>}
            <label>{t.from}<select value={range[0]} onChange={(e) => setRange(([, b]) => [Number(e.target.value), Math.max(Number(e.target.value), b)])}>{measures.map((m, i) => <option key={i} value={i}>{m.number}</option>)}</select></label>
            <label>{t.to}<select value={range[1]} onChange={(e) => setRange(([a]) => [Math.min(a, Number(e.target.value)), Number(e.target.value)])}>{measures.map((m, i) => <option key={i} value={i}>{m.number}</option>)}</select></label>
            <label>{t.mode}<select value={mode} onChange={(e) => setMode(e.target.value as "name" | "mic")}><option value="name">{t.byName}</option><option value="mic">{t.byMic}</option></select></label>
            {mode === "mic" && <label>{t.instrument}<select value={instrument} onChange={(e) => setInstrument(e.target.value as "piano" | "guitar" | "violin")}><option value="piano">{t.piano}</option><option value="guitar">{t.guitar}</option><option value="violin">{t.violin}</option></select></label>}
          </div>
          <p>{t.summary(summary)}</p>
          {summary.skipped > 0 && <details className="lab-details"><summary>{t.skippedList}</summary><ul>{measures.filter((m) => !m.supported).map((m) => <li key={m.index}>{t.measure} {m.number}: {m.issues.map((i) => t.issues[i] ?? i).join(", ")}</li>)}</ul></details>}
          <div className="lab-actions"><button type="button" className="primary-button" onClick={() => begin()}>{t.start}</button></div>
          {xml && <ScoreView xml={xml} label={t.render} failLabel={t.renderFail} />}
        </div>
      )}

      {phase === "play" && current && (
        <div className="lab-panel lab-play">
          <p className="lab-locator">{t.where(current.measureNumber, positionInMeasure, notesInMeasure.length, label(range[0]), label(range[1]), index + 1, queue.length)}</p>
          <MusicStaff position={current.position} accidental={current.alter} clef={current.clef as "treble" | "bass"} label={mode === "mic" ? t.q : t.q} />
          {mode === "name" ? <>
            <p className="lab-q">{t.q}</p>
            <div className="lab-acc" role="group" aria-label={t.accLabel}>
              {[[-1, "♭"], [0, t.natural], [1, "♯"]].map(([value, text]) => <button key={String(value)} type="button" aria-pressed={accidental === value} onClick={() => setAccidental(value as number)}>{text}</button>)}
            </div>
            <div className="lab-keys">{NAMES[locale].map((name, i) => <button key={name} type="button" onClick={() => answerName(i)} disabled={Boolean(feedback)}>{name}</button>)}</div>
          </> : <p className="lab-live" aria-live="polite">{mic.reading.state === "silence" ? t.waiting : typeof mic.reading.midi === "number" ? t.heard(midiLabel(mic.reading.midi, locale)) : t.waiting}</p>}
          {feedback && <p className={`lab-feedback lab-feedback--${feedback.ok ? "ok" : "no"}`} role="status">{feedback.text}</p>}
          <div className="lab-actions">
            {feedback && !feedback.ok && mode === "name" && <button type="button" className="primary-button" onClick={advance}>{t.next}</button>}
            {mode === "mic" && <button type="button" className="secondary-button" onClick={advance}>{t.skip}</button>}
            <button type="button" className="ghost-button" onClick={finish}>{t.finish}</button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="lab-panel">
          <h2>{t.resultsH}</h2>
          <dl className="lab-stats">
            <div><dt>{t.correct}</dt><dd>{correctCount}</dd></div>
            <div><dt>{t.wrongs}</dt><dd>{answers.length - correctCount}</dd></div>
            <div><dt>{t.avg}</dt><dd>{avg === null ? "–" : `${avg.toFixed(1).replace(".", locale === "tr" ? "," : ".")} ${locale === "tr" ? "sn" : "s"}`}</dd></div>
          </dl>
          <h3>{t.hard}</h3>
          {wrongMeasures.length ? <ul className="lab-list">{wrongMeasures.map((m) => <li key={m}>{t.measure} {label(m)}: {answers.filter((a) => a.item.measureIndex === m && !a.correct).map((a) => nameOf(a.item, locale)).join(", ")}</li>)}</ul> : <p>{t.none}</p>}
          <p className="lab-note">{t.measured}</p>
          <div className="lab-actions">
            {wrongMeasures.length > 0 && <button type="button" className="primary-button" onClick={() => begin(wrongMeasures[0], wrongMeasures[wrongMeasures.length - 1])}>{t.repeatHard}</button>}
            <button type="button" className={wrongMeasures.length ? "secondary-button" : "primary-button"} onClick={() => begin(range[0], range[1])}>{t.again}</button>
            <button type="button" className="ghost-button" onClick={() => setPhase("ready")}>{t.other}</button>
          </div>
          <AITeacher locale={locale} session={session} module="score" evidence={evidence} onRepeat={() => begin(range[0], range[1])} onProgress={() => onNavigate("progress")} />
        </div>
      )}
    </section>
  );
}
