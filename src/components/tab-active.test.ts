// src/components/tab-active.test.ts
import {describe,expect,it} from 'vitest';
import {isTabActive} from './tab-active';

describe('isTabActive',()=>{
 it('today is exact; others match the path segment prefix',()=>{
  expect(isTabActive('/today','/today')).toBe(true);
  expect(isTabActive('/today','/today/x')).toBe(false);
  expect(isTabActive('/intel','/intel')).toBe(true);
  expect(isTabActive('/intel','/intel/companies')).toBe(true);
  expect(isTabActive('/intel','/intelligence')).toBe(false);
  expect(isTabActive('/watchlist','/watchlist/tracking')).toBe(true);
  expect(isTabActive('/watchlist','/stock/AAPL')).toBe(false);
 });
});
