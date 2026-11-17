// src/lib/broker-research/effective.test.ts
import {describe,expect,it} from 'vitest';
import {effectiveValue} from './effective';

const row={value_text:'120',value_num:'120.50',value_currency:'HKD',value_unit:'price' as const,value_date:null,corrected:null};
describe('effectiveValue (same rule as SQL broker_field_effective and the citations view)',()=>{
 it('returns the extracted components when there is no correction',()=>{
  expect(effectiveValue(row)).toEqual({value_text:'120',value_num:'120.50',value_currency:'HKD',value_unit:'price',value_date:null});
 });
 it('a present corrected key wins, including an explicit null; a missing key inherits',()=>{
  expect(effectiveValue({...row,corrected:{value_text:'121',value_currency:null}})).toEqual({value_text:'121',value_num:'120.50',value_currency:null,value_unit:'price',value_date:null});
  expect(effectiveValue({...row,corrected:{value_text:'x',value_num:null,value_unit:null,value_date:'2026-01-02'}})).toEqual({value_text:'x',value_num:null,value_currency:'HKD',value_unit:null,value_date:'2026-01-02'});
 });
});
