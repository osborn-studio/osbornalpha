// manifest.ts (spec §4.5 N1–N3): canonical hash, cutoff rules, snapshot roles, value rule, read states, frozen catalog.
import {describe,expect,it} from 'vitest';
import type {StrategyManifest} from './contract';
import {addMonthsDate,addMonthsYm,canonicalJson,dayDiff,inputRole,inputsWithRole,latestCutoff,manifestBuilder,manifestHash,monthCutoff,monthEnd,monthsBetween,pinSnapshots,prevMonth,readState,sha256Hex,SNAPSHOT_ROWS_PURPOSE,snapshotRoles} from './manifest';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {fixture,monthly,obs,snap} from './testing/fixture';

/** Port with some methods replaced (works for object or class ports). */
const override=(base:StrategyReadPort,over:Partial<StrategyReadPort>):StrategyReadPort=>new Proxy(base,{get:(t,k,r)=>k in over?(over as Record<PropertyKey,unknown>)[k]:Reflect.get(t,k,r)});
const NOW=new Date('2026-11-05T00:00:00Z');

describe('canonical JSON and hash',()=>{
 it('sorts keys, drops undefined, keeps array order, rejects non-finite numbers',()=>{
  expect(canonicalJson({b:1,a:[2,{d:undefined,c:'x'}]})).toBe('{"a":[2,{"c":"x"}],"b":1}');
  expect(()=>canonicalJson({a:Number.NaN})).toThrow(/canonical_json_unsupported/);
 });
 it('sha256Hex matches the FIPS 180-4 test vector and the manifest hash ignores key order',()=>{
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const a={kind:'transmission',params:{},cutoff:'c',snapshots:{US:null,CN:null},catalog:[],reads:[],inputs:[],catalog_version:'v',method_version:'m',code_version:'x'} as StrategyManifest;
  const b=JSON.parse(JSON.stringify({code_version:'x',method_version:'m',catalog_version:'v',inputs:[],reads:[],catalog:[],snapshots:{CN:null,US:null},cutoff:'c',params:{},kind:'transmission'})) as StrategyManifest;
  expect(manifestHash(a)).toBe(manifestHash(b));
  expect(manifestHash({...a,cutoff:'d'})).not.toBe(manifestHash(a));
  expect(manifestHash(a)).toMatch(/^[0-9a-f]{64}$/);
 });
});

describe('calendar helpers',()=>{
 it('month arithmetic and day differences',()=>{
  expect(addMonthsYm('2022-03',-1)).toBe('2022-02');expect(addMonthsYm('2022-11',3)).toBe('2023-02');
  expect(monthEnd('2024-02')).toBe('2024-02-29');expect(prevMonth('2026-01')).toBe('2025-12');
  expect(monthsBetween('2022-03','2023-07')).toBe(16);
  expect(dayDiff('2022-03-10','2022-03-17')).toBe(7);
  expect(addMonthsDate('2024-01-31',1)).toBe('2024-02-29');expect(addMonthsDate('2023-07-26',12)).toBe('2024-07-26');
 });
});

