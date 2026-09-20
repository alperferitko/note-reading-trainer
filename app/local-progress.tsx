"use client";
import { useEffect, useState } from 'react';
type Result = { id: string; module: string; correct: number; wrong: number; milliseconds: number; date: string };
const KEY = 'notanota-local-progress-v1';
function read(): Result[] {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value.filter(r => r && typeof r.id === 'string' && typeof r.module === 'string' && typeof r.date === 'string' && Number.isFinite(Date.parse(r.date)) && Number.isInteger(r.correct) && r.correct>=0 && Number.isInteger(r.wrong) && r.wrong>=0 && Number.isFinite(r.milliseconds) && r.milliseconds>=0).slice(-100) : []; } catch { return []; }
}
export function LocalResult({ id, module, correct, wrong, milliseconds, locale }: Omit<Result, 'date'> & {locale: 'tr' | 'en'}) {
  const [message,setMessage] = useState('');
  useEffect(()=>{ if(correct+wrong===0)return; try { const rows=read(); if(!rows.some(r=>r.id===id)) { localStorage.setItem(KEY,JSON.stringify([...rows,{id,module,correct,wrong,milliseconds,date:new Date().toISOString()}].slice(-100))); window.dispatchEvent(new Event('notanota-progress')); } } catch { /* Practice remains available without storage. */ } },[id,module,correct,wrong,milliseconds]);
  const summary = `NotaNota · ${module}: ${correct} ${locale==='tr'?'doğru':'correct'}, ${wrong} ${locale==='tr'?'yanlış':'incorrect'} · ${Math.round(milliseconds/1000)} ${locale==='tr'?'sn':'s'}`;
  async function share() {
    try { if(navigator.share) await navigator.share({title:'NotaNota',text:summary,url:'https://notanota.online/'}); else { await navigator.clipboard.writeText(`${summary}\nhttps://notanota.online/`); setMessage(locale==='tr'?'Sonuç panoya kopyalandı.':'Result copied.'); } } catch (error) { if (!(error instanceof DOMException && error.name==='AbortError')) setMessage(locale==='tr'?'Paylaşım kullanılamıyor; sonuç kartını indirebilirsin.':'Sharing unavailable; you can download the card.'); }
  }
  function download() {
    const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" rx="32" fill="#f4efe4"/><text x="70" y="110" fill="#8b2f3c" font-size="52" font-family="Georgia">NotaNota</text><text x="70" y="205" font-family="Georgia" font-size="42" fill="#20251f">${escape(module)}</text><text x="70" y="330" font-family="sans-serif" font-size="56" fill="#20251f">${correct} ${locale==='tr'?'doğru':'correct'} · ${wrong} ${locale==='tr'?'yanlış':'incorrect'}</text><text x="70" y="420" font-family="sans-serif" font-size="32" fill="#5b6159">${Math.round(milliseconds/1000)} ${locale==='tr'?'saniye':'seconds'}</text><text x="70" y="550" font-family="sans-serif" font-size="30" fill="#8b2f3c">notanota.online</text></svg>`;
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})); const a=document.createElement('a');a.href=url;a.download='notanota-sonuc.svg';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="result-share"><button type="button" onClick={share}>{locale==='tr'?'Sonucu paylaş':'Share result'}</button><button type="button" onClick={download}>{locale==='tr'?'Sonuç kartını indir':'Download result card'}</button><p role="status">{message}</p></div>;
}
export function LocalProgress({locale}: {locale:'tr'|'en'}) {
  const [rows,setRows]=useState<Result[]>([]);
  useEffect(()=>{const update=()=>setRows(read()); update();window.addEventListener('notanota-progress',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('notanota-progress',update);window.removeEventListener('storage',update);};},[]);
  const tr=locale==='tr', correct=rows.reduce((s,r)=>s+r.correct,0), total=rows.reduce((s,r)=>s+r.correct+r.wrong,0);
  return <section className="local-progress"><h2>{tr?'Bu cihazdaki ilerlemen':'Progress on this device'}</h2><p>{tr?'Son 100 oturum bu tarayıcıda saklanır. Giriş gerekmez; başka cihazlara aktarılmaz ve tarayıcı verileri silindiğinde kaybolur.':'The last 100 sessions are saved in this browser. No sign-in needed; they do not sync and clearing browser data removes them.'}</p><div className="local-progress-stats"><strong>{rows.length} {tr?'oturum':'sessions'}</strong><strong>{correct} {tr?'doğru':'correct'}</strong><strong>{total?Math.round(correct/total*100):0}% {tr?'doğruluk':'accuracy'}</strong></div>{rows.length>0?<><ol>{rows.slice(-5).reverse().map(r=><li key={r.id}><time>{new Date(r.date).toLocaleDateString(locale==='tr'?'tr-TR':'en-GB')}</time><span>{r.module}</span><b>{r.correct} / {r.correct+r.wrong}</b></li>)}</ol><button type="button" onClick={()=>{try {localStorage.removeItem(KEY);setRows([]);}catch{}}}>{tr?'Yerel geçmişi sil':'Clear local history'}</button></>:<p>{tr?'İlk çalışmanı tamamla; sonuçların burada biriksin.':'Complete your first practice to see your progress here.'}</p>}</section>;
}
