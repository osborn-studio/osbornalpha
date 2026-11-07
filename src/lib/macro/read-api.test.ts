// src/lib/macro/read-api.test.ts
import {describe,expect,it} from 'vitest';
import {CATALOG_VERSION,catalogById} from './catalog';
import {memoryMacroDb} from './memory-db';
import {MacroUnavailable,macroReadApi,snapshotAvailableAt} from './read-api';
import {buildRegimeInput,publishRegion} from './snapshots';
import {classifyRegime,WEIGHTS_V1} from './regime';
import {US_FIXTURE,seedCatalog,seedPoints,yoyPoints} from './testing/seed';

const TODAY='2026-11-06';
async function setup(){
 const db=memoryMacroDb();await seedCatalog(db);
 const seed=await seedPoints(db,US_FIXTURE,{fetchedAt:'2026-10-15T05:30:00.000Z'});
 return {db,seed,api:macroReadApi(db,{judgments:true})};
}

describe('observation',()=>{
 it('maps an ok row to MacroObservationRef (vintage_id = version, value = Number(value_text), unit from catalog)',async()=>{
  const {api,seed}=await setup();
  const id=seed.ids.get('US_CPI_YOY|2026-09-30')!;
  expect(await api.observation(id)).toEqual({series_id:'US_CPI_YOY',period_end:'2026-09-30',vintage_id:'1',value:2.9,unit:catalogById('US_CPI_YOY')!.unit,available_at:'2026-10-15T05:30:00.000Z'});
  expect(await api.observation('00000000-0000-4000-8000-00000000dead')).toBeNull();
 });
 it('accepts F4 composite ids series_id:period_end:vintage_id (exact version); malformed ids give null without throwing',async()=>{
  const {db,api}=await setup();
  const ref=await api.observation('US_CPI_YOY:2026-09-30:1');
  expect(ref).toMatchObject({series_id:'US_CPI_YOY',period_end:'2026-09-30',vintage_id:'1',value:2.9});
  await seedPoints(db,yoyPoints('US_CPI_INDEX',[['2026-09-30','4.2']]),{fetchedAt:'2026-10-20T05:30:00.000Z'});   // yoy v2
  expect(await api.observation('US_CPI_YOY:2026-09-30:2')).toMatchObject({vintage_id:'2',value:4.2});
  expect(await api.observation('US_CPI_YOY:2026-09-30:1')).toMatchObject({vintage_id:'1',value:2.9});
  expect(await api.observation('US_CPI_YOY:2026-09-30:3')).toBeNull();
  expect(await api.observation('US_CPI_YOY:2026-08-15:1')).toBeNull();
  expect(await api.observation('NOPE:2026-09-30:1')).toBeNull();
  for(const bad of ['','not-a-uuid','US_CPI_YOY:2026-09-30','US_CPI_YOY:2026-09-30:x','US_CPI_YOY:2026-13-45:1','US_CPI_YOY:2026-09-30:01',"a:b:c:d",'00000000-0000-4000-8000-00000000dea'])
   expect(await api.observation(bad),bad).toBeNull();
 });
});

