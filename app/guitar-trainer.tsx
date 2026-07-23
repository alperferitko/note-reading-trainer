"use client";

import { FormEvent, useMemo, useState } from "react";
import { noteClassFromAnswer } from "@/lib/session-insights.mjs";

type Locale = "tr" | "en";
type GuitarStage = "setup" | "quiz" | "done";
type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

type GuitarQuestion = {
  id: string;
  stringId: string;
  stringNumber: number;
  stringLabel: string;
  fret: number;
  letter: Letter;
  misses: number;
};

const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NATURAL = new Set<Letter>(["C", "D", "E", "F", "G", "A", "B"]);
const SOLFEGE: Record<Letter, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
const STRINGS = [
  { id: "e-high", number: 1, label: "e", open: "E" },
  { id: "b", number: 2, label: "B", open: "B" },
  { id: "g", number: 3, label: "G", open: "G" },
  { id: "d", number: 4, label: "D", open: "D" },
  { id: "a", number: 5, label: "A", open: "A" },
  { id: "e-low", number: 6, label: "E", open: "E" },
] as const;

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
    kicker: "Gitar · standart akort",
    title: "Klavye üzerinde notaları bul.",
    lead: "Doğal notaların gitardaki yerlerini gör, sonra işaretlenen tel ve perdeyi okuyarak hafızanı güçlendir.",
    range: "Çalışma alanını seç",
    terminology: "Perde mi, pozisyon mu?",
    terminologyCopy: "Metal bölmeler perde olarak adlandırılır. Pozisyon ise elinin klavye üzerindeki yeridir; çoğunlukla işaret parmağının bulunduğu perdeyle adlandırılır.",
    map: "Doğal nota haritası",
    mapCopy: "Seçtiğin aralıktaki bütün doğal notalar",
    start: "Gitar çalışmasını başlat",
    back: "Nota okumaya dön",
    exit: "Modüllere dön",
    progress: "İlerleme",
    question: "İşaretlenen nota hangisi?",
    location: (stringNumber: number, fret: number) => `${stringNumber}. tel · ${fret === 0 ? "açık tel" : `${fret}. perde`}`,
    answer: "Cevabını yaz",
    placeholder: "Do, Re, Mi…",
    check: "Kontrol et",
    correct: "Doğru",
    incorrect: "Yanlış",
    wrongCopy: (name: string) => `Doğru nota ${name}. Bu konum listenin sonuna eklendi.`,
    next: "Sonraki",
    complete: "Klavye turu tamamlandı",
    completeCopy: "Seçtiğin alandaki bütün doğal nota konumlarını en az bir kez doğru buldun.",
    unique: "Nota konumu",
    firstTry: "İlk denemede doğru",
    wrong: "Toplam yanlış",
    average: "Ortalama cevap",
    repeat: "Aynı aralıkla yeniden çalış",
    change: "Perde aralığını değiştir",
    choices: "Nota seçenekleri",
  },
  en: {
    kicker: "Guitar · standard tuning",
    title: "Find every note on the fretboard.",
    lead: "Explore where natural notes live on the guitar, then build recall by naming the highlighted string and fret.",
    range: "Choose your fret range",
    terminology: "Frets or positions?",
    terminologyCopy: "The metal divisions are frets. A position describes where your fretting hand sits, usually named for the fret under your first finger.",
    map: "Natural-note map",
    mapCopy: "Every natural note in your selected range",
    start: "Start guitar practice",
    back: "Switch to sight-reading",
    exit: "Back to modules",
    progress: "Progress",
    question: "Which note is highlighted?",
    location: (stringNumber: number, fret: number) => `String ${stringNumber} · ${fret === 0 ? "open string" : `fret ${fret}`}`,
    answer: "Type your answer",
    placeholder: "C, D, E…",
    check: "Check answer",
    correct: "Correct",
    incorrect: "Incorrect",
    wrongCopy: (name: string) => `The correct note is ${name}. This location moved to the end of the queue.`,
    next: "Next",
    complete: "Fretboard round complete",
    completeCopy: "You found every natural-note location in the selected range at least once.",
    unique: "Note locations",
    firstTry: "Correct first time",
    wrong: "Incorrect answers",
    average: "Average response",
    repeat: "Practise this range again",
    change: "Change fret range",
    choices: "Note choices",
  },
} as const;

