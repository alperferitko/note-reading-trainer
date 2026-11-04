# AI API contracts — version 1 (local mock HTTP, not deployed)

Seven interfaces are described in `supabase/functions/_shared/ai/contracts.mjs`:
AIProviderAdapter, AIModelRegistry, AIGateway, LearningEvidenceSummary,
AIPracticeFeedback, AIWeeklyReport and AIUsagePolicy. Runtime validation lives in
validation.mjs; JSDoc declarations alone are not runtime enforcement.

## HTTP boundary (B1)

POST /functions/v1/ai-gateway now has a local-only mock entry point. It verifies the user JWT before creating
`{ userId, authenticated: true }`. The offline execute function assumes that trusted
context; it does not authenticate a JWT. Require JSON content type, an idempotency
key and a server-generated request ID. Body bytes are bounded before parsing; invalid
methods/origins are rejected. Publishable project keys alone are not user identity.
Default body limit is 262144 bytes, including streaming requests with no Content-Length.
Overall HTTP deadline is 15 seconds. JSON must be UTF-8 and uncompressed.
Browser origins must exactly match a configured local origin. Origin-less server
requests still require verified bearer authentication. No cookie authentication.
Preflight is unauthenticated, but only allows POST and the explicit header list.
Every response has no-store, nosniff, Vary: Origin and a server-generated X-Request-Id.

## Request

```json
{
  "schemaVersion": "1",
  "task": "practice-feedback",
  "locale": "tr",
  "scope": { "module": "reading", "sessionId": "session-123" },
  "evidence": { "records": [] }
}
```

Enabled tasks: practice-feedback, adaptive-exercises. Weekly-report and
quality-evaluation are reserved and rejected with task_not_enabled. Valid module
values match the existing evidence modules. sessionId is optional; if present every
record must match. Every record must match the scope module. At most 800 records,
no duplicates, no future timestamps, no unknown fields. The existing record validator
validates written pitches, response bounds, flags and rhythmic values. Unknown
top-level routing/prompt/user fields are rejected. Raw answer text is stripped.
Default gateway serialized-character limit: 262144; HTTP separately enforces bytes.

An empty list returns deterministic guidance without model invocation or reservation.

## Success envelope

```json
{
  "schemaVersion": "1",
  "requestId": "request-123",
  "mode": "deterministic",
  "evidenceSummary": {
    "schemaVersion": "1",
    "analysisVersion": "question-evidence-v1",
    "source": "client-reported",
    "generatedAt": "2026-10-30T12:00:00.000Z",
    "period": { "from": null, "to": null },
    "sampleSize": 0,
    "eligible": false,
    "contexts": [],
    "measurements": [],
    "limitations": ["insufficient_recent_unaided_evidence"]
  },
  "result": {
    "summary": "Continue with the existing free exercises.",
    "observations": [],
    "exercises": [],
    "limitations": []
  },
  "provenance": null,
  "usage": null,
  "limitations": ["insufficient_evidence"]
}
```

Example text/limitation lists are abbreviated; actual deterministic copy is localized.
Mock mode always adds mock_not_live_inference and includes provider/model provenance.
Usage is `{ inputTokens, outputTokens, estimatedUsd }`; unknown values are null, not
zero. Costs are local estimates, not billing statements. There is no live success
mode in this release.

## Feedback payload

Required exact fields: summary (1–600 chars), observations (0–5), exercises (0–3),
limitations (0–5 strings, each 1–240 chars). Each observation has text (1–400 chars)
and 1–5 evidenceRefs, all pointing to non-null summary measurements.

The sole exercise template is `{ id: "context-review", contextRef, repetitions }`;
repetitions must be 1–6 and the referenced context needs three recent unaided records.
This expresses a review recommendation only. There is no arbitrary generated score
or playable exercise execution. Numbers in free text remain untrusted; schema and
reference checks do not establish semantic accuracy.

## Errors

`{ schemaVersion, requestId, error: { code, status, retryable } }`.
The endpoint maps status to HTTP status; the gateway itself returns data.
400 invalid_request; 401 authentication_required; 403 task_not_enabled;
409 idempotency_conflict; 413 request_too_large; 429 quota_exceeded;
503 ai_unavailable/provider_unavailable/usage_store_unavailable/live_calls_disabled/
invalid_model_response/usage_limit_exceeded; 504 provider_timeout.
No raw provider error or stack trace is returned. There is no automatic retry.
HTTP-specific errors: 400 invalid_request (including preflight/header/JSON errors),
403 origin_not_allowed, 405 method_not_allowed, 408 request_timeout,
415 unsupported_media_type, 503 backend_not_configured. Unknown exceptions map to
503 ai_unavailable. Retryable is advisory; clients must not retry indefinitely.

## Weekly report (design only)

Explicit current and previous 7-day periods, comparable boolean, deterministic
changePercentagePoints or null, and validated narrative. Comparisons must preserve
the same context and adequate sample sizes. The existing comparison function defaults
to 14 days; a future implementation must explicitly pass days: 7. No report generator
or scheduler is implemented in slice A.