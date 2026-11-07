// src/lib/company/decimal.test.ts
import {describe,expect,it} from 'vitest';
import {decimalRelChange,decimalSub,parseDecimal,decToString} from './decimal';

describe('decimal (Task 5 part)',()=>{
 it('parses canonical and exponent forms exactly',()=>{
  expect(parseDecimal('383285000000')).toEqual({n:383285000000n,s:0});
  expect(parseDecimal('-12.340')).toEqual({n:-1234n,s:2});
  expect(parseDecimal('1e5')).toEqual({n:100000n,s:0});
  expect(()=>parseDecimal('abc')).toThrow(/invalid_decimal/);
  expect(decToString({n:-5n,s:3})).toBe('-0.005');
  expect(decToString({n:0n,s:4})).toBe('0');
 });
 it('decimalSub is exact on 20-digit integers and mixed scales',()=>{
  expect(decimalSub('12345678901234567890','1')).toBe('12345678901234567889');
  expect(decimalSub('0.1','0.3')).toBe('-0.2');
  expect(decimalSub('5','5.000')).toBe('0');
 });
 it('decimalRelChange = (to-from)/|from|, 10 places half away from zero, canonical; null when from is 0',()=>{
  expect(decimalRelChange('100','110')).toBe('0.1');
  expect(decimalRelChange('-100','-110')).toBe('-0.1');
  expect(decimalRelChange('-100','-90')).toBe('0.1');
  expect(decimalRelChange('3','4')).toBe('0.3333333333');
  expect(decimalRelChange('3','2')).toBe('-0.3333333333');
  expect(decimalRelChange('3','5')).toBe('0.6666666667');
  expect(decimalRelChange('3','1')).toBe('-0.6666666667');
  expect(decimalRelChange('383285000000','383285000001')).toBe('0');
  expect(decimalRelChange('0','5')).toBeNull();
  expect(decimalRelChange('0.000','5')).toBeNull();
 });
});
