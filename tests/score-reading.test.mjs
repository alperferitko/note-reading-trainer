import assert from "node:assert/strict";
import test from "node:test";
import { beatDurationMs, chooseUnrecentPiece, nextPieceHistory, RHYTHM_VALUES } from "../lib/score-reading.mjs";

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

test("yakın zamanda gösterilen eserler seçim havuzundan çıkarılır", () => {
  const pieces = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const selected = chooseUnrecentPiece(pieces, ["a", "b", "c"], () => 0);
  assert.equal(selected.id, "d");
  assert.deepEqual(nextPieceHistory(["a", "b", "c"], "d"), ["b", "c", "d"]);
});
