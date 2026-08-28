import assert from "node:assert/strict";
import test from "node:test";
import { beatDurationMs, buildRandomRhythmSequence, chooseUnrecentPiece, nextPieceHistory, RHYTHM_GROUP_SIZES, RHYTHM_VALUES } from "../lib/score-reading.mjs";

test("ritim pencereleri BPM ve nota değeriyle kesintisiz hesaplanır", () => {
  assert.equal(beatDurationMs(4, 60), 4000);
  assert.equal(beatDurationMs(1, 60), 1000);
  assert.equal(beatDurationMs(0.25, 60), 250);
  assert.equal(beatDurationMs(0.25, 120), 125);
  assert.equal(beatDurationMs(1 / 3, 60), 333);
});

test("iki sekizlik, dört on altılık ve üç sekizlik üçleme birer vuruşa eşittir", () => {
  const values = Object.fromEntries(RHYTHM_VALUES.map((rhythm) => [rhythm.id, rhythm.beats]));
  assert.equal(values.eighth * 2, values.quarter);
  assert.equal(values.sixteenth * 4, values.quarter);
  assert.equal(values.triplet * 3, values.quarter);
});

test("rastgele satırlar kısa nota değerlerini eksiksiz gruplar halinde üretir", () => {
  const deterministicValues = [0.99, 0.8, 0.6, 0.4, 0.2, 0];
  let cursor = 0;
  const sequence = buildRandomRhythmSequence(16, () => deterministicValues[cursor++ % deterministicValues.length]);
  assert.equal(sequence.length, 16);

  let index = 0;
  while (index < sequence.length) {
    const id = sequence[index];
    const size = RHYTHM_GROUP_SIZES[id];
    assert.deepEqual(sequence.slice(index, index + size), Array.from({ length: size }, () => id));
    index += size;
  }
});

test("yakın zamanda gösterilen eserler seçim havuzundan çıkarılır", () => {
  const pieces = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const selected = chooseUnrecentPiece(pieces, ["a", "b", "c"], () => 0);
  assert.equal(selected.id, "d");
  assert.deepEqual(nextPieceHistory(["a", "b", "c"], "d"), ["b", "c", "d"]);
});
