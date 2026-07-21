alter table public.best_scores
  drop constraint if exists best_scores_level_check;

alter table public.best_scores
  add constraint best_scores_level_check
  check (level in ('temel', 'yakin', 'tam', 'genis'));

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
     or p_level not in ('temel', 'yakin', 'tam', 'genis')
     or p_question_mode not in ('porte', 'konum') then
    raise exception 'invalid_category';
  end if;

  v_expected_count := case p_level
    when 'temel' then 9
    when 'yakin' then 13
    when 'tam' then 15
    else 25
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

revoke all on function public.submit_best_score(text, text, text, integer, integer, integer) from public;
grant execute on function public.submit_best_score(text, text, text, integer, integer, integer) to authenticated;
