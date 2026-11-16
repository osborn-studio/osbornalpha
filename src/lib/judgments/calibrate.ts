// src/lib/judgments/calibrate.ts
// Calibration job (spec §8.3): one work unit = (methodology@version, scope); units run in registry
// order under the cron budget and resume across runs from judgment_job_state[jobKey('calibrate',…)]
// = {generation, cutoff, expected_revision, query_bounds, after, done, manifest}. A unit fixes its
// generation, validity revision and window once at start and FREEZES its cohort in one statement
// (freeze_calibration_cohort: one MVCC snapshot of the members and their latest settlements; plan audit
// P1-10; query_bounds records frozen_at and n), pages the frozen set through the service-role
// calibration_cohort_members (R04: unpublished methods calibrate too) until an EMPTY page (P1-02), uploads
// each page to a fresh per-attempt object with upsert:false, then appends the manifest entry and advances
// `after` in ONE optimistic set_job_state (S01, R02). Clearing a unit also clears its generation's members.
// Units run in a persisted round (judgment_job_state['calibrate_round'] = {round, outcomes}, P2-02 / Q1-04): resumable
// unfinished generations first, then units without a final outcome this round; a unit that FAILED this round is
// excluded until the round advances, so neither an expensive nor a consistently failing early unit can starve the
// later ones. A lost CAS removes only this attempt's object;
// a crash between upload and CAS leaves an orphan that no manifest names. Finalisation reads only
// the manifest's objects (sha256-checked), evaluates (calibration.ts), writes the content-addressed
// cohort file, and calls insert_calibration: inserted | duplicate → CAS-clear the unit (R05),
// stale_revision → clear and restart with a new generation (acceptance example 10).
import {randomUUID} from 'node:crypto';
import {selectAll} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {uuidV8} from './uuid-v8';
import {ALGORITHM_VERSION,entryOf,evaluateCohort,optionsOf} from './calibration';
import type {CohortEntry} from './calibration';
import {canonicalize,digest,sha256} from './canonical';
import {isCohortPath} from './cohort-store';
import type {CohortStore} from './cohort-store';
import {jobKey} from './job-keys';
import {PUBLIC_SUBJECT_TYPES} from './types';
import type {CalibrationRow,CalibrationScope,JudgmentsDb,MethodologyRow,QueryBounds} from './types';

export const CALIBRATE_DATASET='judgments.calibrate';
/** The calibration cron's persisted round cursor (plan audit P2-02); per-unit outcome of the current round (Q1-04). */
export const ROUND_JOB=jobKey('calibrate_round');
export type RoundOutcome='completed'|'failed'|'in_progress';
export interface RoundState{round:number;outcomes:Record<string,RoundOutcome>}
export const PAGE_SIZE=500,RESERVE_MS=30_000,VALID_DAYS=14,STALE_BATCH_SECONDS=900,MAX_STEPS=10_000;

export interface ManifestEntry{start_after:string|null;end_after:string;path:string;sha256:string;count:number}
export interface UnitState{generation:string;cutoff:string;expected_revision:number;query_bounds:QueryBounds;after:string|null;done:boolean;manifest:ManifestEntry[]}
export interface Unit{methodology:MethodologyRow;scope:CalibrationScope;job:string}
export type UnitOutcome='inserted'|'duplicate'|'paused'|'stale_revision'|'conflict'|'failed'|'skipped';
export interface UnitReceipt{job:string;methodology_id:string;version:string;scope:CalibrationScope;outcome:UnitOutcome;calibration_id?:string;pages:number;code?:string}
export interface CalibrateReceipt{batchId:string;status:BatchStatus;counts:BatchCounts;errors:BatchError[];units:UnitReceipt[]}
export interface CalibrateDeps{
 db:JudgmentsDb;tables:TableClient;store:CohortStore;
 /** Registry order (REGISTRY in production). A method without a synced row is skipped. */
 methods:readonly {id:string;version:string}[];
 codeVersion:string;deadline:Date|null;triggeredBy?:TriggeredBy;
 now?:()=>Date;uuid?:()=>string;pageSize?:number;
}
export interface StepContext{db:JudgmentsDb;tables:TableClient;store:CohortStore;codeVersion:string;batchId:string;uuid:()=>string;pageSize:number}
export type StepOutcome=
 |{kind:'started';generation:string}
 |{kind:'paged';path:string;count:number}
 |{kind:'paging_done'}
 |{kind:'page_lost';path:string}
 |{kind:'conflict'}
 |{kind:'finalized';status:'inserted'|'duplicate';calibration_id:string;cleared:boolean;cleanupSkipped?:true}
 |{kind:'stale';cleared:boolean;cleanupSkipped?:true}
 |{kind:'reset';reason:'invalid_state'|'cohort_object_invalid';cleared:boolean;cleanupSkipped?:true};

