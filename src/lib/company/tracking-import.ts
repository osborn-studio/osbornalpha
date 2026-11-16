// src/lib/company/tracking-import.ts
// POST /api/tracking/watches/import-watchlist core (spec §6.2): server watchlist tickers → issuers → watches.
// Pure over injected resolve/upsert. Tickers are upper-cased, de-duplicated and processed in sorted order;
// an issuer reached by a second ticker is 'existing'. The DB trigger is the limit authority: the first
// watch_limit stops further inserts and every later new issuer is reported as skippedByLimit.
import {CompanyDbError} from './types';

export interface ImportItem{ticker:string;issuerId?:string}
export interface ImportResult{added:ImportItem[];existing:ImportItem[];unresolved:ImportItem[];skippedByLimit:ImportItem[]}
export interface ImportDeps{resolve(ticker:string):Promise<string|null>;existing:Set<string>;upsert(issuerId:string):Promise<{created:boolean}>}

const RESOLVE_CONCURRENCY=8;
/** Resolves every ticker with at most RESOLVE_CONCURRENCY in flight; a resolver error is a null (unresolved). */
async function resolveAll(tickers:string[],resolve:ImportDeps['resolve']):Promise<Map<string,string|null>>{
 const out=new Map<string,string|null>();let next=0;
 const worker=async()=>{for(;;){const i=next++;if(i>=tickers.length)return;const t=tickers[i]!;try{out.set(t,await resolve(t));}catch{out.set(t,null);}}};
 await Promise.all(Array.from({length:Math.min(RESOLVE_CONCURRENCY,tickers.length)},worker));
 return out;
}
export async function importWatchlist(rawTickers:string[],deps:ImportDeps):Promise<ImportResult>{
 const out:ImportResult={added:[],existing:[],unresolved:[],skippedByLimit:[]};
 const tickers=[...new Set(rawTickers.map(t=>t.trim().toUpperCase()).filter(t=>t!==''))].sort();
 const resolved=await resolveAll(tickers,deps.resolve);
 const seen=new Set(deps.existing);let limitHit=false;
 for(const ticker of tickers){
  const issuerId=resolved.get(ticker)??null;
  if(!issuerId){out.unresolved.push({ticker});continue;}
  if(seen.has(issuerId)){out.existing.push({ticker,issuerId});continue;}
  if(limitHit){out.skippedByLimit.push({ticker,issuerId});continue;}
  try{
   const r=await deps.upsert(issuerId);
   seen.add(issuerId);
   (r.created?out.added:out.existing).push({ticker,issuerId});
  }catch(e){
   if(e instanceof CompanyDbError&&e.code==='watch_limit'){limitHit=true;out.skippedByLimit.push({ticker,issuerId});continue;}
   throw e;
  }
 }
 return out;
}
