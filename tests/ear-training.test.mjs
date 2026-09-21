import assert from 'node:assert/strict';
import test from 'node:test';
import { makePitchQuestion, midiFrequency } from '../lib/ear-training.mjs';

function seededRandom(seed = 123456789) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function checkQuestion(question, offsets) {
  assert.deepEqual(Object.keys(question).sort(), ['answer', 'first', 'second']);
  assert.ok(Number.isInteger(question.first));
  assert.ok(Number.isInteger(question.second));
  assert.ok(question.first >= 60 && question.first <= 72);
  assert.ok(question.second >= 48 && question.second <= 84);
  const difference = question.second - question.first;
  assert.equal(question.answer, difference > 0 ? 'higher' : difference < 0 ? 'lower' : 'same');
  assert.ok(difference === 0 || offsets.includes(Math.abs(difference)));
}

test('pitch questions default to wide and use the supplied deterministic RNG', () => {
  const implicitRandom = seededRandom();
  const explicitRandom = seededRandom();
  for (let index = 0; index < 100; index += 1) {
    assert.deepEqual(makePitchQuestion(undefined, implicitRandom), makePitchQuestion('wide', explicitRandom));
  }
  checkQuestion(makePitchQuestion(), [5, 7, 12]);
});

for (const [level, offsets] of [['wide', [5, 7, 12]], ['close', [1, 2, 3]]]) {
  test(`${level} questions preserve pitch bounds, answer direction, and interval choices`, () => {
    const random = seededRandom();
    const firstNotes = new Set();
    const signedIntervals = new Set();
    const answers = new Set();
    for (let index = 0; index < 5000; index += 1) {
      const question = makePitchQuestion(level, random);
      checkQuestion(question, offsets);
      firstNotes.add(question.first);
      signedIntervals.add(question.second - question.first);
      answers.add(question.answer);
    }
    assert.deepEqual([...firstNotes].sort((a, b) => a - b), Array.from({ length: 13 }, (_, index) => 60 + index));
    assert.deepEqual([...answers].sort(), ['higher', 'lower', 'same']);
    assert.deepEqual([...signedIntervals].sort((a, b) => a - b), [...offsets.map((offset) => -offset), 0, ...offsets].sort((a, b) => a - b));
  });

  test(`${level} direction selection gives all three answers equal RNG space`, () => {
    const counts = { higher: 0, lower: 0, same: 0 };
    for (let index = 0; index < 300; index += 1) {
      const question = makePitchQuestion(level, () => (index + 0.5) / 300);
      checkQuestion(question, offsets);
      counts[question.answer] += 1;
    }
    assert.deepEqual(counts, { higher: 100, lower: 100, same: 100 });
    checkQuestion(makePitchQuestion(level, () => 0), offsets);
    checkQuestion(makePitchQuestion(level, () => 1 - Number.EPSILON), offsets);
  });
}

test('unknown pitch-question levels are rejected', () => {
  for (const level of ['easy', 'WIDE', '', null, 0, {}, []]) {
    assert.throws(() => makePitchQuestion(level, () => 0.5), RangeError);
  }
});

test('MIDI frequencies use equal temperament and A4 = 440 Hz', () => {
  assert.equal(midiFrequency(69), 440);
  assert.equal(midiFrequency(57), 220);
  assert.equal(midiFrequency(81), 880);
  for (let midi = 0; midi <= 127; midi += 1) {
    assert.equal(midiFrequency(midi), 440 * 2 ** ((midi - 69) / 12));
    if (midi > 0) assert.ok(midiFrequency(midi) > midiFrequency(midi - 1));
  }
});

test('MIDI frequencies reject values outside the finite integer MIDI domain', () => {
  for (const midi of [-1, 128, 60.5, NaN, Infinity, -Infinity, '69', null, undefined, true, {}, []]) {
    assert.throws(() => midiFrequency(midi), RangeError);
  }
});
