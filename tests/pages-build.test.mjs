import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const output = new URL("../out-pages/", import.meta.url);

test("GitHub Pages output uses the repository base path", async () => {
  const html = await readFile(new URL("index.html", output), "utf8");

  assert.match(html, /\/note-reading-trainer\/assets\/[^\"']+\.js/);
  assert.match(html, /\/note-reading-trainer\/assets\/[^\"']+\.css/);
  assert.match(html, /href="\/note-reading-trainer\/og\.png"/);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
  assert.doesNotMatch(html, /(?:localhost|127\.0\.0\.1|file:\/\/)/i);
});

test("GitHub Pages output contains every referenced local asset", async () => {
  const html = await readFile(new URL("index.html", output), "utf8");
  const paths = [
    ...html.matchAll(/(?:src|href)="\/note-reading-trainer\/([^\"#?]+)[\"#?]/g),
  ].map((match) => match[1]);

  assert.ok(paths.length >= 3);
  await Promise.all(paths.map((path) => access(new URL(path, output))));
  await access(new URL(".nojekyll", output));
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

  assert.doesNotMatch(JavaScript, /(?:localhost|127\.0\.0\.1|cloudflare:workers)/i);
  assert.doesNotMatch(JavaScript, /fetch\(["'`]\/api\//);
});
