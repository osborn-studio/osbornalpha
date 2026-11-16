// src/lib/judgments/resolvers/facts.ts
// fact_metric resolver (spec §7.3 row 2, §7.6 S04, §12.2). The realised value is derived AT THE CUTOFF through
// JudgmentInputsDb.deriveMetricsAsOf (anon readFacts history → deriveMetrics; never the materialised
// financial_metrics cache, audit G13 / S05) and matched on the FULL natural key (metric, period_start, period_end,
// duration, unit, input_unit, basis, formula_version). compare='value' → Number(value); compare='yoy' →
// (current − prior) / |prior|, prior = the same series ending 350–380 days earlier (the derive kernel's YoY window).
// Not visible at the cutoff → Pending(not_reported); truncated read → Unavailable(truncated) (incomplete data is
// never used); several rows for one key → Inconsistent(ambiguous_fact): each candidate carries key, value_text,
// the realised value it would settle, its lineage and the §3.5 derivation envelope (rows of the lineage concepts
// with period_end in [period_start − 400 d, period_end], every kernel-read field, sorted), so a choose_fact
// verdict settles from the chosen candidate alone (no reads). label_available_at = end of the UTC day of the
// latest input available_date. Every operand used (ordinary settlements, candidates, BOTH yoy sides) is frozen in
// the §3.5 financial_metric snapshot shape (FactOperand: key, value_text, lineage, derivation rows) and
// fromOverride re-derives each operand from its frozen rows before trusting a candidate (plan audit P1-06).
// Cutoff availability (P1-07): facts are available at endOfUtcDay(available_date), so the derive date is the latest
// UTC date that has fully elapsed by the cutoff (factsAsOfDate).
import {deriveMetrics} from '@/lib/facts/derive';
import type {MetricRow,ReadFactsResult} from '@/lib/facts/types';
import {canonicalize,digest} from '../canonical';
import {JudgmentError} from '../errors';
import {derivationRowsFor,factRowOfDerivation} from '../inputs';
import {addDaysIso,endOfUtcDay} from '../time';
import type {DeriveAsOfResult,DerivationRow,FactMetricParams,JudgmentRow,MetricKey,QuarantineOverride,Resolver,ResolverResult,ResolveContext,Target} from '../types';
import {isRealDate,validateFactMetricParams} from './schemas';
// The FactRow → DerivationRow projection and the §3.5 envelope selection have ONE implementation, in
// inputs.ts (Task 8); the resolver re-exports it so settlement evidence and registered snapshots agree.
export {derivationRowOf} from '../inputs';

export const FACT_RESOLVER_VERSION='fact_metric/1';
export const FACT_MAX_FETCH_MS=10_000;
export const DERIVATION_LOOKBACK_DAYS=400;
const YOY_MIN_DAYS=350,YOY_MAX_DAYS=380,DAY_MS=86_400_000;
/** One operand of a fact settlement in the §3.5 financial_metric snapshot shape (P1-06). */
export interface FactOperand{role:'current'|'prior';key:MetricKey&{duration:string;unit:string};value_text:string;lineage:MetricRow['inputs'];derivation:{formula_version:string;as_of:string;state_rev:number;rows:DerivationRow[]}}
/** An ambiguous_fact candidate: the ambiguous operand itself + the realised value it would settle + (yoy) the other operand. */
export interface FactCandidate extends FactOperand{realized_value:number;label_available_at:string;counterpart:FactOperand|null}
/** Structural key shared by MetricRow and FactOperand['key'] (string-typed so a frozen key compares like a live row). */
type SeriesKey={issuer_id:string;market:string;metric:string;period_start:string;period_end:string;duration:string;unit:string;input_unit:string;basis:string;formula_version:string};

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const uniq=(xs:string[])=>[...new Set(xs)].sort(cmp);
const days=(from:string,to:string)=>Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/DAY_MS);
const unavailable=(failure:string):ResolverResult=>({status:'unavailable',failure});
const validate=(p:unknown):p is FactMetricParams=>validateFactMetricParams(p)&&isRealDate(p.period_start)&&isRealDate(p.period_end);

