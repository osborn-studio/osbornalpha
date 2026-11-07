// src/lib/judgments/methodologies/macro-regime.v1.test.ts
// Task 19 (spec §11.1, §8.1 G28, §6.4, §7.1 step 0, §14.1, §15 #1): macro_regime@v1 on the 2026-09-11 US fixture
// (macro spec §14 acceptance example 9). Active registration plus an explicit draft override test the status gate.
import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {CategoricalClaim,Input,JudgmentInputsDb,JudgmentRow,ResolverResult,Subject} from '@/lib/judgments/types';
import type {MacroFixture} from '@/lib/judgments/macro-api';
import {digest} from '@/lib/judgments/canonical';
import {formulaHashOf,importClosure} from '@/lib/judgments/formula-hash';
import {REGISTRY,methodologyRowOf} from '@/lib/judgments/registry';
import {produce} from '@/lib/judgments/produce';
import {parseReplayFixture} from '@/lib/judgments/replay';
import {compensateMacro} from '@/lib/judgments/compensate';
import {macroRegimeReplayResolver} from '@/lib/judgments/resolvers/macro';
import {MACRO_REGIMES,MACRO_UPSTREAM_VERSION,macroRegimeV1,marginPp} from './macro-regime.v1';
import {MACRO_CODE_VERSION,MACRO_S1,MACRO_S2,buildMacroReplayFixture,compensateCtx,loadMacroFixture,macroDb,macroInputsDb,macroWork,mergeMacroFixtures,produceCtx} from '@/lib/judgments/testing/macro-fixture';

const US:Subject={type:'macro_region',key:'US'};
const base=()=>loadMacroFixture('us-2026-09-11');
const revised=()=>mergeMacroFixtures(base(),loadMacroFixture('us-2026-09-revised'));
const lowCoverage=()=>mergeMacroFixtures(base(),loadMacroFixture('us-2026-09-low-coverage'));
function patchSnapshots(fx:MacroFixture,patch:(s:MacroFixture['snapshots'][number])=>void):MacroFixture{for(const s of fx.snapshots)patch(s);return fx;}

