// src/lib/macro/strategy/facts.test.ts
import {describe,expect,it} from 'vitest';
import type {Fact,StrategyManifest} from './contract';
import {buildSnapshotFactsManifest,explanationFacts,flattenReviewFacts,levelIndicators,reviewFactsManifest,snapshotFacts,typedChange} from './facts';
import {memoryStrategyPort} from './port';
import {daily,FIXTURE_CATALOG,fixture,monthly,snap} from './testing/fixture';

const US_ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7','2.9']),...monthly('US_UNRATE','2026-09',['4.3']),
 ...monthly('US_DGS10','2026-08',['4.23','4.16']),...monthly('US_DTWEXBGS','2026-08',['121.2','120.5'])];
const EVENTS=[...daily('US_FED_TARGET_UPPER_D',[['2025-12-11','3.75'],['2026-09-18','4']]),...daily('US_FED_TARGET_LOWER_D',[['2025-12-11','3.5'],['2026-09-18','3.75']])];
const US_SNAP=snap('US','2026-10-15T06:00:00Z',US_ROWS.map(o=>o.observation_id));
function setup(cnRows=monthly('CN_CGB_10Y','2026-09',['1.85']),withCnSnap=true){
 const cnSnap=snap('CN','2026-10-10T06:00:00Z',cnRows.map(o=>o.observation_id));
 return memoryStrategyPort(fixture({snapshots:[US_SNAP,...(withCnSnap?[cnSnap]:[])],observations:[...US_ROWS,...cnRows,...EVENTS]}));
}
const build=async(p=setup()):Promise<StrategyManifest>=>{const m=await buildSnapshotFactsManifest(p,US_SNAP.snapshot_id,'test-code');if(!m)throw new Error('no manifest');return m;};
const byId=(fs:Fact[])=>new Map(fs.map(f=>[f.fact_id,f]));

describe('typed changes and level indicators (spec §6.1, P1 change kinds)',()=>{
 it('bp / pp / points are exact decimals; pct is the exact ratio (rounded once at render); non-positive base → null',()=>{
  expect(typedChange('bp','4.23','4.16')).toEqual({value_text:'-7',unit:'bp'});
  expect(typedChange('pp','2.7','2.9')).toEqual({value_text:'0.2',unit:'pp'});
  expect(typedChange('points','49.8','50.1')).toEqual({value_text:'0.3',unit:'points'});
  expect(typedChange('pct','100','110')).toEqual({value_text:'110/100',unit:'pct_ratio'});
  expect(typedChange('pct','121.2','120.5')).toEqual({value_text:'120.5/121.2',unit:'pct_ratio'});
  expect(typedChange('pct','0','1')).toBeNull();
  expect(typedChange('pct','-1','1')).toBeNull();
 });
 it('level indicators exclude daily natives and derive sources (raw indices)',()=>{
  const ids=levelIndicators(FIXTURE_CATALOG,'US').map(d=>d.id);
  expect(ids).toEqual(expect.arrayContaining(['US_CPI_YOY','US_UNRATE','US_DGS10','US_DTWEXBGS','US_ISM_PMI']));
  for(const x of ['US_DGS10_D','US_CPI_INDEX','US_WTI','US_FED_TARGET_UPPER_D'])expect(ids).not.toContain(x);
 });
});

