// src/lib/judgments/resolvers/macro.test.ts
// F4 Task 11 (spec §7.3 row 3, §11.1, §14.1 macro bullets): classifyAsOf at the cutoff; same vintage vs revised
// argmax (hit/miss is decided by settle's predicate on the returned class); coverage < 0.6, catalog drift,
// post-cutoff vintages, and the production MacroUnavailable path.
import {describe,expect,it} from 'vitest';
import {unavailableMacroReadApi} from '../macro-api';
import {conditionJudgment,stubInputsDb} from '../testing/fixtures';
import type {MacroObservationRef,MacroReadApi,Regime,RegimeResult,ResolveContext} from '../types';
import {macroRegimeReplayResolver as resolver} from './macro';

const P={region:'US' as const,reference_period:'2026-06',macro_methodology_version:'v1.0',catalog_version:'catalog/1'};
const CUTOFF='2026-10-30T00:00:00.000Z';
const regime=(primary:Regime,coverage=0.8):RegimeResult=>({primary_state:primary,secondary_state:'overheat',scores:{recovery:2,overheat:1,stagflation:0,recession:0},norm:{recovery:0.6,overheat:0.3,stagflation:0.05,recession:0.05},coverage,margin_pp:30,growth_axis:0.5,inflation_axis:-0.2});
const OBS:MacroObservationRef[]=[
 {series_id:'US.IP',period_end:'2026-06-30',vintage_id:'v1',value:101.2,unit:'index',available_at:'2026-07-17T13:15:00.000Z'},
 {series_id:'US.CPI',period_end:'2026-06-30',vintage_id:'v2',value:3.1,unit:'pct',available_at:'2026-07-15T12:30:00.000Z'},
];
const CATALOG={version:'catalog/1',weights:{'US.CPI':0.5,'US.IP':0.5},rules_version:'rules/1'};
const judgment=conditionJudgment({resolver:'macro_regime_replay',params:P,predicate:{op:'eq',rhs:'recovery'},text:{zh:'2026-06 处于复苏',en:'2026-06 is recovery'}},{kind:'period',period:'2026-09'},
 {subject_type:'macro_region',subject_key:'US',label_policy:'cutoff_vintage'});
function ctxWith(classifyAsOf:MacroReadApi['classifyAsOf'],macro?:MacroReadApi):ResolveContext{
 const base=stubInputsDb().macro;
 return {judgment,cutoff:CUTOFF,now:CUTOFF,inputsDb:stubInputsDb({macro:macro??{...base,classifyAsOf}}),signal:new AbortController().signal};
}

describe('macro_regime_replay resolver',()=>{
 it('re-runs the classification at the cutoff; value/label = primary_state; evidence freezes refs, catalog and regime result',async()=>{
  const calls:unknown[][]=[];
  const r=await resolver.resolve(ctxWith(async(...a)=>{calls.push(a);return {regime:regime('recovery'),observation_refs:OBS,catalog:CATALOG};}));
  expect(calls).toEqual([['US','2026-06',CUTOFF,'v1.0']]);
  expect(r).toEqual({status:'resolved',value:'recovery',label:'recovery',unit:null,from:'2026-06-01',to:'2026-06-30',label_available_at:'2026-07-17T13:15:00.000Z',
   evidence:{observation_refs:[OBS[1],OBS[0]],catalog:CATALOG,regime_result:regime('recovery'),cutoff:CUTOFF,reference_period:'2026-06',macro_methodology_version:'v1.0'}});
 });
 it('a revision that moves the argmax returns the new class (settle scores it as a miss)',async()=>{
  const r=await resolver.resolve(ctxWith(async()=>({regime:regime('stagflation'),observation_refs:OBS,catalog:CATALOG})));
  expect(r).toMatchObject({status:'resolved',value:'stagflation'});
 });
 it('coverage < 0.6, no regime or no observations → Unavailable(coverage)',async()=>{
  for(const out of [{regime:regime('recovery',0.59),observation_refs:OBS,catalog:CATALOG},{regime:null,observation_refs:OBS,catalog:CATALOG},{regime:regime('recovery'),observation_refs:[],catalog:CATALOG}])
   expect(await resolver.resolve(ctxWith(async()=>out))).toEqual({status:'unavailable',failure:'coverage'});
 });
 it('catalog drift → Unavailable(catalog_version_mismatch); a vintage after the cutoff → Unavailable(vintage_after_cutoff)',async()=>{
  expect(await resolver.resolve(ctxWith(async()=>({regime:regime('recovery'),observation_refs:OBS,catalog:{...CATALOG,version:'catalog/2'}})))).toEqual({status:'unavailable',failure:'catalog_version_mismatch'});
  expect(await resolver.resolve(ctxWith(async()=>({regime:regime('recovery'),observation_refs:[...OBS,{...OBS[0],vintage_id:'v9',available_at:'2026-11-01T00:00:00.000Z'}],catalog:CATALOG})))).toEqual({status:'unavailable',failure:'vintage_after_cutoff'});
 });
 it('production wiring before the macro module lands: MacroUnavailable → Unavailable(macro_unavailable); other errors propagate',async()=>{
  expect(await resolver.resolve(ctxWith(async()=>{throw new Error('unused');},unavailableMacroReadApi()))).toEqual({status:'unavailable',failure:'macro_unavailable'});
  await expect(resolver.resolve(ctxWith(async()=>{throw new Error('socket hang up');}))).rejects.toThrow('socket hang up');
 });
 it('has no quarantine verdicts: fromOverride throws override_mismatch',()=>{
  let code:string|undefined;
  try{resolver.fromOverride(judgment,{reason_code:'settlement_ambiguous_fact',resolution:{kind:'choose_fact',chosen:{}},evidence_hash:'x',resolved_by:'a',at:CUTOFF,cutoff:CUTOFF});}catch(e){code=(e as {code?:string}).code;}
  expect(code).toBe('override_mismatch');
 });
});
