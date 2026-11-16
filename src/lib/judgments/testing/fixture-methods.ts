// src/lib/judgments/testing/fixture-methods.ts
// Test-only methods and fixtures (not a test file; never in REGISTRY). fixtureRegimeMethod has the
// shape of macro_regime@v2 (Task 19) over the fixture macro API: inputs = the bound macro_snapshot
// (binding.snapshot_id, spec §6.4) + each of its macro_observations; claim = categorical primary state,
// normalised scores as a non-probability distribution, margin_pp, catalog_version; condition =
// macro_regime_replay for the as_of month; horizon 3 calendar months; cutoff_vintage. FIXTURE_MACRO:
// s-a and s-b are two US snapshots on the same as_of (different judgments, spec §6.4 / G25), s-none is
// unclassified, s-late's last observation becomes available the day after its as_of (lookahead even
// though created_at is earlier — spec §3.7 / F10). FIXTURE_RESOLVERS stands in for Task 11's resolvers.
import type {CategoricalClaim,Input,JudgmentInputsDb,MacroSnapshotSnapshot,Methodology,Regime,RegimeResult} from '../types';
import {buildInput,buildOrAbstain} from '../inputs';
import {memoryJudgmentInputsDb} from '../inputs-db';
import {fixtureMacroReadApi,observationIdOf} from '../macro-api';
import type {MacroFixture} from '../macro-api';
import type {ResolverLookup} from '../register';
import {defaultResolveTarget} from '../target';

