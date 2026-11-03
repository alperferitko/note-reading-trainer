-- Real PostgreSQL test, disposable CI database after bootstrap + migration ONLY.
begin;
update ai_private.control set enabled=true,project_ref=repeat('s',20);
do $$
declare a jsonb; b jsonb; i uuid; u uuid := '10000000-0000-0000-0000-000000000001';
begin
  if has_function_privilege('authenticated','public.ai_usage_reserve(text,uuid,text,text,bigint,text)','EXECUTE')
    or has_function_privilege('anon','public.ai_usage_settle(text,uuid,uuid,jsonb,bigint,bigint,bigint)','EXECUTE')
    or has_function_privilege('service_role','public.ai_usage_recover(text,uuid,boolean)','EXECUTE')
    or has_table_privilege('authenticated','ai_private.requests','SELECT') then raise exception 'access leak'; end if;
  a := public.ai_usage_reserve(repeat('s',20),u,'a',repeat('a',64),20000,'fixture-only'); i := (a->>'reservationId')::uuid;
  if a->>'status'<>'reserved' then raise exception 'reserve failed'; end if;
  b := public.ai_usage_reserve(repeat('s',20),u,'a',repeat('a',64),20000,'fixture-only');
  if b->>'status'<>'conflict' then raise exception 'inflight duplicate'; end if;
  b := public.ai_usage_reserve(repeat('s',20),u,'b',repeat('b',64),20000,'fixture-only');
  if b->>'status'<>'limited' then raise exception 'concurrency'; end if;
  begin
    perform public.ai_usage_settle(repeat('s',20),'10000000-0000-0000-0000-000000000002',i,'{"schemaVersion":"1"}',100,1,1);
    raise exception 'wrong owner accepted';
  exception when no_data_found then null; end;
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1","mode":"live"}',100,5,6);
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',0,0,0);
  if (select charged_micro<>100 or input_tokens<>5 or output_tokens<>6 from ai_private.requests where id=i) then raise exception 'double settle'; end if;
  b := public.ai_usage_reserve(repeat('s',20),u,'a',repeat('a',64),20000,'fixture-only');
  if b->>'status'<>'replay' then raise exception 'missing replay'; end if;
  b := public.ai_usage_reserve(repeat('s',20),u,'a',repeat('b',64),20000,'fixture-only');
  if b->>'status'<>'conflict' then raise exception 'changed replay'; end if;
  a := public.ai_usage_reserve(repeat('s',20),u,'uncertain',repeat('c',64),20000,'fixture-only'); i := (a->>'reservationId')::uuid;
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1","error":{"code":"provider_timeout"}}',null,null,null);
  if (select charged_micro<>20000 or released_at is not null or state<>'uncertain' from ai_private.requests where id=i) then raise exception 'unknown billing refunded'; end if;
  update ai_private.requests set lease_expires_at=clock_timestamp()-interval '1 second' where id=i;
  perform public.ai_usage_recover(repeat('s',20),i,true);
  if (select charged_micro<>20000 or released_at is null from ai_private.requests where id=i) then raise exception 'recovery'; end if;
  -- Expired replay never silently creates a second paid request.
  update ai_private.requests set replay_expires_at=clock_timestamp()-interval '1 second' where id=i;
  b := public.ai_usage_reserve(repeat('s',20),u,'uncertain',repeat('c',64),20000,'fixture-only');
  if b->>'status'<>'conflict' then raise exception 'expired replay recharged'; end if;
  update ai_private.control set global_total_micro=1;
  b := public.ai_usage_reserve(repeat('s',20),'10000000-0000-0000-0000-000000000002','total',repeat('d',64),20000,'fixture-only');
  if b->>'status'<>'limited' then raise exception 'total spend bypass'; end if;
end $$;
rollback;

begin;
update ai_private.control set enabled=true,project_ref=repeat('s',20),user_daily_micro=20000;
do $$
declare a jsonb; i uuid; u uuid := '10000000-0000-0000-0000-000000000001';
begin
  a:=public.ai_usage_reserve(repeat('s',20),u,'budget1',repeat('a',64),20000,'fixture-only'); i:=(a->>'reservationId')::uuid;
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',20000,10,10);
  a:=public.ai_usage_reserve(repeat('s',20),u,'budget2',repeat('a',64),1,'fixture-only');
  if a->>'status'<>'limited' then raise exception 'user daily budget'; end if;
  a:=public.ai_usage_reserve(repeat('s',20),'10000000-0000-0000-0000-000000000002','budget1',repeat('a',64),20000,'fixture-only');
  if a->>'status'<>'reserved' then raise exception 'user budget isolation'; end if;
  delete from auth.users where id=u;
  if (select response is not null or user_id is not null or charged_micro<>20000 from ai_private.requests where id=i) then raise exception 'account deletion privacy/budget'; end if;
end $$;
rollback;

begin;
update ai_private.control set enabled=true,project_ref=repeat('s',20),requests_per_minute=1,requests_per_day=2;
do $$
declare a jsonb; i uuid; u uuid := '10000000-0000-0000-0000-000000000001';
begin
  a:=public.ai_usage_reserve(repeat('s',20),u,'minute',repeat('a',64),20000,'fixture-only'); i:=(a->>'reservationId')::uuid;
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',1,1,1);
  a:=public.ai_usage_reserve(repeat('s',20),u,'minute2',repeat('a',64),20000,'fixture-only');
  if a->>'status'<>'limited' then raise exception 'minute limit'; end if;
  update ai_private.requests set created_at=clock_timestamp()-interval '2 minutes';
  a:=public.ai_usage_reserve(repeat('s',20),u,'minute2',repeat('a',64),20000,'fixture-only'); i:=(a->>'reservationId')::uuid;
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',1,1,1);
  update ai_private.requests set created_at=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  a:=public.ai_usage_reserve(repeat('s',20),u,'day',repeat('a',64),20000,'fixture-only');
  if a->>'status'<>'limited' then raise exception 'daily limit'; end if;
  update ai_private.requests set created_at=created_at-interval '1 day';
  a:=public.ai_usage_reserve(repeat('s',20),u,'day',repeat('a',64),20000,'fixture-only'); i:=(a->>'reservationId')::uuid;
  if a->>'status'<>'reserved' then raise exception 'UTC rollover'; end if;
  perform public.ai_usage_settle(repeat('s',20),u,i,'{"schemaVersion":"1"}',30000,10,10);
  if (select enabled from ai_private.control) then raise exception 'overage did not halt'; end if;
  if (select charged_micro from ai_private.requests where id=i)<>30000 then raise exception 'overage hidden'; end if;
end $$;
rollback;