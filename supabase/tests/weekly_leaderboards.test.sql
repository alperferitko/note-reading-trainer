-- Behaviour checks for 202609200001_weekly_and_friend_leaderboards.sql.
-- Everything runs in one transaction and is rolled back at the end, so the
-- checks leave no users, profiles or scores behind.
\set ON_ERROR_STOP on
begin;

-- Fixtures, created as the migration owner.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),  -- player with a username
  ('00000000-0000-0000-0000-000000000002');  -- signed in, no username yet
insert into public.profiles (user_id, username) values ('00000000-0000-0000-0000-000000000001', 'player');

-- 1. Anonymous visitors can read rankings but cannot write either score table.
set local role anon;
select count(*) as anon_can_read from public.get_leaderboard_filtered('standard', 'temel', 'porte', 'all', null, 10);
do $$
begin
  begin
    insert into public.weekly_best_scores (user_id, week_start, session_type, level, question_mode, correct_count, total_response_time_ms)
    values ('00000000-0000-0000-0000-000000000001', current_date, 'standard', 'temel', 'porte', 9, 5000);
    raise exception 'FAIL 1a: anon wrote weekly_best_scores';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.best_scores (user_id, session_type, level, question_mode, correct_count, total_response_time_ms)
    values ('00000000-0000-0000-0000-000000000001', 'standard', 'temel', 'porte', 9, 5000);
    raise exception 'FAIL 1b: anon wrote best_scores';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_best_score('standard', 'temel', 'porte', 9, 0, 5000);
    raise exception 'FAIL 1c: anon could call submit_best_score';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 2. A signed-in user without a profile cannot submit.
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
  begin
    perform public.submit_best_score('standard', 'temel', 'porte', 9, 0, 5000);
    raise exception 'FAIL 2: a user without a profile submitted a score';
  exception when raise_exception then
    if sqlerrm <> 'username_required' then raise; end if;
  end;
  -- The helper that holds the original validation is not callable directly.
  begin
    perform public.submit_all_time_best_score('standard', 'temel', 'porte', 9, 0, 5000);
    raise exception 'FAIL 2b: the internal helper is executable by clients';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. Ineligible or invalid-timing submissions write neither table.
do $$
declare v_result text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  v_result := public.submit_best_score('standard', 'temel', 'porte', 8, 0, 5000);
  if v_result <> 'ineligible' then raise exception 'FAIL 3a: expected ineligible, got %', v_result; end if;
  begin
    perform public.submit_best_score('standard', 'temel', 'porte', 9, 0, 10);
    raise exception 'FAIL 3b: an impossible time was accepted';
  exception when raise_exception then
    if sqlerrm <> 'invalid_timing' then raise; end if;
  end;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.best_scores where user_id = '00000000-0000-0000-0000-000000000001')
     or exists (select 1 from public.weekly_best_scores where user_id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL 3c: a rejected submission was stored';
  end if;
end $$;

-- 4. Weekly bests are independent of lifetime bests.
set local role authenticated;
do $$
declare v_result text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  v_result := public.submit_best_score('standard', 'temel', 'porte', 9, 0, 5000);
  if v_result <> 'saved' then raise exception 'FAIL 4a: expected saved, got %', v_result; end if;
end $$;
reset role;
-- Move that record to last week, as if it had been set then.
update public.weekly_best_scores set week_start = week_start - 7 where user_id = '00000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
declare v_result text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  v_result := public.submit_best_score('standard', 'temel', 'porte', 9, 0, 7000);
  if v_result <> 'not_better' then raise exception 'FAIL 4b: a slower run changed the lifetime best (%)', v_result; end if;
  -- An even slower run in the same week does not replace this week's best.
  perform public.submit_best_score('standard', 'temel', 'porte', 9, 0, 8000);
end $$;
reset role;
do $$
declare v_this_week date := date_trunc('week', now() at time zone 'Europe/Istanbul')::date;
begin
  if (select total_response_time_ms from public.best_scores where user_id = '00000000-0000-0000-0000-000000000001') <> 5000 then
    raise exception 'FAIL 4c: lifetime best changed';
  end if;
  if (select total_response_time_ms from public.weekly_best_scores where user_id = '00000000-0000-0000-0000-000000000001' and week_start = v_this_week) is distinct from 7000 then
    raise exception 'FAIL 4d: this week''s best should be the slower 7000 ms run';
  end if;
  if not exists (select 1 from public.weekly_best_scores where user_id = '00000000-0000-0000-0000-000000000001' and week_start = v_this_week - 7 and total_response_time_ms = 5000) then
    raise exception 'FAIL 4e: last week''s record was lost';
  end if;
end $$;

-- 5. Filtering by username happens before ranking and the result limit.
insert into auth.users (id)
  select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 55) i;
insert into public.profiles (user_id, username)
  select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'u' || lpad(i::text, 2, '0') from generate_series(1, 55) i;
insert into public.best_scores (user_id, session_type, level, question_mode, correct_count, total_response_time_ms)
  select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'standard', 'temel', 'porte', 9, 1000 + i from generate_series(1, 55) i;
set local role anon;
do $$
begin
  if exists (select 1 from public.get_leaderboard_filtered('standard', 'temel', 'porte', 'all', null, 50) where username = 'player') then
    raise exception 'FAIL 5a: fixture should place player outside the first 50';
  end if;
  if (select count(*) from public.get_leaderboard_filtered('standard', 'temel', 'porte', 'all', array['PLAYER'], 50)) <> 1 then
    raise exception 'FAIL 5b: an explicitly filtered username outside the first 50 was not returned';
  end if;
  if (select rank from public.get_leaderboard_filtered('standard', 'temel', 'porte', 'all', array['player'], 50)) <> 1 then
    raise exception 'FAIL 5c: ranks must be computed after filtering';
  end if;
  if (select count(*) from public.get_leaderboard_filtered('standard', 'temel', 'porte', 'all', array[]::text[], 50)) <> 0 then
    raise exception 'FAIL 5d: an empty username list must return no rows';
  end if;
  if (select total_response_time_ms from public.get_leaderboard_filtered('standard', 'temel', 'porte', 'week', array['player'], 50)) <> 7000 then
    raise exception 'FAIL 5e: the weekly view must show this week''s record';
  end if;
end $$;
reset role;

-- 6. Deleting an account removes its weekly records too.
delete from auth.users where id = '00000000-0000-0000-0000-000000000001';
do $$
begin
  if exists (select 1 from public.weekly_best_scores where user_id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL 6: weekly records survived account deletion';
  end if;
end $$;

\echo 'weekly leaderboard checks passed'
rollback;
