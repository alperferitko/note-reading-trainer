"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { beatDurationMs, buildRandomRhythmSequence, groupRhythmValues, RHYTHM_VALUES } from "@/lib/score-reading.mjs";
import { RHYTHM_DEMO_PATTERNS, rhythmDemoStepDurationMs } from "@/lib/rhythm-presets.mjs";
import { READING_STUDIES, nextStudy, parseStudy, studyEventCounts } from '@/lib/reading-studies.mjs';
import { saveEvidence } from '@/lib/practice-evidence.mjs';
import { noteIdToMidi, playMetronomeClick, playPracticeNote, playRhythmPulse } from "@/lib/practice-audio";
import { CommunityPracticeRecorder, CommunityPracticeStreak } from "./community";
import { LocalResult } from './local-progress';
import { SessionGuidance } from './session-guidance';
import { NotationOptions, usePracticeNavigation, type Clef, type AccidentalMode } from './practice-tools';
import { pitchAt, pitchName, matchesPitch, accidentalsFor, parsePitchAnswer } from '@/lib/music-pitch.mjs';
import { RhythmGlyph, RhythmPatternPreview, RhythmScoreLine, type RhythmId, type RhythmScoreNote, type RhythmScoreValue } from "./rhythm-glyphs";

type Locale = "tr" | "en";
type ReadingMode = "flow" | "rhythm";
type Stage = "setup" | "playing" | "done";
type ScoreRangeId = "staff" | "near" | "full" | "wide";
type ScoreSessionType = "standard" | "endless";
type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";
type Solfege = "Do" | "Re" | "Mi" | "Fa" | "Sol" | "La" | "Si";

type ScoreNote = { id: string; letter: Letter; solfege: Solfege; position: number; accidental?: number; midi?: number };
type ScoreEvent = { key: string; note: ScoreNote; rhythm: { id: RhythmScoreValue; beats: number }; groupId?: string; rest?: boolean; barAfter?: boolean; writtenAccidental?: number; afterRest?: boolean };
// Rest results record whether the silence was kept; note results record naming and timing separately.
type AnswerResult = { index: number; expected: ScoreNote; guessed: string | null; correct: boolean; timedOut: boolean; kind: "note" | "rest"; early?: boolean };
type StudyProgress = { id: string; at: string; notes: number; notesCorrect: number; rests: number; restsKept: number; mode: ReadingMode };
const STUDY_PROGRESS_KEY = "notanota-study-progress-v1";
const REST_SYMBOLS: Partial<Record<RhythmScoreValue, string>> = { whole: "𝄻", half: "𝄼", quarter: "𝄽", eighth: "𝄾", sixteenth: "𝄿" };

function readStudyProgress(): StudyProgress[] {
  try {
    const value = JSON.parse(localStorage.getItem(STUDY_PROGRESS_KEY) || "[]");
    return Array.isArray(value) ? value.filter((row) => row && READING_STUDIES.some((study) => study.id === row.id)
      && Number.isFinite(Date.parse(row.at)) && [row.notes, row.notesCorrect, row.rests, row.restsKept].every((n) => Number.isInteger(n) && n >= 0)
      && row.notesCorrect <= row.notes && row.restsKept <= row.rests && (row.mode === "flow" || row.mode === "rhythm")).slice(-200) : [];
  } catch { return []; }
}

/** A study counts as completed at 80% correct note names and, when it has rests, 75% of rests kept. */
function studyPassed(row: StudyProgress) {
  return row.notes > 0 && row.notesCorrect / row.notes >= 0.8 && (row.rests === 0 || row.restsKept / row.rests >= 0.75);
}
type RhythmDemoPattern = { stepBeats: number; stepCount: number; audibleSteps: readonly number[] };

const SCORE_LETTERS: Array<{ letter: Letter; solfege: Solfege; octave: number }> = [
  { letter: "B", solfege: "Si", octave: 2 },
  { letter: "C", solfege: "Do", octave: 3 },
  { letter: "D", solfege: "Re", octave: 3 },
  { letter: "E", solfege: "Mi", octave: 3 },
  { letter: "F", solfege: "Fa", octave: 3 },
  { letter: "G", solfege: "Sol", octave: 3 },
  { letter: "A", solfege: "La", octave: 3 },
  { letter: "B", solfege: "Si", octave: 3 },
  { letter: "C", solfege: "Do", octave: 4 },
  { letter: "D", solfege: "Re", octave: 4 },
  { letter: "E", solfege: "Mi", octave: 4 },
  { letter: "F", solfege: "Fa", octave: 4 },
  { letter: "G", solfege: "Sol", octave: 4 },
  { letter: "A", solfege: "La", octave: 4 },
  { letter: "B", solfege: "Si", octave: 4 },
  { letter: "C", solfege: "Do", octave: 5 },
  { letter: "D", solfege: "Re", octave: 5 },
  { letter: "E", solfege: "Mi", octave: 5 },
  { letter: "F", solfege: "Fa", octave: 5 },
  { letter: "G", solfege: "Sol", octave: 5 },
  { letter: "A", solfege: "La", octave: 5 },
  { letter: "B", solfege: "Si", octave: 5 },
  { letter: "C", solfege: "Do", octave: 6 },
  { letter: "D", solfege: "Re", octave: 6 },
  { letter: "E", solfege: "Mi", octave: 6 },
  { letter: "F", solfege: "Fa", octave: 6 },
  { letter: "G", solfege: "Sol", octave: 6 },
  { letter: "A", solfege: "La", octave: 6 },
  { letter: "B", solfege: "Si", octave: 6 },
];
const SCORE_NOTES: ScoreNote[] = SCORE_LETTERS.map((note, index) => ({
  id: `${note.letter.toLowerCase()}${note.octave}`,
  letter: note.letter,
  solfege: note.solfege,
  position: index - 10,
}));

