"use client";

import { Staff } from "./music";
import "./landing.css";

type Locale = "tr" | "en";

/**
 * Placeholder shaped like the content that is loading. It is announced once as busy; the shapes
 * themselves are hidden from assistive technology so they are not read as content.
 */
export function Skeleton({ kind, locale }: { kind: "studio" | "score" | "panel" | "chat"; locale: Locale }) {
  const label = locale === "tr" ? "Yükleniyor" : "Loading";
  return (
    <section className={`skeleton skeleton--${kind}`} aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        <i className="sk sk-title" />
        <i className="sk sk-line" />
        <i className="sk sk-line sk-short" />
        {kind === "score" || kind === "studio" ? <i className="sk sk-stage" /> : null}
        <div className="sk-row">
          <i className="sk sk-card" /><i className="sk sk-card" /><i className="sk sk-card" />
        </div>
      </div>
    </section>
  );
}

const NF = {
  tr: { title: "Bu sayfa ritmi kaçırmış.", body: "Aradığın adres burada değil. Taşınmış ya da hiç var olmamış olabilir; çalışman yerinde duruyor.", home: "Ana sayfaya dön", studio: "Stüdyoya git", staff: "Porteden dışarı kaçmış tek bir nota" },
  en: { title: "This page lost the beat.", body: "The address you looked for is not here. It may have moved or never existed; your practice is safe.", home: "Back to home", studio: "Go to the studio", staff: "A single note that slipped off the staff" },
} as const;

export function NotFound({ locale, onHome, onStudio }: { locale: Locale; onHome: () => void; onStudio: () => void }) {
  const t = NF[locale];
  return (
    <div className="lp nf">
      <section className="nf-card" aria-labelledby="nf-title">
        <div className="nf-stage">
          <Staff space={14} width={420} label={t.staff} notes={[{ id: "a", position: 2, x: 0.18 }, { id: "b", position: 4, x: 0.42 }, { id: "c", position: 6, x: 0.66 }]} />
          <span className="nf-lost" aria-hidden="true">
            <svg viewBox="0 0 40 64"><ellipse cx="14" cy="52" rx="10" ry="7" transform="rotate(-22 14 52)" fill="currentColor" /><path d="M23 50V6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
          </span>
        </div>
        <p className="nf-code" aria-hidden="true">404</p>
        <h1 id="nf-title">{t.title}</h1>
        <p>{t.body}</p>
        <div className="lp-actions">
          <button type="button" className="primary-button" onClick={onHome}>{t.home}</button>
          <button type="button" className="secondary-button" onClick={onStudio}>{t.studio}</button>
        </div>
      </section>
    </div>
  );
}
