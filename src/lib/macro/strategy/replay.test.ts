// Offline replay (spec §1.1 criterion 3, §4.5, §12): committed manifests under fixtures/replay/ are the ONLY input; each
// view rebuilt from the stored manifest must deep-equal the committed expected JSON. The views never receive a port, the
// live catalog or an outside argument: region / window / boundary come from manifest.params, and every parameter value has
// its own manifest (its own identity). A second check rebuilds the manifests from the scenario below through
// memoryStrategyPort and requires the same manifest_hash, so the committed manifests are what the builders really produce.
// Recording (only when a builder or view intentionally changes): MACRO_REPLAY_RECORD=1 npm test -- src/lib/macro/strategy/replay.test.ts
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {beforeAll,describe,expect,it} from 'vitest';
import type {ObservationRow,ReviewFacts,ReviewStatus,StoredManifest,StrategyManifest} from './contract';
import {BOUNDARIES,buildCycleTable,buildCycleTableManifest} from './cycle-table';
import {manifestHash,monthEnd} from './manifest';
import {subtract,toBp} from './numeric';
import {buildPlaybooks} from './playbooks';
import {buildPolicyResponse,buildPolicyResponseManifest} from './policy-response';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {buildReviewManifest,reviewFromManifest} from './review';
import {daily,FIXTURE_CATALOG,fixture,monthly,obs,snap} from './testing/fixture';
import {buildTransmission,buildTransmissionManifest,regionParam} from './transmission';

const DIR=fileURLToPath(new URL('./fixtures/replay/',import.meta.url));
const NOW=new Date('2025-07-01T00:00:00Z');
const CODE='replay-fixture';
const CREATED='2025-06-30T06:05:00Z';

