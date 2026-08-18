import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildSessionInsight,
  noteClassFromAnswer,
  pickDominantConfusion,
} from "../lib/session-insights.mjs";
import {
  DELETE_ACCOUNT_CONFIRMATION,
  deleteCurrentAccount,
} from "../lib/delete-account.mjs";
import { EMAIL_MAX_LENGTH, normalizeValidEmail } from "../lib/email-validation.mjs";

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

test("NotaNota çalışma ekranını sunar", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="tr">/i);
  assert.match(html, /<title>NotaNota \| Note Reading Trainer<\/title>/i);
  assert.match(html, /Notaları gör/);
  assert.match(html, /Adını söyle/);
  assert.match(html, /Porte okuma/);
  assert.match(html, /Müzik aletleri/);
  assert.match(html, /Gitar klavyesi/);
  assert.match(html, /Eser okuma/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("magic-link yalnızca makul uzunlukta geçerli e-posta adreslerini kabul eder", () => {
  assert.equal(EMAIL_MAX_LENGTH, 100);
  assert.equal(normalizeValidEmail("  USER@Example.COM  "), "user@example.com");
  assert.equal(normalizeValidEmail("not-an-email"), null);
  assert.equal(normalizeValidEmail("a@localhost"), null);
  assert.equal(normalizeValidEmail("a..b@example.com"), null);
  assert.equal(normalizeValidEmail(`${"a".repeat(65)}@example.com`), null);
  const hundredCharacters = `${"a".repeat(64)}@${"b".repeat(31)}.com`;
  const hundredOneCharacters = `${"a".repeat(64)}@${"b".repeat(32)}.com`;
  assert.equal(hundredCharacters.length, 100);
  assert.equal(normalizeValidEmail(hundredCharacters), hundredCharacters);
  assert.equal(hundredOneCharacters.length, 101);
  assert.equal(normalizeValidEmail(hundredOneCharacters), null);
});

test("oturum mantığı benzersiz başlangıç ve yanlışları tekrar kuyruğunda tutar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const community = await readFile(new URL("../app/community.tsx", import.meta.url), "utf8");
  const guitar = await readFile(new URL("../app/guitar-trainer.tsx", import.meta.url), "utf8");
  const scoreReading = await readFile(new URL("../app/score-reading-trainer.tsx", import.meta.url), "utf8");
  const scoreReadingLogic = await readFile(new URL("../lib/score-reading.mjs", import.meta.url), "utf8");
  const insights = await readFile(new URL("../lib/session-insights.mjs", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const magicLink = await readFile(
    new URL("../supabase/templates/magic-link.html", import.meta.url),
    "utf8",
  );
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../supabase/migrations/202607170001_notanota_community.sql", import.meta.url),
    "utf8",
  );
  const extendedLevelMigration = await readFile(
    new URL("../supabase/migrations/202607210001_add_extended_ledger_level.sql", import.meta.url),
    "utf8",
  );
  const endlessEligibilityMigration = await readFile(
    new URL("../supabase/migrations/202608130001_fix_endless_score_eligibility.sql", import.meta.url),
    "utf8",
  );
  const noteRangeCountMigration = await readFile(
    new URL("../supabase/migrations/202608150001_update_note_range_score_counts.sql", import.meta.url),
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
  assert.match(page, /type LevelId = "temel" \| "yakin" \| "tam" \| "genis"/);
  assert.match(page, /id: "d3"[\s\S]*position: -8/);
  assert.match(page, /id: "g6"[\s\S]*position: 16/);
  assert.match(page, /id: "e7"[\s\S]*position: 21/);
  assert.match(page, /id: "d6"[\s\S]*shortLocation: \{ tr: "Üstten 7\. çizginin üstü"/);
  assert.match(page, /id: "g6"[\s\S]*shortLocation: \{ tr: "Üstten 9\. çizgi"/);
  assert.match(page, /id: "f3"[\s\S]*shortLocation: \{ tr: "Alttan 8\. çizginin üstü"/);
  assert.match(page, /id: "d6"[\s\S]*location: \{ tr: "üstteki 2\. ve 3\. ek çizgilerin arasındaki aralıkta"/);
  assert.match(page, /id: "genis"[\s\S]*beşer ek çizgiye kadar[\s\S]*count: 29/);
  assert.match(page, /id: "temel"[\s\S]*count: 9/);
  assert.match(page, /id: "yakin"[\s\S]*count: 17/);
  assert.match(page, /id: "tam"[\s\S]*count: 25/);
  assert.match(page, /ledgerPositionsFor/);
  assert.match(page, /\[-10, -8, -6, -4, -2, 10, 12, 14, 16, 18\]/);
  assert.match(page, /if \(sessionType === "endless"\) \{[\s\S]*setFeedback\(null\);[\s\S]*navigateTo\("done"\);[\s\S]*return;/);
  assert.match(page, /sessionType === "endless" \? \([\s\S]*className="endless-results-card"/);
  assert.match(page, /extra\.endedSession\(correctCount, totalTime\)/);
  assert.match(styles, /\.endless-results-card/);
  assert.match(page, /questionKey\.current\+\+/);
  assert.match(page, /useState<Stage>\("landing"\)/);
  assert.match(page, /const GuitarTrainer = lazy/);
  assert.match(page, /const ScoreReadingTrainer = lazy/);
  assert.match(page, /pieces: "\?sayfa=eser-okuma"/);
  assert.match(page, /navigateTo\("pieces"\)/);
  assert.match(page, /Eser okuma/);
  assert.match(page, /Score reading/);
  assert.match(scoreReading, /type ReadingMode = "flow" \| "rhythm"/);
  assert.match(scoreReading, /Neşeye Övgü/);
  assert.match(scoreReading, /Frère Jacques/);
  assert.match(scoreReading, /beatDurationMs\(current\.rhythm\.beats, bpm\)/);
  assert.match(scoreReading, /timedOut: true/);
  assert.match(scoreReading, /nextPieceHistory\(recent, nextPiece\.id, PIECES\.length - 1\)/);
  assert.match(scoreReadingLogic, /const RHYTHM_VALUES = \[/);
  assert.match(scoreReadingLogic, /id: "sixteenth", beats: 0\.25/);
  assert.match(scoreReadingLogic, /id: "triplet", beats: 1 \/ 3/);
  assert.doesNotMatch(scoreReading, /SourceMode|Rastgele satır|Random line|generateRandomScoreLine/);
  assert.match(scoreReading, /const nextPiece = chooseUnrecentPiece\(PIECES, recent\)/);
  assert.doesNotMatch(scoreReading, /yakın zamanda gördüğün eser tekrar seçilmez/);
  assert.match(scoreReading, /const count = id === "eighth" \? 2 : id === "sixteenth" \? 4 : 3/);
  assert.match(scoreReading, /rhythm-symbol-group-note/);
  assert.match(scoreReadingLogic, /chooseUnrecentPiece/);
  assert.match(page, /navigateTo\("guitar"\)/);
  assert.match(page, /function InstrumentHub/);
  assert.match(page, /navigateTo\("instruments"\)/);
  assert.match(page, /Piyano/);
  assert.match(page, /Keman/);
  assert.match(page, /<GuitarTrainer/);
  assert.match(guitar, /const STRINGS =/);
  assert.match(guitar, /const DISPLAY_STRINGS = \[\.\.\.STRINGS\]\.reverse\(\)/);
  assert.match(guitar, /const displayedFrets = Array\.from\(\{ length: maxFret \+ 1 \}, \(_, index\) => maxFret - index\)/);
  assert.match(guitar, /\{DISPLAY_STRINGS\.map/);
  assert.match(guitar, /\{displayedFrets\.map/);
  assert.match(guitar, /\$\{\(maxFret - fret \+ \.5\) \/ \(maxFret \+ 1\)\}/);
  assert.match(guitar, /frets: 3/);
  assert.match(guitar, /frets: 5/);
  assert.match(guitar, /frets: 12/);
  assert.match(guitar, /NATURAL\.has/);
  assert.match(guitar, /type GuitarMode = "name-note" \| "staff-to-fretboard"/);
  assert.match(guitar, /function buildPitchQuestions/);
  assert.match(guitar, /function GuitarStaffNote/);
  assert.match(guitar, /position\.midi === current\.midi/);
  assert.match(guitar, /practiceMode === "staff-to-fretboard" \? answerPosition : undefined/);
  assert.match(guitar, /Porteyi gör, gitarda bul/);
  assert.match(guitar, /See the staff, find it on guitar/);
  assert.match(guitar, /Notaları önce incele/);
  assert.match(guitar, /Study the notes first/);
  assert.match(guitar, /onSessionActiveChange\?\.\(stage === "quiz"\)/);
  assert.match(guitar, /const \[studyLetter, setStudyLetter\] = useState<Letter \| null>\(null\)/);
  assert.match(guitar, /studyLetter=\{studyLetter\}/);
  assert.match(guitar, /window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/);
  assert.match(guitar, /if \(hasDesktopPointer\) inputRef\.current\?\.focus/);
  assert.match(styles, /@media \(max-width: 620px\) and \(orientation: portrait\)[\s\S]*\.fretboard-orientation-hint/);
  assert.match(styles, /@media \(orientation: landscape\) and \(max-height: 560px\) and \(max-width: 1000px\)[\s\S]*\.fretboard--range-3/);
  assert.match(guitar, /guitar-question-card--staff-position/);
  assert.match(styles, /guitar-question-card--staff-position[\s\S]*grid-template-areas: "staff board" "instruction instruction"/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*\.brand-name \{ display: inline-block/);
  assert.match(styles, /\.fret-note\.is-study-focus/);
  assert.match(styles, /\.fret-note--choice\.is-correct/);
  assert.match(page, /<CommunityResult/);
  assert.match(community, /nota-nota-pending-score/);
  assert.match(community, /rememberPendingScore\(score\)/);
  assert.match(community, /openPanel\("auth", text\.scoreSignInWarning\)/);
  assert.match(community, /signInWithOAuth\(\{[\s\S]*provider: "google"[\s\S]*redirectTo: window\.location\.origin/);
  assert.match(community, /googleAuthConfigured &&/);
  assert.match(community, /Google ile devam et/);
  assert.match(community, /Continue with Google/);
  assert.match(community, /community-result-note/);
  assert.match(community, /community-auth-notice/);
  assert.doesNotMatch(community, /<select/);
  assert.match(community, /leaderboard-segments/);
  assert.match(community, /aria-pressed=\{sessionType === "standard"\}/);
  assert.match(community, /leaderboard-current-view/);
  assert.ok(community.indexOf('className="leaderboard-main"') < community.indexOf('className="leaderboard-controls"'));
  assert.match(community, /modal-card--leaderboard/);
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
  assert.match(styles, /\.score-ring-progress \{[\s\S]*stroke-linecap: round;/);
  assert.match(styles, /\.selection-indicator::after[\s\S]*opacity: 0;[\s\S]*transform: scale\(\.35\)/);
  assert.match(styles, /\.mode-card\.is-selected \.selection-indicator::after[\s\S]*opacity: 1;[\s\S]*transform: scale\(1\)/);
  assert.match(styles, /\.level-card\.is-selected \.range-preview-note[\s\S]*transition-delay: \.1s/);
  assert.doesNotMatch(page, /trackSelectionShade|--shade-x|onMouseMove=\{trackSelectionShade\}/);
  assert.match(styles, /radial-gradient\(circle at 0 0, rgba\(139, 47, 60, \.115\)/);
  assert.match(styles, /--surface-shadow:/);
  assert.match(page, /Hazırsan başlayalım! Sakin bak, net cevapla\./);
  assert.doesNotMatch(page, /—/);
  assert.doesNotMatch(guitar, /Modüllere dön|Back to modules|Nota okumaya dön|Switch to sight-reading/);
  assert.match(page, /range-preview--extended/);
  assert.match(page, /level === "tam" \|\| level === "genis" \? 84 - position \* 4 : 50 - position \* 4/);
  assert.match(page, /const activeQuestionNumber = sessionType === "standard"/);
  assert.match(page, /quizShellRef\.current\?\.scrollIntoView\(\{ behavior: "auto", block: "start" \}\)/);
  assert.match(page, /className="restart-session-button"[\s\S]*onClick=\{startSession\}/);
  assert.match(page, /Oturumu yeniden başlat/);
  assert.match(page, /Restart session/);
  assert.match(page, /className="quiz-stat-context"/);
  assert.match(page, /aria-label=\{shell\.currentSession\} aria-live="polite"/);
  assert.match(page, /const GuitarTrainer = lazy/);
  assert.match(styles, /\.quiz-stat-primary > strong \{ color: var\(--foreground\);/);
  assert.doesNotMatch(styles, /\.module-card:hover \{[^}]*transform:/);
  assert.doesNotMatch(styles, /\.level-card:not\(\.is-selected\):hover,[\s\S]{0,140}transform: translateY/);
  assert.match(page, /className="mobile-module-navigation"/);
  assert.match(page, /const STAGE_ROUTES: Record<Stage, string>/);
  assert.match(page, /setup: "\?sayfa=nota-oku"/);
  assert.match(page, /instruments: "\?sayfa=muzik-aletleri"/);
  assert.match(page, /guitar: "\?sayfa=muzik-aletleri&enstruman=gitar"/);
  assert.match(page, /function stageFromSearch/);
  assert.match(page, /window\.history\.pushState\(null, "", nextUrl\)/);
  assert.match(page, /window\.history\.replaceState\(null, "", `\$\{window\.location\.pathname\}\$\{route\}`\)/);
  assert.match(page, /nota-nota-reading-setup:\$\{communityUserId \?\? "guest"\}/);
  assert.match(community, /onIdentityChange\?: \(userId: string \| null\) => void/);
  assert.match(page, /Daha yeni başlıyorum/);
  assert.match(page, /Bu işte oldukça iyiyim/);
  assert.match(page, /I’m just getting started/);
  assert.match(page, /className="reading-setup-dialog" role="dialog" aria-modal="true"/);
  assert.match(page, /className=\{`reading-recommendation/);
  assert.match(page, /className="reading-session-summary"/);
  assert.match(page, /saveReadingSetup/);
  assert.match(page, /const immersiveSession = stage === "quiz" \|\| guitarSessionActive/);
  assert.match(page, /!immersiveSession && <header className="site-header">/);
  assert.doesNotMatch(page, /className="landing-proof"/);
  assert.doesNotMatch(page, />00<|>01<|>02<|>03<|>04</);
  assert.doesNotMatch(page, /<span aria-hidden="true">⚬<\/span><b>/);
  assert.doesNotMatch(page, /className="rail-motto"/);
  assert.match(styles, /\.reading-session-summary \{/);
  assert.match(styles, /\.reading-setup-backdrop \{/);
  assert.match(styles, /\.reading-setup-dialog \{/);
  assert.match(styles, /\.app-shell--session \{/);
  assert.match(styles, /These declarations intentionally close the cascade[\s\S]*\.app-navigation a \{[\s\S]*background: #e7ded1/);
  assert.match(styles, /These declarations intentionally close the cascade[\s\S]*\.app-navigation a\.is-active \{[^}]*background: #a33347/);
  assert.match(styles, /\.community-header-actions button \{[\s\S]*justify-content: center;[\s\S]*text-align: center/);
  assert.match(styles, /li\[aria-current="date"\]:not\(\.is-complete\) \.practice-day-mark::after[\s\S]*inset: 5px;[\s\S]*background: var\(--primary\)/);
  assert.match(page, /const LANDING_DEMO_NOTES = \["d5", "g4", "e5", "b4", "f4", "c5", "e4", "f5", "a4"\]/);
  assert.match(page, /window\.setInterval\(\(\) => \{[\s\S]*setNoteIndex\(\(current\) => \(current \+ 1\) % LANDING_DEMO_NOTES\.length\);[\s\S]*\}, 2800\)/);
  assert.match(page, /<Staff note=\{note\} locale=\{locale\} compact animated \/>/);
  assert.match(page, /\{note\.shortLocation\[locale\]\}, \{noteName\(note, locale\)\}/);
  assert.match(styles, /\.staff--animated \.note-head,[\s\S]*top \.78s cubic-bezier\(\.22, 1, \.36, 1\)/);
  assert.match(styles, /\.landing-staff-label\.is-visible \{[\s\S]*opacity: 1;[\s\S]*transform: translateY\(0\)/);
  assert.match(styles, /\.landing-art \{ min-height: 180px; \}/);
  assert.match(styles, /\.landing-staff-card \{[\s\S]*width: 88%;[\s\S]*padding: 10px 14px 9px;[\s\S]*animation: landing-staff-card-drift 18s ease-in-out infinite/);
  assert.match(styles, /\.landing-staff-card \.staff \{[\s\S]*height: 86px;[\s\S]*margin: 0 auto 1px/);
  assert.match(styles, /@keyframes landing-staff-card-drift \{[\s\S]*translate3d\(-1px, 4px, 0\) rotate\(-1\.1deg\)[\s\S]*translate3d\(1px, 4px, 0\) rotate\(1\.1deg\)/);
  assert.match(styles, /\.landing-staff-card \{[\s\S]*8px 14px 14px -12px rgba\(54, 43, 30, \.24\)/);
  assert.match(styles, /\.site-header \{[\s\S]*grid-row: 1 \/ span 2/);
  assert.doesNotMatch(styles, /\.module-card::after/);
  assert.match(styles, /\.module-card--guitar \{[\s\S]*linear-gradient/);
  assert.match(styles, /@keyframes module-note-reveal/);
  assert.match(styles, /\.module-card--staff:hover \.range-preview-mark,[\s\S]*animation: module-note-reveal/);
  assert.match(styles, /\.module-card--score:hover \.module-score-note[\s\S]*animation: module-note-reveal/);
  assert.doesNotMatch(page, /module-card-accent/);
  assert.doesNotMatch(scoreReading, /score-repertoire-card|Her oturumda tanıdık bir ezgi/);
  assert.match(scoreReading, /Neşeye Övgü[\s\S]*Ludwig van Beethoven/);
  assert.match(page, /title: "Geniş aralık"[\s\S]*Altta ve üstte beşer ek çizgiye kadar/);
  assert.doesNotMatch(page, /module-score-note--triplet[\s\S]{0,80}<b>3<\/b>/);
  assert.doesNotMatch(scoreReading, /id === "triplet" && <b>3<\/b>/);
  assert.doesNotMatch(scoreReading, /score-note-triplet/);
  assert.match(styles, /\.app-navigation a > b \{[\s\S]*overflow-wrap: normal;[\s\S]*white-space: nowrap;/);
  assert.match(styles, /\.module-score-note > u \{[\s\S]*transform: none;/);
  assert.match(styles, /\.score-reading-hero \{[\s\S]*minmax\(0, 1\.28fr\)/);
  assert.match(styles, /@media \(min-width: 821px\) \{[\s\S]*\.header-actions \{ transform: translateY\(-42px\); \}/);
  assert.match(styles, /\.module-guitar-visual \{[\s\S]*#e3c293[\s\S]*radial-gradient/);
  assert.match(styles, /\.module-card--staff \.module-visual \.range-preview \{[\s\S]*transform: none/);
  assert.match(page, /module-score-note--eighth-pair/);
  assert.match(page, /module-score-note--sixteenth-group/);
  assert.match(page, /module-score-note--triplet/);
  assert.match(page, /className="brand-mark brand-mark--footer"[\s\S]*navigateTo\("landing"\)/);
  assert.doesNotMatch(styles, /staff-note-wander|fret-note-wander/);
  assert.match(styles, /\.instrument-illustration--violin::before \{[\s\S]*linear-gradient\(90deg, #a56a34/);
  assert.match(styles, /\.community-result-card--ineligible \{[\s\S]*text-align: center/);
  assert.match(community, /ineligibleEncouragement/);
  assert.match(community, /Bir sonraki turda tamamını doğru okuyacağına inanıyorum/);
  assert.match(community, /I’m sure you can read every note correctly next time/);
  assert.match(community, /community-result-encouragement/);
  assert.match(styles, /\.guitar-range-grid > button::before \{[\s\S]*radial-gradient\(circle at 0 0/);
  assert.match(styles, /\.guitar-range-grid > button\.is-selected::before \{ opacity: 1; \}/);
  assert.match(styles, /\.fretboard-card-heading \{[\s\S]*flex-direction: row;[\s\S]*text-align: left;/);
  assert.match(guitar, /className="fretboard-string-number"/);
  assert.match(guitar, /fretboard-string-number--end/);
  assert.doesNotMatch(guitar, /\{string\.number\}\. \{string\.label\}/);
  assert.match(guitar, /className="guitar-exit-button"/);
  assert.match(guitar, /className="guitar-target-location"/);
  assert.match(guitar, /className="guitar-start-panel"/);
  assert.doesNotMatch(styles, /\.session-insight \{[^}]*border-left/);
  assert.match(page, /if \(correct\) \{[\s\S]*playPracticeNote\(noteIdToMidi\(current\.id\), noteSoundEnabled\);/);
  assert.match(page, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(page, /!audioSettingsRef\.current\?\.contains\(event\.target\)/);
  assert.doesNotMatch(page, /listen-note-button|playNotaNotaEffect|setAmbientMusicActive|unlockNotaNotaAudio/);
  assert.match(styles, /\.mobile-module-navigation/);
  assert.match(page, /className="brand-mark" aria-hidden="true">[\s\S]*notanota-monogram\.png/);
  assert.match(page, /className="brand-mark result-flourish" aria-hidden="true">[\s\S]*notanota-monogram\.png/);
  assert.doesNotMatch(page, /className="brand-mark" aria-hidden="true">♪/);
  assert.doesNotMatch(page, /name="note"/);
  assert.match(styles, /font-family: "Bodoni MT", Didot/);
  assert.match(styles, /\.brand \.brand-mark \{[\s\S]*border: 0;[\s\S]*background: transparent;/);
  assert.match(styles, /\.brand-mark img \{[\s\S]*object-fit: contain;/);
  assert.match(styles, /\.brand::before \{[\s\S]*repeating-linear-gradient\([\s\S]*rgba\(32, 35, 31, \.42\)/);
  assert.match(styles, /\.brand-name \{[\s\S]*margin-left: 3px;[\s\S]*background: transparent;[\s\S]*text-shadow: none;/);
  assert.match(styles, /\.result-flourish \{[\s\S]*border-radius: 0;[\s\S]*background: transparent;/);
  assert.match(magicLink, /https:\/\/notanota\.online\/notanota-monogram\.png/);
  assert.match(magicLink, /background:#E9E2D5/);
  assert.match(magicLink, /background:#FBF8F1/);
  assert.match(magicLink, /background:#8B2F3C/);
  assert.match(magicLink, /border:1px solid #C6A15B/);
  assert.match(magicLink, /\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}/);
  assert.doesNotMatch(page, /level-indicator/);
  assert.match(styles, /\.brand-name \{[\s\S]*margin-left: -7px;[\s\S]*transform: translate\(-3px, -2px\);/);
  assert.doesNotMatch(styles, /inset 0 4px var\(--coral\)/);
  assert.match(page, /Treble clef, natural notes/);
  assert.match(page, /Two ledger lines/);
  assert.match(page, /letter: "C"/);
  assert.match(page, /nota-nota-locale/);
  assert.match(page, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(page, /focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /autoCorrect="off"/);
  assert.match(page, /spellCheck=\{false\}/);
  assert.match(page, /className="mobile-answer-pad"/);
  assert.match(page, /value=\{name\} onClick=\{chooseAnswer\}/);
  assert.match(styles, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(styles, /grid-template-areas: "filters ranking"/);
  assert.match(styles, /grid-template-areas: "ranking" "filters"/);
  assert.match(styles, /scale\(\.68\)/);
  assert.match(styles, /\.mobile-answer-pad \{ display: none; \}/);
  assert.match(styles, /--primary: #8b2f3c/);
  assert.match(styles, /--background: #f4efe4/);
  assert.match(styles, /--background-deep: #e9e2d5/);
  assert.match(styles, /--surface: #fbf8f1/);
  assert.match(styles, /--surface-elevated: #fffdf8/);
  assert.match(styles, /--foreground: #20231f/);
  assert.match(styles, /--foreground-muted: #64665f/);
  assert.match(styles, /--primary-hover: #772533/);
  assert.match(styles, /--primary-active: #651e2b/);
  assert.match(styles, /--success: #73826b/);
  assert.match(styles, /--accent: #c6a15b/);
  assert.match(styles, /--border: #d5caba/);
  assert.match(styles, /--danger: #b94a48/);
  assert.match(styles, /--shadow-color: rgba\(54, 43, 30, \.12\)/);
  assert.match(styles, /grid-template-columns: 174px minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 820px\)/);
  assert.match(styles, /@media \(max-width: 900px\) and \(min-width: 821px\)/);
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(page, /className="quiz-stat-panel"/);
  assert.match(page, /revealAnswer=\{Boolean\(feedback\)\}/);
  assert.match(page, /"Sol anahtarında bir nota"/);
  assert.match(page, /"A note on the treble staff"/);
  assert.match(page, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(page, /ref=\{feedbackButtonRef\}/);
  assert.doesNotMatch(page, /event\.key === "(?:Enter|Space|ArrowUp|ArrowDown)"/);
  assert.match(page, /document\.documentElement\.lang = locale/);
  assert.match(page, /className="result-session-meta"/);
  assert.match(page, /<dd>\{selectedLevel\.title\}<\/dd>/);
  assert.match(page, /<dd>\{copy\.modes\[mode\]\.title\}<\/dd>/);
  assert.match(page, /extra\.standard\.title : extra\.endless\.title/);
  assert.match(page, /<dd>\{totalTime\}<\/dd>/);
  assert.doesNotMatch(page, /7 Günlük Seri|%92/);
  assert.doesNotMatch(page, /"Nota Nota (?:ana sayfa|home)|Nota Nota ·/);
  assert.doesNotMatch(page, /·/);
  assert.doesNotMatch(community, /·/);
  assert.doesNotMatch(guitar, /·/);
  assert.doesNotMatch(magicLink, /·/);
  assert.match(styles, /\.app-navigation button::after \{ display: none; \}/);
  assert.match(styles, /\.app-navigation button\.is-active::before \{ display: none; \}/);
  assert.match(styles, /\.app-navigation button \{[^}]*border-radius: 10px;/);
  assert.match(styles, /\.landing-actions \.primary-button \{[\s\S]*min-height: 66px/);
  assert.match(styles, /\.hero-staff \{[^}]*grid-template-rows: auto 1fr auto;[^}]*border-radius: 18px;/);
  assert.match(styles, /\.hero-staff-score \{[^}]*min-height: 132px;/);
  assert.match(styles, /\.scribble \{[^}]*position: static;/);
  assert.match(page, /className="question-heading"/);
  assert.match(page, /className=\{`notation-stage notation-stage--\$\{mode\}`\}/);
  assert.match(styles, /\.notation-stage \{[^}]*min-height: 292px;[^}]*border-radius: 14px;/);
  assert.match(styles, /\.answer-line input \{[^}]*border-radius: 11px;/);
  assert.match(styles, /\.quiz-stat-context span \+ span::before \{[^}]*display: none;/);
  assert.match(community, /if \(!normalizedEmail\) \{[\s\S]*return;[\s\S]*signInWithOtp/);
  assert.match(community, /maxLength=\{EMAIL_MAX_LENGTH\}/);
  assert.match(styles, /\.leaderboard-segments \{[^}]*border-radius: 11px;/);
  assert.match(styles, /\.leaderboard-segments button \{[^}]*border-radius: 8px;/);
  assert.match(community, /event\.key === "Escape"/);
  assert.match(community, /appShell\?\.setAttribute\("inert", ""\)/);
  assert.match(community, /const last = focusable\[focusable\.length - 1\]/);
  assert.match(community, /last\.focus\(\)/);
  assert.match(community, /const closePanel = useCallback/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*\.answer-form > label \{ display: block; \}[\s\S]*\.answer-line \{ display: grid; \}/);
  assert.doesNotMatch(styles, /:has\(\.answer-line input:focus\)/);
  assert.doesNotMatch(page, /window\.visualViewport|window\.scrollBy|quiz-keyboard-open/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(migration, /p_wrong_count <> 0/i);
  assert.match(page, /sessionType === "standard"[\s\S]*totalWrong === 0 && correctCount === uniqueCount[\s\S]*totalWrong === 1 && correctCount > 0/);
  assert.match(page, /const leaderboardEligible = !endedEarly/);
  assert.match(endlessEligibilityMigration, /p_session_type = 'endless' and p_wrong_count <> 1/i);
  assert.match(endlessEligibilityMigration, /p_session_type = 'standard' and \(p_wrong_count <> 0 or p_correct_count <> v_expected_count\)/i);
  assert.match(noteRangeCountMigration, /when 'yakin' then 17[\s\S]*when 'tam' then 25[\s\S]*else 29/i);
  assert.match(community, /İlk hataya kadar en uzun doğru seri kazanır/);
  assert.match(community, /The longest correct streak before the first mistake wins/);
  assert.match(migration, /'temel', 'yakin', 'tam', 'genis'/i);
  assert.match(extendedLevelMigration, /best_scores_level_check/i);
  assert.match(extendedLevelMigration, /when 'tam' then 15[\s\S]*else 25/i);
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

test("günlük çalışma serisi gerçek tamamlamaları hesapta güvenle ve dürüstçe saklar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const community = await readFile(new URL("../app/community.tsx", import.meta.url), "utf8");
  const streakClient = await readFile(new URL("../lib/practice-streak.ts", import.meta.url), "utf8");
  const streakMigration = await readFile(
    new URL("../supabase/migrations/202607240001_add_daily_practice_streaks.sql", import.meta.url),
    "utf8",
  );

  // A standard session counts only after the complete range is finished. An
  // endless session must contain at least one correct answer, so opening and
  // immediately ending a session cannot manufacture a practice day.
  assert.match(
    page,
    /const completedStandardSession = sessionType === "standard" && !endedEarly && correctCount === uniqueCount;/,
  );
  assert.match(
    page,
    /const completedDailyPractice = completedStandardSession \|\| \(sessionType === "endless" && correctCount > 0\);/,
  );
  assert.match(
    page,
    /<CommunityPracticeRecorder active=\{completedDailyPractice\} activityKey=\{`notes-\$\{sessionStartedAt\}`\} \/>/,
  );
  assert.match(page, /\{completedDailyPractice && <CommunityPracticeStreak compact \/>\}/);

  // The live quiz answer streak is explicitly named so it cannot be confused
  // with the account's day streak.
  assert.match(page, /\{locale === "tr" \? "Doğru serisi" : "Answer streak"\}/);
  assert.doesNotMatch(page, /\{locale === "tr" \? "Seri" : "Streak"\}/);

  // Both reads and writes use the browser's IANA time zone and the Supabase
  // RPC boundary. No streak total is fabricated in browser storage.
  assert.match(
    streakClient,
    /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone \|\| "UTC"/,
  );
  assert.match(
    streakClient,
    /\.rpc\("get_my_practice_streak", \{[\s\S]*p_timezone: browserTimeZone\(\)/,
  );
  assert.match(
    streakClient,
    /\.rpc\("record_practice_day", \{[\s\S]*p_timezone: browserTimeZone\(\)/,
  );
  assert.match(streakClient, /currentStreak: Number\(row\.current_streak\) \|\| 0/);
  assert.match(streakClient, /longestStreak: Number\(row\.longest_streak\) \|\| 0/);
  assert.match(streakClient, /todayCompleted: Boolean\(row\.today_completed\)/);
  assert.match(
    streakClient,
    /activeDates: Array\.isArray\(row\.active_dates\) \? row\.active_dates\.map\(String\) : \[\]/,
  );
  assert.doesNotMatch(streakClient, /localStorage|sessionStorage/);

  // The recorder waits for auth, never writes for a guest, and marks an
  // activity key only after the idempotent server call succeeds.
  assert.match(
    community,
    /const recordPracticeCompletion = useCallback\(async \(\) => \{[\s\S]*if \(!user\) return false;/,
  );
  assert.match(
    community,
    /if \(!active \|\| !authReady \|\| !user \|\| recordedKey\.current === activityKey\) return;/,
  );
  assert.match(
    community,
    /recordPracticeCompletion\(\)\.then\(\(recorded\) => \{[\s\S]*if \(!cancelled && recorded\) recordedKey\.current = activityKey;/,
  );

  // Loading, guest, error, and signed-in states remain honest: guests see an
  // invitation rather than a number/week, failures offer retry, and account
  // changes clear stale streak data.
  assert.match(
    community,
    /if \(!authReady \|\| \(user && streakLoading && !streak\)\) \{[\s\S]*aria-busy="true"[\s\S]*copy\.loading/,
  );
  assert.match(
    community,
    /if \(!user\) \{[\s\S]*practice-streak-card--guest[\s\S]*copy\.guestTitle[\s\S]*copy\.guestCopy[\s\S]*openPanel\("auth"\)/,
  );
  assert.match(
    community,
    /if \(streakError && !streak\) \{[\s\S]*practice-streak-card--error[\s\S]*copy\.error[\s\S]*refreshPracticeStreak\(\)/,
  );
  assert.match(
    community,
    /if \(!nextUser\) \{[\s\S]*setProfile\(null\);[\s\S]*setStreak\(null\);[\s\S]*setStreakError\(false\);/,
  );
  assert.match(community, /copy\.title\(streak\.currentStreak\)/);
  assert.match(community, /new Set\(streak\.activeDates\)/);
  assert.match(community, /streak\.longestStreak > 0 && <small>/);
  assert.match(community, /aria-live="polite"/);
  assert.doesNotMatch(community, /7 Günlük Seri|7-day streak|%92/);

  // The database owns identity and calendar calculation. One row per
  // user/day makes repeated or concurrent completion calls idempotent.
  assert.match(
    streakMigration,
    /user_id uuid not null references auth\.users\(id\) on delete cascade/i,
  );
  assert.match(streakMigration, /primary key \(user_id, practiced_on\)/i);
  assert.match(streakMigration, /alter table public\.practice_days enable row level security;/i);
  assert.match(
    streakMigration,
    /create policy "Users can read their practice days"[\s\S]*for select[\s\S]*to authenticated[\s\S]*auth\.uid\(\)\) = user_id/i,
  );
  assert.doesNotMatch(streakMigration, /create policy[\s\S]{0,120}\bfor insert\b/i);
  assert.doesNotMatch(streakMigration, /\bgrant insert\b/i);
  assert.equal(
    [...streakMigration.matchAll(/v_user_id uuid := auth\.uid\(\);/gi)].length,
    2,
  );
  assert.equal(
    [...streakMigration.matchAll(/raise exception 'authentication_required';/gi)].length,
    2,
  );
  assert.match(
    streakMigration,
    /on conflict \(user_id, practiced_on\)[\s\S]*do nothing;/i,
  );

  // IANA validation and server time prevent the client from choosing an
  // arbitrary date. The returned week is the real Monday-Sunday window.
  assert.equal(
    [...streakMigration.matchAll(/from pg_catalog\.pg_timezone_names/gi)].length,
    2,
  );
  assert.equal(
    [...streakMigration.matchAll(/raise exception 'invalid_timezone';/gi)].length,
    2,
  );
  assert.equal(
    [...streakMigration.matchAll(/\(statement_timestamp\(\) at time zone v_timezone\)::date/gi)].length,
    2,
  );
  assert.doesNotMatch(streakMigration, /\bp_user_id\b|\bp_practiced_on\b|\bp_date\b/i);
  assert.match(
    streakMigration,
    /v_week_start := date_trunc\('week', v_today::timestamp\)::date;/i,
  );
  assert.match(
    streakMigration,
    /practiced_on between v_week_start and v_week_start \+ 6/i,
  );
  assert.match(streakMigration, /array_agg\(practiced_on order by practiced_on\)/i);

  // Current streak stays alive through yesterday; longest streak is derived
  // independently from every consecutive run in the account history.
  assert.match(
    streakMigration,
    /v_cursor := case when v_today_completed then v_today else v_today - 1 end;/i,
  );
  assert.match(
    streakMigration,
    /while exists \([\s\S]*practiced_on = v_cursor[\s\S]*v_current := v_current \+ 1;[\s\S]*v_cursor := v_cursor - 1;/i,
  );
  assert.match(
    streakMigration,
    /practiced_on - \(row_number\(\) over \(order by practiced_on\)\)::integer as run_group/i,
  );
  assert.match(
    streakMigration,
    /select coalesce\(max\(run_length\), 0\)::integer[\s\S]*group by run_group/i,
  );
  assert.match(
    streakMigration,
    /select v_current, v_longest, v_today_completed, v_last_practice_date, v_active_dates;/i,
  );
  assert.equal(
    [...streakMigration.matchAll(/security definer[\s\S]*?set search_path = ''/gi)].length,
    2,
  );
  assert.match(streakMigration, /revoke all on function public\.get_my_practice_streak\(text\) from public;/i);
  assert.match(streakMigration, /revoke all on function public\.record_practice_day\(text\) from public;/i);
  assert.match(streakMigration, /grant execute on function public\.get_my_practice_streak\(text\) to authenticated;/i);
  assert.match(streakMigration, /grant execute on function public\.record_practice_day\(text\) to authenticated;/i);

  // KVKK copy discloses the extra dates/time-zone data, its private purpose,
  // retention, and deletion behavior in both supported languages.
  assert.match(
    community,
    /Tamamlanan çalışma günleri ve tarayıcının bildirdiği saat dilimi,[\s\S]*özel günlük seri ve devamlılık istatistiklerini hesaplamak için saklanır\./,
  );
  assert.match(
    community,
    /Completed practice dates and the browser-reported time zone are stored to calculate private daily-streak and consistency statistics\./,
  );
  assert.match(community, /E-posta ve günlük seri verileri leaderboard’da yayımlanmaz\./);
  assert.match(community, /Email and streak data are never published on the leaderboard\./);
  assert.match(
    community,
    /tamamlanan çalışma günleri hesap silinene kadar saklanır; hesap silindiğinde seri kayıtları da silinir\./,
  );
  assert.match(
    community,
    /completed practice dates are retained until the account is deleted; streak records are deleted with the account\./,
  );
});

test("hesap silme istemcisi yalnızca doğrulanmış Edge Function sözleşmesini kullanır", async () => {
  const calls = [];
  const mockClient = {
    functions: {
      async invoke(name, options) {
        calls.push({ name, options });
        return { data: { deleted: true }, error: null };
      },
    },
  };

  const result = await deleteCurrentAccount(mockClient);
  assert.deepEqual(result, { deleted: true });
  assert.deepEqual(calls, [{
    name: "delete-account",
    options: { body: { confirmation: "DELETE MY ACCOUNT" } },
  }]);
  assert.equal(DELETE_ACCOUNT_CONFIRMATION, "DELETE MY ACCOUNT");

  const failingClient = {
    functions: {
      async invoke() {
        return {
          data: null,
          error: { message: "internal database detail that must not reach the UI" },
        };
      },
    },
  };
  await assert.rejects(
    deleteCurrentAccount(failingClient),
    (error) => error instanceof Error
      && error.message === "delete_account_failed"
      && !error.message.includes("database"),
  );
});

test("hesap paneli iki dilli, erişilebilir ve tekrar denenebilir silme akışı sunar", async () => {
  const community = await readFile(new URL("../app/community.tsx", import.meta.url), "utf8");
  const deletionClient = await readFile(new URL("../lib/delete-account.mjs", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(community, /deleteTitle: "Hesabı sil"/);
  assert.match(community, /deleteButton: "Hesabımı sil"/);
  assert.match(community, /deletePhrase: "HESABIMI SİL"/);
  assert.match(community, /deleteSuccess: "Hesabın ve ilişkili kayıtların silindi\."/);
  assert.match(community, /deleteTitle: "Delete account"/);
  assert.match(community, /deleteButton: "Delete my account"/);
  assert.match(community, /deletePhrase: DELETE_ACCOUNT_CONFIRMATION/);
  assert.match(community, /deleteSuccess: "Your account and related records were deleted\."/);
  assert.match(community, /panel === "delete" && user && supabase/);
  assert.match(community, /const matches = confirmation === text\.deletePhrase;/);
  assert.match(community, /disabled=\{busy \|\| !matches\}/);
  assert.match(community, /disabled=\{busy\}/);
  assert.match(community, /aria-busy=\{busy\}/);
  assert.match(community, /onBusyChange\(true\)/);
  assert.match(community, /onBusyChange\(false\)/);
  assert.match(community, /await deleteCurrentAccount\(supabase\)/);
  assert.match(community, /clearPendingScore\(\)/);
  assert.match(community, /supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(community, /setUser\(null\)/);
  assert.match(community, /setProfile\(null\)/);
  assert.match(community, /setStreak\(null\)/);
  assert.match(community, /role="status" aria-live="polite" tabIndex=\{-1\}/);
  assert.match(community, /role=\{message \? "alert" : "status"\} aria-live="polite"/);
  assert.match(community, /dismissible=\{!deletionBusy\}/);
  assert.match(community, /Hesabını ve ilişkili kayıtlarını Hesabım panelinden kendin silebilirsin\./);
  assert.match(community, /You can delete your account and related records yourself from the Account panel\./);
  assert.doesNotMatch(community, /window\.confirm/);
  assert.doesNotMatch(community, /service[_-]?role|secret[_-]?key|admin[_-]?credential/i);
  assert.match(deletionClient, /functions\.invoke\("delete-account"/);
  assert.match(deletionClient, /confirmation: DELETE_ACCOUNT_CONFIRMATION/);
  assert.doesNotMatch(deletionClient, /service[_-]?role|secret[_-]?key|api[_-]?token/i);
  assert.match(styles, /\.account-danger-zone/);
  assert.match(styles, /\.delete-account-panel/);
  assert.match(styles, /\.community-toast/);
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
