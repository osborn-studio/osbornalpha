// src/app/api/documents/doc/[id]/pages/[n]/route.ts
// One page of one extraction (spec §9): `extraction` (default: the document's current extraction;
// must belong to the document), `layout=1` adds lines and tables from pages.json (read from the
// private bucket by the server and hash-checked). Public documents with a public cache; the owner of
// a licensed/private document through the audited owner branch (spec §8.2, private, no-store).
import {NextResponse} from 'next/server';
import {QueryError,UUID_RE,errorResponse,failureResponse,flagParam,paramErrorResponse} from '@/lib/facts/public-route';
import {strictParams,auditFailedResponse,cacheHeadersFor,notFound,ownerReadDeps,pageDetail,publicDocs,serviceStore,sessionUserId} from '@/lib/documents/read-route';
import {OwnerAuditError,readOwnedDocument} from '@/lib/documents/upload';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{id:string;n:string}>}){
 const now=new Date();
 const {id,n}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
 if(!/^[1-9]\d{0,5}$/.test(n))return errorResponse('invalid_parameter:n','invalid page number',400);
 const pageNo=Number(n);
 let extraction:string|null,layout:boolean;
 try{
  const p=strictParams(new URL(req.url),['extraction','layout']);
  extraction=p.get('extraction')??null;
  if(extraction!==null&&!UUID_RE.test(extraction))throw new QueryError('extraction');
  layout=flagParam(p,'layout');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {db}=publicDocs();
  const row=await db.documentById(id);
  if(row&&row.permission==='public'){
   const body=await pageDetail(db,serviceStore(),row,pageNo,extraction,layout);
   return body?NextResponse.json(body,{headers:cacheHeadersFor('public',undefined,now)}):notFound();
  }
  const userId=await sessionUserId();
  if(userId){
   const deps=ownerReadDeps();
   const owned=await readOwnedDocument(deps,{documentId:id,requester:userId,route:'documents/page',pageNo,load:d=>pageDetail(deps.db,serviceStore(),d,pageNo,extraction,layout)});
   if(owned)return NextResponse.json(owned.data,{headers:cacheHeadersFor('private',undefined,now)});
  }
  return notFound();
 }catch(e){
  if(e instanceof OwnerAuditError)return auditFailedResponse();
  return failureResponse(e,'documents/page','page read failed');
 }
}
