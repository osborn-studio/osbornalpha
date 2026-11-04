// Ingest receipts (spec §5.1 ingest_batches). Every producer starts a batch, writes rows that
// reference batch_id, and finishes with counts + errors. Status is derived from counts and
// errors so dashboards never guess: success = no failures and no errors; quarantined rows do
// not degrade status. The row is written with finished_at:null so the DB invariant
// (status='running' iff finished_at is null) holds. Only a running batch can be finished.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

export type BatchStatus='running'|'success'|'partial'|'failed'|'rejected';
export type TriggeredBy='cron'|'manual'|'script';
/**
 * Receipt counters, all non-negative safe integers:
 * - fetched: rows read from the source;
 * - inserted: new rows written; duplicates: rows already present unchanged (no write);
 * - versioned: rows that superseded an existing version; quarantined: rows parked in dq_quarantine;
 * - failed: rows that could not be processed at all.
 * inserted+duplicates+versioned+quarantined+failed is the number of rows with an outcome; it may
 * be below fetched (rows filtered out by design), but fetched > 0 with no outcome at all means the
 * producer lost track of its rows and the batch finishes as failed ('unaccounted').
 */
export interface BatchCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
export interface BatchError{code:string;key?:string;message?:string}
export interface StartBatchInput{producer:string;dataset:string;toolVersions?:Record<string,string>;codeVersion?:string;triggeredBy?:TriggeredBy}

const TRIGGERS:readonly TriggeredBy[]=['cron','manual','script'];
export const emptyCounts=():BatchCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});

const COUNTERS:readonly (keyof BatchCounts)[]=['fetched','inserted','duplicates','versioned','quarantined','failed'];
const MAX_ERRORS=100,MAX_MESSAGE=500;

function assertCounts(counts:BatchCounts):void{
 if(!counts||COUNTERS.some(k=>!Number.isSafeInteger(counts[k])||counts[k]<0))throw new Error('invalid_counts');
}

/** First MAX_ERRORS errors with messages capped, plus a `truncated` marker for the rest. */
function capErrors(errors:BatchError[]):BatchError[]{
 const kept=errors.slice(0,MAX_ERRORS).map(e=>e.message!==undefined&&e.message.length>MAX_MESSAGE?{...e,message:e.message.slice(0,MAX_MESSAGE)}:e);
 return errors.length>MAX_ERRORS?[...kept,{code:'truncated',message:`${errors.length-MAX_ERRORS} more`}]:kept;
}

const accounted=(c:BatchCounts)=>c.inserted+c.duplicates+c.versioned+c.quarantined+c.failed;
export const UNACCOUNTED_ERROR:BatchError={code:'unaccounted',message:'fetched rows without outcomes'};

/** Pure status: rejected flag wins; fetched rows with no outcome → failed; any failure/error → partial if something landed, else failed. */
export function batchStatusFromCounts(counts:BatchCounts,errors:BatchError[],flags:{rejected?:boolean}={}):BatchStatus{
 assertCounts(counts);
 if(flags.rejected)return 'rejected';
 if(counts.fetched>0&&accounted(counts)===0)return 'failed';
 const landed=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined;
 if(counts.failed>0||errors.length>0)return landed>0?'partial':'failed';
 return 'success';
}

export async function startBatch(client:TableClient,input:StartBatchInput):Promise<{batchId:string}>{
 const ok=(s:unknown)=>typeof s==='string'&&s.length>=1&&s.length<=64;
 const trigger=input.triggeredBy??'script';
 if(!ok(input.producer)||!ok(input.dataset)||!TRIGGERS.includes(trigger))throw new Error('invalid_batch');
 const batchId=randomUUID();
 await client.insert('ingest_batches',{
  batch_id:batchId,producer:input.producer,dataset:input.dataset,status:'running',
  started_at:new Date().toISOString(),finished_at:null,counts:emptyCounts(),errors:[],
  tool_versions:input.toolVersions??{},code_version:input.codeVersion??null,triggered_by:trigger,
 });
 return {batchId};
}

/**
 * Finishes a running batch. An unaccounted receipt (fetched > 0, no outcomes) finishes as failed
 * with an appended {code:'unaccounted'} error. Throws invalid_now when `now` or the stored
 * started_at is not a valid date, rather than writing a NaN finished_at.
 */
export async function finishBatch(client:TableClient,batchId:string,result:{counts:BatchCounts;errors:BatchError[];rejected?:boolean},now=new Date()):Promise<BatchStatus>{
 const status=batchStatusFromCounts(result.counts,result.errors,{rejected:result.rejected});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('invalid_now');
 const unaccounted=!result.rejected&&result.counts.fetched>0&&accounted(result.counts)===0;
 const errors=unaccounted?[UNACCOUNTED_ERROR,...result.errors]:result.errors;
 const [batch]=await client.select('ingest_batches',{batch_id:batchId},{limit:1});
 if(!batch||batch.status!=='running')throw new Error('batch_not_running');
 const startedAt=Date.parse(String(batch.started_at));
 if(!Number.isFinite(startedAt))throw new Error('invalid_now');
 // Never before started_at (DB check finished_after_started), even under clock skew.
 const finishedAt=new Date(Math.max(now.getTime(),startedAt));
 // Matching on status='running' keeps a concurrent finish from being overwritten.
 const n=await client.update('ingest_batches',{batch_id:batchId,status:'running'},{status,counts:result.counts,errors:capErrors(errors),finished_at:finishedAt.toISOString()});
 if(n!==1)throw new Error('batch_not_running');
 return status;
}
