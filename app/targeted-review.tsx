"use client";

import { useEffect, useState } from 'react';
import { EVIDENCE_EVENT, analyzeItems, readEvidence, type EvidenceRecord, type ItemSummary } from '@/lib/practice-evidence.mjs';
import { LETTERS, SOLFEGE, namesLocale, pitchAt, pitchName } from '@/lib/music-pitch.mjs';
import './targeted-review.css';

type Locale = 'tr' | 'en';

/** Live view of this browser's question evidence. */
export function useEvidence() {
  const [rows, setRows] = useState<EvidenceRecord[]>([]);
  useEffect(() => {
    const update = () => setRows(readEvidence());
    update();
    window.addEventListener(EVIDENCE_EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(EVIDENCE_EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return rows;
}

/** Canonical stored answers ("F#") are shown in the learner's note-name system. */
export function answerLabel(answer: string | null | undefined, locale: Locale) {
  if (!answer) return '';
  const match = /^([A-G])([#b]?)$/.exec(answer);
  if (!match) return answer;
  const index = LETTERS.indexOf(match[1]);
  return `${namesLocale(locale) === 'tr' ? SOLFEGE[index] : LETTERS[index]}${match[2] === '#' ? '♯' : match[2] === 'b' ? '♭' : ''}`;
}

export function clefLabel(clef: string | undefined, locale: Locale) {
  if (clef === 'bass') return locale === 'tr' ? 'fa anahtarı' : 'bass clef';
  return locale === 'tr' ? 'sol anahtarı' : 'treble clef';
}

/** A written note label with its octave and clef, e.g. "Fa♯4 · sol anahtarı". */
export function writtenNoteLabel(item: Pick<ItemSummary, 'position' | 'clef' | 'accidental'>, locale: Locale) {
  if (item.position === undefined) return '';
  const note = pitchAt(item.position, item.clef ?? 'treble', item.accidental ?? 0);
  return `${pitchName(note, locale, true)} · ${clefLabel(item.clef, locale)}`;
}

export function weaknessReason(item: ItemSummary, locale: Locale) {
  const tr = locale === 'tr';
  const common = item.commonAnswer ? (tr ? ` · en sık cevabın ${answerLabel(item.commonAnswer, locale)}` : ` · you most often answered ${answerLabel(item.commonAnswer, locale)}`) : '';
  const timeouts = item.timeouts ? (tr ? ` (${item.timeouts} süre aşımı)` : ` (${item.timeouts} timed out)`) : '';
  return tr
    ? `Son ${item.recentAttempts} yardımsız denemede ${item.recentErrors} hata${timeouts}${common}`
    : `${item.recentErrors} errors in the last ${item.recentAttempts} unaided attempts${timeouts}${common}`;
}

export function TargetedReviewCard({ locale, weak, label, onStart, disabledReason }: {
  locale: Locale; weak: ItemSummary[]; label: (item: ItemSummary) => string; onStart: () => void; disabledReason?: string;
}) {
  const tr = locale === 'tr';
  const shown = weak.slice(0, 6);
  // Nothing to review yet: say nothing here; the rule is explained once a note qualifies.
  if (!weak.length) return null;
  return <section className="targeted-review targeted-review--compact" aria-labelledby="targeted-review-title">
    <div className="targeted-review-row">
      <div>
        <h2 id="targeted-review-title">{tr ? `Zorlandığın ${weak.length} nota` : `${weak.length} notes you found hard`}</h2>
        <ul className="targeted-review-chips">{shown.map(item => <li key={item.key}>{label(item)}</li>)}{weak.length > shown.length && <li className="is-more">+{weak.length - shown.length}</li>}</ul>
      </div>
      <button type="button" className="secondary-button" onClick={onStart} disabled={Boolean(disabledReason)}>{tr ? 'Hedefli tekrarı başlat' : 'Start targeted review'}</button>
    </div>
    <details className="targeted-review-why">
      <summary>{tr ? 'Neden bu notalar?' : 'Why these notes?'}</summary>
      <ul className="targeted-review-list">{shown.map(item => <li key={item.key}><strong>{label(item)}</strong><small>{weaknessReason(item, locale)}</small></li>)}</ul>
      <small>{disabledReason || (tr ? 'Hedefli oturumda bu notalar birer kez daha sorulur, diğerleri de sorulur. Normal moddadır ve sıralamaya gönderilmez.' : 'A targeted session asks these notes one extra time and the others too. It uses standard mode and is not submitted to leaderboards.')}</small>
    </details>
  </section>;
}

/** Re-measurement of targeted items after the session, using only this browser's records. */
export function TargetedReviewResult({ locale, session, targeted, evidence, label }: {
  locale: Locale; session: string; targeted: string[]; evidence: EvidenceRecord[]; label: (item: ItemSummary) => string;
}) {
  const tr = locale === 'tr';
  if (!targeted.length) return null;
  const unique = [...new Set(targeted)];
  const summaries = analyzeItems(evidence);
  return <section className="targeted-review targeted-review--result" aria-labelledby="targeted-result-title">
    <p className="kicker">{tr ? 'HEDEFLİ TEKRAR SONUCU' : 'TARGETED REVIEW RESULT'}</p>
    <h2 id="targeted-result-title">{tr ? 'Zorlandığın notalar bu oturumda' : 'Your difficult notes in this session'}</h2>
    <ul className="targeted-review-list">{unique.map(item => {
      const rows = evidence.filter(row => row.session === session && row.item === item && !row.assisted);
      const summary = summaries.find(entry => entry.item === item && entry.module === rows[0]?.module && entry.task === rows[0]?.task);
      const correct = rows.filter(row => row.correct).length;
      const status = summary?.status === 'needs-work' ? (tr ? 'Hâlâ tekrar gerekiyor' : 'Still needs review')
        : summary ? (tr ? 'Tekrar listesinden çıktı' : 'Left the review list') : '';
      return <li key={item}><strong>{summary ? label(summary) : item}</strong><small>{rows.length ? (tr ? `${rows.length} yardımsız denemede ${correct} doğru` : `${correct} of ${rows.length} unaided attempts correct`) : (tr ? 'Bu oturumda sorulmadı' : 'Not asked in this session')}{status ? ` · ${status}` : ''}</small></li>;
    })}</ul>
    <small>{tr ? 'Bir oturumluk doğru cevap kalıcı ustalık kanıtı değildir; not, sonraki oturumlarda da izlenmeye devam eder.' : 'Correct answers in one session are not proof of lasting mastery; the note keeps being tracked in later sessions.'}</small>
  </section>;
}
