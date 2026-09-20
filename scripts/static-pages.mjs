import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { SITE_PAGES } from '../lib/site-routes.mjs';
const escape = s => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function staticPages() {
  let out;
  return { name:'notanota-static-pages', apply:'build', configResolved(config){out=resolve(config.root,config.build.outDir);}, async closeBundle() {
    const template=await readFile(join(out,'index.html'),'utf8');
    const entries=[];
    for (const [key,page] of Object.entries(SITE_PAGES)) for (const locale of ['tr','en']) {
      const path=`${locale==='en'?'en/':''}${page.path?page.path+'/':''}`;
      const url=`https://notanota.online/${path}`;
      const title=`${page[locale][0]} | NotaNota`;
      const depth=path.split('/').filter(Boolean).length;
      const base=depth?'../'.repeat(depth):'./';
      const alternates=['tr','en','x-default'].map(lang=>`<link rel="alternate" hreflang="${lang}" href="https://notanota.online/${lang==='en'?'en/':''}${page.path?page.path+'/':''}" />`).join('\n');
      let html=template.replace('<html lang="tr">',`<html lang="${locale}">`).replace('<head>',`<head>\n<base href="${base}" />\n${alternates}`)
        .replace(/<title>.*?<\/title>/,`<title>${escape(title)}</title>`)
        .replace(/(<link rel="canonical" href=")[^"]+/,`$1${url}`)
        .replace(/(<meta\s+name="description"\s+content=")[^"]+/,`$1${escape(page[locale][1])}`)
        .replace(/(<meta\s+(?:property="og:description"|name="twitter:description")\s+content=")[^"]+/g,`$1${escape(page[locale][1])}`)
        .replace(/(<meta\s+property="og:url"\s+content=")[^"]+/,`$1${url}`)
        .replace(/(<meta\s+(?:property="og:title"|name="twitter:title")\s+content=")[^"]+/g,`$1${escape(title)}`)
        .replace(/<main class="static-fallback">[\s\S]*?<\/main>/,`<main class="static-fallback"><h1>${escape(page[locale][0])}</h1><p>${escape(page[locale][1])}</p><nav>${Object.entries(SITE_PAGES).map(([,p])=>`<a href="./${locale==='en'?'en/':''}${p.path?p.path+'/':''}">${escape(p[locale][0])}</a>`).join(' · ')}</nav></main>`);
      // The landing page retains its full explanatory fallback.
      if(key==='landing'&&locale==='tr') html=html.replace(/<main class="static-fallback">[\s\S]*?<\/main>/,template.match(/<main class="static-fallback">[\s\S]*?<\/main>/)[0]);
      await mkdir(join(out,path),{recursive:true});await writeFile(join(out,path,'index.html'),html);
      entries.push(`<url><loc>${url}</loc>${['tr','en'].map(lang=>`<xhtml:link rel="alternate" hreflang="${lang}" href="https://notanota.online/${lang==='en'?'en/':''}${page.path?page.path+'/':''}" />`).join('')}</url>`);
    }
    await writeFile(join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join('')}</urlset>`);
  }};
}
