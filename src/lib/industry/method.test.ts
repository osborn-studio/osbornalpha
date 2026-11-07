// src/lib/industry/method.test.ts
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {DERIVE_CONCEPTS} from '../facts/derive';
import {canonicalJson,sha256Hex} from './canonical-json';
import {AGG_CONCEPTS,AGG_METRICS,CONFIG_HASH,DISPLAY_MAX_UNRESOLVED,DISPLAY_MIN_COVERAGE,METHOD_CONFIG,METHOD_VERSION,cellKey,cellSpecs,displayFlags,expectedCells,expectedGrid,isFinancialCode,isFinancialNode,quarterEnds,quarterStart,shiftYears} from './method';
import type {ClassificationRow} from './types';

describe('method',()=>{
 it('pins the method version and the config hash (editing METHOD_CONFIG requires a METHOD_VERSION bump and a new pin)',()=>{
  expect(METHOD_VERSION).toBe('industry-agg/1.0');
  expect(CONFIG_HASH).toBe(sha256Hex(canonicalJson(METHOD_CONFIG)));
  expect(CONFIG_HASH).toBe('20a7f6211f0b28a3ff72658f504152de82647b5b804a54d074c1769d3d7cfa34');
  expect(METHOD_CONFIG).toMatchObject({financial_l1_codes:['801780','801790'],display_min_coverage:'0.8',display_max_unresolved:'0.05',percentile_sampling:'month_end_published',total_share_basis:'all_classes_incl_h_b',code_aliases:{'850412.SI':'850401.SI'},currency:'CNY'});
  expect(DISPLAY_MIN_COVERAGE).toBe('0.8');expect(DISPLAY_MAX_UNRESOLVED).toBe('0.05');
  // browser-safe: client components import these through display.ts (Codex plan audit round 1 #1)
  expect(readFileSync(new URL('./method-constants.ts',import.meta.url),'utf8')).not.toMatch(/^\s*import\s/m);
 });
 it('AGG_CONCEPTS is plan 2 DERIVE_CONCEPTS.CN (one envelope per issuer reads every concept, V6)',()=>{
  expect(AGG_CONCEPTS).toEqual([...DERIVE_CONCEPTS.CN]);
  for(const c of ['revenue','revenue_operating','cost_of_revenue','net_income_parent','equity_parent'])expect(AGG_CONCEPTS).toContain(c);
 });
 it('quarter helpers',()=>{
  expect(quarterEnds('2024-05-01','2025-03-31')).toEqual(['2024-06-30','2024-09-30','2024-12-31','2025-03-31']);
  expect(quarterEnds('2024-06-30','2024-06-29')).toEqual([]);
  expect(quarterStart('2024-09-30')).toBe('2024-07-01');
  expect(()=>quarterStart('2024-09-29')).toThrow('not_quarter_end');
  expect(shiftYears('2025-03-31',-1)).toBe('2024-03-31');
  expect(()=>shiftYears('2024-02-29',-1)).toThrow('invalid_date');
 });
 it('cellSpecs: 12M and gross_margin only at December 31; TTM window of four quarters; INSTANT member_count',()=>{
  const dec=cellSpecs('2024-12-31').map(c=>`${c.metric}/${c.duration}/${c.period_start}/${c.unit}`);
  expect(dec).toEqual([
   'revenue_sum/12M/2024-01-01/CNY','revenue_sum/3M/2024-10-01/CNY',
   'net_income_parent_sum/12M/2024-01-01/CNY','net_income_parent_sum/3M/2024-10-01/CNY',
   'gross_margin/12M/2024-01-01/ratio','roe/TTM/2024-01-01/ratio',
   'revenue_yoy/12M/2024-01-01/ratio','revenue_yoy/3M/2024-10-01/ratio',
   'net_income_yoy/12M/2024-01-01/ratio','net_income_yoy/3M/2024-10-01/ratio',
   'member_count/INSTANT/2024-12-31/count']);
  const mar=cellSpecs('2025-03-31').map(c=>`${c.metric}/${c.duration}/${c.period_start}`);
  expect(mar).toEqual(['revenue_sum/3M/2025-01-01','net_income_parent_sum/3M/2025-01-01','roe/TTM/2024-04-01','revenue_yoy/3M/2025-01-01','net_income_yoy/3M/2025-01-01','member_count/INSTANT/2025-03-31']);
  // every metric has at least one cell at every period_end except gross_margin off December
  for(const pe of ['2025-03-31','2025-06-30','2025-09-30'])expect(new Set(cellSpecs(pe).map(c=>c.metric))).toEqual(new Set(AGG_METRICS.filter(m=>m!=='gross_margin')));
 });
 it('expectedGrid and expectedCells',()=>{
  const g=expectedGrid(['801780.SI','801120.SI','801120.SI'],'2024-06-30','2025-05-15');
  expect(g).toEqual({codes:['801120.SI','801780.SI'],period_ends:['2024-06-30','2024-09-30','2024-12-31','2025-03-31'],metrics:[...AGG_METRICS]});
  const cells=expectedCells(g);
  expect(cells).toHaveLength(2*(3*6+11));   // 6 (metric, duration) pairs off December, 11 on December 31
  expect(cells.filter(c=>c.metric==='gross_margin').map(c=>c.period_end)).toEqual(['2024-12-31','2024-12-31']);
  // the (metric, duration) table of activate_industry_metric_run (Task 2 SQL / Task 3 memory) — keep these in lockstep
  const md=(pe:string)=>[...new Set(cells.filter(c=>c.period_end===pe&&c.code==='801120.SI').map(c=>`${c.metric}:${c.duration}`))].sort();
  expect(md('2024-09-30')).toEqual(['member_count:INSTANT','net_income_parent_sum:3M','net_income_yoy:3M','revenue_sum:3M','revenue_yoy:3M','roe:TTM']);
  expect(md('2024-12-31')).toEqual([...md('2024-09-30'),'gross_margin:12M','net_income_parent_sum:12M','net_income_yoy:12M','revenue_sum:12M','revenue_yoy:12M'].sort());
  expect(()=>expectedGrid([],'2024-01-01','2024-12-31')).toThrow('invalid_grid:no_codes');
  expect(()=>expectedGrid(['x'],'2025-01-01','2024-12-31')).toThrow('invalid_grid');
  expect(()=>expectedGrid(['x'],'2024-13-01','2024-12-31')).toThrow('invalid_date:historyStart');
  expect(cellKey('801120.SI','2024-12-31')).toBe('801120.SI:2024-12-31');
 });
 it('financial codes: banks and non-bank financials, with or without the .SI suffix, also through the parent chain',()=>{
  expect(isFinancialCode('801780.SI')).toBe(true);expect(isFinancialCode('801790')).toBe(true);expect(isFinancialCode('801120.SI')).toBe(false);
  const node=(code:string,level:number,parent:string|null):ClassificationRow=>({scheme:'sw2021',version:'2021',code,level,name_zh:code,name_en:null,parent_code:parent,attributes:{}});
  const tree=[node('801780.SI',1,null),node('L2BANK',2,'801780.SI'),node('L3BANK',3,'L2BANK'),node('801120.SI',1,null),node('L3FOOD',3,'801120.SI'),node('ORPHAN',3,'NOPE')];
  expect(isFinancialNode('L3BANK',tree)).toBe(true);
  expect(isFinancialNode('801780.SI',tree)).toBe(true);
  expect(isFinancialNode('L3FOOD',tree)).toBe(false);
  expect(isFinancialNode('ORPHAN',tree)).toBe(false);
  expect(isFinancialNode('UNKNOWN',tree)).toBe(false);
 });
 it('display flags use the two thresholds on members + unresolved, without changing status',()=>{
  expect(displayFlags({n_members:9,n_with_data:8,n_unresolved:1})).toEqual({coverageOk:true,unresolvedOk:false});   // 8 >= 8; 1 > 0.5
  expect(displayFlags({n_members:20,n_with_data:15,n_unresolved:0})).toEqual({coverageOk:false,unresolvedOk:true});
  expect(displayFlags({n_members:0,n_with_data:0,n_unresolved:0})).toEqual({coverageOk:false,unresolvedOk:true});
 });
});
