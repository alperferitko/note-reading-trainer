// Local built-site browser test; temporary isolated profile, no external API calls.
import { createServer } from 'node:http';
import { readFile, stat, mkdtemp } from 'node:fs/promises';
import { resolve, join, sep, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve('out-pages');
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(join(tmpdir(), 'notanota-ai-b2-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(100); } }
  assert.ok(port, 'Chrome debugging endpoint');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(targets.find(item => item.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (pending.has(message.id)) { const row = pending.get(message.id); pending.delete(message.id); clearTimeout(row.timer); if (message.error) row.reject(Error(JSON.stringify(message.error))); else row.resolve(message.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(100); } throw Error(`Missing state ${expression}`); };
  await call('Runtime.enable');
  await call('Network.enable');
  // Only loopback site resources may load. No production Supabase/provider traffic.
  await call('Network.setBlockedURLs', { urls: ['https://*'] });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('nota-nota-reading-setup:guest',JSON.stringify({level:'temel',mode:'porte',sessionType:'standard'}));` });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/nota-oku/` });
  await wait("Boolean(document.querySelector('.setup-shell'))");
  await evaluate("document.querySelector('.setup-shell .primary-button').click()");
  await wait("Boolean(document.querySelector('.quiz-shell'))");
  // Finish via the existing stop action, after recording controlled session evidence.
  await evaluate("document.querySelector('.end-session-button').click()");
  await wait("Boolean(document.querySelector('.ai-teacher'))");
  await evaluate("window.__originalClone=window.structuredClone;window.structuredClone=()=>{throw Error('injected demo failure')};document.querySelector('.ai-teacher button').click()");
  await wait("Boolean(document.querySelector('.ai-teacher [role=alert]'))");
  await evaluate("window.structuredClone=window.__originalClone");
  await evaluate("document.querySelector('.ai-teacher button').click()");
  assert.equal(await evaluate("document.querySelector('.ai-teacher button').disabled"), true, 'Loading disables duplicate demo request');
  await wait("document.querySelector('.ai-teacher').textContent.includes('Yeterli veri yok')");
  // Derive this actual session ID from the result component's React state via record ID
  // prefix isn't needed: start a new round, capture its start timestamp through time.
  // Current empty flow already proves optional behavior; seed all plausible session
  // timestamps via intercepted Date.now before a second start for deterministic demo.
  await evaluate(`(()=>{const fixed=Date.now();window.__aiTestNow=fixed;Date.now=()=>fixed;[...document.querySelectorAll('.result-actions button')][0].click();})()`);
  await wait("Boolean(document.querySelector('.quiz-shell'))");
  await evaluate(`(()=>{const now=window.__aiTestNow;const rows=Array.from({length:4},(_,i)=>({id:'ai-smoke-'+i,session:'notes-'+now,module:'reading',task:'staff-name',item:'treble:f4',position:1,clef:'treble',midi:65,correct:i===0,firstAttempt:true,assisted:false,timedOut:false,responseMs:1200,timeLimitMs:null,at:new Date(now-5000+i*1000).toISOString()}));localStorage.setItem('notanota-question-evidence-v1',JSON.stringify(rows));window.dispatchEvent(new Event('notanota-evidence'));document.querySelector('.end-session-button').click();})()`);
  await wait("Boolean(document.querySelector('.ai-teacher'))");
  await evaluate("document.querySelector('.ai-teacher button').click()");
  await wait("document.querySelector('.ai-teacher ol')?.children.length===3");
  assert.ok(await evaluate("document.querySelector('.ai-teacher').textContent.includes('Fa4')"));
  assert.ok(await evaluate("document.querySelector('.ai-teacher').textContent.includes('DEMO')"));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: ended-session panel, explicit DEMO, loading, error/retry, insufficient-data, contextual weakness and 3 actions; external HTTPS blocked.');
} finally {
  ws?.close(); chrome.kill();
  await new Promise(resolve => server.close(resolve));
  console.log(`Isolated temporary browser profile retained at ${profile}`);
}