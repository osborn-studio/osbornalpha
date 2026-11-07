// src/lib/macro/cycles.ts
// Read-time cycle segmentation and asset moves over a cycle (spec §6.2, version macro-cycles/1). Pure and
// deterministic. All value arithmetic is on decimal text (decimal.ts); nothing here converts to float.
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import {subtract,yoyPct} from './decimal';
import {decimalSign,toBp,type PolicyEvent} from './events';
import type {ChangeKind,ObservationRow} from './types';
export const CYCLES_VERSION='macro-cycles/1';
export const MIN_RUN_MONTHS=6,MEDIAN_WINDOW=12,PLATEAU_MONTHS=12;
export type CycleDirection='up'|'down'|'plateau';
export interface Cycle{basis:'policy_events'|'trailing_median';direction:CycleDirection;start:string;end:string;ongoing:boolean;confirmed_at:string;event_count:number|null;version:string}
export interface InsufficientSegment{direction:'up'|'down';start:string;end:string}
export type MonthlyInput=Pick<ObservationRow,'observation_id'|'period_end'|'value_text'>;
export interface AssetCycleChange{start_period:string;end_period:string;start_value:string|null;end_value:string|null;change_text:string|null;change_kind:ChangeKind;observation_ids:string[];missing:'start'|'end'|'both'|'non_positive_base'|null}

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const monthIndex=(d:string)=>Number(d.slice(0,4))*12+Number(d.slice(5,7))-1;
const daysIn=(y:number,m0:number)=>new Date(Date.UTC(y,m0+1,0)).getUTCDate();
const pad=(n:number)=>String(n).padStart(2,'0');
export function monthEndAt(index:number):string{const y=Math.floor(index/12),m0=index%12;return `${y}-${pad(m0+1)}-${pad(daysIn(y,m0))}`;}
export const monthEndOf=(d:string):string=>monthEndAt(monthIndex(d));
export function addMonths(d:string,n:number):string{const idx=monthIndex(d)+n;const y=Math.floor(idx/12),m0=idx%12;return `${y}-${pad(m0+1)}-${pad(Math.min(Number(d.slice(8,10)),daysIn(y,m0)))}`;}
export function previousDay(d:string):string{return new Date(Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)))-86_400_000).toISOString().slice(0,10);}
/** The last month end on or before d (d itself when it is a month end). */
export const lastCompleteMonthEnd=(d:string):string=>monthEndOf(d)===d?d:monthEndAt(monthIndex(d)-1);

/** Policy cycles from derived events: same-sign runs merge, a flip opens a new cycle, ≥ 12 quiet months → plateau. */
export function policyCycles(events:readonly PolicyEvent[],lastDate:string):Cycle[]{
 if(!DATE.test(lastDate))throw new Error(`cycles_bad_date:${lastDate}`);
 const evs=events.filter(e=>decimalSign(e.change_bp)!==0);
 for(let i=1;i<evs.length;i++)if(evs[i].effective_date<=evs[i-1].effective_date)throw new Error('cycles_unsorted_events');
 if(evs.length&&evs[evs.length-1].effective_date>lastDate)throw new Error('cycles_last_date_before_event');
 const groups:{dir:'up'|'down';first:string;last:string;count:number}[]=[];
 for(const e of evs){
  const dir=decimalSign(e.change_bp)>0?'up':'down';const g=groups[groups.length-1];
  if(g&&g.dir===dir){g.last=e.effective_date;g.count++;}else groups.push({dir,first:e.effective_date,last:e.effective_date,count:1});
 }
 const out:Cycle[]=[];
 groups.forEach((g,i)=>{
  const next=groups[i+1]?.first??null;const horizon=next??lastDate;
  const base={basis:'policy_events' as const,version:CYCLES_VERSION};
  if(addMonths(g.last,PLATEAU_MONTHS)<=horizon){
   out.push({...base,direction:g.dir,start:g.first,end:g.last,ongoing:false,confirmed_at:g.first,event_count:g.count});
   out.push({...base,direction:'plateau',start:g.last,end:next?previousDay(next):lastDate,ongoing:next===null,confirmed_at:addMonths(g.last,PLATEAU_MONTHS),event_count:0});
  }else out.push({...base,direction:g.dir,start:g.first,end:next?previousDay(next):lastDate,ongoing:next===null,confirmed_at:g.first,event_count:g.count});
 });
 return out;
}

/** Sum of the 6th and 7th smallest of 12 decimals = 2 × median (exact; comparing 2× medians = comparing medians). */
function doubledMedian(values:string[]):string{
 const s=[...values].sort((a,b)=>decimalSign(subtract(a,b)));
 return subtract(s[5],subtract('0',s[6]));
}

