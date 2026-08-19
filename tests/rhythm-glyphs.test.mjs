import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RHYTHM_GLYPH_VIEWBOX,
  RHYTHM_PRESETS,
  groupRhythmValues,
} from "../lib/rhythm-presets.mjs";

const expected = {
  whole: { notes: 1, beams: 0, open: true, triplet: false },
  half: { notes: 1, beams: 0, open: true, triplet: false },
  quarter: { notes: 1, beams: 0, open: false, triplet: false },
  dottedQuarter: { notes: 1, beams: 0, open: false, triplet: false },
  eighthPair: { notes: 2, beams: 1, open: false, triplet: false },
  sixteenthGroup: { notes: 4, beams: 2, open: false, triplet: false },
  eighthTriplet: { notes: 3, beams: 1, open: false, triplet: true },
};

test("merkezi ritim presetleri doğru nota, kiriş ve üçleme yapılarını tanımlar", () => {
  assert.equal(RHYTHM_GLYPH_VIEWBOX.preserveAspectRatio, "xMidYMid meet");
  assert.deepEqual(Object.keys(RHYTHM_PRESETS), Object.keys(expected));

  for (const [id, preset] of Object.entries(RHYTHM_PRESETS)) {
    const rule = expected[id];
    assert.equal(preset.noteCount, rule.notes, `${id}: nota sayısı`);
    assert.equal(preset.noteXs.length, rule.notes, `${id}: x konumu sayısı`);
    assert.equal(preset.beamCount, rule.beams, `${id}: kiriş sayısı`);
    assert.equal(preset.openHead, rule.open, `${id}: nota başı doluluğu`);
    assert.equal(preset.tripletMark, rule.triplet, `${id}: üçleme işareti`);
    assert.ok(preset.headRx !== preset.headRy, `${id}: nota başı oval olmalı`);

    for (const x of preset.noteXs) {
      assert.ok(x - preset.headRx >= 4, `${id}: sol güvenli alan`);
      assert.ok(x + preset.stemOffset <= RHYTHM_GLYPH_VIEWBOX.width - 4, `${id}: sağ güvenli alan`);
      assert.ok(preset.noteY - preset.headRy >= 4, `${id}: üst güvenli alan`);
      assert.ok(preset.noteY + preset.headRy <= RHYTHM_GLYPH_VIEWBOX.height - 4, `${id}: alt güvenli alan`);
    }

    if (preset.beamCount) {
      assert.ok(preset.beamY >= 4, `${id}: kiriş viewBox içinde`);
      const lastBeamBottom = preset.beamY + (preset.beamCount - 1) * preset.beamGap + preset.beamHeight;
      assert.ok(lastBeamBottom < preset.noteY - 2, `${id}: kirişler nota başlarından ayrılmalı`);
    }
  }

  assert.equal(RHYTHM_PRESETS.eighthPair.beats, 1);
  assert.equal(RHYTHM_PRESETS.dottedQuarter.beats, 1.5);
  assert.equal(RHYTHM_PRESETS.sixteenthGroup.beats, 1);
  assert.equal(RHYTHM_PRESETS.eighthTriplet.beats, 1);
  assert.equal(RHYTHM_PRESETS.eighthTriplet.tripletY, 11);
});

test("kısa nota değerleri deterministik grup kimlikleriyle gruplanır", () => {
  const values = groupRhythmValues([
    "quarter",
    "eighth", "eighth",
    "sixteenth", "sixteenth", "sixteenth", "sixteenth",
    "triplet", "triplet", "triplet",
  ], "test");

  assert.equal(values[0].groupId, undefined);
  assert.equal(new Set(values.slice(1, 3).map((item) => item.groupId)).size, 1);
  assert.equal(new Set(values.slice(3, 7).map((item) => item.groupId)).size, 1);
  assert.equal(new Set(values.slice(7, 10).map((item) => item.groupId)).size, 1);
  assert.deepEqual(values.slice(7, 10).map((item) => item.groupIndex), [0, 1, 2]);
});

test("ana kart, değer göstergesi ve çalışma ekranı aynı SVG bileşenlerini kullanır", async () => {
  const [glyphs, page, trainer, styles] = await Promise.all([
    readFile(new URL("../app/rhythm-glyphs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/score-reading-trainer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(glyphs, /preserveAspectRatio=\{RHYTHM_GLYPH_VIEWBOX\.preserveAspectRatio\}/);
  assert.match(glyphs, /className="rhythm-triplet-mark"[\s\S]*>3<\/text>/);
  assert.match(glyphs, /export function RhythmGlyph/);
  assert.match(glyphs, /export function RhythmGroup/);
  assert.match(glyphs, /export function RhythmPatternPreview/);
  assert.match(page, /<RhythmPatternPreview variant="mixed"/);
  assert.match(trainer, /<RhythmPatternPreview variant="ode"/);
  assert.match(trainer, /<RhythmGlyph id=\{rhythm\.id as RhythmId\}/);
  assert.match(trainer, /<RhythmScoreLine/);
  assert.doesNotMatch(page, /module-score-note--/);
  assert.doesNotMatch(trainer, /function RhythmSymbol|function ScoreGlyph|score-note-flag/);
  assert.doesNotMatch(styles, /module-score-note|rhythm-symbol-group-note|score-note-flag/);
});
