// src/lib/judgments/produce.test.ts
// spec §6.4 produce + §15 acceptance example 1 (same RegimeResult produced twice → duplicates = 1,
// no new row), binding (two snapshots on the same day → two judgments), abstained_summary info code,
// per-item failure isolation with key + binding in the receipt, deadline, quarantine counting.
import {describe,expect,it} from 'vitest';
import type {TableClient} from '@/lib/db/table-client';
import {batchStatusFromCounts} from '@/lib/dq/batches';
import {memoryJudgmentsDb} from './memory-judgments-db';
import {bindingReferenced,produce} from './produce';
import type {ProduceDeps} from './produce';
import type {CategoricalClaim,Input,JudgmentsDb,Methodology,WorkItem} from './types';
import {JudgmentError} from './errors';
import {memoryJudgmentInputsDb} from './inputs-db';
import {fixtureMacroReadApi} from './macro-api';
import {FIXTURE_ASOF,FIXTURE_MACRO,FIXTURE_RESOLVERS,fixtureInputsDb,fixtureRegimeMethod} from './testing/fixture-methods';
import {batchTables,spyRegister,syncTestMethod,withSubjects} from './testing/db-helpers';

const BATCH='00000000-0000-4000-8000-00000000b101';
const item=(snapshot_id:string,asOf=FIXTURE_ASOF):Omit<WorkItem,'observedAt'>=>({subject:{type:'macro_region',key:'US'},asOf,binding:{snapshot_id}});
async function setup(mk:(t:TableClient)=>JudgmentsDb=t=>withSubjects(memoryJudgmentsDb({tables:t})),methods:Methodology[]=[fixtureRegimeMethod]){
 const tables=await batchTables(BATCH);const db=mk(tables);
 for(const m of methods)await syncTestMethod(db,m);
 const deps:ProduceDeps={db,inputsDb:fixtureInputsDb(),tables,resolverOf:FIXTURE_RESOLVERS,batchId:BATCH,codeVersion:'abcdef0'};
 return {db,tables,deps};
}

