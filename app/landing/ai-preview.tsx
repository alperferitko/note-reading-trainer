"use client";

import { useEffect, useRef, useState } from "react";
import { Staff } from "./music";

type Locale = "tr" | "en";

const TEXT = {
  tr: {
    student: "Sol ile la'yı hep karıştırıyorum.",
    teacher: "Son turunda sol sorulan 6 notanın 3'üne la dedin. Sol, alttan ikinci çizginin üzerinde; sol anahtarının kıvrımı da bu çizgiyi sarar. La bir adım yukarıda, aralığın içinde.",
    suggestion: "Önerilen alıştırma",
    suggestionBody: "Yalnız sol ve la · 8 soru",
    label: "Örnek önizleme",
    staff: "Sol notası vurgulanmış porte",
    transcript: "Örnek konuşma. Öğrenci: Sol ile la'yı hep karıştırıyorum. Öğretmen: Son turunda sol sorulan 6 notanın 3'üne la dedin. Sol alttan ikinci çizgide, la onun üstündeki aralıkta. Önerilen alıştırma: yalnız sol ve la, 8 soru.",
  },
  en: {
    student: "I keep mixing up G and A.",
    teacher: "In your last round you answered A for 3 of the 6 Gs. G sits on the second line from the bottom; the curl of the treble clef wraps that line. A is one step higher, inside the space.",
    suggestion: "Suggested practice",
    suggestionBody: "Only G and A · 8 questions",
    label: "Sample preview",
    staff: "A staff with the note G highlighted",
    transcript: "Sample conversation. Student: I keep mixing up G and A. Teacher: In your last round you answered A for 3 of the 6 Gs. G is on the second line from the bottom, A in the space above. Suggested practice: only G and A, 8 questions.",
  },
} as const;

/**
 * A picture of the teacher, not a control: nothing inside responds to the pointer or the keyboard.
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
      <div className="ai-preview-body" aria-hidden="true" inert>
        <span className="ai-preview-label">{t.label}</span>
        <div className={`ai-msg ai-msg--you${step >= 1 ? " is-in" : ""}`}>{t.student}</div>
        <div className={`ai-msg ai-msg--teacher${step >= 2 ? " is-in" : ""}`}>
          <span className="ai-typing"><i /><i /><i /></span>
          <p>{t.teacher}</p>
          <Staff space={10} width={360} anchor="ai" anchorOrder={3} label={t.staff}
            notes={[{ id: "g", position: 2, x: 0.3, tone: "focus", label: locale === "tr" ? "Sol" : "G" }, { id: "a", position: 3, x: 0.7, tone: "quiet", label: locale === "tr" ? "La" : "A" }]} />
        </div>
        <div className={`ai-suggest${step >= 3 ? " is-in" : ""}`}>
          <span>{t.suggestion}</span>
          <b>{t.suggestionBody}</b>
        </div>
      </div>
    </figure>
  );
}
