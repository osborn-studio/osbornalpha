import {describe,expect,it} from 'vitest';
import {applySign,cellValue} from './values';

describe('values (spec §7.5 step 5): exact decimal strings, brackets negative, dashes absent',()=>{
 it('reads cells and applies the scale without floating point',()=>{
  expect(cellValue('1,234,567','1000')).toEqual({kind:'value',presented:'1,234,567',value:'1234567000'});
  expect(cellValue('(734,567)','1000')).toEqual({kind:'value',presented:'(734,567)',value:'-734567000'});
  expect(cellValue('12.34','0.01')).toEqual({kind:'value',presented:'12.34',value:'0.1234'});
  expect(cellValue('10.50','0.01')).toEqual({kind:'value',presented:'10.50',value:'0.105'});
  expect(cellValue('0.32','1')).toEqual({kind:'value',presented:'0.32',value:'0.32'});
  expect(cellValue('12345678901234567890','1000000')).toEqual({kind:'value',presented:'12345678901234567890',value:'12345678901234567890000000'});
  for(const d of ['–','-','—'])expect(cellValue(d,'1000')).toEqual({kind:'dash'});
  expect(cellValue('n/a','1')).toEqual({kind:'invalid'});
 });
 it('sign rules: cost and tax shown negative become positive; decrease-only cash change shown positive becomes negative',()=>{
  expect(applySign('cost_of_revenue','-734567000','銷售成本')).toEqual({value:'734567000',sign_flip:true});
  expect(applySign('cost_of_revenue','734567000','銷售成本')).toEqual({value:'734567000',sign_flip:false});
  expect(applySign('income_tax','-30000000','所得稅開支')).toEqual({value:'30000000',sign_flip:true});
  expect(applySign('net_change_in_cash','5000','現金及現金等價物減少淨額')).toEqual({value:'-5000',sign_flip:true});
  expect(applySign('net_change_in_cash','5000','Net decrease in cash and cash equivalents')).toEqual({value:'-5000',sign_flip:true});
  expect(applySign('net_change_in_cash','5000','現金及現金等價物增加/(減少)淨額')).toEqual({value:'5000',sign_flip:false});
  expect(applySign('net_change_in_cash','-5000','現金及現金等價物減少淨額')).toEqual({value:'-5000',sign_flip:false});
  expect(applySign('net_change_in_cash','0','現金及現金等價物減少淨額')).toEqual({value:'0',sign_flip:false});
  expect(applySign('investing_cash_flow','-120000000','投資活動所用現金淨額')).toEqual({value:'-120000000',sign_flip:false});
  expect(applySign('income_tax','10185000','Income tax credit 所得稅沖回')).toEqual({value:'-10185000',sign_flip:true});   // a credit is a negative expense
  expect(applySign('income_tax','-5000','所得稅抵免')).toEqual({value:'-5000',sign_flip:false});   // already printed negative: −|x|, no flip (P1-3)
  expect(applySign('income_tax','0','Income tax credit')).toEqual({value:'0',sign_flip:false});
  expect(applySign('income_tax','-10185000','Income tax credit 所得稅沖回')).toEqual({value:'-10185000',sign_flip:false});
 });
});