describe('snapshot / snapshotsSince',()=>{
 it('returns MacroSnapshotRow with the frozen regime; cursor is strict and ordered; limit 1..200',async()=>{
  const {db,api}=await setup();
  const a=await publishRegion({db,env:{}},'US',TODAY);
  const b=await publishRegion({db,env:{}},'US',TODAY);
  if(a.status!=='published'||b.status!=='published')throw new Error('setup');
  const row=await api.snapshot(b.snapshot_id);
  expect(row).toMatchObject({snapshot_id:b.snapshot_id,region:'US',as_of:TODAY,methodology_version:'v1.0',catalog_version:CATALOG_VERSION,status:'active',regime:{primary_state:'overheat'}});
  expect(Object.keys(row!).sort()).toEqual(['as_of','catalog_version','created_at','methodology_version','observation_ids','regime','region','snapshot_id','status']);
  expect((await api.snapshot(a.snapshot_id))!.status).toBe('superseded');
  expect(await api.snapshot('00000000-0000-4000-8000-00000000dead')).toBeNull();
  const all=await api.snapshotsSince(null,200);
  expect(all.map(s=>s.snapshot_id)).toEqual([a.snapshot_id,b.snapshot_id]);
  const after=await api.snapshotsSince({created_at:all[0].created_at,snapshot_id:all[0].snapshot_id},200);
  expect(after.map(s=>s.snapshot_id)).toEqual([b.snapshot_id]);
  await expect(api.snapshotsSince(null,0)).rejects.toThrow('invalid_limit');
  await expect(api.snapshotsSince(null,201)).rejects.toThrow('invalid_limit');
  await expect(api.snapshotsSince(null,1.5)).rejects.toThrow('invalid_limit');
 });
 it('judgments off (第 6 稿 P1-2): regime is null and the service-only regime table is never read',async()=>{
  const {db}=await setup();
  const pub=await publishRegion({db,env:{}},'US',TODAY);
  if(pub.status!=='published')throw new Error('setup');
  let reads=0;const regimeOf=db.regimeOf.bind(db);db.regimeOf=async id=>{reads++;return regimeOf(id);};
  const off=macroReadApi(db,{judgments:false});
  expect((await off.snapshot(pub.snapshot_id))!.regime).toBeNull();
  expect((await off.snapshotsSince(null,200)).every(r=>r.regime===null)).toBe(true);
  expect(reads).toBe(0);
  const prev=process.env.MACRO_JUDGMENTS_ENABLED;delete process.env.MACRO_JUDGMENTS_ENABLED;
  try{expect((await macroReadApi(db).snapshot(pub.snapshot_id))!.regime).toBeNull();}                 // default follows the flag (unset = off)
  finally{if(prev!==undefined)process.env.MACRO_JUDGMENTS_ENABLED=prev;}
  expect(reads).toBe(0);
 });
 it('failed snapshots are never listed',async()=>{
  const {db,api}=await setup();
  await db.recordFailedSnapshot({region:'US',asOf:TODAY,methodologyVersion:'v1.0',catalogVersion:CATALOG_VERSION,reason:'test'});
  expect(await api.snapshotsSince(null,200)).toEqual([]);
 });
 it('snapshotAvailableAt = max available_at of the manifest observations',async()=>{
  const {db}=await setup();
  await seedPoints(db,yoyPoints('US_CPI_INDEX',[['2026-10-31','3']]),{fetchedAt:'2026-11-02T05:30:00.000Z'});   // derived via deriveAndWrite
  const r=await publishRegion({db,env:{}},'US',TODAY);
  if(r.status!=='published')throw new Error('setup');
  expect(await snapshotAvailableAt(db,(await db.snapshot(r.snapshot_id))!)).toBe('2026-11-02T05:30:00.000Z');
  const empty=memoryMacroDb();await seedCatalog(empty);
  const e=await publishRegion({db:empty,env:{}},'CN',TODAY);
  if(e.status!=='published')throw new Error('setup');
  expect(await snapshotAvailableAt(empty,(await empty.snapshot(e.snapshot_id))!)).toBeNull();
 });
});

describe('seriesCatalog',()=>{
 it('returns every catalog row of the region with weight, definition_version and catalog_version',async()=>{
  const {api}=await setup();
  const rows=await api.seriesCatalog('US');
  expect(rows.length).toBeGreaterThan(0);
  for(const r of rows){
   expect(r.region).toBe('US');
   expect(r.weight).toBe(WEIGHTS_V1[r.series_id as string]??0);
   expect(r.catalog_version).toBe(CATALOG_VERSION);
   expect(typeof r.definition_version).toBe('number');
  }
  expect(rows.find(r=>r.series_id==='US_ISM_PMI')).toMatchObject({status:'missing',weight:15});
 });
});

