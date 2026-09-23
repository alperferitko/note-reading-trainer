-- Builds the schema from every migration in order on a disposable database,
-- then runs the behaviour checks. Used by scripts/verify-leaderboard-sql.mjs.
\set ON_ERROR_STOP on
\ir auth-stub.sql
\ir ../migrations/202607170001_notanota_community.sql
\ir ../migrations/202607210001_add_extended_ledger_level.sql
\ir ../migrations/202607240001_add_daily_practice_streaks.sql
\ir ../migrations/202607280001_add_account_deletion_audit.sql
\ir ../migrations/202608130001_fix_endless_score_eligibility.sql
\ir ../migrations/202608150001_update_note_range_score_counts.sql
\ir ../migrations/202609200001_weekly_and_friend_leaderboards.sql
\ir weekly_leaderboards.test.sql
