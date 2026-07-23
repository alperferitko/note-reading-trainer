import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const output = new URL("../out-pages/", import.meta.url);

test("GitHub Pages output uses portable relative asset paths", async () => {
  const html = await readFile(new URL("index.html", output), "utf8");

  assert.match(html, /\.\/assets\/[^\"']+\.js/);
  assert.match(html, /\.\/assets\/[^\"']+\.css/);
  assert.match(html, /href="\.\/nota-nota-icon\.png"/);
  assert.match(html, /content="https:\/\/notanota\.online\/og\.png"/);
  assert.match(html, /name="theme-color" content="#F4EFE4"/);
  assert.match(html, /<title>NotaNota — Note Reading Trainer<\/title>/);
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
  await access(new URL("nota-nota-icon.png", output));
  await access(new URL("og.png", output));

  const assetFiles = await readdir(new URL("assets/", output));
  assert.ok(assetFiles.some((file) => file.endsWith(".js")));
  assert.ok(assetFiles.some((file) => file.endsWith(".css")));
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
});
