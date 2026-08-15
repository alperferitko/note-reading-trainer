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

export function generateRandomScoreLine(notes, length = 14, random = Math.random) {
  if (!notes.length || length <= 0) return [];
  const result = [];

  while (result.length < length) {
    const pickedRhythm = RHYTHM_VALUES[Math.floor(random() * RHYTHM_VALUES.length)] ?? RHYTHM_VALUES[2];
    const remaining = length - result.length;
    const rhythm = pickedRhythm.id === "triplet" && remaining < 3 ? RHYTHM_VALUES[2] : pickedRhythm;
    const groupLength = rhythm.id === "triplet" ? 3 : 1;

    for (let groupIndex = 0; groupIndex < groupLength; groupIndex += 1) {
      const previous = result.at(-1)?.note;
      const candidates = notes.filter((note) => note.id !== previous?.id);
      const pool = candidates.length ? candidates : notes;
      const note = pool[Math.floor(random() * pool.length)] ?? pool[0];
      const index = result.length;
      result.push({ key: `${index}-${note.id}-${rhythm.id}`, note, rhythm, tripletIndex: rhythm.id === "triplet" ? groupIndex : undefined });
    }
  }

  return result;
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
