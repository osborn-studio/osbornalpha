// src/lib/macro/strategy/port.test.ts
// StrategyReadPort semantics on memoryStrategyPort (spec §4.3) and the null production port (§9.1).
import {describe,expect,it} from 'vitest';
import {memoryStrategyPort,strategyPort} from './port';
import {FIXTURE_CATALOG,FIXTURE_CATALOG_VERSION,FIXTURE_RULES,fedTargetFixture,fixture,monthly,obs,snap} from './testing/fixture';

describe('strategyPort',()=>{
 it('is null until WP-S6 wires P1+P2',()=>{expect(strategyPort()).toBeNull();});
});

describe('memoryStrategyPort snapshots',()=>{
 const s1=snap('US','2026-10-01T08:00:00.000Z',[]),s2=snap('US','2026-11-01T08:00:00.000Z',[],{status:'superseded'}),s3=snap('US','2026-11-01T08:00:00.000Z',[]);
 const tieA={...snap('CN','2026-11-02T08:00:00.000Z',[]),snapshot_id:'snap:CN:a'},tieB={...snap('CN','2026-11-02T08:00:00.000Z',[]),snapshot_id:'snap:CN:b'};
 const failed=snap('CN','2026-11-03T08:00:00.000Z',[],{status:'failed'});
 const port=memoryStrategyPort(fixture({snapshots:[s1,{...s2,snapshot_id:'snap:US:old'},s3,tieA,tieB,failed]}));
 it('activeSnapshot: newest active of the region; null when none',async()=>{
  expect((await port.activeSnapshot('US'))?.snapshot_id).toBe(s3.snapshot_id);
  expect(await memoryStrategyPort(fixture()).activeSnapshot('US')).toBeNull();
 });
 it('snapshot: by id or null',async()=>{
  expect((await port.snapshot(s1.snapshot_id))?.created_at).toBe('2026-10-01T08:00:00.000Z');
  expect(await port.snapshot('snap:none')).toBeNull();
 });
 it('snapshotUpTo: created_at ≤ cutoff, non-failed, ties on created_at → greatest snapshot_id',async()=>{
  expect((await port.snapshotUpTo('US','2026-10-15T00:00:00Z'))?.snapshot_id).toBe(s1.snapshot_id);
  expect((await port.snapshotUpTo('US','2026-09-30T00:00:00Z'))).toBeNull();
  expect((await port.snapshotUpTo('CN','2026-12-01T00:00:00Z'))?.snapshot_id).toBe('snap:CN:b');   // the failed 11-03 one is skipped
  expect((await port.snapshotUpTo('CN','2026-11-02T08:00:00.000Z'))?.snapshot_id).toBe('snap:CN:b');
 });
});

describe('memoryStrategyPort observations',()=>{
 const v1=obs('US_UNRATE','2026-08-31','4.3'),v2=obs('US_UNRATE','2026-08-31','4.2',{version:2,availableAt:'2026-10-03T12:00:00Z'});
 const sep=obs('US_UNRATE','2026-09-30','4.1',{availableAt:'2026-10-03T12:00:00Z'});
 const bad=obs('US_UNRATE','2026-10-31','9.9',{status:'quarantined'});
 const port=memoryStrategyPort(fixture({observations:[v1,v2,sep,bad,...monthly('US_DGS10','2026-01',['4.0','4.1','4.2'])]}));
 it('observationsByIds: ok rows in input order, unknown and non-ok ids dropped',async()=>{
  expect((await port.observationsByIds([sep.observation_id,'nope',v1.observation_id,bad.observation_id])).map(o=>o.observation_id)).toEqual([sep.observation_id,v1.observation_id]);
 });
 it('latestObservations: latest visible period, highest visible version, per series in input order',async()=>{
  expect((await port.latestObservations(['US_UNRATE','US_DGS10','US_NONE'],{asOf:'2026-10-01T00:00:00Z'})).map(o=>o.observation_id))
   .toEqual([v1.observation_id,'obs:US_DGS10:2026-03-31:v1']);
  expect((await port.latestObservations(['US_UNRATE'],{asOf:'2026-11-01T00:00:00Z'}))[0].observation_id).toBe(sep.observation_id);
 });
 it('seriesHistory: highest visible version per period, ascending, from/to bounds, truncated beyond maxRows',async()=>{
  expect((await port.seriesHistory('US_UNRATE',{asOf:'2026-11-01T00:00:00Z',maxRows:10})).map(o=>o.observation_id)).toEqual([v2.observation_id,sep.observation_id]);
  expect((await port.seriesHistory('US_UNRATE',{asOf:'2026-10-01T00:00:00Z',maxRows:10})).map(o=>o.observation_id)).toEqual([v1.observation_id]);
  expect((await port.seriesHistory('US_DGS10',{from:'2026-02-01',to:'2026-02-28',asOf:'2026-12-31T00:00:00Z',maxRows:10})).map(o=>o.value_text)).toEqual(['4.1']);
  await expect(port.seriesHistory('US_DGS10',{asOf:'2026-12-31T00:00:00Z',maxRows:2})).rejects.toThrow('truncated');
 });
 it('catalog, catalogVersion and rules come from the fixture',()=>{
  expect(port.catalog()).toBe(FIXTURE_CATALOG);expect(port.catalogVersion()).toBe(FIXTURE_CATALOG_VERSION);expect(port.rules()).toBe(FIXTURE_RULES);
 });
});