// ---------------------------------------------------------------- scenario (synthetic values; dates shaped like the Fed path)
const hundredths=(c:number)=>(c/100).toFixed(2);
const months=(first:string,n:number)=>Array.from({length:n},(_,i)=>{const [y,m]=first.split('-').map(Number);const t=y*12+m-1+i;return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`;});
const MONTHS=months('2021-12',42);   // 2021-12 … 2025-05
const series=(id:string,f:(i:number)=>number|null)=>monthly(id,MONTHS[0],MONTHS.map((_,i)=>{const c=f(i);return c===null?null:hundredths(c);}));
const WEEKS=Array.from({length:178},(_,j)=>new Date(Date.UTC(2022,0,3)+j*7*86400000).toISOString().slice(0,10));   // Mondays from 2022-01-03
const weekly=(id:string,f:(j:number)=>number)=>daily(id,WEEKS.map((d,j)=>[d,hundredths(f(j))]));
const UPPER:[string,string][]=[['2008-12-16','0.25'],['2015-12-17','0.5'],['2020-03-16','0.25'],['2022-03-17','0.5'],['2022-05-05','1'],['2022-06-16','1.75'],['2022-07-28','2.5'],['2022-09-22','3.25'],['2022-11-03','4'],['2022-12-15','4.5'],['2023-02-02','4.75'],['2023-03-23','5'],['2023-05-04','5.25'],['2023-07-27','5.5'],['2024-09-19','5'],['2024-11-08','4.75'],['2024-12-19','4.5']];
const LOWER:[string,string][]=UPPER.map(([d,v])=>[d,subtract(v,'0.25')]);
const dgs10=(i:number)=>150+7*i+(i%5)*3, cgb10=(i:number)=>280-2*i+(i%3)*4;
function scenario(){
 const cpi=obs('US_CPI_YOY','2025-05-31','2.4'),unrate=obs('US_UNRATE','2025-05-31','4.2'),dff=obs('US_DFF','2025-05-31','4.33');
 const pmi=obs('CN_PMI_MFG','2025-05-31','49.5'),cnCpi=obs('CN_CPI_YOY','2025-05-31','-0.1');
 const monthlyRows:ObservationRow[]=[
  ...series('US_DGS10',dgs10),...series('CN_CGB_10Y',cgb10),
  ...series('US_DTWEXBGS',i=>11500+40*i-(i%4)*25),
  ...series('CN_USDCNY_CP',i=>MONTHS[i]==='2022-04'?null:63500+30*i-(i%6)*40),
  ...series('US_WTI',i=>7500+(i%7)*400-(i%3)*350),
 ];
 const last=(id:string)=>monthlyRows.filter(r=>r.series_id===id).at(-1)!.observation_id;
 const us=snap('US','2025-06-30T06:00:00Z',[cpi,unrate,dff].map(r=>r.observation_id).concat(last('US_DGS10'),last('US_DTWEXBGS')));
 const cn=snap('CN','2025-06-29T01:00:00Z',[pmi,cnCpi].map(r=>r.observation_id).concat(last('CN_CGB_10Y'),last('CN_USDCNY_CP')));
 return fixture({snapshots:[us,cn],observations:[
  cpi,unrate,dff,pmi,cnCpi,...monthlyRows,
  ...daily('US_FED_TARGET_D',[['2008-10-07','2'],['2008-10-08','1.5'],['2008-10-29','1'],['2008-12-15','1']]),
  ...daily('US_FED_TARGET_UPPER_D',UPPER),...daily('US_FED_TARGET_LOWER_D',LOWER),
  ...weekly('US_DGS10_D',j=>150+2*j+(j%4)),...weekly('US_DTWEXBGS_D',j=>11500+10*j-(j%5)*20),...weekly('US_WTI_D',j=>7500+(j%9)*150-(j%4)*100),
 ]});
}

// ---------------------------------------------------------------- cases (Part C appends 'review')
// One manifest per (kind, params): <kind>.manifest.json holds {<param>: StoredManifest}, <kind>.expected.json {<param>: view}.
// view(s) takes nothing but the stored manifest.
type Param=string|number;
type Case={id:string;key:string;params:readonly Param[];build:(p:StrategyReadPort,param:Param)=>Promise<StrategyManifest>;view:(s:StoredManifest)=>unknown};
const CASES:Case[]=[
 {id:'transmission',key:'region',params:['US','CN'],build:async(p,region)=>(await buildTransmissionManifest(p,{now:NOW,codeVersion:CODE,region:region as 'US'|'CN'}))!,
  view:s=>({transmission:buildTransmission(s),playbooks:buildPlaybooks(s.body,regionParam(s.body))})},
 {id:'policy_response',key:'window',params:[1,3,6],build:(p,window)=>buildPolicyResponseManifest(p,{now:NOW,codeVersion:CODE,window:window as 1|3|6}),view:s=>buildPolicyResponse(s)},
 {id:'cycle_table',key:'boundary',params:BOUNDARIES,build:(p,boundary)=>buildCycleTableManifest(p,{now:NOW,codeVersion:CODE,boundary:boundary as 'event_day'|'first_trading_day'|'month_end'}),view:s=>buildCycleTable(s)},
];
const ID_BASE:Record<string,number>={transmission:0xa10,policy_response:0xa20,cycle_table:0xa30};
const file=(id:string,part:'manifest'|'expected')=>`${DIR}${id}.${part}.json`;
const load=<T>(id:string,part:'manifest'|'expected'):Record<string,T>=>JSON.parse(readFileSync(file(id,part),'utf8')) as Record<string,T>;
const stored=(c:Case,i:number,body:StrategyManifest):StoredManifest=>({manifest_id:`00000000-0000-4000-8000-000000000${(ID_BASE[c.id]+i).toString(16)}`,manifest_hash:manifestHash(body),body,created_at:CREATED});

beforeAll(async()=>{
 if(process.env.MACRO_REPLAY_RECORD!=='1')return;
 const port=memoryStrategyPort(scenario());
 for(const c of CASES){
  const all:Record<string,StoredManifest>={};
  for(const [i,p] of c.params.entries())all[String(p)]=stored(c,i,await c.build(port,p));
  writeFileSync(file(c.id,'manifest'),`${JSON.stringify(all)}\n`);
  writeFileSync(file(c.id,'expected'),`${JSON.stringify(Object.fromEntries(Object.entries(all).map(([p,s])=>[p,c.view(s)])))}\n`);
 }
});

describe.each(CASES)('replay $id',c=>{
 it('the committed fixture files exist',()=>{
  expect(existsSync(file(c.id,'manifest'))).toBe(true);expect(existsSync(file(c.id,'expected'))).toBe(true);
 });
 it('one manifest per parameter: kind and params frozen in the body, manifest_hash = hash of the body, identities distinct',()=>{
  const all=load<StoredManifest>(c.id,'manifest');
  expect(Object.keys(all)).toEqual(c.params.map(String));
  for(const p of c.params){
   const s=all[String(p)];
   expect(s.manifest_hash).toBe(manifestHash(s.body));
   expect(s.body.kind).toBe(c.id);expect(s.body.params).toMatchObject({[c.key]:p});   // policy_response also freezes params.dims
  }
  expect(new Set(Object.values(all).map(s=>s.manifest_hash)).size).toBe(c.params.length);
 });
 it('view(stored manifest alone) deep-equals the committed expected JSON for every parameter',()=>{
  const all=load<StoredManifest>(c.id,'manifest');const exp=load<unknown>(c.id,'expected');
  expect(Object.keys(exp)).toEqual(c.params.map(String));
  for(const p of c.params)expect(JSON.parse(JSON.stringify(c.view(all[String(p)])))).toEqual(exp[String(p)]);
 });
 it('the builder still produces the committed manifests (same hashes) from the scenario',async()=>{
  const all=load<StoredManifest>(c.id,'manifest');
  for(const p of c.params){
   const body=await c.build(memoryStrategyPort(scenario()),p);
   expect(manifestHash(body),`${c.id} ${String(p)}: builder output changed: re-record with MACRO_REPLAY_RECORD=1 only if the change is intended`).toBe(all[String(p)].manifest_hash);
  }
 });
});
const one=(id:string,p:Param):StoredManifest=>load<StoredManifest>(id,'manifest')[String(p)];

describe('replayed numbers match hand computation',()=>{
 it('month_end hike episode 2022-03-17 → 2023-07-27: US 10Y bp = 2023-07 month end − 2022-02 month end, × 100',()=>{
  const t=buildCycleTable(one('cycle_table','month_end'));
  const ep=t.episodes.find(e=>e.direction==='hike'&&e.start==='2022-03-17')!;
  expect(ep.end).toBe('2023-07-27');
  const c=t.cells[String(ep.index)]['US_UST10Y'];
  const v=(ym:string)=>hundredths(dgs10(MONTHS.indexOf(ym)));
  expect(c).toMatchObject({status:'ok',from:{period_end:monthEnd('2022-02')},to:{period_end:monthEnd('2023-07')}});
  expect(c.status==='ok'&&c.change_text).toBe(toBp(subtract(v('2023-07'),v('2022-02'))));
 });
 it('the switch event and the left-censored first episode are replayed; the last episode is ongoing at the cutoff',()=>{
  const t=buildCycleTable(one('cycle_table','event_day'));
  expect(t.gaps).toEqual([]);
  expect(t.episodes[0]).toMatchObject({direction:'cut',start:'2008-10-08',end:'2008-12-16',left_censored:true,cumulative_bp:'-175'});
  expect(t.episodes.at(-1)).toMatchObject({direction:'cut',start:'2024-09-19',end:'2024-12-19',ongoing:true});
 });
 it('policy response N=3: the 2022-03-17 hike spans 2022-02 → 2022-05 month ends; the 2022-04 CNY gap excludes it there',()=>{
  const v=buildPolicyResponse(one('policy_response',3));
  const hike=v.rows.find(r=>r.direction==='hike')!;
  const usRow=hike.cells['US_DGS10'];
  const first=('events' in usRow?usRow.events:[]).find(e=>e.effective_date==='2022-03-17')!;
  expect([first.base?.period_end,first.end?.period_end]).toEqual(['2022-02-28','2022-05-31']);
  expect(first.change_text).toBe(toBp(subtract(hundredths(dgs10(MONTHS.indexOf('2022-05'))),hundredths(dgs10(MONTHS.indexOf('2022-02'))))));
  const cny=hike.cells['CN_USDCNY_CP'];
  expect(('events' in cny?cny.events:[]).find(e=>e.effective_date==='2022-03-17')?.exclusion).toBe('incomplete_window');
 });
 it('the transmission spread is the exact same-month difference of the two snapshot rows',()=>{
  const t=buildTransmission(one('transmission','US'));
  const spread=t.stages.flatMap(s=>s.nodes).find(n=>n.id==='us_cn_10y_spread')!;
  const i=MONTHS.indexOf('2025-05');
  expect(spread).toMatchObject({state:'derived',period_end:'2025-05-31',value_text:subtract(hundredths(dgs10(i)),hundredths(cgb10(i)))});
 });
});

// ---------------------------------------------------------------- review (Part C, Task 9): its own scenario
// Part B's shared scenario has one snapshot pair and no baseline snapshot, so the review case carries its own: US 2026-10,
// baseline snapshot with August data, October snapshot with September data and a revised August unemployment rate,
// month-end assets for September and October, three 2025 cuts and a 2026-10-28 hike. The catalog is the FIXTURE_CATALOG
// subset the review reads, so the committed manifest stays small. Recorded together with the cases above
// (MACRO_REPLAY_RECORD=1); the committed file holds {manifest_hash, manifest, expected}.
const REVIEW_FILE=`${DIR}review-us-2026-10.json`;
const REVIEW_IDS=['US_CPI_YOY','US_UNRATE','US_ISM_PMI','US_DGS10_D','US_DGS10','US_DTWEXBGS_D','US_DTWEXBGS','US_WTI_D','US_WTI','US_UST10Y','US_SP500','US_FED_TARGET_D','US_FED_TARGET_UPPER_D','US_FED_TARGET_LOWER_D'];
function reviewScenario(){
 const base=[...monthly('US_CPI_YOY','2026-08',['2.7']),obs('US_UNRATE','2026-08-31','4.2'),...monthly('US_DGS10','2026-08',['4.23']),...monthly('US_DTWEXBGS','2026-08',['121.2'])];
 const cur=[...monthly('US_CPI_YOY','2026-09',['2.9']),obs('US_UNRATE','2026-08-31','4.3',{version:2,availableAt:'2026-10-02T12:00:00Z'}),...monthly('US_DGS10','2026-09',['4.16']),...monthly('US_DTWEXBGS','2026-09',['120.5'])];
 const monthEnds=[...monthly('US_WTI','2026-09',['62','60.5']),obs('US_DGS10','2026-10-31','4.08'),obs('US_DTWEXBGS','2026-10-31','121')];
 const days:[string,string,string][]=[['2025-09-16','4.5','4.25'],['2025-09-17','4.25','4'],['2025-10-29','4','3.75'],['2025-12-10','3.75','3.5'],['2026-10-28','4','3.75']];
 return fixture({catalog:FIXTURE_CATALOG.filter(d=>REVIEW_IDS.includes(d.id)),
  snapshots:[snap('US','2026-09-14T06:00:00Z',base.map(o=>o.observation_id)),snap('US','2026-10-15T06:00:00Z',cur.map(o=>o.observation_id),{counts:{verified:21,missing:4,restricted:5}})],
  observations:[...base,...cur,...monthEnds,...daily('US_FED_TARGET_UPPER_D',days.map(([d,u])=>[d,u])),...daily('US_FED_TARGET_LOWER_D',days.map(([d,,l])=>[d,l]))]});
}
type ReviewFixture={manifest_hash:string;manifest:StrategyManifest;expected:{status:ReviewStatus;facts:ReviewFacts}};
const buildReview=()=>buildReviewManifest(memoryStrategyPort(reviewScenario()),'US','2026-10',CODE);
describe('replay review US 2026-10 (spec §6.2, §12: the view reads the committed manifest only)',()=>{
 beforeAll(async()=>{
  if(process.env.MACRO_REPLAY_RECORD!=='1')return;
  const manifest=await buildReview();
  writeFileSync(REVIEW_FILE,`${JSON.stringify({manifest_hash:manifestHash(manifest),manifest,expected:reviewFromManifest(manifest)})}\n`);
 });
 const fx=()=>JSON.parse(readFileSync(REVIEW_FILE,'utf8')) as ReviewFixture;
 it('manifest_hash is the hash of the committed body',()=>{
  expect(fx().manifest_hash).toBe(manifestHash(fx().manifest));
 });
 it('reviewFromManifest(committed manifest) deep-equals the committed expected facts',()=>{
  expect(JSON.parse(JSON.stringify(reviewFromManifest(fx().manifest)))).toEqual(fx().expected);
 });
 it('the builder still produces the committed manifest (same hash) from the scenario',async()=>{
  expect(manifestHash(await buildReview()),'builder output changed: re-record with MACRO_REPLAY_RECORD=1 only if the change is intended').toBe(fx().manifest_hash);
 });
 it('hand-computed: releases, the revision, the October event, episode ended / opened, asset moves, coverage',()=>{
  const f=fx().expected.facts;
  expect(fx().expected.status).toBe('ok');
  expect(f.releases.map(x=>x.fact_id)).toEqual(['rel:US_CPI_YOY','rel:US_DGS10','rel:US_DTWEXBGS']);
  expect(f.revisions).toHaveLength(1);
  expect(f.revisions[0].slots).toMatchObject({series:'US_UNRATE',period:'2026-08-31',from:{value_text:'4.2'},to:{value_text:'4.3'}});
  expect(f.timeliness.map(x=>x.fact_id)).toEqual(['tml:US_UNRATE']);
  expect(f.policy_events.map(x=>x.fact_id)).toEqual(['evt:2026-10-28']);
  expect(f.policy_events[0].slots.change).toEqual({value_text:toBp(subtract('4','3.75')),unit:'bp'});
  expect(f.episode_changes.map(x=>x.fact_id)).toEqual(['ep:cut:2025-09-17:ended','ep:hike:2026-10-28:opened']);
  expect(f.episode_changes[0].slots.cumulative).toEqual({value_text:'-75',unit:'bp'});
  const mv=new Map(f.asset_moves.map(x=>[x.fact_id,x.slots.change]));
  expect(mv.get('mv:US_UST10Y')).toEqual({value_text:toBp(subtract('4.08','4.16')),unit:'bp'});
  expect(mv.get('mv:US_WTI')).toEqual({value_text:'60.5/62',unit:'pct_ratio'});        // exact ratio; (60.5 / 62 − 1) × 100 rounded once at display
  expect(mv.get('mv:US_DTWEXBGS')).toEqual({value_text:'121/120.5',unit:'pct_ratio'});  // (121 / 120.5 − 1) × 100
  expect(f.coverage.map(x=>x.fact_id)).toEqual(['cov:counts','cov:US_ISM_PMI','cov:US_SP500']);
 });
});
