"use client";

import type { ReactNode } from "react";
import { GLYPHS } from "@/lib/music-glyphs.mjs";
import { ClefGlyph, CLEF_WIDTH_SPACES, NoteHead, noteHeadKind, stemX } from "./music";

/** Font units per staff space for the VexFlow notation glyphs, and for time-signature digits. */
const U = 365;
const UD = 340;

export type ScoreEvent = { id: string; rest: boolean; position: number | null; beats: number; dots: number; alter?: number; x: number; measure: number };

function Glyph({ d, x, y, units = U, space }: { d: string; x: number; y: number; units?: number; space: number }) {
  const k = space / units;
  return <path d={d} transform={`translate(${x} ${y}) scale(${k})`} fill="currentColor" />;
}

/**
 * Engraves a short single-line passage: treble clef (as a travelling-clef anchor), 4/4, accidentals,
 * rests, beamed eighths, dots, half notes, bar lines and bar numbers. Used for both the printed page
 * and the NotaNota view, so the two always show the same music.
 */
export function ScoreStaff({ events, measures, space = 10, width = 640, anchor, anchorOrder, highlight = null, playhead = null, numbers = false, label, className = "", children }: {
  events: ScoreEvent[]; measures: number; space?: number; width?: number; anchor?: string; anchorOrder?: number;
  highlight?: string | null; playhead?: number | null; numbers?: boolean; label: string; className?: string; children?: ReactNode;
}) {
  const top = 4 * space, bottom = top + 4 * space, height = bottom + 4 * space;
  const clefLeft = 0.5 * space;
  const timeX = clefLeft + CLEF_WIDTH_SPACES * space + 0.8 * space;
  const musicStart = timeX + 2.6 * space;
  const musicEnd = width - 0.8 * space;
  const xOf = (x: number) => musicStart + x * (musicEnd - musicStart);
  const yOf = (p: number) => bottom - p * (space / 2);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const line = Math.max(1, space * 0.1);
  const stem = Math.max(1.2, space * 0.12);

  // Beamed eighth pairs inside a beat.
  const beams: [ScoreEvent, ScoreEvent][] = [];
  events.forEach((e, i) => {
    const next = events[i + 1];
    if (!e.rest && e.beats === 0.5 && next && !next.rest && next.beats === 0.5 && next.measure === e.measure && !beams.some(([, b]) => b === e)) beams.push([e, next]);
  });
  const beamed = new Map<string, boolean>();
  for (const [a, b] of beams) { const up = ((a.position ?? 4) + (b.position ?? 4)) / 2 < 4; beamed.set(a.id, up); beamed.set(b.id, up); }

  return (
    <div className={`staff-figure score-staff ${className}`} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
        {playhead !== null && <rect className="staff-playhead" x={xOf(playhead) - space * 1.2} y={top - space * 1.6} width={space * 2.4} height={space * 7.2} rx={space * 0.6} />}
        <g stroke="currentColor" strokeWidth={line} className="staff-lines">
          {[0, 1, 2, 3, 4].map((l) => <line key={l} x1={0} x2={width} y1={top + l * space} y2={top + l * space} />)}
          {Array.from({ length: measures - 1 }, (_, i) => xOf((i + 1) / measures) - space * 0.4).map((x) => <line key={x} x1={x} x2={x} y1={top} y2={bottom} strokeWidth={line * 1.1} />)}
          <line x1={width - space * 0.9} x2={width - space * 0.9} y1={top} y2={bottom} strokeWidth={line * 1.1} />
        </g>
        <rect x={width - space * 0.55} y={top} width={space * 0.45} height={4 * space} fill="currentColor" />
        <Glyph d={GLYPHS.four.d} x={timeX} y={yOf(4)} units={UD} space={space} />
        <Glyph d={GLYPHS.four.d} x={timeX} y={bottom} units={UD} space={space} />
        {numbers && Array.from({ length: measures }, (_, i) => (
          <text key={i} className="score-bar-number" x={i === 0 ? clefLeft : xOf(i / measures) - space * 0.4} y={top - space * 1.4} fontSize={space * 1.05}>{i + 1}</text>
        ))}
        {events.map((e) => {
          const x = xOf(e.x);
          const on = e.id === highlight;
          if (e.rest) {
            const g = e.beats >= 1 ? GLYPHS.restQuarter : GLYPHS.restEighth;
            return <g key={e.id} className={`score-event${on ? " is-on" : ""}`}><Glyph d={g.d} x={x - space * 0.55} y={yOf(4)} space={space} /></g>;
          }
          const p = e.position ?? 4;
          const y = yOf(p);
          const up = beamed.has(e.id) ? beamed.get(e.id)! : p < 4;
          const kind = noteHeadKind(e.beats);
          const sx = stemX(x, up, space, stem, kind);
          const ledgers: number[] = [];
          for (let q = -2; q >= p; q -= 2) ledgers.push(q);
          for (let q = 10; q <= p; q += 2) ledgers.push(q);
          const dotY = p % 2 === 0 ? y - space / 2 : y;
          const flagged = e.beats === 0.5 && !beamed.has(e.id);
          return (
            <g key={e.id} className={`score-event${on ? " is-on" : ""}`}>
              {on && <circle cx={x} cy={y} r={space * 1.35} className="staff-note-halo" />}
              {ledgers.map((q) => <line key={q} x1={x - space * 1.05} x2={x + space * 1.05} y1={yOf(q)} y2={yOf(q)} stroke="currentColor" strokeWidth={line} />)}
              {e.alter === 1 && <Glyph d={GLYPHS.sharp.d} x={x - space * 2.1} y={y} space={space} />}
              {e.alter === -1 && <Glyph d={GLYPHS.flat.d} x={x - space * 1.9} y={y} space={space} />}
              {kind !== "whole" && <line x1={sx} x2={sx} y1={up ? y - space * 0.15 : y + space * 0.15} y2={up ? y - space * 3.4 : y + space * 3.4} stroke="currentColor" strokeWidth={stem} />}
              <NoteHead x={x} y={y} space={space} kind={kind} />
              {e.dots > 0 && <circle cx={x + space * 1.25} cy={dotY} r={space * 0.2} fill="currentColor" />}
              {flagged && <Glyph d={GLYPHS.flagUp.d} x={sx - space * 0.06} y={y - space * 3.4} space={space} />}
            </g>
          );
        })}
        {beams.map(([a, b]) => {
          const up = beamed.get(a.id)!;
          const ax = stemX(xOf(a.x), up, space, stem), bx = stemX(xOf(b.x), up, space, stem);
          const ay = yOf(a.position ?? 4) + (up ? -space * 3.4 : space * 3.4), by = yOf(b.position ?? 4) + (up ? -space * 3.4 : space * 3.4);
          const end = up ? Math.min(ay, by) : Math.max(ay, by);
          const t = space * 0.5 * (up ? 1 : -1);
          return <polygon key={a.id} points={`${ax - stem / 2},${end} ${bx + stem / 2},${end} ${bx + stem / 2},${end + t} ${ax - stem / 2},${end + t}`} fill="currentColor" />;
        })}
        {beams.map(([a, b]) => {
          // Stems reach the beam.
          const up = beamed.get(a.id)!;
          const end = up ? Math.min(yOf(a.position ?? 4), yOf(b.position ?? 4)) - space * 3.4 : Math.max(yOf(a.position ?? 4), yOf(b.position ?? 4)) + space * 3.4;
          return [a, b].map((e) => { const x = stemX(xOf(e.x), up, space, stem); return <line key={`s${e.id}`} x1={x} x2={x} y1={yOf(e.position ?? 4)} y2={end} stroke="currentColor" strokeWidth={stem} />; });
        })}
      </svg>
      <span className="clef-anchor" data-clef-anchor={anchor} data-clef-order={anchorOrder}
        style={{ left: pct(clefLeft, width), top: pct(top, height), width: pct(CLEF_WIDTH_SPACES * space, width), height: pct(4 * space, height) }}>
        <ClefGlyph />
      </span>
      {children}
    </div>
  );
}