describe('classifyAsOf',()=>{
 it('judgments disabled (explicit false or flag unset): regime null, observation_refs and catalog still returned',async()=>{
  const {db}=await setup();
  const on=await macroReadApi(db,{judgments:true}).classifyAsOf('US','2026-10','2026-11-05T00:00:00Z','v1.0');
  expect(on.regime).not.toBeNull();
  const off=await macroReadApi(db,{judgments:false}).classifyAsOf('US','2026-10','2026-11-05T00:00:00Z','v1.0');
  expect(off.regime).toBeNull();
  expect(off.observation_refs).toEqual(on.observation_refs);expect(off.catalog).toEqual(on.catalog);
  const prev=process.env.MACRO_JUDGMENTS_ENABLED;delete process.env.MACRO_JUDGMENTS_ENABLED;
  try{expect((await macroReadApi(db).classifyAsOf('US','2026-10','2026-11-05T00:00:00Z','v1.0')).regime).toBeNull();}
  finally{if(prev!==undefined)process.env.MACRO_JUDGMENTS_ENABLED=prev;}
 });
 it('rejects any methodology other than v1.0 and malformed periods/cutoffs',async()=>{
  const {api}=await setup();
  await expect(api.classifyAsOf('US','2026-10','2026-11-01T00:00:00Z','v2.0')).rejects.toThrow('methodology_mismatch');
  const err=await api.classifyAsOf('US','2026-10','2026-11-01T00:00:00Z','v2.0').catch(e=>e);
  expect(err).toBeInstanceOf(MacroUnavailable);
  expect(err).toMatchObject({name:'MacroUnavailable',code:'methodology_mismatch'});
  await expect(api.classifyAsOf('US','2026-10','2026-11-01','v1.0')).rejects.toThrow('invalid_cutoff');   // date-only cutoff
  await expect(api.classifyAsOf('US','2026-13','2026-11-01T00:00:00Z','v1.0')).rejects.toThrow('invalid_reference_period');
  await expect(api.classifyAsOf('US','2026-10','yesterday','v1.0')).rejects.toThrow('invalid_cutoff');
 });
 it('uses the vintage visible at cutoff (available_at ≤ cutoff, highest version within the period)',async()=>{
  const {db,api}=await setup();
  await seedPoints(db,yoyPoints('US_CPI_INDEX',[['2026-09-30','4.2']]),{fetchedAt:'2026-10-20T05:30:00.000Z'});   // index revision → yoy v2 (both revisable)
  const before=await api.classifyAsOf('US','2026-10','2026-10-18T00:00:00Z','v1.0');
  const cpiBefore=before.observation_refs.find(r=>r.series_id==='US_CPI_YOY'&&r.period_end==='2026-09-30')!;
  expect(cpiBefore).toMatchObject({value:2.9,vintage_id:'1'});
  const after=await api.classifyAsOf('US','2026-10','2026-10-25T00:00:00Z','v1.0');
  expect(after.observation_refs.find(r=>r.series_id==='US_CPI_YOY'&&r.period_end==='2026-09-30')).toMatchObject({value:4.2,vintage_id:'2'});
  expect(before.regime!.primary_state).toBe('overheat');
  expect(after.regime).not.toEqual(before.regime);   // CPI 4.2 hits infl.gt4 instead of infl.2to3
 });
 it('caps period_end at the last day of referencePeriod',async()=>{
  const {api}=await setup();
  const r=await api.classifyAsOf('US','2026-08','2026-11-01T00:00:00Z','v1.0');
  expect(Math.max(...r.observation_refs.map(o=>Date.parse(o.period_end)))).toBeLessThanOrEqual(Date.parse('2026-08-31'));
  expect(r.observation_refs.find(o=>o.series_id==='US_CPI_YOY'&&o.period_end==='2026-08-31')).toMatchObject({value:2.6});
 });
 it('calls the same classification as publishing; returns the region weights and rules version',async()=>{
  const {db,api}=await setup();
  const r=await api.classifyAsOf('US','2026-10','2026-11-05T00:00:00Z','v1.0');
  const direct=classifyRegime((await buildRegimeInput(db,'US',{asOf:'2026-11-05T00:00:00Z',periodEndLte:'2026-10-31'})).input);
  expect(r.regime).toEqual(direct.regime);
  const pub=await publishRegion({db,env:{}},'US',TODAY);
  if(pub.status!=='published')throw new Error('setup');
  expect(r.regime).toEqual((await db.regimeOf(pub.snapshot_id))!.regime);
  expect(r.catalog).toEqual({version:CATALOG_VERSION,weights:{US_DFF:25,US_DGS10:15,US_DTWEXBGS:10,US_CPI_YOY:15,US_UNRATE:10,US_PPI_FD_YOY:5,US_ISM_PMI:15,US_VIX:5},rules_version:'macro-regime-rules/1.0'});
  expect(r.observation_refs).toHaveLength(17);
 });
 it('nothing visible at cutoff → regime null, no refs',async()=>{
  const {api}=await setup();
  expect(await api.classifyAsOf('US','2026-10','2026-10-01T00:00:00Z','v1.0')).toMatchObject({regime:null,observation_refs:[]});
 });
});
