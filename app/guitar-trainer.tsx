"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { noteClassFromAnswer } from "@/lib/session-insights.mjs";
import { playPracticeNote } from "@/lib/practice-audio";
import { CommunityPracticeRecorder, CommunityPracticeStreak } from "./community";

type Locale = "tr" | "en";
type GuitarStage = "setup" | "quiz" | "done";
type GuitarMode = "name-note" | "staff-to-fretboard";
type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

type GuitarQuestion = {
  id: string;
  stringId: string;
  stringNumber: number;
  fret: number;
  letter: Letter;
  midi: number;
  misses: number;
};

const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NATURAL = new Set<Letter>(["C", "D", "E", "F", "G", "A", "B"]);
const SOLFEGE: Record<Letter, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
const STRINGS = [
  { id: "e-high", number: 1, label: "e", open: "E", openMidi: 64 },
  { id: "b", number: 2, label: "B", open: "B", openMidi: 59 },
  { id: "g", number: 3, label: "G", open: "G", openMidi: 55 },
  { id: "d", number: 4, label: "D", open: "D", openMidi: 50 },
  { id: "a", number: 5, label: "A", open: "A", openMidi: 45 },
  { id: "e-low", number: 6, label: "E", open: "E", openMidi: 40 },
] as const;
const DISPLAY_STRINGS = [...STRINGS].reverse();

const RANGES = {
  tr: [
    { frets: 3, eyebrow: "Başlangıç", title: "Açık teller + 3 perde", copy: "Sapın başlangıcındaki doğal notalar" },
    { frets: 5, eyebrow: "Gelişen", title: "İlk 5 perde", copy: "Daha geniş, hâlâ kolay takip edilen alan" },
    { frets: 12, eyebrow: "Tam harita", title: "İlk 12 perde", copy: "Her telde bir oktavlık klavye alanı" },
  ],
  en: [
    { frets: 3, eyebrow: "Starter", title: "Open strings + 3 frets", copy: "Natural notes near the nut" },
    { frets: 5, eyebrow: "Growing", title: "First 5 frets", copy: "A broader range that stays easy to scan" },
    { frets: 12, eyebrow: "Full map", title: "First 12 frets", copy: "One octave of fretboard on every string" },
  ],
} as const;

