import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_LIMIT, analyzeItems, appendEvidence, buildSkillMap, buildTargetedPool, clearEvidence, contextKey,
  findWeakItems, practiceApplication, readEvidence, saveEvidence, spreadRepeats, validEvidence,
} from '../lib/practice-evidence.mjs';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const minutesAgo = n => new Date(NOW - n * 60000).toISOString();
let serial = 0;
const record = (overrides = {}) => ({
  id: `r${serial++}`, module: 'reading', task: 'name', item: 'treble:f4', session: 's1', clef: 'treble',
  midi: 65, octave: 4, position: 1, accidental: 0, correct: true, firstAttempt: true, assisted: false,
  timedOut: false, responseMs: 1200, timeLimitMs: null, at: minutesAgo(10), ...overrides,
});

function seeded(seed = 7) {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('corrupt, future, duplicate or contradictory records are rejected', () => {
  const good = record();
  const rows = [good, good, null, 'x', record({ module: 'drums' }), record({ at: 'nope' }),
    record({ at: new Date(NOW + 3600000).toISOString() }), record({ timedOut: true, correct: true }),
    record({ clef: 'alto' }), record({ midi: 200 }), record({ responseMs: -1 }), record({ correct: 'yes' })];
  const valid = validEvidence(rows, NOW);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].id, good.id);
  assert.deepEqual(validEvidence({ not: 'an array' }, NOW), []);
});

test('storage keeps only the newest records up to the limit', () => {
  const rows = Array.from({ length: EVIDENCE_LIMIT + 25 }, (_, i) => record({ id: `n${i}`, at: minutesAgo(EVIDENCE_LIMIT + 25 - i) }));
  const kept = appendEvidence([], rows, NOW);
  assert.equal(kept.length, EVIDENCE_LIMIT);
  assert.equal(kept[0].id, 'n25');
  assert.equal(kept.at(-1).id, `n${EVIDENCE_LIMIT + 24}`);
});

test('persistence round-trips through storage and survives unavailable storage', () => {
  const storage = new MemoryStorage();
  assert.equal(saveEvidence([record({ id: 'keep' })], storage, NOW), true);
  assert.equal(saveEvidence([record({ id: 'keep' }), record({ id: 'second' })], storage, NOW), true);
  assert.deepEqual(readEvidence(storage, NOW).map(row => row.id), ['keep', 'second']);
  storage.setItem('notanota-question-evidence-v1', '{broken');
  assert.deepEqual(readEvidence(storage, NOW), []);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(readEvidence(broken, NOW), []);
  assert.equal(saveEvidence([record()], broken, NOW), false);
});

test('little data never produces a diagnosis', () => {
  const rows = [record({ correct: false, answer: 'Mi' }), record({ correct: false, answer: 'Mi' })];
  assert.deepEqual(findWeakItems(rows, {}, NOW), []);
  assert.equal(analyzeItems(rows, {}, NOW)[0].status, 'insufficient');
});

test('repeated unaided errors in one context are flagged with the most common wrong answer', () => {
  const rows = [
    record({ correct: false, answer: 'Mi' }), record({ correct: true }), record({ correct: false, answer: 'Mi' }),
    record({ correct: false, answer: 'Sol', timedOut: false }),
  ];
  const [weak] = findWeakItems(rows, { module: 'reading' }, NOW);
  assert.equal(weak.item, 'treble:f4');
  assert.equal(weak.recentErrors, 3);
  assert.equal(weak.commonAnswer, 'Mi');
});

test('assisted answers are recorded but are not evidence of weakness', () => {
  const rows = Array.from({ length: 5 }, () => record({ correct: false, assisted: true }));
  const [item] = analyzeItems(rows, {}, NOW);
  assert.equal(item.assistedAttempts, 5);
  assert.equal(item.status, 'insufficient');
});

test('bass-clef errors never become a treble-clef diagnosis', () => {
  const bassRows = Array.from({ length: 4 }, () => record({ clef: 'bass', item: 'bass:a2', correct: false }));
  assert.equal(findWeakItems(bassRows, { clef: 'treble' }, NOW).length, 0);
  assert.equal(findWeakItems(bassRows, { clef: 'bass' }, NOW).length, 1);
  assert.notEqual(contextKey(bassRows[0]), contextKey(record()));
});

test('timed and untimed answers are separate contexts', () => {
  const rows = [
    ...Array.from({ length: 3 }, () => record({ module: 'score', correct: false, timedOut: true, timeLimitMs: 800 })),
    ...Array.from({ length: 3 }, () => record({ module: 'score' })),
  ];
  const items = analyzeItems(rows, { module: 'score' }, NOW);
  assert.equal(items.length, 2);
  assert.equal(items.find(item => item.key.endsWith('timed')).status, 'needs-work');
  assert.equal(items.find(item => item.key.endsWith('free')).timeouts, 0);
});

