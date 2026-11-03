"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createDemoTeacher } from "@/lib/teacher-demo.mjs";
import { addToPlan, readPlan, removeFromPlan } from "@/lib/study-plan.mjs";
import { Staff, playMidi } from "./music";

type Locale = "tr" | "en";
type Reply = ReturnType<ReturnType<typeof createDemoTeacher>["ask"]>;
type PlanItem = { id: string; title: string; addedAt: string; action?: { kind: string; notes?: string[]; repeats?: number; from?: number; to?: number } };
export type TeacherAction = { kind: "focus"; notes: string[]; repeats: number } | { kind: "measure"; from: number; to: number };

const NAMES = { tr: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"], en: ["C", "D", "E", "F", "G", "A", "B"] } as const;
const degreeOf = (position: number) => ((position + 2) % 7 + 7) % 7;
const midiOf = (position: number) => 60 + 12 * Math.floor((position + 2) / 7) + [0, 2, 4, 5, 7, 9, 11][degreeOf(position)];

const TEXT = {
  tr: {
    title: "NotaNota AI öğretmen",
    badge: "Örnek konuşma",
    intro: "Bir soru seç ya da kendi sorunu yaz. Bu örnek, hazırlanmış konuşmalarla çalışır ve önerdiği alıştırmayı gerçekten açar.",
    ask: "Sorunu yaz",
    send: "Sor",
    placeholder: "Örneğin: Sol ve la notalarını karıştırıyorum",
    you: "Sen",
    teacher: "Öğretmen",
    hint: "İpucu iste",
    retry: "Yeniden dene",
    retryQ: "Vurgulu nota hangisi?",
    right: "Doğru.",
    wrong: "Bu değil. İpucuna bak ve bir daha dene.",
    addPlan: "Çalışma planına ekle",
    added: "Planına eklendi.",
    plan: "Çalışma planın",
    planEmpty: "Henüz bir şey eklemedin.",
    planNote: "Plan bu cihazda, hesabına göre ayrı tutulur.",
    open: "Aç",
    remove: "Kaldır",
    listen: "Notaları dinle",
    staff: "Konuşmada geçen notalar",
    reset: "Başka bir soru",
  },
  en: {
    title: "NotaNota AI teacher",
    badge: "Sample conversation",
    intro: "Pick a question or type your own. This sample runs on prepared conversations and really opens the practice it suggests.",
    ask: "Type your question",
    send: "Ask",
    placeholder: "For example: I mix up G and A",
    you: "You",
    teacher: "Teacher",
    hint: "Ask for a hint",
    retry: "Try again",
    retryQ: "Which is the highlighted note?",
    right: "Right.",
    wrong: "Not this one. Read the hint and try again.",
    addPlan: "Add to my plan",
    added: "Added to your plan.",
    plan: "Your practice plan",
    planEmpty: "Nothing added yet.",
    planNote: "The plan stays on this device, kept apart per account.",
    open: "Open",
    remove: "Remove",
    listen: "Listen to the notes",
    staff: "Notes from the conversation",
    reset: "Another question",
  },
} as const;

export function TeacherDemo({ locale, owner, variant, onAction }: { locale: Locale; owner: string | null; variant: "compact" | "full"; onAction: (action: TeacherAction) => void }) {
  const t = TEXT[locale];
  const teacher = useMemo(() => createDemoTeacher(), []);
  const topics = teacher.topics(locale);
  const [reply, setReply] = useState<Reply | null>(() => (variant === "compact" ? teacher.ask({ topicId: "sol-la", locale }) : null));
  const [text, setText] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [retry, setRetry] = useState<null | "ask" | "right" | "wrong">(null);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  // Read after the first render so the server and the browser start from the same markup.
  useEffect(() => { const timer = window.setTimeout(() => setPlan(readPlan(owner) as PlanItem[]), 0); return () => window.clearTimeout(timer); }, [owner]);
  const [notice, setNotice] = useState<string | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const names = NAMES[locale];
  const active = reply && reply.topicId ? teacher.ask({ topicId: reply.topicId, locale }) : reply;
  const shown = active && reply ? { ...active, question: reply.question } : null;

  function choose(topicId: string) {
    setReply(teacher.ask({ topicId, locale }));
    setShowHint(false); setRetry(null); setNotice(null);
    window.requestAnimationFrame(() => answerRef.current?.focus({ preventScroll: false }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setReply(teacher.ask({ text, locale }));
    setText(""); setShowHint(false); setRetry(null); setNotice(null);
    window.requestAnimationFrame(() => answerRef.current?.focus({ preventScroll: false }));
  }
  function run(action: NonNullable<Reply>["actions"][number]) {
    if (action.id === "open-focus") onAction({ kind: "focus", notes: action.payload.notes ?? [], repeats: action.payload.repeats ?? 2 });
    if (action.id === "open-measure") onAction({ kind: "measure", from: action.payload.from ?? 1, to: action.payload.to ?? 1 });
  }
  function save() {
    if (!shown?.topicId || !shown.planTitle) return;
    const action = shown.actions[0];
    const next = addToPlan(owner, { id: shown.topicId, title: shown.planTitle, action: action ? { kind: action.id === "open-focus" ? "focus" : "measure", ...action.payload } : undefined }) as PlanItem[];
    setPlan(next);
    setNotice(t.added);
  }
  function openPlan(item: PlanItem) {
    const a = item.action;
    if (!a) return;
    if (a.kind === "focus") onAction({ kind: "focus", notes: a.notes ?? [], repeats: a.repeats ?? 2 });
    else onAction({ kind: "measure", from: a.from ?? 1, to: a.to ?? 1 });
  }

  const staffNotes = shown?.staff?.notes ?? [];
  const focus = shown?.staff?.focus;
  const focusNote = staffNotes.find((n: { id: string }) => n.id === focus);
  const answerName = focusNote ? names[degreeOf(focusNote.position)] : null;
  const choices: string[] = Array.from(new Set<string>(staffNotes.map((n: { position: number }) => names[degreeOf(n.position)])));
  const inPlan = Boolean(shown?.topicId && plan.some((item) => item.id === shown.topicId));

  return (
    <div className={`teacher teacher--${variant}`}>
      <div className="teacher-head">
        <h3 className="teacher-title">{t.title}</h3>
        <span className="teacher-badge">{t.badge}</span>
      </div>
      {!shown && <p className="teacher-intro">{t.intro}</p>}

      <div className="teacher-topics" role="group" aria-label={t.ask}>
        {topics.map((topic: { id: string; question: string }) => (
          <button key={topic.id} type="button" className={`teacher-topic${reply?.topicId === topic.id ? " is-on" : ""}`} aria-pressed={reply?.topicId === topic.id} onClick={() => choose(topic.id)}>{topic.question}</button>
        ))}
      </div>

      {shown && (
        <div className="teacher-thread" ref={answerRef} tabIndex={-1} aria-live="polite">
          <div className="teacher-msg teacher-msg--you"><span className="teacher-who">{t.you}</span><p>{shown.question}</p></div>
          <div className="teacher-msg teacher-msg--teacher">
            <span className="teacher-who">{t.teacher}</span>
            {shown.teacher.map((line: string, i: number) => <p key={i}>{line}</p>)}
            {shown.sample && (
              <div className="teacher-sample">
                <strong>{shown.sample.title}</strong>
                <ul>{shown.sample.rows.map((row: string) => <li key={row}>{row}</li>)}</ul>
              </div>
            )}
          </div>

          {staffNotes.length > 0 && (
            <div className="teacher-visual">
              <Staff
                space={variant === "compact" ? 11 : 12}
                width={variant === "compact" ? 380 : 460}
                anchor={variant === "compact" ? "ai" : undefined}
                anchorOrder={3}
                label={`${t.staff}: ${staffNotes.map((n: { position: number }) => names[degreeOf(n.position)]).join(", ")}`}
                notes={staffNotes.map((n: { id: string; position: number; beats?: number }, i: number) => ({
                  id: n.id, position: n.position, beats: n.beats,
                  x: staffNotes.length === 1 ? 0.5 : 0.12 + (i * 0.76) / (staffNotes.length - 1),
                  tone: n.id === focus ? (retry === "right" ? "ok" : "focus") : "quiet",
                  label: retry === "ask" || retry === "wrong" ? undefined : names[degreeOf(n.position)],
                }))}
              />
              <div className="teacher-tools">
                <button type="button" className="ghost-button" onClick={() => staffNotes.forEach((n: { position: number }, i: number) => window.setTimeout(() => playMidi(midiOf(n.position), 0.6), i * 650))}>{t.listen}</button>
                {shown.hint && <button type="button" className="ghost-button" aria-expanded={showHint} onClick={() => setShowHint((v) => !v)}>{t.hint}</button>}
                {answerName && <button type="button" className="ghost-button" onClick={() => setRetry("ask")}>{t.retry}</button>}
              </div>
              {showHint && shown.hint && <p className="teacher-hint">{shown.hint}</p>}
              {retry && answerName && (
                <div className="teacher-retry" role="group" aria-label={t.retryQ}>
                  <span>{t.retryQ}</span>
                  {choices.map((name) => (
                    <button key={name} type="button" className="hero-key" onClick={() => setRetry(name === answerName ? "right" : "wrong")}>{name}</button>
                  ))}
                  {retry === "right" && <b className="teacher-ok"><span aria-hidden="true">✓ </span>{t.right}</b>}
                  {retry === "wrong" && <b className="teacher-no"><span aria-hidden="true">! </span>{t.wrong}</b>}
                </div>
              )}
            </div>
          )}

          <div className="teacher-actions">
            {shown.actions.map((action: NonNullable<Reply>["actions"][number]) => (
              <button key={action.id} type="button" className="primary-button" onClick={() => run(action)}>
                {action.label}<small>{action.detail}</small>
              </button>
            ))}
            {shown.topicId && <button type="button" className="secondary-button" onClick={save} disabled={inPlan}>{inPlan ? t.added : t.addPlan}</button>}
            {variant === "full" && <button type="button" className="ghost-button" onClick={() => { setReply(null); setRetry(null); setShowHint(false); }}>{t.reset}</button>}
          </div>
          {notice && <p className="teacher-notice" role="status">{notice}</p>}
        </div>
      )}

      <form className="teacher-ask" onSubmit={submit}>
        <label htmlFor={`teacher-input-${variant}`}>{t.ask}</label>
        <div>
          <input id={`teacher-input-${variant}`} value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder={t.placeholder} autoComplete="off" />
          <button type="submit" className="secondary-button">{t.send}</button>
        </div>
      </form>

      {variant === "full" && (
        <section className="teacher-plan" aria-labelledby="teacher-plan-h">
          <h3 id="teacher-plan-h">{t.plan}</h3>
          {plan.length === 0 ? <p className="teacher-intro">{t.planEmpty}</p> : (
            <ul>
              {plan.map((item) => (
                <li key={item.id}>
                  <span>{item.title}</span>
                  <span className="teacher-plan-actions">
                    {item.action && <button type="button" className="ghost-button" onClick={() => openPlan(item)}>{t.open}</button>}
                    <button type="button" className="ghost-button" onClick={() => setPlan(removeFromPlan(owner, item.id) as PlanItem[])}>{t.remove}</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="teacher-plan-note">{t.planNote}</p>
        </section>
      )}
    </div>
  );
}
