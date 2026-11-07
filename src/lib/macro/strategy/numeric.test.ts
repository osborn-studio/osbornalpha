// numeric.ts (spec §5.6): exact decimal ops on canonical text, one float step for pct, type-7 quartiles.
import {describe,expect,it} from 'vitest';
import {add,compare,median,pctChange,pctRatio,quantile7,quartiles,roundPctRatio,sign,subtract,toBp} from './numeric';
describe('exact decimals',()=>{
 it('subtracts and adds exactly with canonical output',()=>{
  expect(subtract('4.10','1.85')).toBe('2.25');
  expect(subtract('1','1.000')).toBe('0');
  expect(subtract('0.1','0.3')).toBe('-0.2');
  expect(add('25','-12.5')).toBe('12.5');
  expect(add('0.1','0.2')).toBe('0.3');
 });
 it('compares by value, not by text',()=>{
  expect(compare('4.50','4.5')).toBe(0);
  expect(compare('-0.25','0')).toBe(-1);
  expect(compare('10','9.99')).toBe(1);
 });
 it('sign and toBp',()=>{
  expect(sign('-0')).toBe(0);expect(sign('0.0001')).toBe(1);expect(sign('-75')).toBe(-1);
  expect(toBp('-0.25')).toBe('-25');expect(toBp('0.125')).toBe('12.5');expect(toBp('0')).toBe('0');expect(toBp('2.25')).toBe('225');
 });
 it('rejects non-decimal text',()=>{
  expect(()=>subtract('abc','1')).toThrow(/invalid_decimal/);
 });
});
describe('percentage change',()=>{
 it('pctChange is one float step; pctRatio keeps the exact ratio and roundPctRatio rounds it once',()=>{
  expect(pctChange('105','100')).toBeCloseTo(5,12);
  expect(pctRatio('105.0','100')).toBe('105/100');
  expect(roundPctRatio(pctRatio('105','100'),1)).toBe('5.0');
  expect(roundPctRatio(pctRatio('1','3'),4)).toBe('-66.6667');
  expect(roundPctRatio(pctRatio('62','60.5'),1)).toBe('2.5');   // 2.479… → 2.5
 });
 it('no double rounding at the display boundary (positive and negative)',()=>{
  expect(roundPctRatio(pctRatio('100.04996','100'),1)).toBe('0.0');    // true 0.04996 %: a 4-dp pre-round (0.05) would show 0.1
  expect(roundPctRatio(pctRatio('99.95004','100'),1)).toBe('0.0');     // true −0.04996 %: no sign on a zero result
  expect(roundPctRatio(pctRatio('100.05','100'),1)).toBe('0.1');       // exactly half → away from zero
  expect(roundPctRatio(pctRatio('99.95','100'),1)).toBe('-0.1');
  expect(roundPctRatio(pctRatio('100.14996','100'),1)).toBe('0.1');
 });
 it('refuses a non-positive base and malformed ratios',()=>{
  expect(()=>pctChange('1','0')).toThrow('non_positive_base');
  expect(()=>pctRatio('1','-2')).toThrow('non_positive_base');
  expect(()=>roundPctRatio('1/0',1)).toThrow('non_positive_base');
  expect(()=>roundPctRatio('0.05',1)).toThrow(/invalid_pct_ratio/);
 });
});
describe('numeric range guards',()=>{
 const tiny=`0.${'0'.repeat(323)}1`,huge=`1${'0'.repeat(309)}`;
 it('pctChange rejects operands that underflow or overflow Number, and non-finite results',()=>{
  expect(()=>pctChange(tiny,tiny)).toThrow('unsupported_numeric_range');
  expect(()=>pctChange('1',tiny)).toThrow('unsupported_numeric_range');
  expect(()=>pctChange(huge,'1')).toThrow('unsupported_numeric_range');
  expect(()=>pctChange('1',huge)).toThrow('unsupported_numeric_range');
  expect(()=>pctChange(`1${'0'.repeat(308)}`,'0.1')).toThrow('unsupported_numeric_range');   // finite operands, infinite quotient
  expect(pctChange('0','1')).toBe(-100);
  expect(pctRatio(tiny,tiny)).toBe(`${tiny}/${tiny}`);                         // the exact companion stays exact
  expect(roundPctRatio(pctRatio(tiny,tiny),1)).toBe('0.0');
 });
 it('quartiles / median / quantile7 reject non-finite values',()=>{
  expect(()=>quartiles([1,Number.NaN,3])).toThrow('unsupported_numeric_range');
  expect(()=>median([1,Number.POSITIVE_INFINITY])).toThrow('unsupported_numeric_range');
  expect(()=>quantile7([1,Number.NEGATIVE_INFINITY],0.5)).toThrow('unsupported_numeric_range');
  expect(()=>quantile7([1,2],Number.NaN)).toThrow('unsupported_numeric_range');
 });
});
describe('type-7 quartiles',()=>{
 it('matches the linear-interpolation definition',()=>{
  expect(quartiles([1,2,3,4,5])).toEqual({q1:2,median:3,q3:4});
  expect(quartiles([4,1,3,2])).toEqual({q1:1.75,median:2.5,q3:3.25});
  const q=quartiles([10,-5,0,2.5,7,3]);
  expect(q.q1).toBeCloseTo(0.625,12);expect(q.median).toBeCloseTo(2.75,12);expect(q.q3).toBeCloseTo(6,12);
  expect(median([7])).toBe(7);
 });
 it('rejects empty or unsorted input',()=>{
  expect(()=>quantile7([],0.5)).toThrow('quantile_empty');
  expect(()=>quantile7([2,1],0.5)).toThrow('quantile_unsorted');
 });
});
