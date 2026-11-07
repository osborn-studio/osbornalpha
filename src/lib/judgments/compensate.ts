// src/lib/judgments/compensate.ts
// Settle cron step 0 (spec §7.1, audits F28/G25/N2): the macro producer's compensation scan. The marker
// judgment_job_state[jobKey('produce','macro_regime','v1')] = {marker_created_at, marker_snapshot_id, ...} names the last
// macro snapshot handled; MacroReadApi.snapshotsSince(marker, 200) lists the later ones in (created_at, snapshot_id)
// order. A non-failed snapshot without a judgment (GIN inputs containment, abstentions included) is produced with
// binding {snapshot_id}; the marker advances after every finished snapshot (produced, duplicate, already present, or
// failed upstream) through set_job_state's optimistic lock. The scan keeps the revision each write returned (plan audit
// T-04: a foreign write in between makes the next write a job_state_conflict, never an overwrite) and refuses a marker that
// does not sort strictly after the stored one by (created_at, snapshot_id) (marker_regression, non-info). A produce failure
// stops the scan WITHOUT advancing and counts in job state `failing` {snapshot_id, attempts}; on the 3rd consecutive failing
// run the snapshot is recorded in `skipped` [{snapshot_id, created_at, reason, attempts}], the marker moves past it and the
// scan goes on, reporting a NON-info compensation_skipped (plan decision T-07). An abort is never a produce failure. Reads are
// raced against a signal that combines the run's with the scan's OWN budget (T2-03); produce is NOT raced (T2-01): a mutating item is
// awaited and cancels cooperatively through deps.signal (checked right before its register RPC), a deferred result being a stop, not a failure. The macro module not landed (MacroUnavailable) → skipped with info
// macro_unavailable; macro_regime@v2 not in REGISTRY yet → skipped silently. produce counts go to the produce batch
// (dataset judgments.produce.macro_regime); the settle receipt gets the scan's errors. Budget: deadlineAt (default start + 60 s).
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchCounts,BatchError,TriggeredBy} from '../dq/batches';
import type {TableClient} from '../db/table-client';
import {AbortedError,raceAbort} from './abort';
import {jobKey} from './job-keys';
import {MacroUnavailable} from './macro-api';
import {produce as defaultProduce} from './produce';
import type {ProduceDeps,ProduceResult,ProduceWork} from './produce';
import type {ResolverLookup} from './register';
import {REGISTRY} from './registry';
import {resolverFor} from './resolvers';
import type {JudgmentInputsDb,JudgmentsDb,MacroSnapshotRow,Methodology} from './types';

export const MACRO_METHOD={id:'macro_regime',version:'v2'} as const;
export const SNAPSHOT_PAGE=200;
export const COMPENSATION_BUDGET_MS=60_000;
/** Consecutive failing runs after which a snapshot is skipped with a visible error (plan decision T-07). */
export const MAX_PRODUCE_ATTEMPTS=3;
export const SKIPPED_KEEP=100;
/** Same shape as Task 10 produce(m, work, deps) (tests inject a stub); work items are ProduceWork (observedAt is stamped by produce). */
export type ProduceFn=(m:Methodology,work:readonly ProduceWork[],deps:ProduceDeps)=>Promise<Pick<ProduceResult,'counts'|'errors'>>;
export interface CompensateDeps{db:JudgmentsDb;inputsDb:JudgmentInputsDb;tables:TableClient;codeVersion:string;triggeredBy:TriggeredBy;signal:AbortSignal;clock?:()=>number;deadlineAt?:number;methodology?:Methodology|null;produce?:ProduceFn;resolverOf?:ResolverLookup}
/** registerJudgment's resolver lookup over the real table (Task 11); unknown / unimplemented → null. */
export const defaultResolverOf:ResolverLookup=name=>{try{return resolverFor(name);}catch{return null;}};
export interface CompensationReport{status:'done'|'skipped'|'stopped';reason:string|null;scanned:number;produced:number;existing:number;skippedFailed:number;/** snapshots given up on after MAX_PRODUCE_ATTEMPTS failing runs (T-07) */skippedStalled?:number;stoppedAt:string|null;batchId:string|null;errors:BatchError[]}

