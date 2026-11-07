// src/lib/evals/compare.test.ts
import {describe,expect,it} from 'vitest';
import {compareWithinTolerance,formatDecimal,parseDecimalParts} from './compare';

/** mulberry32: small seeded PRNG so the property tests are reproducible. */
function prng(seed:number){
 let a=seed>>>0;
 return ()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
const digits=(rnd:()=>number,n:number)=>Array.from({length:n},()=>String(Math.floor(rnd()*10))).join('');
function randomDecimal(rnd:()=>number):string{
 const int=digits(rnd,1+Math.floor(rnd()*20));
 const fracLen=Math.floor(rnd()*19);
 const sign=rnd()<0.3?'-':'';
 return `${sign}${int}${fracLen?`.${digits(rnd,fracLen)}`:''}`;
}
const RELS=['0','0.0000000001','0.001','0.005','0.01','0.1','0.5','0.999'];

describe('parseDecimalParts / formatDecimal',()=>{
 it('splits sign, digits and scale',()=>{
  expect(parseDecimalParts('-12.340')).toEqual({unscaled:-12340n,scale:3});
  expect(parseDecimalParts('0')).toEqual({unscaled:0n,scale:0});
 });
 it('formats canonical text',()=>{
  expect(formatDecimal(-12340n,3)).toBe('-12.34');
  expect(formatDecimal(5n,3)).toBe('0.005');
  expect(formatDecimal(0n,10)).toBe('0');
  expect(formatDecimal(-0n,2)).toBe('0');
  expect(formatDecimal(120n,0)).toBe('120');
 });
 it('rejects anything outside -?digits(.digits)?',()=>{
  for(const bad of ['','1e5','+1',' 1','1 ','1.','.5','NaN','0x10','1,000','--1','1.2.3','∞','１'])expect(()=>parseDecimalParts(bad),bad).toThrow(RangeError);
  expect(()=>parseDecimalParts('1'.repeat(513))).toThrow(RangeError);
  expect(parseDecimalParts('1'.repeat(257)).scale).toBe(0);
  expect(parseDecimalParts('1'.repeat(512)).scale).toBe(0);
 });
});

describe('compareWithinTolerance',()=>{
 it('integers: inside and outside 1%',()=>{
  expect(compareWithinTolerance('100','101','0.01')).toEqual({passed:true,absDiff:'1',relDiff:'0.00990099'});
  expect(compareWithinTolerance('100','102','0.01')).toEqual({passed:false,absDiff:'2',relDiff:'0.0196078431'});
 });
 it('20-digit integers are exact (a double would call them equal)',()=>{
  expect(compareWithinTolerance('12345678901234567890','12345678901234567891','0')).toEqual({passed:false,absDiff:'1',relDiff:'0'});
  expect(compareWithinTolerance('12345678901234567890','12345678901234567891','0.0000000001').passed).toBe(true);
  expect(compareWithinTolerance('12345678901234567890','12345678901234567890','0')).toEqual({passed:true,absDiff:'0',relDiff:'0'});
 });
 it('18 decimal places are exact',()=>{
  expect(compareWithinTolerance('0.123456789012345678','0.123456789012345679','0')).toEqual({passed:false,absDiff:'0.000000000000000001',relDiff:'0'});
  expect(compareWithinTolerance('0.123456789012345678','0.1234567890123456780','0').passed).toBe(true);
 });
 it('negatives',()=>{
  expect(compareWithinTolerance('-5','5','0.5')).toEqual({passed:false,absDiff:'10',relDiff:'2'});
  expect(compareWithinTolerance('-100','-101','0.01')).toEqual({passed:true,absDiff:'1',relDiff:'0.00990099'});
  expect(compareWithinTolerance('-0','0','0')).toEqual({passed:true,absDiff:'0',relDiff:'0'});
 });
 it('rel 0 accepts only numerically equal values (trailing zeros do not matter)',()=>{
  expect(compareWithinTolerance('1.0','1','0')).toEqual({passed:true,absDiff:'0',relDiff:'0'});
  expect(compareWithinTolerance('1','1.0000000001','0').passed).toBe(false);
 });
 it('denominator is at least 1 for small magnitudes (boundary is inclusive)',()=>{
  expect(compareWithinTolerance('0.001','0.002','0.001')).toEqual({passed:true,absDiff:'0.001',relDiff:'0.001'});
  expect(compareWithinTolerance('0.001','0.002','0.0009').passed).toBe(false);
  expect(compareWithinTolerance('0','0.5','0.5').passed).toBe(true);
 });
 it('relDiff truncates toward zero at 10 places (never rounds)',()=>{
  expect(compareWithinTolerance('3','1','0').relDiff).toBe('0.6666666666');
  expect(compareWithinTolerance('3','2','0').relDiff).toBe('0.3333333333');
 });
 it('rejects non-decimal input and negative tolerance with RangeError',()=>{
  expect(()=>compareWithinTolerance('1e3','1000','0')).toThrow(RangeError);
  expect(()=>compareWithinTolerance('1000','1,000','0')).toThrow(RangeError);
  expect(()=>compareWithinTolerance('1','1','-0.1')).toThrow(RangeError);
  expect(()=>compareWithinTolerance('1','1','1e-2')).toThrow(RangeError);
 });
 it('property (200 seeded draws): every value passes against itself at rel 0',()=>{
  const rnd=prng(20261106);
  for(let i=0;i<200;i++){
   const x=randomDecimal(rnd);
   expect(compareWithinTolerance(x,x,'0'),x).toEqual({passed:true,absDiff:'0',relDiff:'0'});
  }
 });
 it('property (200 seeded draws): passing at rel a implies passing at every rel b >= a, and the result is symmetric',()=>{
  const rnd=prng(42);
  for(let i=0;i<200;i++){
   const x=randomDecimal(rnd),y=rnd()<0.5?randomDecimal(rnd):x.replace(/\d$/,d=>String((Number(d)+1)%10));
   const results=RELS.map(rel=>compareWithinTolerance(x,y,rel));
   const firstPass=results.findIndex(r=>r.passed);
   if(firstPass>=0)for(const r of results.slice(firstPass))expect(r.passed,`${x} ${y}`).toBe(true);
   for(const rel of RELS)expect(compareWithinTolerance(y,x,rel)).toEqual(compareWithinTolerance(x,y,rel));
  }
 });
});

describe('results longer than the 512-char input cap',()=>{
 it('512-digit operand vs 0.1: the 514-char difference formats without error',()=>{
  const big='1'.repeat(512);
  const r=compareWithinTolerance(big,'0.1','0');
  expect(r.passed).toBe(false);
  expect(r.absDiff).toBe(`${'1'.repeat(511)}0.9`);
  expect(r.absDiff.length).toBe(514);
  expect(r.relDiff).toBe('0.9999999999');
 });
 it('max-length operands on both sides stay exact; inputs over 512 are still rejected',()=>{
  const a='9'.repeat(512),b='-'+'9'.repeat(511);
  expect(compareWithinTolerance(a,a,'0')).toMatchObject({passed:true,absDiff:'0',relDiff:'0'});
  expect(compareWithinTolerance(a,b,'0').absDiff.length).toBeGreaterThan(512);
  expect(()=>compareWithinTolerance('1'.repeat(513),'1','0')).toThrow(RangeError);
 });
 it('formatDecimal is canonical without the cap',()=>{
  expect(formatDecimal(-5000n,3)).toBe('-5');
  expect(formatDecimal(0n,2)).toBe('0');
  expect(formatDecimal(10n**600n,0).length).toBe(601);
 });
});
