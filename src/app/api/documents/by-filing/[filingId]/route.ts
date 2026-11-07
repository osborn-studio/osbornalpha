import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,failureResponse,paramErrorResponse} from '@/lib/facts/public-route';
import {cacheHeadersFor,strictParams} from '@/lib/documents/read-route';
import {resolveFilingDocument} from '@/lib/documents/by-filing';

export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{filingId:string}>}){
 const {filingId}=await params;
 if(!UUID_RE.test(filingId))return errorResponse('invalid_parameter:filingId','invalid filingId',400);
 try{strictParams(new URL(req.url),[]);}catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const result=await resolveFilingDocument(filingId);
  if(!result)return errorResponse('not_found','filing not found',404);
  return NextResponse.json(result,{headers:cacheHeadersFor(result.document?'public':'empty',undefined,new Date())});
 }catch(e){return failureResponse(e,'documents/by-filing','filing document read failed');}
}
