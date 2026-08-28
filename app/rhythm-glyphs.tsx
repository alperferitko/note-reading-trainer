import type { CSSProperties, RefObject } from "react";
import { RHYTHM_GLYPH_VIEWBOX, RHYTHM_PRESETS, RHYTHM_PRESET_BY_VALUE } from "@/lib/rhythm-presets.mjs";

export type RhythmId = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "triplet";
export type RhythmScoreValue = RhythmId | "dottedQuarter";
export type RhythmPresetId = "whole" | "half" | "quarter" | "dottedQuarter" | "eighthPair" | "sixteenthGroup" | "eighthTriplet";
export type RhythmNoteState = "future" | "active" | "correct" | "wrong";

export type RhythmScoreNote = {
  key: string;
  position: number;
  rhythm: RhythmScoreValue;
  groupId?: string;
  barAfter?: boolean;
  state?: RhythmNoteState;
};

type GroupNote = RhythmScoreNote & { index: number; x: number; y: number };

type RhythmPresetDefinition = {
  valueId: RhythmId;
  noteCount: number;
  beamCount: number;
  beats: number;
  tripletMark: boolean;
  openHead: boolean;
  noteXs: readonly number[];
  noteY: number;
  stemTop: number | null;
  beamY: number | null;
  tripletY: number | null;
  beamHeight: number;
  beamGap: number;
  headRx: number;
  headRy: number;
  headAngle: number;
  stemOffset: number;
};

export const RHYTHM_VIEWBOX = `${RHYTHM_GLYPH_VIEWBOX.x} ${RHYTHM_GLYPH_VIEWBOX.y} ${RHYTHM_GLYPH_VIEWBOX.width} ${RHYTHM_GLYPH_VIEWBOX.height}`;
export const rhythmPresets = RHYTHM_PRESETS as Record<RhythmPresetId, RhythmPresetDefinition>;

function presetIdForRhythm(id: RhythmScoreValue) {
  return RHYTHM_PRESET_BY_VALUE[id] as RhythmPresetId;
}

function NoteHead({ x, y, open = false, preset }: { x: number; y: number; open?: boolean; preset?: RhythmPresetDefinition }) {
  const geometry = preset ?? rhythmPresets.quarter;
  return (
    <ellipse
      className={`rhythm-note-head${open ? " is-open" : ""}`}
      cx={x}
      cy={y}
      rx={geometry.headRx}
      ry={geometry.headRy}
      transform={`rotate(${geometry.headAngle} ${x} ${y})`}
    />
  );
}

function StaticRhythmDrawing({ presetId }: { presetId: RhythmPresetId }) {
  const preset = rhythmPresets[presetId];
  const xs = preset.noteXs;
  const beamStart = xs[0] + preset.stemOffset;
  const beamEnd = xs.at(-1)! + preset.stemOffset;

  return (
    <g className={`rhythm-group rhythm-group--${presetId}`} data-rhythm-group={presetId}>
      {preset.beamCount > 0 && Array.from({ length: preset.beamCount }, (_, beam) => (
        <rect
          className="rhythm-beam"
          data-rhythm-beam={beam + 1}
          key={beam}
          x={beamStart}
          y={preset.beamY! + beam * preset.beamGap}
          width={beamEnd - beamStart}
          height={preset.beamHeight}
          rx="1"
        />
      ))}
      {preset.tripletMark && <text className="rhythm-triplet-mark" x="48" y={preset.tripletY!} textAnchor="middle">3</text>}
      {xs.map((x, index) => (
        <g className="rhythm-note" data-rhythm-note={index + 1} key={x}>
          {presetId !== "whole" && (
            <line
              className="rhythm-stem"
              data-rhythm-stem={index + 1}
              x1={x + preset.stemOffset}
              x2={x + preset.stemOffset}
              y1={preset.beamCount ? preset.beamY! + preset.beamHeight : preset.stemTop!}
              y2={preset.noteY - 2}
            />
          )}
          <NoteHead x={x} y={preset.noteY} open={preset.openHead} preset={preset} />
          {presetId === "dottedQuarter" && <circle className="rhythm-augmentation-dot" cx={x + 17} cy={preset.noteY} r="3.1" />}
        </g>
      ))}
    </g>
  );
}

export function RhythmGlyph({ id, className = "", title }: { id: RhythmId | RhythmPresetId; className?: string; title?: string }) {
  const presetId = (id in rhythmPresets ? id : presetIdForRhythm(id as RhythmId)) as RhythmPresetId;
  return (
    <svg
      className={`rhythm-glyph ${className}`.trim()}
      viewBox={RHYTHM_VIEWBOX}
      preserveAspectRatio={RHYTHM_GLYPH_VIEWBOX.preserveAspectRatio}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      data-rhythm-glyph={presetId}
    >
      {title && <title>{title}</title>}
      <StaticRhythmDrawing presetId={presetId} />
    </svg>
  );
}

