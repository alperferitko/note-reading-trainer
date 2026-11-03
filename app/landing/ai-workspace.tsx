"use client";
/* eslint-disable @next/next/no-img-element -- Relative public assets must work on both the custom domain and GitHub Pages subpath. */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { lastSession, planNext, readGoal } from "@/lib/practice-plan.mjs";
import type { EvidenceRecord } from "@/lib/practice-evidence.mjs";
import { readMusicXml, practiceEvents, MusicXmlError, MAX_FILE_BYTES } from "@/lib/musicxml.mjs";
import { ODE_SOURCE, ODE_VOICES, voiceBars, voiceMusicXml, satbMusicXml, stepNote } from "@/lib/samples/ode-satb.mjs";
import { ScoreView } from "../score-workspace";
import { AiIcon } from "./ai-icon";
import { TeacherDemo, type TeacherAction } from "./teacher-demo";
import { AITeacher, liveTeacherConfigured } from "../ai-teacher";
import "./landing.css";

type Locale = "tr" | "en";
type Mode = "score" | "review" | "ask";
type VoiceId = "soprano" | "alto" | "tenor" | "bass";
type Note = { step: string; alter: number; octave: number; beats: number; slur: string | null };
type Corrections = Record<string, Partial<Note>>;
type FileState =
  | { status: "selected" | "reading"; name: string; size: number }
  | { status: "ready"; name: string; size: number; xml: string; bars: number; parts: number }
  | { status: "unsupported" | "error"; name: string; size: number; message: string };

