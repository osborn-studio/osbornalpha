// src/lib/company/metric-catalog.test.ts
import {describe,expect,it} from 'vitest';
import {DERIVE_CONCEPTS,FORMULA_VERSION,metricNames} from '@/lib/facts/derive';
import {conceptById} from '@/lib/facts/concepts';
import type {Market} from '@/lib/facts/types';
import {METRIC_CATALOG,METRIC_CATALOG_VERSION,catalogFor} from './metric-catalog';

const MARKETS:Market[]=['US','CN'];
describe('METRIC_CATALOG (§0.1 item 1)',()=>{
 it('is keyed by the landed FORMULA_VERSION (a version bump fails here until the texts are reviewed)',()=>{
  expect(METRIC_CATALOG_VERSION).toBe(FORMULA_VERSION);
  for(const e of Object.values(METRIC_CATALOG))expect(e.formulaVersion,e.metric).toBe(FORMULA_VERSION);
  expect(catalogFor(FORMULA_VERSION)).toBe(METRIC_CATALOG);
  expect(catalogFor('facts-derive/0.9')).toBeNull();
 });
 it('covers exactly metricNames(US) ∪ metricNames(CN)',()=>{
  const want=[...new Set([...metricNames('US'),...metricNames('CN')])].sort();
  expect(Object.keys(METRIC_CATALOG).sort()).toEqual(want);
  for(const [k,e] of Object.entries(METRIC_CATALOG))expect(e.metric).toBe(k);
 });
 it('inputs and basis exist exactly for the markets that produce the metric; inputs ⊆ DERIVE_CONCEPTS; texts non-empty',()=>{
  for(const e of Object.values(METRIC_CATALOG)){
   for(const m of MARKETS){
    const produced=metricNames(m).includes(e.metric);
    expect(e.inputs[m]!==undefined,`${e.metric} inputs ${m}`).toBe(produced);
    expect(e.basisByMarket[m]!==undefined,`${e.metric} basis ${m}`).toBe(produced);
    for(const c of e.inputs[m]??[]){expect(conceptById(c),c).toBeDefined();expect(DERIVE_CONCEPTS[m],`${e.metric}:${c}`).toContain(c);}
   }
   for(const t of [e.zh.name,e.zh.formula,e.en.name,e.en.formula])expect(t.trim().length,e.metric).toBeGreaterThan(0);
  }
 });
 it('§0 #66 wording: CN single-quarter revenue is total operating revenue; CN gross margin uses revenue_operating and cost_of_revenue',()=>{
  expect(METRIC_CATALOG.q_single_revenue.inputs.CN).toEqual(['revenue']);
  expect(METRIC_CATALOG.q_single_revenue.zh.formula).toContain('营业总收入');
  expect(METRIC_CATALOG.gross_margin.inputs.CN).toEqual(['revenue_operating','cost_of_revenue']);
  expect(METRIC_CATALOG.fcf.basisByMarket).toEqual({US:'us_standard',CN:'cn_incl_intangibles'});
  expect(METRIC_CATALOG.borrowings_total.basisByMarket).toEqual({US:'us_standard',CN:'cn_incl_bonds'});
  expect(METRIC_CATALOG.q_single_capex.basisByMarket).toEqual({US:'us_standard'});
  expect(METRIC_CATALOG.ttm_capex_incl_intangibles.basisByMarket).toEqual({CN:'cn_incl_intangibles'});
  expect(METRIC_CATALOG.roe.unitKind).toBe('ratio');expect(METRIC_CATALOG.fcf.unitKind).toBe('money');
 });
});
