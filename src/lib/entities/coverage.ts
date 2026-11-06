// src/lib/entities/coverage.ts
// Success-criteria measurements (spec §1.1): E1 = FIGI/ISIN coverage of the open security rows of
// US in-scope issuers (fact_sync_scope market 'US', priority > 0); E2 (Task 5a) = listing-date
// windows on research-queue A/H rows. Pure functions over rows the coverage script reads; integer
// arithmetic only, percentages truncated to two decimals and never used for thresholds.
import type {Row} from '../db/table-client';

export interface Ratio{num:number;den:number;pct:string|null}
export function ratio(num:number,den:number):Ratio{
 if(den===0)return {num,den,pct:null};
 const bp=Math.floor(num*10000/den);
 return {num,den,pct:`${Math.floor(bp/100)}.${String(bp%100).padStart(2,'0')}`};
}
/** num/den >= pct% by cross-multiplication; an empty denominator never passes. */
export const meetsThreshold=(r:Ratio,pct:number)=>r.den>0&&r.num*100>=r.den*pct;

export interface E1Result{figi:Ratio;isin:Ratio;passes:{figi:boolean;isin:boolean}}
export function coverageE1(input:{scope:readonly Row[];securities:readonly Row[];issuers:readonly Row[]}):E1Result{
 const inScope=new Set(input.scope.filter(s=>s.market==='US'&&typeof s.priority==='number'&&s.priority>0).map(s=>String(s.issuer_id)));
 const withLei=new Set(input.issuers.filter(i=>typeof i.lei==='string'&&i.lei!=='').map(i=>String(i.issuer_id)));
 const rows=input.securities.filter(s=>s.valid_to==null&&inScope.has(String(s.issuer_id)));
 const isinRows=rows.filter(s=>withLei.has(String(s.issuer_id)));
 const figi=ratio(rows.filter(s=>s.figi!=null).length,rows.length);
 const isin=ratio(isinRows.filter(s=>s.isin!=null).length,isinRows.length);
 return {figi,isin,passes:{figi:meetsThreshold(figi,95),isin:meetsThreshold(isin,90)}};
}

export interface E2Result{backfillable:Ratio;not_backfillable:number;open_quarantine:number;passes:boolean}
/**
 * E2 (spec §1.1): research-queue A/H rows. Backfillable = the earliest row of its ticker in this
 * database, stocks_universe.list_date non-null, and no open window_evidence_conflict /
 * ownership_conflict item keyed `${ticker}:${valid_from}`. Target: 100% listing_date.
 */
export function coverageE2(input:{rows:readonly Row[];listDates:ReadonlyMap<string,string|null>;queueIssuers:ReadonlySet<string>;openQuarantineKeys:ReadonlySet<string>}):E2Result{
 const earliest=new Map<string,string>();
 for(const r of input.rows){const t=String(r.ticker),vf=String(r.valid_from);const e=earliest.get(t);if(e===undefined||vf<e)earliest.set(t,vf);}
 const key=(r:Row)=>`${r.ticker}:${r.valid_from}`;
 const ah=input.rows.filter(r=>/\.(SH|SZ|HK)$/.test(String(r.ticker))&&input.queueIssuers.has(String(r.issuer_id)));
 const back=ah.filter(r=>earliest.get(String(r.ticker))===String(r.valid_from)&&!!input.listDates.get(String(r.ticker))&&!input.openQuarantineKeys.has(key(r)));
 const backfillable=ratio(back.filter(r=>r.valid_from_method==='listing_date').length,back.length);
 return {backfillable,not_backfillable:ah.length-back.length,open_quarantine:ah.filter(r=>input.openQuarantineKeys.has(key(r))).length,passes:backfillable.den>0&&backfillable.num===backfillable.den};
}