const NAMES = { tr: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"], en: ["C", "D", "E", "F", "G", "A", "B"] } as const;
const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const SIGN: Record<number, string> = { 1: "♯", [-1]: "♭" };
const DUR: Record<number, string> = { 0.5: "♪", 1: "♩", 1.5: "♩.", 2: "𝅗𝅥", 3: "𝅗𝅥." };

const TEXT = {
  tr: {
    title: "Bugün ne çalışmak istersin?",
    lead: "Bir partisyon ekle, son çalışmanı incele veya takıldığın notayı sor.",
    entries: {
      score: ["Partisyon ekle", "Kaynak sayfa, dijital sonuç, kontrol ve ölçü seçimi"],
      review: ["Son çalışmamı yorumla", "Bu cihazdaki gerçek çalışma kayıtlarından"],
      ask: ["Öğretmene sor", "Hazır konular ve gerçek alıştırma önerileri"],
    },
    back: "Diğer seçenekler",
    // score
    steps: ["Kaynak", "Kontrol", "Ölçüleri seç"],
    pickH: "Hangi partisyonla çalışalım?",
    sampleH: "Örnek: Ode to Joy",
    sampleP: "Beethoven, dört sesli koral düzenlemesi (SATB). Mutopia Project #528, dizgi Peter Chubb, Public Domain.",
    sampleGo: "Bu partisyonu aç",
    ownH: "Kendi dosyan",
    ownP: "MusicXML (.musicxml, .xml) hemen açılır. PDF ve fotoğraf için sayfa tanıma bu sürümde bağlı değil.",
    ownGo: "Dosya seç",
    sourceLabel: "Kaynak PDF",
    sourceAlt: "Ode to Joy, Mutopia #528 partisyonunun ilk sayfası: dört ses, iki porte, 16 ölçü",
    sourceOpen: "PDF'yi aç",
    pageFail: "Sayfa görüntüsü yüklenemedi. Kaynağı PDF olarak açabilirsin.",
    digitalLabel: "Dijital sonuç",
    digitalLoading: "Nota çiziliyor…",
    digitalFail: "Nota çizilemedi. Sayfayı yenileyip yeniden dene.",
    provenance: "Önceden işlenmiş sonuç. Kaynağın LilyPond dosyasıyla nota nota karşılaştırıldı: 4 ses, 16 ölçü, 0 fark. Bu bir sayfa tanıma çıktısı değildir; tanıma servisi henüz bağlı değil.",
    voiceH: "Bu düzenleme dört seslidir. NotaNota bir seferde bir sesi çalıştırır; hangisiyle başlayalım?",
    voiceNote: "Diğer sesler silinmez; istediğin zaman başka bir ses seçebilirsin.",
    toCheck: "Devam: kontrol et",
    checkH: (v: string) => `${v} partisini kontrol et`,
    checkWarn: "NotaNota bazen hata yapabilir; çalışmaya başlamadan önce kontrol et.",
    checkHelp: "Yanlış görünen bir notaya dokun; bir basamak yukarı ya da aşağı taşıyabilirsin.",
    bar: (n: number) => `${n}. ölçü`,
    up: "Bir basamak yukarı", down: "Bir basamak aşağı", undo: "Geri al", close: "Kapat",
    fixes: (n: number) => (n ? `${n} düzeltme yapıldı` : "Düzeltme yok"),
    toReady: "Doğru görünüyor, devam et",
    readyH: "Hangi ölçüleri çalışalım?",
    from: "Başlangıç ölçüsü", to: "Bitiş ölçüsü",
    readySum: (v: string, a: number, b: number, n: number) => `${v} · ${a}–${b}. ölçüler · ${n} nota`,
    practise: "Bu ölçüleri çalış",
    restart: "Baştan seç",
    // own file
    selected: "Dosya seçildi", reading: "Okunuyor…",
    readyFile: (bars: number, parts: number) => `${parts} parti, ${bars} ölçü okundu.`,
    openFile: "Çalışma alanında aç",
    unsupported: "Sayfa tanıma (PDF, fotoğraf) bu sürümde bağlı değil. Dosyan cihazından çıkmadı ve hiçbir yere gönderilmedi. Şimdilik bir MusicXML dosyası açabilirsin.",
    tooLarge: "Dosya 2 MB sınırından büyük.",
    badXml: "Bu dosya okunamadı. Sıkıştırılmamış bir MusicXML dosyası olduğundan emin ol.",
    another: "Başka dosya seç",
    // review
    reviewH: "Son çalışman",
    empty: "Henüz bir çalışma kaydın yok. Kısa bir turla başlayabilirsin.",
    quick: "Kısa bir tura başla", studio: "Stüdyoya git",
    lastLine: (n: number, pct: number, sec: string | null, when: string) => `${when}: ${n} cevap, %${pct} doğru${sec ? `, ortalama ${sec} saniye` : ""}.`,
    misses: "En çok karıştırdığın notalar",
    noMisses: "Bu turda yanlış cevap yok.",
    ruleNote: "Bu değerlendirme kurallarla, yalnız kayıtlı cevaplarından yapıldı; yapay zeka kullanılmadı.",
    next: "Önerilen alıştırma", doNext: "Bu alıştırmayı başlat",
    when: (d: Date) => { const days = Math.floor((Date.now() - d.getTime()) / 86400000); return days <= 0 ? "Bugün" : days === 1 ? "Dün" : `${days} gün önce`; },
    // ask
    askNote: "Bu konuşmalar hazırlanmış örneklerdir; önerdikleri alıştırmalar gerçekten başlar.",
    askLive: "Öğretmen son çalışmanın ölçümlerini yorumlar. Meta Model API’ye yalnız toplu ölçümler gider (bağlam, doğruluk, süre); cevapların, e-postan ve kullanıcı adın gönderilmez. Yanıt bu ölçümlerle doğrulanmadan gösterilmez.",
    askNone: "Henüz bu cihazda bir çalışma kaydı yok. Kısa bir tur çalışınca öğretmen onu yorumlayabilir.",
  },
  en: {
    title: "What would you like to practise today?",
    lead: "Add a score, look at your last practice, or ask about the note you are stuck on.",
    entries: {
      score: ["Add a score", "Source page, digital result, check and bar choice"],
      review: ["Review my last practice", "From the real practice records on this device"],
      ask: ["Ask the teacher", "Prepared topics and real exercise suggestions"],
    },
    back: "Other options",
    steps: ["Source", "Check", "Choose bars"],
    pickH: "Which score shall we work on?",
    sampleH: "Sample: Ode to Joy",
    sampleP: "Beethoven, four-part hymn setting (SATB). Mutopia Project #528, typeset by Peter Chubb, Public Domain.",
    sampleGo: "Open this score",
    ownH: "Your own file",
    ownP: "MusicXML (.musicxml, .xml) opens straight away. Page recognition for PDF and photos is not connected in this version.",
    ownGo: "Choose a file",
    sourceLabel: "Source PDF",
    sourceAlt: "First page of Ode to Joy, Mutopia #528: four voices on two staves, 16 bars",
    sourceOpen: "Open the PDF",
    pageFail: "The page image could not load. You can open the source as a PDF.",
    digitalLabel: "Digital result",
    digitalLoading: "Drawing the score…",
    digitalFail: "The score could not be drawn. Reload the page and try again.",
    provenance: "Prepared result. Checked note by note against the source's LilyPond file: 4 voices, 16 bars, 0 differences. This is not a page-recognition output; recognition is not connected yet.",
    voiceH: "This setting has four voices. NotaNota practises one voice at a time; which one first?",
    voiceNote: "The other voices are kept; you can pick another one at any time.",
    toCheck: "Next: check it",
    checkH: (v: string) => `Check the ${v} part`,
    checkWarn: "NotaNota can make mistakes; check before you start practising.",
    checkHelp: "Tap a note that looks wrong; you can move it one step up or down.",
    bar: (n: number) => `Bar ${n}`,
    up: "One step up", down: "One step down", undo: "Undo", close: "Close",
    fixes: (n: number) => (n ? `${n} correction${n > 1 ? "s" : ""} made` : "No corrections"),
    toReady: "Looks right, continue",
    readyH: "Which bars shall we practise?",
    from: "First bar", to: "Last bar",
    readySum: (v: string, a: number, b: number, n: number) => `${v} · bars ${a}–${b} · ${n} notes`,
    practise: "Practise these bars",
    restart: "Start again",
    selected: "File chosen", reading: "Reading…",
    readyFile: (bars: number, parts: number) => `Read ${parts} part${parts > 1 ? "s" : ""}, ${bars} bars.`,
    openFile: "Open in the workspace",
    unsupported: "Page recognition (PDF, photos) is not connected in this version. Your file stayed on your device and was not sent anywhere. For now you can open a MusicXML file.",
    tooLarge: "The file is larger than the 2 MB limit.",
    badXml: "This file could not be read. Make sure it is an uncompressed MusicXML file.",
    another: "Choose another file",
    reviewH: "Your last practice",
    empty: "No practice recorded yet. You can start with a short round.",
    quick: "Start a short round", studio: "Go to the studio",
    lastLine: (n: number, pct: number, sec: string | null, when: string) => `${when}: ${n} answers, ${pct}% correct${sec ? `, ${sec} s on average` : ""}.`,
    misses: "Notes you mixed up most",
    noMisses: "No wrong answers in this round.",
    ruleNote: "This review uses rules on your recorded answers only; no AI was used.",
    next: "Suggested exercise", doNext: "Start this exercise",
    when: (d: Date) => { const days = Math.floor((Date.now() - d.getTime()) / 86400000); return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`; },
    askNote: "These conversations are prepared samples; the exercises they suggest really start.",
    askLive: "The teacher comments on the measurements of your last practice. Only aggregate measurements go to the Meta Model API (context, accuracy, timing); your answers, email and username are not sent. An answer is shown only after it is checked against those measurements.",
    askNone: "There is no practice record on this device yet. Practise a short round and the teacher can comment on it.",
  },
} as const;

function noteName(n: { step: string; alter: number; octave: number }, locale: Locale) {
  return `${NAMES[locale][STEPS.indexOf(n.step)]}${SIGN[n.alter] ?? ""}${n.octave}`;
}

function midiName(midi: number, locale: Locale) {
  const pcs = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6], alt = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const pc = midi % 12;
  return `${NAMES[locale][pcs[pc]]}${alt[pc] ? "♯" : ""}${Math.floor(midi / 12) - 1}`;
}

/** Partisyon ekle: source page → digital result → check and correct → choose bars → practise. */
function ScoreFlow({ locale, onPractise }: { locale: Locale; onPractise: (xml: string, from: number, to: number) => void }) {
  const t = TEXT[locale];
  const [stage, setStage] = useState<"pick" | "source" | "check" | "ready">("pick");
  const [pageLoaded, setPageLoaded] = useState(false);
  const [pageFailed, setPageFailed] = useState(false);
  const [voice, setVoice] = useState<VoiceId>("soprano");
  const [fixes, setFixes] = useState<Corrections>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [range, setRange] = useState<[number, number]>([1, 4]);
  const [file, setFile] = useState<FileState | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLImageElement>(null);

  useEffect(() => { if (stage !== "pick") heading.current?.focus({ preventScroll: false }); }, [stage]);
  // A cached page can finish loading before React attaches onLoad.
  useEffect(() => { if (stage === "source" && page.current?.complete && page.current.naturalWidth) { const timer = window.setTimeout(() => setPageLoaded(true), 0); return () => window.clearTimeout(timer); } }, [stage]);

  const satb = useMemo(() => satbMusicXml(locale), [locale]);
  const bars = useMemo(() => voiceBars(voice, fixes) as Note[][], [voice, fixes]);
  const voiceXml = useMemo(() => voiceMusicXml(voice, { corrections: fixes, locale }), [voice, fixes, locale]);
  const voiceName = ODE_VOICES.find((v) => v.id === voice)!.name[locale];
  const fixCount = Object.keys(fixes).length;
  const noteCount = bars.slice(range[0] - 1, range[1]).flat().length;

  function move(key: string, note: Note, steps: number) {
    const original = (voiceBars(voice) as Note[][])[Number(key.split(":")[0])][Number(key.split(":")[1])];
    const next = stepNote(note, steps) as Note;
    setFixes((old) => {
      const copy = { ...old };
      if (next.step === original.step && next.octave === original.octave && next.alter === original.alter) delete copy[key];
      else copy[key] = { step: next.step, octave: next.octave, alter: next.alter };
      return copy;
    });
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    const base = { name: chosen.name, size: chosen.size };
    setFile({ status: "selected", ...base });
    if (!/\.(musicxml|xml)$/i.test(chosen.name)) { setFile({ status: "unsupported", ...base, message: t.unsupported }); return; }
    if (chosen.size > MAX_FILE_BYTES) { setFile({ status: "error", ...base, message: t.tooLarge }); return; }
    setFile({ status: "reading", ...base });
    try {
      const text = await chosen.text();
      const score = readMusicXml(text);
      const measures = practiceEvents(score.parts[0], 1);
      setFile({ status: "ready", ...base, xml: text, bars: measures.length, parts: score.parts.length });
    } catch (err) {
      setFile({ status: "error", ...base, message: err instanceof MusicXmlError ? t.badXml : t.badXml });
    }
  }

  const stepIndex = stage === "source" ? 0 : stage === "check" ? 1 : stage === "ready" ? 2 : -1;

  return (
    <div className="aiw-flow">
      {stepIndex >= 0 && (
        <ol className="aiw-steps" aria-label={t.entries.score[0]}>
          {t.steps.map((label, i) => <li key={label} className={i === stepIndex ? "is-on" : i < stepIndex ? "is-done" : ""} aria-current={i === stepIndex ? "step" : undefined}><span>{i + 1}</span>{label}</li>)}
        </ol>
      )}

      {stage === "pick" && (
        <div className="aiw-pick">
          <h2 className="aiw-h">{t.pickH}</h2>
          <div className="aiw-pick-grid">
            <article className="aiw-card">
              <img className="aiw-thumb" src="./samples/ode-to-joy-mutopia-528-page-760.webp" width={760} height={1074} alt="" loading="lazy" />
              <h3>{t.sampleH}</h3>
              <p>{t.sampleP}</p>
              <button type="button" className="primary-button" onClick={() => { setStage("source"); }}>{t.sampleGo}</button>
            </article>
            <article className="aiw-card">
              <div className="aiw-drop" aria-hidden="true"><AiIcon size={40} /></div>
              <h3>{t.ownH}</h3>
              <p>{t.ownP}</p>
              <input ref={fileInput} className="sr-only" type="file" accept=".musicxml,.xml,.pdf,.png,.jpg,.jpeg,application/pdf,image/*" onChange={onFile} tabIndex={-1} />
              <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>{t.ownGo}</button>
              {file && (
                <div className={`aiw-file aiw-file--${file.status}`} role="status" aria-live="polite">
                  <b>{file.name}</b> <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                  {file.status === "selected" && <p>{t.selected}</p>}
                  {file.status === "reading" && <p className="aiw-busy"><i /> {t.reading}</p>}
                  {file.status === "ready" && <><p>{t.readyFile(file.bars, file.parts)}</p><button type="button" className="primary-button" onClick={() => onPractise(file.xml, 1, Math.max(1, file.bars))}>{t.openFile}</button></>}
                  {(file.status === "unsupported" || file.status === "error") && <><p>{file.message}</p><button type="button" className="ghost-button" onClick={() => fileInput.current?.click()}>{t.another}</button></>}
                </div>
              )}
            </article>
          </div>
        </div>
      )}

      {stage === "source" && (
        <section aria-labelledby="aiw-source-h">
          <h2 className="aiw-h" id="aiw-source-h" ref={heading} tabIndex={-1}>{ODE_SOURCE.title} · {t.steps[0]}</h2>
          <div className="aiw-compare">
            <figure className="aiw-paper">
              <figcaption><span className="pdf-chip">{t.sourceLabel}</span> Mutopia #{ODE_SOURCE.mutopiaId} · {ODE_SOURCE.licence}</figcaption>
              <div className="aiw-sheet">
                {!pageLoaded && !pageFailed && <span className="sk aiw-sheet-sk" aria-hidden="true" />}
                <img ref={page} src="./samples/ode-to-joy-mutopia-528-page-1240.webp" srcSet="./samples/ode-to-joy-mutopia-528-page-760.webp 760w, ./samples/ode-to-joy-mutopia-528-page-1240.webp 1240w" sizes="(max-width: 960px) 92vw, 46vw" width={1240} height={1753} alt={t.sourceAlt} onLoad={() => setPageLoaded(true)} onError={() => setPageFailed(true)} style={{ opacity: pageLoaded ? 1 : 0 }} />
                {pageFailed && <p className="aiw-sheet-fail" role="status">{t.pageFail}</p>}
              </div>
              <a className="ghost-button" href="./samples/ode-to-joy-mutopia-528.pdf" target="_blank" rel="noopener">{t.sourceOpen}</a>
            </figure>
            <figure className="aiw-digital">
              <figcaption><span className="pdf-chip">{t.digitalLabel}</span> 4 · 16</figcaption>
              <ScoreView xml={satb} label={t.digitalLoading} failLabel={t.digitalFail} />
            </figure>
          </div>
          <p className="aiw-provenance">{t.provenance}</p>
          <fieldset className="aiw-voices">
            <legend>{t.voiceH}</legend>
            <div>
              {ODE_VOICES.map((v) => (
                <label key={v.id} className={voice === v.id ? "is-on" : ""}>
                  <input type="radio" name="aiw-voice" value={v.id} checked={voice === v.id} onChange={() => { setVoice(v.id as VoiceId); setFixes({}); setEditing(null); }} />
                  {v.name[locale]} <small>{v.clef === "bass" ? (locale === "tr" ? "fa anahtarı" : "bass clef") : (locale === "tr" ? "sol anahtarı" : "treble clef")}</small>
                </label>
              ))}
            </div>
            <p>{t.voiceNote}</p>
          </fieldset>
          <div className="lp-actions">
            <button type="button" className="primary-button" onClick={() => setStage("check")}>{t.toCheck}</button>
            <button type="button" className="ghost-button" onClick={() => setStage("pick")}>{t.restart}</button>
          </div>
        </section>
      )}

      {stage === "check" && (
        <section aria-labelledby="aiw-check-h">
          <h2 className="aiw-h" id="aiw-check-h" ref={heading} tabIndex={-1}>{t.checkH(voiceName)}</h2>
          <p className="aiw-warn">{t.checkWarn}</p>
          <p className="aiw-help">{t.checkHelp} <b>{t.fixes(fixCount)}</b></p>
          <div className="aiw-single"><ScoreView xml={voiceXml} label={t.digitalLoading} failLabel={t.digitalFail} /></div>
          <ol className="aiw-bars">
            {bars.map((notes, b) => (
              <li key={b}>
                <span className="aiw-bar-no">{t.bar(b + 1)}</span>
                <div>
                  {notes.map((n, i) => {
                    const key = `${b}:${i}`;
                    const fixed = key in fixes;
                    return (
                      <span key={key} className="aiw-note-wrap">
                        <button type="button" className={`aiw-note${fixed ? " is-fixed" : ""}${editing === key ? " is-open" : ""}`} aria-expanded={editing === key} onClick={() => setEditing(editing === key ? null : key)}>
                          {noteName(n, locale)} <small aria-hidden="true">{DUR[n.beats] ?? ""}</small>
                        </button>
                        {editing === key && (
                          <span className="aiw-edit" role="group" aria-label={`${t.bar(b + 1)}, ${noteName(n, locale)}`}>
                            <button type="button" onClick={() => move(key, n, 1)} aria-label={t.up}>▲</button>
                            <button type="button" onClick={() => move(key, n, -1)} aria-label={t.down}>▼</button>
                            {fixed && <button type="button" onClick={() => setFixes((old) => { const c = { ...old }; delete c[key]; return c; })}>{t.undo}</button>}
                            <button type="button" onClick={() => setEditing(null)}>{t.close}</button>
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
          <div className="lp-actions">
            <button type="button" className="primary-button" onClick={() => { setEditing(null); setStage("ready"); }}>{t.toReady}</button>
            <button type="button" className="ghost-button" onClick={() => setStage("source")}>{t.steps[0]}</button>
          </div>
        </section>
      )}

      {stage === "ready" && (
        <section aria-labelledby="aiw-ready-h">
          <h2 className="aiw-h" id="aiw-ready-h" ref={heading} tabIndex={-1}>{t.readyH}</h2>
          <div className="aiw-range">
            <label>{t.from}
              <select value={range[0]} onChange={(e) => { const a = Number(e.target.value); setRange(([, b]) => [a, Math.max(a, b)]); }}>
                {bars.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </label>
            <label>{t.to}
              <select value={range[1]} onChange={(e) => { const b = Number(e.target.value); setRange(([a]) => [Math.min(a, b), b]); }}>
                {bars.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </label>
          </div>
          <p className="aiw-sum">{t.readySum(voiceName, range[0], range[1], noteCount)} · {t.fixes(fixCount)}</p>
          <div className="lp-actions">
            <button type="button" className="primary-button lp-start" onClick={() => onPractise(voiceXml, range[0], range[1])}>{t.practise}</button>
            <button type="button" className="ghost-button" onClick={() => setStage("check")}>{t.steps[1]}</button>
            <button type="button" className="ghost-button" onClick={() => { setStage("pick"); setFixes({}); }}>{t.restart}</button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Son çalışmamı yorumla: only what the device recorded, read by rules. */
function ReviewFlow({ locale, evidence, onQuickStart, onStartPlan, onStudio }: { locale: Locale; evidence: EvidenceRecord[]; onQuickStart: () => void; onStartPlan: (plan: ReturnType<typeof planNext>) => void; onStudio: () => void }) {
  const t = TEXT[locale];
  const last = useMemo(() => lastSession(evidence), [evidence]);
  const plan = useMemo(() => planNext(evidence, readGoal(), locale), [evidence, locale]);
  const misses = useMemo(() => {
    if (!last) return [];
    const counts = new Map<string, number>();
    for (const row of evidence as (EvidenceRecord & { midi?: number })[]) {
      if (row.session !== last.session || row.correct) continue;
      const label = typeof row.midi === "number" ? midiName(row.midi, locale) : row.item;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [evidence, last, locale]);
  if (!last) return (
    <section className="aiw-review" aria-labelledby="aiw-review-h">
      <h2 className="aiw-h" id="aiw-review-h">{t.reviewH}</h2>
      <p className="aiw-empty">{t.empty}</p>
      <div className="lp-actions">
        <button type="button" className="primary-button" onClick={onQuickStart}>{t.quick}</button>
        <button type="button" className="ghost-button" onClick={onStudio}>{t.studio}</button>
      </div>
    </section>
  );
  const sec = last.averageMs ? (last.averageMs / 1000).toFixed(1).replace(".", locale === "tr" ? "," : ".") : null;
  return (
    <section className="aiw-review" aria-labelledby="aiw-review-h">
      <h2 className="aiw-h" id="aiw-review-h">{t.reviewH}</h2>
      <p className="aiw-last">{t.lastLine(last.answers, Math.round(last.accuracy * 100), sec, t.when(new Date(last.at)))}</p>
      <div className="aiw-review-grid">
        <div className="aiw-panel">
          <h3>{t.misses}</h3>
          {misses.length ? <ul className="aiw-misses">{misses.map(([label, n]) => <li key={label}><b>{label}</b><span>{n}×</span></li>)}</ul> : <p>{t.noMisses}</p>}
        </div>
        <div className="aiw-panel aiw-panel--next">
          <h3>{t.next}</h3>
          <p className="aiw-plan-title">{plan.title}</p>
          <p>{plan.reason}</p>
          <button type="button" className="primary-button" onClick={() => onStartPlan(plan)}>{t.doNext}</button>
        </div>
      </div>
      <p className="lp-small">{t.ruleNote}</p>
    </section>
  );
}

/** The real teacher (staging builds only): the last session's own records, nothing invented when there are none. */
function LiveAsk({ locale, evidence, onQuickStart, onStartPlan, onStudio }: { locale: Locale; evidence: EvidenceRecord[]; onQuickStart: () => void; onStartPlan: (plan: ReturnType<typeof planNext>) => void; onStudio: () => void }) {
  const t = TEXT[locale];
  const last = useMemo(() => lastSession(evidence), [evidence]);
  if (!last) return <><p className="aiw-help">{t.askLive}</p><p className="aiw-empty">{t.askNone}</p><button type="button" className="primary-button" onClick={onQuickStart}>{t.quick}</button></>;
  return <>
    <p className="aiw-help">{t.askLive}</p>
    <AITeacher locale={locale} session={last.session} evidence={evidence} module={last.module === 'score' ? 'score' : 'reading'}
      onRepeat={onQuickStart} onProgress={onStudio} onPractiseWeak={() => onStartPlan(planNext(evidence, readGoal(), locale))} />
  </>;
}

export function AiWorkspace({ locale, evidence, owner, onQuickStart, onStartPlan, onPractiseRange, onStudio, onTeacherAction }: {
  locale: Locale; evidence: EvidenceRecord[]; owner: string | null;
  onQuickStart: () => void; onStartPlan: (plan: ReturnType<typeof planNext>) => void;
  onPractiseRange: (xml: string, from: number, to: number) => void; onStudio: () => void; onTeacherAction: (action: TeacherAction) => void;
}) {
  const t = TEXT[locale];
  const [mode, setMode] = useState<Mode | null>(null);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mode) area.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }, [mode]);
  return (
    <div className="lp aiw">
      <header className="aiw-head">
        <span className="aiw-mark"><AiIcon size={56} /></span>
        <div>
          <h1>{t.title}</h1>
          <p>{t.lead}</p>
        </div>
      </header>
      <div className={`aiw-entries${mode ? " is-compact" : ""}`} role="group" aria-label={t.title}>
        {(Object.keys(t.entries) as Mode[]).map((id) => (
          <button key={id} type="button" className={`aiw-entry${mode === id ? " is-on" : ""}`} aria-pressed={mode === id} onClick={() => setMode(id)}>
            <b>{t.entries[id][0]}</b><span>{t.entries[id][1]}</span>
          </button>
        ))}
      </div>
      <div ref={area} className="aiw-area" aria-live="polite">
        {mode === "score" && <ScoreFlow locale={locale} onPractise={onPractiseRange} />}
        {mode === "review" && <ReviewFlow locale={locale} evidence={evidence} onQuickStart={onQuickStart} onStartPlan={onStartPlan} onStudio={onStudio} />}
        {mode === "ask" && (
          <section aria-label={t.entries.ask[0]}>
            {liveTeacherConfigured ? <LiveAsk locale={locale} evidence={evidence} onQuickStart={onQuickStart} onStartPlan={onStartPlan} onStudio={onStudio} /> : <>
              <p className="aiw-help">{t.askNote}</p>
              <TeacherDemo locale={locale} owner={owner} variant="full" onAction={onTeacherAction} />
            </>}
          </section>
        )}
      </div>
    </div>
  );
}
