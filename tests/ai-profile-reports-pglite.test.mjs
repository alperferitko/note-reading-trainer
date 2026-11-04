// Runs the learning profile / weekly report migration on PostgreSQL compiled to WebAssembly (PGlite),
// in memory, on top of the local auth stand-in. Supabase's default grants are reproduced first so
// the migration's revokes are what is tested. Callers switch with SET ROLE and request.jwt.claim.sub,
// as in score-library-pglite.test.mjs. No Supabase project, JWT or network is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const A = '30000000-0000-0000-0000-00000000000a';
const B = '30000000-0000-0000-0000-00000000000b';
const HASH = 'a'.repeat(64);
const METRICS = JSON.stringify({ sessions: 2, practiceDays: 2, answers: { correct: 20, wrong: 4 }, dataQuality: 'ok' });
const NARRATIVE = JSON.stringify({ headline: 'h', narrative: 'n', highlights: [], nextWeek: [] });

async function database() {
  const db = new PGlite();
  await db.exec(await sql('tests/auth-stub.sql'));
  await db.exec(`
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    insert into auth.users(id) values ('${A}'), ('${B}');`);
  await db.exec(await sql('migrations/202611040002_learning_profile_reports.sql'));
  await db.exec(await sql('migrations/202611040003_learning_week_plan.sql'));
  return db;
}

/** Runs one statement as anon (null) or as a signed-in user id. */
async function as(db, who, text, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who ?? '']);
  await db.exec(`set role ${who ? 'authenticated' : 'anon'}`);
  try { return await db.query(text, params); } finally { await db.exec('reset role'); }
}
const report = (db, who, { owner = who, start = '2026-10-29', hash = HASH } = {}) => as(db, who,
  `insert into public.weekly_reports(user_id, period_start, period_end, timezone, metrics, metrics_hash, narrative, model_id)
   values ($1, $2::date, ($2::date + 6), 'Europe/Istanbul', $3::jsonb, $4, $5::jsonb, 'model-fixture') returning id`,
  [owner, start, METRICS, hash, NARRATIVE]);

test('a learning profile is visible and writable only by its owner; updated_at is the server clock', async () => {
  const db = await database();
  await assert.rejects(as(db, A, `insert into public.learning_profiles(user_id, updated_at) values ($1, '2000-01-01')`, [A]), /permission denied/);
  await as(db, A, `insert into public.learning_profiles(user_id, purpose, instrument, level, weekly_minutes, interests, timezone)
    values ($1, 'hobby', 'guitar', 'beginner', 90, 'Tarrega', 'Europe/Istanbul')`, [A]);
  const [own] = (await as(db, A, 'select * from public.learning_profiles')).rows;
  assert.equal(own.instrument, 'guitar');
  assert.ok(new Date(own.updated_at).getFullYear() >= 2026, 'set by the server');
  assert.equal((await as(db, B, 'select * from public.learning_profiles')).rows.length, 0);
  await assert.rejects(as(db, null, 'select * from public.learning_profiles'), /permission denied/);
  // Another user can neither create a row for A nor change A's row.
  await assert.rejects(as(db, B, `insert into public.learning_profiles(user_id, purpose) values ($1, 'detailed')`, [A]));
  const changed = await as(db, B, `update public.learning_profiles set level = 'reads' where user_id = $1`, [A]);
  assert.equal(changed.affectedRows ?? 0, 0);
  // The owner updates (also as supabase-js upsert does) but cannot move the row to someone else.
  await as(db, A, `insert into public.learning_profiles(user_id, level) values ($1, 'some')
    on conflict (user_id) do update set user_id = excluded.user_id, level = excluded.level`, [A]);
  assert.equal((await as(db, A, 'select level from public.learning_profiles')).rows[0].level, 'some');
  await assert.rejects(as(db, A, `update public.learning_profiles set user_id = $1`, [B]));
  await assert.rejects(as(db, A, `delete from public.learning_profiles`));
  await db.close();
});

