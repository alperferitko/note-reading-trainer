# Dilim B1 — local mock Supabase HTTP entry

## Implemented, not deployed

`supabase/functions/ai-gateway/index.ts` connects the existing gateway to a
Web-standard Request/Response handler. It uses the existing Supabase getUser pattern,
with the dependency pinned to the package.json version (2.110.7), and does not use
service-role credentials. No provider transport, secret, UI, migration or deploy added.

Auth is never bypassed by local-mock mode: a bearer token is sent to the configured
LOCAL Supabase Auth getUser(jwt). User identity is derived only from its verified
user.id. Anonymous auth users are rejected; body identity/routing fields are rejected.
Supabase client construction and verification are request-scoped; the abort signal
is forwarded through the client's fetch implementation. No token or user data logs.

## Local-only activation (requires local Supabase/Deno tooling)

No environment values have been written by B1. In a separately configured LOCAL
runtime the entry requires:

- AI_BACKEND_MODE=local-mock
- SUPABASE_URL pointing to a local runtime (localhost, 127.0.0.1, ::1, kong or
  host.docker.internal). kong is for the local container network only.
- SUPABASE_ANON_KEY from that local project, not a provider key or service-role key.
- AI_ALLOWED_ORIGINS as comma-separated exact localhost/loopback origins, e.g.
  http://localhost:5173. Production origins and wildcard origins are rejected.

These are runtime settings, not browser build variables. Missing or remote config
fails closed with backend_not_configured (or origin_not_allowed for denied origins).
The public endpoint URL is /functions/v1/ai-gateway; Supabase's routing/gateway is
external to this handler. No project config/JWT gateway switch was altered. Do not
disable JWT verification for a remote deployment to make tests pass.

Run the entry using an already prepared local Supabase functions runtime. Obtain a
user access JWT from that local project. Do not paste tokens into source/docs/logs.
HTTP request: POST with Authorization: Bearer <local-user-jwt>, Content-Type:
application/json and Idempotency-Key containing 1–120 letters/digits/underscore/hyphen.
The request schema remains version 1; see ai-api-contracts.md. Three comparable
recent unaided records produce mock mode; sparse evidence produces deterministic
mode. The response explicitly labels mock inference; no model tokens are consumed.

Do not deploy this local-only artifact as a usable production gateway. Hostname
configuration is a guardrail, not proof that an arbitrary machine is non-production.
Remote/staging use requires separately approved durable storage and deployment review.

## Runtime controls

Exact CORS allowlist; POST/OPTIONS only; authorization/apikey/content-type/
idempotency-key/x-client-info headers only in preflight. Non-browser requests may omit
Origin but not auth. Every response is no-store and nosniff. Body consumption counts
bytes as chunks arrive and stops above 256 KiB, irrespective of Content-Length.
Malformed UTF-8/JSON, unknown schema fields/versions and unsupported encodings fail.
An overall 15s deadline bounds auth/body/handler response; a 10s gateway provider
deadline aborts mock work. Deadline doesn't guarantee termination of arbitrary injected
code. Durable storage operations must support cancellation/reconciliation before live.

The per-isolate mock store enforces limits atomically within that isolate, caps entries
at 1000 and expires completed entries after 48h. It loses state on restart and cannot
coordinate replicas. It is NOT a production limiter. Unknown usage keeps reservation.
The durable design is documented separately; no SQL file was added.

## Validation commands

- npm run test:ai (existing A tests)
- npm run test:ai:http (Web handler tests, mocked Supabase verification, loopback HTTP)
- In supabase/functions/ai-gateway: deno task check; deno task test
- npm run lint; npm run typecheck; npm run build; npm run build:pages; npm run test:pages

Node tests block external fetch; the loopback test uses an explicit captured fetch to
127.0.0.1 only and closes its listener. No lingering demo server is started. Invalid
and expired JWT tests verify rejection at the mocked getUser boundary; they do NOT
claim a real Supabase project's key rotation/signature/expiry behaviour was tested.

Deno config checks the TS entry with strict mode and checkJs=false to match existing
plain JS modules. It does not claim full JS static type coverage. The Edge test needs
no network permission; checking index.ts may require the pinned npm dependency in
Deno's cache. Supabase CLI/Docker local serve and real Auth integration remain distinct
from a Node Web API roundtrip. Missing tools must be reported, never assumed passing.

## Next Meta integration (separate approval)

1. Confirm isolated Supabase environment and validate actual Edge packaging of imports
   from lib/practice-evidence.mjs. Run Deno check/test and local Supabase JWT tests.
2. Approve ledger schema/RPC implementation, retention and transactional contention tests.
3. Verify exact Meta account model ID, capabilities, prices and data processing settings.
4. Add reviewed server-only Meta adapter, conservative token budget, cost preflight,
   cancellation and reconciliation. Baseten/Claude remain disabled.
5. Approve secret provisioning and a bounded paid smoke test separately. Never use
   VITE secrets, frontend imports or Pages build configuration for provider credentials.