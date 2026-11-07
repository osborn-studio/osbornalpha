// src/lib/dq/reconcile/run.test.ts
import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import type {Row,TableClient} from '../../db/table-client';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {FactsDbError} from '../../facts/types';
import type {FactsDb,Market} from '../../facts/types';
import {memoryRawStore} from '../raw-store';
import {ReconcileConfigError} from './pair-support';
import type {RegisteredPair} from './pair-support';
import {CURSOR_TABLE,CYCLE_TABLE,MIN_MEMBER_MS,runReconcile} from './run';
import type {ReconcileDeps} from './run';
import {reconcileTables,seedPublished} from './testing';
import type {CyclePairId,MemberPlan,ReconcileResultInput} from './types';

const PAIR:CyclePairId='us.companyfacts_vs_gold';
const T0='2026-11-05T02:00:00.000Z';
const rec=(nk:string,over:Partial<ReconcileResultInput>={}):ReconcileResultInput=>({natural_key:nk,kind:'numeric',outcome:'compared',passed:true,left_value:'1',right_value:'1',abs_diff:'0',rel_diff:'0',tolerance:'0',left_source:'l',right_source:'r',detail:{},action:'record',...over});
const miss=(nk:string)=>rec(nk,{outcome:'right_missing',passed:false,right_value:null,left_value:null,abs_diff:null,rel_diff:null});
const keys=(...nks:string[])=>nks.map(naturalKey=>({naturalKey,locator:{}}));
function stubPair(members:MemberPlan[],evaluate:(m:MemberPlan)=>Promise<ReconcileResultInput[]>|ReconcileResultInput[]):RegisteredPair{
 return {id:PAIR,kind:'numeric',left:'l',right:'r',inputs:{repoFile:null,parserVersion:'stub/1',goldSchema:null},currentRight:async()=>null,members:async()=>members,evaluate:async(_ctx,m)=>evaluate(m)};
}
function harness(pair:RegisteredPair,over:Partial<ReconcileDeps>={}){
 const tables=reconcileTables();const db=memoryFactsDb(tables);let clock=T0;db.setNow(clock);
 const materialize=vi.fn<(db:FactsDb,issuer:string,market:string)=>Promise<unknown>>(async()=>({rows:0,stateRev:0,retried:false}));
 const deps:ReconcileDeps={db,tables,raw:memoryRawStore(),fetch:(async()=>{throw new Error('no network');}) as unknown as typeof fetch,
  readRepoFile:async()=>{throw new Error('no repo files');},now:()=>new Date(clock),deadline:null,codeVersion:'test',pairs:{[PAIR]:pair},materialize,...over};
 const advance=(ms:number)=>{clock=new Date(Date.parse(clock)+ms).toISOString();db.setNow(clock);};
 return {tables,db,deps,materialize,advance};
}
const A='00000000-0000-4000-8000-00000000000a',B='00000000-0000-4000-8000-00000000000b';
const freshness=(t:TableClient)=>t.select('dq_freshness',{dataset:`reconcile.${PAIR}`}).then(r=>r[0]);
const cursors=(t:TableClient)=>t.select(CURSOR_TABLE,{pair:PAIR},{orderBy:'issuer_id'});

