import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARNING_LESSONS, recommendLesson, summarizeLearning, validCompletedLessons, validLearningHistory } from '../lib/learning-path.mjs';
const row = (id, module='Nota okuma', correct=5, wrong=5) => ({id,module,correct,wrong,milliseconds:60000,date:'2026-09-20T10:00:00Z'});
test('curated lessons have unique IDs, bilingual content and valid knowledge checks', () => {
  assert.equal(LEARNING_LESSONS.length,12);
  assert.equal(new Set(LEARNING_LESSONS.map(l=>l.id)).size,12);
  for(const lesson of LEARNING_LESSONS) {
    assert.ok(lesson.minutes>0);
    for(const lang of ['tr','en']) for(const key of ['title','goal','explanation','tip']) assert.ok(lesson[key][lang].length>10);
    assert.ok(lesson.questions.length>=2);
    for(const q of lesson.questions) for(const lang of ['tr','en']) {
      assert.ok(q.options[lang][q.answerIndex]); assert.equal(q.options[lang].length,3);
      assert.ok(q.explanation[lang]);
    }
  }
});
test('first visit has no invented evidence or progress', () => {
  assert.deepEqual(recommendLesson([],[]),{lessonId:'staff-basics',reason:'start',evidenceSessions:0});
  assert.deepEqual(summarizeLearning([]),{sessions:0,correct:0,wrong:0,attempts:0,accuracy:null,minutes:0});
});
test('one poor session cannot trigger a learning diagnosis', () => {
  assert.equal(recommendLesson([row('one','Gitar',0,20)],[]).reason,'start');
  assert.equal(recommendLesson([row('a','Gitar'),row('b','Guitar')]).lessonId,'guitar-map');
});
test('score-reading errors never masquerade as measured rhythm errors', () => {
  assert.equal(recommendLesson([row('a','Eser okuma'),row('b','Score reading')]).reason,'start');
});
test('completion is filtered and next lesson is selected', () => {
  assert.deepEqual(validCompletedLessons(['staff-basics','fake','staff-basics']),['staff-basics']);
  assert.equal(recommendLesson([],['staff-basics']).lessonId,'treble-anchors');
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
