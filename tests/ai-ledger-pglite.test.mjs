// Runs the ledger migrations and their SQL behaviour tests on a real PostgreSQL engine compiled to
// WebAssembly (PGlite), in memory. This is not Supabase: no JWT, PostgREST or network is involved,
// and the auth stand-in is the CI bootstrap. It proves SQL semantics, locks run single-session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');

async function database(...migrations) {
  const db = new PGlite();
  await db.exec(await sql('tests/ai-ledger-bootstrap.sql'));
  for (const name of migrations) await db.exec(await sql(`migrations/${name}`));
  return db;
}

test('original B3 ledger tests pass on PostgreSQL', async () => {
  const db = await database('202610300001_ai_usage_ledger.sql');
  await db.exec(await sql('tests/ai-usage-ledger.test.sql'));
  await db.close();
});

test('B3 ledger tests still pass after the B4 settlement migration', async () => {
  const db = await database('202610300001_ai_usage_ledger.sql', '202611020001_ai_usage_settlement_reconcile.sql');
  await db.exec(await sql('tests/ai-usage-ledger.test.sql'));
  await db.close();
});

test('B4 settlement is final, recovered charges never drop, reconcile replaces once', async () => {
  const db = await database('202610300001_ai_usage_ledger.sql', '202611020001_ai_usage_settlement_reconcile.sql');
  await db.exec(await sql('tests/ai-usage-reconcile.test.sql'));
  await db.close();
});

test('without the B4 migration a late settle could lower a recovered charge (the bug being fixed)', async () => {
  const db = await database('202610300001_ai_usage_ledger.sql');
  await db.exec(`update ai_private.control set enabled=true,project_ref=repeat('s',20);`);
  const u = '10000000-0000-0000-0000-000000000001';
  const { rows: [reserve] } = await db.query(`select public.ai_usage_reserve(repeat('s',20),$1,'late',repeat('e',64),20000,'fixture-only') as r`, [u]);
  const id = reserve.r.reservationId;
  await db.query(`update ai_private.requests set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1`, [id]);
  await db.query(`select public.ai_usage_recover(repeat('s',20),$1,true)`, [id]);
  await db.query(`select public.ai_usage_settle(repeat('s',20),$1,$2,'{"schemaVersion":"1"}',700,5,5)`, [u, id]);
  const { rows: [row] } = await db.query(`select charged_micro from ai_private.requests where id=$1`, [id]);
  assert.equal(Number(row.charged_micro), 700);
  await db.close();
});

test('a failed call settled as uncertain stays charged but frees the in-flight slot', async () => {
  const all = ['202610300001_ai_usage_ledger.sql', '202611020001_ai_usage_settlement_reconcile.sql', '202611030001_ai_usage_in_flight_concurrency.sql'];
  const db = await database(...all);
  await db.exec(await sql('tests/ai-usage-ledger.test.sql'));
  await db.exec(`delete from ai_private.requests; update ai_private.control set enabled=true,project_ref=repeat('s',20);`);
  const u = '10000000-0000-0000-0000-000000000002';
  const reserve = async key => (await db.query(`select public.ai_usage_reserve(repeat('s',20),$1,$2,repeat('e',64),18500,'fixture-only') as r`, [u, key])).rows[0].r;
  const first = await reserve('first');
  assert.equal(first.status, 'reserved');
  assert.equal((await reserve('while-in-flight')).status, 'limited');
  // Provider error: settled with unknown usage, so the row is uncertain and keeps its full charge.
  await db.query(`select public.ai_usage_settle(repeat('s',20),$1,$2,'{"schemaVersion":"1"}',null,null,null)`, [u, first.reservationId]);
  const { rows: [row] } = await db.query(`select state, charged_micro from ai_private.requests where id=$1`, [first.reservationId]);
  assert.equal(row.state, 'uncertain');
  assert.equal(Number(row.charged_micro), 18500);
  assert.equal((await reserve('after-failure')).status, 'reserved');
  await db.close();
});

