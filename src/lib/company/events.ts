// src/lib/company/events.ts
// Company event derivation (spec §7.1, §7.2, §4.1; plan 事件 payload schema). Pure and deterministic:
// one (issuer, market) stream's history envelope (ok rows with disclosure_seq) plus its activated
// filings, cut at `cutoff` (digest: today; replay: asOf) → filing_published / period_first_seen /
// fact_revised, sorted by (occurred_on, kind, natural_key). Natural keys never contain fact ids, so a
// mapping-generation upgrade keeps event identity. fact_revised collapses each sequence by day (the
// last row of a day is that day's point; commander decision: natural keys carry the to-date, so two
// edges on one day would collide). INSTANT periods use period_end as their start in keys and payloads.
// Values are value_text verbatim; relChange is the exact decimal of decimal.ts (omitted when from = 0).
import {decimalEquals} from '@/lib/facts/json-numbers';
import type {FactRow} from '@/lib/facts/types';
import {decimalRelChange} from './decimal';
import type {EventInput,FilingSummary} from './types';

export const EVENTS_VERSION='company-events/1';
export const HEADLINE_CONCEPTS=['revenue','revenue_operating','net_income_parent','operating_cash_flow'] as const;
export interface DeriveEventsInput{rows:FactRow[];filings:FilingSummary[];cutoff:string}

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const seqOf=(r:FactRow):number=>{if(r.disclosure_seq===undefined||r.disclosure_seq===null)throw new RangeError(`disclosure_seq missing on ok row ${r.fact_id}`);return r.disclosure_seq;};
const seqOrder=(a:FactRow,b:FactRow)=>seqOf(a)-seqOf(b);
const startOf=(r:FactRow)=>r.period_start??r.period_end;
const naturalK=(r:FactRow)=>[r.concept,startOf(r),r.period_end,r.consolidation,r.unit].join(':');
const periodKey=(r:FactRow)=>`${startOf(r)}:${r.period_end}:${r.duration}`;
function groupBy<T>(xs:T[],key:(x:T)=>string):Map<string,T[]>{const m=new Map<string,T[]>();for(const x of xs){const k=key(x);const g=m.get(k);if(g)g.push(x);else m.set(k,[x]);}return m;}
const point=(r:FactRow)=>({factId:r.fact_id,value:r.value_text,filingId:r.filing_id,availableDate:r.available_date});

export function deriveIssuerEvents(input:DeriveEventsInput):EventInput[]{
 const {cutoff}=input;
 if(!DAY.test(cutoff)||new Date(`${cutoff}T00:00:00Z`).toISOString().slice(0,10)!==cutoff)throw new RangeError(`cutoff must be YYYY-MM-DD, got ${cutoff}`);
 const filings=input.filings.filter(f=>f.mappingGen>0&&f.availableDate<=cutoff);
 const ids=new Set(filings.map(f=>f.filingId));
 const rows=input.rows.filter(r=>r.status==='ok'&&r.available_date<=cutoff&&ids.has(r.filing_id));
 const out:EventInput[]=[];
 for(const f of filings)out.push({kind:'filing_published',natural_key:f.filingId,occurred_on:f.availableDate,period_end:f.periodEnd,concept:null,filing_id:f.filingId,
  payload:{formType:f.formType,fiscalYear:f.fiscalYear,fiscalPeriod:f.fiscalPeriod,periodEnd:f.periodEnd,availableDate:f.availableDate,sourceRef:f.sourceRef,factCount:f.factCount},meta:{}});
 const cons=rows.filter(r=>r.consolidation==='consolidated');
 // sequences per natural key; current = last in sequence order
 const current=new Map<string,FactRow>();
 for(const [k,g] of groupBy(cons,naturalK)){
  g.sort(seqOrder);current.set(k,g[g.length-1]);
  const days:FactRow[]=[];
  for(const r of g){if(days.length>0&&days[days.length-1].available_date===r.available_date)days[days.length-1]=r;else days.push(r);}
  for(let i=1;i<days.length;i++){
   const from=days[i-1],to=days[i];
   // The fact sequence key omits statement/duration. A change to either is not a
   // comparable revision (SQL enforces both); withhold this edge without bridging
   // across the incompatible disclosure or changing stable event identities.
   if(from.statement!==to.statement||from.duration!==to.duration)continue;
   if(decimalEquals(from.value_text,to.value_text))continue;
   const rel=decimalRelChange(from.value_text,to.value_text);
   out.push({kind:'fact_revised',natural_key:`${k}:${to.available_date}`,occurred_on:to.available_date,period_end:to.period_end,concept:to.concept,filing_id:to.filing_id,
    payload:{concept:to.concept,statement:to.statement,periodStart:startOf(to),periodEnd:to.period_end,duration:to.duration,consolidation:'consolidated',unit:to.unit,from:point(from),to:point(to),...(rel===null?{}:{relChange:rel})},meta:{}});
  }
 }
 for(const [pk,g] of groupBy(cons,periodKey)){
  const first=[...g].sort((a,b)=>cmp(a.available_date,b.available_date)||cmp(a.fact_id,b.fact_id))[0];
  const currents=[...current.values()].filter(r=>periodKey(r)===pk);
  const headline:Record<string,{factId:string;value:string;unit:string}>={};const ambiguousUnits:string[]=[];
  for(const c of HEADLINE_CONCEPTS){
   const hs=currents.filter(r=>r.concept===c);
   if(hs.length===1)headline[c]={factId:hs[0].fact_id,value:hs[0].value_text,unit:hs[0].unit};
   else if(hs.length>1)ambiguousUnits.push(c);
  }
  out.push({kind:'period_first_seen',natural_key:pk,occurred_on:first.available_date,period_end:first.period_end,concept:null,filing_id:first.filing_id,
   payload:{periodStart:startOf(first),periodEnd:first.period_end,duration:first.duration,filingId:first.filing_id,conceptCount:new Set(g.map(r=>r.concept)).size,headline,ambiguousUnits},meta:{headlineAsOf:cutoff}});
 }
 return out.sort((a,b)=>cmp(a.occurred_on,b.occurred_on)||cmp(a.kind,b.kind)||cmp(a.natural_key,b.natural_key));
}
