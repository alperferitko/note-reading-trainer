"use client";

import { useState } from 'react';
import { buildSkillMap, clearEvidence, compareWindows, readEvidence, writeEvidence, type EvidenceRecord, type EvidenceStatus, type ItemSummary } from '@/lib/practice-evidence.mjs';
import { pitchFromMidi, pitchName } from '@/lib/music-pitch.mjs';
import { RHYTHM_PATTERNS } from '@/lib/pulse-practice.mjs';
import { writtenNoteLabel } from './targeted-review';
import './skill-map.css';

type Locale = 'tr' | 'en';
type ModuleId = EvidenceRecord['module'];

const MODULES: { id: ModuleId; tr: string; en: string }[] = [
  { id: 'reading', tr: 'Nota okuma', en: 'Note reading' },
  { id: 'score', tr: 'Eser okuma', en: 'Score reading' },
  { id: 'guitar', tr: 'Gitar', en: 'Guitar' },
  { id: 'piano', tr: 'Piyano', en: 'Piano' },
  { id: 'violin', tr: 'Keman', en: 'Violin' },
  { id: 'ear', tr: 'İşitme', en: 'Listening' },
  { id: 'rhythm', tr: 'Ritim atölyesi', en: 'Rhythm workshop' },
];

const STATUS: Record<EvidenceStatus, { tr: string; en: string }> = {
  'needs-work': { tr: 'Tekrar gerekiyor', en: 'Needs review' },
  developing: { tr: 'Gelişiyor', en: 'Developing' },
  secure: { tr: 'Güvenli', en: 'Secure' },
  stale: { tr: 'Uzun süredir çalışılmadı', en: 'Not practised recently' },
  insufficient: { tr: 'Yetersiz veri', en: 'Not enough data' },
};
const ORDER: EvidenceStatus[] = ['needs-work', 'developing', 'stale', 'secure', 'insufficient'];

const RHYTHM_NAMES: Record<string, { tr: string; en: string }> = {
  whole: { tr: 'birlik', en: 'whole' }, half: { tr: 'ikilik', en: 'half' }, quarter: { tr: 'dörtlük', en: 'quarter' },
  dottedQuarter: { tr: 'noktalı dörtlük', en: 'dotted quarter' }, eighth: { tr: 'sekizlik', en: 'eighth' },
  sixteenth: { tr: 'onaltılık', en: 'sixteenth' }, triplet: { tr: 'üçleme', en: 'triplet' },
};
const EAR_NAMES: Record<string, { tr: string; en: string }> = {
  'direction:higher': { tr: 'Daha ince', en: 'Higher' }, 'direction:lower': { tr: 'Daha kalın', en: 'Lower' }, 'direction:same': { tr: 'Aynı ses', en: 'Same pitch' },
  'interval:m2': { tr: 'Küçük ikili', en: 'Minor second' }, 'interval:M2': { tr: 'Büyük ikili', en: 'Major second' },
  'interval:m3': { tr: 'Küçük üçlü', en: 'Minor third' }, 'interval:M3': { tr: 'Büyük üçlü', en: 'Major third' },
  'interval:P4': { tr: 'Tam dörtlü', en: 'Perfect fourth' }, 'interval:P5': { tr: 'Tam beşli', en: 'Perfect fifth' },
  'interval:P8': { tr: 'Oktav', en: 'Octave' },
  'chord:major': { tr: 'Majör akor', en: 'Major chord' }, 'chord:minor': { tr: 'Minör akor', en: 'Minor chord' },
  'chord:diminished': { tr: 'Eksik akor', en: 'Diminished chord' }, 'chord:augmented': { tr: 'Artık akor', en: 'Augmented chord' },
};
const VIOLIN_STRINGS = { tr: ['Sol', 'Re', 'La', 'Mi'], en: ['G', 'D', 'A', 'E'] };

