"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { goalProgress, lastSession, planNext, readGoal, writeGoal, DEFAULT_GOAL, DAILY_TARGETS, WEEKLY_TARGETS, GOAL_FOCI } from "@/lib/practice-plan.mjs";
import type { EvidenceRecord } from "@/lib/practice-evidence.mjs";
import { playPracticeNote } from "@/lib/practice-audio";
import { NoteHead, stemX } from "./landing/music";
import "./home-hub.css";

type Locale = "tr" | "en";
type Goal = { focus: string; area: string; dailyQuestions: number; weeklyDays: number };
export type HomeStage = "setup" | "pieces" | "instruments" | "guitar" | "piano" | "violin" | "rhythm" | "listening" | "lessons" | "progress" | "practice" | "score-import" | "listen-play";
export type NextPlan = ReturnType<typeof planNext>;

const NAMES = { tr: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"], en: ["C", "D", "E", "F", "G", "A", "B"] } as const;
const SEMI = [0, 2, 4, 5, 7, 9, 11];

const TEXT = {
  tr: {
    lead: "Nota okumayı porte, piyano ve gitarda kısa çalışmalarla öğren. Cevapların ölçülür, sonraki adım ölçüme göre seçilir.",
    start: "Nota çalışmaya başla",
    setup: "Ayarları seç",
    settings: (clef: string, level: string) => `${clef}, ${level}`,
    warmQ: "Ortadaki nota hangisi?",
    warmIdle: "Isınma turu. Bu beş cevap kaydedilmez.",
    warmRight: (n: string) => `Doğru, ${n}.`,
    warmWrong: (n: string) => `Bu ${n}.`,
    warmDone: (k: string) => `Beş notanın ${k} bildin. Gerçek tur on nota sorar ve sonucu kaydeder.`,
    warmAgain: "Bir tur daha",
    words: ["hiçbirini", "birini", "ikisini", "üçünü", "dördünü", "hepsini"],
    continueH: "Kaldığın yerden devam et",
    firstH: "İlk kez mi buradasın?",
    firstP: "Hiç nota bilmiyorsan porte ve anahtar dersi üç dakika sürer. Biliyorsan doğrudan bir tur çöz; NotaNota seviyeni ilk turdan ölçer.",
    firstLesson: "İlk derse git",
    lastLine: (answers: number, pct: number, sec: string | null, when: string) => `Son tur ${when}: ${answers} cevap, %${pct} doğru${sec ? `, ortalama ${sec} saniye` : ""}.`,
    doNext: "Önerilen çalışmayı başlat",
    areasH: "Ne çalışmak istiyorsun?",
    goalH: "Hedefin",
    today: (a: number, t: number) => `Bugün ${a} / ${t} cevap`,
    week: (a: number, t: number) => `Bu hafta ${a} / ${t} gün`,
    editGoal: "Hedefi değiştir",
    saveGoal: "Hedefi kaydet",
    focusL: "Amacın", dailyL: "Günlük cevap", weeklyL: "Haftada gün",
    foci: { reading: "Nota okumayı öğrenmek", theory: "Müzik teorisi", instrument: "Bir enstrüman öğrenmek", pieces: "Eser çalışmak", habit: "Düzenli pratik" } as Record<string, string>,
    progressLink: "Beceri haritası ve geçmiş",
    goalNote: "Hedefin bu cihazda saklanır. Seri ve sıralama hesabınla tutulur.",
    when: (d: Date) => { const days = Math.floor((Date.now() - d.getTime()) / 86400000); return days <= 0 ? "bugün" : days === 1 ? "dün" : `${days} gün önce`; },
    clefs: { treble: "Sol anahtarı", bass: "Fa anahtarı" } as Record<string, string>,
    areas: [
      { id: "read", title: "Nota çalış", body: "Sol ve fa anahtarı, dört aralık, diyez ve bemoller. Cevabı adıyla ya da portedeki yeriyle ver.", links: [["quick", "Hemen başla"], ["setup", "Porte okuma ayarları"]] },
      { id: "pieces", title: "Eser çalış", body: "Porte satırlarını kendi hızında ya da 15–112 BPM ile oku. Kendi MusicXML dosyanı açıp ölçü ölçü çalış.", links: [["pieces", "Eser okuma"], ["score-import", "MusicXML aç"]] },
      { id: "inst", title: "Enstrümanla çalış", body: "Notayı piyano tuşunda, gitar perdesinde, keman telinde bul. Mikrofonla tek ses çal, NotaNota duyduğu perdeyi beklenen notayla karşılaştırsın.", links: [["piano", "Piyano"], ["guitar", "Gitar"], ["violin", "Keman"], ["listen-play", "Mikrofonla çal"], ["instruments", "Müzik aletleri"]] },
      { id: "theory", title: "Müzik teorisi öğren", body: "Önkoşullu kısa dersler, bilgi kontrolü ve aralıklı tekrar.", links: [["lessons", "Derslere git"]] },
      { id: "ear", title: "Kulak ve ritim", body: "Eşit vuruş, suslu ritimler, aralık ve akor ayırt etme, kısa melodik dikte.", links: [["rhythm", "Ritim atölyesi"], ["listening", "İşitme atölyesi"]] },
    ],
  },
  en: {
    lead: "Learn to read music on the staff, piano and guitar in short sessions. Your answers are measured and the next step follows from them.",
    start: "Start note practice",
    setup: "Choose settings",
    settings: (clef: string, level: string) => `${clef}, ${level}`,
    warmQ: "Which note is in the middle?",
    warmIdle: "Warm-up round. These five answers are not saved.",
    warmRight: (n: string) => `Right, ${n}.`,
    warmWrong: (n: string) => `That is ${n}.`,
    warmDone: (k: string) => `You named ${k} of five notes. A real round asks ten notes and saves the result.`,
    warmAgain: "Another round",
    words: ["none", "one", "two", "three", "four", "all"],
    continueH: "Continue where you left off",
    firstH: "First time here?",
    firstP: "If you cannot read notes yet, the staff and clef lesson takes three minutes. If you can, go straight to a round; NotaNota measures your level from it.",
    firstLesson: "Open the first lesson",
    lastLine: (answers: number, pct: number, sec: string | null, when: string) => `Last round ${when}: ${answers} answers, ${pct}% correct${sec ? `, ${sec} s on average` : ""}.`,
    doNext: "Start the suggested practice",
    areasH: "What do you want to practise?",
    goalH: "Your goal",
    today: (a: number, t: number) => `Today ${a} / ${t} answers`,
    week: (a: number, t: number) => `This week ${a} / ${t} days`,
    editGoal: "Change goal",
    saveGoal: "Save goal",
    focusL: "Aim", dailyL: "Answers a day", weeklyL: "Days a week",
    foci: { reading: "Learn to read music", theory: "Music theory", instrument: "Learn an instrument", pieces: "Practise pieces", habit: "Regular practice" } as Record<string, string>,
    progressLink: "Skill map and history",
    goalNote: "Your goal stays on this device. Streak and ranking stay with your account.",
    when: (d: Date) => { const days = Math.floor((Date.now() - d.getTime()) / 86400000); return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`; },
    clefs: { treble: "Treble clef", bass: "Bass clef" } as Record<string, string>,
    areas: [
      { id: "read", title: "Practise notes", body: "Treble and bass clef, four ranges, sharps and flats. Answer with the name or the place on the staff.", links: [["quick", "Start now"], ["setup", "Staff reading settings"]] },
      { id: "pieces", title: "Practise pieces", body: "Read staff lines at your own pace or with a pulse from 15–112 BPM. Open your own MusicXML file and work bar by bar.", links: [["pieces", "Score reading"], ["score-import", "Open MusicXML"]] },
      { id: "inst", title: "Practise with an instrument", body: "Find the note on piano keys, guitar frets and violin strings. Play single notes into the microphone and NotaNota compares the pitch it hears with the note expected.", links: [["piano", "Piano"], ["guitar", "Guitar"], ["violin", "Violin"], ["listen-play", "Play to the microphone"], ["instruments", "Instruments"]] },
      { id: "theory", title: "Learn music theory", body: "Short lessons with prerequisites, knowledge checks and spaced review.", links: [["lessons", "Open lessons"]] },
      { id: "ear", title: "Ear and rhythm", body: "Steady pulse, rhythms with rests, intervals and chords by ear, short melodic dictation.", links: [["rhythm", "Rhythm workshop"], ["listening", "Listening workshop"]] },
    ],
  },
} as const;

function yOf(step: number) { return 70 - (step - 2) * 5; }

/** The name of the product is the first exercise: a live staff between two words. */
function LiveStaff({ step, state, label }: { step: number; state: "idle" | "ok" | "no"; label: string | null }) {
  const box = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      if (rect.height > 0) setWidth(Math.max(160, Math.round(100 * rect.width / rect.height)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const x = Math.round(width * 0.56);
  const y = yOf(step);
  const ink = state === "ok" ? "var(--primary)" : state === "no" ? "var(--danger)" : "var(--foreground)";
  const up = step < 6;
  const ledgers: number[] = [];
  for (let k = 0; k >= step; k -= 2) ledgers.push(yOf(k));
  for (let k = 12; k <= step; k += 2) ledgers.push(yOf(k));
  return (
    <span className="hub-strip" ref={box}>
      <svg viewBox={`0 0 ${width} 100`} aria-hidden="true" focusable="false">
        <g stroke="var(--foreground)" strokeWidth="1.3">
          {[30, 40, 50, 60, 70].map((line) => <line key={line} x1="0" x2={width} y1={line} y2={line} />)}
          {ledgers.map((ly) => <line key={ly} x1={x - 11} x2={x + 11} y1={ly} y2={ly} />)}
        </g>
        <text className="hub-clef" x="8" y="66" fontSize="56">𝄞</text>
        <g key={step} className="hub-note">
          <line x1={stemX(x, up, 10, 1.6)} x2={stemX(x, up, 10, 1.6)} y1={up ? y - 1.5 : y + 1.5} y2={up ? y - 34 : y + 34} stroke={ink} strokeWidth="1.6" />
          <g style={{ color: ink }}><NoteHead x={x} y={y} space={10} /></g>
          {label && <text x={x + 14} y={y + 4.5} className="hub-note-label">{label}</text>}
        </g>
      </svg>
    </span>
  );
}

export function HomeHub({ locale, evidence, settingsLabel, clefLabelKey, soundEnabled, onNavigate, onQuickStart, onStartPlan }: {
  locale: Locale;
  evidence: EvidenceRecord[];
  settingsLabel: string;
  clefLabelKey: "treble" | "bass";
  soundEnabled: boolean;
  onNavigate: (stage: HomeStage) => void;
  onQuickStart: () => void;
  onStartPlan: (plan: NextPlan) => void;
}) {
  const t = TEXT[locale];
  const names = NAMES[locale];
  const [step, setStep] = useState(4);
  const [asked, setAsked] = useState(0);
  const [right, setRight] = useState(0);
  const [mark, setMark] = useState<"idle" | "ok" | "no">("idle");
  const [status, setStatus] = useState<string>(t.warmIdle);
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Goal>(DEFAULT_GOAL as Goal);

  useEffect(() => {
    const timer = window.setTimeout(() => { const saved = readGoal() as Goal | null; setGoal(saved); if (saved) setDraft(saved); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => setStatus(TEXT[locale].warmIdle), 0); return () => window.clearTimeout(timer); }, [locale]);

  const last = useMemo(() => lastSession(evidence), [evidence]);
  const plan = useMemo(() => planNext(evidence, goal, locale), [evidence, goal, locale]);
  const progress = useMemo(() => goalProgress(evidence, goal), [evidence, goal]);

  function answer(index: number) {
    if (busy) return;
    if (asked >= 5) { setAsked(0); setRight(0); setStatus(t.warmIdle); return; }
    const correct = ((step % 7) + 7) % 7;
    const ok = index === correct;
    const nextAsked = asked + 1, nextRight = right + (ok ? 1 : 0);
    setAsked(nextAsked); setRight(nextRight); setMark(ok ? "ok" : "no"); setBusy(true);
    playPracticeNote(60 + 12 * Math.floor(step / 7) + SEMI[correct], soundEnabled);
    setStatus(ok ? t.warmRight(names[correct]) : t.warmWrong(names[correct]));
    window.setTimeout(() => {
      setMark("idle");
      setStep((current) => { let next = current; while (next === current) next = 2 + Math.floor(Math.random() * 9); return next; });
      if (nextAsked >= 5) setStatus(t.warmDone(t.words[nextRight]));
      setBusy(false);
    }, ok ? 600 : 1100);
  }

  function saveGoal() {
    const saved = writeGoal(draft) as Goal;
    setGoal(saved);
    setEditing(false);
  }

  function go(id: string) {
    if (id === "quick") onQuickStart();
    else onNavigate(id as HomeStage);
  }

  const lastWhen = last ? t.when(new Date(last.at)) : "";
  const correctIndex = ((step % 7) + 7) % 7;

  return (
    <div className="hub" data-locale={locale}>
      <section className="hub-hero" aria-labelledby="hub-title">
        <h1 id="hub-title" className="hub-mark" aria-label="NotaNota">
          <span className="hub-line" aria-hidden="true">
            <span>NOTA</span>
            <LiveStaff step={step} state={mark} label={mark === "no" ? names[correctIndex] : null} />
            <span>NOTA</span>
          </span>
        </h1>
        <div className="hub-hero-foot">
          <div className="hub-say">
            <p>{t.lead}</p>
            <div className="hub-actions">
              <button type="button" className="hub-btn" onClick={onQuickStart}>{t.start}</button>
              <button type="button" className="hub-link" onClick={() => onNavigate("setup")}>{t.setup}</button>
            </div>
            <p className="hub-meta">{t.settings(t.clefs[clefLabelKey], settingsLabel)}</p>
          </div>
          <div className="hub-warm" role="group" aria-labelledby="hub-warm-q">
            <p id="hub-warm-q" className="hub-warm-q">{t.warmQ}</p>
            <div className="hub-keys">
              {names.map((name, index) => (
                <button key={name} type="button" className={`hub-key${busy && index === correctIndex ? (mark === "ok" ? " is-ok" : "") : ""}`} onClick={() => answer(index)}>{name}</button>
              ))}
            </div>
            <p className="hub-warm-status" aria-live="polite">
              {status}{" "}
              {asked >= 5 && <button type="button" className="hub-inline" onClick={() => { setAsked(0); setRight(0); setStatus(t.warmIdle); }}>{t.warmAgain}</button>}
            </p>
          </div>
        </div>
      </section>

      <section className="hub-continue" aria-labelledby="hub-continue-h">
        <div className="hub-continue-text">
          <h2 id="hub-continue-h">{last ? t.continueH : t.firstH}</h2>
          {last
            ? <p>{t.lastLine(last.answers, Math.round(last.accuracy * 100), last.averageMs ? (last.averageMs / 1000).toFixed(1).replace(".", locale === "tr" ? "," : ".") : null, lastWhen)}</p>
            : <p>{t.firstP}</p>}
        </div>
        <div className="hub-next">
          <h3>{plan.title}</h3>
          <p>{plan.reason}</p>
          <div className="hub-actions">
            <button type="button" className="hub-btn" onClick={() => onStartPlan(plan)}>{t.doNext}</button>
            {!last && <button type="button" className="hub-link" onClick={() => onNavigate("lessons")}>{t.firstLesson}</button>}
          </div>
        </div>
      </section>

      <section className="hub-areas" aria-labelledby="hub-areas-h">
        <h2 id="hub-areas-h">{t.areasH}</h2>
        <ul>
          {t.areas.map((area) => (
            <li key={area.id}>
              <h3>{area.title}</h3>
              <p>{area.body}</p>
              <div className="hub-area-links">
                {area.links.map(([id, label], index) => (
                  <button key={id} type="button" className={index === 0 ? "hub-chip is-first" : "hub-chip"} onClick={() => go(id)}>{label}</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="hub-goal" aria-labelledby="hub-goal-h">
        <div>
          <h2 id="hub-goal-h">{t.goalH}</h2>
          <p className="hub-goal-name">{t.foci[(goal ?? DEFAULT_GOAL).focus]}</p>
          <p className="hub-meta">{t.goalNote}</p>
        </div>
        <div className="hub-goal-bars">
          <div className="hub-bar">
            <span>{t.today(progress.answeredToday, progress.dailyTarget)}</span>
            <b role="progressbar" aria-valuemin={0} aria-valuemax={progress.dailyTarget} aria-valuenow={Math.min(progress.answeredToday, progress.dailyTarget)} aria-label={t.today(progress.answeredToday, progress.dailyTarget)}><i style={{ width: `${Math.min(100, progress.answeredToday / progress.dailyTarget * 100)}%` }} /></b>
          </div>
          <div className="hub-bar">
            <span>{t.week(progress.activeDays, progress.weeklyTarget)}</span>
            <b role="progressbar" aria-valuemin={0} aria-valuemax={progress.weeklyTarget} aria-valuenow={Math.min(progress.activeDays, progress.weeklyTarget)} aria-label={t.week(progress.activeDays, progress.weeklyTarget)}><i style={{ width: `${Math.min(100, progress.activeDays / progress.weeklyTarget * 100)}%` }} /></b>
          </div>
          <div className="hub-actions">
            <button type="button" className="hub-link" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>{t.editGoal}</button>
            <button type="button" className="hub-link" onClick={() => onNavigate("progress")}>{t.progressLink}</button>
          </div>
          {editing && (
            <form className="hub-goal-form" onSubmit={(event) => { event.preventDefault(); saveGoal(); }}>
              <label>{t.focusL}
                <select value={draft.focus} onChange={(event) => { const focus = event.target.value; setDraft((d) => ({ ...d, focus, area: focus === "theory" ? "lessons" : focus === "pieces" ? "pieces" : focus === "instrument" ? (d.area === "piano" || d.area === "violin" ? d.area : "guitar") : "reading" })); }}>
                  {GOAL_FOCI.map((id: string) => <option key={id} value={id}>{t.foci[id]}</option>)}
                </select>
              </label>
              {draft.focus === "instrument" && (
                <label>{locale === "tr" ? "Enstrüman" : "Instrument"}
                  <select value={draft.area} onChange={(event) => setDraft((d) => ({ ...d, area: event.target.value }))}>
                    <option value="piano">{locale === "tr" ? "Piyano" : "Piano"}</option>
                    <option value="guitar">{locale === "tr" ? "Gitar" : "Guitar"}</option>
                    <option value="violin">{locale === "tr" ? "Keman" : "Violin"}</option>
                  </select>
                </label>
              )}
              <label>{t.dailyL}
                <select value={draft.dailyQuestions} onChange={(event) => setDraft((d) => ({ ...d, dailyQuestions: Number(event.target.value) }))}>
                  {DAILY_TARGETS.map((n: number) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label>{t.weeklyL}
                <select value={draft.weeklyDays} onChange={(event) => setDraft((d) => ({ ...d, weeklyDays: Number(event.target.value) }))}>
                  {WEEKLY_TARGETS.map((n: number) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button type="submit" className="hub-btn">{t.saveGoal}</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
