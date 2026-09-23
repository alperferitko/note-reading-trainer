import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READING_STUDIES, RHYTHM_TICKS, keySignatureAccidental, keySignaturePositions, letterAt, measureTicks, nextStudy, parseStudy,
} from '../lib/reading-studies.mjs';

test('every study has bilingual guidance, a known clef and a graded prerequisite chain', () => {
  const ids = READING_STUDIES.map(study => study.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(READING_STUDIES.length >= 10);
  READING_STUDIES.forEach((study, index) => {
    for (const lang of ['tr', 'en']) {
      assert.ok(study.title[lang]);
      assert.ok(study.focus[lang].length > 10);
      assert.ok(study.tip[lang].length > 40);
    }
    assert.ok(['treble', 'bass'].includes(study.clef));
    assert.equal(study.level, index + 1);
    for (const id of study.requires) assert.ok(ids.indexOf(id) > -1 && ids.indexOf(id) < index, `${study.id} requires an earlier study`);
  });
});

test('every measure is filled exactly by its notes and rests', () => {
  for (const study of READING_STUDIES) {
    const { events, problems } = parseStudy(study);
    assert.deepEqual(problems, [], study.id);
    const perMeasure = new Map();
    for (const event of events) perMeasure.set(event.measure, (perMeasure.get(event.measure) ?? 0) + RHYTHM_TICKS[event.rhythm]);
    for (const total of perMeasure.values()) assert.equal(total, measureTicks(study.time));
    assert.equal(perMeasure.size, study.measures.length);
    assert.ok(events.at(-1).barAfter);
  }
});

test('invalid measures and tokens are reported instead of silently accepted', () => {
  const broken = { ...READING_STUDIES[0], id: 'broken', measures: ['0q 1q 2q', '0q x 1q 2q 3q', 'r#q 1h rq', '0t 1t 2q 3h'] };
  const { problems } = parseStudy(broken);
  assert.ok(problems.some(problem => problem.includes('m1: 36 ticks instead of 48')));
  assert.ok(problems.some(problem => problem.includes('invalid token "x"')));
  assert.ok(problems.some(problem => problem.includes('rest cannot carry an accidental')));
  assert.ok(problems.some(problem => problem.includes('triplets must fill one beat')));
});

test('the sequence adds rests, meter, key signatures, accidentals and bass clef', () => {
  const parsed = Object.fromEntries(READING_STUDIES.map(study => [study.id, parseStudy(study).events]));
  assert.ok(parsed['quarter-rests'].some(event => event.type === 'rest' && event.rhythm === 'quarter'));
  assert.ok(['half', 'whole', 'eighth'].every(rhythm => parsed['mixed-rests'].some(event => event.type === 'rest' && event.rhythm === rhythm)));
  assert.deepEqual(READING_STUDIES.find(study => study.id === 'three-four').time, [3, 4]);
  assert.ok(READING_STUDIES.some(study => study.key > 0) && READING_STUDIES.some(study => study.key < 0));
  assert.ok(READING_STUDIES.some(study => study.clef === 'bass'));
  assert.ok(parsed['quarter-rests'].some(event => event.type === 'note' && event.afterRest));
});

test('key signatures and written accidentals change the expected pitch', () => {
  const g = parseStudy(READING_STUDIES.find(study => study.id === 'key-g')).events;
  for (const event of g.filter(item => item.type === 'note' && letterAt('treble', item.position) === 'F')) {
    assert.equal(event.accidental, 1);
    assert.equal(event.writtenAccidental, undefined);
  }
  const f = parseStudy(READING_STUDIES.find(study => study.id === 'key-f')).events;
  assert.ok(f.filter(item => item.position === 4).every(item => item.accidental === -1));

  const acc = parseStudy(READING_STUDIES.find(study => study.id === 'accidentals-measure')).events;
  const measure = n => acc.filter(event => event.measure === n && event.type === 'note');
  assert.deepEqual(measure(0).map(event => event.accidental), [0, 1, 0, 1], 'sharp carries to the later F in the bar');
  assert.deepEqual(measure(1).map(event => event.accidental), [0, -1, 0, -1]);
  assert.deepEqual(measure(2).map(event => event.accidental), [0, -1, 0], 'bar line resets; natural cancels');
  assert.equal(measure(2)[2].writtenAccidental, 0);
  assert.deepEqual(measure(3).map(event => event.accidental), [0, 1, 0, 1]);
});

test('key signature helpers follow the standard order and staff placement', () => {
  assert.equal(keySignatureAccidental('F', 1), 1);
  assert.equal(keySignatureAccidental('C', 1), 0);
  assert.equal(keySignatureAccidental('B', -1), -1);
  assert.equal(keySignatureAccidental('E', -2), -1);
  assert.deepEqual(keySignaturePositions('treble', 2), [8, 5]);
  assert.deepEqual(keySignaturePositions('bass', -1), [2]);
  assert.equal(letterAt('bass', 0), 'G');
  assert.equal(letterAt('treble', -2), 'C');
});

test('beams stay inside one beat and never include a rest', () => {
  for (const study of READING_STUDIES) {
    const groups = new Map();
    for (const event of parseStudy(study).events) if (event.groupId) groups.set(event.groupId, [...(groups.get(event.groupId) ?? []), event]);
    for (const members of groups.values()) {
      assert.ok(members.every(event => event.type === 'note'));
      assert.equal(new Set(members.map(event => Math.floor(event.startTick / 12))).size, 1);
      assert.equal(members.length, { eighth: 2, sixteenth: 4, triplet: 3 }[members[0].rhythm]);
    }
  }
});

test('the next study respects prerequisites', () => {
  assert.equal(nextStudy([]).id, 'steps');
  assert.equal(nextStudy(['steps']).id, 'ledger');
  assert.equal(nextStudy(['ledger']).id, 'steps');
  assert.equal(nextStudy(READING_STUDIES.map(study => study.id)), null);
});
