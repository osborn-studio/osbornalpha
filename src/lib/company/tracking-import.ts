// src/lib/company/tracking-import.ts
// POST /api/tracking/watches/import-watchlist core (spec §6.2): server watchlist tickers → issuers → watches.
// Pure over injected resolve/upsert. Tickers are upper-cased, de-duplicated and processed in sorted order;
// an issuer reached by a second ticker is 'existing'. The DB trigger is the limit authority: the first
// watch_limit stops further inserts and every later new issuer is reported as skippedByLimit.
import {CompanyDbError} from './types';

export interface ImportItem{ticker:string;issuerId?:string}
export interface ImportResult{added:ImportItem[];existing:ImportItem[];unresolved:ImportItem[];skippedByLimit:ImportItem[]}
export interface ImportDeps{resolve(ticker:string):Promise<string|null>;existing:Set<string>;upsert(issuerId:string):Promise<{created:boolean}>}

export async function importWatchlist(rawTickers:string[],deps:ImportDeps):Promise<ImportResult>{
 const out:ImportResult={added:[],existing:[],unresolved:[],skippedByLimit:[]};
 const tickers=[...new Set(rawTickers.map(t=>t.trim().toUpperCase()).filter(t=>t!==''))].sort();
 const seen=new Set(deps.existing);let limitHit=false;
 for(const ticker of tickers){
  let issuerId:string|null=null;
  try{issuerId=await deps.resolve(ticker);}catch{issuerId=null;}
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
