import test from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress, lastSession, planNext, readGoal, validGoal, writeGoal, DEFAULT_GOAL } from '../lib/practice-plan.mjs';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const row = (i, { item = 'treble:e4', correct = true, session = 's1', hoursAgo = 1, module = 'reading', clef = 'treble' } = {}) => ({
  id: `${session}-${i}`, module, task: 'staff-name', item, session, clef, midi: 64, position: 0, accidental: 0,
  correct, firstAttempt: true, assisted: false, timedOut: false, responseMs: 2000, timeLimitMs: null,
  at: new Date(NOW - hoursAgo * 3600000 + i * 1000).toISOString(),
});

test('goals are validated, stored and read back; anything else is rejected', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readGoal(storage), null);
  const goal = { focus: 'instrument', area: 'guitar', dailyQuestions: 40, weeklyDays: 3 };
  assert.deepEqual(writeGoal(goal, storage), goal);
  assert.deepEqual(readGoal(storage), goal);
  for (const bad of [null, {}, { ...goal, focus: 'x' }, { ...goal, dailyQuestions: 15 }, { ...goal, weeklyDays: 0 }, { ...goal, area: '../' }]) assert.equal(validGoal(bad), null);
  assert.throws(() => writeGoal({ focus: 'x' }, storage), RangeError);
  store.set('notanota-goal-v1', '{bad json');
  assert.equal(readGoal(storage), null);
});

test('progress counts measured answers today and active days this week', () => {
  const rows = [row(0, { hoursAgo: 1 }), row(1, { hoursAgo: 1 }), row(2, { hoursAgo: 30, session: 's0' }), row(3, { hoursAgo: 24 * 10, session: 'old' })];
  const p = goalProgress(rows, { ...DEFAULT_GOAL, dailyQuestions: 10, weeklyDays: 3 }, NOW, 0);
  assert.equal(p.answeredToday, 2);
  assert.equal(p.dailyDone, false);
  assert.equal(p.activeDays, 2);
});

test('the last session is summarised from its own rows', () => {
  const rows = [row(0, { session: 'a', hoursAgo: 5 }), row(1, { session: 'b', correct: false }), row(2, { session: 'b' })];
  const last = lastSession(rows, NOW);
  assert.equal(last.session, 'b');
  assert.equal(last.answers, 2);
  assert.equal(last.accuracy, 0.5);
  assert.equal(last.averageMs, 2000);
  assert.equal(lastSession([], NOW), null);
});

test('the next exercise follows measured weakness first, then the student goal', () => {
  const weak = [0, 1, 2, 3].map(i => row(i, { item: 'bass:g2', clef: 'bass', correct: i === 0 }));
  const plan = planNext(weak, null, 'tr', NOW);
  assert.equal(plan.kind, 'targeted-reading');
  assert.equal(plan.clef, 'bass');
  assert.equal(plan.weakCount, 1);
  assert.equal(planNext([], { ...DEFAULT_GOAL, focus: 'theory', area: 'lessons' }, 'en', NOW).stage, 'lessons');
  assert.equal(planNext([], { ...DEFAULT_GOAL, focus: 'instrument', area: 'piano' }, 'en', NOW).stage, 'piano');
  const strong = [0, 1, 2, 3, 4, 5].map(i => row(i, { item: `treble:n${i}` }));
  assert.equal(planNext(strong, null, 'tr', NOW).kind, 'step-up');
  assert.match(planNext(strong, null, 'tr', NOW).reason, /6 cevabın %100/);
});
