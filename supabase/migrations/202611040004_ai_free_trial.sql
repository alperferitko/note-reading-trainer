-- Free trial for the live site. While control.trial_days is set, an account may use NotaNota AI for
-- that many days from when it was created; accounts older than trial_launch_at count from the launch.
-- Inside the window the usual per-minute, per-day, concurrency and global budgets still apply, plus a
-- cap per user for the whole trial (requests and USD). trial_days stays null on staging, which keeps
-- its plain daily limits. A refused reservation now says which limit was hit (scope), so the app can
-- tell the learner to wait a minute, come back tomorrow, that the trial is over or that AI is paused.
-- A failed call no longer holds its idempotency key: the row stays (charged, for every budget) under
-- a renamed key, so the same request can be tried again instead of replaying the error for 24 hours.
begin;

-- The budget sums scan by time; keep them indexed as the history grows.
create index if not exists ai_usage_time on ai_private.requests(created_at);
create index if not exists ai_usage_replay on ai_private.requests(replay_expires_at) where response is not null;

alter table ai_private.control
  add column trial_days integer check (trial_days between 1 and 30),
  add column trial_launch_at timestamptz,
  add column trial_user_requests integer not null default 60 check (trial_user_requests between 1 and 500),
  add column trial_user_micro bigint not null default 400000 check (trial_user_micro between 1 and 5000000);

