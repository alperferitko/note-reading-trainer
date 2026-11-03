-- B4 ledger correction. NOT APPLIED anywhere; staging application needs explicit approval.
-- 1. A settled row is final for the Edge function: a second settle never changes charge or tokens.
-- 2. A row released by ai_usage_recover keeps its conservative charge if a late settle arrives;
--    the late settle may only raise the charge to the known actual, never lower it or re-release it.
-- 3. A row settled with unknown usage can be corrected once, by the database owner only, with
--    ai_usage_reconcile. The charge is replaced, never added, so nothing is counted twice.
begin;

alter table ai_private.requests add column reconciled_at timestamptz;
alter table ai_private.requests add column reconcile_note text check (reconcile_note is null or length(reconcile_note) between 1 and 200);

create or replace function public.ai_usage_settle(p_project_ref text, p_user_id uuid, p_id uuid,
  p_response jsonb, p_actual_micro bigint, p_input_tokens bigint, p_output_tokens bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c ai_private.control%rowtype; r ai_private.requests%rowtype; known boolean; recovered boolean;
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
  update ai_private.requests set
    state=case when known and not recovered then 'completed' else 'uncertain' end,
    charged_micro=case
      when recovered then greatest(r.charged_micro, coalesce(p_actual_micro, 0))
      when known then p_actual_micro
      else greatest(r.reserved_micro, r.charged_micro) end,
    input_tokens=p_input_tokens, output_tokens=p_output_tokens, settled_at=clock_timestamp(),
    released_at=case when recovered then r.released_at when known then clock_timestamp() else null end,
    response=p_response, replay_expires_at=clock_timestamp()+interval '24 hours'
    where id=p_id;
  -- Incurred overage is recorded in full, never capped/hidden. Stop all new work.
  if known and p_actual_micro>r.reserved_micro then update ai_private.control set enabled=false where id=true; end if;
  return jsonb_build_object('status','settled');
end $$;

-- Owner-only, once per request: replaces an uncertain charge with the provider's reported usage.
create function public.ai_usage_reconcile(p_project_ref text, p_id uuid, p_actual_micro bigint,
  p_input_tokens bigint, p_output_tokens bigint, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c ai_private.control%rowtype; r ai_private.requests%rowtype;
begin
  select * into strict c from ai_private.control where id=true for update;
  if c.project_ref is distinct from p_project_ref then raise exception 'wrong_project'; end if;
  if p_actual_micro is null or p_input_tokens is null or p_output_tokens is null
    or p_actual_micro < 0 or p_input_tokens < 0 or p_output_tokens < 0
    or p_note is null or length(p_note) not between 1 and 200 then raise exception 'invalid_reconciliation'; end if;
  select * into strict r from ai_private.requests where id=p_id for update;
  if r.reconciled_at is not null then return jsonb_build_object('status','already_reconciled'); end if;
  if r.state <> 'uncertain' or (r.settled_at is null and r.released_at is null) then raise exception 'not_reconcilable'; end if;
  update ai_private.requests set state='completed', charged_micro=p_actual_micro,
    input_tokens=p_input_tokens, output_tokens=p_output_tokens,
    released_at=coalesce(r.released_at, clock_timestamp()), reconciled_at=clock_timestamp(), reconcile_note=p_note
    where id=p_id;
  if p_actual_micro>r.reserved_micro then update ai_private.control set enabled=false where id=true; end if;
  return jsonb_build_object('status','reconciled');
end $$;

revoke all on function public.ai_usage_settle(text,uuid,uuid,jsonb,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.ai_usage_settle(text,uuid,uuid,jsonb,bigint,bigint,bigint) to service_role;
revoke all on function public.ai_usage_reconcile(text,uuid,bigint,bigint,bigint,text) from public,anon,authenticated,service_role;
commit;
