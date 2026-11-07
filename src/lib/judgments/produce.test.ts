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
import {FIXTURE_ASOF,FIXTURE_RESOLVERS,fixtureInputsDb,fixtureRegimeMethod} from './testing/fixture-methods';
import {batchTables,spyRegister,syncTestMethod,withSubjects} from './testing/db-helpers';

const BATCH='00000000-0000-4000-8000-00000000b101';
const item=(snapshot_id:string,asOf=FIXTURE_ASOF):WorkItem=>({subject:{type:'macro_region',key:'US'},asOf,binding:{snapshot_id}});
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
 it('an aborted signal stops before the next item: deadline_hit, the rest skipped and not fetched',async()=>{
  const {deps}=await setup();const ac=new AbortController();
  const slow:Methodology<CategoricalClaim>={...fixtureRegimeMethod,gather:async(w,db)=>{const g=await fixtureRegimeMethod.gather(w,db);ac.abort();return g;}};
  const r=await produce(slow,[item('s-a'),item('s-b'),item('s-none')],{...deps,signal:ac.signal});
  expect(r.counts).toMatchObject({fetched:1,inserted:1});
  expect(r.items.map(i=>i.status)).toEqual(['inserted','skipped','skipped']);
  expect(r.errors).toEqual([{code:'deadline_hit',message:'2 work items not processed'}]);
 });
});