describe('runReconcile — cycle, counts, settlement',()=>{
 it('creates a frozen cycle, applies one result per key, maps batch counts, materializes once and settles with gaps',async()=>{
  const pairRef:{p?:RegisteredPair}={};   // the stub needs the seeded fact_id, known only after harness() created the db
  const h=harness({...stubPair([],()=>[]),members:async c=>pairRef.p!.members(c),evaluate:async(c,m)=>pairRef.p!.evaluate(c,m)});
  const seeded=await seedPublished(h.db,{issuer:A,market:'US',sourceRef:'acc-a',availableDate:'2024-02-01',facts:[{concept:'revenue',value:'100',period_start:'2023-01-01',period_end:'2023-12-31'}]});
  const [fact]=await h.db.factsByIds(seeded.factIds);
  pairRef.p=stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2','k3')}],()=>[
   rec('k1'),
   rec('k2',{passed:false,left_value:'100',right_value:'101',abs_diff:'1',rel_diff:'0.0099009901',action:'quarantine_left',left_fact_id:fact.fact_id,inputs_hash:'h2',
    item:{natural_key:`${PAIR}:k2:${fact.fact_id}`,payload:{key:{issuer_id:A,market:'US',concept:'revenue'},fact_ids:[fact.fact_id],left_value:'100',right_value:'101',right_locator:{}},detail:{pair:PAIR,inputs_hash:'h2',issuer_id:A,market:'US'}}}),
   miss('k3'),
  ]);
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'script'});
  expect(r.counts).toEqual({fetched:3,inserted:1,duplicates:0,versioned:0,quarantined:1,failed:1});
  expect(r.status).toBe('partial');
  expect(r.errors).toContainEqual({code:'outcome_summary',message:'{"right_missing":1}'});
  expect(r.cycle).toMatchObject({created:true,settled:true,status:'complete_with_gaps',expectedTotal:3});
  expect(r.members).toEqual([{issuerId:A,market:'US',outcome:'done',counts:{compared_passed:1,compared_failed:1,not_compared:1}}]);
  const [cycle]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect(cycle).toMatchObject({status:'complete_with_gaps',expected_total:3,compared_passed:1,compared_failed:1,not_compared:1,exec_failed_members:0});
  expect(cycle.members).toEqual([{issuer_id:A,market:'US',expected_keys:keys('k1','k2','k3')}]);
  expect(String(cycle.cycle_id)).toMatch(/^us\.companyfacts_vs_gold-2026-11-05-[0-9a-f]{8}$/);
  expect(await h.tables.select('dq_reconciliations',{cycle_id:cycle.cycle_id})).toHaveLength(3);
  expect(h.db.facts().find(f=>f.fact_id===fact.fact_id)?.status).toBe('quarantined');
  expect(h.materialize).toHaveBeenCalledTimes(1);expect(h.materialize).toHaveBeenCalledWith(h.db,A,'US');
  const [item]=await h.tables.select('dq_quarantine',{reason_code:'reconcile_mismatch'});
  expect((item.detail as {hook:{state:string}}).hook.state).toBe('done');
  const [batch]=await h.tables.select('ingest_batches',{batch_id:r.batchId});
  expect(batch).toMatchObject({producer:'reconcile',dataset:`reconcile.${PAIR}`,status:'partial'});
  expect(batch.tool_versions).toMatchObject({pair:PAIR,cycle_id:cycle.cycle_id,parser:'stub/1',gold_schema:'',sample_sha256:'',code_version:'test'});
  expect(await freshness(h.tables)).toMatchObject({expected_cadence:'weekly',consecutive_errors:1,last_ok_at:null});
 });
 it('a cycle whose mismatches all went to items is complete and records freshness ok',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[rec('k1',{passed:false,left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',action:'review_item',item:{natural_key:`${PAIR}:k1:x`,payload:{fact_ids:[]},detail:{pair:PAIR,issuer_id:A,market:'US'}}})]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.cycle).toMatchObject({settled:true,status:'complete'});
  expect(r.counts).toMatchObject({fetched:1,quarantined:1,failed:0});
  expect(await freshness(h.tables)).toMatchObject({expected_cadence:'weekly',consecutive_errors:0,status:'fresh'});
 });
 it('R2 regression: a cycle whose keys are all not compared is complete_with_gaps and freshness ok:false',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2')}],()=>[miss('k1'),rec('k2',{outcome:'incomplete_gold',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null})]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.cycle).toMatchObject({settled:true,status:'complete_with_gaps'});
  expect(r.counts).toMatchObject({fetched:2,inserted:0,failed:2});
  expect(await freshness(h.tables)).toMatchObject({consecutive_errors:1});
 });
 it('an empty pair settles a zero-member cycle as complete',async()=>{
  const h=harness(stubPair([],()=>[]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r).toMatchObject({status:'success',cycle:{settled:true,status:'complete',expectedTotal:0},members:[]});
 });
 it('a concurrent creator wins: openReconcileCycle returns its running cycle (created false) and the winner is used',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],m=>m.issuerId===B?[rec('w1')]:[rec('k1')]));
  const real=h.db.openReconcileCycle.bind(h.db);let raced=false;
  const racing:FactsDb={...h.db,openReconcileCycle:async i=>{
   if(!raced){raced=true;await real({...i,cycleId:'winner',members:[{issuer_id:B,market:'US',expected_keys:keys('w1')}],pending:[]});}   // the other runner commits first
   return real(i);}};
  const r=await runReconcile({...h.deps,db:racing},{pair:PAIR,triggeredBy:'cron'});
  expect(r.cycle).toMatchObject({cycleId:'winner',created:false});
  expect(r.members.map(m=>m.issuerId)).toEqual([B]);
  expect(await h.tables.select(CYCLE_TABLE,{pair:PAIR})).toHaveLength(1);
 });
 // ---- pending members (plan audit Q2): keys resolved after the snapshot; only snapshot entries consumed; atomic creation
 const EB={issuer_id:B,market:'US' as const,source:'src-b'};
 const oldCycle=(pending:unknown[])=>({pair:PAIR,cycle_id:'old',started_at:'2026-11-01T00:00:00.000Z',finished_at:'2026-11-01T01:00:00.000Z',members:[],status:'complete',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{pending_members:pending}});
 const pendingPair=(o:{members?:()=>Promise<MemberPlan[]>}={})=>{
  const memberFor=vi.fn(async(_c:unknown,issuerId:string,market:Market):Promise<MemberPlan>=>({issuerId,market,expectedKeys:keys('b1')}));
  const base=stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],m=>m.issuerId===A?[rec('k1')]:[rec('b1')]);
  return {pair:{...base,...(o.members?{members:o.members}:{}),memberFor} as RegisteredPair,memberFor};
 };
 const pendingOfOld=async(t:TableClient)=>((await t.select(CYCLE_TABLE,{pair:PAIR,cycle_id:'old'}))[0].detail as {pending_members:unknown[];pending_consumed_by?:string});
 it('a pending target that members() missed gets its keys from memberFor before freezing (never a zero-key placeholder); its entry is consumed',async()=>{
  const {pair,memberFor}=pendingPair();const h=harness(pair);
  await h.tables.insert(CYCLE_TABLE,oldCycle([EB]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  const [fresh]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:r.cycle!.cycleId});
  expect(fresh.members).toEqual([{issuer_id:A,market:'US',expected_keys:keys('k1')},{issuer_id:B,market:'US',expected_keys:keys('b1')}]);
  expect(fresh).toMatchObject({expected_total:2,detail:{pending_merged_from:['old'],pending_transferred:[EB]}});
  expect(memberFor).toHaveBeenCalledTimes(1);
  expect(await pendingOfOld(h.tables)).toEqual({pending_members:[],pending_consumed_by:r.cycle!.cycleId});
  expect(r.members.map(m=>[m.issuerId,m.outcome])).toEqual([[A,'done'],[B,'done']]);
  expect(r.cycle).toMatchObject({settled:true,status:'complete'});
 });
 for(const when of ['while members() runs','after members(), before openReconcileCycle'] as const){
  it(`interleaving: a merge registered ${when} (after the snapshot) is neither lost nor frozen with zero keys; the next cycle takes it with resolved keys`,async()=>{
   let h:ReturnType<typeof harness>;let landed=false;
   const land=async()=>{if(landed)return;landed=true;const d=await pendingOfOld(h.tables);await h.tables.update(CYCLE_TABLE,{pair:PAIR,cycle_id:'old'},{detail:{...d,pending_members:[...d.pending_members,EB]}});};   // set_merge commits here
   const {pair,memberFor}=pendingPair(when==='while members() runs'?{members:async()=>{await land();return [{issuerId:A,market:'US',expectedKeys:keys('k1')}];}}:{});
   h=harness(pair);
   await h.tables.insert(CYCLE_TABLE,oldCycle([]));
   const real=h.db.openReconcileCycle.bind(h.db);
   const db:FactsDb={...h.db,openReconcileCycle:async i=>{if(when!=='while members() runs')await land();return real(i);}};
   const r1=await runReconcile({...h.deps,db},{pair:PAIR,triggeredBy:'cron'});
   const [c1]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:r1.cycle!.cycleId});
   expect(c1.members).toEqual([{issuer_id:A,market:'US',expected_keys:keys('k1')}]);
   expect(memberFor).not.toHaveBeenCalled();
   expect((await pendingOfOld(h.tables)).pending_members).toEqual([EB]);                  // still pending: not overwritten, not consumed
   expect(r1.cycle).toMatchObject({settled:true});
   h.advance(60_000);
   const r2=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
   const [c2]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:r2.cycle!.cycleId});
   expect(c2.members).toEqual([{issuer_id:A,market:'US',expected_keys:keys('k1')},{issuer_id:B,market:'US',expected_keys:keys('b1')}]);
   expect(memberFor).toHaveBeenCalledTimes(1);
   expect((await pendingOfOld(h.tables)).pending_members).toEqual([]);
  });
 }
 it('crash recovery: dying before openReconcileCycle commits leaves pending intact; dying right after it leaves the cycle and every cursor, and the next run uses them without consuming again',async()=>{
  const {pair,memberFor}=pendingPair();const h=harness(pair);
  await h.tables.insert(CYCLE_TABLE,oldCycle([EB]));
  const dead:FactsDb={...h.db,openReconcileCycle:async()=>{throw new Error('connection reset');}};
  await expect(runReconcile({...h.deps,db:dead},{pair:PAIR,triggeredBy:'cron'})).rejects.toThrow('connection reset');
  expect(await h.tables.select(CYCLE_TABLE,{pair:PAIR})).toHaveLength(1);
  expect(await cursors(h.tables)).toEqual([]);
  expect((await pendingOfOld(h.tables)).pending_members).toEqual([EB]);
  const real=h.db.openReconcileCycle.bind(h.db);
  const late:FactsDb={...h.db,openReconcileCycle:async i=>{await real(i);throw new Error('worker killed');}};
  await expect(runReconcile({...h.deps,db:late},{pair:PAIR,triggeredBy:'cron'})).rejects.toThrow('worker killed');
  const running=await h.tables.select(CYCLE_TABLE,{pair:PAIR,status:'running'});
  expect(running).toHaveLength(1);
  expect((await cursors(h.tables)).map(c=>[c.issuer_id,c.state])).toEqual([[A,'pending'],[B,'pending']]);
  expect(await pendingOfOld(h.tables)).toEqual({pending_members:[],pending_consumed_by:running[0].cycle_id});
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.cycle).toMatchObject({cycleId:running[0].cycle_id,created:false,settled:true,status:'complete'});
  expect(memberFor).toHaveBeenCalledTimes(2);                                               // once per creation attempt, never for the existing cycle
 });
});

