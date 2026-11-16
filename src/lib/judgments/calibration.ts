// src/lib/judgments/calibration.ts
// Calibration math (spec §8.1 metrics by kind, §8.2 cohort / samples / independent selection, §8.4
// gates, §8.5 isotonic in the report only). Pure: no I/O, no clock. Every metric is computed on the
// independent samples (greedy non-overlapping selection per subject); the full sample set only gives
// n_total and a `correlated` reference that never gates. Expected values come from
// fixtures/judgments/calibration/expected.py (an independent Python oracle), never from this file.
import {applyIsotonic,isotonicFit,wilson} from '../research/fanout/calibration';
import type {IsotonicSegment} from '../research/fanout/calibration';
import type {CalibrationState,Envelope,JudgmentRow,Kind,PriceMarket,ReliabilityBin,Scenario,SettlementRow,Target,Claim,ProbabilityClaim,CategoricalClaim,ScoreClaim,IntervalClaim} from './types';

export const ALGORITHM_VERSION='judgments-calibration/1';
/** Holdout = the last 30% by as_of: train = floor(7n/10) (integer arithmetic, no float rounding). */
export const HOLDOUT_MIN=20;
export const DEFAULT_THRESHOLD_N=100,DEFAULT_ECE_MAX=0.10,DEFAULT_WINDOW_YEARS=3,DEFAULT_EMBARGO_DAYS=0;
export const MARGIN_BINS:readonly (readonly [number,number])[]=[[0,5],[5,15],[15,100]];
export const RELIABILITY_BINS=10;

export type CohortLifecycle='open'|'settled'|'void'|'withdrawn';
export type Forecast=
 |{kind:'probability';p:number}
 |{kind:'categorical';selected:string;margin_pp:number|null}
 |{kind:'score';value:number}
 |{kind:'interval';low:number;high:number;nominal_coverage:number;scenarios?:Scenario[]};
/** One active registration of the cohort (spec §8.2). y: probability 0|1, categorical realized class, score/interval realized number; null unless settled. */
export interface CohortEntry{judgment_id:string;subject_type:string;subject_key:string;market:PriceMarket|null;as_of:string;window_end:string;retrospective:boolean;lifecycle:CohortLifecycle;settlement_id:string|null;forecast:Forecast;y:number|string|null;
 /** Settled price_return whose frozen realized.to is missing, not a real date, or before as_of: not a sample (review G-01). */
 invalid_endpoint?:boolean;
}
export interface EvaluatedEntry extends CohortEntry{group:string;sample:boolean;selected_for_independent:boolean}
export interface CalibrationOptions{threshold_n:number;ece_max:number;embargo_days:number}
export interface Evaluation{
 state:Exclude<CalibrationState,'self_assessed'>;
 n_registered:number;n_settled:number;n_independent:number;n_void:number;n_retrospective_excluded:number;
 metrics:Record<string,unknown>;reliability:ReliabilityBin[];isotonic_segments:IsotonicSegment[]|null;
 /** Every cohort entry, sorted by judgment_id, with its stream and selection (the cohort file body, spec §5.5). */
 entries:EvaluatedEntry[];
}

