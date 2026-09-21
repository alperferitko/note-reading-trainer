"use client";

import { useEffect, useRef, useState } from 'react';
import { evaluatePulse } from '@/lib/pulse-practice.mjs';
import './pulse-practice.css';

type Run = { audio: AudioContext; start: number; interval: number; next: number; timer: number; taps: number[]; nodes: Set<OscillatorNode> };
type Result = ReturnType<typeof evaluatePulse>;
const COUNT_IN = 4;
const BEATS = 8;

export function PulsePractice({ locale }: { locale:'tr'|'en' }) {
  const tr=locale==='tr';
  const [bpm,setBpm]=useState(60);
  const [running,setRunning]=useState(false);
  const [beat,setBeat]=useState(-1);
  const [taps,setTaps]=useState(0);
  const [result,setResult]=useState<Result|null>(null);
  const [message,setMessage]=useState('');
  const [sound,setSound]=useState(true);
  const soundRef=useRef(true);
  const run=useRef<Run|null>(null);
  const generation=useRef(0);
  const starting=useRef(false);
  const tapButton=useRef<HTMLButtonElement>(null);

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
      setRunning(true);setResult(null);setMessage('');setTaps(0);setBeat(-1);
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
          const summary=evaluatePulse(current.taps,bpm,BEATS);
          release();setRunning(false);setResult(summary);
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
    <p>{tr?'4 hazırlık vuruşunu dinle, ardından 8 vuruş boyunca her tıkta bir kez dokun. Nota adı tahmin etmeden, yalnızca eşit zaman aralıklarını çalış.':'Listen to 4 count-in beats, then tap once per click for 8 beats. Practise steady timing without identifying note names.'}</p>
    <div className="pulse-controls"><label>{tr?'Tempo':'Tempo'} <strong>{bpm} BPM</strong><input type="range" min="15" max="120" value={bpm} disabled={running} onChange={e=>setBpm(Number(e.target.value))}/></label><button type="button" role="switch" aria-checked={sound} onClick={()=>{soundRef.current=!sound;setSound(!sound);if(sound)run.current?.nodes.forEach(node=>{try{node.stop();}catch{/* Already ended. */}});}}>{sound?(tr?'Metronom sesi açık':'Metronome sound on'):(tr?'Metronom sesi kapalı':'Metronome sound off')}</button></div>
    {!running?<button type="button" className="primary-button" onClick={start}>{tr?'Vuruş çalışmasına başla':'Start pulse practice'}</button>:<div className="pulse-live">
      <p role="status">{beat<COUNT_IN?(tr?`Hazırlık: ${Math.max(0,beat+1)} / 4`:`Count in: ${Math.max(0,beat+1)} / 4`):(tr?`Vuruş: ${beat-COUNT_IN+1} / 8`:`Beat: ${beat-COUNT_IN+1} / 8`)}</p>
      <div className="pulse-beats" aria-hidden="true">{Array.from({length:4},(_,i)=><i className={beat>=0&&beat%4===i?'is-current':''} key={i}/>)}</div>
      <button type="button" ref={tapButton} className="pulse-tap" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();tap();}} onClick={e=>{if(e.detail===0)tap();}} onKeyDown={e=>{if(e.repeat&&(e.key===' '||e.key==='Enter'))e.preventDefault();}}>{tr?'Vuruşa dokun':'Tap the beat'}<small>{tr?'Dokun, tıkla veya bu düğme odaktayken boşluk tuşunu kullan.':'Tap, click or use Space while this button is focused.'}</small></button>
      <p>{taps} {tr?'dokunuş':'taps'}</p><button type="button" onClick={()=>{release();setRunning(false);setMessage(tr?'Çalışma durduruldu; sonuç üretilmedi.':'Practice stopped; no result was produced.');}}>{tr?'Durdur':'Stop'}</button>
    </div>}
    {message&&<p role="status">{message}</p>}
    {result&&<div className="pulse-result" role="status"><h3>{tr?'Bu denemenin zamanlaması':'Timing in this attempt'}</h3><p>{result.matched} / {result.beats} {tr?'vuruşa karşılık gelen dokunuş':'beats with a tap'} · {result.missed} {tr?'eksik':'missed'} · {result.extras} {tr?'fazladan dokunuş':'extra taps'}</p><p>{result.meanAbsoluteMs===null?(tr?'Henüz karşılaştırılabilecek bir dokunuş yok.':'No taps available for comparison.'):`${tr?'Ortalama mutlak sapma':'Mean absolute offset'}: ${result.meanAbsoluteMs} ms`}</p><p>{tr?'Bir sonraki denemede önce dört vuruşu dinle. Uzun aralıkları zihninden daha küçük eşit parçalara böl; peş peşe fazladan tıklama.':'On your next attempt, listen to four beats first. Subdivide longer gaps mentally instead of adding extra clicks.'}</p></div>}
    <p className="pulse-caveat">{tr?'Bu, tarayıcı dokunuşlarının metronom zamanına göre yaklaşık ölçümüdür. Cihaz, ses çıkışı ve Bluetooth gecikmesi sonucu etkileyebilir. Müzik yeteneği veya enstrüman tekniği puanı değildir; dokunuşlar sunucuya gönderilmez.':'This is an approximate comparison of browser taps with metronome timing. Device, audio output and Bluetooth latency can affect results. It is not a musical-ability or instrument-technique score; taps are not sent to a server.'}</p>
  </section>;
}
