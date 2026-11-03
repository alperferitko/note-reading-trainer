"use client";
import { useEffect, useRef, type RefObject } from "react";
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
  const art = useRef<SVGSVGElement>(null);

  // The gliding notes stop while the footer is off screen, the tab is hidden or motion is reduced;
  // stopped, they stay spread along the staff as a still picture.
  useEffect(() => {
    const box = footer.current, svg = art.current;
    if (!box || !svg) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const sync = () => {
      const run = visible && !document.hidden && !reduced.matches;
      if (run) svg.unpauseAnimations(); else svg.pauseAnimations();
      box.classList.toggle('is-paused', !run);
    };
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    seen.observe(box);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    sync();
    return () => { seen.disconnect(); document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync); };
  }, []);

  // The floating header follows the page only until the footer: the footer's top edge pushes it up and
  // out, so it never sits on the painting. Scrolling back up brings it down with the same motion.
  useEffect(() => {
    const box = footer.current;
    if (!box) return;
    let frame = 0;
    const bars = () => [...document.querySelectorAll<HTMLElement>('.site-header--float')];
    const place = () => {
      frame = 0;
      const top = box.getBoundingClientRect().top;
      for (const bar of bars()) {
        const style = getComputedStyle(bar);
        if (style.position !== 'sticky' && style.position !== 'fixed') { bar.style.translate = ''; continue; }
        const bottom = (parseFloat(style.top) || 0) + bar.offsetHeight + 12;
        const push = Math.max(0, Math.min(bottom + 24, bottom - top));
        bar.style.translate = push ? `0 ${-push}px` : '';
      }
      // On phones the bottom tab bar slides down out of the way as the footer comes up, so it never covers
      // the footer's links (they hold the same destinations); the chat button follows it down.
      const rise = Math.max(0, window.innerHeight - top);
      const tabs = document.querySelector<HTMLElement>('.mobile-module-navigation');
      const tabsShown = tabs && getComputedStyle(tabs).display !== 'none' ? tabs.offsetHeight + 8 : 0;
      if (tabs) tabs.style.translate = tabsShown && rise ? `0 ${Math.min(rise, tabsShown)}px` : '';
      // The page keeps room at the bottom for that bar; the footer's painting reaches into it instead.
      const room = tabsShown && box.parentElement ? `${-(parseFloat(getComputedStyle(box.parentElement).paddingBottom) || 0)}px` : '';
      if (box.style.marginBottom !== room) box.style.marginBottom = room;
      const chat = document.querySelector<HTMLElement>('.chat-bubble');
      if (chat) chat.style.translate = tabsShown && rise ? `0 ${Math.min(rise, tabsShown)}px` : '';
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(place); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    place();
    return () => {
      window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      for (const el of [...bars(), ...document.querySelectorAll<HTMLElement>('.mobile-module-navigation, .chat-bubble')]) el.style.translate = '';
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
        <FooterStaff svg={art} />
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

/** Drawn in the painting's coordinates and cropped exactly like it (cover, anchored at the bottom). */
function FooterStaff({ svg }: { svg: RefObject<SVGSVGElement | null> }) {
  return (
    <svg ref={svg} className="footer-staff" viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMax slice" focusable="false">
      <defs>
        <path id="footer-wave" d={WAVE} />
        {/* Notes appear just after the clef and fade out at the far edge before they loop. */}
        <linearGradient id="footer-fade" x1="0" x2="1536" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0.15" stopColor="#fff" stopOpacity="0" /><stop offset="0.22" stopColor="#fff" />
          <stop offset="0.9" stopColor="#fff" /><stop offset="0.99" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="footer-riders-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><rect width="1536" height="1024" fill="url(#footer-fade)" /></mask>
      </defs>
      <g className="fs-lines">{[-2, -1, 0, 1, 2].map((k) => <use key={k} href="#footer-wave" y={k * GAP} />)}</g>
      {/* The clef that opens the staff, its curl on the G line (one space above the bottom line). */}
      <path className="fs-clef" d={CLEF_PATH} transform={`translate(212 ${790 + GAP}) scale(${GAP / 335})`} />
      <g className="fs-riders" mask="url(#footer-riders-mask)">
        {RIDERS.map((rider, n) => (
          <g key={n} transform={`translate(0 ${2 * GAP - (rider.s * GAP) / 2})`}>
            <g>
              <animateMotion dur={`${LOOP}s`} begin={`${-(n + .5) * (LOOP / RIDERS.length)}s`} repeatCount="indefinite" rotate="auto">
                <mpath href="#footer-wave" />
              </animateMotion>
              <RiderGlyph kind={rider.kind} />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}
