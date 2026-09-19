"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { noteClassFromAnswer } from "@/lib/session-insights.mjs";
import { playPracticeNote } from "@/lib/practice-audio";
import { CommunityPracticeRecorder, CommunityPracticeStreak } from "./community";

type Locale = "tr" | "en";
type GuitarStage = "setup" | "quiz" | "done";
type GuitarMode = "name-note" | "staff-to-fretboard" | "staff-to-location";
type GuitarSessionType = "standard" | "endless";
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
    { frets: 3, eyebrow: "Başlangıç", title: "Boş teller + 3 perde", copy: "Sapın başlangıcındaki doğal notalar" },
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
    positionModeCopy: "Portedeki sesin seçili aralıktaki bütün tel ve perde konumlarını işaretle.",
    locationMode: "Porteyi gör, tel ve perdeyi seç",
    locationModeCopy: "Gitar klavyesini görmeden doğru tel ve perde konumlarını işaretle.",
    start: "Gitar çalışmasını başlat",
    startReady: "Haritayı incelediğinde seçtiğin aralıkla kısa bir tura başlayabilirsin.",
    progress: "İlerleme",
    question: "İşaretlenen nota hangisi?",
    positionQuestion: "Bu nota gitarda nerede?",
    staffTarget: "Portedeki nota",
    staffTargetCopy: "Oktavlı sol anahtarı",
    choosePosition: "Gitar klavyesindeki bütün doğru konumları işaretle",
    positionProgress: (selected: number, total: number) => `${selected} / ${total} konum bulundu`,
    positionCount: (count: number) => `${count} doğru konum`,
    stringChoice: "Tel",
    fretChoice: "Perde",
    emptyString: "Boş tel",
    markLocation: "Konumu işaretle",
    markedLocations: "İşaretlediğin doğru konumlar",
    locationChoices: "Tel ve perde seçenekleri",
    showNoteNames: "Nota adlarını göster",
    hideNoteNames: "Nota adlarını gizle",
    location: (stringNumber: number, fret: number) => `${stringNumber}. tel, ${fret === 0 ? "boş tel" : `${fret}. perde`}`,
    target: "Sorulan konum",
    exit: "Oturumdan çık",
    answer: "Cevabını yaz",
    placeholder: "Do, Re, Mi…",
    check: "Kontrol et",
    correct: "Doğru",
    incorrect: "Yanlış",
    wrongCopy: (name: string) => `Doğru nota ${name}. Bu konum listenin sonuna eklendi.`,
    positionCorrectCopy: (locations: string) => `Bütün doğru konumları buldun: ${locations}.`,
    positionWrongCopy: (locations: string) => `Doğru konumlar: ${locations}. Bu nota listenin sonuna eklendi.`,
    next: "Sonraki",
    complete: "Klavye turu tamamlandı",
    completeCopy: "Seçtiğin alandaki bütün doğal nota konumlarını en az bir kez doğru buldun.",
    positionCompleteCopy: "Portede gösterilen bütün doğal sesleri gitar klavyesinde en az bir kez doğru buldun.",
    locationCompleteCopy: "Portede gösterilen bütün doğal seslerin tel ve perde konumlarını klavyeyi görmeden doğru buldun.",
    unique: "Nota konumu",
    writtenNotes: "Portedeki nota",
    firstTry: "İlk denemede doğru",
    wrong: "Toplam yanlış",
    average: "Ortalama cevap",
    repeat: "Aynı aralıkla yeniden çalış",
    change: "Perde aralığını değiştir",
    choices: "Nota seçenekleri",
    modeChoices: "Gitar çalışma biçimleri",
    session: "Oturum biçimi",
    standardSession: "Normal tur",
    standardSessionCopy: "Seçtiğin aralıktaki tüm doğal konumları tamamla.",
    endlessSession: "Sonsuz mod",
    endlessSessionCopy: "İlk yanlışına kadar rastgele konumlarla devam et.",
    endlessResult: "Sonsuz seri sona erdi",
    endlessResultCopy: (count: number) => `${count} doğru cevap verdin. İlk yanlışında seri durdu.`,
    endlessCorrect: "Doğru cevap",
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
    positionModeCopy: "Mark every matching string and fret for the written pitch in the selected range.",
    locationMode: "See the staff, choose string and fret",
    locationModeCopy: "Mark the correct string and fret locations without seeing the fretboard.",
    start: "Start guitar practice",
    startReady: "When you have scanned the map, begin a short round with this range.",
    progress: "Progress",
    question: "Which note is highlighted?",
    positionQuestion: "Where is this note on the guitar?",
    staffTarget: "Written note",
    staffTargetCopy: "Octave treble clef",
    choosePosition: "Mark every matching position on the fretboard",
    positionProgress: (selected: number, total: number) => `${selected} of ${total} positions found`,
    positionCount: (count: number) => `${count} matching positions`,
    stringChoice: "String",
    fretChoice: "Fret",
    emptyString: "Open string",
    markLocation: "Mark location",
    markedLocations: "Correct locations you marked",
    locationChoices: "String and fret choices",
    showNoteNames: "Show note names",
    hideNoteNames: "Hide note names",
    location: (stringNumber: number, fret: number) => `String ${stringNumber}, ${fret === 0 ? "open string" : `fret ${fret}`}`,
    target: "Target location",
    exit: "Exit session",
    answer: "Type your answer",
    placeholder: "C, D, E…",
    check: "Check answer",
    correct: "Correct",
    incorrect: "Incorrect",
    wrongCopy: (name: string) => `The correct note is ${name}. This location moved to the end of the queue.`,
    positionCorrectCopy: (locations: string) => `You found every matching position: ${locations}.`,
    positionWrongCopy: (locations: string) => `Correct positions: ${locations}. This note moved to the end of the queue.`,
    next: "Next",
    complete: "Fretboard round complete",
    completeCopy: "You found every natural-note location in the selected range at least once.",
    positionCompleteCopy: "You matched every written natural pitch to the fretboard at least once.",
    locationCompleteCopy: "You found every written natural pitch by string and fret without seeing the fretboard.",
    unique: "Note locations",
    writtenNotes: "Written notes",
    firstTry: "Correct first time",
    wrong: "Incorrect answers",
    average: "Average response",
    repeat: "Practise this range again",
    change: "Change fret range",
    choices: "Note choices",
    modeChoices: "Guitar practice modes",
    session: "Session type",
    standardSession: "Standard round",
    standardSessionCopy: "Complete every natural-note location in the selected range.",
    endlessSession: "Endless mode",
    endlessSessionCopy: "Keep finding random locations until your first mistake.",
    endlessResult: "Endless streak finished",
    endlessResultCopy: (count: number) => `You answered ${count} correctly. The streak stopped at your first mistake.`,
    endlessCorrect: "Correct answers",
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
  const firstLineY = 122;
  const step = 14;
  const noteY = firstLineY - position * (step / 2);
  const stemDown = position >= 4;
  const noteX = 286;

  return (
    <div className="guitar-staff-frame">
      <svg
        className="guitar-staff-note"
        viewBox="0 0 520 190"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={locale === "tr"
          ? `Oktavlı sol anahtarında ${noteName(question.letter, locale)} notası`
          : `${noteName(question.letter, locale)} on the octave treble staff`}
      >
        <g className="guitar-staff-lines" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <line key={index} x1="76" x2="474" y1={firstLineY - index * step} y2={firstLineY - index * step} />
          ))}
        </g>
        <text className="guitar-staff-clef" x="24" y="143" aria-hidden="true">𝄞</text>
        <text className="guitar-clef-eight" x="62" y="162" aria-hidden="true">8</text>
        <g aria-hidden="true">
          {guitarLedgerPositions(position).map((ledger) => (
            <line className="guitar-staff-ledger" key={ledger} x1={noteX - 24} x2={noteX + 24} y1={firstLineY - ledger * (step / 2)} y2={firstLineY - ledger * (step / 2)} />
          ))}
          <line
            className="guitar-staff-stem"
            x1={noteX + (stemDown ? -10 : 10)}
            x2={noteX + (stemDown ? -10 : 10)}
            y1={stemDown ? noteY + 2 : noteY - 45}
            y2={stemDown ? noteY + 47 : noteY - 2}
          />
          <ellipse className="guitar-staff-head" cx={noteX} cy={noteY} rx="13" ry="8.5" transform={`rotate(-15 ${noteX} ${noteY})`} />
        </g>
      </svg>
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

