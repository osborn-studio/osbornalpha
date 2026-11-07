// src/app/api/tracking/watches/[issuerId]/route.ts
// PATCH {note?, muted?} and DELETE (receipts cascade through the (user_id, issuer_id) foreign key). spec §6.2.
import {isIssuerId,jsonObject,mutationGuard,trackingError,trackingFailure,trackingJson,trackingSession,unauthenticated,watchDto} from '@/lib/company/tracking-route';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{issuerId:string}>}
const NOTE_MAX=2000;

export async function PATCH(request:Request,{params}:Ctx){
 const s=await trackingSession();
 if(!s)return unauthenticated();
 const guard=mutationGuard(request);if(guard)return guard;
 const {issuerId:rawId}=await params;
 const issuerId=rawId.toLowerCase();
 if(!isIssuerId(issuerId))return trackingError('invalid_parameter:issuerId','invalid issuerId',400);
 const body=await jsonObject(request);
 if(!body)return trackingError('invalid_parameter:body','JSON object required',400);
 const keys=Object.keys(body);
 if(keys.length===0||keys.some(k=>k!=='note'&&k!=='muted'))return trackingError('invalid_parameter:body','only note and muted may be patched',400);
 const patch:{note?:string|null;muted?:boolean}={};
 if('note' in body){
  const n=body.note;
  if(n!==null&&(typeof n!=='string'||n.length>NOTE_MAX))return trackingError('invalid_parameter:note',`note must be null or ≤ ${NOTE_MAX} characters`,400);
  patch.note=n===null||n.trim()===''?null:n;
 }
 if('muted' in body){
  if(typeof body.muted!=='boolean')return trackingError('invalid_parameter:muted','muted must be boolean',400);
  patch.muted=body.muted;
 }
 try{
  const row=await s.db.patchWatch(s.userId,issuerId,patch);
  if(!row)return trackingError('watch_not_found','not tracking this company',404);
  return trackingJson({watch:watchDto(row)});
 }catch(e){return trackingFailure(e,'tracking/watch');}
}

export async function DELETE(request:Request,{params}:Ctx){
 const s=await trackingSession();
 if(!s)return unauthenticated();
 const guard=mutationGuard(request);if(guard)return guard;
 const {issuerId:rawId}=await params;
 const issuerId=rawId.toLowerCase();
 if(!isIssuerId(issuerId))return trackingError('invalid_parameter:issuerId','invalid issuerId',400);
 try{
  if(!await s.db.deleteWatch(s.userId,issuerId))return trackingError('watch_not_found','not tracking this company',404);
  return trackingJson({deleted:true});
 }catch(e){return trackingFailure(e,'tracking/watch');}
}