const COPY = {
  tr: {
    kicker: "Gitar, standart akort",
    title: "Klavye üzerinde notaları bul.",
    lead: "Doğal notaların gitardaki yerlerini gör, sonra işaretlenen tel ve perdeyi okuyarak hafızanı güçlendir.",
    range: "Çalışma alanını seç",
    terminology: "Perde mi, pozisyon mu?",
    terminologyCopy: "Metal bölmeler perde olarak adlandırılır. Pozisyon ise elinin klavye üzerindeki yeridir; çoğunlukla işaret parmağının bulunduğu perdeyle adlandırılır.",
    map: "Doğal nota haritası",
    mapCount: (count: number) => `${count} doğal nota konumu`,
    studyTitle: "Notaları önce incele",
    studyCopy: "Bir nota seç ve bu aralıktaki bütün tel ve perde konumlarını birlikte gör.",
    studyAll: "Tümü",
    studyChoices: "İncelenecek nota",
    orientationHint: "Klavye haritasını daha rahat görmek için telefonunu yan çevirebilirsin.",
    selectedRange: "Seçili çalışma alanı",
    mode: "Nasıl çalışmak istiyorsun?",
    nameMode: "Konumu gör, notayı bul",
    nameModeCopy: "İşaretlenen tel ve perdenin nota adını yaz.",
    positionMode: "Porteyi gör, gitarda bul",
    positionModeCopy: "Portedeki notanın doğru tel ve perde konumunu seç.",
    start: "Gitar çalışmasını başlat",
    startReady: "Haritayı incelediğinde seçtiğin aralıkla kısa bir tura başlayabilirsin.",
    progress: "İlerleme",
    question: "İşaretlenen nota hangisi?",
    positionQuestion: "Bu nota gitarda nerede?",
    staffTarget: "Portedeki nota",
    staffTargetCopy: "Oktavlı sol anahtarı",
    choosePosition: "Gitar klavyesinde bir tel ve perde seç",
    location: (stringNumber: number, fret: number) => `${stringNumber}. tel, ${fret === 0 ? "açık tel" : `${fret}. perde`}`,
    target: "Sorulan konum",
    exit: "Oturumdan çık",
    answer: "Cevabını yaz",
    placeholder: "Do, Re, Mi…",
    check: "Kontrol et",
    correct: "Doğru",
    incorrect: "Yanlış",
    wrongCopy: (name: string) => `Doğru nota ${name}. Bu konum listenin sonuna eklendi.`,
    positionWrongCopy: (locations: string) => `Doğru konum: ${locations}. Bu nota listenin sonuna eklendi.`,
    next: "Sonraki",
    complete: "Klavye turu tamamlandı",
    completeCopy: "Seçtiğin alandaki bütün doğal nota konumlarını en az bir kez doğru buldun.",
    positionCompleteCopy: "Portede gösterilen bütün doğal sesleri gitar klavyesinde en az bir kez doğru buldun.",
    unique: "Nota konumu",
    writtenNotes: "Portedeki nota",
    firstTry: "İlk denemede doğru",
    wrong: "Toplam yanlış",
    average: "Ortalama cevap",
    repeat: "Aynı aralıkla yeniden çalış",
    change: "Perde aralığını değiştir",
    choices: "Nota seçenekleri",
    modeChoices: "Gitar çalışma biçimleri",
    positionChoices: "Gitar klavyesindeki konum seçenekleri",
  },
  en: {
    kicker: "Guitar, standard tuning",
    title: "Find every note on the fretboard.",
    lead: "Explore where natural notes live on the guitar, then build recall by naming the highlighted string and fret.",
    range: "Choose your fret range",
    terminology: "Frets or positions?",
    terminologyCopy: "The metal divisions are frets. A position describes where your fretting hand sits, usually named for the fret under your first finger.",
    map: "Natural-note map",
    mapCount: (count: number) => `${count} natural-note locations`,
    studyTitle: "Study the notes first",
    studyCopy: "Choose a note to highlight every matching string and fret in this range.",
    studyAll: "All",
    studyChoices: "Note to study",
    orientationHint: "Turn your phone sideways for a clearer view of the fretboard.",
    selectedRange: "Selected practice range",
    mode: "How do you want to practise?",
    nameMode: "See a position, name the note",
    nameModeCopy: "Type the note at the highlighted string and fret.",
    positionMode: "See the staff, find it on guitar",
    positionModeCopy: "Choose the matching string and fret for the written note.",
    start: "Start guitar practice",
    startReady: "When you have scanned the map, begin a short round with this range.",
    progress: "Progress",
    question: "Which note is highlighted?",
    positionQuestion: "Where is this note on the guitar?",
    staffTarget: "Written note",
    staffTargetCopy: "Octave treble clef",
    choosePosition: "Choose a string and fret on the guitar",
    location: (stringNumber: number, fret: number) => `String ${stringNumber}, ${fret === 0 ? "open string" : `fret ${fret}`}`,
    target: "Target location",
    exit: "Exit session",
    answer: "Type your answer",
    placeholder: "C, D, E…",
    check: "Check answer",
    correct: "Correct",
    incorrect: "Incorrect",
    wrongCopy: (name: string) => `The correct note is ${name}. This location moved to the end of the queue.`,
    positionWrongCopy: (locations: string) => `Correct position: ${locations}. This note moved to the end of the queue.`,
    next: "Next",
    complete: "Fretboard round complete",
    completeCopy: "You found every natural-note location in the selected range at least once.",
    positionCompleteCopy: "You matched every written natural pitch to the fretboard at least once.",
    unique: "Note locations",
    writtenNotes: "Written notes",
    firstTry: "Correct first time",
    wrong: "Incorrect answers",
    average: "Average response",
    repeat: "Practise this range again",
    change: "Change fret range",
    choices: "Note choices",
    modeChoices: "Guitar practice modes",
    positionChoices: "Fretboard position choices",
  },
} as const;

function noteAt(open: string, fret: number) {
  return CHROMATIC[(CHROMATIC.indexOf(open) + fret) % CHROMATIC.length];
}

function buildQuestions(maxFret: number): GuitarQuestion[] {
  const questions: GuitarQuestion[] = [];
  for (const string of STRINGS) {
    for (let fret = 0; fret <= maxFret; fret += 1) {
      const letter = noteAt(string.open, fret);
      if (!NATURAL.has(letter as Letter)) continue;
      questions.push({
        id: `${string.id}-${fret}`,
        stringId: string.id,
        stringNumber: string.number,
        fret,
        letter: letter as Letter,
        midi: string.openMidi + fret,
        misses: 0,
      });
    }
  }
  return questions;
}

