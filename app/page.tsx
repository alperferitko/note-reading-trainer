"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type LevelId = "temel" | "yakin" | "tam";
type ModeId = "porte" | "konum";
type Stage = "setup" | "quiz" | "done";
type Locale = "tr" | "en";

type NoteQuestion = {
  id: string;
  solfege: "Do" | "Re" | "Mi" | "Fa" | "Sol" | "La" | "Si";
  letter: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  position: number;
  location: Record<Locale, string>;
  shortLocation: Record<Locale, string>;
};

type Copy = {
  homeLabel: string;
  kicker: string;
  heroLine1: string;
  heroLine2: string;
  heroLead: string;
  scribble: string;
  rangeEyebrow: string;
  chooseRange: string;
  questionStyle: string;
  chooseMode: string;
  modes: Record<ModeId, { title: string; description: string }>;
  start: string;
  setupNote: string;
  progress: string;
  completedLabel: (total: number, completed: number) => string;
  remaining: (count: number) => string;
  question: (number: number) => string;
  prompt: string;
  positionLabel: string;
  answerLabel: string;
  placeholder: string;
  check: string;
  choicesLabel: string;
  correct: string;
  incorrect: string;
  correctCopy: (name: string) => string;
  wrongPrefix: string;
  wrongSuffix: string;
  next: string;
  results: string;
  endSession: string;
  sessionComplete: string;
  greatWork: string;
  completedCopy: (level: string) => string;
  firstTry: string;
  uniqueQuestions: string;
  firstTryCorrect: string;
  totalWrong: string;
  averageResponse: string;
  reviewList: string;
  hardest: string;
  wrongCount: (count: number) => string;
  perfect: string;
  repeat: string;
  changeLevel: string;
  footer: string;
  seconds: string;
};

