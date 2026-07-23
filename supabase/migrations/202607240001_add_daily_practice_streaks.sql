create table if not exists public.practice_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  practiced_on date not null,
  timezone_name text not null,
  first_completed_at timestamptz not null default statement_timestamp(),
  primary key (user_id, practiced_on)
);

alter table public.practice_days enable row level security;

drop policy if exists "Users can read their practice days" on public.practice_days;
create policy "Users can read their practice days"
  on public.practice_days for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_my_practice_streak(
  p_timezone text default 'UTC'
)
returns table (
  current_streak integer,
  longest_streak integer,
  today_completed boolean,
  last_practice_date date,
  active_dates date[]
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_week_start date;
  v_cursor date;
  v_current integer := 0;
  v_longest integer := 0;
  v_today_completed boolean := false;
  v_last_practice_date date;
  v_active_dates date[] := '{}'::date[];
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select name
    into v_timezone
  from pg_catalog.pg_timezone_names
  where name = coalesce(nullif(trim(p_timezone), ''), 'UTC')
  limit 1;

  if v_timezone is null then
    raise exception 'invalid_timezone';
  end if;

  v_today := (statement_timestamp() at time zone v_timezone)::date;
  v_week_start := date_trunc('week', v_today::timestamp)::date;

  select exists (
    select 1
    from public.practice_days
    where user_id = v_user_id
      and practiced_on = v_today
  ) into v_today_completed;

  select max(practiced_on)
    into v_last_practice_date
  from public.practice_days
  where user_id = v_user_id;

  v_cursor := case when v_today_completed then v_today else v_today - 1 end;

  while exists (
    select 1
    from public.practice_days
    where user_id = v_user_id
      and practiced_on = v_cursor
  ) loop
    v_current := v_current + 1;
    v_cursor := v_cursor - 1;
  end loop;

  select coalesce(max(run_length), 0)::integer
    into v_longest
  from (
    select count(*) as run_length
    from (
      select
        practiced_on,
        practiced_on - (row_number() over (order by practiced_on))::integer as run_group
      from public.practice_days
      where user_id = v_user_id
    ) grouped_days
    group by run_group
  ) streak_runs;

  select coalesce(array_agg(practiced_on order by practiced_on), '{}'::date[])
    into v_active_dates
  from public.practice_days
  where user_id = v_user_id
    and practiced_on between v_week_start and v_week_start + 6;

  return query
    select v_current, v_longest, v_today_completed, v_last_practice_date, v_active_dates;
end;
$$;

create or replace function public.record_practice_day(
  p_timezone text default 'UTC'
)
returns table (
  current_streak integer,
  longest_streak integer,
  today_completed boolean,
  last_practice_date date,
  active_dates date[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select name
    into v_timezone
  from pg_catalog.pg_timezone_names
  where name = coalesce(nullif(trim(p_timezone), ''), 'UTC')
  limit 1;

  if v_timezone is null then
    raise exception 'invalid_timezone';
  end if;

  v_today := (statement_timestamp() at time zone v_timezone)::date;

  insert into public.practice_days (
    user_id,
    practiced_on,
    timezone_name,
    first_completed_at
  ) values (
    v_user_id,
    v_today,
    v_timezone,
    statement_timestamp()
  )
  on conflict (user_id, practiced_on)
  do nothing;

  return query
    select *
    from public.get_my_practice_streak(v_timezone);
end;
$$;

revoke all on function public.get_my_practice_streak(text) from public;
revoke all on function public.record_practice_day(text) from public;

grant execute on function public.get_my_practice_streak(text) to authenticated;
grant execute on function public.record_practice_day(text) to authenticated;
