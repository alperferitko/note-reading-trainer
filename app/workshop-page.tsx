"use client";

import type { MouseEvent } from 'react';
import { LEARNING_LESSONS } from '@/lib/learning-path.mjs';
import { pageRoute } from '@/lib/site-routes.mjs';
import { PulsePractice } from './pulse-practice';
import { EarTraining } from './ear-training';

type Locale = 'tr' | 'en';
const RELATED: Record<'rhythm' | 'listening', string[]> = {
  rhythm: ['pulse-tempo', 'subdivisions', 'rest-entries', 'dotted-notes'],
  listening: ['intervals-intro', 'triads-intro', 'octaves'],
};

/** A practice workshop on its own page, with the short lessons that prepare for it. */
export function WorkshopPage({ kind, locale, onNavigate }: { kind: 'rhythm' | 'listening'; locale: Locale; onNavigate: (target: 'landing') => void }) {
  const tr = locale === 'tr';
  const title = kind === 'rhythm' ? (tr ? 'Ritim atölyesi' : 'Rhythm workshop') : (tr ? 'İşitme atölyesi' : 'Listening workshop');
  const home = (event: MouseEvent) => { event.preventDefault(); onNavigate('landing'); };
  const related = RELATED[kind].map(id => LEARNING_LESSONS.find(lesson => lesson.id === id)).filter(lesson => lesson !== undefined);
  return <section className="workshop-page">
    <p className="studio-breadcrumb"><a href={pageRoute('landing', locale)} onClick={home}>{tr ? 'Stüdyo' : 'Studio'}</a> / {title}</p>
    <h1 className="sr-only">{title}</h1>
    {kind === 'rhythm' ? <PulsePractice locale={locale} /> : <EarTraining locale={locale} />}
    <aside className="workshop-related" aria-label={tr ? 'İlgili kısa dersler' : 'Related short lessons'}>
      <p className="kicker">{tr ? 'İLGİLİ KISA DERSLER' : 'RELATED SHORT LESSONS'}</p>
      <div>{related.map(lesson => <button key={lesson.id} type="button" onClick={() => window.dispatchEvent(new CustomEvent('notanota-open-lesson', { detail: { lessonId: lesson.id } }))}>{lesson.title[locale]} <small>{lesson.minutes} {tr ? 'dk' : 'min'}</small></button>)}</div>
    </aside>
  </section>;
}
