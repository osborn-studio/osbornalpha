// src/lib/broker-research/verify.ts
// Daily evidence verification (spec §8.3): published reports' documents in last_verified_at order (null
// first), a 250 s budget, R1 re-run on effective span rows. Every attempted document gets
// last_verified_at and verify_status whatever happens, so a failing document never starves the rest.
// Drift → evidence_ok=false + quarantine span_drift; unreadable artifact → evidence_ok=false +
// quarantine artifact_unreadable. The cron is the dataset's only recordAttempt caller; only the
// admin single-document re-run (restore) may set evidence_ok back to true.
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchError} from '../dq/batches';
import {quarantine} from '../dq/quarantine';
import {recordAttempt} from '../dq/freshness';
import type {FreshnessStatus} from '../dq/freshness';
import type {CoreDeps} from './deps';
import {sliceText} from './extract/locate';
import {loadArtifact} from './parse';
import type {StorageWriteRow} from './types';
import {deleteRegisteredPath,withinLiveness} from './tracked-write';
import type {PageText} from './extract/locate';
import type {DocumentRow,FieldRow} from './types';

export type VerifyDeps=Pick<CoreDeps,'db'|'storage'|'tables'|'now'|'codeVersion'>;
export const VERIFY_BUDGET_MS=250_000,VERIFY_CANDIDATE_LIMIT=500;
export const VERIFY_PRODUCER='broker-research-verify';
/** Reconciliation: at most 60 s of the cron's 250 s budget; queue read in batches of 200 (P-R5-02). */
export const RECONCILE_BUDGET_MS=60_000,RECONCILE_BATCH=200;
/** access-log actor of cron writes (the log's user_id has no FK; spec §4.12). */
export const CRON_ACTOR='00000000-0000-0000-0000-000000000000';
export type VerifyOutcome='ok'|'failed'|'error';
export interface VerifyDocResult{documentId:string;reportId:string;outcome:VerifyOutcome;driftedFieldIds:string[];quarantineItems:number}
export interface VerifyReceipt{batchId:string;status:string;checked:number;remaining:number;results:VerifyDocResult[];freshness:FreshnessStatus|null;orphansRemoved:number;writesReconciled:number}
export interface VerifyOptions{deadline:Date;triggeredBy:'cron'|'manual';recordFreshness:boolean;documentId?:string;restore?:boolean}

/** Documents of published reports in verification order (db.verifyCandidates: last_verified_at asc, never verified first). */
async function candidates(deps:VerifyDeps):Promise<{doc:DocumentRow;reportId:string}[]>{
 const out:{doc:DocumentRow;reportId:string}[]=[];
 for(const doc of await deps.db.verifyCandidates(VERIFY_CANDIDATE_LIMIT)){
  if(doc.status==='withdrawn')continue;
  const r=await deps.db.reportByDocument(doc.document_id);
  if(r&&r.status==='published')out.push({doc,reportId:r.report_id});
 }
 return out;
}

/** The parse artifact through C4's loadArtifact: the COMPLETE stored bytes must hash to the run's recorded
 * artifact_hash (immutable-artifact provenance) before any span is checked or visibility restored; missing, changed
 * anywhere (also outside the cited spans) or malformed → null → outcome 'error' (P-R1-13). */
async function readArtifact(deps:VerifyDeps,parseRunId:string):Promise<PageText|null>{
 try{
  const run=await deps.db.getRun(parseRunId);if(!run)return null;
  const pages=(await loadArtifact(deps,run)).pages as unknown;
  return Array.isArray(pages)&&pages.every(p=>p&&typeof (p as {page?:unknown}).page==='number'&&typeof (p as {text?:unknown}).text==='string')?pages as PageText:null;
 }catch{return null;}
}
const hasSpan=(f:FieldRow)=>(f.status==='confirmed'||f.status==='corrected')&&f.superseded_by_run_id===null&&f.page!==null&&f.char_start!==null&&f.char_end!==null&&f.parse_run_id!==null;

export async function verifyDocument(deps:VerifyDeps,doc:DocumentRow,reportId:string,batchId:string,opts:{restore:boolean}):Promise<VerifyDocResult>{
 const fields=(await deps.db.listFields(reportId)).filter(hasSpan);
 const artifacts=new Map<string,PageText|null>();
 let unreadable=false;const drifted:FieldRow[]=[];
 for(const f of fields){
  const runId=f.parse_run_id!;
  if(!artifacts.has(runId))artifacts.set(runId,await readArtifact(deps,runId));
  const art=artifacts.get(runId);
  if(art===null||art===undefined){unreadable=true;continue;}
  if(sliceText(art,f.page!,f.char_start!,f.char_end!)!==f.value_source_text)drifted.push(f);
 }
 const outcome:VerifyOutcome=unreadable?'error':drifted.length?'failed':'ok';
 let quarantineItems=0;
 if(outcome!=='ok'){
  await deps.db.setReportFlags(reportId,{evidence_ok:false});
  const items=new Map<string,{reason:string;fields:{field:string;page:number|null}[]}>();
  if(unreadable)items.set(`${doc.sha256}:artifact_unreadable:-`,{reason:'artifact_unreadable',fields:[]});
  for(const f of drifted){
   const k=`${doc.sha256}:span_drift:${f.target_key??'-'}`;
   const e=items.get(k)??{reason:'span_drift',fields:[]};e.fields.push({field:f.field,page:f.page});items.set(k,e);
  }
  for(const [naturalKey,e] of items){
   await quarantine(deps.tables,{dataset:'broker_research',table:'broker_research_reports',naturalKey,reasonCode:e.reason,payload:{fields:e.fields},detail:{report_id:reportId,document_id:doc.document_id},batchId});
   quarantineItems++;
  }
 }else if(opts.restore){
  const rep=await deps.db.getReport(reportId);
  if(rep&&!rep.evidence_ok)await deps.db.setReportFlags(reportId,{evidence_ok:true});
 }
 await deps.db.updateDocument(doc.document_id,{last_verified_at:deps.now().toISOString(),verify_status:outcome});
 return {documentId:doc.document_id,reportId,outcome,driftedFieldIds:drifted.map(f=>f.field_id),quarantineItems};
}

