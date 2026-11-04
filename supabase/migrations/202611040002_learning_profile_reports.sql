-- Learning profile and weekly reports for the NotaNota AI teacher. Authored for STAGING only: the
-- owner applies it by hand in the Supabase SQL Editor of the staging project. Never apply to
-- production without a separate, explicit decision.
--
-- public.learning_profiles: what the learner told the teacher chat (purpose, instrument, notation
--   level, weekly time, interests) plus the time zone the weekly report uses. The app writes it
--   only after the user confirms a proposed profileUpdates. One row per user.
-- public.weekly_reports: the app-computed weekly numbers (metrics), their SHA-256 (metrics_hash,
--   the same digest the gateway's idempotency key is built from) and the narrated answer. Rows are
--   immutable: a changed week has a different hash and gets a new row; the same week and numbers
--   can be stored only once.
--
-- Both are owner-only under RLS. Clients may read, insert and (profiles only) update their own
-- rows; nobody deletes through the API, and account deletion cascades. Rows are client-written
-- copies, not a billing record: the usage ledger in ai_private stays the only source for spend.
begin;

create table public.learning_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  purpose text check (purpose in ('hobby', 'detailed')),
  instrument text check (instrument in ('piano', 'guitar', 'violin', 'voice', 'flute', 'other', 'none')),
  level text check (level in ('none', 'beginner', 'some', 'reads')),
  weekly_minutes integer check (weekly_minutes between 0 and 1200),
  interests text check (char_length(interests) between 1 and 120 and btrim(interests) <> ''),
  timezone text check (char_length(timezone) <= 64 and timezone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$'),
  updated_at timestamptz not null default now()
);

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  timezone text not null check (char_length(timezone) <= 64 and timezone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$'),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object' and pg_column_size(metrics) <= 16384),
  metrics_hash text not null check (metrics_hash ~ '^[a-f0-9]{64}$'),
  narrative jsonb not null check (jsonb_typeof(narrative) = 'object' and pg_column_size(narrative) <= 16384),
  model_id text not null check (char_length(model_id) between 1 and 200),
  created_at timestamptz not null default now(),
  check (period_end >= period_start and period_end - period_start <= 6),
  unique (user_id, period_start, metrics_hash)
);
create index weekly_reports_user_period on public.weekly_reports(user_id, period_start desc);

-- The server clock owns updated_at; a client value is ignored.
create or replace function public.learning_profiles_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger learning_profiles_touch before insert or update on public.learning_profiles
  for each row execute function public.learning_profiles_touch();
revoke all on function public.learning_profiles_touch() from public, anon, authenticated;

alter table public.learning_profiles enable row level security;
alter table public.weekly_reports enable row level security;

create policy "Owners read their learning profile" on public.learning_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owners create their learning profile" on public.learning_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Owners update their learning profile" on public.learning_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Owners read their weekly reports" on public.weekly_reports for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owners store their weekly reports" on public.weekly_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Supabase grants everything to anon and authenticated by default; only what is needed is given back.
-- user_id stays in the column lists so supabase-js upsert works; RLS keeps it equal to the caller.
revoke all on public.learning_profiles, public.weekly_reports from public, anon, authenticated;
grant select on public.learning_profiles, public.weekly_reports to authenticated;
grant insert (user_id, purpose, instrument, level, weekly_minutes, interests, timezone),
  update (user_id, purpose, instrument, level, weekly_minutes, interests, timezone) on public.learning_profiles to authenticated;
grant insert (user_id, period_start, period_end, timezone, metrics, metrics_hash, narrative, model_id)
  on public.weekly_reports to authenticated;

commit;
