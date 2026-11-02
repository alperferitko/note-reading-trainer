"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createDemoTeacher } from "@/lib/teacher-demo.mjs";

type Locale = "tr" | "en";
type Message = { id: number; from: "you" | "teacher"; lines: string[] };

const TEXT = {
  tr: {
    open: "NotaNota AI sohbetini aç",
    title: "NotaNota AI",
    badge: "Örnek yanıtlar",
    close: "Sohbeti kapat",
    empty: "Nota okuma hakkında bir şey sor ya da aşağıdaki sorulardan birini seç. Bu pencere şimdilik hazırlanmış örnek yanıtlarla çalışır.",
    placeholder: "Sorunu yaz",
    send: "Gönder",
    waiting: "Yanıt hazırlanıyor",
    error: "Yanıt alınamadı.",
    retry: "Tekrar dene",
  },
  en: {
    open: "Open the NotaNota AI chat",
    title: "NotaNota AI",
    badge: "Sample answers",
    close: "Close the chat",
    empty: "Ask something about reading music or pick one of the questions below. For now this window runs on prepared sample answers.",
    placeholder: "Type your question",
    send: "Send",
    waiting: "Preparing an answer",
    error: "No answer came back.",
    retry: "Try again",
  },
} as const;

/** The bottom-right chat: separate from the landing preview, labelled as sample answers. */
export function ChatWidget({ locale, hidden = false }: { locale: Locale; hidden?: boolean }) {
  const t = TEXT[locale];
  const teacher = useMemo(() => createDemoTeacher(), []);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "waiting" | "error">("idle");
  const [lastAsk, setLastAsk] = useState<{ topicId?: string; text?: string } | null>(null);
  const bubble = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const serial = useRef(0);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("notanota-open-chat", show);
    return () => window.removeEventListener("notanota-open-chat", show);
  }, []);
  useEffect(() => { if (open) window.requestAnimationFrame(() => input.current?.focus()); }, [open]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages, state]);

  function close() { setOpen(false); window.requestAnimationFrame(() => bubble.current?.focus()); }

  async function ask(request: { topicId?: string; text?: string }) {
    const question = request.text ?? teacher.topics(locale).find((topic: { id: string }) => topic.id === request.topicId)?.question ?? "";
    setMessages((list) => [...list, { id: ++serial.current, from: "you", lines: [question] }]);
    setLastAsk(request);
    setState("waiting");
    try {
      // The sample adapter answers at once; a connected teacher would resolve later through the same call.
      const reply = await Promise.resolve(teacher.ask({ ...request, locale }));
      setMessages((list) => [...list, { id: ++serial.current, from: "teacher", lines: reply.teacher }]);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || state === "waiting") return;
    void ask({ text: text.trim() });
    setText("");
  }

  // Keep focus inside the open panel; Escape closes it.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.stopPropagation(); close(); return; }
    if (event.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>("button, input, [tabindex='0']")].filter((el) => !el.hasAttribute("disabled"));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  if (hidden) return null;
  return (
    <>
      <button ref={bubble} type="button" className={`chat-bubble${open ? " is-open" : ""}`} aria-label={t.open} aria-expanded={open} aria-controls="chat-panel" onClick={() => (open ? close() : setOpen(true))}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17H10l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="9" cy="11.3" r="1.1" fill="currentColor" /><circle cx="12" cy="11.3" r="1.1" fill="currentColor" /><circle cx="15" cy="11.3" r="1.1" fill="currentColor" /></svg>
      </button>
      {open && (
        <div ref={panel} id="chat-panel" className="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title" onKeyDown={onKeyDown}>
          <header className="chat-head">
            <h2 id="chat-title">{t.title}</h2>
            <span className="teacher-badge">{t.badge}</span>
            <button type="button" className="chat-close" aria-label={t.close} onClick={close}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </header>
          <div className="chat-log" ref={log} aria-live="polite">
            {messages.length === 0 && <p className="chat-empty">{t.empty}</p>}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg chat-msg--${m.from}`}>{m.lines.map((line, i) => <p key={i}>{line}</p>)}</div>
            ))}
            {state === "waiting" && <p className="chat-waiting"><span aria-hidden="true"><i /><i /><i /></span>{t.waiting}</p>}
            {state === "error" && <p className="chat-error">{t.error} <button type="button" className="ghost-button" onClick={() => lastAsk && void ask(lastAsk)}>{t.retry}</button></p>}
          </div>
          {messages.length === 0 && (
            <div className="chat-topics">
              {teacher.topics(locale).map((topic: { id: string; question: string }) => (
                <button key={topic.id} type="button" onClick={() => void ask({ topicId: topic.id })}>{topic.question}</button>
              ))}
            </div>
          )}
          <form className="chat-form" onSubmit={submit}>
            <label htmlFor="chat-input" className="sr-only">{t.placeholder}</label>
            <input ref={input} id="chat-input" value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder={t.placeholder} autoComplete="off" />
            <button type="submit" className="primary-button" disabled={!text.trim() || state === "waiting"}>{t.send}</button>
          </form>
        </div>
      )}
    </>
  );
}
