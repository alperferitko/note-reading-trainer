// Isolated local browser regression checks. Never uses the user's browser profile.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve('out-pages');
const output=resolve('output/redesign-check');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    if((await stat(path)).isDirectory())path=join(path,'index.html');
    const data=await readFile(path);
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'})[extname(path)]||'application/octet-stream');
    res.end(data);
  } catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await mkdtemp(join(tmpdir(),'notanota-smoke-'));
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
const errors=[];
const report=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
  let port;
  for(let n=0;n<60;n++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await pause(100);}}
  assert.ok(port,'Headless Chrome debugging port available');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let sequence=0;const pending=new Map();
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''));if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timeout);if(m.error)p.reject(new Error(JSON.stringify(m.error)));else p.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},15000);pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const waitFor=async selector=>{for(let n=0;n<100;n++){if(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`))return;await pause(75);}throw Error(`Missing ${selector}`);};
  const click=async(selector,text)=>{await evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click();})()`);await settle();};
  const navigate=async(path,selector)=>{await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${path}`});await waitFor(selector);await settle();};
  const screenshot=async name=>{const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name+'.png'),Buffer.from(shot.data,'base64'));};
  const measure=()=>evaluate(`(()=>{const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;return {title:document.title,lang:document.documentElement.lang,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:[...document.querySelectorAll('h1')].filter(visible).map(x=>x.textContent),smallTargets:[...document.querySelectorAll('button')].filter(visible).filter(x=>{const r=x.getBoundingClientRect();return r.width<43||r.height<43}).slice(0,12).map(x=>({text:x.textContent.slice(0,45),w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height}))}})()`);
  await call('Runtime.enable');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  if(!process.argv.includes('--pulse-only')) {
  for(const [width,height] of [[1440,1000],[768,1024],[390,844],[320,568],[844,390]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
    await navigate('/','.learning-studio');
    assert.equal(await evaluate("Boolean(document.querySelector('link[rel=manifest]'))"),false,'Website no longer advertises app installation');
    assert.equal(await evaluate("document.querySelectorAll('.site-header .appearance-tools').length"),1,'Theme is in navigation header');
    await evaluate("document.querySelector('.appearance-tools').open=true");await settle();
    const themeBounds=await evaluate("(()=>{const r=document.querySelector('.appearance-tools select').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()");
    assert.ok(themeBounds.left>=0&&themeBounds.right<=width+1,'Theme selector fits viewport');
    await evaluate("(()=>{const s=document.querySelector('.appearance-tools select');s.value='dark';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await settle();
    assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
    await screenshot(`theme-dark-${width}`);
    await evaluate("(()=>{const s=document.querySelector('.appearance-tools select');s.value='light';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.appearance-tools').open=false;})()");await settle();
    if(width===1440){await click('.sound-toggle','');await waitFor('.audio-settings-panel');await screenshot('audio-settings-centered');await click('.sound-toggle','');}
    const info=await measure();assert.ok(info.scrollWidth<=width+1,`Studio overflow at ${width}: ${info.scrollWidth}`);report.push({screen:'studio',...info});await screenshot(`studio-${width}`);
    for(const [path,selector,label] of [['/nota-oku/','.setup-shell','notes'],['/eser-okuma/','.score-reading-setup','score'],['/muzik-aletleri/gitar/','.guitar-setup','guitar'],['/muzik-aletleri/piyano/','.instrument-practice','piano']]) {
      await navigate(path,selector);if(label==='notes'&&await evaluate("Boolean(document.querySelector('.reading-setup-dialog'))")){await click('.reading-setup-dialog button','Şimdilik kapat');await settle();}const state=await measure();assert.ok(state.scrollWidth<=width+1,`${label} overflow at ${width}: ${state.scrollWidth}`);report.push({screen:label,...state});await screenshot(`${label}-${width}`);
      assert.equal(await evaluate("document.querySelectorAll('.rhythm-triplet-mark').length"),0,'No triplet numerals');
      assert.ok(await evaluate("[...document.querySelectorAll('.step-heading>span[aria-hidden=true],.guitar-shell .kicker[aria-hidden=true]')].every(e=>getComputedStyle(e).display==='none')"),'Decorative dots hidden');
      if(label==='guitar')assert.equal(await evaluate("document.querySelectorAll('.guitar-hero-string').length"),6,'Guitar hero shows all six strings');
    }
  }
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/','.learning-studio');
  await click('.studio-daily button','Önerilen dersi aç');await waitFor('.studio-question');
  await click('.studio-question button','Beş');await click('.studio-question button','Devam et');
  await click('.studio-question button','Nota başının merkezi');await click('.studio-question button','Devam et');
  assert.ok(await evaluate("JSON.parse(localStorage.getItem('notanota-learning-v1')).includes('staff-basics')"),'Lesson completion saved');
  await screenshot('lesson-complete');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('notanota-lesson-reviews-v1'))[0].assisted"),true,'Reading the lesson schedules an assisted review');
  await evaluate(`(()=>{const now=Date.now();localStorage.setItem('notanota-lesson-reviews-v1',JSON.stringify([{lessonId:'staff-basics',reviewedAt:new Date(now-2*86400000).toISOString(),dueAt:new Date(now-86400000).toISOString(),streak:1,assisted:false}]));})()`);
  await navigate('/','.studio-review-plan');
  assert.ok(await evaluate("document.querySelector('.studio-daily').textContent.includes('tekrar zamanı')"),'Due review takes priority in daily plan');
  await click('.studio-daily button','Önerilen dersi aç');await waitFor('.studio-recall-intro');
  assert.equal(await evaluate("Boolean(document.querySelector('.studio-lesson aside'))"),false,'Recall starts without lesson explanation');
  await click('.studio-question button','Beş');await click('.studio-question button','Devam et');
  await click('.studio-question button','Nota başının merkezi');await click('.studio-question button','Devam et');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('notanota-lesson-reviews-v1'))[0].streak"),2,'Unaided due review extends schedule');
  await evaluate("document.querySelector('.studio-review-plan details').open=true");
  await click('.studio-review-plan button','Erken tekrar');await waitFor('.studio-recall-intro');
  await click('.studio-recall-intro button','Açıklamayı göster');
  assert.ok(await evaluate("Boolean(document.querySelector('.studio-lesson aside'))"),'Help opens explanation');
  await click('.studio-question button','Beş');await click('.studio-question button','Devam et');
  await click('.studio-question button','Nota başının merkezi');await click('.studio-question button','Devam et');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('notanota-lesson-reviews-v1'))[0].streak"),0,'Help resets interval without claiming independent recall');
  await evaluate("document.querySelector('.studio-review-plan').scrollIntoView({block:'start',behavior:'instant'})");await screenshot('review-plan-390');
  await click('.studio-lesson-complete button','Uygulama oturumuna geç');await waitFor('.setup-shell');
  await navigate('/en/','.learning-studio');assert.equal((await measure()).lang,'en');
  assert.ok(await evaluate("document.body.innerText.includes('Read the notes')"),'English route renders English');
  await navigate('/nota-oku/','.setup-shell');assert.equal((await measure()).lang,'tr');
  // Exercise real sessions as well as setup screens, on narrow and landscape viewports.
  for(const [width,height] of [[320,568],[390,844],[844,390]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await navigate('/muzik-aletleri/gitar/','.guitar-setup');
    await click('.guitar-mode-grid button','Porteyi gör, tel ve perdeyi seç');
    await click('.guitar-setup button','İlk 12 perde');
    await click('.guitar-start-panel button','Gitar çalışmasını başlat');
    await waitFor('.guitar-location-selection');
    await evaluate("document.querySelector('.guitar-location-options--frets').scrollIntoView({block:'center',behavior:'instant'})");await settle();
    for(let round=0;round<2;round++) {
      const cy=await evaluate("Number(document.querySelector('.guitar-staff-head').getAttribute('cy'))");
      const writtenIndex=30+Math.round((122-cy)/7);
      const midi=Math.floor(writtenIndex/7)*12+[0,2,4,5,7,9,11][((writtenIndex%7)+7)%7];
      const positions=[64,59,55,50,45,40].flatMap((open,i)=>midi-open>=0&&midi-open<=12?[{string:i+1,fret:midi-open}]:[]);
      assert.ok(positions.length,'A playable guitar pitch');
      for(const p of positions) {
        await click('.guitar-location-options--strings button',`${p.string}. tel`);
        await click('.guitar-location-options--frets button',p.fret===0?'Boş tel':`${p.fret}. perde`);
        await click('.guitar-location-selection > button','Konumu işaretle');
      }
      assert.ok(await evaluate("document.querySelector('.guitar-location-selection').textContent.includes('Sonraki')"),'All matching positions accepted');
      await screenshot(`guitar-session-${width}-${round}`);
      const metrics=await measure();assert.ok(metrics.scrollWidth<=width+1,'Guitar session has no page overflow');
      const before=await evaluate('scrollY');
      await click('.guitar-location-selection > button','Sonraki');
      assert.ok(Math.abs(await evaluate('scrollY')-before)<3,'Next guitar question preserves scroll position');
    }
    await navigate('/eser-okuma/','.score-reading-setup');
    await click('.score-range-grid button','Geniş aralık');
    await click('.score-reading-start-card button','başla');
    await waitFor('.score-reading-session');
    assert.ok(await evaluate("!document.querySelector('.score-line-scroll').textContent.match(/Birlik|İkilik|Dörtlük|Sekizlik|On altılık/)"),'No rhythm labels below score notes');
    const bounds=await evaluate(`(()=>{const s=document.querySelector('.score-line-scroll svg'),r=s.getBoundingClientRect();return [...s.querySelectorAll('ellipse')].every(n=>{const b=n.getBoundingClientRect();return b.top>=r.top-1&&b.bottom<=r.bottom+1})})()`);
    assert.ok(bounds,'Wide-range noteheads fit score height');
    await screenshot(`score-session-${width}`);
    await click('.score-answer-grid button','Do');
    await pause(220);
    await click('.score-reading-session-top > button','Oturumu bitir');
    await waitFor('.session-guidance');
    await click('.session-guidance button','Kısa dersi aç');
    await waitFor('#active-lesson-title');
    assert.equal(await evaluate("document.querySelector('#active-lesson-title').textContent"),'Vuruşu sabit tut');
    await navigate('/muzik-aletleri/piyano/','.instrument-practice');
    await click('.instrument-practice button','Çalışmaya başla');
    await waitFor('.instrument-practice-top');
    const pianoIndex=await evaluate(`(()=>{const s=document.querySelector('.music-staff'),base=Number(s.querySelector('g line').getAttribute('y1')),y=Number(s.querySelector('ellipse').getAttribute('cy'));const d=30+Math.round((base-y)/7);return (Math.floor(d/7)+1)*12+[0,2,4,5,7,9,11][d%7]-60;})()`);
    await evaluate(`document.querySelectorAll('.piano-key')[${pianoIndex}].click()`);await settle();
    assert.ok(await evaluate("document.querySelector('.instrument-feedback').textContent.includes('Doğru')"),'Piano exact pitch accepted');
    await screenshot(`piano-session-${width}`);
    await click('.instrument-practice-top button','Oturumu bitir');await waitFor('.session-guidance');
    await click('.session-guidance button','Kısa dersi aç');await waitFor('#active-lesson-title');
    assert.equal(await evaluate("document.querySelector('#active-lesson-title').textContent"),'Tuşlarda yön bul');
  }
  }
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/','.pulse-practice');
  await navigate('/eser-okuma/','.score-study-picker');
  await evaluate("(()=>{const s=document.querySelector('.score-study-picker select');s.value='steps';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await settle();
  assert.equal(await evaluate("Boolean(document.querySelector('.score-range-grid'))"),false,'Fixed study does not advertise random range controls');
  await click('.score-reading-start-card > button','başla');await waitFor('.score-reading-session');
  assert.ok(await evaluate("document.querySelector('.score-reading-context').textContent.includes('Komşu notalar')"));
  for(const name of ['Mi','Fa','Sol','La','Si','La','Sol','Fa','Mi']){await click('.score-answer-grid button',name);await pause(220);}
  await waitFor('.score-reading-results');
  assert.ok(await evaluate("document.querySelector('.score-reading-stats').textContent.includes('9 / 9')"),'All study pitches match treble staff coordinates');
  await screenshot('study-result-390');
  await navigate('/','.pulse-practice');
  await evaluate(`(()=>{const original=AudioContext.prototype.createOscillator;window.__earTones=[];window.__earContexts=[];AudioContext.prototype.createOscillator=function(){window.__earContexts.push(this);const node=original.call(this),start=node.start.bind(node);node.start=function(time){window.__earTones.push({frequency:node.frequency.value,time});start(time);};return node;};})()`);
  await click('.ear-training button','8 soruluk çalışmaya başla');
  assert.ok(await evaluate("[...document.querySelectorAll('.ear-answers button')].every(b=>b.disabled)"),'Cannot answer before listening');
  for(let n=0;n<8;n++) {
    await click('.ear-listen','İki sesi dinle');
    await waitFor('.ear-answers button:not(:disabled)');
    const tones=await evaluate('window.__earTones.slice(-2)');
    assert.equal(tones.length,2);assert.ok(Math.abs(tones[1].time-tones[0].time-.8)<.00001,'Tones scheduled sequentially on audio clock');
    const response=tones[1].frequency>tones[0].frequency?'Daha ince':tones[1].frequency<tones[0].frequency?'Daha kalın':'Aynı';
    await click('.ear-answers button',n===0?(response==='Aynı'?'Daha ince':'Aynı'):response);
    assert.ok(await evaluate("[...document.querySelectorAll('.ear-answers button')].every(b=>b.disabled)"),'One scored answer per question');
    if(n===0){await click('.ear-listen','Tekrar dinle');await waitFor('.ear-listen:not(:disabled)');assert.ok(await evaluate("document.querySelector('.ear-feedback').textContent.includes('Birlikte karşılaştıralım')"),'Replay keeps original answer');}
    await click('.ear-feedback button',n===7?'Sonucu gör':'Sonraki soru');
  }
  assert.ok(await evaluate("document.querySelector('.ear-result').textContent.includes('7 / 8')"),'Listening result counts actual first answers');
  assert.ok(await evaluate("window.__earContexts.every(c=>c.state==='closed')"),'All listening audio contexts are closed');
  await evaluate("document.querySelector('.ear-training').scrollIntoView({block:'start',behavior:'instant'})");await screenshot('ear-result-390');
  await click('.ear-training button','8 soruluk çalışmaya başla');
  await click('.ear-listen','İki sesi dinle');
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden");await settle();
  assert.ok(await evaluate("[...document.querySelectorAll('.ear-answers button')].every(b=>b.disabled)"),'Interrupted playback does not unlock unanswered question');
  await click('.ear-end','Çalışmayı bitir');
  await evaluate(`(()=>{const input=document.querySelector('.pulse-controls input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'120');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));const original=AudioContext.prototype.createOscillator;window.__pulseStarts=[];AudioContext.prototype.createOscillator=function(){window.__pulseAudio=this;const node=original.call(this),start=node.start.bind(node);node.start=function(time){window.__pulseStarts.push(time);start(time);};return node;};document.querySelector('.pulse-practice').scrollIntoView({block:'start',behavior:'instant'});})()`);await settle();
  assert.ok(await evaluate("document.querySelector('.pulse-controls').textContent.includes('120 BPM')"));
  await click('.pulse-practice button','Vuruş çalışmasına başla');await waitFor('.pulse-live');
  await evaluate(`new Promise(resolve=>{let n=0;const timer=setInterval(()=>{const first=window.__pulseStarts[0],audio=window.__pulseAudio;if(first!==undefined&&audio&&audio.currentTime>=first+2+n*.5){document.querySelector('.pulse-tap')?.click();n++;if(n===8){clearInterval(timer);resolve(true);}}},4);})`);
  await waitFor('.pulse-result');
  assert.ok(await evaluate("document.querySelector('.pulse-result').textContent.includes('8 / 8')"),'All eight timed taps matched');
  assert.equal(await evaluate('window.__pulseStarts.length'),12,'Four count-in and eight exercise clicks scheduled');
  assert.ok(await evaluate('window.__pulseStarts.slice(1).every((t,i)=>Math.abs(t-window.__pulseStarts[i]-.5)<.000001)'),'Audio clock schedules exact half-second intervals');
  assert.equal(await evaluate('window.__pulseAudio.state'),'closed','Audio context closed after completion');
  await evaluate("document.querySelector('.pulse-result').scrollIntoView({block:'center',behavior:'instant'})");await screenshot('pulse-result-390');
  await click('.pulse-practice button','Vuruş çalışmasına başla');await waitFor('.pulse-live');
  await click('.pulse-live button','Durdur');assert.equal(await evaluate('Boolean(document.querySelector(".pulse-live"))'),false,'Stop removes live exercise');
  await click('.pulse-practice button','Vuruş çalışmasına başla');await waitFor('.pulse-live');
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden");await settle();
  assert.ok(await evaluate("document.querySelector('.pulse-practice').textContent.includes('arka plana')"),'Hidden tab interrupts exercise without a score');
  await click('.pulse-practice button','Vuruş çalışmasına başla');await waitFor('.pulse-live');
  await click('.ear-training button','8 soruluk çalışmaya başla');
  await click('.ear-listen','İki sesi dinle');
  assert.equal(await evaluate("Boolean(document.querySelector('.pulse-live'))"),false,'Listening interrupts pulse audio');
  await click('.pulse-practice button','Vuruş çalışmasına başla');await waitFor('.pulse-live');
  assert.ok(await evaluate("!document.querySelector('.ear-listen').disabled"),'Pulse interrupts listening playback');
  await click('.pulse-live button','Durdur');
  await click('.ear-end','Çalışmayı bitir');
  assert.equal(errors.length,0,errors.join('\n'));
  await writeFile(join(output,'report.json'),JSON.stringify({report,errors},null,2));
  console.log(JSON.stringify({screens:report.length,errors,output},null,2));
} finally {ws?.close();chrome.kill();server.close();}
