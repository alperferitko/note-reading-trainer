"use client";

import { AiIcon } from "./ai-icon";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createDemoTeacher } from "@/lib/teacher-demo.mjs";
import { ChatComposer, ChatHeader, ChatMessage, ChatStaff, ChatSuggestion, ChatTyping } from "../chat-ui";
import type { TeacherAction } from "./teacher-demo";

type Locale = "tr" | "en";
type Reply = ReturnType<ReturnType<typeof createDemoTeacher>["ask"]>;
type Message = { id: number; from: "you" | "teacher"; lines: string[]; reply?: Reply };
const NAMES = { tr: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"], en: ["C", "D", "E", "F", "G", "A", "B"] } as const;
const nameAt = (position: number, locale: Locale) => NAMES[locale][((position + 2) % 7 + 7) % 7];

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
    suggestion: "Önerilen alıştırma",
    staff: "Konuşmada geçen notalar",
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
    suggestion: "Suggested practice",
    staff: "The notes in this answer",
  },
} as const;

/**
 * The bottom-right chat. It opens empty: the user writes their own message or picks a topic, and nothing
 * prepared is ever shown as their history. Its answers are labelled as samples until a live teacher is
 * connected; a suggested practice really opens.
 */
export function ChatWidget({ locale, hidden = false, onAction }: { locale: Locale; hidden?: boolean; onAction?: (action: TeacherAction) => void }) {
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
      setMessages((list) => [...list, { id: ++serial.current, from: "teacher", lines: reply.teacher, reply }]);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  function run(action: Reply["actions"][number]) {
    if (!onAction) return;
    if (action.id === "open-focus") onAction({ kind: "focus", notes: action.payload.notes ?? [], repeats: action.payload.repeats ?? 2 });
    else if (action.id === "open-measure") onAction({ kind: "measure", from: action.payload.from ?? 1, to: action.payload.to ?? 1 });
    else return;
    setOpen(false);
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
        <AiIcon size={30} />
      </button>
      {open && (
        <div ref={panel} id="chat-panel" className="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title" onKeyDown={onKeyDown}>
          <ChatHeader id="chat-title" title={t.title} badge={t.badge} onClose={close} closeLabel={t.close} />
          <div className="chat-log" ref={log} aria-live="polite">
            {messages.length === 0 && <p className="chat-empty">{t.empty}</p>}
            {messages.map((m) => (
              <ChatMessage key={m.id} from={m.from}>
                {m.lines.map((line, i) => <p key={i}>{line}</p>)}
                {m.reply?.staff && (
                  <ChatStaff label={t.staff} notes={m.reply.staff.notes.map((note: { id: string; position: number; beats?: number }, i: number, all: unknown[]) => ({
                    id: note.id, position: note.position, beats: note.beats, x: (i + 1) / (all.length + 1),
                    tone: note.id === m.reply?.staff?.focus ? "focus" : "quiet", label: nameAt(note.position, locale),
                  }))} />
                )}
                {m.reply?.actions.map((action: Reply["actions"][number]) => (
                  <ChatSuggestion key={action.id} label={t.suggestion} title={action.label} detail={action.detail}
                    action={onAction ? { label: locale === "tr" ? "Başlat" : "Start", onClick: () => run(action) } : undefined} />
                ))}
              </ChatMessage>
            ))}
            {state === "waiting" && <p className="chat-waiting"><ChatTyping />{t.waiting}</p>}
            {state === "error" && <p className="chat-error">{t.error} <button type="button" className="ghost-button" onClick={() => lastAsk && void ask(lastAsk)}>{t.retry}</button></p>}
          </div>
          {messages.length === 0 && (
            <div className="chat-topics">
              {teacher.topics(locale).map((topic: { id: string; question: string }) => (
                <button key={topic.id} type="button" onClick={() => void ask({ topicId: topic.id })}>{topic.question}</button>
              ))}
            </div>
          )}
          <ChatComposer inputId="chat-input" inputRef={input} value={text} onChange={setText} onSubmit={submit}
            placeholder={t.placeholder} sendLabel={t.send} disabled={state === "waiting"} />
        </div>
      )}
    </>
  );
}