describe('cutoff rules',()=>{
 const us=snap('US','2026-11-03T06:02:00Z',[]),cn=snap('CN','2026-11-04T01:00:00Z',[]);
 it('latestCutoff = later created_at, else the one present, else request time',()=>{
  expect(latestCutoff({US:us,CN:cn},NOW)).toBe('2026-11-04T01:00:00Z');
  expect(latestCutoff({US:us,CN:null},NOW)).toBe('2026-11-03T06:02:00Z');
  expect(latestCutoff({US:null,CN:null},NOW)).toBe('2026-11-05T00:00:00.000Z');
 });
 it('monthCutoff is the 3rd of the next month 00:00:00Z; the baseline is the 3rd of the review month',()=>{
  expect(monthCutoff('2026-02')).toBe('2026-03-03T00:00:00Z');
  expect(monthCutoff('2026-12')).toBe('2027-01-03T00:00:00Z');
  expect(monthCutoff(prevMonth('2026-03'))).toBe('2026-03-03T00:00:00Z');
 });
 it('pinSnapshots fixes the requested snapshot and takes snapshotUpTo for the other region (ties → greatest snapshot_id)',async()=>{
  const cnA={...snap('CN','2026-11-02T00:00:00Z',[]),snapshot_id:'snap:CN:a'};
  const cnB={...snap('CN','2026-11-02T00:00:00Z',[]),snapshot_id:'snap:CN:b'};
  const cnLate=snap('CN','2026-11-04T00:00:00Z',[]);
  const failed=snap('US','2026-11-01T00:00:00Z',[],{status:'failed'});
  const port=memoryStrategyPort(fixture({snapshots:[us,cnA,cnB,cnLate,failed]}));
  const p=await pinSnapshots(port,us.snapshot_id);
  expect(p?.cutoff).toBe('2026-11-03T06:02:00Z');
  expect(p?.snapshots.US?.snapshot_id).toBe(us.snapshot_id);
  expect(p?.snapshots.CN?.snapshot_id).toBe('snap:CN:b');
  expect(await pinSnapshots(port,failed.snapshot_id)).toBeNull();
  expect(await pinSnapshots(port,'snap:none')).toBeNull();
 });
});

describe('snapshotRoles',()=>{
 it('latest = max period_end (highest version), prev = previous period, prev3m = 3 months earlier',()=>{
  const rows=[obs('US_CPI_YOY','2026-06-30','3.0'),obs('US_CPI_YOY','2026-08-31','2.8'),obs('US_CPI_YOY','2026-09-30','2.9'),obs('US_CPI_YOY','2026-09-30','3.1',{version:2})];
  const r=snapshotRoles(rows,()=>'month').get('US_CPI_YOY')!;
  expect(r.latest?.value_text).toBe('3.1');expect(r.prev?.period_end).toBe('2026-08-31');expect(r.prev3m?.period_end).toBe('2026-06-30');
 });
 it('quarterly prev3m is the previous quarter; daily has no prev3m; a missing 3-month row stays absent',()=>{
  const q=snapshotRoles([obs('CN_GDP_YOY','2026-06-30','5.2'),obs('CN_GDP_YOY','2026-09-30','4.8')],()=>'quarter').get('CN_GDP_YOY')!;
  expect(q.prev?.period_end).toBe('2026-06-30');expect(q.prev3m?.period_end).toBe('2026-06-30');
  const d=snapshotRoles([obs('X','2026-09-28','1'),obs('X','2026-06-28','1')],()=>'day').get('X')!;
  expect(d.prev3m).toBeUndefined();
  const m=snapshotRoles([obs('Y','2026-09-30','1'),obs('Y','2026-08-31','1')],()=>'month').get('Y')!;
  expect(m.prev3m).toBeUndefined();
 });
});