function noteAt(open: string, fret: number) {
  return CHROMATIC[(CHROMATIC.indexOf(open) + fret) % CHROMATIC.length];
}

function buildQuestions(maxFret: number): GuitarQuestion[] {
  return STRINGS.flatMap((string) => Array.from({ length: maxFret + 1 }, (_, fret) => {
    const letter = noteAt(string.open, fret) as Letter | `${Letter}#`;
    if (!NATURAL.has(letter as Letter)) return null;
    return {
      id: `${string.id}-${fret}`,
      stringId: string.id,
      stringNumber: string.number,
      stringLabel: string.label,
      fret,
      letter: letter as Letter,
      misses: 0,
    };
  }).filter((item): item is GuitarQuestion => Boolean(item)));
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
}: {
  maxFret: number;
  locale: Locale;
  active?: GuitarQuestion;
  reveal?: boolean;
}) {
  const columns = `68px repeat(${maxFret + 1}, minmax(48px, 1fr))`;
  return (
    <div className="fretboard-scroll">
      <div className="fretboard" style={{ minWidth: `${Math.max(620, 90 + (maxFret + 1) * 58)}px` }}>
        <div className="fretboard-fret-numbers" style={{ gridTemplateColumns: columns }}>
          <span />
          {Array.from({ length: maxFret + 1 }, (_, fret) => <span key={fret}>{fret === 0 ? (locale === "tr" ? "Açık" : "Open") : fret}</span>)}
        </div>
        {STRINGS.map((string) => (
          <div className={`fretboard-string fretboard-string--${string.number}`} style={{ gridTemplateColumns: columns }} key={string.id}>
            <strong>{string.number} · {string.label}</strong>
            {Array.from({ length: maxFret + 1 }, (_, fret) => {
              const letter = noteAt(string.open, fret);
              const natural = NATURAL.has(letter as Letter);
              const selected = active?.stringId === string.id && active.fret === fret;
              return (
                <span className={`fret-cell ${fret === 0 ? "fret-cell--open" : ""}`} key={fret}>
                  {(selected || (reveal && natural)) && (
                    <i className={`fret-note ${selected ? "is-active" : ""}`}>
                      {reveal ? noteName(letter as Letter, locale) : "?"}
                    </i>
                  )}
                </span>
              );
            })}
          </div>
        ))}
        <div className="fretboard-inlays" aria-hidden="true">
          {[3, 5, 7, 9, 12].filter((fret) => fret <= maxFret).map((fret) => <i key={fret} style={{ left: `calc(68px + ${(fret + .5) / (maxFret + 1)} * (100% - 68px))` }} />)}
        </div>
      </div>
    </div>
  );
}

