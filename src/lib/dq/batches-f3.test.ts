import {describe,expect,it} from 'vitest';
import {F3_INFO_CODES,INFO_CODES,batchStatusFromCounts,emptyCounts,isInfoError} from './batches';

describe('F3 informational codes (spec §10; plan F3 契约变更请求 D1-5)',()=>{
 it('never degrade a batch, while INFO_CODES itself keeps its spec-2 value',()=>{
  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit']);
  expect(F3_INFO_CODES).toEqual(['locate_ambiguous','period_unparsed','unit_ambiguous','label_ambiguous','not_consolidated','restated_comparative','en_zh_mismatch','extractor_disagreement','llm_uncited']);
  for(const code of F3_INFO_CODES){
   expect(isInfoError({code})).toBe(true);
   expect(batchStatusFromCounts({...emptyCounts(),inserted:1},[{code,key:'x',message:'IS:title'}])).toBe('success');
  }
  expect(isInfoError({code:'candidates_error'})).toBe(false);
  expect(batchStatusFromCounts({...emptyCounts(),inserted:1},[{code:'candidates_error'}])).toBe('partial');
 });
});
