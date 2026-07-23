# Nota Nota community setup

The static frontend can be deployed independently, but authentication, email delivery, and private community data require the configuration below.

## Supabase

1. Create a Supabase project in the Frankfurt region.
2. Run the SQL files in `supabase/migrations/` in filename order:
   - `202607170001_notanota_community.sql`
   - `202607210001_add_extended_ledger_level.sql`
   - `202607240001_add_daily_practice_streaks.sql`
3. Set the Auth site URL to the future production URL.
4. Add the local and production URLs to the Auth redirect allow list.
5. Copy the project URL and publishable key into local `.env` values matching `.env.example`.

## Email

1. Configure a production SMTP provider such as Resend in Supabase Auth.
2. Verify the sending domain and use a sender such as `login@notanota.online`.
3. Replace the hosted Magic Link template with `supabase/templates/magic-link.html`. It uses the allow-listed redirect requested by the app, sends the token hash to Nota Nota, and requires an explicit confirmation click before `verifyOtp` consumes it.
4. Disable click tracking for authentication emails.

## Before considering production setup complete

- Add the data controller's publishable application address or KEP address to the KVKK notice.
- Confirm the cross-border transfer mechanism with legal counsel.
- Test account creation, the two-step confirmation link, username claiming, score submission, daily streak recording, account deletion requests, and rate limits.
- Keep the public service under review until these checks pass.
