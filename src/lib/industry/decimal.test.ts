// src/lib/industry/decimal.test.ts
import {describe,it,expect} from 'vitest';
import {RATIO_SCALE,decAbs,decAdd,decCmp,decDiv,decIsZero,decMul,decSub,decSum,isDecimal} from './decimal';
import {RATIO_SCALE as DERIVE_SCALE} from '../facts/derive';

describe('decimal',()=>{
 it('adds, subtracts, sums and multiplies exactly, returning canonical decimals',()=>{
  expect(decAdd('0.1','0.2')).toBe('0.3');
  expect(decAdd('123456789012345678901234567890','1')).toBe('123456789012345678901234567891');
  expect(decSub('1.50','1.5')).toBe('0');
  expect(decSub('-0.25','0.75')).toBe('-1');
  expect(decSum(['1000.5','2000','-0.5'])).toBe('3000');
  expect(decSum([])).toBe('0');
  expect(decMul('123.4','10000')).toBe('1234000');
  expect(decMul('-0.02','0.5')).toBe('-0.01');
  expect(decAbs('-12.30')).toBe('12.3');
 });
 it('divides with RATIO_SCALE places, half away from zero, like derive.ts; zero divisor is null',()=>{
  expect(RATIO_SCALE).toBe(DERIVE_SCALE);expect(RATIO_SCALE).toBe(10);
  expect(decDiv('2','3')).toBe('0.6666666667');
  expect(decDiv('-2','3')).toBe('-0.6666666667');
  expect(decDiv('1','8')).toBe('0.125');
  expect(decDiv('0.00000000005','1')).toBe('0.0000000001');
  expect(decDiv('-0.00000000005','1')).toBe('-0.0000000001');
  expect(decDiv('1','0')).toBeNull();
  expect(decDiv('1','0.000')).toBeNull();
 });
 it('compares and tests zero on the exact value',()=>{
  expect(decCmp('1.0','1')).toBe(0);expect(decCmp('-1','0')).toBe(-1);expect(decCmp('10','9.99')).toBe(1);
  expect(decIsZero('-0.000')).toBe(true);expect(decIsZero('0.001')).toBe(false);
 });
 it('rejects anything that is not a plain decimal string',()=>{
  for(const bad of ['1e5','+1','1.','.5',' 1','NaN','','0x10'])expect(()=>decAdd(bad,'1'),bad).toThrow('invalid_decimal');
  expect(isDecimal('-0.5')).toBe(true);expect(isDecimal(1)).toBe(false);
 });
});
