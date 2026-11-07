// src/app/api/macro/overview/route.ts
// GET /api/macro/overview?region=US|CN|all&compact=1 (spec §8): per-region fact envelopes from the
// active snapshots. Never contains judgment fields (F4 /api/judgments serves those).
import {CATALOG_VERSION} from '@/lib/macro/catalog';
import {enumParam,failureResponse,flagParam,macroRouteDeps,okJson,paramErrorResponse,readParams,requireSessionUser} from '@/lib/macro/route-helpers';
import {overviewEnvelope} from '@/lib/macro/views';
import type {Region} from '@/lib/macro/types';

export const dynamic='force-dynamic';
const PARAMS=['region','compact'] as const;
export async function GET(req:Request){
 const auth=await requireSessionUser();if(!auth.ok)return auth.response;
 let region:Region|'all',compact:boolean;
 try{
  const p=readParams(new URL(req.url),PARAMS);
  region=enumParam(p,'region',['US','CN','all'] as const,'all');
  compact=flagParam(p,'compact');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const deps=macroRouteDeps();
  const today=new Date().toISOString().slice(0,10);
  const regions:Region[]=region==='all'?['US','CN']:[region];
  const envs=await Promise.all(regions.map(r=>overviewEnvelope(deps,r,today,{compact})));
  return okJson({catalogVersion:CATALOG_VERSION,regions:Object.fromEntries(regions.map((r,i)=>[r,envs[i]]))});
 }catch(e){return failureResponse(e,'macro-overview');}
}
