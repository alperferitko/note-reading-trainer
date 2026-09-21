# Weekly and username-filtered leaderboards

The frontend can be deployed independently. The existing all-time leaderboard
continues to use its existing RPC. The additional filters require migration
`supabase/migrations/202609200001_weekly_and_friend_leaderboards.sql` to be
applied through the project's normal Supabase migration workflow by a database
operator. No production database changes were made during implementation.

## Behavior

- Weekly bests are independent of lifetime bests. A valid attempt that does not
  beat the lifetime record can still become the weekly record.
- A week begins Monday at 00:00 in `Europe/Istanbul`.
- Collection begins when the migration is applied; earlier attempts cannot be
  reconstructed from the lifetime-best table and are not fabricated.
- Public usernames are filtered server-side **before** ranking and limiting.
  The filter accepts at most 50 names and is not a friend-request system.
- Until the filtered RPC exists, selecting a new filter shows an explanatory
  message and never mislabels lifetime results as weekly results.

## Verification after applying on staging

1. Anonymous users can read rankings but cannot write either score table.
2. An authenticated user without a profile cannot submit.
3. Ineligible or invalid-timing submissions write neither table.
4. Submit a valid lifetime best, then a slower valid run in a later week: that
   later run appears in its own weekly leaderboard without replacing lifetime.
5. A username outside the overall first 50 still appears when explicitly
   filtered. Empty username lists return no rows.
6. Deleting an account cascades to its weekly records.

The migration is transactional. It preserves the established score validation
in a renamed, non-public helper; only the wrapper is executable by authenticated
clients. Weekly storage has RLS enabled and no direct client access.

## Deployment status

Source-level regression checks cover the boundary and data-flow contracts.
This environment did not contain a local PostgreSQL instance, so execution of
the SQL and the staging checks above remain a database deployment prerequisite.

### Local execution check — 2026-09-21

An additional read-only environment check found a Docker CLI installation, but
`docker info` and the image inventory both failed because the `docker_engine`
named pipe does not exist. No running Docker/PostgreSQL process or registered
service was found by the available queries. Neither `psql` nor the Supabase CLI
was available on PATH. No daemon was started and no image was pulled.

The repository contains Supabase linked-project metadata, but this alone is not
management authorization or a database connection credential. No Supabase or
PostgreSQL management environment-variable names or purpose-built management
connector were available in this session. No secret values were printed and no
production connection was attempted.

Executable SQL behavior verification therefore remains blocked on an operator
providing a running local/staging PostgreSQL environment (or starting Docker and
making an approved PostgreSQL image available). Source-level checks are not a
substitute for this execution test. The migration has not been marked deployed
or runtime-verified.
