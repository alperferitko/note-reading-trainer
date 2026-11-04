# AI foundation — offline slice A

> B1 update: a local-only mock HTTP boundary now exists. See
> ai-backend-b1.md and ai-usage-ledger-design.md. The slice A status below describes
> the original foundation; no live provider, durable counter or deployment was added.

## Scope and status

Implemented on `hackathon/notanota-ai`: contracts, runtime validation, deterministic
evidence summaries, empty-by-default model registry, usage policy, dependency-injected
mock gateway, and offline Node tests. No dependencies added.

There is NO HTTP endpoint, JWT verifier, live provider transport, secret configuration,
database migration, persistent quota store, UI integration or deployment in this slice.
`AIWeeklyReport` is a design contract only; weekly-report and quality-evaluation requests
are explicitly rejected. Context-review suggestions are plans, not playable exercises.

The frontend and its free learning features do not import or depend on these modules.
Existing CSS changes and unrelated untracked directories are outside scope.

## Architecture

Future verified Supabase auth context -> request validation -> deterministic summary
-> model registry/policy -> atomic usage reservation -> provider adapter -> response
validation -> usage settlement. The offline gateway runs this sequence with injected
mock adapters and a test-only usage store. No network transport is supplied.

Meta is the default route for educational feedback/adaptive exercises. Baseten can be
explicitly selected as a secondary route if Meta is not configured; this is NOT an
automatic retry after a failed Meta request. Claude is excluded from basic-learning
policy and reserved for a separately authorized future evaluation task.

All live models fail closed even if the registry contains a verified live entry.
A `mode: mock` flag is a trusted dependency contract, not a sandbox: do not inject
untrusted adapter implementations. Test suites prohibit fetch access.

## Evidence safety

Reuse the existing `lib/practice-evidence.mjs` analysis without changing it. Preserve
clef, item and timed/untimed separation during calculation. Provider-visible context
IDs are opaque; raw answers, item/task strings and session identifiers are omitted.
Each response retains the summary so an eventual UI can resolve context IDs against
the same deterministic ordering. Do not treat these IDs as stable across requests.

Accuracy uses at most six recent unaided comparable records per context. At least
three such records are required for model generation. Assisted/stale data does not
qualify. Tap tasks label responseMs as tap-timing-error, not answer latency.
No microphone pitch measurement, cents estimate or historical detailed tap result
is reconstructed. Client-reported data is not tamper-proof evidence.

Strict output schemas reject new measurement fields, unknown references, unapproved
exercise IDs and out-of-range repetitions. They cannot prove free-text truthfulness.
Never render model text as HTML; never use it to alter scores or measured facts.

## Usage store contract

`reserve` must atomically enforce user minute/day counts, concurrency, user daily
spend and global daily spend, including in-flight reservations. It binds user ID +
idempotency key to a SHA-256 request fingerprint. Same-key changed input conflicts;
completed identical requests replay; in-flight duplicates conflict.

`settle` records a response and known estimated cost. Unknown usage, timeout and
provider errors retain the full reservation until reconciliation. A production
implementation must be durable, transactional, expiry-aware and tested across
multiple workers. Store outages fail closed. Request IDs must be server-generated
at the future HTTP boundary. Do not use evidence identifiers as request IDs.

The memory store under tests/fixtures/ai is deliberately TEST ONLY. Replay retention,
reservation crash recovery, reconciliation and retention/deletion policies remain
deployment blockers. Gateway timeout currently bounds adapter execution, not storage
I/O; a live endpoint also needs an overall deadline and bounded storage operations.

## Next approval gates

1. Verify isolated Supabase environment, project plan, JWT validation, runtime and
   packaging of shared pure-module imports. Supabase functions are excluded from
   the existing frontend TypeScript check; add a separate Deno check in slice B.
2. Approve durable usage schema and atomic operations separately. No migration is
   authored or applied by slice A.
3. Verify model access/pricing/capabilities and data-processing terms; implement live
   transports with server-only secrets, input budgets and total deadline.
4. Approve a strictly bounded paid smoke test before enabling any inference.
5. Only then add an authenticated endpoint with streaming byte limits, explicit
   origin allowlist, safe errors and per-user policy. CORS is not authentication.
6. UI integration and playable adaptive exercise validation require another review.

## Production safeguards

Supabase is the preferred target because auth and an Edge Function pattern already
exist. Actual deployment, limits and staging remain unverified. The current Worker
is a vinext application entry point, not an independently configured AI service.
Do not repurpose it or move the Pages frontend for this foundation.

The Pages workflow deploys on main push and also exposes workflow_dispatch. A branch
does not prevent manual production deployment. Leave the workflow unchanged; never
put provider keys in VITE variables, frontend imports or static artifacts. A backend
change to the production Supabase project would affect production despite Git branch
isolation. No automatic commit, push, migration, infrastructure change or deployment.

## Validation

Run `npm run test:ai` for offline foundation tests (no build, no provider keys).
Run the existing evidence and pulse Node tests for deterministic regression checks.
Targeted ESLint validates the new files. Full npm test builds the application and
is distinct from these checks; it has not been replaced by test:ai.