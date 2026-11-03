"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ClefGlyph, CLEF_HEIGHT_SPACES, CLEF_WIDTH_SPACES } from "./music";

type Anchor = { left: number; top: number; height: number; pageTop: number; host: HTMLElement | null };

const BASE = 100; // the overlay is drawn for a 100px tall staff and scaled from there
const GLYPH = CLEF_HEIGHT_SPACES / 4; // clef height per staff height
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
/** The same turn split in two: leaving ends tilted as it waits; arriving swings through and sits upright. */
const LEAVE: P[] = [[0, 0], [0.45, -15], [1, 8]];
const ARRIVE: P[] = [[0, 8], [0.4, 25], [0.8, -8], [1, 0]];
function turn(keys: P[], e: number) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, da] = keys[i], [b, db] = keys[i + 1];
    if (e <= b) { const k = (e - a) / (b - a); return da + (db - da) * (0.5 - Math.cos(Math.PI * k) / 2); }
  }
  return keys[keys.length - 1][1];
}
const turnAt = (e: number) => turn(TURN, e);

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
    let hostTop = 0;
    let words: [number, number, number, number][] = []; // text boxes in host coordinates
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
      hostTop = hostRect.top + window.scrollY;
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
      const clefW = CLEF_WIDTH_SPACES * ((window.innerWidth >= 720 ? 64 : 48) / GLYPH / 4);
      gutter = Math.max(-hostRect.left + 8, pad - clefW - 16);
      // Text, actions and the slider, so the flight can pass under them instead of over them.
      // A whole card that is a link counts by its words, not its box, so the margin of a card stays free.
      const boxes: DOMRect[] = [];
      for (const el of host.querySelectorAll<HTMLElement>("h1, h2, h3, p, a, button, input, label, li, .pdf-handle")) {
        if (el.closest(".clef-traveler") || el.querySelector("[data-clef-anchor]") || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < 12000) { boxes.push(r); continue; }
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode(); t; t = walk.nextNode()) if (t.textContent?.trim()) { const range = document.createRange(); range.selectNodeContents(t); boxes.push(range.getBoundingClientRect()); }
      }
      words = boxes.filter((r) => r.width > 0 && r.height > 0).map((r) => [r.left - hostRect.left, r.top - hostRect.top, r.right - hostRect.left, r.bottom - hostRect.top]);
      // A card can change height without the page doing so (the hero opening its answers).
      for (const anchor of anchors) if (anchor.host) { ensureGlow(anchor.host); resize.observe(anchor.host); }
      place();
    };

    const place = () => {
      frame = 0;
      if (!anchors.length) { node.style.opacity = "0"; return; }
      const vh = window.innerHeight;
      const y = window.scrollY;
      const wide = window.innerWidth >= 720;
      const baseWidth = CLEF_WIDTH_SPACES * (BASE / 4);
      const at = (left: number, top: number, height: number, deg: number) => {
        const scale = height / BASE;
        node.style.transform = `translate3d(${left + (baseWidth * scale - baseWidth) / 2}px, ${top + (BASE * scale - BASE) / 2}px, 0) rotate(${deg}deg) scale(${scale})`;
      };
      const opening = intro < 1 && start !== null && y < anchors[0].pageTop - vh * 0.44;
      if (opening) {
        // Up first, then along the staff into its seat: a quadratic curve with its corner at (start.left, seat.top).
        const seat = anchors[0], k = smooth(intro), s = start!;
        node.style.opacity = "1";
        node.classList.toggle("is-flying", false);
        node.classList.toggle("is-intro", true);
        at(s.left + (seat.left - s.left) * k * k, s.top + (seat.top - s.top) * (1 - (1 - k) * (1 - k)), s.height + (seat.height - s.height) * k, Math.sin(Math.PI * k) * -8);
        return;
      }
      node.classList.toggle("is-intro", false);
      // The clef leaves a staff while that staff is still a little above the middle, waits in the page margin
      // in the middle of the screen at a readable size, and flies to the next staff as soon as it enters
      // the lower part of the screen (88%); it is seated when that staff reaches 60%.
      // Everything is a pure function of the scroll position, so fast or backward scrolling never jumps.
      const travel = (wide ? 64 : 48) / GLYPH; // the staff height whose clef is 64px (48px on phones) tall
      const dockTop = y + vh * 0.45 - hostTop - travel * GLYPH * 0.4;
      let from = anchors[anchors.length - 1], to = from, k = 0;
      let phase: "seat" | "leave" | "dock" | "approach" | "direct" = "seat";
      let before = -Infinity;
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i], b = anchors[i + 1];
        const l0 = a.pageTop - vh * 0.44, l1 = a.pageTop - vh * 0.14, a0 = b.pageTop - vh * 0.88, a1 = b.pageTop - vh * 0.6;
        const docked = a0 >= l1;
        const begin = Math.max(before, docked ? l0 : Math.min(l0, a0));
        if (y < begin) { from = to = a; break; }
        if (y < a1) {
          from = a; to = b;
          if (!docked) { phase = "direct"; k = (y - begin) / Math.max(1, a1 - begin); }
          else if (y < l1) { phase = "leave"; k = (y - begin) / Math.max(1, l1 - begin); }
          else if (y < a0) { phase = "dock"; k = (y - l1) / Math.max(1, a0 - l1); }
          else { phase = "approach"; k = (y - a0) / Math.max(1, a1 - a0); }
          break;
        }
        before = a1;
        from = to = b;
      }
      k = Math.min(1, Math.max(0, k));
      const e = smooth(k);
      const flyH = Math.max(travel, Math.min(from.height, to.height));
      const grow = (h0: number, h1: number, t: number) => h0 + (h1 - h0) * smooth(Math.min(1, Math.max(0, t)));
      const out = Math.min(wide ? 96 : 24, Math.max(0, from.left - gutter) * 0.6);
      const lean = Math.min(wide ? 64 : 16, Math.max(0, to.left - gutter) * 0.5);
      let left = from.left, top = from.top, height = from.height, deg = 0;
      if (phase === "leave") {
        // Sideways along its own staff line first, so it clears the card, then down into the margin.
        [left, top] = along([[from.left, from.top], [from.left - out, from.top + 10], [gutter, dockTop]], e);
        height = grow(from.height, flyH, k / 0.6);
        deg = turn(LEAVE, e);
      } else if (phase === "dock") {
        // Waiting in the margin and moving with the reader: a slow sway, never a spin.
        left = gutter + (wide ? 6 : 2) * Math.sin(Math.PI * 2 * k);
        top = dockTop;
        height = flyH;
        deg = 8 + 5 * Math.sin(Math.PI * 2 * k);
      } else if (phase === "approach") {
        const dy = to.top - dockTop;
        [left, top] = along([[gutter, dockTop], [gutter + (wide ? 10 : 2), dockTop + dy * 0.55], [to.left - lean, to.top - Math.min(28, Math.abs(dy) * 0.1)], [to.left, to.top]], e);
        height = grow(flyH, to.height, (k - 0.6) / 0.4);
        deg = turn(ARRIVE, e);
      } else if (phase === "direct") {
        const dy = to.top - from.top;
        [left, top] = along([[from.left, from.top], [from.left - out, from.top + Math.sign(dy) * Math.min(20, Math.abs(dy) * 0.04)], [gutter, from.top + dy * 0.52], [to.left - lean, to.top - Math.min(28, Math.abs(dy) * 0.08)], [to.left, to.top]], e);
        height = k < 0.5 ? grow(from.height, flyH, k / 0.3) : grow(flyH, to.height, (k - 0.65) / 0.35);
        deg = turnAt(e);
      }
      if (!wide) deg *= 0.6;
      const settled = phase === "seat";
      if (!settled && (phase !== "leave" || k > 0.5)) departed = true;
      // Fully visible all the way and in front: the path keeps to the page margin and the staff lines.
      node.style.opacity = "1";
      node.classList.toggle("is-flying", !settled);
      // Where the path would cross words it slips under that layer for those few frames only.
      const w = CLEF_WIDTH_SPACES * height / 4, g0 = top - 0.384 * height, g1 = g0 + GLYPH * height;
      const tilt = Math.abs(Math.sin(deg * Math.PI / 180)) * GLYPH * height * 0.5;
      node.classList.toggle("is-under", !settled && words.some(([l, t, r, b]) => left + w + tilt > l && left - tilt < r && g1 > t - 4 && g0 < b + 4));
      at(left, top, height, deg);
      const seat = settled ? from.host : null;
      if (seat !== lit) {
        lit?.classList.toggle("clef-lit", false);
        if (seat) {
          const hostBox = seat.getBoundingClientRect(), root = host.getBoundingClientRect();
          seat.style.setProperty("--clef-x", `${from.left - (hostBox.left - root.left) + (baseWidth * from.height / BASE) / 2}px`);
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
