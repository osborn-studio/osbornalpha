// src/lib/documents/candidates/run.ts
// runDocumentsCandidates (spec §7.3): one ingest_batches row (producer documents-candidates, dataset
// documents.candidates, tool_versions {hk_label_gen, hk_rules_version, hk_pub_gen}) and up to three
// phases, each bounded by the budget (no new extraction / issuer with < 90 s left → deadline_hit):
//  1. candidates — candidatesDue (or the given extraction ids) → claimCandidatesLease (the only
//     attempts counter; false → skip: it may just have turned the row 'exhausted') → pages.json
//     from the store, its sha256 checked against the extraction row → generateHkCandidates
//     (citations first, created_by 'extractor') → insertCandidates (idempotent, plain 'candidate'
//     rows) → §7.6 checks over this version's undecided rule candidates → writeCandidateChecks
//     (the only checks writer; it applies human-decision inheritance) → plan-1 quarantine of the
//     findings (dataset documents.candidates) → finishCandidates(done); any throw →
//     finishCandidates(failed) and candidates_error. The lease is renewed (renewCandidatesLease, no
//     attempt counted) before each mutating phase — generation (citations), insert, checks, findings —
//     and a takeover stops the extraction with lease_lost and no further write; generation and the
//     checks start only with MIN_PHASE_MS of budget left (else deadline_hit, finishCandidates(failed))
//     (codex plan round 1 P2-7).
//  2. auto — every undecided, checks-passed rule candidate (any batch: a crash is repaired by the
//     next run) whose extractor_ref has an unrevoked approval whose extractor_version /
//     table_algo_version / code_version equal the candidate's extraction row and whose concepts
//     contain the candidate's concept → decideCandidate(auto). too_many_approvals stops the phase
//     (and makes the batch partial/failed: the approvals table needs an owner).
//  3. promote — runHkFactsSync for every issuer promotionDue(HK_PUB_GEN, limit) selects (spec
//     §4.11 conditions ab, c, d); each issuer's counts and errors join the batch.
// Counters: candidates phase fetched = generated candidates, inserted = new rows, duplicates =
// rows that already existed, quarantined = check findings parked, failed = extractions that failed.
// dryRun writes nothing (no batch, lease or row): it reports what is due.
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseTableClient} from '../../db/table-client';
import type {TableClient} from '../../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../../dq/batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../../dq/batches';
import {recordAttempt} from '../../dq/freshness';
import {quarantine} from '../../dq/quarantine';
import {cite} from '../citations';
import {supabaseDocumentsDb} from '../db';
import {sha256Hex} from '../extract/pages-json';
import {supabaseObjectStore} from '../object-store';
import {DocumentsDbError,HK_EXTRACTOR_REF,HK_LABEL_GEN,HK_PUB_GEN,HK_RULES_VERSION} from '../types';
import type {ApprovalRow,CandidateRow,DocumentsDb,ExtractionRow,FinancialFactPayload,ObjectStore,Page,PagesJson} from '../types';
import {buildCheckContext,checkTally,counterpartCandidates,crossCheckFindings,hkCheckFindings,runHkChecks} from '../hk-facts/checks';
import type {CheckFinding,CheckRowResult} from '../hk-facts/checks';
import {supabaseHkFactsPort} from '../hk-facts/facts-port';
import type {HkFactsPort} from '../hk-facts/facts-port';
import {generateHkCandidates} from '../hk-facts/generate';
import {runHkFactsSync} from '../hk-facts/promote';
import {finalizeHkHooks} from '../hk-facts/resolve';
import {BudgetExceeded,FINAL_RESERVE_MS,HEARTBEAT_MS,guardCalls,withLeaseHeartbeat,withinBudget} from '../lease';

