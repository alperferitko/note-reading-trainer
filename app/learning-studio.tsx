"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { LEARNING_LESSONS, LESSON_PROGRESS_KEY, LESSON_STATE_KEY, drawCheck, lessonStatus, markLessonState, recommendFromEvidence, recommendLesson, summarizeLearning, validLearningHistory, validCompletedLessons, validLessonStates, type Lesson as LessonData, type LessonState } from '@/lib/learning-path.mjs';
import { pageRoute } from '@/lib/site-routes.mjs';
import { useEvidence, weaknessReason } from './targeted-review';
import { SkillMap } from './skill-map';
import { RhythmPatternPreview } from './rhythm-glyphs';
import { LocalProgress } from './local-progress';
import { LessonReviewPlan, type LessonReview } from './lesson-review-plan';
import { REVIEW_KEY, validReviews, recordReview, buildReviewPlan } from '@/lib/lesson-review.mjs';

type Locale = 'tr' | 'en';
export type StudioView = 'studio' | 'lessons' | 'progress';
export type StudioTarget = 'landing' | 'setup' | 'pieces' | 'guitar' | 'piano' | 'violin' | 'rhythm' | 'listening' | 'lessons' | 'progress' | 'how';
type CheckQuestion = ReturnType<typeof drawCheck>[number];
type History = {id:string;module:string;correct:number;wrong:number;milliseconds:number;date:string};
type Track = 'reading' | 'rhythm' | 'guitar' | 'piano' | 'violin' | 'ear';
const lessons: LessonData[] = LEARNING_LESSONS;
const STAGE_LABELS = {
  tr: { new: 'Başlanmadı', read: 'Açıklama okundu', checked: 'Bilgi kontrolü geçti', applied: 'Uygulamada gösterildi' },
  en: { new: 'Not started', read: 'Explanation read', checked: 'Knowledge check passed', applied: 'Shown in practice' },
} as const;
const TRACKS: { id: Track; tr: string; en: string }[] = [
  { id: 'reading', tr: 'Okuma', en: 'Reading' },
  { id: 'rhythm', tr: 'Ritim', en: 'Rhythm' },
  { id: 'guitar', tr: 'Gitar', en: 'Guitar' },
  { id: 'piano', tr: 'Piyano', en: 'Piano' },
  { id: 'violin', tr: 'Keman', en: 'Violin' },
  { id: 'ear', tr: 'İşitme', en: 'Listening' },
];
const DESTINATION_TARGETS: Record<LessonData['destination'], StudioTarget> = { setup: 'setup', pieces: 'pieces', guitar: 'guitar', piano: 'piano', violin: 'violin', ear: 'listening' };

function InstrumentArt({kind}:{kind:'guitar'|'piano'|'violin'}) {
  return <svg viewBox="0 0 300 110" aria-hidden="true" className="studio-instrument-art">{kind==='piano'?<>{Array.from({length:7},(_,i)=><rect key={i} x={10+i*40} y="6" width="40" height="98" rx="3" fill={i===2?'var(--primary)':'var(--surface)'} stroke="currentColor"/>)}{[38,78,158,198,238].map(x=><rect key={x} x={x} y="6" width="24" height="60" rx="2" fill="currentColor"/>)}</>:<>{Array.from({length:kind==='guitar'?6:4},(_,i)=><line key={i} x1="4" x2="296" y1={10+i*(kind==='guitar'?18:29)} y2={10+i*(kind==='guitar'?18:29)} stroke="currentColor" strokeWidth={1+i*.2}/>)}{kind==='guitar'&&[60,120,180,240].map(x=><line key={x} x1={x} x2={x} y1="10" y2="100" stroke="currentColor" opacity=".5"/>)}<line x1="4" x2="4" y1="10" y2="100" stroke="currentColor" strokeWidth="4"/>{[90,160,230].map((x,i)=><circle key={x} cx={x} cy={kind==='guitar'?28+i*18:10+i*29} r="10" fill="var(--primary)"/>)}</>}</svg>;
}

