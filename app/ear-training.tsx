"use client";

import { useEffect, useRef, useState } from 'react';
import { makePitchQuestion, midiFrequency } from '@/lib/ear-training.mjs';
import './ear-training.css';

type Answer = 'higher'|'same'|'lower';
type Question = {first:number;second:number;answer:Answer};
type Sound = {context:AudioContext;nodes:OscillatorNode[]};
const labels = {tr:{higher:'Daha ince',same:'Aynı',lower:'Daha kalın'},en:{higher:'Higher',same:'Same',lower:'Lower'}};

export function EarTraining({locale}:{locale:'tr'|'en'}) {
  const tr=locale==='tr';
  const [level,setLevel]=useState('wide');
  const [question,setQuestion]=useState<Question|null>(null);
  const [answer,setAnswer]=useState<Answer|null>(null);
  const [heard,setHeard]=useState(false);
  const [playing,setPlaying]=useState(false);
  const [count,setCount]=useState(0);
  const [correct,setCorrect]=useState(0);
  const [finished,setFinished]=useState(false);
  const [message,setMessage]=useState('');
  const sound=useRef<Sound|null>(null);
  const generation=useRef(0);
  const answered=useRef(false);
  const playingRef=useRef(false);

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

  function newQuestion(){release();setPlaying(false);setQuestion(makePitchQuestion(level));setAnswer(null);setHeard(false);setMessage('');answered.current=false;}
  function start(){setCount(0);setCorrect(0);setFinished(false);newQuestion();}
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
      [question.first,question.second].forEach((pitch,i)=>{
        const node=context.createOscillator(),gain=context.createGain();
        node.type='sine';node.frequency.value=midiFrequency(pitch);
        const at=start+i*.8;
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.12,at+.025);gain.gain.setValueAtTime(.12,at+.46);gain.gain.linearRampToValueAtTime(0,at+.55);
        node.connect(gain);gain.connect(context.destination);sound.current?.nodes.push(node);
        node.onended=()=>{node.disconnect();gain.disconnect();if(i===1&&id===generation.current){setHeard(true);setPlaying(false);release();}};
        node.start(at);node.stop(at+.57);
      });
    }catch{if(id===generation.current){release();setPlaying(false);setMessage(tr?'Ses başlatılamadı. Tarayıcının ses iznini kontrol edip tekrar dene.':'Audio could not start. Check browser sound permissions and try again.');}}
  }
  function choose(value:Answer){if(!question||!heard||playing||answered.current)return;answered.current=true;setAnswer(value);setCount(n=>n+1);if(value===question.answer)setCorrect(n=>n+1);}
  function end(){release();setPlaying(false);setQuestion(null);setFinished(true);}
  return <section className="ear-training" aria-labelledby="ear-title">
    <p className="kicker">{tr?'İŞİTME ATÖLYESİ':'LISTENING WORKSHOP'}</p>
    <h2 id="ear-title">{tr?'Sesin yönünü duy.':'Hear the direction of pitch.'}</h2>
    <p>{tr?'İki sesi sırayla dinle. İkinci ses daha ince mi, daha kalın mı, yoksa aynı mı? Burada ses yüksekliğini (perdeyi) karşılaştırıyoruz; ses şiddetini değil.':'Listen to two tones in order. Is the second higher, lower or the same? Compare pitch, not loudness.'}</p>
    {!question&&<><label className="ear-level">{tr?'Çalışma aralığı':'Practice range'}<select value={level} onChange={e=>setLevel(e.target.value)}><option value="wide">{tr?'Geniş farklar · başlangıç':'Wide differences · beginner'}</option><option value="close">{tr?'Yakın sesler · daha zor':'Nearby pitches · harder'}</option></select></label><p>{tr?'Ses düzeyini rahat bir seviyeye getir. Çalışma, Dinle düğmesine bastığında ses üretir.':'Set a comfortable volume. Sound plays only when you press Listen.'}</p><button onClick={start}>{tr?'8 soruluk çalışmaya başla':'Start an 8-question practice'}</button></>}
    {question&&<div className="ear-session"><p>{Math.min(count+(answer?0:1),8)} / 8</p><button className="ear-listen" onClick={listen} disabled={playing}>{playing?(tr?'Çalınıyor…':'Playing…'):heard?(tr?'Tekrar dinle':'Listen again'):(tr?'İki sesi dinle':'Listen to both tones')}</button><p role="status">{!heard?(tr?'Cevaplamadan önce iki sesi de dinle.':'Listen to both tones before answering.'):(tr?'İkinci ses nasıldı?':'How was the second tone?')}</p><div className="ear-answers">{(['higher','same','lower'] as Answer[]).map(value=><button key={value} disabled={!heard||playing||answer!==null} aria-pressed={answer===value} onClick={()=>choose(value)}>{labels[locale][value]}</button>)}</div>{answer&&<div className="ear-feedback" role="status"><strong>{answer===question.answer?(tr?'Doğru.':'Correct.'):(tr?'Birlikte karşılaştıralım.':'Let’s compare.')}</strong><p>{tr?'İkinci ses: ':'The second tone: '}{labels[locale][question.answer]}. {tr?'Tekrar dinlerken önce ilk sesi zihninde tut, sonra ikinciyle karşılaştır.':'Listen again, holding the first tone in mind before comparing the second.'}</p><button onClick={count>=8?end:newQuestion}>{count>=8?(tr?'Sonucu gör':'See result'):(tr?'Sonraki soru':'Next question')} →</button></div>}<button className="ear-end" onClick={end}>{tr?'Çalışmayı bitir':'End practice'}</button></div>}
    {message&&<p role="alert">{message}</p>}
    {finished&&<div className="ear-result" role="status"><h3>{tr?'Dinleme özeti':'Listening summary'}</h3><p>{count?`${correct} / ${count} ${tr?'doğru cevap':'correct answers'}`:(tr?'Henüz cevap verilmedi.':'No answers yet.')}</p><p>{tr?'Zorlandıysan geniş farklarla yeniden dene. İki sesi de içinden mırıldanmak karşılaştırmana yardımcı olabilir.':'If this was difficult, try wide differences again. Humming both tones to yourself may help you compare them.'}</p></div>}
    <small>{tr?'Bu çalışma göreli ses yüksekliğini ayırt etme alıştırmasıdır; işitme testi veya müzik yeteneği puanı değildir. Mikrofon kullanılmaz, cevaplar sunucuya gönderilmez.':'This practises relative pitch direction; it is not a hearing test or musical-ability score. No microphone is used and answers are not sent to a server.'}</small>
  </section>;
}
