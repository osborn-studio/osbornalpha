// src/lib/macro/derive.ts
// Derived observations (spec §4.2 rules, §0.2 M6/M7/M8): pure functions from the input series'
// history (highest ok version per period, ascending) to ObservationWrite rows for macro_write_observations.
//  - month_end: the last valid observation of a COMPLETED calendar month. A month is complete when it
//    is before the current UTC month AND the input already has an observation in a later month, so a
//    late-arriving last trading day cannot first derive from the day before (and then revise). The
//    current month never produces a value.
//  - yoy_from_index: (cur/prev − 1) × 100 with prev = same period one year earlier; no prev → no row
//    (missing stays missing, never interpolated). Decimal arithmetic in decimal.ts::yoyPct.
//  - index_minus_100: exact decimal "上年同月=100" index − 100.
// month_end inputs include the completion witness (first later-month observation).
// available_at = the max available_at of ALL inputs of the row; derived_from = the input observation
// ids; transform = '<kind>@1'. Quarterly series are never forward-filled into months.
import {equals,minus100,yoyPct} from './decimal';
import {monthEnd,monthKey,shiftMonthEnd} from './periods';
import type {MacroSeriesDef,ObservationRow,ObservationWrite} from './types';

export const DERIVE_VERSION=1;
type DerivedWrite=Extract<ObservationWrite,{derived_from:string[]}>;
const latestOf=(a:string,b:string)=>Date.parse(a)>=Date.parse(b)?a:b;

/** Highest ok version per period_end, ascending by period_end. */
function normalise(rows:readonly ObservationRow[]):ObservationRow[]{
 const best=new Map<string,ObservationRow>();
 for(const r of rows){
  if(r.status!=='ok')continue;
  const cur=best.get(r.period_end);
  if(!cur||r.version>cur.version)best.set(r.period_end,r);
 }
 return [...best.values()].sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:0);
}

export function deriveSeries(def:MacroSeriesDef,inputs:readonly ObservationRow[],opts:{now:Date}):DerivedWrite[]{
 const rule=def.derive;
 if(!rule)throw new Error(`not_derived:${def.id}`);
 if(!(opts.now instanceof Date)||!Number.isFinite(opts.now.getTime()))throw new Error('invalid_now');
 const rows=normalise(inputs.filter(r=>r.series_id===rule.from));
 const revisable=def.revisionPolicy==='revisable';
 const out:DerivedWrite[]=[];
 const transform=`${rule.kind}@${DERIVE_VERSION}`;
 if(rule.kind==='month_end'){
  const current=opts.now.toISOString().slice(0,7);
  const lastByMonth=new Map<string,ObservationRow>();
  const firstByMonth=new Map<string,ObservationRow>();
  for(const r of rows){
   const k=monthKey(r.period_end);
   lastByMonth.set(k,r);   // ascending ⇒ the last write per month wins
   if(!firstByMonth.has(k))firstByMonth.set(k,r);
  }
  const months=[...lastByMonth.keys()];
  const newest=months[months.length-1];
  for(let i=0;i<months.length;i++){
   const m=months[i];
   if(m>=current||m===newest)continue;   // calendar month not over, or no later observation yet
   const r=lastByMonth.get(m)!;
   // the first later-month observation is the completion witness: it is an input of the row
   const w=firstByMonth.get(months[i+1])!;
   out.push({series_id:def.id,period_end:monthEnd(Number(m.slice(0,4)),Number(m.slice(5,7))),value_text:r.value_text,available_at:latestOf(r.available_at,w.available_at),revisable,derived_from:[r.observation_id,w.observation_id],transform});
  }
  return out;
 }
 if(rule.kind==='yoy_from_index'){
  const byPeriod=new Map(rows.map(r=>[r.period_end,r]));
  for(const cur of rows){
   const prev=byPeriod.get(shiftMonthEnd(cur.period_end,-12));
   if(!prev||equals(prev.value_text,'0'))continue;
   out.push({series_id:def.id,period_end:cur.period_end,value_text:yoyPct(cur.value_text,prev.value_text),available_at:latestOf(cur.available_at,prev.available_at),revisable,derived_from:[cur.observation_id,prev.observation_id],transform});
  }
  return out;
 }
 for(const cur of rows)out.push({series_id:def.id,period_end:cur.period_end,value_text:minus100(cur.value_text),available_at:cur.available_at,revisable,derived_from:[cur.observation_id],transform});
 return out;
}
