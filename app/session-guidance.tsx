"use client";

import { LEARNING_LESSONS } from '@/lib/learning-path.mjs';
import './session-guidance.css';

type GuidanceModule = 'score' | 'guitar' | 'piano' | 'violin';
export function SessionGuidance({ locale, module, wrong, attempts, guitarMode }: {
  locale: 'tr' | 'en'; module: GuidanceModule; wrong: number; attempts: number;
  guitarMode?: 'name-note' | 'staff-to-fretboard' | 'staff-to-location';
}) {
  const tr = locale === 'tr';
  const nameMode = guitarMode === 'name-note';
  const lessonId = module === 'score' ? 'pulse-tempo' : module === 'guitar'
    ? nameMode ? 'octaves' : 'guitar-map' : module === 'piano' ? 'piano-map' : 'octaves';
  const lesson = LEARNING_LESSONS.find(item => item.id === lessonId);
  if (!lesson || attempts === 0) return null;

  const evidence = wrong > 0
    ? tr ? `Bu oturumda ${wrong} cevap hatası veya süre aşımı kaydedildi. Önce sonuç özetindeki örnekleri gözden geçirebilirsin.`
      : `${wrong} incorrect answers or timeouts were recorded. You can review the examples in your results first.`
    : tr ? 'Bu oturumda cevap hatası kaydedilmedi. Aşağıdaki kısa ders, bilgiyi başka bir çalışmaya aktarmak için bir öneri.'
      : 'No incorrect answers were recorded in this session. The short lesson below is an optional way to connect this knowledge to another practice.';
  const tips: Record<GuidanceModule, { tr: string; en: string }> = {
    score: {
      tr: 'İsteğe bağlı çalışma: önce yalnız metronomla eşit aralıklarla vur, ardından nota adlarını ekle. Kısa notalarda ana vuruş hızlanmaz. Buradaki nota cevaplarından gerçek ritim tutma becerini ölçmüyoruz.',
      en: 'Optional practice: tap evenly with the metronome before adding note names. Shorter notes do not speed up the main pulse. Note-name answers here do not measure your actual rhythmic performance.',
    },
    guitar: {
      tr: nameMode
        ? 'Nota adını tanımakla tam ses yüksekliğini bulmak farklı becerilerdir. Sonraki çalışmada porteden bir nota seçip aynı oktavdaki tel–perde karşılıklarını araştırabilirsin.'
        : 'Bir doğru konumu bulduktan sonra, seçilen perde aralığında aynı ses yüksekliğini veren diğer telleri de kontrol et. Yalnızca adı aynı olan farklı oktavdaki sesler bu soruda eşleşmez.',
      en: nameMode
        ? 'Recognising a note name and identifying an exact pitch are different skills. Next, try matching a written note to string–fret locations in the same octave.'
        : 'After finding one location, check other strings in the selected fret range for the same exact pitch. A matching letter name in a different octave does not count.',
    },
    piano: {
      tr: 'İkili siyah tuş grubunun hemen solundaki Do’yu bulup komşu tuşlara ilerle. Porteden eşleştirirken oktavı da kontrol et. Ekrandaki seçimler el duruşunu veya gerçek çalma tekniğini değerlendirmez.',
      en: 'Find C immediately left of a two-black-key group, then move to neighbouring keys. Check the octave when matching a staff note. On-screen choices do not assess hand position or physical playing technique.',
    },
    violin: {
      tr: 'Boş telden başlayarak birinci konumdaki sesleri sırayla düşün; aynı adı taşıyan seslerin oktavlarını karşılaştır. Bu çalışma konum bilgisini sınar, yay tekniğini veya gerçek entonasyonu ölçmez.',
      en: 'Start from the open string and work through first-position pitches; compare the octaves of notes sharing a name. This exercise checks position knowledge, not bow technique or actual intonation.',
    },
  };
  return <aside className="session-guidance" aria-label={tr ? 'Sonraki çalışma önerisi' : 'Suggested next practice'}>
    <div><p className="kicker">{tr ? 'Bir sonraki adım' : 'Your next step'}</p>
      <h2>{lesson.title[locale]}</h2><p>{evidence}</p><p>{tips[module][locale]}</p>
    </div>
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('notanota-open-lesson', { detail: { lessonId } }))}>
      {tr ? 'Kısa dersi aç' : 'Open short lesson'} <span aria-hidden="true">→</span>
      <small>{lesson.minutes} {tr ? 'dakika' : 'minutes'}</small>
    </button>
  </aside>;
}
