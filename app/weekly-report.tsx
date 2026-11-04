"use client";

import { useEffect, useMemo, useState } from "react";
import { buildWeeklyReportRequest, metricsHash, requestWeeklyReport } from "@/lib/ai-client.mjs";
import type { EvidenceRecord } from "@/lib/practice-evidence.mjs";
import { learningProfileEnabled, loadProfile, localTimezone } from "@/lib/learning-profile";
import { supabase } from "@/lib/supabase";
import { AI_LIMIT_REASONS } from "@/lib/ai-limits";
import { liveTeacherConfigured, teacherApiKey, teacherEndpoint } from "./ai-teacher";
import { ChatSuggestion } from "./chat-ui";
import type { TeacherSuggestion } from "./landing/chat-widget";
import "./weekly-report.css";

type Locale = "tr" | "en";
type Week = { sessions: number; practiceDays: number; answers: { correct: number; wrong: number }; noteStruggles: { note: string; attempts: number; errors: number }[];
  responseTimeMs: { median: number; sampleSize: number } | null; rhythmTiming: { meanAbsOffsetMs: number; sampleSize: number } | null; dataQuality: "none" | "thin" | "ok" };
type Metrics = Week & { pieces: { title: string; from: number; to: number }[]; previous: Week | null };
type Narrative = { headline: string; narrative: string; highlights: string[]; nextWeek: TeacherSuggestion[] };

const T = {
  tr: {
    title: "Bu hafta", period: (a: string, b: string, z: string) => `${a} – ${b} · ${z} saatine göre`,
    sessions: "Oturum", days: "Çalışma günü", correct: "Doğru", wrong: "Yanlış", speed: "Cevap süresi (ortanca)", rhythm: "Ritim sapması (ortalama)",
    notMeasured: "Ölçülmedi", samples: (n: number) => `${n} ölçüm`, previous: "Önceki 7 gün", noPrevious: "Önceki hafta için kayıt yok.",
    struggles: "Zorlandığın notalar", none: "Bu hafta henüz çalışma yok.", thin: "Bu hafta veri az; sonuçlar kesin değil.",
    speedNote: "Cevap süresi nota okuma hızını gösterir; ritim doğruluğu değildir.", ai: "AI açıklaması", ask: "Meta AI bu haftayı yorumlasın",
    askNote: "Yalnız yukarıdaki sayılar gönderilir. Aynı hafta ve aynı sayılar için açıklama bir kez üretilir ve hesabında saklanır.",
    waiting: "Meta yanıtı bekleniyor…", failed: "Açıklama alınamadı.", next: "Gelecek hafta için", local: "Sayılar bu cihazdaki çalışma kayıtlarından hesaplandı.",
    signIn: "AI açıklaması için giriş yap.", suggestion: "Önerilen çalışma", start: "Başlat", open: "Aç",
  },
  en: {
    title: "This week", period: (a: string, b: string, z: string) => `${a} – ${b} · ${z} time`,
    sessions: "Sessions", days: "Practice days", correct: "Correct", wrong: "Wrong", speed: "Answer time (median)", rhythm: "Rhythm offset (mean)",
    notMeasured: "Not measured", samples: (n: number) => `${n} measurements`, previous: "Previous 7 days", noPrevious: "No record for the week before.",
    struggles: "Notes you found hard", none: "No practice yet this week.", thin: "Little data this week; the numbers are not conclusive.",
    speedNote: "Answer time shows reading speed; it is not rhythm accuracy.", ai: "AI explanation", ask: "Let Meta AI explain this week",
    askNote: "Only the numbers above are sent. For the same week and numbers the explanation is made once and kept in your account.",
    waiting: "Waiting for Meta…", failed: "No explanation came back.", next: "For next week", local: "The numbers come from the practice records on this device.",
    signIn: "Sign in for an AI explanation.", suggestion: "Suggested practice", start: "Start", open: "Open",
  },
} as const;