export class CalibrateError extends Error{constructor(readonly code:string,detail?:string){super(detail?`${code}: ${detail}`:code);this.name='CalibrateError';}}

const enc=new TextEncoder(),dec=new TextDecoder();
const isPublic=(t:string)=>(PUBLIC_SUBJECT_TYPES as readonly string[]).includes(t);
/** 'all' first, then one row per declared price market and per public subject type (spec §5.5 scope_type). */
export function unitsOf(row:MethodologyRow):Unit[]{
 const scopes:CalibrationScope[]=[{scope_type:'all',scope_key:''},
  ...[...new Set(row.markets??[])].map(m=>({scope_type:'market' as const,scope_key:m})),
  ...[...new Set(row.subject_types)].filter(isPublic).map(t=>({scope_type:'subject_type' as const,scope_key:t}))];
 return scopes.map(scope=>({methodology:row,scope,job:jobKey('calibrate',row.methodology_id,row.version,scope)}));
}
export const inScope=(e:CohortEntry,s:CalibrationScope)=>s.scope_type==='all'||(s.scope_type==='market'?e.market===s.scope_key:e.subject_type===s.scope_key);
/** Storage-safe unit segment: id and version match the methodology checks; scope keys are markets or subject types. */
export const unitPath=(u:Unit)=>`${u.methodology.methodology_id}@${u.methodology.version}.${u.scope.scope_type}${u.scope.scope_key?`.${u.scope.scope_key}`:''}`;
/** [cutoff date − window_years, cutoff date] by as_of (spec §8.2); Feb 29 maps to Feb 28 only when the target year is not leap. */
export function windowOf(cutoff:string,years:number):{from:string;to:string}{
 const to=cutoff.slice(0,10);const [y,m,d]=to.split('-');
 const year=Number(y)-years,leap=year%4===0&&(year%100!==0||year%400===0);
 return {from:`${String(year).padStart(4,'0')}-${m}-${m==='02'&&d==='29'&&!leap?'28':d}`,to};
}
/** spec §5.5: digest({methodology, version, scope, window, threshold_n, ece_max, algorithm_version, cohort_sha256, validity_revision, query_bounds}). */
export function fingerprintOf(x:{methodology_id:string;methodology_version:string;scope_type:string;scope_key:string;window_from:string;window_to:string;threshold_n:number;ece_max:number;algorithm_version:string;cohort_sha256:string;validity_revision:number;query_bounds:QueryBounds}):string{
 return digest({methodology_id:x.methodology_id,methodology_version:x.methodology_version,scope_type:x.scope_type,scope_key:x.scope_key,window_from:x.window_from,window_to:x.window_to,threshold_n:x.threshold_n,ece_max:x.ece_max,algorithm_version:x.algorithm_version,cohort_sha256:x.cohort_sha256,validity_revision:x.validity_revision,query_bounds:x.query_bounds});
}

