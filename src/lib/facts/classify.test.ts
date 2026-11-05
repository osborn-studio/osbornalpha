// src/lib/facts/classify.test.ts
import {describe,it,expect} from 'vitest';
import {classifyDuration,daysBetween,dateMs,isDate} from './classify';

describe('classifyDuration',()=>{
 it('maps day counts to the four bands and instants to INSTANT',()=>{
  expect(classifyDuration('2023-07-02','2023-09-30')).toBe('3M');   // 90 days
  expect(classifyDuration('2023-07-01','2023-09-30')).toBe('3M');   // 91
  expect(classifyDuration('2023-04-02','2023-09-30')).toBe('6M');   // 181
  expect(classifyDuration('2023-01-01','2023-09-30')).toBe('9M');   // 272
  expect(classifyDuration('2022-10-01','2023-09-30')).toBe('12M');  // 364
  expect(classifyDuration('2023-01-01','2023-12-31')).toBe('12M');  // 364
  expect(classifyDuration('2024-01-01','2024-12-31')).toBe('12M');  // 365 (leap year)
  expect(classifyDuration(null,'2023-09-30')).toBe('INSTANT');
 });
 it('returns odd outside the bands, for reversed or invalid dates',()=>{
  expect(classifyDuration('2023-09-01','2023-09-30')).toBe('odd');  // 29
  expect(classifyDuration('2023-05-01','2023-09-30')).toBe('odd');  // 152: between 3M and 6M
  expect(classifyDuration('2021-01-01','2023-09-30')).toBe('odd');  // 2 years
  expect(classifyDuration('2023-09-30','2023-09-30')).toBe('odd');
  expect(classifyDuration('2023-10-01','2023-09-30')).toBe('odd');
  expect(classifyDuration('2023-02-30','2023-09-30')).toBe('odd');
  expect(classifyDuration(null,'20230930')).toBe('odd');
  expect(classifyDuration('x','2023-09-30')).toBe('odd');
 });
 it('exposes band edges exactly',()=>{
  expect(daysBetween('2023-01-01','2023-03-17')).toBe(75);expect(classifyDuration('2023-01-01','2023-03-17')).toBe('3M');
  expect(daysBetween('2023-01-01','2023-04-16')).toBe(105);expect(classifyDuration('2023-01-01','2023-04-16')).toBe('3M');
  expect(classifyDuration('2023-01-01','2023-04-17')).toBe('odd');
  expect(dateMs('2023-02-30')).toBeNull();expect(isDate('2024-02-29')).toBe(true);expect(isDate('2023-02-29')).toBe(false);
 });
});
