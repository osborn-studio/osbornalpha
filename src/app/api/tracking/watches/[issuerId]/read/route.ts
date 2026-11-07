// src/app/api/tracking/watches/[issuerId]/read/route.ts
// POST {eventIds ≤ 500}: receipts for exactly these ids (spec §6.2). The user must hold the watch; the
// company_event_reads trigger rejects ids of another issuer (→ 400 invalid_parameter:eventIds). No timestamp
// semantics: "mark this page read" posts the ids the client was shown.
import {READ_BATCH_MAX} from '@/lib/company/inbox';
import {EVENT_ID_RE,findWatch,isIssuerId,jsonObject,mutationGuard,trackingError,trackingFailure,trackingJson,trackingSession,unauthenticated} from '@/lib/company/tracking-route';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{issuerId:string}>}
const badIds=()=>trackingError('invalid_parameter:eventIds',`eventIds: 1..${READ_BATCH_MAX} event ids`,400);

export async function POST(request:Request,{params}:Ctx){
 const s=await trackingSession();
 if(!s)return unauthenticated();
 const guard=mutationGuard(request);if(guard)return guard;
 const {issuerId:rawId}=await params;
 const issuerId=rawId.toLowerCase();
 if(!isIssuerId(issuerId))return trackingError('invalid_parameter:issuerId','invalid issuerId',400);
 const body=await jsonObject(request);
 const ids=body?.eventIds;
 if(!Array.isArray(ids)||ids.length===0||ids.length>READ_BATCH_MAX||ids.some(v=>typeof v!=='string'||!EVENT_ID_RE.test(v)))return badIds();
 const unique=[...new Set(ids as string[])];
 try{
  if(!findWatch(await s.db.watchesOf(s.userId),issuerId))return trackingError('watch_not_found','not tracking this company',404);
  return trackingJson(await s.db.markRead(s.userId,issuerId,unique));
 }catch(e){return trackingFailure(e,'tracking/read');}
}