/** A short barred line with beamed notes and a rest, for the score-reading tile. */
function ScoreArt() {
  return <svg viewBox="0 0 300 110" aria-hidden="true" className="studio-instrument-art"><g stroke="currentColor" strokeWidth="1.2" opacity=".7">{[0,1,2,3,4].map(i=><line key={i} x1="6" x2="294" y1={24+i*14} y2={24+i*14}/>)}</g><line x1="150" x2="150" y1="24" y2="80" stroke="currentColor" strokeWidth="2"/><line x1="292" x2="292" y1="24" y2="80" stroke="currentColor" strokeWidth="3"/>{[[34,66],[70,59]].map(([x,y])=><ellipse key={x} cx={x} cy={y} rx="8" ry="6" transform={`rotate(-18 ${x} ${y})`} fill="var(--primary)"/>)}<path d="M41 64 V30 M77 57 V30" stroke="var(--primary)" strokeWidth="2"/><rect x="41" y="28" width="36" height="5" fill="var(--primary)"/><path d="M106 36 L114 45 L108 52 L115 61 C 107 58, 105 65, 110 70" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><ellipse cx="186" cy="52" rx="8" ry="6" transform="rotate(-18 186 52)" fill="currentColor"/><path d="M193 50 V18" stroke="currentColor" strokeWidth="2"/><ellipse cx="236" cy="45" rx="8" ry="6" transform="rotate(-18 236 45)" fill="none" stroke="currentColor" strokeWidth="2.4"/><path d="M243 43 V11" stroke="currentColor" strokeWidth="2"/></svg>;
}

/** Five staff lines with a treble clef and an ascending step, for the note-reading tile. */
function StaffArt() {
  return <svg viewBox="0 0 300 110" aria-hidden="true" className="studio-instrument-art"><g stroke="currentColor" strokeWidth="1.2" opacity=".7">{[0,1,2,3,4].map(i=><line key={i} x1="6" x2="294" y1={24+i*14} y2={24+i*14}/>)}</g><text x="10" y="86" fontSize="78" fill="currentColor" className="music-clef">𝄞</text>{[[120,73],[180,59],[240,45]].map(([x,y])=><ellipse key={x} cx={x} cy={y} rx="10" ry="7" transform={`rotate(-18 ${x} ${y})`} fill="var(--primary)"/>)}</svg>;
}

