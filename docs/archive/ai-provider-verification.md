# Provider verification and credit safety

> B1: a local-only authenticated mock HTTP entry has been added. See
> ai-backend-b1.md. This does not verify any real provider account/model or enable
> inference. Durable quotas and actual Edge/Auth runtime validation remain release gates.

No provider account, model access, credit balance, price or capability was verified
by this offline implementation. Do not interpret fixture IDs as real model names.
The user-reported budgets are Meta $150 and Baseten $100; these are not verified
billing data. Claude is optional and must not become a dependency of free learning.

## Verification record required before live registration

For each candidate capture provider, exact model ID, account access, supported tasks,
text/structured-output capability, input/output limits, timeout behaviour, usage field
mapping, price units/currency/source/date and verification timestamp. Include data
retention/training settings and relevant regional processing constraints. Recheck
before a live demo and when pricing or model identifiers change.

Use current official Meta Model API documentation and the authorized account's model
catalogue. Do not substitute legacy Llama API assumptions or guessed IDs. Meta must
serve primary educational feedback and adaptive-exercise planning.

Use current official Baseten Model APIs documentation and authorized catalogue or
deployment configuration. Distinguish shared model API pricing from dedicated
deployment billing. Verify credit eligibility and idle infrastructure charges before
creating any deployment. Baseten is not assumed cheaper: compare measured cost and
quality for the same bounded task. No infrastructure provisioning is authorized.

Use current official Anthropic documentation and authorized model listing. Verify
structured output availability and usage semantics for the exact model. A future
quality evaluation route requires explicit authorization and its own budget; do not
call Claude in parallel with every educational request.

Authenticated catalogue queries require approval, even when they do not perform
inference. Real inference smoke tests need a separately approved model, request count,
input/output cap and maximum total spend. Do not run provider calls from CI.

## Offline checks first

Run npm run test:ai with no secrets. Mock replies cover success, schema failure,
timeout, unknown usage, safe errors, quota contention, duplicate requests and privacy.
The test gateway can only select mock-mode adapters; network fetch is prohibited in
gateway tests. Test prices are explicit fixtures, never provider quotes.

## Live release blockers (not implemented)

- Server-only keys: META_MODEL_API_KEY, BASETEN_API_KEY, ANTHROPIC_API_KEY; no VITE
  prefix, frontend bundle, request body, logs or repository storage.
- Verified authenticated endpoint, byte limit, origin allowlist and total deadline.
- Durable transactional user/global quotas, reservations, reconciliation and retention.
- Provider input token budgeting, conservative preflight cost and bounded output.
- Independently checked model schemas, fallback rules and provider usage accounting.
- Isolated deployment target and approved configuration changes.

The current registry intentionally starts empty. A live entry must include a dated
verification source, but even such an entry is rejected by slice A's gateway. Opening
live transport requires reviewed code changes, not merely an environment flag.