"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { CLEF_BOX, CLEF_PATH, CLEF_SPACE } from "@/lib/clef-path.mjs";
import { GLYPHS, NOTEHEAD_UNITS } from "@/lib/music-glyphs.mjs";
import { CHORD_NOTE_GAIN, ensurePianoLoaded, isPianoLoaded, readNoteVoice, scheduleVoiceNote } from "@/lib/note-voices";
import { practiceAudioContext } from "@/lib/practice-audio";

/** Width of the clef in staff spaces, and where its box starts relative to the top staff line. */
export const CLEF_WIDTH_SPACES = CLEF_BOX.width / CLEF_SPACE;
const CLEF_TOP_SPACES = CLEF_BOX.y / CLEF_SPACE + 3; // the G line is three spaces under the top line
export const CLEF_HEIGHT_SPACES = CLEF_BOX.height / CLEF_SPACE;

/** The treble clef drawn into a box exactly one staff tall (top line to bottom line). */
export function ClefGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`clef-glyph ${className}`}
      viewBox={`${CLEF_BOX.x} ${CLEF_BOX.y} ${CLEF_BOX.width} ${CLEF_BOX.height}`}
      style={{ top: `${(CLEF_TOP_SPACES / 4) * 100}%`, height: `${(CLEF_HEIGHT_SPACES / 4) * 100}%` }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={CLEF_PATH} fill="currentColor" />
    </svg>
  );
}

export type NoteHeadKind = "black" | "half" | "whole";

const HEAD_GLYPH = { black: GLYPHS.noteheadBlack, half: GLYPHS.noteheadHalf, whole: GLYPHS.noteheadWhole } as const;

/** The head kind for a duration in beats (quarter = 1): whole from four beats, half from two. */
export function noteHeadKind(beats = 1): NoteHeadKind {
  return beats >= 4 ? "whole" : beats >= 2 ? "half" : "black";
}

/** Width of an engraved note head in px for a staff space of `space` px. */
export function noteHeadWidth(kind: NoteHeadKind, space: number) {
  return HEAD_GLYPH[kind].widthSpaces * space;
}

/**
 * Where a stem of width `stemWidth` stands for a head centred at `x`: on the right edge going up,
 * on the left edge going down, set inside by half its width so it touches the head's outline.
 */
export function stemX(x: number, up: boolean, space: number, stemWidth: number, kind: NoteHeadKind = "black") {
  const half = noteHeadWidth(kind, space) / 2;
  return up ? x + half - stemWidth / 2 : x - half + stemWidth / 2;
}

/**
 * An engraved note head (VexFlow glyphs, MIT) centred on (x, y): a tilted black oval, a half head
 * whose counter is a steep "grain of rice", or the wide whole head with its counter tilted the other way.
 */
export function NoteHead({ x, y, space, kind = "black", className = "" }: { x: number; y: number; space: number; kind?: NoteHeadKind; className?: string }) {
  const glyph = HEAD_GLYPH[kind];
  const k = space / NOTEHEAD_UNITS;
  return (
    <path
      d={glyph.d}
      transform={`translate(${x - (glyph.widthSpaces * space) / 2} ${y}) scale(${k})`}
      fill="currentColor"
      fillRule="evenodd"
      stroke="none"
      className={className || undefined}
    />
  );
}

export type StaffNote = {
  id: string;
  position: number; // steps above the bottom line (E4 = 0 in the treble clef)
  x: number; // 0..1 across the music area
  beats?: number;
  tone?: "idle" | "ok" | "no" | "focus" | "quiet" | "flag";
  label?: string;
  onActivate?: () => void;
  ariaLabel?: string;
};

type StaffProps = {
  notes: StaffNote[];
  space?: number;
  width?: number;
  anchor?: string;
  anchorOrder?: number;
  barlines?: number[];
  finalBar?: boolean;
  playhead?: number | null;
  label: string;
  className?: string;
  children?: ReactNode;
  variant?: "clean" | "print";
};

function ledgers(position: number) {
  const out: number[] = [];
  for (let p = -2; p >= position; p -= 2) out.push(p);
  for (let p = 10; p <= position; p += 2) out.push(p);
  return out;
}

