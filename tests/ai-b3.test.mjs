import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stagingConfig } from '../supabase/functions/_shared/ai/staging-config.mjs';
import { createStagingGateway } from '../supabase/functions/_shared/ai/staging-gateway.mjs';
import { createPostgresUsageStore, usdToMicro } from '../supabase/functions/_shared/ai/postgres-store.mjs';
import { feedback, request } from './fixtures/ai/offline.mjs';

const s = 's'.repeat(20), p = 'p'.repeat(20);
const pins = { stagingProjectRef: s, productionProjectRef: p, stagingOrigins: ['https://ai-stage.example'], productionOrigins: ['https://production.example'] };
function env(overrides = {}) {
  return { AI_BACKEND_MODE: 'staging-meta', AI_STAGING_LIVE_APPROVAL: 'APPROVED_BOUNDED_META_STAGING',
    AI_STAGING_PROJECT_REF: s, AI_PRODUCTION_PROJECT_REF: p, SUPABASE_URL: `https://${s}.supabase.co`,
    DENO_DEPLOYMENT_ID: `${s}_test_revision`, AI_STAGING_APPROVAL_EXPIRES_AT: new Date(Date.now()+3600000).toISOString(),
    META_MODEL_VERIFIED_AT: new Date().toISOString(), META_MODEL_VERIFICATION_SOURCE: 'https://api.meta.ai/v1/models',
    META_TOKEN_BOUND_VERIFIED: 'true', META_MODEL_ID: 'fixture-only-model', META_API_KEY: 'fixture-not-real', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
    SUPABASE_ANON_KEY: 'fixture-anon', META_INPUT_USD_PER_MILLION: '0.1', META_OUTPUT_USD_PER_MILLION: '0.2',
    AI_ALLOWED_ORIGINS: 'https://ai-stage.example', ...overrides };
}
const config = overrides => { const values = env(overrides); return stagingConfig(name => values[name], pins); };
const payload = () => {
  const value = request();
  value.evidence.records = value.evidence.records.map((row,index) => ({...row, at: new Date(Date.now()-10000+index*1000).toISOString()}));
  return value;
};
const user = { authenticated: true, userId: '10000000-0000-0000-0000-000000000001' };
const ctx = { requestId: 'b3-test', idempotencyKey: 'b3-key' };

// RPC double exercises boundary/wiring only. NOT PostgreSQL atomicity proof.
function rpcDouble() {
  const calls = [], rows = new Map();
  return { calls, rows, async rpc(name, args) {
    calls.push({name,args});
    if (name === 'ai_usage_reserve') {
      const key = `${args.p_user_id}:${args.p_idempotency_key}`, existing = rows.get(key);
      if (existing) return { data: existing.fingerprint !== args.p_fingerprint || !existing.response ? {status:'conflict'} : {status:'replay',response:existing.response}, error:null };
      const id = crypto.randomUUID(); rows.set(key,{id,fingerprint:args.p_fingerprint});
      return { data:{status:'reserved',reservationId:id}, error:null };
    }
    const row = [...rows.values()].find(row => row.id === args.p_id);
    row.response=args.p_response;
    return {data:{status:'settled'},error:null};
  } };
}

test('staging requires reviewed pins, exact URL/deployment ID, short-lived approval, model and prices', () => {
  assert.ok(config());
  for (const overrides of [{AI_BACKEND_MODE:'local-mock'}, {AI_STAGING_LIVE_APPROVAL:''}, {SUPABASE_URL:`https://${p}.supabase.co`},
    {AI_STAGING_PROJECT_REF:p}, {DENO_DEPLOYMENT_ID:`${p}_revision`}, {AI_ALLOWED_ORIGINS:'https://production.example'},
    {META_MODEL_ID:''}, {META_TOKEN_BOUND_VERIFIED:'false'}, {META_INPUT_USD_PER_MILLION:'0'}, {META_MODEL_VERIFIED_AT:'bad'},
    {AI_STAGING_APPROVAL_EXPIRES_AT:new Date(Date.now()-1).toISOString()}]) assert.equal(config(overrides),null);
  const values=env();
  assert.equal(stagingConfig(name=>values[name],{...pins, stagingProjectRef:null}),null);
  assert.throws(()=>createStagingGateway({config:{...config()}}),/staging_not_authorized/);
});

