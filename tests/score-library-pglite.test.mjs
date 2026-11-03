// Runs the score library migration on PostgreSQL compiled to WebAssembly (PGlite), in memory, on
// top of the local auth stand-in. Supabase's default grants (everything to anon/authenticated/
// service_role) are reproduced first, so the migration's revokes are what is actually tested.
// Roles are switched with SET ROLE and the caller is the request.jwt.claim.sub setting, as in
// supabase/tests/weekly_leaderboards.test.sql. Storage is a minimal stand-in (bucket + objects
// tables with RLS and storage.foldername); the real Storage API is not exercised here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import * as lib from '../lib/score-library.mjs';

const sql = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';
const ADMIN = '20000000-0000-0000-0000-0000000000ad';
const hash = text => createHash('sha256').update(text).digest('hex');
const xml = (tag = 'v1') => `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>${tag}</work-title></work><part-list/></score-partwise>`;
const STATEMENT = 'Bu eser kamu malıdır; paylaşma hakkım var.';
const ALL_CHECKS = { accuracy: true, content: true, rights: true };

const SUPABASE_DEFAULTS = `
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  insert into auth.users(id) values ('${A}'), ('${B}'), ('${ADMIN}');`;

const STORAGE_STUB = `
  create schema storage;
  create table storage.buckets(id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
    name text not null, owner uuid, unique(bucket_id, name));
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
  declare _parts text[]; begin _parts := string_to_array(name, '/'); return _parts[1:array_length(_parts, 1) - 1]; end $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;`;

async function database({ storage = false } = {}) {
  const db = new PGlite();
  await db.exec(await sql('tests/auth-stub.sql'));
  await db.exec(SUPABASE_DEFAULTS);
  if (storage) await db.exec(STORAGE_STUB);
  await db.exec(await sql('migrations/202611040001_score_library.sql'));
  await db.exec(`insert into public.app_admins(user_id) values ('${ADMIN}')`);
  return db;
}

/** Runs one statement as anon (null), a user id, or 'service' (service_role). */
async function as(db, who, text, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who && who !== 'service' ? who : '']);
  await db.exec(`set role ${who === 'service' ? 'service_role' : who ? 'authenticated' : 'anon'}`);
  try { return await db.query(text, params); } finally { await db.exec('reset role'); }
}
/** Calls public.<fn> with named arguments, like supabase-js rpc(). */
async function call(db, who, fn, args = {}) {
  const names = Object.keys(args);
  const list = names.map((name, i) => `${name} => $${i + 1}`).join(', ');
  const values = names.map(name => (args[name] !== null && typeof args[name] === 'object' && !Array.isArray(args[name]))
    || (Array.isArray(args[name]) && args[name].some(v => typeof v === 'object')) ? JSON.stringify(args[name]) : args[name]);
  const { rows } = await as(db, who, `select public.${fn}(${list}) as r`, values);
  return rows[0].r;
}
const rows = async (db, who, text, params) => (await as(db, who, text, params)).rows;

const create = (db, who, extra = {}) => call(db, who, 'score_create', {
  p_title: 'Lágrima', p_composer: 'Tárrega', p_instrument: 'guitar', p_difficulty: 'intermediate',
  p_source_note: 'IMSLP scan', p_license: 'unknown', p_source_hash: hash('pdf-bytes'), p_musicxml: null, ...extra,
});
const attach = (db, who, scoreId, mime = 'application/pdf') => call(db, who, 'score_attach_source', {
  p_score_id: scoreId, p_mime: mime, p_bytes: 12345, p_page_count: 3, p_selected_pages: [1, 2],
});
const claim = db => call(db, 'service', 'score_job_claim', { p_lease_seconds: 600 });
const finish = (db, job, ok, extra = {}) => call(db, 'service', 'score_job_finish', {
  p_job_id: job.jobId, p_lease_token: job.leaseToken, p_ok: ok, p_musicxml: ok ? xml('recognized') : null,
  p_engine: ok ? 'audiveris' : null, p_engine_version: ok ? '5.4' : null,
  p_warnings: ok ? [{ measure: 3, note: 2, reason: 'low_confidence' }] : null, p_error_code: ok ? null : 'omr_failed', ...extra,
});
const correct = (db, who, scoreId, confirm = true, tag = 'corrected') => call(db, who, 'score_save_correction', {
  p_score_id: scoreId, p_musicxml: xml(tag), p_corrections: [{ measure: 3, from: 'C4', to: 'D4' }], p_warnings: [], p_confirm: confirm,
});
const submit = (db, who, scoreId, license = 'public_domain', statement = STATEMENT) => call(db, who, 'score_submit_for_review', {
  p_score_id: scoreId, p_license: license, p_share_statement: statement,
});
const review = (db, who, scoreId, decision = 'approve', reason = null, checks = ALL_CHECKS) => call(db, who, 'score_review', {
  p_score_id: scoreId, p_decision: decision, p_reason: reason, p_checks: checks,
});

