"use client";

import { AiIcon } from "./ai-icon";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createDemoTeacher } from "@/lib/teacher-demo.mjs";
import { ChatComposer, ChatHeader, ChatMessage, ChatStaff, ChatSuggestion, ChatTyping, WeekPlanView } from "../chat-ui";
import type { TeacherAction } from "./teacher-demo";
import { buildTeacherChatRequest, newIdempotencyKey, requestTeacherChat } from "@/lib/ai-client.mjs";
import type { EvidenceRecord } from "@/lib/practice-evidence.mjs";
import { learningProfileEnabled, loadProfile, profileForTeacher, saveProfile, EMPTY_PROFILE, type LearningProfile, type WeekPlanDay } from "@/lib/learning-profile";
import { supabase } from "@/lib/supabase";
import { liveTeacherConfigured, teacherApiKey, teacherEndpoint } from "../ai-teacher";

type Locale = "tr" | "en";
type Reply = ReturnType<ReturnType<typeof createDemoTeacher>["ask"]>;
export type TeacherSuggestion =
  | { kind: "focus-drill"; notes: string[]; repetitions: number; label: string }
  | { kind: "studio"; studio: "reading" | "rhythm" | "score" | "ear" | "instrument" | "lessons"; label: string }
  | { kind: "lesson"; lesson: string; label: string };
type LiveReply = { reply: string; ask: string | null; profileUpdates: Partial<LearningProfile> | null; suggestions: TeacherSuggestion[]; weekPlan: { days: WeekPlanDay[] } | null; modelId: string | null };
type Message = { id: number; from: "you" | "teacher"; lines: string[]; reply?: Reply; live?: LiveReply; key?: string };
const LIVE_REASONS: Record<string, [string, string]> = {
  sign_in_required: ["Canlı öğretmen için giriş yapman gerekir.", "Sign in to talk to the live teacher."],
  quota_exceeded: ["Bugünkü AI kullanım sınırına ulaşıldı.", "Today's AI limit has been reached."],
  usage_limit_exceeded: ["AI bütçe sınırına ulaşıldı.", "The AI budget limit has been reached."],
  live_calls_disabled: ["Canlı model çağrıları şu an kapalı.", "Live model calls are switched off right now."],
  backend_not_configured: ["AI sunucusu şu an kapalı.", "The AI server is switched off right now."],
  timeout: ["Yanıt zamanında gelmedi.", "The answer did not arrive in time."],
  provider_timeout: ["Model zamanında yanıt vermedi.", "The model did not answer in time."],
  network_error: ["AI sunucusuna bağlanılamadı.", "Could not reach the AI server."],
  invalid_model_response: ["Model yanıtı doğrulamadan geçmedi, gösterilmedi.", "The model's answer failed validation and was not shown."],
  request_too_large: ["Mesaj çok uzun.", "The message is too long."],
};
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
    liveEmpty: "Merhaba! Müziğe nasıl başlayacağını ya da nasıl ilerleyeceğini birlikte planlayalım. Ne çalmak istediğini ya da nerede zorlandığını yaz.",
    saveGoals: "Bunu hedeflerime kaydet", goalsSaved: "Hedeflerine kaydedildi.", savePlan: "Bu planı kaydet", planSaved: "Plan kaydedildi; Ayarlar'da da görebilirsin.",
    openSuggestion: "Aç",
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
    liveEmpty: "Hello! Let's plan how you start with music or how you move on. Tell me what you want to play or where you get stuck.",
    saveGoals: "Save this to my goals", goalsSaved: "Saved to your goals.", savePlan: "Save this plan", planSaved: "Plan saved; you can also see it in Settings.",
    openSuggestion: "Open",
  },
} as const;

/**
 * The bottom-right chat. It opens empty: the user writes their own message or picks a topic, and nothing
 * prepared is ever shown as their history. Its answers are labelled as samples until a live teacher is
 * connected; a suggested practice really opens.
 */
