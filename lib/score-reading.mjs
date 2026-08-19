export { RHYTHM_VALUES, groupRhythmValues } from "./rhythm-presets.mjs";

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
