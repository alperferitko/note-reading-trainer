"use client";

import { useEffect, useRef, useState } from 'react';
import { LEARNING_LESSONS, LESSON_PROGRESS_KEY, LESSON_STATE_KEY, drawCheck, lessonStatus, markLessonState, recommendFromEvidence, recommendLesson, validLearningHistory, validCompletedLessons, validLessonStates, type Lesson as LessonData, type LessonState } from '@/lib/learning-path.mjs';
import { useEvidence, weaknessReason } from './targeted-review';
import { SkillMap } from './skill-map';
import { RhythmPatternPreview } from './rhythm-glyphs';
import { MusicStaff } from './notation';
import { LocalProgress } from './local-progress';
import { PulsePractice } from './pulse-practice';
import { EarTraining } from './ear-training';
import { LessonReviewPlan, type LessonReview } from './lesson-review-plan';
import { REVIEW_KEY, validReviews, recordReview, buildReviewPlan } from '@/lib/lesson-review.mjs';

type Locale = 'tr' | 'en';
type Destination = 'setup' | 'pieces' | 'guitar' | 'piano' | 'violin';
type CheckQuestion = ReturnType<typeof drawCheck>[number];
type History = {id:string;module:string;correct:number;wrong:number;milliseconds:number;date:string};
const lessons: LessonData[] = LEARNING_LESSONS;
const STAGE_LABELS = {
  tr: { new: 'Başlanmadı', read: 'Açıklama okundu', checked: 'Bilgi kontrolü geçti', applied: 'Uygulamada gösterildi' },
  en: { new: 'Not started', read: 'Explanation read', checked: 'Knowledge check passed', applied: 'Shown in practice' },
} as const;

function InstrumentArt({kind}:{kind:'guitar'|'piano'|'violin'}) {
  return <svg viewBox="0 0 300 110" aria-hidden="true" className="studio-instrument-art">{kind==='piano'?<>{Array.from({length:7},(_,i)=><rect key={i} x={10+i*40} y="6" width="40" height="98" rx="3" fill={i===2?'var(--primary)':'var(--surface)'} stroke="currentColor"/>)}{[38,78,158,198,238].map(x=><rect key={x} x={x} y="6" width="24" height="60" rx="2" fill="currentColor"/>)}</>:<>{Array.from({length:kind==='guitar'?6:4},(_,i)=><line key={i} x1="4" x2="296" y1={10+i*(kind==='guitar'?18:29)} y2={10+i*(kind==='guitar'?18:29)} stroke="currentColor" strokeWidth={1+i*.2}/>)}{kind==='guitar'&&[60,120,180,240].map(x=><line key={x} x1={x} x2={x} y1="10" y2="100" stroke="currentColor" opacity=".5"/>)}<line x1="4" x2="4" y1="10" y2="100" stroke="currentColor" strokeWidth="4"/>{[90,160,230].map((x,i)=><circle key={x} cx={x} cy={kind==='guitar'?28+i*18:10+i*29} r="10" fill="var(--primary)"/>)}</>}</svg>;
}

function LessonMeta({lesson,locale,status}:{lesson:LessonData;locale:Locale;status:ReturnType<typeof lessonStatus>}) {
  const tr=locale==='tr';
  const title=(id:string)=>lessons.find(l=>l.id===id)?.title[locale]??id;
  return <dl className="studio-lesson-meta">
    {lesson.requires.length>0&&<div><dt>{tr?'Önkoşul':'Prerequisites'}</dt><dd>{lesson.requires.map(title).join(', ')}{status.missing.length>0&&<small>{tr?' · henüz tamamlanmadı; yine de açabilirsin':' · not completed yet; you can still open it'}</small>}</dd></div>}
    <div><dt>{tr?'Tekrarda ölçülen':'Measured in review'}</dt><dd>{lesson.measures[locale]}</dd></div>
    <div><dt>{tr?'Durum':'Status'}</dt><dd>{STAGE_LABELS[locale][status.stage as keyof typeof STAGE_LABELS['tr']]}{status.stage==='checked'&&<small>{status.legacyCheck?(tr?' · eski tamamlama tarihsiz; uygulama kanıtı için kontrolü yeniden çöz':' · older completion has no date; retake the check to track practice'):(tr?` · uygulamada ${status.application.attempts} / ${status.application.required} yardımsız cevap`:` · ${status.application.attempts} / ${status.application.required} unaided practice answers`)}</small>}</dd></div>
  </dl>;
}

