import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedCopies } from '../scripts/sync-edge-shared.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const functionsDir = join(root, 'supabase', 'functions');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (/\.(mjs|js|ts)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test('generated Edge copies match their sources', async () => {
  for (const [path, expected] of Object.entries(await expectedCopies(new URL('../', import.meta.url)))) {
    assert.equal(await readFile(join(root, path), 'utf8'), expected, `${path} is stale: run node scripts/sync-edge-shared.mjs`);
  }
});

test('every relative import in supabase/functions stays inside it, without JSON import attributes', async () => {
  const files = await walk(functionsDir);
  assert.ok(files.length > 10);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /with\s*\{\s*type\s*:\s*["']json["']\s*\}/, `${relative(root, file)} uses a JSON import attribute`);
    for (const match of source.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const specifier = match[1] ?? match[2];
      if (/^(npm:|jsr:|https:|node:)/.test(specifier)) continue;
      assert.ok(specifier.startsWith('.'), `${relative(root, file)} imports bare specifier ${specifier}`);
      const target = resolve(dirname(file), specifier);
      assert.ok(target.startsWith(functionsDir + sep), `${relative(root, file)} imports outside supabase/functions: ${specifier}`);
    }
  }
});

test('the gateway reads staging pins from the generated module, identical to the JSON source', async () => {
  const index = await readFile(join(functionsDir, 'ai-gateway', 'index.ts'), 'utf8');
  assert.match(index, /import pins from "\.\.\/_shared\/ai\/staging-target\.mjs";/);
  const { default: pins } = await import('../supabase/functions/_shared/ai/staging-target.mjs');
  const json = JSON.parse(await readFile(join(root, 'supabase', 'ai-staging-target.json'), 'utf8'));
  assert.deepEqual(pins, json);
  assert.ok(Object.isFrozen(pins));
});

test('browser code never imports server-only AI modules or secret variable names', async () => {
  const serverOnly = /(staging-config|staging-gateway|postgres-store|providers\/meta|supabase-auth|ai-gateway\/index)\.(mjs|ts)/;
  const secretNames = /\b(META_API_KEY|SUPABASE_SERVICE_ROLE_KEY|service_role_key|AI_STAGING_LIVE_APPROVAL)\b/;
  const browserFiles = [...await walk(join(root, 'app')), ...(await walk(join(root, 'lib')))];
  for (const file of browserFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, serverOnly, `${relative(root, file)} imports a server-only module`);
    assert.doesNotMatch(source, secretNames, `${relative(root, file)} mentions a server secret`);
  }
  // When a Pages build exists, its shipped JavaScript must not carry those names either.
  let assets = [];
  try { assets = (await readdir(join(root, 'out-pages', 'assets'))).filter(name => name.endsWith('.js')); } catch { /* no build present */ }
  for (const name of assets) assert.doesNotMatch(await readFile(join(root, 'out-pages', 'assets', name), 'utf8'), secretNames, `out-pages/assets/${name}`);
});