function markerOf(s:Record<string,unknown>|undefined):{created_at:string;snapshot_id:string}|null{
 const c=s?.marker_created_at,i=s?.marker_snapshot_id;
 return typeof c==='string'&&typeof i==='string'?{created_at:c,snapshot_id:i}:null;
}
const messageOf=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,500);

const isoMs=(x:string)=>Date.parse(x);
/** True when snapshot s sorts strictly after marker m by (created_at, snapshot_id). */
const afterMarker=(s:{created_at:string;snapshot_id:string},m:{created_at:string;snapshot_id:string}|null)=>
 m===null||isoMs(s.created_at)>isoMs(m.created_at)||(isoMs(s.created_at)===isoMs(m.created_at)&&s.snapshot_id>m.snapshot_id);
const isRec=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);

export async function compensateMacro(deps:CompensateDeps):Promise<CompensationReport>{
 const report:CompensationReport={status:'done',reason:null,scanned:0,produced:0,existing:0,skippedFailed:0,skippedStalled:0,stoppedAt:null,batchId:null,errors:[]};
 const m=deps.methodology!==undefined?deps.methodology:REGISTRY.find(x=>x.id===MACRO_METHOD.id&&x.version===MACRO_METHOD.version)??null;
 if(!m)return {...report,status:'skipped',reason:'methodology_missing'};
 const mm:Methodology=m;
 const key=jobKey('produce',m.id,m.version);
 const clock=deps.clock??Date.now,deadlineAt=deps.deadlineAt??clock()+COMPENSATION_BUDGET_MS;
 // T2-03: the scan's own budget signal, combined with the parent's, applies to every wait below (reads) and is handed to produce.
 const own=new AbortController();
 const timer=setTimeout(()=>own.abort(new Error('compensation_budget')),Math.max(0,deadlineAt-clock()));
 const signal=AbortSignal.any([deps.signal,own.signal]);
 try{return await scan();}finally{clearTimeout(timer);}
 async function scan():Promise<CompensationReport>{
 const stored=await deps.db.jobState(key);
 let doc:Record<string,unknown>=stored?stored.state:{};
 let rev:string|null=stored?stored.updated_at:null;
 let marker=markerOf(doc);
 const stop=(reason:string,at:string)=>{report.status='stopped';report.reason=reason;report.stoppedAt=at;};
 const deadline=(at:string)=>{stop('deadline',at);report.errors.push({code:'deadline_hit',key:at,message:'compensation scan stopped at its budget'});};
 let snaps:MacroSnapshotRow[];
 try{snaps=await raceAbort(deps.inputsDb.macro.snapshotsSince(marker,SNAPSHOT_PAGE),signal,'snapshotsSince');}
 catch(e){
  if(e instanceof MacroUnavailable)return {...report,status:'skipped',reason:'macro_unavailable',errors:[{code:'macro_unavailable',message:'macro read API unavailable; compensation scan skipped'}]};
  if(e instanceof AbortedError){deadline(marker?.snapshot_id??'start');return report;}
  throw e;
 }
 // One optimistic write; the returned revision is the one this scan now owns (T-04). `drop` removes keys from the document.
 const write=async(patch:Record<string,unknown>,drop:string[]=[]):Promise<boolean>=>{
  const next={...doc,...patch};for(const k of drop)delete next[k];
  const r=await deps.db.setJobState(key,rev,next);
  if(!r.ok)return false;
  doc=next;rev=r.updated_at??(await deps.db.jobState(key))?.updated_at??null;
  return true;
 };
 const markerPatch=(s:MacroSnapshotRow)=>({marker_created_at:s.created_at,marker_snapshot_id:s.snapshot_id});
 const run=deps.produce??(defaultProduce as ProduceFn);
 const counts=emptyCounts(),produceErrors:BatchError[]=[];
 try{
  for(const s of snaps){
   if(signal.aborted||clock()>=deadlineAt){deadline(s.snapshot_id);break;}
   if(!afterMarker(s,marker)){
    stop('marker_regression',s.snapshot_id);
    report.errors.push({code:'marker_regression',key:s.snapshot_id,message:`snapshot ${s.snapshot_id} (${s.created_at}) does not sort after the marker ${marker?.snapshot_id} (${marker?.created_at})`});
    break;
   }
   report.scanned++;
   let finished=true;
   let present:string[]|null=[];
   if(s.status!=='failed'){
    present=await raceAbort(deps.db.judgmentsBySnapshot(s.snapshot_id),signal,'judgmentsBySnapshot').catch(e=>{if(e instanceof AbortedError)return null;throw e;});
    if(present===null){report.scanned--;deadline(s.snapshot_id);break;}
   }
   if(s.status==='failed')report.skippedFailed++;
   else if(present.length>0)report.existing++;
   else{
    if(!report.batchId)report.batchId=(await startBatch(deps.tables,{producer:'ts-judgments',dataset:`judgments.produce.${mm.id}`,codeVersion:deps.codeVersion,triggeredBy:deps.triggeredBy})).batchId;
    if(signal.aborted||clock()>=deadlineAt){report.scanned--;deadline(s.snapshot_id);produceErrors.push({code:'deadline_hit',key:s.snapshot_id});break;}
    let ok=false,aborted=false;
    try{
     // T2-01: awaited, never raced — the in-flight item finishes (or defers cooperatively on `signal`) and the batch counts stay true.
     const r=await run(mm,[{subject:{type:'macro_region',key:s.region},asOf:s.as_of,binding:{snapshot_id:s.snapshot_id}}],{db:deps.db,inputsDb:deps.inputsDb,tables:deps.tables,resolverOf:deps.resolverOf??defaultResolverOf,batchId:report.batchId,codeVersion:deps.codeVersion,signal,actor:'cron'});
     for(const k of [...new Set([...Object.keys(counts),...Object.keys(r.counts)])] as (keyof BatchCounts)[])counts[k]=(counts[k]??0)+(r.counts[k]??0);
     produceErrors.push(...r.errors);
     aborted=(r.counts.deferred??0)>0||(r.counts.fetched===0&&r.errors.some(e=>e.code==='deadline_hit'));
     ok=!aborted&&r.counts.failed===0&&r.counts.quarantined===0&&r.counts.inserted+r.counts.duplicates>0;
    }catch(e){
     {counts.failed++;produceErrors.push({code:'produce_failed',key:s.snapshot_id,message:messageOf(e)});}
    }
    if(aborted){report.scanned--;deadline(s.snapshot_id);break;}
    if(!ok){
     // T-07: count consecutive failing runs of THIS snapshot in the job state; the 3rd gives up on it, visibly.
     const prev=isRec(doc.failing)&&doc.failing.snapshot_id===s.snapshot_id?Number(doc.failing.attempts)||0:0;
     const attempts=prev+1;
     if(attempts<MAX_PRODUCE_ATTEMPTS){
      if(!(await write({failing:{snapshot_id:s.snapshot_id,attempts}}))){stop('job_state_conflict',s.snapshot_id);report.errors.push({code:'job_state_conflict',key});break;}
      stop('produce_failed',s.snapshot_id);break;
     }
     const skipped=[...(Array.isArray(doc.skipped)?doc.skipped as unknown[]:[]),{snapshot_id:s.snapshot_id,created_at:s.created_at,reason:'produce_failed',attempts}].slice(-SKIPPED_KEEP);
     if(!(await write({...markerPatch(s),skipped},['failing']))){stop('job_state_conflict',s.snapshot_id);report.errors.push({code:'job_state_conflict',key});break;}
     marker={created_at:s.created_at,snapshot_id:s.snapshot_id};
     const err:BatchError={code:'compensation_skipped',key:s.snapshot_id,message:`snapshot ${s.snapshot_id} skipped after ${attempts} failing runs; recorded in job state skipped[]`};
     report.errors.push(err);produceErrors.push(err);report.skippedStalled=(report.skippedStalled??0)+1;
     finished=false;
    }
    else report.produced++;
   }
   if(finished){
    if(!(await write(markerPatch(s),['failing']))){stop('job_state_conflict',s.snapshot_id);report.errors.push({code:'job_state_conflict',key});break;}
    marker={created_at:s.created_at,snapshot_id:s.snapshot_id};
   }
  }
 }finally{
  if(report.batchId)await finishBatch(deps.tables,report.batchId,{counts,errors:produceErrors});
 }
 return report;
}
}
