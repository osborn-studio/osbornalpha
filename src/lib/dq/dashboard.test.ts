import {describe,it,expect} from 'vitest';
import {loadDqDashboard,parseDqQuery,summarizeDq,within} from './dashboard';
import type {Row,SelectOptions,TableClient} from '../db/table-client';

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
 it('tolerates up to 60s of clock skew into the future, but not more',()=>{
  const now=new Date('2026-11-04T12:00:00Z');
  const rows=[{at:'2026-11-04T12:00:59Z'},{at:'2026-11-04T12:01:00Z'},{at:'2026-11-04T12:01:01Z'}];
  expect(within(rows,'at',now,86_400_000)).toEqual([{at:'2026-11-04T12:00:59Z'},{at:'2026-11-04T12:01:00Z'}]);
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
 it('accepts any printable dataset up to 64 chars (equality filter only)',()=>{
  expect(q('dataset=Facts')).toEqual({ok:true,query:{dataset:'Facts',page:1,pageSize:50}});
  expect(q('dataset=a%20b')).toEqual({ok:true,query:{dataset:'a b',page:1,pageSize:50}});
  expect(q('dataset=%E8%A1%8C%E6%83%85')).toEqual({ok:true,query:{dataset:'行情',page:1,pageSize:50}});
  expect(q(`dataset=${'x'.repeat(64)}`).ok).toBe(true);
 });
 it('rejects control characters and datasets longer than 64 chars',()=>{
  expect(q('dataset=a%00b')).toEqual({ok:false,error:'invalid_dataset'});
  expect(q('dataset=a%0Ab')).toEqual({ok:false,error:'invalid_dataset'});
  expect(q('dataset=a%7Fb')).toEqual({ok:false,error:'invalid_dataset'});
  expect(q(`dataset=${'x'.repeat(65)}`)).toEqual({ok:false,error:'invalid_dataset'});
 });
});

describe('loadDqDashboard',()=>{
 const stub=(counts:(table:string,match:Row)=>number)=>{
  const calls:{op:string;table:string;match:Row;opts?:SelectOptions}[]=[];
  const client:TableClient={
   insert:async()=>{throw new Error('read only');},
   update:async()=>{throw new Error('read only');},
   upsert:async()=>{throw new Error('read only');},
   count:async(table,match)=>{calls.push({op:'count',table,match});return counts(table,match);},
   select:async(table,match,opts)=>{
    calls.push({op:'select',table,match,opts});
    if(table==='dq_quarantine')return [{id:'q1',dataset:'facts.us',status:'open'}];
    return [];
   },
  };
  return {client,calls};
 };

 it('keeps the open-quarantine KPI global while the pager total follows the dataset filter',async()=>{
  const {client,calls}=stub((table,match)=>{
   if(table==='dq_quarantine')return 'dataset' in match?4:17;
   if(table==='dq_reconciliations')return 2;
   return 0;
  });
  const out=await loadDqDashboard(client,{dataset:'facts.us',page:2,pageSize:50},new Date('2026-11-04T12:00:00Z'));
  expect(out.summary.openQuarantineTotal).toBe(17);
  expect(out.quarantine).toEqual({rows:[{id:'q1',dataset:'facts.us',status:'open'}],page:2,pageSize:50,total:4});
  expect(out.summary.failedReconciliationsTotal).toBe(2);
  const qCounts=calls.filter(c=>c.op==='count'&&c.table==='dq_quarantine').map(c=>c.match);
  expect(qCounts).toEqual(expect.arrayContaining([{status:'open'},{status:'open',dataset:'facts.us'}]));
  const page=calls.find(c=>c.op==='select'&&c.table==='dq_quarantine');
  expect(page?.match).toEqual({status:'open',dataset:'facts.us'});
  expect(page?.opts).toMatchObject({limit:50,offset:50,orderBy:'created_at',desc:true});
 });

 it('without a dataset filter both totals come from the same global count',async()=>{
  const {client}=stub((table)=>table==='dq_quarantine'?9:0);
  const out=await loadDqDashboard(client,{page:1,pageSize:50},new Date('2026-11-04T12:00:00Z'));
  expect(out.summary.openQuarantineTotal).toBe(9);
  expect(out.quarantine.total).toBe(9);
 });
});
