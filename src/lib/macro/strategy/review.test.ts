// src/lib/macro/strategy/review.test.ts
import {describe,expect,it} from 'vitest';
import type {Fact,ObservationRow,SnapshotRecord} from './contract';
import {memoryStrategyDb} from './db';
import {assertMonth,assetColumns,buildReviewManifest,reviewFromManifest,runReview} from './review';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {daily,fixture,monthly,obs,snap} from './testing/fixture';

// Baseline snapshot (2026-09-14) holds August data; the October snapshot (2026-10-15) holds September data, a revised
// August unemployment rate (still the latest period: September not yet released) and nothing else new.
const BASE_ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7']),obs('US_UNRATE','2026-08-31','4.2'),...monthly('US_DGS10','2026-08',['4.23']),...monthly('US_DTWEXBGS','2026-08',['121.2'])];
const CUR_ROWS=[...monthly('US_CPI_YOY','2026-09',['2.9']),obs('US_UNRATE','2026-08-31','4.3',{version:2,availableAt:'2026-10-02T12:00:00Z'}),...monthly('US_DGS10','2026-09',['4.16']),...monthly('US_DTWEXBGS','2026-09',['120.5'])];
const MONTH_ENDS=[...monthly('US_WTI','2026-09',['62','60.5']),obs('US_DGS10','2026-10-31','4.08'),obs('US_DTWEXBGS','2026-10-31','121')];
// cuts 2025-09-17, 2025-10-29, 2025-12-10 (an ongoing cut episode at the baseline), then a hike on 2026-10-28
const EVENT_DAYS:[string,string,string][]=[['2025-09-16','4.5','4.25'],['2025-09-17','4.25','4'],['2025-10-29','4','3.75'],['2025-12-10','3.75','3.5'],['2026-10-28','4','3.75']];
const EVENTS=[...daily('US_FED_TARGET_UPPER_D',EVENT_DAYS.map(([d,u])=>[d,u])),...daily('US_FED_TARGET_LOWER_D',EVENT_DAYS.map(([d,,l])=>[d,l]))];
const BASE_SNAP=snap('US','2026-09-14T06:00:00Z',BASE_ROWS.map(o=>o.observation_id));
const CUR_SNAP=snap('US','2026-10-15T06:00:00Z',CUR_ROWS.map(o=>o.observation_id),{counts:{verified:21,missing:4,restricted:5}});
function port(snapshots:SnapshotRecord[]=[BASE_SNAP,CUR_SNAP],extra:ObservationRow[]=[]){
 return memoryStrategyPort(fixture({snapshots,observations:[...BASE_ROWS,...CUR_ROWS,...MONTH_ENDS,...EVENTS,...extra]}));
}
const ids=(fs:Fact[])=>fs.map(f=>f.fact_id);
const byId=(fs:Fact[])=>new Map(fs.map(f=>[f.fact_id,f]));

describe('month parameter',()=>{
 it('accepts YYYY-MM with a real month only',async()=>{
  expect(()=>assertMonth('2026-10')).not.toThrow();
  for(const bad of ['2026-13','2026-00','2026-1','26-10'])expect(()=>assertMonth(bad)).toThrow(`invalid_month:${bad}`);
  await expect(buildReviewManifest(port(),'US','2026-13','c')).rejects.toThrow('invalid_month:2026-13');
 });
 it('January reviews use the previous December as the baseline',async()=>{
  const m=await buildReviewManifest(port(),'US','2027-01','c');
  expect(m.cutoff).toBe('2027-02-03T00:00:00Z');expect(m.baseline?.cutoff).toBe('2027-01-03T00:00:00Z');
 });
});

