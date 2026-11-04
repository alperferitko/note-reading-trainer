// buildWeeklyMetrics: the weekly numbers the app computes from its practice evidence before the
// model narrates them. Local calendar days, measured-vs-missing (null, never 0), the previous week
// and data quality. Pure and offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyMetrics, buildWeeklyReportRequest, weeklyPeriod, weeklyReportKey } from '../lib/ai-client.mjs';
import { validateRequest } from '../supabase/functions/_shared/ai/validation.mjs';

const NOW = Date.parse('2026-11-04T12:00:00Z');
let serial = 0;
const row = (at, patch = {}) => ({ id: `r-${serial++}`, module: 'reading', task: 'staff-name', item: 'treble:g4', session: 's1',
  correct: true, firstAttempt: true, assisted: false, timedOut: false, responseMs: 1500, timeLimitMs: null,
  clef: 'treble', position: 2, accidental: 0, at, ...patch });
const tap = (at, responseMs, task = 'tap-pulse') => row(at, { module: 'rhythm', task, item: 'pulse:steady', clef: undefined, position: undefined,
  accidental: undefined, responseMs, session: `tap-${serial}` });

test('the period is the seven local days ending today in the given time zone', () => {
  assert.deepEqual(weeklyPeriod({ timezone: 'Europe/Istanbul', now: NOW }), { start: '2026-10-29', end: '2026-11-04' });
  // 12:00 UTC is already 02:00 the next day at UTC+14.
  assert.deepEqual(weeklyPeriod({ timezone: 'Pacific/Kiritimati', now: NOW }), { start: '2026-10-30', end: '2026-11-05' });
  assert.deepEqual(weeklyPeriod({ timezone: 'America/Los_Angeles', now: Date.parse('2026-11-04T06:00:00Z') }), { start: '2026-10-28', end: '2026-11-03' });
  assert.throws(() => weeklyPeriod({ timezone: 'Not/AZone', now: NOW }), RangeError);
  assert.throws(() => buildWeeklyMetrics([], { timezone: '', now: NOW }), RangeError);
});

test('practice days and the week boundary follow local midnight, not UTC', () => {
  const records = [
    row('2026-11-03T20:00:00Z'), // Istanbul 23:00 on 3 Nov
    row('2026-11-03T21:30:00Z'), // Istanbul 00:30 on 4 Nov, still 3 Nov in UTC
    row('2026-10-28T21:30:00Z'), // Istanbul 00:30 on 29 Oct (inside), UTC 28 Oct (previous week)
  ];
  const istanbul = buildWeeklyMetrics(records, { timezone: 'Europe/Istanbul', now: NOW });
  assert.equal(istanbul.practiceDays, 3);
  assert.equal(istanbul.answers.correct, 3);
  assert.equal(istanbul.previous, null, 'no evidence before the local week: previous is unknown, not zero');
  const utc = buildWeeklyMetrics(records, { timezone: 'UTC', now: NOW });
  assert.equal(utc.practiceDays, 1);
  assert.equal(utc.answers.correct, 2);
  assert.equal(utc.previous.answers.correct, 1);
  // US daylight saving ends on 1 Nov 2026: 00:30 PDT and 23:30 PST are the same local day.
  const la = buildWeeklyMetrics([row('2026-11-01T07:30:00Z'), row('2026-11-02T07:30:00Z')], { timezone: 'America/Los_Angeles', now: NOW });
  assert.equal(la.practiceDays, 1);
  assert.equal(buildWeeklyMetrics([row('2026-11-01T07:30:00Z'), row('2026-11-02T07:30:00Z')], { timezone: 'UTC', now: NOW }).practiceDays, 2);
});

test('missing measurements are null, never 0; response time is never a tap offset', () => {
  const unmeasured = buildWeeklyMetrics([row('2026-11-04T08:00:00Z', { responseMs: null })], { timezone: 'UTC', now: NOW });
  assert.equal(unmeasured.responseTimeMs, null);
  assert.equal(unmeasured.rhythmTiming, null);
  const zero = buildWeeklyMetrics([row('2026-11-04T08:00:00Z', { responseMs: 0 })], { timezone: 'UTC', now: NOW });
  assert.deepEqual(zero.responseTimeMs, { median: 0, sampleSize: 1 }, 'a measured zero is a zero');
  const taps = buildWeeklyMetrics([tap('2026-11-04T08:00:00Z', 35), tap('2026-11-04T08:05:00Z', 46, 'tap-pattern'), tap('2026-11-04T08:10:00Z', null)],
    { timezone: 'UTC', now: NOW });
  assert.deepEqual(taps.rhythmTiming, { meanAbsOffsetMs: 41, sampleSize: 2 });
  assert.equal(taps.responseTimeMs, null, 'tap offsets are not answer speed');
  assert.equal(taps.noteStruggles.length, 0);
  // Only unaided, not timed-out, measured answers give the median.
  const mixed = buildWeeklyMetrics([
    row('2026-11-04T08:00:00Z', { responseMs: 1000 }), row('2026-11-04T08:01:00Z', { responseMs: 3000 }),
    row('2026-11-04T08:02:00Z', { responseMs: 9000, assisted: true, correct: true }),
    row('2026-11-04T08:03:00Z', { responseMs: null, timedOut: true, correct: false }),
    tap('2026-11-04T08:04:00Z', 20),
  ], { timezone: 'UTC', now: NOW });
  assert.deepEqual(mixed.responseTimeMs, { median: 2000, sampleSize: 2 });
  assert.deepEqual(mixed.rhythmTiming, { meanAbsOffsetMs: 20, sampleSize: 1 });
  assert.deepEqual(mixed.answers, { correct: 4, wrong: 1 });
});