test('profile values outside the allowlists are rejected by the table itself', async () => {
  const db = await database();
  for (const [column, value] of [['purpose', 'career'], ['instrument', 'drums'], ['level', 'expert'], ['weekly_minutes', 1201],
    ['weekly_minutes', -1], ['interests', ''], ['interests', 'x'.repeat(121)], ['timezone', 'Not a zone!']]) {
    await assert.rejects(as(db, A, `insert into public.learning_profiles(user_id, ${column}) values ($1, $2)`, [A, value]), `${column}=${value}`);
  }
  await db.close();
});

test('weekly reports are owner-only, immutable and stored once per period and metrics hash', async () => {
  const db = await database();
  await report(db, A);
  // Same user, period and numbers: the unique constraint refuses a second copy.
  await assert.rejects(report(db, A), /duplicate key|unique/);
  // Changed numbers (a new hash) or another period are a new row.
  await report(db, A, { hash: 'b'.repeat(64) });
  await report(db, A, { start: '2026-10-22' });
  // Another user may store the same period and hash for themselves, never for A.
  await report(db, B);
  await assert.rejects(report(db, B, { owner: A, start: '2026-10-15' }));
  assert.equal((await as(db, A, 'select * from public.weekly_reports')).rows.length, 3);
  assert.equal((await as(db, B, 'select * from public.weekly_reports')).rows.length, 1);
  await assert.rejects(as(db, A, `update public.weekly_reports set narrative = '{}'::jsonb`));
  await assert.rejects(as(db, A, `delete from public.weekly_reports`));
  await assert.rejects(as(db, null, 'select * from public.weekly_reports'));
  await db.close();
});

test('weekly report rows reject malformed periods, hashes and payloads; account deletion cascades', async () => {
  const db = await database();
  const insert = (patch = {}) => {
    const row = { start: '2026-10-29', end: '2026-11-04', hash: HASH, metrics: METRICS, narrative: NARRATIVE, ...patch };
    return as(db, A, `insert into public.weekly_reports(user_id, period_start, period_end, timezone, metrics, metrics_hash, narrative, model_id)
      values ($1, $2::date, $3::date, 'UTC', $4::jsonb, $5, $6::jsonb, 'model-fixture')`, [A, row.start, row.end, row.metrics, row.hash, row.narrative]);
  };
  for (const patch of [{ end: '2026-10-28' }, { end: '2026-11-05' }, { hash: 'A'.repeat(64) }, { hash: 'abc' },
    { metrics: '[]' }, { narrative: '"text"' }]) {
    await assert.rejects(insert(patch), JSON.stringify(patch));
  }
  await insert();
  await as(db, A, `insert into public.learning_profiles(user_id, purpose) values ($1, 'hobby')`, [A]);
  await db.exec(`delete from auth.users where id = '${A}'`);
  const { rows: [left] } = await db.query('select (select count(*) from public.weekly_reports) as r, (select count(*) from public.learning_profiles) as p');
  assert.deepEqual([Number(left.r), Number(left.p)], [0, 0]);
  await db.close();
});

test('the owner can save a seven-day plan with the profile; a partial week is refused', async () => {
  const db = await database();
  const week = JSON.stringify(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day, i) => ({ day, minutes: i === 6 ? 0 : 20, focus: i === 6 ? '' : 'Sol ve La' })));
  await as(db, A, `insert into public.learning_profiles(user_id, weekly_minutes, week_plan) values ($1, 120, $2::jsonb)
    on conflict (user_id) do update set week_plan = excluded.week_plan`, [A, week]);
  assert.equal((await as(db, A, 'select week_plan from public.learning_profiles')).rows[0].week_plan.length, 7);
  await assert.rejects(as(db, A, `update public.learning_profiles set week_plan = $1::jsonb`, [JSON.stringify([{ day: 'mon', minutes: 10, focus: 'x' }])]));
  assert.equal((await as(db, B, 'select * from public.learning_profiles')).rows.length, 0);
  await db.close();
});
