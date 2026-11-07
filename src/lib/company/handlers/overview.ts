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
import type {Cell,CoverageRow,EventInput,EventRow,EvidenceDto,FilingSummary,WithheldCounts} from '../types';

export const OVERVIEW_PARAMS=['asOf'] as const;
export const HEADLINE:Record<Market,readonly string[]>={US:['revenue','net_income_parent','operating_cash_flow'],CN:['revenue_operating','net_income_parent','operating_cash_flow']};
const DERIVED=['gross_margin','revenue_yoy'] as const;
const DUR_RANK:Record<string,number>={'12M':4,'9M':3,'6M':2,'3M':1};
export interface LatestBlock{periodKey:string|null;facts:Record<string,Cell>;derived:Record<string,Cell>;stateRev:number;truncated:boolean}
export interface OverviewDto{issuer:ResolvedIssuer|null;ticker:string;market:Market;asOf:string;coverage:CoverageRow|null;coverageOtherMarket:CoverageRow|null;latestFiling:FilingSummary|null;latest:LatestBlock|null;recentEvents:PublicEvent[];eventsComputed:'materialized'|'live';evidence:Record<string,EvidenceDto>;withheld:WithheldCounts}

/** Ungated latest block of one envelope (pure; exported for the packet). */
export function latestBlock(rows:FactRow[],market:Market,asOf:string,stateRev:number):LatestBlock|null{
 const cur=rows.filter(r=>r.is_current===true&&r.consolidation==='consolidated'&&r.duration!=='INSTANT'&&r.period_start!==null);
 const anchors=cur.filter(r=>r.concept===HEADLINE[market][0]);
 if(anchors.length===0)return null;
 const a=anchors.reduce((best,r)=>r.period_end>best.period_end||(r.period_end===best.period_end&&(DUR_RANK[r.duration]??0)>(DUR_RANK[best.duration]??0))?r:best);
 const same=(r:{period_start:string|null;period_end:string;duration:string})=>r.period_start===a.period_start&&r.period_end===a.period_end&&r.duration===a.duration;
 const facts:Record<string,Cell>={};
 for(const c of HEADLINE[market]){const xs=cur.filter(r=>r.concept===c&&same(r));facts[c]=xs.length===1?factCellOf(xs[0],false):null;}
 const metrics:MetricRow[]=deriveMetrics(rows,{market,asOf,basedOnRev:stateRev});
 const derived:Record<string,Cell>={};
 for(const name of DERIVED){const xs=metrics.filter(m=>m.metric===name&&same(m));derived[name]=xs.length===1?derivedCellOf(xs[0]):null;}
 return {periodKey:periodKeyOf(a),facts,derived,stateRev,truncated:false};
}
export const overviewHandler:Handler=async(ctx)=>{
 const {issuer,deps,asOf}=ctx;const live=ctx.asOfGiven;
 const [snap,resolved,coverage]=await Promise.all([
  deps.snapshot(issuer.issuerId,issuer.market,{concepts:live?null:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true}),
  resolveIssuer(deps.tables,{ticker:issuer.ticker},{today:ctx.today}),
  deps.publicCompany.coverageOf([issuer.issuerId]),
 ]);
 const latestFiling=[...snap.filings].sort((x,y)=>x.availableDate<y.availableDate?1:x.availableDate>y.availableDate?-1:x.filingId<y.filingId?1:-1)[0]??null;
 const latest:LatestBlock|null=snap.truncated?{periodKey:null,facts:{},derived:{},stateRev:snap.stateRev,truncated:true}:latestBlock(snap.rows,issuer.market,asOf,snap.stateRev);
 let events:{e:EventInput|EventRow;eventId:string}[]=[];
 if(live){
  if(!snap.truncated)events=deriveIssuerEvents({rows:snap.rows,filings:snap.filings,cutoff:asOf})
   .map(e=>({e,eventId:eventIdOf(issuer.issuerId,issuer.market,e.kind,e.natural_key)}))
   .sort((x,y)=>x.e.occurred_on<y.e.occurred_on?1:x.e.occurred_on>y.e.occurred_on?-1:x.eventId<y.eventId?-1:1).slice(0,3);
 }else events=(await deps.company.eventsOfIssuer(issuer.issuerId,issuer.market,{limit:3})).rows.map(r=>({e:r,eventId:r.event_id}));
 const cells=latest?[...Object.values(latest.facts),...Object.values(latest.derived)]:[];
 const g=await buildGated(ctx,[...cells.flatMap(cellFactIds),...events.flatMap(x=>eventFactIds(x.e))],snap.rows,snap.filings);
 const gatedLatest=latest&&{...latest,facts:Object.fromEntries(Object.entries(latest.facts).map(([k,c])=>[k,gateCell(c,g)])),derived:Object.fromEntries(Object.entries(latest.derived).map(([k,c])=>[k,gateCell(c,g)]))};
 const recentEvents=events.map(x=>toPublicEvent({e:x.e,eventId:x.eventId,issuerId:issuer.issuerId,market:issuer.market},g.eligibility,x.e.filing_id?g.filings.get(x.e.filing_id):undefined));
 const eventIds=[...new Set(events.flatMap(x=>eventFactIds(x.e)))];
 const body:OverviewDto={issuer:resolved,ticker:issuer.ticker,market:issuer.market,asOf,
  coverage:coverage.find(c=>c.market===issuer.market)??null,coverageOtherMarket:coverage.find(c=>c.market!==issuer.market)??null,
  latestFiling,latest:gatedLatest,recentEvents,eventsComputed:live?'live':'materialized',evidence:g.evidence,
  withheld:countWithheld([...(gatedLatest?[...Object.values(gatedLatest.facts),...Object.values(gatedLatest.derived)]:[]),...eventIds.map(id=>g.withheld(id))])};
 return {body,empty:!latest&&recentEvents.length===0&&coverage.length===0};
};
