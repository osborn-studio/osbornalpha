// GET /api/companies/[ticker]/filings: same-market published filings across the resolved issuer's
// lineage. Each member uses company_read_snapshot so factCount and filings share a database state.
// Membership and the complete revision vector fence multi-member reads; retry instead of mixing states.
import {lineageRevsEqual} from '@/lib/facts/db';
import type {LineageRev} from '@/lib/facts/types';
import {RouteError,type Handler} from '../route';
import type {FilingSummary} from '../types';

export const FILINGS_PARAMS=['asOf'] as const;
export interface FilingsDto{issuerId:string;ticker:string;market:'US'|'CN';asOf:string|null;stateRev:number;lineage:string[];stateRevs:LineageRev[];filings:FilingSummary[]}
export const filingsHandler:Handler=async(ctx)=>{
 const {issuer,deps,asOf}=ctx;
 for(let attempt=0;attempt<3;attempt++){
  const lineage=[...new Set(await deps.facts.lineageOf(issuer.issuerId))].sort();
  if(!lineage.includes(issuer.issuerId))continue;
  // A single member needs only its atomic snapshot; the membership check also catches a new merge.
  const before=lineage.length>1?await deps.facts.stateRevs(lineage,issuer.market):null;
  const snapshots=await Promise.all(lineage.map(id=>deps.snapshot(id,issuer.market,{concepts:['revenue'],asOf,history:false,limit:1})));
  const stateRevs=lineage.map((issuer_id,i)=>({issuer_id,state_rev:snapshots[i].stateRev}));
  const afterLineage=[...new Set(await deps.facts.lineageOf(issuer.issuerId))].sort();
  if(lineage.join(',')!==afterLineage.join(','))continue;
  if(before){
   const after=await deps.facts.stateRevs(lineage,issuer.market);
   if(!lineageRevsEqual(before,stateRevs)||!lineageRevsEqual(before,after))continue;
  }
  const filings=snapshots.flatMap(s=>s.filings).sort((a,b)=>a.availableDate<b.availableDate?1:a.availableDate>b.availableDate?-1:a.filingId<b.filingId?1:a.filingId>b.filingId?-1:0);
  const stateRev=stateRevs.find(r=>r.issuer_id===issuer.issuerId)!.state_rev;
  const body:FilingsDto={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:ctx.asOfGiven?asOf:null,stateRev,lineage,stateRevs,filings};
  return {body,empty:filings.length===0};
 }
 throw new RouteError('lineage_unstable',503,'issuer lineage changed during filings read');
};
