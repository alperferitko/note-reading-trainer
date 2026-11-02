"use client";

import { useMemo } from "react";
import type { EvidenceRecord } from "@/lib/practice-evidence.mjs";

type Locale = "tr" | "en";

const TEXT = {
  tr: {
    title: "Hızlı başlangıç",
    beginner: ["Yeni başlayan", "Sol anahtarı, yalnız porte üzerindeki 9 nota"],
    weak: ["Zayıf notaları tekrar et", (n: number) => `Son turlarında takıldığın ${n} nota daha sık sorulur`],
    weakNone: "Henüz tekrar gerektiren nota yok; birkaç tur sonra açılır.",
    last: ["Son ayarlarımla devam", (summary: string) => summary],
    recent: "Son çalışmaların",
    recentNone: "Bu cihazda henüz kayıtlı bir nota okuma turu yok.",
    row: (answers: number, pct: number) => `${answers} cevap · %${pct} doğru`,
    when: (d: Date) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" }),
  },
  en: {
    title: "Quick start",
    beginner: ["Beginner", "Treble clef, only the 9 notes on the staff"],
    weak: ["Review weak notes", (n: number) => `The ${n} notes you got stuck on come up more often`],
    weakNone: "No notes need review yet; this opens after a few rounds.",
    last: ["Continue with my settings", (summary: string) => summary],
    recent: "Your recent practice",
    recentNone: "No note-reading round is saved on this device yet.",
    row: (answers: number, pct: number) => `${answers} answers · ${pct}% correct`,
    when: (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
  },
} as const;

/** Three real presets and the last rounds, above the detailed reading settings. */
export function ReadingQuickStart({ locale, evidence, weakCount, summary, onBeginner, onWeak, onLast }: {
  locale: Locale;
  evidence: EvidenceRecord[];
  weakCount: number;
  summary: string;
  onBeginner: () => void;
  onWeak: () => void;
  onLast: () => void;
}) {
  const t = TEXT[locale];
  const recent = useMemo(() => {
    const sessions = new Map<string, { at: string; answers: number; correct: number }>();
    for (const record of evidence) {
      if (record.module !== "reading") continue;
      const entry = sessions.get(record.session) ?? { at: record.at, answers: 0, correct: 0 };
      entry.answers += 1;
      if (record.correct) entry.correct += 1;
      if (record.at > entry.at) entry.at = record.at;
      sessions.set(record.session, entry);
    }
    return [...sessions.entries()].sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 3);
  }, [evidence]);

  return (
    <section className="quick-start" aria-labelledby="quick-start-h">
      <h2 id="quick-start-h">{t.title}</h2>
      <div className="quick-start-presets">
        <button type="button" onClick={onBeginner}><strong>{t.beginner[0]}</strong><span>{t.beginner[1]}</span></button>
        <button type="button" onClick={onWeak} disabled={weakCount === 0} aria-describedby={weakCount === 0 ? "quick-weak-none" : undefined}>
          <strong>{t.weak[0]}</strong><span>{weakCount ? t.weak[1](weakCount) : t.weakNone}</span>
        </button>
        <button type="button" onClick={onLast}><strong>{t.last[0]}</strong><span>{t.last[1](summary)}</span></button>
      </div>
      {weakCount === 0 && <span id="quick-weak-none" hidden>{t.weakNone}</span>}
      <div className="quick-start-recent">
        <h3>{t.recent}</h3>
        {recent.length === 0 ? <p>{t.recentNone}</p> : (
          <ul>
            {recent.map(([id, s]) => (
              <li key={id}><span>{t.when(new Date(s.at))}</span><b>{t.row(s.answers, Math.round((s.correct / s.answers) * 100))}</b></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
