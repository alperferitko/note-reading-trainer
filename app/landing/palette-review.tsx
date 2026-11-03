"use client";

import { PALETTES, contrast } from "@/lib/palettes.mjs";
import { BrandLogo, PaletteEmblem, applyPalette, usePalette } from "../palette-tools";
import { Staff } from "./music";
import "./landing.css";

const TEXT = {
  tr: {
    title: "Renk temaları",
    lead: "Aynı başlık, aynı porte ve aynı düğmeler; yalnız renk ve mod değişir. Her kartta metin ve düğme kontrastı ölçülür.",
    use: "Bu temayı kullan", inUse: "Kullanımda", light: "Açık", dark: "Koyu",
    hero: ["Notaları tanı.", "Müziğini geliştir."], start: "Çalışmaya başla", more: "Stüdyolar",
    staff: "Sol notası vurgulu örnek porte",
    contrast: (text: string, button: string) => `Metin ${text}:1 · düğme ${button}:1`,
    metaNote: "Meta logosu yalnız bu renk temasının adını gösterir; Meta Platforms'un tescilli markasıdır, bir ortaklık anlamına gelmez.",
  },
  en: {
    title: "Colour themes",
    lead: "The same heading, staff and buttons; only colour and mode change. Text and button contrast is measured on every card.",
    use: "Use this theme", inUse: "In use", light: "Light", dark: "Dark",
    hero: ["Read the notes.", "Grow your music."], start: "Start practising", more: "Studios",
    staff: "A sample staff with G highlighted",
    contrast: (text: string, button: string) => `Text ${text}:1 · button ${button}:1`,
    metaNote: "The Meta logo only labels this colour theme; it is a trademark of Meta Platforms and does not imply any partnership.",
  },
} as const;

const fmt = (value: number) => value.toFixed(1);

export function PaletteReview({ locale }: { locale: "tr" | "en"; soundEnabled?: boolean }) {
  const t = TEXT[locale];
  const current = usePalette();
  return (
    <div className="lp palette-review">
      <section className="lp-section" style={{ paddingTop: 48 }} aria-labelledby="palette-review-h">
        <div className="lp-section-head">
          <h1 id="palette-review-h" style={{ fontSize: "clamp(34px, 4vw, 56px)", fontWeight: 600 }}>{t.title}</h1>
          <p>{t.lead}</p>
        </div>
        <div className="palette-rows">
          {PALETTES.map((palette) => (
            <article key={palette.id} className="palette-row" aria-labelledby={`pal-${palette.id}`}>
              <header className="palette-card-head">
                <span className="theme-emblem" style={{ color: palette.light.primary }}><PaletteEmblem kind={palette.emblem} /></span>
                <div>
                  <h2 id={`pal-${palette.id}`}>{palette.name[locale]}</h2>
                  <p>{palette.purpose[locale]}</p>
                </div>
                <button type="button" className={current === palette.id ? "secondary-button" : "primary-button"} onClick={() => applyPalette(palette.id)} aria-pressed={current === palette.id}>
                  {current === palette.id ? t.inUse : t.use}
                </button>
              </header>
              <div className="palette-pair">
                {(["light", "dark"] as const).map((mode) => (
                  <div key={mode} className="palette-card" data-palette={palette.id} data-mode={mode} data-palette-scope="">
                    <div className="palette-card-top">
                      <BrandLogo palette={palette.id} />
                      <span className="palette-mode">{mode === "light" ? t.light : t.dark}</span>
                    </div>
                    <h3 className="palette-hero-title">{t.hero.map((line) => <span key={line}>{line}</span>)}</h3>
                    <Staff space={9} width={360} label={t.staff} notes={[{ id: "a", position: 0, x: 0.2 }, { id: "b", position: 2, x: 0.5, tone: "focus" }, { id: "c", position: 4, x: 0.8, tone: "quiet" }]} />
                    <div className="lp-actions">
                      <span className="primary-button" aria-hidden="true">{t.start}</span>
                      <span className="secondary-button" aria-hidden="true">{t.more}</span>
                    </div>
                    <p className="palette-contrast">{t.contrast(fmt(contrast(palette[mode].foreground, palette[mode].background)), fmt(contrast(palette[mode].onPrimary, palette[mode].primary)))}</p>
                  </div>
                ))}
              </div>
              {palette.id === "meta" && <p className="palette-contrast">{t.metaNote}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