const str=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
function isUnitState(s:Record<string,unknown>):s is Record<string,unknown>&UnitState{
 const q=s.query_bounds as Record<string,unknown>|null;
 return str(s.generation)&&str(s.cutoff)&&Number.isSafeInteger(s.expected_revision)&&(s.after===null||str(s.after))&&typeof s.done==='boolean'&&
  !!q&&typeof q==='object'&&str(q.window_from)&&str(q.window_to)&&str(q.registered_at_lte)&&str(q.settled_at_lte)&&str(q.frozen_at)&&Number.isSafeInteger(q.n)&&
  Array.isArray(s.manifest)&&(s.manifest as unknown[]).every(m=>{const e=m as Record<string,unknown>;return !!e&&(e.start_after===null||str(e.start_after))&&str(e.end_after)&&str(e.path)&&str(e.sha256)&&Number.isSafeInteger(e.count);});
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** CAS first; then verify ownership through service-role reads, including retired/unpublished units.
 * Normal writers always allocate fresh generations and immutable paths; they never adopt old references.
 * A failed reference scan conservatively leaves cleanup to the orphan maintenance procedure. */
async function clearUnit(ctx:StepContext,unit:Unit,updatedAt:string,st:Record<string,unknown>):Promise<{cleared:boolean;cleanupSkipped?:true}>{
 const {ok:cleared}=await ctx.db.setJobState(unit.job,updatedAt,{});
 if(!cleared)return {cleared};
 const generation=st.generation;
 if(typeof generation!=='string'||!UUID.test(generation))return {cleared,cleanupSkipped:true};
 try{
  const jobs=await selectAll(ctx.tables,'judgment_job_state',{},'job');
  const states=jobs.filter(j=>typeof j.job==='string'&&j.job.startsWith('calibrate:')).map(j=>j.state);
  if(states.some(s=>s&&typeof s==='object'&&typeof (s as Record<string,unknown>).generation==='string'&&
   ((s as Record<string,unknown>).generation as string).toLowerCase()===generation.toLowerCase()))return {cleared,cleanupSkipped:true};
  const calibrations=await selectAll(ctx.tables,'judgment_calibrations',{},'calibration_id');
  const referenced=new Set<string>();
  const collect=(v:unknown):void=>{
   if(typeof v==='string')referenced.add(v);
   else if(v&&typeof v==='object')for(const x of Object.values(v))collect(x);
  };
  states.forEach(collect);
  for(const row of calibrations)collect(row.cohort_path);
  await ctx.db.clearCalibrationGeneration(generation);
  const prefix=`partial/${unitPath(unit)}/${generation}/`;
  for(const entry of Array.isArray(st.manifest)?st.manifest:[]){
   const path=entry&&typeof entry==='object'?(entry as Record<string,unknown>).path:null;
   if(typeof path==='string'&&isCohortPath(path)&&path.startsWith(prefix)&&!referenced.has(path))await ctx.store.remove(path).catch(()=>{});
  }
  return {cleared};
 }catch{return {cleared,cleanupSkipped:true};}
}

/** One action on one unit: start | page | mark paging done | finalize. Re-reads the committed state every call. */
export async function stepUnit(ctx:StepContext,unit:Unit):Promise<StepOutcome>{
 const m=unit.methodology;
 const cur=await ctx.db.jobState(unit.job);
 const st=cur?.state??{};
 if(Object.keys(st).length===0){
  const {revision}=await ctx.db.calibrationValidity(m.methodology_id,m.version);
  const cutoff=await ctx.db.serverTime();
  const w=windowOf(cutoff,optionsOf(m.params).window_years);
  const generation=ctx.uuid();
  // P1-10: one statement freezes every member and its latest settlement (one MVCC snapshot); the generation is
  // recorded only afterwards, and a lost start race drops the loser's frozen set.
  const frozen=await ctx.db.freezeCalibrationCohort(generation,m.methodology_id,m.version,w);
  // Q1-05: a fresh uuid can only be already frozen if it was reused; that generation is someone else's — never clear it.
  if(frozen.status==='already_frozen')throw new CalibrateError('generation_reused',generation);
  const next:UnitState={generation,cutoff,expected_revision:Number(revision),
   query_bounds:{window_from:w.from,window_to:w.to,registered_at_lte:frozen.frozen_at,settled_at_lte:frozen.frozen_at,frozen_at:frozen.frozen_at,n:frozen.n},after:null,done:false,manifest:[]};
  if((await ctx.db.setJobState(unit.job,cur?.updated_at??null,next as unknown as Record<string,unknown>)).ok)return {kind:'started',generation};
  await ctx.db.clearCalibrationGeneration(generation).catch(()=>0);
  return {kind:'conflict'};
 }
 if(!isUnitState(st))return {kind:'reset',reason:'invalid_state',...await clearUnit(ctx,unit,cur!.updated_at,st)};
 return st.done?finalize(ctx,unit,st,cur!.updated_at):page(ctx,unit,st,cur!.updated_at);
}

async function page(ctx:StepContext,unit:Unit,st:UnitState,updatedAt:string):Promise<StepOutcome>{
 // The frozen members of this generation, keyset on judgment_id; ONLY an empty page ends paging (P1-02: a server
 // row cap below pageSize returns short pages that are not exhaustion).
 const rows=await ctx.db.cohortMembers(st.generation,st.after,ctx.pageSize);
 if(rows.length===0)return (await ctx.db.setJobState(unit.job,updatedAt,{...st,done:true} as unknown as Record<string,unknown>)).ok?{kind:'paging_done'}:{kind:'conflict'};
 const endAfter=rows[rows.length-1].judgment.judgment_id;
 const entries=rows.map(entryOf).filter((e):e is CohortEntry=>e!==null&&inScope(e,unit.scope));
 const bytes=enc.encode(canonicalize({job:unit.job,generation:st.generation,start_after:st.after,end_after:endAfter,entries}));
 const hash=sha256(bytes);
 const path=`partial/${unitPath(unit)}/${st.generation}/${st.after??'start'}.${ctx.uuid()}.json`;
 if(await ctx.store.put(path,bytes,{upsert:false})!=='stored')throw new CalibrateError('cohort_path_collision',path);
 const next:UnitState={...st,after:endAfter,done:false,manifest:[...st.manifest,{start_after:st.after,end_after:endAfter,path,sha256:hash,count:entries.length}]};
 if((await ctx.db.setJobState(unit.job,updatedAt,next as unknown as Record<string,unknown>)).ok)return {kind:'paged',path,count:entries.length};
 // Another worker advanced the unit: drop only this attempt's object; the next step re-reads `after`.
 await ctx.store.remove(path).catch(()=>{});
 return {kind:'page_lost',path};
}

async function readManifest(ctx:StepContext,unit:Unit,st:UnitState):Promise<CohortEntry[]|null>{
 const out:CohortEntry[]=[];let prev:string|null=null;
 for(const e of st.manifest){
  const prefix=`partial/${unitPath(unit)}/${st.generation}/${e.start_after??'start'}.`;
  if(e.start_after!==prev||(prev!==null&&e.end_after<=prev)||e.count<0||!isCohortPath(e.path)||!e.path.startsWith(prefix))return null;
  const bytes=await ctx.store.get(e.path);
  if(!bytes||sha256(bytes)!==e.sha256)return null;
  // Invalid JSON is persistent corruption; storage transport failures above remain retryable.
  let body:{job:string;generation:string;start_after:string|null;end_after:string;entries:CohortEntry[]};
  try{body=JSON.parse(dec.decode(bytes));}catch{return null;}
  if(!body||body.job!==unit.job||body.generation!==st.generation||body.start_after!==e.start_after||body.end_after!==e.end_after||!Array.isArray(body.entries)||body.entries.length!==e.count)return null;
  let last=e.start_after;
  for(const x of body.entries){
   if(!x||!str(x.judgment_id)||(last!==null&&x.judgment_id<=last)||x.judgment_id>e.end_after||!inScope(x,unit.scope))return null;
   last=x.judgment_id;out.push(x);
  }
  prev=e.end_after;
 }
 return prev===st.after?out:null;
}

async function finalize(ctx:StepContext,unit:Unit,st:UnitState,updatedAt:string):Promise<StepOutcome>{
 const m=unit.methodology,q=st.query_bounds;
 const entries=await readManifest(ctx,unit,st);
 if(entries===null)return {kind:'reset',reason:'cohort_object_invalid',...await clearUnit(ctx,unit,updatedAt,st as unknown as Record<string,unknown>)};
 const opts=optionsOf(m.params);
 const ev=evaluateCohort(m.kind,entries,opts);
 const cohortBytes=enc.encode(canonicalize({algorithm_version:ALGORITHM_VERSION,methodology_id:m.methodology_id,methodology_version:m.version,scope_type:unit.scope.scope_type,scope_key:unit.scope.scope_key,query_bounds:q,entries:ev.entries}));
 const cohort_sha256=sha256(cohortBytes);
 const cohort_path=`cohorts/${cohort_sha256}.json`;
 await ctx.store.put(cohort_path,cohortBytes,{upsert:false});   // content-addressed: 'exists' is the same bytes
 const fingerprint=fingerprintOf({methodology_id:m.methodology_id,methodology_version:m.version,scope_type:unit.scope.scope_type,scope_key:unit.scope.scope_key,window_from:q.window_from,window_to:q.window_to,threshold_n:opts.threshold_n,ece_max:opts.ece_max,algorithm_version:ALGORITHM_VERSION,cohort_sha256,validity_revision:st.expected_revision,query_bounds:q});
 const calibration_id=uuidV8(fingerprint);
 const computed_at=await ctx.db.serverTime();
 const row:CalibrationRow={
  calibration_id,methodology_id:m.methodology_id,methodology_version:m.version,scope_type:unit.scope.scope_type,scope_key:unit.scope.scope_key,
  window_from:q.window_from,window_to:q.window_to,n_registered:ev.n_registered,n_settled:ev.n_settled,n_independent:ev.n_independent,n_void:ev.n_void,
  n_retrospective_excluded:ev.n_retrospective_excluded,threshold_n:opts.threshold_n,ece_max:opts.ece_max,kind:m.kind,state:ev.state,
  valid_until:new Date(Date.parse(computed_at)+VALID_DAYS*86_400_000).toISOString(),validity_revision:st.expected_revision,
  metrics:ev.metrics,reliability:ev.reliability,isotonic_segments:ev.isotonic_segments,cohort_path,cohort_sha256,query_bounds:q,fingerprint,
  algorithm_version:ALGORITHM_VERSION,code_version:ctx.codeVersion,computed_at,batch_id:ctx.batchId,
 };
 const status=await ctx.db.insertCalibration(row,st.expected_revision);
 const cleanup=await clearUnit(ctx,unit,updatedAt,st as unknown as Record<string,unknown>);
 if(status==='stale_revision')return {kind:'stale',...cleanup};
 return {kind:'finalized',status,calibration_id,...cleanup};
}

/** Steps one unit until it finalizes, loses to another worker, or runs out of budget. One restart after stale_revision. */
export async function runUnit(ctx:StepContext,unit:Unit,outOfBudget:()=>boolean):Promise<{outcome:UnitOutcome;pages:number;calibration_id?:string;infos:BatchError[]}>{
 const infos:BatchError[]=[];let pages=0,restarts=0;
 for(let i=0;i<MAX_STEPS;i++){
  if(outOfBudget()){infos.push({code:'deadline_hit',key:unit.job});return {outcome:'paused',pages,infos};}
  const r=await stepUnit(ctx,unit);
  if('cleanupSkipped' in r&&r.cleanupSkipped)infos.push({code:'job_state_conflict',key:unit.job,message:'generation_cleanup_skipped: ownership or references could not be verified'});
  switch(r.kind){
   case 'started':case 'paging_done':break;
   case 'paged':pages++;break;
   case 'page_lost':infos.push({code:'job_state_conflict',key:unit.job});break;
   case 'conflict':infos.push({code:'job_state_conflict',key:unit.job});return {outcome:'conflict',pages,infos};
   case 'reset':
    if(!r.cleared){infos.push({code:'job_state_conflict',key:unit.job});return {outcome:'conflict',pages,infos};}
    if(r.reason==='cohort_object_invalid')throw new CalibrateError('cohort_object_invalid',unit.job);
    break;
   case 'stale':
    infos.push({code:'stale_revision',key:unit.job});
    if(!r.cleared){infos.push({code:'job_state_conflict',key:unit.job});return {outcome:'conflict',pages,infos};}
    if(++restarts>1)return {outcome:'stale_revision',pages,infos};
    break;
   case 'finalized':
    if(!r.cleared)infos.push({code:'job_state_conflict',key:unit.job});   // next run: same fingerprint → duplicate → clear again (R05)
    return {outcome:r.status,pages,calibration_id:r.calibration_id,infos};
  }
 }
 throw new CalibrateError('step_limit',unit.job);
}

const codeOf=(e:unknown)=>e instanceof CalibrateError?e.code:'calibrate_failed';
const messageOf=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,300);