test('the operator snippet releases an unsent request_too_large reservation at zero without deleting it', async () => {
  const db = await database('202610300001_ai_usage_ledger.sql', '202611020001_ai_usage_settlement_reconcile.sql', '202611030001_ai_usage_in_flight_concurrency.sql');
  const ref = 'coftskrofgcfzsuqdtpn';
  // Room for one 18520 reservation only, so the stale charge alone blocks the next call.
  await db.exec(`update ai_private.control set enabled=true, project_ref='${ref}', global_total_micro=30000;`);
  const u = '10000000-0000-0000-0000-000000000001';
  const reserve = async key => (await db.query(`select public.ai_usage_reserve($1,$2,$3,repeat('e',64),18520,'fixture-only') as r`, [ref, u, key])).rows[0].r;
  const stale = await reserve('too-large');
  // The old path: request_too_large settled with unknown usage, left uncertain at full charge.
  await db.query(`select public.ai_usage_settle($1,$2,$3,'{"schemaVersion":"1","error":{"code":"request_too_large","status":413}}',null,null,null)`, [ref, u, stale.reservationId]);
  await db.query(`update ai_private.requests set created_at=timestamptz '2026-11-03 18:00:00+00' where id=$1`, [stale.reservationId]);
  assert.equal((await reserve('blocked')).status, 'limited');
  const snippet = await readFile(new URL('../scripts/sql/release-unsent-reservation.sql', import.meta.url), 'utf8');
  // Unedited, the placeholder id aborts the transaction and changes nothing.
  await assert.rejects(db.exec(snippet));
  await db.exec('rollback');
  const before = (await db.query(`select state, charged_micro from ai_private.requests where id=$1`, [stale.reservationId])).rows[0];
  assert.deepEqual({ state: before.state, charged: Number(before.charged_micro) }, { state: 'uncertain', charged: 18520 });
  await db.exec(snippet.replace('PASTE-REQUEST-ID-HERE', stale.reservationId));
  const { rows } = await db.query(`select * from ai_private.requests where id=$1`, [stale.reservationId]);
  assert.equal(rows.length, 1, 'the row is kept');
  assert.equal(rows[0].state, 'completed');
  assert.equal(Number(rows[0].charged_micro), 0);
  assert.equal(Number(rows[0].reserved_micro), 18520);
  assert.equal(Number(rows[0].input_tokens), 0);
  assert.ok(rows[0].settled_at && rows[0].released_at && rows[0].reconciled_at);
  assert.match(rows[0].reconcile_note, /request_too_large/);
  assert.equal((await reserve('after-release')).status, 'reserved', 'the budget is free again');
  // A second run finds nothing to do and cannot touch another row.
  await assert.rejects(db.exec(snippet.replace('PASTE-REQUEST-ID-HERE', stale.reservationId)));
  await db.close();
});

