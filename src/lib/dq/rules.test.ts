import {describe,it,expect} from 'vitest';
import {rangeRule,identityRule,jumpRule,unitRule,runRules,RULES_VERSION} from './rules';

describe('dq rules',()=>{
 it('unitRule passes only listed units, exactly',()=>{
  const allowed=['CNY','USD'] as const;
  expect(unitRule('rev_unit','CNY',allowed)).toEqual({ruleId:'rev_unit',passed:true});
  expect(unitRule('rev_unit','cny',allowed)).toEqual({ruleId:'rev_unit',passed:false,detail:{unit:'cny',allowed:['CNY','USD'],reason:'invalid_unit'}});
  expect(unitRule('rev_unit',undefined,allowed)).toEqual({ruleId:'rev_unit',passed:false,detail:{unit:null,allowed:['CNY','USD'],reason:'invalid_unit'}});
  expect(unitRule('rev_unit',42,allowed).detail).toMatchObject({unit:42,reason:'invalid_unit'});
  expect(unitRule('rev_unit',true,allowed).detail).toMatchObject({unit:true,reason:'invalid_unit'});
  expect(unitRule('rev_unit',JSON.parse('{"toString":null}'),allowed)).toEqual({ruleId:'rev_unit',passed:false,detail:{unit:'[non-primitive]',allowed:['CNY','USD'],reason:'invalid_unit'}});
  expect(unitRule('rev_unit',['CNY'],allowed).detail).toMatchObject({unit:'[non-primitive]',reason:'invalid_unit'});
  expect(unitRule('rev_unit','CNY',[]).detail).toMatchObject({reason:'invalid_params'});
  expect(unitRule('rev_unit','CNY',[1] as unknown as string[]).detail).toMatchObject({reason:'invalid_params'});
 });
 it('rangeRule is inclusive and reports the offending value',()=>{
  expect(rangeRule('pmi_range',50,0,100).passed).toBe(true);
  expect(rangeRule('pmi_range',100,0,100).passed).toBe(true);
  expect(rangeRule('pmi_range',101,0,100)).toEqual({ruleId:'pmi_range',passed:false,detail:{value:101,min:0,max:100}});
  expect(rangeRule('pmi_range',null,0,100)).toEqual({ruleId:'pmi_range',passed:false,detail:{value:null,reason:'not_a_number'}});
  expect(rangeRule('pmi_range',Number.NaN,0,100).passed).toBe(false);
 });
 it('identityRule compares two sides with a relative tolerance scaled by max(|l|,|r|,1)',()=>{
  expect(identityRule('assets_eq',1000,1004,0.005).passed).toBe(true);
  expect(identityRule('assets_eq',1000,1006,0.005).passed).toBe(false);
  expect(identityRule('zero',0,0.004,0.005).passed).toBe(true);   // magnitude floor of 1 → 0.004 <= 0.005
  expect(identityRule('zero',0,0.5,0.005).passed).toBe(false);
  expect(identityRule('gross',100,70,0.005,{expected:30}).passed).toBe(true);
  expect(identityRule('gross',100,70,0.005,{expected:31}).passed).toBe(false);
  expect(identityRule('bad',null,1,0.01).passed).toBe(false);
 });
 it('jumpRule flags relative changes beyond the limit and tolerates a missing previous value',()=>{
  expect(jumpRule('yoy_jump',120,100,10).passed).toBe(true);
  expect(jumpRule('yoy_jump',1200,100,10).passed).toBe(false);
  expect(jumpRule('yoy_jump',120,undefined,10).passed).toBe(true);
  expect(jumpRule('yoy_jump',5,0,10).passed).toBe(true); // previous 0 → floor of 1
 });
 it('jumpRule treats only null/undefined previous as missing and reports non-finite previous',()=>{
  expect(jumpRule('j',5,null,1).passed).toBe(true);
  expect(jumpRule('j',5,NaN,1)).toEqual({ruleId:'j',passed:false,detail:{current:5,previous:'NaN',reason:'previous_not_a_number'}});
  expect(jumpRule('j',5,Infinity,1).detail).toMatchObject({reason:'previous_not_a_number'});
  expect(jumpRule('j',5,'100',1).detail).toMatchObject({reason:'previous_not_a_number',previous:'100'});
 });
 it('jumpRule reports a non-numeric current under the current key',()=>{
  expect(jumpRule('j',null,100,1)).toEqual({ruleId:'j',passed:false,detail:{current:null,reason:'not_a_number'}});
  expect(jumpRule('j',NaN,100,1).detail).toMatchObject({current:NaN,reason:'not_a_number'});
 });
 it('jumpRule never throws on non-primitive values',()=>{
  const evil=JSON.parse('{"toString":null}');
  expect(jumpRule('j',1,evil,1)).toEqual({ruleId:'j',passed:false,detail:{current:1,previous:'[non-primitive]',reason:'previous_not_a_number'}});
  expect(jumpRule('j',evil,1,1)).toEqual({ruleId:'j',passed:false,detail:{current:'[non-primitive]',reason:'not_a_number'}});
  expect(jumpRule('j',5,[1],1).detail).toMatchObject({previous:'[non-primitive]',reason:'previous_not_a_number'});
 });
 it('fails with invalid_params for negative/non-finite tolerances and min > max',()=>{
  for(const bad of [-0.1,NaN,Infinity]){
   expect(jumpRule('j',1,1,bad).detail).toMatchObject({reason:'invalid_params'});
   expect(identityRule('i',1,1,bad).detail).toMatchObject({reason:'invalid_params'});
  }
  expect(identityRule('i',1,1,0.1,{expected:NaN}).detail).toMatchObject({reason:'invalid_params'});
  expect(rangeRule('r',5,10,0)).toEqual({ruleId:'r',passed:false,detail:{min:10,max:0,reason:'invalid_params'}});
  expect(rangeRule('r',5,NaN,10).detail).toMatchObject({reason:'invalid_params'});
  expect(rangeRule('r',5,-Infinity,Infinity).passed).toBe(true);
  expect(jumpRule('j',1,1,0).passed).toBe(true);
  expect(identityRule('i',1,1,0).passed).toBe(true);
 });
 it('identityRule and jumpRule do not overflow near Number.MAX_VALUE',()=>{
  const M=Number.MAX_VALUE;
  expect(identityRule('i',M,-M,0.01,{expected:M}).passed).toBe(false); // M-(-M)=2M overflows unscaled
  expect(identityRule('i',M,M,0.01).passed).toBe(true);
  expect(identityRule('i',M*0.5,-M*0.5,0.01,{expected:M}).passed).toBe(true); // 0.5M+0.5M=M exactly
  expect(jumpRule('j',-M,M,1).passed).toBe(false); // |-M-M|/M = 2 > 1
  expect(jumpRule('j',-M,M,2).passed).toBe(true);
  const r=identityRule('i',M,-M,0.01);
  expect(r.detail).toMatchObject({diff:null,relDiff:2});
 });
 it('runRules aggregates failures and carries the rules version',()=>{
  const out=runRules([rangeRule('a',1,0,2),rangeRule('b',5,0,2)]);
  expect(out).toEqual({passed:false,failed:[{ruleId:'b',passed:false,detail:{value:5,min:0,max:2}}],version:RULES_VERSION});
  expect(runRules([]).passed).toBe(true);
 });
});
