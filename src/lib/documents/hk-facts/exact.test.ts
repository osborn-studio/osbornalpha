import {describe,expect,it} from 'vitest';
import {exactIdentity,sumDecimals,toScaled} from './exact';

const BS={num:5n,den:1000n},CF={num:2n,den:100n};
describe('exact decimal arithmetic (spec §7.6, R5-8)',()=>{
 it('scales two decimals to a common number of fractional digits',()=>{
  expect(toScaled('1.5','2')).toEqual({a:15n,b:20n,scale:1});
  expect(toScaled('-0.125','3.4')).toEqual({a:-125n,b:3400n,scale:3});
  expect(toScaled('12345678901234567890','1')).toEqual({a:12345678901234567890n,b:1n,scale:0});
 });
 it('identity: |l − r| × den ≤ max(|l|,|r|,1) × num, with the exact difference kept',()=>{
  expect(exactIdentity('2000000','1999000',BS)).toEqual({passed:true,diff:'1000'});
  expect(exactIdentity('100','89',BS)).toEqual({passed:false,diff:'11'});
  expect(exactIdentity('50','51',CF)).toEqual({passed:true,diff:'-1'});
  expect(exactIdentity('50','52',CF)).toEqual({passed:false,diff:'-2'});
  expect(exactIdentity('0.001','0',BS)).toEqual({passed:true,diff:'0.001'});                 // the max(…,1) floor
  expect(exactIdentity('12345678901234567890','12345678901234567891',{num:0n,den:1n})).toEqual({passed:false,diff:'-1'});
  expect(exactIdentity('12345678901234567890','12345678901234567890.0',{num:0n,den:1n})).toEqual({passed:true,diff:'0'});
  expect(()=>exactIdentity('1','1',{num:-1n,den:1n})).toThrow('invalid_tolerance');
  expect(()=>exactIdentity('1','1',{num:1n,den:0n})).toThrow('invalid_tolerance');
  expect(()=>exactIdentity('1e3','1',BS)).not.toThrow();                                       // canonicalDecimal accepts exponents
  expect(()=>exactIdentity('abc','1',BS)).toThrow(/invalid_decimal/);
 });
 it('sums signed decimals exactly',()=>{
  expect(sumDecimals(['1.5','-0.25','3'])).toBe('4.25');
  expect(sumDecimals(['250000000','-120000000','-80000000'])).toBe('50000000');
  expect(sumDecimals(['0.1','0.2'])).toBe('0.3');
  expect(sumDecimals([])).toBe('0');
 });
});