/** A readable name for one tracked prompt, in the learner's language. */
export function itemLabel(item: ItemSummary, locale: Locale) {
  const tr = locale === 'tr';
  if (item.module === 'ear') {
    if (item.item.startsWith('dictation:')) return `${tr ? 'Melodik dikte' : 'Melodic dictation'} (${item.item.slice(10)})`;
    return EAR_NAMES[item.item]?.[locale] ?? item.item;
  }
  if (item.module === 'rhythm') return item.item === 'pulse:steady' ? (tr ? 'Eşit vuruş' : 'Steady pulse') : RHYTHM_PATTERNS.find(pattern => `pattern:${pattern.id}` === item.item)?.title[locale] ?? item.item;
  if (item.module === 'score' && item.item.startsWith('rest:')) return `${tr ? 'Sus' : 'Rest'}: ${RHYTHM_NAMES[item.item.slice(5)]?.[locale] ?? item.item.slice(5)}`;
  if (item.module === 'score' && item.item.startsWith('after:')) return `${tr ? 'Sustan sonra giriş' : 'Entry after a rest'}: ${RHYTHM_NAMES[item.item.slice(6)]?.[locale] ?? item.item.slice(6)}`;
  if (item.module === 'guitar') {
    if (item.task === 'name-note') {
      const [stringNumber, fret] = item.item.split('-').map(Number);
      return tr ? `${stringNumber}. tel, ${fret === 0 ? 'boş tel' : `${fret}. perde`}` : `String ${stringNumber}, ${fret === 0 ? 'open' : `fret ${fret}`}`;
    }
    return `${pitchName(pitchFromMidi((item.midi ?? 40) + 12), locale, true)} (${tr ? 'yazılı' : 'written'})`;
  }
  if (item.module === 'piano' && item.task === 'name') return `${pitchName(pitchFromMidi(item.midi ?? 60), locale, true)} ${tr ? 'tuşu' : 'key'}`;
  if (item.module === 'violin' && item.task === 'name') {
    const [string, offset] = item.item.split('-').map(Number);
    return `${VIOLIN_STRINGS[locale][string] ?? '?'} ${tr ? 'teli' : 'string'} · ${offset === 0 ? (tr ? 'boş' : 'open') : `${Math.ceil(offset / 2)}${offset === 1 || offset === 3 ? '↓' : ''}`}`;
  }
  return writtenNoteLabel(item, locale) || item.item;
}

function relativeDays(iso: string, now: number, locale: Locale) {
  const days = Math.floor((now - Date.parse(iso)) / 86400000);
  if (days <= 0) return locale === 'tr' ? 'bugün' : 'today';
  return locale === 'tr' ? `${days} gün önce` : `${days} day${days === 1 ? '' : 's'} ago`;
}

