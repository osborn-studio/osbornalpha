// src/lib/macro/freshness.test.ts
import {describe,expect,it} from 'vitest';
import {recordAttempt} from '../dq/freshness';
import {memoryTableClient} from '../db/memory-table-client';
import {collectionStatus,datasetOf,monthEnd,nextPeriodEnd,releaseTimeliness,shiftMonthEnd} from './freshness';

describe('period arithmetic',()=>{
 it('month ends, leap years and negative shifts',()=>{
  expect(monthEnd(2026,2)).toBe('2026-02-28');
  expect(monthEnd(2024,2)).toBe('2024-02-29');
  expect(shiftMonthEnd('2026-01-31',1)).toBe('2026-02-28');
  expect(shiftMonthEnd('2024-01-31',1)).toBe('2024-02-29');
  expect(shiftMonthEnd('2026-03-31',-3)).toBe('2025-12-31');
  expect(shiftMonthEnd('2026-10-31',-24)).toBe('2024-10-31');
  expect(nextPeriodEnd('day','2026-12-31')).toBe('2027-01-01');
  expect(nextPeriodEnd('month','2026-11-30')).toBe('2026-12-31');
  expect(nextPeriodEnd('quarter','2026-09-30')).toBe('2026-12-31');
  expect(()=>shiftMonthEnd('2026-13-01',1)).toThrow(/invalid_date/);
 });
});

describe('releaseTimeliness (spec §0.2 M11: next period end + lag + 3 days)',()=>{
 const monthly={nativeFrequency:'monthly' as const,period:'month' as const,releaseLagDays:15};
 it('monthly: deadline = 2026-10-31 + 15 + 3 = 2026-11-18',()=>{
  expect(releaseTimeliness(monthly,'2026-09-30','2026-11-18')).toBe('current');
  expect(releaseTimeliness(monthly,'2026-09-30','2026-11-19')).toBe('late');
 });
 it('quarterly: deadline = 2026-09-30 + 20 + 3 = 2026-10-23',()=>{
  const q={nativeFrequency:'quarterly' as const,period:'quarter' as const,releaseLagDays:20};
  expect(releaseTimeliness(q,'2026-06-30','2026-10-23')).toBe('current');
  expect(releaseTimeliness(q,'2026-06-30','2026-10-24')).toBe('late');
 });
 it('daily-derived month-end series use the month period',()=>{
  const d={nativeFrequency:'daily' as const,period:'month' as const,releaseLagDays:1};
  expect(releaseTimeliness(d,'2026-09-30','2026-11-04')).toBe('current');   // 2026-10-31 + 4
  expect(releaseTimeliness(d,'2026-09-30','2026-11-05')).toBe('late');
 });
 it('no observation → missing; event or no lag → n/a; re-fetching the same old value never turns it current',()=>{
  expect(releaseTimeliness(monthly,null,'2026-11-06')).toBe('missing');
  expect(releaseTimeliness({nativeFrequency:'event',period:'day',releaseLagDays:1},'2026-09-17','2027-01-01')).toBe('n/a');
  expect(releaseTimeliness({nativeFrequency:'monthly',period:'month'},'2026-01-31','2027-01-01')).toBe('n/a');
  expect(releaseTimeliness(monthly,'2026-08-31','2026-11-06')).toBe('late');   // period_end decides, not fetch time
 });
});

describe('collectionStatus (shared dq_freshness, recomputed at read time)',()=>{
 it('reports both macro datasets, missing when never recorded, error after 2 consecutive failures',async()=>{
  const tables=memoryTableClient({dq_freshness:['dataset']});
  const t0=new Date('2026-11-06T05:30:00Z');
  await recordAttempt(tables,'macro.fred',{ok:true,cadence:'daily',now:t0});
  let s=await collectionStatus(tables,new Date('2026-11-06T06:00:00Z'));
  expect(s).toEqual([
   {dataset:'macro.fred',status:'fresh',lastOkAt:'2026-11-06T05:30:00.000Z',lastAttemptAt:'2026-11-06T05:30:00.000Z'},
   {dataset:'macro.akshare',status:'missing',lastOkAt:null,lastAttemptAt:null},
  ]);
  await recordAttempt(tables,'macro.akshare',{ok:false,cadence:'daily',now:t0});
  await recordAttempt(tables,'macro.akshare',{ok:false,cadence:'daily',now:new Date('2026-11-07T05:00:00Z')});
  s=await collectionStatus(tables,new Date('2026-11-07T06:00:00Z'));
  expect(s.find(x=>x.dataset==='macro.akshare')!.status).toBe('error');
  s=await collectionStatus(tables,new Date('2026-11-10T06:00:00Z'));
  expect(s.find(x=>x.dataset==='macro.fred')!.status).toBe('stale');   // reader recomputes; writer never ran again
 });
 it('maps regions to their single writer dataset',()=>{
  expect(datasetOf('US')).toBe('macro.fred');
  expect(datasetOf('CN')).toBe('macro.akshare');
 });
});
