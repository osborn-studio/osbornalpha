// src/app/api/macro/analyses/route.ts
// POST: create one append-only correlation run (spec §7, §8, §0.2 M18/M22/N1). A session is required. The server
// reads complete histories at the cutoff (truncated → 422, nothing computed), freezes inputs, computes, and writes
// through create_macro_analysis_run with the verified session user id. That RPC is service-only, idempotent by
// request_id, and enforces the per-plan quota counting ok runs only. No verifiable code version (resolveCodeVersion()
// null, as the cron route) → 503 code_version_unavailable before anything is read, computed or stored (第 4 稿 P1-10):
// a run must be replayable against the exact code that produced it.
import {NextResponse} from 'next/server';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {freezeInputs,inputsHash,validateAnalysisRequest} from '@/lib/macro/analysis-spec';
import {CATALOG_VERSION} from '@/lib/macro/catalog';
import {AnalysisError,CORRELATION_VERSION,runAnalysis,type AnalysisResult,type FrozenInputs} from '@/lib/macro/correlation';
import {MacroDbError,supabaseMacroDb} from '@/lib/macro/db';
import {US_TARGET_LOWER_ID,US_TARGET_UPPER_ID,derivePolicyEvents,type PolicyEvent} from '@/lib/macro/events';
import {explainResult} from '@/lib/macro/explain';
import {requireSessionUser} from '@/lib/macro/route-helpers';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {getAnonSupabase} from '@/lib/supabase/anon';
export const dynamic='force-dynamic';
const MONTHLY_MAX_ROWS=5_000,DAILY_MAX_ROWS=20_000;
const HEADERS={'Cache-Control':'private, no-store'};
const err=(code:string,message:string,status:number,extra:Record<string,unknown>={})=>NextResponse.json({error:{code,message,...(extra.fields?{fields:extra.fields}:{})},...(extra.runId?{runId:extra.runId}:{})},{status,headers:HEADERS});
/** create_macro_analysis_run is not in Database['public']['Functions'] (skeleton: narrow typing); one cast, here. */
type RunRpc=(fn:'create_macro_analysis_run',args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>;
/** null when no verifiable code version exists (no 40-hex VERCEL_GIT_COMMIT_SHA in production; no git elsewhere). */
function codeVersion():string|null{try{return resolveCodeVersion({allowGit:process.env.NODE_ENV!=='production'});}catch{return null;}}
export async function POST(req:Request){
 const auth=await requireSessionUser();if(!auth.ok)return auth.response;   // 401 {error:{code:'unauthenticated'}}
 const {user}=auth;
 let body:unknown;
 try{body=await req.json();}catch{return err('invalid_parameter','body must be JSON',400,{fields:[{field:'body',code:'json'}]});}
 const v=validateAnalysisRequest(body);
 if(!v.ok)return err('invalid_parameter','invalid analysis request',400,{fields:v.errors});
 const {spec,indicator,asset}=v;
 const cv=codeVersion();
 if(!cv)return err('code_version_unavailable','no verifiable code version; analysis not run',503);
 const cutoff=new Date().toISOString();
 let admin:ReturnType<typeof getAdminSupabase>;let inputs:FrozenInputs;
 try{
  admin=getAdminSupabase();
  const db=supabaseMacroDb({admin,anon:getAnonSupabase()});
  const read=(id:string,maxRows:number)=>db.seriesHistory(id,{asOf:cutoff,maxRows});
  const [indRows,assetRows]=await Promise.all([read(indicator.aliasOf??indicator.id,MONTHLY_MAX_ROWS),read(asset.aliasOf??asset.id,MONTHLY_MAX_ROWS)]);
  let events:PolicyEvent[]|undefined;
  if(spec.kind==='event_window'){
   const [u,l]=await Promise.all([read(US_TARGET_UPPER_ID,DAILY_MAX_ROWS),read(US_TARGET_LOWER_ID,DAILY_MAX_ROWS)]);
   events=derivePolicyEvents(u,l);
  }
  inputs=freezeInputs({indicator,asset,indicatorRows:indRows,assetRows,events,cutoff,catalogVersion:CATALOG_VERSION});
 }catch(e){
  if(e instanceof MacroDbError&&e.code==='truncated')return err('input_truncated','input history exceeds the read limit; nothing computed',422);
  return err('read_failed','macro inputs could not be read',503);
 }
 let results:(AnalysisResult&{explanation:{zh:string;en:string}})|null=null;let failure:AnalysisError|null=null;
 try{const r=runAnalysis(spec,inputs,cv);results={...r,explanation:explainResult(r,{indicator:indicator.name,asset:asset.name})};}
 catch(e){if(e instanceof AnalysisError)failure=e;else throw e;}
 const {data,error}=await (admin.rpc as unknown as RunRpc).call(admin,'create_macro_analysis_run',{
  p_user_id:user.id,p_request_id:spec.request_id,p_kind:spec.kind,p_spec:spec,p_inputs:inputs,p_inputs_hash:inputsHash(inputs),
  p_results:results,p_code_version:cv,p_method_version:CORRELATION_VERSION,p_status:failure?'failed':'ok',p_error:failure?`${failure.code}: ${failure.message}`:null,
 });
 if(error)return /quota_exceeded/.test(error.message)?err('quota_exceeded','daily analysis quota reached',429):err('write_failed','analysis run could not be stored',503);
 const runId=typeof data==='string'?data:(data as {run_id?:string}|null)?.run_id;
 if(!runId)return err('write_failed','analysis run id missing',503);
 if(failure)return err(failure.code,failure.message,400,{runId});
 return NextResponse.json({runId},{status:201,headers:HEADERS});
}
