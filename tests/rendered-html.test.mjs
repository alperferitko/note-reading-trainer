import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("Nota Nota çalışma ekranını sunar", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="tr">/i);
  assert.match(html, /<title>Nota Nota — Porte Çalışması<\/title>/i);
  assert.match(html, /Notayı gör/);
  assert.match(html, /Temel porte/);
  assert.match(html, /Tam doğal sesler/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("oturum mantığı benzersiz başlangıç ve yanlışları tekrar kuyruğunda tutar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

  assert.match(page, /shuffledWithoutRuns/);
  assert.match(page, /Math\.abs\(item\.position - previous\.position\) !== 1/);
  assert.match(page, /\[\.\.\.items\.slice\(1\), items\[0\]\]/);
  assert.match(page, /toLocaleLowerCase\("tr-TR"\)/);
  assert.match(page, /firstTryCorrect/);
  assert.match(page, /wrongByNote/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
