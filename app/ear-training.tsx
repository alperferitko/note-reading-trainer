"use client";

import { useEffect, useRef, useState } from 'react';
import { evaluateDictation, makeChordQuestion, makeDictationQuestion, makeIntervalQuestion, makePitchQuestion, midiFrequency } from '@/lib/ear-training.mjs';
import { namesLocale } from '@/lib/music-pitch.mjs';
import { saveEvidence } from '@/lib/practice-evidence.mjs';
import { useEvidence } from './targeted-review';
import './ear-training.css';

type Locale = 'tr'|'en';
type Mode = 'direction'|'interval'|'chord'|'dictation';
type Direction = 'higher'|'same'|'lower';
type Question =
  | { mode:'direction'; first:number; second:number; answer:Direction }
  | { mode:'interval'; root:number; top:number; answer:string; options:string[] }
  | { mode:'chord'; root:number; notes:number[]; answer:string; options:string[] }
  | { mode:'dictation'; notes:number[]; letters:string[] };
type Tone = { midi:number; at:number; length:number };
type Sound = {context:AudioContext;nodes:OscillatorNode[]};

const LABELS = {
  tr:{higher:'Daha ince',same:'Aynı',lower:'Daha kalın',m2:'Küçük ikili',M2:'Büyük ikili',m3:'Küçük üçlü',M3:'Büyük üçlü',P4:'Tam dörtlü',P5:'Tam beşli',P8:'Oktav',major:'Majör',minor:'Minör',diminished:'Eksik',augmented:'Artık'},
  en:{higher:'Higher',same:'Same',lower:'Lower',m2:'Minor 2nd',M2:'Major 2nd',m3:'Minor 3rd',M3:'Major 3rd',P4:'Perfect 4th',P5:'Perfect 5th',P8:'Octave',major:'Major',minor:'Minor',diminished:'Diminished',augmented:'Augmented'},
} as Record<Locale,Record<string,string>>;
const LETTERS = ['C','D','E','F','G','A','B'];
const SOLFEGE = ['Do','Re','Mi','Fa','Sol','La','Si'];
const MODE_COPY = {
  tr:{direction:['Perde yönü','İkinci ses daha ince mi, daha kalın mı?'],interval:['Aralık','İki sesin arasındaki mesafeyi adlandır.'],chord:['Akor türü','Üç sesli akorun rengini ayırt et.'],dictation:['Melodik dikte','Kısa bir ezgiyi nota adlarıyla yaz.']},
  en:{direction:['Pitch direction','Is the second tone higher or lower?'],interval:['Intervals','Name the distance between two tones.'],chord:['Chord quality','Tell the colour of a three-note chord.'],dictation:['Melodic dictation','Write a short melody with note names.']},
} as const;
const LEVELS: Record<Mode,{id:string;tr:string;en:string}[]> = {
  direction:[{id:'wide',tr:'Geniş farklar · başlangıç',en:'Wide differences · beginner'},{id:'close',tr:'Yakın sesler · daha zor',en:'Nearby pitches · harder'}],
  interval:[{id:'wide',tr:'Büyük üçlü, beşli, oktav',en:'Major 3rd, 5th, octave'},{id:'thirds',tr:'Üçlüler, dörtlü, beşli',en:'Thirds, 4th and 5th'},{id:'all',tr:'İkiliden oktava tümü',en:'All, 2nds to octave'}],
  chord:[{id:'basic',tr:'Majör ve minör',en:'Major and minor'},{id:'all',tr:'Majör, minör, eksik, artık',en:'Major, minor, diminished, augmented'}],
  dictation:[{id:'3',tr:'3 nota (ilk nota verilir)',en:'3 notes (first given)'},{id:'4',tr:'4 nota (ilk nota verilir)',en:'4 notes (first given)'}],
};
const QUESTIONS: Record<Mode,number> = { direction:8, interval:8, chord:8, dictation:5 };

function tonesFor(question:Question):Tone[] {
  if(question.mode==='direction')return [{midi:question.first,at:0,length:.55},{midi:question.second,at:.8,length:.55}];
  // Melodic first, then both together, so the distance is heard both ways.
  if(question.mode==='interval')return [{midi:question.root,at:0,length:.55},{midi:question.top,at:.8,length:.55},{midi:question.root,at:1.7,length:.9},{midi:question.top,at:1.7,length:.9}];
  if(question.mode==='chord')return [...question.notes.map(midi=>({midi,at:0,length:1.1})),...question.notes.map((midi,i)=>({midi,at:1.45+i*.42,length:.38}))];
  return question.notes.map((midi,i)=>({midi,at:i*.7,length:.55}));
}

