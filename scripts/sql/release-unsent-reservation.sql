-- Releases ONE stale staging reservation that was never sent to Meta. Staging only.
-- Background: before the zero-cost fix, a body rejected as request_too_large (meta.mjs refuses it
-- before calling the provider) was settled with unknown usage, so ai_usage_settle left the row
-- 'uncertain' and charged at its full reservation (18520 micro-USD). Budgets in ai_usage_reserve
-- sum charged_micro, so that money stays blocked.
-- This uses the existing owner-only ai_usage_reconcile: once per row it replaces the charge with
-- the provider's real usage (here 0 / 0 tokens), sets state 'completed', keeps settled_at,
-- reserved_micro and the stored response, sets released_at if still empty, and records
-- reconciled_at + reconcile_note. No row is deleted and no other column is hand-edited.
-- Run in the Supabase SQL editor (role postgres) of project coftskrofgcfzsuqdtpn ONLY.

-- STEP 1 (read-only preview). Run alone. Exactly one row should come back; copy its id.
select id, user_id, state, reserved_micro, charged_micro, input_tokens, output_tokens,
  created_at, settled_at, released_at, reconciled_at, response->'error'->>'code' as error_code
from ai_private.requests
where state = 'uncertain' and reconciled_at is null and reserved_micro = 18520
  and created_at < timestamptz '2026-11-03 18:50:00+00'
order by created_at;

-- STEP 2. Put the id from step 1 in place of the placeholder in v_id below (keep the quotes),
-- then run from begin to the end.
-- Every guard must hold or the whole transaction aborts and nothing changes.
begin;
do $$
declare
  v_id constant uuid := 'PASTE-REQUEST-ID-HERE';
  r ai_private.requests%rowtype;
  v_ref text;
begin
  select project_ref into strict v_ref from ai_private.control where id = true;
  if v_ref is distinct from 'coftskrofgcfzsuqdtpn' then raise exception 'wrong project: %', v_ref; end if;
  select * into strict r from ai_private.requests where id = v_id for update;
  -- Evidence that Meta was never contacted: the old path settled it with no usage at all, and the
  -- stored error (if the 24 h replay copy has not been scrubbed yet) is request_too_large.
  if r.state <> 'uncertain' or r.reconciled_at is not null or r.settled_at is null
    or r.reserved_micro <> 18520 or r.charged_micro <> 18520
    or r.input_tokens is not null or r.output_tokens is not null
    or r.created_at >= timestamptz '2026-11-03 18:50:00+00'
    or (r.response is not null and r.response->'error'->>'code' is distinct from 'request_too_large')
  then raise exception 'row % does not match the unsent request_too_large reservation; nothing changed', v_id; end if;
  perform public.ai_usage_reconcile(v_ref, v_id, 0, 0, 0,
    'request_too_large rejected before sending to Meta; released at zero cost (pre zero-settle fix)');
end $$;
commit;

-- STEP 3 (read-only). The row is still there: completed, charged 0, released, with the note.
select id, state, reserved_micro, charged_micro, input_tokens, output_tokens,
  settled_at, released_at, reconciled_at, reconcile_note
from ai_private.requests
where reconcile_note like 'request_too_large rejected before sending to Meta%';
