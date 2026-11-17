// Exact decimal operations used by broker rules and public display (spec §5.3, §7.1).
import {describe,it,expect} from 'vitest';
import {dec,decAdd,decCmp,decDiv,decMul,decRound,decShift,decString,decSub,round1} from './decimal';
describe('decimal',()=>{
 it('parses and prints canonical decimals without Number',()=>{
  expect(decString(dec('120.00'))).toBe('120');expect(decString(dec('-0.0'))).toBe('0');expect(decString(dec('1e-3'))).toBe('0.001');
  expect(decString(dec('12345678901234567890.123456789'))).toBe('12345678901234567890.123456789');expect(()=>dec('1,000')).toThrow('invalid_decimal');
 });
 it('adds, subtracts, multiplies and compares exactly',()=>{
  expect(decString(decAdd(dec('0.1'),dec('0.2')))).toBe('0.3');expect(decString(decSub(dec('120'),dec('96.5')))).toBe('23.5');
  expect(decString(decMul(dec('0.25'),dec('96')))).toBe('24');expect(decCmp(dec('0.30'),dec('0.3'))).toBe(0);expect(decCmp(dec('-1'),dec('0.5'))).toBe(-1);
 });
 it('shifts by powers of ten',()=>{expect(decString(decShift(dec('12.5'),-2))).toBe('0.125');expect(decString(decShift(dec('0.125'),2))).toBe('12.5');expect(decString(decShift(dec('3'),3))).toBe('3000');});
 it('rounds half away from zero',()=>{expect(round1('25.25')).toBe('25.3');expect(round1('25.24')).toBe('25.2');expect(round1('-25.25')).toBe('-25.3');expect(round1('0.05')).toBe('0.1');expect(round1('7')).toBe('7');expect(decString(decRound(dec('1.995'),2))).toBe('2');});
 it('divides for display with rounding',()=>{expect(decString(decDiv(dec('120'),dec('96'),6))).toBe('1.25');expect(decString(decDiv(dec('1'),dec('3'),4))).toBe('0.3333');expect(decString(decDiv(dec('-2'),dec('3'),2))).toBe('-0.67');expect(()=>decDiv(dec('1'),dec('0'),2)).toThrow('division_by_zero');});
});
