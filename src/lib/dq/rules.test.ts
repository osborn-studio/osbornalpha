import {describe,it,expect} from 'vitest';
import {rangeRule,identityRule,jumpRule,runRules,RULES_VERSION} from './rules';

describe('dq rules',()=>{
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
 it('runRules aggregates failures and carries the rules version',()=>{
  const out=runRules([rangeRule('a',1,0,2),rangeRule('b',5,0,2)]);
  expect(out).toEqual({passed:false,failed:[{ruleId:'b',passed:false,detail:{value:5,min:0,max:2}}],version:RULES_VERSION});
  expect(runRules([]).passed).toBe(true);
 });
});
