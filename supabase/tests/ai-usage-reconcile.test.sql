-- Real PostgreSQL test, disposable database after bootstrap + both ledger migrations ONLY.
begin;
update ai_private.control set enabled=true,project_ref=repeat('s',20),max_concurrent=3,requests_per_minute=20;
do $$
declare a jsonb; b jsonb; i uuid; u uuid := '10000000-0000-0000-0000-000000000001';
begin
  if has_function_privilege('service_role','public.ai_usage_reconcile(text,uuid,bigint,bigint,bigint,text)','EXECUTE')
    or has_function_privilege('authenticated','public.ai_usage_reconcile(text,uuid,bigint,bigint,bigint,text)','EXECUTE')
    or has_function_privilege('anon','public.ai_usage_reconcile(text,uuid,bigint,bigint,bigint,text)','EXECUTE') then raise exception 'reconcile is not owner-only'; end if;

  -- Known settlement is final: a repeated settle changes nothing.
  a := public.ai_usage_reserve(repeat('s',20),u,'k1',repeat('a',64),20000,'fixture-only'); i := (a->>'reservationId')::uuid;
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',300,10,20);
  b := public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',900,99,99);
  if b->>'status'<>'settled' or (select charged_micro<>300 or input_tokens<>10 from ai_private.requests where id=i) then raise exception 'second settle changed a final row'; end if;
  begin
    perform public.ai_usage_reconcile(repeat('s',20),i,1,1,1,'fixture');
    raise exception 'completed row reconciled';
  exception when raise_exception then
    if sqlerrm <> 'not_reconcilable' then raise; end if;
  end;

  -- Unknown usage: conservative charge, then one owner correction that replaces it.
  a := public.ai_usage_reserve(repeat('s',20),u,'k2',repeat('b',64),20000,'fixture-only'); i := (a->>'reservationId')::uuid;
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',null,null,null);
  if (select charged_micro<>20000 or released_at is not null from ai_private.requests where id=i) then raise exception 'unknown usage not conservative'; end if;
  b := public.ai_usage_reconcile(repeat('s',20),i,1500,40,50,'provider dashboard 2026-11-02');
  if b->>'status'<>'reconciled' or (select charged_micro<>1500 or state<>'completed' or released_at is null or reconciled_at is null from ai_private.requests where id=i) then raise exception 'reconcile failed'; end if;
  b := public.ai_usage_reconcile(repeat('s',20),i,99999,1,1,'second try');
  if b->>'status'<>'already_reconciled' or (select charged_micro<>1500 from ai_private.requests where id=i) then raise exception 'reconcile ran twice'; end if;
  if (select sum(charged_micro) from ai_private.requests where user_id=u)<>1800 then raise exception 'charges double counted'; end if;

  -- Recovered row: a late known settle never lowers the charge or re-opens the slot.
  a := public.ai_usage_reserve(repeat('s',20),u,'k3',repeat('c',64),20000,'fixture-only'); i := (a->>'reservationId')::uuid;
  update ai_private.requests set lease_expires_at=clock_timestamp()-interval '1 second' where id=i;
  perform public.ai_usage_recover(repeat('s',20),i,true);
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',700,5,5);
  if (select charged_micro<>20000 or state<>'uncertain' or settled_at is null or released_at is null from ai_private.requests where id=i) then raise exception 'late settle lowered a recovered charge'; end if;
  b := public.ai_usage_reconcile(repeat('s',20),i,700,5,5,'late usage confirmed');
  if (select charged_micro<>700 or state<>'completed' from ai_private.requests where id=i) then raise exception 'recovered reconcile'; end if;

  -- Overage found by reconciliation stops new work.
  a := public.ai_usage_reserve(repeat('s',20),u,'k4',repeat('d',64),20000,'fixture-only'); i := (a->>'reservationId')::uuid;
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',null,null,null);
  perform public.ai_usage_reconcile(repeat('s',20),i,25000,1,1,'over reservation');
  if (select enabled from ai_private.control) then raise exception 'overage did not disable'; end if;

  begin
    perform public.ai_usage_reconcile(repeat('x',20),i,1,1,1,'wrong project');
    raise exception 'wrong project accepted';
  exception when raise_exception then
    if sqlerrm <> 'wrong_project' then raise; end if;
  end;
end $$;
rollback;
