// src/lib/judgments/compensate.ts
// Settle cron step 0 (spec §7.1, audits F28/G25/N2): the macro producer's compensation scan. The marker
// judgment_job_state[jobKey('produce','macro_regime','v1')] = {marker_created_at, marker_snapshot_id} names the last
// macro snapshot handled; MacroReadApi.snapshotsSince(marker, 200) lists the later ones in (created_at, snapshot_id)
// order. A non-failed snapshot without a judgment (GIN inputs containment, abstentions included) is produced with
// binding {snapshot_id}; the marker advances after every finished snapshot (produced, already present, or failed
// upstream) through set_job_state's optimistic lock. A produce failure stops the scan WITHOUT advancing (the next
// cron starts from that snapshot); a lost CAS → info job_state_conflict, stop; the macro module not landed
// (MacroUnavailable) → skipped with info macro_unavailable; macro_regime@v1 not in REGISTRY yet → skipped silently.
// produce counts go to the produce batch (dataset judgments.produce.macro_regime); only info codes reach the
// settle receipt. Budget: deadlineAt (default start + 60 s) and the run signal.
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchCounts,BatchError,TriggeredBy} from '../dq/batches';
import type {TableClient} from '../db/table-client';
import {jobKey} from './job-keys';
import {MacroUnavailable} from './macro-api';
import {produce as defaultProduce} from './produce';
import type {ProduceDeps,ProduceResult,ProduceWork} from './produce';
import type {ResolverLookup} from './register';
import {REGISTRY} from './registry';
import {resolverFor} from './resolvers';
import type {JudgmentInputsDb,JudgmentsDb,MacroSnapshotRow,Methodology} from './types';

export const MACRO_METHOD={id:'macro_regime',version:'v1'} as const;
export const SNAPSHOT_PAGE=200;
export const COMPENSATION_BUDGET_MS=60_000;
/** Same shape as Task 10 produce(m, work, deps) (tests inject a stub); work items are ProduceWork (observedAt is stamped by produce). */
export type ProduceFn=(m:Methodology,work:readonly ProduceWork[],deps:ProduceDeps)=>Promise<Pick<ProduceResult,'counts'|'errors'>>;
export interface CompensateDeps{db:JudgmentsDb;inputsDb:JudgmentInputsDb;tables:TableClient;codeVersion:string;triggeredBy:TriggeredBy;signal:AbortSignal;clock?:()=>number;deadlineAt?:number;methodology?:Methodology|null;produce?:ProduceFn;resolverOf?:ResolverLookup}
/** registerJudgment's resolver lookup over the real table (Task 11); unknown / unimplemented → null. */
export const defaultResolverOf:ResolverLookup=name=>{try{return resolverFor(name);}catch{return null;}};
export interface CompensationReport{status:'done'|'skipped'|'stopped';reason:string|null;scanned:number;produced:number;existing:number;skippedFailed:number;stoppedAt:string|null;batchId:string|null;errors:BatchError[]}

function markerOf(s:Record<string,unknown>|undefined):{created_at:string;snapshot_id:string}|null{
 const c=s?.marker_created_at,i=s?.marker_snapshot_id;
 return typeof c==='string'&&typeof i==='string'?{created_at:c,snapshot_id:i}:null;
}
const messageOf=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,500);

export async function compensateMacro(deps:CompensateDeps):Promise<CompensationReport>{
 const report:CompensationReport={status:'done',reason:null,scanned:0,produced:0,existing:0,skippedFailed:0,stoppedAt:null,batchId:null,errors:[]};
 const m=deps.methodology!==undefined?deps.methodology:REGISTRY.find(x=>x.id===MACRO_METHOD.id&&x.version===MACRO_METHOD.version)??null;
 if(!m)return {...report,status:'skipped',reason:'methodology_missing'};
 const key=jobKey('produce',m.id,m.version);
 const clock=deps.clock??Date.now,deadlineAt=deps.deadlineAt??clock()+COMPENSATION_BUDGET_MS;
 let state=await deps.db.jobState(key);
 let snaps:MacroSnapshotRow[];
 try{snaps=await deps.inputsDb.macro.snapshotsSince(markerOf(state?.state),SNAPSHOT_PAGE);}
 catch(e){
  if(e instanceof MacroUnavailable)return {...report,status:'skipped',reason:'macro_unavailable',errors:[{code:'macro_unavailable',message:'macro read API unavailable; compensation scan skipped'}]};
  throw e;
 }
 const run=deps.produce??(defaultProduce as ProduceFn);
 const counts=emptyCounts(),produceErrors:BatchError[]=[];
 const stop=(reason:string,at:string)=>{report.status='stopped';report.reason=reason;report.stoppedAt=at;};
 try{
  for(const s of snaps){
   if(deps.signal.aborted||clock()>=deadlineAt){stop('deadline',s.snapshot_id);report.errors.push({code:'deadline_hit',key:s.snapshot_id,message:'compensation scan stopped at its budget'});break;}
   report.scanned++;
   if(s.status==='failed')report.skippedFailed++;
   else if((await deps.db.judgmentsBySnapshot(s.snapshot_id)).length>0)report.existing++;
   else{
    if(!report.batchId)report.batchId=(await startBatch(deps.tables,{producer:'ts-judgments',dataset:`judgments.produce.${m.id}`,codeVersion:deps.codeVersion,triggeredBy:deps.triggeredBy})).batchId;
    let ok=false;
    try{
     const r=await run(m,[{subject:{type:'macro_region',key:s.region},asOf:s.as_of,binding:{snapshot_id:s.snapshot_id}}],{db:deps.db,inputsDb:deps.inputsDb,tables:deps.tables,resolverOf:deps.resolverOf??defaultResolverOf,batchId:report.batchId,codeVersion:deps.codeVersion,signal:deps.signal,actor:'cron'});
     for(const k of Object.keys(counts) as (keyof BatchCounts)[])counts[k]+=r.counts[k]??0;
     produceErrors.push(...r.errors);
     // D1: a duplicate is done too — an abstention whose binding snapshot could not be built has inputs = [] and is
     // invisible to judgmentsBySnapshot, so every later scan re-produces it and gets `duplicate`; the marker advances.
     ok=r.counts.failed===0&&r.counts.quarantined===0&&r.counts.inserted+r.counts.duplicates>0;
    }catch(e){counts.failed++;produceErrors.push({code:'produce_failed',key:s.snapshot_id,message:messageOf(e)});}
    if(!ok){stop('produce_failed',s.snapshot_id);break;}
    report.produced++;
   }
   if(!(await deps.db.setJobState(key,state?.updated_at??null,{marker_created_at:s.created_at,marker_snapshot_id:s.snapshot_id}))){
    stop('job_state_conflict',s.snapshot_id);report.errors.push({code:'job_state_conflict',key});break;
   }
   state=await deps.db.jobState(key);
  }
 }finally{
  if(report.batchId)await finishBatch(deps.tables,report.batchId,{counts,errors:produceErrors});
 }
 return report;
}
