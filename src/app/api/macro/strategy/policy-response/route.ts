// src/app/api/macro/strategy/policy-response/route.ts
// GET /api/macro/strategy/policy-response?window=1|3|6 (default 3; spec §8, §5.3): process-memoized view, one frozen policy_response manifest per
// window (N is in its params) → the Fed policy → US/CN asset response matrix for that window.
import {NextResponse} from 'next/server';
import {buildPolicyResponse,buildPolicyResponseManifest} from '@/lib/macro/strategy/policy-response';
import {memoKey,readMemoState,strategyMemo} from '@/lib/macro/strategy/memo';
import {memoHeaders,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,strategyDb,windowOf} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const window=windowOf(readParams(new URL(req.url),['window']).get('window'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const state=await readMemoState(g.port);
  const compute=async()=>{
   const stored=await strategyDb(g.session).putManifest(await buildPolicyResponseManifest(g.port,{now:new Date(),codeVersion,window,snapshots:state.snapshots}));
   return {manifest_id:stored.manifest_id,view:buildPolicyResponse(stored)};
  };
  const replayable=state.snapshots.US!==null||state.snapshots.CN!==null;
  const {value,outcome}=replayable
   ?await strategyMemo.getOrCompute(memoKey({kind:'policy_response',params:{window},state,codeVersion}),compute)
   :{value:await compute(),outcome:'miss' as const};
  return NextResponse.json(value.view,{headers:memoHeaders(outcome)});
 }catch(e){return failureResponse(e);}
}
