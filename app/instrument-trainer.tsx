"use client";
import { useEffect, useMemo, useState } from 'react';
import { pitchFromMidi, pitchName, matchesSoundingPitch } from '@/lib/music-pitch.mjs';
import { playPracticeNote } from '@/lib/practice-audio';
import { MusicStaff } from './notation';
import { LocalResult } from './local-progress';
import { SessionGuidance } from './session-guidance';
import { NavigationOptions, usePracticeNavigation, type Clef } from './practice-tools';
type Position = { id:string; midi:number; string?:number; offset?:number };
const NATURALS=[0,2,4,5,7,9,11];
const TUNING=[55,62,69,76];
export function InstrumentTrainer({ instrument,locale,noteSoundEnabled,onSessionActiveChange }: {instrument:'piano'|'violin';locale:'tr'|'en';noteSoundEnabled:boolean;onSessionActiveChange:(active:boolean)=>void}) {
  const tr=locale==='tr', piano=instrument==='piano';
  const name=piano?(tr?'Piyano':'Piano'):(tr?'Keman':'Violin');
  const [stage,setStage]=useState<'setup'|'quiz'|'done'>('setup');
  const [mode,setMode]=useState<'locate'|'name'>('locate');
  const [clef,setClef]=useState<Clef>('treble');
  const [chromatic,setChromatic]=useState(false);
  const [endless,setEndless]=useState(false);
  const [queue,setQueue]=useState<Position[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [feedback,setFeedback]=useState<'correct'|'wrong'|null>(null);
  const [correct,setCorrect]=useState(0);
  const [wrong,setWrong]=useState(0);
  const [session,setSession]=useState(0);
  const [elapsed,setElapsed]=useState(0);
  const [questionAt,setQuestionAt]=useState(0);
  const [accidental,setAccidental]=useState('');
  const firstMidi=clef==='bass'?36:60;
  const positions=useMemo<Position[]>(()=>piano
    ? Array.from({length:25},(_,i)=>({id:`key-${firstMidi+i}`,midi:firstMidi+i})).filter(p=>chromatic||NATURALS.includes(p.midi%12))
    : TUNING.flatMap((open,string)=>Array.from({length:8},(_,offset)=>({id:`${string}-${offset}`,midi:open+offset,string,offset}))).filter(p=>NATURALS.includes(p.midi%12)),[piano,firstMidi,chromatic]);
  const question=queue[0];
  const note=question?pitchFromMidi(question.midi,clef):null;
  const matchesPitch = (value: string, expected: { midi: number }) => matchesSoundingPitch(value, expected.midi);
  const matches=question?positions.filter(p=>p.midi===question.midi):[];
  const choices=tr?['Do','Re','Mi','Fa','Sol','La','Si']:['C','D','E','F','G','A','B'];
  const location=(p:Position)=>piano?`${pitchName(pitchFromMidi(p.midi),locale,true)} ${tr?'tuşu':'key'}`:`${(tr?['Sol','Re','La','Mi']:['G','D','A','E'])[p.string!]} ${tr?'teli':'string'} · ${p.offset===0?(tr?'boş tel':'open string'):`${Math.ceil(p.offset!/2)}. ${tr?'parmak':'finger'}${p.offset===1||p.offset===3?(tr?' (düşük)':' (low)'):''}`}`;
  useEffect(()=>{onSessionActiveChange(stage==='quiz');return()=>onSessionActiveChange(false);},[stage,onSessionActiveChange]);
  function start(){const pool=mode==='name'?positions:positions.filter((p,i,all)=>all.findIndex(x=>x.midi===p.midi)===i);const shuffled=[...pool];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}setQueue(shuffled);setSelected([]);setFeedback(null);setCorrect(0);setWrong(0);setElapsed(0);const now=Date.now();setSession(now);setQuestionAt(now);setStage('quiz');}
  function grade(ok:boolean){if(!question||feedback)return;setElapsed(n=>n+Date.now()-questionAt);if(ok){setCorrect(n=>n+1);playPracticeNote(question.midi,noteSoundEnabled);}else setWrong(n=>n+1);setFeedback(ok?'correct':'wrong');}
  function select(p:Position){if(feedback||!question||selected.includes(p.id))return;const next=[...selected,p.id];setSelected(next);if(p.midi!==question.midi)grade(false);else if(matches.every(m=>next.includes(m.id)))grade(true);}
  function next(){
    if(!feedback)return;
    const rest=queue.slice(1);
    if(endless||feedback==='wrong')rest.push(question);
    if(!rest.length){setStage('done');return;}
    setQueue(rest);setSelected([]);setFeedback(null);setAccidental('');
    // Only runs from user events or the navigation effect timer, never render.
    // eslint-disable-next-line react-hooks/purity
    setQuestionAt(Date.now());
  }
  const navigation=usePracticeNavigation({active:stage==='quiz',feedback:!!feedback,choices:mode==='name'?choices.map(n=>n+accidental):[],onAnswer:value=>note&&grade(matchesPitch(value,note)),onNext:next});
  function keyboard(study=false){const keys=Array.from({length:25},(_,i)=>firstMidi+i);return <div className="piano-scroll" tabIndex={0} role="region" aria-label={tr?'Piyano klavyesi':'Piano keyboard'}><div className="piano-keyboard">{keys.map((midi,i)=>{const black=!NATURALS.includes(midi%12);const whites=keys.slice(0,i).filter(m=>NATURALS.includes(m%12)).length;const p=positions.find(p=>p.midi===midi);const revealed=study||Boolean(feedback);return <button key={midi} type="button" disabled={!p||study||!!feedback||mode==='name'} className={`piano-key ${black?'piano-key--black':''} ${!study&&mode==='name'&&question?.midi===midi?'is-target':''} ${selected.includes(`key-${midi}`)?'is-selected':''}`} style={{left:`${black?whites*40-13:whites*40}px`}} onClick={()=>p&&select(p)} aria-label={revealed?location({id:'',midi}):`${tr?'Tuş':'Key'} ${i+1}`} aria-pressed={selected.includes(`key-${midi}`)}>{revealed?pitchName(pitchFromMidi(midi),locale,true):!black&&midi%12===0?`C${Math.floor(midi/12)-1}`:''}</button>;})}</div></div>;}
  function violin(study=false){return <div className="violin-board">{TUNING.map((_,string)=><div className="violin-string" key={string}><strong>{tr?['Sol','Re','La','Mi'][string]:['G','D','A','E'][string]}</strong>{positions.filter(p=>p.string===string).map(p=><button type="button" key={p.id} disabled={study||!!feedback||mode==='name'} className={`${!study&&mode==='name'&&question?.id===p.id?'is-target':''} ${selected.includes(p.id)?'is-selected':''}`} onClick={()=>select(p)} aria-label={location(p)} aria-pressed={selected.includes(p.id)}><span>{p.offset===0?(tr?'Boş':'Open'):`${Math.ceil(p.offset!/2)}${p.offset===1||p.offset===3?'↓':''}`}</span>{(study||feedback)&&<small>{pitchName(pitchFromMidi(p.midi),locale)}</small>}</button>)}</div>)}</div>;}
  if(stage==='setup')return <section className="instrument-practice"><h1>{name} {tr?'çalışması':'practice'}</h1><p>{piano?(tr?'Portedeki sesi doğru tuşla eşleştir veya işaretlenen tuşun adını bul. Oktavı dikkate al; siyah tuşları ekleyerek yarım sesleri çalış.':'Match the written pitch to its key or name the highlighted key. Match the octave and include black keys to practise semitones.'):(tr?'Standart Sol–Re–La–Mi akordunda, birinci pozisyondaki doğal notaları çalış. Aynı sesi veren bütün konumları bul. ↓ düşük parmağı belirtir.':'Practise natural notes in first position, with standard G–D–A–E tuning. Find every location of the same pitch. ↓ marks a low finger.')}</p><div className="notation-options"><label>{tr?'Çalışma biçimi':'Practice mode'}<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="locate">{tr?'Porteyi gör, enstrümanda bul':'See staff, find location'}</option><option value="name">{tr?'İşaretlenen notayı adlandır':'Name the highlighted note'}</option></select></label>{piano&&<label>{tr?'Anahtar ve aralık':'Clef and range'}<select value={clef} onChange={e=>setClef(e.target.value as Clef)}><option value="treble">{tr?'Sol · Do4–Do6':'Treble · C4–C6'}</option><option value="bass">{tr?'Fa · Do2–Do4':'Bass · C2–C4'}</option></select></label>}<label><input type="checkbox" checked={endless} onChange={e=>setEndless(e.target.checked)} />{tr?'Ben bitirene kadar devam et':'Continue until I finish'}</label>{piano&&<label><input type="checkbox" checked={chromatic} onChange={e=>setChromatic(e.target.checked)} />{tr?'Siyah tuşları ekle':'Include black keys'}</label>}</div>{piano?keyboard(true):violin(true)}<button type="button" className="primary-button" onClick={start}>{tr?'Çalışmaya başla':'Start practice'}</button></section>;
  if(stage==='done')return <section className="instrument-practice"><h1>{name}: {tr?'oturum özeti':'session results'}</h1><p>{correct} {tr?'doğru':'correct'} · {wrong} {tr?'yanlış':'incorrect'}</p><LocalResult id={`${instrument}-${session}`} module={name} correct={correct} wrong={wrong} milliseconds={elapsed} locale={locale}/><SessionGuidance locale={locale} module={instrument} wrong={wrong} attempts={correct+wrong}/><button className="primary-button" type="button" onClick={start}>{tr?'Tekrar çalış':'Practise again'}</button><button type="button" onClick={()=>setStage('setup')}>{tr?'Ayarları değiştir':'Change settings'}</button></section>;
  return <section className="instrument-practice"><div className="instrument-practice-top"><button type="button" onClick={()=>setStage('done')}>{tr?'Oturumu bitir':'End session'}</button><span>{correct} {tr?'doğru':'correct'} · {endless?'∞':queue.length} {tr?'kalan':'remaining'}</span></div><h1>{mode==='locate'?(tr?'Bu nota nerede?':'Where is this note?'):(tr?'İşaretlenen nota hangisi?':'Name the highlighted note')}</h1><NavigationOptions locale={locale} {...navigation} numbers={mode==='name'}/>{mode==='locate'&&note&&<MusicStaff position={note.position} clef={clef} accidental={note.accidental} label={tr?'Portede bir nota':'A written note'}/>}{piano?keyboard():violin()}{mode==='locate'&&<p>{selected.filter(id=>matches.some(m=>m.id===id)).length} / {matches.length} {tr?'konum bulundu':'locations found'}</p>}{mode==='name'&&<><div className="accidental-choices">{['','♯','♭'].map(sign=><button type="button" disabled={!!feedback} key={sign} aria-pressed={accidental===sign} onClick={()=>setAccidental(sign)}>{sign||'♮'}</button>)}</div><div className="instrument-note-choices">{choices.map((choice,i)=><button type="button" disabled={!!feedback} key={choice} onClick={()=>note&&grade(matchesPitch(choice+accidental,note))}>{choice}{accidental}<kbd>{i+1}</kbd></button>)}</div></>}<div className="instrument-feedback" role="status"><span>{feedback?`${feedback==='correct'?(tr?'Doğru':'Correct'):(tr?'Doğru cevap':'Correct answer')}: ${mode==='name'&&note?pitchName(note,locale,true):matches.map(location).join('; ')}`:''}</span><button type="button" onClick={next} disabled={!feedback}>{tr?'Sonraki':'Next'} →</button></div></section>;
}
