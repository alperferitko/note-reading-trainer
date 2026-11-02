import test from 'node:test';
import assert from 'node:assert/strict';
import { createStabilizer, frequencyToMidi, judgePitch, midiLabel, midiToFrequency, nearestNote, readFrame, rms, summarizeMic, DEFAULT_THRESHOLDS } from '../lib/pitch-detect.mjs';

test('frequency to note conversion is exact at reference pitches and symmetric', () => {
  assert.equal(frequencyToMidi(440), 69);
  assert.equal(Math.round(frequencyToMidi(261.6256)), 60);
  assert.equal(Math.round(frequencyToMidi(82.4069)), 40);
  for (const midi of [40, 52, 60, 69, 76, 88]) assert.equal(Math.round(frequencyToMidi(midiToFrequency(midi)) * 1000) / 1000, midi);
  assert.deepEqual(nearestNote(440 * Math.pow(2, 20 / 1200)), { midi: 69, cents: 20 });
  assert.equal(frequencyToMidi(0), null);
  assert.equal(frequencyToMidi(Number.NaN), null);
  assert.equal(midiLabel(60, 'tr'), 'Do4');
  assert.equal(midiLabel(70, 'en'), 'A♯4');
});

test('quiet, unclear, out-of-range or far-from-centre frames are never a pitch', () => {
  const ok = { hz: 440, clarity: 0.97, rms: 0.05 };
  assert.equal(readFrame(ok).kind, 'pitch');
  assert.equal(readFrame({ ...ok, rms: 0.001 }).kind, 'silence');
  assert.equal(readFrame({ ...ok, clarity: 0.6 }).kind, 'unclear');
  assert.equal(readFrame({ ...ok, hz: 30 }).kind, 'unclear');
  assert.equal(readFrame({ ...ok, hz: 440 * Math.pow(2, 45 / 1200) }).kind, 'unclear');
});

test('a pitch is decided once, only after it is stable, and silence starts a new decision', () => {
  const s = createStabilizer();
  const frame = hz => ({ hz, clarity: 0.95, rms: 0.05 });
  const states = [];
  for (let i = 0; i < DEFAULT_THRESHOLDS.stableFrames + 3; i++) states.push(s.push(frame(440)).state);
  assert.equal(states.filter(state => state === 'stable').length, 1);
  assert.equal(states[DEFAULT_THRESHOLDS.stableFrames - 1], 'stable');
  assert.equal(s.push({ hz: 0, clarity: 0, rms: 0 }).state, 'silence');
  let decided = null;
  for (let i = 0; i < DEFAULT_THRESHOLDS.stableFrames; i++) decided = s.push(frame(493.88));
  assert.deepEqual([decided.state, decided.midi], ['stable', 71]);
  const flicker = createStabilizer();
  const results = [440, 466.16, 440, 466.16, 440, 466.16].map(hz => flicker.push(frame(hz)).state);
  assert.ok(!results.includes('stable'), 'alternating pitches never stabilise');
});

test('the written note is compared with the sounding pitch for each instrument', () => {
  assert.deepEqual(judgePitch(64, 64, 'piano'), { result: 'correct', expected: 64 });
  assert.equal(judgePitch(52, 64, 'guitar').result, 'correct', 'guitar sounds an octave below written');
  assert.deepEqual(judgePitch(64, 64, 'guitar'), { result: 'wrong', expected: 52, octaveOff: true });
  assert.deepEqual(judgePitch(65, 64, 'violin'), { result: 'wrong', expected: 64, octaveOff: false });
});

test('the summary reports pitch only and keeps skipped notes out of accuracy', () => {
  const summary = summarizeMic([
    { result: 'correct', responseMs: 1200 }, { result: 'correct', responseMs: 1800 }, { result: 'wrong', octaveOff: true }, { result: 'skipped' },
  ]);
  assert.equal(summary.correct, 2); assert.equal(summary.wrong, 1); assert.equal(summary.skipped, 1);
  assert.equal(Math.round(summary.pitchAccuracy * 100), 67);
  assert.equal(summary.averageMs, 1500);
  assert.equal(summary.octaveErrors, 1);
  assert.deepEqual(summary.measured, ['pitch']);
  assert.ok(summary.notMeasured.includes('rhythm'));
  assert.equal(summarizeMic([{ result: 'skipped' }]).pitchAccuracy, null);
  assert.ok(Math.abs(rms(new Float32Array([0.5, -0.5])) - 0.5) < 1e-9);
});
