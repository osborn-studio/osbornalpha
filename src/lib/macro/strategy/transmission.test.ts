// transmission.ts (spec §5.1): node states, same-period / different-period spread, alias reads, assumption edges, manifest.
import {describe,expect,it} from 'vitest';
import type {NodeView,Region,StoredManifest,StrategyManifest} from './contract';
import {PLAYBOOKS_V1} from './data/playbooks-v1';
import {TRANSMISSION_V1} from './data/transmission-v1';
import {manifestHash} from './manifest';
import {memoryStrategyPort} from './port';
import {FIXTURE_CATALOG,fixture,obs,snap} from './testing/fixture';
import {buildTransmission,buildTransmissionManifest,nodeView,type StageDef} from './transmission';

const NOW=new Date('2026-11-05T00:00:00Z');
const stored=(body:StrategyManifest):StoredManifest=>({manifest_id:'00000000-0000-4000-8000-000000000001',manifest_hash:manifestHash(body),body,created_at:'2026-11-05T00:00:00Z'});
const node=(v:ReturnType<typeof buildTransmission>,id:string):NodeView=>{for(const s of v.stages)for(const n of s.nodes)if(n.id===id)return n;throw new Error(`no node ${id}`);};

function scenario(o:{cgbPeriod?:string}={}){
 const usRows=[obs('US_CPI_YOY','2026-09-30','2.9'),obs('US_DGS10','2026-10-31','4.10'),obs('US_DFF','2026-10-31','4.33')];
 const cnRows=[obs('CN_CGB_10Y',o.cgbPeriod??'2026-10-31','1.85'),obs('CN_PMI_MFG','2026-10-31','49.8')];
 const unrate=obs('US_UNRATE','2026-09-30','4.1',{availableAt:'2026-10-04T12:00:00Z'});
 const cgbHist=obs('CN_CGB_10Y','2026-08-31','1.70');
 const us=snap('US','2026-11-03T06:02:00Z',usRows.map(r=>r.observation_id));
 const cn=snap('CN','2026-11-02T01:00:00Z',cnRows.map(r=>r.observation_id),{historyIds:[cgbHist.observation_id]});
 return {us,cn,f:fixture({snapshots:[us,cn],observations:[...usRows,...cnRows,unrate,cgbHist]})};
}

describe('buildTransmissionManifest',()=>{
 it('freezes both active snapshots, the later cutoff, node inputs, rules and watch names',async()=>{
  const {us,cn,f}=scenario();
  const m=(await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'US'}))!;
  expect(m.kind).toBe('transmission');expect(m.params).toEqual({region:'US'});
  const cnBody=(await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'CN'}))!;
  expect(manifestHash(cnBody)).not.toBe(manifestHash(m));   // the region is part of the identity
  expect(buildTransmission(stored(cnBody)).region).toBe('CN');
  expect(m.cutoff).toBe(us.created_at);
  expect(m.snapshots.US?.snapshot_id).toBe(us.snapshot_id);expect(m.snapshots.CN?.snapshot_id).toBe(cn.snapshot_id);
  expect(m.rules).toEqual(f.rules);
  expect(m.inputs.find(i=>i.role==='node:US_UNRATE:latest')?.source).toEqual({kind:'history',as_of:us.created_at});
  expect(m.inputs.find(i=>i.role==='node:CN_CGB_10Y:latest')?.source).toEqual({kind:'snapshot',snapshot_id:cn.snapshot_id});
  expect(m.reads.find(r=>r.series_id==='US_PPI_FD_YOY')?.state).toBe('missing');
  expect(m.reads.some(r=>r.series_id==='US_ISM_PMI')).toBe(false);   // catalog missing: not read
  expect(m.catalog.some(d=>d.id==='CN_M2_YOY')).toBe(true);           // playbook watch name frozen
  expect(m.method_version).toBe('macro-transmission/1');
 });
 it('returns null when neither region has a published snapshot',async()=>{
  expect(await buildTransmissionManifest(memoryStrategyPort(fixture()),{now:NOW,codeVersion:'test',region:'US'})).toBeNull();
 });
});

