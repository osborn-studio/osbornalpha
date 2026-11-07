// src/lib/macro/route-helpers.ts
// Shared plumbing for the /api/macro/* read routes (spec §2, §8): session gate (middleware does not
// cover /api/*), uniform {error:{code,message}} responses, strict parameter parsing, and the
// production dependency factory (route tests replace macroRouteDeps with memory implementations).
import type {SupabaseClient} from '@supabase/supabase-js';
import {NextResponse} from 'next/server';
import {supabaseTableClient} from '@/lib/db/table-client';
import type {TableClient} from '@/lib/db/table-client';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {getAnonSupabase} from '@/lib/supabase/anon';
import {getServerSupabase} from '@/lib/supabase/server';
import {supabaseMacroDb} from './db';
import type {MacroDb} from './db';
import type {ObservationRow} from './types';

export const SUCCESS_CACHE_CONTROL='private, max-age=60';
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SHA256_RE=/^[0-9a-f]{64}$/;
export const SIGNED_URL_SECONDS=60;
export const okJson=(body:unknown)=>NextResponse.json(body,{status:200,headers:{'Cache-Control':SUCCESS_CACHE_CONTROL}});
export const errorResponse=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

/** Session gate shared by every /api/macro route (read routes here, analyses routes in Task 15). */
export async function requireSessionUser():Promise<{ok:true;user:{id:string}}|{ok:false;response:NextResponse}>{
 try{
  const sb=await getServerSupabase();
  const {data,error}=await sb.auth.getUser();
  if(!error&&data?.user?.id)return {ok:true,user:{id:data.user.id}};
 }catch(e){console.error('[macro-auth]',e instanceof Error?e.message:e);}
 return {ok:false,response:errorResponse('unauthenticated','sign in required',401)};
}

export class ParamError extends Error{constructor(readonly param:string){super(`invalid_parameter:${param}`);this.name='ParamError';}}
/** Rejects unknown and repeated parameters. */
export function readParams(url:URL,allowed:readonly string[]):Map<string,string>{
 const out=new Map<string,string>();
 for(const [k,v] of url.searchParams){
  if(!allowed.includes(k)||out.has(k))throw new ParamError(k);
  out.set(k,v);
 }
 return out;
}
const ISO_DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const validDate=(v:string)=>ISO_DATE.test(v)&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
export function dateParam(p:Map<string,string>,name:string):string|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 if(!validDate(v))throw new ParamError(name);
 return v;
}
/** asOf: an ISO date (end of that UTC day) or an ISO timestamp; normalised to an ISO timestamp. */
export function asOfParam(p:Map<string,string>):string|undefined{
 const v=p.get('asOf');if(v===undefined)return undefined;
 if(validDate(v))return `${v}T23:59:59.999Z`;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))throw new ParamError('asOf');
 return new Date(v).toISOString();
}
export function flagParam(p:Map<string,string>,name:string):boolean{
 const v=p.get(name);
 if(v===undefined||v==='0'||v==='false')return false;
 if(v==='1'||v==='true')return true;
 throw new ParamError(name);
}
export function enumParam<T extends string>(p:Map<string,string>,name:string,allowed:readonly T[],def:T):T{
 const v=p.get(name);if(v===undefined)return def;
 if(!(allowed as readonly string[]).includes(v))throw new ParamError(name);
 return v as T;
}
export const paramErrorResponse=(e:unknown)=>e instanceof ParamError?errorResponse(e.message,`invalid ${e.param}`,400):null;
export function failureResponse(e:unknown,tag:string){
 console.error(`[${tag}]`,e instanceof Error?e.message:e);
 return errorResponse('internal','macro read failed',500);
}
export const publicObservation=(r:ObservationRow)=>({observation_id:r.observation_id,series_id:r.series_id,period_end:r.period_end,value_text:r.value_text,version:r.version,
 available_at:r.available_at,availability_basis:r.availability_basis,retrieval_id:r.retrieval_id,locator:r.locator,derived_from:r.derived_from,transform:r.transform});

/** Every database read goes through MacroDb (previousSnapshot, retrievalsOf, retrievalsByIds live there, Task 3); only
 *  the DQ table client and URL signing are route-specific. */
export interface MacroRouteDeps{
 db:MacroDb;tables:TableClient;
 signedUrl(objectPath:string,expiresIn:number):Promise<string>;
}
/** retrieval_id → evidence sha256 for a set of observation rows (one batched MacroDb read). */
export async function shaOfRetrievals(db:Pick<MacroDb,'retrievalsByIds'>,ids:string[]):Promise<Map<string,string>>{
 return new Map((await db.retrievalsByIds(ids)).map(r=>[r.retrieval_id,r.sha256]));
}
/** Production deps; called only after requireSessionUser succeeded (admin.ts rule): admin reads dq_freshness and signs URLs; facts read via anon (RLS). */
export function macroRouteDeps():MacroRouteDeps{
 const anon=getAnonSupabase();const admin=getAdminSupabase();
 return {
  db:supabaseMacroDb({admin,anon}),
  tables:supabaseTableClient(admin as unknown as SupabaseClient),
  async signedUrl(objectPath,expiresIn){
   const {data,error}=await admin.storage.from('macro-raw').createSignedUrl(objectPath,expiresIn);
   if(error||!data?.signedUrl)throw new Error('signed_url_failed');
   return data.signedUrl;
  },
 };
}