/** Upload -> OMR -> corrected -> ready_personal, returning the score id. */
async function readyScore(db, who, seed = 'pdf-bytes') {
  const { scoreId } = await create(db, who, { p_source_hash: hash(seed) });
  await attach(db, who, scoreId);
  await finish(db, await claim(db), true);
  await correct(db, who, scoreId, true);
  return scoreId;
}
async function publishedScore(db, seed = 'published') {
  const scoreId = await readyScore(db, A, seed);
  await submit(db, A, scoreId);
  await review(db, ADMIN, scoreId);
  return scoreId;
}

test('clients get SELECT under RLS only; writes and worker RPCs are not granted', async () => {
  const db = await database();
  const priv = async (_role, check) => (await db.query(`select ${check} as ok`)).rows[0].ok;
  for (const table of ['scores', 'score_sources', 'score_versions', 'score_jobs', 'score_reviews', 'score_reports', 'app_admins']) {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const p of ['INSERT', 'UPDATE', 'DELETE']) assert.equal(await priv(role, `has_table_privilege('${role}','public.${table}','${p}')`), false, `${role} ${p} ${table}`);
    }
    assert.equal(await priv('anon', `has_table_privilege('anon','public.${table}','SELECT')`), false, `anon reads ${table}`);
  }
  assert.equal(await priv('anon', `has_table_privilege('anon','public.library_scores','SELECT')`), true);
  for (const fn of ['score_create(text,text,text,text,text,text,text,text)', 'score_review(uuid,text,text,jsonb)', 'score_job_claim(integer)']) {
    assert.equal(await priv('anon', `has_function_privilege('anon','public.${fn}','EXECUTE')`), false, `anon ${fn}`);
  }
  for (const fn of ['score_job_claim(integer)', 'score_job_finish(uuid,uuid,boolean,text,text,text,jsonb,text)', 'library_score_rows()']) {
    assert.equal(await priv('authenticated', `has_function_privilege('authenticated','public.${fn}','EXECUTE')`), fn === 'library_score_rows()', fn);
  }
  assert.equal(await priv('service_role', `has_function_privilege('service_role','public.score_create(text,text,text,text,text,text,text,text)','EXECUTE')`), false);
  await assert.rejects(as(db, A, `insert into public.scores(owner_id,title,source_hash) values ('${A}','x','${hash('x')}')`), /permission denied/);
  await assert.rejects(as(db, null, 'select * from public.scores'), /permission denied/);
  await assert.rejects(create(db, null), /permission denied/);
  await assert.rejects(as(db, A, 'select public.score_job_claim(600)'), /permission denied/);
  await db.close();
});

test('owner isolation: B cannot read or change A\'s scores, sources, versions or jobs', async () => {
  const db = await database();
  const { scoreId } = await create(db, A);
  await attach(db, A, scoreId);
  await finish(db, await claim(db), true);
  for (const table of ['scores', 'score_sources', 'score_versions', 'score_jobs']) {
    assert.equal((await rows(db, A, `select * from public.${table}`)).length, 1, `A sees own ${table}`);
    assert.equal((await rows(db, B, `select * from public.${table}`)).length, 0, `B sees A's ${table}`);
    assert.equal((await rows(db, ADMIN, `select * from public.${table}`)).length, 1, `admin sees ${table}`);
  }
  await assert.rejects(correct(db, B, scoreId), /not_found/);
  await assert.rejects(attach(db, B, scoreId), /not_found/);
  await assert.rejects(submit(db, B, scoreId), /not_found/);
  await assert.rejects(call(db, B, 'score_delete', { p_score_id: scoreId }), /not_found/);
  const source = (await rows(db, A, 'select storage_path, mime, selected_pages from public.score_sources'))[0];
  assert.equal(source.storage_path, `${A}/${hash('pdf-bytes')}.pdf`);
  assert.deepEqual(source.selected_pages, [1, 2]);
  await db.close();
});

