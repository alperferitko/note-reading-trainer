-- Free trial for the live site. While control.trial_days is set, an account may use NotaNota AI for
-- that many days from when it was created; accounts older than trial_launch_at count from the launch.
-- Inside the window the usual per-minute, per-day, concurrency and global budgets still apply, plus a
-- cap per user for the whole trial (requests and USD). trial_days stays null on staging, which keeps
-- its plain daily limits. A refused reservation now says which limit was hit (scope), so the app can
-- tell the learner to wait a minute, come back tomorrow or that the trial is over.
begin;

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
  -- Crashed workers remain charged AND occupy a slot until explicit recovery.
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
  if p_reserved_micro > c.max_request_micro
    or (select coalesce(sum(charged_micro),0) from ai_private.requests where created_at >= d) + p_reserved_micro > c.global_daily_micro
    or (select coalesce(sum(charged_micro),0) from ai_private.requests) + p_reserved_micro > c.global_total_micro
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
