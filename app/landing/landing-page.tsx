"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { goalProgress, lastSession, planNext, readGoal, writeGoal, DEFAULT_GOAL, DAILY_TARGETS, WEEKLY_TARGETS, GOAL_FOCI } from "@/lib/practice-plan.mjs";
import type { EvidenceRecord } from "@/lib/practice-evidence.mjs";
import { pageRoute } from "@/lib/site-routes.mjs";
import { ClefTraveler } from "./clef-traveler";
import { HeroQuiz } from "./hero-quiz";
import { GlowNotes } from "./glow-notes";
import { HeroScene } from "./hero-scene";
import { PdfCompare } from "./pdf-compare";
import { AiPreview } from "./ai-preview";
import { NoteHead, Staff } from "./music";
import "./landing.css";

type Locale = "tr" | "en";
type Goal = { focus: string; area: string; dailyQuestions: number; weeklyDays: number };
export type LandingStage = "setup" | "pieces" | "instruments" | "guitar" | "piano" | "violin" | "rhythm" | "listening" | "lessons" | "progress" | "practice" | "score-import" | "listen-play" | "teacher" | "pricing";
export type NextPlan = ReturnType<typeof planNext>;

const TEXT = {
  tr: {
    over: "Müziği çalışarak öğren.",
    title: ["Notaları tanı.", "Ritmi yakala.", "Müziğini geliştir."],
    lead: "Nota okuma, ritim ve eser çalışmasını kısa turlarla yap. Her cevabın ölçülür; sıradaki adımın buna göre seçilir.",
    start: "Çalışmaya başla",
    try: "30 saniyede dene",
    meta: (clef: string, level: string) => `İlk tur: ${clef} · ${level} · hesap açmadan başlayabilirsin`,
    studiosH: "Ne çalışmak istersin?",
    studiosLead: "Her alan hazır bir turla açılır. Ayrıntılı ayarlar stüdyonun içinde.",
    readingH: "Nota okuma",
    readingP: "Portedeki notayı adıyla tanı; hız ve doğruluk ölçülür.",
    readingGo: "Hemen başla",
    readingSet: "Ayarları seç",
    readingStaff: "Do’dan sol’e yükselen beş nota",
    studios: [
      { id: "rhythm", h: "Ritim", p: "Vuruşu tut, ritim kalıplarını dokunarak çal.", go: "Ritme başla", visual: "beat" },
      { id: "pieces", h: "Eser çalışma", p: "Bir parçayı ölçü ölçü, kendi hızında oku.", go: "Esere başla", visual: "score" },
      { id: "instruments", h: "Enstrüman ve kulak", p: "Notayı piyanoda, gitarda, kemanda bul; kulağını eğit.", go: "Enstrüman seç", visual: "keys" },
    ],
    lessons: ["Önce teoriyi mi görmek istersin?", "Kısa derslere git"],
    aiH: "Takıldığın yeri birlikte çalış",
    aiLead: "NotaNota AI, çalışmanda ölçülen hatalara bakıp nedenini açıklar ve sıradaki alıştırmayı önerir. Yanındaki konuşma bir örnektir.",
    aiMore: "NotaNota AI'ı dene",
    pathH: "Kaldığın yerden devam et",
    firstH: "İlk kez mi buradasın?",
    firstP: "Hiç nota bilmiyorsan porte ve anahtar dersi üç dakika sürer. Biliyorsan doğrudan bir tur çöz; NotaNota seviyeni ilk turdan ölçer.",
    firstLesson: "İlk derse git",
    lastLine: (answers: number, pct: number, sec: string | null, when: string) => `Son tur ${when}: ${answers} cevap, %${pct} doğru${sec ? `, ortalama ${sec} saniye` : ""}.`,
    doNext: "Önerilen çalışmayı başlat",
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
    ctaH: "Bir sonraki nota seni bekliyor",
    ctaP: "Kısa bir tur, ölçülen sonuç, sıradaki adım. Bugün buradan başla.",
    ctaStaff: "Sol anahtarlı portede dinlenen bir ezgi sonu",
  },
  en: {
    over: "Learn music by practising it.",
    title: ["Read the notes.", "Catch the rhythm.", "Grow your music."],
    lead: "Practise note reading, rhythm and pieces in short rounds. Every answer is measured; your next step follows from it.",
    start: "Start practising",
    try: "Try it in 30 seconds",
    meta: (clef: string, level: string) => `First round: ${clef} · ${level} · no account needed to start`,
    studiosH: "What would you like to practise?",
    studiosLead: "Each area opens with a ready round. Detailed settings live inside the studio.",
    readingH: "Note reading",
    readingP: "Name the note on the staff; speed and accuracy are measured.",
    readingGo: "Start now",
    readingSet: "Choose settings",
    readingStaff: "Five notes rising from C to G",
    studios: [
      { id: "rhythm", h: "Rhythm", p: "Hold the pulse and tap rhythm patterns.", go: "Start rhythm", visual: "beat" },
      { id: "pieces", h: "Pieces", p: "Read a piece bar by bar at your own pace.", go: "Start a piece", visual: "score" },
      { id: "instruments", h: "Instruments and ear", p: "Find notes on piano, guitar and violin; train your ear.", go: "Pick an instrument", visual: "keys" },
    ],
    lessons: ["Want the theory first?", "Go to the short lessons"],
    aiH: "Work on the spot where you get stuck",
    aiLead: "NotaNota AI looks at the mistakes measured in your practice, explains why and suggests the next exercise. The conversation beside it is a sample.",
    aiMore: "Try NotaNota AI",
    pathH: "Continue where you left off",
    firstH: "First time here?",
    firstP: "If you cannot read notes yet, the staff and clef lesson takes three minutes. If you can, go straight to a round; NotaNota measures your level from it.",
    firstLesson: "Open the first lesson",
    lastLine: (answers: number, pct: number, sec: string | null, when: string) => `Last round ${when}: ${answers} answers, ${pct}% correct${sec ? `, ${sec} s on average` : ""}.`,
    doNext: "Start the suggested practice",
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
    ctaH: "Your next note is waiting",
    ctaP: "A short round, a measured result, the next step. Start here today.",
    ctaStaff: "The end of a tune on a treble staff",
  },
} as const;