function buildPitchQuestions(maxFret: number) {
  const byPitch = new Map<number, GuitarQuestion>();
  for (const question of buildQuestions(maxFret)) {
    if (!byPitch.has(question.midi)) byPitch.set(question.midi, question);
  }
  return [...byPitch.values()];
}

const DIATONIC_INDEX: Record<Letter, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

function writtenStaffPosition(question: GuitarQuestion) {
  const writtenMidi = question.midi + 12;
  const octave = Math.floor(writtenMidi / 12) - 1;
  return octave * 7 + DIATONIC_INDEX[question.letter] - (4 * 7 + DIATONIC_INDEX.E);
}

function guitarLedgerPositions(position: number) {
  return [-8, -6, -4, -2, 10, 12, 14, 16].filter((ledger) => (
    ledger < 0 ? position <= ledger : position >= ledger
  ));
}

function GuitarStaffNote({ question, locale }: { question: GuitarQuestion; locale: Locale }) {
  const position = writtenStaffPosition(question);
  const firstLineY = 126;
  const step = 12;
  const noteY = firstLineY - position * (step / 2);
  const stemDown = position >= 4;

  return (
    <div className="guitar-staff-frame">
      <div
        className="staff guitar-staff-note"
        role="img"
        aria-label={locale === "tr"
          ? `Oktavlı sol anahtarında ${noteName(question.letter, locale)} notası`
          : `${noteName(question.letter, locale)} on the octave treble staff`}
      >
        <span className="clef" aria-hidden="true">𝄞</span>
        <span className="guitar-clef-eight" aria-hidden="true">8</span>
        <div className="staff-lines" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} style={{ left: 42, width: 390, top: firstLineY - index * step }} />
          ))}
          {guitarLedgerPositions(position).map((ledger) => (
            <span className="ledger" key={ledger} style={{ left: 208, width: 44, top: firstLineY - ledger * (step / 2) }} />
          ))}
          <span className="note-head" style={{ left: 230, top: noteY }} />
          <span
            className="note-stem"
            style={{ left: 230 + (stemDown ? -11 : 11), top: stemDown ? noteY : noteY - 45 }}
          />
        </div>
      </div>
    </div>
  );
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function noteName(letter: Letter, locale: Locale) {
  return locale === "tr" ? SOLFEGE[letter] : letter;
}

