# B2 — first teacher experience, paid calls CLOSED

## Scope

Reading-session results now include an optional NotaNota AI Teacher demo. It is
explicitly labelled as device-local deterministic demo, not a Meta response. No auth
system changes, no backend authentication bypass and no data transmission. Existing
free practice/results remain available. No provider module is imported by the browser.

The first UI integration is note reading only. Rhythm analysis is reusable/tested
via analyzeTeacherRhythm, but there is no rhythm UI integration or microphone analysis.
It reuses evaluatePattern/patternTiming, not a language model. Written pitch names
come from music-pitch; feedback copy uses session-insights. Do not equate these with
intonation or physical playing measurements.

The teacher snapshots current-session answer counts and restricts historical context
analysis to items seen in that session. Three unaided session answers permit generic
guidance, NOT a repeated weakness diagnosis. Only the established analyzeItems rules
can label a contextual repeated error. Assisted/stale data is excluded by those rules.
There are three actionable links: same-settings practice, a suitable existing lesson,
and the skill map. Sparse-data, loading, cancellation and error states are explicit.

## Meta protocol verification

Official documentation checked during B2:
- https://dev.meta.ai/docs/api-reference
- https://dev.meta.ai/docs/protocols/chat-completions
- https://dev.meta.ai/docs/api-reference/chat-completions/schemas
- https://dev.meta.ai/docs/cookbook/structured-output

Documented Chat Completions endpoint: https://api.meta.ai/v1/chat/completions.
The adapter uses messages, max_completion_tokens, stream:false, and configurable
json_schema/json_object response_format and explicitly sets store:false. It parses choices[0].message.content and
usage.prompt_tokens/completion_tokens. Strict local validation remains mandatory.
No account model list was queried, NO real model ID is defaulted or invented, and
no account access/credits were verified. A model must support the chosen response
format and be verified against the exact account before activation. An alias mismatch
in response.model currently fails closed and needs deliberate review if encountered.

Model ID, output mode, input/output limits, timeout and endpoint are constructor
configuration. Endpoint overrides are restricted to the documented Meta origin/path
to prevent server key exfiltration/SSRF; a new endpoint requires reviewed allowlisting.
Credentials are passed by the future server composition root, never read from assistant
settings or on import. Only aggregates are projected into the prompt.

## Live locks

The real-protocol adapter is mode:live; the gateway still rejects all live models.
No Edge entry imports it. No global fetch default is supplied: generate without an
explicit transport returns live_calls_disabled. Tests inject a fake transport and
fixture credentials only. No env flag enables paid calls. API-key storage/provisioning
was not changed. Baseten/Claude remain unconnected.

Adapter caps request characters, output tokens and response bytes, uses abortable
timeout and redirect:error, rejects truncation/refusal/tools/model mismatch, sanitizes
errors and preserves unknown usage as null. Character caps are not a token/cost
preflight. Durable reservation/token budgeting and usage reconciliation MUST be added
before wiring a real transport; this adapter alone is not cost-safe production code.

## Manual staging plan (NOT an executable workflow)

No workflow/deploy/provisioning is added. Prefer a separately reviewed GitHub Actions
workflow with ONLY workflow_dispatch, pinned action versions, minimal contents:read
permissions, an ai-staging environment with required reviewers, and concurrency for
that environment. Explicitly reject main and unexpected branch/commit. Validate an
allowlisted STAGING project ref and reject the production ref before any command.
Require an explicit input confirming the target. Do not use repo's linked local
Supabase project metadata; pass --project-ref for every remote operation.

Order after approval:
1. Verify a separate Supabase Cloud staging project, independent users and credentials.
2. Complete Deno/Edge packaging and actual Auth JWT tests (expired/forged/anonymous,
   origin limits, revocation behaviour), using CI tooling rather than requiring local
   Docker/Deno installation. B1 local config currently rejects remote projects; do not
   weaken it to stage. Add a separately reviewed staging composition root instead.
3. Approve and implement durable ledger/RPCs from ai-usage-ledger-design.md; test atomic
   per-user/global quotas, races, crash recovery, unknown billing and retention. No
   migration is included here. Staging mock is not a production quota solution.
4. Verify Meta model/catalogue/capabilities/prices and privacy terms. Approve provider
   secret provisioning separately in staging only; no keys in Actions output/build.
5. Add server model registry, prompt token budgeting, conservative maximum-cost reserve,
   durable adapter wiring and total deadline/cancellation/reconciliation.
6. Run mocked CI first. Deploy ONLY function ai-gateway to staging after environment
   approval. Do not deploy Pages, change DNS/auth production config or run db push.
7. Keep paid inference disabled until a separate bounded smoke-test approval. A future
   frontend staging endpoint must be explicit and use verified Supabase auth; do not
   send demo browser data remotely or implicitly use production Supabase.

Rollback is disabling the staging function/config or reverting a reviewed staging
artifact; never reset user work or deploy production automatically.