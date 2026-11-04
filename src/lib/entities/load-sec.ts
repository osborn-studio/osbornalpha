// Load US issuers and their listed securities from SEC company_tickers_exchange.json.
// planSecLoad is pure. applySecLoad performs the public writes through a TableClient and returns
// receipt counts; the script owns the ingest batch. SEC exchange membership does not establish
// domicile and the file carries no share class, so country_code is never set and share_class is
// always 'unknown'.
import type {TableClient} from '../db/table-client';
import type {BatchCounts,BatchError,BatchStatus} from '../dq/batches';
import {emptyCounts} from '../dq/batches';
import {normalizeSecurityTicker} from '../securities/ticker';
import type {SecExchangeParse,SecExchangeRow} from '../research/entity-keys/parsers';
import {MAX_SEC_ROWS} from '../research/entity-keys/parsers';
import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';

export const SEC_SOURCE='sec_company_tickers_exchange';

type FieldProvenance={source:string;as_of:string};
export interface PlannedIssuer{cik:string;canonical_name_en:string;provenance:{cik:FieldProvenance;canonical_name_en:FieldProvenance}}
export interface PlannedSecurity{cik:string;ticker:string;share_class:'unknown';is_primary:boolean;valid_from:string;source:string;provenance:{exchange:string}}
export interface SecLoadPlan{asOf:string;issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:string[]}

/**
 * The SEC ticker as written (upper-cased) wins over its normalized form, so `BRK.A` never
 * collapses to `BRK` through Wind-suffix stripping when the universe lists `BRK.A`.
 */
function universeTicker(raw:string,universe:ReadonlySet<string>):string|null{
 const exact=raw.trim().toUpperCase();
 if(universe.has(exact))return exact;
 const normalized=normalizeSecurityTicker(raw,'US');
 return normalized&&universe.has(normalized)?normalized:null;
}

/**
 * Keep rows whose ticker is in the US universe. One issuer per CIK (first row's name); the first
 * kept ticker of a CIK in file order is primary. `skipped` lists raw tickers not in the universe.
 * A ticker repeated across rows is kept each time so the writer reports it as duplicate/conflict.
 */
export function planSecLoad(rows:SecExchangeRow[],universe:ReadonlySet<string>,asOf:string):SecLoadPlan{
 if(rows.length>MAX_SEC_ROWS)throw new Error('too_many_rows');
 const prov=():FieldProvenance=>({source:SEC_SOURCE,as_of:asOf});
 const issuers=new Map<string,PlannedIssuer>();
 const securities:PlannedSecurity[]=[];
 const skipped:string[]=[];
 for(const r of rows){
  const ticker=universeTicker(r.ticker,universe);
  if(!ticker){skipped.push(r.ticker);continue;}
  const first=!issuers.has(r.cik);
  if(first)issuers.set(r.cik,{cik:r.cik,canonical_name_en:r.name,provenance:{cik:prov(),canonical_name_en:prov()}});
  securities.push({cik:r.cik,ticker,share_class:'unknown',is_primary:first,valid_from:asOf,source:SEC_SOURCE,provenance:{exchange:r.exchange}});
 }
 return {asOf,issuers:[...issuers.values()],securities,skipped};
}

export interface ApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>}

export const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);

/** Count skip reasons by their code (the part before ':') so the summary stays short. */
export function summarizeSkips(reasons:Iterable<string>):Record<string,number>{
 const out:Record<string,number>={};
 for(const r of reasons){const code=r.split(':')[0];out[code]=(out[code]??0)+1;}
 return out;
}

/** Skipped items cannot be counted in BatchCounts, so they surface as ONE leading error entry. */
export function withSkippedSummary(errors:BatchError[],summary:Record<string,number>):BatchError[]{
 return Object.keys(summary).length?[{code:'skipped_summary',message:JSON.stringify(summary)},...errors]:errors;
}

/**
 * Shared status/exit/freshness policy for the entity loaders: exit 1 when the batch failed or any
 * row failed; the freshness attempt is ok only on success, or on a partial run with no failures
 * that actually landed rows (a run that only quarantined is not ok).
 */
export function loaderOutcome(status:BatchStatus,counts:BatchCounts):{ok:boolean;exitCode:0|1}{
 const ok=status==='success'||(status==='partial'&&counts.failed===0&&counts.inserted+counts.duplicates>0);
 return {ok,exitCode:status==='failed'||counts.failed>0?1:0};
}

export interface SecApplyOptions{asOf:string;batchProducerMeta:{sourceRows:number;rejected:SecExchangeParse['rejected']}}

/**
 * Writes the plan to the public issuer master. `fetched` is the number of SEC data rows; each
 * issuer and security write has one outcome; securities whose issuer failed or was quarantined
 * count as failed (`blocked_by_issuer`). Rejected and not-in-universe rows are summarized.
 */
export async function applySecLoad(client:TableClient,plan:SecLoadPlan,opts:SecApplyOptions):Promise<ApplyResult>{
 if(plan.asOf!==opts.asOf)throw new Error('as_of_mismatch');
 const counts=emptyCounts();
 const errors:BatchError[]=[];
 counts.fetched=opts.batchProducerMeta.sourceRows;
 const skippedSummary=summarizeSkips([
  ...opts.batchProducerMeta.rejected.map(r=>`rejected_${r.reason}`),
  ...plan.skipped.map(()=>'not_in_universe'),
 ]);
 if(plan.issuers.length===0){
  errors.push({code:'empty_plan',message:'no SEC row matched the US universe'});
  return {counts,errors:withSkippedSummary(errors,skippedSummary),skippedSummary};
 }

 const issuerByCik=new Map<string,string>();
 for(const issuer of plan.issuers){
  try{
   const res=await upsertIssuerByIdentifiers(client,issuer);
   if(res.conflict||!res.issuer_id){counts.quarantined++;errors.push({code:'issuer_conflict',key:issuer.cik,message:res.reason});continue;}
   issuerByCik.set(issuer.cik,res.issuer_id);
   if(res.created)counts.inserted++;else counts.duplicates++;
  }catch(e){counts.failed++;errors.push({code:'issuer_error',key:issuer.cik,message:errorMessage(e)});}
 }

 for(const sec of plan.securities){
  const issuer_id=issuerByCik.get(sec.cik);
  if(!issuer_id){counts.failed++;errors.push({code:'blocked_by_issuer',key:sec.ticker,message:sec.cik});continue;}
  const {cik:_cik,...rest}=sec;
  try{
   const res=await attachSecurity(client,{...rest,issuer_id});
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate')counts.duplicates++;
   else{counts.quarantined++;errors.push({code:'ownership_conflict',key:sec.ticker});}
  }catch(e){
   counts.failed++;
   const msg=errorMessage(e);
   errors.push({code:msg==='issuer_not_active'?'issuer_not_active':'security_error',key:sec.ticker,message:msg});
  }
 }
 return {counts,errors:withSkippedSummary(errors,skippedSummary),skippedSummary};
}
