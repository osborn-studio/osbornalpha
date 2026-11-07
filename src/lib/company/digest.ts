// src/lib/company/digest.ts
// Company digest (spec §6.3, §4.4, §11): materializes issuer_events + issuer_coverage per (issuer, market)
// stream from one company_read_snapshot envelope (all concepts, history, asOf = today UTC). Per stream:
// beginAttempt → read → evidence index (company_fact_evidence, BEFORE events) → derive → replace with
// basedOnRev = envelope state_rev. stale_computation re-reads once with the same attempt id;
// stale_attempt / unknown_stream are skips (duplicates + skipped_summary); everything else marks the
// attempt failed (backoff in SQL). Selection: incremental 80 % (digestDue) + sweep 20 % (sweepDue,
// older than 7 days), deduped, interleaved 4:1 so a deadline still leaves sweeps their share; full =
// every scope row (script). Batch counters are per STREAM and always balance
// (fetched = inserted + duplicates + versioned + quarantined + failed); freshness ok = no failed stream
// in this run and no failed stream in backoff (CompanyDb.backlog). code_version missing → refuse apply.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '@/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch} from '@/lib/dq/batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '@/lib/dq/batches';
import {recordAttempt} from '@/lib/dq/freshness';
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {FORMULA_VERSION} from '@/lib/facts/derive';
import type {FactsDb,Market,ScopeRow} from '@/lib/facts/types';
import {summarizeCoverage} from './coverage';
import {EVENTS_VERSION,deriveIssuerEvents} from './events';
import {buildEvidenceIndex} from './evidence-index';
import type {ParsedSnapshotCache,SnapshotObjectStore} from './evidence-index';
import {CompanyDbError,EVIDENCE_INDEX_VERSION} from './types';
import type {CompanyDb,ReadSnapshotOptions,ReadSnapshotResult,ReplaceResult} from './types';

export const DIGEST_PRODUCER='company-digest';
export const DIGEST_DATASET='company.events';
export const DEFAULT_DIGEST_LIMIT=200;
export const SWEEP_AGE_MS=7*86_400_000;
export const STREAM_MIN_MS=30_000;
export type ReadSnapshotFn=(issuer:string,market:Market,opts:ReadSnapshotOptions)=>Promise<ReadSnapshotResult>;
export interface DigestDeps{
 db:CompanyDb;tables:TableClient;readSnapshot:ReadSnapshotFn;
 facts:Pick<FactsDb,'scopeRows'|'scopeAll'>;reader:SnapshotObjectStore;
 now:()=>Date;deadline:Date|null;codeVersion:string|null;
}
export interface DigestOptions{mode:'incremental'|'full';issuerIds?:string[];market?:Market;limit?:number;now?:Date;dryRun?:boolean;triggeredBy?:TriggeredBy}
export class DigestError extends Error{constructor(public code:'code_version_missing'|'invalid_options',message?:string){super(message??code);this.name='DigestError';}}
export interface PlannedStream{issuerId:string;market:Market;stateRev:number;sweep:boolean;source:'incremental'|'sweep'|'full'}
export type StreamOutcomeKind='changed'|'unchanged'|'skipped_stale'|'skipped_unknown'|'failed'|'planned';
export interface StreamOutcome{issuerId:string;market:Market;sweep:boolean;outcome:StreamOutcomeKind;code?:string;attemptId:number|null;basedOnRev:number|null;events:number;result:ReplaceResult|null;evidence:{indexed:number;facts:number}|null;retried:boolean;markFailedError?:boolean}
export interface DigestDetail{events:ReplaceResult;attempted:number;succeeded:number;failed:number;skippedStale:number;skippedUnknown:number;swept:number;idle:boolean;backlogFailed:number;evidence:{indexed:number;facts:number}}
export interface DigestReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];streams:StreamOutcome[];idle:boolean;detail:DigestDetail}

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const keyOf=(s:{issuerId:string;market:Market})=>`${s.issuerId}:${s.market}`;
const isoDay=(d:Date)=>d.toISOString().slice(0,10);
const errMsg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
const dbCode=(e:unknown)=>e instanceof CompanyDbError?e.code:null;

