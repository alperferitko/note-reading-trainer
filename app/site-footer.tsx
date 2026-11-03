"use client";
import { SITE_PAGES, pageRoute } from '@/lib/site-routes.mjs';
import { BrandLogo } from './palette-tools';

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
 * The footer is one painted scene: the sky holds the brand and the links as real text, the
 * landscape with the notes stays at the bottom in its own proportions. The picture is decoration.
 */
export function SiteFooter({ locale, palette, motto, homeLabel, onNavigate }: {
  locale: Locale; palette: string; motto: string; homeLabel: string; onNavigate: (target: FooterTarget) => void;
}) {
  const i = locale === 'tr' ? 0 : 1;
  const go = (target: FooterTarget) => (event: React.MouseEvent) => { event.preventDefault(); onNavigate(target); };
  return (
    <footer className="site-footer">
      <div className="site-footer-sky">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <a className="site-footer-home" href={pageRoute('landing', locale)} onClick={go('landing')} aria-label={homeLabel}>
              <BrandLogo palette={palette} className="footer-logo" />
              <span>NotaNota</span>
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
      {/* Decorative only: every word and link is the real text above. */}
      <div className="site-footer-scene" aria-hidden="true">
        <picture>
          <source media="(max-width: 560px)" srcSet="./brand/footer-scene-800.webp 800w, ./brand/footer-scene-1440.webp 1440w" sizes="200vw" />
          <img src="./brand/footer-scene-1440.webp" srcSet="./brand/footer-scene-800.webp 800w, ./brand/footer-scene-1440.webp 1440w, ./brand/footer-scene-2172.webp 2172w" sizes="100vw" width={2172} height={724} alt="" loading="lazy" decoding="async" />
        </picture>
      </div>
    </footer>
  );
}