-- Start of the user's trial, or null when the account does not exist.
create function ai_private.trial_start(c ai_private.control, p_user_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select greatest(u.created_at, coalesce(c.trial_launch_at, u.created_at)) from auth.users u where u.id = p_user_id
$$;
revoke all on function ai_private.trial_start(ai_private.control, uuid) from public, anon, authenticated, service_role;

create or replace function public.ai_usage_reserve(p_project_ref text, p_user_id uuid, p_idempotency_key text,
  p_fingerprint text, p_reserved_micro bigint, p_model_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c ai_private.control%rowtype;
  r ai_private.requests%rowtype;
  t timestamptz;
  d timestamptz;
  s timestamptz;
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
  -- Crashed workers stay charged; once their lease is over they no longer hold the concurrency slot.
  update ai_private.requests set state = 'uncertain'
    where released_at is null and lease_expires_at <= t and state = 'reserved';
  select * into r from ai_private.requests where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    -- A stored answer is replayed even after the trial: it costs nothing.
    if r.fingerprint = p_fingerprint and r.response is not null and r.replay_expires_at > t then
      return jsonb_build_object('status', 'replay', 'response', r.response);
    end if;
    return jsonb_build_object('status', 'conflict');
  end if;
  if c.trial_days is not null then
    s := ai_private.trial_start(c, p_user_id);
    if s is null or t >= s + make_interval(days => c.trial_days) then
      return jsonb_build_object('status', 'trial_ended');
    end if;
  end if;
  -- The whole budget spent (or a request above the per-request bound): paused until an operator acts.
  if p_reserved_micro > c.max_request_micro
    or (select coalesce(sum(charged_micro),0) from ai_private.requests) + p_reserved_micro > c.global_total_micro
  then return jsonb_build_object('status','limited','scope','paused'); end if;
  if (select coalesce(sum(charged_micro),0) from ai_private.requests where created_at >= d) + p_reserved_micro > c.global_daily_micro
  then return jsonb_build_object('status','limited','scope','global'); end if;
  if (select count(*) from ai_private.requests where user_id=p_user_id and created_at > t-interval '1 minute') >= c.requests_per_minute
    or (select count(*) from ai_private.requests where user_id=p_user_id and released_at is null and state='reserved' and lease_expires_at > t) >= c.max_concurrent
  then return jsonb_build_object('status','limited','scope','minute'); end if;
  if c.trial_days is not null and (
    (select count(*) from ai_private.requests where user_id=p_user_id and created_at >= s) >= c.trial_user_requests
    or (select coalesce(sum(charged_micro),0) from ai_private.requests where user_id=p_user_id and created_at >= s) + p_reserved_micro > c.trial_user_micro)
  then return jsonb_build_object('status','limited','scope','trial'); end if;
  if (select count(*) from ai_private.requests where user_id=p_user_id and created_at >= d) >= c.requests_per_day
    or (select coalesce(sum(charged_micro),0) from ai_private.requests where user_id=p_user_id and created_at >= d) + p_reserved_micro > c.user_daily_micro
  then return jsonb_build_object('status','limited','scope','day'); end if;
  insert into ai_private.requests(user_id,idempotency_key,fingerprint,provider,model_id,reserved_micro,charged_micro)
    values(p_user_id,p_idempotency_key,p_fingerprint,'meta',p_model_id,p_reserved_micro,p_reserved_micro) returning * into r;
  return jsonb_build_object('status','reserved','reservationId',r.id);
end $$;

revoke all on function public.ai_usage_reserve(text,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.ai_usage_reserve(text,uuid,text,text,bigint,text) to service_role;

-- Same as 202611020001, except for failures: an error answer is not kept for replay and its key is
-- renamed (the row, charge and tokens stay), so a retry with the same key reserves anew.
create or replace function public.ai_usage_settle(p_project_ref text, p_user_id uuid, p_id uuid,
  p_response jsonb, p_actual_micro bigint, p_input_tokens bigint, p_output_tokens bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c ai_private.control%rowtype; r ai_private.requests%rowtype; known boolean; recovered boolean; failed boolean;
begin
  select * into strict c from ai_private.control where id=true for update;
  -- Settlement must work even if the kill switch was disabled after reservation.
  if c.project_ref is distinct from p_project_ref then raise exception 'wrong_project'; end if;
  select * into strict r from ai_private.requests where id=p_id and user_id=p_user_id for update;
  if r.settled_at is not null then return jsonb_build_object('status','settled'); end if;
  if p_response is null or jsonb_typeof(p_response) <> 'object' or octet_length(p_response::text)>65536
    or p_response->>'schemaVersion' is distinct from '1'
    or p_actual_micro < 0 or p_input_tokens < 0 or p_output_tokens < 0 then raise exception 'invalid_settlement'; end if;
  known := p_actual_micro is not null and p_input_tokens is not null and p_output_tokens is not null;
  recovered := r.released_at is not null;
  failed := p_response ? 'error';
  update ai_private.requests set
    state=case when known and not recovered then 'completed' else 'uncertain' end,
    charged_micro=case
      when recovered then greatest(r.charged_micro, coalesce(p_actual_micro, 0))
      when known then p_actual_micro
      else greatest(r.reserved_micro, r.charged_micro) end,
    input_tokens=p_input_tokens, output_tokens=p_output_tokens, settled_at=clock_timestamp(),
    released_at=case when recovered then r.released_at when known then clock_timestamp() else null end,
    idempotency_key=case when failed then left(r.idempotency_key, 100) || '-f' || left(replace(r.id::text, '-', ''), 12) else r.idempotency_key end,
    response=case when failed then null else p_response end,
    replay_expires_at=case when failed then null else clock_timestamp()+interval '24 hours' end
    where id=p_id;
  -- Incurred overage is recorded in full, never capped/hidden. Stop all new work.
  if known and p_actual_micro>r.reserved_micro then update ai_private.control set enabled=false where id=true; end if;
  return jsonb_build_object('status','settled');
end $$;
revoke all on function public.ai_usage_settle(text,uuid,uuid,jsonb,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.ai_usage_settle(text,uuid,uuid,jsonb,bigint,bigint,bigint) to service_role;

-- What the signed-in learner may still use: the trial window and today's / the trial's request
-- counts. Only counts and dates of the caller's own rows; never amounts, other users or responses.
create function public.ai_trial_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c ai_private.control%rowtype;
  v_user uuid := auth.uid();
  t timestamptz := now();
  d timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  s timestamptz;
begin
  if v_user is null then return null; end if;
  select * into strict c from ai_private.control where id = true;
  if c.trial_days is null then return jsonb_build_object('trial', false, 'enabled', c.enabled); end if;
  s := ai_private.trial_start(c, v_user);
  if s is null then return null; end if;
  return jsonb_build_object('trial', true, 'enabled', c.enabled,
    'startsAt', s, 'endsAt', s + make_interval(days => c.trial_days), 'active', t < s + make_interval(days => c.trial_days),
    'dailyLimit', c.requests_per_day, 'usedToday', (select count(*) from ai_private.requests where user_id = v_user and created_at >= d),
    'trialLimit', c.trial_user_requests, 'usedTotal', (select count(*) from ai_private.requests where user_id = v_user and created_at >= s));
end $$;
revoke all on function public.ai_trial_status() from public, anon;
grant execute on function public.ai_trial_status() to authenticated;
commit;
