// src/lib/company/handlers/overview.ts
// GET /api/companies/[ticker]/overview (spec §5.8, §5.10, §6.1). One snapshot envelope feeds the latest
// block (current facts of the headline concepts at the latest period + gross_margin/revenue_yoy derived
// on the SAME envelope, never the materialized table) and latestFiling (that snapshot's filings).
// Without asOf the recent events are the materialized ones (≤ 3); with asOf the envelope reads every
// concept and the events are derived live from it. All values gated.
import {resolveIssuer} from '@/lib/entities/resolve';
import type {ResolvedIssuer} from '@/lib/entities/resolve';
import {DERIVE_CONCEPTS,deriveMetrics} from '@/lib/facts/derive';
import type {FactRow,Market,MetricRow} from '@/lib/facts/types';
import {eventIdOf} from '../canonical';
import {eventFactIds,toPublicEvent} from '../event-dto';
import type {PublicEvent} from '../event-dto';
import {deriveIssuerEvents} from '../events';
import {buildGated,cellFactIds,countWithheld,gateCell} from '../route';
import type {Handler} from '../route';
import {derivedCellOf,factCellOf,periodKeyOf} from '../statements-grid';
import type {Cell,CoverageRow,EventInput,EventRow,EvidenceDto,FilingSummary,OverviewUnavailableReasons,WithheldCounts} from '../types';

export const OVERVIEW_PARAMS=['asOf'] as const;
export const HEADLINE:Record<Market,readonly string[]>={US:['revenue','net_income_parent','operating_cash_flow'],CN:['revenue_operating','net_income_parent','operating_cash_flow']};
const DERIVED=['gross_margin','revenue_yoy'] as const;
const DUR_RANK:Record<string,number>={'12M':4,'9M':3,'6M':2,'3M':1};
export interface LatestBlock{periodKey:string|null;facts:Record<string,Cell>;derived:Record<string,Cell>;stateRev:number;truncated:boolean;unavailableReasons?:OverviewUnavailableReasons}
export interface OverviewDto{issuer:ResolvedIssuer|null;ticker:string;market:Market;asOf:string;coverage:CoverageRow|null;coverageOtherMarket:CoverageRow|null;latestFiling:FilingSummary|null;latest:LatestBlock|null;recentEvents:PublicEvent[];eventsComputed:'materialized'|'live';evidence:Record<string,EvidenceDto>;withheld:WithheldCounts}

