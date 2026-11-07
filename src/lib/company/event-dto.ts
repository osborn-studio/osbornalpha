// src/lib/company/event-dto.ts
// Public event DTO and its evidence gate (spec §6.1 events, §6.2 inbox, §0 #64): events are read with
// service_role and every value in a payload (period_first_seen headline values, fact_revised from/to
// values and relChange) is replaced by a withheld marker when the referenced fact fails the gate. The
// payload rule is Task 6's gateEventPayload (the only implementation); the gate is Task 6's applyGate
// (evidenceOf + CN pdf.locate per stream here). Shared by the events / overview handlers and the tracking
// inbox (gateEventRows, Task 16), so the company page and the inbox gate identically.
import type {FactRow,Market} from '@/lib/facts/types';
import type {EventGateDeps} from './deps';
import {applyGate,eventFactIds,gateEventPayload} from './evidence-gate';
import type {Eligibility} from './evidence-gate';
import {filingSummaryOf} from './snapshot-read';
import type {EventInput,EventKind,EventRow,EvidenceDto,EvidenceRecord,FilingSummary,PdfLocator,WithheldCounts} from './types';

export {eventFactIds};
/** One event as every public/tracking response carries it (Task 11–13, 17 render this shape). */
export interface PublicEvent{
 eventId:string;issuerId:string;market:Market;kind:EventKind;naturalKey:string;occurredOn:string;periodEnd:string|null;concept:string|null;filingId:string|null;
 payload:Record<string,unknown>;meta:Record<string,unknown>;firstSeenAt:string|null;payloadChangedAt:string|null;
 filing:{formType:string;url:string|null;documentUrl:string|null;citation:'edgar'|'linked'|'pending'}|null;
}
export interface GateEventItem{e:EventInput|EventRow;eventId:string;issuerId:string;market:Market}
export interface GatedEvents{events:PublicEvent[];evidence:Record<string,EvidenceDto>;withheld:WithheldCounts}
const filingRef=(f:FilingSummary|undefined):PublicEvent['filing']=>f?{formType:f.formType,url:f.url,documentUrl:f.documentUrl,citation:f.citation}:null;
/** Shapes one event; payload values gated with gateEventPayload over `elig` (missing ids → evidence_incomplete). */
export function toPublicEvent(item:GateEventItem,elig:Map<string,Eligibility>,filing:FilingSummary|undefined):PublicEvent{
 const {e}=item;const row=e as Partial<EventRow>;
 return {eventId:item.eventId,issuerId:item.issuerId,market:item.market,kind:e.kind,naturalKey:e.natural_key,occurredOn:e.occurred_on,periodEnd:e.period_end,concept:e.concept,filingId:e.filing_id,
  payload:gateEventPayload(e,elig),meta:e.meta,firstSeenAt:row.first_seen_at??null,payloadChangedAt:row.payload_changed_at??null,filing:filingRef(e.filing_id?filing:undefined)};
}
/**
 * Gates events of any number of (issuer, market) streams; output order = input order. Per stream: fact rows
 * from `known` (same snapshot) else factsByIds (kept only when they belong to the stream and are ok);
 * filings from `filings` else filingsOfIssuer (published only); one evidenceOf; pdf.locate only for CN.
 */
export async function gateEvents(items:GateEventItem[],deps:EventGateDeps,opts:{admin:boolean;known?:readonly FactRow[];filings?:readonly FilingSummary[]}):Promise<GatedEvents>{
 const evidence:Record<string,EvidenceDto>={};const withheld:WithheldCounts={evidenceIncomplete:0,citationPending:0};
 const elig=new Map<string,Eligibility>();const filingsOf=new Map<string,Map<string,FilingSummary>>();
 const groups=new Map<string,GateEventItem[]>();
 for(const it of items){const k=`${it.issuerId}:${it.market}`;const g=groups.get(k);if(g)g.push(it);else groups.set(k,[it]);}
 for(const [k,group] of groups){
  const {issuerId,market}=group[0];
  const ids=[...new Set(group.flatMap(x=>eventFactIds(x.e)))].sort();
  const facts=new Map<string,FactRow>();
  for(const r of opts.known??[])if(r.issuer_id===issuerId&&r.market===market&&r.status==='ok')facts.set(r.fact_id,r);
  const missing=ids.filter(id=>!facts.has(id));
  if(missing.length>0)for(const r of await deps.facts.factsByIds(missing))if(r.issuer_id===issuerId&&r.market===market&&r.status==='ok')facts.set(r.fact_id,r);
  const filings=new Map<string,FilingSummary>((opts.filings??[]).map(f=>[f.filingId,f]));
  if(group.some(x=>x.e.filing_id!==null&&!filings.has(x.e.filing_id))||[...facts.values()].some(r=>!filings.has(r.filing_id)))
   for(const f of await deps.facts.filingsOfIssuer(issuerId,market,{}))if(f.mapping_gen>0&&!filings.has(f.filing_id))filings.set(f.filing_id,filingSummaryOf(f,0));
  filingsOf.set(k,filings);
  const present=ids.filter(id=>facts.has(id));
  const [records,pdf]=present.length>0
   ?await Promise.all([deps.company.evidenceOf(present),market==='CN'?deps.pdf.locate(issuerId,market,present):Promise.resolve(new Map<string,PdfLocator>())])
   :[new Map<string,EvidenceRecord>(),new Map<string,PdfLocator>()];
  const g=applyGate({factIds:ids,facts,filings,records,pdf,market,admin:opts.admin});
  for(const [id,e] of g.eligibility)elig.set(id,e);
  Object.assign(evidence,g.evidence);
  withheld.evidenceIncomplete+=g.withheld.evidenceIncomplete;withheld.citationPending+=g.withheld.citationPending;
 }
 const events=items.map(it=>toPublicEvent(it,elig,it.e.filing_id?filingsOf.get(`${it.issuerId}:${it.market}`)?.get(it.e.filing_id):undefined));
 return {events,evidence,withheld};
}
/** Materialized rows (any issuers, e.g. the tracking inbox) → gated PublicEvents, order kept. */
export const gateEventRows=(rows:EventRow[],deps:EventGateDeps,opts:{admin:boolean}):Promise<GatedEvents>=>
 gateEvents(rows.map(r=>({e:r,eventId:r.event_id,issuerId:r.issuer_id,market:r.market})),deps,opts);