describe('buildReviewManifest (spec §6.2 清单)',()=>{
 it('freezes both snapshots, month-end assets at both cutoffs, all events to the cutoff, timeliness at the cutoff date',async()=>{
  const p=port();const m=await buildReviewManifest(p,'US','2026-10','test-code');
  expect(m.kind).toBe('review');expect(m.params).toEqual({region:'US',month:'2026-10'});
  expect(m.cutoff).toBe('2026-11-03T00:00:00Z');
  expect(m.baseline?.cutoff).toBe('2026-10-03T00:00:00Z');
  expect(m.snapshots.US?.snapshot_id).toBe(CUR_SNAP.snapshot_id);expect(m.snapshots.CN).toBeNull();
  expect(m.baseline?.US?.snapshot_id).toBe(BASE_SNAP.snapshot_id);
  expect(m.method_version).toBe('macro-review/1');
  expect(m.inputs.find(i=>i.role==='review:US_UNRATE:latest')).toMatchObject({version:2,value_text:'4.3'});
  expect(m.inputs.find(i=>i.role==='review_base:US_UNRATE:latest')).toMatchObject({version:1,value_text:'4.2'});
  expect(m.inputs.find(i=>i.role==='asset_end:US_DGS10:month_end')).toMatchObject({series_id:'US_DGS10',period_end:'2026-10-31',value_text:'4.08',source:{kind:'history',as_of:'2026-11-03T00:00:00Z'}});
  expect(m.inputs.find(i=>i.role==='asset_base:US_WTI:month_end')).toMatchObject({period_end:'2026-09-30',value_text:'62',source:{kind:'history',as_of:'2026-10-03T00:00:00Z'}});
  expect(m.reads).toContainEqual({series_id:'US_UNRATE',purpose:'review_base',state:'ok'});
  expect(m.events?.map(e=>e.effective_date)).toEqual(['2025-09-17','2025-10-29','2025-12-10','2026-10-28']);
  const unrate=p.catalog().find(d=>d.id==='US_UNRATE')!;
  expect(m.timeliness).toContainEqual({series_id:'US_UNRATE',state:p.timeliness(unrate,'2026-08-31','2026-11-03')});
  expect(m.catalog.some(d=>d.id==='US_ISM_PMI'&&d.status==='missing')).toBe(true);
 });
 it('an asset whose latest observation at the cutoff is not that month-end is not frozen (read state missing)',async()=>{
  const m=await buildReviewManifest(port([BASE_SNAP,CUR_SNAP]),'US','2026-11','c');
  expect(m.inputs.find(i=>i.role==='asset_end:US_WTI:month_end')).toBeUndefined();
  expect(m.reads).toContainEqual({series_id:'US_WTI',purpose:'asset_end',state:'missing'});
  expect(byId(reviewFromManifest(m).facts.asset_moves).get('mv:US_WTI')).toMatchObject({template:'asset_missing',slots:{reason:'out_of_coverage',base_month:'2026-10',month:'2026-11'}});
 });
});