export type CandidatesPhase='candidates'|'auto'|'promote';
export const DEFAULT_PHASES:readonly CandidatesPhase[]=['candidates','auto','promote'];
export const CANDIDATES_DATASET='documents.candidates';
export const LEASE_TTL_S=600;
export const MIN_ITEM_MS=90_000;
/** Budget a costly phase (generation, checks) needs to start (P2-7). */
export const MIN_PHASE_MS=20_000;
export const APPROVALS_LIMIT=100;
export interface CandidatesDeps{db:DocumentsDb;tables:TableClient;store:ObjectStore;port:HkFactsPort;now:()=>Date;deadline:Date|null;codeVersion:string|null}
export interface CandidatesOptions{limit:number;extractionIds?:string[];dryRun:boolean;triggeredBy:TriggeredBy;phases?:CandidatesPhase[]}
export interface ExtractionOutcome{extractionId:string;documentId:string|null;outcome:'done'|'failed'|'skipped'|'due';code?:string;inserted:number;written:number;inherited:number;quarantined:number;identity?:IdentityTally}
export interface IdentityTally{checked:number;skipped:number;failed:number}
export interface AutoSummary{considered:number;decided:number;stopped:string|null}
/** Structural subset of hk-facts/promote.ts::HkIssuerOutcome (Task 16). */
export interface PromoteSummary{issuerId:string;outcome:'published'|'failed'|'skipped';code?:string;counts:BatchCounts}
export interface CandidatesReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];extractions:ExtractionOutcome[];auto:AutoSummary;promote:PromoteSummary[];identity:IdentityTally;idle:boolean}
export class CandidatesRunError extends Error{constructor(public code:'code_version_unavailable'){super(code);this.name='CandidatesRunError';}}

/** The Hong Kong calendar date (UTC+8): the as-of day of the reads a check makes. */
export const hkToday=(now:Date)=>new Date(now.getTime()+8*3_600_000).toISOString().slice(0,10);
export const COUNTERS=['fetched','inserted','duplicates','versioned','quarantined','failed'] as const;
export const errMsg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
export const remainingMs=(deps:Pick<CandidatesDeps,'deadline'|'now'>)=>deps.deadline===null?Number.POSITIVE_INFINITY:deps.deadline.getTime()-deps.now().getTime();
/** Reads every page of a cursor-paged DocumentsDb read. */
export async function allPages<T>(read:(cursor:string|null)=>Promise<Page<T>>):Promise<T[]>{
 const out:T[]=[];let cursor:string|null=null;
 do{const p=await read(cursor);out.push(...p.rows);cursor=p.nextCursor;}while(cursor!==null);
 return out;
}

/** Production wiring over the service-role client (spec §6.3 cron, admin routes, scripts). */
export function supabaseCandidatesDeps(admin:SupabaseClient,opts:{deadline:Date|null;codeVersion:string|null;now?:()=>Date}):CandidatesDeps{
 return {db:supabaseDocumentsDb(admin),tables:supabaseTableClient(admin),store:supabaseObjectStore(admin),port:supabaseHkFactsPort(admin),
  now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion};
}

class PhaseDeadline extends Error{constructor(){super('deadline_hit');}}
const blank=(ex:{extraction_id:string;document_id:string|null}):ExtractionOutcome=>({extractionId:ex.extraction_id,documentId:ex.document_id,outcome:'skipped',inserted:0,written:0,inherited:0,quarantined:0});

/** candidatesDue, or the given ids (only those still pending/failed; the rest are reported as not_due). */
async function dueExtractions(deps:CandidatesDeps,opts:CandidatesOptions):Promise<{due:ExtractionRow[];notDue:string[]}>{
 if(opts.extractionIds===undefined)return {due:await deps.db.candidatesDue(opts.limit),notDue:[]};
 const due:ExtractionRow[]=[];const notDue:string[]=[];
 for(const id of [...new Set(opts.extractionIds)]){
  const ex=await deps.db.extractionById(id);
  if(ex&&(ex.candidates_status==='pending'||ex.candidates_status==='failed'))due.push(ex);else notDue.push(id);
 }
 return {due,notDue};
}

