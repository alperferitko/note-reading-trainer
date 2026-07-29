import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const output = new URL("../out-pages/", import.meta.url);

test("GitHub Pages output uses portable relative asset paths", async () => {
  const html = await readFile(new URL("index.html", output), "utf8");

  assert.match(html, /\.\/assets\/[^\"']+\.js/);
  assert.match(html, /\.\/assets\/[^\"']+\.css/);
  assert.match(html, /href="\.\/notanota-app-icon\.svg\?v=3"/);
  assert.match(html, /src="\.\/notanota-monogram\.png"/);
  assert.match(html, /content="https:\/\/notanota\.online\/og\.png"/);
  assert.match(html, /name="theme-color" content="#F4EFE4"/);
  assert.match(html, /<title>NotaNota \| Nota Okuma Çalışması<\/title>/);
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
  assert.ok(!assetFiles.some((file) => file.startsWith("guitar-trainer-") && file.endsWith(".js")));
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
