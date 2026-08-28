import { RHYTHM_VALUES } from "./rhythm-presets.mjs";

export { RHYTHM_VALUES, groupRhythmValues } from "./rhythm-presets.mjs";

export const RHYTHM_GROUP_SIZES = Object.freeze({
  whole: 1,
  half: 1,
  quarter: 1,
  eighth: 2,
  sixteenth: 4,
  triplet: 3,
});

export function buildRandomRhythmSequence(targetCount = 16, random = Math.random) {
  const sequence = [];
  while (sequence.length < targetCount) {
    const remaining = targetCount - sequence.length;
    const choices = RHYTHM_VALUES.filter((rhythm) => RHYTHM_GROUP_SIZES[rhythm.id] <= remaining);
    const rhythm = choices[Math.floor(random() * choices.length)] ?? choices[0];
    if (!rhythm) break;
    sequence.push(...Array.from({ length: RHYTHM_GROUP_SIZES[rhythm.id] }, () => rhythm.id));
  }
  return sequence;
}

export function beatDurationMs(beats, bpm) {
  return Math.round((60_000 / bpm) * beats);
}

export function chooseUnrecentPiece(pieces, recentIds = [], random = Math.random) {
  if (!pieces.length) return null;
  const recent = new Set(recentIds);
  const fresh = pieces.filter((piece) => !recent.has(piece.id));
  const pool = fresh.length ? fresh : pieces.filter((piece) => piece.id !== recentIds.at(-1));
  const choices = pool.length ? pool : pieces;
  return choices[Math.floor(random() * choices.length)] ?? choices[0];
}

export function nextPieceHistory(recentIds, pieceId, limit = 3) {
  return [...recentIds.filter((id) => id !== pieceId), pieceId].slice(-limit);
}
