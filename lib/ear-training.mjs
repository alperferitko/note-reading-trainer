/** @param {unknown} midi */
export function midiFrequency(midi) {
  if (!Number.isInteger(midi) || /** @type {number} */ (midi) < 0 || /** @type {number} */ (midi) > 127) throw new RangeError('Invalid MIDI pitch');
  return 440 * 2 ** ((/** @type {number} */ (midi) - 69) / 12);
}

/** @param {() => number} rng */
function drawer(rng) {
  /** @param {number} count */
  return count => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random value');
    return Math.floor(value * count);
  };
}

/** @returns {{first:number, second:number, answer:'higher'|'lower'|'same'}} */
export function makePitchQuestion(level = 'wide', rng = Math.random) {
  if (!['wide', 'close'].includes(level)) throw new RangeError('Invalid listening level');
  const draw = drawer(rng);
  const first = 60 + draw(13);
  const direction = draw(3) - 1;
  const steps = level === 'wide' ? [5, 7, 12] : [1, 2, 3];
  const second = first + direction * steps[draw(3)];
  return { first, second, answer: direction > 0 ? 'higher' : direction < 0 ? 'lower' : 'same' };
}

// Ascending melodic intervals, named by semitone count.
export const INTERVALS = Object.freeze({ m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, P5: 7, P8: 12 });
/** @type {Record<string, (keyof typeof INTERVALS)[]>} */
export const INTERVAL_SETS = Object.freeze({
  wide: ['M3', 'P5', 'P8'],
  thirds: ['m3', 'M3', 'P4', 'P5'],
  all: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'P8'],
});

/**
 * @param {string} set
 * @param {() => number} [rng]
 * @returns {{root:number, top:number, answer:keyof typeof INTERVALS, options:(keyof typeof INTERVALS)[]}}
 */
export function makeIntervalQuestion(set = 'wide', rng = Math.random) {
  const options = INTERVAL_SETS[set];
  if (!options) throw new RangeError('Invalid interval set');
  const draw = drawer(rng);
  const answer = options[draw(options.length)];
  // Roots from G3 to C5 keep every answer within a comfortable listening range.
  const root = 55 + draw(18);
  return { root, top: root + INTERVALS[answer], answer, options: [...options] };
}

export const CHORDS = Object.freeze({ major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8] });
/** @type {Record<string, (keyof typeof CHORDS)[]>} */
export const CHORD_SETS = Object.freeze({ basic: ['major', 'minor'], all: ['major', 'minor', 'diminished', 'augmented'] });

/**
 * @param {string} set
 * @param {() => number} [rng]
 * @returns {{root:number, notes:number[], answer:keyof typeof CHORDS, options:(keyof typeof CHORDS)[]}}
 */
export function makeChordQuestion(set = 'basic', rng = Math.random) {
  const options = CHORD_SETS[set];
  if (!options) throw new RangeError('Invalid chord set');
  const draw = drawer(rng);
  const answer = options[draw(options.length)];
  const root = 53 + draw(12);
  return { root, notes: CHORDS[answer].map(step => root + step), answer, options: [...options] };
}

const SCALE = [60, 62, 64, 65, 67, 69, 71, 72];
const SCALE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];

/**
 * A short C-major melody that starts on the given reference C4 and moves by
 * steps or thirds, so it can be written and answered with natural note names.
 * @param {number} [length]
 * @param {() => number} [rng]
 * @returns {{notes:number[], letters:string[]}}
 */
export function makeDictationQuestion(length = 3, rng = Math.random) {
  if (!Number.isInteger(length) || length < 2 || length > 6) throw new RangeError('Invalid dictation length');
  const draw = drawer(rng);
  const degrees = [0];
  while (degrees.length < length) {
    const previous = /** @type {number} */ (degrees.at(-1));
    const moves = [-2, -1, 1, 2].filter(move => previous + move >= 0 && previous + move < SCALE.length);
    degrees.push(previous + moves[draw(moves.length)]);
  }
  return { notes: degrees.map(degree => SCALE[degree]), letters: degrees.map(degree => SCALE_LETTERS[degree]) };
}

/**
 * Scores a dictation answer note by note. The given first note is not scored.
 * @param {string[]} expected
 * @param {string[]} answers
 */
export function evaluateDictation(expected, answers) {
  const scored = expected.slice(1).map((letter, index) => answers[index] === letter);
  return { correct: scored.filter(Boolean).length, total: scored.length, perNote: scored, allCorrect: scored.every(Boolean) };
}
