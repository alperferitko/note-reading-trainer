import assert from "node:assert/strict";
import test from "node:test";
import { beatDurationMs, chooseUnrecentPiece, generateRandomScoreLine, nextPieceHistory } from "../lib/score-reading.mjs";

test("ritim pencereleri BPM ve nota değeriyle kesintisiz hesaplanır", () => {
  assert.equal(beatDurationMs(4, 60), 4000);
  assert.equal(beatDurationMs(1, 60), 1000);
  assert.equal(beatDurationMs(0.25, 60), 250);
  assert.equal(beatDurationMs(0.25, 120), 125);
});

test("rastgele porte satırı ardışık aynı notayı üretmez ve bütün ritim değerlerini kullanabilir", () => {
  const notes = [
    { id: "c4", position: -2 },
    { id: "d4", position: -1 },
    { id: "e4", position: 0 },
  ];
  const randomValues = [0, 0, 0.4, 0.25, 0.8, 0.5, 0.1, 0.75];
  let index = 0;
  const line = generateRandomScoreLine(notes, 8, () => randomValues[index++ % randomValues.length]);
  assert.equal(line.length, 8);
  for (let item = 1; item < line.length; item += 1) assert.notEqual(line[item].note.id, line[item - 1].note.id);
  assert.ok(line.every((event) => event.rhythm.beats >= 0.25 && event.rhythm.beats <= 4));
});

test("yakın zamanda gösterilen eserler seçim havuzundan çıkarılır", () => {
  const pieces = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const selected = chooseUnrecentPiece(pieces, ["a", "b", "c"], () => 0);
  assert.equal(selected.id, "d");
  assert.deepEqual(nextPieceHistory(["a", "b", "c"], "d"), ["b", "c", "d"]);
});