/** Monthly cycles from the trailing 12-month median (spec §6.2). Input: one ok row per month end, ascending. */
export function seriesCycles(history:readonly MonthlyInput[]):{cycles:Cycle[];insufficient:InsufficientSegment[]}{
 for(let i=0;i<history.length;i++){
  const d=history[i].period_end;
  if(!DATE.test(d)||monthEndOf(d)!==d)throw new Error(`cycles_not_month_end:${d}`);
  if(i>0&&monthIndex(d)<=monthIndex(history[i-1].period_end))throw new Error(`cycles_unsorted:${d}`);
 }
 if(history.length===0)return {cycles:[],insufficient:[]};
 const byMonth=new Map(history.map(r=>[monthIndex(r.period_end),canonicalDecimal(r.value_text)]));
 const first=monthIndex(history[0].period_end),last=monthIndex(history[history.length-1].period_end);
 const med=new Map<number,string>();
 for(let m=first+MEDIAN_WINDOW-1;m<=last;m++){
  const w:string[]=[];
  for(let k=m-MEDIAN_WINDOW+1;k<=m;k++){const v=byMonth.get(k);if(v===undefined)break;w.push(v);}
  if(w.length===MEDIAN_WINDOW)med.set(m,doubledMedian(w));
 }
 const dir=new Map<number,'up'|'down'>();
 for(let m=first+1;m<=last;m++){
  const a=med.get(m),b=med.get(m-1);if(a===undefined||b===undefined)continue;
  const s=decimalSign(subtract(a,b));const d=s>0?'up':s<0?'down':dir.get(m-1);
  if(d)dir.set(m,d);
 }
 // runs of consecutive months with one direction; a month without a direction closes the block (gap rule)
 const runs:{dir:'up'|'down';from:number;to:number;block:number}[]=[];let block=0;
 for(let m=first;m<=last;m++){
  const d=dir.get(m);if(!d){block++;continue;}
  const r=runs[runs.length-1];
  if(r&&r.block===block&&r.dir===d&&r.to===m-1)r.to=m;else runs.push({dir:d,from:m,to:m,block});
 }
 const segs:{dir:'up'|'down';from:number;to:number;confirmed:number;block:number}[]=[];
 const short:{dir:'up'|'down';from:number;to:number;block:number}[]=[];
 for(const r of runs){
  const prev=segs[segs.length-1];const inBlock=prev&&prev.block===r.block?prev:null;
  if(r.to-r.from+1>=MIN_RUN_MONTHS){
   if(inBlock&&inBlock.dir===r.dir)inBlock.to=r.to;      // continues a segment that absorbed a short run
   else segs.push({dir:r.dir,from:r.from,to:r.to,confirmed:r.from+MIN_RUN_MONTHS-1,block:r.block});
  }else if(inBlock)inBlock.to=r.to;                       // short run merges into the previous segment
  else{
   const s=short[short.length-1];
   if(s&&s.block===r.block&&s.to===r.from-1)s.to=r.to;else short.push({dir:r.dir,from:r.from,to:r.to,block:r.block});
  }
 }
 return {
  cycles:segs.map(s=>({basis:'trailing_median' as const,direction:s.dir,start:monthEndAt(s.from),end:monthEndAt(s.to),ongoing:s.to===last,confirmed_at:monthEndAt(s.confirmed),event_count:null,version:CYCLES_VERSION})),
  insufficient:short.map(s=>({direction:s.dir,start:monthEndAt(s.from),end:monthEndAt(s.to)})),
 };
}

/** Asset move between the month ends of a cycle's start and end; missing endpoint → change_text null. */
export function assetChangeOverCycle(asset:readonly MonthlyInput[],cycle:{start:string;end:string},changeKind:ChangeKind):AssetCycleChange{
 const startP=monthEndOf(cycle.start),endP=monthEndOf(cycle.end);
 const by=new Map(asset.map(r=>[r.period_end,r]));
 const a=by.get(startP)??null,b=by.get(endP)??null;
 const base={start_period:startP,end_period:endP,start_value:a?canonicalDecimal(a.value_text):null,end_value:b?canonicalDecimal(b.value_text):null,change_kind:changeKind,
  observation_ids:[a,b].flatMap(r=>r?[r.observation_id]:[])};
 if(!a||!b)return {...base,change_text:null,missing:!a&&!b?'both':!a?'start':'end'};
 if(changeKind==='pct'){
  if(decimalSign(a.value_text)<=0)return {...base,change_text:null,missing:'non_positive_base'};
  return {...base,change_text:yoyPct(b.value_text,a.value_text),missing:null};
 }
 const d=subtract(b.value_text,a.value_text);
 return {...base,change_text:changeKind==='bp'?toBp(d):canonicalDecimal(d),missing:null};
}
