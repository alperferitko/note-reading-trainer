import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_LESSONS, QUESTIONS_PER_CHECK, drawCheck, lessonStatus, markLessonState, recommendFromEvidence, recommendLesson,
  summarizeLearning, validCompletedLessons, validLearningHistory, validLessonStates,
} from '../lib/learning-path.mjs';
const row = (id, module='Nota okuma', correct=5, wrong=5) => ({id,module,correct,wrong,milliseconds:60000,date:'2026-09-20T10:00:00Z'});
const NOW = Date.parse('2026-09-24T12:00:00Z');
let serial = 0;
const evidence = (overrides = {}) => ({
  id: `e${serial++}`, module: 'reading', task: 'staff-name', item: 'treble:f4', session: 's', clef: 'treble', position: 1,
  accidental: 0, midi: 65, correct: true, firstAttempt: true, assisted: false, timedOut: false, responseMs: 900,
  timeLimitMs: null, at: new Date(NOW - 60000).toISOString(), ...overrides,
});
function seeded(seed = 11) {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}

test('curated lessons have unique IDs, bilingual content and alternative knowledge checks', () => {
  const ids = LEARNING_LESSONS.map(l => l.id);
  assert.ok(LEARNING_LESSONS.length >= 24);
  assert.equal(new Set(ids).size, ids.length);
  for(const lesson of LEARNING_LESSONS) {
    assert.ok(lesson.minutes>0);
    for(const lang of ['tr','en']) for(const key of ['title','goal','explanation','tip','measures']) assert.ok(lesson[key][lang].length>10, `${lesson.id}.${key}`);
    assert.ok(lesson.questions.length>=4, `${lesson.id} needs an alternative question pool`);
    assert.equal(new Set(lesson.questions.map(q => q.prompt.tr)).size, lesson.questions.length);
    for(const q of lesson.questions) for(const lang of ['tr','en']) {
      assert.ok(q.options[lang][q.answerIndex]); assert.equal(q.options[lang].length,3);
      assert.equal(new Set(q.options[lang]).size, 3);
      assert.ok(q.explanation[lang]);
    }
    assert.ok(['setup','pieces','guitar','piano','violin','ear'].includes(lesson.destination));
    assert.ok(lesson.application.minAttempts > 0 && lesson.application.minAccuracy > 0.5 && lesson.application.minAccuracy <= 1);
  }
});

test('prerequisites point only to earlier lessons, so the path has no cycles', () => {
  const ids = LEARNING_LESSONS.map(l => l.id);
  LEARNING_LESSONS.forEach((lesson, index) => {
    for (const id of lesson.requires) assert.ok(ids.indexOf(id) > -1 && ids.indexOf(id) < index, `${lesson.id} -> ${id}`);
  });
});

test('the curriculum covers violin, ear training and later piano and guitar steps', () => {
  const skills = new Set(LEARNING_LESSONS.map(l => l.skill));
  for (const skill of ['reading', 'rhythm', 'guitar', 'piano', 'violin', 'ear']) assert.ok(skills.has(skill), skill);
  assert.ok(LEARNING_LESSONS.filter(l => l.skill === 'violin').length >= 3);
  assert.ok(LEARNING_LESSONS.filter(l => l.skill === 'piano').length >= 3);
  assert.ok(LEARNING_LESSONS.filter(l => l.skill === 'guitar').length >= 3);
});

test('knowledge checks draw a rotating subset with shuffled options', () => {
  const lesson = LEARNING_LESSONS[0];
  const first = drawCheck(lesson, [], seeded(1));
  assert.equal(first.length, QUESTIONS_PER_CHECK);
  const second = drawCheck(lesson, first.map(q => q.index), seeded(2));
  assert.ok(second.every(q => !first.some(p => p.index === q.index)), 'next check avoids the previous pair');
  for (const q of [...first, ...second]) {
    const source = lesson.questions[q.index];
    assert.equal(q.options.tr[q.answerIndex], source.options.tr[source.answerIndex]);
    assert.equal(q.options.en[q.answerIndex], source.options.en[source.answerIndex]);
  }
  assert.throws(() => drawCheck(lesson, [], () => 1), RangeError);
});

test('first visit has no invented evidence or progress', () => {
  assert.deepEqual(recommendLesson([],[]),{lessonId:'staff-basics',reason:'start',evidenceSessions:0});
  assert.deepEqual(summarizeLearning([]),{sessions:0,correct:0,wrong:0,attempts:0,accuracy:null,minutes:0});
  assert.equal(recommendFromEvidence([], NOW), null);
});

test('one poor session cannot trigger a learning diagnosis', () => {
  assert.equal(recommendLesson([row('one','Gitar',0,20)],[]).reason,'start');
  assert.equal(recommendLesson([row('a','Gitar'),row('b','Guitar')]).lessonId,'guitar-map');
});