const LEDGER = ['202610300001_ai_usage_ledger.sql', '202611020001_ai_usage_settlement_reconcile.sql', '202611030001_ai_usage_in_flight_concurrency.sql', '202611040004_ai_free_trial.sql'];
/** The ledger with the free-trial migration on top; auth.users gets the created_at Supabase has. */
async function trialDatabase(control = '') {
  const db = new PGlite();
  await db.exec(await sql('tests/ai-ledger-bootstrap.sql'));
  await db.exec('alter table auth.users add column created_at timestamptz not null default now()');
  for (const name of LEDGER) await db.exec(await sql(`migrations/${name}`));
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    update ai_private.control set enabled=true, project_ref=repeat('s',20) ${control};`);
  return db;
}
const reserveAs = async (db, user, key) => (await db.query(`select public.ai_usage_reserve(repeat('s',20),$1,$2,repeat('e',64),5000,'fixture-only') as r`, [user, key])).rows[0].r;
const settle = (db, user, id) => db.query(`select public.ai_usage_settle(repeat('s',20),$1,$2,'{"schemaVersion":"1"}',3000,100,100)`, [user, id]);
const NEW = '10000000-0000-0000-0000-000000000001';
const OLD = '10000000-0000-0000-0000-000000000002';

test('without trial_days the ledger keeps its plain daily limits (staging)', async () => {
  const db = await trialDatabase();
  await db.query(`update auth.users set created_at = now() - interval '400 days' where id = $1`, [OLD]);
  assert.equal((await reserveAs(db, OLD, 'old-account')).status, 'reserved');
  await db.close();
});

test('the free trial: new accounts for trial_days, old accounts from the launch, then trial_ended', async () => {
  const db = await trialDatabase(`, trial_days=3, trial_launch_at=now() - interval '1 day'`);
  await db.query(`update auth.users set created_at = now() - interval '2 hours' where id = $1`, [NEW]);
  await db.query(`update auth.users set created_at = now() - interval '400 days' where id = $1`, [OLD]);
  const first = await reserveAs(db, NEW, 'new-1');
  assert.equal(first.status, 'reserved');
  await settle(db, NEW, first.reservationId);
  // An account from before the launch counts from the launch: one day in, two left.
  const old = await reserveAs(db, OLD, 'old-1');
  assert.equal(old.status, 'reserved');
  await settle(db, OLD, old.reservationId);
  // Four days after the launch the old account is past its window; the stored answer still replays.
  await db.exec(`update ai_private.control set trial_launch_at = now() - interval '4 days'`);
  assert.equal((await reserveAs(db, OLD, 'old-2')).status, 'trial_ended');
  // The new account was created two hours ago: still inside.
  const second = await reserveAs(db, NEW, 'new-2');
  assert.equal(second.status, 'reserved');
  await settle(db, NEW, second.reservationId);
  await db.query(`update auth.users set created_at = now() - interval '3 days 1 minute' where id = $1`, [NEW]);
  assert.equal((await reserveAs(db, NEW, 'new-3')).status, 'trial_ended');
  assert.equal((await db.query(`select count(*)::int as n from ai_private.requests`)).rows[0].n, 3, 'a refused trial books nothing');
  await db.close();
});

test('each refusal names its limit: minute, day, trial total and the global budget', async () => {
  const db = await trialDatabase(`, trial_days=3, requests_per_minute=2, requests_per_day=3, trial_user_requests=4`);
  const run = async (key) => { const r = await reserveAs(db, NEW, key); if (r.status === 'reserved') await settle(db, NEW, r.reservationId); return r; };
  await run('a'); await run('b');
  assert.deepEqual(await run('c'), { status: 'limited', scope: 'minute' });
  await db.exec(`update ai_private.requests set created_at = created_at - interval '2 minutes'`);
  await run('c');
  assert.deepEqual(await run('d'), { status: 'limited', scope: 'day' });
  // Yesterday's three still count for the trial: one more today, then the trial total is used up.
  await db.exec(`update ai_private.requests set created_at = created_at - interval '1 day'; update auth.users set created_at = now() - interval '2 days'`);
  assert.equal((await run('e')).status, 'reserved');
  assert.deepEqual(await run('f'), { status: 'limited', scope: 'trial' });
  await db.exec(`update ai_private.control set global_daily_micro = 1`);
  assert.deepEqual(await reserveAs(db, OLD, 'g'), { status: 'limited', scope: 'global' });
  await db.close();
});

test('ai_trial_status shows only the caller own window and counts, and only to signed-in users', async () => {
  const db = await trialDatabase(`, trial_days=3, requests_per_day=25, trial_user_requests=60`);
  const r = await reserveAs(db, NEW, 'status-1');
  await settle(db, NEW, r.reservationId);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [NEW]);
  await db.exec('set role authenticated');
  const { rows: [{ s }] } = await db.query('select public.ai_trial_status() as s');
  assert.equal(s.trial, true);
  assert.equal(s.active, true);
  assert.deepEqual([s.usedToday, s.dailyLimit, s.usedTotal, s.trialLimit], [1, 25, 1, 60]);
  assert.ok(Date.parse(s.endsAt) - Date.parse(s.startsAt) === 3 * 86400000);
  await db.exec('reset role');
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.ai_trial_status()'), /permission denied/);
  await db.exec('reset role');
  await db.close();
});