test('the same file twice returns the same score, never a copy; direct imports hash the MusicXML', async () => {
  const db = await database();
  const first = await create(db, A);
  const second = await create(db, A, { p_title: 'Another title' });
  assert.equal(second.scoreId, first.scoreId);
  assert.deepEqual([first.duplicate, second.duplicate], [false, true]);
  assert.equal((await rows(db, A, 'select title from public.scores'))[0].title, 'Lágrima');
  const other = await create(db, B);
  assert.notEqual(other.scoreId, first.scoreId, 'dedupe is per owner');
  const imported = await create(db, A, { p_source_hash: null, p_musicxml: xml('import') });
  assert.equal(imported.status, 'needs_correction');
  assert.equal((await rows(db, A, 'select source_hash from public.scores where id=$1', [imported.scoreId]))[0].source_hash, hash(xml('import')));
  assert.equal((await create(db, A, { p_source_hash: null, p_musicxml: xml('import') })).scoreId, imported.scoreId);
  const [version] = await rows(db, A, 'select kind, engine from public.score_versions where score_id=$1', [imported.scoreId]);
  assert.deepEqual(version, { kind: 'recognized', engine: 'musicxml_import' });
  await assert.rejects(create(db, A, { p_source_hash: 'not-a-hash' }), /invalid_hash/);
  await assert.rejects(create(db, A, { p_source_hash: null, p_musicxml: '<html/>' }), /invalid_musicxml/);
  await assert.rejects(create(db, A, { p_source_hash: hash('t'), p_title: '   ' }), /invalid_input/);
  await assert.rejects(create(db, A, { p_source_hash: hash('t'), p_difficulty: 'expert' }), /invalid_input/);
  await db.close();
});

test('a score has at most one active job; failures retry the same row, then fail without changing status', async () => {
  const db = await database();
  const { scoreId } = await create(db, A);
  const { jobId } = await attach(db, A, scoreId);
  assert.ok(jobId);
  assert.deepEqual(await call(db, A, 'score_request_recognition', { p_score_id: scoreId }), { jobId, created: false });
  await assert.rejects(db.query(`insert into public.score_jobs(score_id, owner_id) values ($1, $2)`, [scoreId, A]), /score_jobs_one_active/);
  await assert.rejects(attach(db, A, scoreId), /source_exists/);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const job = await claim(db);
    assert.equal(job.jobId, jobId);
    assert.equal(job.attempt, attempt);
    assert.equal(job.storagePath, `${A}/${hash('pdf-bytes')}.pdf`);
    assert.equal((await finish(db, job, false)).state, attempt < 3 ? 'queued' : 'failed');
  }
  assert.equal((await claim(db)).status, 'empty');
  assert.equal((await rows(db, A, 'select count(*)::int as n from public.score_jobs'))[0].n, 1);
  assert.equal((await rows(db, A, 'select status from public.scores'))[0].status, 'processing');
  const retry = await call(db, A, 'score_request_recognition', { p_score_id: scoreId });
  assert.equal(retry.created, true);
  assert.notEqual(retry.jobId, jobId);
  const job = await claim(db);
  // A stale or foreign lease cannot finish or advance the job.
  await assert.rejects(finish(db, { ...job, leaseToken: '30000000-0000-0000-0000-000000000000' }, true), /lease_lost/);
  await call(db, 'service', 'score_job_progress', { p_job_id: job.jobId, p_lease_token: job.leaseToken, p_progress: 40 });
  assert.equal((await rows(db, A, 'select progress from public.score_jobs where id=$1', [job.jobId]))[0].progress, 40);
  // An expired lease is reclaimed as a new attempt; the old worker's token is then dead.
  await db.query(`update public.score_jobs set lease_expires_at = clock_timestamp() - interval '1 second' where id=$1`, [job.jobId]);
  const reclaimed = await claim(db);
  assert.equal(reclaimed.jobId, job.jobId);
  assert.equal(reclaimed.attempt, 2);
  await assert.rejects(finish(db, job, true), /lease_lost/);
  const done = await finish(db, reclaimed, true);
  assert.equal(done.state, 'succeeded');
  const [score] = await rows(db, A, 'select status, current_version_id from public.scores');
  assert.deepEqual(score, { status: 'needs_correction', current_version_id: done.versionId });
  const [version] = await rows(db, A, 'select kind, engine, engine_version, warnings from public.score_versions');
  assert.deepEqual(version, { kind: 'recognized', engine: 'audiveris', engine_version: '5.4', warnings: [{ measure: 3, note: 2, reason: 'low_confidence' }] });
  await assert.rejects(call(db, A, 'score_request_recognition', { p_score_id: scoreId }), /invalid_transition/);
  await db.close();
});

