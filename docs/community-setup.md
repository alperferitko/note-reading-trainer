# Nota Nota community setup

The public deployment stays disabled until authentication, email delivery, and the KVKK notice are complete.

## Supabase

1. Create a Supabase project in the Frankfurt region.
2. Run `supabase/migrations/202607170001_notanota_community.sql` in the SQL editor.
3. Set the Auth site URL to the future production URL.
4. Add the local and production URLs to the Auth redirect allow list.
5. Copy the project URL and publishable key into local `.env` values matching `.env.example`.

## Email

1. Configure a production SMTP provider such as Resend in Supabase Auth.
2. Verify the sending domain and use a sender such as `login@notanota.online`.
3. Replace the hosted Magic Link template with `supabase/templates/magic-link.html`. It uses the allow-listed redirect requested by the app, sends the token hash to Nota Nota, and requires an explicit confirmation click before `verifyOtp` consumes it.
4. Disable click tracking for authentication emails.

## Before making the service public

- Add the data controller's publishable application address or KEP address to the KVKK notice.
- Confirm the cross-border transfer mechanism with legal counsel.
- Test account creation, the two-step confirmation link, username claiming, score submission, account deletion requests, and rate limits.
- Re-enable a production deployment only after these checks pass.
