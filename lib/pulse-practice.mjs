/** Match each tap to at most one beat. Extra taps cannot improve a result. */
export function evaluatePulse(taps, bpm, beats = 8) {
  if (!Number.isFinite(bpm) || bpm < 15 || bpm > 120 || !Number.isInteger(beats) || beats < 1 || beats > 64) throw new RangeError('Invalid pulse settings');
  const interval = 60000 / bpm;
  const slots = new Map();
  let extras = 0;
  for (const tap of taps) {
    if (!Number.isFinite(tap)) continue;
    const index = Math.round(tap / interval);
    if (index < 0 || index >= beats || slots.has(index)) { extras++; continue; }
    slots.set(index, tap - index * interval);
  }
  const offsets = [...slots.values()];
  return {
    beats, matched: slots.size, missed: beats - slots.size, extras,
    meanAbsoluteMs: offsets.length ? Math.round(offsets.reduce((sum,x)=>sum+Math.abs(x),0)/offsets.length) : null,
    meanSignedMs: offsets.length ? Math.round(offsets.reduce((sum,x)=>sum+x,0)/offsets.length) : null,
  };
}
