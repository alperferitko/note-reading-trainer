# NotaNota AI

A music-reading studio that helps learners read notes and scores fluently, with a Meta-powered teacher that works from what they actually answered.

AI can help us learn, but the joy of picking up an instrument and making music yourself is deeply human. NotaNota uses AI to make that path more accessible and to keep learners motivated, while the practice itself stays theirs.

### Try the live app and AI features: https://notanota.online

English version: [notanota.online/en](https://notanota.online/en/)

For the easiest evaluation, use the live application. Running the repository locally does not automatically enable the hosted AI backend.

## Try it in five minutes

1. **Sign in.**
   - Choose **Sign in** (top right), enter your email and choose **Send verification link**.
   - Open the link in the email, then press **Confirm my email** on the page that opens.
   - Pick a username. A welcome window explains the free trial.
2. **Practise.**
   - Go to **Studio → Note reading**.
   - In the first setup window choose **I'm just getting started**, then **Save setup**, then **Start session**.
   - Name the notes. When the round ends, press **Results →**.
3. **Get AI feedback.** On the results screen, the **NotaNota AI** card has an **Ask Meta AI** button.
   - Meta comments on a note only after it has at least three unaided answers.
   - Notes you miss come back in the same round. After a clean first round, play one more; answers are kept on your device.
4. **Chat with the teacher.** Open **NotaNota AI → Ask the teacher**, or use the chat button at the bottom right.
   - Say hello or ask for a weekly plan.
   - The teacher asks about your goal, instrument and practice time, and can save a day-by-day plan.
5. **Optional.**
   - Weekly report: **Studio → My progress → Let Meta AI explain this week**.
   - Score check: **NotaNota AI → Add a score**, then upload a PDF or photo.

### Account, free trial and limits

AI features need a free account (email link). Practice, statistics and rule-based feedback need no account.

Each account gets 3 days of NotaNota AI from sign-up. Accounts created before the launch on 4 November 2026 count from the launch. A fair-use limit is enforced on the server:

| Per account | Limit |
|---|---|
| Per minute | 6 requests |
| Per day | 25 requests (resets at 00:00 UTC) |
| Whole trial | 60 requests |

Each chat message is one request. A shared daily and total budget pauses AI for everyone when it is reached.

## What it does

| Area | What you do | What is measured |
|---|---|---|
| Note reading | Name notes in treble and bass clef, with naturals, sharps and flats, in four ranges | First-try accuracy and response time per note |
| Rhythm | Tap a steady pulse and five patterns in 4/4 | Mean timing offset of your taps |
| Score reading | Ten graded studies and staff lines, plus your own MusicXML files | Note names, rests and timing |
| Instruments | Find the note on piano, guitar and violin | The position you pick on screen |
| Listening | Pitch direction, intervals, chord quality, short dictation | Correct answers |
| Microphone | Play the shown note on a real instrument | Pitch of one note (±35 cents) |
| Lessons | 24 short theory lessons with spaced review | Lesson progress |

All of this runs in the browser and works without AI. Progress and the skill map stay on the device. An account adds a username, a private streak and the leaderboards.

## How Meta is used

All model calls go through one server-side gateway, the Supabase Edge Function `ai-gateway`, to the Meta Model API. The model is Muse Spark; the exact model id is set in server configuration.

| Task | What Meta does | What is sent to Meta |
|---|---|---|
| Practice feedback | Comments on the notes you struggled with and suggests the next drill; a clean round gets no invented difficulty | A summary the gateway computes from your recent answers in that module: accuracy and response time for each note. Typed answers, ids and account data are left out. |
| Teacher chat and weekly plan | Short onboarding, encouragement and a day-by-day plan | The newest chat messages that fit the limit, your saved learning preferences (purpose, instrument, level, weekly minutes, interests) and, if you have practice history, the same performance summary |
| Weekly report | Explains the week in plain words | Only the metrics the app computed: sessions, practice days, right and wrong answers, hard notes, median answer time, rhythm offset, the previous week, and titles and bar ranges of pieces you practised |
| Score check | Says whether an upload looks like a score and flags inappropriate content or handwriting over the notes | Images made in the browser from the uploaded pages: up to 8 page thumbnails per image, at most 16 pages. The image is not stored with the answer. |

**Not done by Meta.** Pitch detection, timing, scoring and statistics are deterministic code. Microphone audio is analysed in the browser and never uploaded. The model never receives your email or user id.

**Checks around every call.**
- Every answer must match a JSON schema and the measured evidence before it is shown.
- If an answer fails a check, the app shows rule-based feedback and says why.
- Each request is reserved in a usage ledger in Postgres (per-request, per-user and global budgets) before anything is sent, and settled afterwards.

## Local setup

Requires Node.js 22.13 or newer.

```bash
git clone https://github.com/alperferitko/note-reading-trainer.git
cd note-reading-trainer
npm ci
cp .env.example .env.local   # optional; blank values keep accounts and AI off
npm run dev
```

With blank variables the whole practice studio works. Accounts need a Supabase project; see [docs/community-setup.md](./docs/community-setup.md).

AI needs the gateway, its migrations and server secrets:
- The backend is described in [docs/archive/ai-staging-b3.md](./docs/archive/ai-staging-b3.md).
- Production setup uses `scripts/production-ai-sql.mjs` and `scripts/meta-activate.ps1`.
- `AI_BACKEND_MODE=local-mock` runs the gateway against a local Supabase with labelled test answers instead of Meta.
- The Meta key lives only in Edge Function secrets, never in `VITE_` variables.

To see the real AI features, use the live site.

## Tests

```bash
npm run lint
npm run typecheck
npm test                  # build + core suites (rendering, music logic, evidence, SQL checks)
npm run test:ai           # gateway, teacher, weekly metrics, score check
npm run test:ai:http      # HTTP boundary: auth, CORS, size and time limits
npm run test:ai:b3        # live-call authorization
npm run test:ai:b4        # usage ledger and free trial on PostgreSQL (PGlite), client, Meta configuration
npm run test:ai:learning  # learning assessment
npm run test:scores       # score library SQL
npm run test:upload       # upload and score checks
```

On every push to `main`, GitHub Actions runs:
- lint
- the core, AI and upload test suites
- the static build

## Architecture and limitations

```
Browser (React 19 + Vite, static on GitHub Pages)
  practice, measurement, progress, pitch detection
        │ signed-in AI requests only
        ▼
Supabase: Auth · Postgres with row-level security · Edge Functions
        │ ai-gateway: JWT check, approval, usage ledger, output validation
        ▼
Meta Model API
```

| Path | Contents |
|---|---|
| `app/`, `lib/` | Interface, music logic, measurement, AI client |
| `supabase/functions/` | `ai-gateway` and its shared modules, `delete-account` |
| `supabase/migrations/` | Schema: community, leaderboards, AI ledger, score library, learning profile, free trial |
| `scripts/` | Build helpers, staging preview, production AI setup |
| `worker/omr/` | Optical music recognition worker and its benchmark |
| `tests/` | Node test runner suites; SQL runs on PGlite |

**Limitations**
- **Score recognition:** reading uploaded PDFs and photos needs the separate OMR worker, which is not running on the live site. Uploads are checked and saved but wait in the queue. MusicXML files can be opened and practised directly at [notanota.online/en/eser-okuma/musicxml](https://notanota.online/en/eser-okuma/musicxml/).
- **Microphone:** it checks the pitch of a single note. It does not measure rhythm or tone, and does not follow a score live.
- **Instruments:** practice happens on screen; the instrument's own sound is not listened to.
- **Progress:** except for streaks and leaderboards, progress stays in the browser and is not synced between devices.
- **AI use:** limited by the free trial and the budgets above.

## License

The NotaNota source code is released under the [MIT License](./LICENSE). Fonts, sounds, sample scores and logos keep their own licenses; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
