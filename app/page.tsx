"use client";
/* eslint-disable @next/next/no-img-element -- Relative public assets must work on both the custom domain and GitHub Pages subpath. */

import { FormEvent, lazy, MouseEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CommunityHeader,
  CommunityLeaderboardButton,
  CommunityLegalLink,
  CommunityPracticeRecorder,
  CommunityPracticeStreak,
  CommunityProvider,
  CommunityResult,
} from "./community";
import { RhythmPatternPreview } from "./rhythm-glyphs";
import type { ScoreSubmission, SessionType } from "@/lib/leaderboard";
import {
  buildSessionInsight,
  normalizeNoteAnswer,
  noteClassFromAnswer,
  noteClassFromLetter,
  pickDominantConfusion,
} from "@/lib/session-insights.mjs";
import {
  noteIdToMidi,
  playPracticeNote,
  readNoteSoundPreference,
  writeNoteSoundPreference,
} from "@/lib/practice-audio";

type LevelId = "temel" | "yakin" | "tam" | "genis";
type ModeId = "porte" | "konum";
type Stage = "landing" | "setup" | "quiz" | "done" | "pieces" | "instruments" | "guitar";
type Locale = "tr" | "en";
type ReadingProfileId = "new" | "growing" | "confident";

const STAGE_ROUTES: Record<Stage, string> = {
  landing: "?",
  setup: "?sayfa=nota-oku",
  quiz: "?sayfa=nota-oku&gorunum=oturum",
  done: "?sayfa=nota-oku&gorunum=sonuc",
  pieces: "?sayfa=eser-okuma",
  instruments: "?sayfa=muzik-aletleri",
  guitar: "?sayfa=muzik-aletleri&enstruman=gitar",
};

const READING_PRESETS: Record<ReadingProfileId, { level: LevelId; mode: ModeId; sessionType: SessionType }> = {
  new: { level: "temel", mode: "porte", sessionType: "standard" },
  growing: { level: "yakin", mode: "porte", sessionType: "standard" },
  confident: { level: "genis", mode: "porte", sessionType: "standard" },
};

function stageFromSearch(search: string): Stage {
  const params = new URLSearchParams(search);
  if (params.get("sayfa") === "nota-oku") return "setup";
  if (params.get("sayfa") === "eser-okuma") return "pieces";
  if (params.get("sayfa") === "muzik-aletleri" && params.get("enstruman") === "gitar") return "guitar";
  if (params.get("sayfa") === "muzik-aletleri") return "instruments";
  return "landing";
}

const GuitarTrainer = lazy(() => import("./guitar-trainer").then((module) => ({
  default: module.GuitarTrainer,
})));

const ScoreReadingTrainer = lazy(() => import("./score-reading-trainer").then((module) => ({
  default: module.ScoreReadingTrainer,
})));

type NoteQuestion = {
  id: string;
  solfege: "Do" | "Re" | "Mi" | "Fa" | "Sol" | "La" | "Si";
  letter: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  position: number;
  location: Record<Locale, string>;
  shortLocation: Record<Locale, string>;
};

type QueuedQuestion = {
  key: number;
  misses: number;
  note: NoteQuestion;
};

type AnswerNoteClass = NonNullable<ReturnType<typeof noteClassFromAnswer>>;
type AnswerFeedback = { correct: boolean; note: NoteQuestion; guessed: AnswerNoteClass | null };

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
  wrongGuess: (name: string) => string;
  wrongSuffix: string;
  next: string;
  results: string;
  endSession: string;
  restartSession: string;
  sessionComplete: string;
  sessionSummary: string;
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
  patternEyebrow: string;
  confusionCopy: (expected: string, location: string, guessed: string) => string;
  confusionNext: string;
  reviewFocus: (name: string, location: string) => string;
  perfect: string;
  noAnswers: string;
  cleanSoFar: string;
  repeat: string;
  changeLevel: string;
  footer: string;
  seconds: string;
};

const COPY: Record<Locale, Copy> = {
  tr: {
    homeLabel: "NotaNota ana sayfa",
    kicker: "Sol anahtarı, doğal notalar",
    heroLine1: "Bugünkü Çalışma",
    heroLine2: "Nota Oku",
    heroLead: "Seviyeni, soru biçimini ve oturum türünü seç; kısa ve odaklı çalışmana başla.",
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
    setupNote: "Hazırsan başlayalım! Sakin bak, net cevapla.",
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
    wrongGuess: (name) => `Sen ${name} yanıtını verdin.`,
    wrongSuffix: "Bu nota listenin sonuna eklendi.",
    next: "Sonraki",
    results: "Sonuçlar",
    endSession: "Oturumu bitir",
    restartSession: "Oturumu yeniden başlat",
    sessionComplete: "Oturum tamamlandı",
    sessionSummary: "Oturum özeti",
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
    patternEyebrow: "Bu turdaki örüntü",
    confusionCopy: (expected, location, guessed) => `Bu turda ${location} görünen ${expected} için en sık ${guessed} yanıtını verdin.`,
    confusionNext: "Sonraki turda bu iki konumu yan yana karşılaştırabilirsin.",
    reviewFocus: (name, location) => `${location} görünen ${name}, bu turda en çok tekrar isteyen notaydı.`,
    perfect: "Hiç yanlış yok. Bu oturum pürüzsüz geçti!",
    noAnswers: "Henüz cevap verilmedi. Bu oturum için tekrar verisi oluşmadı.",
    cleanSoFar: "Yanıtladığın notalarda yanlış yok.",
    repeat: "Aynı ayarlarla yeniden çalış",
    changeLevel: "Seviyeyi değiştir",
    footer: "Ezber değil, akıcılık.",
    seconds: "sn",
  },
  en: {
    homeLabel: "NotaNota home",
    kicker: "Treble clef, natural notes",
    heroLine1: "Today’s Practice",
    heroLine2: "Sight-Reading",
    heroLead: "Choose your range, question style and session type, then begin a focused round.",
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
    setupNote: "Ready when you are! Look calmly, answer clearly.",
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
    wrongPrefix: "Correct answer",
    wrongGuess: (name) => `You answered ${name}.`,
    wrongSuffix: "This note was moved to the end of the queue.",
    next: "Next",
    results: "Results",
    endSession: "End session",
    restartSession: "Restart session",
    sessionComplete: "Session complete",
    sessionSummary: "Session summary",
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
    patternEyebrow: "Pattern from this run",
    confusionCopy: (expected, location, guessed) => `For ${expected} ${location}, your most frequent answer was ${guessed}.`,
    confusionNext: "Next time, try comparing those two staff positions side by side.",
    reviewFocus: (name, location) => `${name} ${location} was the note that called for the most review in this run.`,
    perfect: "Perfect run. No incorrect answers.",
    noAnswers: "No answers yet. This session did not produce any review data.",
    cleanSoFar: "No incorrect answers among the notes you attempted.",
    repeat: "Practise again with the same settings",
    changeLevel: "Change range",
    footer: "Build fluency, not guesswork.",
    seconds: "sec",
  },
};

const EXTRA_COPY = {
  tr: {
    sessionEyebrow: "Oturum türü",
    chooseSession: "Nasıl bir oturum istiyorsun?",
    standard: { title: "Normal mod", description: "Bütün notaları hatasız ve olabildiğince hızlı tamamla" },
    endless: { title: "Sonsuz mod", description: "İlk yanlışına kadar rastgele notalarla devam et" },
    endlessSetupNote: "Hazırsan başlayalım! İlk yanlış seriyi bitirir.",
    correctAnswers: "Doğru cevap",
    noMistakes: "Hatasız seri",
    endlessResultTitle: "Seri sona erdi.",
    totalTime: "Toplam süre",
    endedSession: (count: number, time: string) => `${count} doğru cevap, ${time}`,
    stoppedSession: (count: number) => `Oturumu ${count} doğru cevapla bitirdin.`,
    endlessProgress: "Sonsuz çalışma",
  },
  en: {
    sessionEyebrow: "Session type",
    chooseSession: "How long do you want to practise?",
    standard: { title: "Standard mode", description: "Complete every note perfectly and as quickly as possible" },
    endless: { title: "Endless mode", description: "Keep receiving random notes until your first mistake" },
    endlessSetupNote: "Ready when you are! The first mistake ends the streak.",
    correctAnswers: "Correct answers",
    noMistakes: "Perfect streak",
    endlessResultTitle: "Streak complete.",
    totalTime: "Total time",
    endedSession: (count: number, time: string) => `${count} correct ${count === 1 ? "answer" : "answers"}, ${time}`,
    stoppedSession: (count: number) => `You ended the session with ${count} correct answers.`,
    endlessProgress: "Endless practice",
  },
} as const;