describe('produce (spec §6.4)',()=>{
 it('acceptance example 1: producing the same snapshot twice → second run duplicates = 1, no second insert',async()=>{
  let spy!:ReturnType<typeof spyRegister>;const {deps}=await setup(t=>(spy=spyRegister(withSubjects(memoryJudgmentsDb({tables:t})))).db);
  const first=await produce(fixtureRegimeMethod,[item('s-a')],deps);
  expect(first.counts).toMatchObject({fetched:1,inserted:1,duplicates:0,quarantined:0,failed:0});
  const second=await produce(fixtureRegimeMethod,[item('s-a')],deps);
  expect(second.counts).toMatchObject({fetched:1,inserted:0,duplicates:1,quarantined:0,failed:0});
  expect(second.items[0]).toMatchObject({status:'duplicate',judgment_id:first.items[0].judgment_id});
  expect(spy.calls()).toBe(1);
  expect(batchStatusFromCounts(second.counts,second.errors)).toBe('success');
 });
 it('binding: two snapshots of the same region and day are two judgments; gather must reference the binding',async()=>{
  const {deps}=await setup();
  const r=await produce(fixtureRegimeMethod,[item('s-a'),item('s-b')],deps);
  expect(r.counts.inserted).toBe(2);
  expect(new Set(r.items.map(i=>i.judgment_id)).size).toBe(2);
  expect(bindingReferenced({snapshot_id:'s-a'},[{kind:'macro_snapshot',ref:{snapshot_id:'s-a'}} as Input])).toBe(true);
  expect(bindingReferenced({snapshot_id:'s-a'},[{kind:'macro_snapshot',ref:{snapshot_id:'s-b'}} as Input])).toBe(false);
  const ignoresBinding:Methodology<CategoricalClaim>={...fixtureRegimeMethod,id:'fixture_ignores_binding',gather:(w,db)=>fixtureRegimeMethod.gather({...w,binding:{snapshot_id:'s-a'}},db)};
  const s2=await setup(undefined,[ignoresBinding]);
  const bad=await produce(ignoresBinding,[item('s-b')],s2.deps);
  expect(bad.counts).toMatchObject({fetched:1,failed:1,inserted:0});
  expect(bad.errors[0]).toMatchObject({code:'binding_not_referenced',key:'US'});
 });
 it('abstentions are inserted rows plus one abstained_summary info code; the batch stays success',async()=>{
  const {deps,db}=await setup();
  // different as_of: two abstentions with empty inputs on the same (subject, method, as_of) would share one id
  const r=await produce(fixtureRegimeMethod,[item('s-none'),{subject:{type:'macro_region',key:'US'},asOf:'2026-10-15'}],deps);
  expect(r.counts).toMatchObject({fetched:2,inserted:2,failed:0});
  expect(r.items.map(i=>i.abstained)).toEqual([true,true]);
  expect(r.errors).toEqual([{code:'abstained_summary',message:JSON.stringify({binding_missing:1,snapshot_unclassified:1})}]);
  expect(await db.getJudgment(r.items[0].judgment_id!)).toMatchObject({abstained:true,abstain_reason:'snapshot_unclassified',inputs:[]});
  expect(batchStatusFromCounts(r.counts,r.errors)).toBe('success');
 });
 it('D1: a bound item that abstains in gather after its snapshot is readable keeps the snapshot input (distinct ids per snapshot, found by snapshot_id)',async()=>{
  const abstainsLate:Methodology<CategoricalClaim>={...fixtureRegimeMethod,id:'fixture_abstains_late',gather:async()=>({abstained:true,reason:'observation_missing'})};
  const {deps,db}=await setup(undefined,[abstainsLate]);
  const r=await produce(abstainsLate,[item('s-a'),item('s-b')],deps);
  expect(r.counts).toMatchObject({fetched:2,inserted:2,failed:0});
  expect(new Set(r.items.map(i=>i.judgment_id)).size).toBe(2);
  const a=await db.getJudgment(r.items[0].judgment_id!);
  expect(a).toMatchObject({abstained:true,abstain_reason:'observation_missing'});
  expect(a!.inputs.map(x=>[x.kind,x.ref])).toEqual([['macro_snapshot',{snapshot_id:'s-a'}]]);
  expect(await db.judgmentsBySnapshot('s-b')).toEqual([r.items[1].judgment_id]);
 });
 it('one failing item does not stop the others; the receipt carries code, key and binding',async()=>{
  const {deps}=await setup();
  const r=await produce(fixtureRegimeMethod,[item('s-late'),item('s-a')],deps);
  expect(r.counts).toMatchObject({fetched:2,inserted:1,failed:1});
  expect(r.items.map(i=>i.status)).toEqual(['failed','inserted']);
  expect(r.errors[0].code).toBe('lookahead');expect(r.errors[0].key).toBe('US');expect(r.errors[0].message).toContain('"snapshot_id":"s-late"');
  expect(batchStatusFromCounts(r.counts,r.errors)).toBe('partial');
 });
 it('an idempotency conflict counts as quarantined',async()=>{
  const {deps,tables}=await setup();
  await produce(fixtureRegimeMethod,[item('s-a')],deps);
  const drifted:Methodology<CategoricalClaim>={...fixtureRegimeMethod,compute:(s,i)=>{const c=fixtureRegimeMethod.compute(s,i);return c.abstained?c:{abstained:false,claim:{...c.claim,distribution:{recovery:0.5,overheat:0.2,stagflation:0.2,recession:0.1}}};}};
  const r=await produce(drifted,[item('s-a')],deps);
  expect(r.counts).toMatchObject({fetched:1,quarantined:1,failed:0});
  expect(r.errors[0]).toMatchObject({code:'idempotency_conflict',key:'US'});
  expect(tables.rows('dq_quarantine')).toHaveLength(1);
 });
 it('T2-01: an abort fired during gather means NO registration for that item (deferred, info deadline_hit), the rest are skipped, and the counts stay consistent with the batch',async()=>{
  let spy!:ReturnType<typeof spyRegister>;const {deps,db}=await setup(t=>(spy=spyRegister(withSubjects(memoryJudgmentsDb({tables:t})))).db);const ac=new AbortController();
  const slow:Methodology<CategoricalClaim>={...fixtureRegimeMethod,gather:async(w,d)=>{const g=await fixtureRegimeMethod.gather(w,d);ac.abort();return g;}};
  const r=await produce(slow,[item('s-a'),item('s-b'),item('s-none')],{...deps,signal:ac.signal});
  expect(spy.calls()).toBe(0);
  expect(r.counts).toMatchObject({fetched:1,inserted:0,failed:0,deferred:1});
  expect(r.items.map(i=>i.status)).toEqual(['deferred','skipped','skipped']);
  expect(r.errors).toEqual([{code:'deadline_hit',key:'US',message:'aborted before the register RPC; nothing written'},{code:'deadline_hit',message:'2 work items not processed'}]);
  expect(batchStatusFromCounts(r.counts,r.errors)).toBe('success');
  expect(await db.getJudgment(r.items[0].judgment_id??'00000000-0000-4000-8000-000000000000')).toBeNull();
 });
 it('an aborted signal between items stops before the next one: the finished item stays, the rest are skipped and not fetched',async()=>{
  const {deps}=await setup();const ac=new AbortController();
  const r=await produce(fixtureRegimeMethod,[item('s-a'),item('s-b')],{...deps,signal:ac.signal,db:new Proxy(deps.db,{get:(x,k,rc)=>k==='registerJudgment'?async(...a:unknown[])=>{const v=await (x.registerJudgment as (...b:unknown[])=>Promise<unknown>)(...a);ac.abort();return v;}:Reflect.get(x,k,rc)})});
  expect(r.counts).toMatchObject({fetched:1,inserted:1});
  expect(r.items.map(i=>i.status)).toEqual(['inserted','skipped']);
  expect(r.errors).toEqual([{code:'deadline_hit',message:'1 work items not processed'}]);
 });
 it('observedAt: produce sets it once per item from db.serverTime() (overriding a caller value); bindingInputs uses it',async()=>{
  const seen:string[]=[];const NOW='2026-11-06T01:02:03.004Z';
  const spyM:Methodology<CategoricalClaim>={...fixtureRegimeMethod,id:'fixture_observed',gather:async(w,db)=>{seen.push(w.observedAt);return fixtureRegimeMethod.gather(w,db);}};
  const {deps}=await setup(t=>{const d=withSubjects(memoryJudgmentsDb({tables:t}));return new Proxy(d,{get:(x,k,r)=>k==='serverTime'?async()=>NOW:Reflect.get(x,k,r)});},[spyM]);
  await produce(spyM,[{...item('s-a'),observedAt:'bogus'} as never],deps);
  expect(seen).toEqual([NOW]);
 });
 it('R-02: a transient failure while building the binding input fails the item; it is never an empty-input registration',async()=>{
  const abstainsLate:Methodology<CategoricalClaim>={...fixtureRegimeMethod,id:'fixture_abstains_transient',gather:async()=>({abstained:true,reason:'observation_missing'})};
  const {deps,db}=await setup(undefined,[abstainsLate]);
  const flaky=memoryJudgmentInputsDb({macro:{...fixtureMacroReadApi(FIXTURE_MACRO),snapshot:async()=>{throw new JudgmentError('macro_unavailable','boom');}}});
  const r=await produce(abstainsLate,[item('s-a')],{...deps,inputsDb:flaky});
  expect(r.counts).toMatchObject({fetched:1,inserted:0,failed:1});expect(r.items[0]).toMatchObject({status:'failed',code:'macro_unavailable'});
  expect(await db.judgmentsBySnapshot('s-a')).toEqual([]);
  const down=new Proxy(deps.db,{get:(x,k,rc)=>k==='serverTime'?async()=>{throw new Error('db down');}:Reflect.get(x,k,rc)});
  const r2=await produce(abstainsLate,[item('s-a')],{...deps,db:down});
  expect(r2.counts).toMatchObject({fetched:1,inserted:0,failed:1});
 });
 it('R-04: dry-run reports nothing as written: inserted / duplicates stay 0, planned items, no abstained_summary',async()=>{
  const {deps,db}=await setup();
  const r=await produce(fixtureRegimeMethod,[item('s-a'),item('s-none')],{...deps,dryRun:true});
  expect(r.counts).toMatchObject({inserted:0,duplicates:0,quarantined:0,failed:0});
  expect(r.items.map(i=>i.status)).toEqual(['planned_insert','planned_abstain']);
  expect(r.errors.map(e=>e.code)).not.toContain('abstained_summary');
  expect(await db.getJudgment(r.items[0].judgment_id!)).toBeNull();
 });
 it('R-05: quarantined counts only a written quarantine row; an upstream idempotency_conflict from gather is a failure',async()=>{
  const {deps,tables}=await setup();
  const upstream:Methodology<CategoricalClaim>={...fixtureRegimeMethod,gather:async()=>{throw new JudgmentError('idempotency_conflict','from elsewhere');}};
  const r=await produce(upstream,[item('s-a')],deps);
  expect(r.counts).toMatchObject({quarantined:0,failed:1});expect(r.items[0].status).toBe('failed');expect(tables.rows('dq_quarantine')).toHaveLength(0);
 });
});

