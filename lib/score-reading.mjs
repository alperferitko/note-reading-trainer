export const RHYTHM_VALUES = [
  { id: "whole", beats: 4 },
  { id: "half", beats: 2 },
  { id: "quarter", beats: 1 },
  { id: "eighth", beats: 0.5 },
  { id: "sixteenth", beats: 0.25 },
  { id: "triplet", beats: 1 / 3 },
];

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