export function interleave<A,B>(inc:A[],sweep:B[],ratio=4):(A|B)[]{
 const out:(A|B)[]=[];let i=0,j=0;
 while(i<inc.length||j<sweep.length){for(let k=0;k<ratio&&i<inc.length;k++)out.push(inc[i++]);if(j<sweep.length)out.push(sweep[j++]);}
 return out;
}
export async function selectStreams(deps:Pick<DigestDeps,'db'|'facts'>,opts:DigestOptions,now:Date):Promise<PlannedStream[]>{
 if(opts.mode==='full'){
  const markets:Market[]=opts.market?[opts.market]:['US','CN'];const out:PlannedStream[]=[];
  for(const m of markets){
   const rows:ScopeRow[]=opts.issuerIds?await deps.facts.scopeRows(m,[...new Set(opts.issuerIds)]):await deps.facts.scopeAll(m);
   for(const r of [...rows].sort((a,b)=>cmp(a.issuer_id,b.issuer_id)))out.push({issuerId:r.issuer_id,market:m,stateRev:r.state_rev,sweep:true,source:'full'});
  }
  return out;
 }
 const limit=opts.limit??DEFAULT_DIGEST_LIMIT;
 const incN=Math.ceil(limit*4/5),swN=Math.floor(limit/5);
 const inMarket=(s:{market:Market})=>!opts.market||s.market===opts.market;
 const inc=(await deps.db.digestDue(now,incN,opts.market)).filter(inMarket);   // market filtered in SQL before the limit (Q6); local filter kept as a guard
 const sw=swN>0?(await deps.db.sweepDue(new Date(now.getTime()-SWEEP_AGE_MS),now,swN,opts.market)).filter(inMarket):[];
 const swKeys=new Set(sw.map(keyOf)),incKeys=new Set(inc.map(keyOf));
 return interleave(
  inc.map(s=>({issuerId:s.issuerId,market:s.market,stateRev:s.stateRev,sweep:swKeys.has(keyOf(s)),source:'incremental' as const})),
  sw.filter(s=>!incKeys.has(keyOf(s))).map(s=>({issuerId:s.issuerId,market:s.market,stateRev:s.stateRev,sweep:true,source:'sweep' as const})));
}

interface Ctx{batchId:string|null;today:string;now:Date;cache:ParsedSnapshotCache;dryRun:boolean}
async function digestStream(deps:DigestDeps,ctx:Ctx,p:PlannedStream):Promise<StreamOutcome>{
 const out:StreamOutcome={issuerId:p.issuerId,market:p.market,sweep:p.sweep,outcome:'failed',attemptId:null,basedOnRev:null,events:0,result:null,evidence:null,retried:false};
 let attemptId=0;
 if(!ctx.dryRun){
  try{attemptId=await deps.db.beginAttempt(p.issuerId,p.market,ctx.now);}
  catch(e){if(dbCode(e)==='unknown_stream'){out.outcome='skipped_unknown';out.code='unknown_stream';}else out.code='digest_issuer_failed';return out;}
  out.attemptId=attemptId;
 }
 const fail=async(code:string)=>{
  out.outcome='failed';out.code=code;
  if(!ctx.dryRun){try{await deps.db.markDigestFailed(p.issuerId,p.market,attemptId,deps.now());}catch{out.markFailedError=true;}}
  return out;
 };
 for(let attempt=0;attempt<2;attempt++){
  let env:ReadSnapshotResult;
  try{env=await deps.readSnapshot(p.issuerId,p.market,{concepts:null,asOf:ctx.today,history:true});}catch{return fail('digest_issuer_failed');}
  if(env.truncated)return fail('read_truncated');
  try{
   const built=await buildEvidenceIndex({reader:deps.reader},{issuerId:p.issuerId,market:p.market,rows:env.rows,filings:env.filings,cache:ctx.cache});
   if(built.stats.storageError>0)return fail('evidence_index_failed');   // transient storage failure: never replace (would delete valid evidence) nor mark success
   if(!ctx.dryRun)await deps.db.replaceEvidence(p.issuerId,p.market,attemptId,env.stateRev,built.rows);   // evidence fence
   out.evidence={indexed:built.rows.length,facts:built.stats.facts};
  }catch(e){
   const code=dbCode(e);
   if(code==='stale_computation'&&attempt===0){out.retried=true;continue;}
   if(code==='stale_attempt'){out.outcome='skipped_stale';out.code='stale_attempt';return out;}
   if(code==='unknown_stream'){out.outcome='skipped_unknown';out.code='unknown_stream';return out;}
   return fail(code==='stale_computation'?code:'evidence_index_failed');
  }
  let events,coverage;
  try{
   const [scope]=await deps.facts.scopeRows(p.market,[p.issuerId]);
   events=deriveIssuerEvents({rows:env.rows,filings:env.filings,cutoff:ctx.today});
   coverage=summarizeCoverage({rows:env.rows,filings:env.filings,scope:scope??null});
  }catch{return fail('digest_issuer_failed');}
  out.events=events.length;out.basedOnRev=env.stateRev;
  if(ctx.dryRun){out.outcome='planned';return out;}
  try{
   const r=await deps.db.replaceDigest(p.issuerId,p.market,ctx.batchId!,attemptId,randomUUID(),env.stateRev,p.sweep,events,coverage);
   out.result=r;out.outcome=r.changed+r.retired+r.revived>0?'changed':'unchanged';delete out.code;return out;
  }catch(e){
   const code=dbCode(e);
   if(code==='stale_computation'&&attempt===0){out.retried=true;continue;}
   if(code==='stale_attempt'){out.outcome='skipped_stale';out.code='stale_attempt';return out;}
   if(code==='unknown_stream'){out.outcome='skipped_unknown';out.code='unknown_stream';return out;}
   return fail(code==='stale_computation'||code==='invalid_event'?code:'digest_issuer_failed');
  }
 }
 return fail('stale_computation');
}

