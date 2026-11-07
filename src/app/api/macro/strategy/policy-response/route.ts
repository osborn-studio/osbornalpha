// src/app/api/macro/strategy/policy-response/route.ts
// GET /api/macro/strategy/policy-response?window=1|3|6 (default 3; spec §8, §5.3): one frozen policy_response manifest per
// window (N is in its params) → the Fed policy → US/CN asset response matrix for that window.
import {NextResponse} from 'next/server';
import {buildPolicyResponse,buildPolicyResponseManifest} from '@/lib/macro/strategy/policy-response';
import {READ_HEADERS,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,strategyDb,windowOf} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const window=windowOf(readParams(new URL(req.url),['window']).get('window'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const stored=await strategyDb(g.session).putManifest(await buildPolicyResponseManifest(g.port,{now:new Date(),codeVersion,window}));
  return NextResponse.json(buildPolicyResponse(stored),{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
