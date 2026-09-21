import { LEARNING_LESSONS, validCompletedLessons } from './learning-path.mjs';

export const REVIEW_KEY = 'notanota-lesson-reviews-v1';
const DAY = 86400000;
const intervals = [1, 3, 7, 14];
const known = id => LEARNING_LESSONS.some(lesson => lesson.id === id);

// A simple practice schedule, not a measurement of mastery or memory retention.
export function validReviews(value, now = Date.now()) {
  if (!Array.isArray(value)) return [];
  const latest = new Map();
  for (const row of value) {
    if (!row || !known(row.lessonId) || typeof row.reviewedAt !== 'string' || typeof row.dueAt !== 'string'
      || !Number.isInteger(row.streak) || row.streak < 0 || row.streak > 4 || typeof row.assisted !== 'boolean') continue;
    const reviewed = Date.parse(row.reviewedAt), due = Date.parse(row.dueAt);
    if (!Number.isFinite(reviewed) || !Number.isFinite(due) || reviewed > now || due <= reviewed || due > reviewed + 14 * DAY
      || (row.assisted ? row.streak !== 0 : row.streak === 0)) continue;
    const previous = latest.get(row.lessonId);
    if (!previous || Date.parse(previous.reviewedAt) <= reviewed) latest.set(row.lessonId, {
      lessonId: row.lessonId, reviewedAt: new Date(reviewed).toISOString(), dueAt: new Date(due).toISOString(),
      streak: row.streak, assisted: row.assisted,
    });
  }
  return [...latest.values()];
}

export function recordReview(records, lessonId, assisted, now = Date.now()) {
  if (!known(lessonId) || typeof assisted !== 'boolean' || !Number.isFinite(now)) throw new RangeError('Invalid review');
  const rows = validReviews(records, now);
  const previous = rows.find(row => row.lessonId === lessonId);
  // Repeating immediately must not let the user skip ahead through the schedule.
  if (!assisted && previous && Date.parse(previous.dueAt) > now) return rows;
  const streak = assisted ? 0 : Math.min(4, (previous?.streak ?? 0) + 1);
  return [...rows.filter(row => row.lessonId !== lessonId), {
    lessonId, assisted, streak, reviewedAt: new Date(now).toISOString(),
    dueAt: new Date(now + intervals[Math.max(0, streak - 1)] * DAY).toISOString(),
  }];
}

export function buildReviewPlan(records, completedIds, now = Date.now()) {
  const rows = validReviews(records, now).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  return {
    due: rows.filter(row => Date.parse(row.dueAt) <= now),
    upcoming: rows.filter(row => Date.parse(row.dueAt) > now),
    untracked: validCompletedLessons(completedIds).filter(id => !rows.some(row => row.lessonId === id)),
  };
}
