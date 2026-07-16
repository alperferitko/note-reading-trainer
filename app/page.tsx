"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type LevelId = "temel" | "yakin" | "tam";
type ModeId = "porte" | "konum";
type Stage = "setup" | "quiz" | "done";

type NoteQuestion = {
  id: string;
  name: "Do" | "Re" | "Mi" | "Fa" | "Sol" | "La" | "Si";
  position: number;
  location: string;
  shortLocation: string;
};

const NOTE_NAMES = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"] as const;

const ALL_NOTES: NoteQuestion[] = [
  { id: "c4", name: "Do", position: -2, location: "portenin altındaki 1. ek çizgi üzerinde", shortLocation: "Alt 1. ek çizgi" },
  { id: "d4", name: "Re", position: -1, location: "1. çizginin altındaki aralıkta", shortLocation: "1. çizginin altı" },
  { id: "e4", name: "Mi", position: 0, location: "1. çizgi üzerinde", shortLocation: "1. çizgi" },
  { id: "f4", name: "Fa", position: 1, location: "1. aralıkta", shortLocation: "1. aralık" },
  { id: "g4", name: "Sol", position: 2, location: "2. çizgi üzerinde", shortLocation: "2. çizgi" },
  { id: "a4", name: "La", position: 3, location: "2. aralıkta", shortLocation: "2. aralık" },
  { id: "b4", name: "Si", position: 4, location: "3. çizgi üzerinde", shortLocation: "3. çizgi" },
  { id: "c5", name: "Do", position: 5, location: "3. aralıkta", shortLocation: "3. aralık" },
  { id: "d5", name: "Re", position: 6, location: "4. çizgi üzerinde", shortLocation: "4. çizgi" },
  { id: "e5", name: "Mi", position: 7, location: "4. aralıkta", shortLocation: "4. aralık" },
  { id: "f5", name: "Fa", position: 8, location: "5. çizgi üzerinde", shortLocation: "5. çizgi" },
  { id: "g5", name: "Sol", position: 9, location: "5. çizginin üstündeki aralıkta", shortLocation: "5. çizginin üstü" },
  { id: "a5", name: "La", position: 10, location: "portenin üstündeki 1. ek çizgi üzerinde", shortLocation: "Üst 1. ek çizgi" },
  { id: "b5", name: "Si", position: 11, location: "1. ek çizginin üstündeki aralıkta", shortLocation: "Üst ek çizginin üstü" },
  { id: "c6", name: "Do", position: 12, location: "portenin üstündeki 2. ek çizgi üzerinde", shortLocation: "Üst 2. ek çizgi" },
];

const LEVELS: { id: LevelId; eyebrow: string; title: string; description: string; count: number }[] = [
  { id: "temel", eyebrow: "Seviye 1", title: "Temel porte", description: "Beş çizgi ve dört aralıktaki notalar", count: 9 },
  { id: "yakin", eyebrow: "Seviye 2", title: "Yakın çevre", description: "Temel porte, komşu aralıklar ve yakın ek çizgiler", count: 13 },
  { id: "tam", eyebrow: "Seviye 3", title: "Tam doğal sesler", description: "Alt Do’dan üst Do’ya bütün doğal notalar", count: 15 },
];

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