describe('buildSnapshotFactsManifest + snapshotFacts (spec §4.5 快照解读的清单, §6.1)',()=>{
 it('pins the requested snapshot: cutoff = its created_at, peer = snapshotUpTo(peer, cutoff)',async()=>{
  const m=await build();
  expect(m.kind).toBe('explain_facts');
  expect(m.cutoff).toBe('2026-10-15T06:00:00Z');
  expect(m.params).toEqual({subject_kind:'snapshot',snapshot_id:US_SNAP.snapshot_id,region:'US'});
  expect(m.snapshots.US?.snapshot_id).toBe(US_SNAP.snapshot_id);
  expect(m.snapshots.CN?.snapshot_id).toBe('snap:CN:2026-10-10T06:00:00Z');
  expect(m.method_version).toBe('macro-facts/1');expect(m.code_version).toBe('test-code');
  expect(m.inputs.find(i=>i.role==='level:US_CPI_YOY:latest')).toMatchObject({period_end:'2026-09-30',value_text:'2.9',source:{kind:'snapshot',snapshot_id:US_SNAP.snapshot_id}});
  expect(m.inputs.find(i=>i.role==='level:US_CPI_YOY:prev')).toMatchObject({period_end:'2026-08-31',value_text:'2.7'});
  expect(m.events?.map(e=>e.effective_date)).toEqual(['2026-09-18']);
  expect(m.facts).toEqual(snapshotFacts(m));                                   // the model's fact list is frozen in the manifest
  expect(explanationFacts(m)).toBe(m.facts);
 });
 it('unknown or failed snapshot → null',async()=>{
  expect(await buildSnapshotFactsManifest(setup(),'snap:US:nope','c')).toBeNull();
  const failed=snap('US','2026-10-16T06:00:00Z',[],{status:'failed'});
  expect(await buildSnapshotFactsManifest(memoryStrategyPort(fixture({snapshots:[failed]})),failed.snapshot_id,'c')).toBeNull();
 });
 it('level, typed change, spread node and the latest policy event; no judgment field anywhere',async()=>{
  const f=byId(snapshotFacts(await build()));
  expect(f.get('obs:US_CPI_YOY')).toMatchObject({kind:'level',template:'level',slots:{series:'US_CPI_YOY',period:'2026-09-30',value:{value_text:'2.9',unit:'pct'}},source_inputs:['level:US_CPI_YOY:latest']});
  expect(f.get('chg:US_CPI_YOY')).toMatchObject({kind:'change',slots:{change:{value_text:'0.2',unit:'pp'},prev_period:'2026-08-31'},source_inputs:['level:US_CPI_YOY:prev','level:US_CPI_YOY:latest']});
  expect(f.get('chg:US_DGS10')?.slots.change).toEqual({value_text:'-7',unit:'bp'});
  expect(f.get('chg:US_DTWEXBGS')?.slots.change).toEqual({value_text:'120.5/121.2',unit:'pct_ratio'});
  expect(f.has('obs:US_UNRATE')).toBe(true);expect(f.has('chg:US_UNRATE')).toBe(false);
  expect(f.has('obs:US_ISM_PMI')).toBe(false);
  expect(f.get('node:spread_us_cn_10y')).toMatchObject({kind:'derived',template:'derived_spread',slots:{a:'US_DGS10',b:'CN_CGB_10Y',period:'2026-09-30',value:{value_text:'2.31',unit:'pp_level'}},source_inputs:['spread:US_DGS10:latest','spread:CN_CGB_10Y:latest']});
  expect(f.get('evt:2026-09-18')).toMatchObject({kind:'policy_event',slots:{upper_from:{value_text:'3.75',unit:'pct'},upper_to:{value_text:'4',unit:'pct'},change:{value_text:'25',unit:'bp'}}});
  expect(JSON.stringify([...f.values()])).not.toMatch(/judgment|regime|f4/i);
 });
 it('spread is omitted when the two inputs have different period_end',async()=>{
  expect(byId(snapshotFacts(await build(setup(monthly('CN_CGB_10Y','2026-08',['1.9']))))).has('node:spread_us_cn_10y')).toBe(false);
 });
 it('peer region without a snapshot reads latestObservations as of the cutoff (source history)',async()=>{
  const m=await build(setup(monthly('CN_CGB_10Y','2026-09',['1.85']),false));
  expect(m.snapshots.CN).toBeNull();
  expect(m.inputs.find(i=>i.role==='spread:CN_CGB_10Y:latest')?.source).toEqual({kind:'history',as_of:'2026-10-15T06:00:00Z'});
 });
 it('rejects a manifest that is not a snapshot facts manifest',async()=>{
  const m=await build();
  expect(()=>snapshotFacts({...m,kind:'review'})).toThrow('not_snapshot_facts_manifest:review');
  expect(()=>snapshotFacts({...m,params:{...m.params,subject_kind:'review'}})).toThrow('not_snapshot_facts_manifest');
 });
});

describe('review explanation manifest and facts',()=>{
 const f=(id:string):Fact=>({fact_id:id,kind:'coverage',template:'coverage',slots:{},source_inputs:[]});
 const facts={region:'US' as const,month:'2026-10',cutoff:'',baseline_cutoff:'',snapshot_id:null,baseline_snapshot_id:null,baseline_missing:true,
  releases:[f('a')],revisions:[f('b')],timeliness:[f('c')],policy_events:[f('d')],episode_changes:[f('e')],asset_moves:[f('f')],coverage:[f('g')]};
 it('flattenReviewFacts keeps the seven sections in spec §6.2 order',()=>{
  expect(flattenReviewFacts(facts).map(x=>x.fact_id)).toEqual(['a','b','c','d','e','f','g']);
 });
 it('reviewFactsManifest re-keys the stored review manifest as explain_facts for that result',async()=>{
  const body={...(await build()),kind:'review' as const,params:{region:'US',month:'2026-10'}};
  const stored={manifest_id:'m-1',manifest_hash:'h',body,created_at:'2026-11-03T06:00:00Z'};
  const result={result_id:'r-1',region:'US' as const,month:'2026-10',status:'ok' as const,manifest_id:'m-1',manifest_hash:'h',facts,method_version:'macro-review/1',code_version:'c',created_at:''};
  const m=reviewFactsManifest(stored,result,'code-2');
  expect(m).toMatchObject({kind:'explain_facts',params:{region:'US',month:'2026-10',subject_kind:'review',result_id:'r-1',review_manifest_id:'m-1'},method_version:'macro-facts/1',code_version:'code-2',cutoff:body.cutoff});
  expect(m.inputs).toEqual(body.inputs);
  expect(m.facts).toEqual(flattenReviewFacts(facts));                         // frozen: the explanation needs neither the result nor the pointer
  expect(explanationFacts(JSON.parse(JSON.stringify(m)))).toEqual(flattenReviewFacts(facts));
  expect(()=>reviewFactsManifest(stored,{...result,manifest_id:'other'},'c')).toThrow('review_manifest_mismatch');
 });
 it('explanationFacts reads only body.facts of an explain_facts manifest',async()=>{
  const m=await build();
  expect(()=>explanationFacts({...m,facts:undefined})).toThrow('not_explain_facts_manifest:explain_facts');
  expect(()=>explanationFacts({...m,kind:'review'})).toThrow('not_explain_facts_manifest:review');
  const altered={...m,inputs:[]};                                             // inputs no longer matter once facts are frozen
  expect(explanationFacts(altered)).toEqual(m.facts);
 });
});
