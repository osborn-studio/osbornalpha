// src/app/api/documents/doc/[id]/route.ts
// One document (spec §9): metadata, assets, extractions (cursor `extractionsCursor`, 100 per page),
// supersedes / supersededBy. Public documents through the anon client with a public cache. Owner
// branch (spec §8.2): a licensed/private document is returned only to its owner's session, read with
// the service client, audited before it is returned ('private, no-store'; audit failure → 500).
// Everyone else gets the same 404 as for a missing id.
import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,failureResponse,paramErrorResponse} from '@/lib/facts/public-route';
import {auditFailedResponse,cacheHeadersFor,cursorParam,isCursorError,strictParams,docDetail,notFound,ownerDocumentView,ownerReadDeps,publicDocs,sessionUserId} from '@/lib/documents/read-route';
import {OwnerAuditError,readOwnedDocument} from '@/lib/documents/upload';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const now=new Date();
 const {id}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
 let extractionsCursor:string|null;
 try{extractionsCursor=cursorParam(strictParams(new URL(req.url),['extractionsCursor']),'extractionsCursor','timestamp_uuid');}catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {db}=publicDocs();
  const row=await db.documentById(id);
  if(row&&row.permission==='public')return NextResponse.json(await docDetail(db,row,extractionsCursor),{headers:cacheHeadersFor('public',undefined,now)});
  const userId=await sessionUserId();
  if(userId){
   const deps=ownerReadDeps();
   const owned=await readOwnedDocument(deps,{documentId:id,requester:userId,route:'documents/doc',load:async d=>({...await docDetail(deps.db,d,extractionsCursor),document:ownerDocumentView(d)})});
   if(owned)return NextResponse.json(owned.data,{headers:cacheHeadersFor('private',undefined,now)});
  }
  return notFound();
 }catch(e){
  if(e instanceof OwnerAuditError)return auditFailedResponse();
  if(isCursorError(e))return errorResponse('invalid_parameter:extractionsCursor','invalid extractionsCursor',400);
  return failureResponse(e,'documents/doc','document read failed');
 }
}
