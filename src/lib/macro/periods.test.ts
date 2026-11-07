import {describe,expect,it} from 'vitest';
import {isIsoDate,monthEnd,monthKey,periodEndOf,quarterEnd,shiftMonthEnd} from './periods';

describe('periods',()=>{
 it('validates real calendar dates only',()=>{
  expect(isIsoDate('2024-02-29')).toBe(true);
  for(const s of ['2026-02-29','2026-13-01','2026-1-01','2026-01-00','20260101',''])expect(isIsoDate(s),s).toBe(false);
 });
 it('computes month and quarter ends, including leap Februaries',()=>{
  expect(monthEnd(2024,2)).toBe('2024-02-29');expect(monthEnd(2026,2)).toBe('2026-02-28');expect(monthEnd(2026,12)).toBe('2026-12-31');
  expect(quarterEnd(2026,3)).toBe('2026-09-30');expect(quarterEnd(2026,1)).toBe('2026-03-31');
  expect(()=>monthEnd(2026,13)).toThrow('invalid_month');expect(()=>quarterEnd(2026,5)).toThrow('invalid_quarter');
 });
 it('maps a date to the period end of its period kind',()=>{
  expect(periodEndOf('2026-09-01','month')).toBe('2026-09-30');
  expect(periodEndOf('2026-07-01','quarter')).toBe('2026-09-30');
  expect(periodEndOf('2026-03-16','day')).toBe('2026-03-16');
  expect(()=>periodEndOf('2026-02-30','day')).toThrow('invalid_date');
 });
 it('shifts month ends across years in both directions',()=>{
  expect(shiftMonthEnd('2026-03-31',-12)).toBe('2025-03-31');
  expect(shiftMonthEnd('2024-02-29',-12)).toBe('2023-02-28');
  expect(shiftMonthEnd('2026-01-15',-1)).toBe('2025-12-31');
  expect(shiftMonthEnd('2026-12-31',1)).toBe('2027-01-31');
  expect(monthKey('2026-09-30')).toBe('2026-09');
 });
});
