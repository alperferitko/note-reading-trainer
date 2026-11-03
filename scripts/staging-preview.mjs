// Builds the Pages site against the STAGING Supabase project and serves it on https://localhost:8443,
// the only origin the staging ai-gateway accepts. Never points at production: the build refuses any
// Supabase URL other than the pinned staging ref.
// Needs .env.staging.local (git-ignored) with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY of staging.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:https';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pins = JSON.parse(readFileSync(join(root, 'supabase/ai-staging-target.json'), 'utf8'));
const stagingUrl = `https://${pins.stagingProjectRef}.supabase.co`;
const out = join(root, 'out-staging');
const certDir = join(root, '.staging-cert');
const PORT = 8443;

const envFile = join(root, '.env.staging.local');
if (!existsSync(envFile)) {
  console.error('Eksik: .env.staging.local (VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY, staging projesinden).');
  process.exit(1);
}
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/)
  .map(line => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
if (env.VITE_SUPABASE_URL?.replace(/\/$/, '') !== stagingUrl) {
  console.error(`VITE_SUPABASE_URL tam olarak ${stagingUrl} olmalı.`);
  process.exit(1);
}
if (!env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error('VITE_SUPABASE_PUBLISHABLE_KEY boş.');
  process.exit(1);
}

if (!process.argv.includes('--no-build')) {
  // Values already in the process environment win over .env.local, so the build sees staging only.
  const build = spawnSync('npx', ['vite', 'build', '--config', 'vite.pages.config.ts', '--outDir', out], {
    cwd: root, stdio: 'inherit', shell: true,
    env: { ...process.env, VITE_SUPABASE_URL: stagingUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      VITE_AI_GATEWAY_URL: `${stagingUrl}/functions/v1/ai-gateway` },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
  // The page CSP only allows the production project; this copy must talk to staging instead.
  const pages = readdirSync(out, { recursive: true }).filter(name => name.endsWith('.html'));
  for (const name of pages) {
    const path = join(out, name);
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll(`${pins.productionProjectRef}.supabase.co`,
      `${pins.stagingProjectRef}.supabase.co`));
  }
}

const keyPath = join(certDir, 'localhost.key');
const certPath = join(certDir, 'localhost.pem');
if (!existsSync(keyPath)) {
  mkdirSync(certDir, { recursive: true });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30',
    '-keyout', keyPath, '-out', certPath, '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.xml': 'application/xml',
  '.musicxml': 'application/xml', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

async function file(path) {
  try {
    const info = await stat(path);
    return info.isDirectory() ? file(join(path, 'index.html')) : path;
  } catch { return null; }
}

createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'https://localhost').pathname);
  const target = normalize(join(out, pathname));
  const found = target.startsWith(out) ? await file(target) : null;
  const path = found ?? join(out, '404.html');
  res.writeHead(found ? 200 : 404, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
  res.end(await readFile(path));
}).listen(PORT, 'localhost', () => {
  console.log(`Staging önizleme: https://localhost:${PORT}/  (Supabase: ${stagingUrl})`);
  console.log('Tarayıcı sertifika uyarısı verir: "Gelişmiş → localhost\'a devam et". Kapatmak için Ctrl+C.');
});
