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
\ir ../migrations/202610300001_ai_usage_ledger.sql
\ir ../migrations/202611020001_ai_usage_settlement_reconcile.sql
\ir ../migrations/202611030001_ai_usage_in_flight_concurrency.sql
\ir ../migrations/202611040001_score_library.sql
\ir ../migrations/202611040002_learning_profile_reports.sql
\ir ../migrations/202611040003_learning_week_plan.sql
\ir ../migrations/202611040004_ai_free_trial.sql
\ir weekly_leaderboards.test.sql
