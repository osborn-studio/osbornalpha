// src/app/api/macro/strategy/policy-response/route.ts
// GET /api/macro/strategy/policy-response?window=1|3|6 (default 3; spec §8, §5.3): shared-cached view, one frozen policy_response manifest per
// window (N is in its params) → the Fed policy → US/CN asset response matrix for that window.
import {NextResponse} from 'next/server';
import {policyResponseFacts} from '@/lib/macro/strategy/fact-views';
import {canCacheFacts,factView,memoKey,readMemoState} from '@/lib/macro/strategy/memo';
import {memoHeaders,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,strategyDb,windowOf} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const window=windowOf(readParams(new URL(req.url),['window']).get('window'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const {port}=g;
  const state=await readMemoState(port);
  const db=strategyDb();
  const {value,outcome,source}=await factView(canCacheFacts(state)?memoKey({kind:'policy_response',params:{window},state,codeVersion}):'',state,
   ()=>policyResponseFacts({port,db,codeVersion,state,now:()=>new Date()},window),undefined,db);
  return NextResponse.json(value.view,{headers:memoHeaders(outcome,source)});
 }catch(e){return failureResponse(e);}
}