describe('manifestBuilder',()=>{
 const cpi=[obs('US_CPI_YOY','2026-08-31','2.8'),obs('US_CPI_YOY','2026-09-30','2.9')];
 const us=snap('US','2026-11-03T06:02:00Z',[cpi[1].observation_id],{historyIds:[cpi[0].observation_id]});
 const unrate=obs('US_UNRATE','2026-09-30','4.1',{availableAt:'2026-10-05T12:00:00Z'});
 const lateUnrate=obs('US_UNRATE','2026-10-31','4.2',{availableAt:'2026-11-06T12:00:00Z'});
 const f=fixture({snapshots:[us],observations:[...cpi,unrate,lateUnrate,...monthly('US_DGS10','2026-07',['4.2','4.3','4.1'])]});
 it('batched snapshot values freeze the same reads and inputs as single values',async()=>{
  const ids=['US_CPI_YOY','US_UNRATE','US_PPI_FD_YOY'];
  const make=async(batch:boolean)=>{const b=manifestBuilder(memoryStrategyPort(f),us.created_at);await b.useSnapshots({US:us,CN:null});if(batch)await b.snapshotValues(ids,'node',['prev']);else for(const id of ids)await b.snapshotValue(id,'node',['prev']);return b.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'});};
  const batched=await make(true),single=await make(false);
  expect(batched.reads).toEqual(single.reads);expect(batched.inputs).toEqual(single.inputs);expect(manifestHash(batched)).toBe(manifestHash(single));
  expect(readState(batched,'US_PPI_FD_YOY','node')).toBe('missing');
 });
 it('takes snapshot rows first (source snapshot) and falls back to latestObservations asOf cutoff (source history)',async()=>{
  const b=manifestBuilder(memoryStrategyPort(f),us.created_at);
  await b.useSnapshots({US:us,CN:null});
  expect((await b.snapshotValue('US_CPI_YOY','node',['prev']))?.value_text).toBe('2.9');
  expect((await b.snapshotValue('US_UNRATE','node'))?.value_text).toBe('4.1');   // 2026-10 row became available after the cutoff
  expect(await b.snapshotValue('US_PPI_FD_YOY','node')).toBeNull();
  const m=b.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(inputsWithRole(m,inputRole('node','US_CPI_YOY','latest'))[0].source).toEqual({kind:'snapshot',snapshot_id:us.snapshot_id});
  expect(inputsWithRole(m,inputRole('node','US_CPI_YOY','prev'))[0].period_end).toBe('2026-08-31');
  expect(inputsWithRole(m,inputRole('node','US_UNRATE','latest'))[0].source).toEqual({kind:'history',as_of:us.created_at});
  expect(readState(m,'US_PPI_FD_YOY','node')).toBe('missing');
  expect(readState(m,'US_CPI_YOY','node')).toBe('ok');
  expect(m.snapshots.US?.snapshot_id).toBe(us.snapshot_id);expect(m.snapshots.CN).toBeNull();
  expect(m.catalog.map(d=>d.id)).toEqual(['US_CPI_YOY','US_PPI_FD_YOY','US_UNRATE']);
  expect(m.catalog_version).toBe(f.catalogVersion);
 });
 it('history records ok / missing / truncated and keeps or drops inputs on request',async()=>{
  const b=manifestBuilder(memoryStrategyPort(f),'2026-11-03T06:02:00Z');
  expect((await b.history('US_DGS10','dim','month_end'))?.map(o=>o.value_text)).toEqual(['4.2','4.3','4.1']);
  expect(await b.history('US_WTI','dim','month_end')).toEqual([]);
  await b.history('US_DGS10','events','history',{keepInputs:false});
  const t=manifestBuilder(override(memoryStrategyPort(f),{seriesHistory:async()=>{throw new Error('truncated');}}),'2026-11-03T06:02:00Z');
  expect(await t.history('US_DGS10','dim','month_end')).toBeNull();
  const m=b.build({kind:'policy_response',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(readState(m,'US_DGS10','dim')).toBe('ok');expect(readState(m,'US_WTI','dim')).toBe('missing');
  expect(inputsWithRole(m,inputRole('dim','US_DGS10','month_end'))).toHaveLength(3);
  expect(m.inputs.some(i=>i.role.startsWith('events:'))).toBe(false);
  expect(readState(t.build({kind:'policy_response',params:{},methodVersion:'m/1',codeVersion:'test'}),'US_DGS10','dim')).toBe('truncated');
 });
 it('latestObservations: a truncated read records truncated without inputs; an ordinary port error propagates',async()=>{
  const t=manifestBuilder(override(memoryStrategyPort(f),{latestObservations:async()=>{throw new Error('truncated');}}),'2026-11-03T06:02:00Z');
  expect(await t.snapshotValue('US_DGS10','node')).toBeNull();
  const m=t.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(readState(m,'US_DGS10','node')).toBe('truncated');expect(m.inputs).toEqual([]);
  const down=manifestBuilder(override(memoryStrategyPort(f),{latestObservations:async()=>{throw new Error('connection reset');}}),'2026-11-03T06:02:00Z');
  await expect(down.snapshotValue('US_DGS10','node')).rejects.toThrow('connection reset');   // unavailable infrastructure is not incomplete evidence
 });
 it('uses the first returned row when latestObservations repeats a series',async()=>{
  const base=memoryStrategyPort(f),first=obs('US_UNRATE','2026-09-30','1'),second=obs('US_UNRATE','2026-10-31','2');
  const port=override(base,{latestObservations:async()=>[first,second]});
  const b=manifestBuilder(port,us.created_at);
  expect((await b.snapshotValues(['US_UNRATE'],'node')).get('US_UNRATE')?.observation_id).toBe(first.observation_id);
  expect(inputsWithRole(b.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'}),inputRole('node','US_UNRATE','latest'))[0].observation_id).toBe(first.observation_id);
 });
 it('batched truncated fallback matches per-id reads and keeps other ids when one truncates',async()=>{
  const base=memoryStrategyPort(f),ids=['US_UNRATE','US_DGS10','US_WTI'];
  const run=async(specific=false)=>{
   const port=override(base,{latestObservations:async(batch,o)=>{
    if(batch.length>1||specific&&batch[0]==='US_DGS10')throw new Error('truncated');
    return base.latestObservations(batch,o);
   }});
   const b=manifestBuilder(port,us.created_at);const values=await b.snapshotValues(ids,'node');
   return {values,manifest:b.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'})};
  };
  const batched=await run(),single=manifestBuilder(base,us.created_at);
  for(const id of ids)await single.snapshotValue(id,'node');
  const expected=single.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(batched.manifest.reads).toEqual(expected.reads);expect(batched.manifest.inputs).toEqual(expected.inputs);
  expect(manifestHash(batched.manifest)).toBe(manifestHash(expected));
  const partial=await run(true);expect(readState(partial.manifest,'US_DGS10','node')).toBe('truncated');
  expect(readState(partial.manifest,'US_UNRATE','node')).toBe('ok');expect(readState(partial.manifest,'US_WTI','node')).toBe('missing');
 });
 it('history: an ordinary port error propagates and records no read state',async()=>{
  const down=manifestBuilder(override(memoryStrategyPort(f),{seriesHistory:async()=>{throw new Error('connection reset');}}),'2026-11-03T06:02:00Z');
  await expect(down.history('US_DGS10','dim','month_end')).rejects.toThrow('connection reset');
  expect(readState(down.build({kind:'policy_response',params:{},methodVersion:'m/1',codeVersion:'test'}),'US_DGS10','dim')).toBeNull();
 });
 it('batches both snapshot id sets and isolates an incomplete region',async()=>{
  const usRows=monthly('US_UNRATE','2026-08',['4','4.1']);
  const cnRows=monthly('CN_CGB_10Y','2026-09',['1.8']);
  const us=snap('US','2026-10-15T00:00:00Z',usRows.map(o=>o.observation_id));
  const cn=snap('CN','2026-10-10T00:00:00Z',[cnRows[0].observation_id,'unknown']);
  const base=memoryStrategyPort(fixture({observations:[...usRows,...cnRows]}));
  const calls:string[][]=[];
  const b=manifestBuilder(override(base,{observationsByIds:async ids=>{calls.push(ids);return base.observationsByIds(ids);}}),us.created_at);
  await b.useSnapshots({US:us,CN:cn});
  const values=await b.snapshotValues(['US_UNRATE','CN_CGB_10Y'],'node',['prev']);
  expect(values.get('US_UNRATE')).toEqual(usRows[1]);
  expect(values.get('CN_CGB_10Y')).toBeNull();
  const m=b.build({kind:'transmission',params:{region:'US'},methodVersion:'m',codeVersion:'c'});
  expect(m.inputs.map(i=>i.observation_id).sort()).toEqual(usRows.map(o=>o.observation_id).sort());
  expect(readState(m,'CN_CGB_10Y','node')).toBe('truncated');
  expect(readState(m,'US_UNRATE','node')).toBe('ok');
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual([...us.observation_ids,...cn.observation_ids]);
 });
 it('useSnapshots({loadRows:false}) freezes the snapshot records without fetching observations',async()=>{
  let fetched=0;
  const port=override(memoryStrategyPort(f),{observationsByIds:async()=>{fetched++;return [];}});
  const b=manifestBuilder(port,us.created_at);
  await b.useSnapshots({US:us,CN:null},{loadRows:false});
  expect(fetched).toBe(0);
  const m=b.build({kind:'explain_facts',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(m.snapshots.US?.snapshot_id).toBe(us.snapshot_id);expect(m.snapshots.CN).toBeNull();
  expect(m.reads).toEqual([]);expect(m.inputs).toEqual([]);
 });
 it('an unresolved snapshot id makes the region incomplete: no promotion of the comparison row, no history fallback',async()=>{
  // the latest CPI row of the snapshot is gone (quarantined): only the 2026-08 comparison row resolves
  const gone=fixture({snapshots:[us],observations:[{...cpi[1],status:'quarantined'},cpi[0],unrate]});
  const b=manifestBuilder(memoryStrategyPort(gone),us.created_at);
  await b.useSnapshots({US:us,CN:null});
  expect(await b.snapshotValue('US_CPI_YOY','node',['prev'])).toBeNull();
  expect(await b.snapshotValue('US_UNRATE','node')).toBeNull();               // same region: incomplete too, no latestObservations fallback
  const m=b.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(readState(m,'US_CPI_YOY','node')).toBe('truncated');
  expect(readState(m,us.snapshot_id,SNAPSHOT_ROWS_PURPOSE)).toBe('missing');
  expect(m.inputs).toEqual([]);                                               // 2026-08 is never reported as 'latest'
  const ok=manifestBuilder(memoryStrategyPort(f),us.created_at);await ok.useSnapshots({US:us,CN:null});
  expect(ok.build({kind:'transmission',params:{},methodVersion:'m/1',codeVersion:'test'}).reads).toEqual([]);   // fully resolved: no snapshot_rows read
 });
 it('keep freezes chosen history rows under <purpose>:<series>:<tag> with source history',async()=>{
  const b=manifestBuilder(memoryStrategyPort(f),'2026-11-03T06:02:00Z');
  const rows=(await b.history('US_DGS10','events','history',{keepInputs:false}))!;
  b.keep([rows[1]],'events','evidence');
  const m=b.build({kind:'cycle_table',params:{},methodVersion:'m/1',codeVersion:'test'});
  expect(m.inputs).toEqual([expect.objectContaining({role:inputRole('events','US_DGS10','evidence'),observation_id:rows[1].observation_id,source:{kind:'history',as_of:'2026-11-03T06:02:00Z'}})]);
 });
 it('is deterministic: same reads in another order give the same hash',async()=>{
  const p=memoryStrategyPort(f);
  const b1=manifestBuilder(p,us.created_at),b2=manifestBuilder(p,us.created_at);
  await b1.useSnapshots({US:us,CN:null});await b2.useSnapshots({US:us,CN:null});
  await b1.snapshotValue('US_CPI_YOY','node');await b1.snapshotValue('US_UNRATE','node');
  await b2.snapshotValue('US_UNRATE','node');await b2.snapshotValue('US_CPI_YOY','node');
  const a={kind:'transmission' as const,params:{},methodVersion:'m/1',codeVersion:'test'};
  expect(manifestHash(b1.build(a))).toBe(manifestHash(b2.build(a)));
 });
});
