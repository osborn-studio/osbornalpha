import {describe,it,expect} from 'vitest';
import {parseDqQuery,summarizeDq,within} from './dashboard';

describe('summarizeDq',()=>{
 it('counts batches by status, non-fresh datasets by status, and keeps real totals',()=>{
  const out=summarizeDq({
   batches:[{dataset:'facts',status:'success'},{dataset:'facts',status:'partial'},{dataset:'macro',status:'failed'}],
   freshness:[{dataset:'facts.us',status:'fresh',stored_status:'fresh'},{dataset:'macro',status:'stale',stored_status:'fresh'},{dataset:'facts.cn',status:'missing',stored_status:'missing'}],
   openQuarantineTotal:14,
   failedReconciliationsTotal:3,
  });
  expect(out).toEqual({
   batchesByStatus:{success:1,partial:1,failed:1},
   freshnessTotal:3,
   notFresh:[{dataset:'macro',status:'stale',stored_status:'fresh',drifted:true},{dataset:'facts.cn',status:'missing',stored_status:'missing',drifted:false}],
   notFreshByStatus:{stale:1,missing:1,error:0},
   openQuarantineTotal:14,
   failedReconciliationsTotal:3,
  });
 });
});

describe('within',()=>{
 it('keeps rows inside the window and drops unparseable timestamps',()=>{
  const now=new Date('2026-11-04T12:00:00Z');
  const rows=[{started_at:'2026-11-04T01:00:00Z'},{started_at:'2026-11-03T11:00:00Z'},{started_at:'garbage'},{started_at:null}];
  expect(within(rows,'started_at',now,86_400_000)).toEqual([{started_at:'2026-11-04T01:00:00Z'}]);
 });
});

describe('parseDqQuery',()=>{
 const q=(s:string)=>parseDqQuery(new URLSearchParams(s));
 it('defaults page 1 and pageSize 50 with no dataset',()=>{
  expect(q('')).toEqual({ok:true,query:{dataset:undefined,page:1,pageSize:50}});
 });
 it('accepts a valid dataset and paging',()=>{
  expect(q('dataset=facts.us&page=3&pageSize=200')).toEqual({ok:true,query:{dataset:'facts.us',page:3,pageSize:200}});
 });
 it('rejects non-integer, zero, and oversized paging',()=>{
  expect(q('page=0')).toEqual({ok:false,error:'invalid_page'});
  expect(q('page=1.5')).toEqual({ok:false,error:'invalid_page'});
  expect(q('pageSize=201')).toEqual({ok:false,error:'invalid_page_size'});
  expect(q('pageSize=abc')).toEqual({ok:false,error:'invalid_page_size'});
 });
 it('rejects datasets outside the allowed charset',()=>{
  expect(q('dataset=Facts')).toEqual({ok:false,error:'invalid_dataset'});
  expect(q('dataset=a%20b')).toEqual({ok:false,error:'invalid_dataset'});
 });
});
