// POST/GET /api/macro/strategy/explanations through the real route, real handleExplainRequest, real productionLlmDeps
// (limiter, metering, quota.ts). Only the lowest layers are faked: the provider (chatResolved), the billing transport
// (admin rpc begin_usage_run / finalize_usage_run, the profile / usage reads checkQuota makes, the cost reservation) and
// storage (memory StrategyDb with injected failures). Plan Task 12 Codex round 1 (#1 subject case, #2 integration paths).
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {StrategyDbError,memoryStrategyDb,type StrategyDb} from '@/lib/macro/strategy/db';
import {memoryStrategyPort} from '@/lib/macro/strategy/port';
import {runReview} from '@/lib/macro/strategy/review';
import {daily,fixture,monthly,snap} from '@/lib/macro/strategy/testing/fixture';

const m=vi.hoisted(()=>({user:vi.fn(),chat:vi.fn(),rpc:vi.fn(),used:{n:0},db:null as unknown,port:null as unknown}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{getUser:m.user},from:(table:string)=>
 table==='profiles'
  ?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{plan:'free',role:null,plan_expires_at:null},error:null})})})}
  :{select:()=>{const q:Record<string,unknown>={};for(const f of ['eq','gte']){q[f]=()=>q;}q.lt=async()=>({count:m.used.n,error:null});return q;}}})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({rpc:m.rpc})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:()=>'abc123'}));
vi.mock('@/lib/macro/strategy/port',async(orig)=>({...await orig<typeof import('@/lib/macro/strategy/port')>(),strategyPort:()=>m.port}));
vi.mock('@/lib/macro/strategy/db',async(orig)=>({...await orig<typeof import('@/lib/macro/strategy/db')>(),supabaseStrategyDb:()=>m.db}));
vi.mock('@/lib/llm/resolve',()=>({resolveLlm:async()=>({provider:'deepseek',model:'deepseek-v4-flash',protocol:'openai',source:'env',baseUrl:'https://provider.invalid',apiKey:'k'})}));
vi.mock('@/lib/data/sources/llm',()=>({chatResolved:m.chat}));
vi.mock('@/lib/billing/cost-budget',async(orig)=>({...await orig<typeof import('@/lib/billing/cost-budget')>(),
 getBudgetConfig:()=>({dailyLimitMicrormb:8_800_000,usdCnyMicros:7_200_000,reservationTtlSeconds:60}),
 reserveCostBudget:async()=>({reservationId:'r1',reservedMicrormb:1000,markIncurred:async()=>{},finalizeIncurred:async()=>{},settle:async()=>({costMicrormb:300,usageEstimated:false}),release:async()=>{}})}));

import {GET as listExplanations,POST as postExplanation} from './explanations/route';

