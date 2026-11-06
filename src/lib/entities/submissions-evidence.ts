// src/lib/entities/submissions-evidence.ts
// Writes the identity evidence of one SEC submissions snapshot (spec §4.3.3): formerNames as
// security_aliases on the issuer's primary row, 8-A/25 filings as evidence_only claims, and
// tickers[] that SEC lists but this database does not hold as first_observed rows (only tickers in
// stocks_universe; a ticker held by another issuer is quarantined as ownership_conflict). Tickers
// this database holds but SEC no longer lists are handled by load-sec ticker-change detection.
import type {TableClient} from '../db/table-client';
import {emptyCounts,type BatchError} from '../dq/batches';
import {normalizeSecurityTicker} from '../securities/ticker';
import {fileClaim,isUnique} from './claims';
import {submissionsEvidenceClaims,type SubmissionsSnapshot} from './identifiers/sec-submissions';
import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
import {attachSecurity} from './securities';

export interface SubmissionsApplyInput{issuerId:string;primaryTicker:string|null;snapshot:SubmissionsSnapshot;asOf:string;batchId:string;dataset:string;universe:ReadonlySet<string>}

export async function applySubmissionsEvidence(tables:TableClient,input:SubmissionsApplyInput):Promise<ApplyResult&{claims:Record<string,number>}>{
 const counts=emptyCounts();const errors:BatchError[]=[];
 const skippedSummary:Record<string,number>={};const claims:Record<string,number>={};
 const skip=(k:string)=>{skippedSummary[k]=(skippedSummary[k]??0)+1;};
 const names=input.snapshot.parsed.formerNames;
 if(input.primaryTicker){
  for(const f of names){
   try{
    await tables.insert('security_aliases',{alias:f.name,ticker:input.primaryTicker,alias_type:'name',source:'sec_submissions',created_at:new Date().toISOString()});
    counts.inserted++;
   }catch(e){if(isUnique(e))counts.duplicates++;else{counts.failed++;errors.push({code:'alias_error',key:f.name,message:errorMessage(e)});}}
  }
 }else if(names.length)skip('no_primary_ticker');
 for(const c of submissionsEvidenceClaims(input.issuerId,input.snapshot,input.asOf)){
  try{const created=await fileClaim(tables,c);const k=created?'evidence_only':'evidence_only_appended';claims[k]=(claims[k]??0)+1;}
  catch(e){counts.failed++;errors.push({code:'claim_error',key:c.value,message:errorMessage(e)});}
 }
 const held=new Set((await tables.select('issuer_securities',{issuer_id:input.issuerId,valid_to:null})).map(r=>String(r.ticker)));
 for(const raw of input.snapshot.parsed.tickers){
  const ticker=input.universe.has(raw)?raw:normalizeSecurityTicker(raw,'US');
  if(!ticker||!input.universe.has(ticker)){skip('ticker_not_in_universe');continue;}
  if(held.has(ticker)){counts.duplicates++;continue;}
  try{
   const res=await attachSecurity(tables,{issuer_id:input.issuerId,ticker,share_class:'unknown',is_primary:false,valid_from:input.asOf,valid_from_method:'first_observed',source:'sec_submissions',provenance:{valid_from:{source:'sec_submissions',as_of:input.asOf,evidence_sha256:input.snapshot.main.sha256}}});
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate')counts.duplicates++;
   else await parkConflict(tables,{dataset:input.dataset,table:'issuer_securities',naturalKey:`${ticker}:${input.asOf}`,reasonCode:'ownership_conflict',
    detail:{reason:'ticker_owned_by_other_issuer',source:'sec_submissions'},payload:{issuer_id:input.issuerId,ticker,valid_from:input.asOf},batchId:input.batchId},
    counts,errors,{code:'ownership_conflict',key:ticker});
  }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:ticker,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.quarantined+counts.failed;
 const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims};
}