test('status transitions out of order are refused, by the RPCs and by the table trigger', async () => {
  const db = await database();
  const { scoreId } = await create(db, A);
  await attach(db, A, scoreId);
  await assert.rejects(correct(db, A, scoreId), /invalid_transition/, 'correction before recognition');
  await assert.rejects(submit(db, A, scoreId), /invalid_transition/, 'submit while processing');
  await finish(db, await claim(db), true);
  await assert.rejects(submit(db, A, scoreId), /invalid_transition/, 'submit before confirming');
  assert.equal((await correct(db, A, scoreId, false, 'draft')).status, 'needs_correction');
  await assert.rejects(review(db, ADMIN, scoreId), /invalid_transition/, 'review before submission');
  assert.equal((await correct(db, A, scoreId, true)).status, 'ready_personal');
  await assert.rejects(review(db, ADMIN, scoreId), /invalid_transition/, 'the owner\'s own approval is not a submission');
  await assert.rejects(call(db, ADMIN, 'score_publish_fix', { p_score_id: scoreId, p_musicxml: xml('fix'), p_report_ids: [] }), /invalid_transition/);
  await submit(db, A, scoreId);
  await assert.rejects(correct(db, A, scoreId), /invalid_transition/, 'editing under review');
  await assert.rejects(call(db, A, 'score_delete', { p_score_id: scoreId }), /invalid_transition/, 'deleting under review');
  // Even the database owner cannot skip a step or rewrite a version.
  await assert.rejects(db.query(`update public.scores set status='ready_personal' where id=$1`, [scoreId]), /invalid_transition/);
  await assert.rejects(db.query(`update public.scores set status='processing' where id=$1`, [scoreId]), /invalid_transition/);
  await assert.rejects(db.query(`update public.scores set owner_id=$2 where id=$1`, [scoreId, B]), /score_identity_immutable/);
  await assert.rejects(db.query(`update public.score_versions set musicxml='x'`), /score_versions_immutable/);
  await assert.rejects(db.query(`delete from public.score_versions`), /score_versions_immutable/);
  const kinds = (await rows(db, A, 'select kind from public.score_versions order by created_at, kind')).map(r => r.kind).sort();
  assert.deepEqual(kinds, ['corrected', 'corrected', 'recognized']);
  await db.close();
});

test('submission needs a known license and a share statement; only admins review', async () => {
  const db = await database();
  const scoreId = await readyScore(db, A);
  await assert.rejects(submit(db, A, scoreId, 'unknown'), /license_required/);
  await assert.rejects(submit(db, A, scoreId, null), /license_required/);
  await assert.rejects(submit(db, A, scoreId, 'stolen'), /license_required/);
  await assert.rejects(submit(db, A, scoreId, 'cc_by', '   '), /share_statement_required/);
  await assert.rejects(submit(db, A, scoreId, 'cc_by', null), /share_statement_required/);
  assert.equal((await rows(db, null, 'select * from public.library_scores')).length, 0, 'ready_personal is not public');
  assert.equal((await submit(db, A, scoreId, 'cc_by')).status, 'pending_review');
  assert.deepEqual((await rows(db, A, 'select license, share_statement, status from public.scores'))[0],
    { license: 'cc_by', share_statement: STATEMENT, status: 'pending_review' });
  await assert.rejects(review(db, A, scoreId), /admin_required/, 'owner reviewing own score');
  await assert.rejects(review(db, B, scoreId), /admin_required/);
  await assert.rejects(review(db, null, scoreId), /permission denied/);
  await assert.rejects(review(db, ADMIN, scoreId, 'approve', null, { accuracy: true, content: true, rights: false }), /checks_incomplete/);
  await assert.rejects(review(db, ADMIN, scoreId, 'approve', null, { accuracy: true }), /invalid_input/);
  await assert.rejects(review(db, ADMIN, scoreId, 'reject', ' '), /reason_required/);
  assert.equal((await rows(db, ADMIN, `select count(*)::int as n from public.scores where status='pending_review'`))[0].n, 1, 'admin queue');
  // Rejection, revision, resubmission.
  assert.equal((await review(db, ADMIN, scoreId, 'reject', 'Ölçü 3 yanlış', { accuracy: false, content: true, rights: true })).status, 'rejected');
  assert.equal((await rows(db, A, 'select reason from public.score_reviews'))[0].reason, 'Ölçü 3 yanlış', 'owner sees the reason');
  assert.equal((await rows(db, B, 'select * from public.score_reviews')).length, 0);
  await assert.rejects(submit(db, A, scoreId), /invalid_transition/);
  assert.equal((await correct(db, A, scoreId, true, 'revised')).status, 'ready_personal');
  await submit(db, A, scoreId);
  assert.equal((await review(db, ADMIN, scoreId)).status, 'published');
  await db.close();
});