export const FIXTURE_ASOF='2026-10-16';
const REGIMES:Regime[]=['recovery','overheat','stagflation','recession'];
const obs=(series_id:string,vintage_id:string,value:number,available_at:string)=>({observation_id:observationIdOf({series_id,period_end:'2026-09-30',vintage_id}),series_id,period_end:'2026-09-30',vintage_id,value,unit:'pct',available_at});
const PMI=obs('us_ism_pmi','v1',49.1,'2026-10-01T14:00:00.000Z');
const CPI=obs('us_cpi_yoy','v1',2.9,'2026-10-15T12:30:00.000Z');
const CPI2=obs('us_cpi_yoy','v2',3.1,'2026-10-15T20:00:00.000Z');
const LATE=obs('us_payrolls','v1',150,'2026-10-17T12:30:00.000Z');
const regime=(primary:Regime,secondary:Regime,norm:Record<Regime,number>):RegimeResult=>({primary_state:primary,secondary_state:secondary,scores:{...norm},norm,coverage:0.8,margin_pp:Math.round((norm[primary]-norm[secondary])*1000)/10,growth_axis:0.4,inflation_axis:-0.1});
const R1=regime('recovery','overheat',{recovery:0.4,overheat:0.3,stagflation:0.2,recession:0.1});
const R2=regime('overheat','recovery',{recovery:0.3,overheat:0.4,stagflation:0.2,recession:0.1});
const snap=(snapshot_id:string,observation_ids:string[],regime_:RegimeResult|null,created_at:string)=>({snapshot_id,region:'US' as const,as_of:FIXTURE_ASOF,methodology_version:'v1.0',catalog_version:'cat-1',observation_ids,regime:regime_,created_at,status:'active' as const});
export const FIXTURE_MACRO:MacroFixture={fixture_version:'macro-fixture/1',observations:[PMI,CPI,CPI2,LATE],classifications:[],series_catalog:{US:[{id:'us_cpi_yoy',weight:0.25,created_at:'2026-09-01T00:00:00.000Z'},{id:'us_ism_pmi',weight:0.25,created_at:'2026-09-01T00:00:00.000Z'}]},snapshots:[
 snap('s-a',[PMI.observation_id,CPI.observation_id],R1,'2026-10-16T01:00:00.000Z'),
 snap('s-b',[PMI.observation_id,CPI2.observation_id],R2,'2026-10-16T02:00:00.000Z'),
 snap('s-none',[PMI.observation_id],null,'2026-10-16T03:00:00.000Z'),
 snap('s-late',[PMI.observation_id,LATE.observation_id],R1,'2026-10-16T20:00:00.000Z'),
]};
export const fixtureInputsDb=():JudgmentInputsDb=>memoryJudgmentInputsDb({macro:fixtureMacroReadApi(FIXTURE_MACRO)});
const snapshotOf=(inputs:readonly Input[])=>inputs.find(x=>x.kind==='macro_snapshot')?.snapshot as MacroSnapshotSnapshot|undefined;
export const fixtureRegimeMethod:Methodology<CategoricalClaim>={
 id:'fixture_regime',version:'v1',judgment_type:'macro_regime',kind:'categorical',producer_kind:'rule',
 subject_types:['macro_region'],input_kinds:['macro_snapshot','macro_observation'],upstream:{macro_methodology_version:'v1.0'},
 title:{zh:'测试用宏观象限',en:'Fixture macro regime'},doc:'docs/methodologies/README.md',params:{grace_days:30,label_policy:'cutoff_vintage'},
 horizon:{unit:'calendar_months',n:3},deps:[],module:'src/lib/judgments/testing/fixture-methods.ts',status:'active',
 async gather(item,db){
  const id=item.binding?.snapshot_id;
  if(!id)return {abstained:true,reason:'binding_missing',missing:['snapshot_id']};
  const s=await buildOrAbstain({kind:'macro_snapshot',ref:{snapshot_id:id}},db,item.asOf,item.observedAt);
  if('abstained' in s)return s;
  if(s.kind!=='macro_snapshot')throw new Error('fixture_regime: unexpected input kind');
  const out:Input[]=[s];
  for(const oid of s.snapshot.observation_ids){
   const o=await db.macro.observation(oid);
   if(!o)return {abstained:true,reason:'input_not_public',missing:[oid]};
   out.push(await buildInput({kind:'macro_observation',ref:{series_id:o.series_id,period_end:o.period_end,vintage_id:o.vintage_id}},db,item.asOf,item.observedAt));
  }
  return out;
 },
 resolveTarget(item,inputs,db){return defaultResolveTarget(this.horizon,item,inputs,db);},
 compute(_subject,inputs){
  const s=snapshotOf(inputs);
  if(!s)return {abstained:true,reason:'snapshot_missing'};
  if(s.primary_state===null)return {abstained:true,reason:'snapshot_unclassified'};
  const claim:CategoricalClaim={selected:s.primary_state,classes:[...REGIMES],distribution:{...s.norm},scores_are_not_probabilities:true,...(s.margin_pp!==null?{margin_pp:s.margin_pp}:{}),catalog_version:s.catalog_version};
  return {abstained:false,claim};
 },
 condition(subject,inputs,claim){
  const s=snapshotOf(inputs)!;const period=s.as_of.slice(0,7);
  return {resolver:'macro_regime_replay',params:{region:subject.key as 'US'|'CN',reference_period:period,macro_methodology_version:s.methodology_version,catalog_version:s.catalog_version},predicate:{op:'eq',rhs:claim.selected as Regime},
   text:{zh:`${period} 的主判定在截止 vintage 下重算仍为 ${claim.selected}`,en:`The ${period} primary regime recomputed on the cutoff vintage is still ${claim.selected}`}};
 },
};
export const fixtureModelMethod:Methodology<CategoricalClaim>={...fixtureRegimeMethod,id:'fixture_regime_model',producer_kind:'model',title:{zh:'测试用宏观象限（模型）',en:'Fixture macro regime (model)'}};
export const FIXTURE_RESOLVERS:ResolverLookup=name=>name==='macro_regime_replay'||name==='fact_metric'||name==='price_return'
 ?{name,version:'fixture',validateParams:(p:unknown)=>typeof p==='object'&&p!==null&&!Array.isArray(p),labelAvailableAt:()=>null}:null;