function Staff({ note, compact = false }: { note: NoteQuestion; compact?: boolean }) {
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
    <div className={`staff ${compact ? "staff--compact" : ""}`} aria-label={`${note.name}, ${note.location}`} role="img">
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

  const uniqueCount = questionsFor(level).length;
  const current = queue[0];
  const displayedNote = feedback?.note ?? current;
  const answeredCorrectly = uniqueCount - queue.length;
  const selectedLevel = LEVELS.find((item) => item.id === level)!;

  const hardestNotes = useMemo(() => {
    return Object.entries(wrongByNote)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id, count]) => ({ note: ALL_NOTES.find((item) => item.id === id)!, count }));
  }, [wrongByNote]);

  useEffect(() => {
    if (stage === "quiz" && !feedback) inputRef.current?.focus();
  }, [stage, feedback, current?.id]);

  function startSession() {
    const freshQueue = shuffledWithoutRuns(questionsFor(level));
    setQueue(freshQueue);
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
    const correct = normalizeAnswer(answer) === normalizeAnswer(current.name);
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
    ? `${(answerTimes.reduce((sum, value) => sum + value, 0) / answerTimes.length).toFixed(1).replace(".", ",")} sn`
    : "0,0 sn";
  const firstTryRate = uniqueCount ? Math.round((firstTryCorrect / uniqueCount) * 100) : 0;

  return (
    <main>
      <header className="site-header">
        <button className="brand" type="button" onClick={() => setStage("setup")} aria-label="Nota Nota ana sayfa">
          <span className="brand-mark" aria-hidden="true">♪</span>
          <span>Nota Nota</span>
        </button>
        {stage === "quiz" && (
          <div className="session-meta">
            <span>{selectedLevel.title}</span>
            <span className="meta-dot" />
            <span>{mode === "porte" ? "Porteden oku" : "Konumu oku"}</span>
          </div>
        )}
      </header>

      {stage === "setup" && (
        <section className="setup-shell">
          <div className="hero-copy">
            <p className="kicker">Sol anahtarı · doğal notalar</p>
            <h1>Notayı gör.<br /><em>İsmini söyle.</em></h1>
            <p className="hero-lead">Porte üzerindeki notaları ezberlemek için kısa, odaklı ve her seferinde farklı bir çalışma.</p>
            <div className="hero-staff" aria-hidden="true">
              <Staff note={ALL_NOTES[6]} compact />
              <span className="scribble">Her gün biraz daha akıcı.</span>
            </div>
          </div>

          <div className="setup-panel">
            <div className="step-heading">
              <span>01</span>
              <div><p>Çalışma alanı</p><h2>Seviyeni seç</h2></div>
            </div>
            <div className="level-grid">
              {LEVELS.map((item) => (
                <button key={item.id} type="button" className={`level-card ${level === item.id ? "is-selected" : ""}`} onClick={() => setLevel(item.id)}>
                  <span className="level-top"><small>{item.eyebrow}</small><b>{item.count} nota</b></span>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                  <i aria-hidden="true">{level === item.id ? "✓" : ""}</i>
                </button>
              ))}
            </div>

            <div className="divider" />
            <div className="step-heading compact-heading">
              <span>02</span>
              <div><p>Soru biçimi</p><h2>Nasıl çalışacaksın?</h2></div>
            </div>
            <div className="mode-grid">
              <button type="button" className={`mode-card ${mode === "porte" ? "is-selected" : ""}`} onClick={() => setMode("porte")}>
                <span className="mode-icon" aria-hidden="true">𝄞</span>
                <span><strong>Porteden oku</strong><small>Notayı gör, ismini yaz</small></span>
                <i aria-hidden="true">{mode === "porte" ? "●" : "○"}</i>
              </button>
              <button type="button" className={`mode-card ${mode === "konum" ? "is-selected" : ""}`} onClick={() => setMode("konum")}>
                <span className="mode-icon mode-icon--text" aria-hidden="true">1.</span>
                <span><strong>Konumu oku</strong><small>Konumu gör, ismini yaz</small></span>
                <i aria-hidden="true">{mode === "konum" ? "●" : "○"}</i>
              </button>
            </div>

            <button className="primary-button" type="button" onClick={startSession}>
              Oturumu başlat <span aria-hidden="true">→</span>
            </button>
            <p className="setup-note">Her nota bir kez eklenir · Liste her oturumda yeniden karıştırılır</p>
          </div>
        </section>
      )}

      {stage === "quiz" && displayedNote && (
        <section className="quiz-shell">
          <div className="progress-row">
            <div>
              <span className="progress-label">İlerleme</span>
              <strong>{answeredCorrectly}<small> / {uniqueCount}</small></strong>
            </div>
            <div className="progress-track" aria-label={`${uniqueCount} sorudan ${answeredCorrectly} tamamlandı`}>
              <span style={{ width: `${(answeredCorrectly / uniqueCount) * 100}%` }} />
            </div>
            <span className="remaining">{queue.length} nota kaldı</span>
          </div>

          <div className="question-card">
            <div className="question-number">Soru {Math.min(answeredCorrectly + 1, uniqueCount)}</div>
            <p className="question-prompt">Bu notanın adı nedir?</p>
            {mode === "porte" ? (
              <Staff note={displayedNote} />
            ) : (
              <div className="location-question">
                <span>Konum</span>
                <strong>{displayedNote.shortLocation}</strong>
                <p>{displayedNote.location.charAt(0).toUpperCase() + displayedNote.location.slice(1)}</p>
              </div>
            )}

            {!feedback ? (
              <form className="answer-form" onSubmit={submitAnswer}>
                <label htmlFor="answer">Cevabını yaz</label>
                <div className="answer-line">
                  <input
                    id="answer"
                    ref={inputRef}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Do, Re, Mi…"
                    autoComplete="off"
                    autoCapitalize="none"
                  />
                  <button type="submit" disabled={!normalizeAnswer(answer)}>Kontrol et <span aria-hidden="true">↵</span></button>
                </div>
                <div className="note-hints" aria-label="Kullanılabilecek cevaplar">
                  {NOTE_NAMES.map((name) => <button type="button" key={name} onClick={() => { setAnswer(name); inputRef.current?.focus(); }}>{name}</button>)}
                </div>
              </form>
            ) : (
              <div className={`feedback ${feedback.correct ? "feedback--correct" : "feedback--wrong"}`} aria-live="polite">
                <span className="feedback-icon" aria-hidden="true">{feedback.correct ? "✓" : "×"}</span>
                <div>
                  <strong>{feedback.correct ? "Doğru" : "Yanlış"}</strong>
                  {feedback.correct ? (
                    <p>{feedback.note.name} notasını bildin.</p>
                  ) : (
                    <p>Doğru cevap <b>{feedback.note.name}</b> — {feedback.note.location}. Bu nota listenin sonuna eklendi.</p>
                  )}
                </div>
                <button type="button" onClick={nextQuestion}>{queue.length ? "Sonraki" : "Sonuçlar"} <span aria-hidden="true">→</span></button>
              </div>
            )}
          </div>

          <button className="text-button" type="button" onClick={() => setStage("setup")}>Oturumu bitir</button>
        </section>
      )}

      {stage === "done" && (
        <section className="results-shell">
          <div className="results-intro">
            <span className="result-flourish" aria-hidden="true">♪</span>
            <p className="kicker">Oturum tamamlandı</p>
            <h1>Harika iş!</h1>
            <p>{selectedLevel.title} listesindeki bütün notaları en az bir kez doğru cevapladın.</p>
          </div>

          <div className="results-card">
            <div className="score-ring" style={{ "--score": `${firstTryRate * 3.6}deg` } as React.CSSProperties}>
              <div><strong>%{firstTryRate}</strong><span>ilk deneme</span></div>
            </div>
            <div className="stats-grid">
              <Stat label="Benzersiz soru" value={uniqueCount} />
              <Stat label="İlk denemede doğru" value={firstTryCorrect} accent />
              <Stat label="Toplam yanlış" value={totalWrong} />
              <Stat label="Ortalama cevap" value={averageTime} />
            </div>
          </div>

          <div className="hardest-card">
            <div><p className="kicker">Tekrar listesi</p><h2>En çok zorlayan notalar</h2></div>
            {hardestNotes.length ? (
              <div className="hardest-list">
                {hardestNotes.map(({ note, count }) => (
                  <div key={note.id}><span className="note-pill">{note.name}</span><span>{note.shortLocation}</span><b>{count} yanlış</b></div>
                ))}
              </div>
            ) : (
              <p className="perfect-copy">Hiç yanlış yok. Bu oturum pürüzsüz geçti!</p>
            )}
          </div>

          <div className="result-actions">
            <button className="primary-button" type="button" onClick={startSession}>Aynı ayarlarla yeniden çalış <span>↻</span></button>
            <button className="secondary-button" type="button" onClick={() => setStage("setup")}>Seviyeyi değiştir</button>
          </div>
        </section>
      )}

      <footer><span>Nota Nota</span><p>Ezber değil, akıcılık.</p><span>𝄞</span></footer>
    </main>
  );
}
