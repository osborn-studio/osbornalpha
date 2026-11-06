// src/lib/documents/decimal.test.ts
import {describe,expect,it} from 'vitest';
import {addDecimal,isDecimal,negate,parsePresented,scaleDecimal,subDecimal} from './decimal';

describe('scaleDecimal',()=>{
 it('shifts the decimal point exactly for every HK scale',()=>{
  expect(scaleDecimal('1234','1000')).toBe('1234000');
  expect(scaleDecimal('12.5','1000000')).toBe('12500000');
  expect(scaleDecimal('5','0.01')).toBe('0.05');
  expect(scaleDecimal('123','0.01')).toBe('1.23');
  expect(scaleDecimal('-3.40','1')).toBe('-3.4');
  expect(scaleDecimal('0.000','1000')).toBe('0');
  expect(scaleDecimal('007','1')).toBe('7');
 });
 it('keeps 20-digit integers exact (no Number on the way)',()=>{
  expect(scaleDecimal('12345678901234567890','1000000')).toBe('12345678901234567890000000');
  expect(scaleDecimal('98765432109876543210','0.01')).toBe('987654321098765432.1');
 });
 it('refuses anything that is not a plain decimal literal',()=>{
  for(const bad of ['1,234','1e5','+1','','.5','1.','abc',' 1'])expect(()=>scaleDecimal(bad,'1')).toThrow(/invalid_decimal/);
  expect(()=>scaleDecimal('1','10' as never)).toThrow(/invalid_decimal/);
 });
});

describe('negate / addDecimal / subDecimal',()=>{
 it('are exact on canonical strings',()=>{
  expect(negate('5')).toBe('-5');expect(negate('-0.50')).toBe('0.5');expect(negate('0')).toBe('0');expect(negate('-0')).toBe('0');
  expect(addDecimal('0.1','0.2')).toBe('0.3');
  expect(addDecimal('-5','3')).toBe('-2');
  expect(addDecimal('-0.05','0.05')).toBe('0');
  expect(addDecimal('1.005','-2')).toBe('-0.995');
  expect(subDecimal('1','1.000')).toBe('0');
  expect(subDecimal('100','250.75')).toBe('-150.75');
  expect(addDecimal('99999999999999999999','1')).toBe('100000000000000000000');
  expect(subDecimal('12345678901234567890','12345678901234567891')).toBe('-1');
  expect(addDecimal('0.000001','0.000009')).toBe('0.00001');
 });
 it('refuses invalid operands',()=>{
  expect(()=>addDecimal('1','x')).toThrow(/invalid_decimal/);
  expect(()=>negate('1e3')).toThrow(/invalid_decimal/);
 });
 it('isDecimal accepts plain signed literals only',()=>{
  expect(['0','-1','12.50','-0.001'].every(isDecimal)).toBe(true);
  expect(['1,000','1e3','+1','',' 1','1.'].some(isDecimal)).toBe(false);
 });
});

describe('parsePresented review fixes',()=>{
 it('reads U+2212 and U+2012 as minus and lone dash',()=>{
  expect(parsePresented('\u22121,234')).toEqual({digits:'1234',negative:true});
  expect(parsePresented('\u201256')).toEqual({digits:'56',negative:true});
  expect(parsePresented('(\u22125)')).toBeNull();
  for(const d of ['\u2212','\u2012'])expect(parsePresented(d)).toBe('dash');
 });
 it('rejects leading-zero groupings but keeps a bare 0 and 0.x',()=>{
  for(const bad of ['0,123','01,234','00,123.5','(0,123)'])expect(parsePresented(bad)).toBeNull();
  expect(parsePresented('0')).toEqual({digits:'0',negative:false});
  expect(parsePresented('0.25')).toEqual({digits:'0.25',negative:false});
  expect(parsePresented('(0)')).toEqual({digits:'0',negative:true});
  expect(parsePresented('1,000')).toEqual({digits:'1000',negative:false});
 });
 it('caps the cell length (128 code units after NFKC)',()=>{
  expect(parsePresented('1'.repeat(128))).toEqual({digits:'1'.repeat(128),negative:false});
  expect(parsePresented('1'.repeat(129))).toBeNull();
  expect(parsePresented(`(${'1'.repeat(200)})`)).toBeNull();
 });
});

describe('parsePresented',()=>{
 it('reads grouped numbers, parentheses and a leading dash as negative',()=>{
  expect(parsePresented('1,234')).toEqual({digits:'1234',negative:false});
  expect(parsePresented('(1,234)')).toEqual({digits:'1234',negative:true});
  expect(parsePresented('-1,234.5')).toEqual({digits:'1234.5',negative:true});
  expect(parsePresented('–56')).toEqual({digits:'56',negative:true});
  expect(parsePresented(' 0.25 ')).toEqual({digits:'0.25',negative:false});
  expect(parsePresented('12345678901234567890')).toEqual({digits:'12345678901234567890',negative:false});
 });
 it('normalises full-width characters (NFKC) before reading',()=>{
  expect(parsePresented('（１，２３４）')).toEqual({digits:'1234',negative:true});
 });
 it('returns dash for a lone dash and null for anything else',()=>{
  for(const d of ['-','–','—',' — '])expect(parsePresented(d)).toBe('dash');
  for(const bad of ['(1,234','1,234)','(-5)','1,23','12,3456','abc','','1.2.3','2025年','RMB'])expect(parsePresented(bad)).toBeNull();
 });
});
