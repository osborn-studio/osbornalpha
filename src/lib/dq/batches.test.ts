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
 it('rejects producer or dataset outside 1..64 chars and an unknown trigger',async()=>{
  const c=memoryTableClient();
  await expect(startBatch(c,{producer:'x'.repeat(65),dataset:'d'})).rejects.toThrow('invalid_batch');
  await expect(startBatch(c,{producer:'p',dataset:''})).rejects.toThrow('invalid_batch');
  await expect(startBatch(c,{producer:'p',dataset:'d',triggeredBy:'bot' as never})).rejects.toThrow('invalid_batch');
 });
});
