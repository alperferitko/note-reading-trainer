import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_KEY, validReviews, recordReview, buildReviewPlan } from '../lib/lesson-review.mjs';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-21T12:00:00.000Z');
const iso = time => new Date(time).toISOString();
const row = (lessonId = 'staff-basics', overrides = {}) => ({
  lessonId, reviewedAt: iso(NOW - DAY), dueAt: iso(NOW), streak: 1, assisted: false,
  ...overrides,
});

test('review storage has a separate versioned key and empty input invents nothing', () => {
  assert.equal(REVIEW_KEY, 'notanota-lesson-reviews-v1');
  for (const value of [null, undefined, {}, '[]', 1, []]) {
    assert.deepEqual(validReviews(value, NOW), []);
    assert.deepEqual(buildReviewPlan(value, [], NOW), { due: [], upcoming: [], untracked: [] });
  }
});

test('unassisted reviews advance through one, three, seven and fourteen days, then cap', () => {
  let records = [];
  let now = NOW;
  for (const [streak, days] of [[1, 1], [2, 3], [3, 7], [4, 14], [4, 14]]) {
    records = recordReview(records, 'staff-basics', false, now);
    assert.deepEqual(records, [row('staff-basics', {
      reviewedAt: iso(now), dueAt: iso(now + days * DAY), streak,
    })]);
    now += days * DAY;
  }
});

test('assisted review resets an established streak and schedules tomorrow', () => {
  const records = [row('staff-basics', { streak: 4 }), row('treble-anchors')];
  const original = structuredClone(records);
  const result = recordReview(records, 'staff-basics', true, NOW);
  assert.deepEqual(result.find(record => record.lessonId === 'staff-basics'), row('staff-basics', {
    reviewedAt: iso(NOW), dueAt: iso(NOW + DAY), streak: 0, assisted: true,
  }));
  assert.deepEqual(result.find(record => record.lessonId === 'treble-anchors'), records[1]);
  assert.deepEqual(records, original, 'recording does not mutate caller-owned records');
  const next = recordReview(result, 'staff-basics', false, NOW + DAY);
  assert.equal(next.find(record => record.lessonId === 'staff-basics').streak, 1);
  assert.equal(next.find(record => record.lessonId === 'staff-basics').dueAt, iso(NOW + 2 * DAY));
});

test('early unassisted repeats neither inflate streak nor postpone the scheduled review', () => {
  let records = [row('staff-basics', { streak: 3, dueAt: iso(NOW + 6 * DAY) })];
  for (const offset of [0, DAY, 2 * DAY]) {
    records = recordReview(records, 'staff-basics', false, NOW + offset);
    assert.equal(records.length, 1);
    assert.equal(records[0].streak, 3);
    assert.equal(records[0].dueAt, iso(NOW + 6 * DAY));
  }
  const assisted = recordReview(records, 'staff-basics', true, NOW + 2 * DAY);
  assert.equal(assisted[0].streak, 0);
  assert.equal(assisted[0].assisted, true);
  assert.equal(assisted[0].dueAt, iso(NOW + 3 * DAY));
});

test('malformed stored records are discarded instead of inflating review progress', () => {
  const good = row();
  const bad = [
    null, [], {}, 'staff-basics', row('unknown-lesson'),
    row('staff-basics', { reviewedAt: 'invalid' }),
    row('staff-basics', { dueAt: 'invalid' }),
    row('staff-basics', { reviewedAt: iso(NOW + 1) }),
    ...[-1, 5, 1.5, NaN, Infinity, '1', null].map(streak => row('staff-basics', { streak })),
    ...[undefined, null, 0, 'false'].map(assisted => row('staff-basics', { assisted })),
  ];
  assert.deepEqual(validReviews(bad, NOW), []);
  assert.deepEqual(validReviews([...bad, good], NOW), [good]);
});

test('duplicates retain the latest valid reviewedAt regardless of storage order', () => {
  const older = row('staff-basics', { reviewedAt: iso(NOW - 4 * DAY), streak: 2 });
  const latest = row('staff-basics', { reviewedAt: iso(NOW), dueAt: iso(NOW + DAY), streak: 0, assisted: true });
  const future = row('staff-basics', { reviewedAt: iso(NOW + DAY), streak: 4 });
  for (const records of [[older, latest, future], [future, latest, older]]) {
    assert.deepEqual(validReviews(records, NOW), [latest]);
  }
});

test('review plans separate due and upcoming records and sort both by earliest due date', () => {
  const dueEarlier = row('staff-basics', { reviewedAt: iso(NOW - 3 * DAY), dueAt: iso(NOW - 2 * DAY) });
  const dueNow = row('treble-anchors');
  const upcomingEarlier = row('ledger-lines', { dueAt: iso(NOW + DAY) });
  const upcomingLater = row('octaves', { dueAt: iso(NOW + 3 * DAY) });
  assert.deepEqual(buildReviewPlan([upcomingLater, dueNow, upcomingEarlier, dueEarlier], [], NOW), {
    due: [dueEarlier, dueNow], upcoming: [upcomingEarlier, upcomingLater], untracked: [],
  });
});

test('legacy completion remains untracked without an invented review date', () => {
  assert.deepEqual(buildReviewPlan([], ['staff-basics', 'unknown-lesson', 'staff-basics', 'treble-anchors'], NOW), {
    due: [], upcoming: [], untracked: ['staff-basics', 'treble-anchors'],
  });
  assert.deepEqual(buildReviewPlan([row()], ['staff-basics', 'treble-anchors'], NOW), {
    due: [row()], upcoming: [], untracked: ['treble-anchors'],
  });
});