export function GuitarTrainer({
  locale,
  onHome,
  onSightReading,
}: {
  locale: Locale;
  onHome: () => void;
  onSightReading: () => void;
}) {
  const [stage, setStage] = useState<GuitarStage>("setup");
  const [maxFret, setMaxFret] = useState(3);
  const [queue, setQueue] = useState<GuitarQuestion[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [feedbackQuestion, setFeedbackQuestion] = useState<GuitarQuestion | null>(null);
  const [firstTry, setFirstTry] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [initialCount, setInitialCount] = useState(0);
  const text = COPY[locale];
  const ranges = RANGES[locale];
  const current = queue[0];
  const displayed = feedbackQuestion ?? current;
  const choices = locale === "tr" ? Object.values(SOLFEGE) : Object.keys(SOLFEGE);
  const completed = initialCount - queue.length;
  const average = times.length ? `${(times.reduce((sum, time) => sum + time, 0) / times.length / 1000).toFixed(2).replace(".", locale === "tr" ? "," : ".")} ${locale === "tr" ? "sn" : "sec"}` : `0${locale === "tr" ? "," : "."}00`;

  const previewQuestions = useMemo(() => buildQuestions(maxFret), [maxFret]);

  function start() {
    const questions = shuffle(buildQuestions(maxFret));
    setInitialCount(questions.length);
    setQueue(questions);
    setFirstTry(0);
    setWrong(0);
    setTimes([]);
    setAnswer("");
    setFeedback(null);
    setFeedbackQuestion(null);
    setStartedAt(Date.now());
    setStage("quiz");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    answerQuestion(answer);
  }

  function answerQuestion(value: string) {
    if (!current || feedback) return;
    const guessed = noteClassFromAnswer(value);
    if (!guessed) return;
    setFeedbackQuestion(current);
    setAnswer(value);
    setTimes((items) => [...items, Math.max(100, Date.now() - startedAt)]);
    if (guessed.letter === current.letter) {
      if (current.misses === 0) setFirstTry((count) => count + 1);
      setQueue((items) => items.slice(1));
      setFeedback("correct");
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
    setFeedback(null);
    setFeedbackQuestion(null);
    setStartedAt(Date.now());
  }

  if (stage === "setup") {
    return (
      <section className="guitar-shell guitar-setup">
        <button className="module-back" type="button" onClick={onHome}>← {text.exit}</button>
        <div className="guitar-hero">
          <div>
            <p className="kicker">{text.kicker}</p>
            <h1>{text.title}</h1>
            <p>{text.lead}</p>
          </div>
          <div className="guitar-neck-art" aria-hidden="true"><span>6</span><i /><i /><i /><i /><i /><i /><b>12</b></div>
        </div>

        <div className="guitar-range-heading">
          <div><p className="kicker">01</p><h2>{text.range}</h2></div>
          <aside><strong>{text.terminology}</strong><span>{text.terminologyCopy}</span></aside>
        </div>
        <div className="guitar-range-grid">
          {ranges.map((range) => (
            <button className={maxFret === range.frets ? "is-selected" : ""} type="button" key={range.frets} onClick={() => setMaxFret(range.frets)} aria-pressed={maxFret === range.frets}>
              <small>{range.eyebrow}</small><strong>{range.title}</strong><span>{range.copy}</span><i />
            </button>
          ))}
        </div>

        <div className="fretboard-card">
          <div className="fretboard-card-heading"><div><p className="kicker">02</p><h2>{text.map}</h2></div><span>{text.mapCopy} · {previewQuestions.length}</span></div>
          <Fretboard maxFret={maxFret} locale={locale} reveal />
        </div>
        <div className="guitar-actions">
          <button className="primary-button" type="button" onClick={start}>{text.start} <span aria-hidden="true">→</span></button>
          <button className="secondary-button" type="button" onClick={onSightReading}>{text.back}</button>
        </div>
      </section>
    );
  }

  if (stage === "done") {
    return (
      <section className="guitar-shell guitar-results">
        <button className="module-back" type="button" onClick={onHome}>← {text.exit}</button>
        <p className="kicker">{text.kicker}</p>
        <h1>{text.complete}</h1>
        <p>{text.completeCopy}</p>
        <div className="guitar-stats">
          <div><strong>{initialCount}</strong><span>{text.unique}</span></div>
          <div><strong>{firstTry}</strong><span>{text.firstTry}</span></div>
          <div><strong>{wrong}</strong><span>{text.wrong}</span></div>
          <div><strong>{average}</strong><span>{text.average}</span></div>
        </div>
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
        <button className="module-back" type="button" onClick={() => setStage("setup")}>← {text.change}</button>
        <div><span>{text.progress}</span><strong>{completed} / {initialCount}</strong></div>
      </div>
      <div className="guitar-question-card">
        <p className="kicker">{displayed && text.location(displayed.stringNumber, displayed.fret)}</p>
        <h1>{text.question}</h1>
        {displayed && <Fretboard maxFret={maxFret} locale={locale} active={displayed} />}
        {!feedback ? (
          <form className="guitar-answer" onSubmit={submit}>
            <label htmlFor="guitar-answer">{text.answer}</label>
            <div><input id="guitar-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={text.placeholder} autoComplete="off" spellCheck={false} /><button type="submit">{text.check}</button></div>
            <div className="guitar-note-choices" role="group" aria-label={text.choices}>{choices.map((choice) => <button type="button" key={choice} onClick={() => answerQuestion(choice)}>{choice}</button>)}</div>
          </form>
        ) : (
          <div className={`guitar-feedback guitar-feedback--${feedback}`}>
            <strong>{feedback === "correct" ? text.correct : text.incorrect}</strong>
            <span>{feedback === "correct" ? noteName(feedbackQuestion?.letter ?? "C", locale) : text.wrongCopy(noteName(feedbackQuestion?.letter ?? "C", locale))}</span>
            <button type="button" onClick={next}>{text.next} →</button>
          </div>
        )}
      </div>
    </section>
  );
}
