import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildSessionInsight,
  noteClassFromAnswer,
  pickDominantConfusion,
} from "../lib/session-insights.mjs";

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
  const insights = await readFile(new URL("../lib/session-insights.mjs", import.meta.url), "utf8");
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
  assert.match(insights, /toLocaleLowerCase\("tr-TR"\)/);
  assert.match(page, /firstTryCorrect/);
  assert.match(page, /wrongByNote/);
  assert.match(page, /confusionByPair/);
  assert.match(page, /pickDominantConfusion/);
  assert.match(page, /\$\{current\.id\}:\$\{guessed\.letter\}/);
  assert.match(page, /session-insight/);
  assert.match(page, /answerTimes\.length === 0 \? copy\.noAnswers/);
  assert.match(page, /score-ring-progress/);
  assert.match(styles, /@keyframes score-ring-fill/);
  assert.match(page, /className="brand-mark" aria-hidden="true">♪<\/span>/);
  assert.match(styles, /font-family: "Bodoni MT", Didot/);
  assert.match(styles, /\.brand-mark \{[\s\S]*background: transparent;[\s\S]*text-shadow: none;/);
  assert.doesNotMatch(page, /level-indicator/);
  assert.doesNotMatch(styles, /translateY\(-2px\)/);
  assert.doesNotMatch(styles, /inset 0 4px var\(--coral\)/);
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

test("geçerli nota cevaplarını karışıklık çiftlerine dönüştürür", () => {
  assert.deepEqual(noteClassFromAnswer("Do"), { solfege: "Do", letter: "C" });
  assert.deepEqual(noteClassFromAnswer("c"), { solfege: "Do", letter: "C" });
  assert.deepEqual(noteClassFromAnswer("Sİ"), { solfege: "Si", letter: "B" });
  assert.equal(noteClassFromAnswer("emin değilim"), null);

  assert.equal(pickDominantConfusion({ "e4:F": 1 }, 1), null);
  assert.equal(pickDominantConfusion({ "e4:F": 2, "g4:A": 4 }, 20), null);
  assert.deepEqual(
    pickDominantConfusion({ "e4:F": 3, "g4:A": 1 }, 5),
    { key: "e4:F", count: 3, share: .6 },
  );
});

test("sonuç mesajlarını başarı, tamamlanma ve tempoya göre seçer", () => {
  const perfect = buildSessionInsight({
    locale: "tr",
    sessionType: "standard",
    completed: true,
    firstTryRate: 100,
    totalWrong: 0,
    attemptCount: 9,
    correctCount: 9,
    averageResponseMs: 2140,
  });
  assert.equal(perfect.title, "Temiz bir ilk okuma.");
  assert.equal(perfect.tone, "perfect");
  assert.match(perfect.pace, /2,14 sn/);

  const shortRun = buildSessionInsight({
    locale: "en",
    sessionType: "endless",
    completed: false,
    firstTryRate: 100,
    totalWrong: 0,
    attemptCount: 3,
    correctCount: 3,
    averageResponseMs: 3200,
  });
  assert.equal(shortRun.title, "A clean start.");
  assert.doesNotMatch(shortRun.body, /every note/i);

  const rushed = buildSessionInsight({
    locale: "tr",
    sessionType: "standard",
    completed: false,
    firstTryRate: 44,
    totalWrong: 5,
    attemptCount: 9,
    correctCount: 4,
    averageResponseMs: 1800,
  });
  assert.equal(rushed.title, "Tekrar için net bir rota.");
  assert.match(rushed.nextStep, /konumu bir an kontrol/);

  const careful = buildSessionInsight({
    locale: "en",
    sessionType: "standard",
    completed: true,
    firstTryRate: 89,
    totalWrong: 1,
    attemptCount: 10,
    correctCount: 9,
    averageResponseMs: 9200,
  });
  assert.equal(careful.title, "A highly consistent run.");
  assert.match(careful.nextStep, /Accuracy was strong/);

  const bandCases = [
    [85, "Oldukça tutarlı bir tur."],
    [70, "Sağlam bir ilk okuma."],
    [50, "Doğrular çoğunlukta."],
    [49, "Tekrar için net bir rota."],
  ];
  for (const [firstTryRate, title] of bandCases) {
    const insight = buildSessionInsight({
      locale: "tr",
      sessionType: "standard",
      completed: true,
      firstTryRate,
      totalWrong: 1,
      attemptCount: 10,
      correctCount: 9,
      averageResponseMs: 4200,
    });
    assert.equal(insight.title, title);
  }
});
