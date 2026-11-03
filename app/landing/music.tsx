"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { CLEF_BOX, CLEF_PATH, CLEF_SPACE } from "@/lib/clef-path.mjs";

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
          const hollow = (note.beats ?? 1) >= 2;
          const rx = space * 0.66, ry = space * 0.46;
          return (
            <g key={note.id} className={`staff-note staff-note--${note.tone ?? "idle"}`}>
              {note.tone === "focus" && <circle cx={x} cy={y} r={space * 1.25} className="staff-note-halo" />}
              {note.tone === "flag" && <rect x={x - space * 1.2} y={y - space * 1.2} width={space * 2.4} height={space * 2.4} rx={space * 0.5} className="staff-note-flag" />}
              <g stroke={ink} strokeWidth={Math.max(1, space * 0.11)}>
                {ledgers(note.position).map((p) => <line key={p} x1={x - space * 1.05} x2={x + space * 1.05} y1={yOf(p)} y2={yOf(p)} />)}
              </g>
              <line x1={up ? x + rx * 0.92 : x - rx * 0.92} x2={up ? x + rx * 0.92 : x - rx * 0.92} y1={y} y2={up ? y - space * 3.4 : y + space * 3.4} stroke="currentColor" strokeWidth={Math.max(1.2, space * 0.12)} className="staff-note-ink" />
              <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(-22 ${x} ${y})`} className="staff-note-ink"
                fill={hollow ? "none" : "currentColor"} stroke="currentColor" strokeWidth={hollow ? space * 0.2 : 0} />
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

/* ---------- Sound: one shared context, opened only by a click, always stoppable. ---------- */

let sharedContext: AudioContext | null = null;
const live = new Set<() => void>();

function context() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  sharedContext = sharedContext ?? new Ctor();
  if (sharedContext.state === "suspended") void sharedContext.resume();
  return sharedContext;
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

/**
 * Plays notes in time and reports the playing beat; returns stop(). Stopping silences every
 * scheduled oscillator at once, and stopAllSound() does the same for every sequence still running.
 */
export function playSequence(notes: { midi: number; start: number; beats: number }[], tempo: number, onBeat: (beat: number | null) => void) {
  const ctx = context();
  if (!ctx) { onBeat(null); return () => {}; }
  const beat = 60 / tempo;
  const t0 = ctx.currentTime + 0.08;
  const oscillators = notes.map((note) => voice(ctx, note.midi, t0 + note.start * beat, note.beats * beat));
  const end = notes.reduce((max, note) => Math.max(max, note.start + note.beats), 0);
  let frame = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const position = (ctx.currentTime - t0) / beat;
    if (position >= end) { stop(); return; }
    onBeat(Math.max(0, position));
    frame = window.requestAnimationFrame(tick);
  };
  function stop() {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(frame);
    for (const osc of oscillators) { try { osc.stop(); } catch { /* already stopped */ } }
    live.delete(stop);
    onBeat(null);
  }
  live.add(stop);
  frame = window.requestAnimationFrame(tick);
  return stop;
}

export function stopAllSound() {
  for (const stop of [...live]) stop();
}
