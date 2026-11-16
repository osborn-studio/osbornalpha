// src/lib/macro/strategy/reconcile.test.ts
// reconcile.ts (plan audit R2-4) over a fake client whose finalize is the REAL finalizeUsageRun wrapper on a stubbed admin
// rpc, so the test pins the wrapper's error mapping the runbook relies on (P0002 or a transient error →
// usage_audit_unavailable, 55000 → usage_audit_invariant) and shows why the usage_events lookup, not that error, decides.
import {beforeEach,describe,expect,it,vi} from 'vitest';

const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({rpc:m.rpc})}));

import {finalizeUsageRun,type RecordUsageMeta} from '@/lib/billing/quota';
import {classifyUsageEvent,expectedUsageColumns,reconcileSettlements,type ReconcileClient,type RunCursor,type UnsettledRun,type UsageEventRow} from './reconcile';

const PAYLOAD={status:'completed',provider:'deepseek',model:'deepseek-chat',inputTokens:120,cacheHitInputTokens:20,cacheMissInputTokens:100,outputTokens:80,costMicrormb:900,
 pricingVersion:'p1',usdCnyMicros:7_100_000,usageEstimated:false,byo:false};
const row=(o:Partial<UsageEventRow>={}):UsageEventRow=>({status:'completed',provider:'deepseek',model:'deepseek-chat',input_tokens:120,cache_hit_input_tokens:20,cache_miss_input_tokens:100,
 output_tokens:80,cost_micrormb:'900',pricing_version:'p1',usd_cny_micros:'7100000',usage_estimated:false,byo:false,...o});
const run=(id:string,payload:Record<string,unknown>=PAYLOAD):UnsettledRun=>({claimed_at:'2026-11-01T00:00:00Z',explanation_id:id,user_id:'u1',usage_audit_key:id,state:'accepted',finalize_payload:payload});
const meta=(p:Record<string,unknown>)=>p as unknown as RecordUsageMeta;

/** Keyset over (claimed_at, explanation_id) among unfinalized rows, as the script's query does. */
function after(runs:UnsettledRun[],limit:number,cur:RunCursor|null):UnsettledRun[]{
 const key=(r:{claimed_at:string;explanation_id:string})=>`${r.claimed_at}|${r.explanation_id}`;
 return [...runs].sort((a,b)=>key(a)<key(b)?-1:1).filter(r=>!cur||key(r)>key(cur)).slice(0,limit);
}
function fakeClient(runs:UnsettledRun[],events:Record<string,UsageEventRow>,failLookup:string[]=[]){
 const marked:string[]=[];const finalized:{key:string;payload:Record<string,unknown>}[]=[];
 const c:ReconcileClient={
  unsettledRuns:async(limit,cur)=>after(runs.filter(r=>!marked.includes(r.explanation_id)),limit,cur),
  usageEvent:async key=>{if(failLookup.includes(key))throw new Error('lookup boom');return events[key]??null;},
  finalize:async(userId,key,payload)=>{finalized.push({key,payload});await finalizeUsageRun(userId,key,'perspectives',meta(payload));},
  markFinalized:async id=>{marked.push(id);},
 };
 return {c,marked,finalized};
}
beforeEach(()=>{m.rpc.mockReset();});

describe('the billing wrapper cannot classify a failed retry',()=>{
 it('usage run not found (P0002) and a transient error both surface as usage_audit_unavailable; a finalize conflict (55000) as usage_audit_invariant',async()=>{
  m.rpc.mockResolvedValue({data:null,error:{code:'P0002',message:'usage run not found'}});
  await expect(finalizeUsageRun('u1','k','perspectives',meta(PAYLOAD))).rejects.toThrow('usage_audit_unavailable');
  expect(m.rpc).toHaveBeenCalledTimes(3);
  m.rpc.mockReset();m.rpc.mockResolvedValue({data:null,error:{code:'08006',message:'connection failure'}});
  await expect(finalizeUsageRun('u1','k','perspectives',meta(PAYLOAD))).rejects.toThrow('usage_audit_unavailable');
  m.rpc.mockReset();m.rpc.mockResolvedValue({data:null,error:{code:'55000',message:'usage run finalize conflict'}});
  await expect(finalizeUsageRun('u1','k','perspectives',meta(PAYLOAD))).rejects.toThrow('usage_audit_invariant');
  expect(m.rpc).toHaveBeenCalledTimes(1);
 });
});

describe('classifyUsageEvent',()=>{
 it('absent / pending / settled / conflict; bigint strings and the wrapper defaults compare as the wrapper writes them',()=>{
  expect(classifyUsageEvent(null,PAYLOAD)).toBe('absent');
  expect(classifyUsageEvent(row({status:'pending'}),PAYLOAD)).toBe('pending');
  expect(classifyUsageEvent(row(),PAYLOAD)).toBe('settled');
  expect(classifyUsageEvent(row({status:'failed',usage_estimated:true}),PAYLOAD)).toBe('conflict');   // failed by fail_stale_usage_runs
  expect(classifyUsageEvent(row({cost_micrormb:901}),PAYLOAD)).toBe('conflict');
  const byo={status:'failed',provider:'openai',model:'gpt-x',byo:true};   // a begin-stage BYO payload: zero usage, wrapper defaults
  expect(expectedUsageColumns(byo)).toMatchObject({input_tokens:0,cache_miss_input_tokens:0,cost_micrormb:0,pricing_version:null,usd_cny_micros:null,usage_estimated:false});
  expect(classifyUsageEvent(row({status:'failed',provider:'openai',model:'gpt-x',input_tokens:0,cache_hit_input_tokens:0,cache_miss_input_tokens:0,output_tokens:0,cost_micrormb:0,
   pricing_version:null,usd_cny_micros:null,byo:true}),byo)).toBe('settled');
 });
});

