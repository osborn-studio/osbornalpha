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
