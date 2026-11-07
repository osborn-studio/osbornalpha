// src/lib/dq/reconcile/record.ts
// Out-of-cycle reconciliation rows (spec §5.1): sec.filing_date_vs_submissions, sec.filer_category and
// entities.isin_hkex_vs_gleif are recorded inline by their producers. Only action 'record' exists here:
// no work item, no visibility change, and cycle_id/issuer_id/market/attempt all null (constraint
// dq_reconciliations_cycle_cols). Cycle pairs must go through run.ts / apply_reconcile_result. The kind
// rules mirror the two table constraints (numeric compared needs both sides; text/date keep the values in
// detail.left_text/right_text and leave every numeric column null) so a bad row fails here with a code.
// Dedupe is best-effort: re-recording identical evidence for the same (pair, natural_key) writes nothing, judged
// on the exact strings kept in detail (left_exact/right_exact, left_text/right_text) — never on the numeric
// columns, which PostgREST returns as JSON numbers. There is no unique constraint for out-of-cycle rows and
// they have no business effect, so concurrent writers may each insert one row. Readers (the /admin/dq
// dashboard read model, Task 19a) must therefore count DISTINCT (pair, natural_key), not rows.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../../db/table-client';
import {DATASETS} from '../datasets';
import {compareDecimal,isDecimalText} from './decimal';
import {canonicalDecimal} from '../../facts/json-numbers';
import {CYCLE_PAIR_IDS,RECONCILE_OUTCOMES,RECONCILE_PAIR_IDS} from './types';
import type {ReconcilePairId,ReconcileResultInput} from './types';

const isStr=(v:unknown):v is string=>typeof v==='string';
/** Numeric columns are written canonical; ratio columns (rel_diff) are derived/display, pass/fail is `passed`, decided by exact comparison.
 * detail.tolerance_exact / abs_diff_exact keep the exact values next to the columns. */
export type RecordInput=ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null};
export async function recordReconciliation(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<string>{return (await recordReconciliationDetailed(tables,input,opts)).id;}
/** Re-recording the same (pair, natural_key) with identical outcome, values and text sides writes nothing and answers the existing row: {duplicate:true} (a re-run over unchanged evidence adds no rows). */
export async function recordReconciliationDetailed(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<{id:string;duplicate:boolean}>{
 if(!(RECONCILE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('invalid_pair');
 if((CYCLE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('cycle_pair_requires_runner');
 if(input.action!=='record')throw new Error('record_action_only');
 if(input.item!==undefined)throw new Error('record_has_no_item');
 if(!(['numeric','text','date'] as readonly unknown[]).includes(input.kind))throw new Error('invalid_kind');
 if(!(RECONCILE_OUTCOMES as readonly unknown[]).includes(input.outcome))throw new Error('invalid_outcome');
 const numeric=input.kind==='numeric';
 if(numeric&&input.outcome==='compared'&&(input.left_value===null||input.right_value===null))throw new Error('numeric_sides_required');
 if(!numeric&&(input.left_value!==null||input.right_value!==null||input.abs_diff!==null||input.rel_diff!==null))throw new Error('nonnumeric_sides_must_be_null');
 for(const v of [input.left_value,input.right_value,input.abs_diff,input.rel_diff])if(v!==null&&(!isStr(v)||!isDecimalText(v)))throw new Error('invalid_decimal_field');
 if(!isStr(input.tolerance)||!isDecimalText(input.tolerance)||compareDecimal(input.tolerance,'0')<0)throw new Error('invalid_tolerance');
 if(input.abs_diff!==null&&compareDecimal(input.abs_diff,'0')<0)throw new Error('negative_abs_diff');
 if(input.rel_diff!==null&&compareDecimal(input.rel_diff,'0')<0)throw new Error('negative_rel_diff');
 if(input.outcome!=='compared'&&input.passed)throw new Error('passed_requires_compared');
 const c=(v:string|null)=>v===null?null:canonicalDecimal(v);
 const tolerance=canonicalDecimal(input.tolerance),abs=c(input.abs_diff);
 const text=(d:unknown,k:string)=>{const v=(d as Record<string,unknown>|null|undefined)?.[k];return v===undefined?null:v;};
 const lx=c(input.left_value),rx=c(input.right_value);
 const lt=text(input.detail,'left_text'),rt=text(input.detail,'right_text');
 for(const e of await tables.select('dq_reconciliations',{pair:input.pair,natural_key:input.natural_key}))
  if(e.outcome===input.outcome&&e.passed===input.passed&&text(e.detail,'left_exact')===lx&&text(e.detail,'right_exact')===rx&&text(e.detail,'left_text')===lt&&text(e.detail,'right_text')===rt)return {id:String(e.id),duplicate:true};
 const id=randomUUID();
 await tables.insert('dq_reconciliations',{
  id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
  left_source:input.left_source,right_source:input.right_source,left_value:c(input.left_value),right_value:c(input.right_value),
  abs_diff:abs,rel_diff:c(input.rel_diff),tolerance,passed:input.passed,
  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(lx===null?{}:{left_exact:lx}),...(rx===null?{}:{right_exact:rx}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
  batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:(opts.now??(()=>new Date()))().toISOString(),
 });
 return {id,duplicate:false};
}
