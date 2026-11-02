"use client";

import { TeacherDemo, type TeacherAction } from "./teacher-demo";
import "./landing.css";

const TEXT = {
  tr: {
    title: "NotaNota AI öğretmen",
    lead: "Öğretmen, çalışmanda ölçülen hatalara bakıp açıklama yapar ve sıradaki alıştırmayı önerir. Bu sayfadaki konuşmalar hazırlanmış örneklerdir; önerilen alıştırmalar ve çalışma planın ise gerçekten çalışır.",
    honest: [
      "Örnekteki cevaplar senin çalışmanı yorumlamaz.",
      "Kendi oturum sonucunda, ölçümlere dayanan geri bildirimi sonuç ekranında görürsün.",
      "Öğretmen çalmadığın notalar, yapmadığın hatalar ya da ölçülmeyen ritim hakkında bir şey söylemez.",
    ],
    practise: "Nota okuma stüdyosuna dön",
  },
  en: {
    title: "NotaNota AI teacher",
    lead: "The teacher looks at the mistakes measured in your practice, explains them and suggests the next exercise. The conversations on this page are prepared samples; the exercises they suggest and your practice plan really work.",
    honest: [
      "The sample answers do not comment on your own practice.",
      "After your own session, feedback based on its measurements appears on the results screen.",
      "The teacher says nothing about notes you did not play, mistakes you did not make, or rhythm that was not measured.",
    ],
    practise: "Back to the note-reading studio",
  },
} as const;

export function TeacherPage({ locale, owner, onAction, onPractise }: { locale: "tr" | "en"; owner: string | null; onAction: (action: TeacherAction) => void; onPractise: () => void }) {
  const t = TEXT[locale];
  return (
    <div className="lp lp-teacher-page">
      <section className="lp-section lp-ai" aria-labelledby="teacher-page-h" style={{ paddingTop: 48 }}>
        <div className="lp-section-head">
          <h1 id="teacher-page-h" style={{ fontSize: "clamp(34px, 4vw, 56px)", lineHeight: 1.05, fontWeight: 600 }}>{t.title}</h1>
          <p>{t.lead}</p>
          <ul className="lp-honest">{t.honest.map((line) => <li key={line}>{line}</li>)}</ul>
          <button type="button" className="lp-textlink" onClick={onPractise}>{t.practise}</button>
        </div>
        <TeacherDemo locale={locale} owner={owner} variant="full" onAction={onAction} />
      </section>
    </div>
  );
}