export function SkillMap({ locale, evidence, now }: { locale: Locale; evidence: EvidenceRecord[]; now: number }) {
  const tr = locale === 'tr';
  const [confirming, setConfirming] = useState<ModuleId | 'all' | null>(null);
  const [message, setMessage] = useState('');
  const modules = MODULES.map(module => {
    // Written notes are grouped by clef and pitch across question styles; other prompts stay separate.
    const groupKey = (item: ItemSummary) => item.clef && (item.module === 'reading' || item.module === 'score') ? `${item.clef}:${item.item.split(':').at(-1)}` : item.item;
    const groups = buildSkillMap(evidence, { module: module.id }, groupKey, now);
    const trend = compareWindows(evidence, { module: module.id }, {}, now);
    const counts = Object.fromEntries(ORDER.map(status => [status, groups.filter(group => group.status === status).length])) as Record<EvidenceStatus, number>;
    return { ...module, groups, trend, counts, answers: evidence.filter(row => row.module === module.id).length };
  }).filter(module => module.answers > 0);

  function clear(target: ModuleId | 'all') {
    const next = target === 'all' ? [] : clearEvidence(readEvidence(), { module: target });
    const ok = writeEvidence(next);
    setConfirming(null);
    setMessage(ok ? (tr ? 'Seçilen soru kayıtları bu tarayıcıdan silindi.' : 'The selected question records were deleted from this browser.') : (tr ? 'Tarayıcı depolamasına erişilemedi; kayıtlar silinemedi.' : 'Browser storage was unavailable; nothing was deleted.'));
  }

  return <section className="skill-map" aria-labelledby="skill-map-title">
    <p className="kicker">{tr ? 'BECERİ HARİTASI' : 'SKILL MAP'}</p>
    <h2 id="skill-map-title">{tr ? 'Hangi notada, hangi koşulda?' : 'Which note, under which conditions?'}</h2>
    <p>{tr
      ? 'Her satır, aynı anahtar, oktav ve değiştirici işaretle verilen yardımsız cevaplardan oluşur. En az üç yardımsız cevap olmadan durum yazılmaz. “Güvenli”, son beş yardımsız cevabın en az %90’ının doğru olması demektir; kalıcı ustalık kanıtı değildir.'
      : 'Each row groups unaided answers given with the same clef, octave and accidental. No status is shown without at least three unaided answers. “Secure” means at least 90% of the last five unaided answers were correct; it is not proof of lasting mastery.'}</p>
    {!modules.length && <p className="skill-map-empty">{tr ? 'Henüz soru düzeyinde kayıt yok. Bir çalışma oturumunu tamamladığında harita burada oluşur.' : 'No question-level records yet. The map appears here after you complete a practice session.'}</p>}
    {modules.map(module => <details key={module.id} className="skill-map-module" open={module.counts['needs-work'] > 0}>
      <summary>
        <strong>{module[locale]}</strong>
        <span>{module.answers} {tr ? 'cevap' : 'answers'}</span>
        <span className="skill-map-counts">{ORDER.filter(status => module.counts[status]).map(status => <b key={status} className={`skill-status skill-status--${status}`}>{module.counts[status]} {STATUS[status][locale]}</b>)}</span>
      </summary>
      <p className="skill-map-trend">{module.trend.comparable
        ? (tr ? `Son 14 günde yardımsız doğruluk %${module.trend.recent.accuracy}; önceki 14 günde %${module.trend.previous.accuracy} (${module.trend.change! >= 0 ? '+' : ''}${module.trend.change} puan). Seçtiğin aralık ve ayarlar değiştiyse fark bundan da kaynaklanabilir.`
          : `Unaided accuracy was ${module.trend.recent.accuracy}% in the last 14 days and ${module.trend.previous.accuracy}% in the 14 days before (${module.trend.change! >= 0 ? '+' : ''}${module.trend.change} points). A change in range or settings can also explain a difference.`)
        : (tr ? `Dönem karşılaştırması için iki 14 günlük dönemin her birinde en az 10 yardımsız cevap gerekir (şimdi: ${module.trend.recent.attempts} ve ${module.trend.previous.attempts}).`
          : `A period comparison needs at least 10 unaided answers in each of two 14-day windows (now: ${module.trend.recent.attempts} and ${module.trend.previous.attempts}).`)}</p>
      <ul className="skill-map-list">{[...module.groups].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.items[0].position ?? 0) - (b.items[0].position ?? 0)).map(group => <li key={group.key}>
        <span className={`skill-status skill-status--${group.status}`}>{STATUS[group.status][locale]}</span>
        <strong>{itemLabel(group.items[0], locale)}</strong>
        <small>{group.unaidedAttempts} {tr ? 'yardımsız' : 'unaided'}{group.attempts > group.unaidedAttempts ? ` + ${group.attempts - group.unaidedAttempts} ${tr ? 'yardımlı' : 'assisted'}` : ''} · {relativeDays(group.lastSeen, now, locale)}</small>
      </li>)}</ul>
      {confirming === module.id
        ? <div className="skill-map-confirm" role="group" aria-label={tr ? 'Silme onayı' : 'Confirm deletion'}><span>{tr ? `${module[locale]} kayıtlarının tamamı silinsin mi?` : `Delete all ${module[locale]} records?`}</span><button type="button" onClick={() => clear(module.id)}>{tr ? 'Evet, sil' : 'Yes, delete'}</button><button type="button" onClick={() => setConfirming(null)}>{tr ? 'Vazgeç' : 'Cancel'}</button></div>
        : <button type="button" className="skill-map-clear" onClick={() => setConfirming(module.id)}>{tr ? 'Bu bölümün soru kayıtlarını sil' : 'Delete this section’s question records'}</button>}
    </details>)}
    {modules.length > 0 && (confirming === 'all'
      ? <div className="skill-map-confirm" role="group" aria-label={tr ? 'Silme onayı' : 'Confirm deletion'}><span>{tr ? 'Bütün soru kayıtları silinsin mi? Oturum geçmişi ve ders ilerlemesi etkilenmez.' : 'Delete every question record? Session history and lesson progress are not affected.'}</span><button type="button" onClick={() => clear('all')}>{tr ? 'Evet, hepsini sil' : 'Yes, delete all'}</button><button type="button" onClick={() => setConfirming(null)}>{tr ? 'Vazgeç' : 'Cancel'}</button></div>
      : <button type="button" className="skill-map-clear" onClick={() => setConfirming('all')}>{tr ? 'Bütün soru kayıtlarını sil' : 'Delete all question records'}</button>)}
    {message && <p role="status">{message}</p>}
    <small>{tr ? 'Son 800 cevap yalnız bu tarayıcıda saklanır; sunucuya gönderilmez ve cihazlar arasında eşitlenmez.' : 'The last 800 answers are stored only in this browser; they are not sent to a server or synced between devices.'}</small>
  </section>;
}