function LedgerLines({ x, position, firstLineY }: { x: number; position: number; firstLineY: number }) {
  const ledgers: number[] = [];
  if (position <= -2) for (let ledger = -2; ledger >= position; ledger -= 2) ledgers.push(ledger);
  if (position >= 10) for (let ledger = 10; ledger <= position; ledger += 2) ledgers.push(ledger);
  return <>{ledgers.map((ledger) => <line className="rhythm-ledger" key={ledger} x1={x - 15} x2={x + 15} y1={firstLineY - ledger * 7} y2={firstLineY - ledger * 7} />)}</>;
}

export function RhythmGroup({
  presetId,
  notes,
  firstLineY,
  activeIndex,
  activeNoteRef,
}: {
  presetId: RhythmPresetId;
  notes: GroupNote[];
  firstLineY: number;
  activeIndex?: number;
  activeNoteRef?: RefObject<SVGGElement | null>;
}) {
  const preset = rhythmPresets[presetId];
  const hasCompleteBeam = preset.beamCount > 0 && notes.length === preset.noteCount;
  const beamY = Math.max(18, Math.min(...notes.map((note) => note.y)) - 35);
  const beamStart = notes[0].x + preset.stemOffset;
  const beamEnd = notes.at(-1)!.x + preset.stemOffset;

  return (
    <g className={`rhythm-score-group rhythm-score-group--${presetId}`} data-rhythm-group={presetId}>
      {hasCompleteBeam && Array.from({ length: preset.beamCount }, (_, beam) => (
        <rect
          className="rhythm-beam"
          data-rhythm-beam={beam + 1}
          key={beam}
          x={beamStart}
          y={beamY + beam * preset.beamGap}
          width={Math.max(4, beamEnd - beamStart)}
          height={preset.beamHeight}
          rx="1"
        />
      ))}
      {hasCompleteBeam && preset.tripletMark && (
        <text className="rhythm-triplet-mark" x={(beamStart + beamEnd) / 2} y={beamY - 9} textAnchor="middle">3</text>
      )}
      {notes.map((note) => {
        const open = note.rhythm === "whole" || note.rhythm === "half";
        return (
          <g
            className={`rhythm-score-note is-${note.state ?? "future"}`}
            data-event-index={note.index}
            key={note.key}
            ref={note.index === activeIndex ? activeNoteRef : undefined}
          >
            <LedgerLines x={note.x} position={note.position} firstLineY={firstLineY} />
            {note.rhythm !== "whole" && (
              <line
                className="rhythm-stem"
                data-rhythm-stem={note.index + 1}
                x1={note.x + preset.stemOffset}
                x2={note.x + preset.stemOffset}
                y1={hasCompleteBeam ? beamY + preset.beamHeight : note.y - 34}
                y2={note.y - 2}
              />
            )}
            {!hasCompleteBeam && (note.rhythm === "eighth" || note.rhythm === "sixteenth" || note.rhythm === "triplet") && (
              <path className="rhythm-flag" d={`M ${note.x + preset.stemOffset} ${note.y - 34} C ${note.x + 20} ${note.y - 28}, ${note.x + 18} ${note.y - 17}, ${note.x + 10} ${note.y - 13}`} />
            )}
            {!hasCompleteBeam && note.rhythm === "sixteenth" && (
              <path className="rhythm-flag" d={`M ${note.x + preset.stemOffset} ${note.y - 27} C ${note.x + 19} ${note.y - 21}, ${note.x + 17} ${note.y - 11}, ${note.x + 10} ${note.y - 7}`} />
            )}
            <NoteHead x={note.x} y={note.y} open={open} preset={preset} />
            {note.rhythm === "dottedQuarter" && <circle className="rhythm-augmentation-dot" cx={note.x + 17} cy={note.y} r="3.1" />}
          </g>
        );
      })}
    </g>
  );
}

const GROUP_NOTE_GAPS: Record<RhythmPresetId, number> = {
  whole: 0,
  half: 0,
  quarter: 0,
  dottedQuarter: 0,
  eighthPair: 34,
  sixteenthGroup: 24,
  eighthTriplet: 28,
};

