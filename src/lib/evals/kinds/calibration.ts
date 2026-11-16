// src/lib/evals/kinds/calibration.ts
// judgment_calibration (spec §11.3, §3.3 calibration rows). NOT enabled (prerequisite: F4 settledForecasts;
// kinds/registry.ts). Input: F4's settledForecasts rows. Eligibility per record: p a decimal in [0, 1]
// (Brier allows the endpoints); outcome 0|1; registered_at + 1 day ≤ evidence_available_date (UTC
// midnight); settled_at ≥ horizon_end; exactly one record per forecast_id (duplicates: all ineligible);
// parseable timestamps. Revision chains (revision_of → parent): an unknown parent or a cycle makes the
// record ineligible; within a chain only the LAST eligible registration (by registered_at, then
// forecast_id) counts, earlier eligible ones are superseded_in_chain. Eligible → pass (population),
// ineligible → skipped(ineligible). Output: Brier = mean (p − outcome)² and a 10-bucket reliability table
// ([0,0.1) … [0.9,1.0], p = 1 in the last bucket), both exact on BigInt, as 10-place truncated text. No
// eligible sample → population 0 → incomplete; no thresholds (F4 supplies them) → incomplete too. Population = the ELIGIBLE forecasts only (§3.3 calibration row, Codex
// plan round 1 P2-5): ineligible ones stay in cases[] as skipped(ineligible) and are counted in coverage.skipped,
// outside the population, the same way whether 0, some or all forecasts are eligible. Thresholds are F4's.
import type {CaseReport,Summary,SummaryContext,Thresholds} from '../types';
import {gateOf,summarize} from '../summary';
import {ratioText} from './ratio';

export interface Settlement{outcome:0|1;settled_at:string;evidence_ref:string;evidence_available_date:string}
export interface SettledForecast{forecast_id:string;forecast_sha256:string;methodology_version:string;claim:string;p:string;registered_at:string;input_snapshot_sha256:string;horizon_end:string;revision_of:string|null;settlement:Settlement}
export type IneligibleReason='evidence_contract_invalid'|'p_invalid'|'p_out_of_range'|'outcome_invalid'|'timestamp_invalid'|'evidence_too_soon'|'settled_before_horizon'|'multiple_settlements'|'revision_parent_missing'|'revision_parent_ineligible'|'revision_cycle'|'superseded_in_chain';
export interface ReliabilityBucket{index:number;lower:string;upper:string;n:number;mean_p:string|null;observed_rate:string|null}
export interface CalibrationResult{gate:'incomplete'|null;detail:{reason:'thresholds_pending_f4'}|null;thresholds:Thresholds|null;cases:CaseReport[];eligible:number;brier:string|null;reliability:ReliabilityBucket[];ineligible:{case_id:string;forecast_id:string;reason:IneligibleReason}[]}

const DAY_MS=86_400_000;
interface Dec{n:bigint;s:number}
const parseP=(p:string):Dec|null=>{if(typeof p!=='string'||!/^\d+(\.\d+)?$/.test(p))return null;const [i,f='']=p.split('.');return {n:BigInt(i+f),s:f.length};};
const dayMs=(v:unknown):number=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return Number.NaN;
 const t=Date.parse(`${v}T00:00:00Z`);
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v?t:Number.NaN;
};
/** ISO-8601 date-time with seconds optional, and Z or an explicit offset; the calendar date must round-trip. */
const ms=(v:unknown):number=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v))return Number.NaN;
 if(Number.isNaN(dayMs(v.slice(0,10))))return Number.NaN;
 return Date.parse(v);
};

function recordReason(f:SettledForecast):IneligibleReason|null{
 // Shape validation is not authentication: F4 must still bind these references to visible evidence.
 const nonblank=(v:unknown)=>typeof v==='string'&&v.trim().length>0;
 const hash=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
 if(![f.forecast_id,f.methodology_version,f.claim].every(nonblank)||!hash(f.forecast_sha256)||!hash(f.input_snapshot_sha256)||
  !(f.revision_of===null||nonblank(f.revision_of))||!f.settlement||typeof f.settlement!=='object'||!nonblank(f.settlement.evidence_ref))return 'evidence_contract_invalid';
 const p=parseP(f.p);
 if(!p)return 'p_invalid';
 if(p.n>10n**BigInt(p.s))return 'p_out_of_range';
 if(f.settlement.outcome!==0&&f.settlement.outcome!==1)return 'outcome_invalid';
 const reg=ms(f.registered_at),ev=dayMs(f.settlement.evidence_available_date),settled=ms(f.settlement.settled_at),horizon=Number.isNaN(dayMs(f.horizon_end))?ms(f.horizon_end):dayMs(f.horizon_end);   // horizon_end: a calendar date or a timestamp
 if([reg,ev,settled,horizon].some(Number.isNaN))return 'timestamp_invalid';
 if(reg+DAY_MS>ev)return 'evidence_too_soon';
 if(settled<horizon)return 'settled_before_horizon';
 return null;
}

