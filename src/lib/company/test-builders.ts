// src/lib/company/test-builders.ts
// Deterministic builders for company unit tests (plan Task 5). Not a test file: Tasks 6–8 and the
// route/UI tasks import it. sequenced() delegates disclosure_seq / is_current / is_revision to the
// landed facts read semantics (src/lib/facts/read.ts::sequencesOf), never a second implementation.
import {sequencesOf} from '@/lib/facts/read';
import type {FactRow,Market} from '@/lib/facts/types';
import type {FilingSummary} from './types';

export const ISSUER='11111111-1111-4111-8111-111111111111';
export const uuidOf=(prefix:string,n:number)=>`${prefix.padEnd(8,'0').slice(0,8)}-0000-4000-8000-${String(n).padStart(12,'0')}`;
let factN=0,filingN=0;
/** Resets the id counters (call in beforeEach when a test compares ids across builds). */
export function resetBuilders(){factN=0;filingN=0;}
export function filingSummary(o:Partial<FilingSummary>={}):FilingSummary{
 const id=o.filingId??uuidOf('f1',++filingN);
 return {filingId:id,formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-12-31',availableDate:'2024-02-01',sourceRef:`ref-${id.slice(-6)}`,source:'edgar',url:`https://www.sec.gov/Archives/edgar/data/1/${id.slice(-6)}/`,documentUrl:null,citation:'edgar',linkAttempts:0,factCount:0,mappingGen:1,...o};
}
export function factRow(filing:FilingSummary,o:Partial<FactRow>={}):FactRow{
 const n=++factN;
 const v=o.value_text??o.value??'100';
 return {fact_id:uuidOf('fa',n),issuer_id:ISSUER,market:'US' as Market,filing_id:filing.filingId,run_id:uuidOf('aa',1),concept:'revenue',source_concept:'us-gaap:Revenues',statement:'IS',
  period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',unit:'USD',consolidation:'consolidated',available_date:filing.availableDate,mapping_gen:filing.mappingGen,mapping_version:'facts-map/1',status:'ok',
  raw_hash:'0'.repeat(64),created_at:`2026-01-01T00:00:00.${String(n%1000).padStart(3,'0')}Z`,...o,value:v,value_text:v};
}
/** History envelope rows as company_read_snapshot returns them (ok rows, sequence fields filled). */
export function sequenced(rows:FactRow[],filings:FilingSummary[],asOf='2099-12-31'):FactRow[]{
 return sequencesOf(rows,{asOf,filings:new Map(filings.map(f=>[f.filingId,f.mappingGen])),history:true});
}
/** Sets factCount of each filing to its number of ok rows (what company_read_snapshot computes). */
export function withCounts(filings:FilingSummary[],rows:FactRow[]):FilingSummary[]{
 return filings.map(f=>({...f,factCount:rows.filter(r=>r.filing_id===f.filingId&&r.status==='ok').length}));
}
/** Seeded PRNG (mulberry32) for property tests. */
export function rng(seed:number):()=>number{
 let a=seed>>>0;
 return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
