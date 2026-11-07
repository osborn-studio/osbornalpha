// src/lib/macro/strategy/route-helpers.ts
// HTTP glue for /api/macro/strategy/** and /api/cron/macro-review (spec §8, §9.1). Decision order of every read route:
// session (401 unauthorized) → MACRO_STRATEGY_ENABLED (404 strategy_disabled) → foundation (503
// macro_foundation_unavailable while strategyPort() is null) → parameters (400 invalid_parameter:<name>) → judgment layer.
// POST /explanations stops after the flag: the idempotent replay runs inside handleExplainRequest before its own
// foundation check (spec §6.3 step 2). Combined routes (transmission, review detail) always answer 200 with
// judgment_status; only /deviations answers 404 judgments_disabled / 503 judgments_unavailable. With the judgment layer
// off no F4 client is built. Error bodies are {error:{code,message}} and never carry server messages.
import {NextResponse} from 'next/server';
import type {SupabaseClient} from '@supabase/supabase-js';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {getAnonSupabase} from '@/lib/supabase/anon';
import {getServerSupabase} from '@/lib/supabase/server';
import {resolveCodeVersion} from '@/lib/facts/deps';
import type {Bilingual,Boundary,DeviationCase,F4Summary,JudgmentStatus,Region,ReviewResult,ReviewStatus} from './contract';
import {supabaseStrategyDb,type StrategyDb} from './db';
import {createF4Client,type F4Client} from './f4-client';
import {judgmentsEnabled,strategyEnabled} from './flags';
import {monthCutoff,prevMonth} from './manifest';
import {strategyPort,type StrategyReadPort} from './port';
export const READ_HEADERS={'Cache-Control':'private, max-age=300'};
export const NO_STORE={'Cache-Control':'private, no-store'};
// ---- response shapes shared with the UI (spec §8)
export interface ReviewIndexItem{region:Region;month:string;status:ReviewStatus;generation:number;result_id:string;updated_at:string}
export interface ReviewIndexResponse{items:ReviewIndexItem[]}
/** names = the review manifest's frozen catalog names, for the fact sentence templates (spec §6.3 renderFact). */
export interface ReviewDetailResponse{result:ReviewResult;manifest_id:string;generation:number;names:{id:string;name:Bilingual}[];judgment_status:JudgmentStatus;f4?:{summary:F4Summary}}
export interface DeviationsResponse{cases:DeviationCase[];incomplete:boolean}
export function errorResponse(code:string,message:string,status:number):NextResponse{
 return NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
}
export class ParamError extends Error{constructor(readonly param:string){super(`invalid_parameter:${param}`);this.name='ParamError';}}
export function failureResponse(e:unknown):NextResponse{
 if(e instanceof ParamError)return errorResponse(`invalid_parameter:${e.param}`,'invalid parameter',400);
 return errorResponse('strategy_failed','macro strategy request failed',500);
}
// ---- parameters (whitelist; a repeated or unknown parameter is a 400)
export function readParams(url:URL,allowed:readonly string[]):Map<string,string>{
 const out=new Map<string,string>();
 for(const [k,v] of url.searchParams){if(!allowed.includes(k)||out.has(k))throw new ParamError(k);out.set(k,v);}
 return out;
}
export function regionOf(v:string|undefined,name='region'):Region{if(v==='US'||v==='CN')return v;throw new ParamError(name);}
const MONTH_RE=/^(\d{4})-(0[1-9]|1[0-2])$/;
export function monthOf(v:string|undefined,name='month'):string{if(v!==undefined&&MONTH_RE.test(v)&&v>='2000-01')return v;throw new ParamError(name);}
export function windowOf(v:string|undefined):1|3|6{if(v===undefined)return 3;if(v==='1'||v==='3'||v==='6')return Number(v) as 1|3|6;throw new ParamError('window');}
const BOUNDARIES:readonly Boundary[]=['event_day','first_trading_day','month_end'];
export function boundaryOf(v:string|undefined):Boundary{if(v===undefined)return 'event_day';if((BOUNDARIES as readonly string[]).includes(v))return v as Boundary;throw new ParamError('boundary');}
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidOf(v:string|undefined,name:string):string{if(v!==undefined&&UUID_RE.test(v))return v.toLowerCase();throw new ParamError(name);}
export function subjectKindOf(v:string|undefined):'snapshot'|'review'{if(v==='snapshot'||v==='review')return v;throw new ParamError('subject_kind');}
/** Review subjects are immutable review result ids (uuid; Task 11 handleExplainRequest); snapshot ids are P1 text ids. */
export function subjectIdOf(kind:'snapshot'|'review',v:string|undefined):string{
 if(v===undefined)throw new ParamError('subject_id');
 if(kind==='review')return uuidOf(v,'subject_id');
 if(/^[A-Za-z0-9:._-]{1,200}$/.test(v))return v;
 throw new ParamError('subject_id');
}
// ---- months (UTC; the review cutoff rule is manifest.ts monthCutoff, spec §6.2)
/** The F4 as-known date of a review (spec §6.2): the date of its cutoff, the 3rd of the next month. */
export const reviewAsOfDate=(month:string):string=>monthCutoff(month).slice(0,10);
/** A month is closed for review once its cutoff (the 3rd of the next month, 00:00:00Z) has passed. */
export const isClosedMonth=(month:string,now:Date):boolean=>Date.parse(monthCutoff(month))<=now.getTime();
/** The newest closed month: the scheduled review target (on the 3rd at 06:00 UTC that is the previous month). */
export function lastClosedMonth(now:Date):string{
 const prev=prevMonth(now.toISOString().slice(0,7));
 return isClosedMonth(prev,now)?prev:prevMonth(prev);
}
// ---- gates (spec §9.1)
export async function sessionOf():Promise<{userId:string;session:SupabaseClient}|null>{
 try{
  const session=await getServerSupabase();
  const {data,error}=await session.auth.getUser();
  if(error||!data.user)return null;
  return {userId:data.user.id,session:session as unknown as SupabaseClient};
 }catch{return null;}
}
export type SessionGate={ok:true;userId:string;session:SupabaseClient}|{ok:false;res:NextResponse};
export type ReadGate={ok:true;userId:string;session:SupabaseClient;port:StrategyReadPort}|{ok:false;res:NextResponse};
export async function sessionGate():Promise<SessionGate>{
 const s=await sessionOf();
 if(!s)return {ok:false,res:errorResponse('unauthorized','sign in required',401)};
 if(!strategyEnabled())return {ok:false,res:errorResponse('strategy_disabled','macro strategy is not enabled',404)};
 return {ok:true,...s};
}
export async function readGate():Promise<ReadGate>{
 const g=await sessionGate();if(!g.ok)return g;
 const port=strategyPort();
 if(!port)return {ok:false,res:errorResponse('macro_foundation_unavailable','macro data foundation is not wired',503)};
 return {...g,port};
}
// ---- dependencies
export function strategyDb(session?:SupabaseClient):StrategyDb{
 return supabaseStrategyDb({admin:getAdminSupabase() as unknown as SupabaseClient,anon:getAnonSupabase() as unknown as SupabaseClient,session});
}
export const codeVersionOrNull=():string|null=>resolveCodeVersion({allowGit:false});
export type JudgmentSection<T>={judgment_status:'disabled'}|{judgment_status:'unavailable'}|{judgment_status:'ok';value:T};
/** Judgment layer of a combined route: off → no F4 client at all; any F4 failure or an empty result → unavailable. */
export async function judgmentSection<T>(run:(f4:F4Client)=>Promise<T|null>):Promise<JudgmentSection<T>>{
 if(!judgmentsEnabled())return {judgment_status:'disabled'};
 try{const v=await run(createF4Client());return v===null?{judgment_status:'unavailable'}:{judgment_status:'ok',value:v};}
 catch{return {judgment_status:'unavailable'};}
}
