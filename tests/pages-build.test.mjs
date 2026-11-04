import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { SITE_PAGES } from '../lib/site-routes.mjs';

const output = new URL("../out-pages/", import.meta.url);

test('every bilingual clean route has its own title, canonical, alternates and working asset base', async () => {
  const sitemap=await readFile(new URL('sitemap.xml',output),'utf8');
  for(const page of Object.values(SITE_PAGES)) for(const locale of ['tr','en']) {
    const path=`${locale==='en'?'en/':''}${page.path?page.path+'/':''}`;
    const html=await readFile(new URL(`${path}index.html`,output),'utf8');
    assert.ok(html.includes(`<html lang="${locale}">`));
    assert.ok(html.includes(`<title>${page[locale][0]} | NotaNota</title>`));
    assert.ok(html.includes(`rel="canonical" href="https://notanota.online/${path}"`));
    assert.match(html,/hreflang="tr"/);
    assert.match(html,/hreflang="en"/);
    assert.match(html,/hreflang="x-default"/);
    const base=html.match(/<base href="([^"]+)"/)?.[1];
    assert.ok(base);
    const resolved=new URL(base,new URL(`${path}index.html`,output));
    assert.equal(resolved.href,output.href);
    assert.ok(sitemap.includes(`<loc>https://notanota.online/${path}</loc>`));
    for(const [,asset] of html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)/g)) await access(new URL(asset,resolved));
  }
});

test("GitHub Pages output uses portable relative asset paths", async () => {
  const html = await readFile(new URL("index.html", output), "utf8");

  assert.match(html, /\.\/assets\/[^\"']+\.js/);
  assert.match(html, /\.\/assets\/[^\"']+\.css/);
  assert.match(html, /href="\.\/notanota-app-icon\.svg\?v=3"/);
  assert.match(html, /src="\.\/notanota-monogram-96\.webp"/);
  assert.match(html, /content="https:\/\/notanota\.online\/og\.png"/);
  assert.match(html, /name="theme-color" content="#FAF6F1"/);
  assert.match(html, /<title>Stüdyo \| NotaNota<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/notanota\.online\/"/);
  assert.match(html, /type="application\/ld\+json">.*"EducationalApplication"/);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /class="static-fallback"/);
  assert.match(html, /<noscript>/);
  const schema = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(schema);
  const schemaHash = createHash("sha256").update(schema).digest("base64");
  assert.match(html, new RegExp(`script-src 'self' 'sha256-${schemaHash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
  assert.match(html, /property="og:site_name" content="NotaNota"/);
  assert.match(html, /property="og:image:secure_url"\s+content="https:\/\/notanota\.online\/og\.png"/);
  assert.match(html, /name="twitter:image"\s+content="https:\/\/notanota\.online\/og\.png"/);
  const socialImage = await readFile(new URL("../public/og.png", import.meta.url));
  const socialImageWidth = socialImage.readUInt32BE(16);
  const socialImageHeight = socialImage.readUInt32BE(20);
  assert.match(html, new RegExp(`property="og:image:width" content="${socialImageWidth}"`));
  assert.match(html, new RegExp(`property="og:image:height" content="${socialImageHeight}"`));
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
  assert.doesNotMatch(html, /(?:localhost|127\.0\.0\.1|file:\/\/)/i);
});

test("GitHub Pages output contains every referenced local asset", async () => {
  const html = await readFile(new URL("index.html", output), "utf8");
  const paths = [
    ...html.matchAll(/(?:src|href)="\.\/([^\"#?]+)[\"#?]/g),
  ].map((match) => match[1]);

  assert.ok(paths.length >= 3);
  await Promise.all(paths.map((path) => access(new URL(path, output))));
  await access(new URL(".nojekyll", output));
  await access(new URL("notanota-app-icon.svg", output));
  await access(new URL("notanota-monogram.png", output));
  await access(new URL("brand/notanota-wordmark-email.png", output));
  const favicon = await readFile(new URL("notanota-app-icon.svg", output), "utf8");
  assert.match(favicon, /<rect[^>]+rx="72"[^>]+fill="#FBF8F1"[^>]+stroke="#C6A15B"/);
  assert.match(favicon, /transform="translate\(29 31\) scale\(0\.90\)"/);
  await access(new URL("og.png", output));
  await access(new URL("robots.txt", output));
  await access(new URL("sitemap.xml", output));
  await access(new URL("404.html", output));
  await access(new URL(".well-known/security.txt", output));

  const assetFiles = await readdir(new URL("assets/", output));
  assert.ok(assetFiles.some((file) => file.endsWith(".js")));
  assert.ok(assetFiles.some((file) => file.endsWith(".css")));
  assert.ok(assetFiles.some((file) => file.startsWith("guitar-trainer-") && file.endsWith(".js")));
  assert.ok(!assetFiles.some((file) => /ffmpeg|\.wav$|\.ogg$|\.mp3$|\.mid$|musicxml/i.test(file)));
});

test("static bundle has no unavailable server endpoint dependency", async () => {
  const assetFiles = await readdir(new URL("assets/", output));
  const JavaScriptFiles = assetFiles.filter((file) => file.endsWith(".js"));
  const bundles = await Promise.all(
    JavaScriptFiles.map((file) => readFile(new URL(`assets/${file}`, output), "utf8")),
  );
  const JavaScript = bundles.join("\n");

  // Supabase's browser client contains localhost constants for its local-dev
  // helpers. The application itself must not ship a fixed local API endpoint.
  assert.doesNotMatch(JavaScript, /https?:\/\/127\.0\.0\.1:\d+\/api/i);
  assert.doesNotMatch(JavaScript, /cloudflare:workers/i);
  assert.doesNotMatch(JavaScript, /fetch\(["'`]\/api\//);
  assert.doesNotMatch(
    JavaScript,
    /VITE_SUPABASE_(?:URL|PUBLISHABLE_KEY)\s*=/,
  );
  assert.doesNotMatch(
    JavaScript,
    /(?:service_role|sb_secret|github_pat|ghp_|sk_(?:live|test)_)[A-Za-z0-9_-]{10,}/i,
  );
  assert.doesNotMatch(JavaScript, /DELETION_AUDIT_HMAC_KEY/);
  assert.doesNotMatch(JavaScript, /account_deletion_audit/);
});
