import {expect,it} from 'vitest';
import {heatStep} from './heat-model';
import {formatCell} from './format';
import {readFileSync} from 'node:fs';

it('uses stable magnitude intervals without rounding values to decide their shade',()=>{
 expect([null,'0','4.99','5','14.99','15','30','30.0000000000000001','-0.1','-5','-15','-31'].map(heatStep))
  .toEqual(['missing','zero','p1','p2','p2','p3','p3','p4','n1','n2','n3','n4']);
});
it('rounds decimal values once, half away from zero, after unit conversion',()=>{
 const fmt=(valueText:string|null,unit:'pct'|'count'|'cny_10k',locale:'zh'|'en'='en',metric='revenue_yoy')=>
  formatCell({valueText,unit,metric,missingReason:'no_prior_period'},locale,k=>k);
 expect(fmt('37.65','pct')).toBe('+37.7%');
 expect(fmt('-0.05','pct')).toBe('−0.1%');
 expect(fmt('0','pct')).toBe('+0.0%');
 expect(fmt('96','pct','en','gross_margin')).toBe('96.0%');
 expect(fmt('9876543210123456789950','cny_10k')).toBe('987654321012345679.00 CNY 100m');
 expect(fmt('-150','cny_10k','zh')).toBe('−0.02 亿元');
 expect(fmt('89999999999999999','count')).toBe('89999999999999999');
 expect(fmt(null,'pct')).toContain('missing.no_prior_period');
});
it('pairs the signed grid with a table and bookmarkable phone period',()=>{
 const src=readFileSync('src/components/industries/cn/CnList.tsx','utf8');
 expect(src).toContain('<table');
 expect(src).toContain('PeriodStepper');
 expect(src).toContain('vendorCellPayload');
});