/**
 * A five-line treble staff in SVG. The clef is not drawn into the SVG: it sits in an anchor box
 * (top line to bottom line), so the one travelling clef of the landing page can land on any staff.
 * Without that script, or with reduced motion, each anchor shows its own still clef.
 */
export function Staff({ notes, space = 10, width = 360, anchor, anchorOrder, barlines = [], finalBar = false, playhead = null, label, className = "", children, variant = "clean" }: StaffProps) {
  const top = 4 * space;
  const bottom = top + 4 * space;
  const height = bottom + 4 * space;
  const clefLeft = 0.5 * space;
  const musicStart = clefLeft + CLEF_WIDTH_SPACES * space + 1.2 * space;
  const musicEnd = width - 0.8 * space;
  const xOf = (x: number) => musicStart + x * (musicEnd - musicStart);
  const yOf = (position: number) => bottom - position * (space / 2);
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;
  const ink = variant === "print" ? "var(--print-ink)" : "currentColor";

  return (
    <div className={`staff-figure ${variant === "print" ? "staff-figure--print" : ""} ${className}`} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
        <g stroke={ink} strokeWidth={Math.max(1, space * 0.1)} opacity={variant === "print" ? 0.85 : 0.72}>
          {[0, 1, 2, 3, 4].map((line) => <line key={line} x1={0} x2={width} y1={top + line * space} y2={top + line * space} />)}
        </g>
        <g stroke={ink} strokeWidth={Math.max(1, space * 0.11)}>
          {barlines.map((bar) => <line key={bar} x1={xOf(bar)} x2={xOf(bar)} y1={top} y2={bottom} />)}
          {finalBar && <>
            <line x1={width - space * 0.9} x2={width - space * 0.9} y1={top} y2={bottom} />
            <rect x={width - space * 0.55} y={top} width={space * 0.45} height={4 * space} fill={ink} stroke="none" />
          </>}
        </g>
        {playhead !== null && (
          <rect className="staff-playhead" x={xOf(playhead) - space * 0.9} y={top - space * 1.4} width={space * 1.8} height={space * 6.8} rx={space * 0.5} />
        )}
        {notes.map((note) => {
          const x = xOf(note.x), y = yOf(note.position);
          const up = note.position < 4;
          const kind = noteHeadKind(note.beats);
          const stemWidth = Math.max(1.2, space * 0.12);
          const sx = stemX(x, up, space, stemWidth, kind);
          return (
            <g key={note.id} className={`staff-note staff-note--${note.tone ?? "idle"}`}>
              {note.tone === "focus" && <circle cx={x} cy={y} r={space * 1.25} className="staff-note-halo" />}
              {note.tone === "flag" && <rect x={x - space * 1.2} y={y - space * 1.2} width={space * 2.4} height={space * 2.4} rx={space * 0.5} className="staff-note-flag" />}
              <g stroke={ink} strokeWidth={Math.max(1, space * 0.11)}>
                {ledgers(note.position).map((p) => <line key={p} x1={x - space * 1.05} x2={x + space * 1.05} y1={yOf(p)} y2={yOf(p)} />)}
              </g>
              {kind !== "whole" && <line x1={sx} x2={sx} y1={up ? y - space * 0.15 : y + space * 0.15} y2={up ? y - space * 3.4 : y + space * 3.4} stroke="currentColor" strokeWidth={stemWidth} className="staff-note-ink" />}
              <NoteHead x={x} y={y} space={space} kind={kind} className="staff-note-ink" />
              {note.label && <text x={x} y={note.position >= 4 ? bottom + space * 2.6 : top - space * 1.6} textAnchor="middle" className="staff-note-label" fontSize={space * 1.25}>{note.label}</text>}
            </g>
          );
        })}
      </svg>
      {anchor && (
        <span
          className="clef-anchor"
          data-clef-anchor={anchor}
          data-clef-order={anchorOrder}
          style={{ left: pct(clefLeft, width), top: pct(top, height), width: pct(CLEF_WIDTH_SPACES * space, width), height: pct(4 * space, height) }}
        >
          <ClefGlyph />
        </span>
      )}
      {!anchor && (
        <span className="clef-anchor clef-anchor--fixed" style={{ left: pct(clefLeft, width), top: pct(top, height), width: pct(CLEF_WIDTH_SPACES * space, width), height: pct(4 * space, height) }}>
          <ClefGlyph />
        </span>
      )}
      {notes.filter((note) => note.onActivate).map((note) => (
        <button
          key={note.id}
          type="button"
          className="staff-note-hit"
          aria-label={note.ariaLabel ?? note.label ?? note.id}
          style={{ left: pct(xOf(note.x) - space * 1.4, width), top: pct(yOf(note.position) - space * 1.4, height), width: pct(space * 2.8, width), height: pct(space * 2.8, height) }}
          onClick={note.onActivate}
          onKeyDown={(event: KeyboardEvent) => { if (event.key === " ") event.stopPropagation(); }}
        />
      ))}
      {children}
    </div>
  );
}