describe('runReconcile — fences, failures, budget',()=>{
 it('fence_failed stops the worker; after the lease expires the next worker reuses the committed key',async()=>{
  const pair=stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2')}],m=>m.expectedKeys.map(k=>rec(k.naturalKey)));   // honours the missing-key subset (P5)
  const h=harness(pair);
  let calls=0;
  const flaky:FactsDb={...h.db,applyReconcileResult:async(f,r)=>{calls++;if(calls===2)throw new FactsDbError('fence_failed');return h.db.applyReconcileResult(f,r);}};
  const r1=await runReconcile({...h.deps,db:flaky},{pair:PAIR,triggeredBy:'cron'});
  expect(r1.members).toEqual([{issuerId:A,market:'US',outcome:'fence_lost'}]);
  expect(r1.errors).toContainEqual({code:'fence_failed',key:`${A}:US`});
  expect(r1.cycle).toMatchObject({settled:false,status:'running'});
  const r2=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});   // lease still held: nothing claimable
  expect(r2.members).toEqual([]);
  h.advance(11*60_000);
  const r3=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r3.members[0]).toMatchObject({outcome:'done',counts:{compared_passed:2,compared_failed:0,not_compared:0}});
  expect(r3.counts).toMatchObject({fetched:2,duplicates:1,inserted:1});
  const [cycle]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect(await h.tables.select('dq_reconciliations',{cycle_id:cycle.cycle_id})).toHaveLength(2);
  expect(r3.cycle).toMatchObject({settled:true,status:'complete'});
 });
 it('T2 / plan audit P5: a worker that dies after committing every key is completed from the accepted rows — no re-evaluation, even with the upstream down',async()=>{
  let calls=0;
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2')}],()=>{calls++;if(calls>1)throw new Error('sec_unavailable:http_503');return [rec('k1'),rec('k2')];}));
  const dying:FactsDb={...h.db,completeReconcileMember:async()=>{throw new Error('worker_killed');},failReconcileMember:async()=>{throw new Error('worker_killed');}};
  await expect(runReconcile({...h.deps,db:dying},{pair:PAIR,triggeredBy:'cron'})).rejects.toThrow('worker_killed');   // both keys committed, nothing completed
  expect((await cursors(h.tables))[0]).toMatchObject({state:'claimed',attempts:1});
  h.advance(11*60_000);                                                                                                 // the lease expires
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(calls).toBe(1);                                                                                                // the upstream is never asked again
  expect(r.members).toEqual([{issuerId:A,market:'US',outcome:'done',counts:{compared_passed:2,compared_failed:0,not_compared:0}}]);
  expect(r.counts).toMatchObject({fetched:2,duplicates:2,inserted:0,failed:0});
  expect(r.cycle).toMatchObject({settled:true,status:'complete'});
  const [cycle]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect(await h.tables.select('dq_reconciliations',{cycle_id:cycle.cycle_id})).toHaveLength(2);
 });
 it('evaluate failures are retried up to three attempts, then the member is terminal and the cycle settles with gaps',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>{throw new Error('sec_unavailable:http_503');}));
  for(let i=1;i<=3;i++){
   const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
   expect(r.members).toEqual([{issuerId:A,market:'US',outcome:'failed',code:'exception:sec_unavailable:http_503'}]);
   expect(r.counts.failed).toBe(1);
   expect((await cursors(h.tables))[0]).toMatchObject({state:'failed',attempts:i});
   expect(r.cycle?.settled).toBe(i===3);
  }
  const [cycle]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect(cycle).toMatchObject({status:'complete_with_gaps',exec_failed_members:1});
  const r4=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});   // a new cycle starts after settlement
  expect(r4.cycle).toMatchObject({created:true});
 });
 it('an evaluate that does not return one result per expected key in order is a member failure (evaluate_contract)',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2')}],()=>[rec('k2'),rec('k1')]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.members[0]).toMatchObject({outcome:'failed',code:'evaluate_contract'});
  expect(await h.tables.select('dq_reconciliations',{})).toHaveLength(0);
 });
 it('does not start a member with less than 60 s of budget (deadline_hit, informational)',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[rec('k1')]));
  const r=await runReconcile({...h.deps,deadline:new Date(Date.parse(T0)+MIN_MEMBER_MS-1000)},{pair:PAIR,triggeredBy:'cron'});
  expect(r.members).toEqual([{issuerId:A,market:'US',outcome:'not_started'}]);
  expect(r.errors).toEqual([{code:'deadline_hit',key:`${A}:US`}]);
  expect(r.status).toBe('success');
  expect((await cursors(h.tables))[0]).toMatchObject({state:'pending',attempts:0});
 });
 it('issuerIds restricts which members are processed; settlement refuses a done cursor with null counts (S5)',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('a1')},{issuerId:B,market:'US',expectedKeys:keys('b1')}],m=>[rec(m.issuerId===A?'a1':'b1')]));
  const r1=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'script',issuerIds:[A]});
  expect(r1.members.map(m=>m.issuerId)).toEqual([A]);expect(r1.cycle?.settled).toBe(false);
  await h.tables.update(CURSOR_TABLE,{pair:PAIR,issuer_id:A},{compared_passed:null});
  const r2=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'script',issuerIds:[B]});
  expect(r2.errors).toContainEqual(expect.objectContaining({code:'cursor_unaccounted',key:`${A}:US`}));
  expect(r2.cycle).toMatchObject({settled:false,status:'running'});
  expect(await freshness(h.tables)).toBeUndefined();
 });
 it('a config error refuses the run: batch failed with the code, no cycle',async()=>{
  const h=harness({...stubPair([],()=>[]),members:async()=>{throw new ReconcileConfigError('invalid_gold_file','entries');}});
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r).toMatchObject({status:'failed',cycle:null});
  expect(r.errors).toEqual([{code:'invalid_gold_file',message:'entries'}]);
  expect(await h.tables.select(CYCLE_TABLE,{pair:PAIR})).toEqual([]);
 });
 it('an unregistered pair is refused before any write',async()=>{
  const h=harness(stubPair([],()=>[]));
  await expect(runReconcile({...h.deps,pairs:{}},{pair:PAIR,triggeredBy:'cron'})).rejects.toMatchObject({code:'pair_not_registered'});
  expect(await h.tables.select('ingest_batches',{})).toEqual([]);
 });
});

