// Topic plan T5.1: closed-by-default admin gates, JSON transport and safe error mapping.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {EvidenceRefError} from '@/lib/evidence/ref';
import {TopicError,TOPIC_ERROR_STATUS} from './errors';
import {TopicsDbError} from './types';
import {topicsEnabled} from './flags';
import {adminFixtureMode,FIXTURE_ADMIN_ID} from './admin-fixture';
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NO_STORE={'Cache-Control':'no-store'} as const;
export const jsonNoStore=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:NO_STORE});
export const errorJson=(code:string,status:number)=>jsonNoStore({error:{code,message:code}},status);
export async function adminActor():Promise<string>{
 return adminFixtureMode()?FIXTURE_ADMIN_ID:(await requireAdminUser()).id;
}
export function toErrorResponse(e:unknown,tag:string):Response{
 if(e instanceof AdminUnauthenticated)return errorJson('authentication_required',401);
 if(e instanceof AdminForbidden)return errorJson('admin_required',403);
 if(e instanceof TopicError)return jsonNoStore({error:{code:e.code,message:e.code},...(e.detail?{meta:e.detail}:{})},e.status);
 if(e instanceof EvidenceRefError)return errorJson(e.code,400);
 if(e instanceof TopicsDbError){
  if(e.code==='topics_slug_shape')return errorJson('invalid_body:slug',400);
  if(e.code==='topics_category')return errorJson('invalid_body:category',400);
  const head=e.code.split(':')[0];
  if(Object.hasOwn(TOPIC_ERROR_STATUS,head))return errorJson(e.code,TOPIC_ERROR_STATUS[head as keyof typeof TOPIC_ERROR_STATUS]);
 }
 console.error(tag,e instanceof Error?e.message:String(e));return errorJson('internal_error',500);
}
export async function readJsonBody(request:Request):Promise<Record<string,unknown>>{
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))throw new TopicError('unsupported_media_type');
 const origin=request.headers.get('origin');if(origin!==null&&origin!==new URL(request.url).origin)throw new TopicError('forbidden_origin');
 const body:unknown=await request.json().catch(()=>undefined);
 if(body===null||typeof body!=='object'||Array.isArray(body))throw new TopicError('invalid_body');
 return body as Record<string,unknown>;
}
type Handler<C>=(request:Request,ctx:C)=>Promise<Response>;
const noStore=(response:Response):Response=>{
 const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
};
export function adminGet<C>(tag:string,fn:(a:{request:Request;ctx:C;userId:string})=>Promise<Response>):Handler<C>{
 return async(request,ctx)=>{try{
  if(!topicsEnabled())throw new TopicError('topics_disabled');
  const userId=await adminActor();return noStore(await fn({request,ctx,userId}));
 }catch(e){return toErrorResponse(e,tag);}};
}
export function adminPost<C>(tag:string,fn:(a:{request:Request;ctx:C;userId:string;body:Record<string,unknown>})=>Promise<Response>):Handler<C>{
 return async(request,ctx)=>{try{
  if(!topicsEnabled())throw new TopicError('topics_disabled');
  const userId=await adminActor(),body=await readJsonBody(request);return noStore(await fn({request,ctx,userId,body}));
 }catch(e){return toErrorResponse(e,tag);}};
}
const invalid=(key:string)=>new TopicError(`invalid_body:${key}`);
export const uuidParam=(v:unknown,name='id'):string=>{
 if(typeof v!=='string'||!UUID_RE.test(v))throw new TopicError(`invalid_parameter:${name}`);return v.toLowerCase();
};
export function strField(b:Record<string,unknown>,k:string,o:{max:number;optional?:false}):string;
export function strField(b:Record<string,unknown>,k:string,o:{max:number;optional:true}):string|undefined;
export function strField(b:Record<string,unknown>,k:string,o:{max:number;optional?:boolean}):string|undefined{
 const v=b[k];if(v===undefined&&o.optional)return undefined;
 if(typeof v!=='string'||v.trim().length===0||v.length>o.max)throw invalid(k);return v;
}
export const intField=(b:Record<string,unknown>,k:string,min:number,max:number):number=>{
 const v=b[k];if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw invalid(k);return v;
};
export const enumField=<T extends string>(b:Record<string,unknown>,k:string,allowed:readonly T[]):T=>{
 const v=b[k];if(typeof v!=='string'||!(allowed as readonly string[]).includes(v))throw invalid(k);return v as T;
};
export const objField=(b:Record<string,unknown>,k:string):Record<string,unknown>=>{
 const v=b[k]??{};if(typeof v!=='object'||Array.isArray(v))throw invalid(k);return v as Record<string,unknown>;
};
