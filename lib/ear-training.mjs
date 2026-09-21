export function midiFrequency(midi) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new RangeError('Invalid MIDI pitch');
  return 440 * 2 ** ((midi - 69) / 12);
}

/** @returns {{first:number, second:number, answer:'higher'|'lower'|'same'}} */
export function makePitchQuestion(level = 'wide', rng = Math.random) {
  if (!['wide', 'close'].includes(level)) throw new RangeError('Invalid listening level');
  const draw = count => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random value');
    return Math.floor(value * count);
  };
  const first = 60 + draw(13);
  const direction = draw(3) - 1;
  const steps = level === 'wide' ? [5, 7, 12] : [1, 2, 3];
  const second = first + direction * steps[draw(3)];
  return { first, second, answer: direction > 0 ? 'higher' : direction < 0 ? 'lower' : 'same' };
}
