# Account deletion audit — owner setup

This runbook is operational documentation for the NotaNota project owner. Do
not publish it with the static site.

## Before deployment

1. Generate at least 32 bytes of cryptographically secure random material on a
   trusted local machine. For example, `openssl rand -base64 48` generates a
   suitable value.
2. Store the generated value in a password manager. Do not paste it into source
   files, test fixtures, screenshots, issue comments, build logs, or shell
   history.
3. In the NotaNota Supabase project, open **Edge Functions → Secrets** and add
   a secret named `DELETION_AUDIT_HMAC_KEY`. Paste the generated value directly
   into the secret field.
4. Apply the migration
   `supabase/migrations/202607280001_add_account_deletion_audit.sql`.
5. Deploy the repository copy at
   `supabase/functions/delete-account/index.ts` over the existing
   `delete-account` function.

## Verification

- Confirm the audit table has Row Level Security enabled and no policies.
- Confirm `anon` and `authenticated` have no table privileges.
- Delete only a disposable test account.
- Inspect the audit row with an owner/admin connection. It should contain an
  HMAC value and lifecycle metadata, never an email address or username.
- Confirm the disposable Auth user and its cascade-owned application rows are
  gone while the audit row remains with status `completed`.

Keep this HMAC key available for at least as long as retained audit records may
need to be correlated. Rotation should be planned and documented; never commit
either the old or new value.
