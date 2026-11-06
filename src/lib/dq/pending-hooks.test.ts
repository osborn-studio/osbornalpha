// src/lib/dq/pending-hooks.test.ts
import {describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {factInsert,filingInsert} from '../facts/db-contract';
import {quarantine} from './quarantine';
import {findPendingHooks,runPendingHooks} from './pending-hooks';

const ISSUER='00000000-0000-4000-8000-000000000001',SRC='00000000-0000-4000-8000-000000000002',T='00000000-0000-4000-8000-000000000003';
const ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',BATCH='55555555-0000-4000-8000-000000000001';
const NOW=()=>new Date('2026-11-05T09:00:00.000Z');

async function seed(db:ReturnType<typeof memoryFactsDb>){
 const t=db.tables;
 const add=async(reason:string,o:{status?:string;detail?:Record<string,unknown>;payload?:Record<string,unknown>;naturalKey?:string}={})=>{
  const id=await quarantine(t,{dataset:'facts.us',table:'financial_facts',naturalKey:o.naturalKey??`k:${reason}:${randomUUID()}`,reasonCode:reason,batchId:BATCH,payload:o.payload??{fact_ids:[]},detail:o.detail});
  if(o.status&&o.status!=='open')await t.update('dq_quarantine',{id},{status:o.status,resolved_by:ADMIN,resolved_at:'2026-11-05T08:00:00.000Z'});
  return id;
 };
 const key={issuer_id:ISSUER,market:'US'};
 return {
  sameDayFailed:await add('same_day_conflict',{status:'resolved_accept',payload:{key,fact_ids:[]},detail:{hook:{stage:'materialize',state:'failed'}}}),
  adoptedNoHook:await add('ambiguous_value',{status:'resolved_accept',detail:{adopted_fact_id:'f',issuer_id:SRC,market:'US'}}),
  restoredPending:await add('reconcile_mismatch',{status:'resolved_accept',detail:{restored_by_batch:'b',issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  lineagePending:await add('lineage_conflict',{status:'resolved_accept',detail:{chosen_fact_ids:['k'],issuer_id:T,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  openMismatch:await add('reconcile_mismatch',{detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  rejectedPendingMismatch:await add('reconcile_mismatch',{status:'resolved_reject',detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}}}),
  untargeted:await add('identity_bs',{status:'resolved_accept',payload:{key:{},fact_ids:[]},detail:{hook:{stage:'materialize',state:'pending'}}}),
  // excluded
  done:await add('identity_gp',{status:'resolved_accept',payload:{key,fact_ids:[]},detail:{hook:{stage:'done',state:'done'}}}),
  ack:await add('ambiguous_value',{status:'resolved_accept',detail:{hook:{stage:'done',state:'done'}}}),
  openSameDay:await add('same_day_conflict',{payload:{key,fact_ids:[]},detail:{hook:{stage:'materialize',state:'pending'}}}),
  rejectNoHook:await add('lineage_conflict',{status:'resolved_reject'}),
  openMismatchDone:await add('reconcile_mismatch',{detail:{issuer_id:ISSUER,market:'US',hook:{stage:'done',state:'done'}}}),
 };
}

describe('findPendingHooks / runPendingHooks (spec §4.6, U2)',()=>{
 it('selects (a) resolved items with a pending/failed hook and accepted verdicts without one, (b) open reconcile_mismatch items with a pending/failed hook',async()=>{
  const db=memoryFactsDb();const ids=await seed(db);
  const {items,untargeted}=await findPendingHooks(db.tables);
  expect(items.map(i=>i.id).sort()).toEqual([ids.sameDayFailed,ids.adoptedNoHook,ids.restoredPending,ids.lineagePending,ids.openMismatch,ids.rejectedPendingMismatch].sort());
  expect(untargeted).toEqual([ids.untargeted]);
  expect(items.find(i=>i.id===ids.adoptedNoHook)).toMatchObject({issuer:SRC,market:'US',reason:'ambiguous_value'});
 });
 it('materialises each target T once (merged sources fold into their target) and writes done / failed on every item',async()=>{
  const db=memoryFactsDb();const ids=await seed(db);
  db.setTopology({[SRC]:{status:'merged',merged_into:ISSUER}});
  const mat=vi.fn(async(_db:unknown,issuer:string)=>{if(issuer===T)throw new Error('boom');return {rows:0,stateRev:0,retried:false,target:issuer,basedOn:[]};});
  const report=await runPendingHooks({db,tables:db.tables,now:NOW,materialize:mat as never});
  expect(mat.mock.calls.map(c=>c[1]).sort()).toEqual([ISSUER,T].sort());
  expect(report).toMatchObject({items:6,failed:1,untargeted:[ids.untargeted]});
  expect(report.targets.find(t=>t.target===ISSUER)!.items.sort()).toEqual([ids.sameDayFailed,ids.adoptedNoHook,ids.restoredPending,ids.openMismatch,ids.rejectedPendingMismatch].sort());
  const hook=async(id:string)=>((await db.tables.select('dq_quarantine',{id}))[0].detail as {hook:unknown}).hook;
  expect(await hook(ids.openMismatch)).toEqual({stage:'done',state:'done',at:'2026-11-05T09:00:00.000Z'});
  expect(await hook(ids.lineagePending)).toMatchObject({stage:'materialize',state:'failed',message:'materialize_failed'});
  expect((await db.tables.select('dq_quarantine',{id:ids.openMismatch}))[0].status).toBe('open');   // the reconciliation item stays open for a human
  expect((await findPendingHooks(db.tables)).items.map(i=>i.id)).toEqual([ids.lineagePending]);      // only the failed one is left
 });
 it('a crash right after applyReconcileResult (item open, hook pending) is completed by the scan with the real materialize',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.tables.insert('ingest_batches',{batch_id:b,producer:'reconcile',dataset:'reconcile.us.companyfacts_vs_ixbrl',status:'running'});
  await db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,600);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);const x=factInsert(iss,f);await db.stageFacts(run,[x]);await db.publishRun(run,[f.filing_id]);
  const pair='us.companyfacts_vs_ixbrl' as const;
  await db.tables.insert('dq_reconcile_cycles',{pair,cycle_id:'c1',status:'running',started_at:NOW().toISOString(),members:[{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}],expected_total:1,detail:{}});
  await db.tables.insert('dq_reconcile_cursor',{pair,cycle_id:'c1',issuer_id:iss,market:'US',expected:1,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
  const fence=(await db.claimReconcileMember(pair,'c1',iss,'US',b))!;
  const a=await db.applyReconcileResult(fence,{natural_key:'k1',kind:'numeric',outcome:'compared',passed:false,left_value:'100',right_value:'99',abs_diff:'1',rel_diff:'0.01',tolerance:'0',left_source:'l',right_source:'r',detail:{},action:'quarantine_left',left_fact_id:x.fact_id,inputs_hash:'h'});
  // … the runner dies here, before materialize
  const report=await runPendingHooks({db,tables:db.tables,now:NOW});
  expect(report).toMatchObject({items:1,failed:0});
  const [item]=await db.tables.select('dq_quarantine',{id:a.itemId!});
  expect(item.status).toBe('open');expect((item.detail as {hook:unknown}).hook).toEqual({stage:'done',state:'done',at:'2026-11-05T09:00:00.000Z'});
  expect((await db.factsByIds([x.fact_id]))[0].status).toBe('quarantined');
 });

 it('review (Codex P2): a restore committing a newer pending hook while the scan materialises makes the done-write stale — the item stays pending and is counted skippedStale',async()=>{
  const db=memoryFactsDb();
  const id=await quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:'k:race',reasonCode:'reconcile_mismatch',batchId:BATCH,payload:{fact_ids:[]},detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-05T01:00:00.000Z'}}});
  const NEWER={stage:'materialize',state:'pending',at:'2026-11-05T02:00:00.000Z'};
  const mat=vi.fn(async()=>{
   const [cur]=await db.tables.select('dq_quarantine',{id});
   await db.tables.update('dq_quarantine',{id},{detail:{...(cur.detail as Record<string,unknown>),hook:NEWER}});   // the restore's SQL commit
   return {rows:0,stateRev:0,retried:false,target:ISSUER,basedOn:[]};
  });
  const report=await runPendingHooks({db,tables:db.tables,now:NOW,materialize:mat as never});
  expect(report).toMatchObject({items:1,failed:0,hookWriteFailed:0,skippedStale:1});
  expect(((await db.tables.select('dq_quarantine',{id}))[0].detail as {hook:unknown}).hook).toEqual(NEWER);
 });
 it('review (Codex P2): materialization succeeds but the patch rpc is rejected → hookWriteFailed counted (not silently done)',async()=>{
  const db=memoryFactsDb();
  await quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:'k:rpc',reasonCode:'reconcile_mismatch',batchId:BATCH,payload:{fact_ids:[]},detail:{issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-05T01:00:00.000Z'}}});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const rpc=vi.spyOn(db.tables,'rpc').mockRejectedValue(new Error('db gone'));
  const mat=vi.fn(async()=>({rows:0,stateRev:0,retried:false,target:ISSUER,basedOn:[]}));
  const report=await runPendingHooks({db,tables:db.tables,now:NOW,materialize:mat as never});
  rpc.mockRestore();spy.mockRestore();
  expect(mat).toHaveBeenCalledTimes(1);
  expect(report).toMatchObject({items:1,failed:0,hookWriteFailed:1,skippedStale:0});
 });

 it('review: a targetOf failure on one item is reported as untargeted, never thrown; the other items still run',async()=>{
  const db=memoryFactsDb();
  const mk=(k:string,issuer:string)=>quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:k,reasonCode:'reconcile_mismatch',batchId:BATCH,payload:{fact_ids:[]},detail:{issuer_id:issuer,market:'US',hook:{stage:'materialize',state:'pending',at:'2026-11-05T01:00:00.000Z'}}});
  const bad=await mk('k:bad',SRC);const good=await mk('k:good',ISSUER);
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const real=db.targetOf.bind(db);
  (db as {targetOf:typeof db.targetOf}).targetOf=async i=>{if(i===SRC)throw new Error('topology read failed');return real(i);};
  const mat=vi.fn(async(_d:unknown,i:string)=>({rows:0,stateRev:0,retried:false,target:i,basedOn:[]}));
  const report=await runPendingHooks({db,tables:db.tables,now:NOW,materialize:mat as never});
  spy.mockRestore();
  expect(report).toMatchObject({items:2,failed:0,untargeted:[bad]});
  expect(mat.mock.calls.map(c=>c[1])).toEqual([ISSUER]);
  expect(report.targets[0].items).toEqual([good]);
 });
});