describe('reviewFromManifest — seven sections (spec §6.2)',()=>{
 it('releases, revisions (latest period only), timeliness, events, episodes opened/ended, asset moves, coverage',async()=>{
  const p=port();const m=await buildReviewManifest(p,'US','2026-10','c');const {status,facts}=reviewFromManifest(m);
  expect(status).toBe('ok');
  expect(facts).toMatchObject({region:'US',month:'2026-10',cutoff:'2026-11-03T00:00:00Z',baseline_cutoff:'2026-10-03T00:00:00Z',snapshot_id:CUR_SNAP.snapshot_id,baseline_snapshot_id:BASE_SNAP.snapshot_id,baseline_missing:false});
  const rel=byId(facts.releases);
  expect(rel.get('rel:US_CPI_YOY')).toMatchObject({template:'release',slots:{prev_period:'2026-08-31',prev_value:{value_text:'2.7',unit:'pct'},period:'2026-09-30',value:{value_text:'2.9',unit:'pct'}}});
  expect(rel.has('rel:US_UNRATE')).toBe(false);
  expect(ids(facts.revisions)).toEqual(['rev:US_UNRATE']);
  expect(facts.revisions[0].slots).toMatchObject({period:'2026-08-31',from:{value_text:'4.2',unit:'pct'},to:{value_text:'4.3',unit:'pct'}});
  expect(facts.revisions[0].source_inputs).toEqual(['review_base:US_UNRATE:latest','review:US_UNRATE:latest']);
  const lateOrMissing=(m.timeliness??[]).filter(t=>t.state==='late'||t.state==='missing').map(t=>`tml:${t.series_id}`);
  expect(ids(facts.timeliness)).toEqual(lateOrMissing);
  expect(ids(facts.timeliness)).toContain('tml:US_UNRATE');
  expect(byId(facts.timeliness).get('tml:US_UNRATE')).toMatchObject({template:'timeliness_late',slots:{date:'2026-11-03',period:'2026-08-31'}});
  expect(ids(facts.policy_events)).toEqual(['evt:2026-10-28']);
  expect(ids(facts.episode_changes)).toEqual(['ep:cut:2025-09-17:ended','ep:hike:2026-10-28:opened']);
  expect(facts.episode_changes[0].slots).toMatchObject({direction:'cut',start:'2025-09-17',end:'2025-12-10',events:{value_text:'3',unit:'count'},cumulative:{value_text:'-75',unit:'bp'}});
  const mv=byId(facts.asset_moves);
  expect(mv.get('mv:US_UST10Y')).toMatchObject({template:'asset_move',slots:{base_period:'2026-09-30',period:'2026-10-31',change:{value_text:'-8',unit:'bp'}}});
  expect(mv.get('mv:US_WTI')?.slots.change).toEqual({value_text:'60.5/62',unit:'pct_ratio'});
  expect(mv.get('mv:US_DTWEXBGS')?.slots.change).toEqual({value_text:'121/120.5',unit:'pct_ratio'});
  expect(mv.has('mv:US_SP500')).toBe(false);
  expect(byId(facts.coverage).get('cov:counts')?.slots).toEqual({verified:{value_text:'21',unit:'count'},missing:{value_text:'4',unit:'count'},restricted:{value_text:'5',unit:'count'}});
  expect(ids(facts.coverage)).toEqual(expect.arrayContaining(['cov:US_ISM_PMI','cov:US_SP500']));
 });
 it('no snapshot at the cutoff → insufficient; snapshot sections empty; events and episodes still computed',async()=>{
  const {status,facts}=reviewFromManifest(await buildReviewManifest(port([]),'US','2026-10','c'));
  expect(status).toBe('insufficient');
  expect(facts.snapshot_id).toBeNull();expect(facts.baseline_missing).toBe(true);
  expect(facts.releases).toEqual([]);expect(facts.revisions).toEqual([]);expect(facts.timeliness).toEqual([]);expect(facts.coverage).toEqual([]);
  expect(ids(facts.policy_events)).toEqual(['evt:2026-10-28']);
 });
 it('a truncated event history is an explicit events_truncated fact in sections 4 and 5, never an empty section',async()=>{
  const m=await buildReviewManifest(port(),'US','2026-10','c');
  const cut={...m,events:[],gaps:[{kind:'history_truncated' as const,reason:'US_FED_TARGET_UPPER_D',near:'2026-11-03'}]};
  const {facts}=reviewFromManifest(cut);
  expect(facts.policy_events).toEqual([{fact_id:'evt:truncated',kind:'coverage',template:'events_truncated',slots:{date:'2026-11-03',sources:'US_FED_TARGET_UPPER_D'},source_inputs:[]}]);
  expect(ids(facts.episode_changes)).toEqual(['ep:truncated']);
  expect(ids(facts.releases)).toEqual(ids(reviewFromManifest(m).facts.releases));   // other sections unaffected
 });
 it('missing baseline → sections 1 and 2 empty and flagged; the rest as usual',async()=>{
  const {status,facts}=reviewFromManifest(await buildReviewManifest(port([CUR_SNAP]),'US','2026-10','c'));
  expect(status).toBe('ok');expect(facts.baseline_missing).toBe(true);
  expect(facts.releases).toEqual([]);expect(facts.revisions).toEqual([]);
  expect(facts.coverage.length).toBeGreaterThan(0);
 });
 it('a series absent from the baseline snapshot is a first release',async()=>{
  const thin=snap('US','2026-09-14T06:00:00Z',BASE_ROWS.filter(o=>o.series_id!=='US_CPI_YOY').map(o=>o.observation_id));
  const {facts}=reviewFromManifest(await buildReviewManifest(port([thin,CUR_SNAP]),'US','2026-10','c'));
  expect(byId(facts.releases).get('rel:US_CPI_YOY')?.template).toBe('release_first');
 });
 it('an incomplete baseline read (unresolved snapshot id) yields no release_first / revision, only explicit baseline_unavailable facts',async()=>{
  const broken=snap('US','2026-09-14T06:00:00Z',[...BASE_ROWS.map(o=>o.observation_id),'obs:not-in-store']);
  const m=await buildReviewManifest(port([broken,CUR_SNAP]),'US','2026-10','c');
  expect(m.reads).toContainEqual({series_id:'US_CPI_YOY',purpose:'review_base',state:'truncated'});
  const {facts}=reviewFromManifest(m);
  expect(facts.releases).toEqual([]);expect(facts.revisions).toEqual([]);
  const gap=byId(facts.coverage).get('cov:base:US_CPI_YOY');
  expect(gap).toMatchObject({kind:'coverage',template:'baseline_unavailable',slots:{series:'US_CPI_YOY',state:'truncated'},series_id:'US_CPI_YOY',source_inputs:['review:US_CPI_YOY:latest']});
  expect(ids(facts.coverage)).toEqual(expect.arrayContaining(['cov:base:US_UNRATE','cov:counts']));
  expect(facts.baseline_missing).toBe(false);
 });
 it('every emitted source_inputs entry is a manifest input role (event and episode facts included)',async()=>{
  const m=await buildReviewManifest(port(),'US','2026-10','c');
  const roles=new Set(m.inputs.map(i=>i.role));
  const f=reviewFromManifest(m).facts;
  const all=[...f.releases,...f.revisions,...f.timeliness,...f.policy_events,...f.episode_changes,...f.asset_moves,...f.coverage];
  expect(f.policy_events.length+f.episode_changes.length).toBeGreaterThan(0);
  for(const fact of all)for(const r of fact.source_inputs)expect(roles.has(r),`${fact.fact_id}:${r}`).toBe(true);
  expect(byId(f.policy_events).get('evt:2026-10-28')?.source_inputs).toEqual(['events:US_FED_TARGET_LOWER_D:evidence','events:US_FED_TARGET_UPPER_D:evidence']);
 });
 it('non-positive base on a pct asset → asset_missing(non_positive_base)',async()=>{
  const m=await buildReviewManifest(port(),'US','2026-10','c');
  const bad={...m,inputs:m.inputs.map(i=>i.role==='asset_base:US_WTI:month_end'?{...i,value_text:'-5'}:i)};
  expect(byId(reviewFromManifest(bad).facts.asset_moves).get('mv:US_WTI')).toMatchObject({template:'asset_missing',slots:{reason:'non_positive_base'}});
 });
 it('is a pure function of the manifest (JSON round trip gives the same facts) and rejects other kinds',async()=>{
  const m=await buildReviewManifest(port(),'US','2026-10','c');
  expect(reviewFromManifest(JSON.parse(JSON.stringify(m)))).toEqual(reviewFromManifest(m));
  expect(()=>reviewFromManifest({...m,kind:'transmission'})).toThrow('not_review_manifest:transmission');
 });
 it('asset columns: active monthly assets plus the perspective series; restricted excluded; aliasOf resolved',()=>{
  const cols=assetColumns(port().catalog(),'US');
  const byCol=new Map(cols.map(c=>[c.def.id,c]));
  expect(byCol.get('US_UST10Y')).toMatchObject({readId:'US_DGS10',kind:'bp'});
  expect(byCol.get('US_DTWEXBGS')).toMatchObject({readId:'US_DTWEXBGS',kind:'pct'});
  expect(byCol.has('US_SP500')).toBe(false);
 });
});