const NAMES = { tr: { c: "Do", d: "Re", e: "Mi", f: "Fa", g: "Sol", a: "La", b: "Si" }, en: { c: "C", d: "D", e: "E", f: "F", g: "G", a: "A", b: "B" } } as const;
/** "treble:g4" → "Sol4 (sol anahtarı)", "bass:f3#" → "Fa♯3 (fa anahtarı)". */
function noteLabel(note: string, locale: Locale) {
  const [clef, pitch = ""] = note.split(":");
  const match = /^([a-g])(-?\d+)([#b]?)$/.exec(pitch);
  if (!match) return note;
  const name = NAMES[locale][match[1] as keyof (typeof NAMES)["tr"]] + (match[3] === "#" ? "♯" : match[3] === "b" ? "♭" : "") + match[2];
  const key = clef === "bass" ? (locale === "tr" ? "fa anahtarı" : "bass clef") : clef === "treble" ? (locale === "tr" ? "sol anahtarı" : "treble clef") : clef;
  return `${name} (${key})`;
}

const fmtMs = (ms: number, locale: Locale) => `${(ms / 1000).toFixed(1).replace(".", locale === "tr" ? "," : ".")} ${locale === "tr" ? "sn" : "s"}`;

/**
 * The weekly report: the app computes every number from real practice records (missing measurements
 * stay "not measured", never 0); Meta only writes the explanation and next week's plan, once per period
 * and set of numbers, stored with the account.
 */
export function WeeklyReport({ locale, evidence, onSuggestion }: { locale: Locale; evidence: EvidenceRecord[]; onSuggestion: (suggestion: TeacherSuggestion) => void }) {
  const t = T[locale];
  const [timezone, setTimezone] = useState(() => localTimezone() ?? "UTC");
  const [signedIn, setSignedIn] = useState(false);
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "error">("idle");
  const [reason, setReason] = useState<string | null>(null);
  const request = useMemo(() => buildWeeklyReportRequest(evidence, { timezone, locale }), [evidence, timezone, locale]);
  const metrics = request.metrics as Metrics;
  const live = liveTeacherConfigured && learningProfileEnabled && signedIn;

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSignedIn(Boolean(data.session)); }, () => undefined);
    loadProfile().then((profile) => { if (alive && profile?.timezone) setTimezone(profile.timezone); }, () => undefined);
    return () => { alive = false; };
  }, []);
  // A report already made for this week and these numbers is read back, never paid for again.
  useEffect(() => {
    if (!live || !supabase || metrics.dataQuality === "none") return;
    let alive = true;
    (async () => {
      const hash = await metricsHash(metrics);
      const { data } = await supabase!.from("weekly_reports").select("narrative").eq("period_start", request.period.start).eq("metrics_hash", hash).maybeSingle();
      if (alive && data?.narrative) setNarrative(data.narrative as Narrative);
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [live, request, metrics]);

  async function ask() {
    setState("waiting"); setReason(null);
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    const value = await requestWeeklyReport({ endpoint: teacherEndpoint, accessToken: data.session?.access_token ?? null, apiKey: teacherApiKey, request });
    if (!value.ok || value.mode !== "live") { setReason(value.reason ?? "invalid_response"); setState("error"); return; }
    const result = value.result as Narrative;
    setNarrative(result); setState("idle");
    await supabase?.from("weekly_reports").insert({ period_start: value.period.start, period_end: value.period.end, timezone: value.timezone,
      metrics: value.metrics, metrics_hash: value.metricsHash, narrative: result, model_id: value.provenance?.modelId ?? "unknown" });
  }

  const week = metrics;
  const prev = metrics.previous;
  // The comparison line appears only when there is a previous week to compare with.
  const stat = (label: string, value: string, before?: string | null) => (
    <div><dt>{label}</dt><dd>{value}</dd>{before !== undefined && before !== null && <small>{`${t.previous}: ${before}`}</small>}</div>
  );
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  // Measurements that were not taken are named in one line, never shown as a zero.
  const missing = [!week.responseTimeMs && t.speed, !week.rhythmTiming && t.rhythm].filter(Boolean).join(locale === "tr" ? " ve " : " and ");
  return (
    <section className="weekly" aria-labelledby="weekly-title">
      <div className="weekly-head">
        <h2 id="weekly-title">{t.title}</h2>
        <p>{t.period(day(request.period.start), day(request.period.end), timezone)}</p>
      </div>
      {week.dataQuality === "none" ? <p className="weekly-note">{t.none}</p> : <>
        {week.dataQuality === "thin" && <p className="weekly-note weekly-note--thin">{t.thin}</p>}
        <dl className="weekly-stats">
          {stat(t.sessions, String(week.sessions), prev ? String(prev.sessions) : null)}
          {stat(t.days, String(week.practiceDays), prev ? String(prev.practiceDays) : null)}
          {stat(locale === "tr" ? "Doğru / yanlış" : "Right / wrong", `${week.answers.correct} / ${week.answers.wrong}`, prev ? `${prev.answers.correct} / ${prev.answers.wrong}` : null)}
          {week.responseTimeMs && stat(t.speed, fmtMs(week.responseTimeMs.median, locale), prev ? (prev.responseTimeMs ? fmtMs(prev.responseTimeMs.median, locale) : t.notMeasured) : null)}
          {week.rhythmTiming && stat(t.rhythm, `${week.rhythmTiming.meanAbsOffsetMs} ms`, prev ? (prev.rhythmTiming ? `${prev.rhythmTiming.meanAbsOffsetMs} ms` : t.notMeasured) : null)}
        </dl>
        <p className="weekly-note">{[!prev ? t.noPrevious : "", missing ? (locale === "tr" ? `Bu hafta ölçülmedi: ${missing}.` : `Not measured this week: ${missing}.`) : "", week.responseTimeMs ? t.speedNote : "", t.local].filter(Boolean).join(" ")}</p>
        {week.noteStruggles.length > 0 && <div className="weekly-struggles">
          <h3>{t.struggles}</h3>
          <ul>{week.noteStruggles.slice(0, 3).map((item) => <li key={item.note}><b>{noteLabel(item.note, locale)}</b> · {locale === "tr" ? `${item.attempts} denemede ${item.errors} hata` : `${item.errors} errors in ${item.attempts} attempts`}</li>)}</ul>
          {week.noteStruggles.length > 3 && <details className="weekly-more"><summary>{locale === "tr" ? `${week.noteStruggles.length - 3} nota daha` : `${week.noteStruggles.length - 3} more notes`}</summary>
            <ul>{week.noteStruggles.slice(3).map((item) => <li key={item.note}><b>{noteLabel(item.note, locale)}</b> · {locale === "tr" ? `${item.attempts} denemede ${item.errors} hata` : `${item.errors} errors in ${item.attempts} attempts`}</li>)}</ul></details>}
        </div>}
        <div className="weekly-ai">
          <h3>{t.ai}</h3>
          {narrative ? <>
            <p className="weekly-headline">{narrative.headline}</p>
            <p>{narrative.narrative}</p>
            {narrative.highlights.length > 0 && <ul>{narrative.highlights.map((item, i) => <li key={i}>{item}</li>)}</ul>}
            {narrative.nextWeek.length > 0 && <h4>{t.next}</h4>}
            {narrative.nextWeek.map((item, i) => (
              <ChatSuggestion key={i} label={t.suggestion} title={item.label}
                action={{ label: item.kind === "focus-drill" ? t.start : t.open, onClick: () => onSuggestion(item) }} />
            ))}
          </> : live ? <div className="weekly-ask">
            <p className="weekly-note">{t.askNote}</p>
            <button type="button" className="primary-button" disabled={state === "waiting"} onClick={ask}>{state === "waiting" ? t.waiting : t.ask}</button>
            {state === "error" && <p className="weekly-note" role="status">{reason && AI_LIMIT_REASONS[reason] ? AI_LIMIT_REASONS[reason][locale === "tr" ? 0 : 1] : <>{t.failed} <code>{reason}</code></>}</p>}
          </div> : <p className="weekly-note">{liveTeacherConfigured ? t.signIn : (locale === "tr" ? "AI açıklaması bu sürümde bağlı değil." : "The AI explanation is not connected in this build.")}</p>}
        </div>
      </>}
    </section>
  );
}