/**
 * The small pictures of the studio tiles, all on one 160 x 64 grid with their content centred on it,
 * drawn with the same engraved note heads as the staves, so the four tiles read as one family.
 */
function StudioVisual({ kind }: { kind: string }) {
  const sp = 7; // staff space of the pictures, in viewBox units
  if (kind === "beat") {
    // One percussion line: quarter, two beamed eighths, quarter, quarter; the pulse under it, first beat lit.
    const line = 30, xs = [26, 56, 76, 106, 134];
    return (
      <svg className="studio-visual" viewBox="0 0 160 64" aria-hidden="true" focusable="false">
        <line x1="8" x2="152" y1={line} y2={line} className="sv-line" />
        {xs.map((x, i) => <NoteHead key={x} x={x} y={line} space={sp} className={i === 0 ? "sv-accent" : "sv-ink"} />)}
        {xs.map((x, i) => <line key={`s${x}`} x1={x + 3.9} x2={x + 3.9} y1={line} y2={line - 22} className={i === 0 ? "sv-stem sv-stem--accent" : "sv-stem"} />)}
        <path d={`M${xs[1] + 3.2} ${line - 22}H${xs[2] + 4.6}v3.4H${xs[1] + 3.2}Z`} className="sv-ink" />
        {[26, 61, 106, 134].map((x, i) => <circle key={x} cx={x} cy={52} r={i === 0 ? 4 : 2.6} className={i === 0 ? "sv-accent" : "sv-dot"} />)}
      </svg>
    );
  }
  if (kind === "score") {
    // Two bars of a melody on a full staff, the bar being practised marked by the same accent.
    const top = 14, y = (step: number) => top + 4 * sp - step * (sp / 2);
    const notes: [number, number][] = [[24, 2], [40, 3], [56, 4], [72, 3], [96, 2], [112, 1], [128, 0], [144, 1]];
    return (
      <svg className="studio-visual" viewBox="0 0 160 64" aria-hidden="true" focusable="false">
        <rect x="84" y={top - 6} width="70" height={4 * sp + 12} rx="8" className="sv-well" />
        {[0, 1, 2, 3, 4].map((k) => <line key={k} x1="8" x2="152" y1={top + k * sp} y2={top + k * sp} className="sv-line" />)}
        <line x1="84" x2="84" y1={top} y2={top + 4 * sp} className="sv-line" />
        <line x1="152" x2="152" y1={top} y2={top + 4 * sp} className="sv-line sv-line--bar" />
        {notes.map(([x, step], i) => (
          <g key={x} className={i >= 4 ? "sv-accent" : "sv-ink"}>
            <NoteHead x={x} y={y(step)} space={sp} />
            <line x1={x + 3.9} x2={x + 3.9} y1={y(step)} y2={y(step) - 20} className="sv-stem" />
          </g>
        ))}
      </svg>
    );
  }
  // One octave of a keyboard, the key being found lit, with the same note above it on a single line.
  const white = 18, left = 17;
  return (
    <svg className="studio-visual" viewBox="0 0 160 64" aria-hidden="true" focusable="false">
      {Array.from({ length: 7 }, (_, i) => <rect key={i} x={left + i * white + .5} y="8" width={white - 1} height="50" rx="3" className={i === 4 ? "sv-accent" : "sv-key"} />)}
      {[0, 1, 3, 4, 5].map((i) => <rect key={`b${i}`} x={left + (i + 1) * white - 5.5} y="8" width="11" height="30" rx="2" className="sv-ink" />)}
    </svg>
  );
}