function layoutScoreNotes(notes: RhythmScoreNote[], firstLineY: number, startX: number) {
  const groups: { presetId: RhythmPresetId; notes: GroupNote[] }[] = [];
  const noteXs = new Map<number, number>();
  let cursor = 0;
  let nextX = startX;

  while (cursor < notes.length) {
    const first = notes[cursor];
    const presetId = presetIdForRhythm(first.rhythm);
    const preset = rhythmPresets[presetId];
    const groupId = first.groupId;
    const candidate = groupId ? notes.slice(cursor, cursor + preset.noteCount) : [first];
    const completeGroup = Boolean(groupId)
      && candidate.length === preset.noteCount
      && candidate.every((note) => note.groupId === groupId && presetIdForRhythm(note.rhythm) === presetId);
    const sourceNotes = completeGroup ? candidate : [first];
    const noteGap = completeGroup ? GROUP_NOTE_GAPS[presetId] : 0;
    const positioned = sourceNotes.map((note, offset) => {
      const index = cursor + offset;
      const x = nextX + offset * noteGap;
      noteXs.set(index, x);
      return { ...note, index, x, y: firstLineY - note.position * 7 };
    });

    groups.push({ presetId, notes: positioned });
    nextX += noteGap * Math.max(0, positioned.length - 1) + (completeGroup ? 52 : 66);
    cursor += positioned.length;
  }

  return { groups, noteXs, width: Math.max(720, nextX + 26) };
}

export function RhythmScoreLine({ notes, activeIndex, activeNoteRef, className = "", ariaLabel }: {
  notes: RhythmScoreNote[];
  activeIndex?: number;
  activeNoteRef?: RefObject<SVGGElement | null>;
  className?: string;
  ariaLabel?: string;
}) {
  const firstLineY = 118;
  const startX = 126;
  const { groups, noteXs, width } = layoutScoreNotes(notes, firstLineY, startX);
  return (
    <svg
      className={`rhythm-score-line ${className}`.trim()}
      viewBox={`0 0 ${width} 184`}
      preserveAspectRatio="xMidYMid meet"
      style={{ "--rhythm-score-width": `${width}px` } as CSSProperties}
      role={ariaLabel ? "img" : undefined}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
    >
      <g className="rhythm-staff-lines">
        {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="96" x2={width - 18} y1={firstLineY - line * 14} y2={firstLineY - line * 14} />)}
      </g>
      <text className="rhythm-clef" x="18" y="131">𝄞</text>
      {groups.map((group) => (
        <RhythmGroup
          activeIndex={activeIndex}
          activeNoteRef={activeNoteRef}
          firstLineY={firstLineY}
          key={`${group.notes[0].key}-${group.presetId}`}
          notes={group.notes}
          presetId={group.presetId}
        />
      ))}
      <g className="rhythm-barlines" aria-hidden="true">
        {notes.map((note, index) => note.barAfter && (
          <line
            className="rhythm-barline"
            key={`bar-${note.key}`}
            x1={Math.min(width - 20, (noteXs.get(index) ?? startX) + 30)}
            x2={Math.min(width - 20, (noteXs.get(index) ?? startX) + 30)}
            y1={firstLineY - 56}
            y2={firstLineY}
          />
        ))}
      </g>
    </svg>
  );
}

const MIXED_PATTERN: RhythmScoreNote[] = [
  { key: "quarter", position: -1, rhythm: "quarter", state: "active" },
  { key: "half", position: 0, rhythm: "half", state: "active" },
  { key: "eighth-1", position: 1, rhythm: "eighth", groupId: "eighth", state: "active" },
  { key: "eighth-2", position: 1, rhythm: "eighth", groupId: "eighth", state: "active" },
  { key: "sixteenth-1", position: 0, rhythm: "sixteenth", groupId: "sixteenth", state: "active" },
  { key: "sixteenth-2", position: 0, rhythm: "sixteenth", groupId: "sixteenth", state: "active" },
  { key: "sixteenth-3", position: 0, rhythm: "sixteenth", groupId: "sixteenth", state: "active" },
  { key: "sixteenth-4", position: 0, rhythm: "sixteenth", groupId: "sixteenth", state: "active" },
  { key: "triplet-1", position: 1, rhythm: "triplet", groupId: "triplet", state: "active" },
  { key: "triplet-2", position: 1, rhythm: "triplet", groupId: "triplet", state: "active" },
  { key: "triplet-3", position: 1, rhythm: "triplet", groupId: "triplet", state: "active" },
];

const ODE_PATTERN: RhythmScoreNote[] = [0, 0, 1, 2, 2, 1, 0, -1, -2, -2, -1, 0, 0, -1, -1].map((position, index) => ({
  key: `ode-${index}`,
  position,
  rhythm: index === 12 ? "dottedQuarter" : index === 13 ? "eighth" : index === 14 ? "half" : "quarter",
  barAfter: [3, 7, 11, 14].includes(index),
  state: "active",
}));

export function RhythmPatternPreview({ variant = "mixed", className = "" }: { variant?: "mixed" | "ode"; className?: string }) {
  return <RhythmScoreLine className={`rhythm-pattern-preview rhythm-pattern-preview--${variant} ${className}`.trim()} notes={variant === "ode" ? ODE_PATTERN : MIXED_PATTERN} />;
}
