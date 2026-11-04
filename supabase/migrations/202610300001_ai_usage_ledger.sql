-- B3: authored only. NEVER apply to production. Activation is a separate staging decision.
begin;
create schema if not exists ai_private;
revoke all on schema ai_private from public, anon, authenticated, service_role;

create table ai_private.control (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  project_ref text check (project_ref ~ '^[a-z]{20}$'),
  requests_per_minute integer not null default 3 check (requests_per_minute between 1 and 20),
  requests_per_day integer not null default 20 check (requests_per_day between 1 and 100),
  max_concurrent integer not null default 1 check (max_concurrent between 1 and 3),
  max_request_micro bigint not null default 20000 check (max_request_micro between 1 and 100000),
  user_daily_micro bigint not null default 200000 check (user_daily_micro between 1 and 1000000),
  global_daily_micro bigint not null default 2000000 check (global_daily_micro between 1 and 10000000),
  global_total_micro bigint not null default 10000000 check (global_total_micro between 1 and 50000000)
);
insert into ai_private.control(id) values (true);

create table ai_private.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{1,120}$'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider = 'meta'),
  model_id text not null check (length(model_id) between 1 and 200),
  created_at timestamptz not null default clock_timestamp(),
  lease_expires_at timestamptz not null default (clock_timestamp() + interval '120 seconds'),
  state text not null default 'reserved' check (state in ('reserved', 'completed', 'uncertain')),
  reserved_micro bigint not null check (reserved_micro > 0),
  charged_micro bigint not null check (charged_micro >= 0),
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  settled_at timestamptz,
  released_at timestamptz,
  response jsonb,
  replay_expires_at timestamptz,
  unique(user_id, idempotency_key)
);
create index ai_usage_user_time on ai_private.requests(user_id, created_at);
create index ai_usage_lease on ai_private.requests(lease_expires_at) where released_at is null;
create function ai_private.scrub_deleted_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update ai_private.requests set response=null, replay_expires_at=null where user_id=old.id;
  return old;
end $$;
create trigger ai_usage_account_deletion before delete on auth.users for each row execute function ai_private.scrub_deleted_user();
revoke all on function ai_private.scrub_deleted_user() from public,anon,authenticated,service_role;
alter table ai_private.control enable row level security;
alter table ai_private.requests enable row level security;
-- No client policies. Even service_role has NO table/schema grants: only audited RPCs.
revoke all on all tables in schema ai_private from public, anon, authenticated, service_role;

create function public.ai_usage_reserve(p_project_ref text, p_user_id uuid, p_idempotency_key text,
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
    or (select count(*) from ai_private.requests where user_id=p_user_id and released_at is null) >= c.max_concurrent
    or (select coalesce(sum(charged_micro),0) from ai_private.requests where user_id=p_user_id and created_at >= d) + p_reserved_micro > c.user_daily_micro
    or (select coalesce(sum(charged_micro),0) from ai_private.requests where created_at >= d) + p_reserved_micro > c.global_daily_micro
    or (select coalesce(sum(charged_micro),0) from ai_private.requests) + p_reserved_micro > c.global_total_micro
  then return jsonb_build_object('status','limited'); end if;
  insert into ai_private.requests(user_id,idempotency_key,fingerprint,provider,model_id,reserved_micro,charged_micro)
    values(p_user_id,p_idempotency_key,p_fingerprint,'meta',p_model_id,p_reserved_micro,p_reserved_micro) returning * into r;
  return jsonb_build_object('status','reserved','reservationId',r.id);
end $$;

create function public.ai_usage_settle(p_project_ref text, p_user_id uuid, p_id uuid,
  p_response jsonb, p_actual_micro bigint, p_input_tokens bigint, p_output_tokens bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c ai_private.control%rowtype; r ai_private.requests%rowtype; known boolean;
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
  update ai_private.requests set
    state=case when known then 'completed' else 'uncertain' end,
    charged_micro=case when known then p_actual_micro else greatest(r.reserved_micro,r.charged_micro) end,
    input_tokens=p_input_tokens, output_tokens=p_output_tokens, settled_at=clock_timestamp(),
    released_at=case when known then clock_timestamp() else r.released_at end,
    response=p_response, replay_expires_at=clock_timestamp()+interval '24 hours'
    where id=p_id;
  -- Incurred overage is recorded in full, never capped/hidden. Stop all new work.
  if known and p_actual_micro>r.reserved_micro then update ai_private.control set enabled=false where id=true; end if;
  return jsonb_build_object('status','settled');
end $$;

-- No automatic refund. Operator must confirm worker cancellation and expired lease.
create function public.ai_usage_recover(p_project_ref text, p_id uuid, p_worker_cancelled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c ai_private.control%rowtype; r ai_private.requests%rowtype;
begin
  select * into strict c from ai_private.control where id=true for update;
  if c.project_ref is distinct from p_project_ref or p_worker_cancelled is distinct from true then raise exception 'recovery_not_authorized'; end if;
  select * into strict r from ai_private.requests where id=p_id for update;
  if r.released_at is not null then return jsonb_build_object('status','recovered'); end if;
  if r.lease_expires_at > clock_timestamp() then raise exception 'lease_not_expired'; end if;
  update ai_private.requests set state='uncertain', released_at=clock_timestamp(),
    charged_micro=greatest(charged_micro,reserved_micro) where id=p_id;
  update ai_private.requests set response=null where replay_expires_at<=clock_timestamp();
  return jsonb_build_object('status','recovered');
end $$;

revoke all on function public.ai_usage_reserve(text,uuid,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.ai_usage_settle(text,uuid,uuid,jsonb,bigint,bigint,bigint) from public,anon,authenticated;
revoke all on function public.ai_usage_recover(text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ai_usage_reserve(text,uuid,text,text,bigint,text) to service_role;
grant execute on function public.ai_usage_settle(text,uuid,uuid,jsonb,bigint,bigint,bigint) to service_role;
-- recover intentionally owner/admin only; Edge cannot release uncertain slots.
commit;