test('approval publishes a copy anyone can read through the library; the raw source stays private', async () => {
  const db = await database();
  const scoreId = await publishedScore(db);
  const library = await rows(db, null, 'select * from public.library_scores');
  assert.equal(library.length, 1);
  assert.deepEqual(Object.keys(library[0]).sort(),
    ['composer', 'difficulty', 'instrument', 'license', 'published_at', 'published_version_id', 'score_id', 'source_note', 'title']);
  assert.equal(library[0].score_id, scoreId);
  const opened = await call(db, null, 'library_score_open', { p_score_id: scoreId });
  assert.equal(opened.versionId, library[0].published_version_id);
  assert.equal(opened.musicxml, xml('corrected'));
  assert.equal(opened.owner_id, undefined);
  const [published] = await rows(db, A, `select kind, base_version_id, musicxml from public.score_versions where id=$1`, [opened.versionId]);
  assert.equal(published.kind, 'published');
  assert.ok(published.base_version_id, 'copied from the confirmed version');
  assert.equal((await rows(db, B, 'select * from public.library_scores')).length, 1);
  await assert.rejects(as(db, null, 'select * from public.score_sources'), /permission denied/);
  await assert.rejects(as(db, null, 'select * from public.score_versions'), /permission denied/);
  for (const table of ['scores', 'score_sources', 'score_versions', 'score_jobs']) {
    assert.equal((await rows(db, B, `select * from public.${table}`)).length, 0, `B reads A's ${table} after publication`);
  }
  assert.equal((await rows(db, A, 'select * from public.score_sources')).length, 1);
  assert.equal((await rows(db, ADMIN, 'select * from public.score_sources')).length, 1);
  assert.equal(await call(db, null, 'library_score_open', { p_score_id: B }), null, 'unknown id');
  await assert.rejects(call(db, A, 'score_delete', { p_score_id: scoreId }), /invalid_transition/);
  await db.close();
});