async function candidatesFor(deps:CandidatesDeps,batchId:string,ex:ExtractionRow,today:string,out:ExtractionOutcome,counts:BatchCounts,errors:BatchError[]):Promise<void>{
 if(!await deps.db.claimCandidatesLease(ex.extraction_id,batchId,LEASE_TTL_S)){
  out.outcome='skipped';out.code='leased_or_exhausted';
  errors.push({code:'skipped_summary',key:ex.extraction_id,message:JSON.stringify({leased_or_exhausted:1})});
  return;
 }
 // R1-P2-7 round 2: the whole claimed phase (generation, checks, writes) runs under the lease heartbeat
 // with guarded clients; a refused renewal → lease_lost at once and the abandoned phase can write nothing
 // more. Its outcome, counts and errors are merged only when it completes.
 const local={out:{...out},counts:emptyCounts(),errors:[] as BatchError[]};
 try{
  await withLeaseHeartbeat(()=>deps.db.renewCandidatesLease(ex.extraction_id,batchId,LEASE_TTL_S),
   (signal,quiesce)=>candidatesClaimed({...deps,db:guardCalls(deps.db,signal),store:guardCalls(deps.store,signal),tables:guardCalls(deps.tables,signal),port:guardCalls(deps.port,signal)},batchId,ex,today,local.out,local.counts,local.errors,quiesce),
   {intervalMs:HEARTBEAT_MS,remainingMs:()=>remainingMs(deps),reserveMs:FINAL_RESERVE_MS});
 }catch(e){
  if(!(e instanceof DocumentsDbError&&e.code==='lease_lost'))throw e;
  out.outcome='failed';out.code='lease_lost';counts.failed++;errors.push({code:'lease_lost',key:ex.extraction_id,message:'heartbeat'});
  return;
 }
 Object.assign(out,local.out);for(const k of COUNTERS)counts[k]+=local.counts[k];errors.push(...local.errors);
}
/** Parks findings in quarantine; a finding whose members are all decided is recreated only when no item of that key and reason exists in any state (recovery without noise). Returns how many were parked. */
async function parkFindings(tables:TableClient,batchId:string,findings:CheckFinding[],decided:Set<string>):Promise<number>{
 let n=0;
 for(const f of findings){
  if(f.candidateIds.every(id=>decided.has(id))){
   const have=await tables.select('dq_quarantine',{dataset:CANDIDATES_DATASET,table_name:'extraction_candidates',natural_key:f.naturalKey,reason_code:f.reasonCode},{limit:1});
   if(have.length>0)continue;
  }
  await quarantine(tables,{dataset:CANDIDATES_DATASET,table:'extraction_candidates',naturalKey:f.naturalKey,reasonCode:f.reasonCode,batchId,payload:{...f.payload,candidate_ids:f.candidateIds}});
  n++;
 }
 return n;
}
async function candidatesClaimed(deps:CandidatesDeps,batchId:string,ex:ExtractionRow,today:string,out:ExtractionOutcome,counts:BatchCounts,errors:BatchError[],quiesce:()=>Promise<void>):Promise<void>{
 // P2-7: renew before every mutating phase; a takeover → lease_lost (no finishCandidates, nothing more written)
 const keep=async()=>{if(!await deps.db.renewCandidatesLease(ex.extraction_id,batchId,LEASE_TTL_S))throw new DocumentsDbError('lease_lost');};
 const budget=()=>{if(remainingMs(deps)<MIN_PHASE_MS)throw new PhaseDeadline();};
 try{
  const doc=await deps.db.documentById(ex.document_id);
  if(!doc)throw new Error('document_not_found');
  const bytes=await deps.store.get(ex.pages_json_path);
  if(sha256Hex(bytes)!==ex.pages_json_sha256)throw new Error('pages_json_hash_mismatch');
  const pages=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as PagesJson;
  budget();await keep();
  const gen=await generateHkCandidates(pages,{document:doc,extraction:ex,
   cite:at=>cite(deps.db,{document_id:doc.document_id,extraction_id:ex.extraction_id,page_no:at.page_no,char_start:at.char_start,char_end:at.char_end,bbox:at.bbox??null,created_by:'extractor',created_ref:HK_EXTRACTOR_REF})});
  errors.push(...gen.info);
  await keep();
  const {inserted}=await deps.db.insertCandidates(ex.extraction_id,batchId,gen.candidates);
  out.inserted=inserted;
  counts.fetched+=gen.candidates.length;counts.inserted+=inserted;counts.duplicates+=gen.candidates.length-inserted;
  const reload=async()=>(await allPages(cursor=>deps.db.candidatesOf({extractionId:ex.extraction_id},{cursor,limit:1000})))
   .filter(c=>c.kind==='financial_fact'&&c.extractor_kind==='rule'&&c.extractor_ref===HK_EXTRACTOR_REF);
  // the COMPLETE generated set (decided rows included): identities need every member of a column; only undecided rows are written
  const all=await reload();
  if(all.length>0){
   budget();
   const ctx=await buildCheckContext(deps,doc,ex,all,today,pages);
   if(ctx.priorTruncated)errors.push({code:'skipped_summary',key:ex.extraction_id,message:JSON.stringify({prior_facts_truncated:1})});
   const results=runHkChecks(all,ctx);
   const decided=new Set(all.filter(c=>c.status!=='candidate').map(c=>c.candidate_id));
   const {findings,info}=hkCheckFindings(ex,all,results);
   errors.push(...info);
   out.identity=checkTally(results.filter(r=>!decided.has(r.candidate_id)),all).identity;
   await keep();
   // findings BEFORE the checks make a candidate decision-eligible (a failure after the checks commit must not lose them)
   out.quarantined=await parkFindings(deps.tables,batchId,findings,decided);
   counts.quarantined+=out.quarantined;
   if(ex.candidates_role==='comparison'){
    const cross=crossCheckFindings(await counterpartCandidates(deps.db,doc,today,'zh'),all);
    if(cross.length>0){
     const n=await parkFindings(deps.tables,batchId,cross,new Set(cross.flatMap(f=>f.candidateIds)));
     out.quarantined+=n;counts.quarantined+=n;
     errors.push({code:'en_zh_mismatch',key:ex.extraction_id,message:JSON.stringify({count:cross.length})});
    }
   }
   await keep();
   const forOpen=(rs:CheckRowResult[],skip:Set<string>)=>rs.filter(r=>!skip.has(r.candidate_id));
   let w:{written:number;inherited:number}={written:0,inherited:0};
   const rows=forOpen(results,decided);
   if(rows.length>0){
    try{w=await deps.db.writeCandidateChecks(ex.extraction_id,batchId,rows);}
    catch(e){
     if(!(e instanceof DocumentsDbError&&e.code==='decided'))throw e;
     // a reviewer decided a row between the read and the write: re-read and retry once on the rows still undecided
     const now=await reload();const still=new Set(now.filter(c=>c.status!=='candidate').map(c=>c.candidate_id));
     const again=forOpen(results,still);
     w=again.length>0?await deps.db.writeCandidateChecks(ex.extraction_id,batchId,again):w;
    }
   }
   out.written=w.written;out.inherited=w.inherited;
  }
  await quiesce();                                                       // no heartbeat beat after the lease ends (R3-P2-1)
  await deps.db.finishCandidates(ex.extraction_id,batchId,'done');
  out.outcome='done';
 }catch(e){
  out.outcome='failed';counts.failed++;
  if(e instanceof DocumentsDbError&&e.code==='lease_lost'){out.code='lease_lost';errors.push({code:'lease_lost',key:ex.extraction_id});return;}
  if(e instanceof PhaseDeadline){out.code='deadline_hit';errors.push({code:'deadline_hit',key:ex.extraction_id,message:'phase'});}
  else{out.code='candidates_error';errors.push({code:'candidates_error',key:ex.extraction_id,message:errMsg(e)});}
  try{await quiesce();await deps.db.finishCandidates(ex.extraction_id,batchId,'failed');}
  catch(e2){errors.push({code:'cleanup_failed',key:ex.extraction_id,message:errMsg(e2)});}
 }
}

