-- The weekly practice plan the teacher chat proposes, saved with the learner's profile once they accept
-- it. Authored for STAGING only: applied by hand in the staging SQL Editor, never production without a
-- separate decision. Adds one nullable column; existing rows and data are not changed.
--
-- week_plan: seven days mon..sun in order, each { day, minutes (0 = rest day), focus }.
begin;

alter table public.learning_profiles add column week_plan jsonb
  check (week_plan is null or (jsonb_typeof(week_plan) = 'array' and jsonb_array_length(week_plan) = 7 and pg_column_size(week_plan) <= 4096));

grant insert (week_plan), update (week_plan) on public.learning_profiles to authenticated;

commit;
