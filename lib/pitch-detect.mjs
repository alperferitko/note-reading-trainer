import { namesLocale } from './music-pitch.mjs';
// Pure helpers for single-note microphone practice. Audio never leaves the browser.
// A pitch only counts when it is clear, loud enough and stable for several frames;
// anything else is reported as uncertain instead of being forced into right or wrong.

export const A4 = 440;
export const DEFAULT_THRESHOLDS = Object.freeze({
  minClarity: 0.9,      // pitchy clarity, 0..1
  minRms: 0.01,         // signal level above the room's noise floor
  stableFrames: 4,      // consecutive frames on the same semitone
  maxCents: 35,         // how far from the semitone centre a frame may be
  minHz: 60,
  maxHz: 2100,
});

/** Written-to-sounding offset in semitones. Guitar sounds an octave lower than written. */
export const INSTRUMENT_TRANSPOSE = Object.freeze({ piano: 0, violin: 0, guitar: -12, voice: 0 });

/** @param {number} hz */
export function frequencyToMidi(hz) {
  if (!(hz > 0) || !Number.isFinite(hz)) return null;
  return 69 + 12 * Math.log2(hz / A4);
}

/** @param {number} midi */
export function midiToFrequency(midi) {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

/** Nearest semitone and the distance from it in cents. */
export function nearestNote(hz) {
  const exact = frequencyToMidi(hz);
  if (exact === null) return null;
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
}

const NAMES = { tr: ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'], en: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] };
/** @param {number} midi @param {'tr'|'en'} [locale] */
export function midiLabel(midi, locale = 'tr') {
  return `${NAMES[namesLocale(locale)][((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Classifies one analysed frame.
 * @param {{hz:number, clarity:number, rms:number}} frame
 */
export function readFrame(frame, thresholds = DEFAULT_THRESHOLDS) {
  if (!frame || !(frame.rms >= thresholds.minRms)) return { kind: 'silence' };
  if (!(frame.clarity >= thresholds.minClarity) || !(frame.hz >= thresholds.minHz && frame.hz <= thresholds.maxHz)) return { kind: 'unclear' };
  const note = nearestNote(frame.hz);
  if (!note || Math.abs(note.cents) > thresholds.maxCents) return { kind: 'unclear' };
  return { kind: 'pitch', midi: note.midi, cents: note.cents };
}

/**
 * Accumulates frames and reports a pitch once it has been stable. Silence resets the run,
 * so one held note produces one decision.
 */
export function createStabilizer(thresholds = DEFAULT_THRESHOLDS) {
  let current = null; let run = 0; let decided = false; let cents = [];
  return {
    /** @param {{hz:number, clarity:number, rms:number}} frame */
    push(frame) {
      const read = readFrame(frame, thresholds);
      if (read.kind === 'silence') { current = null; run = 0; decided = false; cents = []; return { state: 'silence' }; }
      if (read.kind === 'unclear') { run = 0; cents = []; return { state: 'unclear' }; }
      if (read.midi !== current) { current = read.midi; run = 0; decided = false; cents = []; }
      run++; cents.push(read.cents);
      if (!decided && run >= thresholds.stableFrames) {
        decided = true;
        return { state: 'stable', midi: current, cents: Math.round(cents.reduce((a, b) => a + b, 0) / cents.length) };
      }
      return { state: decided ? 'held' : 'settling', midi: current };
    },
    reset() { current = null; run = 0; decided = false; cents = []; },
  };
}

/**
 * Compares a stable sounding pitch with the written note.
 * Octave errors are wrong answers, but they are named, because they are common on guitar.
 */
export function judgePitch(heardMidi, writtenMidi, instrument = 'piano') {
  const expected = writtenMidi + (INSTRUMENT_TRANSPOSE[instrument] ?? 0);
  if (heardMidi === expected) return { result: 'correct', expected };
  const octaveOff = (heardMidi - expected) % 12 === 0;
  return { result: 'wrong', expected, octaveOff };
}

/** Root-mean-square level of one buffer. */
export function rms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return buffer.length ? Math.sqrt(sum / buffer.length) : 0;
}

/** Summary of a microphone session. Only pitch is measured; rhythm and tone are not. */
export function summarizeMic(results) {
  const decided = results.filter(r => r.result === 'correct' || r.result === 'wrong');
  const correct = results.filter(r => r.result === 'correct').length;
  const wrong = results.filter(r => r.result === 'wrong').length;
  const skipped = results.filter(r => r.result === 'skipped').length;
  const times = results.filter(r => r.result === 'correct' && Number.isFinite(r.responseMs)).map(r => r.responseMs);
  return {
    asked: results.length, correct, wrong, skipped,
    pitchAccuracy: decided.length ? correct / decided.length : null,
    averageMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    octaveErrors: results.filter(r => r.result === 'wrong' && r.octaveOff).length,
    measured: ['pitch'],
    notMeasured: ['rhythm', 'dynamics', 'tone'],
  };
}