test('an error report and an admin fix create a new published version and close the report', async () => {
  const db = await database();
  const scoreId = await publishedScore(db);
  const unpublished = await readyScore(db, A, 'private');
  await assert.rejects(call(db, B, 'score_report_error', { p_score_id: unpublished, p_measure: 2, p_message: 'yanlış' }), /not_found/);
  await assert.rejects(call(db, null, 'score_report_error', { p_score_id: scoreId, p_measure: 2, p_message: 'x' }), /permission denied/);
  await assert.rejects(call(db, B, 'score_report_error', { p_score_id: scoreId, p_measure: 0, p_message: 'x' }), /invalid_input/);
  const { reportId } = await call(db, B, 'score_report_error', { p_score_id: scoreId, p_measure: 7, p_message: 'Si bemol olmalı' });
  assert.equal((await rows(db, B, 'select * from public.score_reports')).length, 1, 'reporter sees own report');
  assert.equal((await rows(db, A, 'select * from public.score_reports')).length, 0, 'others do not');
  const before = (await rows(db, null, 'select published_version_id from public.library_scores'))[0].published_version_id;
  await assert.rejects(call(db, B, 'score_publish_fix', { p_score_id: scoreId, p_musicxml: xml('fixed'), p_report_ids: [reportId] }), /admin_required/);
  await assert.rejects(call(db, ADMIN, 'score_publish_fix', { p_score_id: scoreId, p_musicxml: xml('fixed'), p_report_ids: [B] }), /invalid_report/);
  const fix = await call(db, ADMIN, 'score_publish_fix', { p_score_id: scoreId, p_musicxml: xml('fixed'), p_report_ids: [reportId] });
  assert.equal(fix.fixedReports, 1);
  const after = (await rows(db, null, 'select published_version_id from public.library_scores'))[0].published_version_id;
  assert.equal(after, fix.publishedVersionId);
  assert.notEqual(after, before);
  assert.equal((await call(db, null, 'library_score_open', { p_score_id: scoreId })).musicxml, xml('fixed'));
  const [report] = await rows(db, B, 'select state, fixed_version_id from public.score_reports');
  assert.deepEqual(report, { state: 'fixed', fixed_version_id: fix.publishedVersionId });
  const [base] = await rows(db, ADMIN, 'select base_version_id from public.score_versions where id=$1', [after]);
  assert.equal(base.base_version_id, before);
  await assert.rejects(call(db, ADMIN, 'score_publish_fix', { p_score_id: scoreId, p_musicxml: xml('again'), p_report_ids: [reportId] }), /invalid_report/);
  const second = await call(db, B, 'score_report_error', { p_score_id: scoreId, p_measure: 9, p_message: 'Gereksiz' });
  await call(db, ADMIN, 'score_report_dismiss', { p_report_id: second.reportId });
  await assert.rejects(call(db, ADMIN, 'score_report_dismiss', { p_report_id: second.reportId }), /invalid_report/);
  await db.close();
});

test('deleting a score or the account removes its rows; versions go only with their score', async () => {
  const db = await database();
  const scoreId = await readyScore(db, A, 'to-delete');
  const result = await call(db, A, 'score_delete', { p_score_id: scoreId });
  assert.equal(result.storagePath, `${A}/${hash('to-delete')}.pdf`);
  for (const table of ['scores', 'score_sources', 'score_versions', 'score_jobs']) {
    assert.equal((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n, 0, table);
  }
  await publishedScore(db);
  await call(db, B, 'score_report_error', { p_score_id: (await rows(db, null, 'select score_id from public.library_scores'))[0].score_id, p_measure: 1, p_message: 'x' });
  // A deleted admin's published versions stay, with created_by cleared (the one allowed version update).
  await db.query(`delete from auth.users where id=$1`, [ADMIN]);
  assert.equal((await rows(db, null, 'select * from public.library_scores')).length, 1);
  assert.equal((await db.query(`select count(*)::int as n from public.score_versions where kind='published' and created_by is null`)).rows[0].n, 1);
  await db.query(`delete from auth.users where id=$1`, [A]);
  for (const table of ['scores', 'score_sources', 'score_versions', 'score_jobs', 'score_reviews', 'score_reports']) {
    assert.equal((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n, 0, table);
  }
  await db.close();
});

test('storage stand-in: private bucket, owners write only {uid}/{hash}.{ext} of their own scores', async () => {
  const db = await database({ storage: true });
  const [bucket] = (await db.query(`select public, file_size_limit from storage.buckets where id='score-sources'`)).rows;
  assert.deepEqual({ public: bucket.public, limit: Number(bucket.file_size_limit) }, { public: false, limit: 20971520 });
  await create(db, A);
  const put = (who, name) => as(db, who, `insert into storage.objects(bucket_id, name, owner) values ('score-sources', $1, $2)`, [name, who]);
  await put(A, `${A}/${hash('pdf-bytes')}.pdf`);
  await assert.rejects(put(A, `${B}/${hash('pdf-bytes')}.pdf`), /row-level security/, 'another user\'s folder');
  await assert.rejects(put(A, `${A}/${hash('no-score')}.pdf`), /row-level security/, 'no score with that hash');
  await assert.rejects(put(A, `${A}/${hash('pdf-bytes')}.exe`), /row-level security/, 'bad extension');
  await assert.rejects(put(null, `${A}/${hash('pdf-bytes')}.png`), /row-level security/, 'anon');
  assert.equal((await rows(db, A, 'select * from storage.objects')).length, 1);
  assert.equal((await rows(db, B, 'select * from storage.objects')).length, 0);
  assert.equal((await rows(db, null, 'select * from storage.objects')).length, 0);
  assert.equal((await rows(db, ADMIN, 'select * from storage.objects')).length, 1);
  assert.equal((await as(db, B, `delete from storage.objects`)).affectedRows ?? 0, 0);
  assert.equal((await rows(db, A, 'select * from storage.objects')).length, 1, 'B could not delete it');
  await db.close();
});

/** A supabase-js stand-in whose rpc() runs against PGlite as the given user. */
function fakeClient(db, who, { upload = async () => ({ data: {}, error: null }) } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: who ? { id: who } : null }, error: null }) },
    rpc: async (fn, args) => {
      try { return { data: await call(db, who, fn, args), error: null }; } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
    },
    storage: { from: bucket => ({ upload: (path, file, options) => upload(bucket, path, file, options), remove: async () => ({ error: null }) }) },
  };
}