const ROUND_OUTCOMES:readonly string[]=['completed','failed','in_progress'];
const isRoundState=(s:Record<string,unknown>):s is Record<string,unknown>&RoundState=>Number.isSafeInteger(s.round)&&(s.round as number)>=1&&
 !!s.outcomes&&typeof s.outcomes==='object'&&!Array.isArray(s.outcomes)&&Object.values(s.outcomes as Record<string,unknown>).every(v=>typeof v==='string'&&ROUND_OUTCOMES.includes(v));
async function readRound(db:JudgmentsDb):Promise<{state:RoundState;updatedAt:string|null}>{
 const cur=await db.jobState(ROUND_JOB);
 const s=cur?.state??{};
 return {state:isRoundState(s)?{round:s.round,outcomes:{...s.outcomes}}:{round:1,outcomes:{}},updatedAt:cur?.updated_at??null};
}
const hasGeneration=async(db:JudgmentsDb,job:string)=>Object.keys((await db.jobState(job))?.state??{}).length>0;
/** Q1-04: failed → failed (excluded until the round advances); paused / conflict → in_progress; a final outcome is completed
 *  only once the unit state is clear — an insert whose clear CAS lost stays in_progress so the next run recovers it. */
async function roundOutcomeOf(db:JudgmentsDb,job:string,outcome:UnitOutcome):Promise<RoundOutcome>{
 if(outcome==='failed')return 'failed';
 if(outcome==='paused'||outcome==='conflict')return 'in_progress';
 return await hasGeneration(db,job)?'in_progress':'completed';
}
/** Records `job`'s outcome in the round (optimistic, 3 tries); false when another run moved the round on or kept winning. */
async function markRound(db:JudgmentsDb,round:number,job:string,outcome:RoundOutcome):Promise<boolean>{
 for(let i=0;i<3;i++){
  const cur=await readRound(db);
  if(cur.state.round!==round)return false;
  if(cur.state.outcomes[job]===outcome)return true;
  if((await db.setJobState(ROUND_JOB,cur.updatedAt,{round,outcomes:{...cur.state.outcomes,[job]:outcome}})).ok)return true;
 }
 return false;
}

