// src/lib/macro/correlation.ts
// Indicator × asset statistics (spec §7, version macro-correlation/1). Pure: runAnalysis(spec, frozen inputs,
// codeVersion) returns the same JSON for the same arguments, which is what makes a stored run re-computable.
// Changes are computed in exact decimals first (decimal.ts). Each value then becomes a float once, here
// (the third number-conversion point after quality.ts and regime.ts). Lag k > 0 means the indicator leads:
// corr(indicator[t], asset[t+k]).
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import {subtract,yoyPct} from './decimal';
import {toBp} from './events';
import type {AnalysisKind,ChangeKind} from './types';
export const CORRELATION_VERSION='macro-correlation/1';
export const MIN_PAIRS=36,ROLLING_WINDOW=36,ROLLING_MIN_PAIRS=30,MIN_INDEPENDENT_EVENTS=5;
export const WINDOWS=['5y','10y','all'] as const;
export type AnalysisWindow=typeof WINDOWS[number];
export const EVENT_NS=[3,6,12] as const;
export type EventN=typeof EVENT_NS[number];
export interface AnalysisSpec{request_id:string;kind:AnalysisKind;indicator_id:string;asset_id:string;lag:number;window:AnalysisWindow;event_n?:EventN}
export interface FrozenObservation{observation_id:string;period_end:string;value_text:string}
export interface FrozenSeries{series_id:string;source_series_id:string;change_kind:ChangeKind;observations:FrozenObservation[]}
export interface FrozenEvent{effective_date:string;change_bp:string;evidence:string[]}
export interface FrozenInputs{indicator:FrozenSeries;asset:FrozenSeries;events?:FrozenEvent[];cutoff:string;catalog_version:string}
export type AnalysisErrorCode='insufficient_sample'|'zero_variance'|'non_positive_price'|'no_events'|'invalid_inputs'|'analysis_input_invalid';
export class AnalysisError extends Error{constructor(readonly code:AnalysisErrorCode,message?:string){super(message??code);this.name='AnalysisError';}}
export interface Pair{t:string;s:string;x:number;y:number}
export interface PairResult{kind:'change'|'level';r:number;r2:number;slope:number;intercept:number;n:number;from:string;to:string;lag:number;transform:'change'|'level';exploratory:boolean;x_unit:string;y_unit:string;pairs:Pair[];method_version:string;code_version:string}
export interface RollingResult{kind:'rolling';window_months:number;min_pairs:number;lag:number;points:{end:string;r:number;n:number}[];skipped_windows:number;from:string;to:string;method_version:string;code_version:string}
export interface Quartiles{median:number;q1:number;q3:number}
export interface EventRow{effective_date:string;anchor:string;change_bp:string;pre_from:string;post_to:string;pre:number;post:number}
export interface EventResult{kind:'event_window';n_months:number;events:EventRow[];candidates:number;independent:number;dropped:{effective_date:string;reason:'incomplete_window'|'overlap'}[];stats:{pre:Quartiles;post:Quartiles}|null;y_unit:string;method_version:string;code_version:string}
export type AnalysisResult=PairResult|RollingResult|EventResult;