/** The §3.5 derivation envelope of one metric row: lineage concepts, period_end in [period_start − 400 d, period_end], all disclosures. */
export function derivationOf(env:ReadFactsResult,m:MetricRow,asOf:string):FactOperand['derivation']{
 const rows:DerivationRow[]=derivationRowsFor(env.rows,m);   // lineage concepts, period_end in [period_start − DERIVATION_LOOKBACK_DAYS, period_end], sorted
 return {formula_version:m.formula_version,as_of:asOf,state_rev:env.stateRev,rows};
}
/** Latest UTC date d with endOfUtcDay(d) ≤ cutoff: a fact available "today" is not eligible before the day ends (P1-07). */
export function factsAsOfDate(cutoff:string):string{
 const d=cutoff.slice(0,10);
 return endOfUtcDay(d)<=cutoff?d:addDaysIso(d,-1);
}
const keyOf=(m:MetricRow):FactOperand['key']=>({issuer_id:m.issuer_id,market:m.market,metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,unit:m.unit,input_unit:m.input_unit,basis:m.basis,formula_version:m.formula_version});
const sameSeries=(m:SeriesKey,p:FactMetricParams)=>m.issuer_id===p.issuer_id&&m.market===p.market&&m.metric===p.metric&&m.duration===p.duration&&m.unit===p.unit&&m.input_unit===p.input_unit&&m.basis===p.basis&&m.formula_version===p.formula_version;
const isCurrent=(m:SeriesKey,p:FactMetricParams)=>sameSeries(m,p)&&m.period_start===p.period_start&&m.period_end===p.period_end;
const isPrior=(m:SeriesKey,p:FactMetricParams)=>{if(!sameSeries(m,p))return false;const d=days(m.period_end,p.period_end);return d>=YOY_MIN_DAYS&&d<=YOY_MAX_DAYS;};
const sameKey=(a:SeriesKey,b:SeriesKey)=>a.issuer_id===b.issuer_id&&a.market===b.market&&a.metric===b.metric&&a.period_start===b.period_start&&a.period_end===b.period_end&&a.duration===b.duration&&a.unit===b.unit&&a.input_unit===b.input_unit&&a.basis===b.basis&&a.formula_version===b.formula_version;
const labelOfLineage=(ls:MetricRow['inputs'][],floor:string)=>endOfUtcDay(ls.flat().map(i=>i.available_date).reduce((a,b)=>b>a?b:a,floor));
const labelOf=(ms:MetricRow[])=>labelOfLineage(ms.map(m=>m.inputs),ms[0].period_end);
const yoyOf=(cur:string,prior:string)=>(Number(cur)-Number(prior))/Math.abs(Number(prior));
const yoy=(c:MetricRow,pr:MetricRow)=>yoyOf(c.value,pr.value);
/** The operand of one metric row, frozen in the §3.5 financial_metric snapshot shape. */
export function operandOf(env:ReadFactsResult,m:MetricRow,role:FactOperand['role'],asOf:string):FactOperand{
 return {role,key:keyOf(m),value_text:m.value,lineage:m.inputs,derivation:derivationOf(env,m,asOf)};
}
/** Independent replay of one operand: deriveMetrics over its frozen rows at its frozen as_of / state_rev must yield a row
 *  with the same full key, the same value_text and the same lineage (the derive kernel, never the stored value). */
export function operandReproduces(op:FactOperand):boolean{
 const d=op.derivation;
 if(!d||!Array.isArray(d.rows)||typeof d.as_of!=='string'||d.formula_version!==op.key.formula_version)return false;
 let again:MetricRow[];
 try{again=deriveMetrics(d.rows.map(factRowOfDerivation),{market:op.key.market,asOf:d.as_of,basedOnRev:d.state_rev});}catch{return false;}
 return again.some(m=>sameKey(m,op.key)&&m.value===op.value_text&&canonicalize(m.inputs)===canonicalize(op.lineage));
}

/** Availability duty shared by the ordinary and the override path (S-02 / S2-04): derived at the cutoff's derive date, from rows available by the cutoff. */
export function operandAvailable(op:FactOperand,cutoff:string):boolean{
 const d=op.derivation;
 if(!d||d.as_of!==factsAsOfDate(cutoff)||!Array.isArray(d.rows))return false;
 return d.rows.every(r=>typeof r.available_date==='string'&&isRealDate(r.available_date)&&endOfUtcDay(r.available_date)<=cutoff);
}

