// src/lib/macro/snapshots.test.ts
import {describe,expect,it,vi} from 'vitest';
import {MacroDbError} from './db';
import type {MacroDb} from './db';
import {memoryMacroDb} from './memory-db';
import {buildRegimeInput,catalogCounts,publishRegion} from './snapshots';
import {US_FIXTURE,seedCatalog,seedPoints,yoyPoints} from './testing/seed';

const TODAY='2026-11-06';
/** Overrides selected methods while delegating the rest to the real memory DB (works for classes and literals). */
function wrap(db:MacroDb,over:Partial<MacroDb>):MacroDb{
 return new Proxy(db,{get(target,key,recv){
  if(typeof key==='string'&&key in over)return (over as Record<string,unknown>)[key];
  const v=Reflect.get(target,key,recv);
  return typeof v==='function'?v.bind(target):v;
 }});
}
async function seeded(){const db=memoryMacroDb();await seedCatalog(db);const seed=await seedPoints(db,US_FIXTURE);return {db,seed};}

describe('buildRegimeInput',()=>{
 it('selects latest, previous existing period and the period exactly 3 months earlier',async()=>{
  const {db,seed}=await seeded();
  const {input,observations}=await buildRegimeInput(db,'US');
  expect(input.series.US_DGS10).toEqual({
   latest:{observation_id:seed.ids.get('US_DGS10|2026-10-31'),period_end:'2026-10-31',value_text:'4.25'},
   prev:{observation_id:seed.ids.get('US_DGS10|2026-09-30'),period_end:'2026-09-30',value_text:'4.15'},
   prev3m:{observation_id:seed.ids.get('US_DGS10|2026-07-31'),period_end:'2026-07-31',value_text:'3.95'},
  });
  expect(input.series.US_PPI_FD_YOY.prev3m).toBeUndefined();   // 2026-06-30 not seeded → absent, never filled
  const ids=observations.map(o=>o.observation_id);
  expect(ids).toContain(seed.ids.get('US_DGS10|2026-07-31'));
  expect(ids).not.toContain(seed.ids.get('US_DGS10|2026-08-31'));   // neither prev nor prev3m
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toHaveLength(17);   // 5 series × 3 + PPI × 2
 });
 it('periodEndLte and asOf bound the selection',async()=>{
  const {db}=await seeded();
  const {input}=await buildRegimeInput(db,'US',{periodEndLte:'2026-08-31'});
  expect(input.series.US_DGS10.latest.period_end).toBe('2026-08-31');
  const none=await buildRegimeInput(db,'US',{asOf:'2026-10-01T00:00:00Z'});   // seed fetched 2026-11-01
  expect(none.observations).toEqual([]);
 });
});

