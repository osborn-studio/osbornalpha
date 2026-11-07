// src/lib/judgments/resolvers/macro.ts
// macro_regime_replay resolver (spec §7.3 row 3, §11.1). The label is the SAME macro classification function
// (macro regime.ts: same rules version, same catalog weights, same argmax) re-run for reference_period on the latest
// vintages with available_at ≤ cutoff, via MacroReadApi.classifyAsOf; settle passes cutoff = settle_by
// (label_policy cutoff_vintage). coverage < 0.6, no regime or no observations → Unavailable(coverage) (the macro
// spec's own rule; void at settle_by); catalog version other than the frozen one → Unavailable(catalog_version_mismatch);
// an observation newer than the cutoff (API contract breach) → Unavailable(vintage_after_cutoff); the macro module not
// landed yet (MacroUnavailable from unavailableMacroReadApi, production until WP-M3) → Unavailable(macro_unavailable).
// label_available_at = max available_at of the observations used. No inconsistency kinds exist here, so no override.
import {JudgmentError} from '../errors';
import {MacroUnavailable} from '../macro-api';
import {addDaysIso,monthEndIso} from '../time';
import type {JudgmentRow,MacroReadApi,QuarantineOverride,Resolver,ResolverResult,ResolveContext,Target} from '../types';
import {validateMacroRegimeReplayParams} from './schemas';

export const MACRO_RESOLVER_VERSION='macro_regime_replay/1';
export const MACRO_MAX_FETCH_MS=10_000;
export const MACRO_MIN_COVERAGE=0.6;
const unavailable=(failure:string):ResolverResult=>({status:'unavailable',failure});
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
type Classified=Awaited<ReturnType<MacroReadApi['classifyAsOf']>>;

export const macroRegimeReplayResolver:Resolver={
 name:'macro_regime_replay',version:MACRO_RESOLVER_VERSION,maxFetchMs:MACRO_MAX_FETCH_MS,
 validateParams:(p:unknown)=>validateMacroRegimeReplayParams(p),
 /** The label exists once the target month is over (spec §3.4 rule 3). */
 labelAvailableAt:(params:unknown,target:Target)=>validateMacroRegimeReplayParams(params)&&target.kind==='period'?`${addDaysIso(monthEndIso(target.period),1)}T00:00:00.000Z`:null,
 async resolve(ctx:ResolveContext):Promise<ResolverResult>{
  const c=ctx.judgment.condition;
  if(!c||c.resolver!=='macro_regime_replay'||!validateMacroRegimeReplayParams(c.params))return unavailable('invalid_condition');
  const p=c.params;
  let r:Classified;
  try{r=await ctx.inputsDb.macro.classifyAsOf(p.region,p.reference_period,ctx.cutoff,p.macro_methodology_version);}
  catch(e){if(e instanceof MacroUnavailable)return unavailable('macro_unavailable');throw e;}
  if(r.catalog.version!==p.catalog_version)return unavailable('catalog_version_mismatch');
  if(!r.regime||r.regime.coverage<MACRO_MIN_COVERAGE||r.observation_refs.length===0)return unavailable('coverage');
  if(r.observation_refs.some(o=>o.available_at>ctx.cutoff))return unavailable('vintage_after_cutoff');
  const refs=[...r.observation_refs].sort((a,b)=>cmp(a.series_id,b.series_id)||cmp(a.period_end,b.period_end))
   .map(o=>({series_id:o.series_id,period_end:o.period_end,vintage_id:o.vintage_id,value:o.value,unit:o.unit,available_at:o.available_at}));
  const label=refs.reduce((m,o)=>o.available_at>m?o.available_at:m,refs[0].available_at);
  return {status:'resolved',value:r.regime.primary_state,label:r.regime.primary_state,unit:null,from:`${p.reference_period}-01`,to:monthEndIso(p.reference_period),label_available_at:label,
   evidence:{observation_refs:refs,catalog:r.catalog,regime_result:r.regime,cutoff:ctx.cutoff,reference_period:p.reference_period,macro_methodology_version:p.macro_methodology_version}};
 },
 fromOverride(j:JudgmentRow,o:QuarantineOverride):ResolverResult{
  throw new JudgmentError('override_mismatch',`macro_regime_replay has no quarantine verdicts (${o.reason_code} on ${j.judgment_id})`);
 },
};
