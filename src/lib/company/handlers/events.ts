// src/lib/company/handlers/events.ts
// GET /api/companies/[ticker]/events (spec §6.1, §7.2, §0 #64). Without asOf: materialized issuer_events
// (retired_at is null) read server-side with service_role, keyset paged by CompanyDb. With asOf: one
// company_read_snapshot(concepts null, history:true) → deriveIssuerEvents(cutoff=asOf), no firstSeenAt,
// computed 'live', own keyset over (occurred_on desc, event_id asc) — the order Task 3 eventsOfIssuer pages
// the materialized table; truncated → 400 replay_truncated. Payload values pass the shared event gate
// (event-dto.ts gateEvents, the same function the tracking inbox uses) in both modes.
import {QueryError,dateParam,intParam,listParam} from '@/lib/facts/public-route';
import type {FactRow} from '@/lib/facts/types';
import {eventIdOf} from '../canonical';
import {gateEvents} from '../event-dto';
import type {PublicEvent} from '../event-dto';
import {deriveIssuerEvents} from '../events';
import {RouteError} from '../route';
import type {Handler} from '../route';
import {CompanyDbError,EVENT_KINDS} from '../types';
import type {EventInput,EventKind,EventRow,EvidenceDto,FilingSummary,WithheldCounts} from '../types';

export const EVENTS_PARAMS=['since','until','kinds','cursor','limit','asOf'] as const;
const KINDS=new Set<string>(EVENT_KINDS);
const CURSOR_RE=/^[A-Za-z0-9_-]{1,256}$/;
export interface EventsDto{issuerId:string;ticker:string;market:'US'|'CN';asOf:string|null;computed:'materialized'|'live';stateRev:number|null;rows:PublicEvent[];nextCursor:string|null;evidence:Record<string,EvidenceDto>;withheld:WithheldCounts}
const enc=(occ:string,id:string)=>Buffer.from(`${occ}~${id}`,'utf8').toString('base64url');
function dec(c:string):{occ:string;id:string}{
 const s=Buffer.from(c,'base64url').toString('utf8');const m=/^(\d{4}-\d{2}-\d{2})~([0-9a-f]{64})$/.exec(s);
 if(!m)throw new QueryError('cursor');return {occ:m[1],id:m[2]};
}
export interface LiveEvent{input:EventInput;eventId:string}
/** Live events in materialized order, filtered; `after` is a decoded keyset position. */
export function pageLive(all:LiveEvent[],f:{since?:string;until?:string;kinds?:string[];cursor?:string;limit:number}):{rows:LiveEvent[];nextCursor:string|null}{
 const after=f.cursor?dec(f.cursor):null;
 const xs=all.filter(e=>(!f.since||e.input.occurred_on>=f.since)&&(!f.until||e.input.occurred_on<=f.until)&&(!f.kinds||f.kinds.includes(e.input.kind)))
  .sort((a,b)=>a.input.occurred_on<b.input.occurred_on?1:a.input.occurred_on>b.input.occurred_on?-1:a.eventId<b.eventId?-1:a.eventId>b.eventId?1:0)
  .filter(e=>!after||e.input.occurred_on<after.occ||(e.input.occurred_on===after.occ&&e.eventId>after.id));
 const rows=xs.slice(0,f.limit);
 return {rows,nextCursor:xs.length>f.limit?enc(rows[rows.length-1].input.occurred_on,rows[rows.length-1].eventId):null};
}
export const eventsHandler:Handler=async(ctx)=>{
 const {params:p,issuer,deps,asOf}=ctx;
 const since=dateParam(p,'since'),until=dateParam(p,'until');
 const kinds=listParam(p,'kinds',KINDS,KINDS.size) as EventKind[]|undefined;
 const limit=intParam(p,'limit',50,200);
 const cursor=p.get('cursor');if(cursor!==undefined&&!CURSOR_RE.test(cursor))throw new QueryError('cursor');
 let items:{e:EventInput|EventRow;eventId:string}[],nextCursor:string|null,known:FactRow[]=[],filings:FilingSummary[]=[],stateRev:number|null=null;
 if(!ctx.asOfGiven){
  let page:{rows:EventRow[];nextCursor:string|null};
  try{page=await deps.company.eventsOfIssuer(issuer.issuerId,issuer.market,{since,until,kinds,cursor:cursor??null,limit});}
  catch(e){if(e instanceof CompanyDbError&&e.code==='invalid_read')throw new QueryError('cursor');throw e;}
  items=page.rows.map(r=>({e:r,eventId:r.event_id}));nextCursor=page.nextCursor;
 }else{
  const snap=await deps.snapshot(issuer.issuerId,issuer.market,{concepts:null,asOf,history:true});
  if(snap.truncated)throw new RouteError('replay_truncated',400,'replay read truncated');
  const all=deriveIssuerEvents({rows:snap.rows,filings:snap.filings,cutoff:asOf}).map(e=>({input:e,eventId:eventIdOf(issuer.issuerId,issuer.market,e.kind,e.natural_key)}));
  const page=pageLive(all,{since,until,kinds,cursor,limit});
  items=page.rows.map(x=>({e:x.input,eventId:x.eventId}));nextCursor=page.nextCursor;known=snap.rows;filings=snap.filings;stateRev=snap.stateRev;
 }
 const gated=await gateEvents(items.map(x=>({e:x.e,eventId:x.eventId,issuerId:issuer.issuerId,market:issuer.market})),deps,{admin:ctx.admin,known,filings});
 const rows=gated.events;
 const body:EventsDto={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:ctx.asOfGiven?asOf:null,computed:ctx.asOfGiven?'live':'materialized',stateRev,rows,nextCursor,evidence:gated.evidence,withheld:gated.withheld};
 return {body,empty:rows.length===0};
};
