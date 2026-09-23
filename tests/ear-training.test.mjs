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

test('interval questions name the heard semitone distance and stay in range', async () => {
  const { INTERVALS, INTERVAL_SETS, makeIntervalQuestion } = await import('../lib/ear-training.mjs');
  const random = seededRandom(9);
  for (const set of Object.keys(INTERVAL_SETS)) {
    const seen = new Set();
    for (let index = 0; index < 2000; index += 1) {
      const question = makeIntervalQuestion(set, random);
      assert.equal(question.top - question.root, INTERVALS[question.answer]);
      assert.ok(question.options.includes(question.answer));
      assert.ok(question.root >= 55 && question.top <= 84);
      seen.add(question.answer);
    }
    assert.deepEqual([...seen].sort(), [...INTERVAL_SETS[set]].sort(), `${set} reaches every option`);
  }
  assert.throws(() => makeIntervalQuestion('huge', random), RangeError);
});

test('chord questions build the named triad above the root', async () => {
  const { CHORDS, CHORD_SETS, makeChordQuestion } = await import('../lib/ear-training.mjs');
  assert.deepEqual(CHORDS.major, [0, 4, 7]);
  assert.deepEqual(CHORDS.minor, [0, 3, 7]);
  assert.deepEqual(CHORDS.diminished, [0, 3, 6]);
  assert.deepEqual(CHORDS.augmented, [0, 4, 8]);
  const random = seededRandom(4);
  const seen = new Set();
  for (let index = 0; index < 1000; index += 1) {
    const question = makeChordQuestion('all', random);
    assert.deepEqual(question.notes.map(note => note - question.root), CHORDS[question.answer]);
    assert.ok(question.notes.every(note => note >= 53 && note <= 72));
    seen.add(question.answer);
  }
  assert.deepEqual([...seen].sort(), [...CHORD_SETS.all].sort());
  assert.throws(() => makeChordQuestion('jazz', random), RangeError);
});

test('dictation melodies start on the reference C4 and move by small steps', async () => {
  const { evaluateDictation, makeDictationQuestion } = await import('../lib/ear-training.mjs');
  const random = seededRandom(21);
  for (let index = 0; index < 500; index += 1) {
    const { notes, letters } = makeDictationQuestion(4, random);
    assert.equal(notes.length, 4);
    assert.equal(notes[0], 60);
    assert.equal(letters[0], 'C');
    assert.ok(notes.every(note => note >= 60 && note <= 72));
    assert.ok(notes.slice(1).every((note, i) => Math.abs(note - notes[i]) <= 4 && note !== notes[i]));
  }
  assert.deepEqual(evaluateDictation(['C', 'D', 'E'], ['D', 'E']), { correct: 2, total: 2, perNote: [true, true], allCorrect: true });
  assert.deepEqual(evaluateDictation(['C', 'D', 'E'], ['D', 'F']), { correct: 1, total: 2, perNote: [true, false], allCorrect: false });
  assert.throws(() => makeDictationQuestion(1, random), RangeError);
});