describe('runReview (spec §6.2 生成)',()=>{
 it('first run advances to generation 1; the same inputs replay; preview writes nothing',async()=>{
  const db=memoryStrategyDb();const deps={port:port(),db,codeVersion:'c'};
  const pre=await runReview(deps,'US','2026-10',{preview:true});
  expect(pre).toMatchObject({outcome:'preview',status:'ok',result_id:null,generation:0});
  expect(pre.manifest_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(await db.reviewCurrent('US','2026-10')).toBeNull();
  const a=await runReview(deps,'US','2026-10',{preview:false});
  expect(a).toMatchObject({outcome:'advanced',generation:1,status:'ok',manifest_hash:pre.manifest_hash});
  const b=await runReview(deps,'US','2026-10',{preview:false});
  expect(b).toMatchObject({outcome:'replayed',generation:1,result_id:a.result_id});
  const cur=await db.reviewCurrent('US','2026-10');
  expect(cur?.result.facts.policy_events.map(f=>f.fact_id)).toEqual(['evt:2026-10-28']);
 });
 it('a failure records a failed attempt and leaves the pointer untouched',async()=>{
  const db=memoryStrategyDb();const attempts:unknown[]=[];
  db.recordReviewAttempt=async(region,month,status,error)=>{attempts.push({region,month,status,error});};
  const broken:StrategyReadPort=port();broken.snapshotUpTo=async()=>{throw new Error('truncated');};
  const r=await runReview({port:broken,db,codeVersion:'c'},'US','2026-10',{preview:false});
  expect(r).toMatchObject({outcome:'failed',error:'truncated',result_id:null});
  expect(attempts).toEqual([{region:'US',month:'2026-10',status:'failed',error:{message:'truncated'}}]);
  expect(await db.reviewCurrent('US','2026-10')).toBeNull();
 });
});