const COPY: Record<Locale, Copy> = {
  tr: {
    homeLabel: "Nota Nota ana sayfa",
    kicker: "Sol anahtarı · doğal notalar",
    heroLine1: "Notayı gör.",
    heroLine2: "İsmini söyle.",
    heroLead: "Porte üzerindeki notaları ezberlemek için kısa, odaklı ve her seferinde farklı bir çalışma.",
    scribble: "Her gün biraz daha akıcı.",
    rangeEyebrow: "Çalışma alanı",
    chooseRange: "Seviyeni seç",
    questionStyle: "Soru biçimi",
    chooseMode: "Nasıl çalışacaksın?",
    modes: {
      porte: { title: "Porteden oku", description: "Notayı gör, ismini yaz" },
      konum: { title: "Konumu oku", description: "Konumu gör, ismini yaz" },
    },
    start: "Oturumu başlat",
    setupNote: "Her nota bir kez eklenir · Liste her oturumda yeniden karıştırılır",
    progress: "İlerleme",
    completedLabel: (total, completed) => `${total} sorudan ${completed} tamamlandı`,
    remaining: (count) => `${count} nota kaldı`,
    question: (number) => `Soru ${number}`,
    prompt: "Bu notanın adı nedir?",
    positionLabel: "Konum",
    answerLabel: "Cevabını yaz",
    placeholder: "Do, Re, Mi…",
    check: "Kontrol et",
    choicesLabel: "Kullanılabilecek cevaplar",
    correct: "Doğru",
    incorrect: "Yanlış",
    correctCopy: (name) => `${name} notasını bildin.`,
    wrongPrefix: "Doğru cevap",
    wrongSuffix: "Bu nota listenin sonuna eklendi.",
    next: "Sonraki",
    results: "Sonuçlar",
    endSession: "Oturumu bitir",
    sessionComplete: "Oturum tamamlandı",
    greatWork: "Harika iş!",
    completedCopy: (level) => `${level} listesindeki bütün notaları en az bir kez doğru cevapladın.`,
    firstTry: "ilk deneme",
    uniqueQuestions: "Benzersiz soru",
    firstTryCorrect: "İlk denemede doğru",
    totalWrong: "Toplam yanlış",
    averageResponse: "Ortalama cevap",
    reviewList: "Tekrar listesi",
    hardest: "En çok zorlayan notalar",
    wrongCount: (count) => `${count} yanlış`,
    perfect: "Hiç yanlış yok. Bu oturum pürüzsüz geçti!",
    repeat: "Aynı ayarlarla yeniden çalış",
    changeLevel: "Seviyeyi değiştir",
    footer: "Ezber değil, akıcılık.",
    seconds: "sn",
  },
  en: {
    homeLabel: "Nota Nota home",
    kicker: "Treble clef · natural notes",
    heroLine1: "See the note.",
    heroLine2: "Name it.",
    heroLead: "Build fluent note recognition with short, focused sessions that reshuffle every time.",
    scribble: "A little more fluent every day.",
    rangeEyebrow: "Practice range",
    chooseRange: "Choose your range",
    questionStyle: "Question style",
    chooseMode: "How do you want to practise?",
    modes: {
      porte: { title: "Read the staff", description: "See a note, type its letter name" },
      konum: { title: "Read the position", description: "Read the position, type its letter name" },
    },
    start: "Start session",
    setupNote: "Each note appears once · The order is reshuffled for every session",
    progress: "Progress",
    completedLabel: (total, completed) => `${completed} of ${total} questions completed`,
    remaining: (count) => `${count} ${count === 1 ? "note" : "notes"} left`,
    question: (number) => `Question ${number}`,
    prompt: "What is this note's letter name?",
    positionLabel: "Staff position",
    answerLabel: "Type your answer",
    placeholder: "C, D, E…",
    check: "Check answer",
    choicesLabel: "Available letter names",
    correct: "Correct",
    incorrect: "Incorrect",
    correctCopy: (name) => `You identified ${name} correctly.`,
    wrongPrefix: "The correct answer is",
    wrongSuffix: "This note was moved to the end of the queue.",
    next: "Next",
    results: "Results",
    endSession: "End session",
    sessionComplete: "Session complete",
    greatWork: "Nicely done!",
    completedCopy: (level) => `You correctly identified every note in the ${level} range at least once.`,
    firstTry: "first try",
    uniqueQuestions: "Unique questions",
    firstTryCorrect: "Correct on first try",
    totalWrong: "Incorrect answers",
    averageResponse: "Average response",
    reviewList: "Review list",
    hardest: "Notes to revisit",
    wrongCount: (count) => `${count} incorrect`,
    perfect: "Perfect run — no incorrect answers.",
    repeat: "Practise again with the same settings",
    changeLevel: "Change range",
    footer: "Build fluency, not guesswork.",
    seconds: "sec",
  },
};

