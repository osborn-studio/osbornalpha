// src/app/api/macro/strategy/transmission/route.ts
// GET /api/macro/strategy/transmission?region=US|CN (spec §8, §5.1, §5.2, §9.1): shared-cached facts, fresh judgment section, one frozen transmission manifest
// (buildTransmissionManifest → putManifest, idempotent by hash; the region is frozen in its params) feeds the flow and
// the playbooks. Always 200 once the
// facts are available, with judgment_status; f4 {mark, summary} (selectF4Mark) only when 'ok'. With the judgment layer
// off nothing reaches F4 and the body has no f4 key. Neither region has an active snapshot → 404 no_published_snapshot.
import {NextResponse} from 'next/server';
import type {TransmissionResponse} from '@/lib/macro/strategy/contract';
import {buildPlaybooks,selectF4Mark} from '@/lib/macro/strategy/playbooks';
import {canCacheFacts,factView,memoKey,readMemoState} from '@/lib/macro/strategy/memo';
import {memoHeaders,codeVersionOrNull,errorResponse,failureResponse,judgmentSection,readGate,readParams,regionOf,strategyDb} from '@/lib/macro/strategy/route-helpers';
import {buildTransmission,buildTransmissionManifest} from '@/lib/macro/strategy/transmission';

export const dynamic='force-dynamic';
class NoPublishedSnapshot extends Error{}

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const region=regionOf(readParams(new URL(req.url),['region']).get('region'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const {port}=g;
  const state=await readMemoState(port);
  if(state.snapshots.US===null&&state.snapshots.CN===null)throw new NoPublishedSnapshot();
  const {value,outcome}=await factView(canCacheFacts(state)?memoKey({kind:'transmission',params:{region},state,codeVersion}):'',state,async()=>{
   const body=await buildTransmissionManifest(port,{now:new Date(),codeVersion,region,snapshots:state.snapshots});
   if(!body)throw new NoPublishedSnapshot();
   const stored=await strategyDb().putManifest(body);
   return {manifest_id:stored.manifest_id,transmission:buildTransmission(stored),playbooks:buildPlaybooks(stored.body,region),snapshotId:stored.body.snapshots[region]?.snapshot_id??null};
  });
  const {transmission,playbooks,snapshotId}=value;
  const j=await judgmentSection(async f4=>{
   const card=await f4.latestRegimeCard(region);
   if(!card)return null;
   return selectF4Mark({card,detail:await f4.judgmentDetail(card.judgment_id),snapshotId});
  });
  const out:TransmissionResponse=j.judgment_status==='ok'
   ?{transmission,playbooks,judgment_status:'ok',f4:j.value}
   :{transmission,playbooks,judgment_status:j.judgment_status};
  return NextResponse.json(out,{headers:memoHeaders(outcome)});
 }catch(e){if(e instanceof NoPublishedSnapshot)return errorResponse('no_published_snapshot','no published snapshot yet',404);return failureResponse(e);}
}