const LANDING_COPY = {
  tr: {
    eyebrow: "NotaNota müzik okuryazarlığı",
    title: "Notaları gör.",
    titleAccent: "Adını söyle.",
    lead: "Sol anahtarındaki doğal notaları çizgi, aralık ve ek çizgiler üzerinde sakin, odaklı oturumlarla akıcı biçimde tanımayı öğren.",
    primary: "Nota okumaya başla",
    proofOne: "Türkçe + English",
    proofTwo: "Kısa, odaklı oturumlar",
    proofThree: "Hız ve doğruluk takibi",
    modulesEyebrow: "Çalışma stüdyosu",
    modulesTitle: "Bugün ne çalışmak istiyorsun?",
    readingCategory: "Nota okuma",
    readingTitle: "Porte okuma",
    readingCopy: "Sol anahtarındaki doğal notaları çizgi, aralık ve ek çizgiler üzerinde tanı.",
    readingMeta: "4 seviye, 2 soru biçimi",
    instrumentsCategory: "Müzik aletleri",
    scoreCategory: "Akıcı okuma",
    scoreTitle: "Eser okuma",
    scoreCopy: "Bir porte satırını soldan sağa, nota değerlerini izleyerek kendi hızında veya kesintisiz ritimle oku.",
    scoreMeta: "Birlikten on altılığa ve üçlemelere, 2 okuma biçimi",
    guitarTitle: "Gitar klavyesi",
    guitarCopy: "Standart akortta doğal notaların tel ve perde üzerindeki yerlerini öğren.",
    guitarMeta: "0–3 / 0–5 / 0–12 perde",
    openReading: "Nota çalışmasına başla",
    openGuitar: "Müzik aletlerini keşfet",
    openScore: "Porte satırı okumaya başla",
  },
  en: {
    eyebrow: "NotaNota music literacy",
    title: "See the note.",
    titleAccent: "Name it.",
    lead: "Build fluent recognition of natural notes on the treble staff through calm, focused practice across four ranges.",
    primary: "Start sight-reading",
    proofOne: "Türkçe + English",
    proofTwo: "Short, focused sessions",
    proofThree: "Speed and accuracy tracking",
    modulesEyebrow: "Practice studio",
    modulesTitle: "What would you like to practise today?",
    readingCategory: "Note reading",
    readingTitle: "Sight-reading",
    readingCopy: "Recognise natural notes on the treble staff, from the core range to extended ledger lines.",
    readingMeta: "4 ranges, 2 question styles",
    instrumentsCategory: "Musical instruments",
    scoreCategory: "Fluent reading",
    scoreTitle: "Score reading",
    scoreCopy: "Read a complete staff line from left to right, at your own pace or against a continuous pulse.",
    scoreMeta: "Whole notes to sixteenths and triplets, 2 reading styles",
    guitarTitle: "Guitar fretboard",
    guitarCopy: "Learn where natural notes sit across the strings and frets in standard tuning.",
    guitarMeta: "Frets 0–3 / 0–5 / 0–12",
    openReading: "Start note practice",
    openGuitar: "Explore instruments",
    openScore: "Start reading score lines",
  },
} as const;

const SHELL_COPY = {
  tr: {
    navigation: "Çalışma bölümleri",
    studio: "Stüdyo",
    sightReading: "Nota oku",
    scoreReading: "Eser okuma",
    instruments: "Müzik aletleri",
    currentSession: "Etkin oturum",
    question: "Soru",
    remaining: "Kalan",
    elapsed: "Geçen süre",
    accuracy: "Doğruluk",
    correct: "Doğru",
    mistakes: "Hata",
    leaderboard: "Sıralamayı görüntüle",
  },
  en: {
    navigation: "Practice sections",
    studio: "Studio",
    sightReading: "Sight-reading",
    scoreReading: "Score reading",
    instruments: "Instruments",
    currentSession: "Current session",
    question: "Question",
    remaining: "Remaining",
    elapsed: "Elapsed",
    accuracy: "Accuracy",
    correct: "Correct",
    mistakes: "Mistakes",
    leaderboard: "View leaderboard",
  },
} as const;

const READING_PROFILE_COPY = {
  tr: {
    eyebrow: "İlk çalışma ayarın",
    firstTitle: "Sana uygun bir başlangıç seçelim.",
    firstCopy: "Kendine en yakın seçeneği işaretle. Sana dengeli bir ayar önereceğiz; kaydetmeden önce her ayrıntıyı değiştirebilirsin.",
    choices: "Müzik deneyimi",
    new: { title: "Daha yeni başlıyorum", copy: "Temel porte, görsel nota okuma ve normal oturum" },
    growing: { title: "Temelleri biliyorum", copy: "İkişer ek çizgiyle daha geniş bir çalışma" },
    confident: { title: "Bu işte oldukça iyiyim", copy: "Gitar, keman ve flütün geniş yazılı aralıkları" },
    recommendation: "Önerilen çalışma ayarı",
    recommendationCopy: "Bu öneriyi olduğu gibi kaydedebilir veya sana daha uygun hale getirebilirsin.",
    level: "Çalışma alanı",
    mode: "Soru biçimi",
    session: "Oturum türü",
    save: "Ayarı kaydet",
    later: "Şimdilik kapat",
    summaryEyebrow: "Seçili oturum",
    summaryTitle: "Çalışma ayarın hazır.",
    start: "Oturumu başlat",
    details: "Ayarları değiştir",
  },
  en: {
    eyebrow: "Your first practice setup",
    firstTitle: "Let’s choose a good starting point.",
    firstCopy: "Choose the option that feels closest to you. We’ll suggest a balanced setup, and you can adjust every detail before saving.",
    choices: "Music experience",
    new: { title: "I’m just getting started", copy: "Core staff, visual note reading and a standard session" },
    growing: { title: "I know the basics", copy: "A wider range through two ledger lines" },
    confident: { title: "I’m already confident", copy: "Extended written ranges for guitar, violin and flute" },
    recommendation: "Recommended practice setup",
    recommendationCopy: "Save this recommendation as it is, or tune it to suit you better.",
    level: "Practice range",
    mode: "Question style",
    session: "Session type",
    save: "Save setup",
    later: "Close for now",
    summaryEyebrow: "Selected session",
    summaryTitle: "Your practice setup is ready.",
    start: "Start session",
    details: "Change settings",
  },
} as const;

const INSTRUMENT_COPY = {
  tr: {
    eyebrow: "Müzik aletleri",
    title: "Bir enstrüman seç.",
    lead: "Notaların çalgı üzerindeki yerlerini ayrı çalışma alanlarında öğren. Gitar hazır; piyano ve keman sıradaki modüller.",
    available: "Çalışmaya hazır",
    coming: "Hazırlanıyor",
    guitar: "Gitar",
    guitarCopy: "Standart akortta telleri ve perdeleri okuyarak doğal notaların yerlerini öğren.",
    piano: "Piyano",
    pianoCopy: "Tuş grupları ve oktavlar üzerinden nota konumlarını çalış.",
    violin: "Keman",
    violinCopy: "Teller ve birinci pozisyondaki doğal seslerle başla.",
    open: "Gitar çalışma alanını aç",
  },
  en: {
    eyebrow: "Musical instruments",
    title: "Choose an instrument.",
    lead: "Learn where notes live on each instrument in a focused practice space. Guitar is ready; piano and violin are next.",
    available: "Ready to practise",
    coming: "In development",
    guitar: "Guitar",
    guitarCopy: "Learn natural notes in standard tuning by reading strings and frets.",
    piano: "Piano",
    pianoCopy: "Explore note locations through key groups and octaves.",
    violin: "Violin",
    violinCopy: "Begin with the strings and natural notes in first position.",
    open: "Open guitar practice",
  },
} as const;

function InstrumentHub({ locale, onOpenGuitar }: { locale: Locale; onOpenGuitar: () => void }) {
  const text = INSTRUMENT_COPY[locale];

  return (
    <section className="instrument-hub" aria-labelledby="instrument-hub-title">
      <header className="instrument-hub-heading">
        <p className="kicker">{text.eyebrow}</p>
        <h1 id="instrument-hub-title">{text.title}</h1>
        <p>{text.lead}</p>
      </header>
      <div className="instrument-grid">
        <button className="instrument-card instrument-card--guitar" type="button" onClick={onOpenGuitar}>
          <span className="instrument-status instrument-status--ready">{text.available}</span>
          <span className="instrument-illustration instrument-illustration--guitar" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
          <strong>{text.guitar}</strong>
          <span>{text.guitarCopy}</span>
          <b>{text.open} <span aria-hidden="true">→</span></b>
        </button>
        <article className="instrument-card instrument-card--upcoming">
          <span className="instrument-status">{text.coming}</span>
          <span className="instrument-illustration instrument-illustration--piano" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
          <strong>{text.piano}</strong>
          <span>{text.pianoCopy}</span>
        </article>
        <article className="instrument-card instrument-card--upcoming">
          <span className="instrument-status">{text.coming}</span>
          <span className="instrument-illustration instrument-illustration--violin" aria-hidden="true"><i /><i /><i /><i /></span>
          <strong>{text.violin}</strong>
          <span>{text.violinCopy}</span>
        </article>
      </div>
    </section>
  );
}

const NOTE_SOUND_COPY = {
  tr: {
    settings: "Ses ayarları",
    title: "Doğru nota sesi",
    help: "Yalnızca doğru cevap verdiğinde notayı çalar.",
    on: "Açık",
    off: "Kapalı",
  },
  en: {
    settings: "Audio settings",
    title: "Correct-note sound",
    help: "Plays the note only after a correct answer.",
    on: "On",
    off: "Off",
  },
} as const;

