// src/lib/macro/quality.test.ts
import {describe,expect,it} from 'vitest';
import {MACRO_CATALOG} from './catalog';
import {KNOWN_UNITS,MACRO_RULES_VERSION,profileOf,validatePoint} from './quality';
import type {SeriesType} from './types';

const d=(unit:string,type:SeriesType|null)=>({unit,type});
const ids=(r:ReturnType<typeof validatePoint>)=>r.failed.map(f=>f.ruleId);

describe('validatePoint',()=>{
 it('passes in-range values and reports the rules version',()=>{
  const r=validatePoint(d('pct','pmi'),'49.3','50.1');
  expect(r).toEqual({passed:true,failed:[],version:MACRO_RULES_VERSION});
  expect(MACRO_RULES_VERSION).toBe('macro-rules/1');
 });
 it('rejects non-canonical value text before Number() conversion',()=>{
  for(const t of ['',' ','0x10','Infinity','1e3']){
   const r=validatePoint(d('pct','pmi'),t,null);
   expect(r.passed).toBe(false);
   expect(ids(r)).toEqual(['macro.canonical']);
   expect(r.failed[0].detail).toEqual({reason:'not_canonical'});
  }
 });
 it('applies per-type ranges for pct series',()=>{
  expect(ids(validatePoint(d('pct','pmi'),'100.1',null))).toEqual(['macro.range']);
  expect(ids(validatePoint(d('pct','pmi'),'0',null))).toEqual([]);
  expect(ids(validatePoint(d('pct','policy_rate'),'31',null))).toEqual(['macro.range']);
  expect(ids(validatePoint(d('pct','bond_yield'),'-0.5',null))).toEqual([]);              // negative yields are real
  expect(ids(validatePoint(d('pct','inflation_yoy'),'-50.1',null))).toEqual(['macro.range']);
  expect(ids(validatePoint(d('pct','growth_yoy'),'154.9',null))).toEqual([]);              // CN exports 2021-02
  expect(ids(validatePoint(d('pct','labor_rate'),'14.8','4.4'))).toEqual([]);              // no jump rule on unemployment
  expect(ids(validatePoint(d('pct',null),'4',null))).toEqual([]);                           // fed target bound (event source)
 });
 it('applies per-unit ranges whatever the type',()=>{
  expect(ids(validatePoint(d('index_prev_year_100','inflation_yoy'),'100.9',null))).toEqual([]);
  expect(ids(validatePoint(d('index_prev_year_100','inflation_yoy'),'0.9',null))).toEqual(['macro.range']);   // a yoy rate in an index slot
  expect(ids(validatePoint(d('cny_per_100usd','fx'),'671.56',null))).toEqual([]);
  expect(ids(validatePoint(d('cny_per_100usd','fx'),'6.7156',null))).toEqual(['macro.range']);                // per-1-USD quote: wrong unit
  expect(ids(validatePoint(d('usd_per_bbl','asset_price'),'-36.98','18.27'))).toEqual([]);                  // WTI 2020-04-20
  expect(ids(validatePoint(d('index','fx'),'121.6656','121.5'))).toEqual([]);
  expect(ids(validatePoint(d('index','pmi'),'49.3','50.1'))).toEqual([]);                                     // NBS PMI is unit 'index'
  expect(ids(validatePoint(d('index','pmi'),'101',null))).toEqual(['macro.range']);
  expect(ids(validatePoint(d('index_1982_84_100',null),'336.298','335.1'))).toEqual([]);                     // US CPI index level
  expect(ids(validatePoint(d('index_2009_11_100',null),'-1',null))).toEqual(['macro.range']);
 });
 it('applies jump limits on levels, not on rates of change',()=>{
  expect(ids(validatePoint(d('pct','bond_yield'),'4.9','2.1'))).toEqual(['macro.jump']);
  expect(ids(validatePoint(d('pct','bond_yield'),'0.73','1.0'))).toEqual([]);
  expect(ids(validatePoint(d('cny_per_100usd','fx'),'760','671.56'))).toEqual(['macro.jump']);
  expect(ids(validatePoint(d('index','pmi'),'35.7','50'))).toEqual([]);                     // CN PMI 2020-02 is real
  expect(ids(validatePoint(d('pct','inflation_yoy'),'9.1','0.1'))).toEqual([]);
  expect(ids(validatePoint(d('pct','bond_yield'),'4.9',null))).toEqual([]);                 // no previous value
 });
 it('fails unknown units and non-numeric text',()=>{
  expect(ids(validatePoint(d('percent','pmi'),'50',null))).toEqual(['macro.unit']);
  expect(profileOf(d('percent','pmi'))).toBeNull();
  const r=validatePoint(d('pct','pmi'),'abc',null);
  expect(ids(r)).toEqual(['macro.canonical']);
  expect(r.failed[0].detail).toMatchObject({reason:'not_canonical'});
 });
 it('has a known unit and a profile for every active native catalog series',()=>{
  for(const s of MACRO_CATALOG.filter(x=>x.status==='active'&&!x.derive&&!x.aliasOf)){
   expect(KNOWN_UNITS as readonly string[],s.id).toContain(s.unit);
   expect(profileOf(s),s.id).not.toBeNull();
  }
 });
});