async function autoDecide(deps:CandidatesDeps,errors:BatchError[]):Promise<AutoSummary>{
 const summary:AutoSummary={considered:0,decided:0,stopped:null};
 const left=()=>remainingMs(deps)-FINAL_RESERVE_MS;
 const stop=()=>{summary.stopped='deadline_hit';errors.push({code:'deadline_hit',message:JSON.stringify({phase:'auto'})});return summary;};
 if(left()<=0)return stop();
 // approvals first: without an unrevoked approval of the HK rule extractor nothing is paged
 let approvals:ApprovalRow[];
 try{approvals=(await deps.db.approvalsFor(HK_EXTRACTOR_REF,{limit:APPROVALS_LIMIT})).filter(a=>a.revoked_at===null&&a.extractor_ref===HK_EXTRACTOR_REF);}
 catch(e){
  if(e instanceof DocumentsDbError&&e.code==='too_many_approvals'){summary.stopped='too_many_approvals';errors.push({code:'too_many_approvals',key:HK_EXTRACTOR_REF});return summary;}
  throw e;
 }
 if(approvals.length===0)return summary;
 // collected first: deciding changes the status the cursor pages over
 const pending:CandidateRow[]=[];let cursor:string|null=null;
 do{
  if(left()<=0)return stop();
  const page:Page<CandidateRow>=await deps.db.candidatesOf({status:'candidate'},{cursor,limit:1000});
  pending.push(...page.rows.filter(c=>c.extractor_kind==='rule'&&c.extractor_ref===HK_EXTRACTOR_REF&&c.checks_passed&&c.kind==='financial_fact'));
  cursor=page.nextCursor;
 }while(cursor!==null);
 summary.considered=pending.length;
 const rows=new Map<string,ExtractionRow|null>();
 for(const c of pending){
  if(left()<=0)return stop();
  if(!rows.has(c.extraction_id))rows.set(c.extraction_id,await deps.db.extractionById(c.extraction_id));
  const ex=rows.get(c.extraction_id);if(!ex||ex.candidates_role!=='primary')continue;   // comparison versions are never decided automatically
  const concept=(c.payload as FinancialFactPayload).concept;
  const a=approvals.find(x=>x.extractor_version===ex.extractor_version&&x.table_algo_version===ex.table_algo_version&&x.code_version===ex.code_version&&x.concepts.includes(concept));
  if(!a)continue;
  try{const r=await deps.db.decideCandidate(c.candidate_id,{kind:'auto',approval_id:a.approval_id});if(r.status==='confirmed')summary.decided++;}
  catch(e){if(e instanceof DocumentsDbError&&(e.code==='not_eligible'||e.code==='decided'||e.code==='approval_revoked'))continue;throw e;}
 }
 return summary;
}

