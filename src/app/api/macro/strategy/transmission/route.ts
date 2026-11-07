// src/app/api/macro/strategy/transmission/route.ts
// GET /api/macro/strategy/transmission?region=US|CN (spec §8, §5.1, §5.2, §9.1): one frozen transmission manifest
// (buildTransmissionManifest → putManifest, idempotent by hash; the region is frozen in its params) feeds the flow and
// the playbooks. Always 200 once the
// facts are available, with judgment_status; f4 {mark, summary} (selectF4Mark) only when 'ok'. With the judgment layer
// off nothing reaches F4 and the body has no f4 key. Neither region has an active snapshot → 404 no_published_snapshot.
import {NextResponse} from 'next/server';
import type {TransmissionResponse} from '@/lib/macro/strategy/contract';
import {buildPlaybooks,selectF4Mark} from '@/lib/macro/strategy/playbooks';
import {READ_HEADERS,codeVersionOrNull,errorResponse,failureResponse,judgmentSection,readGate,readParams,regionOf,strategyDb} from '@/lib/macro/strategy/route-helpers';
import {buildTransmission,buildTransmissionManifest} from '@/lib/macro/strategy/transmission';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const region=regionOf(readParams(new URL(req.url),['region']).get('region'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const body=await buildTransmissionManifest(g.port,{now:new Date(),codeVersion,region});
  if(!body)return errorResponse('no_published_snapshot','no published snapshot yet',404);
  const stored=await strategyDb(g.session).putManifest(body);
  const transmission=buildTransmission(stored);
  const playbooks=buildPlaybooks(stored.body,region);
  const j=await judgmentSection(async f4=>{
   const card=await f4.latestRegimeCard(region);
   if(!card)return null;
   return selectF4Mark({card,detail:await f4.judgmentDetail(card.judgment_id),snapshotId:stored.body.snapshots[region]?.snapshot_id??null});
  });
  const out:TransmissionResponse=j.judgment_status==='ok'
   ?{transmission,playbooks,judgment_status:'ok',f4:j.value}
   :{transmission,playbooks,judgment_status:j.judgment_status};
  return NextResponse.json(out,{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
