import {NextResponse} from 'next/server';
import {UUID_RE,asOfParam,utcDate,errorResponse,failureResponse,paramErrorResponse} from '@/lib/facts/public-route';
import {cacheHeadersFor,strictParams} from '@/lib/documents/read-route';
import {resolveFilingDocument} from '@/lib/documents/by-filing';

export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{filingId:string}>}){
 const {filingId}=await params;
 if(!UUID_RE.test(filingId))return errorResponse('invalid_parameter:filingId','invalid filingId',400);
 let asOf:string;
 try{asOf=asOfParam(strictParams(new URL(req.url),['asOf']),utcDate(new Date()));}catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const result=await resolveFilingDocument(filingId,asOf);
  if(!result)return errorResponse('not_found','filing not found',404);
  // Anon RLS cannot disclose whether a private document exists: that case is not_found.
  return NextResponse.json(result,{headers:cacheHeadersFor(result.document?'public':'empty',asOf,new Date())});
 }catch(e){return failureResponse(e,'documents/by-filing','filing document read failed');}
}
