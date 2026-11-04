"use client";

import type { FormEvent, ReactNode, Ref } from "react";
import { AiIcon } from "./landing/ai-icon";
import { Staff, type StaffNote } from "./landing/music";
import "./chat-ui.css";

/*
 * The pieces of the NotaNota AI conversation. The live chat and the landing's sample conversation are
 * built from the same parts so the preview looks exactly like what the user gets; the preview only
 * swaps the working composer for a still picture of it.
 */

export function ChatHeader({ id, title, badge, onClose, closeLabel }: { id?: string; title: string; badge?: string; onClose?: () => void; closeLabel?: string }) {
  return (
    <header className="chat-head">
      <span className="chat-head-icon"><AiIcon size={24} /></span>
      <h2 id={id}>{title}</h2>
      {badge && <span className="chat-badge">{badge}</span>}
      {onClose && (
        <button type="button" className="chat-close" aria-label={closeLabel} onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      )}
    </header>
  );
}

export function ChatMessage({ from, children, className = "" }: { from: "you" | "teacher"; children: ReactNode; className?: string }) {
  return <div className={`chat-msg chat-msg--${from} ${className}`}>{children}</div>;
}

/** Three dots while the teacher writes; `label` is read out where the dots are not decoration. */
export function ChatTyping({ label }: { label?: string }) {
  return <span className="chat-typing">{label ? <span className="sr-only">{label}</span> : null}<i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /></span>;
}

/** A staff inside the teacher's answer, the note being talked about highlighted. */
export function ChatStaff({ notes, label, anchor, anchorOrder }: { notes: StaffNote[]; label: string; anchor?: string; anchorOrder?: number }) {
  return <Staff className="chat-staff" space={10} width={360} notes={notes} label={label} anchor={anchor} anchorOrder={anchorOrder} />;
}

/** The practice the teacher proposes; with an action it opens that practice. */
export function ChatSuggestion({ label, title, detail, action, className = "" }: {
  label: string; title: string; detail?: string; className?: string;
  action?: { label: string; onClick?: () => void };
}) {
  return (
    <div className={`chat-suggest ${className}`}>
      <div><span>{label}</span><b>{title}</b>{detail && <small>{detail}</small>}</div>
      {action && (action.onClick
        ? <button type="button" className="chat-suggest-go" onClick={action.onClick}>{action.label}</button>
        : <span className="chat-suggest-go" aria-hidden="true">{action.label}</span>)}
    </div>
  );
}

type LiveComposer = { placeholder: string; sendLabel: string; value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent) => void; disabled?: boolean; inputRef?: Ref<HTMLInputElement>; maxLength?: number; inputId: string };

/** The message box. In the preview it is a still picture of the same box: nothing to type into. */
export function ChatComposer(props: ({ preview: true; placeholder: string; sendLabel: string }) | ({ preview?: false } & LiveComposer)) {
  if (props.preview) {
    return (
      <div className="chat-form chat-form--preview" aria-hidden="true">
        <span className="chat-input">{props.placeholder}</span>
        <span className="chat-send">{props.sendLabel}</span>
      </div>
    );
  }
  return <LiveChatComposer {...props} />;
}

function LiveChatComposer({ placeholder, sendLabel, value, onChange, onSubmit, disabled, inputRef, maxLength = 280, inputId }: LiveComposer) {
  return (
    <form className="chat-form" onSubmit={onSubmit}>
      <label htmlFor={inputId} className="sr-only">{placeholder}</label>
      <input ref={inputRef} id={inputId} className="chat-input" value={value} maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" />
      <button type="submit" className="chat-send" disabled={!value.trim() || disabled}>{sendLabel}</button>
    </form>
  );
}

const DAY_NAMES = {
  tr: { mon: "Pzt", tue: "Sal", wed: "Çar", thu: "Per", fri: "Cum", sat: "Cmt", sun: "Paz" },
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
} as const;

/** The week the teacher proposes: one row per day, rest days quiet. */
export function WeekPlanView({ days, locale }: { days: { day: keyof (typeof DAY_NAMES)["tr"]; minutes: number; focus: string }[]; locale: "tr" | "en" }) {
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  return (
    <div className="week-plan">
      <ol>
        {days.map((day) => (
          <li key={day.day} className={day.minutes ? "" : "is-rest"}>
            <b>{DAY_NAMES[locale][day.day]}</b>
            <span>{day.minutes ? day.focus : (locale === "tr" ? "Dinlenme" : "Rest")}</span>
            <small>{day.minutes ? `${day.minutes} ${locale === "tr" ? "dk" : "min"}` : ""}</small>
          </li>
        ))}
      </ol>
      <p>{locale === "tr" ? `Haftada toplam ${total} dakika` : `${total} minutes in all`}</p>
    </div>
  );
}