export function evaluateCalibration(forecasts:SettledForecast[],thresholds?:Thresholds):CalibrationResult{
 const count=new Map<string,number>();
 for(const f of forecasts)count.set(f.forecast_id,(count.get(f.forecast_id)??0)+1);
 const reason=new Map<SettledForecast,IneligibleReason>();
 const byId=new Map<string,SettledForecast>();
 for(const f of forecasts){
  if((count.get(f.forecast_id)??0)>1){reason.set(f,'multiple_settlements');continue;}
  byId.set(f.forecast_id,f);
  const r=recordReason(f);if(r)reason.set(f,r);
 }
 const chains=new Map<string,SettledForecast[]>();
 for(const f of byId.values()){
  let cur=f;const seen=new Set([f.forecast_id]);let bad:IneligibleReason|null=null;
  while(cur.revision_of!==null){
   const parent=byId.get(cur.revision_of);
   if(!parent){bad=count.has(cur.revision_of)?'revision_parent_ineligible':'revision_parent_missing';break;}
   if(seen.has(parent.forecast_id)){bad='revision_cycle';break;}
   seen.add(parent.forecast_id);cur=parent;
  }
  if(bad){if(!reason.has(f))reason.set(f,bad);continue;}
  if(reason.has(f))continue;
  const g=chains.get(cur.forecast_id)??[];g.push(f);chains.set(cur.forecast_id,g);
 }
 for(const g of chains.values()){
  g.sort((a,b)=>ms(a.registered_at)-ms(b.registered_at)||(a.forecast_id<b.forecast_id?-1:a.forecast_id>b.forecast_id?1:0));
  for(const f of g.slice(0,-1))reason.set(f,'superseded_in_chain');
 }
 const seenIds=new Map<string,number>();
 const cases:CaseReport[]=[];const ineligible:CalibrationResult['ineligible']=[];const eligible:SettledForecast[]=[];
 for(const f of forecasts){
  const k=(seenIds.get(f.forecast_id)??0)+1;seenIds.set(f.forecast_id,k);
  const case_id=k===1?f.forecast_id:`${f.forecast_id}#${k}`;
  const r=reason.get(f)??null;
  const right=f.settlement?.outcome===0||f.settlement?.outcome===1?String(f.settlement.outcome):null;
  cases.push({case_id,required:true,outcome:r?{result:'skipped',reason:'ineligible'}:{result:'pass'},left:parseP(f.p)?f.p:null,right,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,
   detail:{eligible:r===null,...(r?{reason:r}:{}),methodology_version:f.methodology_version,horizon_end:f.horizon_end,revision_of:f.revision_of}});
  if(r)ineligible.push({case_id,forecast_id:f.forecast_id,reason:r});else eligible.push(f);
 }
 const S=eligible.reduce((m,f)=>Math.max(m,parseP(f.p)!.s),0);
 const scaled=(f:SettledForecast)=>{const p=parseP(f.p)!;return p.n*10n**BigInt(S-p.s);};
 const one=10n**BigInt(S);
 let sq=0n;for(const f of eligible){const d=scaled(f)-BigInt(f.settlement.outcome)*one;sq+=d*d;}
 const brier=eligible.length===0?null:ratioText(sq,BigInt(eligible.length)*one*one);
 const buckets=Array.from({length:10},()=>({n:0,sumP:0n,sumO:0n}));
 for(const f of eligible){
  const p=parseP(f.p)!;const idx=Math.min(9,Number((p.n*10n)/10n**BigInt(p.s)));
  const b=buckets[idx];b.n++;b.sumP+=scaled(f);b.sumO+=BigInt(f.settlement.outcome);
 }
 const bound=(i:number)=>i===0?'0':i===10?'1':`0.${i}`;
 const reliability=buckets.map((b,i):ReliabilityBucket=>({index:i,lower:bound(i),upper:bound(i+1),n:b.n,
  mean_p:b.n===0?null:ratioText(b.sumP,BigInt(b.n)*one),observed_rate:b.n===0?null:ratioText(b.sumO,BigInt(b.n))}));
 return {gate:thresholds?null:'incomplete',detail:thresholds?null:{reason:'thresholds_pending_f4'},thresholds:thresholds??null,cases,eligible:eligible.length,brier,reliability,ineligible};
}

export const calibrationSummaryContext=(thresholds:Thresholds):SummaryContext=>({thresholds,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset:false,evidenceClass:'truth'});
/** Population = eligible forecasts; every ineligible one adds to coverage.skipped outside the population (P2-5). No eligible → incomplete. */
export function summarizeCalibration(r:CalibrationResult,thresholds:Thresholds|null=r.thresholds):Summary{
 const eligible=r.cases.filter(c=>!(c.outcome.result==='skipped'&&c.outcome.reason==='ineligible'));
 const {gate:_gate,...s}=summarize(eligible,calibrationSummaryContext(thresholds??{max_fail:0,min_coverage_optional:'0.95'}));
 const base={...s,coverage:{...s.coverage,skipped:s.coverage.skipped+(r.cases.length-eligible.length)}};
 // Thresholds are F4's: until supplied no gate is decided, whatever the sample (detail.reason thresholds_pending_f4).
 return {...base,gate:thresholds?gateOf(base):'incomplete'};
}
