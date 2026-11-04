# Durable usage ledger — design only, pending separate approval

Historical B1 design. B3 now authors (but does not apply) a minimal migration;
see ai-staging-b3.md for actual schema, controls, tests and activation gates.

No migration, SQL function or database operation is included in B1. Names below are
proposals. Production inference must stay disabled until a durable implementation is
approved and tested. Use integer micro-USD and integer tokens, not floating money.

## Proposed private schema

- ai_usage_requests: UUID id, user_id, idempotency_key, SHA-256 fingerprint,
  status (reserved/completed/uncertain), UTC created_at, lease_expires_at,
  reserved_micro_usd, charged_micro_usd, provider/model identifiers, nullable input/
  output tokens, safe error code, replay response with expiry. Unique(user_id,
  idempotency_key); index(user_id, created_at), index(status, lease_expires_at).
- ai_usage_daily: UTC date + scope (global/user) + scope_id composite key;
  request_count, reserved/charged micro-USD counters. Constraints keep counts/costs
  nonnegative. User minute count reads a locked user's indexed request history or a
  separately maintained atomic minute bucket.

No raw JWT, email, prompt, answer, provider body or secret is stored. Response replay
data includes learning evidence, so it is sensitive: short retention, deletion on
account deletion and strict access controls are mandatory. Proposed replay TTL: 24h;
final retention for aggregate billing records requires an explicit privacy decision.

## Atomic reserve operation

Trusted backend passes the verified user ID; browsers cannot choose it. In one
transaction:

1. Lock global daily row, user daily row and user coordination key in a fixed order
   for all reserve/settle/recovery operations, including midnight-boundary cases.
2. Check user+idempotency key. Same fingerprint and completed/nonexpired response:
   replay. Different fingerprint or in-flight reservation: conflict. Expired replay
   returns an explicit expiry error; never silently charge a duplicate as new work.
3. Check minute/day counts, live reservations, user/global daily budgets including
   all reserved maxima. Fail closed on unknown price or missing policy.
4. Insert unique request row and increment request/reservation counters atomically.
   Return opaque reservation ID. Unique constraints handle duplicate races.

Reserve the conservative upper bound of input+max-output cost BEFORE inference.
Tie reservation to verified policy/model version and request fingerprint. SQL needs
no model keys. Lock ordering and global row contention require load tests; do not
assume the in-memory test proves multi-process behaviour.

## Atomic settle/recovery

Settle once, under the same locks and ownership binding. Record token counts/cost
when known, move reserved maxima to actual charges and save safe replay response.
Repeated settle is idempotent. Actual cost above reserved must be accounted, alert
and stop subsequent work; never hide or cap an incurred charge.

Timeout/network interruption/missing usage keeps full reserved cost and status
uncertain. Lease expiry can release concurrency ONLY after worker cancellation or a
recovery decision; it must not automatically refund uncertain cost. A separately
authorized recovery process reconciles provider accounting and crashed reservations.
Requests spanning midnight settle against their original reservation bucket.

## Access/security

Private tables, RLS enabled, no direct anon/authenticated inserts or updates. Only
the narrowly privileged trusted backend may reserve/settle. If SECURITY DEFINER RPCs
are chosen, pin search_path, fully qualify objects, revoke PUBLIC/anon/authenticated
execution and narrowly grant the backend role. Do not expose a service-role key to
the client. Endpoint has no service-role key in B1. Decide trusted identity binding
and role model before writing SQL, not after deployment.

Required tests: simultaneous user/global budget exhaustion, two-worker duplicate,
minute/day rollover, restart/crash, timeout/unknown billing, double settle, failed
commit, retention expiry, replay privacy, ownership isolation and account deletion.