describe('T12 r3 bounded producer reads',()=>{
 it.each(['serverTime','gather','binding'] as const)('aborts a hung %s read without writes, including late completion',async phase=>{
  const {deps,db,tables}=await setup();const ac=new AbortController();
  let unblock!:()=>void;const blocked=new Promise<void>(r=>{unblock=r;});
  let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
  const wait=async()=>{entered();await blocked;};
  const m:Methodology<CategoricalClaim>={...fixtureRegimeMethod,gather:async(w,d)=>{
   if(phase==='gather')await wait();
   return phase==='binding'?{abstained:true,reason:'observation_missing'}:fixtureRegimeMethod.gather(w,d);
  }};
  const inputsDb=phase==='binding'?{...deps.inputsDb,macro:{...deps.inputsDb.macro,snapshot:async(id:string)=>{await wait();return deps.inputsDb.macro.snapshot(id);}}}:deps.inputsDb;
  const d=phase==='serverTime'?new Proxy(db,{get:(x,k,r)=>k==='serverTime'?async()=>{await wait();return db.serverTime();}:Reflect.get(x,k,r)}):db;
  const running=produce(m,[item('s-a')],{...deps,db:d,inputsDb,signal:ac.signal});
  await started;ac.abort();
  const outcome=await Promise.race([running,new Promise<null>(r=>setTimeout(()=>r(null),50))]);
  unblock();await running;
  expect(outcome?.counts).toMatchObject({fetched:1,deferred:1,failed:0,inserted:0});
  expect(await db.judgmentsBySnapshot('s-a')).toEqual([]);expect(tables.rows('dq_quarantine')).toHaveLength(0);
 });
});
