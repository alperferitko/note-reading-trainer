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
  assert.match(html, /<title>Nota Nota — Note Reading \/ Porte Çalışması<\/title>/i);
  assert.match(html, /Notayı gör/);
  assert.match(html, /Temel porte/);
  assert.match(html, /Tam doğal sesler/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("oturum mantığı benzersiz başlangıç ve yanlışları tekrar kuyruğunda tutar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../supabase/migrations/202607170001_notanota_community.sql", import.meta.url),
    "utf8",
  );

  assert.match(page, /shuffledWithoutRuns/);
  assert.match(page, /Math\.abs\(item\.position - previous\.position\) !== 1/);
  assert.match(
    page,
    /\[\.\.\.items\.slice\(1\), \{ \.\.\.items\[0\], misses: items\[0\]\.misses \+ 1 \}\]/,
  );
  assert.match(page, /sessionType === "endless"/);
  assert.match(page, /nextEndlessNote/);
  assert.match(page, /questionKey\.current\+\+/);
  assert.match(page, /<CommunityResult/);
  assert.match(page, /toLocaleLowerCase\("tr-TR"\)/);
  assert.match(page, /firstTryCorrect/);
  assert.match(page, /wrongByNote/);
  assert.match(page, /Treble clef · natural notes/);
  assert.match(page, /Staff \+ ledger lines/);
  assert.match(page, /letter: "C"/);
  assert.match(page, /nota-nota-locale/);
  assert.match(page, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(page, /focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /autoCorrect="off"/);
  assert.match(page, /spellCheck=\{false\}/);
  assert.match(page, /className="mobile-answer-pad"/);
  assert.match(page, /value=\{name\} onClick=\{chooseAnswer\}/);
  assert.match(styles, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(styles, /\.mobile-answer-pad \{ display: none; \}/);
  assert.doesNotMatch(styles, /:has\(\.answer-line input:focus\)/);
  assert.doesNotMatch(page, /window\.visualViewport|window\.scrollBy|quiz-keyboard-open/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(migration, /p_wrong_count <> 0/i);
  assert.match(
    migration,
    /p_session_type = 'standard' and p_correct_count <> v_expected_count/i,
  );
  assert.match(
    migration,
    /excluded\.correct_count > public\.best_scores\.correct_count/i,
  );
  assert.match(
    migration,
    /excluded\.total_response_time_ms::bigint \* public\.best_scores\.correct_count::bigint/i,
  );
  assert.match(migration, /profiles_username_format/i);
  assert.match(migration, /security definer/i);
});
