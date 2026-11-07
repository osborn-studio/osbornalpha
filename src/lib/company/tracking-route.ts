// src/lib/company/tracking-route.ts
// Conventions of the per-user tracking routes (spec §6.2, §11, §0 #64): session client + RLS for watches and
// receipts; a SERVICE-ROLE CompanyDb only for issuer_events reads restricted to the user's watched issuers;
// every response (success and error) `Cache-Control: private, no-store`; 401 not_authenticated; mutations
// require Content-Type application/json and a same-origin Origin (as /api/admin/dq/quarantine/[id]).
import {NextResponse} from 'next/server';
import type {SupabaseClient} from '@supabase/supabase-js';
import {getServerSupabase,serverIsSupabaseConfigured} from '../supabase/server';
import {getAdminSupabase} from '../supabase/admin';
import {supabaseTableClient,type TableClient} from '../db/table-client';
import {resolveIssuer} from '../entities/resolve';
import {TICKER_RE,UUID_RE,utcDate} from '../facts/public-route';
import {MAX_COMPANY_WATCHES,supabaseCompanyDb} from './db';
import {CompanyDbError,type CompanyDb,type WatchRow} from './types';

export const PRIVATE_NO_STORE={'Cache-Control':'private, no-store'} as const;
export const EVENT_ID_RE=/^[0-9a-f]{64}$/;
export const trackingJson=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:PRIVATE_NO_STORE});
export const trackingError=(code:string,message:string,status:number)=>trackingJson({error:{code,message}},status);
export const unauthenticated=()=>trackingError('not_authenticated','sign in required',401);

/** CSRF defence for POST/PATCH/DELETE; null = allowed. */
export function mutationGuard(request:Request):NextResponse|null{
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))return trackingError('unsupported_media_type','Content-Type must be application/json',415);
 const origin=request.headers.get('origin');
 if(origin!==null&&origin!==new URL(request.url).origin)return trackingError('forbidden_origin','cross-site request',403);
 return null;
}
/** JSON object body or null (malformed / not an object). */
export async function jsonObject(request:Request):Promise<Record<string,unknown>|null>{
 const b:unknown=await request.json().catch(()=>null);
 return b!==null&&typeof b==='object'&&!Array.isArray(b)?b as Record<string,unknown>:null;
}

type ServerSb=Awaited<ReturnType<typeof getServerSupabase>>;
export interface TrackingSession{userId:string;sb:ServerSb;db:CompanyDb;tables:TableClient}
/** The signed-in user's session-scoped clients, or null (→ 401). */
export async function trackingSession():Promise<TrackingSession|null>{
 if(!serverIsSupabaseConfigured())return null;
 const sb=await getServerSupabase();
 const {data:{user}}=await sb.auth.getUser();
 if(!user)return null;
 const client=sb as unknown as SupabaseClient;   // generated Database generic ≠ adapters' SupabaseClient (same boundary cast as Task 9)
 return {userId:user.id,sb,db:supabaseCompanyDb(client),tables:supabaseTableClient(client)};
}
/** issuer_events is service_role only (§0 #64): callers pass ONLY the user's watched issuer ids. */
export const serviceCompanyDb=():CompanyDb=>supabaseCompanyDb(getAdminSupabase());

export function trackingFailure(e:unknown,tag:string):NextResponse{
 if(e instanceof CompanyDbError&&e.code==='watch_limit')return trackingError('watch_limit',`at most ${MAX_COMPANY_WATCHES} tracked companies`,409);
 if(e instanceof CompanyDbError&&e.code==='invalid_read')return trackingError('invalid_parameter:eventIds','event ids do not belong to this issuer',400);
 if(e instanceof Error&&e.message==='ambiguous_owner')return trackingError('ambiguous_ticker','ticker maps to several issuers',409);
 console.error(`[${tag}]`,e instanceof Error?e.message:e);
 return trackingError('internal','tracking unavailable',500);
}

export const isIssuerId=(v:unknown):v is string=>typeof v==='string'&&UUID_RE.test(v);
export const findWatch=(watches:WatchRow[],issuerId:string)=>watches.find(w=>w.issuer_id===issuerId)??null;
export const watchDto=(r:WatchRow)=>({issuerId:r.issuer_id,note:r.note,muted:r.muted,createdAt:r.created_at,updatedAt:r.updated_at});

/**
 * Watch target from {issuerId} or {ticker} (exactly one). Tracking is issuer-level (§4.3): tickers go through
 * resolveIssuer (HK issuers included), an issuer id must exist; a merged issuer is redirected one hop.
 */
export async function resolveWatchTarget(tables:TableClient,body:Record<string,unknown>):Promise<{issuerId:string}|{error:NextResponse}>{
 const keys=Object.keys(body);
 const hasId='issuerId' in body,hasTicker='ticker' in body;
 if(keys.length!==1||hasId===hasTicker)return {error:trackingError('invalid_parameter:body','give exactly one of issuerId, ticker',400)};
 if(hasId){
  if(!isIssuerId(body.issuerId))return {error:trackingError('invalid_parameter:issuerId','invalid issuerId',400)};
  const id=body.issuerId.toLowerCase();
  const [row]=await tables.select('issuers',{issuer_id:id},{limit:1});
  if(!row)return {error:trackingError('unknown_issuer','issuer not found',404)};
  if(row.status==='merged'){
   const target=typeof row.merged_into==='string'?row.merged_into.toLowerCase():null;
   if(!target||!isIssuerId(target))return {error:trackingError('unknown_issuer','issuer not found',404)};
   const [dest]=await tables.select('issuers',{issuer_id:target},{limit:1});
   if(!dest||dest.status==='merged')return {error:trackingError('unknown_issuer','issuer not found',404)};
   return {issuerId:target};
  }
  return {issuerId:id};
 }
 const ticker=body.ticker;
 if(typeof ticker!=='string'||!TICKER_RE.test(ticker))return {error:trackingError('invalid_parameter:ticker','invalid ticker',400)};
 const r=await resolveIssuer(tables,{ticker},{today:utcDate(new Date())});
 if(!r)return {error:trackingError('unknown_ticker','ticker not found',404)};
 return {issuerId:r.issuer_id};
}
