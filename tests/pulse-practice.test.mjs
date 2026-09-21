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