describe('runReconcile — hooks and dry run',()=>{
 it('materializes pending/failed hooks of open mismatch items of THIS pair first, at the merge target',async()=>{
  const h=harness(stubPair([],()=>[]));
  const T='00000000-0000-4000-8000-0000000000ff';
  await h.tables.insert('issuers',{issuer_id:A,status:'merged',merged_into:T});
  const item=(pair:string,state:string)=>({id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`${pair}:k:${randomUUID()}`,reason_code:'reconcile_mismatch',detail:{pair,issuer_id:A,market:'US',hook:{stage:'materialize',state,at:T0}},payload:{fact_ids:[]},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:T0});
  const mine=item(PAIR,'pending'),failed=item(PAIR,'failed'),done=item(PAIR,'done'),other=item('us.companyfacts_vs_ixbrl','pending');
  for(const i of [mine,failed,done,other])await h.tables.insert('dq_quarantine',i);
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.hooks).toEqual({retried:2,failed:0});
  expect(h.materialize).toHaveBeenCalledTimes(1);expect(h.materialize).toHaveBeenCalledWith(h.db,T,'US');
  const state=async(id:string)=>((await h.tables.select('dq_quarantine',{id}))[0].detail as {hook:{state:string}}).hook.state;
  expect([await state(mine.id),await state(failed.id),await state(done.id),await state(other.id)]).toEqual(['done','done','done','pending']);
 });
 it('plan audit P4: a hook write patches only detail.hook — a newer latest_result committed right before it survives',async()=>{
  const h=harness(stubPair([],()=>[]));
  const id=randomUUID();
  await h.tables.insert('dq_quarantine',{id,dataset:'facts.us',table_name:'financial_facts',natural_key:`${PAIR}:k:p4`,reason_code:'reconcile_mismatch',detail:{pair:PAIR,issuer_id:A,market:'US',latest_result:{passed:false,reconciliation_id:'r1'},hook:{stage:'materialize',state:'pending',at:T0}},payload:{},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:T0});
  // a concurrent apply_reconcile_result commits a newer result just before our hook write; the old read-then-replace wrote its stale copy back
  const newer=async()=>{const [cur]=await h.tables.select('dq_quarantine',{id});await h.tables.update('dq_quarantine',{id},{detail:{...(cur.detail as Row),latest_result:{passed:true,reconciliation_id:'r2'}}});};
  let fired=false;
  const racing:TableClient={...h.tables,
   async update(t,m,p){if(t==='dq_quarantine'&&'detail' in p&&!fired){fired=true;await newer();}return h.tables.update(t,m,p);},
   async rpc(fn,a){if(fn==='patch_quarantine_detail'&&!fired){fired=true;await newer();}return h.tables.rpc(fn,a);}};
  const r=await runReconcile({...h.deps,tables:racing},{pair:PAIR,triggeredBy:'cron'});
  expect(r.hooks).toEqual({retried:1,failed:0});
  const [row]=await h.tables.select('dq_quarantine',{id});
  expect(row.detail).toMatchObject({latest_result:{passed:true,reconciliation_id:'r2'},hook:{stage:'done',state:'done'}});
 });
 it('a materialize failure leaves the hook failed and reports materialize_error (visibility already committed)',async()=>{
  const h=harness(stubPair([],()=>[]),{materialize:async()=>{throw new FactsDbError('stale_computation');}});
  await h.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`${PAIR}:k:x`,reason_code:'reconcile_mismatch',detail:{pair:PAIR,issuer_id:A,market:'US',hook:{stage:'materialize',state:'pending',at:T0}},payload:{},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:T0});
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.hooks).toEqual({retried:1,failed:1});
  expect(r.errors).toContainEqual(expect.objectContaining({code:'materialize_error',message:'stale_computation'}));
  expect(r.status).toBe('failed');   // nothing landed and a non-informational error
 });
 it('dry run evaluates without batch, cycle or result rows',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')},{issuerId:B,market:'US',expectedKeys:keys('k2')}],m=>[rec(m.expectedKeys[0].naturalKey)]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'script',dryRun:true,issuerIds:[B]});
  expect(r).toMatchObject({status:'dry_run',batchId:null,cycle:null});
  expect(r.dryRun).toEqual([{issuerId:B,market:'US',results:[rec('k2')]}]);
  expect(await h.tables.select('ingest_batches',{})).toEqual([]);
  expect(await h.tables.select(CYCLE_TABLE,{})).toEqual([]);
 });
});