const ALL_NOTES: NoteQuestion[] = [
  { id: "b2", solfege: "Si", letter: "B", position: -10, location: { tr: "portenin altında, 10. çizginin ortasında", en: "on the fifth ledger line below the staff" }, shortLocation: { tr: "10. çizginin ortası alttan", en: "5th ledger line below" } },
  { id: "c3", solfege: "Do", letter: "C", position: -9, location: { tr: "portenin altında, 9. çizginin altında", en: "in the space between the fifth and fourth ledger lines below the staff" }, shortLocation: { tr: "9. çizginin altı", en: "Between 5th–4th ledger lines below" } },
  { id: "d3", solfege: "Re", letter: "D", position: -8, location: { tr: "portenin altında, 9. çizginin ortasında", en: "on the fourth ledger line below the staff" }, shortLocation: { tr: "9. çizginin ortası alttan", en: "4th ledger line below" } },
  { id: "e3", solfege: "Mi", letter: "E", position: -7, location: { tr: "portenin altında, 8. çizginin altında", en: "in the space between the fourth and third ledger lines below the staff" }, shortLocation: { tr: "8. çizginin altı", en: "Between 4th–3rd ledger lines below" } },
  { id: "f3", solfege: "Fa", letter: "F", position: -6, location: { tr: "portenin altında, 8. çizginin ortasında", en: "on the third ledger line below the staff" }, shortLocation: { tr: "8. çizginin ortası alttan", en: "3rd ledger line below" } },
  { id: "g3", solfege: "Sol", letter: "G", position: -5, location: { tr: "portenin altında, 7. çizginin altında", en: "in the space between the third and second ledger lines below the staff" }, shortLocation: { tr: "7. çizginin altı", en: "Between 3rd–2nd ledger lines below" } },
  { id: "a3", solfege: "La", letter: "A", position: -4, location: { tr: "portenin altında, 7. çizginin ortasında", en: "on the second ledger line below the staff" }, shortLocation: { tr: "7. çizginin ortası alttan", en: "2nd ledger line below" } },
  { id: "b3", solfege: "Si", letter: "B", position: -3, location: { tr: "portenin altında, 6. çizginin altında", en: "in the space between the second and first ledger lines below the staff" }, shortLocation: { tr: "6. çizginin altı", en: "Between 2nd–1st ledger lines below" } },
  { id: "c4", solfege: "Do", letter: "C", position: -2, location: { tr: "portenin altında, 6. çizginin ortasında", en: "on the first ledger line below the staff" }, shortLocation: { tr: "6. çizginin ortası alttan", en: "1st ledger line below" } },
  { id: "d4", solfege: "Re", letter: "D", position: -1, location: { tr: "portenin hemen altında, 1. çizginin altında", en: "in the space below the staff" }, shortLocation: { tr: "1. çizginin altı", en: "Space below the staff" } },
  { id: "e4", solfege: "Mi", letter: "E", position: 0, location: { tr: "1. çizgi üzerinde", en: "on the first line" }, shortLocation: { tr: "1. çizgi", en: "1st line" } },
  { id: "f4", solfege: "Fa", letter: "F", position: 1, location: { tr: "1. aralıkta", en: "in the first space" }, shortLocation: { tr: "1. aralık", en: "1st space" } },
  { id: "g4", solfege: "Sol", letter: "G", position: 2, location: { tr: "2. çizgi üzerinde", en: "on the second line" }, shortLocation: { tr: "2. çizgi", en: "2nd line" } },
  { id: "a4", solfege: "La", letter: "A", position: 3, location: { tr: "2. aralıkta", en: "in the second space" }, shortLocation: { tr: "2. aralık", en: "2nd space" } },
  { id: "b4", solfege: "Si", letter: "B", position: 4, location: { tr: "3. çizgi üzerinde", en: "on the third line" }, shortLocation: { tr: "3. çizgi", en: "3rd line" } },
  { id: "c5", solfege: "Do", letter: "C", position: 5, location: { tr: "3. aralıkta", en: "in the third space" }, shortLocation: { tr: "3. aralık", en: "3rd space" } },
  { id: "d5", solfege: "Re", letter: "D", position: 6, location: { tr: "4. çizgi üzerinde", en: "on the fourth line" }, shortLocation: { tr: "4. çizgi", en: "4th line" } },
  { id: "e5", solfege: "Mi", letter: "E", position: 7, location: { tr: "4. aralıkta", en: "in the fourth space" }, shortLocation: { tr: "4. aralık", en: "4th space" } },
  { id: "f5", solfege: "Fa", letter: "F", position: 8, location: { tr: "5. çizgi üzerinde", en: "on the fifth line" }, shortLocation: { tr: "5. çizgi", en: "5th line" } },
  { id: "g5", solfege: "Sol", letter: "G", position: 9, location: { tr: "portenin hemen üstünde, 5. çizginin üstünde", en: "in the space above the staff" }, shortLocation: { tr: "5. çizginin üstü", en: "Space above the staff" } },
  { id: "a5", solfege: "La", letter: "A", position: 10, location: { tr: "portenin üstünde, 6. çizginin ortasında", en: "on the first ledger line above the staff" }, shortLocation: { tr: "6. çizginin ortası üstten", en: "1st ledger line above" } },
  { id: "b5", solfege: "Si", letter: "B", position: 11, location: { tr: "portenin üstünde, 6. çizginin üstünde", en: "in the space above the first ledger line" }, shortLocation: { tr: "6. çizginin üstü", en: "Above the 1st ledger line" } },
  { id: "c6", solfege: "Do", letter: "C", position: 12, location: { tr: "portenin üstünde, 7. çizginin ortasında", en: "on the second ledger line above the staff" }, shortLocation: { tr: "7. çizginin ortası üstten", en: "2nd ledger line above" } },
  { id: "d6", solfege: "Re", letter: "D", position: 13, location: { tr: "portenin üstünde, 7. çizginin üstünde", en: "in the space between the second and third ledger lines above the staff" }, shortLocation: { tr: "7. çizginin üstü", en: "Between 2nd–3rd ledger lines above" } },
  { id: "e6", solfege: "Mi", letter: "E", position: 14, location: { tr: "portenin üstünde, 8. çizginin ortasında", en: "on the third ledger line above the staff" }, shortLocation: { tr: "8. çizginin ortası üstten", en: "3rd ledger line above" } },
  { id: "f6", solfege: "Fa", letter: "F", position: 15, location: { tr: "portenin üstünde, 8. çizginin üstünde", en: "in the space between the third and fourth ledger lines above the staff" }, shortLocation: { tr: "8. çizginin üstü", en: "Between 3rd–4th ledger lines above" } },
  { id: "g6", solfege: "Sol", letter: "G", position: 16, location: { tr: "portenin üstünde, 9. çizginin ortasında", en: "on the fourth ledger line above the staff" }, shortLocation: { tr: "9. çizginin ortası üstten", en: "4th ledger line above" } },
  { id: "a6", solfege: "La", letter: "A", position: 17, location: { tr: "portenin üstünde, 9. çizginin üstünde", en: "in the space above the fourth ledger line" }, shortLocation: { tr: "9. çizginin üstü", en: "Above the 4th ledger line" } },
  { id: "b6", solfege: "Si", letter: "B", position: 18, location: { tr: "portenin üstünde, 10. çizginin ortasında", en: "on the fifth ledger line above the staff" }, shortLocation: { tr: "10. çizginin ortası üstten", en: "5th ledger line above" } },
  { id: "c7", solfege: "Do", letter: "C", position: 19, location: { tr: "portenin üstünde, 10. çizginin üstünde", en: "in the space above the fifth ledger line" }, shortLocation: { tr: "10. çizginin üstü", en: "Above the 5th ledger line" } },
  { id: "d7", solfege: "Re", letter: "D", position: 20, location: { tr: "portenin üstünde, 11. çizginin ortasında", en: "on the sixth ledger line above the staff" }, shortLocation: { tr: "11. çizginin ortası üstten", en: "6th ledger line above" } },
  { id: "e7", solfege: "Mi", letter: "E", position: 21, location: { tr: "portenin üstünde, 11. çizginin üstünde", en: "in the space above the sixth ledger line" }, shortLocation: { tr: "11. çizginin üstü", en: "Above the 6th ledger line" } },
];

const LEVELS: Record<Locale, { id: LevelId; eyebrow: string; title: string; description: string; instruments: string; count: number }[]> = {
  tr: [
    { id: "temel", eyebrow: "Seviye 1", title: "Temel porte", description: "Yalnızca beş çizgi ve dört aralık", instruments: "Başlangıç ezgileri ve temel sağ el çalışmaları", count: 9 },
    { id: "yakin", eyebrow: "Seviye 2", title: "İki ek çizgi", description: "Altta ve üstte ikişer ek çizgiye kadar", instruments: "Piyano sağ el, blok flüt ve başlangıç keman", count: 17 },
    { id: "tam", eyebrow: "Seviye 3", title: "Dört ek çizgi", description: "Altta ve üstte dörder ek çizgiye kadar", instruments: "Gitarın yazılı aralığı, keman ve flüt pasajları", count: 25 },
    { id: "genis", eyebrow: "Seviye 4", title: "Geniş aralık", description: "Altta ve üstte beşer ek çizgiye kadar", instruments: "Beş ek çizgiye ulaşan geniş okuma çalışmaları", count: 29 },
  ],
  en: [
    { id: "temel", eyebrow: "Level 1", title: "Notes on the staff", description: "Only the five lines and four spaces", instruments: "Beginner melodies and basic right-hand reading", count: 9 },
    { id: "yakin", eyebrow: "Level 2", title: "Two ledger lines", description: "Through two ledger lines above and below", instruments: "Piano right hand, recorder and early violin", count: 17 },
    { id: "tam", eyebrow: "Level 3", title: "Four ledger lines", description: "Through four ledger lines above and below", instruments: "Written guitar range, violin and flute passages", count: 25 },
    { id: "genis", eyebrow: "Level 4", title: "Extended range", description: "Through five ledger lines above and below", instruments: "Extended reading through five ledger lines", count: 29 },
  ],
};

