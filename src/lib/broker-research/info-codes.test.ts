// Informational broker batch codes (spec §7.4).
import {describe,expect,it} from 'vitest';
import {INFO_CODES,batchStatusFromCounts,isInfoError} from '../dq/batches';
describe('broker research batch codes',()=>{
 it('preserves existing codes and adds eval receipt absence',()=>{
  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary','eval_receipt_absent']);
 });
 it('only eval receipt absence is informational among broker errors',()=>{
  for(const code of ['span_unverified_summary','rules_failed_summary','f3_failed','f3_timeout','f3_unavailable','lease_lost','lease_expired','llm_unavailable','llm_quota','llm_failed','llm_schema_invalid','extract_deadline','storage_failed','rules_error','document_insert_lost'])expect(isInfoError({code})).toBe(false);
  const counts={fetched:3,inserted:2,duplicates:0,versioned:0,quarantined:1,failed:0};
  expect(batchStatusFromCounts(counts,[{code:'eval_receipt_absent'}])).toBe('success');
  expect(batchStatusFromCounts(counts,[{code:'rules_failed_summary'}])).toBe('partial');
 });
});
