// src/app/api/broker-research/institutions/route.ts
// GET /api/broker-research/institutions (spec §8.1): institutions with at least one visible report,
// per-institution counts (report_count / last_published_date / last_available_at straight from
// research_institutions_public_v) and the library totals summed from them. None → 404 not_found.
import {NextResponse} from 'next/server';
import {errorResponse,failureResponse} from '@/lib/facts/public-route';
import {anonPublicDeps,listPublicInstitutions} from '@/lib/broker-research/public-read';

export const dynamic='force-dynamic';

export async function GET(){
 try{
  const body=await listPublicInstitutions(anonPublicDeps());
  if(body.institutions.length===0)return errorResponse('not_found','no public institutions',404);
  return NextResponse.json(body,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/institutions','institutions unavailable');}
}
