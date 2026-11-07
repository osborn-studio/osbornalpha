// src/app/api/tracking/inbox/route.ts
// GET ?cursor&limit≤200&kinds&unreadOnly=1&issuerId (spec §6.2, §7.3, §0 #64). Watches and receipts via the
// session client (RLS); issuer_events via the service-role CompanyDb restricted to the user's watched issuer
// ids (non-muted, or the one explicit watched issuerId, muted or not). Keyset (first_seen_at desc, event_id
// desc). Payload values pass the shared evidence gate (same function as /api/companies/[ticker]/events).
import {gateEventRows} from '@/lib/company/event-dto';
import {productionEventGateDeps} from '@/lib/company/deps';
import {assembleInbox,decodeInboxCursor,encodeInboxCursor,inboxFingerprint,inboxIssuerIds,INBOX_DEFAULT_LIMIT,INBOX_MAX_LIMIT} from '@/lib/company/inbox';
import {serviceCompanyDb,trackingError,trackingFailure,trackingJson,trackingSession,unauthenticated} from '@/lib/company/tracking-route';
import {CompanyDbError,EVENT_KINDS,type EventKind} from '@/lib/company/types';
import {QueryError,UUID_RE,flagParam,intParam,listParam,readParams} from '@/lib/facts/public-route';

export const dynamic='force-dynamic';
const PARAMS=['cursor','limit','kinds','unreadOnly','issuerId'] as const;

export async function GET(request:Request){
 const s=await trackingSession();
 if(!s)return unauthenticated();
 let limit:number,kinds:EventKind[]|undefined,unreadOnly:boolean,issuerId:string|null,cursorRaw:string|undefined;
 try{
  const p=readParams(new URL(request.url),PARAMS);
  limit=intParam(p,'limit',INBOX_DEFAULT_LIMIT,INBOX_MAX_LIMIT);
  kinds=listParam(p,'kinds',new Set(EVENT_KINDS),EVENT_KINDS.length) as EventKind[]|undefined;
  unreadOnly=flagParam(p,'unreadOnly');
  issuerId=p.get('issuerId')?.toLowerCase()??null;
  if(issuerId!==null&&!UUID_RE.test(issuerId))throw new QueryError('issuerId');
  cursorRaw=p.get('cursor');
 }catch(e){
  if(e instanceof QueryError)return trackingError(e.message,`invalid ${e.param}`,400);
  return trackingFailure(e,'tracking/inbox');
 }
 const fingerprint=inboxFingerprint({kinds,unreadOnly,issuerId});
 let dbCursor:string|null=null;
 if(cursorRaw!==undefined){
  try{dbCursor=decodeInboxCursor(cursorRaw,fingerprint);}catch{return trackingError('invalid_parameter:cursor','invalid cursor',400);}
 }
 try{
  const issuerIds=inboxIssuerIds(await s.db.watchesOf(s.userId),issuerId);
  if(issuerIds===null)return trackingError('watch_not_found','not tracking this company',404);
  if(issuerIds.length===0)return trackingJson({rows:[],nextCursor:null,evidence:{}});
  const service=serviceCompanyDb();
  const page=await assembleInbox(
   {eventsOfIssuers:(i,o)=>service.eventsOfIssuers(i,o),readEventIds:(e)=>s.db.readEventIds(s.userId,e)},
   {issuerIds,kinds,unreadOnly,limit,cursor:dbCursor},
  );
  const {events,evidence}=await gateEventRows(page.rows,productionEventGateDeps(),{admin:false});
  const read=new Map(page.rows.map(r=>[r.event_id,r.read]));
  return trackingJson({
   rows:events.map(e=>({...e,read:read.get(e.eventId)===true})),
   nextCursor:page.nextCursor===null?null:encodeInboxCursor(page.nextCursor,fingerprint),
   evidence,
  });
 }catch(e){
  if(e instanceof CompanyDbError&&e.code==='invalid_read')return trackingError('invalid_parameter:cursor','invalid cursor',400);
  return trackingFailure(e,'tracking/inbox');
 }
}
