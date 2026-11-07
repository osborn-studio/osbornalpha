// src/lib/judgments/methodologies/macro-regime.v1.ts
// macro_regime@v1 (spec §11.1, §8.1 G28; doc docs/methodologies/macro_regime/v1.md): current-period nowcast of the US/CN
// growth–inflation regime, bound to one published macro snapshot (binding.snapshot_id, spec §6.4). The claim restates the
// snapshot's primary state as a categorical claim: distribution = norm flagged scores_are_not_probabilities, margin_pp in
// percentage points, catalog_version frozen. The label is the same classifier re-run for the same reference month on the
// cutoff vintage (resolver macro_regime_replay, label_policy cutoff_vintage, horizon 3 calendar months).
// Active: the landed macro API reuses classifyRegime. Licenses remain unverified: publishable=false.
import type {Abstained,Active,CategoricalClaim,Condition,Input,JudgmentInputsDb,MacroSnapshotSnapshot,Methodology,Regime,Subject,Target,WorkItem} from '@/lib/judgments/types';
import {buildInput} from '@/lib/judgments/inputs';
import {addMonthsPeriod} from '@/lib/judgments/time';

import {METHODOLOGY_VERSION} from '@/lib/macro/regime';
export const MACRO_UPSTREAM_VERSION=METHODOLOGY_VERSION;
export const MACRO_REGIMES:readonly Regime[]=['recovery','overheat','stagflation','recession'];
/** Allowed gap (pp) between the snapshot's stored margin and the one recomputed from norm; a fraction-valued margin fails it (G28). */
export const MARGIN_UNIT_TOLERANCE_PP=0.01;
/** Macro spec §5.3 classifies nothing below this coverage; re-checked because compute never trusts the snapshot status. */
const MIN_COVERAGE=0.6;
const ZH:Record<Regime,string>={recovery:'复苏',overheat:'过热',stagflation:'滞胀',recession:'衰退'};
type SnapshotInput=Extract<Input,{kind:'macro_snapshot'}>;

const abstain=(reason:string,missing?:string[]):Abstained=>missing?{abstained:true,reason,missing}:{abstained:true,reason};
const snapshotOf=(inputs:Input[]):MacroSnapshotSnapshot|null=>inputs.find((i):i is SnapshotInput=>i.kind==='macro_snapshot')?.snapshot??null;
/** (norm[primary] − norm[secondary]) × 100, rounded to 6 decimals: percentage points (spec §8.1). */
export const marginPp=(norm:Record<Regime,number>,primary:Regime,secondary:Regime)=>Math.round((norm[primary]-norm[secondary])*1e8)/1e6;

async function gather(item:WorkItem,db:JudgmentInputsDb):Promise<Input[]|Abstained>{
 const snapshotId=item.binding?.snapshot_id;
 if(!snapshotId)return abstain('binding_missing',['snapshot_id']);
 const published=await db.macro.snapshot(snapshotId);
 if(published&&published.status!=='active'&&published.status!=='superseded')return abstain('snapshot_not_published');
 const snap=await buildInput({kind:'macro_snapshot',ref:{snapshot_id:snapshotId}},db,item.asOf,item.observedAt);
 if(snap.kind!=='macro_snapshot')throw new Error(`buildInput returned ${snap.kind} for a macro_snapshot ref`);
 const s=snap.snapshot;
 if(s.region!==item.subject.key||s.as_of!==item.asOf)return abstain('binding_mismatch');
 // A foreign upstream version is not computed on; the snapshot alone is frozen so the abstention stays findable by snapshot_id.
 if(s.methodology_version!==MACRO_UPSTREAM_VERSION||s.catalog_version!==macroRegimeV1.params.catalog_version)return [snap];
 const inputs:Input[]=[snap];
 for(const id of s.observation_ids){
  const o=await db.macro.observation(id);   // locator lookup only; every frozen value comes from buildInput
  if(!o)return abstain('observation_missing',[id]);
  inputs.push(await buildInput({kind:'macro_observation',ref:{series_id:o.series_id,period_end:o.period_end,vintage_id:o.vintage_id}},db,item.asOf,item.observedAt));
 }
 return inputs;
}

