// src/app/api/broker-research/reports/[reportId]/route.ts
// GET /api/broker-research/reports/[reportId] (spec §8.1): one public report with citations, snippets,
// summaries, public analysts, licence flags and settlement (null until F4). Not public → 404.
import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,failureResponse} from '@/lib/facts/public-route';
import {anonPublicDeps,getPublicReport} from '@/lib/broker-research/public-read';

export const dynamic='force-dynamic';

export async function GET(_req:Request,{params}:{params:Promise<{reportId:string}>}){
 const {reportId}=await params;
 if(!UUID_RE.test(reportId))return errorResponse('invalid_parameter:reportId','invalid reportId',400);
 try{
  const report=await getPublicReport(anonPublicDeps(),reportId.toLowerCase());
  if(!report)return errorResponse('not_found','report not found',404);
  return NextResponse.json(report,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/report','report unavailable');}
}
