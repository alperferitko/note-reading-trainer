"use client";
import { useEffect, useMemo, useState } from 'react';
import { pitchFromMidi, pitchName, matchesSoundingPitch, parsePitchAnswer } from '@/lib/music-pitch.mjs';
import { playPracticeNote } from '@/lib/practice-audio';
import { GrandStaff, MusicStaff } from './notation';
import { LocalResult } from './local-progress';
import { SessionGuidance } from './session-guidance';
import { NavigationOptions, usePracticeNavigation, type Clef } from './practice-tools';
import { buildTargetedPool, findWeakItems, saveEvidence, spreadRepeats, type ItemSummary } from '@/lib/practice-evidence.mjs';
import { TargetedReviewCard, TargetedReviewResult, useEvidence, writtenNoteLabel } from './targeted-review';

// `pair` holds the bass-staff pitch of a grand-staff question; `midi` is then the treble pitch.
type Position = { id:string; midi:number; string?:number; offset?:number; misses?:number; pair?:number };
type PianoRange = 'treble'|'bass'|'grand';
type ViolinPosition = 'first'|'third';
const NATURALS=[0,2,4,5,7,9,11];
const TUNING=[55,62,69,76];
const STRING_NAMES={tr:['Sol','Re','La','Mi'],en:['G','D','A','E']};
const PIANO_RANGES:Record<PianoRange,[number,number]>={treble:[60,84],bass:[36,60],grand:[36,84]};
// Semitone offsets from the open string that each violin position covers.
const VIOLIN_OFFSETS:Record<ViolinPosition,[number,number]>={first:[0,7],third:[4,10]};
const GRAND_QUESTIONS=12;

// Finger for each semitone offset. First position: 1 on a whole tone, 3 on the fourth, 4 on the fifth.
// Third position: 1 on the fourth, 4 on the minor seventh. Low fingers sit a semitone back.
const VIOLIN_FINGERS:Record<ViolinPosition,Record<number,[number,boolean]>>={
  first:{1:[1,true],2:[1,false],3:[2,true],4:[2,false],5:[3,false],6:[3,false],7:[4,false]},
  third:{4:[1,true],5:[1,false],6:[2,true],7:[2,false],8:[3,true],9:[3,false],10:[4,false]},
};
function violinFinger(offset:number, position:ViolinPosition) {
  const [finger,low]=VIOLIN_FINGERS[position][offset]??[0,false];
  return { finger, low };
}

function shuffle<T>(items:T[]) {
  const copy=[...items];
  for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
  return copy;
}

/** Random pairs of one bass-staff and one treble-staff pitch, read at the same time. */
function grandPairs(count:number, chromatic:boolean):Position[] {
  const allowed=(midi:number)=>chromatic||NATURALS.includes(midi%12);
  const bass=Array.from({length:24},(_,i)=>36+i).filter(allowed);
  const treble=Array.from({length:25},(_,i)=>60+i).filter(allowed);
  const seen=new Set<string>();
  const pairs:Position[]=[];
  while(pairs.length<count){
    const low=bass[Math.floor(Math.random()*bass.length)], high=treble[Math.floor(Math.random()*treble.length)];
    const id=`pair-${low}-${high}`;
    if(seen.has(id))continue;
    seen.add(id);pairs.push({id,midi:high,pair:low,misses:0});
  }
  return pairs;
}

