// src/lib/evals/kinds/ratio.test.ts
import {describe,expect,it} from 'vitest';
import {ratioText} from './ratio';

describe('ratioText',()=>{
 it('exact, truncated toward zero, canonical text',()=>{
  expect(ratioText(2n,5n,4)).toBe('0.4');
  expect(ratioText(1n,1n,4)).toBe('1');
  expect(ratioText(0n,7n)).toBe('0');
  expect(ratioText(2n,3n)).toBe('0.6666666666');
  expect(ratioText(113n,400n)).toBe('0.2825');
  expect(ratioText(7n,2n,0)).toBe('3');
 });
 it('refuses a negative numerator or a non-positive denominator',()=>{
  expect(()=>ratioText(-1n,2n)).toThrow(RangeError);
  expect(()=>ratioText(1n,0n)).toThrow(RangeError);
 });
});
