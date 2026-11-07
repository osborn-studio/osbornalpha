// src/lib/macro/decimal.test.ts
// Exact decimal-string arithmetic (spec §0.2 M8): no float ever touches a value.
import {describe,expect,it} from 'vitest';
import {canonical,compare,equals,minus100,subtract,yoyPct} from './decimal';

describe('canonical / equals / compare',()=>{
 it('reuses the facts canonical form',()=>{
  expect(canonical('1.2300')).toBe('1.23');expect(canonical('-0.0')).toBe('0');expect(canonical('1e3')).toBe('1000');expect(canonical('007.50')).toBe('7.5');
  expect(()=>canonical('1,5')).toThrow('invalid_decimal');
  expect(equals('1.0','1')).toBe(true);expect(equals('1.01','1.1')).toBe(false);
 });
 it('orders exactly, including values a double cannot tell apart',()=>{
  expect(compare('1','1.000')).toBe(0);expect(compare('-2','1')).toBe(-1);expect(compare('0.30000000000000001','0.3')).toBe(1);
  expect(compare('12345678901234567890.1','12345678901234567890.01')).toBe(1);
 });
});

describe('subtract / minus100',()=>{
 it('is exact',()=>{
  expect(subtract('0.3','0.1')).toBe('0.2');
  expect(subtract('3.1','1.05')).toBe('2.05');
  expect(subtract('1','1.000')).toBe('0');
  expect(subtract('-1.5','2.25')).toBe('-3.75');
  expect(subtract('12345678901234567890.5','0.5')).toBe('12345678901234567890');
  expect(subtract('0.0001','0.001')).toBe('-0.0009');
 });
 it('turns a 上年同月=100 index into a pp change',()=>{
  expect(minus100('102.3')).toBe('2.3');expect(minus100('99.5')).toBe('-0.5');expect(minus100('100.0')).toBe('0');expect(minus100('100.05')).toBe('0.05');
 });
});

describe('yoyPct = (cur/prev − 1) × 100, half-even to 4 dp, canonical',()=>{
 it('computes ordinary changes',()=>{
  expect(yoyPct('105','100')).toBe('5');
  expect(yoyPct('100','105')).toBe('-4.7619');
  expect(yoyPct('4','3')).toBe('33.3333');
  expect(yoyPct('5','3')).toBe('66.6667');
  expect(yoyPct('200','100')).toBe('100');
  expect(yoyPct('50','100')).toBe('-50');
  expect(yoyPct('101.00','100.0')).toBe('1');                                    // trailing zeros do not leak
  expect(yoyPct('0.3','0.1')).toBe('200');                                       // a float would give 199.99999999999997
  expect(yoyPct('-90','-100')).toBe('-10');                                      // negative base: formula, not intuition
  expect(yoyPct('123456789012345678901234567890','61728394506172839450617283945')).toBe('100');
 });
 it('rounds half to even at the 4th decimal, symmetric for negatives, never "-0"',()=>{
  expect(yoyPct('1.0000015','1')).toBe('0.0002');   // 0.00015 → odd 1 rounds up
  expect(yoyPct('1.0000025','1')).toBe('0.0002');   // 0.00025 → even 2 stays
  expect(yoyPct('1.00000251','1')).toBe('0.0003');  // above half
  expect(yoyPct('1.0000005','1')).toBe('0');        // 0.00005 → even 0 stays
  expect(yoyPct('0.9999985','1')).toBe('-0.0002');
  expect(yoyPct('0.9999995','1')).toBe('0');
  expect(yoyPct('0.99999949','1')).toBe('-0.0001');
 });
 it('refuses prev = 0 and invalid input',()=>{
  expect(()=>yoyPct('1','0')).toThrow('decimal_division_by_zero');
  expect(()=>yoyPct('1','0.000')).toThrow('decimal_division_by_zero');
  expect(()=>yoyPct('abc','1')).toThrow('invalid_decimal');
 });
});
