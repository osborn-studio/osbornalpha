// src/lib/company/page-data.ts
// Server loader of /stock/[ticker] (plan 2026-11-06 Task 11; spec §5.1, §5.2, §5.7, §0 #69):
// resolveIssuer (header identity, today's ownership, one merge hop) and resolvePublicIssuer (market
// from the matched security row) run in parallel, then ONE coverageOf for the issuer. Never throws:
// failures become errorCode and the page renders an error card, never a fallback source.
import type {TableClient} from '@/lib/db/table-client';
import {resolveIssuer,type ResolvedIssuer} from '@/lib/entities/resolve';
import {resolvePublicIssuer} from '@/lib/facts/public-route';
import {inferCoreMarket,normalizeSecurityTicker} from '@/lib/securities/ticker';
import type {CoverageRow,Market} from './types';
import {factStateOf,streamOptions,type FactState,type StreamOption} from './header-model';

export interface CompanyPageData{
 ticker:string;today:string;issuer:ResolvedIssuer|null;market:Market|null;publicTicker:string|null;
 coverage:CoverageRow|null;coverageAll:CoverageRow[];streams:StreamOption[];factState:FactState;errorCode:'ambiguous_ticker'|'internal'|null;
}
export interface PageDataDeps{tables:TableClient;coverageOf:(issuerIds:string[])=>Promise<CoverageRow[]>}

export async function loadCompanyPageData(deps:PageDataDeps,rawTicker:string,today:string):Promise<CompanyPageData>{
 const base:CompanyPageData={ticker:rawTicker,today,issuer:null,market:null,publicTicker:null,coverage:null,coverageAll:[],streams:[],factState:'no_issuer',errorCode:null};
 try{
  const given=rawTicker.trim().toUpperCase().replace(/\//g,'.');
  const [issuer,pub]=await Promise.all([resolveIssuer(deps.tables,{ticker:given},{today}),resolvePublicIssuer(deps.tables,given,today)]);
  if(!issuer)return base;
  const coverageAll=await deps.coverageOf([issuer.issuer_id]);
  const market=pub?.market??null;
  const coverage=market?coverageAll.find(c=>c.market===market)??null:null;
  return {...base,issuer,market,publicTicker:pub?.ticker??null,coverage,coverageAll,streams:streamOptions(issuer,coverageAll),factState:factStateOf(issuer,market,coverage)};
 }catch(e){
  const ambiguous=e instanceof Error&&e.message==='ambiguous_owner';
  if(!ambiguous)console.error('[company/page-data]',e instanceof Error?e.message:e);
  return {...base,errorCode:ambiguous?'ambiguous_ticker':'internal'};
 }
}

/** Candidate stocks_universe tickers: same normalisation as page-data (`/` → `.`), plus the market-suffixed form (600519 → 600519.SH). */
export function universeCandidates(ticker:string):string[]{
  const given = ticker.trim().toUpperCase().replace(/\//g, '.');
  const core = inferCoreMarket(given);
  const normalised = core ? normalizeSecurityTicker(given, core) : null;
  return [...new Set([given, ...(normalised ? [normalised] : [])])];
}