test('Postgres repository projects micro-USD, verified ownership and nullable usage; RPC errors fail closed', async () => {
  assert.equal(usdToMicro(0.0000001),1);
  const client=rpcDouble();
  const store=createPostgresUsageStore({client,projectRef:s,modelId:'fixture'});
  const row=await store.reserve({userId:user.userId,idempotencyKey:'a',fingerprint:'a'.repeat(64),reservedUsd:0.02});
  await store.settle(row.reservationId,{response:{schemaVersion:'1'},actualUsd:null});
  assert.equal(client.calls[0].args.p_reserved_micro,20000);
  assert.equal(client.calls[1].args.p_actual_micro,null);
  assert.equal(client.calls[1].args.p_input_tokens,null);
  assert.equal(client.calls[1].args.p_user_id,user.userId);
  await assert.rejects(store.settle(crypto.randomUUID(),{}),{code:'usage_store_unavailable'});
  const failed=createPostgresUsageStore({client:{rpc:async()=>({error:{message:'private-secret'}})},projectRef:s,modelId:'fixture'});
  await assert.rejects(failed.reserve({reservedUsd:0.02}),error=>error.code==='usage_store_unavailable'&&!error.message.includes('private'));
});

test('Meta mocked integration reserves before transport, records tokens, replays and isolates users', async () => {
  const client=rpcDouble(); let calls=0;
  const gateway=createStagingGateway({config:config(),createClient:()=>client,transport:async()=>{
    calls++; assert.equal(client.calls.at(-1).name,'ai_usage_reserve');
    return Response.json({model:'fixture-only-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(feedback())}}],usage:{prompt_tokens:100,completion_tokens:50}});
  }});
  const body=payload();
  const result=await gateway.execute(user,body,ctx);
  assert.equal(result.mode,'live'); // real-protocol mode; transport here is FAKE
  assert.equal(client.calls.at(-1).args.p_input_tokens,100);
  assert.ok(!result.limitations.includes('mock_not_live_inference'));
  await gateway.execute(user,body,ctx); assert.equal(calls,1);
  const conflict=await gateway.execute(user,{...body,locale:'en'},ctx); assert.equal(conflict.error.code,'idempotency_conflict');
  await gateway.execute({...user,userId:'10000000-0000-0000-0000-000000000002'},body,ctx); assert.equal(calls,2);
  assert.equal((await gateway.execute(null,body,ctx)).error.status,401);
});

test('failed provider retains unknown reservation; token overage records incurred bill rather than refunds', async () => {
  for (const variant of ['failed','over-limit','bad-ref','missing-usage']) {
    const client=rpcDouble();
    const gateway=createStagingGateway({config:config(),createClient:()=>client,transport:async()=>{
      if (variant==='failed') return new Response('secret-body',{status:503});
      const output=variant==='bad-ref'?{...feedback(),observations:[{text:'unsupported',evidenceRefs:['invented']}]}:feedback();
      return Response.json({model:'fixture-only-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],
        ...(variant==='missing-usage'?{}:{usage:{prompt_tokens:100,completion_tokens:variant==='over-limit'?801:50}})});
    }});
    const result=await gateway.execute(user,payload(),ctx);
    const settlement=client.calls.at(-1).args;
    if (variant==='missing-usage') assert.equal(result.usage.estimatedUsd,null);
    else assert.ok(result.error);
    if (['failed','missing-usage'].includes(variant)) assert.equal(settlement.p_actual_micro,null);
    else assert.ok(settlement.p_actual_micro>0);
    assert.ok(!JSON.stringify(result).includes('secret-body'));
  }
});

test('migration/workflow static guardrails (NOT SQL execution) remain explicit', async () => {
  const sql=await readFile(new URL('../supabase/migrations/202610300001_ai_usage_ledger.sql',import.meta.url),'utf8');
  for (const text of ['for update','enable row level security','unique(user_id, idempotency_key)','global_total_micro','greatest(charged_micro,reserved_micro)','on delete set null']) assert.ok(sql.includes(text),text);
  const workflow=await readFile(new URL('../.github/workflows/ai-staging.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('workflow_dispatch:'));
  assert.ok(workflow.includes('environment: ai-staging'));
  assert.ok(workflow.includes('AI_BACKEND_MODE=disabled'));
  assert.ok(workflow.includes('functions deploy ai-gateway --use-api --project-ref'));
  assert.ok(!workflow.includes('--no-verify-jwt'));
  assert.ok(!workflow.includes('  push:'));
});