// src/app/api/documents/doc/[id]/route.ts
// One document (spec §9): metadata, assets, extractions (cursor `extractionsCursor`, 100 per page),
// supersedes / supersededBy. Public documents through the anon client with a public cache; any other
// id is 404 (the owner branch for licensed/private documents is added by Task 12).
import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,failureResponse,paramErrorResponse,readParams} from '@/lib/facts/public-route';
import {cacheHeadersFor,cursorParam,docDetail,notFound,publicDocs} from '@/lib/documents/read-route';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const now=new Date();
 const {id}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
 let extractionsCursor:string|null;
 try{extractionsCursor=cursorParam(readParams(new URL(req.url),['extractionsCursor']),'extractionsCursor');}catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {db}=publicDocs();
  const row=await db.documentById(id);
  if(row&&row.permission==='public')return NextResponse.json(await docDetail(db,row,extractionsCursor),{headers:cacheHeadersFor('public',undefined,now)});
  return notFound();   // owner branch: Task 12
 }catch(e){return failureResponse(e,'documents/doc','document read failed');}
}