test('old evidence stops counting and recovered items leave the weak list', () => {
  const old = Array.from({ length: 4 }, () => record({ correct: false, at: new Date(NOW - 60 * 86400000).toISOString() }));
  assert.equal(findWeakItems(old, {}, NOW).length, 0);
  const recovering = [
    ...Array.from({ length: 3 }, (_, i) => record({ correct: false, at: minutesAgo(100 - i) })),
    ...Array.from({ length: 5 }, (_, i) => record({ correct: true, at: minutesAgo(50 - i) })),
  ];
  assert.equal(findWeakItems(recovering, {}, NOW).length, 0);
  assert.equal(analyzeItems(recovering, {}, NOW)[0].status, 'secure');
});

test('targeted pools add bounded repetitions without removing any item', () => {
  const pool = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` }));
  const { pool: targetedPool, targeted } = buildTargetedPool(pool, ['n1', 'n2', 'n3', 'n4', 'missing'], { rng: seeded() });
  assert.equal(targeted.length, 3);
  assert.equal(targetedPool.length, 13);
  for (const item of pool) assert.ok(targetedPool.includes(item));
  assert.ok(targeted.every(item => ['n1', 'n2', 'n3', 'n4'].includes(item.id)));
  assert.deepEqual(buildTargetedPool(pool, [], { rng: seeded() }).targeted, []);
  assert.throws(() => buildTargetedPool(pool, ['n1', 'n2'], { rng: () => 1 }), RangeError);
});

test('targeted sampling is deterministic with a seeded generator and spreads repeats', () => {
  const pool = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}` }));
  const a = buildTargetedPool(pool, ['n0', 'n5'], { rng: seeded(3) });
  const b = buildTargetedPool(pool, ['n0', 'n5'], { rng: seeded(3) });
  assert.deepEqual(a.targeted, b.targeted);
  for (let run = 0; run < 50; run += 1) {
    const spread = spreadRepeats(a.pool, item => item.id, seeded(run + 1));
    assert.equal(spread.length, a.pool.length);
    assert.ok(spread.slice(1).every((item, i) => item.id !== spread[i].id));
  }
});

test('skill map shows sample size, recency and the weakest status', () => {
  const rows = [
    ...Array.from({ length: 4 }, () => record({ item: 'treble:f4', correct: false })),
    ...Array.from({ length: 5 }, () => record({ item: 'treble:g4', position: 2, midi: 67 })),
    record({ item: 'treble:a5', position: 10, octave: 5, midi: 81 }),
  ];
  const map = buildSkillMap(rows, { module: 'reading' }, item => `octave-${item.octave}`, NOW);
  const octave4 = map.find(group => group.key === 'octave-4');
  const octave5 = map.find(group => group.key === 'octave-5');
  assert.equal(octave4.status, 'needs-work');
  assert.equal(octave4.attempts, 9);
  assert.equal(octave5.status, 'insufficient');
  assert.ok(octave5.lastSeen);
});

test('lesson application needs unaided evidence after the check was passed', () => {
  const criterion = { filter: { module: 'reading', clef: 'bass' }, minAttempts: 4, minAccuracy: 0.75 };
  const checkedAt = minutesAgo(30);
  const before = Array.from({ length: 6 }, () => record({ clef: 'bass', at: minutesAgo(40) }));
  assert.equal(practiceApplication(before, criterion, checkedAt, NOW).applied, false);
  const assisted = Array.from({ length: 6 }, () => record({ clef: 'bass', assisted: true, at: minutesAgo(5) }));
  assert.equal(practiceApplication(assisted, criterion, checkedAt, NOW).applied, false);
  const after = [record({ clef: 'bass', correct: false, at: minutesAgo(9) }), ...Array.from({ length: 4 }, () => record({ clef: 'bass', at: minutesAgo(5) }))];
  assert.deepEqual(practiceApplication(after, criterion, checkedAt, NOW), { applied: true, attempts: 5, correct: 4, required: 4 });
  assert.equal(practiceApplication(after, criterion, 'unknown', NOW).applied, false);
});

test('clearing removes only the chosen module; an empty filter clears everything', () => {
  const rows = [record({ id: 'a' }), record({ id: 'b', module: 'guitar', item: 'guitar:1-0' })];
  assert.deepEqual(clearEvidence(rows, { module: 'reading' }, NOW).map(row => row.id), ['b']);
  assert.deepEqual(clearEvidence(rows, {}, NOW), []);
});

test('period comparison only reports a change when both windows have enough unaided answers', async () => {
  const { compareWindows } = await import('../lib/practice-evidence.mjs');
  const day = 86400000;
  const at = daysAgo => new Date(NOW - daysAgo * day).toISOString();
  const older = Array.from({ length: 10 }, (_, i) => record({ correct: i < 6, at: at(20) }));
  const newer = Array.from({ length: 10 }, (_, i) => record({ correct: i < 9, at: at(2) }));
  const result = compareWindows([...older, ...newer], { module: 'reading' }, {}, NOW);
  assert.equal(result.previous.accuracy, 60);
  assert.equal(result.recent.accuracy, 90);
  assert.equal(result.change, 30);
  const thin = compareWindows([...older.slice(0, 4), ...newer], { module: 'reading' }, {}, NOW);
  assert.equal(thin.comparable, false);
  assert.equal(thin.change, null);
  const assisted = compareWindows([...older, ...newer.map(row => ({ ...row, id: `${row.id}-a`, assisted: true }))], { module: 'reading' }, {}, NOW);
  assert.equal(assisted.recent.attempts, 0);
});