async function resolveTarget(item:WorkItem):Promise<Target>{
 return {kind:'period',period:addMonthsPeriod(item.asOf.slice(0,7),3)};
}

function compute(subject:Subject,inputs:Input[]):Active<CategoricalClaim>|Abstained{
 const s=snapshotOf(inputs);
 if(!s)return abstain('input_missing',['macro_snapshot']);
 if(s.methodology_version!==MACRO_UPSTREAM_VERSION||s.catalog_version!==macroRegimeV1.params.catalog_version)return abstain('upstream_version_mismatch');
 if(s.region!==subject.key)return abstain('binding_mismatch');
 if(!MACRO_REGIMES.every(r=>Number.isFinite(s.scores?.[r])&&Number.isFinite(s.norm?.[r])&&s.norm[r]>=0)
  ||Math.abs(MACRO_REGIMES.reduce((sum,r)=>sum+s.norm[r],0)-1)>5e-6
  ||s.primary_state===null||s.secondary_state===null
  ||!MACRO_REGIMES.includes(s.primary_state)||!MACRO_REGIMES.includes(s.secondary_state)||s.primary_state===s.secondary_state
  ||!Number.isFinite(s.margin_pp))return abstain('invalid_snapshot');
 if(s.coverage<MIN_COVERAGE)return abstain('coverage_below_threshold');
 if(inputs.filter(i=>i.kind==='macro_observation').length!==s.observation_ids.length)return abstain('observation_missing');
 const margin=marginPp(s.norm,s.primary_state,s.secondary_state);
 if(s.margin_pp!==null&&Math.abs(s.margin_pp-margin)>MARGIN_UNIT_TOLERANCE_PP)return abstain('margin_unit_mismatch');
 return {abstained:false,claim:{selected:s.primary_state,classes:[...MACRO_REGIMES],distribution:Object.fromEntries(MACRO_REGIMES.map(r=>[r,s.norm[r]])),
  scores_are_not_probabilities:true,margin_pp:margin,catalog_version:s.catalog_version}};
}

function condition(subject:Subject,inputs:Input[],claim:CategoricalClaim):Condition{
 const s=snapshotOf(inputs);
 if(!s)throw new Error('macro_regime@v1 condition() needs the macro_snapshot input');
 const period=s.as_of.slice(0,7);const sel=claim.selected as Regime;
 return {resolver:'macro_regime_replay',
  params:{region:s.region,reference_period:period,macro_methodology_version:MACRO_UPSTREAM_VERSION,catalog_version:s.catalog_version},
  predicate:{op:'eq',rhs:sel},
  text:{zh:`${s.region} ${period} 当期象限为“${ZH[sel]}”（同一分类函数在截止 vintage 下对同一参考期重算）`,
   en:`${s.region} ${period} regime is "${sel}" (same classifier re-run for the same reference month on the cutoff vintage)`}};
}

export const macroRegimeV1:Methodology<CategoricalClaim>={
 id:'macro_regime',version:'v1',judgment_type:'macro_regime',kind:'categorical',producer_kind:'rule',
 subject_types:['macro_region'],input_kinds:['macro_snapshot','macro_observation'],
 upstream:{macro_methodology_version:MACRO_UPSTREAM_VERSION},
 title:{zh:'宏观象限（当期 nowcast）',en:'Macro regime (current-period nowcast)'},
 doc:'docs/methodologies/macro_regime/v1.md',
 params:{grace_days:30,threshold_n:100,ece_max:0.1,window_years:3,embargo_days:0,label_policy:'cutoff_vintage',catalog_version:'macro-catalog/30bcaa2a33c5'},
 horizon:{unit:'calendar_months',n:3},
 deps:['src/lib/judgments/resolvers/macro.ts','src/lib/macro/read-api.ts','src/lib/macro/snapshots.ts','src/lib/macro/freshness.ts','src/lib/macro/db.ts','src/lib/dq/freshness.ts'],
 module:'src/lib/judgments/methodologies/macro-regime.v1.ts',
 status:'active',
 gather,resolveTarget,compute,condition,
};