const zeroEvents=():ReplaceResult=>({upserted:0,changed:0,retired:0,revived:0});
export async function runCompanyDigest(deps:DigestDeps,opts:DigestOptions):Promise<DigestReceipt>{
 if(opts.issuerIds!==undefined&&opts.mode!=='full')throw new DigestError('invalid_options','issuerIds requires mode full');
 const limit=opts.limit??DEFAULT_DIGEST_LIMIT;
 if(!Number.isInteger(limit)||limit<1)throw new DigestError('invalid_options','limit must be a positive integer');
 const now=opts.now??deps.now();const today=isoDay(now);
 const dryRun=opts.dryRun===true;
 if(!dryRun&&!deps.codeVersion)throw new DigestError('code_version_missing');
 const counts=emptyCounts();const errors:BatchError[]=[];const streams:StreamOutcome[]=[];
 const events=zeroEvents();const evidence={indexed:0,facts:0};
 let attempted=0,succeeded=0,failed=0,skippedStale=0,skippedUnknown=0,swept=0,idle=false;
 let batchId:string|null=null;
 if(!dryRun)({batchId}=await startBatch(deps.tables,{producer:DIGEST_PRODUCER,dataset:DIGEST_DATASET,
  toolVersions:{events:EVENTS_VERSION,mappingGen:String(MAPPING_GEN),formulaVersion:FORMULA_VERSION,evidenceIndex:EVIDENCE_INDEX_VERSION},codeVersion:deps.codeVersion!,triggeredBy:opts.triggeredBy??'script'}));
 const ctx:Ctx={batchId,today,now,cache:new Map(),dryRun};
 const detailOf=(backlogFailed:number):DigestDetail=>({events:{...events},attempted,succeeded,failed,skippedStale,skippedUnknown,swept,idle,backlogFailed,evidence:{...evidence}});
 try{
  const planned=await selectStreams(deps,opts,now);idle=planned.length===0;
  for(let i=0;i<planned.length;i++){
   if(deps.deadline&&deps.deadline.getTime()-deps.now().getTime()<STREAM_MIN_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:planned.length-i})});break;}
   const p=planned[i];attempted++;counts.fetched++;
   const o=await digestStream(deps,ctx,p);streams.push(o);
   if(o.evidence){evidence.indexed+=o.evidence.indexed;evidence.facts+=o.evidence.facts;}
   const key=keyOf(p);
   switch(o.outcome){
    case 'changed':case 'unchanged':
     succeeded++;if(o.outcome==='changed')counts.inserted++;else counts.duplicates++;
     if(p.sweep)swept++;
     for(const k of ['upserted','changed','retired','revived'] as const)events[k]+=o.result![k];
     break;
    case 'skipped_stale':counts.duplicates++;skippedStale++;errors.push({code:'skipped_summary',key,message:JSON.stringify({stale_attempt:1})});break;
    case 'skipped_unknown':counts.duplicates++;skippedUnknown++;errors.push({code:'skipped_summary',key,message:JSON.stringify({unknown_stream:1})});break;
    case 'planned':counts.duplicates++;break;
    default:
     counts.failed++;failed++;errors.push({code:o.code??'digest_issuer_failed',key});
     if(o.markFailedError)errors.push({code:'mark_failed_error',key});
   }
  }
  if(dryRun)return {batchId:null,status:'dry_run',counts,errors,streams,idle,detail:detailOf(0)};
  const backlogFailed=(await deps.db.backlog()).failedStreams;
  const detail=detailOf(backlogFailed);
  const status=await finishBatch(deps.tables,batchId!,{counts,errors},deps.now());
  await recordAttempt(deps.tables,DIGEST_DATASET,{ok:failed===0&&backlogFailed===0,cadence:'daily',now:deps.now(),detail:{...detail}});
  return {batchId,status,counts,errors,streams,idle,detail};
 }catch(e){
  if(dryRun)throw e;
  errors.push({code:'unknown',message:errMsg(e)});
  try{await finishBatch(deps.tables,batchId!,{counts,errors},deps.now());}catch{/* left running; runbook marks it failed */}
  try{await recordAttempt(deps.tables,DIGEST_DATASET,{ok:false,cadence:'daily',now:deps.now(),detail:{...detailOf(-1),error:errMsg(e)}});}catch{/* same */}
  throw e;
 }
}
