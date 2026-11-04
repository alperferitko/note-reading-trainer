"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ClefGlyph, CLEF_HEIGHT_SPACES, CLEF_WIDTH_SPACES } from "./music";

type Anchor = { left: number; top: number; height: number; pageTop: number; host: HTMLElement | null };

const BASE = 100; // the overlay is drawn for a 100px tall staff and scaled from there
const GLYPH = CLEF_HEIGHT_SPACES / 4; // clef height per staff height
const smooth = (t: number) => t * t * (3 - 2 * t);
type P = [number, number];

/** One Catmull-Rom segment from p1 to p2, t running 0..1. */
function catmull(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

/** Where a leg starts and ends: the clef leaves a staff when it has risen to 32% of the screen and is
 * seated on the next one when that staff reaches 64%, so a seated clef stays put over a third of a screen. */
const LEAVE_AT = 0.32;
const ARRIVE_AT = 0.64;
/** Preferred stops across the page width, taken in turn, so each leg passes a different open space. */
const STOPS = [0.5, 0.86, 0.14, 0.68, 0.32];
type Key = { s: number; x: number; y: number };
type Leg = { keys: Key[]; from: Anchor; to: Anchor; fly: number };
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

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
    let legs: Leg[] = [];
    let start: Anchor | null = null;
    let startAngle = 0;
    let lit: HTMLElement | null = null;
    let lastArrival: HTMLElement | null = null;
    let departed = true; // a light plays only after a real flight, not after a small scroll wobble
    let hostTop = 0;
    let hostLeft = 0;
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
      hostLeft = hostRect.left;
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
        startAngle = Number(ribbon.dataset.clefAngle) || 0;
      } else if (anchors[0]) {
        start = { ...anchors[0], left: -CLEF_WIDTH_SPACES * anchors[0].height / 4 - 24, host: null };
      }
      // Words, actions, the slider and the score: the stops between staves are chosen clear of them.
      // A whole card that is a link counts by its words, not its box, so the margin of a card stays free.
      const boxes: DOMRect[] = [];
      for (const el of host.querySelectorAll<HTMLElement>("h1, h2, h3, p, a, button, input, label, li, .pdf-frame, .chat-msg, .ai-suggest, .chat-form")) {
        if (el.closest(".clef-traveler") || el.querySelector("[data-clef-anchor]") || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < 12000 || el.matches(".pdf-frame, .chat-msg, .ai-suggest, .chat-form")) { boxes.push(r); continue; }
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode(); t; t = walk.nextNode()) if (t.textContent?.trim()) { const range = document.createRange(); range.selectNodeContents(t); boxes.push(range.getBoundingClientRect()); }
      }
      const words = boxes.filter((r) => r.width > 0 && r.height > 0).map((r) => [r.left - hostRect.left, r.top - hostRect.top, r.right - hostRect.left, r.bottom - hostRect.top]);

      // Each leg is a few keyframes, every one tied to a scroll position: leave the staff, pass one or two
      // open spaces near the middle of the screen, sit on the next staff. Stops are placed in page space,
      // so the same scroll position always gives the same place, forwards or back.
      const vh = window.innerHeight, wide = window.innerWidth >= 720;
      const travel = (wide ? 64 : 52) / GLYPH; // the staff height whose clef is 64px (52px on phones) tall
      const minX = -hostRect.left + 6;
      legs = [];
      let previous = -Infinity;
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i], b = anchors[i + 1];
        const fly = Math.max(travel, (a.height + b.height) / 2 * 0.9);
        const flyW = CLEF_WIDTH_SPACES * fly / 4, glyphH = GLYPH * fly;
        const maxX = window.innerWidth - hostRect.left - flyW - 6;
        const s0 = Math.max(previous + 1, a.pageTop - vh * LEAVE_AT);
        const s1 = Math.max(s0 + vh * 0.22, b.pageTop - vh * ARRIVE_AT);
        const keys: Key[] = [{ s: s0, x: a.left, y: a.top }];
        const stops = Math.max(1, Math.min(wide ? 3 : 2, Math.round((s1 - s0) / (vh * (wide ? 0.42 : 0.6)))));
        const clear = (x: number, y: number) => {
          const g0 = y - 0.384 * fly - 14, g1 = g0 + glyphH + 28;
          return !words.some(([l, t, r, bt]) => x + flyW + 14 > l && x - 14 < r && g1 > t && g0 < bt);
        };
        const xs: number[] = [];
        for (let x = minX; x <= maxX; x += 16) xs.push(x);
        let prevX = a.left;
        for (let j = 1; j <= stops; j++) {
          const s = s0 + (s1 - s0) * j / (stops + 1);
          const y = s - hostTop + vh * 0.5 - fly / 2; // the middle of the screen at that scroll position
          const want = minX + (maxX - minX) * STOPS[(i * 2 + j - 1) % STOPS.length];
          // The open spot closest to the wished one, without long sideways sweeps from the last stop and
          // within a quarter screen of the middle (gaps between a heading and a card count too).
          // Candidates are ranked by that cost; the first whose way in (and, for the last stop, way out to the
          // staff) also stays clear of words wins, so the path between stops does not cross text either.
          // A stop too far from the last one for the scroll between them would make the clef rush: on screen
          // it may cover about the scrolled distance, anything beyond costs heavily.
          const from = keys[keys.length - 1];
          const budget = (s - from.s) * 0.9;
          const ranked: [number, number, number][] = [];
          for (let dy = -vh * 0.24; dy <= vh * 0.24; dy += 24) {
            for (const x of xs) {
              const onScreen = Math.hypot(x - from.x, y + dy - from.y - (s - from.s));
              ranked.push([Math.abs(x - want) + 0.6 * Math.abs(x - prevX) + 1.2 * Math.abs(dy) + 3 * Math.max(0, onScreen - budget), x, y + dy]);
            }
          }
          ranked.sort((p, q) => p[0] - q[0]);
          const way = (x0: number, y0: number, x1: number, y1: number) => {
            for (let k = 1; k < 8; k++) { const t = k / 8; if (!clear(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
            return true;
          };
          let best: [number, number] = [Math.min(maxX, Math.max(minX, want)), y], fallback: [number, number] | null = null;
          for (const [, x, cy] of ranked) {
            if (!clear(x, cy)) continue;
            fallback ??= [x, cy];
            if (way(from.x, from.y, x, cy) && (j < stops || way(x, cy, b.left, b.top))) { best = [x, cy]; fallback = null; break; }
          }
          if (fallback) best = fallback;
          prevX = best[0];
          keys.push({ s, x: best[0], y: best[1] });
        }
        keys.push({ s: s1, x: b.left, y: b.top });
        legs.push({ keys, from: a, to: b, fly });
        previous = s1;
      }
      // A card can change height without the page doing so (the hero opening its answers).
      for (const anchor of anchors) if (anchor.host) { ensureGlow(anchor.host); resize.observe(anchor.host); }
      place();
    };

    const baseWidth = CLEF_WIDTH_SPACES * (BASE / 4);
    const at = (left: number, top: number, height: number, deg: number) => {
      const scale = height / BASE;
      node.style.transform = `translate3d(${left + (baseWidth * scale - baseWidth) / 2}px, ${top + (BASE * scale - BASE) / 2}px, 0) rotate(${deg}deg) scale(${scale})`;
    };
    /** Position and size on a leg at scroll s: the first stretch eases out of the seat, the last slows into the next. */
    const onLeg = (leg: Leg, s: number): [number, number, number] => {
      const { keys } = leg, last = keys.length - 2;
      let m = 0;
      while (m < last && s >= keys[m + 1].s) m++;
      const raw = Math.min(1, Math.max(0, (s - keys[m].s) / Math.max(1, keys[m + 1].s - keys[m].s)));
      const t = m === 0 ? easeIn(raw) : m === last ? easeOut(raw) : raw;
      const pt = (k: Key): P => [k.x, k.y];
      const [x, y] = catmull(pt(keys[m - 1] ?? keys[m]), pt(keys[m]), pt(keys[m + 1]), pt(keys[m + 2] ?? keys[m + 1]), t);
      const h = m === 0 ? leg.from.height + (leg.fly - leg.from.height) * smooth(Math.min(1, raw * 1.6))
        : m === last ? leg.fly + (leg.to.height - leg.fly) * smooth(Math.max(0, raw * 1.6 - 0.6)) : leg.fly;
      return [x, y, h];
    };

    const place = () => {
      frame = 0;
      if (!anchors.length) { node.style.opacity = "0"; return; }
      const vh = window.innerHeight;
      const y = window.scrollY;
      const wide = window.innerWidth >= 720;
      node.style.opacity = "1";
      const opening = intro < 1 && start !== null && y < anchors[0].pageTop - vh * LEAVE_AT;
      if (opening) {
        // Up first, then along the staff into its seat: a quadratic curve with its corner at (start.left, seat.top).
        const seat = anchors[0], k = smooth(intro), s = start!;
        node.classList.toggle("is-flying", false);
        node.classList.toggle("is-intro", true);
        at(s.left + (seat.left - s.left) * k * k, s.top + (seat.top - s.top) * (1 - (1 - k) * (1 - k)), s.height + (seat.height - s.height) * k, startAngle * (1 - k) + Math.sin(Math.PI * k) * -8);
        return;
      }
      node.classList.toggle("is-intro", false);
      // Everything is a pure function of the scroll position, so fast or backward scrolling never jumps.
      let seat: Anchor = anchors[anchors.length - 1];
      let leg: Leg | null = null;
      for (const candidate of legs) {
        if (y < candidate.keys[0].s) { seat = candidate.from; break; }
        if (y < candidate.keys[candidate.keys.length - 1].s) { leg = candidate; break; }
        seat = candidate.to;
      }
      let left = seat.left, top = seat.top, height = seat.height, deg = 0;
      if (leg) {
        [left, top, height] = onLeg(leg, y);
        // Never off screen in flight: the curve between stops may swing wide, the clef stays in view.
        const glyph = GLYPH * height;
        const screenTop = top - 0.384 * height + hostTop - y;
        top += Math.max(0, 84 - screenTop) - Math.max(0, screenTop + glyph - (vh - 12));
        left = Math.min(Math.max(left, -hostLeft + 4), window.innerWidth - hostLeft - CLEF_WIDTH_SPACES * height / 4 - 4);
        // Lean into the sideways motion, never more than a light tilt; upright again on arrival.
        const [ahead] = onLeg(leg, y + 10), [behind] = onLeg(leg, y - 10);
        deg = Math.max(-18, Math.min(18, (ahead - behind) / 2));
        const span = leg.keys[leg.keys.length - 1].s - leg.keys[0].s;
        if ((y - leg.keys[0].s) / span > 0.25) departed = true;
      }
      if (!wide) deg *= 0.7;
      const settled = leg === null;
      // Always fully visible and in front: the stops keep clear of words, so nothing has to slip under a card.
      node.classList.toggle("is-flying", !settled);
      at(left, top, height, deg);
      const seatHost = settled ? seat.host : null;
      if (seatHost !== lit) {
        lit?.classList.toggle("clef-lit", false);
        lit?.removeAttribute("data-clef-seated");
        if (seatHost) {
          const hostBox = seatHost.getBoundingClientRect(), root = host.getBoundingClientRect();
          seatHost.style.setProperty("--clef-x", `${seat.left - (hostBox.left - root.left) + (baseWidth * seat.height / BASE) / 2}px`);
          seatHost.style.setProperty("--clef-y", `${seat.top - (hostBox.top - root.top) + seat.height / 2}px`);
          seatHost.classList.toggle("clef-lit", true);
          seatHost.setAttribute("data-clef-seated", "");
          // One soft arrival light after a real flight; a small scroll back and forth does not replay it.
          if (departed || seatHost !== lastArrival) {
            seatHost.classList.toggle("clef-arrive", false);
            void seatHost.offsetWidth;
            seatHost.classList.toggle("clef-arrive", true);
            window.setTimeout(() => seatHost.classList.toggle("clef-arrive", false), 700);
            lastArrival = seatHost; departed = false;
          }
          // The card may react to its clef (the AI sample answers only once the clef is in place).
          seatHost.dispatchEvent(new CustomEvent("clef-seated"));
        }
        lit = seatHost;
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
      lit?.removeAttribute("data-clef-seated");
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
