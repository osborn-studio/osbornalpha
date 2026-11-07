// src/lib/macro/views.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {recordAttempt} from '../dq/freshness';
import {catalogById} from './catalog';
import type {MacroDb} from './db';
import {releaseTimeliness} from './freshness';
import {memoryMacroDb} from './memory-db';
import type {MemoryMacroDb} from './memory-db';
import {publishRegion} from './snapshots';
import {US_FIXTURE,seedCatalog,seedPoints,seedRetrieval,yoyPoints} from './testing/seed';
import {changeOf,overviewEnvelope,scaleBy100} from './views';
import type {ViewDeps} from './views';

const TODAY='2026-11-06';
const NOW=new Date('2026-11-06T06:00:00Z');
async function setup(){
 const db=memoryMacroDb();await seedCatalog(db);
 const seed=await seedPoints(db,US_FIXTURE);
 const tables=memoryTableClient({dq_freshness:['dataset']});
 await recordAttempt(tables,'macro.fred',{ok:true,cadence:'daily',now:new Date('2026-11-06T05:30:00Z')});
 const deps:ViewDeps={db,tables,now:()=>NOW};
 return {db,seed,tables,deps};
}
async function publish(db:MacroDb){const r=await publishRegion({db,env:{}},'US',TODAY);if(r.status!=='published')throw new Error('publish');return (await db.snapshot(r.snapshot_id))!;}

describe('decimal change helpers',()=>{
 it('scaleBy100 shifts the decimal point exactly',()=>{
  expect(scaleBy100('0.1')).toBe('10');
  expect(scaleBy100('-0.07')).toBe('-7');
  expect(scaleBy100('0.255')).toBe('25.5');
  expect(scaleBy100('3')).toBe('300');
  expect(scaleBy100('0')).toBe('0');
 });
 it('changeOf follows the series changeKind',()=>{
  expect(changeOf('bp','4.25','4.15')).toEqual({kind:'bp',value_text:'10'});
  expect(changeOf('pp','2.9','2.6')).toEqual({kind:'pp',value_text:'0.3'});
  expect(changeOf('points','49.8','50.2')).toEqual({kind:'points',value_text:'-0.4'});
  expect(changeOf('pct','126.5','125')).toEqual({kind:'pct',value_text:'1.2'});
  expect(changeOf('pct','5','0')).toBeNull();
 });
});

