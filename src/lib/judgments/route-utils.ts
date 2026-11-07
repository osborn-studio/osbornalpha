// src/lib/judgments/route-utils.ts
// Conventions of the judgment read and admin routes (spec §10): strict parameters (a repeated
// parameter → 400 invalid_parameter:<name>; unknown parameters are ignored), success
// `public, max-age=300, s-maxage=600`, errors and empty results `no-store`, a top-level codeVersion
// on every body, error bodies {error:{code,message}} that never carry internal messages, the two
// read views (latest | as_known with cutoff = asOf end of UTC day), and the admin preamble
// (requireAdminUser, JSON content type, same-origin check as /api/admin/dq/quarantine/[id]).
import type {User} from '@supabase/supabase-js';
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '../admin/auth';
import {resolveCodeVersion} from './deps';
import {UUID_RE} from './wire';
import {PUBLIC_SUBJECT_TYPES} from './types';
import type {CardView,PublicSubjectType,Subject} from './types';
export {JUDGMENT_TYPES,UUID_RE} from './wire';

export const METHOD_ID_RE=/^[a-z][a-z0-9_]{1,63}$/,VERSION_RE=/^v[1-9][0-9]{0,3}$/;
export const SUCCESS_CACHE='public, max-age=300, s-maxage=600';

export class ParamError extends Error{constructor(readonly param:string){super(`invalid_parameter:${param}`);this.name='ParamError';}}
/** The allowed parameters, each at most once. */
export function readParams(url:URL,allowed:readonly string[]):Map<string,string>{
 const out=new Map<string,string>();
 for(const k of allowed){const all=url.searchParams.getAll(k);if(all.length>1)throw new ParamError(k);if(all.length===1)out.set(k,all[0]);}
 return out;
}
export function enumParam<T extends string>(p:Map<string,string>,name:string,allowed:readonly T[]):T|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 if(!(allowed as readonly string[]).includes(v))throw new ParamError(name);return v as T;
}
const isCalendarDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(`${s}T00:00:00.000Z`).toISOString().slice(0,10)===s;
export function dateParam(p:Map<string,string>,name:string):string|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 let ok=false;try{ok=isCalendarDate(v);}catch{ok=false;}
 if(!ok)throw new ParamError(name);return v;
}
export function intParam(p:Map<string,string>,name:string,def:number,max:number):number{
 const v=p.get(name);if(v===undefined)return def;
 if(!/^\d{1,5}$/.test(v)||Number(v)<1||Number(v)>max)throw new ParamError(name);return Number(v);
}
export function uuidParam(p:Map<string,string>,name:string):string|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 if(!UUID_RE.test(v))throw new ParamError(name);return v;
}
export function flagParam(p:Map<string,string>,name:string):boolean{
 const v=p.get(name);if(v===undefined)return false;
 if(v!=='1')throw new ParamError(name);return true;
}
/** Comma list: trimmed, non-empty, unique, each allowed, at most max. */
export function listParam<T extends string>(p:Map<string,string>,name:string,allowed:readonly T[],max:number):T[]|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 const items=v.split(',').map(s=>s.trim());
 if(items.length===0||items.length>max||new Set(items).size!==items.length||items.some(s=>!(allowed as readonly string[]).includes(s)))throw new ParamError(name);
 return items as T[];
}
export const endOfUtcDay=(d:string)=>`${d}T23:59:59.999Z`;
export interface ViewParams{view:CardView;asOf:string|null;cutoff:string|undefined}
/**
 * view=latest (default) | view=as_known&asOf=YYYY-MM-DD (cutoff = asOf 23:59:59.999Z, asOf ≤ today).
 * asOf alone implies as_known; view=as_known without asOf, or view=latest with asOf, is invalid.
 */
export function viewParams(p:Map<string,string>,today:string):ViewParams{
 const view=enumParam(p,'view',['latest','as_known'] as const);
 const asOf=dateParam(p,'asOf');
 if(asOf!==undefined&&asOf>today)throw new ParamError('asOf');
 if(view==='as_known'&&asOf===undefined)throw new ParamError('asOf');
 if(view==='latest'&&asOf!==undefined)throw new ParamError('asOf');
 return asOf===undefined?{view:'latest',asOf:null,cutoff:undefined}:{view:'as_known',asOf,cutoff:endOfUtcDay(asOf)};
}
const SUBJECT_KEY:Record<PublicSubjectType,RegExp>={
 issuer:UUID_RE,macro_region:/^(US|CN)$/,industry:/^[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_.-]{1,32}:[A-Za-z0-9_.-]{1,32}$/,macro_series:/^[A-Za-z0-9_.:-]{1,128}$/,
};
/** subject_type (public types only) + subject_key (format per type, ≤ 128 chars); both required. */
export function subjectParams(p:Map<string,string>):Subject&{type:PublicSubjectType}{
 const type=enumParam(p,'subject_type',PUBLIC_SUBJECT_TYPES);
 if(type===undefined)throw new ParamError('subject_type');
 const key=p.get('subject_key');
 if(key===undefined||key.length>128||!SUBJECT_KEY[type].test(key))throw new ParamError('subject_key');
 return {type,key};
}