test('an empty week is dataQuality none with nothing measured; thin and ok follow the documented rules', () => {
  const empty = buildWeeklyMetrics([], { timezone: 'UTC', now: NOW });
  assert.deepEqual(empty, { sessions: 0, practiceDays: 0, answers: { correct: 0, wrong: 0 }, noteStruggles: [], responseTimeMs: null,
    rhythmTiming: null, pieces: [], previous: null, dataQuality: 'none' });
  const day = (date, count, session) => Array.from({ length: count }, (_, i) => row(`${date}T08:${String(i).padStart(2, '0')}:00Z`, { session }));
  assert.equal(buildWeeklyMetrics(day('2026-11-03', 25, 'a'), { timezone: 'UTC', now: NOW }).dataQuality, 'thin', 'one day only');
  assert.equal(buildWeeklyMetrics([...day('2026-11-02', 2, 'a'), ...day('2026-11-03', 3, 'b')], { timezone: 'UTC', now: NOW }).dataQuality, 'thin', 'few answers');
  const ok = buildWeeklyMetrics([...day('2026-11-02', 12, 'a'), ...day('2026-11-03', 12, 'b')], { timezone: 'UTC', now: NOW });
  assert.equal(ok.dataQuality, 'ok');
  assert.equal(ok.sessions, 2);
  assert.equal(ok.practiceDays, 2);
});

test('previous is the seven days before; null when untracked or when the full local store starts inside it', () => {
  const old = row('2026-10-10T08:00:00Z');
  const current = row('2026-11-04T08:00:00Z');
  const quiet = buildWeeklyMetrics([old, current], { timezone: 'UTC', now: NOW });
  assert.equal(quiet.previous.dataQuality, 'none', 'tracked, but nothing practised the week before');
  assert.equal(quiet.previous.responseTimeMs, null);
  assert.ok(!('pieces' in quiet.previous) && !('previous' in quiet.previous));
  const withPrevious = buildWeeklyMetrics([row('2026-10-25T08:00:00Z', { correct: false }), current], { timezone: 'UTC', now: NOW });
  assert.deepEqual(withPrevious.previous.answers, { correct: 0, wrong: 1 });
  // 800 records (the device limit) starting in the previous week: that week may be cut off.
  const full = Array.from({ length: 800 }, (_, i) => row(new Date(Date.parse('2026-10-24T00:00:00Z') + i * 15 * 60000).toISOString()));
  assert.equal(buildWeeklyMetrics(full, { timezone: 'UTC', now: NOW }).previous, null);
});

test('note struggles are written pitches with repeated unaided errors, worst first', () => {
  const records = [];
  const add = (count, errors, patch) => { for (let i = 0; i < count; i++) records.push(row(`2026-11-03T09:${String(records.length).padStart(2, '0')}:00Z`, { correct: i >= errors, ...patch })); };
  add(4, 3, { position: 2 });                              // treble g4, 3/4 wrong
  add(5, 2, { position: 3, item: 'treble:a4' });           // treble a4, 2/5 wrong
  add(3, 2, { clef: 'bass', position: 2, item: 'bass:g4' }); // bass clef, same staff place: written B2
  add(4, 2, { position: 4, item: 'treble:b4', accidental: -1 }); // B-flat 4
  add(2, 2, { position: 5, item: 'treble:c5' });           // only two attempts: not a struggle
  add(4, 4, { position: 6, item: 'treble:d5', assisted: true }); // assisted retries never count
  const metrics = buildWeeklyMetrics(records, { timezone: 'UTC', now: NOW });
  assert.deepEqual(metrics.noteStruggles, [
    { note: 'treble:g4', attempts: 4, errors: 3 },
    { note: 'bass:b2', attempts: 3, errors: 2 },
    { note: 'treble:b4b', attempts: 4, errors: 2 }, // the app's id format: letter, octave, accidental
    { note: 'treble:a4', attempts: 5, errors: 2 },
  ]);
});

test('the result is a valid request, and its idempotency key changes only with the numbers', async () => {
  const records = [row('2026-11-03T08:00:00Z'), row('2026-11-04T08:00:00Z', { correct: false })];
  const pieces = [{ title: 'Lágrima', from: 10, to: 30 }];
  for (const timezone of ['Europe/Istanbul', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
    const request = buildWeeklyReportRequest(records, { timezone, locale: 'tr', now: NOW, pieces });
    assert.deepEqual(validateRequest(request, NOW, 262144).metrics, request.metrics, timezone);
  }
  const a = buildWeeklyReportRequest(records, { timezone: 'UTC', now: NOW, pieces });
  const b = buildWeeklyReportRequest(structuredClone(records), { timezone: 'UTC', now: NOW + 3600000, pieces });
  assert.equal(await weeklyReportKey(a.period, a.metrics), await weeklyReportKey(b.period, b.metrics), 'same week, same numbers, same key');
  const c = buildWeeklyReportRequest([...records, row('2026-11-04T09:00:00Z')], { timezone: 'UTC', now: NOW, pieces });
  assert.notEqual(await weeklyReportKey(a.period, a.metrics), await weeklyReportKey(c.period, c.metrics));
  assert.throws(() => buildWeeklyMetrics(records, { timezone: 'UTC', now: NOW, pieces: [{ title: '', from: 0, to: 1 }] }), { code: 'invalid_request' });
});