export function InstrumentTrainer({ instrument,locale,noteSoundEnabled,onSessionActiveChange }: {instrument:'piano'|'violin';locale:'tr'|'en';noteSoundEnabled:boolean;onSessionActiveChange:(active:boolean)=>void}) {
  const tr=locale==='tr', piano=instrument==='piano';
  const name=piano?(tr?'Piyano':'Piano'):(tr?'Keman':'Violin');
  const [stage,setStage]=useState<'setup'|'quiz'|'done'>('setup');
  const [mode,setMode]=useState<'locate'|'name'>('locate');
  const [range,setRange]=useState<PianoRange>('treble');
  const [violinPosition,setViolinPosition]=useState<ViolinPosition>('first');
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
  const [targetedKeys,setTargetedKeys]=useState<string[]>([]);
  const evidence=useEvidence();
  const grand=piano&&range==='grand';
  // Grand-staff reading is about locating both hands' notes; naming one key is a single-staff task.
  const activeMode=grand?'locate':mode;
  const clef:Clef=piano&&range==='bass'?'bass':'treble';
  const [firstMidi,lastMidi]=PIANO_RANGES[piano?range:'treble'];
  const positions=useMemo<Position[]>(()=>piano
    ? Array.from({length:lastMidi-firstMidi+1},(_,i)=>({id:`key-${firstMidi+i}`,midi:firstMidi+i})).filter(p=>chromatic||NATURALS.includes(p.midi%12))
    : TUNING.flatMap((open,string)=>{const [from,to]=VIOLIN_OFFSETS[violinPosition];return Array.from({length:to-from+1},(_,i)=>({id:`${string}-${from+i}`,midi:open+from+i,string,offset:from+i}));}).filter(p=>NATURALS.includes(p.midi%12)),[piano,firstMidi,lastMidi,chromatic,violinPosition]);
  const question=queue[0];
  const note=question?pitchFromMidi(question.midi,clef):null;
  const matchesPitch = (value: string, expected: { midi: number }) => matchesSoundingPitch(value, expected.midi);
  const targets=question?(question.pair!==undefined?[question.pair,question.midi]:[question.midi]):[];
  const matches=positions.filter(p=>targets.includes(p.midi));
  const choices=tr?['Do','Re','Mi','Fa','Sol','La','Si']:['C','D','E','F','G','A','B'];
  const location=(p:Position)=>{
    if(piano)return `${pitchName(pitchFromMidi(p.midi),locale,true)} ${tr?'tuşu':'key'}`;
    const {finger,low}=violinFinger(p.offset!,violinPosition);
    return `${STRING_NAMES[locale][p.string!]} ${tr?'teli':'string'} · ${p.offset===0?(tr?'boş tel':'open string'):`${finger}. ${tr?'parmak':'finger'}${low?(tr?' (düşük)':' (low)'):''}`}`;
  };
  useEffect(()=>{onSessionActiveChange(stage==='quiz');return()=>onSessionActiveChange(false);},[stage,onSessionActiveChange]);
  // Written-pitch questions are keyed by clef and pitch; naming questions by the physical place.
  const evidenceKey=(p:Position)=>activeMode==='locate'?`${clef}:m${p.midi}`:p.id;
  const questionPool=useMemo(()=>activeMode==='name'?positions:positions.filter((p,i,all)=>all.findIndex(x=>x.midi===p.midi)===i),[activeMode,positions]);
  const weak=useMemo(()=>{
    if(grand)return [];
    const keys=new Set(questionPool.map(p=>activeMode==='locate'?`${clef}:m${p.midi}`:p.id));
    return findWeakItems(evidence,{module:instrument,task:activeMode}).filter(item=>keys.has(item.item));
  },[evidence,questionPool,activeMode,clef,instrument,grand]);
  const evidenceLabel=(item:ItemSummary)=>{
    if(item.task==='locate'||item.task==='grand-locate')return writtenNoteLabel(item,locale);
    const place=positions.find(p=>p.id===item.item);
    return place?location(place):item.item;
  };

  function begin(targeted:boolean){
    const plan=grand?{pool:grandPairs(GRAND_QUESTIONS,chromatic),targeted:[] as Position[]}
      :targeted?buildTargetedPool(questionPool,weak.map(item=>item.item),{itemKey:evidenceKey}):{pool:questionPool,targeted:[] as Position[]};
    const shuffled=shuffle(plan.pool.map(p=>({...p,misses:0})));
    setQueue(targeted?spreadRepeats(shuffled,p=>p.id):shuffled);
    setTargetedKeys(plan.targeted.map(evidenceKey));
    setSelected([]);setFeedback(null);setCorrect(0);setWrong(0);setElapsed(0);
    const now=Date.now();setSession(now);setQuestionAt(now);setStage('quiz');
  }
  function start(){begin(false);}
  function startTargeted(){setEndless(false);begin(true);}

  function record(midi:number,staff:Clef,ok:boolean,answeredAt:number,answer?:string){
    const written=pitchFromMidi(midi,staff);
    saveEvidence([{id:`${instrument}-${session}-${answeredAt}-${staff}-${midi}`,session:`${instrument}-${session}`,module:instrument,task:grand?'grand-locate':activeMode,item:grand?`${staff}:m${midi}`:evidenceKey(question),clef:staff,midi,octave:written.octave,position:written.position,accidental:written.accidental,correct:ok,firstAttempt:!question.misses,assisted:Boolean(question.misses),timedOut:false,responseMs:Math.max(0,answeredAt-questionAt),timeLimitMs:null,answer,at:new Date(answeredAt).toISOString()}]);
  }
  function grade(ok:boolean,answer?:string,wrongMidi?:number){
    if(!question||feedback)return;
    // Only runs from answer clicks, key presses or navigation callbacks, never during render.
    // eslint-disable-next-line react-hooks/purity
    const answeredAt=Date.now();
    setElapsed(n=>n+answeredAt-questionAt);
    if(question.pair!==undefined){
      // A wrong key is attributed to the staff whose range it lies in.
      if(ok){record(question.pair,'bass',true,answeredAt);record(question.midi,'treble',true,answeredAt);}
      else{const staff:Clef=(wrongMidi??60)<60?'bass':'treble';record(staff==='bass'?question.pair:question.midi,staff,false,answeredAt,answer);}
    }else record(question.midi,clef,ok,answeredAt,answer);
    if(ok){setCorrect(n=>n+1);targets.forEach(midi=>playPracticeNote(midi,noteSoundEnabled));}else setWrong(n=>n+1);
    setFeedback(ok?'correct':'wrong');
  }
  function select(p:Position){
    if(feedback||!question||selected.includes(p.id))return;
    const next=[...selected,p.id];setSelected(next);
    if(!targets.includes(p.midi))grade(false,p.id,p.midi);
    else if(matches.every(m=>next.includes(m.id)))grade(true);
  }
  function answerName(value:string){if(!note)return;const parsed=parsePitchAnswer(value);grade(matchesPitch(value,note),parsed?`${parsed.letter}${parsed.accidental===1?'#':parsed.accidental===-1?'b':''}`:undefined);}
  function next(){
    if(!feedback)return;
    const rest=queue.slice(1);
    if(endless&&grand&&feedback==='correct')rest.push(...grandPairs(1,chromatic));
    else if(endless||feedback==='wrong')rest.push({...question,misses:(question.misses??0)+(feedback==='wrong'?1:0)});
    if(!rest.length){setStage('done');return;}
    setQueue(rest);setSelected([]);setFeedback(null);setAccidental('');
    // Only runs from user events or the navigation effect timer, never render.
    // eslint-disable-next-line react-hooks/purity
    setQuestionAt(Date.now());
  }
  const navigation=usePracticeNavigation({active:stage==='quiz',feedback:!!feedback,choices:activeMode==='name'?choices.map(n=>n+accidental):[],onAnswer:answerName,onNext:next});

  function keyboard(study=false){
    const keys=Array.from({length:lastMidi-firstMidi+1},(_,i)=>firstMidi+i);
    const whiteCount=keys.filter(m=>NATURALS.includes(m%12)).length;
    return <div className="piano-scroll" tabIndex={0} role="region" aria-label={tr?'Piyano klavyesi':'Piano keyboard'}><div className="piano-keyboard" style={{width:`${whiteCount*40}px`}}>{keys.map((midi,i)=>{
      const black=!NATURALS.includes(midi%12);
      const whites=keys.slice(0,i).filter(m=>NATURALS.includes(m%12)).length;
      const p=positions.find(p=>p.midi===midi);
      const revealed=study||Boolean(feedback);
      return <button key={midi} type="button" disabled={!p||study||!!feedback||activeMode==='name'} className={`piano-key ${black?'piano-key--black':''} ${midi===60?'piano-key--middle-c':''} ${!study&&activeMode==='name'&&question?.midi===midi?'is-target':''} ${selected.includes(`key-${midi}`)?'is-selected':''}`} style={{left:`${black?whites*40-13:whites*40}px`}} onClick={()=>p&&select(p)} aria-label={revealed?location({id:'',midi}):`${tr?'Tuş':'Key'} ${i+1}${midi===60?(tr?' (orta Do)':' (middle C)'):''}`} aria-pressed={selected.includes(`key-${midi}`)}>{revealed?pitchName(pitchFromMidi(midi),locale,true):!black&&midi%12===0?`C${Math.floor(midi/12)-1}`:''}</button>;
    })}</div></div>;
  }
  function violin(study=false){
    return <div className="violin-board">{TUNING.map((_,string)=><div className="violin-string" key={string}><strong>{STRING_NAMES[locale][string]}</strong>{positions.filter(p=>p.string===string).map(p=>{
      const {finger,low}=violinFinger(p.offset!,violinPosition);
      return <button type="button" key={p.id} disabled={study||!!feedback||activeMode==='name'} className={`${!study&&activeMode==='name'&&question?.id===p.id?'is-target':''} ${selected.includes(p.id)?'is-selected':''}`} onClick={()=>select(p)} aria-label={location(p)} aria-pressed={selected.includes(p.id)}><span>{p.offset===0?(tr?'Boş':'Open'):`${finger}${low?'↓':''}`}</span>{(study||feedback)&&<small>{pitchName(pitchFromMidi(p.midi),locale)}</small>}</button>;
    })}</div>)}</div>;
  }

  const intro=piano
    ?(tr?'Portedeki sesi doğru tuşla eşleştir veya işaretlenen tuşun adını bul. Oktavı dikkate al; siyah tuşları ekleyerek yarım sesleri çalış. Çift portede iki elin notalarını aynı anda okuyup iki tuşu da bulursun.':'Match the written pitch to its key or name the highlighted key. Match the octave and include black keys to practise semitones. On the grand staff you read both hands’ notes at once and find both keys.')
    :(tr?'Standart Sol–Re–La–Mi akordunda doğal notaları çalış. Birinci pozisyon boş telden başlar; üçüncü pozisyonda el, boş telin dörtlü üstündeki 1. parmakla başlar. Aynı sesi veren bütün konumları bul. ↓ düşük parmağı belirtir.':'Practise natural notes in standard G–D–A–E tuning. First position starts at the open string; in third position the hand starts with finger 1 a fourth above the open string. Find every location of the same pitch. ↓ marks a low finger.');

  if(stage==='setup')return <section className="instrument-practice"><h1>{name} {tr?'çalışması':'practice'}</h1><p>{intro}</p>
    <div className="notation-options">
      <label>{tr?'Çalışma biçimi':'Practice mode'}<select value={activeMode} disabled={grand} onChange={e=>setMode(e.target.value as typeof mode)}><option value="locate">{tr?'Porteyi gör, enstrümanda bul':'See staff, find location'}</option><option value="name">{tr?'İşaretlenen notayı adlandır':'Name the highlighted note'}</option></select></label>
      {piano&&<label>{tr?'Anahtar ve aralık':'Clef and range'}<select value={range} onChange={e=>setRange(e.target.value as PianoRange)}><option value="treble">{tr?'Sol · Do4–Do6':'Treble · C4–C6'}</option><option value="bass">{tr?'Fa · Do2–Do4':'Bass · C2–C4'}</option><option value="grand">{tr?'Çift porte · iki el birlikte (Do2–Do6)':'Grand staff · both hands together (C2–C6)'}</option></select></label>}
      {!piano&&<label>{tr?'Pozisyon':'Position'}<select value={violinPosition} onChange={e=>setViolinPosition(e.target.value as ViolinPosition)}><option value="first">{tr?'1. pozisyon':'First position'}</option><option value="third">{tr?'3. pozisyon':'Third position'}</option></select></label>}
      <label><input type="checkbox" checked={endless} onChange={e=>setEndless(e.target.checked)} />{tr?'Ben bitirene kadar devam et':'Continue until I finish'}</label>
      {piano&&<label><input type="checkbox" checked={chromatic} onChange={e=>setChromatic(e.target.checked)} />{tr?'Siyah tuşları ekle':'Include black keys'}</label>}
    </div>
    {grand&&<p>{tr?`Her soruda fa anahtarında bir, sol anahtarında bir nota vardır. İkisini de doğru oktavda bulunca soru tamamlanır. ${GRAND_QUESTIONS} soru sorulur.`:`Each question has one note in the bass staff and one in the treble staff. Find both in the right octave to complete it. ${GRAND_QUESTIONS} questions are asked.`}</p>}
    {!piano&&violinPosition==='third'&&<p>{tr?'Üçüncü pozisyonda boş tel kullanılmaz. Örneğin La telinde 1. parmak Re, 2. parmak Mi, düşük 3. parmak Fa, 4. parmak Sol’dür.':'Third position does not use open strings. On the A string, finger 1 is D, finger 2 E, low finger 3 F and finger 4 G.'}</p>}
    {piano?keyboard(true):violin(true)}
    {!grand&&<TargetedReviewCard locale={locale} weak={weak} label={evidenceLabel} onStart={startTargeted}/>}
    <button type="button" className="primary-button" onClick={start}>{tr?'Çalışmaya başla':'Start practice'}</button></section>;
  if(stage==='done')return <section className="instrument-practice"><h1>{name}: {tr?'oturum özeti':'session results'}</h1><p>{correct} {tr?'doğru':'correct'} · {wrong} {tr?'yanlış':'incorrect'}</p><LocalResult id={`${instrument}-${session}`} module={name} correct={correct} wrong={wrong} milliseconds={elapsed} locale={locale}/><SessionGuidance locale={locale} module={instrument} wrong={wrong} attempts={correct+wrong}/><TargetedReviewResult locale={locale} session={`${instrument}-${session}`} targeted={targetedKeys} evidence={evidence} label={evidenceLabel}/><button className="primary-button" type="button" onClick={start}>{tr?'Tekrar çalış':'Practise again'}</button><button type="button" onClick={()=>setStage('setup')}>{tr?'Ayarları değiştir':'Change settings'}</button></section>;
  const bassNote=question?.pair!==undefined?pitchFromMidi(question.pair,'bass'):null;
  const trebleNote=question?pitchFromMidi(question.midi,'treble'):null;
  return <section className="instrument-practice"><div className="instrument-practice-top"><button type="button" onClick={()=>setStage('done')}>{tr?'Oturumu bitir':'End session'}</button><span>{correct} {tr?'doğru':'correct'} · {endless?'∞':queue.length} {tr?'kalan':'remaining'}</span></div>
    <h1>{grand?(tr?'Bu iki nota nerede?':'Where are these two notes?'):activeMode==='locate'?(tr?'Bu nota nerede?':'Where is this note?'):(tr?'İşaretlenen nota hangisi?':'Name the highlighted note')}</h1>
    <NavigationOptions locale={locale} {...navigation} numbers={activeMode==='name'}/>
    {grand&&bassNote&&trebleNote&&<GrandStaff treble={{position:trebleNote.position,accidental:trebleNote.accidental}} bass={{position:bassNote.position,accidental:bassNote.accidental}} label={tr?'Çift portede iki nota':'Two notes on a grand staff'}/>}
    {!grand&&activeMode==='locate'&&note&&<MusicStaff position={note.position} clef={clef} accidental={note.accidental} label={tr?'Portede bir nota':'A written note'}/>}
    {piano?keyboard():violin()}
    {activeMode==='locate'&&<p>{selected.filter(id=>matches.some(m=>m.id===id)).length} / {matches.length} {tr?'konum bulundu':'locations found'}</p>}
    {activeMode==='name'&&<><div className="accidental-choices">{['','♯','♭'].map(sign=><button type="button" disabled={!!feedback} key={sign} aria-pressed={accidental===sign} onClick={()=>setAccidental(sign)}>{sign||'♮'}</button>)}</div><div className="instrument-note-choices">{choices.map((choice,i)=><button type="button" disabled={!!feedback} key={choice} onClick={()=>answerName(choice+accidental)}>{choice}{accidental}<kbd>{i+1}</kbd></button>)}</div></>}
    <div className="instrument-feedback" role="status"><span>{feedback?`${feedback==='correct'?(tr?'Doğru':'Correct'):(tr?'Doğru cevap':'Correct answer')}: ${activeMode==='name'&&note?pitchName(note,locale,true):matches.map(location).join('; ')}`:''}</span><button type="button" onClick={next} disabled={!feedback}>{tr?'Sonraki':'Next'} →</button></div></section>;
}