/** A short list with one completed step, for the lessons tile. */
function LessonsArt() {
  return <svg viewBox="0 0 300 110" aria-hidden="true" className="studio-instrument-art">{[0,1,2].map(i=><g key={i}><circle cx="70" cy={24+i*30} r="10" fill={i===0?'var(--primary)':'none'} stroke={i===0?'var(--primary)':'currentColor'} strokeWidth="2"/><rect x="96" y={19+i*30} width={i===0?150:120-i*20} height="10" rx="5" fill="currentColor" opacity={i===0?.75:.4}/></g>)}<path d="M64 24 l5 5 l8 -10" fill="none" stroke="var(--surface)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

/** Steady beats with two accented clicks, for the rhythm workshop tile. */
function PulseArt() {
  return <svg viewBox="0 0 300 110" aria-hidden="true" className="studio-instrument-art">{Array.from({length:8},(_,i)=><rect key={i} x={14+i*36} y={i%4===0?18:40} width="18" height={i%4===0?74:52} rx="9" fill={i%4===0?'var(--primary)':'currentColor'} opacity={i%4===0?1:.55}/>)}</svg>;
}

/** Two sounding waves and an interval bracket, for the listening workshop tile. */
function ListeningArt() {
  return <svg viewBox="0 0 300 110" aria-hidden="true" className="studio-instrument-art"><path d="M10 70 Q 35 30 60 70 T 110 70 T 160 70" fill="none" stroke="currentColor" strokeWidth="3" opacity=".6"/><path d="M140 44 Q 158 14 176 44 T 212 44 T 248 44 T 284 44" fill="none" stroke="var(--primary)" strokeWidth="3"/><path d="M110 92 H 250 M110 86 V 98 M250 86 V 98" stroke="currentColor" strokeWidth="2"/></svg>;
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

export function LearningStudio({locale,onNavigate,initialLessonId,view='studio'}:{locale:Locale;onNavigate:(target:StudioTarget)=>void;initialLessonId?:string|null;view?:StudioView}) {
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
  const [track,setTrack]=useState<Track|null>(()=>lessons.find(l=>l.id===initialLesson)?.skill as Track|undefined??null);
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
  const appliedCount=lessons.filter(l=>statusOf(l).stage==='applied').length;
  const summary=summarizeLearning(history);
  const hasActivity=completed.length>0||history.length>0||evidence.length>0||reviews.length>0;
  const currentTrack:Track=track??(recommended.skill as Track);

  function link(target:StudioTarget){return {href:pageRoute(target,locale),onClick:(event:MouseEvent)=>{event.preventDefault();onNavigate(target);}};}
  function saveStates(next:LessonState[]){setLessonStates(next);try{localStorage.setItem(LESSON_STATE_KEY,JSON.stringify(next));}catch{setStorageWarning(true);}}
  function markRead(id:string){
    // Reading is recorded once; later openings keep the first date.
    let stored:unknown=lessonStates;try{stored=[...lessonStates,...validLessonStates(JSON.parse(localStorage.getItem(LESSON_STATE_KEY)||'[]'))];}catch{/* Use the in-memory list. */}
    // Only called from click handlers, never during render.
    // eslint-disable-next-line react-hooks/purity
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

  const reason=evidenceSuggestion
    ?(tr?`Aynı koşullarda tekrarlanan hatalar bu dersi öneriyor: ${weaknessReason(evidenceSuggestion.item,locale)}.`:`Repeated errors in comparable conditions point to this lesson: ${weaknessReason(evidenceSuggestion.item,locale)}.`)
    :suggestion.reason==='review'?(tr?`${suggestion.evidenceSessions} oturumdaki cevaplarına göre bu alanda temel bir tekrar öneriyoruz.`:`Based on answers in ${suggestion.evidenceSessions} sessions, a basic review may help.`)
    :suggestion.reason==='continue'?(tr?'Tamamladığın kısa derslerden sonraki adım.':'Your next step after the short lessons you completed.')
    :suggestion.reason==='revisit'?(tr?'Bütün bilgi kontrollerini tamamladın. Bir konuyu yeniden çalışabilir veya serbest oturuma geçebilirsin.':'You completed every knowledge check. Revisit a topic or choose free practice.')
    :(tr?'Temelden başla; öneriler, bu tarayıcıdaki çalışmaların biriktikçe güncellenir.':'Start with the basics; suggestions update as practice builds up in this browser.');

  const lessonButton=(item:LessonData)=>{
    const status=statusOf(item);
    return <button key={item.id} onClick={()=>open(item.id)} aria-expanded={active===item.id}>
      <span className="studio-lesson-number">{String(lessons.indexOf(item)+1).padStart(2,'0')}</span>
      <span><strong>{item.title[locale]}</strong><small>{item.minutes} {tr?'dk':'min'} · {STAGE_LABELS[locale][status.stage as keyof typeof STAGE_LABELS['tr']]}{status.missing.length>0&&status.stage==='new'?` · ${tr?'önce':'first'}: ${status.missing.map(id=>lessons.find(l=>l.id===id)?.title[locale]).join(', ')}`:''}</small></span>
      <span aria-hidden="true">{status.stage==='applied'?'★':completed.includes(item.id)?'✓':'→'}</span>
    </button>;
  };

  const lessonPanelView=lesson&&<section ref={lessonPanel} tabIndex={-1} className="studio-lesson" aria-labelledby="active-lesson-title"><div className="studio-section-top"><p className="kicker">{tr?'KISA DERS':'SHORT LESSON'} · {lesson.minutes} {tr?'DK':'MIN'}</p><button className="studio-text-button" onClick={()=>setActive(null)}>{tr?'Dersi kapat':'Close lesson'} ×</button></div><h2 id="active-lesson-title">{lesson.title[locale]}</h2><p className="studio-lesson-goal">{lesson.goal[locale]}</p><LessonMeta lesson={lesson} locale={locale} status={statusOf(lesson)}/>{recalling&&!showExplanation&&<div className="studio-recall-intro"><p>{tr?'Önce hatırlamayı dene. Açıklamayı açarsan yarın tekrar önerilir.':'Try recalling first. Opening the explanation schedules a review tomorrow.'}</p><button onClick={()=>{assisted.current=true;setShowExplanation(true);markRead(lesson.id);}}>{tr?'Açıklamayı göster':'Show explanation'}</button></div>}{showExplanation&&<><p>{lesson.explanation[locale]}</p><aside><strong>{tr?'Çalışma ipucu':'Practice tip'}</strong><p>{lesson.tip[locale]}</p></aside></>}{!finished&&question?<fieldset className="studio-question"><legend>{question.prompt[locale]}</legend><p>{questionIndex+1} / {checkQuestions.length}</p><div>{question.options[locale].map((option,i)=><button key={i} aria-pressed={answer===i} disabled={answer===question.answerIndex} onClick={()=>{if(i!==question.answerIndex)assisted.current=true;setAnswer(i);}}>{option}</button>)}</div>{answer!==null&&<div role="status" className="studio-question-feedback"><strong>{answer===question.answerIndex?(tr?'Doğru.':'Correct.'):(tr?'Bir kez daha düşün.':'Try again.')}</strong><p>{question.explanation[locale]}</p>{answer===question.answerIndex&&<button className="primary-button" onClick={()=>next(Date.now())}>{tr?'Devam et':'Continue'} →</button>}</div>}</fieldset>:<div className="studio-lesson-complete" role="status"><h3>{tr?'Bilgi kontrolü tamamlandı':'Knowledge check complete'}</h3><p className="studio-review-next">{tr?'Sonraki tekrar':'Next review'}: {new Intl.DateTimeFormat(tr?'tr-TR':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(reviews.find(row=>row.lessonId===lesson.id)?.dueAt??now))}</p><p>{tr?'Şimdi bunu yeni örneklerle pekiştir.':'Now reinforce this with new examples.'}</p><button className="primary-button" onClick={()=>onNavigate(DESTINATION_TARGETS[lesson.destination])}>{tr?'Uygulama oturumuna geç':'Open practice session'} →</button></div>}</section>;

  const storageNotice=storageWarning&&<p role="status">{tr?'Tarayıcı depolaması kullanılamıyor; bu ziyaret boyunca çalışmaya devam edebilirsin.':'Browser storage is unavailable; you can keep practising during this visit.'}</p>;
  const measuring=<a className="studio-measure-link" {...link('how')}>{tr?'Nasıl ölçüyoruz?':'How we measure'} →</a>;

  if(view==='lessons') return <section className="learning-studio learning-studio--lessons">
    <p className="studio-breadcrumb"><a {...link('landing')}>{tr?'Stüdyo':'Studio'}</a> / {tr?'Dersler':'Lessons'}</p>
    <header className="studio-page-header"><p className="kicker">{tr?'GELİŞİM YOLU':'LEARNING PATH'}</p><h1>{tr?'Okumadan çalmaya,':'From reading to playing,'} <em>{tr?'adım adım.':'step by step.'}</em></h1><p>{tr?`Kısa açıklamayı oku, iki soruluk kontrolü çöz ve ilgili çalışmaya geç. ✓ kontrolü geçtiğini, ★ beceriyi sonraki çalışmalarda yardımsız gösterdiğini belirtir (${completed.length} ✓ · ${appliedCount} ★).`:`Read the short explanation, pass the two-question check and move on to the related practice. ✓ marks a passed check, ★ a skill later shown unaided in practice (${completed.length} ✓ · ${appliedCount} ★).`}</p>{measuring}</header>
    {storageNotice}
    {lessonPanelView}
    <section className="studio-learning-path" aria-labelledby="lesson-track-title">
      <h2 id="lesson-track-title" className="sr-only">{tr?'Ders alanları':'Lesson tracks'}</h2>
      <div className="studio-track-tabs" role="group" aria-label={tr?'Ders alanı':'Lesson track'}>{TRACKS.map(item=>{const inTrack=lessons.filter(l=>l.skill===item.id);return <button key={item.id} aria-pressed={currentTrack===item.id} onClick={()=>setTrack(item.id)}>{item[locale]} <small>{inTrack.filter(l=>completed.includes(l.id)).length}/{inTrack.length}</small></button>;})}</div>
      <div className="studio-lesson-list">{lessons.filter(l=>l.skill===currentTrack).map(lessonButton)}</div>
    </section>
    {(reviews.length>0||completed.length>0)&&<LessonReviewPlan locale={locale} records={reviews} completed={completed} now={now} onOpen={id=>open(id,true)}/>}
  </section>;

  if(view==='progress') return <section className="learning-studio learning-studio--progress">
    <p className="studio-breadcrumb"><a {...link('landing')}>{tr?'Stüdyo':'Studio'}</a> / {tr?'İlerleme':'Progress'}</p>
    <header className="studio-page-header"><p className="kicker">{tr?'İLERLEME':'PROGRESS'}</p><h1>{tr?'Neyi, ne kadar çalıştın?':'What have you practised?'}</h1><p>{tr?'Bütün kayıtlar yalnız bu tarayıcıda tutulur, cihazlar arasında eşitlenmez ve buradan silinebilir.':'Every record stays in this browser, is not synced between devices and can be deleted here.'}</p>{measuring}</header>
    {storageNotice}
    {!hasActivity?<section className="studio-empty"><h2>{tr?'Henüz kayıt yok.':'Nothing recorded yet.'}</h2><p>{tr?'İlk çalışmanı tamamladığında ders durumu, beceri haritası ve oturum geçmişi burada görünür.':'After your first practice, lesson status, the skill map and session history appear here.'}</p><div className="studio-actions"><button className="primary-button" onClick={()=>onNavigate('setup')}>{tr?'Nota okumaya başla':'Start reading'} <span aria-hidden="true">→</span></button><a {...link('lessons')}>{tr?'Derslere göz at':'Browse lessons'}</a></div></section>:<>
      <section className="studio-stats" aria-label={tr?'Özet':'Summary'}>
        <div><strong>{completed.length} / {lessons.length}</strong><span>{tr?'bilgi kontrolü geçildi':'knowledge checks passed'}</span></div>
        <div><strong>{appliedCount}</strong><span>{tr?'uygulamada gösterildi':'shown in practice'}</span></div>
        <div><strong>{summary.sessions}</strong><span>{tr?'çalışma oturumu':'practice sessions'}</span></div>
        <div><strong>{summary.accuracy===null?'—':`%${summary.accuracy}`}</strong><span>{tr?'genel doğruluk':'overall accuracy'}</span></div>
        {reviewPlan.due.length>0&&<a {...link('lessons')}>{tr?`${reviewPlan.due.length} dersin tekrar zamanı geldi`:`${reviewPlan.due.length} lessons are due for review`} →</a>}
      </section>
      <SkillMap locale={locale} evidence={evidence} now={now}/>
      <div id="learning-history"><LocalProgress locale={locale}/></div>
    </>}
  </section>;

  // Eight equal tiles: every practice area and the lessons, one tap each, no descriptions to read.
  const tiles:{target:StudioTarget;title:string;art:ReactNode}[]=[
    {target:'setup',title:tr?'Nota okuma':'Note reading',art:<StaffArt/>},
    {target:'pieces',title:tr?'Eser okuma':'Score reading',art:<ScoreArt/>},
    {target:'guitar',title:tr?'Gitar':'Guitar',art:<InstrumentArt kind="guitar"/>},
    {target:'piano',title:tr?'Piyano':'Piano',art:<InstrumentArt kind="piano"/>},
    {target:'violin',title:tr?'Keman':'Violin',art:<InstrumentArt kind="violin"/>},
    {target:'rhythm',title:tr?'Ritim':'Rhythm',art:<PulseArt/>},
    {target:'listening',title:tr?'İşitme':'Listening',art:<ListeningArt/>},
    {target:'lessons',title:tr?'Dersler':'Lessons',art:<LessonsArt/>},
  ];

  // One decision on arrival: today's step. Everything else is a single tap below it.
  return <section className="learning-studio learning-studio--home">
    <section className="studio-focus" aria-labelledby="studio-title">
      <div className="studio-focus-copy">
        <p className="kicker">NOTANOTA</p>
        <h1 id="studio-title">{tr?'Notayı oku, ritmi say,':'Read the notes, feel the pulse,'} <em>{tr?'enstrümanında bul.':'find your sound.'}</em></h1>
        <p>{tr?'Porte okuma, ritim, işitme ve enstrüman çalışmaları; her gün birkaç dakika.':'Reading, rhythm, listening and instrument practice, a few minutes a day.'}</p>
        <div className="studio-hero-score" aria-hidden="true"><RhythmPatternPreview variant="mixed"/></div>
      </div>
      <div className="studio-focus-step">
        <small>{dueLesson?(tr?'TEKRAR ZAMANI':'REVIEW DUE'):(tr?'BUGÜNKÜ ADIM':'TODAY’S STEP')}</small>
        <strong>{recommended.title[locale]}</strong>
        <span>{recommended.minutes} {tr?'dk ders · 2 soruluk kontrol':'min lesson · 2-question check'}</span>
        <button className="primary-button" onClick={()=>open(recommended.id,Boolean(dueLesson))}>{dueLesson?(tr?'Hatırlamayı dene':'Try recalling'):(tr?'Bugünkü dersi başlat':'Start today’s lesson')} <span aria-hidden="true">→</span></button>
        <a {...link('setup')}>{tr?'ya da hemen nota oku':'or read notes right away'}</a>
        <p>{dueLesson?(tr?'Bu dersin tekrar zamanı geldi. Önce açıklamayı açmadan hatırlamayı dene.':'This lesson is due. Try recalling before opening the explanation.'):reason}</p>
      </div>
    </section>
    {storageNotice}
    {lessonPanelView}
    {hasActivity&&<a className="studio-progress-line" {...link('progress')}><strong>{completed.length}/{lessons.length} {tr?'ders':'lessons'} · {appliedCount} ★</strong><span>{tr?`${summary.sessions} oturum${summary.accuracy===null?'':` · %${summary.accuracy} doğruluk`}${reviewPlan.due.length?` · ${reviewPlan.due.length} tekrar bekliyor`:''}`:`${summary.sessions} sessions${summary.accuracy===null?'':` · ${summary.accuracy}% accuracy`}${reviewPlan.due.length?` · ${reviewPlan.due.length} reviews due`:''}`}</span><b aria-hidden="true">→</b></a>}
    <section className="studio-modules" aria-labelledby="studio-modules-title">
      <h2 id="studio-modules-title" className="kicker">{tr?'NE ÇALIŞMAK İSTERSİN?':'WHAT DO YOU WANT TO PRACTISE?'}</h2>
      <div className="studio-tile-grid">{tiles.map(tile=><a key={tile.target} className="studio-tile" {...link(tile.target)}><span className="studio-tile-art" aria-hidden="true">{tile.art}</span><strong>{tile.title}</strong></a>)}</div>
    </section>
  </section>;
}
