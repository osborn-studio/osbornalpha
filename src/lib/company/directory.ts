// src/lib/company/directory.ts
// Coverage directory (spec §8, §6.1 GET /api/companies). Public reference reads only (anon): issuer ids by
// name / ticker prefix, and rows assembled from issuer_coverage + issuers + current issuer_securities. No
// ratings, no judgment counts, no per-user field.
import {isCurrentSecurity} from '../entities/resolve';
import {publicMarketOf} from '../facts/public-route';
import type {IssuerLite,SecurityLite} from './tracking-issuers';
import type {CitationSummary,CoverageRow,Market} from './types';

/** Letters, digits, space, '.', '-' only: PostgREST or/ilike syntax characters never reach the filter. */
export const DIRECTORY_Q_RE=/^[\p{L}\p{N} .\-]{1,24}$/u;
export const DIRECTORY_SORTS=['latest_available_date','latest_period_end','name'] as const;
export type DirectorySort=typeof DIRECTORY_SORTS[number];
export const DIRECTORY_DEFAULT_PAGE_SIZE=100;
export const DIRECTORY_MAX_PAGE_SIZE=200;

export interface DirectoryRow{
 issuerId:string;market:Market;names:{zh:string|null;en:string|null};primaryTicker:string|null;tickers:string[];
 latestPeriodEnd:string|null;latestAvailableDate:string|null;conceptsCovered:number;citationSummary:CitationSummary;
 scopeLastSuccessAt:string|null;scopeLastStatus:'success'|'failed'|null;
}

type Result={data:unknown[]|null;error:{message:string}|null};
/** One ordered, ranged PostgREST query (计划第 3 轮审计 R8: .order(...).range(a,b) replaces .limit(CAP)). */
export interface PrefixPage{order(col:string):PrefixPage;range(from:number,to:number):PromiseLike<Result>}
/** Minimal structural view of the anon Supabase client (cast at the call site). */
export interface PrefixClient{from(table:string):{select(cols:string):{
 or(filter:string):PrefixPage;
 ilike(col:string,pattern:string):PrefixPage;
}}}
const PAGE=1000;
const MAX_CANDIDATES=100_000;   // fail closed beyond this, never a silently partial match set

/** Every row of one stably ordered query: range pages until an empty page (robust to a server max-rows below PAGE). */
async function exhaust<T>(page:(from:number,to:number)=>PromiseLike<Result>):Promise<T[]>{
 const out:T[]=[];
 for(let offset=0;;){
  const r=await page(offset,offset+PAGE-1);
  if(r.error)throw new Error('directory_search_failed');
  const data=(r.data??[]) as T[];
  if(data.length===0)return out;
  out.push(...data);offset+=data.length;
  if(out.length>MAX_CANDIDATES)throw new Error('directory_search_failed');
 }
}

/** Issuer ids whose zh/en name or a CURRENT ticker starts with q (case-insensitive). q must match DIRECTORY_Q_RE.
 * 计划第 3 轮审计 R8: both prefix queries are paged to exhaustion BEFORE the current-security filter and the
 * coverage intersection, so expired securities or early name matches cannot crowd out a valid later match. */
export async function issuerIdsByPrefix(sb:PrefixClient,q:string,today:string):Promise<string[]>{
 if(!DIRECTORY_Q_RE.test(q))throw new Error('invalid_q');
 const pat=`"${q}*"`;
 const [names,tickers]=await Promise.all([
  exhaust<{issuer_id:string}>((a,b)=>sb.from('issuers').select('issuer_id').or(`canonical_name_zh.ilike.${pat},canonical_name_en.ilike.${pat}`).order('issuer_id').range(a,b)),
  exhaust<{issuer_id:string;valid_from:string;valid_to:string|null}>((a,b)=>sb.from('issuer_securities').select('issuer_id,valid_from,valid_to').ilike('ticker',`${q.toUpperCase()}%`).order('issuer_id').order('ticker').order('valid_from').range(a,b)),
 ]);
 const ids=new Set<string>();
 for(const r of names)ids.add(r.issuer_id);
 for(const r of tickers)if(isCurrentSecurity(r as unknown as Record<string,unknown>,today))ids.add(r.issuer_id);
 return [...ids];
}

export function toDirectoryRows(coverage:CoverageRow[],lites:{issuers:IssuerLite[];securities:SecurityLite[]},today:string):DirectoryRow[]{
 const issuer=new Map(lites.issuers.map(i=>[i.issuer_id,i]));
 return coverage.map(c=>{
  const secs=lites.securities.filter(s=>s.issuer_id===c.issuer_id&&isCurrentSecurity(s as unknown as Record<string,unknown>,today)&&publicMarketOf(s.ticker.toUpperCase())===c.market)
   .sort((x,y)=>Number(y.is_primary)-Number(x.is_primary)||x.valid_from.localeCompare(y.valid_from)||x.ticker.localeCompare(y.ticker));
  const i=issuer.get(c.issuer_id);
  return {
   issuerId:c.issuer_id,market:c.market,names:{zh:i?.canonical_name_zh??null,en:i?.canonical_name_en??null},
   primaryTicker:secs[0]?.ticker??null,tickers:secs.map(s=>s.ticker),
   latestPeriodEnd:c.latest_period_end,latestAvailableDate:c.latest_available_date,conceptsCovered:c.concepts_covered,
   citationSummary:c.citation_summary,scopeLastSuccessAt:c.scope_last_success_at,scopeLastStatus:c.scope_last_status,
  };
 });
}