const SCORE_RANGE_DEFINITIONS: Record<ScoreRangeId, { min: number; max: number; count: number }> = {
  staff: { min: 0, max: 8, count: 9 },
  near: { min: -4, max: 12, count: 17 },
  full: { min: -8, max: 16, count: 25 },
  wide: { min: -10, max: 18, count: 29 },
};

const RHYTHM_BY_ID = {
  ...Object.fromEntries(RHYTHM_VALUES.map((rhythm) => [rhythm.id, rhythm])),
  dottedQuarter: { id: "dottedQuarter", beats: 1.5 },
} as Record<RhythmScoreValue, { id: RhythmScoreValue; beats: number }>;
const RHYTHM_DEMOS = RHYTHM_DEMO_PATTERNS as Record<RhythmId, RhythmDemoPattern>;

function notesForRange(range: ScoreRangeId) {
  const definition = SCORE_RANGE_DEFINITIONS[range];
  return SCORE_NOTES.filter((note) => note.position >= definition.min && note.position <= definition.max);
}

function buildRandomLine(range: ScoreRangeId, clef: Clef = 'treble', accidentals: AccidentalMode = 'natural'): ScoreEvent[] {
  const pool = notesForRange(range).flatMap(note=>accidentalsFor(accidentals).map(accidental=>pitchAt(note.position,clef,accidental) as ScoreNote));
  const rhythms = buildRandomRhythmSequence(16) as RhythmScoreValue[];
  const lineId = `random-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const groupedRhythms = groupRhythmValues(rhythms, lineId) as Array<{ id: RhythmScoreValue; groupId?: string }>;
  let previousId = "";
  return pool.length ? rhythms.map((_, index) => {
    const candidates = pool.filter((note) => note.id !== previousId);
    const note = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
    previousId = note.id;
    const rhythm = groupedRhythms[index] ?? { id: "quarter" as RhythmScoreValue };
    return { key: `${lineId}-${index}`, note, rhythm: RHYTHM_BY_ID[rhythm.id], groupId: rhythm.groupId };
  }) : [];
}

const COPY = {
  tr: {
    kicker: "Satır okuma",
    title: "Porteyi soldan sağa akıcı oku.",
    lead: "Nota adlarını sırayla işaretle. Serbest akışta kendi hızında ilerle; ritimli akışta porte durmadan devam eder.",
    mode: "Okuma biçimi",
    session: "Oturum biçimi",
    standardSession: "Normal satır",
    standardSessionCopy: "Seçtiğin aralıktaki rastgele satırı tamamla.",
    endlessSession: "Sonsuz mod",
    endlessSessionCopy: "Sen oturumu bitirene kadar yeni notalarla devam et.",
    endlessComplete: "Sonsuz çalışma tamamlandı.",
    endlessCompleteCopy: (count: number) => `${count} doğru nota okudun. Oturumu sen bitirdin.`,
    range: "Nota aralığı",
    rangeCopy: "Hangi yüksekliklerde rastgele nota görmek istiyorsun?",
    randomLine: "Rastgele satır",
    randomLineCopy: "Her çalışmada seçtiğin aralıktan yeni notalar ve ritimler oluşur.",
    ranges: { staff: { title: "Temel porte", description: "Beş çizgi ve dört aralık", count: "9 nota" }, near: { title: "Yakın çevre", description: "İki yandaki ek çizgiye kadar", count: "17 nota" }, full: { title: "Tam doğal sesler", description: "Dört ek çizgiye kadar", count: "25 nota" }, wide: { title: "Geniş aralık", description: "Beş ek çizgiye kadar", count: "29 nota" } } as Record<ScoreRangeId, { title: string; description: string; count: string }>,
    flow: "Akıcı okuma",
    flowCopy: "Cevabını işaretle ve beklemeden sıradaki notaya geç.",
    rhythm: "Ritimli okuma",
    rhythmCopy: "Her nota kendi süresi içinde cevaplanır; istersen metronom her vuruşu duyurur.",
    tempo: "Tempo",
    metronome: "Metronom",
    metronomeOn: "Metronomu aç",
    metronomeOff: "Metronomu kapat",
    start: "Satırı okumaya başla",
    noteValues: "Nota değerleri",
    demoRates: { whole: "4 vuruşta bir", half: "2 vuruşta bir", quarter: "Her vuruşta", eighth: "Vuruş başına 2", sixteenth: "Vuruş başına 4", triplet: "Vuruş başına 3" } as Record<RhythmId, string>,
    playDemo: (name: string) => `${name} ritmini oynat`,
    pauseDemo: (name: string) => `${name} ritmini duraklat`,
    demoPlaying: (name: string, bpm: number) => `${name} ritmi ${bpm} BPM hızında çalıyor.`,
    demoPaused: (name: string) => `${name} ritmi duraklatıldı.`,
    valueNames: { whole: "Birlik", half: "İkilik", quarter: "Dörtlük", dottedQuarter: "Noktalı dörtlük", eighth: "Sekizlik", sixteenth: "On altılık", triplet: "Üçleme" } as Record<RhythmScoreValue, string>,
    progress: "Satır ilerlemesi",
    choose: "Bu nota hangisi?",
    rhythmHint: "Vuruş bitmeden notayı seç",
    flowHint: "Sıradaki notayı seç",
    exit: "Oturumu bitir",
    restart: "Satırı yeniden başlat",
    complete: "Satırı tamamladın.",
    randomComplete: (count: number) => `Tebrikler, ${count} notalık rastgele bir satırı tamamladın.`,
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
    mode: "Reading style",
    session: "Session type",
    standardSession: "Standard line",
    standardSessionCopy: "Complete a random line from your chosen range.",
    endlessSession: "Endless mode",
    endlessSessionCopy: "Keep reading fresh notes until you end the session.",
    endlessComplete: "Endless practice complete.",
    endlessCompleteCopy: (count: number) => `You read ${count} notes correctly before ending the session.`,
    range: "Note range",
    rangeCopy: "Choose the height range for your random notes.",
    randomLine: "Random line",
    randomLineCopy: "Each practice line creates fresh notes and rhythms from your chosen range.",
    ranges: { staff: { title: "Within the staff", description: "Five lines and four spaces", count: "9 notes" }, near: { title: "Staff + nearby lines", description: "Through two nearby ledger lines", count: "17 notes" }, full: { title: "Full natural range", description: "Through four ledger lines", count: "25 notes" }, wide: { title: "Wide range", description: "Through five ledger lines", count: "29 notes" } } as Record<ScoreRangeId, { title: string; description: string; count: string }>,
    flow: "Flow reading",
    flowCopy: "Choose an answer and move straight to the next note.",
    rhythm: "Rhythm reading",
    rhythmCopy: "Answer inside each note value and turn on the metronome to hear every beat.",
    tempo: "Tempo",
    metronome: "Metronome",
    metronomeOn: "Turn metronome on",
    metronomeOff: "Turn metronome off",
    start: "Start reading the line",
    noteValues: "Note values",
    demoRates: { whole: "Once every 4 beats", half: "Once every 2 beats", quarter: "Every beat", eighth: "2 per beat", sixteenth: "4 per beat", triplet: "3 per beat" } as Record<RhythmId, string>,
    playDemo: (name: string) => `Play the ${name} rhythm`,
    pauseDemo: (name: string) => `Pause the ${name} rhythm`,
    demoPlaying: (name: string, bpm: number) => `${name} is playing at ${bpm} BPM.`,
    demoPaused: (name: string) => `${name} is paused.`,
    valueNames: { whole: "Whole", half: "Half", quarter: "Quarter", dottedQuarter: "Dotted quarter", eighth: "Eighth", sixteenth: "Sixteenth", triplet: "Triplet" } as Record<RhythmScoreValue, string>,
    progress: "Line progress",
    choose: "Which note is this?",
    rhythmHint: "Choose before the beat window closes",
    flowHint: "Choose the next note",
    exit: "End session",
    restart: "Restart this line",
    complete: "Line complete.",
    randomComplete: (count: number) => `Well done. You completed a random line of ${count} notes.`,
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

function StudyDetails({ study, locale, passed }: { study: (typeof READING_STUDIES)[number]; locale: Locale; passed: string[] }) {
  const tr = locale === "tr";
  const counts = studyEventCounts(study);
  const missing = study.requires.filter((id) => !passed.includes(id)).map((id) => READING_STUDIES.find((item) => item.id === id)?.title[locale] ?? id);
  const clefName = study.clef === "bass" ? (tr ? "Fa anahtarı" : "Bass clef") : (tr ? "Sol anahtarı" : "Treble clef");
  const keyName = study.key === 0 ? (tr ? "donanımsız" : "no key signature") : `${Math.abs(study.key)} ${study.key > 0 ? "♯" : "♭"} ${tr ? "donanım" : "key signature"}`;
  return <div className="score-study-details">
    <p><strong>{study.focus[locale]}</strong></p>
    <p>{study.tip[locale]}</p>
    <ul>
      <li>{clefName}</li><li>{study.time[0]}/{study.time[1]}</li><li>{keyName}</li>
      <li>{counts.notes} {tr ? "nota" : "notes"}{counts.rests ? ` · ${counts.rests} ${tr ? "sus" : "rests"}` : ""}</li>
    </ul>
    {missing.length > 0 && <p className="score-study-prereq">{tr ? `Önce önerilen: ${missing.join(", ")}. Yine de bu etüdü deneyebilirsin.` : `Suggested first: ${missing.join(", ")}. You can still try this study.`}</p>}
    <small>{tr ? "Özgün kısa etüt · Sabit satır. Sonuç nota adı cevaplarını ve ekrandaki zamanlamayı ölçer, enstrüman performansını değil." : "Original short study · Fixed line. Results measure note-name answers and on-screen timing, not instrument performance."}</small>
  </div>;
}

function noteName(note: ScoreNote, locale: Locale) {
  return pitchName(note, locale);
}

export function ScoreReadingTrainer({ locale, noteSoundEnabled, onSessionActiveChange }: { locale: Locale; noteSoundEnabled: boolean; onSessionActiveChange?: (active: boolean) => void }) {
  const text = COPY[locale];
  const [stage, setStage] = useState<Stage>("setup");
  const [scoreRange, setScoreRange] = useState<ScoreRangeId>("staff");
  const [studyId,setStudyId]=useState('random');
  const study=READING_STUDIES.find(item=>item.id===studyId);
  const [sessionType, setSessionType] = useState<ScoreSessionType>("standard");
  const [readingMode, setReadingMode] = useState<ReadingMode>("flow");
  const [bpm, setBpm] = useState(76);
  const [clef,setClef]=useState<Clef>('treble');
  const [accidentals,setAccidentals]=useState<AccidentalMode>('natural');
  const [answerAccidental,setAnswerAccidental]=useState('');
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [line, setLine] = useState<ScoreEvent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [locked, setLocked] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const sessionStartRef = useRef(0);
  const [rhythmDemoId, setRhythmDemoId] = useState<RhythmId | null>(null);
  const [rhythmDemoPlaying, setRhythmDemoPlaying] = useState(false);
  const [rhythmDemoStep, setRhythmDemoStep] = useState(-1);
  const flowTimerRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const answeredIndexRef = useRef<number | null>(null);
  const currentNoteRef = useRef<SVGGElement>(null);
  const noteStartedAtRef = useRef(0);
  const evidenceSerial = useRef(0);
  const [studyProgress, setStudyProgress] = useState<StudyProgress[]>([]);
  const current = line[currentIndex];
  // Fixed studies bring their own clef, key and meter; random lines use the chosen notation options.
  const lineClef: Clef = study ? study.clef : clef;
  const passedStudies = useMemo(() => [...new Set(studyProgress.filter(studyPassed).map((row) => row.id))], [studyProgress]);
  const recommendedStudy = nextStudy(passedStudies);
  const needsAccidentalChoice = study
    ? study.key !== 0 || line.some((event) => event.writtenAccidental !== undefined)
    : accidentals !== "natural";

  useEffect(() => {
    const update = () => setStudyProgress(readStudyProgress());
    update();
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  useEffect(() => { noteStartedAtRef.current = performance.now(); }, [currentIndex, sessionKey]);
  // Handlers used from timers and document listeners always see the latest render.
  const logEvidenceRef = useRef(logEvidence);
  const answerRestRef = useRef(answerRest);
  useEffect(() => { logEvidenceRef.current = logEvidence; answerRestRef.current = answerRest; });

  const resultByIndex = useMemo(() => new Map(results.map((result) => [result.index, result])), [results]);
  const renderedLine = useMemo<RhythmScoreNote[]>(() => line.map((event, index) => {
    const result = resultByIndex.get(index);
    const state = result ? result.correct ? "correct" : "wrong" : index === currentIndex ? "active" : "future";
    return {
      key: event.key,
      position: event.rest ? 4 : event.note.position,
      accidental: event.rest ? undefined : study ? event.writtenAccidental : accidentals === 'natural' ? undefined : event.note.accidental,
      rest: event.rest,
      barAfter: event.barAfter,
      rhythm: event.rhythm.id,
      groupId: event.groupId,
      state,
    };
  }), [currentIndex, line, resultByIndex, accidentals, study]);
  const correctCount = results.filter((result) => result.correct).length;
  const mistakeCount = results.length - correctCount;
  const noteResults = results.filter((result) => result.kind === "note");
  const restResults = results.filter((result) => result.kind === "rest");
  const namedNotes = noteResults.filter((result) => !result.timedOut);
  const namedCorrect = namedNotes.filter((result) => result.correct).length;
  const afterRestNotes = noteResults.filter((result) => line[result.index]?.afterRest);
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
    if (stage !== "setup" || !rhythmDemoPlaying || !rhythmDemoId) return;
    const pattern = RHYTHM_DEMOS[rhythmDemoId];
    const stepMs = rhythmDemoStepDurationMs(rhythmDemoId, bpm);
    let step = 0;
    let nextAt = performance.now() + stepMs;
    let timeoutId = 0;

    const tick = () => {
      step = (step + 1) % pattern.stepCount;
      setRhythmDemoStep(step);
      if (pattern.audibleSteps.includes(step)) {
        playRhythmPulse(noteIdToMidi("a4"), noteSoundEnabled, Math.min(180, stepMs * 0.55));
      }
      nextAt += stepMs;
      timeoutId = window.setTimeout(tick, Math.max(0, nextAt - performance.now()));
    };

    timeoutId = window.setTimeout(tick, stepMs);
    return () => window.clearTimeout(timeoutId);
  }, [bpm, noteSoundEnabled, rhythmDemoId, rhythmDemoPlaying, stage]);

  useEffect(() => {
    if (stage !== "playing" || readingMode !== "rhythm" || !current) return;
    answeredIndexRef.current = null;
    const timeout = window.setTimeout(() => {
      if (answeredIndexRef.current !== currentIndex) {
        if (current.rest) {
          setResults((items) => [...items, { index: currentIndex, expected: current.note, guessed: null, correct: true, timedOut: false, kind: "rest" }]);
          logEvidenceRef.current(current, currentIndex, { correct: true, timedOut: false });
        } else {
          setResults((items) => [...items, { index: currentIndex, expected: current.note, guessed: null, correct: false, timedOut: true, kind: "note" }]);
          logEvidenceRef.current(current, currentIndex, { correct: false, timedOut: true });
        }
      }
      if (currentIndex >= line.length - 1) {
        if (sessionType === "endless") {
          const extra = buildRandomLine(scoreRange,clef,accidentals);
          if (extra.length) setLine((items) => [...items, ...extra]);
          setLocked(false);
          setCurrentIndex((index) => index + 1);
        } else {
          completedRef.current = true;
          setElapsedMs(Math.max(0, performance.now() - sessionStartRef.current));
          setStage("done");
        }
      }
      else {
        setLocked(false);
        setCurrentIndex((index) => index + 1);
      }
    }, beatDurationMs(current.rhythm.beats, bpm));
    return () => window.clearTimeout(timeout);
  }, [bpm, current, currentIndex, line.length, readingMode, scoreRange, sessionType, stage, clef, accidentals]);

  useEffect(() => {
    if (stage !== "playing" || readingMode !== "rhythm" || !metronomeEnabled) return;
    const beatMs = beatDurationMs(1, bpm);
    playMetronomeClick();
    let nextAt = performance.now() + beatMs;
    let timeoutId = 0;

    const tick = () => {
      playMetronomeClick();
      nextAt += beatMs;
      timeoutId = window.setTimeout(tick, Math.max(0, nextAt - performance.now()));
    };

    timeoutId = window.setTimeout(tick, beatMs);
    return () => window.clearTimeout(timeoutId);
  }, [bpm, metronomeEnabled, readingMode, sessionKey, stage]);

  useEffect(() => {
    if (stage !== 'playing') return;
    const note=currentNoteRef.current;
    const scroller=note?.closest<HTMLElement>('.score-line-scroll');
    if(note&&scroller){const bounds=note.getBoundingClientRect();const frame=scroller.getBoundingClientRect();scroller.scrollTo({left:scroller.scrollLeft+(bounds.left+bounds.right)/2-(frame.left+frame.right)/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  }, [currentIndex, stage]);

  function start() {
    if (flowTimerRef.current !== null) window.clearTimeout(flowTimerRef.current);
    flowTimerRef.current = null;
    sessionStartRef.current = performance.now();
    setElapsedMs(0);
    setAnswerAccidental('');
    const nextLine: ScoreEvent[] = study ? parseStudy(study).events.map((event) => ({
      key: `${study.id}-${event.index}`,
      note: pitchAt(event.type === "note" ? event.position! : 4, study.clef, event.accidental ?? 0) as ScoreNote,
      rhythm: RHYTHM_BY_ID[event.rhythm as RhythmScoreValue],
      groupId: event.groupId,
      rest: event.type === "rest",
      barAfter: event.barAfter,
      writtenAccidental: event.writtenAccidental,
      afterRest: event.afterRest,
    })) : buildRandomLine(scoreRange,clef,accidentals);
    evidenceSerial.current = 0;
    const key = Date.now();
    setLine(nextLine);
    setCurrentIndex(0);
    setResults([]);
    setLocked(false);
    setSessionKey(key);
    setRhythmDemoPlaying(false);
    setRhythmDemoStep(-1);
    answeredIndexRef.current = null;
    setStage("playing");
  }

  function toggleMetronome() {
    const nextEnabled = !metronomeEnabled;
    setMetronomeEnabled(nextEnabled);
    if (nextEnabled && stage !== "playing") playMetronomeClick();
  }

  function toggleRhythmDemo(id: RhythmId) {
    const shouldPlay = rhythmDemoId !== id || !rhythmDemoPlaying;
    setRhythmDemoId(id);
    setRhythmDemoPlaying(shouldPlay);
    setRhythmDemoStep(shouldPlay ? 0 : -1);
    if (shouldPlay) {
      const stepMs = rhythmDemoStepDurationMs(id, bpm);
      playRhythmPulse(noteIdToMidi("a4"), noteSoundEnabled, Math.min(180, stepMs * 0.55));
    }
  }

  function finishLine() {
    if (flowTimerRef.current !== null) window.clearTimeout(flowTimerRef.current);
    flowTimerRef.current = null;
    setElapsedMs(Math.max(0, performance.now() - sessionStartRef.current));
    setStage("done");
    setLocked(false);
  }

  function logEvidence(event: ScoreEvent, index: number, outcome: { correct: boolean; timedOut: boolean; answer?: string }) {
    const session = `score-${sessionKey}`;
    const timeLimitMs = readingMode === "rhythm" ? beatDurationMs(event.rhythm.beats, bpm) : null;
    const responseMs = outcome.timedOut ? null : Math.max(0, Math.round(performance.now() - noteStartedAtRef.current));
    const base = { session, correct: outcome.correct, firstAttempt: true, assisted: false, timedOut: outcome.timedOut, responseMs, timeLimitMs, at: new Date().toISOString(), keySignature: study?.key, rhythm: event.rhythm.id };
    if (event.rest) {
      saveEvidence([{ ...base, id: `${session}-${evidenceSerial.current++}`, module: "score", task: `rest-${readingMode}`, item: `rest:${event.rhythm.id}`, answer: outcome.answer }]);
      return;
    }
    const records: unknown[] = [{
      ...base, id: `${session}-${evidenceSerial.current++}`, module: "score", task: study ? `study:${study.id}` : "line",
      item: `${lineClef}:${event.note.id}`, clef: lineClef, midi: event.note.midi ?? noteIdToMidi(event.note.id),
      octave: pitchAt(event.note.position, lineClef, event.note.accidental ?? 0).octave, position: event.note.position,
      accidental: event.note.accidental ?? 0, answer: outcome.answer,
    }];
    // Entering on time after a rest is a separate rhythm skill from naming the note.
    const previous = line[index - 1];
    if (readingMode === "rhythm" && event.afterRest && previous?.rest) records.push({
      ...base, id: `${session}-${evidenceSerial.current++}`, module: "score", task: "entry-after-rest",
      item: `after:${previous.rhythm.id}`, correct: !outcome.timedOut, answer: undefined,
    });
    saveEvidence(records);
  }

  function canonicalAnswer(choice: string) {
    const parsed = parsePitchAnswer(choice);
    return parsed ? `${parsed.letter}${parsed.accidental === 1 ? "#" : parsed.accidental === -1 ? "b" : ""}` : undefined;
  }

  function advanceFlow() {
    flowTimerRef.current = window.setTimeout(() => {
      if (currentIndex >= line.length - 1) {
        if (sessionType === "endless") {
          const extra = buildRandomLine(scoreRange,clef,accidentals);
          if (extra.length) setLine((items) => [...items, ...extra]);
          setCurrentIndex((index) => index + 1);
          setLocked(false);
        } else { completedRef.current = true; finishLine(); }
      }
      else {
        setCurrentIndex((index) => index + 1);
        setLocked(false);
      }
    }, 170);
  }

  /** Marks the current event as silence. Only meaningful on a rest; on a note it is a wrong answer. */
  function answerRest() {
    if (!current || locked || stage !== "playing" || answeredIndexRef.current === currentIndex) return;
    answeredIndexRef.current = currentIndex;
    setLocked(true);
    const guessed = locale === "tr" ? "Sus" : "Rest";
    if (current.rest) {
      setResults((items) => [...items, { index: currentIndex, expected: current.note, guessed, correct: true, timedOut: false, kind: "rest" }]);
      logEvidence(current, currentIndex, { correct: true, timedOut: false, answer: "rest" });
    } else {
      setResults((items) => [...items, { index: currentIndex, expected: current.note, guessed, correct: false, timedOut: false, kind: "note" }]);
      logEvidence(current, currentIndex, { correct: false, timedOut: false, answer: "rest" });
    }
    if (readingMode === "flow") advanceFlow();
  }

  function answer(choice: string) {
    if (!current || locked || stage !== "playing" || answeredIndexRef.current === currentIndex) return;
    if (current.rest) {
      // A note chosen during a rest is an early entry; in rhythm mode the rest still runs to its end.
      answeredIndexRef.current = currentIndex;
      setLocked(true);
      setResults((items) => [...items, { index: currentIndex, expected: current.note, guessed: choice, correct: false, timedOut: false, kind: "rest", early: true }]);
      logEvidence(current, currentIndex, { correct: false, timedOut: false, answer: canonicalAnswer(choice) });
      if (readingMode === "flow") advanceFlow();
      return;
    }
    const guessed = choice;
    const correct = matchesPitch(choice, current.note);
    const result: AnswerResult = { index: currentIndex, expected: current.note, guessed, correct, timedOut: false, kind: "note" };
    setResults((items) => [...items, result]);
    setLocked(true);
    answeredIndexRef.current = currentIndex;
    logEvidence(current, currentIndex, { correct, timedOut: false, answer: canonicalAnswer(choice) });
    if (correct) playPracticeNote(current.note.midi ?? noteIdToMidi(current.note.id), noteSoundEnabled);

    if (readingMode === "flow") advanceFlow();
  }

  // 0 marks a rest, next to the 1–7 note shortcuts.
  useEffect(() => {
    if (stage !== "playing" || !study) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "0" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && event.target.matches("input,textarea,select")) return;
      event.preventDefault();
      answerRestRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stage, study]);

  // Study progress is saved once, after the results for a finished line are complete.
  useEffect(() => {
    if (stage !== "done" || !study || !completedRef.current) return;
    completedRef.current = false;
    const notes = results.filter((item) => item.kind === "note");
    const rests = results.filter((item) => item.kind === "rest");
    if (!notes.length && !rests.length) return;
    const row: StudyProgress = { id: study.id, at: new Date().toISOString(), notes: notes.length, notesCorrect: notes.filter((item) => item.correct).length, rests: rests.length, restsKept: rests.filter((item) => item.correct).length, mode: readingMode };
    try {
      const next = [...readStudyProgress(), row].slice(-200);
      localStorage.setItem(STUDY_PROGRESS_KEY, JSON.stringify(next));
      // Deferred so the saved row is shown without a synchronous render cascade.
      window.setTimeout(() => setStudyProgress(next), 0);
    } catch { /* Progress stays available for this visit only. */ }
  }, [stage, study, results, readingMode]);

  usePracticeNavigation({active:stage==='playing'&&!locked,feedback:false,choices:answerChoices.map(n=>n+answerAccidental),onAnswer:answer,onNext:()=>{}});
  if (stage === "setup") {
    return (
      <section className="score-reading-shell score-reading-setup">
        {!study&&<NotationOptions locale={locale} clef={clef} setClef={setClef} accidentals={accidentals} setAccidentals={setAccidentals} />}
        <header className="score-reading-hero">
          <div className="score-reading-hero-copy"><p className="kicker">{text.kicker}</p><h1>{text.title}</h1><p>{text.lead}</p></div>
          <div className="score-reading-hero-visual">
            <RhythmPatternPreview variant="mixed" className="score-reading-hero-score" />
            <p><strong>{study?study.title[locale]:text.randomLine}</strong><span>{study?study.tip[locale]:text.randomLineCopy}</span></p>
          </div>
        </header>

        <div className="score-reading-options">
          <section className="score-study-picker"><p className="kicker">{locale==='tr'?'HEDEFLİ ÇALIŞMA':'FOCUSED PRACTICE'}</p><h2>{locale==='tr'?'Bir beceriye odaklan':'Focus on one skill'}</h2><label>{locale==='tr'?'Çalışma seç':'Choose a practice'}<select value={studyId} onChange={event=>{setStudyId(event.target.value);if(event.target.value!=='random'){setClef('treble');setAccidentals('natural');setSessionType('standard');}}}><option value="random">{text.randomLine}</option>{READING_STUDIES.map(item=><option key={item.id} value={item.id}>{item.level}. {item.title[locale]}{passedStudies.includes(item.id)?' ✓':''}</option>)}</select></label>
            {recommendedStudy&&recommendedStudy.id!==studyId&&<button type="button" className="score-study-next" onClick={()=>{setStudyId(recommendedStudy.id);setSessionType('standard');}}>{locale==='tr'?'Sıradaki önerilen etüt':'Next suggested study'}: {recommendedStudy.level}. {recommendedStudy.title[locale]} →</button>}
            {study&&<StudyDetails study={study} locale={locale} passed={passedStudies} />}
            <small>{locale==='tr'?`${passedStudies.length} / ${READING_STUDIES.length} etüt tamamlandı. Tamamlama için nota adlarının en az %80’i ve susların en az %75’i doğru olmalı; bu, enstrüman performansını ölçmez.`:`${passedStudies.length} / ${READING_STUDIES.length} studies completed. Completion needs at least 80% correct note names and 75% of rests kept; it does not measure instrument performance.`}</small></section>
          {!study&&<>
          <section className="score-reading-range-section" aria-labelledby="score-range-title">
            <p className="kicker">{text.range}</p>
            <h2 id="score-range-title">{text.range}</h2>
            <p className="score-range-copy">{text.rangeCopy}</p>
            <div className="score-range-grid" role="group" aria-label={text.range}>
              {(Object.keys(SCORE_RANGE_DEFINITIONS) as ScoreRangeId[]).map((id) => {
                const range = text.ranges[id];
                const selected = scoreRange === id;
                return (
                  <button type="button" key={id} className={selected ? "is-selected" : ""} onClick={() => setScoreRange(id)} aria-pressed={selected}>
                    <strong>{range.title}</strong>
                    <span>{range.description}</span>
                    <small>{range.count}</small>
                    <i aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>
          <section className="score-reading-session-section" aria-labelledby="score-session-title">
            <p className="kicker">{text.session}</p>
            <h2 id="score-session-title">{text.session}</h2>
            <div className="score-session-grid" role="group" aria-label={text.session}>
              <button type="button" className={sessionType === "standard" ? "is-selected" : ""} onClick={() => setSessionType("standard")} aria-pressed={sessionType === "standard"}>
                <strong>{text.standardSession}</strong><span>{text.standardSessionCopy}</span><i aria-hidden="true" />
              </button>
              <button type="button" className={sessionType === "endless" ? "is-selected" : ""} onClick={() => setSessionType("endless")} aria-pressed={sessionType === "endless"}>
                <strong>{text.endlessSession}</strong><span>{text.endlessSessionCopy}</span><i aria-hidden="true" />
              </button>
            </div>
          </section>
          </>}
          <section className="score-reading-mode-section" aria-labelledby="score-mode-title"><p className="kicker">{text.mode}</p><h2 id="score-mode-title">{text.mode}</h2><div className="score-option-grid">
            <button type="button" className={readingMode === "flow" ? "is-selected" : ""} onClick={() => setReadingMode("flow")} aria-pressed={readingMode === "flow"}><strong>{text.flow}</strong><span>{text.flowCopy}</span><i /></button>
            <button type="button" className={readingMode === "rhythm" ? "is-selected" : ""} onClick={() => setReadingMode("rhythm")} aria-pressed={readingMode === "rhythm"}><strong>{text.rhythm}</strong><span>{text.rhythmCopy}</span><i /></button>
          </div></section>
        </div>

        <div className="score-reading-start-card">
          <div><p className="kicker">{text.noteValues}</p><div className="rhythm-legend">{RHYTHM_VALUES.map((rhythm) => {
            const id = rhythm.id as RhythmId;
            const selected = rhythmDemoId === id;
            const playing = selected && rhythmDemoPlaying;
            const pattern = RHYTHM_DEMOS[id];
            const name = text.valueNames[id];
            return (
              <button
                type="button"
                className={`${selected ? "is-selected" : ""} ${playing ? "is-playing" : ""}`.trim()}
                key={id}
                onClick={() => toggleRhythmDemo(id)}
                aria-label={playing ? text.pauseDemo(name) : text.playDemo(name)}
                aria-pressed={playing}
              >
                <span className="rhythm-demo-control" aria-hidden="true">
                  {playing
                    ? <svg viewBox="0 0 20 20"><path d="M5.5 4.5h3v11h-3zM11.5 4.5h3v11h-3z" /></svg>
                    : <svg viewBox="0 0 20 20"><path d="m6.5 4.2 8.2 5.8-8.2 5.8z" /></svg>}
                </span>
                <RhythmGlyph id={id} title={name} />
                <strong>{name}</strong>
                <small>{text.demoRates[id]}</small>
                <span className="rhythm-demo-pulses" aria-hidden="true">
                  {Array.from({ length: pattern.stepCount }, (_, index) => (
                    <i className={playing && rhythmDemoStep === index ? "is-current" : ""} key={index} />
                  ))}
                </span>
              </button>
            );
          })}</div><p className="sr-only" aria-live="polite">{rhythmDemoId ? (rhythmDemoPlaying ? text.demoPlaying(text.valueNames[rhythmDemoId], bpm) : text.demoPaused(text.valueNames[rhythmDemoId])) : ""}</p></div>
          {readingMode === "rhythm" && <div className="score-rhythm-controls"><label className="tempo-control"><span>{text.tempo}</span><strong>{bpm} BPM</strong><input type="range" min="15" max="112" step="1" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label><button type="button" className={`metronome-toggle ${metronomeEnabled ? "is-active" : ""}`} onClick={toggleMetronome} role="switch" aria-checked={metronomeEnabled}><span className="metronome-icon" aria-hidden="true"><i /><i /><i /></span>{metronomeEnabled ? text.metronomeOff : text.metronomeOn}</button></div>}
          <button className="primary-button" type="button" onClick={start}>{text.start} <span aria-hidden="true">→</span></button>
        </div>
      </section>
    );
  }

  if (stage === "done") {
    return (
      <section className="score-reading-shell score-reading-results">
        <CommunityPracticeRecorder active={results.length > 0} activityKey={`score-reading-${sessionKey}`} />
        <LocalResult id={`score-${sessionKey}`} module={locale==='tr'?'Eser okuma':'Score reading'} correct={correctCount} wrong={mistakeCount} milliseconds={elapsedMs} locale={locale} />
        <SessionGuidance locale={locale} module="score" wrong={mistakeCount} attempts={results.length} />
        <p className="kicker">{text.kicker}</p>
        <h1>{sessionType === "endless" ? text.endlessComplete : text.complete}</h1>
        <p>{study?`${study.title[locale]} · ${results.length} / ${line.length}`:sessionType === "endless" ? text.endlessCompleteCopy(correctCount) : text.randomComplete(line.length)}</p>
        {study&&<p>{study.tip[locale]}</p>}
        {study&&<section className="score-study-report" aria-label={locale==='tr'?'Etüt raporu':'Study report'}>
          <div><h2>{locale==='tr'?'Nota adları':'Note names'}</h2><strong>{namedCorrect} / {noteResults.length}</strong><p>{locale==='tr'?'Doğru adlandırılan notalar. Süresi kaçan notalar burada yanlış sayılır.':'Correctly named notes. Notes whose time ran out count as incorrect here.'}</p></div>
          {restResults.length>0&&<div><h2>{locale==='tr'?'Suslar':'Rests'}</h2><strong>{restResults.filter((item)=>item.correct).length} / {restResults.length}</strong><p>{readingMode==='rhythm'?(locale==='tr'?'Süresince hiçbir notaya basılmayan suslar.':'Rests kept silent for their full length.'):(locale==='tr'?'Sus olarak tanınan suslar.':'Rests recognised as rests.')}</p></div>}
          {readingMode==='rhythm'&&<div><h2>{locale==='tr'?'Zamanlama':'Timing'}</h2><strong>{namedNotes.length} / {noteResults.length}</strong><p>{locale==='tr'?`Kendi süresi içinde cevaplanan notalar${afterRestNotes.length?` · sus sonrası zamanında giriş: ${afterRestNotes.filter((item)=>!item.timedOut).length} / ${afterRestNotes.length}`:''}. Bu, ekrandaki cevabın zamanıdır; çalınan sesi ölçmez.`:`Notes answered within their own duration${afterRestNotes.length?` · on-time entries after rests: ${afterRestNotes.filter((item)=>!item.timedOut).length} / ${afterRestNotes.length}`:''}. This times on-screen answers, not played sound.`}</p></div>}
        </section>}
        <dl className="score-reading-stats"><div><dt>{text.correct}</dt><dd>{sessionType === "endless" ? correctCount : `${correctCount} / ${line.length}`}</dd></div><div><dt>{text.mistakes}</dt><dd>{mistakeCount}</dd></div><div><dt>{text.accuracy}</dt><dd>%{accuracy}</dd></div></dl>
        <section className="score-reading-review" aria-labelledby="score-review-title"><h2 id="score-review-title">{text.review}</h2>
          {mistakeCount === 0 ? <p>{text.noMistakes}</p> : <ol>{results.filter((result) => !result.correct).map((result) => <li key={result.index}><b>{result.index + 1}</b><span>{result.kind === "rest" ? (locale==='tr'?'Burada sus vardı':'This was a rest') : text.expected(noteName(result.expected, locale))}</span><small>{result.timedOut ? text.missed : result.early ? (locale==='tr'?`Sus sırasında ${result.guessed} işaretlendi`:`${result.guessed} was pressed during the rest`) : text.answered(result.guessed ?? "")}</small></li>)}</ol>}
        </section>
        <CommunityPracticeStreak compact />
        <div className="score-reading-result-actions"><button className="primary-button" type="button" onClick={start}>{text.again} <span aria-hidden="true">↻</span></button><button className="secondary-button" type="button" onClick={() => setStage("setup")}>{text.settings}</button></div>
      </section>
    );
  }

  const beatWindowMs = beatDurationMs(1, bpm);
  return (
    <section className="score-reading-shell score-reading-session">
      <h1 className="sr-only">{locale==='tr'?'Eser okuma oturumu':'Score reading session'}</h1>
      <div className="score-reading-session-top"><button type="button" onClick={finishLine}>← {text.exit}</button><div className="score-reading-session-progress"><span>{text.progress}</span><strong>{sessionType === "endless" ? currentIndex + 1 : `${Math.min(currentIndex + 1, line.length)} / ${line.length}`}</strong></div><div className="score-reading-session-controls">{readingMode === "rhythm" && <button type="button" className={`metronome-toggle metronome-toggle--session ${metronomeEnabled ? "is-active" : ""}`} onClick={toggleMetronome} role="switch" aria-checked={metronomeEnabled}><span className="metronome-icon" aria-hidden="true"><i /><i /><i /></span>{metronomeEnabled ? text.metronomeOff : text.metronomeOn}</button>}<button type="button" onClick={start}>{text.restart}</button></div></div>
      <div className="score-reading-card">
        <div className="score-reading-context"><p className="kicker">{study?study.title[locale]:text.ranges[scoreRange].title}</p><span>{study?(locale==='tr'?'Kontrollü etüt':'Focused study'):`${sessionType === "endless" ? text.endlessSession : text.ranges[scoreRange].count} · ${text.range}`}</span></div>
        <div className="score-line-scroll" role="region" aria-label={text.progress} tabIndex={0}>
          <RhythmScoreLine
            activeIndex={currentIndex}
            activeNoteRef={currentNoteRef}
            ariaLabel={`${text.progress}: ${Math.min(currentIndex + 1, line.length)} / ${line.length}`}
            className="rhythm-score-line--interactive"
            notes={renderedLine}
            clef={lineClef}
            keySignature={study?.key ?? 0}
            timeSignature={study?.time}
          />
        </div>
        <p className="score-scroll-hint">{locale==='tr'?'↔ Porteyi sağa/sola kaydırabilirsin. Sıradaki nota otomatik ortalanır.':'↔ Scroll the staff horizontally. The current note is centered automatically.'}</p>
        {needsAccidentalChoice&&<div className="accidental-choices" role="group" aria-label={locale==='tr'?'Değiştirici işaret':'Accidental'}>{['','♯','♭'].map(sign=><button type="button" key={sign} aria-pressed={answerAccidental===sign} onClick={()=>setAnswerAccidental(sign)}>{sign||'♮'}</button>)}</div>}
        {readingMode === "rhythm" && current && <div className="rhythm-window" key={`${sessionKey}-${metronomeEnabled}`} style={{ "--rhythm-window": `${beatWindowMs}ms` } as CSSProperties}><span /></div>}
        <div className="score-answer-area"><div><p>{current?.rest ? (locale==='tr'?'Sus: sessizce say.':'Rest: count in silence.') : text.choose}</p><span>{current?.rest ? (readingMode === "rhythm" ? (locale==='tr'?'Bu süre boyunca hiçbir notaya basma; sonraki girişe hazırlan.':'Do not press a note during this rest; prepare the next entry.') : (locale==='tr'?'Susu tanıdığını göstermek için Sus düğmesine bas.':'Press Rest to show you recognised the silence.')) : readingMode === "rhythm" ? text.rhythmHint : text.flowHint}</span><small>{study?(locale==='tr'?'Kısayol: 1–7 nota · 0 sus':'Shortcuts: 1–7 notes · 0 rest'):(locale==='tr'?'Kısayol: 1–7':'Shortcut: 1–7')}</small></div><div className="score-answer-grid" role="group" aria-label={text.choices}>{answerChoices.map((choice,index) => <button type="button" key={choice} onClick={() => answer(choice+answerAccidental)} disabled={locked}>{choice}{answerAccidental}<kbd>{index+1}</kbd></button>)}{study&&<button type="button" className="score-rest-button" onClick={answerRest} disabled={locked}>{locale==='tr'?'Sus':'Rest'} <span aria-hidden="true">{REST_SYMBOLS.quarter}</span><kbd>0</kbd></button>}</div></div>
      </div>
    </section>
  );
}
