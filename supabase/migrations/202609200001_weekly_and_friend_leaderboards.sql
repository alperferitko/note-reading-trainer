-- Weekly scores are independent of lifetime records. A valid slower run can
-- still become this week's best. Weeks begin Monday 00:00 in Europe/Istanbul.
begin;
create table public.weekly_best_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  session_type text not null check (session_type in ('standard', 'endless')),
  level text not null check (level in ('temel', 'yakin', 'tam', 'genis')),
  question_mode text not null check (question_mode in ('porte', 'konum')),
  correct_count integer not null check (correct_count > 0),
  total_response_time_ms integer not null check (total_response_time_ms > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start, session_type, level, question_mode)
);
alter table public.weekly_best_scores enable row level security;
revoke all on public.weekly_best_scores from anon, authenticated;

alter function public.submit_best_score(text,text,text,integer,integer,integer)
  rename to submit_all_time_best_score;
revoke all on function public.submit_all_time_best_score(text,text,text,integer,integer,integer) from public, anon, authenticated;

create function public.submit_best_score(
  p_session_type text, p_level text, p_question_mode text,
  p_correct_count integer, p_wrong_count integer, p_total_response_time_ms integer
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_result text;
  v_week date := date_trunc('week', now() at time zone 'Europe/Istanbul')::date;
begin
  if p_session_type is null or p_level is null or p_question_mode is null
     or p_correct_count is null or p_wrong_count is null or p_total_response_time_ms is null then
    raise exception 'invalid_submission';
  end if;
  -- Reuse the established authentication, category, eligibility and timing
  -- validation. Both writes are in the same transaction.
  v_result := public.submit_all_time_best_score(p_session_type,p_level,p_question_mode,
    p_correct_count,p_wrong_count,p_total_response_time_ms);
  if v_result = 'ineligible' then return v_result; end if;
  insert into public.weekly_best_scores as s
    (user_id,week_start,session_type,level,question_mode,correct_count,total_response_time_ms)
  values (auth.uid(),v_week,p_session_type,p_level,p_question_mode,p_correct_count,p_total_response_time_ms)
  on conflict (user_id,week_start,session_type,level,question_mode) do update set
    correct_count=excluded.correct_count,
    total_response_time_ms=excluded.total_response_time_ms,
    updated_at=now()
  where (excluded.session_type='standard' and excluded.total_response_time_ms<s.total_response_time_ms)
    or (excluded.session_type='endless' and
      (excluded.correct_count>s.correct_count or
       (excluded.correct_count=s.correct_count and
        excluded.total_response_time_ms::bigint*s.correct_count < s.total_response_time_ms::bigint*excluded.correct_count)));
  return v_result;
end;
$$;
revoke all on function public.submit_best_score(text,text,text,integer,integer,integer) from public;
grant execute on function public.submit_best_score(text,text,text,integer,integer,integer) to authenticated;

create function public.get_leaderboard_filtered(
  p_session_type text, p_level text, p_question_mode text,
  p_period text default 'all', p_usernames text[] default null, p_limit integer default 50
) returns table(rank bigint,username text,correct_count integer,total_response_time_ms integer,
  average_response_time_ms integer,achieved_at timestamptz)
language sql security definer set search_path = public stable as $$
  with scores as (
    select s.user_id,s.session_type,s.level,s.question_mode,s.correct_count,s.total_response_time_ms,s.updated_at
    from public.best_scores s where p_period='all'
    union all
    select s.user_id,s.session_type,s.level,s.question_mode,s.correct_count,s.total_response_time_ms,s.updated_at
    from public.weekly_best_scores s where p_period='week'
      and s.week_start=date_trunc('week',now() at time zone 'Europe/Istanbul')::date
  ), ranked as (
    select row_number() over(order by
      case when s.session_type='standard' then s.total_response_time_ms end asc,
      case when s.session_type='endless' then s.correct_count end desc,
      case when s.session_type='endless' then s.total_response_time_ms::numeric/s.correct_count end asc,
      s.updated_at asc,p.username asc) as rank,
      p.username,s.correct_count,s.total_response_time_ms,
      round(s.total_response_time_ms::numeric/s.correct_count)::integer as average_response_time_ms,
      s.updated_at as achieved_at
    from scores s join public.profiles p on p.user_id=s.user_id
    where s.session_type=p_session_type and s.level=p_level and s.question_mode=p_question_mode
      and (p_usernames is null or lower(p.username)=any(
        array(select lower(n) from unnest(p_usernames[1:50]) n)))
  ) select * from ranked order by rank limit least(greatest(coalesce(p_limit,50),1),100);
$$;
revoke all on function public.get_leaderboard_filtered(text,text,text,text,text[],integer) from public;
grant execute on function public.get_leaderboard_filtered(text,text,text,text,text[],integer) to anon,authenticated;
commit;
