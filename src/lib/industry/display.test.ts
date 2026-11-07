// src/lib/industry/display.test.ts
import {describe,expect,it} from 'vitest';
import {cellDisplay,formatDecimal,formatMetricValue,formatMoney,formatValuation,percentText,ratioAbove,ratioAtLeast} from './display';

describe('exact threshold comparison',()=>{
 it('compares as rationals (12/15 = 0.8 exactly; 0.8*15 in floating point is 12.000000000000002)',()=>{
  expect(ratioAtLeast(12,15,0.8)).toBe(true);
  expect(ratioAtLeast(11,15,'0.8')).toBe(false);
  expect(ratioAbove(1,20,0.05)).toBe(false);
  expect(ratioAbove(2,20,0.05)).toBe(true);
 });
});

describe('cellDisplay (spec §5.2 display thresholds)',()=>{
 const c=(p:Partial<{status:'ok'|'missing';n_members:number;n_with_data:number;n_unresolved:number}>)=>({status:'ok' as const,n_members:10,n_with_data:10,n_unresolved:0,...p});
 it('missing cells are missing whatever their counts',()=>expect(cellDisplay(c({status:'missing'}))).toBe('missing'));
 it('coverage below 0.8 of (members + unresolved) is insufficient',()=>{
  expect(cellDisplay(c({n_with_data:8}))).toBe('value');
  expect(cellDisplay(c({n_with_data:7}))).toBe('insufficient');
  expect(cellDisplay(c({n_members:12,n_with_data:12,n_unresolved:3}))).toBe('unresolved');   // 3/15 > 0.05
 });
 it('unresolved share above 0.05 wins over coverage',()=>{
  expect(cellDisplay(c({n_members:19,n_with_data:19,n_unresolved:1}))).toBe('value');          // 1/20 = 0.05, not above
  expect(cellDisplay(c({n_members:9,n_with_data:3,n_unresolved:1}))).toBe('unresolved');
 });
});

describe('formatDecimal (string arithmetic, no JS number)',()=>{
 it('shifts, rounds half away from zero and groups',()=>{
  expect(formatDecimal('0.4783',{shift:2,digits:1})).toBe('47.8');
  expect(formatDecimal('0.47850',{shift:2,digits:2})).toBe('47.85');
  expect(formatDecimal('0.0005',{shift:2,digits:1})).toBe('0.1');
  expect(formatDecimal('-0.0004',{shift:2,digits:1})).toBe('0.0');
  expect(formatDecimal('-1.25',{digits:1})).toBe('-1.3');
  expect(formatDecimal('170899000000',{shift:-8,digits:2,group:true})).toBe('1,708.99');
  expect(formatDecimal('5',{shift:-3,digits:2})).toBe('0.01');
  expect(formatDecimal('123',{digits:0,group:true})).toBe('123');
 });
 it('keeps precision a double cannot hold',()=>{
  expect(formatDecimal('12345678901234567890.123456789',{digits:6,group:true})).toBe('12,345,678,901,234,567,890.123457');
 });
 it('returns unparseable text unchanged',()=>expect(formatDecimal('1e5',{digits:1})).toBe('1e5'));
});

describe('metric formats',()=>{
 it('ratios as percent, YoY signed, sums in 亿 / ×1e8, counts grouped',()=>{
  expect(formatMetricValue('gross_margin','0.478','zh')).toBe('47.8%');
  expect(formatMetricValue('revenue_yoy','0.116','en')).toBe('+11.6%');
  expect(formatMetricValue('net_income_yoy','-0.031','zh')).toBe('-3.1%');
  expect(formatMetricValue('revenue_yoy','0','zh')).toBe('0.0%');
  expect(formatMetricValue('revenue_sum','2971040000000','zh')).toBe('29,710.40 亿元');
  expect(formatMetricValue('revenue_sum','2971040000000','en')).toBe('29,710.40 × 1e8 CNY');
  expect(formatMetricValue('member_count','1240','en')).toBe('1,240');
 });
 it('valuations and fact money',()=>{
  expect(formatValuation('pe_ttm','24.815','zh')).toBe('24.82');
  expect(formatValuation('market_cap','4891260000000','zh')).toBe('48,912.60 亿元');
  expect(formatMoney('130497000000','USD','en')).toBe('130.50 bn USD');
  expect(formatMoney('12','HKD','en')).toBe('12 HKD');
  expect(percentText('0.382')).toBe('38.2');
 });
});
