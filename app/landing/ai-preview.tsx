"use client";

import { useEffect, useState } from "react";
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
 * The conversation plays in on its own; with reduced motion it is shown complete. Assistive
 * technology gets the transcript once instead of a looping stream.
 */
export function AiPreview({ locale }: { locale: Locale }) {
  const t = TEXT[locale];
  const [step, setStep] = useState(3);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let current = 0;
    const timers: number[] = [];
    const cycle = () => {
      current = 0;
      setStep(0);
      [900, 2600, 4600].forEach((delay, i) => timers.push(window.setTimeout(() => { current = i + 1; setStep(current); }, delay)));
    };
    const start = window.setTimeout(cycle, 600);
    const loop = window.setInterval(cycle, 13000);
    return () => { window.clearTimeout(start); window.clearInterval(loop); timers.forEach((id) => window.clearTimeout(id)); };
  }, []);

  return (
    <figure className="ai-preview" data-clef-host="">
      <figcaption className="sr-only">{t.transcript}</figcaption>
      <div className="ai-preview-body" aria-hidden="true" inert>
        <span className="ai-preview-label">{t.label}</span>
        <div className={`ai-msg ai-msg--you${step >= 1 ? " is-in" : ""}`}>{t.student}</div>
        <div className={`ai-msg ai-msg--teacher${step >= 2 ? " is-in" : ""}`}>
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
