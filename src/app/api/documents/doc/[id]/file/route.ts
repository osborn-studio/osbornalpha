// src/app/api/documents/doc/[id]/file/route.ts
// Our copy of a document (spec §8.1, §9): signed-in users only (401 unauthenticated otherwise), a
// signed URL valid 300 s for the browser's immediate download; private, no-store. Public documents
// here; licensed/private documents are 404 for non-owners (owner branch: Task 12).
import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,failureResponse} from '@/lib/facts/public-route';
import {PRIVATE_HEADERS,SIGNED_URL_SECONDS,notFound,publicDocs,serviceStore,sessionUserId} from '@/lib/documents/read-route';

export const dynamic='force-dynamic';

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
 try{
  const userId=await sessionUserId();
  if(!userId)return errorResponse('unauthenticated','sign in required',401);
  const {db}=publicDocs();
  const row=await db.documentById(id);
  if(row&&row.permission==='public'){
   const issued=Date.now();
   const url=await serviceStore().signedUrl(row.storage_path,SIGNED_URL_SECONDS);
   return NextResponse.json({url,expiresAt:new Date(issued+SIGNED_URL_SECONDS*1000).toISOString()},{headers:{...PRIVATE_HEADERS}});
  }
  return notFound();   // owner branch: Task 12
 }catch(e){return failureResponse(e,'documents/file','file link failed');}
}