async function dryRun(deps:CandidatesDeps,opts:CandidatesOptions,phases:Set<CandidatesPhase>):Promise<CandidatesReceipt>{
 const extractions:ExtractionOutcome[]=[];
 if(phases.has('candidates')){
  const {due,notDue}=await dueExtractions(deps,opts);
  for(const ex of due)extractions.push({...blank(ex),outcome:'due'});
  for(const id of notDue)extractions.push({...blank({extraction_id:id,document_id:null}),code:'not_due'});
 }
 const promote:PromoteSummary[]=phases.has('promote')?(await deps.port.promotionDue(HK_PUB_GEN,opts.limit)).map(d=>({issuerId:d.issuerId,outcome:'skipped' as const,code:'due',counts:emptyCounts()})):[];
 return {batchId:null,status:'dry_run',counts:emptyCounts(),errors:[],extractions,auto:{considered:0,decided:0,stopped:null},promote,identity:{checked:0,skipped:0,failed:0},idle:!extractions.some(e=>e.outcome==='due')&&promote.length===0};
}

export async function runDocumentsCandidates(deps:CandidatesDeps,opts:CandidatesOptions):Promise<CandidatesReceipt>{
 const phases=new Set<CandidatesPhase>(opts.phases??DEFAULT_PHASES);
 if(opts.dryRun)return dryRun(deps,opts,phases);
 if(!deps.codeVersion)throw new CandidatesRunError('code_version_unavailable');
 const today=hkToday(deps.now());
 const {batchId}=await startBatch(deps.tables,{producer:'documents-candidates',dataset:CANDIDATES_DATASET,
  toolVersions:{hk_label_gen:String(HK_LABEL_GEN),hk_rules_version:HK_RULES_VERSION,hk_pub_gen:String(HK_PUB_GEN)},codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const counts=emptyCounts();const errors:BatchError[]=[];const extractions:ExtractionOutcome[]=[];const promote:PromoteSummary[]=[];
 let auto:AutoSummary={considered:0,decided:0,stopped:null};let idle=true;
 try{
  if(phases.has('candidates')){
   const {due,notDue}=await dueExtractions(deps,opts);
   for(const id of notDue){extractions.push({...blank({extraction_id:id,document_id:null}),code:'not_due'});errors.push({code:'skipped_summary',key:id,message:JSON.stringify({not_due:1})});}
   if(due.length>0)idle=false;
   for(let i=0;i<due.length;i++){
    if(remainingMs(deps)<MIN_ITEM_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:due.length-i})});break;}
    const out=blank(due[i]);extractions.push(out);
    await candidatesFor(deps,batchId,due[i],today,out,counts,errors);
   }
  }
  if(phases.has('auto')){
   try{auto=await autoDecide(deps,errors);if(auto.decided>0)idle=false;}
   catch(e){errors.push({code:'auto_failed',message:errMsg(e)});}
  }
  if(phases.has('promote')){
   try{
    if(remainingMs(deps)<MIN_ITEM_MS)errors.push({code:'deadline_hit',message:JSON.stringify({promote_not_started:1})});
    else{
     const fixed=await withinBudget(finalizeHkHooks(deps.tables,deps.now()),Math.max(0,remainingMs(deps)-FINAL_RESERVE_MS));   // R5-12: accepts made through the generic dq route
     if(fixed>0)errors.push({code:'skipped_summary',key:'facts.hk:hooks',message:JSON.stringify({hk_no_metrics:fixed})});
     const due=await deps.port.promotionDue(HK_PUB_GEN,opts.limit);
     if(due.length>0)idle=false;
     for(const x of await runHkFactsSync(deps,{issuerIds:due.map(d=>d.issuerId),batchId,triggeredBy:opts.triggeredBy})){
      promote.push(x);for(const k of COUNTERS)counts[k]+=x.counts[k];errors.push(...x.errors);
     }
    }
   }catch(e){
    if(e instanceof BudgetExceeded)errors.push({code:'deadline_hit',message:JSON.stringify({promote_hooks:1})});
    else errors.push({code:'promote_failed',message:errMsg(e)});
   }
  }
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  await recordAttempt(deps.tables,CANDIDATES_DATASET,{ok:status!=='failed',cadence:'daily',now:deps.now(),
   detail:{identity_skipped:extractions.reduce((n,x)=>n+(x.identity?.skipped??0),0),extractions:extractions.length,failed:extractions.filter(e=>e.outcome==='failed').length,auto_decided:auto.decided,promoted:promote.filter(p=>p.outcome==='published').length,idle}});
  const identity={checked:0,skipped:0,failed:0};for(const x of extractions)if(x.identity){identity.checked+=x.identity.checked;identity.skipped+=x.identity.skipped;identity.failed+=x.identity.failed;}
  return {batchId,status,counts,errors,extractions,auto,promote,identity,idle};
 }catch(e){
  // infrastructure failure outside an extraction: close the receipt so no running batch dangles, then rethrow
  errors.push({code:'unknown',message:errMsg(e)});
  try{await finishBatch(deps.tables,batchId,{counts,errors},deps.now());}catch{/* left running; runbook SQL marks it failed */}
  try{await recordAttempt(deps.tables,CANDIDATES_DATASET,{ok:false,cadence:'daily',now:deps.now(),detail:{error:errMsg(e)}});}catch{/* same */}
  throw e;
 }
}
