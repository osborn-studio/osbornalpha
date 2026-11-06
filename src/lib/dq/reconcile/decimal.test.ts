// src/lib/dq/reconcile/decimal.test.ts
import {describe,expect,it} from 'vitest';
import {absDecimal,addDecimal,compareDecimal,divDecimal,formatDecimal,isDecimalText,maxAbsDecimal,mulDecimal,parseDecimal,relDiff,subDecimal,withinRadius} from './decimal';

describe('decimal (scaled BigInt, spec §5.1)',()=>{
 it('parses canonical decimals into units/scale and formats them back',()=>{
  expect(parseDecimal('383285000000')).toEqual({units:383285000000n,scale:0});
  expect(parseDecimal('-6.160')).toEqual({units:-616n,scale:2});
  expect(parseDecimal('1e-3')).toEqual({units:1n,scale:3});
  expect(formatDecimal({units:-616n,scale:2})).toBe('-6.16');
  expect(formatDecimal({units:5n,scale:3})).toBe('0.005');
  expect(()=>parseDecimal('')).toThrow(/invalid_decimal/);
  expect(()=>parseDecimal('1,000')).toThrow(/invalid_decimal/);
  expect(isDecimalText('12.5')).toBe(true);expect(isDecimalText('NaN')).toBe(false);
 });
 it('compares 20-digit integers exactly where Number would not',()=>{
  const a='12345678901234567890',b='12345678901234567891';
  expect(Number(a)).toBe(Number(b));              // the reason BigInt is used
  expect(compareDecimal(a,b)).toBe(-1);expect(compareDecimal(b,a)).toBe(1);
  expect(compareDecimal('1.10','1.1')).toBe(0);expect(compareDecimal('-0','0')).toBe(0);
  expect(subDecimal(b,a)).toBe('1');
 });
 it('adds, subtracts, multiplies and takes absolute values without rounding',()=>{
  expect(addDecimal('0.1','0.2')).toBe('0.3');
  expect(subDecimal('100','100.005')).toBe('-0.005');
  expect(absDecimal('-22354000000')).toBe('22354000000');
  expect(mulDecimal('1.25','10000')).toBe('12500');
  expect(mulDecimal('0.005','1000000')).toBe('5000');
  expect(maxAbsDecimal('-7','3','1')).toBe('7');
 });
 it('divides with half-away-from-zero rounding and refuses a zero divisor',()=>{
  expect(divDecimal('2','3',4)).toBe('0.6667');
  expect(divDecimal('-2','3',4)).toBe('-0.6667');
  expect(divDecimal('1','8',2)).toBe('0.13');
  expect(divDecimal('-1','8',2)).toBe('-0.13');
  expect(divDecimal('1','4',1)).toBe('0.3');
  expect(()=>divDecimal('1','0')).toThrow('division_by_zero');
 });
 it('rel_diff = |l−r| / max(|l|,|r|,1)',()=>{
  expect(relDiff('100','101')).toBe('0.009900990099');       // scale = 10 + 3 integer digits
  expect(relDiff('0','0.5')).toBe('0.5');          // denominator floor of 1
  expect(relDiff('-5','5')).toBe('2');
  expect(relDiff('383285000000','383285000000')).toBe('0');
  expect(relDiff('383285000000.005','383285000000')).not.toBe('0');   // 0.005 on 3.8e11 keeps significance
  expect(compareDecimal(relDiff('383285000000.005','383285000000'),'0')).toBe(1);
 });
 it('overflow beyond the 512-character literal cap is a distinct decimal_overflow code',()=>{
  const big='9'.repeat(512);
  expect(addDecimal(big,'0')).toBe(big);
  expect(()=>addDecimal(big,'1')).toThrow('decimal_overflow');
  expect(()=>subDecimal(`-${'9'.repeat(511)}`,'9'.repeat(511))).toThrow('decimal_overflow');
  expect(()=>mulDecimal('9'.repeat(300),'9'.repeat(300))).toThrow('decimal_overflow');
  expect(()=>addDecimal('1,0','1')).toThrow('invalid_decimal');
 });
 it('relDiff stays inside the formatter budget for 501- and 512-digit inputs',()=>{
  for(const n of [501,512]){const v='9'.repeat(n);expect(relDiff(v,v)).toBe('0');}
  const a='9'.repeat(500),b=`${'9'.repeat(499)}8`;
  expect(compareDecimal(relDiff(a,b),'0')).toBe(1);
  expect(relDiff('-'+'9'.repeat(510),'9'.repeat(510))).toBe('2');
  expect(relDiff(`0.${'1'.repeat(200)}`,'0')).not.toBe('0');
 });
 it('withinRadius is |value − center| <= radius by cross-multiplication (inclusive)',()=>{
  expect(withinRadius('383285000000.004','383285000000','0.005')).toBe(true);
  expect(withinRadius('383285000000.005','383285000000','0.005')).toBe(true);
  expect(withinRadius('383285000000.006','383285000000','0.005')).toBe(false);
  expect(withinRadius('1234504999','1234500000','5000')).toBe(true);
  expect(withinRadius('1234505001','1234500000','5000')).toBe(false);
  expect(withinRadius('-1','1','2')).toBe(true);
  expect(()=>withinRadius('1','1','-1')).toThrow('negative_radius');
 });
});