describe('buildTransmission',()=>{
 it('renders observed, catalog-missing, restricted, not-in-catalog, no-observation and derived nodes',async()=>{
  const {f}=scenario();
  const s=stored((await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'US'}))!);
  const v=buildTransmission(s);
  expect(v.version).toBe('macro-transmission/1');expect(v.manifest_id).toBe(s.manifest_id);
  expect(v.stages.map(x=>x.stage)).toEqual(['economy','policy','liquidity','rates','risk','assets']);
  expect(node(v,'us_cpi_yoy')).toMatchObject({state:'observed',value_text:'2.9',period_end:'2026-09-30'});
  expect(node(v,'us_cpi_yoy').inputs[0].source.kind).toBe('snapshot');
  expect(node(v,'us_unrate')).toMatchObject({state:'observed',value_text:'4.1'});
  expect(node(v,'us_ism_pmi')).toMatchObject({state:'missing',value_text:null});
  expect(node(v,'us_ism_pmi').reason).not.toBeNull();
  expect(node(v,'us_vix').state).toBe('restricted');
  expect(node(v,'us_rrp_tga').state).toBe('not_in_catalog');
  expect(node(v,'us_ppi_fd_yoy')).toMatchObject({state:'missing',reason:{zh:'截止时无观测',en:'No observation at the cutoff'}});
  const spread=node(v,'us_cn_10y_spread');
  expect(spread).toMatchObject({state:'derived',value_text:'2.25',unit:'pp',period_end:'2026-10-31'});
  expect(spread.inputs.map(i=>i.series_id)).toEqual(['US_DGS10','CN_CGB_10Y']);
  expect(v.stages.slice(0,5).every(x=>x.edge?.kind==='assumption')).toBe(true);
  expect(v.stages[5].edge).toBeNull();
 });
 it('an asset view reads its aliasOf series; a spread over different periods is missing with both periods named',async()=>{
  const {f}=scenario({cgbPeriod:'2026-09-30'});
  const v=buildTransmission(stored((await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'CN'}))!));
  expect(node(v,'cn_cgb10y_asset')).toMatchObject({state:'observed',value_text:'1.85'});
  expect(node(v,'cn_cgb10y_asset').inputs[0].series_id).toBe('CN_CGB_10Y');
  const spread=node(v,'us_cn_10y_spread');
  expect(spread.state).toBe('missing');expect(spread.value_text).toBeNull();
  expect(spread.reason?.zh).toBe('两条输入数据期不同：US_DGS10=2026-10-31，CN_CGB_10Y=2026-09-30');
  expect(spread.inputs).toHaveLength(2);
  expect(node(v,'cn_lpr_1y').state).toBe('missing');expect(node(v,'cn_csi300').state).toBe('restricted');
 });
 it('an asset alias follows the resolved target: restricted / missing / absent targets propagate and freeze no value',async()=>{
  const {f}=scenario();
  const withTarget=(edit:(d:typeof FIXTURE_CATALOG[number])=>typeof FIXTURE_CATALOG[number]|null)=>({...f,catalog:f.catalog.flatMap(d=>{if(d.id!=='CN_CGB_10Y')return [d];const e=edit(d);return e?[e]:[];})});
  const view=async(fx:typeof f)=>{const m=(await buildTransmissionManifest(memoryStrategyPort(fx),{now:NOW,codeVersion:'test',region:'CN'}))!;return {m,v:buildTransmission(stored(m))};};
  const restricted=await view(withTarget(d=>({...d,status:'restricted',reason:{zh:'目标受限',en:'Target restricted'}})));
  expect(node(restricted.v,'cn_cgb10y_asset')).toMatchObject({state:'restricted',value_text:null,period_end:null,inputs:[],reason:{zh:'目标受限',en:'Target restricted'}});
  expect(node(restricted.v,'cn_cgb_10y').state).toBe('restricted');
  expect(restricted.m.inputs.some(i=>i.role==='node:CN_CGB_10Y:latest')).toBe(false);
  const missing=await view(withTarget(d=>({...d,status:'missing'})));
  expect(node(missing.v,'cn_cgb10y_asset')).toMatchObject({state:'missing',value_text:null,inputs:[]});
  expect(node(missing.v,'cn_cgb10y_asset').reason).not.toBeNull();
  const absent=await view(withTarget(()=>null));
  expect(node(absent.v,'cn_cgb10y_asset')).toMatchObject({state:'missing',value_text:null,inputs:[]});
  expect(node(absent.v,'cn_cgb10y_asset').reason?.en).toMatch(/CN_CGB_10Y/);
 });
 it('assumption nodes carry their text and no value; unknown series ids are not_in_catalog',async()=>{
  const {f}=scenario();
  const s=stored((await buildTransmissionManifest(memoryStrategyPort(f),{now:NOW,codeVersion:'test',region:'US'}))!);
  expect(nodeView(s.body,{kind:'assumption',id:'a',text:{zh:'假设',en:'assumption'}})).toMatchObject({state:'assumption',value_text:null,label:{zh:'假设',en:'assumption'}});
  expect(nodeView(s.body,{kind:'observed',id:'x',seriesId:'NOPE'}).state).toBe('not_in_catalog');
  const custom:Record<Region,StageDef[]>={US:[{stage:'economy',label:{zh:'经济',en:'Economy'},edgeToNext:null,nodes:[{kind:'assumption',id:'a',text:{zh:'假设',en:'assumption'}}]}],CN:[]};
  expect(buildTransmission(s,custom).stages[0].nodes[0].state).toBe('assumption');
  expect(()=>buildTransmission({...s,body:{...s.body,kind:'review'}})).toThrow(/manifest_kind_mismatch/);
  expect(()=>buildTransmission({...s,body:{...s.body,params:{}}})).toThrow('invalid_manifest_params:region');
 });
 it('every series id in the v1 configs exists in the fixture catalog',()=>{
  const ids=new Set(FIXTURE_CATALOG.map(d=>d.id));
  const used=[...TRANSMISSION_V1.US,...TRANSMISSION_V1.CN].flatMap(s=>s.nodes.flatMap(n=>n.kind==='observed'?[n.seriesId]:n.kind==='derived'?[n.a,n.b]:[]));
  for(const id of [...used,...PLAYBOOKS_V1.flatMap(p=>p.watch)])expect(ids.has(id),id).toBe(true);
 });
});
