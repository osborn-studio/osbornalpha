// src/lib/facts/public-route.ts
// Conventions shared by the public read routes (spec §9): anon clients (read_facts is security
// invoker, RLS shows anon only status='ok'), the ticker syntax of /api/entities/resolve, issuer
// resolution by TODAY's ownership (asOf applies to facts only), market from the ticker suffix,
// strict parameter parsing (repeated parameter → 400 invalid_parameter:<name>), error bodies
// {error:{code,message}} with no-store, cache headers (past asOf → long shared cache; otherwise
// bounded by the next UTC midnight like the resolve route), and the public row shapes.
import {NextResponse} from 'next/server';
import {getAnonSupabase} from '../supabase/anon';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {resolveIssuer,successCacheControl} from '../entities/resolve';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {supabaseFactsDb} from './db';
import type {FactRow,FactsDb,FilingRow,Market} from './types';

export const TICKER_RE=/^[A-Za-z0-9.\/\-]{1,24}$/;
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const utcDate=(d:Date)=>d.toISOString().slice(0,10);
const isCalendarDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&(()=>{const ms=Date.parse(`${s}T00:00:00Z`);return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s;})();
export const marketOfTicker=(t:string):Market=>/\.(SH|SZ|BJ)$/i.test(t)?'CN':'US';

export class QueryError extends Error{constructor(public readonly param:string){super(`invalid_parameter:${param}`);this.name='QueryError';}}
/** Collects the allowed parameters; any of them given twice is an error. Unknown parameters are ignored. */
export function readParams(url:URL,allowed:readonly string[]):Map<string,string>{
 const out=new Map<string,string>();
 for(const k of allowed){const all=url.searchParams.getAll(k);if(all.length>1)throw new QueryError(k);if(all.length===1)out.set(k,all[0]);}
 return out;
}
export function dateParam(p:Map<string,string>,name:string):string|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 if(!isCalendarDate(v))throw new QueryError(name);return v;
}
export function intParam(p:Map<string,string>,name:string,def:number,max:number):number{
 const v=p.get(name);if(v===undefined)return def;
 if(!/^\d{1,5}$/.test(v)||Number(v)<1||Number(v)>max)throw new QueryError(name);return Number(v);
}
/** Comma list: trimmed, non-empty, unique, each in `allowed` (when given), at most `max` items. */
export function listParam(p:Map<string,string>,name:string,allowed:ReadonlySet<string>|null,max:number):string[]|undefined{
 const v=p.get(name);if(v===undefined)return undefined;
 const items=v.split(',').map(s=>s.trim());
 if(items.length===0||items.length>max||items.some(s=>s===''||(allowed&&!allowed.has(s)))||new Set(items).size!==items.length)throw new QueryError(name);
 return items;
}
/** asOf defaults to today and may not be in the future. */
export function asOfParam(p:Map<string,string>,today:string):string{
 const v=dateParam(p,'asOf');if(v===undefined)return today;
 if(v>today)throw new QueryError('asOf');return v;
}
export function flagParam(p:Map<string,string>,name:string):boolean{
 const v=p.get(name);if(v===undefined)return false;
 if(v!=='1')throw new QueryError(name);return true;
}

export const errorResponse=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
export const paramErrorResponse=(e:unknown)=>e instanceof QueryError?errorResponse(e.message,`invalid ${e.param}`,400):null;

export interface PublicIssuer{issuerId:string;ticker:string;market:Market}
/** CN canonical form (600519 / SH600519 / 600519.SS → 600519.SH) from the repo's securities parser; null for anything that is not an A-share code. */
export function cnCanonicalTicker(raw:string):string|null{
 if(inferCoreMarket(raw)!=='A')return null;
 return normalizeSecurityTicker(raw,'A');
}
/** Percent-decoded path segment, or null when malformed. */
export function decodeTicker(raw:string):string|null{try{return decodeURIComponent(raw);}catch{return null;}}
/**
 * Ticker → issuer by today's ownership (one merge hop is followed by resolveIssuer). The ORIGINAL
 * ticker is resolved first, exactly like /api/entities/resolve (so BRK.A is BRK.A, never BRK); only
 * when that finds nothing is the CN canonical form tried. Market and echoed ticker come from the
 * resolved security row, not from string normalisation. Throws Error('ambiguous_owner') through.
 */
