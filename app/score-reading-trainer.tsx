"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { beatDurationMs, chooseUnrecentPiece, generateRandomScoreLine, nextPieceHistory, RHYTHM_VALUES } from "@/lib/score-reading.mjs";
import { noteIdToMidi, playPracticeNote } from "@/lib/practice-audio";
import { CommunityPracticeRecorder, CommunityPracticeStreak } from "./community";

type Locale = "tr" | "en";
type SourceMode = "random" | "piece";
type ReadingMode = "flow" | "rhythm";
type Stage = "setup" | "playing" | "done";
type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";
type Solfege = "Do" | "Re" | "Mi" | "Fa" | "Sol" | "La" | "Si";
type RhythmId = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "triplet";

type ScoreNote = { id: string; letter: Letter; solfege: Solfege; position: number };
type ScoreEvent = { key: string; note: ScoreNote; rhythm: { id: RhythmId; beats: number }; tripletIndex?: number };
type AnswerResult = { index: number; expected: ScoreNote; guessed: Letter | null; correct: boolean; timedOut: boolean };
type Piece = { id: string; title: Record<Locale, string>; credit: Record<Locale, string>; notes: string[]; rhythms: RhythmId[] };

const SCORE_NOTES: ScoreNote[] = [
  { id: "c4", letter: "C", solfege: "Do", position: -2 },
  { id: "d4", letter: "D", solfege: "Re", position: -1 },
  { id: "e4", letter: "E", solfege: "Mi", position: 0 },
  { id: "f4", letter: "F", solfege: "Fa", position: 1 },
  { id: "g4", letter: "G", solfege: "Sol", position: 2 },
  { id: "a4", letter: "A", solfege: "La", position: 3 },
  { id: "b4", letter: "B", solfege: "Si", position: 4 },
  { id: "c5", letter: "C", solfege: "Do", position: 5 },
  { id: "d5", letter: "D", solfege: "Re", position: 6 },
  { id: "e5", letter: "E", solfege: "Mi", position: 7 },
  { id: "f5", letter: "F", solfege: "Fa", position: 8 },
  { id: "g5", letter: "G", solfege: "Sol", position: 9 },
];

