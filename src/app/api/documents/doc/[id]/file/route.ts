// src/app/api/documents/doc/[id]/file/route.ts
// Our copy of a document (spec §8.1, §9): signed-in users only (401 unauthenticated otherwise), a
// signed URL valid 300 s for the browser's immediate download; private, no-store. Public documents
// for any signed-in user; a licensed/private document only for its owner, the URL issued and the
// read audited (signed_url_issued) before it is returned (audit failure → 500, no URL). Everyone
// else: 404.
import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,failureResponse} from '@/lib/facts/public-route';
import {PRIVATE_HEADERS,SIGNED_URL_SECONDS,auditFailedResponse,notFound,ownerReadDeps,publicDocs,serviceStore,sessionUserId} from '@/lib/documents/read-route';
import {OwnerAuditError,readOwnedDocument} from '@/lib/documents/upload';
import type {DocumentRow} from '@/lib/documents/types';

export const dynamic='force-dynamic';

async function signed(row:DocumentRow){
 const issued=Date.now();
 const url=await serviceStore().signedUrl(row.storage_path,SIGNED_URL_SECONDS);
 return {url,expiresAt:new Date(issued+SIGNED_URL_SECONDS*1000).toISOString()};
}

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
 try{
  const userId=await sessionUserId();
  if(!userId)return errorResponse('unauthenticated','sign in required',401);
  const {db}=publicDocs();
  const row=await db.documentById(id);
  if(row&&row.permission==='public')return NextResponse.json(await signed(row),{headers:{...PRIVATE_HEADERS}});
  const owned=await readOwnedDocument(ownerReadDeps(),{documentId:id,requester:userId,route:'documents/file',signedUrlIssued:true,load:signed});
  if(owned)return NextResponse.json(owned.data,{headers:{...PRIVATE_HEADERS}});
  return notFound();
 }catch(e){
  if(e instanceof OwnerAuditError)return auditFailedResponse();
  return failureResponse(e,'documents/file','file link failed');
 }
}
