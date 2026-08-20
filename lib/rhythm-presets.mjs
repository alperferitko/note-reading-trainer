export const RHYTHM_VALUES = Object.freeze([
  Object.freeze({ id: "whole", beats: 4 }),
  Object.freeze({ id: "half", beats: 2 }),
  Object.freeze({ id: "quarter", beats: 1 }),
  Object.freeze({ id: "eighth", beats: 0.5 }),
  Object.freeze({ id: "sixteenth", beats: 0.25 }),
  Object.freeze({ id: "triplet", beats: 1 / 3 }),
]);

const demoPattern = (stepBeats, stepCount, audibleSteps) => Object.freeze({
  stepBeats,
  stepCount,
  audibleSteps: Object.freeze(audibleSteps),
});

export const RHYTHM_DEMO_PATTERNS = Object.freeze({
  whole: demoPattern(1, 4, [0]),
  half: demoPattern(1, 2, [0]),
  quarter: demoPattern(1, 1, [0]),
  eighth: demoPattern(0.5, 2, [0, 1]),
  sixteenth: demoPattern(0.25, 4, [0, 1, 2, 3]),
  triplet: demoPattern(1 / 3, 3, [0, 1, 2]),
});

export function rhythmDemoStepDurationMs(valueId, bpm) {
  const pattern = RHYTHM_DEMO_PATTERNS[valueId];
  if (!pattern) throw new Error(`Unknown rhythm demo value: ${valueId}`);
  return Math.round((60_000 / bpm) * pattern.stepBeats);
}

export const RHYTHM_GLYPH_VIEWBOX = Object.freeze({
  x: 0,
  y: 0,
  width: 96,
  height: 64,
  preserveAspectRatio: "xMidYMid meet",
});

const preset = (definition) => Object.freeze({
  beamHeight: 4.5,
  beamGap: 7,
  headRx: 9,
  headRy: 6,
  headAngle: -16,
  stemOffset: 7,
  ...definition,
  noteXs: Object.freeze(definition.noteXs),
});

export const RHYTHM_PRESETS = Object.freeze({
  whole: preset({ valueId: "whole", noteCount: 1, beamCount: 0, beats: 4, tripletMark: false, openHead: true, noteXs: [48], noteY: 46, stemTop: null, beamY: null, tripletY: null }),
  half: preset({ valueId: "half", noteCount: 1, beamCount: 0, beats: 2, tripletMark: false, openHead: true, noteXs: [48], noteY: 46, stemTop: 14, beamY: null, tripletY: null }),
  quarter: preset({ valueId: "quarter", noteCount: 1, beamCount: 0, beats: 1, tripletMark: false, openHead: false, noteXs: [48], noteY: 46, stemTop: 14, beamY: null, tripletY: null }),
  dottedQuarter: preset({ valueId: "dottedQuarter", noteCount: 1, beamCount: 0, beats: 1.5, tripletMark: false, openHead: false, noteXs: [42], noteY: 46, stemTop: 14, beamY: null, tripletY: null }),
  eighthPair: preset({ valueId: "eighth", noteCount: 2, beamCount: 1, beats: 1, tripletMark: false, openHead: false, noteXs: [28, 68], noteY: 47, stemTop: null, beamY: 16, tripletY: null }),
  sixteenthGroup: preset({ valueId: "sixteenth", noteCount: 4, beamCount: 2, beats: 1, tripletMark: false, openHead: false, noteXs: [16, 38, 60, 82], noteY: 48, stemTop: null, beamY: 14, tripletY: null }),
  eighthTriplet: preset({ valueId: "triplet", noteCount: 3, beamCount: 1, beats: 1, tripletMark: true, openHead: false, noteXs: [26, 48, 70], noteY: 49, stemTop: null, beamY: 23, tripletY: 11 }),
});

export const RHYTHM_PRESET_BY_VALUE = Object.freeze({
  whole: "whole",
  half: "half",
  quarter: "quarter",
  dottedQuarter: "dottedQuarter",
  eighth: "eighthPair",
  sixteenth: "sixteenthGroup",
  triplet: "eighthTriplet",
});

export function rhythmPresetFor(valueId) {
  return RHYTHM_PRESETS[RHYTHM_PRESET_BY_VALUE[valueId]];
}

export function groupRhythmValues(valueIds, prefix = "rhythm") {
  const grouped = [];
  let cursor = 0;

  while (cursor < valueIds.length) {
    const id = valueIds[cursor];
    const definition = rhythmPresetFor(id);
    let runEnd = cursor + 1;
    while (runEnd < valueIds.length && valueIds[runEnd] === id) runEnd += 1;

    const runLength = runEnd - cursor;
    for (let offset = 0; offset < runLength; offset += 1) {
      const groupStart = Math.floor(offset / definition.noteCount) * definition.noteCount;
      const completeGroup = definition.noteCount > 1 && runLength - groupStart >= definition.noteCount;
      grouped.push(Object.freeze({
        id,
        groupId: completeGroup ? `${prefix}-${id}-${cursor + groupStart}` : undefined,
        groupIndex: completeGroup ? offset - groupStart : undefined,
        groupSize: completeGroup ? definition.noteCount : undefined,
      }));
    }
    cursor = runEnd;
  }

  return grouped;
}
