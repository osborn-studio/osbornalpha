// Shared admin route gate, error mapping, and logged response (plan Part C; spec §8.2).
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '../admin/auth';
import {BrokerError,bad} from './errors';
import {BrokerResearchDbError} from './types';
import type {AccessLogInput,BrokerResearchDb} from './types';

export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NO_STORE={'Cache-Control':'no-store'} as const;
export const jsonNoStore=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:NO_STORE});
export const errorJson=(code:string,status:number,extra:Record<string,unknown>={})=>jsonNoStore({error:{code,message:code,...extra}},status);
export const DB_ERROR_STATUS:Readonly<Record<string,number>>={
 publish_blocked:409,published_immutable:409,publish_direct_forbidden:409,lease_lost:409,version_mismatch:409,disclosure_inputs_changed:409,
 hook_params_required:400,invalid_payload:400,invalid_action:400,not_found:404,
};
export function toErrorResponse(e:unknown,tag:string):Response{
 if(e instanceof AdminUnauthenticated)return errorJson('authentication_required',401);
 if(e instanceof AdminForbidden)return errorJson('admin_required',403);
 if(e instanceof BrokerError)return errorJson(e.code,e.status,e.extra);
 if(e instanceof BrokerResearchDbError&&DB_ERROR_STATUS[e.code]!==undefined){
  if(e.code==='publish_blocked')return errorJson('publish_blocked',409,{reasons:(e.detail??'').split(',').filter(Boolean)});
  return errorJson(e.code,DB_ERROR_STATUS[e.code],e.detail?{detail:e.detail}:{});
 }
 console.error(`[admin/broker-research] ${tag}`,e instanceof Error?e.message:e);
 return errorJson('internal_error',500);
}
export async function readJsonBody(request:Request):Promise<Record<string,unknown>>{
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))throw new BrokerError('unsupported_media_type',415);
 const origin=request.headers.get('origin');if(origin!==null&&origin!==new URL(request.url).origin)throw new BrokerError('forbidden_origin',403);
 const body:unknown=await request.json().catch(()=>undefined);
 if(body===null||typeof body!=='object'||Array.isArray(body))throw bad('invalid_json');
 return body as Record<string,unknown>;
}
type Handler<C>=(request:Request,ctx:C)=>Promise<Response>;
export function adminGet<C>(tag:string,fn:(a:{request:Request;ctx:C;userId:string})=>Promise<Response>):Handler<C>{
 return async(request,ctx)=>{try{const userId=(await requireAdminUser()).id;return await fn({request,ctx,userId});}catch(e){return toErrorResponse(e,tag);}};
}
export function adminPost<C>(tag:string,fn:(a:{request:Request;ctx:C;userId:string;body:Record<string,unknown>})=>Promise<Response>):Handler<C>{
 return async(request,ctx)=>{try{const userId=(await requireAdminUser()).id;const body=await readJsonBody(request);return await fn({request,ctx,userId,body});}catch(e){return toErrorResponse(e,tag);}};
}
export async function respondLogged(db:BrokerResearchDb,row:AccessLogInput,payload:unknown):Promise<Response>{
 try{await db.logAccess(row);}catch(e){console.error('[admin/broker-research] access log failed',e instanceof Error?e.message:e);return errorJson('access_log_failed',500);}
 return jsonNoStore(payload);
}
const invalid=(name:string)=>bad(`invalid_parameter:${name}`);
export const uuidParam=(v:unknown,name='id'):string=>{if(typeof v!=='string'||!UUID_RE.test(v))throw invalid(name);return v.toLowerCase();};
export function strField(b:Record<string,unknown>,k:string,o:{max:number;optional?:false}):string;
export function strField(b:Record<string,unknown>,k:string,o:{max:number;optional:true}):string|undefined;
export function strField(b:Record<string,unknown>,k:string,o:{max:number;optional?:boolean}):string|undefined{
 const v=b[k];if(v===undefined&&o.optional)return undefined;
 if(typeof v!=='string'||v.trim().length===0||v.length>o.max)throw invalid(k);return v;
}
export const boolField=(b:Record<string,unknown>,k:string,def?:boolean):boolean=>{const v=b[k];if(v===undefined&&def!==undefined)return def;if(typeof v!=='boolean')throw invalid(k);return v;};
export const intField=(b:Record<string,unknown>,k:string,min:number,max:number):number=>{const v=b[k];if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw invalid(k);return v;};
export const enumField=<T extends string>(b:Record<string,unknown>,k:string,allowed:readonly T[]):T=>{const v=b[k];if(typeof v!=='string'||!(allowed as readonly string[]).includes(v))throw invalid(k);return v as T;};
export const objField=(b:Record<string,unknown>,k:string):Record<string,unknown>=>{const v=b[k]??{};if(typeof v!=='object'||v===null||Array.isArray(v))throw invalid(k);return v as Record<string,unknown>;};