async function registerS1(fx:MacroFixture=base()){
 const db=await macroDb('active');const inputsDb=macroInputsDb(fx);
 const res=await produce(macroRegimeV1,[macroWork(fx,MACRO_S1)],produceCtx(db,inputsDb));
 const ids=await db.judgmentsBySnapshot(MACRO_S1);
 const row=ids.length===1?await db.getJudgment(ids[0]):null;
 return {db,inputsDb,res,ids,row:row as JudgmentRow};
}
const resolveCtx=(row:JudgmentRow,inputsDb:JudgmentInputsDb,cutoff=row.settle_by!)=>({judgment:row,cutoff,now:'2027-02-01T03:00:00.000Z',inputsDb,signal:new AbortController().signal});
/** categorical outcome = predicate eq on the realized class (spec §3.3); settle.ts applies the same rule. */
function outcomeOf(row:JudgmentRow,r:ResolverResult):'hit'|'miss'|null{
 if(r.status!=='resolved'||row.condition?.resolver!=='macro_regime_replay')return null;
 return r.value===row.condition.predicate.rhs?'hit':'miss';
}
function rng(seed:number){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/2**32;};}
function shuffled<T>(xs:T[],next:()=>number):T[]{const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

describe('macro_regime@v1 (Task 19)',()=>{
 it('is registered once in REGISTRY as an active categorical rule method with the spec §11.1 parameters and a 7-section doc',async()=>{
  expect(REGISTRY.filter(m=>m.id==='macro_regime')).toEqual([macroRegimeV1]);
  const row=methodologyRowOf(macroRegimeV1,formulaHashOf(macroRegimeV1),{publishable:false,code_version:MACRO_CODE_VERSION});
  expect(row).toMatchObject({methodology_id:'macro_regime',version:'v1',judgment_type:'macro_regime',kind:'categorical',producer_kind:'rule',
   subject_types:['macro_region'],input_kinds:['macro_snapshot','macro_observation','table_rows'],doc_path:'docs/methodologies/macro_regime/v1.md',
   params:{grace_days:30,threshold_n:100,ece_max:0.1,window_years:3,embargo_days:0,label_policy:'cutoff_vintage'},
   horizon:{unit:'calendar_months',n:3},upstream:{macro_methodology_version:'v1.0'},status:'active',publishable:false});
  expect(row.formula_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(methodologyRowOf(macroRegimeV1,formulaHashOf(macroRegimeV1),{publishable:false,code_version:'another-code-version'}).formula_hash).toBe(row.formula_hash);
  expect(MACRO_UPSTREAM_VERSION).toBe('v1.0');
  expect(MACRO_REGIMES).toEqual(['recovery','overheat','stagflation','recession']);
  for(const p of [macroRegimeV1.module,...macroRegimeV1.deps])expect({p,exists:existsSync(p)}).toEqual({p,exists:true});
  const doc=readFileSync(macroRegimeV1.doc,'utf8');
  for(const h of ['## 1 回答什么问题','## 2 主体与输入','## 3 公式与参数','## 4 可证伪条件、目标期与标签政策','## 5 结算 resolver 与实现值定义','## 6 不适用情形（何时 abstain）','## 7 版本历史'])expect({h,found:doc.includes(h)}).toEqual({h,found:true});
 });

 it('registers snapshot s1: categorical claim (norm is not a probability), margin_pp in percentage points, frozen catalog_version, 3-month period target',async()=>{
  const {res,ids,row}=await registerS1();
  expect(res.counts).toMatchObject({inserted:1,duplicates:0,quarantined:0,failed:0});
  expect(ids).toHaveLength(1);
  expect(row.claim).toEqual({selected:'recovery',classes:['recovery','overheat','stagflation','recession'],
   distribution:{recovery:0.32575757575757575,overheat:0.23484848484848486,stagflation:0.2196969696969697,recession:0.2196969696969697},
   scores_are_not_probabilities:true,margin_pp:9.090909,catalog_version:'us-catalog-2026-09-01'});
  const claim=row.claim as CategoricalClaim;
  expect(claim.margin_pp!).toBeCloseTo((claim.distribution!.recovery-claim.distribution!.overheat)*100,5);
  expect(claim.margin_pp!).toBeGreaterThan(1);   // percentage points, not a fraction (G28)
  expect(row).toMatchObject({subject_type:'macro_region',subject_key:'US',judgment_type:'macro_regime',methodology_id:'macro_regime',methodology_version:'v1',
   kind:'categorical',producer_kind:'rule',producer_nonce:'',as_of:'2026-09-11',abstained:false,abstain_reason:null,
   horizon:{unit:'calendar_months',n:3},target:{kind:'period',period:'2026-12'},label_policy:'cutoff_vintage',
   settle_after:'2027-01-01T00:00:00.000Z',settle_by:'2027-01-31T00:00:00.000Z',code_version:MACRO_CODE_VERSION});
  expect(row.condition).toEqual({resolver:'macro_regime_replay',
   params:{region:'US',reference_period:'2026-09',macro_methodology_version:'v1.0',catalog_version:'us-catalog-2026-09-01'},
   predicate:{op:'eq',rhs:'recovery'},
   text:{zh:'US 2026-09 当期象限为“复苏”（同一分类函数在截止 vintage 下对同一参考期重算）',en:'US 2026-09 regime is "recovery" (same classifier re-run for the same reference month on the cutoff vintage)'}});
  const kinds=row.inputs.map(i=>i.kind);
  expect({snapshot:kinds.filter(k=>k==='macro_snapshot').length,observations:kinds.filter(k=>k==='macro_observation').length,tables:kinds.filter(k=>k==='table_rows').length}).toEqual({snapshot:1,observations:11,tables:1});
  const snap=row.inputs.find(i=>i.kind==='macro_snapshot')!;
  expect(snap.ref).toEqual({snapshot_id:MACRO_S1});
  expect(snap.available_at).toBe('2026-09-11T12:30:00.000Z');   // max of its observations' available_at (spec §3.7), not created_at
  expect(row.inputs.find(i=>i.kind==='table_rows')!.ref).toEqual({table:'macro_series',natural_key:'US'});
  const cpi=row.inputs.find((i):i is Extract<Input,{kind:'macro_observation'}>=>i.kind==='macro_observation'&&i.ref.series_id==='US_CPI_YOY')!;
  expect(cpi.snapshot).toMatchObject({series_id:'US_CPI_YOY',period_end:'2026-08-31',value:2.9,vintage_id:'bls-2026-09-11'});
  for(const i of row.inputs)expect(i.hash).toBe(digest(i.snapshot));
 });

 it('margin_pp is percentage points: marginPp scales by 100, and a snapshot that stored the margin as a fraction abstains (G28)',async()=>{
  expect(marginPp({recovery:0.4,overheat:0.35,stagflation:0.15,recession:0.1},'recovery','overheat')).toBe(5);
  const fx=patchSnapshots(base(),s=>{if(s.regime)s.regime.margin_pp=0.090909;});
  const {res,row}=await registerS1(fx);
  expect(res.counts.inserted).toBe(1);
  expect(row).toMatchObject({abstained:true,abstain_reason:'margin_unit_mismatch',claim:null,condition:null,target:null,horizon:null,label_policy:null,settle_after:null,settle_by:null});
 });

 it('freezes the catalog: compute on the frozen inputs reproduces the claim; another catalog for the same snapshot is another judgment',async()=>{
  const {db,row}=await registerS1();
  expect(macroRegimeV1.compute(US,row.inputs)).toEqual({abstained:false,claim:row.claim});
  const edited=base();
  edited.series_catalog.US=edited.series_catalog.US!.map(r=>r.id==='US_VIX'?{...r,weight:6,definition_version:2}:r);
  const again=await produce(macroRegimeV1,[macroWork(edited,MACRO_S1)],produceCtx(db,macroInputsDb(edited)));
  expect(again.counts).toMatchObject({inserted:1,duplicates:0,quarantined:0});
  const ids=await db.judgmentsBySnapshot(MACRO_S1);
  expect(ids).toHaveLength(2);
  const other=(await db.getJudgment(ids.find(i=>i!==row.judgment_id)!))!;
  expect(other.inputs_hash).not.toBe(row.inputs_hash);
  expect((other.claim as CategoricalClaim).catalog_version).toBe('us-catalog-2026-09-01');   // from the snapshot, frozen
 });

 it('macro_regime_replay on the same vintage → recovery → hit',async()=>{
  const {row,inputsDb}=await registerS1();
  expect(macroRegimeReplayResolver.validateParams(row.condition!.params)).toBe(true);
  const r=await macroRegimeReplayResolver.resolve(resolveCtx(row,inputsDb));
  expect(r).toMatchObject({status:'resolved',value:'recovery',label_available_at:'2026-09-11T12:30:00.000Z'});
  if(r.status!=='resolved')throw new Error('unreachable');
  expect(r.evidence).toMatchObject({catalog:{version:'us-catalog-2026-09-01',rules_version:'v1.0'},regime_result:{primary_state:'recovery',coverage:0.8}});
  expect((r.evidence.observation_refs as unknown[]).length).toBe(11);
  expect(outcomeOf(row,r)).toBe('hit');
 });

 it('macro_regime_replay after the September data moves the argmax → overheat → miss; an earlier cutoff still sees the old vintage',async()=>{
  const {row,inputsDb}=await registerS1(revised());
  const late=await macroRegimeReplayResolver.resolve(resolveCtx(row,inputsDb));
  expect(late).toMatchObject({status:'resolved',value:'overheat',label_available_at:'2026-10-15T12:30:00.000Z'});
  expect(outcomeOf(row,late)).toBe('miss');
  const early=await macroRegimeReplayResolver.resolve(resolveCtx(row,inputsDb,'2026-10-01T00:00:00.000Z'));
  expect(early).toMatchObject({status:'resolved',value:'recovery'});
 });

 it('macro_regime_replay with coverage < 0.6 on the cutoff vintage → Unavailable(coverage)',async()=>{
  const {row,inputsDb}=await registerS1(lowCoverage());
  expect(await macroRegimeReplayResolver.resolve(resolveCtx(row,inputsDb))).toEqual({status:'unavailable',failure:'coverage'});
 });

 it('an upstream macro methodology_version other than v1.0 abstains upstream_version_mismatch, keeping only the snapshot input',async()=>{
  const {res,ids,row}=await registerS1(patchSnapshots(base(),s=>{s.methodology_version='v1.1';}));
  expect(res.counts.inserted).toBe(1);
  expect(ids).toHaveLength(1);
  expect(row).toMatchObject({abstained:true,abstain_reason:'upstream_version_mismatch',claim:null,condition:null});
  expect(row.inputs.map(i=>i.kind)).toEqual(['macro_snapshot']);
 });

 it('acceptance example 1: the same snapshot produced twice → second run duplicates=1 and the row count is unchanged',async()=>{
  const {db,inputsDb,res}=await registerS1();
  const again=await produce(macroRegimeV1,[macroWork(base(),MACRO_S1)],produceCtx(db,inputsDb));
  expect(again.counts).toMatchObject({inserted:0,duplicates:1,quarantined:0,failed:0});
  expect(again.items[0]).toMatchObject({judgment_id:res.items[0].judgment_id,status:'duplicate'});
  expect(await db.judgmentsBySnapshot(MACRO_S1)).toHaveLength(1);
 });

 it('draft override: nothing registers; --dry-run yields the same id and writes nothing',async()=>{
  const {ids}=await registerS1();
  const fx=base();const draft=await macroDb('draft');
  const live=await produce(macroRegimeV1,[macroWork(fx,MACRO_S1)],produceCtx(draft,macroInputsDb(fx)));
  expect(live.items[0]).toMatchObject({status:'failed',code:'methodology_unavailable'});
  expect(await draft.judgmentsBySnapshot(MACRO_S1)).toEqual([]);
  const dry=await produce(macroRegimeV1,[macroWork(fx,MACRO_S1)],produceCtx(draft,macroInputsDb(fx),{dryRun:true}));
  expect(dry.items[0].judgment_id).toBe(ids[0]);
  expect(await draft.judgmentsBySnapshot(MACRO_S1)).toEqual([]);
 });

 it('compensation end to end: both same-day snapshots get distinct judgments, the marker advances to s2, a rerun adds nothing, a draft row adds nothing',async()=>{
  const fx=base();const db=await macroDb('active');const inputsDb=macroInputsDb(fx);
  await compensateMacro(compensateCtx(db,inputsDb));
  const a=await db.judgmentsBySnapshot(MACRO_S1);const b=await db.judgmentsBySnapshot(MACRO_S2);
  expect(a).toHaveLength(1);expect(b).toHaveLength(1);expect(a[0]).not.toBe(b[0]);
  const s2=fx.snapshots.find(s=>s.snapshot_id===MACRO_S2)!;
  const marker=await db.jobState('produce:macro_regime@v1');
  expect(marker?.state).toEqual({marker_created_at:s2.created_at,marker_snapshot_id:MACRO_S2});
  await compensateMacro(compensateCtx(db,inputsDb));
  expect(await db.judgmentsBySnapshot(MACRO_S1)).toEqual(a);
  expect(await db.judgmentsBySnapshot(MACRO_S2)).toEqual(b);
  expect((await db.jobState('produce:macro_regime@v1'))?.state).toEqual(marker?.state);
  const draft=await macroDb('draft');
  await compensateMacro(compensateCtx(draft,inputsDb));
  expect([...await draft.judgmentsBySnapshot(MACRO_S1),...await draft.judgmentsBySnapshot(MACRO_S2)]).toEqual([]);
 });

 it('binding: a missing snapshot_id or a snapshot of another region / date abstains in gather',async()=>{
  const inputsDb=macroInputsDb(base());
  expect(await macroRegimeV1.gather({subject:US,asOf:'2026-09-11',observedAt:'2026-09-11T23:00:00.000Z'},inputsDb)).toEqual({abstained:true,reason:'binding_missing',missing:['snapshot_id']});
  expect(await macroRegimeV1.gather({subject:{type:'macro_region',key:'CN'},asOf:'2026-09-11',observedAt:'2026-09-11T23:00:00.000Z',binding:{snapshot_id:MACRO_S1}},inputsDb)).toEqual({abstained:true,reason:'binding_mismatch'});
  expect(await macroRegimeV1.gather({subject:US,asOf:'2026-09-12',observedAt:'2026-09-12T23:00:00.000Z',binding:{snapshot_id:MACRO_S1}},inputsDb)).toEqual({abstained:true,reason:'binding_mismatch'});
 });

 it('compute / condition are byte-identical across 200 seeded input shuffles (spec §14.1 property)',async()=>{
  const {row}=await registerS1();
  const next=rng(20261106);
  const claim=digest(row.claim);const cond=digest(row.condition);
  for(let k=0;k<200;k++){
   const inputs=shuffled(row.inputs,next);
   const c=macroRegimeV1.compute(US,inputs);
   if(c.abstained)throw new Error(`abstained on shuffle ${k}: ${c.reason}`);
   expect(digest(c.claim)).toBe(claim);
   expect(digest(macroRegimeV1.condition(US,inputs,c.claim))).toBe(cond);
  }
 });

 it('the committed replay fixture (Task 13 format judgment-replay/1) is exactly what the builder produces; tampering CPI breaks its hash',async()=>{
  const committed=parseReplayFixture(JSON.parse(readFileSync('fixtures/judgments/replay/macro-regime.json','utf8')));
  expect(committed).toEqual(JSON.parse(JSON.stringify(await buildMacroReplayFixture())));
  expect(committed).toMatchObject({fixture_version:'judgment-replay/1',expect:'exact'});
  const inputs=committed.judgment.inputs as Input[];
  for(const i of inputs)expect(digest(i.snapshot)).toBe(i.hash);
  const cpi=inputs.findIndex(i=>i.kind==='macro_observation'&&i.ref.series_id==='US_CPI_YOY');
  expect(cpi).toBeGreaterThanOrEqual(0);
  const tampered=structuredClone(inputs[cpi]) as Extract<Input,{kind:'macro_observation'}>;
  tampered.snapshot.value=3.4;
  expect(digest(tampered.snapshot)).not.toBe(tampered.hash);
  // replay.test.ts (Task 13) iterates this file too: exact replay, and its generic tamper hits a macro_observation (label has the series_id).
 });
});

it('unevidenced catalog abstains while retaining the bound snapshot (D1)',async()=>{
 const fx=base();for(const r of fx.series_catalog.US!)delete r.updated_at;
 const {res,row}=await registerS1(fx);
 expect(res.counts.failed).toBe(0);
 expect(row).toMatchObject({abstained:true,abstain_reason:'input_unavailable'});
 expect(row.inputs.map(i=>i.kind)).toEqual(['macro_snapshot']);
});
it('classification code and rule/catalog dependencies are covered by formula hash',()=>{
 const hashed=new Set([...formulaHashOf(macroRegimeV1).closure,...macroRegimeV1.deps]);
 for(const file of importClosure(process.cwd(),'src/lib/macro/read-api.ts'))expect({file,hashed:hashed.has(file)}).toEqual({file,hashed:true});
});

it('sync dry-run plans a hashed, active, unpublished method with unverified licenses',async()=>{
 const {planMethodologySync,planExitCode,validateLicenseTable,licenseProblems}=await import('../methodology-sync');
 const {memoryJudgmentsDb}=await import('../memory-judgments-db');
 const licenses=validateLicenseTable(JSON.parse(readFileSync('docs/methodologies/licenses.json','utf8')));
 const db=memoryJudgmentsDb();
 const plan=await planMethodologySync([macroRegimeV1],db,{repoRoot:process.cwd(),codeVersion:MACRO_CODE_VERSION,licenses});
 expect(planExitCode(plan)).toBe(0);
 expect(plan[0]).toMatchObject({key:'macro_regime@v1',action:'register',problems:[],row:{status:'active',publishable:false,formula_hash:formulaHashOf(macroRegimeV1).formula_hash}});
 expect(licenseProblems(macroRegimeV1,licenses).length).toBeGreaterThan(0);
 expect(await db.methodology('macro_regime','v1')).toBeNull();
});
it('binding mismatch abstentions retain a buildable snapshot and stay discoverable',async()=>{
 const fx=base(),db=await macroDb('active'),inputsDb=macroInputsDb(fx);
 const work={...macroWork(fx,MACRO_S1),subject:{type:'macro_region' as const,key:'CN'}};
 const r=await produce(macroRegimeV1,[work],produceCtx(db,inputsDb));
 expect(r.counts.inserted).toBe(1);
 const ids=await db.judgmentsBySnapshot(MACRO_S1);
 expect(ids).toHaveLength(1);
 const row=(await db.getJudgment(ids[0]))!;
 expect(row.abstain_reason).toBe('binding_mismatch');
 expect(row.inputs.map(i=>i.kind)).toEqual(['macro_snapshot']);
});
