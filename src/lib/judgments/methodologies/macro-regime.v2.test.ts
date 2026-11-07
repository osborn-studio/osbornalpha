// src/lib/judgments/methodologies/macro-regime.v2.test.ts
// Task 19 (spec §11.1, §8.1 G28, §6.4, §7.1 step 0, §14.1, §15 #1): macro_regime@v2 on the 2026-09-11 US fixture
// (macro spec §14 acceptance example 9). Active registration plus an explicit draft override test the status gate.
import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {CategoricalClaim,Input,JudgmentInputsDb,JudgmentRow,ResolverResult,Subject} from '@/lib/judgments/types';
import type {MacroFixture} from '@/lib/judgments/macro-api';
import {CATALOG_VERSION} from '@/lib/macro/catalog';
import {digest} from '@/lib/judgments/canonical';
import {formulaHashOf,importClosure} from '@/lib/judgments/formula-hash';
import {REGISTRY,methodologyRowOf} from '@/lib/judgments/registry';
import {produce} from '@/lib/judgments/produce';
import {parseReplayFixture} from '@/lib/judgments/replay';
import {compensateMacro} from '@/lib/judgments/compensate';
import {macroRegimeReplayResolver} from '@/lib/judgments/resolvers/macro';
import {MACRO_REGIMES,MACRO_UPSTREAM_VERSION,macroRegimeV2,marginPp} from './macro-regime.v2';
import {MACRO_CODE_VERSION,MACRO_S1,MACRO_S2,buildMacroReplayFixture,compensateCtx,loadMacroFixture,macroDb,macroInputsDb,macroWork,mergeMacroFixtures,produceCtx} from '@/lib/judgments/testing/macro-fixture';

const US:Subject={type:'macro_region',key:'US'};
const base=()=>loadMacroFixture('us-2026-09-11');
const revised=()=>mergeMacroFixtures(base(),loadMacroFixture('us-2026-09-revised'));
const lowCoverage=()=>mergeMacroFixtures(base(),loadMacroFixture('us-2026-09-low-coverage'));
function patchSnapshots(fx:MacroFixture,patch:(s:MacroFixture['snapshots'][number])=>void):MacroFixture{for(const s of fx.snapshots)patch(s);return fx;}