export const codeVersionOf=()=>resolveCodeVersion({allowGit:false});
/** 200 with codeVersion; shared cache unless empty. */
/** Commander decision D2 (spec §1.1 success criterion "响应里没有 percent 字段"): the one serializer of every judgments
 *  route. Any object member `display` whose `percent` is null is emitted WITHOUT the `percent` key (JudgmentCard keeps
 *  `percent:number|null` internally; clients treat it as optional). Everything else is copied as is. */
export function serializeBody<T>(body:T):T{
 if(Array.isArray(body))return body.map(x=>serializeBody(x)) as T;
 if(body===null||typeof body!=='object')return body;
 const out:Record<string,unknown>={};
 for(const [k,v] of Object.entries(body as Record<string,unknown>)){
  if(k==='display'&&v!==null&&typeof v==='object'&&!Array.isArray(v)&&(v as {percent?:unknown}).percent===null){
   const rest={...v as Record<string,unknown>};delete rest.percent;out[k]=serializeBody(rest);
  }else out[k]=serializeBody(v);
 }
 return out as T;
}
export function okResponse(body:Record<string,unknown>,opts:{empty:boolean}):NextResponse{
 return NextResponse.json(serializeBody({codeVersion:codeVersionOf(),...body}),{status:200,headers:{'Cache-Control':opts.empty?'no-store':SUCCESS_CACHE}});
}
/** Admin and other non-cacheable successes. */
export function privateResponse(body:Record<string,unknown>,status=200):NextResponse{
 return NextResponse.json(serializeBody({codeVersion:codeVersionOf(),...body}),{status,headers:{'Cache-Control':'no-store'}});
}
export function errorResponse(code:string,message:string,status:number):NextResponse{
 return NextResponse.json({codeVersion:codeVersionOf(),error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
}
export const paramErrorResponse=(e:unknown)=>e instanceof ParamError?errorResponse(e.message,`invalid ${e.param}`,400):null;
/** Logged, code-only 500: no internal message leaves the server. */
export function internalErrorResponse(e:unknown,tag:string):NextResponse{
 console.error(`[${tag}]`,e instanceof Error?e.message:e);
 return errorResponse('internal','judgments read failed',500);
}
/** SQLSTATE-free error code of a db failure: `.code` when a string, else the first known code in the message. */
export function errorCodeOf(e:unknown):string{
 const c=(e as {code?:unknown})?.code;
 if(typeof c==='string'&&/^[a-z_:]+$/.test(c))return c;
 const m=e instanceof Error?e.message:String(e);
 for(const k of ['settlement_sequence','lease_lost','request_key_conflict','unknown_judgment'])if(m.includes(k))return k;
 return 'internal';
}

export type AdminGate={user:User}|{response:NextResponse};
/** requireAdminUser + (for POST) JSON content type and same-origin; 401 / 403 / 415 otherwise. */
export async function adminGate(request:Request,opts:{write:boolean}):Promise<AdminGate>{
 try{
  const user=await requireAdminUser();
  if(opts.write){
   if((request.headers.get('content-type')??'').split(';',1)[0].trim().toLowerCase()!=='application/json')return {response:errorResponse('unsupported_media_type','JSON body required',415)};
   const origin=request.headers.get('origin');
   if(origin!==null&&origin!==new URL(request.url).origin)return {response:errorResponse('forbidden_origin','cross-origin request',403)};
  }
  return {user};
 }catch(e){
  if(e instanceof AdminUnauthenticated)return {response:errorResponse('unauthenticated','authentication required',401)};
  if(e instanceof AdminForbidden)return {response:errorResponse('forbidden','admin role required',403)};
  return {response:internalErrorResponse(e,'admin/judgments')};
 }
}
export interface AdminBody{reason:string|null;request_id:string}
/** {reason (1..500 chars; required unless optional), request_id (uuid, the idempotency key)}. */
export async function adminBody(request:Request,opts:{reasonRequired:boolean}):Promise<AdminBody|NextResponse>{
 const body=(await request.json().catch(()=>null)) as {reason?:unknown;request_id?:unknown}|null;
 if(!body||typeof body!=='object'||Array.isArray(body))return errorResponse('invalid_body','JSON object required',400);
 const reason=body.reason===undefined||body.reason===null?null:typeof body.reason==='string'?body.reason.trim():undefined;
 if(reason===undefined||(reason!==null&&(reason.length<1||reason.length>500))||(opts.reasonRequired&&reason===null))return errorResponse('invalid_parameter:reason','reason required (1..500 chars)',400);
 if(typeof body.request_id!=='string'||!UUID_RE.test(body.request_id))return errorResponse('invalid_parameter:request_id','request_id must be a uuid',400);
 return {reason,request_id:body.request_id};
}
