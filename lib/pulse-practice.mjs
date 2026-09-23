import { parseStudy } from './reading-studies.mjs';

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

/**
 * Two-bar 4/4 patterns written in the reading-study notation on one staff line.
 * Each is tapped against a steady quarter-note metronome.
 */
export const RHYTHM_PATTERNS = Object.freeze([
  { id: 'quarters-rests', title: { tr: 'Dörtlük ve dörtlük sus', en: 'Quarters and quarter rests' }, measures: ['4q rq 4q rq', '4q 4q rh'] },
  { id: 'eighths', title: { tr: 'Sekizlik çiftleri', en: 'Eighth-note pairs' }, measures: ['4q 4e 4e 4q 4e 4e', '4e 4e 4q 4h'] },
  { id: 'eighth-rests', title: { tr: 'Sekizlik sustan sonra giriş', en: 'Entries after an eighth rest' }, measures: ['re 4e 4q re 4e 4q', '4q re 4e 4h'] },
  { id: 'dotted', title: { tr: 'Noktalı dörtlük', en: 'Dotted quarter' }, measures: ['4q. 4e 4q 4q', '4q. 4e 4h'] },
  { id: 'sixteenths', title: { tr: 'Onaltılık grubu', en: 'Sixteenth-note groups' }, measures: ['4s 4s 4s 4s 4q 4e 4e 4q', '4s 4s 4s 4s 4q rh'] },
]);

/**
 * Timed events of a pattern in beats. Onsets are note starts; rests are the
 * silent spans where a tap counts as an early or extra entry.
 * @param {typeof RHYTHM_PATTERNS[number]} pattern
 */
export function patternTiming(pattern) {
  const { events, problems } = parseStudy({ id: pattern.id, level: 1, requires: [], clef: 'treble', time: [4, 4], key: 0, title: pattern.title, focus: pattern.title, tip: pattern.title, measures: pattern.measures });
  if (problems.length) throw new RangeError(problems.join('; '));
  const ticks = 12;
  const measureStart = event => event.measure * 48;
  const timed = events.map(event => ({ ...event, beat: (measureStart(event) + event.startTick) / ticks, length: { whole: 4, half: 2, quarter: 1, dottedQuarter: 1.5, eighth: .5, sixteenth: .25, triplet: 1 / 3 }[event.rhythm] }));
  const onsets = timed.filter(event => event.type === 'note').map(event => ({
    beat: event.beat, offBeat: Math.abs(event.beat - Math.round(event.beat)) > 1e-9, afterRest: event.afterRest,
  }));
  const rests = timed.filter(event => event.type === 'rest').map(event => ({ start: event.beat, end: event.beat + event.length }));
  return { events: timed, onsets, rests, beats: pattern.measures.length * 4 };
}

/**
 * Compares taps with the written onsets of a pattern. Each onset can be matched
 * once; unmatched taps inside a rest are reported separately from other extras.
 * @param {number[]} taps milliseconds after the first beat
 * @param {number} bpm
 * @param {{onsets:{beat:number, offBeat:boolean, afterRest:boolean}[], rests:{start:number,end:number}[], beats:number}} timing
 */
export function evaluatePattern(taps, bpm, timing) {
  if (!Number.isFinite(bpm) || bpm < 15 || bpm > 120) throw new RangeError('Invalid pulse settings');
  const interval = 60000 / bpm;
  const gaps = timing.onsets.slice(1).map((onset, index) => onset.beat - timing.onsets[index].beat);
  const shortest = Math.min(1, ...gaps);
  // Wide enough for human timing, narrow enough that one tap cannot serve two onsets.
  const tolerance = Math.min(180, 0.45 * shortest * interval);
  const matched = new Map();
  let extras = 0;
  let restTaps = 0;
  for (const tap of [...taps].filter(Number.isFinite).sort((a, b) => a - b)) {
    let best = -1;
    let bestDistance = Infinity;
    timing.onsets.forEach((onset, index) => {
      const distance = Math.abs(tap - onset.beat * interval);
      if (!matched.has(index) && distance < bestDistance) { best = index; bestDistance = distance; }
    });
    if (best >= 0 && bestDistance <= tolerance) { matched.set(best, tap - timing.onsets[best].beat * interval); continue; }
    const beat = tap / interval;
    if (timing.rests.some(rest => beat >= rest.start && beat < rest.end)) restTaps++;
    else extras++;
  }
  const offsets = [...matched.values()];
  const group = predicate => {
    const indexes = timing.onsets.map((onset, index) => predicate(onset) ? index : -1).filter(index => index >= 0);
    return { matched: indexes.filter(index => matched.has(index)).length, total: indexes.length };
  };
  return {
    onsets: timing.onsets.length, matched: matched.size, missed: timing.onsets.length - matched.size, extras, restTaps,
    toleranceMs: Math.round(tolerance),
    meanAbsoluteMs: offsets.length ? Math.round(offsets.reduce((sum, x) => sum + Math.abs(x), 0) / offsets.length) : null,
    meanSignedMs: offsets.length ? Math.round(offsets.reduce((sum, x) => sum + x, 0) / offsets.length) : null,
    onBeat: group(onset => !onset.offBeat), offBeat: group(onset => onset.offBeat), afterRest: group(onset => onset.afterRest),
  };
}
