// src/app/api/macro/strategy/reviews/[region]/[month]/route.ts
// GET /api/macro/strategy/reviews/<US|CN>/<YYYY-MM> (spec §8, §6.2): the result the current pointer names, its
// generation and the frozen catalog names of its manifest (fact sentence templates). The judgment section is read at
// view time and never stored: the F4 card known at the review cutoff date (the 3rd of the next month; view=as_known) as a number-free summary
// (selectF4Mark's summary; no snapshot binding here). No pointer → 404 review_not_found.
import {NextResponse} from 'next/server';
import {selectF4Mark} from '@/lib/macro/strategy/playbooks';
import {READ_HEADERS,errorResponse,failureResponse,judgmentSection,monthOf,readGate,readParams,regionOf,reviewAsOfDate,strategyDb,type ReviewDetailResponse} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{region:string;month:string}>}){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  readParams(new URL(req.url),[]);
  const raw=await params;
  const region=regionOf(raw.region),month=monthOf(raw.month);
  const db=strategyDb(g.session);
  const current=await db.reviewCurrent(region,month);
  if(!current)return errorResponse('review_not_found','no review for this month',404);
  const manifest=await db.manifest(current.result.manifest_id);
  const j=await judgmentSection(async f4=>{
   const card=await f4.latestRegimeCard(region,{asOf:reviewAsOfDate(month)});
   if(!card)return null;
   const m=selectF4Mark({card,detail:await f4.judgmentDetail(card.judgment_id),snapshotId:null});
   return m?{summary:m.summary}:null;
  });
  const body:ReviewDetailResponse={result:current.result,manifest_id:current.result.manifest_id,generation:current.generation,
   names:(manifest?.body.catalog??[]).map(d=>({id:d.id,name:d.name})),judgment_status:j.judgment_status,...(j.judgment_status==='ok'?{f4:j.value}:{})};
  return NextResponse.json(body,{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