interface Planned{job:string;row:MethodologyRow|null;unit:Unit|null;ref:{id:string;version:string}}
/**
 * The run's work list (plan audit P2-02, Q1-04): every unit with an unfinished generation that has not FAILED this round
 * first (registry order), then the units without an unfinished generation whose round outcome is absent or in_progress.
 * A unit failed this round is excluded until the round advances. When every unit is failed, or completed with no
 * unfinished generation, the next round opens (outcomes {}) and the list restarts at the registry head.
 */
async function planRound(db:JudgmentsDb,methods:CalibrateDeps['methods']):Promise<{round:number;list:Planned[]}>{
 const all:Planned[]=[];
 for(const ref of methods){
  const row=await db.methodology(ref.id,ref.version);
  if(!row){all.push({job:jobKey('calibrate',ref.id,ref.version,{scope_type:'all',scope_key:''}),row:null,unit:null,ref});continue;}
  for(const unit of unitsOf(row))all.push({job:unit.job,row,unit,ref});
 }
 const unfinished=new Set<string>();
 for(const p of all)if(p.unit&&await hasGeneration(db,p.job))unfinished.add(p.job);
 let {state,updatedAt}=await readRound(db);
 const resumable=(s:RoundState)=>all.filter(p=>unfinished.has(p.job)&&s.outcomes[p.job]!=='failed');
 const open=(s:RoundState)=>all.filter(p=>!unfinished.has(p.job)&&(s.outcomes[p.job]===undefined||s.outcomes[p.job]==='in_progress'));
 const finished=(s:RoundState)=>all.every(p=>s.outcomes[p.job]==='failed'||(s.outcomes[p.job]==='completed'&&!unfinished.has(p.job)));
 if(finished(state)){
  const next:RoundState={round:state.round+1,outcomes:{}};
  if((await db.setJobState(ROUND_JOB,updatedAt,next as unknown as Record<string,unknown>)).ok)state=next;else({state,updatedAt}=await readRound(db));
 }
 return {round:state.round,list:[...resumable(state),...open(state)]};
}

