"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { GLYPHS } from "@/lib/music-glyphs.mjs";
import { CLEF_WIDTH_SPACES } from "./music";

const GAP = 13; // one staff space on the ribbon, in px
const LOOP = 46; // seconds for a note to cross the whole ribbon
const GLYPH = GAP / 335;

type Geo = { w: number; h: number; d: string; wide: boolean };
type Point = [number, number];

/** Catmull-Rom through the points, written as cubic Béziers. */
function throughPoints(points: Point[]) {
  const r = (n: number) => Math.round(n * 10) / 10;
  let d = `M${r(points[0][0])} ${r(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    d += ` C${r(p1[0] + (p2[0] - p0[0]) / 6)} ${r(p1[1] + (p2[1] - p0[1]) / 6)} ${r(p2[0] - (p3[0] - p1[0]) / 6)} ${r(p2[1] - (p3[1] - p1[1]) / 6)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d;
}

/** Notes that ride the ribbon. `s` is the staff step above the bottom line. */
const RIDERS: { kind: "quarter" | "half" | "eighth" | "pair" | "sharp"; s: number; accent?: boolean; scale: number }[] = [
  { kind: "quarter", s: 4, scale: 1 },
  { kind: "pair", s: 5, scale: 1.05 },
  { kind: "half", s: 2, scale: .95 },
  { kind: "sharp", s: 3, scale: 1.1, accent: true },
  { kind: "quarter", s: 7, scale: .9 },
  { kind: "eighth", s: 1, scale: 1 },
  { kind: "quarter", s: 6, scale: 1.08 },
];

function Head({ x = 0, y = 0, open = false }: { x?: number; y?: number; open?: boolean }) {
  return <ellipse cx={x} cy={y} rx={GAP * .64} ry={GAP * .46} transform={`rotate(-20 ${x} ${y})`} className={open ? "rider-open" : undefined} />;
}

function Rider({ kind }: { kind: (typeof RIDERS)[number]["kind"] }) {
  const stem = GAP * 3.3, sx = GAP * .58;
  if (kind === "pair") {
    const dx = GAP * 2.1, dy = -GAP / 2;
    return (
      <g>
        <Head /><Head x={dx} y={dy} />
        <path d={`M${sx} 0V${-stem}M${dx + sx} ${dy}V${-stem - GAP * .5}`} className="rider-stem" />
        <path d={`M${sx - .7} ${-stem}L${dx + sx + .7} ${-stem - GAP * .5}L${dx + sx + .7} ${-stem - GAP * .5 + GAP * .5}L${sx - .7} ${-stem + GAP * .5}Z`} />
      </g>
    );
  }
  return (
    <g>
      {kind === "sharp" && <path d={GLYPHS.sharp.d} transform={`translate(${-GAP * 2.2} 0) scale(${GLYPH})`} />}
      <Head open={kind === "half"} />
      <path d={`M${sx} 0V${-stem}`} className="rider-stem" />
      {kind === "eighth" && <path d={`M${sx} ${-stem}c${GAP * .2} ${GAP * 1.1} ${GAP * 1.5} ${GAP * 1.2} ${GAP * 1.1} ${GAP * 2.6}c${GAP * .1} ${-GAP * 1} ${-GAP * .5} ${-GAP * 1.5} ${-GAP * 1.1} ${-GAP * 1.7}Z`} />}
    </g>
  );
}

/**
 * The hero's world: one long staff that comes up from under the actions, passes behind the
 * question card and leaves at the top right, with a few notes riding it. The page's single
 * travelling clef starts on this staff and lifts into the card (see ClefTraveler).
 * Geometry is measured from the real layout, so the staff never runs through the text.
 */
export function HeroScene({ hero }: { hero: RefObject<HTMLElement | null> }) {
  const scene = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);

  // Build the ribbon from where the actions end and where the card sits.
  useEffect(() => {
    const section = hero.current, box = scene.current;
    if (!section || !box) return;
    const measure = () => {
      const s = box.getBoundingClientRect();
      const actions = section.querySelector(".lp-hero-copy .lp-actions")?.getBoundingClientRect();
      const card = section.querySelector(".hero-quiz")?.getBoundingClientRect();
      if (!actions || !card || !s.width) return;
      const w = s.width, h = s.height;
      const rel = (r: DOMRect) => ({ left: r.left - s.left, right: r.right - s.left, top: r.top - s.top, bottom: r.bottom - s.top });
      const a = rel(actions), c = rel(card);
      const wide = c.left > a.right - 40;
      let points: Point[];
      if (wide) {
        const low = Math.min(Math.max(a.bottom, c.bottom - 40) + GAP * 6, h - GAP * 3);
        points = [[-80, low + 8], [a.left + (a.right - a.left) * .4, low + GAP * .6], [c.left - 24, low - GAP * .4], [c.left + (c.right - c.left) * .55, c.top + (c.bottom - c.top) * .55], [c.right + 36, c.top + GAP * 2], [w + 120, c.top - GAP * 5]];
      } else {
        const low = Math.min(c.bottom + GAP * 6, h - GAP * 3);
        points = [[-80, low - 4], [w * .32, low + GAP * .7], [w * .7, low - GAP * .7], [w + 80, low + 2]];
      }
      setGeo((old) => {
        const d = throughPoints(points);
        return old && old.d === d && old.w === w && old.h === h ? old : { w, h, d, wide };
      });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(section);
    const card = section.querySelector(".hero-quiz");
    if (card) resize.observe(card);
    void document.fonts?.ready.then(measure);
    measure();
    return () => resize.disconnect();
  }, [hero]);

  // Where the clef waits before lifting into the card: on the ribbon, just left of the card.
  useEffect(() => {
    const p = path.current, m = marker.current, section = hero.current, box = scene.current;
    if (!geo || !p || !m || !section || !box) return;
    if (!geo.wide) { m.removeAttribute("data-clef-intro"); return; }
    const card = section.querySelector(".hero-quiz")?.getBoundingClientRect();
    if (!card) return;
    const target = card.left - box.getBoundingClientRect().left - CLEF_WIDTH_SPACES * GAP - 20;
    let lo = 0, hi = p.getTotalLength();
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (p.getPointAtLength(mid).x < target) lo = mid; else hi = mid; }
    const point = p.getPointAtLength(lo);
    Object.assign(m.style, { left: `${point.x}px`, top: `${point.y - GAP * 2}px`, height: `${GAP * 4}px` });
    m.setAttribute("data-clef-intro", "");
  }, [geo, hero]);

  // Motion: slow, paused when off screen or in a hidden tab, still under reduced motion.
  useEffect(() => {
    const box = scene.current, art = svg.current;
    if (!box || !art || !geo) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    const sync = () => {
      const run = visible && !document.hidden && !reduced.matches;
      if (run) art.unpauseAnimations(); else art.pauseAnimations();
      box.classList.toggle("is-paused", !run);
    };
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    seen.observe(box);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    sync();

    // A small, eased lean toward the pointer, only with a mouse or pen.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0, px = 0, py = 0;
    const onMove = (event: PointerEvent) => {
      if (!fine.matches || reduced.matches || event.pointerType === "touch") return;
      px = event.clientX / window.innerWidth - .5; py = event.clientY / window.innerHeight - .5;
      if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; box.style.setProperty("--sx", px.toFixed(3)); box.style.setProperty("--sy", py.toFixed(3)); });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      seen.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
      window.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [geo]);

  return (
    <div className="lp-hero-scene" ref={scene} aria-hidden="true">
      {geo && (
        <svg ref={svg} className="hero-ribbon" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} focusable="false">
          <defs><path id="hero-ribbon-path" ref={path} d={geo.d} /></defs>
          <g className="ribbon-lines">
            {[-2, -1, 0, 1, 2].map((k) => <use key={k} href="#hero-ribbon-path" y={k * GAP} />)}
          </g>
          <g className="ribbon-riders">
            {RIDERS.map((rider, i) => (
              <g key={i} transform={`translate(0 ${2 * GAP - (rider.s * GAP) / 2})`} className={rider.accent ? "rider rider--accent" : "rider"}>
                <g>
                  <animateMotion dur={`${LOOP}s`} begin={`${-(i + .5) * (LOOP / RIDERS.length)}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href="#hero-ribbon-path" />
                  </animateMotion>
                  <g transform={`scale(${rider.scale})`}><Rider kind={rider.kind} /></g>
                </g>
              </g>
            ))}
          </g>
        </svg>
      )}
      <span className="hero-clef-start" ref={marker} />
    </div>
  );
}
