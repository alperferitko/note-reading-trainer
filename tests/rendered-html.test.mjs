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
  assert.doesNotMatch(html, /Gitar klavyesi|Guitar fretboard/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("oturum mantığı benzersiz başlangıç ve yanlışları tekrar kuyruğunda tutar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const community = await readFile(new URL("../app/community.tsx", import.meta.url), "utf8");
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
  assert.match(page, /id: "genis"[\s\S]*count: 25/);
  assert.match(page, /id: "temel"[\s\S]*count: 9/);
  assert.match(page, /id: "yakin"[\s\S]*count: 13/);
  assert.match(page, /id: "tam"[\s\S]*count: 15/);
  assert.match(page, /ledgerPositionsFor/);
  assert.match(page, /\[-8, -6, -4, -2, 10, 12, 14, 16\]/);
  assert.match(page, /if \(sessionType === "endless"\) \{[\s\S]*setFeedback\(null\);[\s\S]*setStage\("done"\);[\s\S]*return;/);
  assert.match(page, /sessionType === "endless" \? \([\s\S]*className="endless-results-card"/);
  assert.match(page, /extra\.endedSession\(correctCount, totalTime\)/);
  assert.match(styles, /\.endless-results-card/);
  assert.match(page, /questionKey\.current\+\+/);
  assert.match(page, /useState<Stage>\("landing"\)/);
  assert.doesNotMatch(page, /GuitarTrainer|guitar-trainer|setStage\("guitar"\)/);
  assert.match(page, /<CommunityResult/);
  assert.match(community, /nota-nota-pending-score/);
  assert.match(community, /rememberPendingScore\(score\)/);
  assert.match(community, /openPanel\("auth", text\.scoreSignInWarning\)/);
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
  assert.match(page, /Hazırsan başlayalım — sakin bak, net cevapla\./);
  assert.doesNotMatch(page, /const GuitarTrainer = lazy/);
  assert.match(page, /className="mobile-module-navigation"/);
  assert.match(page, /playPracticeNote\(noteIdToMidi\(current\.id\), soundEnabled\)/);
  assert.match(page, /className="listen-note-button"/);
  assert.match(styles, /\.mobile-module-navigation/);
  assert.match(page, /className="brand-mark" aria-hidden="true">[\s\S]*notanota-monogram\.png/);
  assert.match(page, /className="brand-mark result-flourish" aria-hidden="true">[\s\S]*notanota-monogram\.png/);
  assert.doesNotMatch(page, /className="brand-mark" aria-hidden="true">♪/);
  assert.doesNotMatch(page, /name="note"/);
  assert.match(styles, /font-family: "Bodoni MT", Didot/);
  assert.match(styles, /\.brand \.brand-mark \{[\s\S]*border: 0;[\s\S]*background: transparent;/);
  assert.match(styles, /\.brand-mark img \{[\s\S]*object-fit: contain;/);
  assert.match(styles, /\.brand::before \{[\s\S]*repeating-linear-gradient\([\s\S]*rgba\(32, 35, 31, \.42\)/);
  assert.match(styles, /\.brand-name \{[\s\S]*margin-left: -5px;[\s\S]*text-shadow:/);
  assert.match(styles, /\.result-flourish \{[\s\S]*border-radius: 0;[\s\S]*background: transparent;/);
  assert.match(magicLink, /https:\/\/notanota\.online\/notanota-monogram\.png/);
  assert.match(magicLink, /background:#E9E2D5/);
  assert.match(magicLink, /background:#FBF8F1/);
  assert.match(magicLink, /background:#8B2F3C/);
  assert.match(magicLink, /border:1px solid #C6A15B/);
  assert.match(magicLink, /\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}/);
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
  assert.doesNotMatch(page, /window\.addEventListener\("keydown"/);
  assert.match(page, /document\.documentElement\.lang = locale/);
  assert.match(page, /className="result-session-meta"/);
  assert.match(page, /<dd>\{selectedLevel\.title\}<\/dd>/);
  assert.match(page, /<dd>\{copy\.modes\[mode\]\.title\}<\/dd>/);
  assert.match(page, /extra\.standard\.title : extra\.endless\.title/);
  assert.match(page, /<dd>\{totalTime\}<\/dd>/);
  assert.doesNotMatch(page, /7 Günlük Seri|%92/);
  assert.doesNotMatch(page, /"Nota Nota (?:ana sayfa|home)|Nota Nota ·/);
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