const monthIndex=(d:string)=>Number(d.slice(0,4))*12+Number(d.slice(5,7))-1;
const monthKey=(i:number)=>`${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;
const sign=(canonical:string)=>canonical==='0'?0:canonical.startsWith('-')?-1:1;
function byMonth(s:FrozenSeries):Map<number,string>{
 const out=new Map<number,string>();
 for(const o of s.observations){
  const k=monthIndex(o.period_end);
  if(out.has(k))throw new AnalysisError('invalid_inputs',`duplicate month ${o.period_end} in ${s.series_id}`);
  out.set(k,canonicalDecimal(o.value_text));
 }
 return out;
}
/** Indicator change in its changeKind units (exact decimal, then one float conversion). */
function indicatorDelta(cur:string,prev:string,kind:ChangeKind):number{
 if(kind==='bp')return Number(toBp(subtract(cur,prev)));
 if(kind==='pct'){if(sign(prev)<=0)throw new AnalysisError('non_positive_price',`base ${prev}`);return Number(yoyPct(cur,prev));}
 return Number(subtract(cur,prev));
}
/** Asset change: price (pct) → natural log return; yield (bp) → exact bp difference; otherwise plain difference. */
function assetDelta(cur:string,prev:string,kind:ChangeKind):number{
 if(kind==='pct'){if(sign(cur)<=0||sign(prev)<=0)throw new AnalysisError('non_positive_price',`${prev} → ${cur}`);return Math.log(Number(cur)/Number(prev));}
 if(kind==='bp')return Number(toBp(subtract(cur,prev)));
 return Number(subtract(cur,prev));
}
/** Asset move over an event window, in display units: pct → simple % (exact decimal), bp → bp, otherwise difference. */
function windowMove(to:string,from:string,kind:ChangeKind):number{
 if(kind==='pct'){if(sign(from)<=0)throw new AnalysisError('non_positive_price',`base ${from}`);return Number(yoyPct(to,from));}
 if(kind==='bp')return Number(toBp(subtract(to,from)));
 return Number(subtract(to,from));
}
/** Pair plus the exact-decimal keys its x and y were derived from (used only to detect constant inputs; never stored). */
interface KPair extends Pair{xk:string;yk:string}
const plain=(p:KPair):Pair=>({t:p.t,s:p.s,x:p.x,y:p.y});
const isConstant=(keys:readonly string[])=>keys.every(k=>k===keys[0]);
/** Constant x or y (all keys equal as canonical decimals): no variance, whatever float rounding says. */
const constantInput=(w:readonly KPair[])=>isConstant(w.map(p=>p.xk))||isConstant(w.map(p=>p.yk));
function alignedPairs(inputs:FrozenInputs,lag:number,transform:'change'|'level'):KPair[]{
 const xi=byMonth(inputs.indicator),ya=byMonth(inputs.asset);
 const out:KPair[]=[];
 for(const k of [...xi.keys()].sort((a,b)=>a-b)){
  const s=k+lag;const yCur=ya.get(s);if(yCur===undefined)continue;
  if(transform==='level'){out.push({t:monthKey(k),s:monthKey(s),x:Number(xi.get(k)!),y:Number(yCur),xk:xi.get(k)!,yk:yCur});continue;}
  const xPrev=xi.get(k-1),yPrev=ya.get(s-1);if(xPrev===undefined||yPrev===undefined)continue;
  const x=indicatorDelta(xi.get(k)!,xPrev,inputs.indicator.change_kind),y=assetDelta(yCur,yPrev,inputs.asset.change_kind);
  out.push({t:monthKey(k),s:monthKey(s),x,y,xk:inputs.indicator.change_kind==='pct'?String(x):subtract(xi.get(k)!,xPrev),yk:inputs.asset.change_kind==='pct'?String(y):subtract(yCur,yPrev)});
 }
 return out;
}
function windowed(pairs:KPair[],window:AnalysisWindow):KPair[]{
 if(window==='all'||!pairs.length)return pairs;
 const months=window==='5y'?60:120;const last=monthIndex(pairs[pairs.length-1].t);
 return pairs.filter(p=>monthIndex(p.t)>last-months);
}
export function pearson(xs:readonly number[],ys:readonly number[]):{r:number;slope:number;intercept:number}{
 const n=xs.length;if(n<2||ys.length!==n)throw new AnalysisError('insufficient_sample',`n=${n}`);
 let mx=0,my=0;for(let i=0;i<n;i++){mx+=xs[i];my+=ys[i];}mx/=n;my/=n;
 let sxx=0,syy=0,sxy=0;for(let i=0;i<n;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxx+=dx*dx;syy+=dy*dy;sxy+=dx*dy;}
 if(sxx===0||syy===0)throw new AnalysisError('zero_variance');
 const r=Math.max(-1,Math.min(1,sxy/Math.sqrt(sxx*syy)));const slope=sxy/sxx;
 return {r,slope,intercept:my-slope*mx};
}
export function quartiles(values:readonly number[]):Quartiles{
 const s=[...values].sort((a,b)=>a-b);
 const q=(p:number)=>{const h=(s.length-1)*p,lo=Math.floor(h);return lo+1<s.length?s[lo]+(h-lo)*(s[lo+1]-s[lo]):s[lo];};
 return {median:q(0.5),q1:q(0.25),q3:q(0.75)};
}
const yUnit=(kind:ChangeKind,transform:'change'|'level')=>transform==='level'?'level':kind==='pct'?'log_return':kind;
export function runAnalysis(spec:AnalysisSpec,inputs:FrozenInputs,codeVersion:string):AnalysisResult{
 const base={method_version:CORRELATION_VERSION,code_version:codeVersion};
 if(spec.kind==='change'||spec.kind==='level'){
  const pairs=windowed(alignedPairs(inputs,spec.lag,spec.kind),spec.window);
  if(pairs.length<MIN_PAIRS)throw new AnalysisError('insufficient_sample',`n=${pairs.length} < ${MIN_PAIRS}`);
  if(constantInput(pairs))throw new AnalysisError('zero_variance','constant input');
  const {r,slope,intercept}=pearson(pairs.map(p=>p.x),pairs.map(p=>p.y));
  return {kind:spec.kind,r,r2:r*r,slope,intercept,n:pairs.length,from:pairs[0].t,to:pairs[pairs.length-1].t,lag:spec.lag,transform:spec.kind,exploratory:spec.kind==='level',
   x_unit:spec.kind==='level'?'level':inputs.indicator.change_kind,y_unit:yUnit(inputs.asset.change_kind,spec.kind),pairs:pairs.map(plain),...base};
 }
 if(spec.kind==='rolling'){
  const pairs=windowed(alignedPairs(inputs,spec.lag,'change'),spec.window);
  const idx=pairs.map(p=>monthIndex(p.t));
  const points:RollingResult['points']=[];
  let start=0,skipped=0;
  for(let j=0;j<pairs.length;j++){
   while(idx[start]<=idx[j]-ROLLING_WINDOW)start++;
   const w=pairs.slice(start,j+1);if(w.length<ROLLING_MIN_PAIRS)continue;
   if(constantInput(w)){skipped++;continue;}
   try{points.push({end:pairs[j].t,r:pearson(w.map(p=>p.x),w.map(p=>p.y)).r,n:w.length});}
   catch(e){if(e instanceof AnalysisError&&e.code==='zero_variance'){skipped++;continue;}throw e;}
  }
  if(!points.length)throw new AnalysisError('insufficient_sample',`no ${ROLLING_WINDOW}-month window with ≥ ${ROLLING_MIN_PAIRS} pairs`);
  return {kind:'rolling',window_months:ROLLING_WINDOW,min_pairs:ROLLING_MIN_PAIRS,lag:spec.lag,points,skipped_windows:skipped,from:points[0].end,to:points[points.length-1].end,...base};
 }
 // event_window
 const n=spec.event_n;if(n===undefined)throw new AnalysisError('invalid_inputs','event_n required');
 const yAll=byMonth(inputs.asset);
 const lastAsset=Math.max(...yAll.keys());
 const months=spec.window==='5y'?60:spec.window==='10y'?120:Infinity;
 // Completeness counts only asset months inside the selected window.
 const ya=new Map([...yAll].filter(([k])=>k>lastAsset-months));
 const events=[...(inputs.events??[])].sort((a,b)=>a.effective_date.localeCompare(b.effective_date)).filter(e=>monthIndex(e.effective_date)>lastAsset-months);
 if(!events.length)throw new AnalysisError('no_events');
 const kept:EventRow[]=[];const dropped:EventResult['dropped']=[];let lastKept:number|null=null;
 for(const e of events){
  const a=monthIndex(e.effective_date);
  let complete=true;for(let k=a-n;k<=a+n;k++)if(!ya.has(k)){complete=false;break;}
  if(!complete){dropped.push({effective_date:e.effective_date,reason:'incomplete_window'});continue;}
  if(lastKept!==null&&a-lastKept<=2*n){dropped.push({effective_date:e.effective_date,reason:'overlap'});continue;}
  kept.push({effective_date:e.effective_date,anchor:monthKey(a),change_bp:e.change_bp,pre_from:monthKey(a-n),post_to:monthKey(a+n),
   pre:windowMove(ya.get(a)!,ya.get(a-n)!,inputs.asset.change_kind),post:windowMove(ya.get(a+n)!,ya.get(a)!,inputs.asset.change_kind)});
  lastKept=a;
 }
 return {kind:'event_window',n_months:n,events:kept,candidates:events.length,independent:kept.length,dropped,
  stats:kept.length>=MIN_INDEPENDENT_EVENTS?{pre:quartiles(kept.map(k=>k.pre)),post:quartiles(kept.map(k=>k.post))}:null,
  y_unit:inputs.asset.change_kind==='pct'?'pct':inputs.asset.change_kind,...base};
}
