import { findWeakItems, validEvidence } from './practice-evidence.mjs';

/** Student goal, kept on this device. No new table: accounts keep using streak and leaderboard. */
export const GOAL_KEY = 'notanota-goal-v1';
export const GOAL_FOCI = Object.freeze(['reading', 'theory', 'instrument', 'pieces', 'habit']);
export const GOAL_AREAS = Object.freeze(['reading', 'pieces', 'piano', 'guitar', 'violin', 'lessons']);
export const DAILY_TARGETS = Object.freeze([10, 20, 40]);
export const WEEKLY_TARGETS = Object.freeze([3, 5, 7]);
export const DEFAULT_GOAL = Object.freeze({ focus: 'reading', area: 'reading', dailyQuestions: 20, weeklyDays: 5 });

/** @param {unknown} value */
export function validGoal(value) {
  if (!value || typeof value !== 'object') return null;
  const goal = /** @type {Record<string, unknown>} */ (value);
  if (!GOAL_FOCI.includes(/** @type {string} */ (goal.focus))) return null;
  if (!GOAL_AREAS.includes(/** @type {string} */ (goal.area))) return null;
  if (!DAILY_TARGETS.includes(/** @type {number} */ (goal.dailyQuestions))) return null;
  if (!WEEKLY_TARGETS.includes(/** @type {number} */ (goal.weeklyDays))) return null;
  return { focus: goal.focus, area: goal.area, dailyQuestions: goal.dailyQuestions, weeklyDays: goal.weeklyDays };
}

export function readGoal(storage = globalThis.localStorage) {
  try { return validGoal(JSON.parse(storage?.getItem(GOAL_KEY) ?? 'null')); } catch { return null; }
}

export function writeGoal(goal, storage = globalThis.localStorage) {
  const valid = validGoal(goal);
  if (!valid) throw new RangeError('Invalid goal');
  try { storage?.setItem(GOAL_KEY, JSON.stringify(valid)); } catch { /* The goal still applies for this visit. */ }
  return valid;
}

const dayKey = (iso, offsetMinutes) => {
  const date = new Date(Date.parse(iso) - offsetMinutes * 60000);
  return date.toISOString().slice(0, 10);
};

/** Measured practice volume against the goal. Counts answers, never minutes it cannot see. */
export function goalProgress(records, goal, now = Date.now(), offsetMinutes = new Date(now).getTimezoneOffset()) {
  const rows = validEvidence(records, now);
  const today = dayKey(new Date(now).toISOString(), offsetMinutes);
  const answeredToday = rows.filter(row => dayKey(row.at, offsetMinutes) === today).length;
  const weekAgo = now - 6 * 86400000;
  const activeDays = new Set(rows.filter(row => Date.parse(row.at) >= weekAgo - 86400000 && Date.parse(row.at) <= now)
    .map(row => dayKey(row.at, offsetMinutes)).filter(day => day >= dayKey(new Date(weekAgo).toISOString(), offsetMinutes)));
  const target = goal ?? DEFAULT_GOAL;
  return {
    answeredToday,
    dailyTarget: target.dailyQuestions,
    dailyDone: answeredToday >= target.dailyQuestions,
    activeDays: activeDays.size,
    weeklyTarget: target.weeklyDays,
  };
}

/** The latest session in the evidence, summarised from its own rows only. */
export function lastSession(records, now = Date.now()) {
  const rows = validEvidence(records, now);
  if (!rows.length) return null;
  const latest = rows.reduce((a, b) => (Date.parse(a.at) >= Date.parse(b.at) ? a : b));
  const own = rows.filter(row => row.session === latest.session);
  const correct = own.filter(row => row.correct).length;
  const timed = own.filter(row => typeof row.responseMs === 'number');
  return {
    session: latest.session,
    module: latest.module,
    clef: latest.clef ?? null,
    at: latest.at,
    answers: own.length,
    correct,
    accuracy: own.length ? correct / own.length : 0,
    averageMs: timed.length ? Math.round(timed.reduce((sum, row) => sum + row.responseMs, 0) / timed.length) : null,
  };
}

const AREA_STAGE = { reading: 'setup', pieces: 'pieces', piano: 'piano', guitar: 'guitar', violin: 'violin', lessons: 'lessons' };

/**
 * One concrete next exercise. Every reason names something measured in the evidence or the
 * student's own goal; nothing is inferred about playing that was not recorded.
 */
export function planNext(records, goal, locale = 'tr', now = Date.now()) {
  const tr = locale === 'tr';
  const rows = validEvidence(records, now);
  const target = goal ?? DEFAULT_GOAL;
  const weak = findWeakItems(rows, { module: 'reading' }, now);
  if (weak.length) {
    const clefs = new Set(weak.map(item => item.clef));
    return {
      kind: 'targeted-reading', stage: 'setup', weakCount: weak.length,
      clef: clefs.size === 1 ? [...clefs][0] : null,
      title: tr ? `Zorlandığın ${weak.length} notayı tekrarla` : `Review the ${weak.length} notes you missed`,
      reason: tr ? 'Son denemelerinde bu notalarda hata oranı yüksekti. Kısa bir tur onları normal notaların arasına karıştırır.'
        : 'Your recent attempts on these notes had a high error rate. A short round mixes them in with other notes.',
    };
  }
  const last = lastSession(rows, now);
  if (!last) {
    if (target.focus === 'theory' || target.area === 'lessons') return {
      kind: 'lesson', stage: 'lessons', weakCount: 0, clef: null,
      title: tr ? 'İlk dersle başla' : 'Start with the first lesson',
      reason: tr ? 'Henüz çalışma kaydın yok. Porte ve anahtar dersi üç dakika sürer.' : 'No practice recorded yet. The staff and clef lesson takes three minutes.',
    };
    return {
      kind: 'area', stage: AREA_STAGE[target.area] ?? 'setup', weakCount: 0, clef: null,
      title: tr ? 'İlk turunu yap' : 'Do your first round',
      reason: tr ? 'Henüz çalışma kaydın yok. İlk tur, neye ihtiyacın olduğunu ölçmemizi sağlar.' : 'No practice recorded yet. A first round measures what you need.',
    };
  }
  if (last.module === 'reading' && last.answers >= 5 && last.accuracy >= 0.9) return {
    kind: 'step-up', stage: 'setup', weakCount: 0, clef: last.clef,
    title: tr ? 'Bir sonraki aralığa geç' : 'Move to the next range',
    reason: tr ? `Son turda ${last.answers} cevabın %${Math.round(last.accuracy * 100)} kadarı doğruydu. Ek çizgili notalar bir sonraki adım.`
      : `Your last round was ${Math.round(last.accuracy * 100)}% correct over ${last.answers} answers. Ledger-line notes are the next step.`,
  };
  return {
    kind: 'area', stage: AREA_STAGE[target.area] ?? 'setup', weakCount: 0, clef: last.clef,
    title: tr ? 'Hedefindeki çalışmaya devam et' : 'Continue toward your goal',
    reason: tr ? 'Belirgin bir zayıf notan görünmüyor. Seçtiğin alanda bir tur daha kanıt toplar.' : 'No clear weak note shows up. Another round in your chosen area adds evidence.',
  };
}