export function LearningStudio({locale,onNavigate,initialLessonId}:{locale:Locale;onNavigate:(destination:Destination)=>void;initialLessonId?:string|null}) {
  const tr=locale==='tr';
  const [history,setHistory]=useState<History[]>([]);
  const [completed,setCompleted]=useState<string[]>([]);
  // A lesson requested from a practice result opens directly, with its own question pair.
  const initialLesson=initialLessonId && lessons.some(lesson=>lesson.id===initialLessonId)?initialLessonId:null;
  const [active,setActive]=useState<string|null>(initialLesson);
  const [questionIndex,setQuestionIndex]=useState(0);
  const [answer,setAnswer]=useState<number|null>(null);
  const [finished,setFinished]=useState(false);
  const [storageWarning,setStorageWarning]=useState(false);
  const [reviews,setReviews]=useState<LessonReview[]>([]);
  const [now,setNow]=useState(()=>Date.now());
  const [recalling,setRecalling]=useState(false);
  const [showExplanation,setShowExplanation]=useState(true);
  const [lessonStates,setLessonStates]=useState<LessonState[]>([]);
  const [checkQuestions,setCheckQuestions]=useState<CheckQuestion[]>(()=>{const item=lessons.find(l=>l.id===initialLesson);return item?drawCheck(item):[];});
  const previousChecks=useRef<Record<string,number[]>>(initialLesson?{[initialLesson]:checkQuestions.map(q=>q.index)}:{});
  const initialReadRecorded=useRef(false);
  const evidence=useEvidence();
  const assisted=useRef(true);
  const submitted=useRef(false);
  const lessonPanel=useRef<HTMLElement>(null);
  useEffect(()=>{
    const update=()=>{setNow(Date.now());const read=(key:string)=>{try{return JSON.parse(localStorage.getItem(key)||'[]');}catch{setStorageWarning(true);return [];}};setHistory(validLearningHistory(read('notanota-local-progress-v1')));setCompleted(validCompletedLessons(read(LESSON_PROGRESS_KEY)));setReviews(validReviews(read(REVIEW_KEY)));const states=validLessonStates(read(LESSON_STATE_KEY));if(initialLesson&&!initialReadRecorded.current){initialReadRecorded.current=true;const marked=markLessonState(states,initialLesson,'readAt',Date.now());try{localStorage.setItem(LESSON_STATE_KEY,JSON.stringify(marked));}catch{setStorageWarning(true);}setLessonStates(marked);}else setLessonStates(states);};
    update();window.addEventListener('notanota-progress',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('notanota-progress',update);window.removeEventListener('storage',update);};
  },[initialLesson]);
  useEffect(()=>{const update=()=>setNow(Date.now());const timer=window.setInterval(update,60000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[]);
  useEffect(()=>{if(active)lessonPanel.current?.focus();},[active]);
  const suggestion=recommendLesson(history,completed);
  const evidenceSuggestion=recommendFromEvidence(evidence,now);
  const reviewPlan=buildReviewPlan(reviews,completed,now);
  const dueLesson=reviewPlan.due[0]?.lessonId;
  const recommended=lessons.find(l=>l.id===(dueLesson||evidenceSuggestion?.lessonId||suggestion.lessonId))||lessons[0];
  const lesson=lessons.find(l=>l.id===active);
  const question=checkQuestions[questionIndex];
  const statusOf=(item:LessonData)=>lessonStatus(item,lessonStates,completed,evidence,now);
  function saveStates(next:LessonState[]){setLessonStates(next);try{localStorage.setItem(LESSON_STATE_KEY,JSON.stringify(next));}catch{setStorageWarning(true);}}
  function markRead(id:string){
    // Reading is recorded once; later openings keep the first date.
    let stored:unknown=lessonStates;try{stored=[...lessonStates,...validLessonStates(JSON.parse(localStorage.getItem(LESSON_STATE_KEY)||'[]'))];}catch{/* Use the in-memory list. */}
    saveStates(markLessonState(stored,id,'readAt',Date.now()));
  }
  function open(id:string,recall=false){
    const item=lessons.find(l=>l.id===id);if(!item)return;
    const drawn=drawCheck(item,previousChecks.current[id]??[]);
    previousChecks.current[id]=drawn.map(q=>q.index);
    setCheckQuestions(drawn);
    assisted.current=!recall;submitted.current=false;setRecalling(recall);setShowExplanation(!recall);setActive(id);setQuestionIndex(0);setAnswer(null);setFinished(false);
    if(!recall)markRead(id);
    window.requestAnimationFrame(()=>lessonPanel.current?.focus());
  }
  function next(time:number){if(!lesson||!question||answer!==question.answerIndex||submitted.current)return;if(questionIndex<checkQuestions.length-1){setQuestionIndex(i=>i+1);setAnswer(null);}else{submitted.current=true;const ids=[...new Set([...completed,lesson.id])];let source=reviews;try{source=validReviews([...reviews,...validReviews(JSON.parse(localStorage.getItem(REVIEW_KEY)||'[]'),time)],time);}catch{setStorageWarning(true);}const updated=recordReview(source,lesson.id,assisted.current,time);setNow(time);setReviews(updated);setCompleted(ids);setFinished(true);try{localStorage.setItem(LESSON_PROGRESS_KEY,JSON.stringify(ids));localStorage.setItem(REVIEW_KEY,JSON.stringify(updated));}catch{setStorageWarning(true);}saveStates(markLessonState(lessonStates,lesson.id,'checkedAt',time));}}
  const evidenceReason=evidenceSuggestion?(tr?`Aynı koşullarda tekrarlanan hatalar bu dersi öneriyor: ${weaknessReason(evidenceSuggestion.item,locale)}. Az veriyle tanı konmaz; bu öneri yalnız bu tarayıcıdaki cevaplarına dayanır.`:`Repeated errors in comparable conditions point to this lesson: ${weaknessReason(evidenceSuggestion.item,locale)}. No diagnosis is made from little data; this uses only answers in this browser.`):'';
  // The listening workshop lives on this page; other destinations are separate practice screens.
  function goTo(destination:LessonData['destination']){if(destination==='ear'){document.getElementById('ear-title')?.scrollIntoView({behavior:'smooth',block:'start'});return;}onNavigate(destination);}
  const reason=evidenceSuggestion?evidenceReason:suggestion.reason==='review'?(tr?`${suggestion.evidenceSessions} oturumdaki cevaplarına göre bu alanda temel bir tekrar öneriyoruz. Bu, belirli bir beceri eksikliğinin tanısı değildir.`:`Based on answers in ${suggestion.evidenceSessions} sessions, a basic review may help. This does not diagnose a specific skill gap.`):suggestion.reason==='continue'?(tr?'Tamamladığın kısa derslerden sonraki adım.':'Your next step after the short lessons you completed.'):suggestion.reason==='revisit'?(tr?'Bütün bilgi kontrollerini tamamladın. Bir konuyu yeniden çalışabilir veya serbest oturuma geçebilirsin.':'You completed every knowledge check. Revisit a topic or choose free practice.'):(tr?'Temelden başlayabilir veya istediğin dersi seçebilirsin. Öneriler, bu tarayıcıdaki oturumlar biriktikçe güncellenir.':'Start with the basics or choose a lesson. Recommendations update as practice history builds in this browser.');
  return <section className="learning-studio">
    <p className="studio-breadcrumb">{tr?'Stüdyo':'Studio'}</p>
    <div className="studio-intro-grid">
      <section className="studio-hero"><p className="kicker">{tr?'NOTANOTA MÜZİK STÜDYOSU':'NOTANOTA MUSIC STUDIO'}</p><h1>{tr?'Notayı oku,':'Read the notes,'}<br/>{tr?'ritmi say,':'feel the pulse,'}<br/><em>{tr?'enstrümanında bul.':'find your sound.'}</em></h1><p>{tr?'Porte okuma, ritim ve enstrüman çalışmaları tek stüdyoda. Kısa dersler ve düzenli oturumlarla önce doğruluk, sonra akıcılık kazan.':'Reading, rhythm and instrument practice in one studio. Build accuracy first, then fluency, with short lessons and regular practice.'}</p><div className="studio-actions"><button className="primary-button" onClick={()=>onNavigate('setup')}>{tr?'Nota okumaya başla':'Start reading'} <span aria-hidden="true">→</span></button><a href="#learning-path">{tr?'Gelişim yolunu keşfet':'Explore your learning path'}</a></div><div className="studio-hero-score" aria-hidden="true"><RhythmPatternPreview variant="mixed"/></div></section>
      <section className="studio-daily"><p className="kicker">{tr?'BUGÜNKÜ ÇALIŞMA':'TODAY’S PRACTICE'}</p><h2>{tr?'Öğren, uygula,':'Learn, practise,'}<br/>{tr?'müziğe aktar.':'make it music.'}</h2><ol><li><span>1</span><div><strong>{recommended.title[locale]}</strong><small>{recommended.minutes} {tr?'dakikalık kısa ders':'minute lesson'}</small></div></li><li><span>2</span><div><strong>{tr?'Yardım almadan dene':'Try it independently'}</strong><small>{tr?'Kısa bilgi kontrolü ve açıklamalı cevaplar':'A short check with explained answers'}</small></div></li><li><span>3</span><div><strong>{tr?'Çalışma oturumuna geç':'Apply it in practice'}</strong><small>{tr?'Öğrendiğin konuyu yeni örneklerde kullan':'Use the idea in new examples'}</small></div></li></ol><button onClick={()=>open(recommended.id,Boolean(dueLesson))}>{tr?'Önerilen dersi aç':'Open recommended lesson'} <span aria-hidden="true">→</span></button><p>{dueLesson?(tr?'Bu dersin tekrar zamanı geldi. Önce açıklamayı açmadan hatırlamayı dene.':'This lesson is due. Try recalling before opening the explanation.'):reason}</p></section>
    </div>
    {storageWarning&&<p role="status">{tr?'Tarayıcı depolaması kullanılamıyor; bu ziyaret boyunca çalışmaya devam edebilirsin.':'Browser storage is unavailable; you can keep practising during this visit.'}</p>}
    <section className="studio-progress-strip" aria-label={tr?'Öğrenme özeti':'Learning summary'}><div><p className="kicker">{tr?'SENİN ÇALIŞMAN':'YOUR PRACTICE'}</p><h2>{completed.length} / {lessons.length} {tr?'kısa ders':'short lessons'}</h2></div><p>{tr?`✓ bilgi kontrolünü geçtiğini, ★ bu beceriyi sonraki çalışmalarda yardımsız gösterdiğini belirtir (${lessons.filter(l=>statusOf(l).stage==='applied').length} ders). İkisi de gerçek enstrüman performansının ölçümü değildir. İlerlemen bu tarayıcıda saklanır.`:`✓ means you passed the knowledge check; ★ means you later showed the skill unaided in practice (${lessons.filter(l=>statusOf(l).stage==='applied').length} lessons). Neither measures instrument performance. Progress is saved in this browser.`}</p><a href="#learning-history">{tr?'Oturum geçmişi':'Session history'} →</a></section>
    {lesson&&<section ref={lessonPanel} tabIndex={-1} className="studio-lesson" aria-labelledby="active-lesson-title"><div className="studio-section-top"><p className="kicker">{tr?'KISA DERS':'SHORT LESSON'} · {lesson.minutes} {tr?'DK':'MIN'}</p><button className="studio-text-button" onClick={()=>setActive(null)}>{tr?'Dersi kapat':'Close lesson'} ×</button></div><h2 id="active-lesson-title">{lesson.title[locale]}</h2><p className="studio-lesson-goal">{lesson.goal[locale]}</p><LessonMeta lesson={lesson} locale={locale} status={statusOf(lesson)}/>{recalling&&!showExplanation&&<div className="studio-recall-intro"><p>{tr?'Önce hatırlamayı dene. Açıklamayı açarsan yarın tekrar önerilir.':'Try recalling first. Opening the explanation schedules a review tomorrow.'}</p><button onClick={()=>{assisted.current=true;setShowExplanation(true);markRead(lesson.id);}}>{tr?'Açıklamayı göster':'Show explanation'}</button></div>}{showExplanation&&<><p>{lesson.explanation[locale]}</p><aside><strong>{tr?'Çalışma ipucu':'Practice tip'}</strong><p>{lesson.tip[locale]}</p></aside></>}{!finished&&question?<fieldset className="studio-question"><legend>{question.prompt[locale]}</legend><p>{questionIndex+1} / {checkQuestions.length}</p><div>{question.options[locale].map((option,i)=><button key={i} aria-pressed={answer===i} disabled={answer===question.answerIndex} onClick={()=>{if(i!==question.answerIndex)assisted.current=true;setAnswer(i);}}>{option}</button>)}</div>{answer!==null&&<div role="status" className="studio-question-feedback"><strong>{answer===question.answerIndex?(tr?'Doğru.':'Correct.'):(tr?'Bir kez daha düşün.':'Try again.')}</strong><p>{question.explanation[locale]}</p>{answer===question.answerIndex&&<button className="primary-button" onClick={()=>next(Date.now())}>{tr?'Devam et':'Continue'} →</button>}</div>}</fieldset>:<div className="studio-lesson-complete" role="status"><h3>{tr?'Bilgi kontrolü tamamlandı':'Knowledge check complete'}</h3><p className="studio-review-next">{tr?'Sonraki tekrar':'Next review'}: {new Intl.DateTimeFormat(tr?'tr-TR':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(reviews.find(row=>row.lessonId===lesson.id)?.dueAt??now))}</p><p>{tr?'Şimdi bunu yeni örneklerle pekiştir. Çalışma ayarlarını seviyene göre seçebilirsin.':'Now reinforce this with new examples. Choose practice settings that suit your level.'}</p><button className="primary-button" onClick={()=>goTo(lesson.destination)}>{tr?'Uygulama oturumuna geç':'Open practice session'} →</button></div>}</section>}
    <section className="studio-modules"><div className="studio-section-top"><p className="kicker">{tr?'SERBEST ÇALIŞMA':'FREE PRACTICE'}</p><h2>{tr?'Kendi ritminde ilerle.':'Progress at your own pace.'}</h2></div><div className="studio-reading-grid">{(['setup','pieces'] as const).map((destination,i)=><article key={destination} className="studio-module"><p className="studio-number">{i===0?(tr?'NOTA OKUMA':'NOTE READING'):(tr?'ESER OKUMA':'SCORE READING')}</p><div className="studio-module-art" aria-hidden="true">{i===0?<MusicStaff position={4} label=""/>:<RhythmPatternPreview variant="mixed"/>}</div><h3>{i===0?(tr?'Porte okuma':'Sight-reading'):(tr?'Eser okuma':'Score reading')}</h3><p>{i===0?(tr?'Sol ve fa anahtarında doğal, diyez ve bemol notaları tanı. Ek çizgileri adım adım çalış.':'Recognise natural, sharp and flat notes in treble and bass clefs. Explore ledger lines step by step.'):(tr?'Rastgele porte satırlarını kendi hızında veya metronomla oku. Vuruşu koruyarak nota gruplarını takip et.':'Read random score lines at your own pace or with a metronome. Follow note groups while keeping the beat.')}</p><button className="studio-text-button" onClick={()=>onNavigate(destination)}>{tr?'Çalışmaya başla':'Start practising'} →</button></article>)}</div><p className="kicker studio-instrument-heading">{tr?'MÜZİK ALETLERİ':'INSTRUMENTS'}</p><div className="studio-instrument-grid">{(['guitar','piano','violin'] as const).map((kind,i)=><article key={kind} className="studio-module studio-module--instrument"><InstrumentArt kind={kind}/><h3>{(tr?['Gitar','Piyano','Keman']:['Guitar','Piano','Violin'])[i]}</h3><p>{(tr?['Portedeki notayı tel ve perdelerle eşleştir; aynı sesin bütün konumlarını bul.','Sol ve fa anahtarındaki notaları tuşlarla eşleştir; yarım sesleri çalış.','Birinci pozisyonda doğal notaların tel ve parmak konumlarını öğren.']:['Match written notes to strings and frets; find every position of the same pitch.','Match treble and bass clef notes to keys and explore semitones.','Learn string and finger positions for natural notes in first position.'])[i]}</p><button className="studio-text-button" onClick={()=>onNavigate(kind)}>{tr?'Çalışmayı aç':'Open practice'} →</button></article>)}</div></section>
    <section id="learning-path" className="studio-learning-path"><p className="kicker">{tr?'GELİŞİM YOLU':'LEARNING PATH'}</p><h2>{tr?'Okumadan çalmaya,':'From reading to playing,'} <em>{tr?'adım adım.':'step by step.'}</em></h2><p>{tr?'İstediğin konuyu seç. Kısa açıklamayı oku, bilgi kontrolünü tamamla ve ilgili oturuma geç.':'Choose a topic. Read the short explanation, complete the knowledge check, then open the related practice.'}</p><div className="studio-lesson-list">{lessons.map((item,i)=><button key={item.id} onClick={()=>open(item.id)} aria-expanded={active===item.id}><span className="studio-lesson-number">{String(i+1).padStart(2,'0')}</span><span><strong>{item.title[locale]}</strong><small>{item.minutes} {tr?'dk':'min'} · {STAGE_LABELS[locale][statusOf(item).stage as keyof typeof STAGE_LABELS['tr']]}{statusOf(item).missing.length>0&&statusOf(item).stage==='new'?` · ${tr?'önce':'first'}: ${statusOf(item).missing.map(id=>lessons.find(l=>l.id===id)?.title[locale]).join(', ')}`:''}</small></span><span aria-hidden="true">{statusOf(item).stage==='applied'?'★':completed.includes(item.id)?'✓':'→'}</span></button>)}</div></section>
    <LessonReviewPlan locale={locale} records={reviews} completed={completed} now={now} onOpen={id=>open(id,true)}/>
    <PulsePractice locale={locale}/>
    <EarTraining locale={locale}/>
    <SkillMap locale={locale} evidence={evidence} now={now}/>
    <div id="learning-history"><LocalProgress locale={locale}/></div>
  </section>;
}
