import {describe,expect,it} from 'vitest';
import {defaultMetric,metricsForScheme} from '@/lib/industry/read';
import {countIndustryValues,metricsForDisplay} from './display-model';

describe('selector display order',()=>{
 it('orders SIC for display while preserving the metric set and page default',()=>{
  const order=metricsForDisplay('sic');
  expect(order).toEqual(['member_count','revenue_sum','net_margin','gross_margin','revenue_yoy','net_income_parent_sum','net_income_yoy']);
  expect([...order].sort()).toEqual([...metricsForScheme('sic')].sort());
  expect(order[1]).toBe(defaultMetric('sic'));
 });
 it('preserves SW order',()=>expect(metricsForDisplay('sw2021')).toEqual(metricsForScheme('sw2021')));
});

describe('industry value coverage',()=>{
 it('counts server display flags only, including member_count values below financial thresholds',()=>{
  const cells=[
   {metric:'member_count',display:'value' as const,nMembers:2,nWithData:0},
   {display:'value' as const},
   ...(['missing','members','coverageSic','insufficient','unresolved'] as const).map(display=>({display})),
   null,undefined,
  ];
  expect(countIndustryValues(cells)).toBe(2);
 });
 it('handles no cells',()=>expect(countIndustryValues([])).toBe(0));
});
