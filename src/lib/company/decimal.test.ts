// src/lib/company/decimal.test.ts
import {describe,expect,it} from 'vitest';
import {decimalRelChange,decimalSub,divisorOf,formatDecimalText,groupThousands,parseDecimal,decToString,scaleFor} from './decimal';

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

describe('display formatting (Task 7)',()=>{
 it('formats exactly: 20-digit integers, decimals, negatives, divisors; half away from zero; no negative zero',()=>{
  expect(formatDecimalText('12345678901234567890',divisorOf('hundred_million'),2)).toBe('123456789012.35');
  expect(formatDecimalText('12345678901234567890',divisorOf('raw'),0)).toBe('12345678901234567890');
  expect(formatDecimalText('383285000000',divisorOf('million'),0)).toBe('383285');
  expect(formatDecimalText('150560000000.12',divisorOf('hundred_million'),2)).toBe('1505.60');
  expect(formatDecimalText('-1234.5',divisorOf('thousand'),2)).toBe('-1.23');
  expect(formatDecimalText('-1235',divisorOf('thousand'),2)).toBe('-1.24');
  expect(formatDecimalText('0.005',1n,2)).toBe('0.01');
  expect(formatDecimalText('-0.005',1n,2)).toBe('-0.01');
  expect(formatDecimalText('-0.004',1n,2)).toBe('0.00');
  expect(formatDecimalText('1e5',divisorOf('thousand'),1)).toBe('100.0');
  expect(formatDecimalText('6.13',1n,4)).toBe('6.1300');
  expect(()=>formatDecimalText('1',0n,2)).toThrow(RangeError);
  expect(()=>formatDecimalText('1',1n,13)).toThrow(RangeError);
  expect(()=>formatDecimalText('x',1n,2)).toThrow(/invalid_decimal/);
 });
 it('groups thousands in the integer part only',()=>{
  expect(groupThousands('1234567.891')).toBe('1,234,567.891');
  expect(groupThousands('-1234')).toBe('-1,234');
  expect(groupThousands('999')).toBe('999');
 });
 it('default scale: CNY+zh 亿, USD+en 百万, others 百万, non-money raw',()=>{
  expect(scaleFor('CNY','zh')).toBe('hundred_million');
  expect(scaleFor('USD','en')).toBe('million');
  expect(scaleFor('CNY','en')).toBe('million');
  expect(scaleFor('USD','zh')).toBe('million');
  expect(scaleFor('USD/share','en')).toBe('raw');
  expect(scaleFor('shares','zh')).toBe('raw');
  expect(scaleFor('pure','zh')).toBe('raw');
  expect([divisorOf('raw'),divisorOf('thousand'),divisorOf('million'),divisorOf('hundred_million')]).toEqual([1n,1000n,1000000n,100000000n]);
 });
});
