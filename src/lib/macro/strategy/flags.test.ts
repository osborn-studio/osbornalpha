// src/lib/macro/strategy/flags.test.ts
// Capability matrix (spec §9.1): switch → foundation → judgment layer.
import {describe,expect,it} from 'vitest';
import {judgmentGate,judgmentStatus,judgmentsEnabled,strategyEnabled,strategyGate} from './flags';
import {memoryStrategyPort} from './port';
import {fixture} from './testing/fixture';

describe('flags',()=>{
 const port=memoryStrategyPort(fixture());
 it('switches are on only for the exact value "1"',()=>{
  expect(strategyEnabled({})).toBe(false);expect(strategyEnabled({MACRO_STRATEGY_ENABLED:'true'})).toBe(false);expect(strategyEnabled({MACRO_STRATEGY_ENABLED:'1'})).toBe(true);
  expect(judgmentsEnabled({})).toBe(false);expect(judgmentsEnabled({MACRO_JUDGMENTS_ENABLED:'1'})).toBe(true);
 });
 it('strategyGate: disabled → 404 strategy_disabled (even with a port); null port → 503 macro_foundation_unavailable; else ok with the judgment switch',()=>{
  expect(strategyGate({},port)).toEqual({ok:false,status:404,code:'strategy_disabled'});
  expect(strategyGate({MACRO_STRATEGY_ENABLED:'1'},null)).toEqual({ok:false,status:503,code:'macro_foundation_unavailable'});
  expect(strategyGate({MACRO_STRATEGY_ENABLED:'1'},port)).toEqual({ok:true,port,judgments:false});
  expect(strategyGate({MACRO_STRATEGY_ENABLED:'1',MACRO_JUDGMENTS_ENABLED:'1'},port)).toEqual({ok:true,port,judgments:true});
 });
 it('judgmentGate and judgmentStatus',()=>{
  expect(judgmentGate({})).toEqual({ok:false,status:404,code:'judgments_disabled'});
  expect(judgmentGate({MACRO_JUDGMENTS_ENABLED:'1'})).toEqual({ok:true});
  expect(judgmentStatus({},'ok')).toBe('disabled');
  expect(judgmentStatus({MACRO_JUDGMENTS_ENABLED:'1'},'failed')).toBe('unavailable');
  expect(judgmentStatus({MACRO_JUDGMENTS_ENABLED:'1'},'not_attempted')).toBe('unavailable');
  expect(judgmentStatus({MACRO_JUDGMENTS_ENABLED:'1'},'ok')).toBe('ok');
 });
});