function Fretboard({
  maxFret,
  locale,
  active,
  reveal = false,
  onSelect,
  selectedPosition,
  selectionFeedback,
  studyLetter = null,
  orientationHint,
}: {
  maxFret: number;
  locale: Locale;
  active?: GuitarQuestion;
  reveal?: boolean;
  onSelect?: (position: GuitarQuestion) => void;
  selectedPosition?: GuitarQuestion | null;
  selectionFeedback?: "correct" | "wrong" | null;
  studyLetter?: Letter | null;
  orientationHint?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const columns = `46px repeat(${maxFret + 1}, minmax(58px, 1fr)) 46px`;
  const displayedFrets = Array.from({ length: maxFret + 1 }, (_, index) => maxFret - index);
  const interactive = Boolean(onSelect);

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (scrollArea) scrollArea.scrollLeft = scrollArea.scrollWidth;
  }, [maxFret]);

  useEffect(() => {
    if (interactive && !selectionFeedback) firstChoiceRef.current?.focus({ preventScroll: true });
  }, [active?.id, interactive, selectionFeedback]);

  return (
    <div className="fretboard-experience">
      {orientationHint && <p className="fretboard-orientation-hint"><span aria-hidden="true">↻</span>{orientationHint}</p>}
      <div
        className="fretboard-scroll"
        ref={scrollRef}
        role="region"
        tabIndex={0}
        aria-label={interactive
          ? locale === "tr" ? "Portedeki notanın gitar klavyesindeki konumunu seç" : "Choose the written note's position on the fretboard"
          : active
          ? locale === "tr" ? `${active.stringNumber}. tel, ${active.fret === 0 ? "açık tel" : `${active.fret}. perde`} işaretli` : `String ${active.stringNumber}, ${active.fret === 0 ? "open string" : `fret ${active.fret}`} highlighted`
          : locale === "tr" ? `Açık tellerden ${maxFret}. perdeye doğal nota haritası` : `Natural-note map from open strings to fret ${maxFret}`}
      >
      {reveal && (
        <ul className="sr-only">
          {DISPLAY_STRINGS.flatMap((string) => displayedFrets.map((fret) => {
            const letter = noteAt(string.open, fret);
            if (!NATURAL.has(letter as Letter)) return null;
            return (
              <li key={`${string.id}-${fret}`}>
                {locale === "tr"
                  ? `${string.number}. tel, ${fret === 0 ? "açık tel" : `${fret}. perde`}: ${noteName(letter as Letter, locale)}`
                  : `String ${string.number}, ${fret === 0 ? "open string" : `fret ${fret}`}: ${noteName(letter as Letter, locale)}`}
              </li>
            );
          }))}
        </ul>
      )}
      <div className={`fretboard fretboard--range-${maxFret} ${interactive ? "fretboard--interactive" : ""}`} aria-hidden={interactive ? undefined : true} style={{ minWidth: `${Math.max(650, 120 + (maxFret + 1) * 64)}px` }}>
        <div className="fretboard-fret-numbers" style={{ gridTemplateColumns: columns }}>
          <span />
          {displayedFrets.map((fret) => <span className={fret === 0 ? "is-open" : ""} key={fret}>{fret === 0 ? (locale === "tr" ? "Açık tel" : "Open") : locale === "tr" ? `${fret}. perde` : `Fret ${fret}`}</span>)}
          <span />
        </div>
        {DISPLAY_STRINGS.map((string) => (
          <div className={`fretboard-string fretboard-string--${string.number}`} style={{ gridTemplateColumns: columns }} key={string.id}>
            <strong className="fretboard-string-number" aria-label={locale === "tr" ? `${string.number}. tel` : `String ${string.number}`}>{string.number}</strong>
            {displayedFrets.map((fret) => {
              const letter = noteAt(string.open, fret);
              const natural = NATURAL.has(letter as Letter);
              const highlighted = !interactive && active?.stringId === string.id && active.fret === fret;
              const position: GuitarQuestion | null = natural ? {
                id: `${string.id}-${fret}`,
                stringId: string.id,
                stringNumber: string.number,
                fret,
                letter: letter as Letter,
                midi: string.openMidi + fret,
                misses: 0,
              } : null;
              const selected = selectedPosition?.stringId === string.id && selectedPosition.fret === fret;
              const correct = Boolean(selectionFeedback && active && position?.midi === active.midi);
              return (
                <span className={`fret-cell ${fret === 0 ? "fret-cell--open" : ""}`} key={fret}>
                  {interactive && position && onSelect ? (
                    <button
                      className={`fret-note fret-note--choice ${selected ? "is-selected" : ""} ${correct ? "is-correct" : ""} ${selectionFeedback === "wrong" && selected && !correct ? "is-wrong" : ""}`}
                      type="button"
                      ref={string.id === "e-low" && fret === Math.min(maxFret, 3) ? firstChoiceRef : undefined}
                      onClick={() => onSelect(position)}
                      disabled={Boolean(selectionFeedback)}
                      aria-label={locale === "tr" ? `${string.number}. tel, ${fret === 0 ? "açık tel" : `${fret}. perde`}` : `String ${string.number}, ${fret === 0 ? "open string" : `fret ${fret}`}`}
                      aria-pressed={selected}
                    >
                      {correct ? noteName(position.letter, locale) : selectionFeedback === "wrong" && selected ? "×" : ""}
                    </button>
                  ) : (highlighted || (reveal && natural)) && (
                    <i className={`fret-note ${highlighted ? "is-active" : ""} ${reveal && studyLetter === letter ? "is-study-focus" : ""} ${reveal && studyLetter && studyLetter !== letter ? "is-study-muted" : ""}`}>
                      {reveal ? noteName(letter as Letter, locale) : "?"}
                    </i>
                  )}
                </span>
              );
            })}
            <strong className="fretboard-string-number fretboard-string-number--end" aria-hidden="true">{string.number}</strong>
          </div>
        ))}
        <div className="fretboard-inlays" aria-hidden="true">
          {[3, 5, 7, 9, 12].filter((fret) => fret <= maxFret).map((fret) => <i key={fret} style={{ left: `calc(46px + ${(maxFret - fret + .5) / (maxFret + 1)} * (100% - 92px))` }} />)}
        </div>
      </div>
      </div>
    </div>
  );
}

