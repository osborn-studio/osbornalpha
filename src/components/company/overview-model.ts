// src/components/company/overview-model.ts
// Pure model of the overview view (plan 2026-11-06 Task 13; spec §5.8, §4.1 payload schemas, §0 #64).
// Payload values may arrive replaced by {kind:'withheld'} (evidence gate) and are passed through as such.
import type {Market} from '@/lib/company/types';
import type {PublicEvent} from '@/lib/company/client';

export type QuickItem={key:string;group:'facts'|'derived'};
export function quickItems(market:Market):QuickItem[]{
 return [{key:market==='CN'?'revenue_operating':'revenue',group:'facts'},{key:'net_income_parent',group:'facts'},{key:'operating_cash_flow',group:'facts'},{key:'gross_margin',group:'derived'},{key:'revenue_yoy',group:'derived'}];
}
export type ValueRef={factId:string;value:string;unit?:string;filingId?:string;availableDate?:string}|{kind:'withheld';reason:'evidence_incomplete'|'citation_pending';factId:string};
export interface EventView{
 eventId:string;occurredOn:string;chip:'kindFiling'|'kindPeriod'|'kindRevised';updated:boolean;
 link:{view:'filings'|'statements';asOf:string|null};
 filing?:{form:string;fiscal:string;factCount:number};
 period?:{periodStart:string;periodEnd:string;duration:string;headline:{concept:string;ref:ValueRef}|null};
 revised?:{concept:string;periodEnd:string;duration:string;unit:string;from:ValueRef;to:ValueRef;relChange:string|ValueRef|null};
}
const rec=(v:unknown)=>(typeof v==='object'&&v!==null?v as Record<string,unknown>:{});
const s=(v:unknown)=>typeof v==='string'?v:'';
/** A gated headline entry carries the withheld marker under `.value` (Task 6 gateEventPayload); surface the marker itself. */
const withheldOrEntry=(x:unknown):ValueRef=>{const v=(x as {value?:unknown}|null)?.value;return (v&&typeof v==='object'&&(v as {kind?:unknown}).kind==='withheld'?v:x) as ValueRef;};
export function eventView(e:PublicEvent,market:Market):EventView{
 const p=e.payload;const base={eventId:e.eventId,occurredOn:e.occurredOn,updated:!!e.payloadChangedAt};
 if(e.kind==='filing_published')return {...base,chip:'kindFiling',link:{view:'filings',asOf:null},
  filing:{form:s(p.formType),fiscal:[p.fiscalYear??'',p.fiscalPeriod??''].join(' ').trim()||'—',factCount:typeof p.factCount==='number'?p.factCount:0}};
 if(e.kind==='period_first_seen'){
  const h=rec(p.headline);
  const order=[market==='CN'?'revenue_operating':'revenue',market==='CN'?'revenue':'revenue_operating','net_income_parent','operating_cash_flow'];
  const c=order.find(k=>k in h);
  return {...base,chip:'kindPeriod',link:{view:'statements',asOf:e.occurredOn},
   period:{periodStart:s(p.periodStart),periodEnd:s(p.periodEnd),duration:s(p.duration),headline:c?{concept:c,ref:withheldOrEntry(h[c])}:null}};
 }
 return {...base,chip:'kindRevised',link:{view:'statements',asOf:e.occurredOn},
  revised:{concept:s(p.concept),periodEnd:s(p.periodEnd),duration:s(p.duration),unit:s(p.unit),from:withheldOrEntry(p.from),to:withheldOrEntry(p.to),relChange:(p.relChange as string|ValueRef|undefined)??null}};
}
