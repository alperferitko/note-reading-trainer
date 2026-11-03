# B3 — durable quotas and staging readiness

Authored 2026-10-30. No database migration, remote operation, workflow run, model-list
request or paid call was performed. B3 supersedes B2's unconditional live lock ONLY
for the explicitly authorized staging composition root. Local mock rules unchanged.

## Files and contract

HTTP still accepts schemaVersion:1, task, locale, scope and evidence.records only.
Browser never selects user, provider, model, price or quota. getUser(jwt) verifies user
server-side; anonymous users are rejected. Client records are schema-checked, not
trusted ground truth; the server derives the summary and removes raw answers.
Model sees projected aggregate contexts/measurements, never JWT, email or session IDs.
Feedback/evidenceRefs/exercises are locally validated and rendered as data, not HTML.
Validation can reject invented structured fields/references; it cannot prove every
claim in generated natural-language prose is true. Review real responses before release.

B2 teacher UI is STILL local DEMO and does NOT call this backend. No UI/CSS changes.
Backend live mode must not be mislabelled mock. A later approved frontend connection
needs staging Auth, exact origin, idempotency header and explicit user consent.

## Ledger: integer micro-USD, 1 USD = 1,000,000 micro

Migration: supabase/migrations/202610300001_ai_usage_ledger.sql. It creates a private
schema, enabled=false singleton control row and append-preserved request ledger.
No raw input, answer, JWT, provider body or secret is stored. Safe response snapshots
include aggregate evidence and are sensitive; they are cleared lazily on reserve or
recovery after 24h. An idle database needs an approved scheduled cleanup to guarantee
wall-clock TTL. Account deletion scrubs replay before user FK is set null; aggregate
charges remain so deletion cannot refund the global budget. Final billing-retention
policy is still an operator/privacy decision. Never prune charges without preserving
the total spend counter and duplicate tombstones.

reserve/settle/recover all lock the same control row FOR UPDATE. This intentionally
serializes a small hackathon staging workload rather than adding counters/race-prone
distributed logic. Database time is authoritative, daily boundaries are UTC. Original
created_at remains the billing bucket even when settlement crosses midnight.
Unique(user_id,idempotency_key), fingerprint and replay snapshot implement duplicates:
- same user/key+fingerprint with unexpired response: replay, no provider call;
- in-flight/changed/expired snapshot: conflict, never implicit paid retry;
- same key for another user: separate entry.

Database controls (not browser policy): 3/min, 20/day, 1 unresolved request/user;
max request $0.02, user/day $0.20, global/day $2, global lifetime $10. Reserve checks
all counts and charges including full outstanding reservations atomically. All failed
attempts that reserved quota still count toward rate limits. Lifetime spend deliberately
halts the staging experiment; resetting it needs explicit reviewed admin action.

Known complete usage settles to upward-rounded actual micro-USD and records tokens.
Missing usage/network failure/timeout stays uncertain, full reserved cost retained,
slot remains held. Reported billing from rejected model output is preserved internally
when parseable. Actual overage is recorded in full and disables new reservations.
No automatic paid retry. SQL or RPC failure blocks work; failed settlement leaves the
durable reservation intact. Reservations expire after 120s but expiry alone NEVER
refunds cost or releases a slot. Operator cancels/confirms worker termination then
calls owner-only ai_usage_recover; cost remains conservative. Existing late known
settlement can reconcile the same reservation, never create a second one.

Both tables enable RLS with no client policies. No table/schema rights for anon,
authenticated OR service_role. Public RPCs use SECURITY DEFINER, empty search_path,
qualified table names; reserve/settle EXECUTE only to service_role, recover only owner.
Service-role client is separate from getUser client and receives no user's Authorization
header. Trusted backend supplies the verified UUID. This is not a per-user RPC intended
for direct browser access. Database administrator remains the trust root.

## Live gate: all conditions required

Checked-in supabase/ai-staging-target.json deliberately contains null refs and empty
origins: deploy and live composition FAIL CLOSED until reviewed real NON-secret pins
are entered. Do not copy a project ref from local linked metadata.

Edge Function Secrets/configuration (never frontend/VITE/Actions logs):

| Name | Required value/purpose |
| --- | --- |
| AI_BACKEND_MODE | staging-meta (disabled by deployment workflow) |
| AI_STAGING_PROJECT_REF | exact reviewed staging pin |
| AI_PRODUCTION_PROJECT_REF | distinct production deny pin |
| AI_ALLOWED_ORIGINS | exact HTTPS staging origins, subset of reviewed pins |
| AI_STAGING_LIVE_APPROVAL | APPROVED_BOUNDED_META_STAGING, only after separate approval |
| AI_STAGING_APPROVAL_EXPIRES_AT | UTC ISO timestamp, future and <=24h |
| META_MODEL_ID | exact ID returned by account model-list API; no default |
| META_MODEL_VERIFIED_AT | UTC timestamp, no more than 7 days old |
| META_MODEL_VERIFICATION_SOURCE | https://api.meta.ai/v1/models |
| META_TOKEN_BOUND_VERIFIED | true only after reviewing exact model tokenizer/template bound |
| META_INPUT_USD_PER_MILLION | reviewed positive uncached upper-bound rate |
| META_OUTPUT_USD_PER_MILLION | reviewed positive rate including reasoning output |
| META_API_KEY | provision only as an Edge Function Secret after approval |

SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY and DENO_DEPLOYMENT_ID are runtime-provided.
URL must exactly equal staging project URL; deployment ID must start staging_ref_.
Config object receives an internal WeakSet brand; setting policy.liveEnabled=true,
passing copied config or choosing live model alone cannot activate transport. Live
requires brand+unexpired approval+postgres store+Meta exact model. No other providers.
DB control project_ref must match too. Ledger starts disabled independently of Edge.

Input wire body capped at 12,000 JS chars. Conservative assumed input bound is 4 UTF-8
bytes/char + 4096 template/special-token margin = 52,096 tokens; output cap 800 includes
reasoning. Exact model tokenizer/context/template must be reviewed before attesting
META_TOKEN_BOUND_VERIFIED. If that bound is not valid, DO NOT ENABLE; implement exact
counting or a verified model-specific bound first. Combined model pricing upper bound
must fit $0.02 or staging config refuses. This may intentionally reject expensive models.
Registry price verification is an operator attestation, not a live price lookup.
Response cap 64KiB, provider timeout 10s, HTTP deadline 15s, no redirects. Request abort
propagates to provider. Failed/unknown billing is deliberately conservative.

## Verify Meta access WITHOUT generation (operator procedure, NOT executed)

Official references:
- https://dev.meta.ai/docs/api-reference/models/list-models
- https://dev.meta.ai/docs/api-reference
- https://supabase.com/docs/reference/cli/supabase-functions-deploy
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/database/postgres/row-level-security

In an approved trusted operator environment or temporary reviewed staging-only admin
function, read the secret from Edge Secrets and issue GET https://api.meta.ai/v1/models
with Authorization: Bearer <secret>. Do not log headers/key/full payload; do not use
assistant settings or send the key here. Match the configured model ID exactly among
returned IDs; handle pagination if present. Record only model ID, verification time,
source, supported Chat Completions/json_schema format, tokenizer/context limits and
reviewed prices. A model-list result alone does NOT prove JSON schema compatibility,
regional entitlement, pricing, data retention or actual generation success. Do not use
a POST completion as a substitute. This procedure is not automated in deployment.

## Manual Actions preparation, no automatic execution

.github/workflows/ai-staging.yml: workflow_dispatch ONLY, exact hackathon branch,
ai-staging environment, concurrency (no cancellation), read-only contents permission.
Checkout/setup-node pinned SHAs; CLI requires an exact reviewed 2.x.y environment var.
The CI uses PostgreSQL service and Deno; NO local Docker/Deno installation is needed.
Workflow first validates exact checked-in pins against environment vars and user input,
runs tests including real PostgreSQL multi-connection tests and Deno checks, then
disables staging provider and deploys ONLY ai-gateway with --use-api --project-ref.
Does not migrate DB, deploy Pages, provision provider secrets, run model list or infer.
Supabase token should belong to staging-only organization/project with least access;
project pins and separate credentials must be independently reviewed. No configuration
can protect against a malicious administrator modifying the workflow/pins/credentials.

GitHub environment setup REQUIRED (cannot be enforced by YAML alone):
- create ai-staging, required reviewers, prevent self-review, exact allowed branch;
- vars AI_STAGING_PROJECT_REF, AI_PRODUCTION_PROJECT_REF, AI_SUPABASE_CLI_VERSION;
- secret AI_STAGING_SUPABASE_ACCESS_TOKEN, scoped to staging only;
- verify pinned actions/CLI/Deno version and CI support before first run.
workflow_dispatch usually requires workflow presence on default branch; follow GitHub
repository policy for reviewing/merging the inert workflow first. Do not push main just
to discover it: existing Pages workflow deploys on main push and manual dispatch.

## Required operator order for the first real call

1. Review pins and SQL; establish separate staging project and test users. Keep live
   mode disabled and DB control disabled. Approve migration application to STAGING only.
2. Run real SQL behaviour/races and Deno/Edge packaging in approved CI. Then apply only
   B3 migration in approved staging admin session (not db push of all migrations).
3. Review environment protections and dispatch deploy only with explicit permission.
   Current pins prevent running until populated. Workflow does NOT activate anything.
4. Verify real Auth JWT positive/expired/forged/anonymous cases, wrong origins, correct
   project identity, service-role RPC permissions and disabled backend responses.
   Node mocks and CI auth stand-in are NOT a substitute for real Supabase Auth.
5. Separately approve secret provisioning and GET model-list verification. Verify
   schema support/token upper bound/pricing/privacy before attestation variables.
6. In reviewed staging admin SQL only, set ai_private.control.project_ref to staging
   pin and set enabled=true with bounded budgets. Keep production untouched.
7. Only after another explicit bounded paid-smoke approval, set live mode and <=24h
   approval secret. Send one authenticated schema-v1 request with fresh idempotency
   key and verified learning records. Compare model output, tokens, ledger, quotas,
   replay and failure behaviour. UI remains demo until a separate frontend task.
8. Disable AI_BACKEND_MODE/DB enabled afterward. Recover uncertain slots only after
   cancellation confirmation and lease expiry. Do not refund unknown billing.

## Verification report

Local Node tests exercise mocked RPC/protocol wiring and existing local HTTP auth
boundary, not actual PostgreSQL or Supabase. Real SQL tests and concurrency script are
authored for disposable CI DB only. No local psql/Deno available, so real PostgreSQL,
Deno, Edge bundling and real JWT checks are NOT locally verified. First workflow run
must pass these gates; do not describe the migration as production-proven beforehand.

Initial full application test caught the missing new migration in run-local.sql;
the disposable runner was updated rather than weakening that migration-order test.