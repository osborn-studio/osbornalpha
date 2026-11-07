// src/app/api/companies/snapshot/route.ts
// Stable public download of an EDGAR snapshot by fact id (spec §0.1 item 2'', §0 #62, §6.4): the evidence
// index gives the exact Storage path; only source 'edgar' (US public data) is served, by a 60 s signed URL
// minted on EVERY call and a 302 with no-store, so cacheable JSON only ever embeds this stable URL.
// Tushare → 403 not_redistributable; no index row → 404.
import {productionReadDeps} from '@/lib/company/deps';
import {UUID_RE,errorResponse,failureResponse,paramErrorResponse,readParams} from '@/lib/facts/public-route';

export const dynamic='force-dynamic';
const SIGNED_URL_SECONDS=60;
export async function GET(req:Request){
 let raw:string|undefined;
 try{raw=readParams(new URL(req.url),['fact']).get('fact');}catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 if(!raw||!UUID_RE.test(raw))return errorResponse('invalid_parameter:fact','invalid fact id',400);
 const fact=raw.toLowerCase();
 try{
  const deps=productionReadDeps();
  const rec=(await deps.company.evidenceOf([fact])).get(fact);
  if(!rec)return errorResponse('not_found','no verified snapshot for fact',404);
  if(rec.source!=='edgar')return errorResponse('not_redistributable','source terms forbid redistribution',403);
  const url=await deps.signSnapshot(rec.snapshot_path,SIGNED_URL_SECONDS);
  return new Response(null,{status:302,headers:{Location:url,'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'companies/snapshot','snapshot download failed');}
}
