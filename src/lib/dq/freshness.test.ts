import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {computeFreshness,recordAttempt,freshnessOf} from './freshness';

const T=(iso:string)=>new Date(iso);

describe('computeFreshness',()=>{
 it('is missing without a successful run, error after two consecutive failures',()=>{
  expect(computeFreshness({cadence:'daily',lastOkAt:null,consecutiveErrors:0,now:T('2026-11-05T00:00:00Z')})).toBe('missing');
  expect(computeFreshness({cadence:'daily',lastOkAt:T('2026-11-04T00:00:00Z'),consecutiveErrors:2,now:T('2026-11-05T00:00:00Z')})).toBe('error');
  expect(computeFreshness({cadence:'daily',lastOkAt:null,consecutiveErrors:2,now:T('2026-11-05T00:00:00Z')})).toBe('error');
 });
 it('uses cadence windows plus grace: daily 1d+1d, monthly 31d+3d, quarterly 92d+3d, event never stale',()=>{
  const now=T('2026-11-05T00:00:00Z');
  expect(computeFreshness({cadence:'daily',lastOkAt:T('2026-11-03T12:00:00Z'),consecutiveErrors:0,now})).toBe('fresh');
  expect(computeFreshness({cadence:'daily',lastOkAt:T('2026-11-02T12:00:00Z'),consecutiveErrors:0,now})).toBe('stale');
  expect(computeFreshness({cadence:'monthly',lastOkAt:T('2026-10-03T00:00:00Z'),consecutiveErrors:0,now})).toBe('fresh');
  expect(computeFreshness({cadence:'monthly',lastOkAt:T('2026-10-01T00:00:00Z'),consecutiveErrors:0,now})).toBe('stale');
  expect(computeFreshness({cadence:'quarterly',lastOkAt:T('2026-08-10T00:00:00Z'),consecutiveErrors:0,now})).toBe('fresh');
  expect(computeFreshness({cadence:'quarterly',lastOkAt:T('2026-07-25T00:00:00Z'),consecutiveErrors:0,now})).toBe('stale');
  expect(computeFreshness({cadence:'event',lastOkAt:T('2020-01-01T00:00:00Z'),consecutiveErrors:0,now})).toBe('fresh');
 });
});

describe('recordAttempt',()=>{
 it('upserts the dataset row, resets errors on success and counts consecutive failures',async()=>{
  const c=memoryTableClient();
  await recordAttempt(c,'facts.us',{ok:false,cadence:'daily',now:T('2026-11-05T00:00:00Z'),detail:{code:'network'}});
  expect(c.rows('dq_freshness')[0]).toMatchObject({dataset:'facts.us',status:'missing',consecutive_errors:1,last_ok_at:null,expected_cadence:'daily'});
  await recordAttempt(c,'facts.us',{ok:false,cadence:'daily',now:T('2026-11-05T01:00:00Z')});
  expect(c.rows('dq_freshness')[0]).toMatchObject({status:'error',consecutive_errors:2});
  await recordAttempt(c,'facts.us',{ok:true,cadence:'daily',now:T('2026-11-05T02:00:00Z')});
  expect(c.rows('dq_freshness')[0]).toMatchObject({status:'fresh',consecutive_errors:0,last_ok_at:'2026-11-05T02:00:00.000Z',last_attempt_at:'2026-11-05T02:00:00.000Z'});
 });
 it('rejects an invalid dataset name',async()=>{
  const c=memoryTableClient();
  await expect(recordAttempt(c,'',{ok:true,cadence:'daily'})).rejects.toThrow('invalid_dataset');
 });
});

describe('freshnessOf',()=>{
 it('recomputes status on read so a silent producer becomes stale without a new attempt',async()=>{
  const c=memoryTableClient();
  await recordAttempt(c,'macro',{ok:true,cadence:'daily',now:T('2026-11-01T00:00:00Z')});
  const rows=await freshnessOf(c,T('2026-11-05T00:00:00Z'));
  expect(rows).toEqual([expect.objectContaining({dataset:'macro',stored_status:'fresh',status:'stale'})]);
 });
});