export function ChatWidget({ locale, hidden = false, onAction, onSuggestion, evidence = [] }: {
  locale: Locale; hidden?: boolean; onAction?: (action: TeacherAction) => void;
  onSuggestion?: (suggestion: TeacherSuggestion) => void; evidence?: EvidenceRecord[];
}) {
  const t = TEXT[locale];
  const teacher = useMemo(() => createDemoTeacher(), []);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "waiting" | "error">("idle");
  const [lastAsk, setLastAsk] = useState<{ topicId?: string; text?: string } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const bubble = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const serial = useRef(0);
  // Live only in a build pointed at the staging gateway, for a signed-in user; otherwise prepared samples.
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [savedGoals, setSavedGoals] = useState<number | null>(null);
  const [savedPlan, setSavedPlan] = useState<number | null>(null);
  const live = liveTeacherConfigured && signedIn;
  useEffect(() => {
    if (!supabase || !liveTeacherConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSignedIn(Boolean(data.session)); }, () => undefined);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!open || !live || !learningProfileEnabled) return;
    let alive = true;
    loadProfile().then((value) => { if (alive) setProfile(value); }, () => undefined);
    return () => { alive = false; };
  }, [open, live]);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("notanota-open-chat", show);
    return () => window.removeEventListener("notanota-open-chat", show);
  }, []);
  useEffect(() => { if (open) window.requestAnimationFrame(() => input.current?.focus()); }, [open]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages, state]);

  function close() { setOpen(false); window.requestAnimationFrame(() => bubble.current?.focus()); }

  async function askLive(question: string, key: string, history: Message[]) {
    setMessages([...history, { id: ++serial.current, from: "you", lines: [question], key }]);
    setLastAsk({ text: question });
    setState("waiting");
    setLiveError(null);
    const turns = [...history, { from: "you" as const, lines: [question] }].map((m) => ({ role: (m.from === "you" ? "user" : "teacher") as "user" | "teacher", text: m.lines.join(" ") }));
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    const request = buildTeacherChatRequest({ messages: turns, profile: profileForTeacher(profile), locale, evidenceRecords: evidence.length ? evidence : null });
    const value = await requestTeacherChat({ endpoint: teacherEndpoint, accessToken: data.session?.access_token ?? null, apiKey: teacherApiKey, request, idempotencyKey: key });
    if (!value.ok || value.mode !== "live") { setLiveError(value.reason ?? "invalid_response"); setState("error"); return; }
    const result = value.result as Omit<LiveReply, "modelId">;
    setMessages((list) => [...list, { id: ++serial.current, from: "teacher", lines: result.reply.split(/\n+/).filter(Boolean), live: { ...result, modelId: value.provenance?.modelId ?? null } }]);
    setState("idle");
  }

  async function ask(request: { topicId?: string; text?: string }) {
    if (live && request.text) { void askLive(request.text, newIdempotencyKey("chat"), messages); return; }
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

  // A retry re-sends the same message with the same key: the gateway replays a stored answer instead of paying twice.
  function retry() {
    const last = [...messages].reverse().find((m) => m.from === "you");
    if (live && last?.key) { void askLive(last.lines.join(" "), last.key, messages.slice(0, messages.indexOf(last))); return; }
    if (lastAsk) void ask(lastAsk);
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
          <ChatHeader id="chat-title" title={t.title} badge={live ? undefined : t.badge} onClose={close} closeLabel={t.close} />
          <div className="chat-log" ref={log} aria-live="polite">
            {messages.length === 0 && <p className="chat-empty">{live ? t.liveEmpty : t.empty}</p>}
            {messages.map((m) => (
              <ChatMessage key={m.id} from={m.from}>
                {m.lines.map((line, i) => <p key={i}>{line}</p>)}
                {m.reply?.staff && (
                  <ChatStaff label={t.staff} notes={m.reply.staff.notes.map((note: { id: string; position: number; beats?: number }, i: number, all: unknown[]) => ({
                    id: note.id, position: note.position, beats: note.beats, x: (i + 1) / (all.length + 1),
                    tone: note.id === m.reply?.staff?.focus ? "focus" : "quiet", label: nameAt(note.position, locale),
                  }))} />
                )}
                {m.live?.suggestions.map((item, i) => (
                  <ChatSuggestion key={i} label={t.suggestion} title={item.label}
                    detail={item.kind === "focus-drill" ? (locale === "tr" ? `${item.repetitions} tekrar` : `${item.repetitions} repetitions`) : undefined}
                    action={onSuggestion ? { label: item.kind === "focus-drill" ? (locale === "tr" ? "Başlat" : "Start") : t.openSuggestion, onClick: () => { onSuggestion(item); setOpen(false); } } : undefined} />
                ))}
                {m.live?.weekPlan && <WeekPlanView days={m.live.weekPlan.days} locale={locale} />}
                {m.live?.weekPlan && learningProfileEnabled && (savedPlan === m.id
                  ? <p className="chat-note">{t.planSaved}</p>
                  : <button type="button" className="chat-suggest-go chat-goals" onClick={async () => {
                    try { const next = { ...EMPTY_PROFILE, ...(profile ?? {}), weekPlan: m.live!.weekPlan!.days } as LearningProfile; await saveProfile(next); setProfile(next); setSavedPlan(m.id); } catch { setLiveError("profile_save_failed"); setState("error"); }
                  }}>{t.savePlan}</button>)}
                {m.live?.profileUpdates && learningProfileEnabled && (savedGoals === m.id
                  ? <p className="chat-note">{t.goalsSaved}</p>
                  : <button type="button" className="chat-suggest-go chat-goals" onClick={async () => {
                    try { const next = { ...EMPTY_PROFILE, ...(profile ?? {}), ...m.live!.profileUpdates } as LearningProfile; await saveProfile(next); setProfile(next); setSavedGoals(m.id); } catch { setLiveError("profile_save_failed"); setState("error"); }
                  }}>{t.saveGoals}</button>)}
                {m.reply?.actions.map((action: Reply["actions"][number]) => (
                  <ChatSuggestion key={action.id} label={t.suggestion} title={action.label} detail={action.detail}
                    action={onAction ? { label: locale === "tr" ? "Başlat" : "Start", onClick: () => run(action) } : undefined} />
                ))}
              </ChatMessage>
            ))}
            {state === "waiting" && <p className="chat-waiting"><ChatTyping />{t.waiting}</p>}
            {state === "error" && <p className="chat-error">{liveError ? (LIVE_REASONS[liveError]?.[locale === "tr" ? 0 : 1] ?? t.error) : t.error}{liveError && <code className="chat-code">{liveError}</code>} <button type="button" className="ghost-button" onClick={retry}>{t.retry}</button></p>}
          </div>
          {messages.length === 0 && !live && (
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
