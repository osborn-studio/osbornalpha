// src/app/api/citations/[id]/route.ts
// One citation (spec §4.5, §9): snippet, offsets (code points), bbox, integrity (page text hash and
// slice re-checked), currentExtraction, creator and the document summary. Visible to anon only when
// RLS shows it (public document and: visibility public, or cited by an ok fact), with a public cache.
// A citation of a licensed/private document is returned only to the document's owner (service read,
// audited with citation_id before it is returned; private, no-store). Everyone else: 404.
import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,failureResponse,paramErrorResponse} from '@/lib/facts/public-route';
import {strictParams,auditFailedResponse,cacheHeadersFor,notFound,ownerReadDeps,publicDocs,sessionUserId} from '@/lib/documents/read-route';
import {citationView} from '@/lib/documents/citations';
import {OwnerAuditError,readOwnedDocument} from '@/lib/documents/upload';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const now=new Date();
 const {id}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
 try{strictParams(new URL(req.url),[]);}catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {db}=publicDocs();
  const c=await db.citationById(id);
  const pubDoc=c?await db.documentById(c.document_id):null;
  if(c&&pubDoc&&pubDoc.permission==='public'){
   const view=await citationView(db,c);
   if(view)return NextResponse.json(view,{headers:cacheHeadersFor('public',undefined,now)});
  }
  const userId=await sessionUserId();
  if(userId){
   const deps=ownerReadDeps();
   const own=await deps.db.citationById(id);
   if(own){
    const owned=await readOwnedDocument(deps,{documentId:own.document_id,requester:userId,route:'citations',citationId:id,load:()=>citationView(deps.db,own)});
    if(owned)return NextResponse.json(owned.data,{headers:cacheHeadersFor('private',undefined,now)});
   }
  }
  return notFound();
 }catch(e){
  if(e instanceof OwnerAuditError)return auditFailedResponse();
  return failureResponse(e,'citations','citation read failed');
 }
}
