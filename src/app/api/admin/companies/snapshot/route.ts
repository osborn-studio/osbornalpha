// src/app/api/admin/companies/snapshot/route.ts
// Admin snapshot download (spec §6.4): any source (incl. Tushare), requireAdminUser, audited in
// research_audit_log ('facts.snapshot.download') BEFORE a URL is minted (fail closed), private, no-store.
import {productionReadDeps} from '@/lib/company/deps';
import {adminGate,privateResponse} from '@/lib/company/route';
import {UUID_RE,errorResponse,failureResponse,paramErrorResponse,readParams} from '@/lib/facts/public-route';

export const dynamic='force-dynamic';
export async function GET(req:Request){
 const user=await adminGate();if(user instanceof Response)return privateResponse(user);
 let fact:string|undefined;
 try{fact=readParams(new URL(req.url),['fact']).get('fact');}catch(e){const r=paramErrorResponse(e);if(r)return privateResponse(r);throw e;}
 if(!fact||!UUID_RE.test(fact))return privateResponse(errorResponse('invalid_parameter:fact','invalid fact id',400));
 try{
  const deps=productionReadDeps();
  const rec=(await deps.company.evidenceOf([fact])).get(fact);
  if(!rec)return privateResponse(errorResponse('not_found','no verified snapshot for fact',404));
  await deps.audit(user,'facts.snapshot.download',fact,{source:rec.source,path:rec.snapshot_path,sha256:rec.snapshot_sha256});
  const url=await deps.signSnapshot(rec.snapshot_path,60);
  return privateResponse(new Response(null,{status:302,headers:{Location:url}}));
 }catch(e){return privateResponse(failureResponse(e,'admin/companies/snapshot','snapshot download failed'));}
}