const USER='11111111-1111-4111-8111-111111111111',REQ='22222222-2222-4222-8222-222222222222';
const ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7','2.9']),...monthly('US_UNRATE','2026-09',['4.3'])];
const SNAP=snap('US','2026-10-15T06:00:00Z',ROWS.map(o=>o.observation_id));
const EVENTS=[...daily('US_FED_TARGET_UPPER_D',[['2025-12-11','3.75'],['2026-09-18','4']]),...daily('US_FED_TARGET_LOWER_D',[['2025-12-11','3.5'],['2026-09-18','3.75']])];
const VALID=JSON.stringify({points:[{fact_ids:['cov:counts'],hypothesis:'覆盖不全可能削弱该月读数的代表性'}]});
const INVALID=JSON.stringify({points:[{fact_ids:['no:such:fact'],hypothesis:'一个引用了不存在事实的假设'}]});
const USAGE={inputTokens:100,cacheHitInputTokens:10,cacheMissInputTokens:90,outputTokens:50,estimated:false};
const U='https://alpha.example/api/macro/strategy/explanations';
const post=(body:unknown)=>new Request(U,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const get=(id:string)=>new Request(`${U}?subject_kind=review&subject_id=${id}`);
const bodyOf=(rid:string,o:{locale?:'zh'|'en'}={})=>({request_id:REQ,subject:{kind:'review',id:rid},locale:o.locale??'zh'});

type MemDb=ReturnType<typeof memoryStrategyDb>;
/** Memory StrategyDb whose named methods throw once per queued failure (an rpc failure after the database state is unchanged). */
function failing(db:MemDb,queue:Partial<Record<keyof StrategyDb,number>>):MemDb{
 return new Proxy(db,{get(t,k){
  const v=Reflect.get(t,k) as unknown;
  if(typeof v!=='function')return v;
  return (...a:unknown[])=>{
   const left=queue[k as keyof StrategyDb]??0;
   if(left>0){queue[k as keyof StrategyDb]=left-1;return Promise.reject(new StrategyDbError('rpc_failed',`injected:${String(k)}`));}
   return (v as (...x:unknown[])=>unknown).apply(t,a);
  };
 }});
}
const rpcCalls=(fn:string)=>m.rpc.mock.calls.filter(c=>c[0]===fn).map(c=>c[1] as Record<string,unknown>);
let mem:MemDb,rid:string;

beforeEach(async()=>{
 vi.clearAllMocks();
 process.env.MACRO_STRATEGY_ENABLED='1';m.used.n=0;
 m.user.mockResolvedValue({data:{user:{id:USER}},error:null});
 m.rpc.mockResolvedValue({data:null,error:null});
 m.chat.mockResolvedValue({content:VALID,usage:USAGE});
 mem=memoryStrategyDb();mem._userId(USER);m.db=mem;
 m.port=memoryStrategyPort(fixture({snapshots:[SNAP],observations:[...ROWS,...EVENTS]}));
 rid=(await runReview({port:m.port as never,db:mem,codeVersion:'abc123'},'US','2026-10',{preview:false})).result_id!;
});
afterEach(()=>{delete process.env.MACRO_STRATEGY_ENABLED;});

describe('POST /explanations — real handler + production LlmDeps over a fake provider and billing transport',()=>{
 it('validation rejection is a completed call: 200 rejected, billed completed, evidence persisted, one provider call',async()=>{
  m.chat.mockResolvedValue({content:INVALID,usage:USAGE});
  const r=await postExplanation(post(bodyOf(rid)));
  expect(r.status).toBe(200);
  const p=await r.json() as {explanation_id:string;state:string;failure_codes:string[]};
  expect(p.state).toBe('rejected');expect(p.failure_codes.length).toBeGreaterThan(0);
  expect(m.chat).toHaveBeenCalledTimes(1);
  expect(rpcCalls('begin_usage_run')).toHaveLength(1);
  const fin=rpcCalls('finalize_usage_run');
  expect(fin).toHaveLength(1);
  expect(fin[0]).toMatchObject({p_idempotency_key:p.explanation_id,p_user_id:USER,p_feature:'perspectives',p_status:'completed',p_byo:false,
   p_input_tokens:100,p_output_tokens:50,p_cost_micrormb:300,p_usage_estimated:false});
  const run=mem._run(p.explanation_id);
  expect(run).toMatchObject({state:'rejected',finalized:true,raw_output:{content:INVALID,provider:'deepseek'},finalize_payload:{status:'completed',costMicrormb:300}});
 });

 it('finish failure: the call is still settled once; a POST replay finishes from the recorded output without a second provider call',async()=>{
  m.db=failing(mem,{finishExplanation:1});
  const first=await postExplanation(post(bodyOf(rid)));
  expect(first.status).toBe(500);
  expect(((await first.json()) as {error:{code:string}}).error.code).toBe('strategy_failed');
  const claimed=await mem.runOf(USER,REQ);
  expect(claimed).not.toBeNull();
  const id=claimed!.explanation_id;
  expect(mem._run(id)).toMatchObject({state:'running',finalized:true,raw_output:{content:VALID},finalize_payload:{status:'completed',costMicrormb:300}});
  expect(rpcCalls('finalize_usage_run')).toHaveLength(1);
  const replay=await postExplanation(post(bodyOf(rid)));
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({explanation_id:id,state:'accepted'});
  expect(mem._run(id)).toMatchObject({state:'accepted',finalized:true});
  expect(m.chat).toHaveBeenCalledTimes(1);                       // the provider was never called again
  expect(rpcCalls('begin_usage_run')).toHaveLength(1);
  expect(rpcCalls('finalize_usage_run')).toHaveLength(1);        // settled once, replay settles nothing new
  expect(rpcCalls('finalize_usage_run')[0].p_status).toBe('completed');
 });

 it('the same request id with a different payload is 409 payload_conflict and starts no second run',async()=>{
  expect((await postExplanation(post(bodyOf(rid)))).status).toBe(200);
  const r=await postExplanation(post(bodyOf(rid,{locale:'en'})));
  expect(r.status).toBe(409);
  expect(((await r.json()) as {error:{code:string}}).error.code).toBe('payload_conflict');
  expect(m.chat).toHaveBeenCalledTimes(1);
  expect(rpcCalls('begin_usage_run')).toHaveLength(1);
  expect(rpcCalls('finalize_usage_run')).toHaveLength(1);
 });

 it('platform quota exhausted is 429 quota_exceeded before any claim, usage run or provider call',async()=>{
  m.used.n=5;                                                    // free plan perspectives limit
  const r=await postExplanation(post(bodyOf(rid)));
  expect(r.status).toBe(429);
  expect(await r.json()).toEqual({error:{code:'quota_exceeded',message:'5/5'}});
  expect(m.chat).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
  expect(await mem.runOf(USER,REQ)).toBeNull();
 });
});

describe('review subject UUID case (Codex #1)',()=>{
 it('POST with an uppercase UUID stores the lowercase subject; GET finds it with either spelling',async()=>{
  const upper=rid.toUpperCase();
  expect(upper).not.toBe(rid);
  const r=await postExplanation(post(bodyOf(upper)));
  expect(r.status).toBe(200);
  const p=await r.json() as {explanation_id:string;subject_id:string};
  expect(p.subject_id).toBe(rid);
  for(const id of [upper,rid]){
   const list=await listExplanations(get(id));
   expect(list.status).toBe(200);
   expect(((await list.json()) as {items:{explanation_id:string}[]}).items.map(i=>i.explanation_id)).toEqual([p.explanation_id]);
  }
  expect(m.chat).toHaveBeenCalledTimes(1);
 });
 it('a replay with the other spelling of the UUID is the same payload (200, no conflict, no second call)',async()=>{
  expect((await postExplanation(post(bodyOf(rid.toUpperCase())))).status).toBe(200);
  const replay=await postExplanation(post(bodyOf(rid)));
  expect(replay.status).toBe(200);
  expect(m.chat).toHaveBeenCalledTimes(1);
 });
});