const ALL_NOTES: NoteQuestion[] = [
  { id: "c4", solfege: "Do", letter: "C", position: -2, location: { tr: "portenin altındaki 1. ek çizgi üzerinde", en: "on the first ledger line below the staff" }, shortLocation: { tr: "Alt 1. ek çizgi", en: "1st ledger line below" } },
  { id: "d4", solfege: "Re", letter: "D", position: -1, location: { tr: "1. çizginin altındaki aralıkta", en: "in the space below the staff" }, shortLocation: { tr: "1. çizginin altı", en: "Space below the staff" } },
  { id: "e4", solfege: "Mi", letter: "E", position: 0, location: { tr: "1. çizgi üzerinde", en: "on the first line" }, shortLocation: { tr: "1. çizgi", en: "1st line" } },
  { id: "f4", solfege: "Fa", letter: "F", position: 1, location: { tr: "1. aralıkta", en: "in the first space" }, shortLocation: { tr: "1. aralık", en: "1st space" } },
  { id: "g4", solfege: "Sol", letter: "G", position: 2, location: { tr: "2. çizgi üzerinde", en: "on the second line" }, shortLocation: { tr: "2. çizgi", en: "2nd line" } },
  { id: "a4", solfege: "La", letter: "A", position: 3, location: { tr: "2. aralıkta", en: "in the second space" }, shortLocation: { tr: "2. aralık", en: "2nd space" } },
  { id: "b4", solfege: "Si", letter: "B", position: 4, location: { tr: "3. çizgi üzerinde", en: "on the third line" }, shortLocation: { tr: "3. çizgi", en: "3rd line" } },
  { id: "c5", solfege: "Do", letter: "C", position: 5, location: { tr: "3. aralıkta", en: "in the third space" }, shortLocation: { tr: "3. aralık", en: "3rd space" } },
  { id: "d5", solfege: "Re", letter: "D", position: 6, location: { tr: "4. çizgi üzerinde", en: "on the fourth line" }, shortLocation: { tr: "4. çizgi", en: "4th line" } },
  { id: "e5", solfege: "Mi", letter: "E", position: 7, location: { tr: "4. aralıkta", en: "in the fourth space" }, shortLocation: { tr: "4. aralık", en: "4th space" } },
  { id: "f5", solfege: "Fa", letter: "F", position: 8, location: { tr: "5. çizgi üzerinde", en: "on the fifth line" }, shortLocation: { tr: "5. çizgi", en: "5th line" } },
  { id: "g5", solfege: "Sol", letter: "G", position: 9, location: { tr: "5. çizginin üstündeki aralıkta", en: "in the space above the staff" }, shortLocation: { tr: "5. çizginin üstü", en: "Space above the staff" } },
  { id: "a5", solfege: "La", letter: "A", position: 10, location: { tr: "portenin üstündeki 1. ek çizgi üzerinde", en: "on the first ledger line above the staff" }, shortLocation: { tr: "Üst 1. ek çizgi", en: "1st ledger line above" } },
  { id: "b5", solfege: "Si", letter: "B", position: 11, location: { tr: "1. ek çizginin üstündeki aralıkta", en: "in the space above the first ledger line" }, shortLocation: { tr: "Üst ek çizginin üstü", en: "Above the 1st ledger line" } },
  { id: "c6", solfege: "Do", letter: "C", position: 12, location: { tr: "portenin üstündeki 2. ek çizgi üzerinde", en: "on the second ledger line above the staff" }, shortLocation: { tr: "Üst 2. ek çizgi", en: "2nd ledger line above" } },
];

const LEVELS: Record<Locale, { id: LevelId; eyebrow: string; title: string; description: string; count: number }[]> = {
  tr: [
    { id: "temel", eyebrow: "Seviye 1", title: "Temel porte", description: "Beş çizgi ve dört aralıktaki notalar", count: 9 },
    { id: "yakin", eyebrow: "Seviye 2", title: "Yakın çevre", description: "Temel porte, komşu aralıklar ve yakın ek çizgiler", count: 13 },
    { id: "tam", eyebrow: "Seviye 3", title: "Tam doğal sesler", description: "Alt Do’dan üst Do’ya bütün doğal notalar", count: 15 },
  ],
  en: [
    { id: "temel", eyebrow: "Level 1", title: "Notes on the staff", description: "The nine notes on the five lines and four spaces", count: 9 },
    { id: "yakin", eyebrow: "Level 2", title: "Staff + ledger lines", description: "The staff, adjacent spaces, and the nearest ledger lines", count: 13 },
    { id: "tam", eyebrow: "Level 3", title: "Full natural range", description: "Every natural note from middle C to high C", count: 15 },
  ],
};

function questionsFor(level: LevelId) {
  if (level === "temel") return ALL_NOTES.filter((note) => note.position >= 0 && note.position <= 8);
  if (level === "yakin") return ALL_NOTES.filter((note) => note.position >= -2 && note.position <= 10);
  return ALL_NOTES;
}

function shuffledWithoutRuns<T extends { position: number }>(items: T[]) {
  const pool = [...items];
  const result: T[] = [];

  while (pool.length) {
    const previous = result.at(-1);
    const safe = pool
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !previous || Math.abs(item.position - previous.position) !== 1);
    const choices = safe.length ? safe : pool.map((item, index) => ({ item, index }));
    const picked = choices[Math.floor(Math.random() * choices.length)];
    result.push(picked.item);
    pool.splice(picked.index, 1);
  }

  return result;
}

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function noteName(note: NoteQuestion, locale: Locale) {
  return locale === "tr" ? note.solfege : note.letter;
}

