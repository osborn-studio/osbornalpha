import {describe,it,expect} from 'vitest';
import {AGG_METRICS_US,CONFIG_HASH_US,CONFIG_HASH_US_V1_0,METHOD_CONFIG_US,METHOD_CONFIG_US_V1_0,US_METHOD_VERSIONS,isUsMethodVersion,methodConfigUs,usPickRule,expectedGridUs,usBuckets,usEnvelopeWindow} from './method-us';
describe('US method',()=>{
 it('pins the legacy method config',()=>expect(CONFIG_HASH_US_V1_0).toBe('9b6270977e8dd66f36bdffd8f1ed7bed6129d04fd8a7389348c41c6ec644351c'));
 it('pins the current method config',()=>expect(CONFIG_HASH_US).toBe('9db092e9a992c2b1668e9e460842eee71cbea7452d22d6332c65eb30e19812ea'));
 it('resolves the config and pick rule by version',()=>{
  expect([...US_METHOD_VERSIONS].sort()).toEqual(['industry-agg-us/1.0','industry-agg-us/1.1']);
  for(const [v,config,dualCurrency] of [['industry-agg-us/1.0',METHOD_CONFIG_US_V1_0,false],['industry-agg-us/1.1',METHOD_CONFIG_US,true]] as const){
   expect(isUsMethodVersion(v)).toBe(true);expect(methodConfigUs(v)).toBe(config);expect(usPickRule(v)).toEqual({dualCurrency});
  }
  expect(isUsMethodVersion('unknown')).toBe(false);expect(()=>methodConfigUs('unknown')).toThrow();expect(()=>usPickRule('unknown')).toThrow();
 });
 it('opens a bucket only on April 1 of the following year',()=>{
  expect(usBuckets('2026-03-31')).toEqual(['2022-12-31','2023-12-31','2024-12-31']);
  expect(usBuckets('2026-04-01')).toEqual(['2023-12-31','2024-12-31','2025-12-31']);
  expect(usBuckets('2026-04-01',1)).toEqual(['2025-12-31']);
 });
 it('records a sorted complete snapshot grid',()=>expect(expectedGridUs(['2000','1000','2000'],'2026-04-01')).toEqual({codes:['1000','2000'],period_ends:['2023-12-31','2024-12-31','2025-12-31'],metrics:AGG_METRICS_US,cell_rule:'fiscal_year_bucket/1',membership_on:'2026-04-01'}));
});

it('derives the envelope window from min/max bucket years including the prior year',()=>{
 expect(usEnvelopeWindow(['2025-12-31','2023-12-31','2024-12-31'])).toEqual({from:'2022-01-01',to:'2025-12-31'});
 expect(usEnvelopeWindow(['2025-12-31'])).toEqual({from:'2024-01-01',to:'2025-12-31'});
 expect(()=>usEnvelopeWindow([])).toThrow('invalid_us_window');
 expect(()=>usEnvelopeWindow(['bad'])).toThrow();
});