const DAY=86_400_000;
export const addDays=(iso:string,n:number):string=>new Date(Date.parse(`${iso}T00:00:00.000Z`)+n*DAY).toISOString().slice(0,10);
const monthEnd=(period:string):string=>{const [y,m]=period.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
/** Target-derived last calendar day of the window [as_of, window_end] (spec §8.2). session_index uses the §7.3 scan
 *  window ceil(n × 1.52) — an estimate, NOT an upper bound (holidays / suspensions can exceed it). */
export function windowEndOf(target:Target):string{
 switch(target.kind){
  case 'date':return target.date;
  case 'period':return monthEnd(target.period);
  case 'fiscal_period':return target.period_end;
  case 'session_index':return addDays(target.base_date,Math.ceil(target.n*1.52));
 }
}

const num=(v:unknown,def:number,ok:(n:number)=>boolean):number=>{
 if(v===undefined)return def;
 const n=typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;
 if(!Number.isFinite(n)||!ok(n))throw new Error('invalid_calibration_params');
 return n;
};
/** Method params → gate options (spec §8.4 defaults; each value is written into the calibration row). */
export function optionsOf(params:Record<string,number|string>):CalibrationOptions&{window_years:number}{
 return {
  threshold_n:num(params.threshold_n,DEFAULT_THRESHOLD_N,n=>Number.isInteger(n)&&n>=1),
  ece_max:num(params.ece_max,DEFAULT_ECE_MAX,n=>n>0&&n<1),
  embargo_days:num(params.embargo_days,DEFAULT_EMBARGO_DAYS,n=>Number.isInteger(n)&&n>=0),
  window_years:num(params.window_years,DEFAULT_WINDOW_YEARS,n=>Number.isInteger(n)&&n>=1&&n<=50),
 };
}

function forecastOf(kind:Kind,claim:Claim):Forecast{
 switch(kind){
  case 'probability':return {kind,p:(claim as ProbabilityClaim).p};
  case 'categorical':{const c=claim as CategoricalClaim;return {kind,selected:c.selected,margin_pp:typeof c.margin_pp==='number'?c.margin_pp:null};}
  case 'score':return {kind,value:(claim as ScoreClaim).value};
  case 'interval':{const c=claim as IntervalClaim;return {kind,low:c.low,high:c.high,nominal_coverage:c.nominal_coverage,...(c.scenarios?{scenarios:c.scenarios}:{})};}
 }
}
function realizedY(kind:Kind,s:SettlementRow):number|string|null{
 if(kind==='probability')return s.outcome==='hit'?1:s.outcome==='miss'?0:null;
 const v=s.realized?.value;
 if(kind==='categorical')return typeof v==='string'?v:s.realized?.label??null;
 if(typeof v==='boolean')return v?1:0;
 return typeof v==='number'&&Number.isFinite(v)?v:null;
}
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
/** The actually settled window end (spec §8.2 第 7 稿; plan audit P1-09): a settled price_return judgment ends at its
 *  frozen end bar (realized.to, the date the resolver's evidence ends on); every other judgment — and any price
 *  settlement without a usable realized.to — uses the target-derived windowEndOf. */
export function settledEndpointOf(j:JudgmentRow,s:SettlementRow|null):{window_end:string;valid:boolean}{
 if(s&&s.kind==='settled'&&j.condition?.resolver==='price_return'){
  const to=s.realized?.to;
  // No valid frozen end bar: the scan estimate is not a substitute (review G-01) — the row is flagged and never sampled.
  const base=j.condition.params.base_date;
  // A real calendar date (round trip rejects 2025-02-30) that is not before the judgment's as_of / base date.
  const ok=typeof to==='string'&&ISO_DATE.test(to)&&!Number.isNaN(Date.parse(`${to}T00:00:00.000Z`))&&new Date(`${to}T00:00:00.000Z`).toISOString().slice(0,10)===to&&to>=j.as_of&&to>=base;
  return ok?{window_end:to as string,valid:true}:{window_end:windowEndOf(j.target!),valid:false};
 }
 return {window_end:windowEndOf(j.target!),valid:true};
}
export const settledWindowEndOf=(j:JudgmentRow,s:SettlementRow|null):string=>settledEndpointOf(j,s).window_end;
/** Envelope (calibration_cohort row) → cohort entry; abstained rows are not in the cohort (null). */
export function entryOf(e:Envelope):CohortEntry|null{
 const j=e.judgment;
 if(j.abstained||!j.claim||!j.target)return null;
 const s=e.settlement;
 const lifecycle:CohortLifecycle=!s||s.kind==='reopened'?'open':s.kind;
 const c=j.condition;
 const y=lifecycle==='settled'&&s?realizedY(j.kind,s):null;
 const ep=settledEndpointOf(j,s);
 return {
  judgment_id:j.judgment_id,subject_type:j.subject_type,subject_key:j.subject_key,
  market:c&&c.resolver==='price_return'?c.params.market:null,
  as_of:j.as_of,window_end:ep.window_end,retrospective:j.retrospective,lifecycle,
  settlement_id:s?.settlement_id??null,forecast:forecastOf(j.kind,j.claim),
  y,...(ep.valid?{}:{invalid_endpoint:true}),
 };
}

export const groupOf=(e:Pick<CohortEntry,'subject_type'|'subject_key'>)=>`${e.subject_type}:${e.subject_key}`;
const byAsOf=(a:CohortEntry,b:CohortEntry)=>a.as_of<b.as_of?-1:a.as_of>b.as_of?1:a.judgment_id<b.judgment_id?-1:a.judgment_id>b.judgment_id?1:0;
/**
 * Greedy non-overlapping selection per subject stream (spec §8.2): scan by (as_of, judgment_id), take
 * the first, skip every judgment whose as_of is on or before the selected window_end + embargo_days.
 */
export function selectIndependent(samples:CohortEntry[],embargoDays:number):Set<string>{
 const groups=new Map<string,CohortEntry[]>();
 for(const s of samples){const g=groupOf(s);const list=groups.get(g);if(list)list.push(s);else groups.set(g,[s]);}
 const chosen=new Set<string>();
 for(const list of groups.values()){
  let lastEnd:string|null=null;
  for(const s of [...list].sort(byAsOf)){
   if(lastEnd===null||s.as_of>addDays(lastEnd,embargoDays)){chosen.add(s.judgment_id);lastEnd=s.window_end;}
  }
 }
 return chosen;
}

const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
const mean=(xs:number[]):number|null=>xs.length===0?null:sum(xs)/xs.length;
/** Largest i with p ≥ i/10 (boundary comparisons: Math.floor(p×10) misplaces 0.8999999999999999, whose product is exactly 9; p = 1 → last bin). */
const binOf=(p:number)=>{let b=0;for(let i=1;i<RELIABILITY_BINS;i++)if(p>=i/RELIABILITY_BINS)b=i;return b;};
interface Pair{p:number;y:number}
const pairOf=(e:CohortEntry):Pair=>({p:(e.forecast as {p:number}).p,y:e.y as number});
/** ECE = Σ_b (n_b/n)·|mean_p_b − hit_rate_b| over 10 equal bins; null for no pairs. */
export function ece(pairs:Pair[]):number|null{
 if(pairs.length===0)return null;
 const bins=Array.from({length:RELIABILITY_BINS},()=>({n:0,sp:0,sy:0}));
 for(const x of pairs){const b=bins[binOf(x.p)];b.n++;b.sp+=x.p;b.sy+=x.y;}
 let total=0;
 for(const b of bins)if(b.n)total+=(b.n/pairs.length)*Math.abs(b.sp/b.n-b.sy/b.n);
 return total;
}
/** Brier, climatology (sample base rate) and skill = 1 − brier/climatology (null on a zero denominator). */
export function brierParts(pairs:Pair[]):{brier:number|null;climatology:number|null;skill:number|null}{
 if(pairs.length===0)return {brier:null,climatology:null,skill:null};
 const ybar=mean(pairs.map(x=>x.y)) as number;
 const brier=mean(pairs.map(x=>(x.p-x.y)**2)) as number;
 const climatology=mean(pairs.map(x=>(ybar-x.y)**2)) as number;
 return {brier,climatology,skill:climatology===0?null:1-brier/climatology};
}
export function reliabilityBins(pairs:Pair[]):ReliabilityBin[]{
 return Array.from({length:RELIABILITY_BINS},(_,i)=>{
  const inb=pairs.filter(x=>binOf(x.p)===i);const n=inb.length;const k=sum(inb.map(x=>x.y));const w=wilson(k,n);
  return {bin_low:i/RELIABILITY_BINS,bin_high:(i+1)/RELIABILITY_BINS,n,mean_p:n===0?null:sum(inb.map(x=>x.p))/n,hit_rate:n===0?null:k/n,wilson_low:w.low,wilson_high:w.high};
 });
}

type KindResult=Pick<Evaluation,'state'|'metrics'|'reliability'|'isotonic_segments'>;
function probability(ind:CohortEntry[],samples:CohortEntry[],o:CalibrationOptions):KindResult{
 const pairs=ind.map(pairOf),n=pairs.length,k=sum(pairs.map(x=>x.y));
 const all=samples.map(pairOf);
 const b=brierParts(pairs),w=wilson(k,n);
 const ntr=Math.floor((7*n)/10),train=ind.slice(0,ntr),holdRaw=ind.slice(ntr);
 const boundary=train.length===0?null:train.map(s=>s.window_end).reduce((a,c)=>(c>a?c:a));
 const hold=holdRaw.filter(s=>boundary===null||s.as_of>boundary);
 const fit=train.length===0?null:isotonicFit(train.map(s=>({score:pairOf(s).p,hit:pairOf(s).y})));
 let he:number|null=null,hb:number|null=null,hsk:number|null=null,hm:number|null=null;
 if(hold.length>=HOLDOUT_MIN){
  const hp=hold.map(pairOf);const hparts=brierParts(hp);
  he=ece(hp);hb=hparts.brier;hsk=hparts.skill;
  hm=fit&&fit.segments.length>0?ece(hp.map(x=>({p:applyIsotonic(fit,x.p) as number,y:x.y}))):null;
 }
 const metrics={
  n_total:samples.length,base_rate:n===0?null:k/n,brier:b.brier,brier_climatology:b.climatology,brier_skill:b.skill,ece_raw:ece(pairs),
  hit_rate:n===0?null:{rate:k/n,low:w.low,high:w.high},
  correlated:{n:samples.length,brier:brierParts(all).brier,ece_raw:ece(all)},
  temporal_split:{n_train:train.length,n_holdout:hold.length,n_dropped_overlap:holdRaw.length-hold.length,boundary,ece_raw_holdout:he,brier_holdout:hb,brier_skill_holdout:hsk,ece_mapped_holdout:hm},
 };
 // The gate tests the raw p on the time-out holdout — the predictor the page would show (spec §8.2, G01).
 const state=n<o.threshold_n||he===null?'insufficient':he<=o.ece_max&&hsk!==null&&hsk>0?'calibrated':'failed';
 return {state,metrics,reliability:reliabilityBins(pairs),isotonic_segments:n>0&&fit?fit.segments:null};
}

function categorical(ind:CohortEntry[],samples:CohortEntry[],o:CalibrationOptions):KindResult{
 const sel=(e:CohortEntry)=>(e.forecast as {selected:string}).selected;
 const margin=(e:CohortEntry)=>(e.forecast as {margin_pp:number|null}).margin_pp;
 const hit=(e:CohortEntry)=>sel(e)===e.y?1:0;
 const n=ind.length,k=sum(ind.map(hit)),w=wilson(k,n);
 const freq=new Map<string,number>();
 for(const e of ind)freq.set(e.y as string,(freq.get(e.y as string)??0)+1);
 let maj:string|null=null;
 for(const [c,cnt] of freq)if(maj===null||cnt>freq.get(maj)!||(cnt===freq.get(maj)&&c<maj))maj=c;
 const confusion:Record<string,Record<string,number>>=Object.create(null);   // null-prototype at both levels: classes may be named 'constructor' / '__proto__'
 for(const e of ind){const row=(confusion[sel(e)]??=Object.create(null) as Record<string,number>);row[e.y as string]=(row[e.y as string]??0)+1;}
 const margin_bins=MARGIN_BINS.map(([lo,hi])=>{
  const inb=ind.filter(e=>{const m=margin(e);return m!==null&&(lo===0||m>=lo)&&(hi===100||m<hi);});
  const kb=sum(inb.map(hit)),wb=wilson(kb,inb.length);
  return {bin_low:lo,bin_high:hi,n:inb.length,accuracy:inb.length===0?null:kb/inb.length,wilson_low:wb.low,wilson_high:wb.high};
 });
 const majority_rate=n===0||maj===null?null:freq.get(maj)!/n;
 const metrics={
  n_total:samples.length,accuracy:n===0?null:k/n,accuracy_wilson:{low:w.low,high:w.high},majority_class:maj,majority_rate,confusion,margin_bins,
  n_missing_margin:ind.filter(e=>margin(e)===null).length,correlated:{n:samples.length,accuracy:mean(samples.map(hit))},
 };
 // Baseline = the majority realized class among the independent samples, not 1/|classes| (spec §8.1).
 const state=n<o.threshold_n?'insufficient':w.low!==null&&majority_rate!==null&&w.low>majority_rate?'calibrated':'failed';
 return {state,metrics,reliability:[],isotonic_segments:null};
}

/** Average ranks (1-based) with ties sharing the mean of their positions. */
export function averageRanks(vals:number[]):number[]{
 const order=vals.map((_,i)=>i).sort((a,b)=>vals[a]-vals[b]||a-b);
 const r=new Array<number>(vals.length).fill(0);
 for(let i=0;i<order.length;){
  let j=i;
  while(j+1<order.length&&vals[order[j+1]]===vals[order[i]])j++;
  for(let t=i;t<=j;t++)r[order[t]]=(i+j)/2+1;
  i=j+1;
 }
 return r;
}
export function spearman(xs:number[],ys:number[]):number|null{
 if(xs.length<2)return null;
 const rx=averageRanks(xs),ry=averageRanks(ys),mx=mean(rx) as number,my=mean(ry) as number;
 let numr=0,sx=0,sy=0;
 for(let i=0;i<rx.length;i++){numr+=(rx[i]-mx)*(ry[i]-my);}
 for(const a of rx)sx+=(a-mx)**2;
 for(const b of ry)sy+=(b-my)**2;
 const den=Math.sqrt(sx*sy);
 return den===0?null:numr/den;
}
function score(ind:CohortEntry[],samples:CohortEntry[],o:CalibrationOptions):KindResult{
 const v=(e:CohortEntry)=>(e.forecast as {value:number}).value;
 const n=ind.length,ys=ind.map(e=>e.y as number);
 const sorted=[...ind].sort((a,b)=>v(a)-v(b)||(a.judgment_id<b.judgment_id?-1:a.judgment_id>b.judgment_id?1:0));
 const binary=n>0&&ys.every(y=>y===0||y===1);
 const tertiles=[0,1,2].map(t=>{
  const g=n===0?[]:sorted.filter((_,i)=>Math.floor((3*i)/n)===t);
  const gy=g.map(e=>e.y as number),kk=sum(gy);
  const ww=binary&&g.length>0?wilson(kk,g.length):null;
  return {tertile:t+1,n:g.length,value_min:g.length?Math.min(...g.map(v)):null,value_max:g.length?Math.max(...g.map(v)):null,realized_mean:mean(gy),
   hit_rate:ww?{rate:kk/g.length,low:ww.low,high:ww.high}:null};
 });
 const metrics={n_total:samples.length,spearman:spearman(ind.map(v),ys),tertiles,correlated:{n:samples.length,spearman:spearman(samples.map(v),samples.map(e=>e.y as number))}};
 // Scores are not probabilities: there is no calibration, only an evaluation (spec §8.2).
 return {state:n<o.threshold_n?'insufficient':'evaluated',metrics,reliability:[],isotonic_segments:null};
}

/** Linear-interpolation quantile (type 7) of a non-empty list. */
export function quantile7(values:number[],q:number):number{
 const xs=[...values].sort((a,b)=>a-b),h=(xs.length-1)*q,lo=Math.floor(h);
 return lo+1>=xs.length?xs[lo]:xs[lo]+(h-lo)*(xs[lo+1]-xs[lo]);
}
export function median(values:number[]):number|null{
 if(values.length===0)return null;
 const xs=[...values].sort((a,b)=>a-b),m=Math.floor(xs.length/2);
 return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;
}
/** Scenario probabilities forecast the BOUND thesis_win_rate condition (scenario_event_hash), which an interval row cannot evaluate,
 *  and scoring them against the return sign would report a wrong number (review G2-01/G2-02). v1 therefore reports them as
 *  unavailable (spec §8.1 per-scenario evaluation is deferred to the company-research spec); they never enter any gate. */
function scenarioReport(ind:CohortEntry[]):{status:'unavailable';reason:'bound_event_not_evaluable';labels:string[]}|null{
 const labels=new Set<string>();
 for(const e of ind)if(e.forecast.kind==='interval')for(const sc of e.forecast.scenarios??[])labels.add(sc.label);
 return labels.size===0?null:{status:'unavailable',reason:'bound_event_not_evaluable',labels:[...labels].sort()};
}
function interval(ind:CohortEntry[],samples:CohortEntry[],o:CalibrationOptions):KindResult{
 const f=(e:CohortEntry)=>e.forecast as {low:number;high:number;nominal_coverage:number};
 const covered=(e:CohortEntry)=>f(e).low<=(e.y as number)&&(e.y as number)<=f(e).high?1:0;
 const n=ind.length,k=sum(ind.map(covered)),w=wilson(k,n);
 const nominal=mean(ind.map(e=>f(e).nominal_coverage)),coverage=mean(ind.map(covered));
 const groups=new Map<string,number[]>();
 for(const e of ind){const g=groupOf(e);const list=groups.get(g);if(list)list.push(e.y as number);else groups.set(g,[e.y as number]);}
 const base=new Map<string,number>();
 if(nominal!==null)for(const [g,vals] of groups)if(vals.length>=2)base.set(g,quantile7(vals,(1+nominal)/2)-quantile7(vals,(1-nominal)/2));
 const wm=median(ind.map(e=>f(e).high-f(e).low));
 const bm=median(ind.filter(e=>base.has(groupOf(e))).map(e=>base.get(groupOf(e))!));
 const ratio=wm===null||bm===null||bm===0?null:wm/bm;
 const gap=coverage===null||nominal===null?null:coverage-nominal;
 const metrics={n_total:samples.length,coverage,coverage_wilson:{low:w.low,high:w.high},nominal_coverage:nominal,coverage_gap:gap,width_median:wm,baseline_width_median:bm,width_ratio:ratio,correlated:{n:samples.length,coverage:mean(samples.map(covered))}};
 const state=n<o.threshold_n?'insufficient':gap!==null&&Math.abs(gap)<=o.ece_max&&ratio!==null&&ratio<=1?'calibrated':'failed';
 const scenarios=scenarioReport(ind);
 // Scenario probabilities are reported only; they never enter the interval gate (review G-04).
 return {state,metrics:scenarios?{...metrics,scenarios}:metrics,reliability:[],isotonic_segments:null};
}

/** The whole report for one cohort (spec §8.1 + §8.2): counts, metrics, reliability, isotonic, state, entries. */
export function evaluateCohort(kind:Kind,entries:CohortEntry[],o:CalibrationOptions):Evaluation{
 const settled=entries.filter(e=>e.lifecycle==='settled');
 const samples=settled.filter(e=>!e.retrospective&&e.y!==null&&!e.invalid_endpoint);
 const chosen=selectIndependent(samples,o.embargo_days);
 const ind=samples.filter(s=>chosen.has(s.judgment_id)).sort(byAsOf);
 const r=kind==='probability'?probability(ind,samples,o):kind==='categorical'?categorical(ind,samples,o):kind==='score'?score(ind,samples,o):interval(ind,samples,o);
 const sampleIds=new Set(samples.map(s=>s.judgment_id));
 const counted=settled.filter(e=>!e.retrospective);
 return {
  ...r,
  metrics:{...r.metrics,n_invalid_endpoint:counted.filter(e=>e.invalid_endpoint).length,n_unusable_value:counted.filter(e=>e.y===null).length},
  n_registered:entries.length,n_settled:settled.length,n_independent:ind.length,
  n_void:entries.filter(e=>e.lifecycle==='void').length,n_retrospective_excluded:settled.filter(e=>e.retrospective).length,
  entries:[...entries].sort((a,b)=>a.judgment_id<b.judgment_id?-1:a.judgment_id>b.judgment_id?1:0)
   .map(e=>({...e,group:groupOf(e),sample:sampleIds.has(e.judgment_id),selected_for_independent:chosen.has(e.judgment_id)})),
 };
}