export function EarTraining({locale}:{locale:Locale}) {
  const tr=locale==='tr';
  const [mode,setMode]=useState<Mode>('direction');
  const [level,setLevel]=useState('wide');
  const [question,setQuestion]=useState<Question|null>(null);
  const [answer,setAnswer]=useState<string|null>(null);
  const [dictation,setDictation]=useState<string[]>([]);
  const [heard,setHeard]=useState(false);
  const [playing,setPlaying]=useState(false);
  const [count,setCount]=useState(0);
  const [correct,setCorrect]=useState(0);
  const [finished,setFinished]=useState(false);
  const [message,setMessage]=useState('');
  const [session,setSession]=useState('');
  const sound=useRef<Sound|null>(null);
  const generation=useRef(0);
  const answered=useRef(false);
  const playingRef=useRef(false);
  const heardAt=useRef(0);
  const evidence=useEvidence();
  const total=QUESTIONS[mode];

  function release() {
    generation.current++;
    playingRef.current=false;
    const current=sound.current;sound.current=null;
    current?.nodes.forEach(node=>{node.onended=null;try{node.stop();}catch{/* Already stopped. */}node.disconnect();});
    if(current&&current.context.state!=='closed')void current.context.close().catch(()=>{});
  }
  useEffect(()=>{
    const interrupt=()=>{release();setPlaying(false);};
    const hidden=()=>{if(document.hidden)interrupt();};
    document.addEventListener('visibilitychange',hidden);
    window.addEventListener('notanota-stop-ear',interrupt);
    return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('notanota-stop-ear',interrupt);release();};
  },[]);

  function makeQuestion():Question {
    if(mode==='interval')return {mode,...makeIntervalQuestion(level)};
    if(mode==='chord')return {mode,...makeChordQuestion(level)};
    if(mode==='dictation')return {mode,...makeDictationQuestion(Number(level))};
    return {mode,...makePitchQuestion(level)};
  }
  function newQuestion(){release();setPlaying(false);setQuestion(makeQuestion());setAnswer(null);setDictation([]);setHeard(false);setMessage('');answered.current=false;}
  function start(){setCount(0);setCorrect(0);setFinished(false);setSession(`ear-${Date.now()}`);newQuestion();}
  function chooseMode(next:Mode){setMode(next);setLevel(LEVELS[next][0].id);}

  async function listen() {
    if(!question||playingRef.current)return;
    window.dispatchEvent(new Event('notanota-stop-pulse'));
    release();playingRef.current=true;const id=generation.current;
    setPlaying(true);setMessage('');
    try {
      const context=new AudioContext();sound.current={context,nodes:[]};
      await context.resume();
      if(id!==generation.current)return;
      if(context.state!=='running')throw Error('Unavailable audio');
      const start=context.currentTime+.08;
      const tones=tonesFor(question);
      const lastEnd=Math.max(...tones.map(tone=>tone.at+tone.length));
      tones.forEach(tone=>{
        const node=context.createOscillator(),gain=context.createGain();
        // Simultaneous tones share the level so chords are not louder than single notes.
        const together=tones.filter(other=>other.at===tone.at).length;
        const peak=.12/Math.sqrt(together);
        node.type=question.mode==='direction'?'sine':'triangle';node.frequency.value=midiFrequency(tone.midi);
        const at=start+tone.at;
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(peak,at+.025);gain.gain.setValueAtTime(peak,at+tone.length-.09);gain.gain.linearRampToValueAtTime(0,at+tone.length);
        node.connect(gain);gain.connect(context.destination);sound.current?.nodes.push(node);
        const isLast=tone.at+tone.length===lastEnd;
        node.onended=()=>{node.disconnect();gain.disconnect();if(isLast&&id===generation.current){heardAt.current=performance.now();setHeard(true);setPlaying(false);release();}};
        node.start(at);node.stop(at+tone.length+.02);
      });
    }catch{if(id===generation.current){release();setPlaying(false);setMessage(tr?'Ses başlatılamadı. Tarayıcının ses iznini kontrol edip tekrar dene.':'Audio could not start. Check browser sound permissions and try again.');}}
  }

  function record(item:string,ok:boolean,given:string){
    // Only called from answer clicks, never during render.
    // eslint-disable-next-line react-hooks/purity
    const responseMs=Math.max(0,Math.round(performance.now()-heardAt.current));
    saveEvidence([{id:`${session}-${count}`,session,module:'ear',task:mode,item,correct:ok,firstAttempt:true,assisted:false,timedOut:false,responseMs,timeLimitMs:null,answer:given.slice(0,24),at:new Date().toISOString()}]);
  }
  function choose(value:string){
    if(!question||question.mode==='dictation'||!heard||playing||answered.current)return;
    answered.current=true;setAnswer(value);setCount(n=>n+1);
    const ok=value===question.answer;
    if(ok)setCorrect(n=>n+1);
    record(`${question.mode}:${question.answer}`,ok,value);
  }
  function checkDictation(){
    if(!question||question.mode!=='dictation'||!heard||playing||answered.current||dictation.length!==question.letters.length-1)return;
    answered.current=true;setAnswer('checked');setCount(n=>n+1);
    const result=evaluateDictation(question.letters,dictation);
    if(result.allCorrect)setCorrect(n=>n+1);
    record(`dictation:${question.letters.length}`,result.allCorrect,dictation.join(''));
  }
  function end(){release();setPlaying(false);setQuestion(null);setFinished(true);}

  const name=(letter:string)=>namesLocale(locale)==='tr'?SOLFEGE[LETTERS.indexOf(letter)]:letter;
  const history=(['direction','interval','chord','dictation'] as Mode[]).map(item=>{const rows=evidence.filter(row=>row.module==='ear'&&row.task===item&&!row.assisted);return {mode:item,answers:rows.length,correct:rows.filter(row=>row.correct).length};}).filter(item=>item.answers>0);
  const dictationResult=question?.mode==='dictation'&&answer?evaluateDictation(question.letters,dictation):null;
  const expected=question&&question.mode!=='dictation'?question.answer:'';

  return <section className="ear-training" aria-labelledby="ear-title">
    <p className="kicker">{tr?'İŞİTME ATÖLYESİ':'LISTENING WORKSHOP'}</p>
    <h2 id="ear-title">{tr?'Duyduğunu adlandır.':'Name what you hear.'}</h2>
    <p>{tr?'Perde yönüyle başla, sonra aralık, akor türü ve kısa dikteye geç. Burada ses yüksekliğini (perdeyi) karşılaştırıyoruz; ses şiddetini değil.':'Start with pitch direction, then move on to intervals, chord quality and short dictation. Compare pitch, not loudness.'}</p>
    {!question&&<>
      <div className="ear-modes" role="group" aria-label={tr?'Çalışma türü':'Practice type'}>{(Object.keys(MODE_COPY.tr) as Mode[]).map(item=><button key={item} aria-pressed={mode===item} onClick={()=>chooseMode(item)}><strong>{MODE_COPY[locale][item][0]}</strong><small>{MODE_COPY[locale][item][1]}</small></button>)}</div>
      <label className="ear-level">{tr?'Zorluk':'Difficulty'}<select value={level} onChange={e=>setLevel(e.target.value)}>{LEVELS[mode].map(item=><option key={item.id} value={item.id}>{item[locale]}</option>)}</select></label>
      <p>{mode==='interval'?(tr?'Önce iki ses sırayla, sonra birlikte çalar.':'The two tones play one after the other, then together.'):mode==='chord'?(tr?'Akor önce birlikte, sonra sesleri sırayla çalar.':'The chord plays together, then note by note.'):mode==='dictation'?(tr?'Ezgi Do4 ile başlar ve Do majör dizisinde adım veya üçlüyle ilerler. İlk notadan sonraki notaları sırayla seç.':'The melody starts on C4 and moves by steps or thirds in C major. Choose the notes after the first, in order.'):(tr?'Ses düzeyini rahat bir seviyeye getir. Çalışma, Dinle düğmesine bastığında ses üretir.':'Set a comfortable volume. Sound plays only when you press Listen.')}</p>
      <button onClick={start}>{tr?`${total} soruluk çalışmaya başla`:`Start a ${total}-question practice`}</button>
    </>}
    {question&&<div className="ear-session"><p>{MODE_COPY[locale][mode][0]} · {Math.min(count+(answer?0:1),total)} / {total}</p><button className="ear-listen" onClick={listen} disabled={playing}>{playing?(tr?'Çalınıyor…':'Playing…'):heard?(tr?'Tekrar dinle':'Listen again'):question.mode==='direction'?(tr?'İki sesi dinle':'Listen to both tones'):(tr?'Dinle':'Listen')}</button>
      <p role="status">{!heard?(tr?'Cevaplamadan önce dinle.':'Listen before answering.'):question.mode==='direction'?(tr?'İkinci ses nasıldı?':'How was the second tone?'):question.mode==='interval'?(tr?'Bu aralık hangisi?':'Which interval is this?'):question.mode==='chord'?(tr?'Bu akor hangi türde?':'What quality is this chord?'):(tr?'İlk nota Do. Sonraki notaları sırayla seç.':'The first note is C. Choose the following notes in order.')}</p>
      {question.mode==='dictation'
        ?<div className="ear-dictation"><ol aria-label={tr?'Cevabın':'Your answer'}><li>{name('C')}</li>{Array.from({length:question.letters.length-1},(_,i)=><li key={i} className={dictationResult?(dictationResult.perNote[i]?'is-correct':'is-wrong'):''}>{dictation[i]?name(dictation[i]):'?'}</li>)}</ol>
          <div className="ear-answers">{LETTERS.map(letter=><button key={letter} disabled={!heard||playing||answer!==null||dictation.length>=question.letters.length-1} onClick={()=>setDictation(items=>[...items,letter])}>{name(letter)}</button>)}</div>
          <div className="ear-answers"><button disabled={!dictation.length||answer!==null} onClick={()=>setDictation(items=>items.slice(0,-1))}>{tr?'Son notayı sil':'Delete last note'}</button><button disabled={!heard||playing||answer!==null||dictation.length!==question.letters.length-1} onClick={checkDictation}>{tr?'Kontrol et':'Check'}</button></div></div>
        :<div className="ear-answers">{(question.mode==='direction'?['higher','same','lower']:question.options).map(value=><button key={value} disabled={!heard||playing||answer!==null} aria-pressed={answer===value} onClick={()=>choose(value)}>{LABELS[locale][value]}</button>)}</div>}
      {answer&&<div className="ear-feedback" role="status">{question.mode==='dictation'&&dictationResult
        ?<><strong>{dictationResult.allCorrect?(tr?'Doğru.':'Correct.'):(tr?`${dictationResult.correct} / ${dictationResult.total} nota doğru.`:`${dictationResult.correct} / ${dictationResult.total} notes correct.`)}</strong><p>{tr?'Ezgi':'Melody'}: {question.letters.map(name).join(' – ')}. {tr?'Tekrar dinlerken her notanın bir öncekinden yukarı mı aşağı mı gittiğini izle.':'Listen again and follow whether each note moves up or down from the one before.'}</p></>
        :<><strong>{answer===expected?(tr?'Doğru.':'Correct.'):(tr?'Birlikte karşılaştıralım.':'Let’s compare.')}</strong><p>{tr?'Doğru cevap: ':'Correct answer: '}{LABELS[locale][expected]}. {question.mode==='direction'?(tr?'Tekrar dinlerken önce ilk sesi zihninde tut, sonra ikinciyle karşılaştır.':'Listen again, holding the first tone in mind before comparing the second.'):question.mode==='interval'?(tr?'Tekrar dinleyip iki sesin arasını içinden adım adım doldurmayı dene.':'Listen again and try filling the gap between the tones step by step in your head.'):(tr?'Majör genellikle parlak, minör daha koyu duyulur; sesleri tek tek dinleyip ortadaki sesi karşılaştır.':'Major often sounds bright and minor darker; listen note by note and compare the middle tone.')}</p></>}
        <button onClick={count>=total?end:newQuestion}>{count>=total?(tr?'Sonucu gör':'See result'):(tr?'Sonraki soru':'Next question')} →</button></div>}
      <button className="ear-end" onClick={end}>{tr?'Çalışmayı bitir':'End practice'}</button></div>}
    {message&&<p role="alert">{message}</p>}
    {finished&&<div className="ear-result" role="status"><h3>{tr?'Dinleme özeti':'Listening summary'}</h3><p>{count?`${correct} / ${count} ${tr?'doğru cevap':'correct answers'}`:(tr?'Henüz cevap verilmedi.':'No answers yet.')}</p><p>{tr?'Zorlandıysan daha kolay bir seviyeyle yeniden dene. Sesleri içinden mırıldanmak karşılaştırmana yardımcı olabilir.':'If this was difficult, try an easier level again. Humming the tones to yourself may help you compare them.'}</p></div>}
    {history.length>0&&<details className="ear-history"><summary>{tr?'Bu tarayıcıdaki dinleme geçmişi':'Listening history in this browser'}</summary><ul>{history.map(item=><li key={item.mode}><strong>{MODE_COPY[locale][item.mode][0]}</strong> {item.correct} / {item.answers} {tr?'doğru':'correct'}</li>)}</ul><p>{tr?'Ayrıntılı durum beceri haritasında görünür. Az cevapla genel bir işitme yeteneği sonucu çıkarılmaz.':'The skill map shows details. No general listening ability is inferred from a few answers.'}</p></details>}
    <small>{tr?'Bu çalışmalar göreli perde, aralık ve akor ayırt etme alıştırmasıdır; işitme testi veya müzik yeteneği puanı değildir. Mikrofon kullanılmaz; cevaplar yalnız bu tarayıcıda saklanır, sunucuya gönderilmez.':'These exercises practise relative pitch, intervals and chord quality; they are not a hearing test or musical-ability score. No microphone is used; answers are stored only in this browser and are not sent to a server.'}</small>
  </section>;
}