export function GuitarTrainer({
  locale,
  noteSoundEnabled,
  onSessionActiveChange,
}: {
  locale: Locale;
  noteSoundEnabled: boolean;
  onSessionActiveChange?: (active: boolean) => void;
}) {
  const [stage, setStage] = useState<GuitarStage>("setup");
  const [maxFret, setMaxFret] = useState(3);
  const [practiceMode, setPracticeMode] = useState<GuitarMode>("name-note");
  const [studyLetter, setStudyLetter] = useState<Letter | null>(null);
  const [queue, setQueue] = useState<GuitarQuestion[]>([]);
  const [answer, setAnswer] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<GuitarQuestion | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [feedbackQuestion, setFeedbackQuestion] = useState<GuitarQuestion | null>(null);
  const [firstTry, setFirstTry] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [initialCount, setInitialCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const text = COPY[locale];
  const ranges = RANGES[locale];
  const selectedRange = ranges.find((range) => range.frets === maxFret) ?? ranges[0];
  const current = queue[0];
  const displayed = feedbackQuestion ?? current;
  const choices = locale === "tr" ? Object.values(SOLFEGE) : Object.keys(SOLFEGE);
  const completed = initialCount - queue.length;
  const average = times.length ? `${(times.reduce((sum, time) => sum + time, 0) / times.length / 1000).toFixed(2).replace(".", locale === "tr" ? "," : ".")} ${locale === "tr" ? "sn" : "sec"}` : `0${locale === "tr" ? "," : "."}00`;
  const matchingLocations = displayed
    ? buildQuestions(maxFret).filter((question) => question.midi === displayed.midi).map((question) => text.location(question.stringNumber, question.fret)).join(locale === "tr" ? ", " : "; ")
    : "";

  const previewQuestions = useMemo(() => buildQuestions(maxFret), [maxFret]);

  useEffect(() => {
    onSessionActiveChange?.(stage === "quiz");
    return () => onSessionActiveChange?.(false);
  }, [onSessionActiveChange, stage]);

  useEffect(() => {
    if (stage === "quiz" && feedback) {
      feedbackButtonRef.current?.focus({ preventScroll: true });
    } else if (stage === "quiz" && practiceMode === "name-note") {
      const hasDesktopPointer = typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      if (hasDesktopPointer) inputRef.current?.focus({ preventScroll: true });
    } else if (stage === "done") {
      resultsHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [feedback, practiceMode, stage]);

  function start() {
    const sessionStartedAt = Date.now();
    const questions = shuffle(practiceMode === "staff-to-fretboard" ? buildPitchQuestions(maxFret) : buildQuestions(maxFret));
    setInitialCount(questions.length);
    setQueue(questions);
    setFirstTry(0);
    setWrong(0);
    setTimes([]);
    setAnswer("");
    setSelectedPosition(null);
    setFeedback(null);
    setFeedbackQuestion(null);
    setStartedAt(sessionStartedAt);
    setSessionKey(sessionStartedAt);
    setStage("quiz");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    answerQuestion(answer);
  }

  function finishCorrectAnswer(question: GuitarQuestion) {
    playPracticeNote(question.midi, noteSoundEnabled);
    if (question.misses === 0) setFirstTry((count) => count + 1);
    setQueue((items) => items.slice(1));
    setFeedback("correct");
  }

  function answerQuestion(value: string) {
    if (!current || feedback) return;
    const guessed = noteClassFromAnswer(value);
    if (!guessed) return;
    setFeedbackQuestion(current);
    setAnswer(value);
    setTimes((items) => [...items, Math.max(100, Date.now() - startedAt)]);
    if (guessed.letter === current.letter) {
      finishCorrectAnswer(current);
    } else {
      setWrong((count) => count + 1);
      setQueue((items) => [...items.slice(1), { ...items[0], misses: items[0].misses + 1 }]);
      setFeedback("wrong");
    }
  }

  function answerPosition(position: GuitarQuestion) {
    if (!current || feedback || practiceMode !== "staff-to-fretboard") return;
    setFeedbackQuestion(current);
    setSelectedPosition(position);
    setTimes((items) => [...items, Math.max(100, Date.now() - startedAt)]);
    if (position.midi === current.midi) {
      finishCorrectAnswer(current);
    } else {
      setWrong((count) => count + 1);
      setQueue((items) => [...items.slice(1), { ...items[0], misses: items[0].misses + 1 }]);
      setFeedback("wrong");
    }
  }

  function next() {
    if (queue.length === 0) {
      setStage("done");
      setFeedback(null);
      return;
    }
    setAnswer("");
    setSelectedPosition(null);
    setFeedback(null);
    setFeedbackQuestion(null);
    setStartedAt(Date.now());
  }

  if (stage === "setup") {
    return (
      <section className="guitar-shell guitar-setup">
        <div className="guitar-hero">
          <div>
            <p className="kicker">{text.kicker}</p>
            <h1>{text.title}</h1>
            <p>{text.lead}</p>
          </div>
          <div className="guitar-neck-art" aria-hidden="true"><span>6</span><i /><i /><i /><i /><i /><i /><b>12</b></div>
        </div>

        <div className="guitar-range-heading">
          <div><p className="kicker" aria-hidden="true">⚬</p><h2>{text.range}</h2></div>
          <aside><strong>{text.terminology}</strong><span>{text.terminologyCopy}</span></aside>
        </div>
        <div className="guitar-range-grid">
          {ranges.map((range) => (
            <button className={maxFret === range.frets ? "is-selected" : ""} type="button" key={range.frets} onClick={() => setMaxFret(range.frets)} aria-pressed={maxFret === range.frets}>
              <small>{range.eyebrow}</small><strong>{range.title}</strong><span>{range.copy}</span><i />
            </button>
          ))}
        </div>

        <div className="guitar-mode-section">
          <div className="guitar-range-heading">
            <div><p className="kicker" aria-hidden="true">⚬</p><h2>{text.mode}</h2></div>
          </div>
          <div className="mode-grid guitar-mode-grid" role="group" aria-label={text.modeChoices}>
            <button className={`mode-card ${practiceMode === "name-note" ? "is-selected" : ""}`} type="button" onClick={() => setPracticeMode("name-note")} aria-pressed={practiceMode === "name-note"}>
              <span className="guitar-mode-icon guitar-mode-icon--position" aria-hidden="true"><i /><b>?</b></span>
              <span><strong>{text.nameMode}</strong><small>{text.nameModeCopy}</small></span>
              <i className="selection-indicator" aria-hidden="true" />
            </button>
            <button className={`mode-card ${practiceMode === "staff-to-fretboard" ? "is-selected" : ""}`} type="button" onClick={() => setPracticeMode("staff-to-fretboard")} aria-pressed={practiceMode === "staff-to-fretboard"}>
              <span className="guitar-mode-icon guitar-mode-icon--staff" aria-hidden="true"><i /><i /><i /><i /><i /><b /></span>
              <span><strong>{text.positionMode}</strong><small>{text.positionModeCopy}</small></span>
              <i className="selection-indicator" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="fretboard-card">
          <div className="fretboard-card-heading">
            <div><p className="kicker" aria-hidden="true">⚬</p><h2>{text.map}</h2></div>
            <aside>
              <small>{text.selectedRange}</small>
              <strong>{selectedRange.title}</strong>
              <span>{selectedRange.copy}</span>
              <b>{text.mapCount(previewQuestions.length)}</b>
            </aside>
          </div>
          <div className="guitar-study-tools">
            <div><p className="kicker">{text.studyTitle}</p><span>{text.studyCopy}</span></div>
            <div className="guitar-study-note-choices" role="group" aria-label={text.studyChoices}>
              <button type="button" aria-pressed={studyLetter === null} onClick={() => setStudyLetter(null)}>{text.studyAll}</button>
              {(Object.keys(SOLFEGE) as Letter[]).map((letter) => (
                <button type="button" key={letter} aria-pressed={studyLetter === letter} onClick={() => setStudyLetter(letter)}>{noteName(letter, locale)}</button>
              ))}
            </div>
          </div>
          <Fretboard maxFret={maxFret} locale={locale} reveal studyLetter={studyLetter} orientationHint={text.orientationHint} />
        </div>
        <div className="guitar-start-panel">
          <div><p className="kicker" aria-hidden="true">⚬</p><strong>{practiceMode === "name-note" ? text.nameMode : text.positionMode}</strong><span>{selectedRange.title}. {text.startReady}</span></div>
          <button className="primary-button" type="button" onClick={start}>{text.start} <span aria-hidden="true">→</span></button>
        </div>
      </section>
    );
  }

  if (stage === "done") {
    return (
      <section className="guitar-shell guitar-results">
        <CommunityPracticeRecorder active activityKey={`guitar-${practiceMode}-${sessionKey}`} />
        <p className="kicker">{text.kicker}</p>
        <h1 ref={resultsHeadingRef} tabIndex={-1}>{text.complete}</h1>
        <p>{practiceMode === "name-note" ? text.completeCopy : text.positionCompleteCopy}</p>
        <div className="guitar-stats">
          <div><strong>{initialCount}</strong><span>{practiceMode === "name-note" ? text.unique : text.writtenNotes}</span></div>
          <div><strong>{firstTry}</strong><span>{text.firstTry}</span></div>
          <div><strong>{wrong}</strong><span>{text.wrong}</span></div>
          <div><strong>{average}</strong><span>{text.average}</span></div>
        </div>
        <CommunityPracticeStreak compact />
        <div className="guitar-actions">
          <button className="primary-button" type="button" onClick={start}>{text.repeat} <span aria-hidden="true">↻</span></button>
          <button className="secondary-button" type="button" onClick={() => setStage("setup")}>{text.change}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="guitar-shell guitar-quiz">
      <div className="guitar-quiz-top">
        <button className="guitar-exit-button" type="button" onClick={() => setStage("setup")}><span aria-hidden="true">←</span> {text.exit}</button>
        <div role="progressbar" aria-label={text.progress} aria-valuemin={0} aria-valuemax={initialCount} aria-valuenow={completed}><span>{text.progress}</span><strong>{completed} / {initialCount}</strong></div>
      </div>
      <div className="guitar-question-card">
        {displayed && (
          <div className="guitar-target-location">
            <span>{practiceMode === "name-note" ? text.target : text.staffTarget}</span>
            <strong>{practiceMode === "name-note" ? text.location(displayed.stringNumber, displayed.fret) : text.staffTargetCopy}</strong>
          </div>
        )}
        <h1>{practiceMode === "name-note" ? text.question : text.positionQuestion}</h1>
        {displayed && practiceMode === "staff-to-fretboard" && <GuitarStaffNote question={displayed} locale={locale} />}
        {displayed && (
          <Fretboard
            maxFret={maxFret}
            locale={locale}
            active={displayed}
            onSelect={practiceMode === "staff-to-fretboard" ? answerPosition : undefined}
            selectedPosition={selectedPosition}
            selectionFeedback={feedback}
            orientationHint={text.orientationHint}
          />
        )}
        {!feedback && practiceMode === "name-note" ? (
          <form className="guitar-answer" onSubmit={submit}>
            <label htmlFor="guitar-answer">{text.answer}</label>
            <div><input id="guitar-answer" ref={inputRef} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={text.placeholder} autoComplete="off" autoCorrect="off" autoCapitalize="none" enterKeyHint="done" spellCheck={false} /><button type="submit">{text.check}</button></div>
            <div className="guitar-note-choices" role="group" aria-label={text.choices}>{choices.map((choice) => <button type="button" key={choice} onClick={() => answerQuestion(choice)}>{choice}</button>)}</div>
          </form>
        ) : !feedback ? (
          <p className="guitar-position-instruction" id="guitar-position-instruction">{text.choosePosition}</p>
        ) : (
          <div className={`guitar-feedback guitar-feedback--${feedback}`} role="status" aria-live="polite" aria-atomic="true">
            <div id="guitar-feedback-message">
              <strong>{feedback === "correct" ? text.correct : text.incorrect}</strong>
              <span>{practiceMode === "name-note"
                ? feedback === "correct" ? noteName(feedbackQuestion?.letter ?? "C", locale) : text.wrongCopy(noteName(feedbackQuestion?.letter ?? "C", locale))
                : feedback === "correct" ? text.location(selectedPosition?.stringNumber ?? 1, selectedPosition?.fret ?? 0) : text.positionWrongCopy(matchingLocations)}</span>
            </div>
            <button ref={feedbackButtonRef} type="button" aria-describedby="guitar-feedback-message" onClick={next}>{text.next} →</button>
          </div>
        )}
      </div>
    </section>
  );
}