function pickRandomQuestion(pool: GuitarQuestion[], avoidId = "") {
  const candidates = pool.filter((question) => question.id !== avoidId);
  const question = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
  return question ? { ...question, misses: 0 } : null;
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
  selectedPositions = [],
  selectionFeedback,
  showNoteNames = false,
  studyLetter = null,
  orientationHint,
}: {
  maxFret: number;
  locale: Locale;
  active?: GuitarQuestion;
  reveal?: boolean;
  onSelect?: (position: GuitarQuestion) => void;
  selectedPositions?: GuitarQuestion[];
  selectionFeedback?: "correct" | "wrong" | null;
  showNoteNames?: boolean;
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
          ? locale === "tr" ? "Portedeki sesin gitar klavyesindeki bütün konumlarını seç" : "Choose every fretboard position for the written pitch"
          : active
          ? locale === "tr" ? `${active.stringNumber}. tel, ${active.fret === 0 ? "boş tel" : `${active.fret}. perde`} işaretli` : `String ${active.stringNumber}, ${active.fret === 0 ? "open string" : `fret ${active.fret}`} highlighted`
          : locale === "tr" ? `Boş tellerden ${maxFret}. perdeye doğal nota haritası` : `Natural-note map from open strings to fret ${maxFret}`}
      >
      {reveal && (
        <ul className="sr-only">
          {DISPLAY_STRINGS.flatMap((string) => displayedFrets.map((fret) => {
            const letter = noteAt(string.open, fret);
            if (!NATURAL.has(letter as Letter)) return null;
            return (
              <li key={`${string.id}-${fret}`}>
                {locale === "tr"
                  ? `${string.number}. tel, ${fret === 0 ? "boş tel" : `${fret}. perde`}: ${noteName(letter as Letter, locale)}`
                  : `String ${string.number}, ${fret === 0 ? "open string" : `fret ${fret}`}: ${noteName(letter as Letter, locale)}`}
              </li>
            );
          }))}
        </ul>
      )}
      <div className={`fretboard fretboard--range-${maxFret} ${interactive ? "fretboard--interactive" : ""}`} aria-hidden={interactive ? undefined : true} style={{ minWidth: `${Math.max(650, 120 + (maxFret + 1) * 64)}px` }}>
        <div className="fretboard-fret-numbers" style={{ gridTemplateColumns: columns }}>
          <span />
          {displayedFrets.map((fret) => <span className={fret === 0 ? "is-open" : ""} key={fret}>{fret === 0 ? (locale === "tr" ? "Boş tel" : "Open") : locale === "tr" ? `${fret}. perde` : `Fret ${fret}`}</span>)}
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
              const selected = selectedPositions.some((item) => item.stringId === string.id && item.fret === fret);
              const correct = Boolean(selectionFeedback && active && position?.midi === active.midi);
              const found = Boolean(!selectionFeedback && selected && active && position?.midi === active.midi);
              const visibleChoiceName = position && showNoteNames ? noteName(position.letter, locale) : "";
              return (
                <span className={`fret-cell ${fret === 0 ? "fret-cell--open" : ""}`} key={fret}>
                  {interactive && position && onSelect ? (
                    <button
                      className={`fret-note fret-note--choice ${visibleChoiceName ? "has-note-name" : ""} ${found ? "is-found" : ""} ${correct ? "is-correct" : ""} ${selectionFeedback === "wrong" && selected && !correct ? "is-wrong" : ""}`}
                      type="button"
                      ref={string.id === "e-low" && fret === Math.min(maxFret, 3) ? firstChoiceRef : undefined}
                      onClick={() => onSelect(position)}
                      disabled={Boolean(selectionFeedback)}
                      aria-label={`${locale === "tr" ? `${string.number}. tel, ${fret === 0 ? "boş tel" : `${fret}. perde`}` : `String ${string.number}, ${fret === 0 ? "open string" : `fret ${fret}`}`}${visibleChoiceName ? `: ${visibleChoiceName}` : ""}`}
                      aria-pressed={selected}
                    >
                      {selectionFeedback === "wrong" && selected && !correct ? "×" : visibleChoiceName || (correct || found ? "✓" : "")}
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
  const [sessionType, setSessionType] = useState<GuitarSessionType>("standard");
  const [studyLetter, setStudyLetter] = useState<Letter | null>(null);
  const [queue, setQueue] = useState<GuitarQuestion[]>([]);
  const [answer, setAnswer] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<GuitarQuestion[]>([]);
  const [selectedStringNumber, setSelectedStringNumber] = useState<number | null>(null);
  const [selectedFret, setSelectedFret] = useState<number | null>(null);
  const [showNoteNames, setShowNoteNames] = useState(false);
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
  const readsWrittenPitch = practiceMode !== "name-note";
  const usesFretboardAnswer = practiceMode === "staff-to-fretboard";
  const usesLocationAnswer = practiceMode === "staff-to-location";
  const selectedModeTitle = practiceMode === "name-note" ? text.nameMode : usesFretboardAnswer ? text.positionMode : text.locationMode;
  const choices = locale === "tr" ? Object.values(SOLFEGE) : Object.keys(SOLFEGE);
  const answeredCount = times.length;
  const correctAnswers = Math.max(0, answeredCount - wrong);
  const completed = sessionType === "standard" ? initialCount - queue.length : correctAnswers;
  const average = times.length ? `${(times.reduce((sum, time) => sum + time, 0) / times.length / 1000).toFixed(2).replace(".", locale === "tr" ? "," : ".")} ${locale === "tr" ? "sn" : "sec"}` : `0${locale === "tr" ? "," : "."}00`;
  const matchingPositionQuestions = displayed
    ? buildQuestions(maxFret).filter((question) => question.midi === displayed.midi)
    : [];
  const matchingLocations = matchingPositionQuestions
    .map((question) => text.location(question.stringNumber, question.fret))
    .join(locale === "tr" ? ", " : "; ");

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
    const questions = shuffle(readsWrittenPitch ? buildPitchQuestions(maxFret) : buildQuestions(maxFret));
    setInitialCount(questions.length);
    setQueue(questions);
    setFirstTry(0);
    setWrong(0);
    setTimes([]);
    setAnswer("");
    setSelectedPositions([]);
    setSelectedStringNumber(null);
    setSelectedFret(null);
    setShowNoteNames(false);
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
    setQueue((items) => {
      if (sessionType === "standard") return items.slice(1);
      const pool = practiceMode === "name-note" ? buildQuestions(maxFret) : buildPitchQuestions(maxFret);
      const nextQuestion = pickRandomQuestion(pool, question.id);
      return nextQuestion ? [...items.slice(1), nextQuestion] : items.slice(1);
    });
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
      setQueue((items) => sessionType === "standard"
        ? [...items.slice(1), { ...items[0], misses: items[0].misses + 1 }]
        : items.slice(1));
      setFeedback("wrong");
    }
  }

  function answerPosition(position: GuitarQuestion) {
    if (!current || feedback || practiceMode !== "staff-to-fretboard") return;
    if (selectedPositions.some((item) => item.id === position.id)) return;

    const nextSelected = [...selectedPositions, position];
    setSelectedPositions(nextSelected);
    if (position.midi !== current.midi) {
      setFeedbackQuestion(current);
      setTimes((items) => [...items, Math.max(100, Date.now() - startedAt)]);
      setWrong((count) => count + 1);
      setQueue((items) => sessionType === "standard"
        ? [...items.slice(1), { ...items[0], misses: items[0].misses + 1 }]
        : items.slice(1));
      setFeedback("wrong");
      return;
    }

    const requiredPositions = buildQuestions(maxFret).filter((question) => question.midi === current.midi);
    const selectedCorrectIds = new Set(nextSelected.filter((item) => item.midi === current.midi).map((item) => item.id));
    if (requiredPositions.every((item) => selectedCorrectIds.has(item.id))) {
      setFeedbackQuestion(current);
      setTimes((items) => [...items, Math.max(100, Date.now() - startedAt)]);
      finishCorrectAnswer(current);
    }
  }

  function answerLocation() {
    if (!current || feedback || practiceMode !== "staff-to-location" || selectedStringNumber === null || selectedFret === null) return;
    const string = STRINGS.find((item) => item.number === selectedStringNumber);
    if (!string) return;

    const matchingPosition = buildQuestions(maxFret).find((position) => (
      position.stringNumber === selectedStringNumber && position.fret === selectedFret
    ));
    if (!matchingPosition || string.openMidi + selectedFret !== current.midi) {
      setFeedbackQuestion(current);
      setTimes((items) => [...items, Math.max(100, Date.now() - startedAt)]);
      setWrong((count) => count + 1);
      setQueue((items) => sessionType === "standard"
        ? [...items.slice(1), { ...items[0], misses: items[0].misses + 1 }]
        : items.slice(1));
      setFeedback("wrong");
      return;
    }

    if (selectedPositions.some((position) => position.id === matchingPosition.id)) return;
    const nextSelected = [...selectedPositions, matchingPosition];
    setSelectedPositions(nextSelected);
    setSelectedStringNumber(null);
    setSelectedFret(null);
    const requiredPositions = buildQuestions(maxFret).filter((position) => position.midi === current.midi);
    const selectedCorrectIds = new Set(nextSelected.map((position) => position.id));
    if (requiredPositions.every((position) => selectedCorrectIds.has(position.id))) {
      setFeedbackQuestion(current);
      setTimes((items) => [...items, Math.max(100, Date.now() - startedAt)]);
      finishCorrectAnswer(current);
    }
  }

  function next() {
    if (sessionType === "endless" && feedback === "wrong") {
      setStage("done");
      setFeedback(null);
      return;
    }
    if (queue.length === 0) {
      setStage("done");
      setFeedback(null);
      return;
    }
    setAnswer("");
    setSelectedPositions([]);
    setSelectedStringNumber(null);
    setSelectedFret(null);
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

        <div className="guitar-session-section">
          <div className="guitar-range-heading">
            <div><p className="kicker" aria-hidden="true">⚬</p><h2>{text.session}</h2></div>
          </div>
          <div className="mode-grid guitar-session-grid" role="group" aria-label={text.session}>
            <button className={`mode-card ${sessionType === "standard" ? "is-selected" : ""}`} type="button" onClick={() => setSessionType("standard")} aria-pressed={sessionType === "standard"}>
              <span className="guitar-mode-icon guitar-mode-icon--staff" aria-hidden="true"><i /><i /><i /><i /><i /><b /></span>
              <span><strong>{text.standardSession}</strong><small>{text.standardSessionCopy}</small></span>
              <i className="selection-indicator" aria-hidden="true" />
            </button>
            <button className={`mode-card ${sessionType === "endless" ? "is-selected" : ""}`} type="button" onClick={() => setSessionType("endless")} aria-pressed={sessionType === "endless"}>
              <span className="guitar-mode-icon guitar-mode-icon--position" aria-hidden="true"><i /><b>∞</b></span>
              <span><strong>{text.endlessSession}</strong><small>{text.endlessSessionCopy}</small></span>
              <i className="selection-indicator" aria-hidden="true" />
            </button>
          </div>
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
            <button className={`mode-card ${practiceMode === "staff-to-location" ? "is-selected" : ""}`} type="button" onClick={() => setPracticeMode("staff-to-location")} aria-pressed={practiceMode === "staff-to-location"}>
              <span className="guitar-mode-icon guitar-mode-icon--location" aria-hidden="true"><i /><b>T/P</b></span>
              <span><strong>{text.locationMode}</strong><small>{text.locationModeCopy}</small></span>
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
          <div><p className="kicker" aria-hidden="true">⚬</p><strong>{selectedModeTitle}</strong><span>{selectedRange.title}. {text.startReady}</span></div>
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
        <h1 ref={resultsHeadingRef} tabIndex={-1}>{sessionType === "endless" ? text.endlessResult : text.complete}</h1>
        <p>{sessionType === "endless" ? text.endlessResultCopy(correctAnswers) : practiceMode === "name-note" ? text.completeCopy : usesLocationAnswer ? text.locationCompleteCopy : text.positionCompleteCopy}</p>
        <div className="guitar-stats">
          <div><strong>{sessionType === "endless" ? correctAnswers : initialCount}</strong><span>{sessionType === "endless" ? text.endlessCorrect : practiceMode === "name-note" ? text.unique : text.writtenNotes}</span></div>
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
        <div className="guitar-quiz-tools">
          {!usesLocationAnswer && <button
              className="guitar-note-name-toggle"
              type="button"
              aria-pressed={showNoteNames}
              onClick={() => setShowNoteNames((visible) => !visible)}
            >
              <span className="guitar-note-name-toggle-icon" aria-hidden="true">Aa</span>
              {showNoteNames ? text.hideNoteNames : text.showNoteNames}
            </button>}
          <div className="guitar-quiz-progress" role="progressbar" aria-label={text.progress} aria-valuemin={0} aria-valuemax={sessionType === "standard" ? initialCount : undefined} aria-valuenow={sessionType === "standard" ? completed : undefined}><span>{text.progress}</span><strong>{sessionType === "standard" ? `${completed} / ${initialCount}` : completed}</strong></div>
        </div>
      </div>
      <div className={`guitar-question-card ${usesFretboardAnswer ? "guitar-question-card--staff-position" : ""} ${usesLocationAnswer ? "guitar-question-card--location-answer" : ""}`.trim()}>
        {displayed && (
          <div className="guitar-target-location">
            <span>{practiceMode === "name-note" ? text.target : text.staffTarget}</span>
            <strong>{practiceMode === "name-note" ? text.location(displayed.stringNumber, displayed.fret) : `${text.staffTargetCopy}, ${text.positionCount(matchingPositionQuestions.length)}`}</strong>
          </div>
        )}
        <h1>{practiceMode === "name-note" ? text.question : text.positionQuestion}</h1>
        {displayed && readsWrittenPitch && <GuitarStaffNote question={displayed} locale={locale} />}
        {displayed && !usesLocationAnswer && (
          <Fretboard
            maxFret={maxFret}
            locale={locale}
            active={displayed}
            onSelect={usesFretboardAnswer ? answerPosition : undefined}
            selectedPositions={selectedPositions}
            selectionFeedback={feedback}
            showNoteNames={showNoteNames}
            reveal={showNoteNames}
            orientationHint={text.orientationHint}
          />
        )}
        {!feedback && practiceMode === "name-note" ? (
          <form className="guitar-answer" onSubmit={submit}>
            <label htmlFor="guitar-answer">{text.answer}</label>
            <div><input id="guitar-answer" ref={inputRef} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={text.placeholder} autoComplete="off" autoCorrect="off" autoCapitalize="none" enterKeyHint="done" spellCheck={false} /><button type="submit">{text.check}</button></div>
            <div className="guitar-note-choices" role="group" aria-label={text.choices}>{choices.map((choice) => <button type="button" key={choice} onClick={() => answerQuestion(choice)}>{choice}</button>)}</div>
          </form>
        ) : usesLocationAnswer ? (
          <div className="guitar-location-answer" aria-label={text.locationChoices}>
            <div className="guitar-location-answer-grid">
              <fieldset disabled={Boolean(feedback)}>
                <legend>{text.stringChoice}</legend>
                <div className="guitar-location-options guitar-location-options--strings">
                  {STRINGS.map((string) => <button type="button" key={string.id} className={selectedStringNumber === string.number ? "is-selected" : ""} onClick={() => setSelectedStringNumber(string.number)} aria-pressed={selectedStringNumber === string.number}>{string.number}. {text.stringChoice.toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US")}</button>)}
                </div>
              </fieldset>
              <fieldset disabled={Boolean(feedback)}>
                <legend>{text.fretChoice}</legend>
                <div className="guitar-location-options guitar-location-options--frets">
                  {Array.from({ length: maxFret + 1 }, (_, fret) => <button type="button" key={fret} className={selectedFret === fret ? "is-selected" : ""} onClick={() => setSelectedFret(fret)} aria-pressed={selectedFret === fret}>{fret === 0 ? text.emptyString : locale === "tr" ? `${fret}. perde` : `Fret ${fret}`}</button>)}
                </div>
              </fieldset>
            </div>
            <div className={`guitar-location-selection ${feedback ? `guitar-location-selection--${feedback}` : ""}`}>
              <div className="guitar-location-status" id="guitar-location-status" role="status" aria-live="polite" aria-atomic="true">
                <strong>{feedback ? feedback === "correct" ? text.correct : text.incorrect : text.markedLocations}</strong>
                <span>{feedback
                  ? feedback === "correct" ? text.positionCorrectCopy(matchingLocations) : text.positionWrongCopy(matchingLocations)
                  : selectedPositions.length ? selectedPositions.map((position) => text.location(position.stringNumber, position.fret)).join("; ") : "—"}</span>
                <small>{text.positionProgress(selectedPositions.length, matchingPositionQuestions.length)}</small>
              </div>
              <button
                ref={feedbackButtonRef}
                type="button"
                aria-describedby="guitar-location-status"
                onClick={feedback ? next : answerLocation}
                disabled={!feedback && (selectedStringNumber === null || selectedFret === null || selectedPositions.some((position) => position.stringNumber === selectedStringNumber && position.fret === selectedFret))}
              >{feedback ? `${text.next} →` : text.markLocation}</button>
            </div>
          </div>
        ) : !feedback ? (
          <p className="guitar-position-instruction" id="guitar-position-instruction" role="status" aria-live="polite" aria-atomic="true">
            <strong>{text.choosePosition}</strong>
            <span>{text.positionProgress(selectedPositions.length, matchingPositionQuestions.length)}</span>
          </p>
        ) : (
          <div className={`guitar-feedback guitar-feedback--${feedback}`} role="status" aria-live="polite" aria-atomic="true">
            <div id="guitar-feedback-message">
              <strong>{feedback === "correct" ? text.correct : text.incorrect}</strong>
              <span>{practiceMode === "name-note"
                ? feedback === "correct" ? noteName(feedbackQuestion?.letter ?? "C", locale) : text.wrongCopy(noteName(feedbackQuestion?.letter ?? "C", locale))
                : feedback === "correct" ? text.positionCorrectCopy(matchingLocations) : text.positionWrongCopy(matchingLocations)}</span>
            </div>
            <button ref={feedbackButtonRef} type="button" aria-describedby="guitar-feedback-message" onClick={next}>{text.next} →</button>
          </div>
        )}
      </div>
    </section>
  );
}