export async function runCalibrate(deps:CalibrateDeps):Promise<CalibrateReceipt>{
 const now=deps.now??(()=>new Date());
 const outOfBudget=()=>deps.deadline!==null&&deps.deadline.getTime()-now().getTime()<RESERVE_MS;
 await deps.db.repairStaleBatches(CALIBRATE_DATASET,STALE_BATCH_SECONDS);
 const {batchId}=await startBatch(deps.tables,{producer:'ts-judgments',dataset:CALIBRATE_DATASET,codeVersion:deps.codeVersion,triggeredBy:deps.triggeredBy??'script'});
 const ctx:StepContext={db:deps.db,tables:deps.tables,store:deps.store,codeVersion:deps.codeVersion,batchId,uuid:deps.uuid??randomUUID,pageSize:deps.pageSize??PAGE_SIZE};
 // Task 5: deferred is optional and absent from emptyCounts(); judgment-layer receipts always carry it.
 const counts:Required<BatchCounts>={...emptyCounts(),deferred:0};const errors:BatchError[]=[];const units:UnitReceipt[]=[];
 let status:BatchStatus='failed';
 try{
  const {round,list}=await planRound(deps.db,deps.methods);
  const finished=async(job:string,outcome:UnitOutcome)=>{if(!(await markRound(deps.db,round,job,await roundOutcomeOf(deps.db,job,outcome))))errors.push({code:'job_state_conflict',key:ROUND_JOB});};
  for(const p of list){
   if(!p.row||!p.unit){
    units.push({job:p.job,methodology_id:p.ref.id,version:p.ref.version,scope:{scope_type:'all',scope_key:''},outcome:'skipped',pages:0,code:'methodology_unsynced'});
    await finished(p.job,'skipped');continue;
   }
   const unit=p.unit,row=p.row;
   const base={job:unit.job,methodology_id:row.methodology_id,version:row.version,scope:unit.scope};
   if(outOfBudget()){counts.deferred++;errors.push({code:'deadline_hit',key:unit.job});units.push({...base,outcome:'paused',pages:0});continue;}
   counts.fetched++;
   let outcome:UnitOutcome;
   try{
    const r=await runUnit(ctx,unit,outOfBudget);
    errors.push(...r.infos);
    if(r.outcome==='inserted')counts.inserted++;
    else if(r.outcome==='duplicate')counts.duplicates++;
    else counts.deferred++;
    outcome=r.outcome;
    units.push({...base,outcome:r.outcome,pages:r.pages,...(r.calibration_id?{calibration_id:r.calibration_id}:{})});
   }catch(e){
    outcome='failed';
    counts.failed++;errors.push({code:codeOf(e),key:unit.job,message:messageOf(e)});units.push({...base,outcome:'failed',pages:0,code:codeOf(e)});
   }
   await finished(unit.job,outcome);
  }
 }catch(e){
  errors.push({code:codeOf(e),message:messageOf(e)});
  throw e;
 }finally{
  status=await finishBatch(deps.tables,batchId,{counts,errors});
  await recordAttempt(deps.tables,CALIBRATE_DATASET,{ok:status==='success'||status==='partial',cadence:'event',detail:{batch_id:batchId,units:units.length}});
 }
 return {batchId,status,counts,errors,units};
}

