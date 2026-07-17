create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (
    char_length(username) between 3 and 7
    and username ~ '^[A-Za-z0-9_]+$'
  )
);

create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

create table if not exists public.best_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_type text not null check (session_type in ('standard', 'endless')),
  level text not null check (level in ('temel', 'yakin', 'tam')),
  question_mode text not null check (question_mode in ('porte', 'konum')),
  correct_count integer not null check (correct_count > 0),
  total_response_time_ms integer not null check (total_response_time_ms > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_type, level, question_mode)
);

alter table public.profiles enable row level security;
alter table public.best_scores enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their scores" on public.best_scores;
create policy "Users can read their scores"
  on public.best_scores for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.claim_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := trim(p_username);
  v_existing text;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select username into v_existing
  from public.profiles
  where user_id = v_user_id;

  if v_existing is not null then
    return v_existing;
  end if;

  if char_length(v_username) not between 3 and 7
     or v_username !~ '^[A-Za-z0-9_]+$' then
    raise exception 'invalid_username';
  end if;

  begin
    insert into public.profiles (user_id, username)
    values (v_user_id, v_username);
  exception when unique_violation then
    raise exception 'username_taken';
  end;

  return v_username;
end;
$$;

create or replace function public.submit_best_score(
  p_session_type text,
  p_level text,
  p_question_mode text,
  p_correct_count integer,
  p_wrong_count integer,
  p_total_response_time_ms integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected_count integer;
  v_changed integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception 'username_required';
  end if;

  if p_session_type not in ('standard', 'endless')
     or p_level not in ('temel', 'yakin', 'tam')
     or p_question_mode not in ('porte', 'konum') then
    raise exception 'invalid_category';
  end if;

  v_expected_count := case p_level
    when 'temel' then 9
    when 'yakin' then 13
    else 15
  end;

  if p_wrong_count <> 0
     or p_correct_count <= 0
     or (p_session_type = 'standard' and p_correct_count <> v_expected_count) then
    return 'ineligible';
  end if;

  if p_correct_count > 10000
     or p_total_response_time_ms::bigint < p_correct_count::bigint * 100
     or p_total_response_time_ms::bigint > p_correct_count::bigint * 600000 then
    raise exception 'invalid_timing';
  end if;

  insert into public.best_scores (
    user_id,
    session_type,
    level,
    question_mode,
    correct_count,
    total_response_time_ms
  ) values (
    v_user_id,
    p_session_type,
    p_level,
    p_question_mode,
    p_correct_count,
    p_total_response_time_ms
  )
  on conflict (user_id, session_type, level, question_mode)
  do update set
    correct_count = excluded.correct_count,
    total_response_time_ms = excluded.total_response_time_ms,
    updated_at = now()
  where
    (
      excluded.session_type = 'standard'
      and excluded.total_response_time_ms < public.best_scores.total_response_time_ms
    )
    or
    (
      excluded.session_type = 'endless'
      and (
        excluded.correct_count > public.best_scores.correct_count
        or (
          excluded.correct_count = public.best_scores.correct_count
          and excluded.total_response_time_ms::bigint * public.best_scores.correct_count::bigint
            < public.best_scores.total_response_time_ms::bigint * excluded.correct_count::bigint
        )
      )
    );

  get diagnostics v_changed = row_count;
  return case when v_changed > 0 then 'saved' else 'not_better' end;
end;
$$;

create or replace function public.get_leaderboard(
  p_session_type text,
  p_level text,
  p_question_mode text,
  p_limit integer default 50
)
returns table (
  rank bigint,
  username text,
  correct_count integer,
  total_response_time_ms integer,
  average_response_time_ms integer,
  achieved_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with ranked as (
    select
      row_number() over (
        order by
          case when s.session_type = 'standard' then s.total_response_time_ms end asc,
          case when s.session_type = 'endless' then s.correct_count end desc,
          case when s.session_type = 'endless'
            then s.total_response_time_ms::numeric / s.correct_count end asc,
          s.updated_at asc
      ) as rank,
      p.username,
      s.correct_count,
      s.total_response_time_ms,
      round(s.total_response_time_ms::numeric / s.correct_count)::integer
        as average_response_time_ms,
      s.updated_at as achieved_at
    from public.best_scores s
    join public.profiles p on p.user_id = s.user_id
    where s.session_type = p_session_type
      and s.level = p_level
      and s.question_mode = p_question_mode
  )
  select * from ranked
  order by rank
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.claim_username(text) from public;
revoke all on function public.submit_best_score(text, text, text, integer, integer, integer) from public;
revoke all on function public.get_leaderboard(text, text, text, integer) from public;

grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.submit_best_score(text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.get_leaderboard(text, text, text, integer) to anon, authenticated;
