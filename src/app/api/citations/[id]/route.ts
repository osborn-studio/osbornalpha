// src/app/api/citations/[id]/route.ts
// One citation (spec §4.5, §9): snippet, offsets (code points), bbox, integrity (page text hash and
// slice re-checked), currentExtraction, creator and the document summary. Visible to anon only when
// RLS shows it (public document and: visibility public, or cited by an ok fact); otherwise 404
// (the owner branch for licensed/private documents is added by Task 12).
import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,failureResponse} from '@/lib/facts/public-route';
import {cacheHeadersFor,notFound,publicDocs} from '@/lib/documents/read-route';
import {citationView} from '@/lib/documents/citations';

export const dynamic='force-dynamic';

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const now=new Date();
 const {id}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
 try{
  const {db}=publicDocs();
  const c=await db.citationById(id);
  if(c){
   const view=await citationView(db,c);
   if(view)return NextResponse.json(view,{headers:cacheHeadersFor('public',undefined,now)});
  }
  return notFound();   // owner branch: Task 12
 }catch(e){return failureResponse(e,'citations','citation read failed');}
}
