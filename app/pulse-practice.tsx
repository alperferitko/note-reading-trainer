"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluatePattern, evaluatePulse, patternTiming, RHYTHM_PATTERNS } from '@/lib/pulse-practice.mjs';
import { saveEvidence } from '@/lib/practice-evidence.mjs';
import { RhythmScoreLine, type RhythmScoreNote, type RhythmScoreValue } from './rhythm-glyphs';
import './pulse-practice.css';

type Run = { audio: AudioContext; start: number; interval: number; next: number; timer: number; taps: number[]; nodes: Set<OscillatorNode> };
type Result = ReturnType<typeof evaluatePulse>;
type PatternResult = ReturnType<typeof evaluatePattern>;
const COUNT_IN = 4;
const BEATS = 8;

export function PulsePractice({ locale }: { locale:'tr'|'en' }) {
  const tr=locale==='tr';
  const [bpm,setBpm]=useState(60);
  const [running,setRunning]=useState(false);
  const [beat,setBeat]=useState(-1);
  const [taps,setTaps]=useState(0);
  const [result,setResult]=useState<Result|null>(null);
  const [patternResult,setPatternResult]=useState<PatternResult|null>(null);
  const [patternId,setPatternId]=useState('steady');
  const pattern=RHYTHM_PATTERNS.find(item=>item.id===patternId);
  const timing=useMemo(()=>pattern?patternTiming(pattern):null,[pattern]);
  // The pattern is shown on a one-line staff so rests and beams read like the score studies.
  const patternNotes=useMemo<RhythmScoreNote[]>(()=>timing?timing.events.map(event=>({key:`${patternId}-${event.index}`,position:4,rhythm:event.rhythm as RhythmScoreValue,rest:event.type==='rest',groupId:event.groupId,barAfter:event.barAfter,state:'active'})):[],[timing,patternId]);
  const [message,setMessage]=useState('');
  const [sound,setSound]=useState(true);
  const soundRef=useRef(true);
  const run=useRef<Run|null>(null);
  const generation=useRef(0);
  const starting=useRef(false);
  const tapButton=useRef<HTMLButtonElement>(null);

  useEffect(()=>{const stop=()=>{release();setRunning(false);};window.addEventListener('notanota-stop-pulse',stop);return()=>window.removeEventListener('notanota-stop-pulse',stop);},[]);

  function release() {
    generation.current++;
    starting.current=false;
    const current=run.current;
    run.current=null;
    if(!current)return;
    window.clearInterval(current.timer);
    current.nodes.forEach(node=>{try{node.stop();}catch{/* Already ended. */}});
    void current.audio.close().catch(()=>{});
  }
  useEffect(()=>()=>{generation.current++;const current=run.current;run.current=null;if(current){clearInterval(current.timer);current.nodes.forEach(node=>{try{node.stop();}catch{/* Already ended. */}});void current.audio.close().catch(()=>{});}},[]);
  useEffect(()=>{
    if(!running)return;
    function visibility(){if(document.hidden){release();setRunning(false);setMessage(tr?'Sekme arka plana geçtiği için çalışma durduruldu. Sonuç kaydedilmedi.':'Practice stopped when the tab became hidden. No result was recorded.');}}
    document.addEventListener('visibilitychange',visibility);
    return()=>document.removeEventListener('visibilitychange',visibility);
  },[running,tr]);

  async function start() {
    if(starting.current||run.current)return;
    window.dispatchEvent(new Event('notanota-stop-ear'));
    starting.current=true;
    const id=++generation.current;
    let audio:AudioContext|undefined;
    try {
      audio=new AudioContext();
      await audio.resume();
      if(id!==generation.current){void audio.close();return;}
      if(audio.state!=='running')throw Error('Audio unavailable');
      const current:Run={audio,start:audio.currentTime+.15,interval:60/bpm,next:0,timer:0,taps:[],nodes:new Set()};
      run.current=current;
      setRunning(true);setResult(null);setPatternResult(null);setMessage('');setTaps(0);setBeat(-1);
      const session=`pulse-${Date.now()}`;
      const tick=()=>{
        if(run.current!==current)return;
        const now=current.audio.currentTime;
        // Schedule against the audio clock, not against repeated timeout delays.
        while(current.next<COUNT_IN+BEATS&&current.start+current.next*current.interval<now+.12){
          const when=current.start+current.next*current.interval;
          if(soundRef.current&&when>=now){
            const oscillator=current.audio.createOscillator(),gain=current.audio.createGain();
            oscillator.type='sine';oscillator.frequency.value=current.next<COUNT_IN?880:1320;
            gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.12,when+.003);gain.gain.exponentialRampToValueAtTime(.0001,when+.04);
            oscillator.connect(gain);gain.connect(current.audio.destination);current.nodes.add(oscillator);
            oscillator.onended=()=>{current.nodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};
            oscillator.start(when);oscillator.stop(when+.05);
          }
          current.next++;
        }
        setBeat(Math.max(-1,Math.min(COUNT_IN+BEATS-1,Math.floor((now-current.start)/current.interval))));
        if(now>=current.start+(COUNT_IN+BEATS-.5)*current.interval){
          release();setRunning(false);
          const at=new Date().toISOString();
          if(timing&&pattern){
            const summary=evaluatePattern(current.taps,bpm,timing);
            setPatternResult(summary);
            saveEvidence([{id:session,session,module:'rhythm',task:'tap-pattern',item:`pattern:${pattern.id}`,correct:summary.matched/summary.onsets>=.8&&summary.restTaps===0,firstAttempt:true,assisted:false,timedOut:false,responseMs:summary.meanAbsoluteMs,timeLimitMs:summary.toleranceMs||null,at}]);
          }else{
            const summary=evaluatePulse(current.taps,bpm,BEATS);
            setResult(summary);
            saveEvidence([{id:session,session,module:'rhythm',task:'tap-pulse',item:'pulse:steady',correct:summary.matched===summary.beats&&summary.extras===0,firstAttempt:true,assisted:false,timedOut:false,responseMs:summary.meanAbsoluteMs,timeLimitMs:null,at}]);
          }
        }
      };
      current.timer=window.setInterval(tick,25);tick();
      window.requestAnimationFrame(()=>tapButton.current?.focus({preventScroll:true}));
    }catch{if(audio&&audio.state!=='closed')void audio.close().catch(()=>{});setMessage(tr?'Ses motoru başlatılamadı. Tarayıcı izinlerini kontrol edip yeniden dene.':'The audio engine could not start. Check browser permissions and try again.');}
    finally{starting.current=false;}
  }
  function tap(){
    const current=run.current;if(!current)return;
    const relative=(current.audio.currentTime-current.start-COUNT_IN*current.interval)*1000;
    if(relative< -current.interval*500)return;
    current.taps.push(relative);setTaps(current.taps.length);
  }
  return <section className="pulse-practice" aria-labelledby="pulse-title">
    <p className="kicker">{tr?'RİTİM ATÖLYESİ':'RHYTHM WORKSHOP'}</p>
    <h2 id="pulse-title">{tr?'Önce vuruşu hisset.':'Feel the pulse first.'}</h2>
    <p>{tr?'4 hazırlık vuruşunu dinle, ardından 8 vuruş boyunca dokun. Eşit vuruşta her tıkta bir kez; örüntülerde yazılı her notanın başında bir kez dokun, suslarda dokunma.':'Listen to 4 count-in beats, then tap for 8 beats. For a steady pulse tap once per click; for a pattern tap once at the start of every written note and stay silent during rests.'}</p>
    <label className="pulse-pattern">{tr?'Çalışma':'Exercise'}<select value={patternId} disabled={running} onChange={e=>{setPatternId(e.target.value);setResult(null);setPatternResult(null);}}><option value="steady">{tr?'Eşit vuruş (8 dörtlük)':'Steady pulse (8 quarters)'}</option>{RHYTHM_PATTERNS.map(item=><option key={item.id} value={item.id}>{item.title[locale]}</option>)}</select></label>
    {timing&&<div className="pulse-pattern-score" aria-label={tr?'Dokunulacak ritim':'Rhythm to tap'} role="img"><RhythmScoreLine notes={patternNotes} timeSignature={[4,4]}/></div>}
    <div className="pulse-controls"><label>{tr?'Tempo':'Tempo'} <strong>{bpm} BPM</strong><input type="range" min="15" max="120" value={bpm} disabled={running} onChange={e=>setBpm(Number(e.target.value))}/></label><button type="button" role="switch" aria-checked={sound} onClick={()=>{soundRef.current=!sound;setSound(!sound);if(sound)run.current?.nodes.forEach(node=>{try{node.stop();}catch{/* Already ended. */}});}}>{sound?(tr?'Metronom sesi açık':'Metronome sound on'):(tr?'Metronom sesi kapalı':'Metronome sound off')}</button></div>
    {!running?<button type="button" className="primary-button" onClick={start}>{tr?'Vuruş çalışmasına başla':'Start pulse practice'}</button>:<div className="pulse-live">
      <p role="status">{beat<COUNT_IN?(tr?`Hazırlık: ${Math.max(0,beat+1)} / 4`:`Count in: ${Math.max(0,beat+1)} / 4`):(tr?`Vuruş: ${beat-COUNT_IN+1} / 8`:`Beat: ${beat-COUNT_IN+1} / 8`)}</p>
      <div className="pulse-beats" aria-hidden="true">{Array.from({length:4},(_,i)=><i className={beat>=0&&beat%4===i?'is-current':''} key={i}/>)}</div>
      <button type="button" ref={tapButton} className="pulse-tap" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();tap();}} onClick={e=>{if(e.detail===0)tap();}} onKeyDown={e=>{if(e.repeat&&(e.key===' '||e.key==='Enter'))e.preventDefault();}}>{tr?'Vuruşa dokun':'Tap the beat'}<small>{tr?'Dokun, tıkla veya bu düğme odaktayken boşluk tuşunu kullan.':'Tap, click or use Space while this button is focused.'}</small></button>
      <p>{taps} {tr?'dokunuş':'taps'}</p><button type="button" onClick={()=>{release();setRunning(false);setMessage(tr?'Çalışma durduruldu; sonuç üretilmedi.':'Practice stopped; no result was produced.');}}>{tr?'Durdur':'Stop'}</button>
    </div>}
    {message&&<p role="status">{message}</p>}
    {patternResult&&<div className="pulse-result" role="status"><h3>{tr?'Bu denemedeki örüntü':'Pattern in this attempt'}</h3>
      <p>{patternResult.matched} / {patternResult.onsets} {tr?'nota başlangıcı yakalandı':'note onsets matched'} · {patternResult.missed} {tr?'eksik':'missed'} · {patternResult.restTaps} {tr?'sus sırasında dokunuş':'taps during rests'} · {patternResult.extras} {tr?'diğer fazladan dokunuş':'other extra taps'}</p>
      <p>{tr?'Vuruş üstündeki girişler':'Entries on the beat'}: {patternResult.onBeat.matched} / {patternResult.onBeat.total}{patternResult.offBeat.total>0&&<> · {tr?'vuruş arasındaki girişler':'entries between beats'}: {patternResult.offBeat.matched} / {patternResult.offBeat.total}</>}{patternResult.afterRest.total>0&&<> · {tr?'sustan sonraki girişler':'entries after rests'}: {patternResult.afterRest.matched} / {patternResult.afterRest.total}</>}</p>
      <p>{patternResult.meanAbsoluteMs===null?(tr?'Karşılaştırılabilecek bir dokunuş yok.':'No taps available for comparison.'):`${tr?'Ortalama mutlak sapma':'Mean absolute offset'}: ${patternResult.meanAbsoluteMs} ms (${tr?'kabul aralığı':'tolerance'} ±${patternResult.toleranceMs} ms)`}</p>
      <p>{patternResult.offBeat.total>patternResult.offBeat.matched?(tr?'Vuruş arasındaki girişleri kaçırdıysan vuruşları içinden “bir-ve” diye bölerek dene.':'If you missed entries between beats, subdivide by counting “one-and” inside each beat.'):patternResult.restTaps?(tr?'Suslarda içinden saymaya devam et; dokunmak için sonraki notanın başını bekle.':'Keep counting through rests; wait for the start of the next note before tapping.'):(tr?'Bir sonraki denemede tempoyu biraz artırabilirsin.':'You can raise the tempo slightly on your next attempt.')}</p></div>}
    {result&&<div className="pulse-result" role="status"><h3>{tr?'Bu denemenin zamanlaması':'Timing in this attempt'}</h3><p>{result.matched} / {result.beats} {tr?'vuruşa karşılık gelen dokunuş':'beats with a tap'} · {result.missed} {tr?'eksik':'missed'} · {result.extras} {tr?'fazladan dokunuş':'extra taps'}</p><p>{result.meanAbsoluteMs===null?(tr?'Henüz karşılaştırılabilecek bir dokunuş yok.':'No taps available for comparison.'):`${tr?'Ortalama mutlak sapma':'Mean absolute offset'}: ${result.meanAbsoluteMs} ms`}</p><p>{tr?'Bir sonraki denemede önce dört vuruşu dinle. Uzun aralıkları zihninden daha küçük eşit parçalara böl; peş peşe fazladan tıklama.':'On your next attempt, listen to four beats first. Subdivide longer gaps mentally instead of adding extra clicks.'}</p></div>}
    <p className="pulse-caveat">{tr?'Bu, tarayıcı dokunuşlarının metronom zamanına göre yaklaşık ölçümüdür. Cihaz, ses çıkışı ve Bluetooth gecikmesi sonucu etkileyebilir. Müzik yeteneği veya enstrüman tekniği puanı değildir; dokunuşlar sunucuya gönderilmez.':'This is an approximate comparison of browser taps with metronome timing. Device, audio output and Bluetooth latency can affect results. It is not a musical-ability or instrument-technique score; taps are not sent to a server.'}</p>
  </section>;
}