test('client wrapper: argument names match the RPCs and errors map to stable codes', async () => {
  const db = await database();
  const uploads = [];
  const client = fakeClient(db, A, { upload: async (...args) => { uploads.push(args); return { data: null, error: { statusCode: '409', message: 'The resource already exists' } }; } });
  const sourceHash = await lib.sha256Hex('pdf-bytes');
  assert.equal(sourceHash, hash('pdf-bytes'));
  const created = await lib.createScore(client, { title: 'Étude', sourceHash });
  assert.equal((await lib.createScore(client, { title: 'Étude', sourceHash })).scoreId, created.scoreId);
  const uploaded = await lib.uploadSource(client, { scoreId: created.scoreId, sourceHash, file: new Uint8Array(10), mime: 'application/pdf', selectedPages: [1] });
  assert.equal(uploaded.storagePath, `${A}/${sourceHash}.pdf`);
  assert.deepEqual(uploads[0].slice(0, 2), ['score-sources', uploaded.storagePath]);
  assert.equal(uploads[0][3].contentType, 'application/pdf');
  await finish(db, await claim(db), true);
  assert.equal((await lib.saveCorrection(client, { scoreId: created.scoreId, musicxml: xml('c'), confirm: true })).status, 'ready_personal');
  await assert.rejects(lib.submitForReview(client, { scoreId: created.scoreId, license: 'unknown', shareStatement: STATEMENT }),
    error => error instanceof lib.ScoreLibraryError && error.code === 'license_required');
  await lib.submitForReview(client, { scoreId: created.scoreId, license: 'own_work', shareStatement: STATEMENT });
  await review(db, ADMIN, created.scoreId);
  assert.equal((await lib.openLibraryScore(fakeClient(db, null), created.scoreId)).musicxml, xml('c'));
  await assert.rejects(lib.openLibraryScore(fakeClient(db, null), B), { code: 'not_found' });
  assert.ok((await lib.reportError(fakeClient(db, B), { scoreId: created.scoreId, measure: 1, message: 'x' })).reportId);
  await assert.rejects(lib.reportError(fakeClient(db, null), { scoreId: created.scoreId, measure: 1, message: 'x' }), { code: 'forbidden' });
  await assert.rejects(lib.uploadSource(client, { scoreId: created.scoreId, sourceHash, file: new Uint8Array(1), mime: 'text/html' }), { code: 'unsupported_type' });
  await assert.rejects(lib.uploadSource(client, { scoreId: created.scoreId, sourceHash, file: new Uint8Array(1), bytes: lib.MAX_SOURCE_BYTES + 1, mime: 'image/png' }), { code: 'file_too_large' });
  await assert.rejects(lib.listMyScores(fakeClient(db, null)), { code: 'authentication_required' });
  assert.throws(() => lib.sourcePath(A, 'nope', 'application/pdf'), { code: 'invalid_hash' });
  assert.equal(lib.sourcePath(A, sourceHash, 'application/vnd.recordare.musicxml'), `${A}/${sourceHash}.mxl`);
  assert.equal(lib.scoreErrorCode({ message: 'Failed to fetch', name: 'TypeError' }), 'network_error');
  assert.equal(lib.scoreErrorCode({ message: 'something odd' }), 'unknown_error');
  assert.equal(lib.scoreErrorCode({ code: 'PGRST116', message: 'JSON object requested' }), 'not_found');
  await db.close();
});
