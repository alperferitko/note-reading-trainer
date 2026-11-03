"use client";

import { useEffect, useRef, useState } from "react";
import { ChatComposer, ChatHeader, ChatMessage, ChatStaff, ChatSuggestion, ChatTyping } from "../chat-ui";

type Locale = "tr" | "en";

const TEXT = {
  tr: {
    student: "Sol ile la'yı hep karıştırıyorum.",
    teacher: "Son turunda sol sorulan 6 notanın 3'üne la dedin. Sol, alttan ikinci çizginin üzerinde; sol anahtarının kıvrımı da bu çizgiyi sarar. La bir adım yukarıda, aralığın içinde.",
    suggestion: "Önerilen alıştırma",
    suggestionBody: "Yalnız sol ve la",
    suggestionDetail: "8 soru",
    start: "Başlat",
    placeholder: "Sorunu yaz",
    send: "Gönder",
    label: "Örnek konuşma",
    staff: "Sol notası vurgulanmış porte",
    transcript: "Örnek konuşma. Öğrenci: Sol ile la'yı hep karıştırıyorum. Öğretmen: Son turunda sol sorulan 6 notanın 3'üne la dedin. Sol alttan ikinci çizgide, la onun üstündeki aralıkta. Önerilen alıştırma: yalnız sol ve la, 8 soru.",
  },
  en: {
    student: "I keep mixing up G and A.",
    teacher: "In your last round you answered A for 3 of the 6 Gs. G sits on the second line from the bottom; the curl of the treble clef wraps that line. A is one step higher, inside the space.",
    suggestion: "Suggested practice",
    suggestionBody: "Only G and A",
    suggestionDetail: "8 questions",
    start: "Start",
    placeholder: "Type your question",
    send: "Send",
    label: "Sample conversation",
    staff: "A staff with the note G highlighted",
    transcript: "Sample conversation. Student: I keep mixing up G and A. Teacher: In your last round you answered A for 3 of the 6 Gs. G is on the second line from the bottom, A in the space above. Suggested practice: only G and A, 8 questions.",
  },
} as const;

/**
 * A sample conversation drawn with the live chat's own parts (header, bubbles, staff, suggestion, message
 * box), labelled as a sample. It is a picture, not a control: nothing inside responds to the pointer or the
 * keyboard and nothing is sent anywhere.
 * The student's message is there as the section comes into view; the answer waits for the page's
 * travelling clef and appears when the clef is seated on its staff, then the suggestion follows.
 * Once shown it stays, so scrolling back and forth never rewrites it. Without the travelling clef
 * (reduced motion, no script for it) everything is shown at once. Assistive technology gets the transcript.
 */
export function AiPreview({ locale }: { locale: Locale }) {
  const t = TEXT[locale];
  const box = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const figure = box.current;
    if (!figure) return;
    const timers: number[] = [];
    const answer = () => {
      setStep((current) => {
        if (current >= 2) return current;
        timers.push(window.setTimeout(() => setStep(3), 900));
        return 2;
      });
    };
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      const travelling = Boolean(figure.closest(".clef-travel-on")) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!travelling) { setStep(3); return; }
      setStep((current) => Math.max(current, 1));
      if (figure.hasAttribute("data-clef-seated")) answer();
    }, { threshold: 0.15 });
    seen.observe(figure);
    figure.addEventListener("clef-seated", answer);
    return () => { seen.disconnect(); figure.removeEventListener("clef-seated", answer); timers.forEach((id) => window.clearTimeout(id)); };
  }, []);

  return (
    <figure className="ai-preview" data-clef-host="" ref={box}>
      <figcaption className="sr-only">{t.transcript}</figcaption>
      <div className="ai-preview-body chat-surface" aria-hidden="true" inert>
        <ChatHeader title="NotaNota AI" badge={t.label} />
        <div className="chat-log">
          <ChatMessage from="you" className={`ai-msg--you${step >= 1 ? " is-in" : ""}`}><p>{t.student}</p></ChatMessage>
          <ChatMessage from="teacher" className={`ai-msg--teacher${step >= 2 ? " is-in" : ""}`}>
            <ChatTyping />
            <p>{t.teacher}</p>
            <ChatStaff anchor="ai" anchorOrder={3} label={t.staff}
              notes={[{ id: "g", position: 2, x: 0.3, tone: "focus", label: locale === "tr" ? "Sol" : "G" }, { id: "a", position: 3, x: 0.7, tone: "quiet", label: locale === "tr" ? "La" : "A" }]} />
            <ChatSuggestion className={`ai-suggest${step >= 3 ? " is-in" : ""}`} label={t.suggestion} title={t.suggestionBody} detail={t.suggestionDetail} action={{ label: t.start }} />
          </ChatMessage>
        </div>
        <ChatComposer preview placeholder={t.placeholder} sendLabel={t.send} />
      </div>
    </figure>
  );
}
