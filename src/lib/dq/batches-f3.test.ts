import {describe,expect,it} from 'vitest';
import {F3_INFO_CODES,INFO_CODES,batchStatusFromCounts,emptyCounts,isInfoError} from './batches';

describe('F3 informational codes (spec §10; plan F3 契约变更请求 D1-5)',()=>{
 it('never degrade a batch, while F3_INFO_CODES stays separate from INFO_CODES',()=>{
  expect(F3_INFO_CODES).not.toBe(INFO_CODES);
  expect(INFO_CODES.filter(code=>(F3_INFO_CODES as readonly string[]).includes(code))).toEqual([]);
  expect(F3_INFO_CODES).toEqual(['locate_ambiguous','period_unparsed','unit_ambiguous','label_ambiguous','not_consolidated','restated_comparative','en_zh_mismatch','extractor_disagreement','llm_uncited']);
  for(const code of F3_INFO_CODES){
   expect(isInfoError({code})).toBe(true);
   expect(batchStatusFromCounts({...emptyCounts(),inserted:1},[{code,key:'x',message:'IS:title'}])).toBe('success');
  }
  expect(isInfoError({code:'candidates_error'})).toBe(false);
  expect(batchStatusFromCounts({...emptyCounts(),inserted:1},[{code:'candidates_error'}])).toBe('partial');
 });
});
