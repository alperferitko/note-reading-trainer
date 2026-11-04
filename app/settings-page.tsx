"use client";

import { useEffect, useState } from "react";
import { LearningGoals } from "./learning-goals";
import { PALETTES } from "@/lib/palettes.mjs";
import { pitchAt, pitchName, readNoteNaming, writeNoteNaming, type NoteNaming } from "@/lib/music-pitch.mjs";
import { NOTE_VOICES, readNoteVoice, writeNoteVoice, type NoteVoice } from "@/lib/note-voices";
import { previewNoteVoice } from "@/lib/practice-audio";
import { applyPalette, PaletteEmblem, useMode, usePalette } from "./palette-tools";
import { CommunitySettingsActions } from "./community";
import { clearLocalData } from "./legal-pages";
import "./settings-page.css";

type Locale = "tr" | "en";
type Mode = "system" | "light" | "dark";

const TEXT = {
  tr: {
    title: "Ayarlar", lead: "Görünüm, dil, nota adları ve ses bu cihazda saklanır.",
    look: "Görünüm", colour: "Renk teması", mode: "Mod", modes: { system: "Sistem", light: "Açık", dark: "Koyu" }, compare: "Temaları karşılaştır",
    language: "Dil", languageHelp: "Türkiye dışından açıldığında site İngilizce başlar; buradaki seçim her zaman önceliklidir.",
    names: "Nota adları", namesHelp: "Sorularda, cevap düğmelerinde ve sonuçlarda kullanılır.",
    naming: { auto: "Dile göre", solfege: "Do Re Mi", letters: "C D E" },
    sound: "Ses", soundOn: "Doğru cevapta nota sesi", soundHelp: "Yanlış cevapta ses çalmaz.", listen: "Dinle", on: "Açık", off: "Kapalı",
    data: "Veriler", dataHelp: "İlerlemen, ders durumun ve tercihlerin bu cihazdan silinir. Hesabındaki skorlar etkilenmez.",
    clear: "Bu cihazdaki verileri sil", confirm: "Emin misin? Geri alınamaz.", yes: "Evet, sil", cancel: "Vazgeç", cleared: (n: number) => `${n} kayıt silindi.`,
    account: "Hesap",
  },
  en: {
    title: "Settings", lead: "Appearance, language, note names and sound are kept on this device.",
    look: "Appearance", colour: "Colour theme", mode: "Mode", modes: { system: "System", light: "Light", dark: "Dark" }, compare: "Compare themes",
    language: "Language", languageHelp: "Outside Turkey the site opens in English; the choice made here always wins.",
    names: "Note names", namesHelp: "Used in questions, answer buttons and results.",
    naming: { auto: "Follow language", solfege: "Do Re Mi", letters: "C D E" },
    sound: "Sound", soundOn: "Play the note on a correct answer", soundHelp: "Wrong answers stay silent.", listen: "Listen", on: "On", off: "Off",
    data: "Data", dataHelp: "Your progress, lesson state and preferences are removed from this device. Scores on your account are not affected.",
    clear: "Delete data on this device", confirm: "Are you sure? This cannot be undone.", yes: "Yes, delete", cancel: "Cancel", cleared: (n: number) => `${n} records removed.`,
    account: "Account",
  },
} as const;

const SAMPLE = [0, 1, 2, 3, 4, 5, 6].map((step) => pitchAt(step - 2, "treble"));