describe('publishRegion',()=>{
 it('publishes the hand-computed US regime (Task 10 arithmetic) with the full manifest',async()=>{
  const {db,seed}=await seeded();
  const r=await publishRegion({db,env:{}},'US',TODAY);
  expect(r).toMatchObject({status:'published',region:'US',revision:1,attempts:1,regime:'classified',hook:'skipped',observation_count:17});
  if(r.status!=='published')throw new Error('unreachable');
  const snap=await db.activeSnapshot('US');
  expect(snap).toMatchObject({snapshot_id:r.snapshot_id,as_of:TODAY,methodology_version:'v1.0',status:'active',catalog_counts:{verified:6,missing:1,restricted:1}});
  expect(snap!.observation_ids).toContain(seed.ids.get('US_UNRATE|2026-06-30'));
  // frozen sparkline history: every eligible period of each regime input up to its latest (≤ 24 per input)
  expect(snap!.history_ids).toHaveLength(22);                                                    // 4 × DFF/DGS10/DTWEX/CPI/UNRATE + 2 PPI
  expect(snap!.history_ids).toContain(seed.ids.get('US_DGS10|2026-08-31'));                       // in history, not in the manifest
  expect(snap!.observation_ids).not.toContain(seed.ids.get('US_DGS10|2026-08-31'));
  expect(snap!.history_ids.some(id=>id===seed.ids.get('US_DGS10_D|2026-08-31'))).toBe(false);     // native daily inputs are not regime inputs
  const regime=await db.regimeOf(r.snapshot_id);
  expect(regime).toMatchObject({rules_version:'macro-regime-rules/1.0',uncovered_weight:20,regime:{primary_state:'overheat',secondary_state:'stagflation',margin_pp:11.023622}});
 });
 it('publishes regardless of coverage (regime null); counts missing = status missing + active without data',async()=>{
  const db=memoryMacroDb();await seedCatalog(db);
  await seedPoints(db,US_FIXTURE.filter(p=>p.series_id==='US_CPI_INDEX'));
  const r=await publishRegion({db,env:{}},'US',TODAY);
  expect(r).toMatchObject({status:'published',regime:'null'});
  if(r.status!=='published')throw new Error('unreachable');
  expect((await db.regimeOf(r.snapshot_id))!.regime).toBeNull();
  expect(await catalogCounts(db,'US')).toEqual({verified:1,missing:6,restricted:1});   // ISM + 5 active without rows; VIX restricted
 });
 it('rows of a running or failed batch (and their derivations) never reach a snapshot; once the batch succeeds they do (第 4 稿 P1-5)',async()=>{
  const {db}=await seeded();
  const OPEN='00000000-0000-4000-8000-0000000000c1';
  db.setBatchStatus(OPEN,'running');
  const late=await seedPoints(db,yoyPoints('US_CPI_INDEX',[['2026-10-31','3.1']]),{fetchedAt:'2026-11-02T05:30:00.000Z',batchId:OPEN});
  const pending=late.ids.get('US_CPI_YOY|2026-10-31')!;
  expect(pending).toEqual(expect.any(String));                                                    // derived inside the open batch
  for(const status of ['running','failed'] as const){
   db.setBatchStatus(OPEN,status);
   const r=await publishRegion({db,env:{}},'US',TODAY);
   if(r.status!=='published')throw new Error('setup');
   const snap=(await db.snapshot(r.snapshot_id))!;
   expect(snap.observation_ids).not.toContain(pending);
   expect(snap.history_ids).not.toContain(pending);
   expect((await buildRegimeInput(db,'US')).input.series.US_CPI_YOY.latest.period_end).toBe('2026-09-30');
  }
  db.setBatchStatus(OPEN,'success');
  const ok=await publishRegion({db,env:{}},'US',TODAY);
  if(ok.status!=='published')throw new Error('setup');
  expect((await db.snapshot(ok.snapshot_id))!.observation_ids).toContain(pending);
 });
 it('an empty region still publishes an empty, valid snapshot',async()=>{
  const db=memoryMacroDb();await seedCatalog(db);
  const r=await publishRegion({db,env:{}},'CN',TODAY);
  expect(r).toMatchObject({status:'published',observation_count:0,regime:'null'});
 });
 it('stale_publisher (real: input changed between read and publish) → retried once from scratch',async()=>{
  const {db}=await seeded();
  let raced=false;
  const racy=wrap(db,{publishState:async(region)=>{
   const s=await db.publishState(region);
   if(!raced){raced=true;await seedPoints(db,yoyPoints('US_CPI_INDEX',[['2026-10-31','3.1']]),{fetchedAt:'2026-11-02T05:30:00.000Z'});}
   return s;
  }});
  const r=await publishRegion({db:racy,env:{}},'US',TODAY);
  expect(r).toMatchObject({status:'published',attempts:2});
  const snap=await db.activeSnapshot('US');
  const obs=await db.observationsByIds(snap!.observation_ids);
  expect(obs.some(o=>o.series_id==='US_CPI_YOY'&&o.period_end==='2026-10-31')).toBe(true);   // second attempt saw the new input
 });
 it('stale twice → gives up with a receipt, records no failure, active untouched',async()=>{
  const {db}=await seeded();
  const recordFailed=vi.fn(db.recordFailedSnapshot.bind(db));
  const stale=wrap(db,{publishSnapshot:async()=>{throw new MacroDbError('stale_publisher');},recordFailedSnapshot:recordFailed});
  const r=await publishRegion({db:stale,env:{}},'US',TODAY);
  expect(r).toEqual({status:'stale',region:'US',attempts:2});
  expect(recordFailed).not.toHaveBeenCalled();
  expect(await db.activeSnapshot('US')).toBeNull();
 });
 it('other errors → failed snapshot recorded, previous active snapshot keeps serving',async()=>{
  const {db}=await seeded();
  const first=await publishRegion({db,env:{}},'US',TODAY);
  if(first.status!=='published')throw new Error('setup');
  const broken=wrap(db,{publishSnapshot:async()=>{throw new MacroDbError('invalid_manifest');}});
  const r=await publishRegion({db:broken,env:{}},'US','2026-11-07');
  expect(r).toMatchObject({status:'failed',region:'US',reason:'invalid_manifest',attempts:1});
  if(r.status!=='failed')throw new Error('unreachable');
  expect(r.failed_snapshot_id).toEqual(expect.any(String));
  expect((await db.snapshot(r.failed_snapshot_id!))!.status).toBe('failed');
  expect((await db.activeSnapshot('US'))!.snapshot_id).toBe(first.snapshot_id);
 });
 it('a publish key replays instead of publishing twice: same snapshot, no new revision, hook skipped (第 5 稿 P1-4)',async()=>{
  const {db}=await seeded();
  const key='ingest:11111111-1111-4111-8111-111111111111';
  const first=await publishRegion({db,env:{}},'US',TODAY,{publishKey:key});
  if(first.status!=='published')throw new Error('setup');
  expect(first.replayed).toBe(false);
  const hook=vi.fn(async()=>{});
  const again=await publishRegion({db,onPublished:hook,env:{MACRO_JUDGMENTS_ENABLED:'1'}},'US',TODAY,{publishKey:key});
  expect(again).toMatchObject({status:'published',snapshot_id:first.snapshot_id,revision:first.revision,replayed:true,hook:'skipped'});
  expect(hook).not.toHaveBeenCalled();
  expect((await db.publishState('US')).revision).toBe(first.revision);
 });
 it('a replay receipt describes the returned snapshot from its persisted fields, not inputs that changed since (第 6 稿 P2-2)',async()=>{
  const db=memoryMacroDb();await seedCatalog(db);
  const key='ingest:22222222-2222-4222-8222-222222222222';
  const first=await publishRegion({db,env:{}},'US',TODAY,{publishKey:key});                      // no inputs yet: an empty, valid snapshot
  if(first.status!=='published')throw new Error('setup');
  expect(first).toMatchObject({observation_count:0,regime:'null'});
  await seedPoints(db,US_FIXTURE);                                                                 // inputs arrive after the publish (Codex repro)
  expect((await buildRegimeInput(db,'US')).observations.length).toBeGreaterThan(0);                // a rebuild would now report the new inputs
  const again=await publishRegion({db,env:{}},'US',TODAY,{publishKey:key});
  expect(again).toEqual({...first,replayed:true});                                                // same snapshot, same counts, regime and weight
  const snap=(await db.snapshot(first.snapshot_id))!;const stored=(await db.regimeOf(first.snapshot_id))!;
  if(again.status!=='published')throw new Error('unreachable');
  expect(again.observation_count).toBe(snap.observation_ids.length);
  expect([again.regime,again.uncovered_weight]).toEqual([stored.regime?'classified':'null',stored.uncovered_weight]);
 });
 it('a replay whose stored regime row is missing fails instead of inventing uncovered_weight 0',async()=>{
  const {db}=await seeded();
  const key='ingest:33333333-3333-4333-8333-333333333333';
  const first=await publishRegion({db,env:{}},'US',TODAY,{publishKey:key});
  if(first.status!=='published')throw new Error('setup');
  const lost=wrap(db,{regimeOf:async()=>null});
  expect(await publishRegion({db:lost,env:{}},'US',TODAY,{publishKey:key})).toMatchObject({status:'failed',reason:'rpc_failed'});
 });
 it('fenced is a protocol abort: it propagates and records no failed snapshot (第 5 稿 P1-3)',async()=>{
  const {db}=await seeded();
  const recordFailed=vi.fn(db.recordFailedSnapshot.bind(db));
  const fencedDb=wrap(db,{publishSnapshot:async()=>{throw new MacroDbError('fenced');},recordFailedSnapshot:recordFailed});
  await expect(publishRegion({db:fencedDb,env:{}},'CN',TODAY,{publishKey:'ingest:x',fence:{batchId:'x',ownerToken:'t',finishToken:'f'}})).rejects.toMatchObject({name:'MacroDbError',code:'fenced'});
  expect(recordFailed).not.toHaveBeenCalled();
 });
 it('judgment hook: flag off → not called; flag on → called with the published snapshot; hook failure never fails the publish',async()=>{
  const {db}=await seeded();
  const hook=vi.fn(async()=>{});
  const off=await publishRegion({db,onPublished:hook,env:{}},'US',TODAY);
  expect(hook).not.toHaveBeenCalled();
  expect(off).toMatchObject({status:'published',hook:'skipped'});
  const notOne=await publishRegion({db,onPublished:hook,env:{MACRO_JUDGMENTS_ENABLED:'true'}},'US',TODAY);   // only the exact value '1' enables
  expect(notOne).toMatchObject({status:'published',hook:'skipped'});
  expect(hook).not.toHaveBeenCalled();
  const on=await publishRegion({db,onPublished:hook,env:{MACRO_JUDGMENTS_ENABLED:'1'}},'US',TODAY);
  if(on.status!=='published')throw new Error('unreachable');
  expect(hook).toHaveBeenCalledTimes(1);
  expect(hook).toHaveBeenCalledWith(expect.objectContaining({snapshot_id:on.snapshot_id,status:'active'}));
  expect(on.hook).toBe('ok');
  const bad=await publishRegion({db,onPublished:async()=>{throw new Error('f4 down');},env:{MACRO_JUDGMENTS_ENABLED:'1'}},'US',TODAY);
  expect(bad).toMatchObject({status:'published',hook:'failed'});
  expect((await db.activeSnapshot('US'))!.snapshot_id).toBe((bad as {snapshot_id:string}).snapshot_id);
 });
});