function Staff({ note, locale, compact = false }: { note: NoteQuestion; locale: Locale; compact?: boolean }) {
  const step = compact ? 10 : 14;
  const firstLineY = compact ? 72 : 98;
  const noteY = firstLineY - note.position * (step / 2);
  const lineWidth = compact ? 240 : 390;
  const startX = compact ? 34 : 42;
  const noteX = compact ? 148 : 230;
  const ledgerPositions = [-2, 10, 12].filter((position) => {
    if (position === -2) return note.position <= -2;
    if (position === 10) return note.position >= 10;
    return note.position >= 12;
  });

  return (
    <div className={`staff ${compact ? "staff--compact" : ""}`} aria-label={`${noteName(note, locale)}, ${note.location[locale]}`} role="img">
      <span className="clef" aria-hidden="true">𝄞</span>
      <div className="staff-lines" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} style={{ left: startX, width: lineWidth, top: firstLineY - index * step }} />
        ))}
        {ledgerPositions.map((position) => (
          <span
            className="ledger"
            key={position}
            style={{ left: noteX - (compact ? 17 : 22), width: compact ? 34 : 44, top: firstLineY - position * (step / 2) }}
          />
        ))}
        <span className="note-head" style={{ left: noteX, top: noteY }} />
        <span className="note-stem" style={{ left: noteX + (compact ? 8 : 11), top: noteY - (compact ? 34 : 45) }} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? "stat--accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("tr");
  const [stage, setStage] = useState<Stage>("setup");
  const [level, setLevel] = useState<LevelId>("temel");
  const [mode, setMode] = useState<ModeId>("porte");
  const [queue, setQueue] = useState<NoteQuestion[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; note: NoteQuestion } | null>(null);
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [wrongByNote, setWrongByNote] = useState<Record<string, number>>({});
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [totalWrong, setTotalWrong] = useState(0);
  const [answerTimes, setAnswerTimes] = useState<number[]>([]);
  const [questionStartedAt, setQuestionStartedAt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const answerFormRef = useRef<HTMLFormElement>(null);
  const copy = COPY[locale];
  const levels = LEVELS[locale];

  const uniqueCount = questionsFor(level).length;
  const current = queue[0];
  const displayedNote = feedback?.note ?? current;
  const answeredCorrectly = uniqueCount - queue.length;
  const selectedLevel = levels.find((item) => item.id === level)!;
  const answerChoices = locale === "tr" ? ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"] : ["C", "D", "E", "F", "G", "A", "B"];

  const hardestNotes = useMemo(() => {
    return Object.entries(wrongByNote)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id, count]) => ({ note: ALL_NOTES.find((item) => item.id === id)!, count }));
  }, [wrongByNote]);

  useEffect(() => {
    const requestedLocale = new URLSearchParams(window.location.search).get("lang");
    const savedLocale = window.localStorage.getItem("nota-nota-locale");
    const nextLocale = requestedLocale === "tr" || requestedLocale === "en" ? requestedLocale : savedLocale;
    if (nextLocale !== "tr" && nextLocale !== "en") return;
    const timer = window.setTimeout(() => setLocale(nextLocale), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem("nota-nota-locale", locale);
  }, [locale]);

  useEffect(() => {
    if (stage === "quiz" && !feedback) inputRef.current?.focus({ preventScroll: true });
  }, [stage, feedback, current?.id]);

  useEffect(() => {
    if (stage !== "quiz" || feedback || !window.matchMedia("(max-width: 620px)").matches) return;

    const input = inputRef.current;
    const form = answerFormRef.current;
    const viewport = window.visualViewport;
    if (!input || !form) return;

    let animationFrame = 0;
    let settleTimers: number[] = [];

    function pinAnswerForm() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        if (document.activeElement !== input) return;

        if (!viewport) {
          form.scrollIntoView({ block: "end" });
          return;
        }

        const visibleBottom = viewport.offsetTop + viewport.height;
        const formBottom = form.getBoundingClientRect().bottom;
        const offset = formBottom + 12 - visibleBottom;
        if (Math.abs(offset) > 2) window.scrollBy(0, offset);
      });
    }

    function schedulePin() {
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      settleTimers = [80, 240, 480].map((delay) => window.setTimeout(pinAnswerForm, delay));
      pinAnswerForm();
    }

    function handleFocus() {
      document.documentElement.classList.add("quiz-keyboard-open");
      schedulePin();
    }

    function handleBlur() {
      document.documentElement.classList.remove("quiz-keyboard-open");
      settleTimers.forEach((timer) => window.clearTimeout(timer));
    }

    input.addEventListener("focus", handleFocus);
    input.addEventListener("blur", handleBlur);
    viewport?.addEventListener("resize", schedulePin);
    viewport?.addEventListener("scroll", schedulePin);
    window.addEventListener("orientationchange", schedulePin);

    if (document.activeElement === input) handleFocus();

    return () => {
      input.removeEventListener("focus", handleFocus);
      input.removeEventListener("blur", handleBlur);
      viewport?.removeEventListener("resize", schedulePin);
      viewport?.removeEventListener("scroll", schedulePin);
      window.removeEventListener("orientationchange", schedulePin);
      window.cancelAnimationFrame(animationFrame);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      document.documentElement.classList.remove("quiz-keyboard-open");
    };
  }, [stage, feedback, current?.id]);

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    setAnswer("");
  }

  function startSession() {
    setQueue(shuffledWithoutRuns(questionsFor(level)));
    setAttempts({});
    setWrongByNote({});
    setFirstTryCorrect(0);
    setTotalWrong(0);
    setAnswerTimes([]);
    setAnswer("");
    setFeedback(null);
    setQuestionStartedAt(Date.now());
    setStage("quiz");
  }

  function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (!current || feedback || !normalizeAnswer(answer)) return;

    const elapsed = Math.max(0.1, (Date.now() - questionStartedAt) / 1000);
    const normalized = normalizeAnswer(answer);
    const correct = normalized === normalizeAnswer(current.solfege) || normalized === normalizeAnswer(current.letter);
    setAnswerTimes((times) => [...times, elapsed]);
    setFeedback({ correct, note: current });

    if (correct) {
      if ((attempts[current.id] ?? 0) === 0) setFirstTryCorrect((count) => count + 1);
      setQueue((items) => items.slice(1));
    } else {
      setAttempts((values) => ({ ...values, [current.id]: (values[current.id] ?? 0) + 1 }));
      setWrongByNote((values) => ({ ...values, [current.id]: (values[current.id] ?? 0) + 1 }));
      setTotalWrong((count) => count + 1);
      setQueue((items) => [...items.slice(1), items[0]]);
    }
  }

  function nextQuestion() {
    if (!feedback) return;
    if (queue.length === 0) {
      setStage("done");
    } else {
      setFeedback(null);
      setAnswer("");
      setQuestionStartedAt(Date.now());
    }
  }

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (stage === "quiz" && feedback && event.key === "Enter") {
        event.preventDefault();
        nextQuestion();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  const averageTime = answerTimes.length
    ? `${(answerTimes.reduce((sum, value) => sum + value, 0) / answerTimes.length).toFixed(1).replace(".", locale === "tr" ? "," : ".")} ${copy.seconds}`
    : `0${locale === "tr" ? "," : "."}0 ${copy.seconds}`;
  const firstTryRate = uniqueCount ? Math.round((firstTryCorrect / uniqueCount) * 100) : 0;

  return (
    <main>
      <header className="site-header">
        <button className="brand" type="button" onClick={() => setStage("setup")} aria-label={copy.homeLabel}>
          <span className="brand-mark" aria-hidden="true">♪</span>
          <span>Nota Nota</span>
        </button>
        <div className="header-actions">
          {stage === "quiz" && (
            <div className="session-meta">
              <span>{selectedLevel.title}</span>
              <span className="meta-dot" />
              <span>{copy.modes[mode].title}</span>
            </div>
          )}
          <div className="language-switch" role="group" aria-label={locale === "tr" ? "Dil seçimi" : "Language selection"}>
            <button type="button" className={locale === "tr" ? "is-active" : ""} onClick={() => changeLocale("tr")} aria-pressed={locale === "tr"}>TR</button>
            <button type="button" className={locale === "en" ? "is-active" : ""} onClick={() => changeLocale("en")} aria-pressed={locale === "en"}>EN</button>
          </div>
        </div>
      </header>

      {stage === "setup" && (
        <section className="setup-shell">
          <div className="hero-copy">
            <p className="kicker">{copy.kicker}</p>
            <h1>{copy.heroLine1}<br /><em>{copy.heroLine2}</em></h1>
            <p className="hero-lead">{copy.heroLead}</p>
            <div className="hero-staff" aria-hidden="true">
              <Staff note={ALL_NOTES[6]} locale={locale} compact />
              <span className="scribble">{copy.scribble}</span>
            </div>
          </div>

          <div className="setup-panel">
            <div className="step-heading">
              <span>01</span>
              <div><p>{copy.rangeEyebrow}</p><h2>{copy.chooseRange}</h2></div>
            </div>
            <div className="level-grid">
              {levels.map((item) => (
                <button key={item.id} type="button" className={`level-card ${level === item.id ? "is-selected" : ""}`} onClick={() => setLevel(item.id)}>
                  <span className="level-top"><small>{item.eyebrow}</small><b>{item.count} {locale === "tr" ? "nota" : "notes"}</b></span>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                  <i aria-hidden="true">{level === item.id ? "✓" : ""}</i>
                </button>
              ))}
            </div>

            <div className="divider" />
            <div className="step-heading compact-heading">
              <span>02</span>
              <div><p>{copy.questionStyle}</p><h2>{copy.chooseMode}</h2></div>
            </div>
            <div className="mode-grid">
              <button type="button" className={`mode-card ${mode === "porte" ? "is-selected" : ""}`} onClick={() => setMode("porte")}>
                <span className="mode-icon" aria-hidden="true">𝄞</span>
                <span><strong>{copy.modes.porte.title}</strong><small>{copy.modes.porte.description}</small></span>
                <i aria-hidden="true">{mode === "porte" ? "●" : "○"}</i>
              </button>
              <button type="button" className={`mode-card ${mode === "konum" ? "is-selected" : ""}`} onClick={() => setMode("konum")}>
                <span className="mode-icon mode-icon--text" aria-hidden="true">1.</span>
                <span><strong>{copy.modes.konum.title}</strong><small>{copy.modes.konum.description}</small></span>
                <i aria-hidden="true">{mode === "konum" ? "●" : "○"}</i>
              </button>
            </div>

            <button className="primary-button" type="button" onClick={startSession}>
              {copy.start} <span aria-hidden="true">→</span>
            </button>
            <p className="setup-note">{copy.setupNote}</p>
          </div>
        </section>
      )}

      {stage === "quiz" && displayedNote && (
        <section className="quiz-shell">
          <div className="progress-row">
            <div>
              <span className="progress-label">{copy.progress}</span>
              <strong>{answeredCorrectly}<small> / {uniqueCount}</small></strong>
            </div>
            <div className="progress-track" aria-label={copy.completedLabel(uniqueCount, answeredCorrectly)}>
              <span style={{ width: `${(answeredCorrectly / uniqueCount) * 100}%` }} />
            </div>
            <span className="remaining">{copy.remaining(queue.length)}</span>
          </div>

          <div className="question-card">
            <div className="question-number">{copy.question(Math.min(answeredCorrectly + 1, uniqueCount))}</div>
            <p className="question-prompt">{copy.prompt}</p>
            {mode === "porte" ? (
              <Staff note={displayedNote} locale={locale} />
            ) : (
              <div className="location-question">
                <span>{copy.positionLabel}</span>
                <strong>{displayedNote.shortLocation[locale]}</strong>
                <p>{displayedNote.location[locale].charAt(0).toUpperCase() + displayedNote.location[locale].slice(1)}</p>
              </div>
            )}

            {!feedback ? (
              <form ref={answerFormRef} className="answer-form" onSubmit={submitAnswer}>
                <label htmlFor="answer">{copy.answerLabel}</label>
                <div className="answer-line">
                  <input
                    id="answer"
                    ref={inputRef}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder={copy.placeholder}
                    autoComplete="off"
                    autoCapitalize="none"
                    enterKeyHint="done"
                  />
                  <button type="submit" disabled={!normalizeAnswer(answer)}>{copy.check} <span aria-hidden="true">↵</span></button>
                </div>
                <div className="note-hints" aria-label={copy.choicesLabel}>
                  {answerChoices.map((name) => <button type="button" key={name} onClick={() => { setAnswer(name); inputRef.current?.focus(); }}>{name}</button>)}
                </div>
              </form>
            ) : (
              <div className={`feedback ${feedback.correct ? "feedback--correct" : "feedback--wrong"}`} aria-live="polite">
                <span className="feedback-icon" aria-hidden="true">{feedback.correct ? "✓" : "×"}</span>
                <div>
                  <strong>{feedback.correct ? copy.correct : copy.incorrect}</strong>
                  {feedback.correct ? (
                    <p>{copy.correctCopy(noteName(feedback.note, locale))}</p>
                  ) : (
                    <p>{copy.wrongPrefix} <b>{noteName(feedback.note, locale)}</b> — {feedback.note.location[locale]}. {copy.wrongSuffix}</p>
                  )}
                </div>
                <button type="button" onClick={nextQuestion}>{queue.length ? copy.next : copy.results} <span aria-hidden="true">→</span></button>
              </div>
            )}
          </div>

          <button className="text-button" type="button" onClick={() => setStage("setup")}>{copy.endSession}</button>
        </section>
      )}

      {stage === "done" && (
        <section className="results-shell">
          <div className="results-intro">
            <span className="result-flourish" aria-hidden="true">♪</span>
            <p className="kicker">{copy.sessionComplete}</p>
            <h1>{copy.greatWork}</h1>
            <p>{copy.completedCopy(selectedLevel.title)}</p>
          </div>

          <div className="results-card">
            <div className="score-ring" style={{ "--score": `${firstTryRate * 3.6}deg` } as React.CSSProperties}>
              <div><strong>%{firstTryRate}</strong><span>{copy.firstTry}</span></div>
            </div>
            <div className="stats-grid">
              <Stat label={copy.uniqueQuestions} value={uniqueCount} />
              <Stat label={copy.firstTryCorrect} value={firstTryCorrect} accent />
              <Stat label={copy.totalWrong} value={totalWrong} />
              <Stat label={copy.averageResponse} value={averageTime} />
            </div>
          </div>

          <div className="hardest-card">
            <div><p className="kicker">{copy.reviewList}</p><h2>{copy.hardest}</h2></div>
            {hardestNotes.length ? (
              <div className="hardest-list">
                {hardestNotes.map(({ note, count }) => (
                  <div key={note.id}><span className="note-pill">{noteName(note, locale)}</span><span>{note.shortLocation[locale]}</span><b>{copy.wrongCount(count)}</b></div>
                ))}
              </div>
            ) : (
              <p className="perfect-copy">{copy.perfect}</p>
            )}
          </div>

          <div className="result-actions">
            <button className="primary-button" type="button" onClick={startSession}>{copy.repeat} <span>↻</span></button>
            <button className="secondary-button" type="button" onClick={() => setStage("setup")}>{copy.changeLevel}</button>
          </div>
        </section>
      )}

      <footer><span>Nota Nota</span><p>{copy.footer}</p><span>𝄞</span></footer>
    </main>
  );
}