test('score-reading errors never masquerade as measured rhythm errors', () => {
  assert.equal(recommendLesson([row('a','Eser okuma'),row('b','Score reading')]).reason,'start');
});

test('completion is filtered and the next lesson respects prerequisites', () => {
  assert.deepEqual(validCompletedLessons(['staff-basics','fake','staff-basics']),['staff-basics']);
  assert.equal(recommendLesson([],['staff-basics']).lessonId,'treble-anchors');
  const withoutAnchors = recommendLesson([], ['staff-basics', 'pulse-tempo']).lessonId;
  assert.equal(withoutAnchors, 'treble-anchors');
  assert.equal(recommendLesson([],LEARNING_LESSONS.map(l=>l.id)).reason,'revisit');
});

test('corrupt, duplicate or negative browser history cannot inflate progress', () => {
  const rows=[row('a'),row('a'),{...row('b'),wrong:-1},{...row('c'),date:'invalid'},{...row('d'),milliseconds:-1},null];
  assert.equal(validLearningHistory(rows).length,1);
  assert.equal(summarizeLearning(rows).accuracy,50);
  assert.equal(validLearningHistory(null).length,0);
});

test('repeated broad errors justify broad review without inventing a specific confusion', () => {
  const result=recommendLesson([row('a'),row('b')]);
  assert.deepEqual(result,{lessonId:'treble-anchors',reason:'review',evidenceSessions:2});
});

test('question-level weaknesses point to the lesson that explains them', () => {
  const wrong = overrides => Array.from({ length: 3 }, () => evidence({ correct: false, ...overrides }));
  assert.equal(recommendFromEvidence(wrong({ clef: 'bass', item: 'bass:a2' }), NOW).lessonId, 'bass-clef');
  assert.equal(recommendFromEvidence(wrong({ item: 'treble:c4', position: -2 }), NOW).lessonId, 'ledger-lines');
  assert.equal(recommendFromEvidence(wrong({ item: 'treble:f4#', accidental: 1 }), NOW).lessonId, 'accidentals');
  assert.equal(recommendFromEvidence(wrong({ module: 'score', task: 'entry-after-rest', item: 'after:quarter', clef: undefined, position: undefined }), NOW).lessonId, 'rest-entries');
  assert.equal(recommendFromEvidence(wrong({ module: 'violin', task: 'locate', item: '3-1' }), NOW).lessonId, 'violin-low-high');
  assert.equal(recommendFromEvidence(wrong({ module: 'ear', task: 'chord', item: 'chord:minor', clef: undefined }), NOW).lessonId, 'triads-intro');
  assert.equal(recommendFromEvidence(wrong({ module: 'piano', task: 'locate', item: 'bass:m37', clef: 'bass', midi: 37 }), NOW).lessonId, 'piano-bass-keys');
});

test('read, checked and applied are separate lesson states', () => {
  const lesson = LEARNING_LESSONS.find(l => l.id === 'bass-clef');
  let states = markLessonState([], 'bass-clef', 'readAt', NOW - 7200000);
  assert.equal(lessonStatus(lesson, states, [], [], NOW).stage, 'read');
  states = markLessonState(states, 'bass-clef', 'checkedAt', NOW - 3600000);
  assert.equal(lessonStatus(lesson, states, ['bass-clef'], [], NOW).stage, 'checked');
  const practice = Array.from({ length: 12 }, () => evidence({ clef: 'bass', item: 'bass:b2', at: new Date(NOW - 60000).toISOString() }));
  const status = lessonStatus(lesson, states, ['bass-clef'], practice, NOW);
  assert.equal(status.stage, 'applied');
  assert.equal(status.application.attempts, 12);
  const trebleOnly = Array.from({ length: 12 }, () => evidence());
  assert.equal(lessonStatus(lesson, states, ['bass-clef'], trebleOnly, NOW).stage, 'checked');
  assert.equal(lessonStatus(lesson, [], ['bass-clef'], practice, NOW).legacyCheck, true);
  assert.deepEqual(lessonStatus(LEARNING_LESSONS.find(l => l.id === 'violin-low-high'), [], [], [], NOW).missing, ['violin-first-position']);
});

test('lesson states keep the first date and drop unknown or future rows', () => {
  const states = validLessonStates([
    { lessonId: 'staff-basics', readAt: '2026-09-20T10:00:00Z' },
    { lessonId: 'staff-basics', readAt: '2026-09-22T10:00:00Z', checkedAt: '2026-09-22T10:05:00Z' },
    { lessonId: 'fake', readAt: '2026-09-20T10:00:00Z' },
    { lessonId: 'octaves', readAt: '2030-01-01T00:00:00Z' },
    null,
  ], NOW);
  assert.deepEqual(states, [{ lessonId: 'staff-basics', readAt: '2026-09-20T10:00:00.000Z', checkedAt: '2026-09-22T10:05:00.000Z' }]);
  assert.throws(() => markLessonState([], 'fake', 'readAt', NOW), RangeError);
});