async function registerS1(fx:MacroFixture=base()){
 const db=await macroDb('active');const inputsDb=macroInputsDb(fx);
 const res=await produce(macroRegimeV2,[macroWork(fx,MACRO_S1)],produceCtx(db,inputsDb));
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

describe('macro_regime@v2 (Task 19)',()=>{
 it('is registered once in REGISTRY as an active categorical rule method with the spec §11.1 parameters and a 7-section doc',async()=>{
  expect(REGISTRY.filter(m=>m.id==='macro_regime')).toEqual([macroRegimeV2]);
  expect(REGISTRY.some(m=>m.id==='macro_regime'&&m.version==='v1')).toBe(false);
  const row=methodologyRowOf(macroRegimeV2,formulaHashOf(macroRegimeV2),{publishable:false,code_version:MACRO_CODE_VERSION});
  expect(row).toMatchObject({methodology_id:'macro_regime',version:'v2',judgment_type:'macro_regime',kind:'categorical',producer_kind:'rule',
   subject_types:['macro_region'],input_kinds:['macro_snapshot','macro_observation'],doc_path:'docs/methodologies/macro_regime/v2.md',
   params:{grace_days:30,threshold_n:100,ece_max:0.1,window_years:3,embargo_days:0,label_policy:'cutoff_vintage',catalog_version:'macro-catalog/30bcaa2a33c5'},
   horizon:{unit:'calendar_months',n:3},upstream:{macro_methodology_version:'v1.0'},status:'active',publishable:false});
  expect(row.formula_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(methodologyRowOf(macroRegimeV2,formulaHashOf(macroRegimeV2),{publishable:false,code_version:'another-code-version'}).formula_hash).toBe(row.formula_hash);
  expect(MACRO_UPSTREAM_VERSION).toBe('v1.0');
  expect(macroRegimeV2.params.catalog_version).toBe('macro-catalog/30bcaa2a33c5');
  expect(MACRO_REGIMES).toEqual(['recovery','overheat','stagflation','recession']);
  for(const p of [macroRegimeV2.module,...macroRegimeV2.deps])expect({p,exists:existsSync(p)}).toEqual({p,exists:true});
  const doc=readFileSync(macroRegimeV2.doc,'utf8');
  for(const h of ['## 1 回答什么问题','## 2 主体与输入','## 3 公式与参数','## 4 可证伪条件、目标期与标签政策','## 5 结算 resolver 与实现值定义','## 6 不适用情形（何时 abstain）','## 7 版本历史'])expect({h,found:doc.includes(h)}).toEqual({h,found:true});
 });

 it('registers snapshot s1: categorical claim (norm is not a probability), margin_pp in percentage points, frozen catalog_version, 3-month period target',async()=>{
  const {res,ids,row}=await registerS1();
  expect(res.counts).toMatchObject({inserted:1,duplicates:0,quarantined:0,failed:0});
  expect(ids).toHaveLength(1);
  expect(row.claim).toEqual({selected:'recovery',classes:['recovery','overheat','stagflation','recession'],
   distribution:{recovery:0.32575757575757575,overheat:0.23484848484848486,stagflation:0.2196969696969697,recession:0.2196969696969697},
   scores_are_not_probabilities:true,margin_pp:9.090909,catalog_version:CATALOG_VERSION});
  const claim=row.claim as CategoricalClaim;
  expect(claim.margin_pp!).toBeCloseTo((claim.distribution!.recovery-claim.distribution!.overheat)*100,5);
  expect(claim.margin_pp!).toBeGreaterThan(1);   // percentage points, not a fraction (G28)
  expect(row).toMatchObject({subject_type:'macro_region',subject_key:'US',judgment_type:'macro_regime',methodology_id:'macro_regime',methodology_version:'v2',
   kind:'categorical',producer_kind:'rule',producer_nonce:'',as_of:'2026-09-11',abstained:false,abstain_reason:null,
   horizon:{unit:'calendar_months',n:3},target:{kind:'period',period:'2026-12'},label_policy:'cutoff_vintage',
   settle_after:'2027-01-01T00:00:00.000Z',settle_by:'2027-01-31T00:00:00.000Z',code_version:MACRO_CODE_VERSION});
  expect(row.condition).toEqual({resolver:'macro_regime_replay',
   params:{region:'US',reference_period:'2026-09',macro_methodology_version:'v1.0',catalog_version:CATALOG_VERSION},
   predicate:{op:'eq',rhs:'recovery'},
   text:{zh:'US 2026-09 当期象限为“复苏”（同一分类函数在截止 vintage 下对同一参考期重算）',en:'US 2026-09 regime is "recovery" (same classifier re-run for the same reference month on the cutoff vintage)'}});
  const kinds=row.inputs.map(i=>i.kind);
  expect({snapshot:kinds.filter(k=>k==='macro_snapshot').length,observations:kinds.filter(k=>k==='macro_observation').length,tables:kinds.filter(k=>k==='table_rows').length}).toEqual({snapshot:1,observations:11,tables:0});
  const snap=row.inputs.find(i=>i.kind==='macro_snapshot')!;
  expect(snap.ref).toEqual({snapshot_id:MACRO_S1});
  expect(snap.available_at).toBe('2026-09-11T12:30:00.000Z');   // max of its observations' available_at (spec §3.7), not created_at
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

 it('gathers snapshot + observations alone without table catalog reads',async()=>{
  const fx=base(),db=macroInputsDb(fx);
  db.tableRows=async()=>{throw new Error('catalog is code, not timestamped rows');};
  const inputs=await macroRegimeV2.gather(macroWork(fx,MACRO_S1),db);
  expect(Array.isArray(inputs)).toBe(true);
  if(!Array.isArray(inputs))throw new Error(inputs.reason);
  expect(inputs.map(i=>i.kind)).toEqual(['macro_snapshot',...Array(11).fill('macro_observation')]);
  expect(macroRegimeV2.compute(US,inputs).abstained).toBe(false);
 });

 it('catalog version mismatch abstains with the bound snapshot retained (D1)',async()=>{
  const {res,row}=await registerS1(patchSnapshots(base(),s=>{s.catalog_version='foreign-catalog';}));
  expect(res.counts.inserted).toBe(1);
  expect(row).toMatchObject({abstained:true,abstain_reason:'upstream_version_mismatch'});
  expect(row.inputs.map(i=>i.kind)).toEqual(['macro_snapshot']);
  expect((row.inputs[0] as Extract<Input,{kind:'macro_snapshot'}>).snapshot.catalog_version).toBe('foreign-catalog');
 });

 it('failed snapshots abstain snapshot_not_published',async()=>{
  const fx=patchSnapshots(base(),s=>{s.status='failed';});
  const inputsDb=macroInputsDb(fx);
  expect(await macroRegimeV2.gather(macroWork(fx,MACRO_S1),inputsDb)).toEqual({abstained:true,reason:'snapshot_not_published'});
  const db=await macroDb('active');
  const result=await produce(macroRegimeV2,[macroWork(fx,MACRO_S1)],produceCtx(db,inputsDb));
  expect(result.counts.inserted).toBe(1);
  expect(await db.getJudgment(result.items[0].judgment_id!)).toMatchObject({abstained:true,abstain_reason:'snapshot_not_published',inputs:[]});
 });

 it.each(['active','superseded'] as const)('accepts %s snapshots',async status=>{
  const {row}=await registerS1(patchSnapshots(base(),s=>{s.status=status;}));
  expect(row.abstained).toBe(false);
 });

 it.each([
  ['missing score',{scores:{recovery:1,overheat:1,stagflation:1}}],
  ['infinite score',{scores:{recovery:Infinity,overheat:1,stagflation:1,recession:1}}],
  ['missing norm',{norm:{recovery:0.5,overheat:0.3,stagflation:0.2}}],
  ['NaN norm',{norm:{recovery:NaN,overheat:0.3,stagflation:0.2,recession:0}}],
  ['negative norm',{norm:{recovery:0.5,overheat:0.3,stagflation:0.3,recession:-0.1}}],
  ['norm sum',{norm:{recovery:0.5,overheat:0.3,stagflation:0.2,recession:0.1}}],
  ['null primary',{primary_state:null}],['unknown primary',{primary_state:'unknown'}],
  ['null secondary',{secondary_state:null}],['unknown secondary',{secondary_state:'unknown'}],
  ['equal states',{secondary_state:'recovery'}],['null margin',{margin_pp:null}],
  ['NaN margin',{margin_pp:NaN}],['infinite margin',{margin_pp:Infinity}],
 ])('compute rejects invalid snapshot: %s',async(_name,patch)=>{
  const fx=base(),inputs=await macroRegimeV2.gather(macroWork(fx,MACRO_S1),macroInputsDb(fx));
  if(!Array.isArray(inputs))throw new Error(inputs.reason);
  const snapshot=inputs.find(i=>i.kind==='macro_snapshot')!;
  Object.assign(snapshot.snapshot,patch);
  expect(macroRegimeV2.compute(US,inputs)).toEqual({abstained:true,reason:'invalid_snapshot'});
 });

 it('allows norm sum roundoff within 1e-9',async()=>{
  const fx=base(),inputs=await macroRegimeV2.gather(macroWork(fx,MACRO_S1),macroInputsDb(fx));
  if(!Array.isArray(inputs))throw new Error(inputs.reason);
  const snapshot=inputs.find(i=>i.kind==='macro_snapshot')!;
  snapshot.snapshot.norm.recession+=5e-10;
  expect(macroRegimeV2.compute(US,inputs).abstained).toBe(false);
 });

 it('accepts six-decimal classifier norms summing to 1.000002 but rejects 1.00001',async()=>{
  const fx=base(),inputs=await macroRegimeV2.gather(macroWork(fx,MACRO_S1),macroInputsDb(fx));
  if(!Array.isArray(inputs))throw new Error(inputs.reason);
  const snapshot=inputs.find(i=>i.kind==='macro_snapshot')!;
  snapshot.snapshot.norm={recovery:0.325758,overheat:0.234849,stagflation:0.219697,recession:0.219698};
  expect(Object.values(snapshot.snapshot.norm).reduce((a,b)=>a+b,0)).toBeCloseTo(1.000002,6);
  expect(macroRegimeV2.compute(US,inputs).abstained).toBe(false);
  snapshot.snapshot.norm.recession=0.219706;
  expect(macroRegimeV2.compute(US,inputs)).toEqual({abstained:true,reason:'invalid_snapshot'});
 });

 it('macro_regime_replay on the same vintage → recovery → hit',async()=>{
  const {row,inputsDb}=await registerS1();
  expect(macroRegimeReplayResolver.validateParams(row.condition!.params)).toBe(true);
  const r=await macroRegimeReplayResolver.resolve(resolveCtx(row,inputsDb));
  expect(r).toMatchObject({status:'resolved',value:'recovery',label_available_at:'2026-09-11T12:30:00.000Z'});
  if(r.status!=='resolved')throw new Error('unreachable');
  expect(r.evidence).toMatchObject({catalog:{version:CATALOG_VERSION,rules_version:'v1.0'},regime_result:{primary_state:'recovery',coverage:0.8}});
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
  const again=await produce(macroRegimeV2,[macroWork(base(),MACRO_S1)],produceCtx(db,inputsDb));
  expect(again.counts).toMatchObject({inserted:0,duplicates:1,quarantined:0,failed:0});
  expect(again.items[0]).toMatchObject({judgment_id:res.items[0].judgment_id,status:'duplicate'});
  expect(await db.judgmentsBySnapshot(MACRO_S1)).toHaveLength(1);
 });

 it('draft override: nothing registers; --dry-run yields the same id and writes nothing',async()=>{
  const {ids}=await registerS1();
  const fx=base();const draft=await macroDb('draft');
  const live=await produce(macroRegimeV2,[macroWork(fx,MACRO_S1)],produceCtx(draft,macroInputsDb(fx)));
  expect(live.items[0]).toMatchObject({status:'failed',code:'methodology_unavailable'});
  expect(await draft.judgmentsBySnapshot(MACRO_S1)).toEqual([]);
  const dry=await produce(macroRegimeV2,[macroWork(fx,MACRO_S1)],produceCtx(draft,macroInputsDb(fx),{dryRun:true}));
  expect(dry.items[0].judgment_id).toBe(ids[0]);
  expect(await draft.judgmentsBySnapshot(MACRO_S1)).toEqual([]);
 });

 it('compensation end to end: both same-day snapshots get distinct judgments, the marker advances to s2, a rerun adds nothing, a draft row adds nothing',async()=>{
  const fx=base();const db=await macroDb('active');const inputsDb=macroInputsDb(fx);
  await compensateMacro(compensateCtx(db,inputsDb));
  const a=await db.judgmentsBySnapshot(MACRO_S1);const b=await db.judgmentsBySnapshot(MACRO_S2);
  expect(a).toHaveLength(1);expect(b).toHaveLength(1);expect(a[0]).not.toBe(b[0]);
  const s2=fx.snapshots.find(s=>s.snapshot_id===MACRO_S2)!;
  const marker=await db.jobState('produce:macro_regime@v2');
  expect(marker?.state).toEqual({marker_created_at:s2.created_at,marker_snapshot_id:MACRO_S2});
  await compensateMacro(compensateCtx(db,inputsDb));
  expect(await db.judgmentsBySnapshot(MACRO_S1)).toEqual(a);
  expect(await db.judgmentsBySnapshot(MACRO_S2)).toEqual(b);
  expect((await db.jobState('produce:macro_regime@v2'))?.state).toEqual(marker?.state);
  const draft=await macroDb('draft');
  await compensateMacro(compensateCtx(draft,inputsDb));
  expect([...await draft.judgmentsBySnapshot(MACRO_S1),...await draft.judgmentsBySnapshot(MACRO_S2)]).toEqual([]);
 });

 it('binding: a missing snapshot_id or a snapshot of another region / date abstains in gather',async()=>{
  const inputsDb=macroInputsDb(base());
  expect(await macroRegimeV2.gather({subject:US,asOf:'2026-09-11',observedAt:'2026-09-11T23:00:00.000Z'},inputsDb)).toEqual({abstained:true,reason:'binding_missing',missing:['snapshot_id']});
  expect(await macroRegimeV2.gather({subject:{type:'macro_region',key:'CN'},asOf:'2026-09-11',observedAt:'2026-09-11T23:00:00.000Z',binding:{snapshot_id:MACRO_S1}},inputsDb)).toEqual({abstained:true,reason:'binding_mismatch'});
  expect(await macroRegimeV2.gather({subject:US,asOf:'2026-09-12',observedAt:'2026-09-12T23:00:00.000Z',binding:{snapshot_id:MACRO_S1}},inputsDb)).toEqual({abstained:true,reason:'binding_mismatch'});
 });

 it('compute / condition are byte-identical across 200 seeded input shuffles (spec §14.1 property)',async()=>{
  const {row}=await registerS1();
  const next=rng(20261106);
  const claim=digest(row.claim);const cond=digest(row.condition);
  for(let k=0;k<200;k++){
   const inputs=shuffled(row.inputs,next);
   const c=macroRegimeV2.compute(US,inputs);
   if(c.abstained)throw new Error(`abstained on shuffle ${k}: ${c.reason}`);
   expect(digest(c.claim)).toBe(claim);
   expect(digest(macroRegimeV2.condition(US,inputs,c.claim))).toBe(cond);
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

it('regime selection, classifier and resolver closures are hashed without I/O shells',()=>{
 const hashed=new Set([...formulaHashOf(macroRegimeV2).closure,...macroRegimeV2.deps]);
 expect(macroRegimeV2.deps).not.toContain('src/lib/macro/flags.ts');
 for(const entry of ['src/lib/macro/regime-selection.ts','src/lib/macro/regime.ts','src/lib/judgments/resolvers/macro.ts'])
  for(const file of importClosure(process.cwd(),entry))expect({file,hashed:hashed.has(file)}).toEqual({file,hashed:true});
 for(const file of ['src/lib/macro/read-api.ts','src/lib/macro/snapshots.ts','src/lib/macro/db.ts'])expect(hashed.has(file),file).toBe(false);
});

it('I/O shells import selection functions from regime-selection',()=>{
 for(const [file,name] of [['db.ts','selectEligibleHistoryAsOf'],['snapshots.ts','buildRegimeInputFromRows'],['read-api.ts','verifyHistoricalBatches']])
  expect(readFileSync(`src/lib/macro/${file}`,'utf8')).toMatch(new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['\"]\\./regime-selection['\"]`));
});

it('pins the v2 selection-only hashed file list and formula_hash',()=>{
 const hash=formulaHashOf(macroRegimeV2);
 expect([...new Set([...hash.closure,...macroRegimeV2.deps])].sort()).toEqual([
  'src/lib/data/kline/types.ts',
  'src/lib/data/sources/datagateway.ts',
  'src/lib/data/sources/eastmoney.ts',
  'src/lib/db/table-client.ts',
  'src/lib/dq/raw-store.ts',
  'src/lib/dq/reconcile/types.ts',
  'src/lib/facts/classify.ts',
  'src/lib/facts/derive.ts',
  'src/lib/facts/json-numbers.ts',
  'src/lib/facts/types.ts',
  'src/lib/industry/judgment-input.ts',
  'src/lib/industry/types.ts',
  'src/lib/judgments/canonical.ts',
  'src/lib/judgments/errors.ts',
  'src/lib/judgments/inputs.ts',
  'src/lib/judgments/kline.ts',
  'src/lib/judgments/macro-api.ts',
  'src/lib/judgments/methodologies/macro-regime.v2.ts',
  'src/lib/judgments/origins.ts',
  'src/lib/judgments/resolvers/macro.ts',
  'src/lib/judgments/resolvers/price-capabilities.ts',
  'src/lib/judgments/resolvers/schemas.ts',
  'src/lib/judgments/time.ts',
  'src/lib/judgments/types.ts',
  'src/lib/macro/catalog.ts',
  'src/lib/macro/decimal.ts',
  'src/lib/macro/judgment-contract.ts',
  'src/lib/macro/regime-selection.ts',
  'src/lib/macro/regime.ts',
  'src/lib/macro/types.ts',
  'src/lib/research/ingest/pa-v1/json.js',
  'src/lib/supabase/database.types.ts',
 ]);
 expect(hash.formula_hash).toBe('2b75151695718e1ac713b39176dd58ba3d522fb613201c7bfeaff080ce4d7b87');
});

it('sync dry-run plans a hashed, active, unpublished method with unverified licenses',async()=>{
 const {planMethodologySync,planExitCode,validateLicenseTable,licenseProblems}=await import('../methodology-sync');
 const {memoryJudgmentsDb}=await import('../memory-judgments-db');
 const licenses=validateLicenseTable(JSON.parse(readFileSync('docs/methodologies/licenses.json','utf8')));
 const db=memoryJudgmentsDb();
 const plan=await planMethodologySync([macroRegimeV2],db,{repoRoot:process.cwd(),codeVersion:MACRO_CODE_VERSION,licenses});
 expect(planExitCode(plan)).toBe(0);
 expect(plan[0]).toMatchObject({key:'macro_regime@v2',action:'register',problems:[],row:{status:'active',publishable:false,formula_hash:formulaHashOf(macroRegimeV2).formula_hash}});
 expect(licenseProblems(macroRegimeV2,licenses).length).toBeGreaterThan(0);
 expect(await db.methodology('macro_regime','v1')).toBeNull();
});
it('binding mismatch abstentions retain a buildable snapshot and stay discoverable',async()=>{
 const fx=base(),db=await macroDb('active'),inputsDb=macroInputsDb(fx);
 const work={...macroWork(fx,MACRO_S1),subject:{type:'macro_region' as const,key:'CN'}};
 const r=await produce(macroRegimeV2,[work],produceCtx(db,inputsDb));
 expect(r.counts.inserted).toBe(1);
 const ids=await db.judgmentsBySnapshot(MACRO_S1);
 expect(ids).toHaveLength(1);
 const row=(await db.getJudgment(ids[0]))!;
 expect(row.abstain_reason).toBe('binding_mismatch');
 expect(row.inputs.map(i=>i.kind)).toEqual(['macro_snapshot']);
});
