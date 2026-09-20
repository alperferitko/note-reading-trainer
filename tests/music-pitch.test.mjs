import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchAt, pitchFromMidi, pitchName, parsePitchAnswer, matchesPitch, matchesSoundingPitch, accidentalsFor } from '../lib/music-pitch.mjs';

test('staff anchors and five-ledger-line endpoints use correct written pitches', () => {
  assert.equal(pitchAt(0).id, 'e4');
  assert.equal(pitchAt(8).id, 'f5');
  assert.equal(pitchAt(-10).id, 'b2');
  assert.equal(pitchAt(18).id, 'b6');
  assert.equal(pitchAt(0, 'bass').id, 'g2');
  assert.equal(pitchAt(8, 'bass').id, 'a3');
});

test('MIDI conversion round-trips all piano keys in either clef', () => {
  for (const clef of ['treble', 'bass']) {
    for (let midi = 21; midi <= 108; midi++) {
      const note = pitchFromMidi(midi, clef);
      assert.equal(note.midi, midi);
      assert.equal(pitchAt(note.position, clef, note.accidental).midi, midi);
    }
  }
});

test('Turkish and English accidental answers retain their written spelling', () => {
  assert.deepEqual(parsePitchAnswer('Si bemol'), { letter: 'B', accidental: -1 });
  assert.deepEqual(parsePitchAnswer('C sharp'), { letter: 'C', accidental: 1 });
  assert.deepEqual(parsePitchAnswer('Fa♯'), { letter: 'F', accidental: 1 });
  assert.equal(matchesPitch('Mi♭', pitchAt(0, 'treble', -1)), true);
  assert.equal(matchesPitch('Re♯', pitchAt(0, 'treble', -1)), false);
  assert.equal(matchesPitch('Mi', pitchAt(0, 'treble', -1)), false);
  assert.equal(parsePitchAnswer('not-a-note'), null);
  assert.equal(pitchName(pitchAt(0, 'treble', -1), 'tr', true), 'Mi♭4');
});

test('random pools include precisely the selected accidental kinds', () => {
  assert.deepEqual(accidentalsFor('natural'), [0]);
  assert.deepEqual(accidentalsFor('sharp'), [1]);
  assert.deepEqual(accidentalsFor('flat'), [-1]);
  assert.deepEqual(accidentalsFor('mixed'), [0, 1, -1]);
});

test('physical piano keys accept enharmonic names, unlike written spelling exercises', () => {
  assert.equal(matchesSoundingPitch('Do♯', 61), true);
  assert.equal(matchesSoundingPitch('Re♭', 61), true);
  assert.equal(matchesSoundingPitch('Si♯', 60), true);
  assert.equal(matchesSoundingPitch('Do', 61), false);
  assert.equal(matchesPitch('Re♭', pitchFromMidi(61)), false);
});
