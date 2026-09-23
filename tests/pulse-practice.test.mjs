import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePulse } from '../lib/pulse-practice.mjs';
test('exact quarter-note taps follow the selected tempo, including 15 BPM',()=>{
  for(const bpm of [15,30,60,120]){
    const result=evaluatePulse(Array.from({length:8},(_,i)=>i*60000/bpm),bpm);
    assert.equal(result.matched,8);assert.equal(result.meanAbsoluteMs,0);assert.equal(result.extras,0);
  }
});
test('missing, early and extra taps are not silently counted as success',()=>{
  const result=evaluatePulse([-900,0,10,1020,2990,15000],60);
  assert.equal(result.matched,3);assert.equal(result.missed,5);assert.equal(result.extras,3);
  assert.equal(result.meanAbsoluteMs,10);
});
test('no taps means unknown timing, not perfect accuracy',()=>{
  const result=evaluatePulse([],60);assert.equal(result.meanAbsoluteMs,null);assert.equal(result.missed,8);
});
test('average absolute error does not cancel early and late taps',()=>{
  assert.equal(evaluatePulse([-100,1100],60).meanAbsoluteMs,100);
});
test('invalid tempos and counts cannot create a malformed session',()=>{
  for(const bpm of [0,14,121,NaN,Infinity])assert.throws(()=>evaluatePulse([],bpm),RangeError);
  assert.throws(()=>evaluatePulse([],60,0),RangeError);
});

test('rhythm patterns are valid two-bar 4/4 lines with rests and subdivisions', async () => {
  const { RHYTHM_PATTERNS, patternTiming } = await import('../lib/pulse-practice.mjs');
  assert.ok(RHYTHM_PATTERNS.length >= 5);
  for (const pattern of RHYTHM_PATTERNS) {
    const timing = patternTiming(pattern);
    assert.equal(timing.beats, 8);
    assert.ok(timing.onsets.length >= 4);
    assert.ok(timing.onsets.every((onset, i) => i === 0 || onset.beat > timing.onsets[i - 1].beat));
  }
  const rests = patternTiming(RHYTHM_PATTERNS.find(p => p.id === 'eighth-rests'));
  assert.ok(rests.onsets.some(onset => onset.afterRest && onset.offBeat));
  assert.deepEqual(patternTiming(RHYTHM_PATTERNS.find(p => p.id === 'dotted')).onsets.slice(0, 3).map(o => o.beat), [0, 1.5, 2]);
});

test('pattern evaluation matches each onset once and separates rest taps from extras', async () => {
  const { RHYTHM_PATTERNS, evaluatePattern, patternTiming } = await import('../lib/pulse-practice.mjs');
  const timing = patternTiming(RHYTHM_PATTERNS.find(p => p.id === 'quarters-rests'));
  const bpm = 60;
  const perfect = timing.onsets.map(onset => onset.beat * 1000);
  const exact = evaluatePattern(perfect, bpm, timing);
  assert.equal(exact.matched, timing.onsets.length);
  assert.equal(exact.missed, 0);
  assert.equal(exact.meanAbsoluteMs, 0);

  // A tap in the first quarter rest (beat 1) and a doubled tap on beat 0.
  const noisy = evaluatePattern([0, 30, 1000, 2000], bpm, timing);
  assert.equal(noisy.restTaps, 1);
  assert.equal(noisy.extras, 1);
  assert.equal(noisy.matched, 2);

  const late = evaluatePattern(perfect.map(tap => tap + 400), bpm, timing);
  assert.equal(late.matched, 0, 'taps outside the tolerance never count');
});

test('pattern evaluation reports off-beat and after-rest entries separately', async () => {
  const { RHYTHM_PATTERNS, evaluatePattern, patternTiming } = await import('../lib/pulse-practice.mjs');
  const timing = patternTiming(RHYTHM_PATTERNS.find(p => p.id === 'eighth-rests'));
  const onBeatOnly = timing.onsets.filter(onset => !onset.offBeat).map(onset => onset.beat * 750);
  const result = evaluatePattern(onBeatOnly, 80, timing);
  assert.equal(result.onBeat.matched, result.onBeat.total);
  assert.equal(result.offBeat.matched, 0);
  assert.ok(result.afterRest.total > 0);
  assert.throws(() => evaluatePattern([], 200, timing), RangeError);
});