export async function runVerify(deps:VerifyDeps,opts:VerifyOptions):Promise<VerifyReceipt>{
 const {batchId}=await startBatch(deps.tables,{producer:VERIFY_PRODUCER,dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const counts=emptyCounts(),errors:BatchError[]=[],results:VerifyDocResult[]=[];
 let all:{doc:DocumentRow;reportId:string}[];
 if(opts.documentId!==undefined){   // admin re-run: the one document, if it has a published report
  const doc=await deps.db.getDocument(opts.documentId),r=doc?await deps.db.reportByDocument(doc.document_id):null;
  all=doc&&doc.status!=='withdrawn'&&r?.status==='published'?[{doc,reportId:r.report_id}]:[];
 }else all=await candidates(deps);
 // Purge-intent reconciliation has a separate budget and durable retry ordering. No elapsed-time completion.
 let orphansRemoved=0,writesReconciled=0;
 const remainingMs=Math.max(0,opts.deadline.getTime()-deps.now().getTime());
 const cleanupMs=remainingMs<10_000?0:Math.min(RECONCILE_BUDGET_MS,remainingMs*0.25);
 const evidenceMs=remainingMs-cleanupMs; // reserved even if cleanup consumes its entire allocation
 const until=deps.now().getTime()+cleanupMs;
 const cleanupCall=<T>(invoke:()=>Promise<T>):Promise<T>=>{const ms=until-deps.now().getTime();return ms>0?withinLiveness(invoke(),ms):Promise.reject(new Error('cleanup_deadline'));};
 if(opts.documentId===undefined&&cleanupMs>0){
  const kept=new Set<string>();
  drain:for(;;){
   if(deps.now().getTime()>=until)break;
   let rows:StorageWriteRow[];
   try{rows=(await withinLiveness(deps.db.unreconciledWrites(RECONCILE_BATCH+kept.size),until-deps.now().getTime())).filter(w=>!kept.has(w.write_id));}
   catch{errors.push({code:'verify_error',key:'cleanup_inventory'});break;}
   if(!rows.length)break;
   for(const w of rows){
    if(deps.now().getTime()>=until)break drain;
    kept.add(w.write_id);
    try{
     const removed=await deleteRegisteredPath(deps.storage,w.path,{until,now:deps.now});
     const deletedAt=deps.now().toISOString(); // successful deletion COMPLETED; snapshot-pending still waits for another sweep
     if(removed.length){orphansRemoved+=removed.length;await cleanupCall(()=>deps.db.logAccess({document_id:w.document_id,user_id:CRON_ACTOR,action:'orphan_cleanup',detail:{reason:'purge_requested_write',write_id:w.write_id,writer:w.writer,removed:removed.length}}));}
     if(w.status==='done'&&w.finished_at!==null&&w.finished_at<=deletedAt){await cleanupCall(()=>deps.db.markReconciled(w.write_id,deletedAt));writesReconciled++;}
     // Pending rows are deliberately NOT reconciled or delayed on success: swept on every daily invocation.
    }catch{
     const attempts=w.attempts+1;
     await cleanupCall(()=>deps.db.retryWrite(w.write_id,new Date(deps.now().getTime()+Math.min(86_400_000,60_000*2**Math.min(attempts-1,11))).toISOString(),attempts)).catch(()=>{}); // no budget: unresolved row remains due
     errors.push({code:'verify_error',key:`write:${w.write_id}`});
    }
   }
  }
 }
 const evidenceUntil=Math.min(opts.deadline.getTime(),deps.now().getTime()+evidenceMs);
 let i=0;
 for(;i<all.length;i++){
  if(deps.now().getTime()>=evidenceUntil){errors.push({code:'deadline_hit'});break;}
  const {doc,reportId}=all[i];counts.fetched++;
  try{
   const r=await withinLiveness(verifyDocument(deps,doc,reportId,batchId,{restore:opts.restore===true}),evidenceUntil-deps.now().getTime());
   results.push(r);
   if(r.outcome==='ok')counts.inserted++;
   else{counts.quarantined++;errors.push({code:r.outcome==='error'?'artifact_unreadable':'span_drift',key:doc.document_id});}
  }catch{
   counts.failed++;errors.push({code:'verify_error',key:doc.document_id});
   try{await deps.db.updateDocument(doc.document_id,{last_verified_at:deps.now().toISOString(),verify_status:'error'});}catch{/* the next run retries this document first */}
  }
 }
 const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
 const freshness=opts.recordFreshness?await recordAttempt(deps.tables,'broker_research',{ok:status!=='failed',cadence:'daily',now:deps.now(),detail:{batch_id:batchId,checked:counts.fetched}}):null;
 return {batchId,status,checked:counts.fetched,remaining:all.length-i,results,freshness,orphansRemoved,writesReconciled};
}
