"use client";

import { LEARNING_LESSONS } from '@/lib/learning-path.mjs';
import { buildReviewPlan } from '@/lib/lesson-review.mjs';

export type LessonReview = {lessonId:string;reviewedAt:string;dueAt:string;streak:number;assisted:boolean};

export function LessonReviewPlan({locale,records,completed,now,onOpen}:{locale:'tr'|'en';records:LessonReview[];completed:string[];now:number;onOpen:(id:string)=>void}) {
  const tr=locale==='tr';
  const plan=buildReviewPlan(records,completed,now);
  const title=(id:string)=>LEARNING_LESSONS.find(lesson=>lesson.id===id)?.title[locale] ?? id;
  const date=(value:string)=>new Intl.DateTimeFormat(tr?'tr-TR':'en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  return <section className="studio-review-plan" aria-labelledby="review-plan-title">
    <p className="kicker">{tr?'ARALIKLI TEKRAR':'SPACED REVIEW'}</p>
    <h2 id="review-plan-title">{tr?'Öğrendiklerine yeniden dön.':'Return to what you learned.'}</h2>
    <p>{tr?'Yardımsız geçilen kontroller 1, 3, 7 ve 14 gün sonra yeniden sorulur; açıklamayı açarsan veya yanılırsan ertesi gün.':'Checks passed unaided return after 1, 3, 7 and 14 days; after help or a mistake, the next day.'}</p>
    <p className="studio-review-summary" role="status">{plan.due.length ? (tr?`${plan.due.length} dersin tekrar zamanı geldi.`:`${plan.due.length} lessons are due for review.`) : (tr?'Şu anda zamanı gelmiş bir tekrar yok.':'No reviews are due right now.')}</p>
    {plan.due.length>0&&<ul className="studio-review-list">{plan.due.map(row=><li key={row.lessonId}><div><strong>{title(row.lessonId)}</strong><small>{tr?'Tekrar zamanı':'Review due'}: {date(row.dueAt)}</small></div><button onClick={()=>onOpen(row.lessonId)}>{tr?'Hatırlamayı dene':'Try recalling'} →</button></li>)}</ul>}
    {plan.upcoming.length>0&&<details><summary>{tr?'Yaklaşan tekrarlar':'Upcoming reviews'} ({plan.upcoming.length})</summary><ul className="studio-review-list">{plan.upcoming.map(row=><li key={row.lessonId}><div><strong>{title(row.lessonId)}</strong><small>{date(row.dueAt)}</small></div><button onClick={()=>onOpen(row.lessonId)}>{tr?'Erken tekrar':'Review early'}</button></li>)}</ul></details>}
    {plan.untracked.length>0&&<details><summary>{tr?'Tekrar tarihi olmayan önceki dersler':'Earlier lessons without a review date'} ({plan.untracked.length})</summary><p>{tr?'Eski tamamlamalarda tarih tutulmuyordu. Kontrolü yeniden çözerek takvime ekleyebilirsin; geçmiş için tarih uydurmuyoruz.':'Earlier completions did not store dates. Complete a check again to schedule it; no historical dates are inferred.'}</p><ul className="studio-review-list">{plan.untracked.map(id=><li key={id}><strong>{title(id)}</strong><button onClick={()=>onOpen(id)}>{tr?'Kontrolü aç':'Open check'}</button></li>)}</ul></details>}
    {!records.length&&!completed.length&&<p>{tr?'İlk kısa dersinin bilgi kontrolünü tamamlayarak başla.':'Start by completing your first short lesson’s knowledge check.'}</p>}
    
  </section>;
}
