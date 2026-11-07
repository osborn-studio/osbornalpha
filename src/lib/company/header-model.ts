// src/lib/company/header-model.ts
// Pure header view model of the company page (plan 2026-11-06 Task 11; spec §5.2, §5.7, §0 #69).
// Shared by the server loader (page-data.ts) and the client header; no server imports.
import {DATASETS} from '@/lib/dq/datasets';
import type {ResolvedIssuer,ResolvedSecurity} from '@/lib/entities/resolve';
import type {CoverageRow,Market} from './types';

export type SecurityMarket=Market|'HK'|'OTHER';
export type FactState='ok'|'no_issuer'|'no_facts'|'hk_pending';
export interface Chip{ticker:string;primary:boolean;current:boolean;market:SecurityMarket}
export interface StreamOption{market:Market;ticker:string}

export function displayNames(names:{zh:string|null;en:string|null},locale:'zh'|'en',ticker:string):{title:string;subtitle:string|null}{
 const own=locale==='zh'?names.zh:names.en,other=locale==='zh'?names.en:names.zh;
 if(own)return {title:own,subtitle:other&&other!==own?other:null};
 if(other)return {title:other,subtitle:null};
 return {title:ticker,subtitle:null};
}
/** Same suffix rule as the facts layer: .SH/.SZ/.BJ → CN, .HK → HK, other suffixed forms OTHER, plain/dotted share class → US. */
export function securityMarket(ticker:string):SecurityMarket{
 const t=ticker.toUpperCase();
 if(/\.(SH|SZ|BJ)$/.test(t))return 'CN';
 if(/\.HK$/.test(t))return 'HK';
 if(/^[A-Z][A-Z0-9-]*(\.[A-Z])?$/.test(t))return 'US';
 return 'OTHER';
}
export const datasetOf=DATASETS.facts;
export function securityChips(secs:ResolvedSecurity[],current:string):Chip[]{
 const cur=current.toUpperCase();
 return [...secs].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.ticker.localeCompare(b.ticker))
  .map(s=>({ticker:s.ticker,primary:s.is_primary,current:s.ticker.toUpperCase()===cur,market:securityMarket(s.ticker)}));
}
export function padCik(cik:string|null):string|null{return cik&&/^\d{1,10}$/.test(cik)?cik.padStart(10,'0'):cik;}
/** Switch options only when the issuer has coverage rows for BOTH markets; each goes to that market's primary (else first) current ticker. */
export function streamOptions(issuer:ResolvedIssuer,coverage:CoverageRow[]):StreamOption[]{
 const out:StreamOption[]=[];
 for(const m of ['US','CN'] as const){
  if(!coverage.some(c=>c.market===m))continue;
  const s=securityChips(issuer.securities,'').find(c=>c.market===m);
  if(s)out.push({market:m,ticker:s.ticker});
 }
 return out.length>=2?out:[];
}
export function factStateOf(issuer:ResolvedIssuer|null,market:Market|null,coverage:CoverageRow|null):FactState{
 if(!issuer)return 'no_issuer';
 if(market===null){
  const ms=issuer.securities.map(s=>securityMarket(s.ticker));
  return ms.length>0&&ms.every(m=>m==='HK')?'hk_pending':'no_facts';
 }
 return coverage?'ok':'no_facts';
}
/** Freshness label key: a null/unknown status (or no dataset row) is 'unknown', never a missing message key. */
export function freshnessKey(status:string|null|undefined):'fresh'|'stale'|'error'|'missing'|'unknown'{
 return status==='fresh'||status==='stale'||status==='error'||status==='missing'?status:'unknown';
}
