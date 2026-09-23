import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('the local SQL run applies every migration in order before the checks', async () => {
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
  const runner = await readFile(new URL('../supabase/tests/run-local.sql', import.meta.url), 'utf8');
  const included = [...runner.matchAll(/^\\ir \.\.\/migrations\/(.+\.sql)$/gm)].map(match => match[1]);
  assert.deepEqual(included, migrations);
  assert.ok(runner.indexOf('auth-stub.sql') < runner.indexOf('../migrations/'));
  assert.match(runner, /\\ir weekly_leaderboards\.test\.sql\s*$/);
});

test('the behaviour checks cover every staging verification step and leave no data', async () => {
  const sql = await readFile(new URL('../supabase/tests/weekly_leaderboards.test.sql', import.meta.url), 'utf8');
  for (const step of ['1a', '1b', '1c', '2', '3a', '3b', '3c', '4b', '4c', '4d', '4e', '5b', '5c', '5d', '5e', '6']) {
    assert.match(sql, new RegExp(`FAIL ${step}:`), `missing check ${step}`);
  }
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^rollback;\s*$/m);
  assert.doesNotMatch(sql, /^commit;/m);
});

test('the auth stand-in is kept out of anything run against a real project', async () => {
  const stub = await readFile(new URL('../supabase/tests/auth-stub.sql', import.meta.url), 'utf8');
  const checks = await readFile(new URL('../supabase/tests/weekly_leaderboards.test.sql', import.meta.url), 'utf8');
  const script = await readFile(new URL('../scripts/verify-leaderboard-sql.mjs', import.meta.url), 'utf8');
  assert.match(stub, /never run this file against one/);
  assert.doesNotMatch(checks, /auth-stub/);
  assert.match(script, /weekly_leaderboards\.test\.sql/);
  assert.doesNotMatch(script.slice(script.indexOf("'--staging'"), script.indexOf('const docker')), /run-local|auth-stub/);
});