describe('runReconcile — review P1/P2 (hook CAS, durable freshness)',()=>{
 it('P1: a restore that commits a newer pending hook while the runner materializes wins — the runner done-write is stale and the hook stays pending',async()=>{
  const id=randomUUID();let h:ReturnType<typeof harness>;
  h=harness(stubPair([],()=>[]),{materialize:async()=>{
   const [cur]=await h.tables.select('dq_quarantine',{id});
   await h.tables.update('dq_quarantine',{id},{detail:{...(cur.detail as Row),hook:{stage:'materialize',state:'pending',at:'2026-11-05T03:00:00.000Z'}}});   // a restore commits a newer hook
   return {rows:0,stateRev:0,retried:false};}});
  await h.tables.insert('dq_quarantine',{id,dataset:'facts.us',table_name:'financial_facts',natural_key:`${PAIR}:k:cas`,reason_code:'reconcile_mismatch',detail:{pair:PAIR,issuer_id:A,market:'US',hook:{stage:'materialize',state:'pending',at:T0}},payload:{},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:T0});
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  const [row]=await h.tables.select('dq_quarantine',{id});
  expect((row.detail as {hook:Row}).hook).toMatchObject({state:'pending',at:'2026-11-05T03:00:00.000Z'});
  expect(r.errors).toContainEqual({code:'skipped_summary',key:`${id}:hook_stale`});
 });
 const failingFreshness=(t:TableClient,state:{fail:boolean}):TableClient=>({...t,
  async rpc(fn,a){if(fn==='record_cycle_freshness'&&state.fail)throw new Error('freshness_down');return t.rpc!(fn,a);}
  } as TableClient);
 it('P2: an interruption after the settling update (recordAttempt throws) leaves freshness pending; the next run start records it',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[miss('k1')]));
  const st={fail:true};
  const r1=await runReconcile({...h.deps,tables:failingFreshness(h.tables,st)},{pair:PAIR,triggeredBy:'cron'});
  expect(r1.cycle).toMatchObject({settled:true,status:'complete_with_gaps'});
  expect(await freshness(h.tables)).toBeUndefined();
  const [c1]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect((c1.detail as {freshness:Row}).freshness).toMatchObject({status:'pending',ok:false});
  st.fail=false;h.advance(60_000);
  await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron',issuerIds:[B]});   // processes nothing: only the replay can have written freshness
  expect(await freshness(h.tables)).toMatchObject({consecutive_errors:1});
  const [c2]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:c1.cycle_id});
  expect((c2.detail as {freshness:Row}).freshness).toMatchObject({status:'recorded'});
 });
 it('P2: two pending cycles are recorded oldest first, so two consecutive gaps give two errors',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[miss('k1')]));
  const cyc=(id:string,fin:string,fresh:boolean)=>({pair:PAIR,cycle_id:id,started_at:fin,finished_at:fin,members:[],status:'complete_with_gaps',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{freshness:{status:'pending',ok:fresh,detail:{cycle_id:id}}}});
  await h.tables.insert(CYCLE_TABLE,cyc('b-newer','2026-11-03T00:00:00.000Z',false));
  await h.tables.insert(CYCLE_TABLE,cyc('a-older','2026-11-01T00:00:00.000Z',false));
  await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron',issuerIds:[B]});
  expect(await freshness(h.tables)).toMatchObject({consecutive_errors:2});
  for(const id of ['a-older','b-newer']){const [c]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:id});expect((c.detail as {freshness:Row}).freshness.status).toBe('recorded');}
 });

 it('review: a pending_members entry registered while the cycle runs survives settlement (settle touches only detail.freshness)',async()=>{
  let h:ReturnType<typeof harness>;
  const entry={issuer_id:B,market:'US',source:'src-b'};
  h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],async()=>{   // set_merge commits during the member
   const [c]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,status:'running'});
   await h.tables.update(CYCLE_TABLE,{pair:PAIR,cycle_id:c.cycle_id},{detail:{...(c.detail as Row),pending_members:[entry]}});
   return [rec('k1')];}));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.cycle).toMatchObject({settled:true});
  const [c]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect(c.detail).toMatchObject({pending_members:[entry],freshness:{status:'recorded',ok:true}});
 });
 it('review: after a successful settle an older pending cycle is recorded first (ordered replay), not the new cycle directly',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[rec('k1')]));
  await h.tables.insert(CYCLE_TABLE,{pair:PAIR,cycle_id:'older',started_at:'2026-11-01T00:00:00.000Z',finished_at:'2026-11-01T00:00:00.000Z',members:[],status:'complete_with_gaps',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{freshness:{status:'pending',ok:false,detail:{}}}});
  let calls=0;
  const flaky:TableClient={...h.tables,async rpc(fn,a){if(fn==='record_cycle_freshness'&&calls++===0)throw new Error('freshness_down');return h.tables.rpc!(fn,a);}};
  const r=await runReconcile({...h.deps,tables:flaky},{pair:PAIR,triggeredBy:'cron'});   // run-start replay fails once; the post-settle replay must do older then new
  expect(r.cycle).toMatchObject({settled:true,status:'complete'});
  expect(await freshness(h.tables)).toMatchObject({consecutive_errors:0,status:'fresh'});   // old failure first, then the success
  const [o]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:'older'});
  expect((o.detail as {freshness:Row}).freshness.status).toBe('recorded');
 });
 it('review: an exception after startBatch closes the batch with code unknown and is rethrown',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[rec('k1')]));
  const broken:TableClient={...h.tables,async update(t,m,p){if(t==='ingest_batches'&&'tool_versions' in p)throw new Error('db_down');return h.tables.update(t,m,p);}};
  await expect(runReconcile({...h.deps,tables:broken},{pair:PAIR,triggeredBy:'cron'})).rejects.toThrow('db_down');
  const [b]=await h.tables.select('ingest_batches',{});
  expect(b.status).not.toBe('running');
  expect(JSON.stringify(b.errors)).toContain('"unknown"');
 });
 it('review: an unresolvable merge target fails only that hook (target_unresolved) and the member still completes',async()=>{
  const h=harness(stubPair([],()=>[]));
  const seeded=await seedPublished(h.db,{issuer:A,market:'US',sourceRef:'acc-a',availableDate:'2024-02-01',facts:[{concept:'revenue',value:'100',period_start:'2023-01-01',period_end:'2023-12-31'}]});
  const [fact]=await h.db.factsByIds(seeded.factIds);
  const pair=stubPair([{issuerId:A,market:'US',expectedKeys:keys('k2')}],()=>[rec('k2',{passed:false,left_value:'100',right_value:'101',abs_diff:'1',rel_diff:'0.01',action:'quarantine_left',left_fact_id:fact.fact_id,inputs_hash:'h',
   item:{natural_key:`${PAIR}:k2:${fact.fact_id}`,payload:{key:{issuer_id:A,market:'US',concept:'revenue'},fact_ids:[fact.fact_id],left_value:'100',right_value:'101',right_locator:{}},detail:{pair:PAIR,inputs_hash:'h',issuer_id:A,market:'US'}}})]);
  const broken:TableClient={...h.tables,async select(t,m,o){if(t==='issuers')throw new Error('issuers_down');return h.tables.select(t,m,o);}};
  const r=await runReconcile({...h.deps,tables:broken,pairs:{[PAIR]:pair}},{pair:PAIR,triggeredBy:'cron'});
  expect(r.members[0]).toMatchObject({outcome:'done'});
  expect(r.errors).toContainEqual(expect.objectContaining({code:'materialize_error',message:expect.stringContaining('target_unresolved')}));
  const [item]=await h.tables.select('dq_quarantine',{reason_code:'reconcile_mismatch'});
  expect((item.detail as {hook:{state:string;message:string}}).hook).toMatchObject({state:'failed',message:'target_unresolved'});
 });
});
