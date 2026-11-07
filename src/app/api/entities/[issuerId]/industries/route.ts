// src/app/api/entities/[issuerId]/industries/route.ts
// GET /api/entities/[issuerId]/industries (spec §7.3, §9): the issuer's industries on `on`, public
// schemes only (the anon RLS gate hides the rest), plus which schemes are public so the stock page can
// say "licence pending" instead of guessing. Unknown issuer → 404 unknown_issuer.
import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,paramErrorResponse,readParams,successHeaders,utcDate} from '@/lib/facts/public-route';
import {publicReadDeps} from '@/lib/industry/public-deps';
import {issuerIndustriesView} from '@/lib/industry/read';
import {onOf} from '@/lib/industry/route-params';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{issuerId:string}>}){
 const now=new Date();const today=utcDate(now);
 const {issuerId}=await params;
 if(!UUID_RE.test(issuerId))return errorResponse('invalid_parameter:issuerId','issuerId must be a uuid',400);
 let on:string;
 try{on=onOf(readParams(new URL(req.url),['on']),today);}
 catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const v=await issuerIndustriesView(publicReadDeps(now),{issuerId:issuerId.toLowerCase(),on});
  if(v.state==='unknown_issuer')return errorResponse('unknown_issuer','no such issuer',404);
  return NextResponse.json(v,{headers:successHeaders(now,on,v.industries.length===0)});
 }catch(e){
  console.error('[entities/industries]',e instanceof Error?e.message:e);
  return errorResponse('internal','industries read failed',500);
 }
}