export function LandingPage({ locale, evidence, soundEnabled, onNavigate, onQuickStart, onStartPlan, onPractiseXml }: {
  locale: Locale;
  evidence: EvidenceRecord[];
  soundEnabled: boolean;
  onNavigate: (stage: LandingStage) => void;
  onQuickStart: () => void;
  onStartPlan: (plan: NextPlan) => void;
  onPractiseXml: (xml: string) => void;
}) {
  const t = TEXT[locale];
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Goal>(DEFAULT_GOAL as Goal);

  useEffect(() => {
    const timer = window.setTimeout(() => { const saved = readGoal() as Goal | null; setGoal(saved); if (saved) setDraft(saved); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const last = useMemo(() => lastSession(evidence), [evidence]);
  const plan = useMemo(() => planNext(evidence, goal, locale), [evidence, goal, locale]);
  const progress = useMemo(() => goalProgress(evidence, goal), [evidence, goal]);
  const lastWhen = last ? t.when(new Date(last.at)) : "";

  function tryNow() {
    const quiz = root.current?.querySelector<HTMLElement>(".hero-quiz");
    quiz?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    quiz?.querySelector<HTMLButtonElement>(".hero-key")?.focus({ preventScroll: true });
  }

  return (
    <div className="lp" ref={root} data-locale={locale}>
      <ClefTraveler root={root} />

      <section className="lp-hero" aria-labelledby="lp-title" ref={hero}>
        <HeroScene hero={hero} />
        <div className="lp-hero-copy">
          <p className="lp-over">{t.over}</p>
          <h1 id="lp-title">{t.title.map((line) => <span key={line}>{line}</span>)}</h1>
          <p className="lp-lead">{t.lead}</p>
          <div className="lp-actions">
            <button type="button" className="primary-button lp-start" onClick={onQuickStart}>{t.start}</button>
            <button type="button" className="secondary-button" onClick={tryNow}>{t.try}</button>
          </div>
        </div>
        <HeroQuiz locale={locale} soundEnabled={soundEnabled} onOpenStudio={() => onNavigate("setup")} />
        <GlowNotes locale={locale} onStudio={() => onNavigate("setup")} />
      </section>

      <section className="lp-section lp-studios" aria-labelledby="lp-studios-h">
        <div className="lp-section-head">
          <h2 id="lp-studios-h">{t.studiosH}</h2>
          <p>{t.studiosLead}</p>
        </div>
        <ul className="lp-tiles">
          <li className="lp-tile lp-tile--reading" data-clef-host="">
            <div className="lp-tile-visual">
              <Staff space={9} width={300} anchor="reading" anchorOrder={1} label={t.readingStaff}
                notes={[-2, 0, 2, 4].map((position, i) => ({ id: `r${position}`, position, x: 0.12 + i * 0.25, tone: i === 2 ? "focus" : "idle" }))} />
            </div>
            <h3>{t.readingH}</h3>
            <p>{t.readingP}</p>
            <button type="button" className="lp-tile-action" onClick={onQuickStart}>{t.readingGo}<span aria-hidden="true"> →</span></button>
          </li>
          {t.studios.map((studio) => (
            <li key={studio.id} className="lp-tile">
              <div className="lp-tile-visual"><StudioVisual kind={studio.visual} /></div>
              <h3>{studio.h}</h3>
              <p>{studio.p}</p>
              <button type="button" className="lp-tile-action" onClick={() => onNavigate(studio.id as LandingStage)}>{studio.go}<span aria-hidden="true"> →</span></button>
            </li>
          ))}
        </ul>
        <a href={pageRoute("lessons", locale)} className="lp-textlink" onClick={(event) => { event.preventDefault(); onNavigate("lessons"); }}>
          <span>{t.lessons[0]}</span> <b>{t.lessons[1]}<span aria-hidden="true"> →</span></b>
        </a>
      </section>

      <PdfCompare locale={locale} onPractise={onPractiseXml} />

      <section className="lp-section lp-ai" aria-labelledby="lp-ai-h">
        <div className="lp-section-head">
          <h2 id="lp-ai-h">{t.aiH}</h2>
          <p>{t.aiLead}</p>
          <button type="button" className="primary-button lp-ai-try" onClick={() => onNavigate("pricing")}>{t.aiMore}</button>
        </div>
        <AiPreview locale={locale} />
      </section>

      <section className="lp-section lp-path" aria-labelledby="lp-path-h">
        <div className="lp-continue">
          <h2 id="lp-path-h">{last ? t.pathH : t.firstH}</h2>
          {last
            ? <p>{t.lastLine(last.answers, Math.round(last.accuracy * 100), last.averageMs ? (last.averageMs / 1000).toFixed(1).replace(".", locale === "tr" ? "," : ".") : null, lastWhen)}</p>
            : <p>{t.firstP}</p>}
          <div className="lp-next">
            <h3>{plan.title}</h3>
            <p>{plan.reason}</p>
            <div className="lp-actions">
              <button type="button" className="primary-button" onClick={() => onStartPlan(plan)}>{t.doNext}</button>
              {!last && <button type="button" className="ghost-button" onClick={() => onNavigate("lessons")}>{t.firstLesson}</button>}
            </div>
          </div>
        </div>
        <div className="lp-goal">
          <h3>{t.goalH}</h3>
          <p className="lp-goal-name">{t.foci[(goal ?? DEFAULT_GOAL).focus]}</p>
          <div className="lp-bar">
            <span>{t.today(progress.answeredToday, progress.dailyTarget)}</span>
            <b role="progressbar" aria-valuemin={0} aria-valuemax={progress.dailyTarget} aria-valuenow={Math.min(progress.answeredToday, progress.dailyTarget)} aria-label={t.today(progress.answeredToday, progress.dailyTarget)}><i style={{ width: `${Math.min(100, progress.answeredToday / progress.dailyTarget * 100)}%` }} /></b>
          </div>
          <div className="lp-bar">
            <span>{t.week(progress.activeDays, progress.weeklyTarget)}</span>
            <b role="progressbar" aria-valuemin={0} aria-valuemax={progress.weeklyTarget} aria-valuenow={Math.min(progress.activeDays, progress.weeklyTarget)} aria-label={t.week(progress.activeDays, progress.weeklyTarget)}><i style={{ width: `${Math.min(100, progress.activeDays / progress.weeklyTarget * 100)}%` }} /></b>
          </div>
          <div className="lp-links">
            <button type="button" className="ghost-button" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>{t.editGoal}</button>
            <button type="button" className="ghost-button" onClick={() => onNavigate("progress")}>{t.progressLink}</button>
          </div>
          {editing && (
            <form className="lp-goal-form" onSubmit={(event) => { event.preventDefault(); setGoal(writeGoal(draft) as Goal); setEditing(false); }}>
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
              <button type="submit" className="primary-button">{t.saveGoal}</button>
            </form>
          )}
          <p className="lp-small">{t.goalNote}</p>
        </div>
      </section>

      <section className="lp-cta" aria-labelledby="lp-cta-h">
        <Staff space={10} width={360} anchor="cta" anchorOrder={4} finalBar label={t.ctaStaff}
          notes={[{ id: "c1", position: 2, x: 0.15 }, { id: "c2", position: 1, x: 0.4 }, { id: "c3", position: -1, x: 0.62 }, { id: "c4", position: -2, x: 0.86, beats: 2 }]} />
        <div>
          <h2 id="lp-cta-h">{t.ctaH}</h2>
          <p>{t.ctaP}</p>
          <button type="button" className="primary-button lp-start" onClick={onQuickStart}>{t.start}</button>
        </div>
      </section>
    </div>
  );
}
