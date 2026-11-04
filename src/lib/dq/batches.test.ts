import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {startBatch,finishBatch,emptyCounts,batchStatusFromCounts} from './batches';

describe('batchStatusFromCounts',()=>{
 it('is success with no failures/errors, partial with some, failed when nothing landed, rejected when flagged',()=>{
  expect(batchStatusFromCounts({...emptyCounts(),inserted:5},[])).toBe('success');
  expect(batchStatusFromCounts({...emptyCounts(),inserted:5,quarantined:2},[])).toBe('success');
  expect(batchStatusFromCounts({...emptyCounts(),inserted:5,failed:1},[])).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),inserted:5},[{code:'range'}])).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),failed:3},[])).toBe('failed');
  expect(batchStatusFromCounts({...emptyCounts()},[{code:'network'}])).toBe('failed');
  expect(batchStatusFromCounts({...emptyCounts(),inserted:5},[],{rejected:true})).toBe('rejected');
 });
});

describe('batches',()=>{
 it('starts a running batch and finishes it with counts, status and errors',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'edgar-companyfacts',dataset:'facts',toolVersions:{sec_api:'v1'},codeVersion:'abc123',triggeredBy:'script'});
  expect(batchId).toMatch(/^[0-9a-f-]{36}$/);
  expect(c.rows('ingest_batches')[0]).toMatchObject({producer:'edgar-companyfacts',dataset:'facts',status:'running',triggered_by:'script',finished_at:null});
  const status=await finishBatch(c,batchId,{counts:{...emptyCounts(),inserted:2,quarantined:1},errors:[{code:'range',key:'x'}]});
  expect(status).toBe('partial');
  const row=c.rows('ingest_batches')[0];
  expect(row.status).toBe('partial');
  expect(row.counts).toEqual({fetched:0,inserted:2,duplicates:0,versioned:0,quarantined:1,failed:0});
  expect(row.errors).toEqual([{code:'range',key:'x'}]);
  expect(typeof row.finished_at).toBe('string');
 });
 it('finishes as success when nothing failed and no errors were recorded',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  expect(await finishBatch(c,batchId,{counts:{...emptyCounts(),inserted:1},errors:[]})).toBe('success');
 });
 it('refuses to finish a batch that is not running',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  await finishBatch(c,batchId,{counts:emptyCounts(),errors:[]});
  await expect(finishBatch(c,batchId,{counts:emptyCounts(),errors:[]})).rejects.toThrow('batch_not_running');
  await expect(finishBatch(c,'00000000-0000-0000-0000-00000000dead',{counts:emptyCounts(),errors:[]})).rejects.toThrow('batch_not_running');
 });
 it('rejects negative, fractional, unsafe or non-numeric counters',async()=>{
  for(const bad of [-1,1.5,Number.MAX_SAFE_INTEGER+1,NaN,'3' as never]){
   expect(()=>batchStatusFromCounts({...emptyCounts(),inserted:bad},[])).toThrow('invalid_counts');
  }
  expect(()=>batchStatusFromCounts({inserted:1} as never,[])).toThrow('invalid_counts');
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  await expect(finishBatch(c,batchId,{counts:{...emptyCounts(),failed:-2},errors:[]})).rejects.toThrow('invalid_counts');
  expect(c.rows('ingest_batches')[0].status).toBe('running');
 });
 it('keeps the first 100 errors, appends a truncation marker and caps messages at 500 chars',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  const errors=Array.from({length:130},(_,i)=>({code:'e',key:String(i),message:'m'.repeat(600)}));
  await finishBatch(c,batchId,{counts:emptyCounts(),errors});
  const stored=c.rows('ingest_batches')[0].errors as {code:string;key?:string;message?:string}[];
  expect(stored).toHaveLength(101);
  expect(stored[99]).toMatchObject({code:'e',key:'99'});
  expect(stored[0].message).toHaveLength(500);
  expect(stored[100]).toEqual({code:'truncated',message:'30 more'});
 });
 it('never writes finished_at before started_at and accepts an explicit now',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  const started=String(c.rows('ingest_batches')[0].started_at);
  await finishBatch(c,batchId,{counts:emptyCounts(),errors:[]},new Date(Date.parse(started)-60_000));
  expect(c.rows('ingest_batches')[0].finished_at).toBe(started);
  const {batchId:b2}=await startBatch(c,{producer:'p',dataset:'d'});
  await finishBatch(c,b2,{counts:emptyCounts(),errors:[]},new Date('2099-01-01T00:00:00Z'));
  expect(c.rows('ingest_batches')[1].finished_at).toBe('2099-01-01T00:00:00.000Z');
 });
 it('throws batch_not_running when a concurrent finish wins between read and update',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  c.update=async()=>0;
  await expect(finishBatch(c,batchId,{counts:emptyCounts(),errors:[]})).rejects.toThrow('batch_not_running');
 });
 it('rejects producer or dataset outside 1..64 chars and an unknown trigger',async()=>{
  const c=memoryTableClient();
  await expect(startBatch(c,{producer:'x'.repeat(65),dataset:'d'})).rejects.toThrow('invalid_batch');
  await expect(startBatch(c,{producer:'p',dataset:''})).rejects.toThrow('invalid_batch');
  await expect(startBatch(c,{producer:'p',dataset:'d',triggeredBy:'bot' as never})).rejects.toThrow('invalid_batch');
 });
});