type AmbiguityCandidates={facts:Record<string,string[]>;derived:Record<string,string[]>};
/** Candidate IDs stay internal. One candidate per distinct unit excludes same-unit conflicts. */
function selectLatest(rows:FactRow[],market:Market,asOf:string,stateRev:number):{block:LatestBlock;candidates:AmbiguityCandidates}|null{
 const cur=rows.filter(r=>r.is_current===true&&r.consolidation==='consolidated'&&r.duration!=='INSTANT'&&r.period_start!==null);
 const anchors=cur.filter(r=>r.concept===HEADLINE[market][0]);
 if(anchors.length===0)return null;
 const a=anchors.reduce((best,r)=>r.period_end>best.period_end||(r.period_end===best.period_end&&(DUR_RANK[r.duration]??0)>(DUR_RANK[best.duration]??0))?r:best);
 const same=(r:{period_start:string|null;period_end:string;duration:string})=>r.period_start===a.period_start&&r.period_end===a.period_end&&r.duration===a.duration;
 const candidates:AmbiguityCandidates={facts:{},derived:{}};
 const facts:Record<string,Cell>={};
 for(const c of HEADLINE[market]){const xs=cur.filter(r=>r.concept===c&&same(r));facts[c]=xs.length===1?factCellOf(xs[0],false):null;
  if(xs.length>1&&new Set(xs.map(r=>r.unit)).size===xs.length)candidates.facts[c]=xs.map(r=>r.fact_id);
 }
 const metrics:MetricRow[]=deriveMetrics(rows,{market,asOf,basedOnRev:stateRev});
 const derived:Record<string,Cell>={};
 for(const name of DERIVED){const xs=metrics.filter(m=>m.metric===name&&same(m));derived[name]=xs.length===1?derivedCellOf(xs[0]):null;
  if(xs.length>1&&new Set(xs.map(m=>m.input_unit)).size===xs.length)candidates.derived[name]=xs.flatMap(m=>m.inputs.map(i=>i.fact_id));
 }
 return {block:{periodKey:periodKeyOf(a),facts,derived,stateRev,truncated:false},candidates};
}
/** Ungated latest block of one envelope (pure; exported for the packet). */
export function latestBlock(rows:FactRow[],market:Market,asOf:string,stateRev:number):LatestBlock|null{
 return selectLatest(rows,market,asOf,stateRev)?.block??null;
}
export const overviewHandler:Handler=async(ctx)=>{
 const {issuer,deps,asOf}=ctx;const live=ctx.asOfGiven;
 const [snap,resolved,coverage]=await Promise.all([
  deps.snapshot(issuer.issuerId,issuer.market,{concepts:live?null:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true}),
  resolveIssuer(deps.tables,{ticker:issuer.ticker},{today:ctx.today}),
  deps.publicCompany.coverageOf([issuer.issuerId]),
 ]);
 const latestFiling=[...snap.filings].sort((x,y)=>x.availableDate<y.availableDate?1:x.availableDate>y.availableDate?-1:x.filingId<y.filingId?1:-1)[0]??null;
 const selection=snap.truncated?null:selectLatest(snap.rows,issuer.market,asOf,snap.stateRev);
 const latest:LatestBlock|null=snap.truncated?{periodKey:null,facts:{},derived:{},stateRev:snap.stateRev,truncated:true}:selection?.block??null;
 let events:{e:EventInput|EventRow;eventId:string}[]=[];
 if(live){
  if(!snap.truncated)events=deriveIssuerEvents({rows:snap.rows,filings:snap.filings,cutoff:asOf})
   .map(e=>({e,eventId:eventIdOf(issuer.issuerId,issuer.market,e.kind,e.natural_key)}))
   .sort((x,y)=>x.e.occurred_on<y.e.occurred_on?1:x.e.occurred_on>y.e.occurred_on?-1:x.eventId<y.eventId?-1:1).slice(0,3);
 }else events=(await deps.company.eventsOfIssuer(issuer.issuerId,issuer.market,{limit:3})).rows.map(r=>({e:r,eventId:r.event_id}));
 const cells=latest?[...Object.values(latest.facts),...Object.values(latest.derived)]:[];
 const visibleIds=new Set([...cells.flatMap(cellFactIds),...events.flatMap(x=>eventFactIds(x.e))]);
 const candidates=selection?.candidates??{facts:{},derived:{}};
 const diagnosticIds=[...Object.values(candidates.facts),...Object.values(candidates.derived)].flat();
 const g=await buildGated(ctx,[...visibleIds,...diagnosticIds],snap.rows,snap.filings);
 const gatedLatest=latest&&{...latest,facts:Object.fromEntries(Object.entries(latest.facts).map(([k,c])=>[k,gateCell(c,g)])),derived:Object.fromEntries(Object.entries(latest.derived).map(([k,c])=>[k,gateCell(c,g)]))};
 // One gate read for visible and suppressed inputs. All candidates must pass; a visible subset
 // cannot establish the reason. Diagnostic-only evidence and counts stay out of the public DTO.
 if(gatedLatest&&diagnosticIds.length){
  const confirmed=(group:Record<string,string[]>):Record<string,'multiple_units'>=>Object.fromEntries(
   Object.entries(group).filter(([,inputs])=>inputs.length>0&&inputs.every(id=>g.reasonOf(id)===null)).map(([key])=>[key,'multiple_units']));
  const reasons:OverviewUnavailableReasons={facts:confirmed(candidates.facts),derived:confirmed(candidates.derived)};
  if(Object.keys(reasons.facts).length||Object.keys(reasons.derived).length)gatedLatest.unavailableReasons=reasons;
 }
 const recentEvents=events.map(x=>toPublicEvent({e:x.e,eventId:x.eventId,issuerId:issuer.issuerId,market:issuer.market},g.eligibility,x.e.filing_id?g.filings.get(x.e.filing_id):undefined));
 const eventIds=[...new Set(events.flatMap(x=>eventFactIds(x.e)))];
 const body:OverviewDto={issuer:resolved,ticker:issuer.ticker,market:issuer.market,asOf,
  coverage:coverage.find(c=>c.market===issuer.market)??null,coverageOtherMarket:coverage.find(c=>c.market!==issuer.market)??null,
  latestFiling,latest:gatedLatest,recentEvents,eventsComputed:live?'live':'materialized',evidence:Object.fromEntries(Object.entries(g.evidence).filter(([id])=>visibleIds.has(id))),
  withheld:countWithheld([...(gatedLatest?[...Object.values(gatedLatest.facts),...Object.values(gatedLatest.derived)]:[]),...eventIds.map(id=>g.withheld(id))])};
 return {body,empty:!latest&&recentEvents.length===0&&coverage.length===0};
};