export async function resolvePublicIssuer(tables:TableClient,rawTicker:string,today:string):Promise<PublicIssuer|null>{
 const given=rawTicker.trim().toUpperCase().replace(/\//g,'.');
 const cn=cnCanonicalTicker(given);
 for(const t of cn&&cn!==given?[given,cn]:[given]){
  const r=await resolveIssuer(tables,{ticker:t},{today});
  if(!r)continue;
  const sec=r.securities.find(x=>x.ticker.toUpperCase()===t);
  const ticker=sec?sec.ticker:t;
  return {issuerId:r.issuer_id,ticker,market:marketOfTicker(ticker)};
 }
 return null;
}
/** Failure → response: ambiguous ownership is the caller's 409, everything else a logged, code-only 500. */
export function failureResponse(e:unknown,tag:string,internalMessage:string){
 if(e instanceof Error&&e.message==='ambiguous_owner')return errorResponse('ambiguous_ticker','ticker maps to several issuers',409);
 console.error(`[${tag}]`,e instanceof Error?e.message:e);
 return errorResponse('internal',internalMessage,500);
}
/** Only published filings (active generation) are public; staged ones (mapping_gen 0) never are. */
export const isPublished=(f:FilingRow)=>f.mapping_gen>0;

/** anon clients; stateRev = fact_state_rev(issuer, market) (anon may execute it; only the version number leaves fact_sync_scope). */
export function publicClients():{tables:TableClient;db:FactsDb;stateRev:(issuer:string,market:Market)=>Promise<number>}{
 const sb=getAnonSupabase();
 const rpc=(fn:string,args:Record<string,unknown>)=>(sb as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>}).rpc(fn,args);
 return {tables:supabaseTableClient(sb),db:supabaseFactsDb(sb),stateRev:async(issuer,market)=>{
  const {data,error}=await rpc('fact_state_rev',{p_issuer:issuer,p_market:market});
  if(error)throw new Error('fact_state_rev_failed');
  const n=Number(data);if(!Number.isFinite(n))throw new Error('fact_state_rev_invalid');return n;
 }};
}

export function successHeaders(now:Date,asOf:string|undefined,empty:boolean):Record<string,string>{
 if(empty)return {'Cache-Control':'no-store'};
 if(asOf!==undefined&&asOf<utcDate(now))return {'Cache-Control':'public, max-age=600, s-maxage=3600'};
 return {'Cache-Control':successCacheControl(now)};
}

/** Metrics whose facts changed visibility since materialisation: nothing is served, shared caches keep it only briefly. */
export const STALE_CACHE_CONTROL='public, max-age=0, s-maxage=30';
/** Fresh materialised metrics can go stale at the next publish: short shared cache only. */
export const FRESH_METRICS_CACHE_CONTROL='public, max-age=0, s-maxage=60';

export type Citation='edgar'|'linked'|'pending';
export const citationOf=(f:FilingRow):Citation=>f.market==='US'?'edgar':f.document_ref?'linked':'pending';
export const publicFiling=(f:FilingRow)=>({filingId:f.filing_id,formType:f.form_type,periodEnd:f.period_end,availableDate:f.available_date,sourceRef:f.source_ref,url:f.url,documentRef:f.document_ref,documentUrl:f.document_url,citation:citationOf(f)});
export const publicFact=(r:FactRow)=>({factId:r.fact_id,concept:r.concept,sourceConcept:r.source_concept,statement:r.statement,periodStart:r.period_start,periodEnd:r.period_end,duration:r.duration,value:r.value_text,unit:r.unit,availableDate:r.available_date,filingId:r.filing_id,disclosureSeq:r.disclosure_seq??null,isCurrent:r.is_current??null,isRevision:r.is_revision??null,mappingGen:r.mapping_gen,rawHash:r.raw_hash});