export interface UnitPreview{job:string;methodology_id:string;version:string;scope:CalibrationScope;state:'idle'|'paging'|'finalizing'|'invalid';generation:string|null;pages:number;expected_revision:number|null;current_revision:number;stale:boolean}
/** ?preview=1: reads unit states and validity revisions only; writes nothing (no batch). */
export async function previewCalibrate(deps:Pick<CalibrateDeps,'db'|'methods'>):Promise<UnitPreview[]>{
 const out:UnitPreview[]=[];
 for(const ref of deps.methods){
  const row=await deps.db.methodology(ref.id,ref.version);
  if(!row)continue;
  const {revision}=await deps.db.calibrationValidity(row.methodology_id,row.version);
  for(const unit of unitsOf(row)){
   const st=(await deps.db.jobState(unit.job))?.state??{};
   const base={job:unit.job,methodology_id:row.methodology_id,version:row.version,scope:unit.scope,current_revision:Number(revision)};
   if(Object.keys(st).length===0)out.push({...base,state:'idle',generation:null,pages:0,expected_revision:null,stale:false});
   else if(!isUnitState(st))out.push({...base,state:'invalid',generation:null,pages:0,expected_revision:null,stale:false});
   else out.push({...base,state:st.done?'finalizing':'paging',generation:st.generation,pages:st.manifest.length,expected_revision:st.expected_revision,stale:st.expected_revision!==Number(revision)});
  }
 }
 return out;
}
