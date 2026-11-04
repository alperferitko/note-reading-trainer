"use client";
import { useEffect, useRef } from "react";
import { CLEF_PATH } from '@/lib/clef-path.mjs';
import { SITE_PAGES, pageRoute } from '@/lib/site-routes.mjs';
import { BrandWordmark } from './palette-tools';
import { NoteHead } from './landing/music';

type Locale = 'tr' | 'en';
type FooterTarget = keyof typeof SITE_PAGES;
type Group = { title: [string, string]; links: [FooterTarget, [string, string]?][] };

// Only pages that exist on the site; no social accounts or placeholder links.
const GROUPS: Group[] = [
  { title: ['Çalış', 'Practise'], links: [['practice', ['Stüdyolar', 'Studios']], ['lessons', ['Kısa dersler', 'Short lessons']]] },
  { title: ['NotaNota', 'NotaNota'], links: [['about'], ['how'], ['teacher'], ['pricing', ['Fiyatlandırma', 'Pricing']], ['roadmap']] },
  { title: ['Destek ve yasal', 'Support and legal'], links: [['contact'], ['faq', ['Yardım ve SSS', 'Help and FAQ']], ['privacy'], ['kvkk', ['KVKK aydınlatma', 'KVKK notice']], ['terms'], ['cookies', ['Çerezler ve depolama', 'Cookies and storage']], ['copyright']] },
];

/**
 * The footer is one painted scene: the painting fills it, the brand and the links sit in its sky as
 * real text, and a golden staff with a clef runs over the lake with notes gliding along it.
 * The picture and the staff are decoration.
 */
