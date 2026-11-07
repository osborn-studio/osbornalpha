// src/lib/industry/cadence.test.ts
// The weekly freshness cadence the industry jobs record (spec §5.4 step 7, V10): 7-day window plus
// 2-day grace, accepted by recordAttempt (plan 3 adds the same cadence; this file guards it for the
// industry module whichever plan lands first).
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {CADENCES,computeFreshness,recordAttempt} from '../dq/freshness';

const T=(s:string)=>new Date(s);
describe('weekly cadence',()=>{
 it('is fresh for 7d + 2d after the last success, stale afterwards, error after two failures',()=>{
  const now=T('2026-11-10T00:00:00Z');
  expect(computeFreshness({cadence:'weekly',lastOkAt:T('2026-11-01T01:00:00Z'),consecutiveErrors:0,now})).toBe('fresh');   // 8d23h
  expect(computeFreshness({cadence:'weekly',lastOkAt:T('2026-10-31T23:00:00Z'),consecutiveErrors:0,now})).toBe('stale');   // 9d1h
  expect(computeFreshness({cadence:'weekly',lastOkAt:T('2026-11-09T00:00:00Z'),consecutiveErrors:2,now})).toBe('error');
  expect(CADENCES).toEqual(['daily','weekly','monthly','quarterly','event']);
 });
 it('recordAttempt stores the weekly cadence for an industry dataset',async()=>{
  const c=memoryTableClient({dq_freshness:['dataset']});
  expect(await recordAttempt(c,'industry.agg.sw2021',{ok:true,cadence:'weekly',now:T('2026-11-05T00:00:00Z')})).toBe('fresh');
  expect(c.rows('dq_freshness')[0]).toMatchObject({dataset:'industry.agg.sw2021',expected_cadence:'weekly',status:'fresh'});
 });
});
