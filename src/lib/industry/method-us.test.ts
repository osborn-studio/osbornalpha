import {describe,it,expect} from 'vitest';
import {AGG_METRICS_US,CONFIG_HASH_US,expectedGridUs,usBuckets,usEnvelopeWindow} from './method-us';
describe('US method',()=>{
 it('pins the complete method config',()=>expect(CONFIG_HASH_US).toBe('9b6270977e8dd66f36bdffd8f1ed7bed6129d04fd8a7389348c41c6ec644351c'));
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
