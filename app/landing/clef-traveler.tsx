"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ClefGlyph, CLEF_WIDTH_SPACES } from "./music";

type Anchor = { left: number; top: number; height: number; pageTop: number; host: HTMLElement | null };

const BASE = 100; // the overlay is drawn for a 100px tall staff and scaled from there
const smooth = (t: number) => t * t * (3 - 2 * t);
type P = [number, number];

/** A point on the Catmull-Rom curve through `pts`, with u running 0..1 over the whole curve. */
function along(pts: P[], u: number): P {
  const n = pts.length - 1, x = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(x), t = x - i;
  const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

/** Tilt through the flight: leans out, swings past the edge, settles back. Degrees at fractions of the flight. */
const TURN: P[] = [[0, 0], [0.22, -15], [0.55, 25], [0.82, -8], [1, 0]];
function turnAt(e: number) {
  for (let i = 0; i < TURN.length - 1; i++) {
    const [a, da] = TURN[i], [b, db] = TURN[i + 1];
    if (e <= b) { const k = (e - a) / (b - a); return da + (db - da) * (0.5 - Math.cos(Math.PI * k) / 2); }
  }
  return 0;
}

/** Each host gets one clipped light layer: absolute, inset 0, rounded like the card, overflow hidden. */
function ensureGlow(el: HTMLElement) {
  if (el.querySelector(":scope > .clef-glow")) return;
  const glow = document.createElement("span");
  glow.className = "clef-glow";
  glow.setAttribute("aria-hidden", "true");
  glow.appendChild(document.createElement("i"));
  el.prepend(glow);
}

/**
 * One treble clef that follows the page. It sits on the staff anchors inside `root`
 * ([data-clef-anchor], ordered by data-clef-order) and travels between them as the reader scrolls.
 * Scrolling itself is never taken over: positions are read once per frame from cached geometry,
 * written straight to the element's transform, and re-measured only on resize and font load.
 */
export function ClefTraveler({ root }: { root: RefObject<HTMLElement | null> }) {
  const clef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!media.matches);
    const timer = window.setTimeout(update, 0);
    media.addEventListener("change", update);
    return () => { window.clearTimeout(timer); media.removeEventListener("change", update); };
  }, []);

  // Reduced motion: no flight, the clef stays on each staff and its card keeps a quiet, still light.
  useEffect(() => {
    const host = root.current;
    if (!host || enabled) return;
    const timer = window.setTimeout(() => {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      for (const el of host.querySelectorAll<HTMLElement>("[data-clef-host]")) { ensureGlow(el); el.classList.add("clef-still"); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enabled, root]);

  useEffect(() => {
    const host = root.current;
    const node = clef.current;
    if (!host || !node || !enabled) return;
    host.classList.add("clef-travel-on");
    let anchors: Anchor[] = [];
    let start: Anchor | null = null;
    let lit: HTMLElement | null = null;
    let lastArrival: HTMLElement | null = null;
    let departed = true; // a light plays only after a real flight, not after a small scroll wobble
    let gutter = 0;
    let frame = 0;
    // Opening move: the clef waits on the hero's ribbon (or just off the left edge on a phone)
    // and lifts onto the first staff. Skipped when the page opens scrolled.
    let intro = window.scrollY > 40 ? 1 : 0;
    let introFrame = 0;
    const introBegin = performance.now() + 650;
    const runIntro = (now: number) => {
      intro = Math.min(1, Math.max(0, (now - introBegin) / 1300));
      place();
      introFrame = intro < 1 ? window.requestAnimationFrame(runIntro) : 0;
    };

    const measure = () => {
      const hostRect = host.getBoundingClientRect();
      anchors = [...host.querySelectorAll<HTMLElement>("[data-clef-anchor]")]
        .filter((el) => el.offsetParent !== null)
        .sort((a, b) => Number(a.dataset.clefOrder ?? 0) - Number(b.dataset.clefOrder ?? 0))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { left: rect.left - hostRect.left, top: rect.top - hostRect.top, height: rect.height, pageTop: rect.top + window.scrollY, host: el.closest<HTMLElement>("[data-clef-host]") };
        });
      const ribbon = host.querySelector<HTMLElement>("[data-clef-intro]");
      if (ribbon) {
        const rect = ribbon.getBoundingClientRect();
        start = { left: rect.left - hostRect.left, top: rect.top - hostRect.top, height: rect.height, pageTop: 0, host: null };
      } else if (anchors[0]) {
        start = { ...anchors[0], left: -CLEF_WIDTH_SPACES * anchors[0].height / 4 - 24, host: null };
      }
      // The flight's outer arc runs through the page margin, outside the text column.
      const pad = parseFloat(getComputedStyle(host).paddingLeft) || 16;
      const clefW = CLEF_WIDTH_SPACES * ((anchors[0]?.height ?? 60) / 4);
      gutter = Math.max(-hostRect.left + 10, pad - clefW - 22);
      // A card can change height without the page doing so (the hero opening its answers).
      for (const anchor of anchors) if (anchor.host) { ensureGlow(anchor.host); resize.observe(anchor.host); }
      place();
    };

    const place = () => {
      frame = 0;
      if (!anchors.length) { node.style.opacity = "0"; return; }
      const vh = window.innerHeight;
      const y = window.scrollY;
      // Each anchor holds the clef while its staff is in the reading part of the screen.
      const stops = anchors.map((a, i) => ({ a, arrive: i === 0 ? -Infinity : a.pageTop - vh * 0.84, leave: a.pageTop - vh * 0.14 }));
      for (let i = 0; i < stops.length - 1; i++) {
        if (stops[i].leave > stops[i + 1].arrive) {
          const mid = (stops[i].leave + stops[i + 1].arrive) / 2;
          stops[i].leave = mid; stops[i + 1].arrive = mid;
        }
      }
      let from = stops[stops.length - 1].a, to = from, t = 0;
      for (let i = 0; i < stops.length; i++) {
        if (y <= stops[i].leave) { from = to = stops[i].a; break; }
        const next = stops[i + 1];
        if (next && y < next.arrive) { from = stops[i].a; to = next.a; t = (y - stops[i].leave) / (next.arrive - stops[i].leave); break; }
      }
      const e = smooth(Math.min(1, Math.max(0, t)));
      const opening = intro < 1 && from === to && from === anchors[0] && start !== null;
      if (opening) {
        // Up first, then along the staff into its seat: a quadratic curve with its corner at (start.left, seat.top).
        const k = smooth(intro), s = start!;
        const left = s.left + (from.left - s.left) * k * k;
        const top = s.top + (from.top - s.top) * (1 - (1 - k) * (1 - k));
        const height = s.height + (from.height - s.height) * k;
        const scale = height / BASE, baseWidth = CLEF_WIDTH_SPACES * (BASE / 4);
        node.style.opacity = "1";
        node.classList.toggle("is-flying", false);
        node.classList.toggle("is-intro", true);
        node.style.transform = `translate3d(${left + (baseWidth * scale - baseWidth) / 2}px, ${top + (BASE * scale - BASE) / 2}px, 0) rotate(${Math.sin(Math.PI * k) * -8}deg) scale(${scale})`;
        return;
      }
      node.classList.toggle("is-intro", false);
      const settled = from === to;
      const wide = window.innerWidth >= 720;
      // An S-curve through four meaningful points: lean out, the outer arc in the page margin, the approach.
      const dy = to.top - from.top;
      const out = Math.min(wide ? 110 : 40, Math.max(0, from.left - gutter) * 0.7);
      const path: P[] = settled ? [[from.left, from.top]] : [
        [from.left, from.top],
        // Leave sideways along the staff line, so the clef clears its own card before it drops.
        [from.left - out * 1.25, from.top + Math.sign(dy) * Math.min(24, Math.abs(dy) * 0.04)],
        [gutter, from.top + dy * 0.52],
        [to.left - Math.min(wide ? 70 : 18, Math.max(0, to.left - gutter) * 0.5), to.top - Math.min(48, Math.abs(dy) * 0.08)],
        [to.left, to.top],
      ];
      const [left, top] = settled ? path[0] : along(path, e);
      // Scale follows the staff sizes, with a small lift mid-flight; never a tumble.
      const scale = (from.height + (to.height - from.height) * e) / BASE * (1 + (settled ? 0 : 0.1 * Math.sin(Math.PI * e)));
      const turn = settled ? 0 : turnAt(e) * (wide ? 1 : 0.45);
      const baseWidth = CLEF_WIDTH_SPACES * (BASE / 4);
      if (!settled && e > 0.5) departed = true;
      // In flight the clef thins out and passes behind the sections, so it never sits on text.
      // It stays above while leaving and arriving, so the layer change happens over its own staff.
      node.style.opacity = settled ? "1" : (1 - .7 * Math.sin(Math.PI * e)).toFixed(3);
      node.classList.toggle("is-flying", !settled && e > .16 && e < .84);
      node.style.transform = `translate3d(${left + (baseWidth * scale - baseWidth) / 2}px, ${top + (BASE * scale - BASE) / 2}px, 0) rotate(${turn}deg) scale(${scale})`;
      const seat = settled ? from.host : null;
      if (seat !== lit) {
        lit?.classList.toggle("clef-lit", false);
        if (seat) {
          const hostBox = seat.getBoundingClientRect(), root = host.getBoundingClientRect();
          seat.style.setProperty("--clef-x", `${from.left - (hostBox.left - root.left) + (baseWidth * scale) / 2}px`);
          seat.style.setProperty("--clef-y", `${from.top - (hostBox.top - root.top) + from.height / 2}px`);
          seat.classList.toggle("clef-lit", true);
          // One soft arrival light after a real flight; a small scroll back and forth does not replay it.
          if (departed || seat !== lastArrival) {
            seat.classList.toggle("clef-arrive", false);
            void seat.offsetWidth;
            seat.classList.toggle("clef-arrive", true);
            window.setTimeout(() => seat.classList.toggle("clef-arrive", false), 700);
            lastArrival = seat; departed = false;
          }
        }
        lit = seat;
      }
    };

    // Content above a staff can change height (a hint, a panel); re-measure once scrolling settles.
    let settle = 0;
    const onScroll = () => {
      if (intro < 1 && window.scrollY > 4) { intro = 1; if (introFrame) window.cancelAnimationFrame(introFrame); introFrame = 0; }
      if (!frame) frame = window.requestAnimationFrame(place);
      window.clearTimeout(settle);
      settle = window.setTimeout(measure, 160);
    };
    const resize = new ResizeObserver(() => measure());
    resize.observe(host);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    measure();
    if (intro < 1) introFrame = window.requestAnimationFrame(runIntro);

    return () => {
      host.classList.remove("clef-travel-on");
      lit?.classList.toggle("clef-lit", false);
      resize.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      if (frame) window.cancelAnimationFrame(frame);
      if (introFrame) window.cancelAnimationFrame(introFrame);
      window.clearTimeout(settle);
    };
  }, [enabled, root]);

  return (
    <div ref={clef} className="clef-traveler" aria-hidden="true" hidden={!enabled}
      style={{ width: CLEF_WIDTH_SPACES * (BASE / 4), height: BASE }}>
      <ClefGlyph />
    </div>
  );
}