const PIECES: Piece[] = [
  {
    id: "ode-to-joy",
    title: { tr: "Neşeye Övgü", en: "Ode to Joy" },
    credit: { tr: "Ludwig van Beethoven", en: "Ludwig van Beethoven" },
    notes: ["e4", "e4", "f4", "g4", "g4", "f4", "e4", "d4", "c4", "c4", "d4", "e4", "e4", "d4", "d4"],
    rhythms: ["quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "half"],
  },
  {
    id: "frere-jacques",
    title: { tr: "Frère Jacques", en: "Frère Jacques" },
    credit: { tr: "Geleneksel Fransız ezgisi", en: "Traditional French melody" },
    notes: ["c5", "d5", "e5", "c5", "c5", "d5", "e5", "c5", "e5", "f5", "g5", "e5", "f5", "g5"],
    rhythms: ["quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "half", "quarter", "quarter", "half"],
  },
  {
    id: "twinkle",
    title: { tr: "Parla Parla Küçük Yıldız", en: "Twinkle, Twinkle, Little Star" },
    credit: { tr: "Geleneksel ezgi", en: "Traditional melody" },
    notes: ["c4", "c4", "g4", "g4", "a4", "a4", "g4", "f4", "f4", "e4", "e4", "d4", "d4", "c4"],
    rhythms: ["quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "half", "quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "half"],
  },
  {
    id: "mary-lamb",
    title: { tr: "Mary Had a Little Lamb", en: "Mary Had a Little Lamb" },
    credit: { tr: "Geleneksel çocuk ezgisi", en: "Traditional children’s melody" },
    notes: ["e4", "d4", "c4", "d4", "e4", "e4", "e4", "d4", "d4", "d4", "e4", "g4", "g4"],
    rhythms: ["quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "half", "quarter", "quarter", "half", "quarter", "quarter", "half"],
  },
  {
    id: "london-bridge",
    title: { tr: "London Bridge", en: "London Bridge" },
    credit: { tr: "Geleneksel İngiliz ezgisi", en: "Traditional English melody" },
    notes: ["g4", "a4", "g4", "f4", "e4", "f4", "g4", "d4", "e4", "f4", "e4", "f4", "g4"],
    rhythms: ["quarter", "quarter", "quarter", "quarter", "quarter", "quarter", "half", "quarter", "quarter", "half", "quarter", "quarter", "half"],
  },
  {
    id: "au-clair-de-la-lune",
    title: { tr: "Au Clair de la Lune", en: "Au Clair de la Lune" },
    credit: { tr: "Geleneksel Fransız ezgisi", en: "Traditional French melody" },
    notes: ["c4", "c4", "c4", "d4", "e4", "d4", "c4", "e4", "d4", "d4", "c4"],
    rhythms: ["quarter", "quarter", "quarter", "quarter", "half", "quarter", "quarter", "quarter", "quarter", "quarter", "half"],
  },
  {
    id: "jingle-bells",
    title: { tr: "Jingle Bells", en: "Jingle Bells" },
    credit: { tr: "James Lord Pierpont", en: "James Lord Pierpont" },
    notes: ["e4", "e4", "e4", "e4", "e4", "e4", "e4", "g4", "c4", "d4", "e4"],
    rhythms: ["quarter", "quarter", "half", "quarter", "quarter", "half", "quarter", "quarter", "quarter", "quarter", "whole"],
  },
  {
    id: "row-your-boat",
    title: { tr: "Row, Row, Row Your Boat", en: "Row, Row, Row Your Boat" },
    credit: { tr: "Geleneksel İngilizce çocuk ezgisi", en: "Traditional English-language nursery melody" },
    notes: ["c4", "c4", "c4", "d4", "e4", "e4", "d4", "e4", "f4", "g4"],
    rhythms: ["quarter", "quarter", "half", "eighth", "quarter", "quarter", "eighth", "quarter", "quarter", "whole"],
  },
];

const RHYTHM_BY_ID = Object.fromEntries(RHYTHM_VALUES.map((rhythm) => [rhythm.id, rhythm])) as Record<RhythmId, { id: RhythmId; beats: number }>;
const PIECE_HISTORY_KEY = "nota-nota-recent-score-pieces";

const COPY = {
  tr: {
    kicker: "Satır okuma",
    title: "Porteyi soldan sağa akıcı oku.",
    lead: "Nota adlarını sırayla işaretle. Serbest akışta kendi hızında ilerle; ritimli akışta porte durmadan devam eder.",
    source: "Satır kaynağı",
    random: "Rastgele satır",
    randomCopy: "Doğal notalar ve birlikten on altılığa kadar karışık değerler.",
    piece: "Bilinen ezgiler",
    pieceCopy: "Tanıdık eserlerden özenle hazırlanmış kısa porte satırları.",
    mode: "Okuma biçimi",
    flow: "Akıcı okuma",
    flowCopy: "Cevabını işaretle ve beklemeden sıradaki notaya geç.",
    rhythm: "Ritimli okuma",
    rhythmCopy: "Her nota kendi süresi içinde cevaplanır; metronom hiç durmaz.",
    tempo: "Tempo",
    start: "Satırı okumaya başla",
    noteValues: "Nota değerleri",
    valueNames: { whole: "Birlik", half: "İkilik", quarter: "Dörtlük", eighth: "Sekizlik", sixteenth: "On altılık", triplet: "Üçleme" } as Record<RhythmId, string>,
    progress: "Satır ilerlemesi",
    choose: "Bu nota hangisi?",
    rhythmHint: "Vuruş bitmeden notayı seç",
    flowHint: "Sıradaki notayı seç",
    exit: "Oturumu bitir",
    restart: "Satırı yeniden başlat",
    complete: "Satırı tamamladın.",
    randomComplete: "Rastgele oluşturulan bu porte satırını baştan sona okudun.",
    pieceComplete: (title: string, credit: string) => `Tebrikler, ${title} eserinden bir satır okudun. Kaynak: ${credit}.`,
    correct: "Doğru",
    mistakes: "Hata",
    accuracy: "Doğruluk",
    review: "Satır sonu düzeltmeleri",
    noMistakes: "Bu satırda kaçırdığın nota olmadı.",
    missed: "Süresi kaçtı",
    answered: (answer: string) => `${answer} işaretlendi`,
    expected: (note: string) => `Doğru nota ${note}`,
    again: "Yeni bir satır oku",
    settings: "Ayarları değiştir",
    choices: "Nota cevapları",
    current: "Etkin nota",
  },
  en: {
    kicker: "Score reading",
    title: "Read the staff fluently from left to right.",
    lead: "Name each note in sequence. Move at your own pace in flow mode, or keep up with a continuous pulse in rhythm mode.",
    source: "Line source",
    random: "Random line",
    randomCopy: "Natural notes with mixed values from whole notes through sixteenths.",
    piece: "Familiar melodies",
    pieceCopy: "Carefully prepared short staff lines from familiar music.",
    mode: "Reading style",
    flow: "Flow reading",
    flowCopy: "Choose an answer and move straight to the next note.",
    rhythm: "Rhythm reading",
    rhythmCopy: "Answer inside each note value while the pulse keeps moving.",
    tempo: "Tempo",
    start: "Start reading the line",
    noteValues: "Note values",
    valueNames: { whole: "Whole", half: "Half", quarter: "Quarter", eighth: "Eighth", sixteenth: "Sixteenth", triplet: "Triplet" } as Record<RhythmId, string>,
    progress: "Line progress",
    choose: "Which note is this?",
    rhythmHint: "Choose before the beat window closes",
    flowHint: "Choose the next note",
    exit: "End session",
    restart: "Restart this line",
    complete: "Line complete.",
    randomComplete: "You read this generated staff line from beginning to end.",
    pieceComplete: (title: string, credit: string) => `Well done. You read a line from ${title}. Source: ${credit}.`,
    correct: "Correct",
    mistakes: "Mistakes",
    accuracy: "Accuracy",
    review: "End-of-line corrections",
    noMistakes: "You did not miss a note in this line.",
    missed: "Missed the window",
    answered: (answer: string) => `You chose ${answer}`,
    expected: (note: string) => `Correct note: ${note}`,
    again: "Read a new line",
    settings: "Change settings",
    choices: "Note answers",
    current: "Current note",
  },
} as const;

function noteName(note: ScoreNote, locale: Locale) {
  return locale === "tr" ? note.solfege : note.letter;
}

function buildPieceLine(piece: Piece): ScoreEvent[] {
  return piece.notes.map((id, index) => ({
    key: `${piece.id}-${index}`,
    note: SCORE_NOTES.find((note) => note.id === id) ?? SCORE_NOTES[0],
    rhythm: RHYTHM_BY_ID[piece.rhythms[index] ?? "quarter"],
  }));
}

function ScoreGlyph({ event, state }: { event: ScoreEvent; state: "future" | "active" | "correct" | "wrong" }) {
  const stemDown = event.note.position >= 4;
  const flagged = event.rhythm.id === "eighth" || event.rhythm.id === "sixteenth" || event.rhythm.id === "triplet";
  return (
    <span className={`score-note score-note--${event.rhythm.id} is-${state}`} style={{ "--score-position": event.note.position } as CSSProperties}>
      {(event.note.position <= -2 || event.note.position >= 10) && <i className="score-note-ledger" />}
      <i className="score-note-head" />
      {event.rhythm.id !== "whole" && <i className={`score-note-stem ${stemDown ? "is-down" : ""}`} />}
      {flagged && <i className={`score-note-flag ${stemDown ? "is-down" : ""}`} />}
      {event.rhythm.id === "sixteenth" && <i className={`score-note-flag score-note-flag--second ${stemDown ? "is-down" : ""}`} />}
      {event.rhythm.id === "triplet" && event.tripletIndex === 1 && <b className="score-note-triplet">3</b>}
    </span>
  );
}

function RhythmSymbol({ id }: { id: RhythmId }) {
  if (id === "triplet") {
    return (
      <span className="rhythm-symbol rhythm-symbol--triplet" aria-hidden="true">
        <i className="rhythm-symbol-beam" />
        <i className="rhythm-symbol-triplet-note is-first" />
        <i className="rhythm-symbol-triplet-note is-second" />
        <i className="rhythm-symbol-triplet-note is-third" />
        <b>3</b>
      </span>
    );
  }

  return (
    <span className={`rhythm-symbol rhythm-symbol--${id}`} aria-hidden="true">
      <i className="rhythm-symbol-head" />
      {id !== "whole" && <i className="rhythm-symbol-stem" />}
      {(id === "eighth" || id === "sixteenth") && <i className="rhythm-symbol-flag" />}
      {id === "sixteenth" && <i className="rhythm-symbol-flag rhythm-symbol-flag--second" />}
    </span>
  );
}

export function ScoreReadingTrainer({ locale, noteSoundEnabled, onSessionActiveChange }: { locale: Locale; noteSoundEnabled: boolean; onSessionActiveChange?: (active: boolean) => void }) {
  const text = COPY[locale];
  const [stage, setStage] = useState<Stage>("setup");
  const [sourceMode, setSourceMode] = useState<SourceMode>("piece");
  const [readingMode, setReadingMode] = useState<ReadingMode>("flow");
  const [bpm, setBpm] = useState(76);
  const [line, setLine] = useState<ScoreEvent[]>([]);
  const [piece, setPiece] = useState<Piece | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [locked, setLocked] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const flowTimerRef = useRef<number | null>(null);
  const answeredIndexRef = useRef<number | null>(null);
  const currentNoteRef = useRef<HTMLSpanElement>(null);
  const current = line[currentIndex];

  const resultByIndex = useMemo(() => new Map(results.map((result) => [result.index, result])), [results]);
  const correctCount = results.filter((result) => result.correct).length;
  const mistakeCount = results.length - correctCount;
  const accuracy = results.length ? Math.round((correctCount / results.length) * 100) : 0;
  const answerChoices = locale === "tr" ? ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"] : ["C", "D", "E", "F", "G", "A", "B"];

  useEffect(() => {
    onSessionActiveChange?.(stage === "playing");
    return () => onSessionActiveChange?.(false);
  }, [onSessionActiveChange, stage]);

  useEffect(() => () => {
    if (flowTimerRef.current) window.clearTimeout(flowTimerRef.current);
  }, []);

  useEffect(() => {
    if (stage !== "playing" || readingMode !== "rhythm" || !current) return;
    answeredIndexRef.current = null;
    const timeout = window.setTimeout(() => {
      if (answeredIndexRef.current !== currentIndex) {
        setResults((items) => [...items, { index: currentIndex, expected: current.note, guessed: null, correct: false, timedOut: true }]);
      }
      if (currentIndex >= line.length - 1) setStage("done");
      else {
        setLocked(false);
        setCurrentIndex((index) => index + 1);
      }
    }, beatDurationMs(current.rhythm.beats, bpm));
    return () => window.clearTimeout(timeout);
  }, [bpm, current, currentIndex, line.length, readingMode, stage]);

  useEffect(() => {
    if (stage === "playing") currentNoteRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIndex, stage]);

  function start() {
    let nextPiece: Piece | null = null;
    let nextLine: ScoreEvent[];
    if (sourceMode === "piece") {
      let recent: string[] = [];
      try { recent = JSON.parse(window.localStorage.getItem(PIECE_HISTORY_KEY) ?? "[]") as string[]; } catch { recent = []; }
      nextPiece = chooseUnrecentPiece(PIECES, recent) as Piece;
      window.localStorage.setItem(PIECE_HISTORY_KEY, JSON.stringify(nextPieceHistory(recent, nextPiece.id, PIECES.length - 1)));
      nextLine = buildPieceLine(nextPiece);
    } else {
      nextLine = generateRandomScoreLine(SCORE_NOTES, 14) as ScoreEvent[];
    }
    const key = Date.now();
    setLine(nextLine);
    setPiece(nextPiece);
    setCurrentIndex(0);
    setResults([]);
    setLocked(false);
    setSessionKey(key);
    answeredIndexRef.current = null;
    setStage("playing");
  }

  function finishLine() {
    setStage("done");
    setLocked(false);
  }

  function answer(choice: string) {
    if (!current || locked || stage !== "playing") return;
    const guessed = (locale === "tr"
      ? ({ Do: "C", Re: "D", Mi: "E", Fa: "F", Sol: "G", La: "A", Si: "B" } as Record<string, Letter>)[choice]
      : choice) as Letter;
    const correct = guessed === current.note.letter;
    const result = { index: currentIndex, expected: current.note, guessed, correct, timedOut: false };
    setResults((items) => [...items, result]);
    setLocked(true);
    answeredIndexRef.current = currentIndex;
    if (correct) playPracticeNote(noteIdToMidi(current.note.id), noteSoundEnabled);

    if (readingMode === "flow") {
      flowTimerRef.current = window.setTimeout(() => {
        if (currentIndex >= line.length - 1) finishLine();
        else {
          setCurrentIndex((index) => index + 1);
          setLocked(false);
        }
      }, 170);
    }
  }

  if (stage === "setup") {
    return (
      <section className="score-reading-shell score-reading-setup">
        <header className="score-reading-hero">
          <div><p className="kicker">{text.kicker}</p><h1>{text.title}</h1><p>{text.lead}</p></div>
          <div className="score-reading-hero-staff" aria-hidden="true"><span>𝄞</span><i /><i /><i /><i /><i /><b /><b /><b /><b /><b /></div>
        </header>

        <div className="score-reading-options">
          <section aria-labelledby="score-source-title"><p className="kicker">{text.source}</p><h2 id="score-source-title">{text.source}</h2><div className="score-option-grid">
            <button type="button" className={sourceMode === "piece" ? "is-selected" : ""} onClick={() => setSourceMode("piece")} aria-pressed={sourceMode === "piece"}><strong>{text.piece}</strong><span>{text.pieceCopy}</span><i /></button>
            <button type="button" className={sourceMode === "random" ? "is-selected" : ""} onClick={() => setSourceMode("random")} aria-pressed={sourceMode === "random"}><strong>{text.random}</strong><span>{text.randomCopy}</span><i /></button>
          </div></section>
          <section aria-labelledby="score-mode-title"><p className="kicker">{text.mode}</p><h2 id="score-mode-title">{text.mode}</h2><div className="score-option-grid">
            <button type="button" className={readingMode === "flow" ? "is-selected" : ""} onClick={() => setReadingMode("flow")} aria-pressed={readingMode === "flow"}><strong>{text.flow}</strong><span>{text.flowCopy}</span><i /></button>
            <button type="button" className={readingMode === "rhythm" ? "is-selected" : ""} onClick={() => setReadingMode("rhythm")} aria-pressed={readingMode === "rhythm"}><strong>{text.rhythm}</strong><span>{text.rhythmCopy}</span><i /></button>
          </div></section>
        </div>

        <div className="score-reading-start-card">
          <div><p className="kicker">{text.noteValues}</p><div className="rhythm-legend">{RHYTHM_VALUES.map((rhythm) => <span key={rhythm.id}><RhythmSymbol id={rhythm.id as RhythmId} />{text.valueNames[rhythm.id as RhythmId]}</span>)}</div></div>
          {readingMode === "rhythm" && <label className="tempo-control"><span>{text.tempo}</span><strong>{bpm} BPM</strong><input type="range" min="60" max="112" step="4" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label>}
          <button className="primary-button" type="button" onClick={start}>{text.start} <span aria-hidden="true">→</span></button>
        </div>
      </section>
    );
  }

  if (stage === "done") {
    return (
      <section className="score-reading-shell score-reading-results">
        <CommunityPracticeRecorder active={results.length > 0} activityKey={`score-reading-${sessionKey}`} />
        <p className="kicker">{text.kicker}</p>
        <h1>{text.complete}</h1>
        <p>{piece ? text.pieceComplete(piece.title[locale], piece.credit[locale]) : text.randomComplete}</p>
        <dl className="score-reading-stats"><div><dt>{text.correct}</dt><dd>{correctCount} / {line.length}</dd></div><div><dt>{text.mistakes}</dt><dd>{mistakeCount}</dd></div><div><dt>{text.accuracy}</dt><dd>%{accuracy}</dd></div></dl>
        <section className="score-reading-review" aria-labelledby="score-review-title"><h2 id="score-review-title">{text.review}</h2>
          {mistakeCount === 0 ? <p>{text.noMistakes}</p> : <ol>{results.filter((result) => !result.correct).map((result) => <li key={result.index}><b>{result.index + 1}</b><span>{text.expected(noteName(result.expected, locale))}</span><small>{result.timedOut ? text.missed : text.answered(locale === "tr" ? SCORE_NOTES.find((note) => note.letter === result.guessed)?.solfege ?? "" : result.guessed ?? "")}</small></li>)}</ol>}
        </section>
        <CommunityPracticeStreak compact />
        <div className="score-reading-result-actions"><button className="primary-button" type="button" onClick={start}>{text.again} <span aria-hidden="true">↻</span></button><button className="secondary-button" type="button" onClick={() => setStage("setup")}>{text.settings}</button></div>
      </section>
    );
  }

  const windowMs = current ? beatDurationMs(current.rhythm.beats, bpm) : 1000;
  return (
    <section className="score-reading-shell score-reading-session">
      <div className="score-reading-session-top"><button type="button" onClick={finishLine}>← {text.exit}</button><div><span>{text.progress}</span><strong>{Math.min(currentIndex + 1, line.length)} / {line.length}</strong></div><button type="button" onClick={start}>{text.restart}</button></div>
      <div className="score-reading-card">
        <div className="score-reading-context"><p className="kicker">{piece ? piece.title[locale] : text.random}</p><span>{piece?.credit[locale] ?? text.randomCopy}</span></div>
        <div className="score-line-scroll" role="region" aria-label={text.progress} tabIndex={0}>
          <div className="score-line"><span className="score-line-clef" aria-hidden="true">𝄞</span><div className="score-line-notes">
            {line.map((event, index) => {
              const result = resultByIndex.get(index);
              const state = result ? result.correct ? "correct" : "wrong" : index === currentIndex ? "active" : "future";
              return <span ref={index === currentIndex ? currentNoteRef : undefined} className="score-event" key={event.key} aria-label={`${index + 1}. ${index === currentIndex ? text.current : ""}`}><ScoreGlyph event={event} state={state} /><small>{text.valueNames[event.rhythm.id]}</small></span>;
            })}
          </div></div>
        </div>
        {readingMode === "rhythm" && current && <div className="rhythm-window" key={`${currentIndex}-${sessionKey}`} style={{ "--rhythm-window": `${windowMs}ms` } as CSSProperties}><span /></div>}
        <div className="score-answer-area"><div><p>{text.choose}</p><span>{readingMode === "rhythm" ? text.rhythmHint : text.flowHint}</span></div><div className="score-answer-grid" role="group" aria-label={text.choices}>{answerChoices.map((choice) => <button type="button" key={choice} onClick={() => answer(choice)} disabled={locked}>{choice}</button>)}</div></div>
      </div>
    </section>
  );
}