export const factMetricResolver:Resolver={
 name:'fact_metric',version:FACT_RESOLVER_VERSION,maxFetchMs:FACT_MAX_FETCH_MS,
 validateParams:validate,
 /** Earliest instant the label can exist: the end of the period's last day (spec §3.4 rule 3; filings come later). */
 labelAvailableAt:(params:unknown,_target:Target)=>validate(params)?endOfUtcDay(params.period_end):null,
 async resolve(ctx:ResolveContext):Promise<ResolverResult>{
  const c=ctx.judgment.condition;
  if(!c||c.resolver!=='fact_metric'||!validate(c.params))return unavailable('invalid_condition');
  const p=c.params,asOf=factsAsOfDate(ctx.cutoff);
  let res:DeriveAsOfResult;
  try{res=await ctx.inputsDb.deriveMetricsAsOf(p.issuer_id,p.market,asOf,p.formula_version);}
  catch(e){
   const code=(e as {code?:unknown}).code;
   if(code==='read_truncated')return unavailable('truncated');
   if(code==='unsupported_formula_version')return unavailable('unsupported_formula_version');
   throw e;
  }
  const env=res.envelope;
  if(env.truncated)return unavailable('truncated');
  const cur=res.metrics.filter(m=>isCurrent(m,p));
  if(cur.length===0)return {status:'pending',reason:'not_reported'};
  const ambiguous=(list:MetricRow[],role:FactCandidate['role'],realized:(m:MetricRow)=>number,counterpart:MetricRow|null):ResolverResult=>{
   const other=counterpart?operandOf(env,counterpart,role==='current'?'prior':'current',asOf):null;
   const candidates:FactCandidate[]=list.map(m=>({...operandOf(env,m,role,asOf),realized_value:realized(m),label_available_at:labelOf(counterpart?[m,counterpart]:[m]),counterpart:other}));
   if(!candidates.every(cd=>operandAvailable(cd,ctx.cutoff)&&(!cd.counterpart||operandAvailable(cd.counterpart,ctx.cutoff))))return unavailable('data_after_cutoff');
   const evidence={role,candidate_digests:candidates.map(x=>digest(x)),state_rev:env.stateRev,cutoff:ctx.cutoff,as_of:asOf,formula_version:p.formula_version,compare:p.compare};
   return {status:'inconsistent',reason_code:'settlement_ambiguous_fact',detail:{candidates},evidence,evidence_hash:digest(evidence)};
  };
  const resolved=(used:MetricRow[],value:number):ResolverResult=>{
   const lineage=used.flatMap(m=>m.inputs),ids=new Set(lineage.map(i=>i.fact_id));
   const mappingGen=[...new Set(env.rows.filter(r=>ids.has(r.fact_id)).map(r=>r.mapping_gen))].sort((a,b)=>a-b);
   // Every operand frozen with its full derivation (P1-06); one that its own frozen rows cannot reproduce is not settled on.
   const operands=used.map((m,i)=>operandOf(env,m,i===0?'current':'prior',asOf));
   if(!operands.every(x=>operandAvailable(x,ctx.cutoff)))return unavailable('data_after_cutoff');
   if(!operands.every(operandReproduces))return unavailable('metric_not_reproducible');
   return {status:'resolved',value,unit:p.compare==='yoy'?'ratio':p.unit,from:p.period_start,to:p.period_end,label_available_at:labelOf(used),
    evidence:{metric_keys:used.map(keyOf),fact_ids:[...ids].sort(cmp),filing_ids:uniq(lineage.map(i=>i.filing_id)),available_dates:uniq(lineage.map(i=>i.available_date)),
     value_texts:used.map(m=>m.value),mapping_gen:mappingGen,state_rev:env.stateRev,cutoff:ctx.cutoff,as_of:asOf,formula_version:p.formula_version,compare:p.compare,operands}};
  };
  if(p.compare==='value')return cur.length>1?ambiguous(cur,'current',m=>Number(m.value),null):resolved(cur,Number(cur[0].value));
  const prior=res.metrics.filter(m=>isPrior(m,p));
  if(prior.length===0)return unavailable('prior_missing');
  if(cur.length>1&&prior.length>1)return unavailable('ambiguous_both');
  const usable=prior.filter(m=>Number(m.value)!==0);   // a zero prior cannot be a yoy denominator: only when ALL candidates are zero is the metric unavailable
  if(usable.length===0)return unavailable('prior_zero');
  if(cur.length>1)return ambiguous(cur,'current',m=>yoy(m,usable[0]),usable[0]);
  if(prior.length>1)return ambiguous(usable,'prior',m=>yoy(cur[0],m),cur[0]);
  return resolved([cur[0],prior[0]],yoy(cur[0],prior[0]));
 },
 fromOverride(j:JudgmentRow,o:QuarantineOverride):ResolverResult{
  const c=j.condition;
  if(!c||c.resolver!=='fact_metric'||o.reason_code!=='settlement_ambiguous_fact'||o.resolution.kind!=='choose_fact')
   throw new JudgmentError('override_mismatch',`fact_metric cannot apply ${o.resolution.kind} for ${o.reason_code}`);
  const ch=o.resolution.chosen as Partial<FactCandidate>;
  const isOperand=<T extends Partial<FactOperand>>(x:T|null|undefined):x is T&FactOperand=>!!x&&(x.role==='current'||x.role==='prior')&&!!x.key&&typeof x.key==='object'&&typeof x.value_text==='string'&&Array.isArray(x.lineage)&&!!x.derivation&&Array.isArray(x.derivation.rows);
  if(typeof ch.realized_value!=='number'||!Number.isFinite(ch.realized_value)||typeof ch.label_available_at!=='string'||!isOperand(ch)||(ch.counterpart!==null&&!isOperand(ch.counterpart)))
   throw new JudgmentError('override_mismatch','chosen_shape');
  const p=c.params;
  // Recompute, never trust: every operand must be reproduced by deriveMetrics from its own frozen rows (P1-06).
  const ops:FactOperand[]=[ch,...(ch.counterpart?[ch.counterpart]:[])];
  // S-02: every operand must have been derived at the derive date of THIS override's cutoff, from rows already available at it.
  if(!ops.every(x=>operandAvailable(x,o.cutoff)))throw new JudgmentError('override_mismatch','operand_availability');
  if(!ops.every(operandReproduces))throw new JudgmentError('override_mismatch','derivation_does_not_reproduce');
  const cur=ops.filter(x=>x.role==='current'),pr=ops.filter(x=>x.role==='prior');
  if(cur.length!==1||!isCurrent(cur[0].key,p))throw new JudgmentError('override_mismatch','current_key');
  let value:number;
  if(p.compare==='value'){if(pr.length!==0)throw new JudgmentError('override_mismatch','unexpected_counterpart');value=Number(cur[0].value_text);}
  else{
   if(pr.length!==1||!isPrior(pr[0].key,p))throw new JudgmentError('override_mismatch','prior_key');
   if(Number(pr[0].value_text)===0)throw new JudgmentError('override_mismatch','prior_zero');
   value=yoyOf(cur[0].value_text,pr[0].value_text);
  }
  if(!Number.isFinite(value)||value!==ch.realized_value)throw new JudgmentError('override_mismatch','realized_value');
  const label=labelOfLineage(ops.map(x=>x.lineage),ch.key.period_end);   // same floor as labelOf([chosen, counterpart])
  if(label!==ch.label_available_at)throw new JudgmentError('override_mismatch','label_available_at');
  return {status:'resolved',value,unit:p.compare==='yoy'?'ratio':p.unit,from:p.period_start,to:p.period_end,label_available_at:label,
   evidence:{chosen:ch,chosen_digest:digest(ch),operands:ops,cutoff:ch.derivation.as_of,formula_version:p.formula_version,compare:p.compare,
    override:{reason_code:o.reason_code,evidence_hash:o.evidence_hash,resolved_by:o.resolved_by,at:o.at,cutoff:o.cutoff}}};
 },
};