export function SettingsPage({ locale, soundEnabled, onToggleSound, onChangeLocale, onNavigate }: {
  locale: Locale; soundEnabled: boolean; onToggleSound: () => void; onChangeLocale: (next: Locale) => void; onNavigate: (target: string) => void;
}) {
  const t = TEXT[locale];
  const palette = usePalette();
  const [mode, setMode] = useMode();
  const [naming, setNaming] = useState<NoteNaming>("auto");
  const [voice, setVoice] = useState<NoteVoice>("piano");
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => { setNaming(readNoteNaming()); setVoice(readNoteVoice()); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function chooseNaming(next: NoteNaming) { writeNoteNaming(next); setNaming(next); }
  function chooseVoice(next: NoteVoice) { writeNoteVoice(next); setVoice(next); previewNoteVoice(next); }

  return (
    <article className="settings-page">
      <header className="settings-head">
        <h1>{t.title}</h1>
        <p>{t.lead}</p>
      </header>

      <section className="settings-section" aria-labelledby="settings-look">
        <h2 id="settings-look">{t.look}</h2>
        <fieldset className="settings-palettes">
          <legend>{t.colour}</legend>
          {PALETTES.map((item) => (
            <label key={item.id} className={palette === item.id ? "is-on" : ""}>
              <input type="radio" name="settings-palette" value={item.id} checked={palette === item.id} onChange={() => applyPalette(item.id)} />
              <span className="settings-swatch" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${item.light.primary} 50%, ${item.dark.primary} 50%)` }} />
              <span className="settings-emblem" style={{ color: item.light.primary }}><PaletteEmblem kind={item.emblem} /></span>
              <span>{item.name[locale]}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="settings-segmented">
          <legend>{t.mode}</legend>
          {(["system", "light", "dark"] as Mode[]).map((m) => (
            <label key={m} className={mode === m ? "is-on" : ""}>
              <input type="radio" name="settings-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />{t.modes[m]}
            </label>
          ))}
        </fieldset>
        <button type="button" className="settings-link" onClick={() => onNavigate("palettes")}>{t.compare}</button>
      </section>

      <section className="settings-section" aria-labelledby="settings-language">
        <h2 id="settings-language">{t.language}</h2>
        <fieldset className="settings-segmented">
          <legend className="sr-only">{t.language}</legend>
          {([["tr", "Türkçe"], ["en", "English"]] as const).map(([id, name]) => (
            <label key={id} className={locale === id ? "is-on" : ""} lang={id}>
              <input type="radio" name="settings-language" value={id} checked={locale === id} onChange={() => onChangeLocale(id)} />{name}
            </label>
          ))}
        </fieldset>
        <p className="settings-help">{t.languageHelp}</p>
      </section>

      <section className="settings-section" aria-labelledby="settings-names">
        <h2 id="settings-names">{t.names}</h2>
        <fieldset className="settings-segmented">
          <legend className="sr-only">{t.names}</legend>
          {(["auto", "solfege", "letters"] as NoteNaming[]).map((id) => (
            <label key={id} className={naming === id ? "is-on" : ""}>
              <input type="radio" name="settings-names" value={id} checked={naming === id} onChange={() => chooseNaming(id)} />{t.naming[id]}
            </label>
          ))}
        </fieldset>
        <p className="settings-names-sample" aria-live="polite">{SAMPLE.map((note) => pitchName(note, locale)).join(" · ")}</p>
        <p className="settings-help">{t.namesHelp}</p>
      </section>

      <section className="settings-section" aria-labelledby="settings-sound">
        <h2 id="settings-sound">{t.sound}</h2>
        <button type="button" role="switch" aria-checked={soundEnabled} className="settings-switch" onClick={onToggleSound}>
          <span>{t.soundOn}<small>{t.soundHelp}</small></span>
          <b>{soundEnabled ? t.on : t.off}</b>
        </button>
        <fieldset className="settings-voices" disabled={!soundEnabled}>
          <legend className="sr-only">{t.sound}</legend>
          {NOTE_VOICES.map((item) => (
            <div key={item.id} className={`settings-voice${voice === item.id ? " is-on" : ""}`}>
              <label>
                <input type="radio" name="settings-voice" value={item.id} checked={voice === item.id} onChange={() => chooseVoice(item.id)} />
                <span>{item.label[locale]}</span>
              </label>
              <button type="button" className="settings-listen" onClick={() => previewNoteVoice(item.id)} aria-label={`${t.listen}: ${item.label[locale]}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10-6.5z" fill="currentColor" /></svg>{t.listen}
              </button>
            </div>
          ))}
        </fieldset>
      </section>

      <LearningGoals locale={locale} />

      <section className="settings-section" aria-labelledby="settings-data">
        <h2 id="settings-data">{t.data}</h2>
        <p className="settings-help">{t.dataHelp}</p>
        <div className="settings-row-actions">
          {!confirming && <button type="button" className="secondary-button" onClick={() => { setConfirming(true); setCleared(null); }}>{t.clear}</button>}
          {confirming && <>
            <p className="settings-confirm">{t.confirm}</p>
            <button type="button" className="danger-button" onClick={() => { setCleared(clearLocalData()); setConfirming(false); }}>{t.yes}</button>
            <button type="button" className="secondary-button" onClick={() => setConfirming(false)}>{t.cancel}</button>
          </>}
          {cleared !== null && <p role="status">{t.cleared(cleared)}</p>}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-account">
        <h2 id="settings-account">{t.account}</h2>
        <CommunitySettingsActions />
      </section>
    </article>
  );
}