describe('reconcileSettlements',()=>{
 it('a dry run reads only',async()=>{
  const f=fakeClient([run('a'),run('b')],{b:row({status:'pending'})});
  expect((await reconcileSettlements(f.c,{apply:false,limit:10})).map(l=>[l.explanation_id,l.class,l.action])).toEqual([['a','absent','dry_run'],['b','pending','dry_run']]);
  expect(f.marked).toEqual([]);expect(f.finalized).toEqual([]);expect(m.rpc).not.toHaveBeenCalled();
 });
 it('apply: absent and settled are marked without a finalize; pending is finalized verbatim through the wrapper, then marked; conflict is left for review',async()=>{
  m.rpc.mockResolvedValue({data:[{id:'x',status:'completed'}],error:null});
  const f=fakeClient([run('absent'),run('settled'),run('pending'),run('conflict')],{settled:row(),pending:row({status:'pending'}),conflict:row({status:'failed',usage_estimated:true})});
  const out=await reconcileSettlements(f.c,{apply:true,limit:10});
  expect(out.map(l=>[l.explanation_id,l.class,l.action])).toEqual([['absent','absent','marked'],['conflict','conflict','left_for_review'],['pending','pending','finalized_and_marked'],['settled','settled','marked']]);   // keyset order: claimed_at tie → explanation_id
  expect(f.finalized).toEqual([{key:'pending',payload:PAYLOAD}]);
  expect(m.rpc).toHaveBeenCalledTimes(1);
  expect(m.rpc).toHaveBeenCalledWith('finalize_usage_run',expect.objectContaining({p_idempotency_key:'pending',p_user_id:'u1',p_feature:'perspectives',p_cost_micrormb:900,
   p_pricing_version:'p1',p_usd_cny_micros:7_100_000,p_status:'completed'}));
  expect(f.marked).toEqual(['absent','pending','settled']);
 });
 it('a pending row whose finalize still fails stays unmarked with the wrapper code',async()=>{
  m.rpc.mockResolvedValue({data:null,error:{code:'08006',message:'connection failure'}});
  const f=fakeClient([run('p1')],{p1:row({status:'pending'})});
  expect(await reconcileSettlements(f.c,{apply:true,limit:5})).toEqual([{explanation_id:'p1',usage_audit_key:'p1',state:'accepted',class:'pending',action:'finalize_failed',error:'usage_audit_unavailable'}]);
  expect(f.marked).toEqual([]);
 });
 it('progress past a full batch of conflicts: limit is the page size, later rows are still reached',async()=>{
  const conflict=row({status:'failed',usage_estimated:true});
  const runs=[run('c1'),run('c2'),run('c3'),run('z-absent'),run('z-settled')];
  const f=fakeClient(runs,{c1:conflict,c2:conflict,c3:conflict,'z-settled':row()});
  const out=await reconcileSettlements(f.c,{apply:true,limit:2});
  expect(out.map(l=>[l.explanation_id,l.action])).toEqual([['c1','left_for_review'],['c2','left_for_review'],['c3','left_for_review'],['z-absent','marked'],['z-settled','marked']]);
  expect(f.marked).toEqual(['z-absent','z-settled']);
  // a second invocation sees the same conflicts first and still terminates
  expect((await reconcileSettlements(f.c,{apply:true,limit:1})).map(l=>l.action)).toEqual(['left_for_review','left_for_review','left_for_review']);
 });
 it('keyset ties on claimed_at are broken by explanation_id (no row skipped or repeated across page edges)',async()=>{
  const f=fakeClient([run('b'),run('a'),run('c')],{});
  expect((await reconcileSettlements(f.c,{apply:false,limit:1})).map(l=>l.explanation_id)).toEqual(['a','b','c']);
 });
 it('receipts survive a later lookup failure; the failing row is lookup_failed and the rest are still processed',async()=>{
  const f=fakeClient([run('a'),run('b'),run('c')],{},['b']);
  const seen:string[]=[];
  const out=await reconcileSettlements(f.c,{apply:true,limit:10},l=>{seen.push(`${l.explanation_id}:${l.action}`);});
  expect(seen).toEqual(['a:marked','b:lookup_failed','c:marked']);
  expect(out[1]).toMatchObject({class:'unknown',action:'lookup_failed',error:'lookup boom'});
  expect(f.marked).toEqual(['a','c']);
 });
 it('lines are emitted before a later page fails',async()=>{
  const f=fakeClient([run('a'),run('b')],{});
  const c:ReconcileClient={...f.c,unsettledRuns:async(l,cur)=>{if(cur)throw new Error('page 2 down');return f.c.unsettledRuns(l,cur);}};
  const seen:string[]=[];
  await expect(reconcileSettlements(c,{apply:true,limit:1},l=>{seen.push(l.explanation_id);})).rejects.toThrow('page 2 down');
  expect(seen).toEqual(['a']);
 });
});