function questionsFor(level: LevelId) {
  if (level === "temel") return ALL_NOTES.filter((note) => note.position >= 0 && note.position <= 8);
  if (level === "yakin") return ALL_NOTES.filter((note) => note.position >= -4 && note.position <= 12);
  if (level === "tam") return ALL_NOTES.filter((note) => note.position >= -8 && note.position <= 16);
  return ALL_NOTES.filter((note) => note.position >= -10 && note.position <= 18);
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

function nextEndlessNote(pool: NoteQuestion[], previous?: NoteQuestion) {
  const safe = pool.filter((note) => !previous || (note.id !== previous.id && Math.abs(note.position - previous.position) !== 1));
  const choices = safe.length ? safe : pool.filter((note) => note.id !== previous?.id);
  return choices[Math.floor(Math.random() * choices.length)] ?? pool[0];
}

function normalizeAnswer(value: string) {
  return normalizeNoteAnswer(value);
}

function noteName(note: NoteQuestion, locale: Locale) {
  return locale === "tr" ? note.solfege : note.letter;
}

function UiIcon({ name }: { name: "check" | "close" }) {
  if (name === "check") {
    return (
      <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m5.5 12.5 4.1 4.1 8.9-9.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const RANGE_PREVIEW_POSITIONS: Record<LevelId, number[]> = {
  temel: [0, 2, 4, 6, 8],
  yakin: [-4, 0, 4, 8, 12],
  tam: [-8, -4, 4, 10, 16],
  genis: [-10, -4, 4, 12, 18],
};

function ledgerPositionsFor(position: number) {
  return [-10, -8, -6, -4, -2, 10, 12, 14, 16, 18].filter((ledger) => (
    ledger < 0 ? position <= ledger : position >= ledger
  ));
}

function rangePreviewTop(level: LevelId, position: number) {
  return level === "tam" || level === "genis" ? 84 - position * 4 : 50 - position * 4;
}

function RangePreview({ level }: { level: LevelId }) {
  return (
    <span className={`range-preview ${level === "tam" || level === "genis" ? "range-preview--extended" : ""}`} aria-hidden="true">
      <span className="range-preview-clef">𝄞</span>
      <span className="range-preview-lines" />
      {RANGE_PREVIEW_POSITIONS[level].map((position, index) => {
        const left = `${35 + index * 13}%`;
        return (
          <span className="range-preview-mark" key={position}>
            {ledgerPositionsFor(position).map((ledger) => (
              <i className="range-preview-ledger" key={ledger} style={{ left, top: `${rangePreviewTop(level, ledger)}px` }} />
            ))}
            <i className="range-preview-note" style={{ left, top: `${rangePreviewTop(level, position)}px` }} />
          </span>
        );
      })}
    </span>
  );
}

function Staff({ note, locale, compact = false, revealAnswer = false, animated = false }: { note: NoteQuestion; locale: Locale; compact?: boolean; revealAnswer?: boolean; animated?: boolean }) {
  const step = compact ? 8 : 12;
  const firstLineY = compact ? 67 : 126;
  const noteY = firstLineY - note.position * (step / 2);
  const lineWidth = compact ? 240 : 390;
  const startX = compact ? 34 : 42;
  const noteX = compact ? 148 : 230;
  const ledgerPositions = ledgerPositionsFor(note.position);
  const stemDown = note.position >= 4;

  return (
    <div
      className={`staff ${compact ? "staff--compact" : ""} ${animated ? "staff--animated" : ""}`}
      aria-label={revealAnswer
        ? `${noteName(note, locale)}, ${note.location[locale]}`
        : locale === "tr" ? "Sol anahtarında bir nota" : "A note on the treble staff"}
      role="img"
    >
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
        <span
          className="note-stem"
          style={{
            left: noteX + (stemDown ? (compact ? -8 : -11) : (compact ? 8 : 11)),
            top: stemDown ? noteY : noteY - (compact ? 34 : 45),
          }}
        />
      </div>
    </div>
  );
}

const LANDING_DEMO_NOTES = ["d5", "g4", "e5", "b4", "f4", "c5", "e4", "f5", "a4"]
  .map((id) => ALL_NOTES.find((note) => note.id === id)!);

function LandingStaffDemo({ locale }: { locale: Locale }) {
  const [noteIndex, setNoteIndex] = useState(0);
  const [labelVisible, setLabelVisible] = useState(true);

  useEffect(() => {
    let changeTimer: number | undefined;
    const rotationTimer = window.setInterval(() => {
      setLabelVisible(false);
      changeTimer = window.setTimeout(() => {
        setNoteIndex((current) => (current + 1) % LANDING_DEMO_NOTES.length);
        setLabelVisible(true);
      }, 180);
    }, 2800);

    return () => {
      window.clearInterval(rotationTimer);
      if (changeTimer) window.clearTimeout(changeTimer);
    };
  }, []);

  const note = LANDING_DEMO_NOTES[noteIndex];

  return (
    <div className="landing-staff-card">
      <Staff note={note} locale={locale} compact animated />
      <span className={`landing-staff-label ${labelVisible ? "is-visible" : ""}`}>
        {note.shortLocation[locale]}, {noteName(note, locale)}
      </span>
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
  const [stage, setStage] = useState<Stage>("landing");
  const [level, setLevel] = useState<LevelId>("temel");
  const [mode, setMode] = useState<ModeId>("porte");
  const [sessionType, setSessionType] = useState<SessionType>("standard");
  const [readingProfile, setReadingProfile] = useState<ReadingProfileId | null>(null);
  const [readingOnboardingComplete, setReadingOnboardingComplete] = useState(false);
  const [readingPreferenceReady, setReadingPreferenceReady] = useState(false);
  const [readingSetupModalOpen, setReadingSetupModalOpen] = useState(false);
  const [communityUserId, setCommunityUserId] = useState<string | null>(null);
  const [communityIdentityReady, setCommunityIdentityReady] = useState(false);
  const [draftLevel, setDraftLevel] = useState<LevelId>("temel");
  const [draftMode, setDraftMode] = useState<ModeId>("porte");
  const [draftSessionType, setDraftSessionType] = useState<SessionType>("standard");
  const [guitarSessionActive, setGuitarSessionActive] = useState(false);
  const [scoreReadingSessionActive, setScoreReadingSessionActive] = useState(false);
  const [queue, setQueue] = useState<QueuedQuestion[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [wrongByNote, setWrongByNote] = useState<Record<string, number>>({});
  const [confusionByPair, setConfusionByPair] = useState<Record<string, number>>({});
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalWrong, setTotalWrong] = useState(0);
  const [answerTimes, setAnswerTimes] = useState<number[]>([]);
  const [questionStartedAt, setQuestionStartedAt] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(0);
  const [clockNow, setClockNow] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [endedEarly, setEndedEarly] = useState(false);
  const [noteSoundEnabled, setNoteSoundEnabled] = useState(true);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const quizShellRef = useRef<HTMLElement>(null);
  const audioSettingsRef = useRef<HTMLDivElement>(null);
  const audioSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const readingSetupCloseRef = useRef<HTMLButtonElement>(null);
  const readingSetupReturnFocusRef = useRef<HTMLElement | null>(null);
  const questionKey = useRef(0);
  const copy = COPY[locale];
  const extra = EXTRA_COPY[locale];
  const landing = LANDING_COPY[locale];
  const shell = SHELL_COPY[locale];
  const readingProfileCopy = READING_PROFILE_COPY[locale];
  const noteSoundCopy = NOTE_SOUND_COPY[locale];
  const levels = LEVELS[locale];

  const uniqueCount = questionsFor(level).length;
  const currentItem = queue[0];
  const current = currentItem?.note;
  const displayedNote = feedback?.note ?? current;
  const answeredCorrectly = sessionType === "standard" ? uniqueCount - queue.length : correctCount;
  const selectedLevel = levels.find((item) => item.id === level)!;
  const selectedModeTitle = copy.modes[mode].title;
  const selectedSessionTitle = sessionType === "standard" ? extra.standard.title : extra.endless.title;
  const answerChoices = locale === "tr" ? ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"] : ["C", "D", "E", "F", "G", "A", "B"];

  const hardestNotes = useMemo(() => {
    return Object.entries(wrongByNote)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id, count]) => ({ note: ALL_NOTES.find((item) => item.id === id)!, count }));
  }, [wrongByNote]);

  const dominantConfusion = useMemo(() => {
    const dominant = pickDominantConfusion(confusionByPair, totalWrong);
    if (!dominant) return null;

    const separator = dominant.key.lastIndexOf(":");
    const expectedId = dominant.key.slice(0, separator);
    const guessedLetter = dominant.key.slice(separator + 1) as NoteQuestion["letter"];
    const expected = ALL_NOTES.find((note) => note.id === expectedId);
    if (!expected) return null;

    return { ...dominant, expected, guessed: noteClassFromLetter(guessedLetter) };
  }, [confusionByPair, totalWrong]);

  const handleCommunityIdentityChange = useCallback((userId: string | null) => {
    setCommunityUserId(userId);
    setCommunityIdentityReady(true);
  }, []);

  useEffect(() => {
    const syncStageFromLocation = () => {
      const legacyStage = (Object.entries({
        "#/": "landing",
        "#/nota-oku": "setup",
        "#/nota-oku/oturum": "setup",
        "#/nota-oku/sonuc": "setup",
        "#/eser-okuma": "pieces",
        "#/muzik-aletleri": "instruments",
        "#/muzik-aletleri/gitar": "guitar",
      }) as [string, Stage][]).find(([route]) => route === window.location.hash)?.[1];

      if (legacyStage) {
        const route = STAGE_ROUTES[legacyStage];
        window.history.replaceState(null, "", `${window.location.pathname}${route}`);
        setStage(legacyStage);
        return;
      }
      setStage(stageFromSearch(window.location.search));
    };
    syncStageFromLocation();
    window.addEventListener("popstate", syncStageFromLocation);
    return () => {
      window.removeEventListener("popstate", syncStageFromLocation);
    };
  }, []);

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
    const timer = window.setTimeout(() => setNoteSoundEnabled(readNoteSoundPreference()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!communityIdentityReady) return;
    const storageKey = `nota-nota-reading-setup:${communityUserId ?? "guest"}`;
    const savedSetup = window.localStorage.getItem(storageKey);
    const legacyProfile = communityUserId ? null : window.localStorage.getItem("nota-nota-reading-profile");
    let saved: { level: LevelId; mode: ModeId; sessionType: SessionType } | null = null;

    try {
      if (savedSetup) saved = JSON.parse(savedSetup) as typeof saved;
    } catch {
      window.localStorage.removeItem(storageKey);
    }

    if (!saved && (legacyProfile === "new" || legacyProfile === "growing" || legacyProfile === "confident")) {
      saved = READING_PRESETS[legacyProfile];
      window.localStorage.setItem(storageKey, JSON.stringify(saved));
    }

    const valid = saved
      && ["temel", "yakin", "tam", "genis"].includes(saved.level)
      && ["porte", "konum"].includes(saved.mode)
      && ["standard", "endless"].includes(saved.sessionType);

    const timer = window.setTimeout(() => {
      if (valid && saved) {
        setLevel(saved.level);
        setMode(saved.mode);
        setSessionType(saved.sessionType);
        setDraftLevel(saved.level);
        setDraftMode(saved.mode);
        setDraftSessionType(saved.sessionType);
        setReadingOnboardingComplete(true);
      } else {
        setReadingProfile(null);
        setReadingOnboardingComplete(false);
      }
      setReadingPreferenceReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [communityIdentityReady, communityUserId]);

  useEffect(() => {
    if (stage !== "setup" || !readingPreferenceReady || readingOnboardingComplete) return;
    const timer = window.setTimeout(() => setReadingSetupModalOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [stage, readingPreferenceReady, readingOnboardingComplete]);

  useEffect(() => {
    if (!readingSetupModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    readingSetupReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => readingSetupCloseRef.current?.focus({ preventScroll: true }));
    const handleDialogKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReadingSetupModalOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = readingSetupCloseRef.current?.closest<HTMLElement>(".reading-setup-dialog");
      const focusable = dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')] : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeyboard);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDialogKeyboard);
      readingSetupReturnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [readingSetupModalOpen]);

  useEffect(() => {
    if (!audioSettingsOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !audioSettingsRef.current?.contains(event.target)) {
        setAudioSettingsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAudioSettingsOpen(false);
      audioSettingsButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [audioSettingsOpen]);

  useEffect(() => {
    if (stage !== "quiz" || feedback) return;

    const hasDesktopPointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (hasDesktopPointer) inputRef.current?.focus({ preventScroll: true });
  }, [stage, feedback, currentItem?.key]);

  useEffect(() => {
    if (stage !== "quiz") return;
    const frame = window.requestAnimationFrame(() => {
      quizShellRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [stage, sessionStartedAt]);

  useEffect(() => {
    if (stage !== "quiz" || !feedback) return;
    feedbackButtonRef.current?.focus({ preventScroll: true });
  }, [stage, feedback]);

  useEffect(() => {
    if (stage === "done") resultsHeadingRef.current?.focus({ preventScroll: true });
  }, [stage]);

  useEffect(() => {
    if (stage !== "quiz") return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    setAnswer("");
  }

  function navigateTo(nextStage: Stage) {
    const nextRoute = STAGE_ROUTES[nextStage];
    const params = new URLSearchParams(nextRoute.slice(1));
    const currentLanguage = new URLSearchParams(window.location.search).get("lang");
    if (currentLanguage === "tr" || currentLanguage === "en") params.set("lang", currentLanguage);
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.pushState(null, "", nextUrl);
    setStage(nextStage);
  }

  function previewReadingPreset(profile: ReadingProfileId) {
    const preset = READING_PRESETS[profile];
    setReadingProfile(profile);
    setDraftLevel(preset.level);
    setDraftMode(preset.mode);
    setDraftSessionType(preset.sessionType);
  }

  function saveReadingSetup() {
    if (!readingProfile) return;
    setLevel(draftLevel);
    setMode(draftMode);
    setSessionType(draftSessionType);
    setReadingOnboardingComplete(true);
    setReadingSetupModalOpen(false);
    const storageKey = `nota-nota-reading-setup:${communityUserId ?? "guest"}`;
    window.localStorage.setItem(storageKey, JSON.stringify({ level: draftLevel, mode: draftMode, sessionType: draftSessionType }));
  }

  function persistReadingSettings(next: { level?: LevelId; mode?: ModeId; sessionType?: SessionType }) {
    const saved = {
      level: next.level ?? level,
      mode: next.mode ?? mode,
      sessionType: next.sessionType ?? sessionType,
    };
    setReadingOnboardingComplete(true);
    const storageKey = `nota-nota-reading-setup:${communityUserId ?? "guest"}`;
    window.localStorage.setItem(storageKey, JSON.stringify(saved));
  }

  function toggleNoteSound() {
    setNoteSoundEnabled((enabled) => {
      const next = !enabled;
      writeNoteSoundPreference(next);
      return next;
    });
  }

  function startSession() {
    const startedAt = Date.now();
    const initialQueue = shuffledWithoutRuns(questionsFor(level)).map((note) => ({
      key: questionKey.current++,
      misses: 0,
      note,
    }));
    setQueue(initialQueue);
    setWrongByNote({});
    setConfusionByPair({});
    setFirstTryCorrect(0);
    setCorrectCount(0);
    setTotalWrong(0);
    setAnswerTimes([]);
    setAnswer("");
    setFeedback(null);
    setEndedEarly(false);
    setCurrentStreak(0);
    setQuestionStartedAt(startedAt);
    setSessionStartedAt(startedAt);
    setClockNow(startedAt);
    navigateTo("quiz");
  }

  function submitAnswer(event: FormEvent) {
    event.preventDefault();
    // Runs from the form submit event, never during render.
    // eslint-disable-next-line react-hooks/purity
    recordAnswer(answer, Date.now());
  }

  function chooseAnswer(event: MouseEvent<HTMLButtonElement>) {
    // Runs from a note-button click, never during render.
    // eslint-disable-next-line react-hooks/purity
    recordAnswer(event.currentTarget.value, Date.now());
  }

  function recordAnswer(nextAnswer: string, answeredAt: number) {
    if (!current || !currentItem || feedback || !normalizeAnswer(nextAnswer)) return;

    const elapsed = Math.max(100, answeredAt - questionStartedAt);
    const guessed = noteClassFromAnswer(nextAnswer);
    const correct = guessed?.letter === current.letter;
    setAnswer(nextAnswer);
    setAnswerTimes((times) => [...times, elapsed]);

    if (correct) {
      playPracticeNote(noteIdToMidi(current.id), noteSoundEnabled);
      setFeedback({ correct: true, note: current, guessed });
      if (currentItem.misses === 0) setFirstTryCorrect((count) => count + 1);
      setCorrectCount((count) => count + 1);
      setCurrentStreak((count) => count + 1);
      setQueue((items) => {
        const remaining = items.slice(1);
        if (sessionType === "standard") return remaining;
        const previous = remaining.at(-1)?.note ?? current;
        const nextNote = nextEndlessNote(questionsFor(level), previous);
        return [...remaining, { key: questionKey.current++, misses: 0, note: nextNote }];
      });
    } else {
      setWrongByNote((values) => ({ ...values, [current.id]: (values[current.id] ?? 0) + 1 }));
      if (guessed) {
        const confusionKey = `${current.id}:${guessed.letter}`;
        setConfusionByPair((values) => ({ ...values, [confusionKey]: (values[confusionKey] ?? 0) + 1 }));
      }
      setTotalWrong((count) => count + 1);
      setCurrentStreak(0);
      if (sessionType === "endless") {
        setFeedback(null);
        navigateTo("done");
        return;
      }
      setFeedback({ correct: false, note: current, guessed });
      setQueue((items) => [...items.slice(1), { ...items[0], misses: items[0].misses + 1 }]);
    }
  }

  function nextQuestion() {
    if (!feedback) return;
    if (queue.length === 0) {
      navigateTo("done");
    } else {
      setFeedback(null);
      setAnswer("");
      setQuestionStartedAt(Date.now());
    }
  }

  function endSession() {
    setEndedEarly(true);
    setFeedback(null);
    navigateTo("done");
  }

  const totalResponseTimeMs = answerTimes.reduce((sum, value) => sum + value, 0);
  const averageResponseMs = answerTimes.length ? totalResponseTimeMs / answerTimes.length : 0;
  const averageTime = answerTimes.length
    ? `${(averageResponseMs / 1000).toFixed(2).replace(".", locale === "tr" ? "," : ".")} ${copy.seconds}`
    : `0${locale === "tr" ? "," : "."}00 ${copy.seconds}`;
  const totalTime = `${(totalResponseTimeMs / 1000).toFixed(2).replace(".", locale === "tr" ? "," : ".")} ${copy.seconds}`;
  const elapsedTime = `${(Math.max(0, clockNow - sessionStartedAt) / 1000).toFixed(0)} ${copy.seconds}`;
  const currentAccuracy = answerTimes.length ? Math.round((correctCount / answerTimes.length) * 100) : 0;
  const activeQuestionNumber = sessionType === "standard"
    ? feedback
      ? Math.max(1, answeredCorrectly)
      : Math.min(answeredCorrectly + 1, uniqueCount)
    : answerTimes.length + (feedback ? 0 : 1);
  const rateDenominator = sessionType === "standard" ? uniqueCount : correctCount;
  const firstTryRate = rateDenominator ? Math.round((firstTryCorrect / rateDenominator) * 100) : 0;
  const completedStandardSession = sessionType === "standard" && !endedEarly && correctCount === uniqueCount;
  const completedDailyPractice = completedStandardSession || (sessionType === "endless" && correctCount > 0);
  const sessionInsight = buildSessionInsight({
    locale,
    sessionType,
    completed: completedStandardSession,
    firstTryRate,
    totalWrong,
    attemptCount: answerTimes.length,
    correctCount,
    averageResponseMs,
  });
  const leaderboardEligible = !endedEarly && (
    sessionType === "standard"
      ? totalWrong === 0 && correctCount === uniqueCount
      : totalWrong === 1 && correctCount > 0
  );
  const scoreSubmission: ScoreSubmission = {
    sessionType,
    level,
    questionMode: mode,
    correctCount,
    wrongCount: totalWrong,
    totalResponseTimeMs,
  };
  const immersiveSession = stage === "quiz" || guitarSessionActive || scoreReadingSessionActive;

  return (
    <CommunityProvider locale={locale} onIdentityChange={handleCommunityIdentityChange}>
    <main className={`app-shell ${immersiveSession ? "app-shell--session" : ""}`}>
      {!immersiveSession && <header className="site-header">
        <a className="brand" href={STAGE_ROUTES.landing} onClick={(event) => { event.preventDefault(); navigateTo("landing"); }} aria-label={copy.homeLabel}>
          <span className="brand-mark" aria-hidden="true">
            <img src="./notanota-monogram.png" alt="" />
          </span>
          <span className="brand-name">NotaNota</span>
        </a>
        <span className="brand-ornament" aria-hidden="true"><i /><b>◇</b><i /></span>
        <nav className="app-navigation" aria-label={shell.navigation}>
          <a href={STAGE_ROUTES.landing} className={stage === "landing" ? "is-active" : ""} onClick={(event) => { event.preventDefault(); navigateTo("landing"); }} aria-label={shell.studio} aria-current={stage === "landing" ? "page" : undefined}>
            <b>{shell.studio}</b>
          </a>
          <a href={STAGE_ROUTES.setup} className={["setup", "quiz", "done"].includes(stage) ? "is-active" : ""} onClick={(event) => { event.preventDefault(); navigateTo("setup"); }} aria-label={shell.sightReading} aria-current={["setup", "quiz", "done"].includes(stage) ? "page" : undefined}>
            <b>{shell.sightReading}</b>
          </a>
          <a href={STAGE_ROUTES.pieces} className={stage === "pieces" ? "is-active" : ""} onClick={(event) => { event.preventDefault(); navigateTo("pieces"); }} aria-label={shell.scoreReading} aria-current={stage === "pieces" ? "page" : undefined}>
            <b>{shell.scoreReading}</b>
          </a>
          <a href={STAGE_ROUTES.instruments} className={["instruments", "guitar"].includes(stage) ? "is-active" : ""} onClick={(event) => { event.preventDefault(); navigateTo("instruments"); }} aria-label={shell.instruments} aria-current={["instruments", "guitar"].includes(stage) ? "page" : undefined}>
            <b>{shell.instruments}</b>
          </a>
        </nav>
        <div className="header-actions">
          <CommunityHeader />
          <div className="audio-settings" ref={audioSettingsRef}>
            <button
              className="sound-toggle"
              ref={audioSettingsButtonRef}
              type="button"
              aria-label={noteSoundCopy.settings}
              aria-expanded={audioSettingsOpen}
              aria-controls="audio-settings-panel"
              onClick={() => setAudioSettingsOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor" />
                {noteSoundEnabled
                  ? <path d="M16 9c1.2 1.7 1.2 4.3 0 6M18.7 6.8c2.8 3 2.8 7.4 0 10.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  : <path d="m16.5 9 4.5 6m0-6-4.5 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
              </svg>
            </button>
            {audioSettingsOpen && (
              <div className="audio-settings-panel" id="audio-settings-panel" role="group" aria-label={noteSoundCopy.settings}>
                <strong>{noteSoundCopy.settings}</strong>
                <button type="button" role="switch" aria-checked={noteSoundEnabled} onClick={toggleNoteSound}>
                  <span>{noteSoundCopy.title}<small>{noteSoundCopy.help}</small></span>
                  <b>{noteSoundEnabled ? noteSoundCopy.on : noteSoundCopy.off}</b>
                </button>
              </div>
            )}
          </div>
          <div className="language-switch" role="group" aria-label={locale === "tr" ? "Dil seçimi" : "Language selection"}>
            <button type="button" className={locale === "tr" ? "is-active" : ""} onClick={() => changeLocale("tr")} aria-pressed={locale === "tr"}>TR</button>
            <button type="button" className={locale === "en" ? "is-active" : ""} onClick={() => changeLocale("en")} aria-pressed={locale === "en"}>EN</button>
          </div>
        </div>
      </header>}

      {!immersiveSession && <nav className="mobile-module-navigation" aria-label={shell.navigation}>
        <a href={STAGE_ROUTES.landing} className={stage === "landing" ? "is-active" : ""} onClick={(event) => { event.preventDefault(); navigateTo("landing"); }} aria-current={stage === "landing" ? "page" : undefined}>
          {shell.studio}
        </a>
        <a href={STAGE_ROUTES.setup} className={["setup", "quiz", "done"].includes(stage) ? "is-active" : ""} onClick={(event) => { event.preventDefault(); navigateTo("setup"); }} aria-current={["setup", "quiz", "done"].includes(stage) ? "page" : undefined}>
          {shell.sightReading}
        </a>
        <a href={STAGE_ROUTES.pieces} className={stage === "pieces" ? "is-active" : ""} onClick={(event) => { event.preventDefault(); navigateTo("pieces"); }} aria-current={stage === "pieces" ? "page" : undefined}>
          {shell.scoreReading}
        </a>
        <a href={STAGE_ROUTES.instruments} className={["instruments", "guitar"].includes(stage) ? "is-active" : ""} onClick={(event) => { event.preventDefault(); navigateTo("instruments"); }} aria-current={["instruments", "guitar"].includes(stage) ? "page" : undefined}>
          {shell.instruments}
        </a>
      </nav>}

      {stage === "landing" && (
        <section className="landing-shell">
          <div className="landing-hero">
            <div className="landing-copy">
              <p className="kicker">{landing.eyebrow}</p>
              <h1>{landing.title}<br /><em>{landing.titleAccent}</em></h1>
              <p>{landing.lead}</p>
              <div className="landing-actions">
                <a className="primary-button" href={STAGE_ROUTES.setup} onClick={(event) => { event.preventDefault(); navigateTo("setup"); }}>{landing.primary} <span aria-hidden="true">→</span></a>
              </div>
            </div>
            <div className="landing-art" aria-hidden="true">
              <LandingStaffDemo locale={locale} />
              <span className="landing-orbit landing-orbit--one" />
              <span className="landing-orbit landing-orbit--two" />
            </div>
          </div>
          <CommunityPracticeStreak />
          <div className="module-section">
            <div className="module-heading"><p className="kicker">{landing.modulesEyebrow}</p><h2>{landing.modulesTitle}</h2></div>
            <div className="module-grid">
              <section className="module-category" aria-labelledby="note-reading-category">
                <p className="module-category-label" id="note-reading-category">{landing.readingCategory}</p>
                <a className="module-card module-card--staff" href={STAGE_ROUTES.setup} onClick={(event) => { event.preventDefault(); navigateTo("setup"); }}>
                  <span className="module-visual module-visual-frame"><RangePreview level="tam" /></span>
                  <strong>{landing.readingTitle}</strong>
                  <span>{landing.readingCopy}</span>
                  <small>{landing.readingMeta}</small>
                  <b className="module-card-cta">{landing.openReading}<i aria-hidden="true">→</i></b>
                </a>
              </section>
              <section className="module-category" aria-labelledby="instrument-category">
                <p className="module-category-label" id="instrument-category">{landing.instrumentsCategory}</p>
                <a className="module-card module-card--guitar" href={STAGE_ROUTES.instruments} onClick={(event) => { event.preventDefault(); navigateTo("instruments"); }}>
                  <span className="module-guitar-visual module-visual-frame" aria-hidden="true"><b>C</b><b>E</b><b>G</b></span>
                  <strong>{landing.guitarTitle}</strong>
                  <span>{landing.guitarCopy}</span>
                  <small>{landing.guitarMeta}</small>
                  <b className="module-card-cta">{landing.openGuitar}<i aria-hidden="true">→</i></b>
                </a>
              </section>
              <section className="module-category module-category--score" aria-labelledby="score-reading-category">
                <p className="module-category-label" id="score-reading-category">{landing.scoreCategory}</p>
                <a className="module-card module-card--score" href={STAGE_ROUTES.pieces} onClick={(event) => { event.preventDefault(); navigateTo("pieces"); }}>
                  <span className="module-score-copy"><strong>{landing.scoreTitle}</strong><span>{landing.scoreCopy}</span><small>{landing.scoreMeta}</small><b className="module-card-cta">{landing.openScore}<i aria-hidden="true">→</i></b></span>
                  <span className="module-score-visual module-visual-frame" aria-hidden="true">
                    <RhythmPatternPreview variant="mixed" />
                  </span>
                </a>
              </section>
            </div>
          </div>
        </section>
      )}

      {stage === "instruments" && (
        <InstrumentHub locale={locale} onOpenGuitar={() => navigateTo("guitar")} />
      )}

      {stage === "guitar" && (
        <Suspense fallback={<section className="guitar-shell guitar-shell--loading" aria-busy="true" />}>
          <GuitarTrainer
            locale={locale}
            noteSoundEnabled={noteSoundEnabled}
            onSessionActiveChange={setGuitarSessionActive}
          />
        </Suspense>
      )}

      {stage === "pieces" && (
        <Suspense fallback={<section className="score-reading-shell score-reading-shell--loading" aria-busy="true" />}>
          <ScoreReadingTrainer
            locale={locale}
            noteSoundEnabled={noteSoundEnabled}
            onSessionActiveChange={setScoreReadingSessionActive}
          />
        </Suspense>
      )}

      {stage === "setup" && (
        <section className="setup-shell">
          <section className="reading-session-summary" aria-labelledby="reading-session-summary-title">
            <div>
              <p className="kicker">{readingProfileCopy.summaryEyebrow}</p>
              <h2 id="reading-session-summary-title">{readingProfileCopy.summaryTitle}</h2>
              <div className="reading-session-chips" aria-label={readingProfileCopy.summaryEyebrow}>
                <span>{selectedLevel.title}</span>
                <span>{selectedModeTitle}</span>
                <span>{selectedSessionTitle}</span>
              </div>
            </div>
            <div className="reading-session-summary-actions">
              <button className="primary-button" type="button" onClick={startSession}>{readingProfileCopy.start} <span aria-hidden="true">→</span></button>
              <button type="button" onClick={() => document.getElementById("reading-detailed-settings")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{readingProfileCopy.details}</button>
            </div>
          </section>

          <div className="hero-copy">
            <p className="kicker">{copy.kicker}</p>
            <h1>{copy.heroLine1}<br /><em>{copy.heroLine2}</em></h1>
            <p className="hero-lead">{copy.heroLead}</p>
            <div className="hero-staff" aria-hidden="true">
              <div className="hero-staff-heading">
                <span>{locale === "tr" ? "Sol anahtarı" : "Treble clef"}</span>
                <strong>{locale === "tr" ? "Doğal nota" : "Natural note"}</strong>
              </div>
              <div className="hero-staff-score">
                <Staff note={ALL_NOTES.find((note) => note.id === "b4")!} locale={locale} compact />
              </div>
              <div className="hero-staff-caption">
                <span>{locale === "tr" ? "3. çizgi, Si" : "Middle line, B"}</span>
                <em className="scribble">{copy.scribble}</em>
              </div>
            </div>
          </div>

          <div className="setup-panel" id="reading-detailed-settings">
            <div className="step-heading">
              <span aria-hidden="true">⚬</span>
              <div><p>{copy.rangeEyebrow}</p><h2>{copy.chooseRange}</h2></div>
            </div>
            <div className="level-grid">
              {levels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`level-card ${level === item.id ? "is-selected" : ""}`}
                  onClick={() => { setLevel(item.id); persistReadingSettings({ level: item.id }); }}
                  aria-pressed={level === item.id}
                >
                  <RangePreview level={item.id} />
                  <span className="level-top"><small>{item.eyebrow}</small><b>{item.count} {locale === "tr" ? "nota" : "notes"}</b></span>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                  <small className="level-instruments">{item.instruments}</small>
                </button>
              ))}
            </div>

            <div className="divider" />
            <div className="step-heading compact-heading">
              <span aria-hidden="true">⚬</span>
              <div><p>{copy.questionStyle}</p><h2>{copy.chooseMode}</h2></div>
            </div>
            <div className="mode-grid">
              <button type="button" className={`mode-card ${mode === "porte" ? "is-selected" : ""}`} onClick={() => { setMode("porte"); persistReadingSettings({ mode: "porte" }); }} aria-pressed={mode === "porte"}>
                <span className="mode-icon mode-icon--clef" aria-hidden="true">𝄞</span>
                <span><strong>{copy.modes.porte.title}</strong><small>{copy.modes.porte.description}</small></span>
                <i className="selection-indicator" aria-hidden="true" />
              </button>
              <button type="button" className={`mode-card ${mode === "konum" ? "is-selected" : ""}`} onClick={() => { setMode("konum"); persistReadingSettings({ mode: "konum" }); }} aria-pressed={mode === "konum"}>
                <span className="mode-icon mode-icon--text" aria-hidden="true">1.</span>
                <span><strong>{copy.modes.konum.title}</strong><small>{copy.modes.konum.description}</small></span>
                <i className="selection-indicator" aria-hidden="true" />
              </button>
            </div>

            <div className="divider" />
            <div className="step-heading compact-heading">
              <span aria-hidden="true">⚬</span>
              <div><p>{extra.sessionEyebrow}</p><h2>{extra.chooseSession}</h2></div>
            </div>
            <div className="mode-grid session-type-grid">
              <button type="button" className={`mode-card ${sessionType === "standard" ? "is-selected" : ""}`} onClick={() => { setSessionType("standard"); persistReadingSettings({ sessionType: "standard" }); }} aria-pressed={sessionType === "standard"}>
                <span className="mode-icon mode-icon--check" aria-hidden="true"><UiIcon name="check" /></span>
                <span><strong>{extra.standard.title}</strong><small>{extra.standard.description}</small></span>
                <i className="selection-indicator" aria-hidden="true" />
              </button>
              <button type="button" className={`mode-card ${sessionType === "endless" ? "is-selected" : ""}`} onClick={() => { setSessionType("endless"); persistReadingSettings({ sessionType: "endless" }); }} aria-pressed={sessionType === "endless"}>
                <span className="mode-icon mode-icon--infinity" aria-hidden="true">∞</span>
                <span><strong>{extra.endless.title}</strong><small>{extra.endless.description}</small></span>
                <i className="selection-indicator" aria-hidden="true" />
              </button>
            </div>

            <button className="primary-button" type="button" onClick={startSession}>
              {copy.start} <span aria-hidden="true">→</span>
            </button>
            <p className="setup-note">{sessionType === "standard" ? copy.setupNote : extra.endlessSetupNote}</p>
          </div>
        </section>
      )}

      {stage === "quiz" && displayedNote && (
        <section className="quiz-shell" ref={quizShellRef}>
          <div className="progress-row">
            <div>
              <span className="progress-label">{sessionType === "standard" ? copy.progress : extra.endlessProgress}</span>
              <strong>{answeredCorrectly}{sessionType === "standard" && <small> / {uniqueCount}</small>}</strong>
            </div>
            <div
              className={`progress-track ${sessionType === "endless" ? "progress-track--endless" : ""}`}
              aria-label={sessionType === "standard" ? copy.completedLabel(uniqueCount, answeredCorrectly) : `${answeredCorrectly} ${extra.correctAnswers}`}
              role={sessionType === "standard" ? "progressbar" : undefined}
              aria-valuemin={sessionType === "standard" ? 0 : undefined}
              aria-valuemax={sessionType === "standard" ? uniqueCount : undefined}
              aria-valuenow={sessionType === "standard" ? answeredCorrectly : undefined}
            >
              <span style={{ width: sessionType === "standard" ? `${(answeredCorrectly / uniqueCount) * 100}%` : "100%" }} />
            </div>
            <span className="remaining">{sessionType === "standard" ? copy.remaining(queue.length) : totalWrong === 0 ? extra.noMistakes : `${totalWrong} ${copy.totalWrong}`}</span>
          </div>

          <div className="quiz-layout">
          <div className="quiz-main-column">
          <div className="question-card">
            <header className="question-heading">
              <div className="question-number">{copy.question(activeQuestionNumber)}</div>
              <p className="question-prompt">{copy.prompt}</p>
            </header>
            <div className={`notation-stage notation-stage--${mode}`}>
              {mode === "porte" ? (
                <Staff note={displayedNote} locale={locale} revealAnswer={Boolean(feedback)} />
              ) : (
                <div className="location-question">
                  <span>{copy.positionLabel}</span>
                  <strong>{displayedNote.shortLocation[locale]}</strong>
                  <p>{displayedNote.location[locale].charAt(0).toUpperCase() + displayedNote.location[locale].slice(1)}</p>
                </div>
              )}
            </div>
            {!feedback ? (
              <form className="answer-form" onSubmit={submitAnswer}>
                <label htmlFor="answer">{copy.answerLabel}</label>
                <div className="answer-line">
                  <input
                    id="answer"
                    ref={inputRef}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder={copy.placeholder}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="done"
                  />
                  <button type="submit" disabled={!normalizeAnswer(answer)}>{copy.check} <span aria-hidden="true">↵</span></button>
                </div>
                <div className="note-hints note-hints--desktop" role="group" aria-label={copy.choicesLabel}>
                  {answerChoices.map((name) => <button type="button" key={name} onClick={() => { setAnswer(name); inputRef.current?.focus(); }}>{name}</button>)}
                </div>
                <div className="mobile-answer-pad" role="group" aria-label={copy.choicesLabel}>
                  <span>{copy.choicesLabel}</span>
                  <div>
                    {answerChoices.map((name) => <button type="button" key={name} value={name} onClick={chooseAnswer}>{name}</button>)}
                  </div>
                </div>
              </form>
            ) : (
              <div className={`feedback ${feedback.correct ? "feedback--correct" : "feedback--wrong"}`} role="status" aria-live="polite" aria-atomic="true">
                <span className="feedback-icon" aria-hidden="true"><UiIcon name={feedback.correct ? "check" : "close"} /></span>
                <div id="note-feedback-message">
                  <strong>{feedback.correct ? copy.correct : copy.incorrect}</strong>
                  {feedback.correct ? (
                    <p>{copy.correctCopy(noteName(feedback.note, locale))}</p>
                  ) : (
                    <p>
                      {copy.wrongPrefix}: <b>{noteName(feedback.note, locale)}</b>. {feedback.note.location[locale].charAt(0).toUpperCase() + feedback.note.location[locale].slice(1)}.{" "}
                      {feedback.guessed && copy.wrongGuess(locale === "tr" ? feedback.guessed.solfege : feedback.guessed.letter)}{" "}
                      {copy.wrongSuffix}
                    </p>
                  )}
                </div>
                <button ref={feedbackButtonRef} type="button" aria-describedby="note-feedback-message" onClick={nextQuestion}>{sessionType === "endless" || queue.length ? copy.next : copy.results} <span aria-hidden="true">→</span></button>
              </div>
            )}
          </div>

          <div className="quiz-session-actions">
            <button className="restart-session-button" type="button" onClick={startSession}>{copy.restartSession}</button>
            <button className="end-session-button" type="button" onClick={endSession}>{copy.endSession}</button>
          </div>
          </div>
          <aside className="quiz-stat-panel" aria-label={shell.currentSession} aria-live="polite">
            <p className="kicker">{shell.currentSession}</p>
            <p className="quiz-stat-context">
              <strong>{selectedLevel.title}</strong>
              <span>{copy.modes[mode].title}</span>
              <span>{sessionType === "standard" ? extra.standard.title : extra.endless.title}</span>
            </p>
            <div className="quiz-stat-primary">
              <span>{shell.question}</span>
              <strong>{activeQuestionNumber}<small>{sessionType === "standard" ? ` / ${uniqueCount}` : ""}</small></strong>
            </div>
            <dl>
              <div><dt>{shell.remaining}</dt><dd>{sessionType === "standard" ? queue.length : "∞"}</dd></div>
              <div><dt>{shell.elapsed}</dt><dd>{elapsedTime}</dd></div>
              <div><dt>{shell.accuracy}</dt><dd>%{currentAccuracy}</dd></div>
              <div><dt>{shell.correct}</dt><dd>{correctCount}</dd></div>
              <div><dt>{shell.mistakes}</dt><dd>{totalWrong}</dd></div>
              <div><dt>{locale === "tr" ? "Doğru serisi" : "Answer streak"}</dt><dd>{currentStreak}</dd></div>
            </dl>
            <blockquote>“{locale === "tr" ? "Her nota, bir adım ilerlemedir." : "Every note is one step forward."}”</blockquote>
          </aside>
          </div>
        </section>
      )}

      {stage === "done" && (
        <section className="results-shell">
          <CommunityPracticeRecorder active={completedDailyPractice} activityKey={`notes-${sessionStartedAt}`} />
          <div className="results-intro">
            <span className="brand-mark result-flourish" aria-hidden="true">
              <img src="./notanota-monogram.png" alt="" />
            </span>
            <p className="kicker">{completedStandardSession ? copy.sessionComplete : copy.sessionSummary}</p>
            <h1 ref={resultsHeadingRef} tabIndex={-1}>{sessionType === "endless" ? extra.endlessResultTitle : sessionInsight.title}</h1>
            <p>{sessionType === "endless" ? extra.endedSession(correctCount, totalTime) : endedEarly ? extra.stoppedSession(correctCount) : copy.completedCopy(selectedLevel.title)}</p>
          </div>

          <dl className="result-session-meta" aria-label={copy.sessionSummary}>
            <div><dt>{locale === "tr" ? "Seviye" : "Range"}</dt><dd>{selectedLevel.title}</dd></div>
            <div><dt>{locale === "tr" ? "Çalışma biçimi" : "Practice mode"}</dt><dd>{copy.modes[mode].title}</dd></div>
            <div><dt>{locale === "tr" ? "Oturum" : "Session"}</dt><dd>{sessionType === "standard" ? extra.standard.title : extra.endless.title}</dd></div>
            <div><dt>{locale === "tr" ? "Toplam süre" : "Total time"}</dt><dd>{totalTime}</dd></div>
          </dl>

          {completedDailyPractice && <CommunityPracticeStreak compact />}

          {sessionType === "standard" && <aside className={`session-insight session-insight--${sessionInsight.tone} ${totalWrong > 0 && hardestNotes[0] ? "session-insight--split" : ""}`} aria-label={copy.sessionSummary}>
            <div className="session-insight-copy">
              <p>{sessionInsight.body}</p>
              {sessionInsight.pace && <strong>{sessionInsight.pace}</strong>}
              {sessionInsight.nextStep && <span>{sessionInsight.nextStep}</span>}
            </div>
            {totalWrong > 0 && hardestNotes[0] && (
              <div className="confusion-insight">
                <p className="kicker">{copy.patternEyebrow}</p>
                {dominantConfusion ? (
                  <>
                    <div className="confusion-pair" aria-label={`${noteName(dominantConfusion.expected, locale)} → ${locale === "tr" ? dominantConfusion.guessed.solfege : dominantConfusion.guessed.letter}`}>
                      <b>{noteName(dominantConfusion.expected, locale)}</b><span aria-hidden="true">→</span><b>{locale === "tr" ? dominantConfusion.guessed.solfege : dominantConfusion.guessed.letter}</b>
                    </div>
                    <p>{copy.confusionCopy(
                      noteName(dominantConfusion.expected, locale),
                      dominantConfusion.expected.location[locale],
                      locale === "tr" ? dominantConfusion.guessed.solfege : dominantConfusion.guessed.letter,
                    )}</p>
                    <small>{copy.confusionNext}</small>
                  </>
                ) : (
                  <p>{copy.reviewFocus(noteName(hardestNotes[0].note, locale), hardestNotes[0].note.location[locale])}</p>
                )}
              </div>
            )}
          </aside>}

          {sessionType === "endless" ? (
            <div className="endless-results-card">
              <Stat label={extra.correctAnswers} value={correctCount} accent />
              <Stat label={extra.totalTime} value={totalTime} />
            </div>
          ) : <div className="results-card">
            <div className="score-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
                <circle className="score-ring-track" cx="60" cy="60" r="52" pathLength="100" />
                <circle className="score-ring-progress" cx="60" cy="60" r="52" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - firstTryRate} />
              </svg>
              <div className="score-ring-copy"><strong>%{firstTryRate}</strong><span>{copy.firstTry}</span></div>
            </div>
            <div className="stats-grid">
              <Stat label={sessionType === "standard" ? copy.uniqueQuestions : extra.correctAnswers} value={sessionType === "standard" ? uniqueCount : correctCount} />
              <Stat label={copy.firstTryCorrect} value={firstTryCorrect} accent />
              <Stat label={copy.totalWrong} value={totalWrong} />
              <Stat label={copy.averageResponse} value={averageTime} />
            </div>
          </div>}

          <CommunityResult score={scoreSubmission} eligible={leaderboardEligible} />

          {sessionType === "standard" && <div className="hardest-card">
            <div><p className="kicker">{copy.reviewList}</p><h2>{copy.hardest}</h2></div>
            {hardestNotes.length ? (
              <div className="hardest-list">
                {hardestNotes.map(({ note, count }) => (
                  <div key={note.id}><span className="note-pill">{noteName(note, locale)}</span><span>{note.shortLocation[locale]}</span><b>{copy.wrongCount(count)}</b></div>
                ))}
              </div>
            ) : (
              <p className={`perfect-copy ${answerTimes.length === 0 ? "perfect-copy--empty" : ""}`}>
                {answerTimes.length === 0 ? copy.noAnswers : completedStandardSession ? copy.perfect : copy.cleanSoFar}
              </p>
            )}
          </div>}

          <div className="result-actions">
            <button className="primary-button" type="button" onClick={startSession}>{copy.repeat} <span>↻</span></button>
            <button className="secondary-button" type="button" onClick={() => navigateTo("setup")}>{copy.changeLevel}</button>
            <CommunityLeaderboardButton label={shell.leaderboard} />
          </div>
        </section>
      )}

      {readingSetupModalOpen && (
        <div
          className="reading-setup-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReadingSetupModalOpen(false);
          }}
        >
          <section className="reading-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="reading-setup-title" aria-describedby="reading-setup-description">
            <button ref={readingSetupCloseRef} className="reading-setup-close" type="button" onClick={() => setReadingSetupModalOpen(false)} aria-label={readingProfileCopy.later}>×</button>
            <header>
              <p className="kicker">{readingProfileCopy.eyebrow}</p>
              <h2 id="reading-setup-title">{readingProfileCopy.firstTitle}</h2>
              <p id="reading-setup-description">{readingProfileCopy.firstCopy}</p>
            </header>
            <div className="reading-profile-grid" role="group" aria-label={readingProfileCopy.choices}>
              {(["new", "growing", "confident"] as ReadingProfileId[]).map((profile) => (
                <button key={profile} type="button" className={readingProfile === profile ? "is-selected" : ""} onClick={() => previewReadingPreset(profile)} aria-pressed={readingProfile === profile}>
                  <span className="profile-choice-mark" aria-hidden="true" />
                  <strong>{readingProfileCopy[profile].title}</strong>
                  <small>{readingProfileCopy[profile].copy}</small>
                </button>
              ))}
            </div>
            <div className={`reading-recommendation ${readingProfile ? "is-ready" : ""}`} aria-live="polite">
              <div>
                <p className="kicker">{readingProfileCopy.recommendation}</p>
                <span>{readingProfileCopy.recommendationCopy}</span>
              </div>
              <label>
                <span>{readingProfileCopy.level}</span>
                <select value={draftLevel} onChange={(event) => setDraftLevel(event.target.value as LevelId)} disabled={!readingProfile}>
                  {levels.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
                </select>
              </label>
              <label>
                <span>{readingProfileCopy.mode}</span>
                <select value={draftMode} onChange={(event) => setDraftMode(event.target.value as ModeId)} disabled={!readingProfile}>
                  <option value="porte">{copy.modes.porte.title}</option>
                  <option value="konum">{copy.modes.konum.title}</option>
                </select>
              </label>
              <label>
                <span>{readingProfileCopy.session}</span>
                <select value={draftSessionType} onChange={(event) => setDraftSessionType(event.target.value as SessionType)} disabled={!readingProfile}>
                  <option value="standard">{extra.standard.title}</option>
                  <option value="endless">{extra.endless.title}</option>
                </select>
              </label>
            </div>
            <div className="reading-setup-actions">
              <button className="primary-button" type="button" onClick={saveReadingSetup} disabled={!readingProfile}>{readingProfileCopy.save} <span aria-hidden="true">→</span></button>
              <button type="button" onClick={() => setReadingSetupModalOpen(false)}>{readingProfileCopy.later}</button>
            </div>
          </section>
        </div>
      )}

      {!immersiveSession && <footer><span>NotaNota</span><p>{copy.footer}</p><CommunityLegalLink /><a className="brand-mark brand-mark--footer" href={STAGE_ROUTES.landing} onClick={(event) => { event.preventDefault(); navigateTo("landing"); }} aria-label={copy.homeLabel}><img src="./notanota-monogram.png" alt="" /></a></footer>}
    </main>
    </CommunityProvider>
  );
}
