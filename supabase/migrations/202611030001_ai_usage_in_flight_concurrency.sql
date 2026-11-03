-- Staging only. A failed provider call is settled 'uncertain': it stays charged in full (budgets
-- below still count it) but no longer occupies the per-user concurrency slot forever. Only
-- reservations still inside their lease are in flight.
begin;

create or replace function public.ai_usage_reserve(p_project_ref text, p_user_id uuid, p_idempotency_key text,
  p_fingerprint text, p_reserved_micro bigint, p_model_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c ai_private.control%rowtype;
  r ai_private.requests%rowtype;
  t timestamptz;
  d timestamptz;
begin
  -- Same lock for reserve/settle/recover, including across UTC midnight.
  select * into strict c from ai_private.control where id = true for update;
  if not c.enabled or c.project_ref is distinct from p_project_ref then
    raise exception 'ai_ledger_disabled';
  end if;
  t := clock_timestamp(); d := date_trunc('day', t at time zone 'UTC') at time zone 'UTC';
  if p_user_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{1,120}$'
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_model_id is null or length(p_model_id) not between 1 and 200
    or p_reserved_micro is null or p_reserved_micro <= 0 then raise exception 'invalid_reservation'; end if;
  -- Scrub sensitive replay snapshots. Never remove billing/idempotency tombstones.
  update ai_private.requests set response = null where replay_expires_at <= t and response is not null;
  -- Crashed workers remain charged AND occupy a slot until explicit recovery.
  update ai_private.requests set state = 'uncertain'
    where released_at is null and lease_expires_at <= t and state = 'reserved';
  select * into r from ai_private.requests where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if r.fingerprint = p_fingerprint and r.response is not null and r.replay_expires_at > t then
      return jsonb_build_object('status', 'replay', 'response', r.response);
    end if;
    return jsonb_build_object('status', 'conflict');
  end if;
  if p_reserved_micro > c.max_request_micro
    or (select count(*) from ai_private.requests where user_id=p_user_id and created_at > t-interval '1 minute') >= c.requests_per_minute
    or (select count(*) from ai_private.requests where user_id=p_user_id and created_at >= d) >= c.requests_per_day
    or (select count(*) from ai_private.requests where user_id=p_user_id and released_at is null and state='reserved' and lease_expires_at > t) >= c.max_concurrent
    or (select coalesce(sum(charged_micro),0) from ai_private.requests where user_id=p_user_id and created_at >= d) + p_reserved_micro > c.user_daily_micro
    or (select coalesce(sum(charged_micro),0) from ai_private.requests where created_at >= d) + p_reserved_micro > c.global_daily_micro
    or (select coalesce(sum(charged_micro),0) from ai_private.requests) + p_reserved_micro > c.global_total_micro
  then return jsonb_build_object('status','limited'); end if;
  insert into ai_private.requests(user_id,idempotency_key,fingerprint,provider,model_id,reserved_micro,charged_micro)
    values(p_user_id,p_idempotency_key,p_fingerprint,'meta',p_model_id,p_reserved_micro,p_reserved_micro) returning * into r;
  return jsonb_build_object('status','reserved','reservationId',r.id);
end $$;

revoke all on function public.ai_usage_reserve(text,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.ai_usage_reserve(text,uuid,text,text,bigint,text) to service_role;
commit;
