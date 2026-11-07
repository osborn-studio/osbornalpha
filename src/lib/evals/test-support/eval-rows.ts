// src/lib/evals/test-support/eval-rows.ts
// Test support (not a test file): complete dq_eval_runs / dq_eval_case_results rows as PostgREST returns
// them (memoryTableClient applies no defaults, so every column is written), with the canary value planted
// in places the admin whitelist must drop: an extra summary key, an extra nested summary key, and extra
// case detail keys.
import {memoryTableClient} from '../../db/memory-table-client';
import type {Row,TableClient} from '../../db/table-client';

export const SENTINEL='918273645.5';
export const RUN_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const RUN_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const evalTables=():TableClient&{rows(t:string):Row[]}=>memoryTableClient({dq_eval_runs:['run_id'],dq_eval_case_results:['eval_run_id','case_id']});

export function summaryRow(p:Record<string,unknown>={}):Record<string,unknown>{
 return {population:3,required:3,
  correctness:{pass:2,fail:1,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0,hidden:SENTINEL},
  coverage:{evaluated:3,evaluated_optional:0,missing_required:0,missing_optional:0,not_visible:0,skipped:0},
  execution:{read_error:0,truncated:0,subset:false},
  thresholds:{max_fail:0,min_coverage_optional:'0.95'},
  gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},
  gate:'fail',evidence_class:'truth',reconciliations_truncated:false,
  canary:SENTINEL,...p};
}
export function runRow(p:Record<string,unknown>={}):Row{
 return {run_id:RUN_A,kind:'official_reconciliation',module:'facts',mode:'report',privileged:true,artifact_class:'public',set_id:'facts/synthetic-us',set_version:1,set_sha256:'c'.repeat(64),
  evaluator_code_version:'d'.repeat(40),started_at:'2026-11-05T10:00:00.000Z',finished_at:'2026-11-05T10:01:00.000Z',status:'failed',summary:summaryRow(),
  report_ref:'docs/evals/2026-11-05/facts-official_reconciliation-aaaaaaaa.json',report_sha256:'e'.repeat(64),triggered_by:'script',...p};
}
export function caseRow(runId:string,caseId:string,p:Record<string,unknown>={}):Row{
 return {eval_run_id:runId,case_id:caseId,result:'fail',reason:'value',left_text:'383285000001',right_text:'383285000000',abs_diff:'1',rel_diff:'0.0000000000',tolerance:'0',
  detail:{locator:{page:28,table:'CONSOLIDATED STATEMENTS OF OPERATIONS',row:'Total net sales'},document_id:{kind:'edgar_accession',value:'0009990601-24-000001'},note:SENTINEL,debug:{echo:SENTINEL}},
  created_at:'2026-11-05T10:00:30.000Z',...p};
}
