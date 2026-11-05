// src/lib/facts/units.test.ts
import {describe,it,expect} from 'vitest';
import {unitRule} from '../dq/rules';
import {normalizeUnit,rawUnitOf,allowedUnits,unitKindOf,CURRENCIES} from './units';

describe('units',()=>{
 it('normalises companyfacts units and rejects shapes we do not store',()=>{
  expect(normalizeUnit('USD')).toBe('USD');
  expect(normalizeUnit('shares')).toBe('shares');
  expect(normalizeUnit('USD/shares')).toBe('USD/share');
  expect(normalizeUnit('CNY/shares')).toBe('CNY/share');
  expect(normalizeUnit('pure')).toBe('pure');
  expect(normalizeUnit('EUR')).toBe('EUR');
  expect(normalizeUnit('QAR')).toBe('QAR');
  expect(normalizeUnit('KWD/shares')).toBe('KWD/share');
  for(const bad of ['USD/EUR','Year','sqft','usd','XXX','USD/share'])expect(normalizeUnit(bad)).toBeNull();
 });
 it('gives Tushare columns CNY-based units by kind',()=>{
  expect(rawUnitOf('money')).toBe('CNY');
  expect(rawUnitOf('per_share')).toBe('CNY/share');
  expect(rawUnitOf('shares')).toBe('shares');
  expect(rawUnitOf('money','USD')).toBe('USD');
  expect(()=>rawUnitOf('money','XXX')).toThrow('unknown_currency');
 });
 it('feeds unitRule with the allowed list per kind',()=>{
  expect(allowedUnits('shares')).toEqual(['shares']);
  expect(allowedUnits('money')).toEqual(CURRENCIES);
  expect(allowedUnits('per_share')).toContain('USD/share');
  expect(unitRule('unit_money','USD',allowedUnits('money')).passed).toBe(true);
  expect(unitRule('unit_money','pure',allowedUnits('money')).passed).toBe(false);
  expect(unitRule('unit_per_share','USD/shares',allowedUnits('per_share')).passed).toBe(false);
 });
 it('classifies stored units back into kinds',()=>{
  expect(unitKindOf('USD')).toBe('money');expect(unitKindOf('shares')).toBe('shares');
  expect(unitKindOf('BHD')).toBe('money');expect(unitKindOf('PKR/share')).toBe('per_share');
  expect(unitKindOf('CNY/share')).toBe('per_share');expect(unitKindOf('pure')).toBeNull();
 });
});