describe('memoryStrategyPort.derivePolicyEvents (P2 semantics)',()=>{
 const port=memoryStrategyPort(fixture());
 const row=(id:string,d:string,v:string)=>({observation_id:id,period_end:d,value_text:v});
 it('reproduces the P2 example: effective date, exact bp, four evidence ids',()=>{
  const upper=[row('u1','2024-09-17','5.5'),row('u2','2024-09-18','5'),row('u3','2024-09-19','5'),row('u4','2024-11-08','4.75')];
  const lower=[row('l1','2024-09-17','5.25'),row('l2','2024-09-18','4.75'),row('l3','2024-09-19','4.75'),row('l4','2024-11-08','4.5')];
  expect(port.derivePolicyEvents(upper,lower)).toEqual([
   {kind:'policy_target_change',region:'US',effective_date:'2024-09-18',upper_from:'5.5',upper_to:'5',lower_from:'5.25',lower_to:'4.75',change_bp:'-50',source:'derived',evidence:['u1','u2','l1','l2'],version:'macro-events/1'},
   {kind:'policy_target_change',region:'US',effective_date:'2024-11-08',upper_from:'5',upper_to:'4.75',lower_from:'4.75',lower_to:'4.5',change_bp:'-25',source:'derived',evidence:['u3','u4','l3','l4'],version:'macro-events/1'},
  ]);
 });
 it('uses the lower-bound move when only the lower bound changed; trailing zeros are no change; unsorted input throws',()=>{
  expect(port.derivePolicyEvents([row('a','2026-01-01','4'),row('b','2026-01-02','4')],[row('c','2026-01-01','3.75'),row('d','2026-01-02','3.5')]).map(e=>e.change_bp)).toEqual(['-25']);
  expect(port.derivePolicyEvents([row('a','2026-01-01','4.50'),row('b','2026-01-02','4.5')],[row('c','2026-01-01','4.25'),row('d','2026-01-02','4.250')])).toEqual([]);
  expect(()=>port.derivePolicyEvents([row('b','2026-01-02','4'),row('a','2026-01-01','4')],[])).toThrow(/events_unsorted/);
 });
 it('derives the 28 range changes of the Fed target fixture (2015-12-17 … 2024-12-19)',()=>{
  const rows=fedTargetFixture();
  const ev=port.derivePolicyEvents(rows.filter(o=>o.series_id==='US_FED_TARGET_UPPER_D'),rows.filter(o=>o.series_id==='US_FED_TARGET_LOWER_D'));
  expect(ev).toHaveLength(28);
  expect(ev[0]).toMatchObject({effective_date:'2015-12-17',upper_from:'0.25',upper_to:'0.5',lower_from:'0',lower_to:'0.25',change_bp:'25'});
  expect(ev.find(e=>e.effective_date==='2020-03-16')!.change_bp).toBe('-100');
  expect(ev.find(e=>e.effective_date==='2022-06-16')!.change_bp).toBe('75');
  expect(ev[27]).toMatchObject({effective_date:'2024-12-19',upper_to:'4.5',change_bp:'-25',evidence:['obs:US_FED_TARGET_UPPER_D:2024-12-18:v1','obs:US_FED_TARGET_UPPER_D:2024-12-19:v1','obs:US_FED_TARGET_LOWER_D:2024-12-18:v1','obs:US_FED_TARGET_LOWER_D:2024-12-19:v1']});
 });
});

describe('memoryStrategyPort.timeliness (P1 releaseTimeliness)',()=>{
 const port=memoryStrategyPort(fixture());
 const def=(id:string)=>FIXTURE_CATALOG.find(d=>d.id===id)!;
 it('next period end + lag + 3 days; missing; n/a for no lag or event series',()=>{
  expect(port.timeliness(def('US_CPI_YOY'),'2026-09-30','2026-11-18')).toBe('current');
  expect(port.timeliness(def('US_CPI_YOY'),'2026-09-30','2026-11-19')).toBe('late');
  expect(port.timeliness(def('CN_GDP_YOY'),'2026-06-30','2026-10-23')).toBe('current');
  expect(port.timeliness(def('CN_GDP_YOY'),'2026-06-30','2026-10-24')).toBe('late');
  expect(port.timeliness(def('US_UNRATE'),null,'2026-11-06')).toBe('missing');
  expect(port.timeliness(def('US_DGS10'),'2026-09-30','2027-01-01')).toBe('n/a');
  expect(port.timeliness(def('CN_MLF_1Y'),'2026-09-17','2027-01-01')).toBe('n/a');
 });
 it('rejects impossible or malformed dates like releaseTimeliness (round-trip validation)',()=>{
  expect(()=>port.timeliness(def('US_CPI_YOY'),'2026-02-31','2026-11-18')).toThrow(/invalid_date/);   // monthly branch
  expect(()=>port.timeliness(def('CN_GDP_YOY'),'2026-06-31','2026-10-23')).toThrow(/invalid_date/);   // quarterly branch
  expect(()=>port.timeliness(def('US_CPI_YOY'),'2026-13-01','2026-11-18')).toThrow(/invalid_date/);
  expect(()=>port.timeliness(def('US_CPI_YOY'),'2026-09-30','2026-02-30')).toThrow(/invalid_date/);   // today
  expect(()=>port.timeliness(def('US_CPI_YOY'),'2026-9-30','2026-11-18')).toThrow(/invalid_date/);
  expect(port.timeliness(def('US_CPI_YOY'),'2024-02-29','2024-04-03')).toBe('current');               // real leap day still fine
  expect(port.timeliness(def('US_DGS10'),'2026-02-31','2027-01-01')).toBe('n/a');                      // n/a / missing answered before parsing
  expect(port.timeliness(def('US_UNRATE'),null,'2026-11-06')).toBe('missing');
 });
});
