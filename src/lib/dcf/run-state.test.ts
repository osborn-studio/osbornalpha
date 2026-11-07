import {describe,expect,it} from 'vitest';
import {acceptRun,inputsKey,isStale} from './run-state';

const base={wacc:0.1,terminalG:0.025,forecastYears:8,user:{}};
describe('DCF run record state',()=>{
 it('editing any input after a run marks it stale; whitespace-only edits do not',()=>{
  const k=inputsKey(base);
  expect(isStale(k,inputsKey({...base}))).toBe(false);
  expect(isStale(k,inputsKey({...base,user:{sharesDiluted:'  '}}))).toBe(false);
  expect(isStale(k,inputsKey({...base,wacc:0.11}))).toBe(true);
  expect(isStale(k,inputsKey({...base,user:{netDebt:'5'}}))).toBe(true);
 });
 it('rejects late responses: older generation, other ticker/asOf, wrong response ticker',()=>{
  const cur={generation:3,ticker:'AAPL',asOf:null};
  expect(acceptRun(cur,{...cur},'AAPL')).toBe(true);
  expect(acceptRun(cur,{...cur},'aapl')).toBe(true);
  expect(acceptRun(cur,{...cur,generation:2},'AAPL')).toBe(false);
  expect(acceptRun({...cur,ticker:'MSFT'},{...cur},'AAPL')).toBe(false);
  expect(acceptRun({...cur,asOf:'2024-01-01'},{...cur},'AAPL')).toBe(false);
  expect(acceptRun(cur,{...cur},'MSFT')).toBe(false);
  expect(acceptRun(cur,{...cur},undefined)).toBe(false);
 });
});