describe('overviewEnvelope',()=>{
 it('builds indicator rows from the active snapshot, with typed changes, provenance and sparkline',async()=>{
  const {db,seed,deps}=await setup();
  const snap=await publish(db);
  const env=await overviewEnvelope(deps,'US',TODAY);
  expect(env).toMatchObject({snapshotId:snap.snapshot_id,asOf:TODAY,catalogVersion:snap.catalog_version,methodologyVersion:'v1.0',
   catalogCounts:{verified:6,missing:1,restricted:1}});
  expect(env.collection).toEqual([{dataset:'macro.fred',status:'fresh',lastOkAt:'2026-11-06T05:30:00.000Z',lastAttemptAt:'2026-11-06T05:30:00.000Z'}]);
  expect(env.indicators.map(r=>r.series_id)).toEqual(['US_DFF','US_DGS10','US_DTWEXBGS','US_CPI_YOY','US_UNRATE','US_PPI_FD_YOY','US_ISM_PMI','US_VIX']);
  const cpi=env.indicators.find(r=>r.series_id==='US_CPI_YOY')!;
  const def=catalogById('US_CPI_YOY')!;
  expect(cpi).toMatchObject({observation_id:seed.ids.get('US_CPI_YOY|2026-09-30'),value_text:'2.9',unit:def.unit,period_end:'2026-09-30',available_at:'2026-11-01T05:30:00.000Z',availability_basis:'first_seen',
   status:'A',presence:'present',retrieval_id:seed.retrievalId,evidence:[{retrieval_id:seed.retrievalId,sha256:seed.sha256}],publisher:def.source!.publisher,sparkline:['2.7','2.7','2.6','2.9'],
   timeliness:releaseTimeliness(def,'2026-09-30',TODAY)});   // derived: provenance = the index rows' retrieval
  expect(cpi.change).toEqual(changeOf(def.changeKind,'2.9','2.6'));
  const ism=env.indicators.find(r=>r.series_id==='US_ISM_PMI')!;
  expect(ism).toMatchObject({status:'M',presence:'missing',observation_id:null,value_text:null,change:null,timeliness:'missing',sparkline:[],evidence:[]});
  expect(ism.reason).toEqual(catalogById('US_ISM_PMI')!.reason);
  expect(env.indicators.find(r=>r.series_id==='US_VIX')).toMatchObject({status:'R',timeliness:'n/a',value_text:null});
 });
 it('never carries judgment fields',async()=>{
  const {db,deps}=await setup();
  await publish(db);
  const json=JSON.stringify(await overviewEnvelope(deps,'US',TODAY));
  expect(json).not.toMatch(/"regime"|margin_pp|"norm"|"scores"|primary_state|"coverage"|contribution/);
 });
 it('changes vs the previous snapshot: new release, revision, missing; none on the first snapshot',async()=>{
  const {db,deps}=await setup();
  await publish(db);
  let env=await overviewEnvelope(deps,'US',TODAY);
  expect(env.changes.counts.new_release).toBe(0);
  expect(env.changes.counts.revised).toBe(0);
  // native inputs only (第 4 稿 P1-2): a new CPI month (derived through deriveAndWrite) and a revision of the native, revisable UNRATE
  await seedPoints(db,[...yoyPoints('US_CPI_INDEX',[['2026-10-31','3']]),{series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'4.2'}],{fetchedAt:'2026-11-05T05:30:00.000Z'});
  await publish(db);                                                     // db.previousSnapshot now answers the first snapshot
  env=await overviewEnvelope(deps,'US',TODAY);
  expect(env.changes.items).toEqual(expect.arrayContaining([
   {series_id:'US_CPI_YOY',kind:'new_release',period_end:'2026-10-31'},
   {series_id:'US_UNRATE',kind:'revised',period_end:'2026-09-30'},
   {series_id:'US_ISM_PMI',kind:'missing',period_end:null},
  ]));
  expect(env.changes.items.some(i=>i.series_id==='US_VIX')).toBe(false);   // restricted is not "missing"
  const lateIds=env.indicators.filter(r=>r.timeliness==='late').map(r=>r.series_id);
  expect(env.changes.counts).toEqual({new_release:1,revised:1,late:lateIds.length,missing:1});
  expect(env.indicators.find(r=>r.series_id==='US_UNRATE')).toMatchObject({value_text:'4.2',sparkline:['3.8','3.9','4','4.2']});
 });
 it('reads the frozen manifest and history with one observationsByIds call (+ one per derivation level), never per indicator (第 4 稿 P1-8/P2-3)',async()=>{
  const {db,tables}=await setup();
  await publish(db);await publish(db);                                    // a previous snapshot exists too
  const calls:Record<string,number>={};
  const counted=new Proxy(db,{get(t,k,r){const v=Reflect.get(t,k,r);if(typeof v!=='function')return v;return (...a:unknown[])=>{calls[String(k)]=(calls[String(k)]??0)+1;return v.apply(t,a);};}}) as MacroDb;
  await overviewEnvelope({db:counted,tables,now:()=>NOW},'US',TODAY);
  expect(calls.seriesHistory??0).toBe(0);
  expect(calls.eligibleHistory??0).toBe(0);
  expect(calls.observationsByIds).toBe(2);                              // manifest ∪ history ∪ previous manifest, then one ancestor level
  expect(calls.retrievalsByIds).toBe(1);
  for(const k of Object.keys(calls))calls[k]=0;
  await overviewEnvelope({db:counted,tables,now:()=>NOW},'US',TODAY,{compact:true});
  expect(calls.observationsByIds).toBe(1);
  expect(calls.retrievalsByIds??0).toBe(0);
  expect(calls.seriesHistory??0).toBe(0);
 });
 it('reads exactly the frozen ids (manifest, history, previous manifest) and compact derived rows carry a null retrieval_id',async()=>{
  const {db,tables}=await setup();
  const s1=await publish(db);const s2=await publish(db);
  const seen:string[][]=[];
  const spy=new Proxy(db,{get(t,k,r){const v=Reflect.get(t,k,r);if(k!=='observationsByIds')return typeof v==='function'?v.bind(t):v;return (ids:string[])=>{seen.push([...ids]);return (v as MacroDb['observationsByIds']).call(t,ids);};}}) as MacroDb;
  await overviewEnvelope({db:spy,tables,now:()=>NOW},'US',TODAY);
  expect([...new Set(seen[0])].sort()).toEqual([...new Set([...s2.observation_ids,...s2.history_ids,...s1.observation_ids])].sort());
  seen.length=0;
  const env=await overviewEnvelope({db:spy,tables,now:()=>NOW},'US',TODAY,{compact:true});
  expect(seen).toHaveLength(1);
  expect([...new Set(seen[0])].sort()).toEqual([...new Set([...s2.observation_ids,...s1.observation_ids])].sort());
  const dgs=env.indicators.find(r=>r.series_id==='US_DGS10')!;
  expect(dgs.retrieval_id).toBeNull();
  expect(dgs.evidence).toEqual([]);
 });
 it('a snapshot keeps its frozen history: accepting a quarantined older value later changes only newly published snapshots (第 4 稿 P1-8)',async()=>{
  const {db,deps}=await setup();
  const s1=await publish(db);
  // a late delivery of an older UNRATE value (fetched before the stored one) is quarantined as stale_delivery …
  const lateBatch='00000000-0000-4000-8000-0000000000b2';
  (db as MemoryMacroDb).setBatchStatus(lateBatch,'running');   // the memory twin writes only into a running batch
  const {retrievalId}=await seedRetrieval(db,{fetchedAt:'2026-10-20T05:30:00.000Z',batchId:lateBatch});
  const res=await db.writeObservations(lateBatch,'test',[{series_id:'US_UNRATE',period_end:'2026-07-31',value_text:'9.9',available_at:'2026-10-20T05:30:00.000Z',revisable:true,retrieval_id:retrievalId,locator:{kind:'csv_row',line:2,column:1}}]);
  (db as MemoryMacroDb).setBatchStatus(lateBatch,'success',undefined,'2026-10-20T05:30:00.000Z');
  expect(res.conflicts.map(c=>c.reason)).toEqual(['stale_delivery']);
  const q=db.addQuarantineItem({dataset:'macro.fred',natural_key:'US_UNRATE|2026-07-31',reason_code:'stale_delivery',batch_id:lateBatch});
  const obs=res.conflicts[0].observation_id!;
  await db.linkQuarantine(q,[obs]);
  await db.resolveConflict(q,'accept','00000000-0000-4000-8000-0000000000aa',obs);   // … then accepted: its available_at predates s1
  const env1=await overviewEnvelope(deps,'US',TODAY);
  expect(env1.snapshotId).toBe(s1.snapshot_id);
  expect(env1.indicators.find(r=>r.series_id==='US_UNRATE')!.sparkline).toEqual(['3.8','3.9','4','4.1']);   // unchanged
  await publish(db);
  const env2=await overviewEnvelope(deps,'US',TODAY);
  expect(env2.indicators.find(r=>r.series_id==='US_UNRATE')!.sparkline).toEqual(['3.8','9.9','4','4.1']);
 });
 it('compact keeps three key rows without sparklines or change items, counts unchanged',async()=>{
  const {db,deps}=await setup();
  await publish(db);
  const full=await overviewEnvelope(deps,'US',TODAY);
  const env=await overviewEnvelope(deps,'US',TODAY,{compact:true});
  expect(env.indicators.map(r=>r.series_id)).toEqual(['US_DFF','US_DGS10','US_CPI_YOY']);
  expect(env.indicators.every(r=>r.sparkline.length===0)).toBe(true);
  expect(env.changes.items).toEqual([]);
  expect(env.changes.counts).toEqual(full.changes.counts);
 });
 it('no published snapshot → catalog rows without values (never zeros), collection status still shown',async()=>{
  const {deps}=await setup();
  const env=await overviewEnvelope(deps,'CN',TODAY);
  expect(env).toMatchObject({snapshotId:null,asOf:null,methodologyVersion:null,catalogCounts:null});
  expect(env.collection).toEqual([{dataset:'macro.akshare',status:'missing',lastOkAt:null,lastAttemptAt:null}]);
  expect(env.indicators.length).toBe(11);
  expect(env.indicators.every(r=>r.value_text===null&&r.change===null&&r.presence==='missing'&&r.observation_id===null)).toBe(true);
  // data presence and release timeliness are separate (第 4 稿 P1-3): no data ⇒ timeliness 'missing' only where a release
  // schedule exists; month-end yield / FX rows (no releaseLagDays) are 'n/a'
  const active=env.indicators.filter(r=>r.status==='A');
  for(const r of active)expect(r.timeliness,r.series_id).toBe(catalogById(r.series_id)!.releaseLagDays===undefined?'n/a':'missing');
  expect(active.some(r=>r.timeliness==='n/a')).toBe(true);
  expect(env.changes.counts.missing).toBe(env.indicators.filter(r=>r.status!=='R').length);   // missing counts presence, not timeliness
 });
});
