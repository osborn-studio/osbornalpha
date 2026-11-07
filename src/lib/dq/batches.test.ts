import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
// F4 — normalizeCounts, JUDGMENT_INFO_CODES, ALL_INFO_CODES, isInfoError added for the judgment layer
import {startBatch,finishBatch,emptyCounts,batchStatusFromCounts,INFO_CODES,JUDGMENT_INFO_CODES,ALL_INFO_CODES,isInfoError,normalizeCounts} from './batches';
// /F4

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
 it('ignores informational codes (skips, relinks) when deciding status but keeps them in errors',()=>{
  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary']);
  const info=[{code:'skipped_summary',message:'{"not_in_universe":3}'},{code:'relink',key:'k',message:'a->b'}];
  expect(batchStatusFromCounts({...emptyCounts(),fetched:4,inserted:1},info)).toBe('success');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:4,inserted:1},[...info,{code:'range'}])).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:4,inserted:1,failed:1},info)).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:4},info)).toBe('failed');
  expect(batchStatusFromCounts({...emptyCounts()},[...info,{code:'empty_plan'}])).toBe('failed');
 });
 it('treats rejected_summary (invalid input) as a real error: partial when something landed, else failed',()=>{
  expect(INFO_CODES).not.toContain('rejected_summary');
  const rejected=[{code:'skipped_summary',message:'{"not_in_universe":3}'},{code:'rejected_summary',message:'{"rejected_invalid_cik":99}'}];
  expect(batchStatusFromCounts({...emptyCounts(),fetched:103,inserted:1},rejected)).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:103,quarantined:1},rejected)).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:0},rejected)).toBe('failed');
 });
 it('finishes with informational errors stored and a success status',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  const errors=[{code:'skipped_summary',message:'{"x":1}'}];
  expect(await finishBatch(c,batchId,{counts:{...emptyCounts(),fetched:2,inserted:1},errors})).toBe('success');
  expect(c.rows('ingest_batches')[0].errors).toEqual(errors);
 });
 it('is failed when rows were fetched but none has an outcome',()=>{
  expect(batchStatusFromCounts({...emptyCounts(),fetched:10},[])).toBe('failed');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:10,duplicates:10},[])).toBe('success');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:10,quarantined:1},[])).toBe('success');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:0},[])).toBe('success');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:10},[],{rejected:true})).toBe('rejected');
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
 it('finishes an unaccounted receipt as failed and records the unaccounted error first',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  expect(await finishBatch(c,batchId,{counts:{...emptyCounts(),fetched:7},errors:[{code:'parse'}]})).toBe('failed');
  expect(c.rows('ingest_batches')[0]).toMatchObject({status:'failed',errors:[{code:'unaccounted',message:'fetched rows without outcomes'},{code:'parse'}]});
 });
 it('throws invalid_now for an invalid now or an unparseable stored started_at, without writing',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  await expect(finishBatch(c,batchId,{counts:emptyCounts(),errors:[]},new Date('garbage'))).rejects.toThrow('invalid_now');
  await expect(finishBatch(c,batchId,{counts:emptyCounts(),errors:[]},'2026-01-01' as never)).rejects.toThrow('invalid_now');
  await c.update('ingest_batches',{batch_id:batchId},{started_at:'not a date'});
  await expect(finishBatch(c,batchId,{counts:emptyCounts(),errors:[]})).rejects.toThrow('invalid_now');
  expect(c.rows('ingest_batches')[0]).toMatchObject({status:'running',finished_at:null});
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

// F4 — judgment framework spec §7.5: the deferred counter and the judgment information codes
describe('deferred counter and judgment information codes (F4)',()=>{
 it('lists the judgment information codes and treats them like INFO_CODES; INFO_CODES itself is unchanged',()=>{
  expect(JUDGMENT_INFO_CODES).toEqual(['pending_summary','unavailable_summary','voided_summary','abstained_summary','lease_lost','stale_revision','job_state_conflict','macro_unavailable','quarantine_reject_stale','quarantine_reject_item_not_open']);
  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary']);
  expect(ALL_INFO_CODES).toEqual([...INFO_CODES,...JUDGMENT_INFO_CODES]);
  for(const code of ALL_INFO_CODES)expect({code,info:isInfoError({code})}).toEqual({code,info:true});
  for(const code of ['request_key_conflict','settlement_basis_mismatch','idempotency_conflict','lookahead','stale_running'])expect({code,info:isInfoError({code})}).toEqual({code,info:false});
 });
 it('counts deferred rows as accounted: an all-deferred run (offline, acceptance 6) is success, not unaccounted',()=>{
  const info=[{code:'unavailable_summary',message:'{"timeout":5}'},{code:'pending_summary',message:'{"not_due":0}'},{code:'deadline_hit'}];
  expect(batchStatusFromCounts({...emptyCounts(),fetched:5,deferred:5},info)).toBe('success');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:5,deferred:2},[])).toBe('success');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:5,inserted:1,versioned:1,duplicates:1,deferred:2},[{code:'voided_summary'},{code:'lease_lost'},{code:'stale_revision'},{code:'job_state_conflict'},{code:'abstained_summary'},{code:'macro_unavailable'}])).toBe('success');
 });
 it('keeps the status rule: failures and non-informational errors still degrade a run with deferred rows',()=>{
  expect(batchStatusFromCounts({...emptyCounts(),fetched:5,deferred:4,failed:1},[])).toBe('failed');          // nothing landed
  expect(batchStatusFromCounts({...emptyCounts(),fetched:5,inserted:1,deferred:3,failed:1},[])).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:5,inserted:1,deferred:4},[{code:'request_key_conflict'}])).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:5,deferred:5},[{code:'request_key_conflict'}])).toBe('failed');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:5,quarantined:1,deferred:4},[{code:'settlement_basis_mismatch'}])).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:5,deferred:5},[],{rejected:true})).toBe('rejected');
 });
 it('validates deferred like the other counters',()=>{
  for(const bad of [-1,1.5,Number.MAX_SAFE_INTEGER+1,Number.NaN,'3' as never])expect(()=>batchStatusFromCounts({...emptyCounts(),deferred:bad},[])).toThrow('invalid_counts');
 });
 it('is backward compatible: emptyCounts has no deferred key, counts without it behave exactly as before, normalizeCounts reads absent deferred as 0',()=>{
  expect(emptyCounts()).toEqual({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});
  expect(batchStatusFromCounts({...emptyCounts(),fetched:10},[])).toBe('failed');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:10,duplicates:10},[])).toBe('success');
  expect(normalizeCounts(emptyCounts())).toEqual({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0,deferred:0});
  expect(normalizeCounts({...emptyCounts(),fetched:3,deferred:3})).toEqual({fetched:3,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0,deferred:3});
  expect(()=>normalizeCounts({...emptyCounts(),deferred:-1})).toThrow('invalid_counts');
 });
 it('finishBatch stores the counts it was given: with deferred for judgment receipts, unchanged for earlier producers',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'ts-judgments',dataset:'judgments.settle',codeVersion:'abcdef1',triggeredBy:'cron'});
  expect(await finishBatch(c,batchId,{counts:{...emptyCounts(),fetched:3,deferred:3},errors:[{code:'unavailable_summary',message:'{"transient":3}'}]})).toBe('success');
  expect(c.rows('ingest_batches')[0]).toMatchObject({status:'success',counts:{fetched:3,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0,deferred:3}});
  const {batchId:old}=await startBatch(c,{producer:'p',dataset:'d'});
  await finishBatch(c,old,{counts:{...emptyCounts(),inserted:1},errors:[]});
  expect(c.rows('ingest_batches')[1].counts).toEqual({fetched:0,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0});
 });
});
// /F4