/* ---------- Sound: the practice AudioContext, opened only by a click, always stoppable. ---------- */

const live = new Set<() => void>();
const PIANO_WAIT_MS = 1500; // how long a passage waits for its piano samples before the synth plays it

function context() {
  try {
    return practiceAudioContext();
  } catch {
    return null; // No Web Audio: sound is optional.
  }
}

function voice(ctx: AudioContext, midi: number, at: number, seconds: number) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.2, seconds * 0.95));
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + seconds);
  return osc;
}

export function playMidi(midi: number, seconds = 0.8) {
  const ctx = context();
  if (!ctx) return;
  try { voice(ctx, midi, ctx.currentTime + 0.01, seconds); } catch { /* Sound is optional. */ }
}

/** The most notes sounding at once, so overlapping voices can be scaled down together. */
function polyphony(notes: { start: number; beats: number }[]) {
  return notes.reduce((max, note) => Math.max(max, notes.filter((other) => other.start <= note.start && note.start < other.start + other.beats).length), 0);
}

/**
 * Plays notes in time in the user's note voice (piano samples by default) and reports the playing
 * beat; returns stop() at once. The needed piano samples load first (at most 1.5 s, then the soft
 * synth plays instead); every note is then scheduled at its exact start and length. stop() fades
 * every scheduled note out in 30 ms, and stopAllSound() does the same for every passage still running.
 */
export function playSequence(notes: { midi: number; start: number; beats: number }[], tempo: number, onBeat: (beat: number | null) => void) {
  const ctx = context();
  if (!ctx) { onBeat(null); return () => {}; }
  const beat = 60 / tempo;
  const end = notes.reduce((max, note) => Math.max(max, note.start + note.beats), 0);
  const midis = notes.map((note) => note.midi);
  const chosen = readNoteVoice();
  const gain = polyphony(notes) > 1 ? CHORD_NOTE_GAIN : undefined;
  const silencers: (() => void)[] = [];
  let t0 = 0;
  let frame = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const position = (ctx.currentTime - t0) / beat;
    if (position >= end) { finish(); return; }
    onBeat(Math.max(0, position));
    frame = window.requestAnimationFrame(tick);
  };

  const begin = () => {
    if (stopped) return;
    const ready = chosen !== "piano" || isPianoLoaded(ctx, midis);
    const playing = ready ? chosen : "soft";
    t0 = ctx.currentTime + 0.08;
    try {
      for (const note of notes) silencers.push(scheduleVoiceNote(ctx, note.midi, t0 + note.start * beat, note.beats * beat, playing, gain));
    } catch { /* Sound is optional; the playhead still runs. */ }
    frame = window.requestAnimationFrame(tick);
  };

  /** Ends the passage; the last notes keep their natural release. */
  function finish() {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(frame);
    live.delete(stop);
    onBeat(null);
  }

  function stop() {
    if (stopped) return;
    for (const silence of silencers) silence();
    finish();
  }

  live.add(stop);
  onBeat(0);
  if (chosen === "piano" && !isPianoLoaded(ctx, midis)) {
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, PIANO_WAIT_MS));
    void Promise.race([ensurePianoLoaded(ctx, midis), timeout]).then(begin);
  } else {
    begin();
  }
  return stop;
}

export function stopAllSound() {
  for (const stop of [...live]) stop();
}
