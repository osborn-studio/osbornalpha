// src/lib/entities/identifiers/apply.ts
// Writes an IdentifierPlan (spec §4.1.2 "写入"): guarded column sets (only an empty column of an open
// row), provenance-only completions, claim/1 claims, ownership quarantines and the
// entities.isin_hkex_vs_gleif text reconciliations (written directly until record.ts exists;
// contract issue 7). Each column write goes through the migration-one function set_security_identifier
// (plan audit R2): under the security-row lock it writes the empty column and merges its ONE provenance
// key with `||` in the same UPDATE, so a concurrent write of the other column or a claim resolution never
// loses its evidence key, and a failed sibling write never leaves provenance describing a value that is
// not stored. fetched = rows with a table outcome (claim filing failures count as failed but are not
// rows, so they stay out of fetched); claims-only outcomes are reported in claims_summary
// (informational), a correct_identifier also as identifier_mismatch (degrades the batch to partial).
// Follow-up claims of a write are filed only when its value is stored (written or duplicate).
import {randomUUID} from 'node:crypto';
import {callRpc,type TableClient} from '../../db/table-client';
import {emptyCounts,type BatchCounts,type BatchError} from '../../dq/batches';
import {DATASETS} from '../../dq/datasets';
import {fileClaim,isUnique,type ClaimInput} from '../claims';
import {errorMessage,parkConflict,withSkippedSummary} from '../load-sec';
import {ISIN_RECON_PAIR,type IdentifierPlan,type SecurityWrite} from './plan';

export interface IdentifierApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;claimsSummary:Record<string,number>}

type SetOutcome='written'|'duplicate'|'conflict'|'not_found';
const claimFor=(w:SecurityWrite,op:'set_identifier'|'correct_identifier',current:string|null):ClaimInput=>({
 issuer_id:w.issuer_id,id_type:w.column,value:w.value,source:w.source,op,detail:{
  schema:'claim/1',evidence_kind:w.evidenceKind,target:{issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from},
  params:op==='set_identifier'?{}:{expected_current:current,new_value:w.value},evidence:w.evidence,sources:w.sources,provenance_written:w.patch,
 },
});

export async function applyIdentifierPlan(tables:TableClient,plan:IdentifierPlan,opts:{batchId:string;dataset:string}):Promise<IdentifierApplyResult>{
 const counts=emptyCounts();
 const errors:BatchError[]=[];
 const claimsSummary:Record<string,number>={};
 let claimFailures=0;
 counts.duplicates=plan.duplicates;
 const fileOne=async(c:ClaimInput)=>{
  try{
   const created=await fileClaim(tables,c);
   const k=created?c.op:`${c.op}_appended`;
   claimsSummary[k]=(claimsSummary[k]??0)+1;
   if(c.op==='correct_identifier')errors.push({code:'identifier_mismatch',key:`${c.detail.target.ticker??c.issuer_id}:${c.id_type}`,message:`${String(c.detail.params.expected_current)} -> ${c.value}`});
  }catch(e){counts.failed++;claimFailures++;errors.push({code:'claim_error',key:`${c.issuer_id}:${c.id_type}:${c.value}`,message:errorMessage(e)});}
 };

 for(const w of plan.writes){
  const key={issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from};
  const where=`${w.ticker}:${w.valid_from}:${w.column}`;
  try{
   const outcome=await callRpc(tables,'set_security_identifier',{p_issuer:w.issuer_id,p_ticker:w.ticker,p_valid_from:w.valid_from,p_column:w.column,p_value:w.value,p_provenance:w.patch}) as SetOutcome;
   if(outcome==='written'){counts.inserted++;for(const f of w.followUps??[])await fileOne(f);continue;}
   if(outcome==='duplicate'){counts.duplicates++;for(const f of w.followUps??[])await fileOne(f);continue;}
   if(outcome==='conflict'){
    // another value is stored: read it for the claim's expected_current (resolution re-checks it under its own guard)
    const [cur]=await tables.select('issuer_securities',{...key,valid_to:null},{limit:1});
    const stored=cur?.[w.column]==null?null:String(cur[w.column]);
    if(stored===null){counts.failed++;errors.push({code:'row_changed',key:where,message:'stored value changed after conflict'});continue;}
    if(stored===w.value){counts.duplicates++;for(const f of w.followUps??[])await fileOne(f);continue;}
    await fileOne(claimFor(w,'correct_identifier',stored));continue;
   }
   counts.failed++;errors.push({code:'row_changed',key:where,message:outcome==='not_found'?'row missing or closed':`unexpected outcome ${String(outcome)}`});
  }catch(e){
   if(w.column==='isin'&&isUnique(e)){
    await fileOne(claimFor(w,'set_identifier',null));
    await parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey:`isin:${w.value}`,reasonCode:'ownership_conflict',
     detail:{reason:'isin_held_by_other_row',ticker:w.ticker,valid_from:w.valid_from},payload:{issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from,isin:w.value},batchId:opts.batchId},
     counts,errors,{code:'ownership_conflict',key:`isin:${w.value}`});
    continue;
   }
   counts.failed++;errors.push({code:'identifier_write_error',key:where,message:errorMessage(e)});
  }
 }
 for(const q of plan.quarantines){
  await parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey:q.naturalKey,reasonCode:q.reasonCode,detail:q.detail,payload:q.payload,batchId:opts.batchId},
   counts,errors,{code:q.reasonCode,key:q.naturalKey});
 }
 for(const c of plan.claims)await fileOne(c);
 for(const r of plan.recons){
  try{
   await tables.insert('dq_reconciliations',{
    id:randomUUID(),dataset:DATASETS.reconcile(ISIN_RECON_PAIR),pair:ISIN_RECON_PAIR,kind:'text',outcome:'compared',
    left_source:r.leftSource,right_source:r.rightSource,natural_key:r.naturalKey,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:0,passed:r.passed,
    detail:{left_text:r.leftText,right_text:r.rightText,...r.detail,tolerance_rule:'text_equal'},batch_id:opts.batchId,
    cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:new Date().toISOString(),
   });
  }catch(e){errors.push({code:'reconciliation_error',key:r.naturalKey,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed-claimFailures;
 const skippedSummary:Record<string,number>={};
 for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
 const lead:BatchError[]=Object.keys(claimsSummary).length?[{code:'claims_summary',message:JSON.stringify(claimsSummary)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,claimsSummary};
}
