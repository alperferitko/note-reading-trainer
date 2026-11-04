# NotaNota

A bilingual (Turkish / English) music-reading studio: read notes and scores, keep rhythm, train your ear and find notes on an instrument, with a personal AI teacher that works from what you actually answered.

**Live:** [notanota.online](https://notanota.online)

![NotaNota practice studio](./public/og.png)

## What you can practise

| Area | What it does | What it measures |
|---|---|---|
| Note reading | Treble and bass clef, naturals, sharps and flats in four ranges; from the staff or from a written position; normal and endless modes | First-attempt accuracy and response time per note |
| Rhythm | Steady pulse and five tapped patterns (rests, eighths, dotted, sixteenths) in 4/4 | Mean timing offset of your taps in ms |
| Score reading | Ten graded studies and staff lines with bars, rests, 3/4, key signatures and bass clef | Note names, rests and timing, reported separately |
| Instruments | Find the note on piano (one staff or grand staff), guitar (0–3, 0–5, 0–12 frets) and violin (1st and 3rd position) | Correct position on screen; the instrument's sound is not listened to |
| Listening | Pitch direction, intervals, chord quality and short melodic dictation | Correct answers |
| Microphone | Play the shown note on piano, guitar or violin; audio stays in the browser | Pitch of a single note (±35 cents); no rhythm or live score following |
| Lessons | 24 short lessons with prerequisites, knowledge checks and spaced review | Lesson progress |
| MusicXML | Open a `.musicxml`, `.xml` or `.mxl` file, see the score and practise its single-line bars | Same as score reading |

Progress and the skill map are kept in the browser. Accounts (passwordless email or Google) add a username, a private daily streak and the leaderboards.

## NotaNota AI

- **Round feedback.** After a round, Meta AI comments on the notes you struggled with and suggests the next drill. A clean round is not turned into invented difficulty.
- **Teacher chat.** A personal teacher that asks about your goal, instrument and week, and can save a day-by-day plan.
- **Weekly report.** The app computes the numbers; the model only explains them.
- **Score check.** An uploaded PDF or photo is screened before it is saved: is it a score, and is anything inappropriate in it.

The model never sees raw answers or account data, only a measured summary. Every answer is validated before it is shown, and rule-based feedback takes over when AI is unavailable.

**Free trial.** Every account gets 3 days of NotaNota AI from sign-up; accounts older than the launch count from the launch. A fair-use limit applies, enforced in the database:

| Scope | Limit |
|---|---|
| Per account | 6 requests a minute, 25 a day, 60 for the whole trial |
| Everyone together | a daily and a total USD budget, after which AI pauses |

## Architecture

```
Browser (React 19, Vite) ── GitHub Pages, static
   │  practice, measurement and progress run here
   ▼
Supabase
   ├─ Auth, Postgres with row-level security (profiles, streaks, leaderboards, scores, goals)
   ├─ Edge Function ai-gateway ── Meta Model API (muse-spark)
   │     JWT check, per-target approval, usage ledger (reserve → settle), output validation
   └─ Edge Function delete-account
Optional: worker/omr ── reads uploaded PDF/PNG scores into MusicXML (Audiveris)
```

No provider key reaches the browser: the Meta key lives only in Edge Function secrets.

## Repository

| Path | Contents |
|---|---|
| `app/` | Pages, practice modules, the shell (navbar, footer) and styles |
| `lib/` | Music logic, measurement, AI client and Supabase helpers, mostly framework-free `.mjs` |
| `supabase/functions/` | `ai-gateway` and its shared modules (`_shared/ai`), `delete-account` |
| `supabase/migrations/` | Database schema in order: community, leaderboards, AI ledger, score library, learning profile, free trial |
| `supabase/templates/` | Auth email templates |
| `scripts/` | Build helpers, staging preview, production AI setup |
| `tests/` | Node test runner suites; SQL runs on PGlite (PostgreSQL in WebAssembly) |
| `worker/omr/` | Score recognition worker and its benchmark |
| `docs/` | Setup notes; `docs/hackathon/` design and AI decisions; `docs/archive/` earlier plans |

## Local development

Requires Node.js 22.13 or newer.

```bash
git clone https://github.com/alperferitko/note-reading-trainer.git
cd note-reading-trainer
npm ci
cp .env.example .env.local
npm run dev
```

With blank Supabase variables the practice studio works on its own; accounts and AI stay off.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Accounts, streaks and leaderboards |
| `VITE_GOOGLE_AUTH_ENABLED` | Shows Google sign-in |
| `VITE_AI_GATEWAY_URL` | NotaNota AI; must be the `ai-gateway` of the same Supabase project |
| `VITE_SCORE_LIBRARY`, `VITE_LEARNING_PROFILE` | Score uploads and library; goals and weekly reports |

## Tests

```bash
npm run lint
npm test                 # build, then the core suites
npm run test:ai          # gateway, teacher, weekly metrics, score screen
npm run test:ai:b4       # ledger and free trial on PostgreSQL, AI client, Meta configuration
npm run test:scores      # score library SQL
npm run test:features    # MusicXML, pitch detection, practice plan
npm run test:pages       # static Pages output
```

## Deployment

- **Frontend.** Every push to `main` runs lint, tests and the static build in GitHub Actions and publishes to GitHub Pages. Build variables come from the repository's Actions variables.
- **AI backend, staging.** `npm run preview:staging` builds against staging; `scripts/meta-activate.ps1` writes its secrets, with an approval of at most 24 hours.
- **AI backend, production.** Three steps:
  1. `node scripts/production-ai-sql.mjs` writes one SQL file for the SQL Editor.
  2. `scripts/meta-activate.ps1 -Production` writes the secrets, with an approval of at most 62 days.
  3. `npx supabase functions deploy ai-gateway --project-ref <production ref>` deploys the gateway.

  Always name the project with `--project-ref`.
- **Accounts and email.** See [docs/community-setup.md](./docs/community-setup.md) and [docs/weekly-leaderboard-setup.md](./docs/weekly-leaderboard-setup.md).

## Privacy

Leaderboards show only a username and the qualifying score. Email addresses and practice dates stay private. Signed-in users can delete their account and its records from the account panel. The in-app KVKK / privacy notice describes the data flow and service providers.
