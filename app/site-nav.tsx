"use client";

import { useDropdown } from "./palette-tools";

type Locale = "tr" | "en";
export type StudioLink = { stage: string; href: string; label: string; hint: string };

const TEXT = {
  tr: { studio: "Stüdyo", practise: "Çalış", learn: "Öğren ve izle" },
  en: { studio: "Studio", practise: "Practise", learn: "Learn and track" },
} as const;

/** One "Studio" menu that groups every practice and learning area. */
export function StudioMenu({ locale, practise, learn, active, onGo }: { locale: Locale; practise: StudioLink[]; learn: StudioLink[]; active: boolean; onGo: (stage: string) => void }) {
  const t = TEXT[locale];
  const { open, toggle, close, button, panel, id } = useDropdown();
  const item = (link: StudioLink) => (
    <a key={link.stage} href={link.href} className="studio-menu-item" onClick={(event) => { event.preventDefault(); close(); onGo(link.stage); }}>
      <b>{link.label}</b><span>{link.hint}</span>
    </a>
  );
  return (
    <div className="nav-menu nav-menu--studio">
      <button type="button" className={`nav-text-button${active ? " is-active" : ""}`} ref={button} aria-expanded={open} aria-controls={id} onClick={toggle}>
        {t.studio}
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="nav-panel nav-panel--studio" id={id} ref={panel}>
          <div><p className="studio-menu-group">{t.practise}</p>{practise.map(item)}</div>
          <div><p className="studio-menu-group">{t.learn}</p>{learn.map(item)}</div>
        </div>
      )}
    </div>
  );
}
