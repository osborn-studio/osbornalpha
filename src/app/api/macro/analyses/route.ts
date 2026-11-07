// src/app/api/macro/analyses/route.ts
// POST: create one append-only correlation run (spec §7, §8, §0.2 M18/M22/N1). A session is required. The server
// reads complete histories at the cutoff (truncated → 422, nothing computed), freezes inputs, computes, and writes
// through create_macro_analysis_run with the verified session user id. That RPC is service-only, idempotent by
// request_id, and enforces the per-plan quota counting ok runs only. No verifiable code version (resolveCodeVersion()
// null, as the cron route) → 503 code_version_unavailable before anything is read, computed or stored (第 4 稿 P1-10):
// a run must be replayable against the exact code that produced it.
// Idempotency (M22): before anything is read, (session user, request_id) is looked up through the user's own server
// client (RLS: own rows). Same canonical spec → the stored outcome is returned (201 + runId for ok; the stored error
// code/status for failed) even if new data arrived or reads are failing; a different spec → 409 request_conflict.
// After the RPC the returned run's persisted status/error is re-read and the response is built from that, so
// concurrent retries all report the one stored outcome. Known limitation: failed runs are not quota-counted (the RPC
// counts ok runs only); abuse is bounded by request validation and the per-request_id idempotency above.
import {NextResponse} from 'next/server';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {canonicalJson,freezeInputs,inputsHash,validateAnalysisRequest} from '@/lib/macro/analysis-spec';
import {CATALOG_VERSION} from '@/lib/macro/catalog';
import {AnalysisError,CORRELATION_VERSION,runAnalysis,type AnalysisResult,type FrozenInputs} from '@/lib/macro/correlation';
import {MacroDbError,supabaseMacroDb} from '@/lib/macro/db';
import {US_TARGET_LOWER_ID,US_TARGET_UPPER_ID,derivePolicyEvents,type PolicyEvent} from '@/lib/macro/events';
import {explainResult} from '@/lib/macro/explain';
import {requireSessionUser} from '@/lib/macro/route-helpers';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {getAnonSupabase} from '@/lib/supabase/anon';
import {getServerSupabase} from '@/lib/supabase/server';
import type {SupabaseClient} from '@supabase/supabase-js';
export const dynamic='force-dynamic';
const MONTHLY_MAX_ROWS=5_000,DAILY_MAX_ROWS=20_000;
const HEADERS={'Cache-Control':'private, no-store'};
const err=(code:string,message:string,status:number,extra:Record<string,unknown>={})=>NextResponse.json({error:{code,message,...(extra.fields?{fields:extra.fields}:{})},...(extra.runId?{runId:extra.runId}:{})},{status,headers:HEADERS});
/** create_macro_analysis_run is not in Database['public']['Functions'] (skeleton: narrow typing); one cast, here. */
type RunRpc=(fn:'create_macro_analysis_run',args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>;
interface RunRow{run_id:string;spec:unknown;status:string;error:string|null}
/** Own run by request_id or run_id through the user's client (RLS). null: none; undefined: the read failed. */
async function findRun(userId:string,col:'request_id'|'run_id',val:string):Promise<RunRow|null|undefined>{
 try{
  const supabase=await getServerSupabase();
  const {data,error}=await (supabase as unknown as SupabaseClient).from('macro_analysis_runs').select('run_id,spec,status,error').eq('user_id',userId).eq(col,val).maybeSingle();
  if(error)return undefined;
  return (data as RunRow|null)??null;
 }catch{return undefined;}
}
/** The response for a stored run: ok → 201; failed → its stored code ('code: message') with 422 for input errors, else 400. */
function respondStored(run:RunRow){
 if(run.status==='ok')return NextResponse.json({runId:run.run_id},{status:201,headers:HEADERS});
 const m=/^([a-z_]+): ?([\s\S]*)$/.exec(run.error??'');
 const code=m?.[1]??'analysis_failed';
 return err(code,m?.[2]||'analysis failed',code==='analysis_input_invalid'?422:400,{runId:run.run_id});
}
const sameSpec=(stored:unknown,spec:unknown)=>{try{return canonicalJson(stored)===canonicalJson(spec);}catch{return false;}};
const conflict=()=>err('request_conflict','request_id was already used with a different analysis request',409);
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
 const existing=await findRun(user.id,'request_id',spec.request_id);
 if(existing)return sameSpec(existing.spec,spec)?respondStored(existing):conflict();
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
 catch(e){
  if(e instanceof AnalysisError)failure=e;
  else{console.error('[macro] analysis input invalid',e instanceof Error?e.message:String(e));failure=new AnalysisError('analysis_input_invalid','analysis inputs could not be computed');}
 }
 const {data,error}=await (admin.rpc as unknown as RunRpc).call(admin,'create_macro_analysis_run',{
  p_user_id:user.id,p_request_id:spec.request_id,p_kind:spec.kind,p_spec:spec,p_inputs:inputs,p_inputs_hash:inputsHash(inputs),
  p_results:results,p_code_version:cv,p_method_version:CORRELATION_VERSION,p_status:failure?'failed':'ok',p_error:failure?`${failure.code}: ${failure.message}`:null,
 });
 if(error)return /quota_exceeded/.test(error.message)?err('quota_exceeded','daily analysis quota reached',429):err('write_failed','analysis run could not be stored',503);
 const runId=typeof data==='string'?data:(data as {run_id?:string}|null)?.run_id;
 if(!runId)return err('write_failed','analysis run id missing',503);
 // The RPC returns the original run on a retry: respond from what is persisted, not from this attempt.
 const stored=await findRun(user.id,'run_id',runId);
 if(stored){return sameSpec(stored.spec,spec)?respondStored(stored):conflict();}
 if(failure)return err(failure.code,failure.message,failure.code==='analysis_input_invalid'?422:400,{runId});
 return NextResponse.json({runId},{status:201,headers:HEADERS});
}