export function SiteFooter({ locale, motto, homeLabel, onNavigate }: {
  locale: Locale; palette?: string; motto: string; homeLabel: string; onNavigate: (target: FooterTarget) => void;
}) {
  const i = locale === 'tr' ? 0 : 1;
  const footer = useRef<HTMLElement>(null);

  // The floating header follows the page only until the footer: the footer's top edge pushes it up and
  // out, so it never sits on the painting; scrolling back up brings it down the same way. On phones the
  // bottom tab bar fades out as the footer comes up (its links are in the footer too) and the chat
  // button follows it down. Geometry is measured only when sizes change; a scroll frame reads nothing
  // but scrollY and writes only transforms and opacity, so it never forces a layout.
  useEffect(() => {
    const box = footer.current;
    if (!box) return;
    let frame = 0;
    let footerTop = 0;
    let bars: { el: HTMLElement; reach: number }[] = [];
    let tabs: { el: HTMLElement; height: number } | null = null;
    let chat: { el: HTMLElement; bottom: number } | null = null;
    const place = () => {
      frame = 0;
      const top = footerTop - window.scrollY;
      for (const bar of bars) {
        const push = Math.max(0, Math.min(bar.reach + 24, bar.reach - top));
        const value = push ? `0 ${(-push).toFixed(1)}px` : '';
        if (bar.el.style.translate !== value) bar.el.style.translate = value;
      }
      const rise = Math.max(0, window.innerHeight - top);
      const gone = tabs ? Math.min(1, rise / tabs.height) : 0;
      if (tabs) {
        const opacity = gone ? String(1 - gone) : '';
        if (tabs.el.style.opacity !== opacity) tabs.el.style.opacity = opacity;
        tabs.el.style.visibility = gone >= 1 ? 'hidden' : '';
        tabs.el.style.pointerEvents = gone > 0.5 ? 'none' : '';
      }
      if (chat) {
        const drop = tabs && rise ? Math.max(0, Math.min(rise, tabs.height, window.innerHeight - 16 - chat.bottom)) : 0;
        const value = drop ? `0 ${drop.toFixed(1)}px` : '';
        if (chat.el.style.translate !== value) chat.el.style.translate = value;
      }
    };
    const measure = () => {
      // Read the untouched layout: our own offsets are cleared first, then put back by place().
      const found = [...document.querySelectorAll<HTMLElement>('.site-header--float')];
      const chatEl = document.querySelector<HTMLElement>('.chat-bubble');
      for (const el of [...found, ...(chatEl ? [chatEl] : [])]) el.style.translate = '';
      footerTop = box.getBoundingClientRect().top + window.scrollY;
      bars = found.flatMap((el) => {
        const style = getComputedStyle(el);
        return style.position === 'sticky' || style.position === 'fixed' ? [{ el, reach: (parseFloat(style.top) || 0) + el.offsetHeight + 12 }] : [];
      });
      const tabsEl = document.querySelector<HTMLElement>('.mobile-module-navigation');
      tabs = tabsEl && getComputedStyle(tabsEl).display !== 'none' ? { el: tabsEl, height: tabsEl.offsetHeight + 8 } : null;
      if (tabsEl && !tabs) { tabsEl.style.opacity = ''; tabsEl.style.visibility = ''; tabsEl.style.pointerEvents = ''; }
      chat = chatEl ? { el: chatEl, bottom: chatEl.getBoundingClientRect().bottom } : null;
      // The page keeps room at the bottom for the tab bar; the footer's painting reaches into it instead.
      const room = tabs && box.parentElement ? `${-(parseFloat(getComputedStyle(box.parentElement).paddingBottom) || 0)}px` : '';
      if (box.style.marginBottom !== room) box.style.marginBottom = room;
      place();
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(place); };
    let pending = 0;
    const remeasure = () => { if (!pending) pending = window.requestAnimationFrame(() => { pending = 0; measure(); }); };
    const sizes = new ResizeObserver(remeasure);
    sizes.observe(document.body);
    sizes.observe(box);
    // The chat button and the tab bar mount after the footer; measure again when they appear.
    const mounts = new MutationObserver(remeasure);
    mounts.observe(document.body, { childList: true, subtree: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', remeasure);
    measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', remeasure);
      sizes.disconnect(); mounts.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (pending) window.cancelAnimationFrame(pending);
      for (const el of document.querySelectorAll<HTMLElement>('.site-header--float, .mobile-module-navigation, .chat-bubble')) {
        el.style.translate = ''; el.style.opacity = ''; el.style.visibility = ''; el.style.pointerEvents = '';
      }
    };
  }, []);

  const go = (target: FooterTarget) => (event: React.MouseEvent) => { event.preventDefault(); onNavigate(target); };
  return (
    <footer className="site-footer" ref={footer}>
      {/* Decorative only: every word and link is the real text below. Day and night are two paintings of
          the same view, crossfaded with the theme. */}
      <div className="site-footer-scene" aria-hidden="true">
        <div className="scene-land scene-land--day" />
        <div className="scene-land scene-land--night" />
        <FooterStaff />
      </div>
      <div className="site-footer-sky">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <a className="site-footer-home" href={pageRoute('landing', locale)} onClick={go('landing')} aria-label={homeLabel}>
              <BrandWordmark className="footer-wordmark" />
            </a>
            <p className="site-footer-motto">{motto}</p>
            <p className="site-footer-about">{SITE_PAGES.about[locale][1]}</p>
          </div>
          <nav className="site-footer-groups" aria-label={locale === 'tr' ? 'Site bağlantıları' : 'Site links'}>
            {GROUPS.map((group) => (
              <section key={group.title[1]} className="site-footer-group" aria-labelledby={`footer-${group.title[1].replace(/\W+/g, '-')}`}>
                <h2 id={`footer-${group.title[1].replace(/\W+/g, '-')}`}>{group.title[i]}</h2>
                <ul>
                  {group.links.map(([target, label]) => (
                    <li key={target}><a href={pageRoute(target, locale)} onClick={go(target)}>{label ? label[i] : SITE_PAGES[target][locale][0]}</a></li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </div>
        <div className="site-footer-legal">
          <span>© 2026 NotaNota</span>
          <a href={`${pageRoute('kvkk', locale)}#basvuru`} onClick={(event) => { go('kvkk')(event); window.setTimeout(() => document.getElementById('basvuru')?.scrollIntoView({ block: 'start' }), 80); }}>{locale === 'tr' ? 'Veri talebi ve hesap silme' : 'Data requests and account deletion'}</a>
        </div>
      </div>
    </footer>
  );
}

/* ---------- The golden staff over the lake ---------- */

const GAP = 12; // one staff space, in painting units (the painting is 1536 x 1024)
// The middle line of the staff: level where the clef sits, then a slow swell across the water.
const WAVE = 'M196 790C360 790 450 752 640 766C830 780 930 820 1110 800C1280 782 1390 748 1600 764';
type Rider = { kind: 'quarter' | 'eighth' | 'half' | 'pair'; s: number };
/** `s` is the staff step above the bottom line. */
const RIDERS: Rider[] = [{ kind: 'quarter', s: 4 }, { kind: 'eighth', s: 6 }, { kind: 'half', s: 3 }, { kind: 'pair', s: 5 }, { kind: 'quarter', s: 2 }, { kind: 'eighth', s: 7 }];
const LOOP = 44; // seconds for a note to cross the whole staff

function Head({ x = 0, y = 0, open = false }: { x?: number; y?: number; open?: boolean }) {
  return <NoteHead x={x} y={y} space={GAP} kind={open ? 'half' : 'black'} />;
}

function RiderGlyph({ kind }: { kind: Rider['kind'] }) {
  const stem = GAP * 3.3, sx = GAP * .6;
  if (kind === 'pair') {
    const dx = GAP * 2.2, dy = -GAP / 2;
    return (
      <g>
        <Head /><Head x={dx} y={dy} />
        <path d={`M${sx} 0V${-stem}M${dx + sx} ${dy}V${-stem - GAP * .5}`} className="fs-stem" />
        <path d={`M${sx - .8} ${-stem}L${dx + sx + .8} ${-stem - GAP * .5}V${-stem}L${sx - .8} ${-stem + GAP * .5}Z`} />
      </g>
    );
  }
  return (
    <g>
      <Head open={kind === 'half'} />
      <path d={`M${sx} 0V${-stem}`} className="fs-stem" />
      {kind === 'eighth' && <path d={`M${sx} ${-stem}c${GAP * .2} ${GAP * 1.1} ${GAP * 1.5} ${GAP * 1.2} ${GAP * 1.1} ${GAP * 2.6}c${GAP * .1} ${-GAP} ${-GAP * .5} ${-GAP * 1.5} ${-GAP * 1.1} ${-GAP * 1.7}Z`} />}
    </g>
  );
}

/**
 * Drawn in the painting's coordinates and cropped exactly like it (cover, anchored at the bottom).
 * The still staff and clef carry the big glow and are painted once. Each gliding note is its own small
 * layer: drawn and lit once, then only moved, turned and faded, so the motion never repaints anything.
 */
function FooterStaff() {
  return (
    <>
      <svg className="footer-staff footer-staff--still" viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMax slice" focusable="false">
        <defs><path id="footer-wave" d={WAVE} /></defs>
        <g className="fs-lines">{[-2, -1, 0, 1, 2].map((k) => <use key={k} href="#footer-wave" y={k * GAP} />)}</g>
        {/* The clef that opens the staff, its curl on the G line (one space above the bottom line). */}
        <path className="fs-clef" d={CLEF_PATH} transform={`translate(212 ${790 + GAP}) scale(${GAP / 335})`} />
      </svg>
      <FooterRiders />
    </>
  );
}

// Each note's drawing box around its head (the head is at 0,0), in painting units.
const RIDER_BOX = { left: -40, top: -60, width: 110, height: 90 };

/**
 * The notes glide along the staff's middle line, each at its own staff step, turning with the line's
 * local direction (head, stem and flag together). They appear after the clef and fade before the far edge.
 * They stop, spread along the staff, while the footer is off screen, the tab is hidden or motion is reduced.
 */
function FooterRiders() {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = layer.current;
    const path = document.getElementById('footer-wave') as SVGPathElement | null;
    if (!box || !path) return;
    const notes = [...box.children] as HTMLElement[];
    const length = path.getTotalLength();
    const progress = RIDERS.map((_, n) => ((n + .5) / RIDERS.length) % 1);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scale = 1, offX = 0, offY = 0, visible = false, frame = 0, last = 0;
    // The same mapping as preserveAspectRatio="xMidYMax slice", from layout sizes (a phone's zoom transform
    // on the scene applies to this layer as a whole).
    const measure = () => {
      const width = box.offsetWidth, height = box.offsetHeight;
      scale = Math.max(width / 1536, height / 1024);
      offX = (width - 1536 * scale) / 2;
      offY = height - 1024 * scale;
    };
    const fade = (x: number) => Math.max(0, Math.min(1, (x / 1536 - .15) / .07, (.99 - x / 1536) / .09));
    const draw = () => {
      notes.forEach((note, n) => {
        const at = progress[n] * length;
        const p = path.getPointAtLength(at);
        const ahead = path.getPointAtLength(Math.min(length, at + 4)), behind = path.getPointAtLength(Math.max(0, at - 4));
        const angle = Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180 / Math.PI;
        const x = offX + p.x * scale, y = offY + (p.y + 2 * GAP - (RIDERS[n].s * GAP) / 2) * scale;
        note.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${angle.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
        note.style.opacity = fade(p.x).toFixed(2);
      });
    };
    const tick = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      for (let n = 0; n < progress.length; n++) progress[n] = (progress[n] + dt / LOOP) % 1;
      draw();
      frame = window.requestAnimationFrame(tick);
    };
    const sync = () => {
      const run = visible && !document.hidden && !reduced.matches;
      if (run && !frame) { last = 0; frame = window.requestAnimationFrame(tick); }
      if (!run && frame) { window.cancelAnimationFrame(frame); frame = 0; }
      if (!run) draw();
    };
    const sizes = new ResizeObserver(() => { measure(); draw(); });
    sizes.observe(box);
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    seen.observe(box);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    measure();
    sync();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      sizes.disconnect(); seen.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
    };
  }, []);
  return (
    <div className="footer-riders" ref={layer}>
      {RIDERS.map((rider, n) => (
        <span key={n} className="footer-rider">
          <svg viewBox={`${RIDER_BOX.left} ${RIDER_BOX.top} ${RIDER_BOX.width} ${RIDER_BOX.height}`} width={RIDER_BOX.width} height={RIDER_BOX.height}
            style={{ left: RIDER_BOX.left, top: RIDER_BOX.top }} focusable="false"><RiderGlyph kind={rider.kind} /></svg>
        </span>
      ))}
    </div>
  );
}
