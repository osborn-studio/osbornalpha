// src/lib/company/handlers/filings.ts
// GET /api/companies/[ticker]/filings?asOf= (spec §5.5, §0.1 item 3; moved here from Task 11 at integration):
// every published filing (mapping_gen > 0) with available_date <= asOf as FilingSummary (fiscal period,
// citation, linkAttempts, factCount) from ONE company_read_snapshot statement — its filings sub-select is
// independent of the facts limit, so the facts part is one concept with limit 1. No financial values → no
// evidence gate; the admin twin has the same body (private, no-store). Newest available_date first.
import type {Handler} from '../route';
import type {FilingSummary} from '../types';

export const FILINGS_PARAMS=['asOf'] as const;
export interface FilingsDto{issuerId:string;ticker:string;market:'US'|'CN';asOf:string|null;stateRev:number;filings:FilingSummary[]}
export const filingsHandler:Handler=async(ctx)=>{
 const {issuer,deps,asOf}=ctx;
 const snap=await deps.snapshot(issuer.issuerId,issuer.market,{concepts:['revenue'],asOf,history:false,limit:1});
 const filings=[...snap.filings].sort((a,b)=>a.availableDate<b.availableDate?1:a.availableDate>b.availableDate?-1:a.filingId<b.filingId?1:a.filingId>b.filingId?-1:0);
 const body:FilingsDto={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:ctx.asOfGiven?asOf:null,stateRev:snap.stateRev,filings};
 return {body,empty:filings.length===0};
};
