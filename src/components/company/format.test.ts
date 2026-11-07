// src/components/company/format.test.ts
import {describe,it,expect} from 'vitest';
import {SCALE_EXP,defaultScale,unitKindOfUnit,shiftDecimal,roundDecimal,groupNumber,formatScaled,formatPercent,formatValue,signed,unitCaption} from './format';

describe('decimal display helpers (no floating point)',()=>{
 it('shifts the decimal point exactly, including 20-digit integers and negatives',()=>{
  expect(shiftDecimal('170899152276.34',8)).toBe('1708.9915227634');
  expect(shiftDecimal('12345678901234567890',8)).toBe('123456789012.3456789');
  expect(shiftDecimal('-1150000000',8)).toBe('-11.5');
  expect(shiftDecimal('5',3)).toBe('0.005');
  expect(shiftDecimal('0.918612',-2)).toBe('91.8612');
  expect(shiftDecimal('abc',3)).toBe('abc');
 });
 it('rounds half away from zero to fixed digits and never prints negative zero',()=>{
  expect(roundDecimal('123456789012.3456789',2)).toBe('123456789012.35');
  expect(roundDecimal('-11.505',2)).toBe('-11.51');
  expect(roundDecimal('-0.0004',2)).toBe('0.00');
  expect(roundDecimal('9.995',2)).toBe('10.00');
  expect(roundDecimal('7',2)).toBe('7.00');
 });
 it('groups thousands on the integer part only',()=>{
  expect(groupNumber('170899152276.34')).toBe('170,899,152,276.34');
  expect(groupNumber('-1234567')).toBe('-1,234,567');
  expect(groupNumber('0.000123')).toBe('0.000123');
 });
 it('formats scaled money, percents and raw values',()=>{
  expect(formatScaled('170899152276.34',SCALE_EXP.hundred_million)).toBe('1,708.99');
  expect(formatScaled('383285000000',SCALE_EXP.million)).toBe('383,285.00');
  expect(formatScaled('383285000000.5',0)).toBe('383,285,000,000.5');
  expect(formatPercent('0.918612')).toBe('91.86%');
  expect(formatPercent('0.0000775',4)).toBe('0.0078%');
  expect(signed('12.30')).toBe('+12.30');expect(signed('-1.00')).toBe('-1.00');expect(signed('0.00')).toBe('0.00');
 });
 it('chooses the default scale by currency and the unit kind by unit code',()=>{
  expect(defaultScale('CNY','zh')).toBe('hundred_million');expect(defaultScale('USD','en')).toBe('million');expect(defaultScale('CNY','en')).toBe('million');expect(defaultScale('HKD','zh')).toBe('million');expect(defaultScale(null,'zh')).toBe('raw');
  expect(unitKindOfUnit('pure')).toBe('ratio');expect(unitKindOfUnit('shares')).toBe('shares');expect(unitKindOfUnit('USD/shares')).toBe('per_share');expect(unitKindOfUnit('CNY')).toBe('money');
 });
 it('formatValue applies the scale to money only',()=>{
  expect(formatValue('170899152276.34','money',8)).toBe('1,708.99');
  expect(formatValue('68.64','per_share',8)).toBe('68.64');
  expect(formatValue('1256197800','shares',8)).toBe('1,256,197,800');
  expect(formatValue('0.918612','ratio',8)).toBe('91.86%');
 });
 it('unitCaption names currency and applied scale for money, unit only for the rest, nothing for ratios',()=>{
  expect(unitCaption('CNY',8)).toEqual({unit:'CNY',scaleId:'hundred_million'});
  expect(unitCaption('USD',6)).toEqual({unit:'USD',scaleId:'million'});
  expect(unitCaption('USD',0)).toEqual({unit:'USD',scaleId:null});
  expect(unitCaption('shares',8)).toEqual({unit:'shares',scaleId:null});
  expect(unitCaption('CNY/shares',6)).toEqual({unit:'CNY/shares',scaleId:null});
  expect(unitCaption('pure',8)).toBeNull();
 });
});
