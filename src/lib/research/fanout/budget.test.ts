import {describe,expect,it} from 'vitest';
import {DEFAULT_DAILY_BUDGET_MICROS,budgetState,readBudgetConfig} from './budget';

describe('budget',()=>{
 it('stops exactly at the limit and reports the remainder before it',()=>{
  expect(DEFAULT_DAILY_BUDGET_MICROS).toBe(5_000_000);
  expect(budgetState(4_999_999,5_000_000)).toEqual({spent_micros:4_999_999,limit_micros:5_000_000,remaining_micros:1,stopped:false});
  expect(budgetState(5_000_000,5_000_000)).toEqual({spent_micros:5_000_000,limit_micros:5_000_000,remaining_micros:0,stopped:true});
  expect(budgetState(7_000_000,5_000_000).stopped).toBe(true);
  expect(budgetState(0,0).stopped).toBe(true);
 });
 it('reads the limit and unit prices from the environment with documented defaults and rejects garbage',()=>{
  expect(readBudgetConfig({})).toEqual({daily_budget_micros:5_000_000,jev_micros_per_1k:45,deepseek_micros_per_1k:280});
  expect(readBudgetConfig({FANOUT_DAILY_BUDGET_MICROS:'100',FANOUT_JEV_MICROS_PER_1K_TOKENS:'7',FANOUT_DEEPSEEK_MICROS_PER_1K_TOKENS:'9'})).toEqual({daily_budget_micros:100,jev_micros_per_1k:7,deepseek_micros_per_1k:9});
  expect(()=>readBudgetConfig({FANOUT_DAILY_BUDGET_MICROS:'-1'})).toThrow('invalid_schema');
  expect(()=>readBudgetConfig({FANOUT_JEV_MICROS_PER_1K_TOKENS:'abc'})).toThrow('invalid_schema');
 });
});
