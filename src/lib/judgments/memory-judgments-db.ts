// src/lib/judgments/memory-judgments-db.ts
// In-memory JudgmentsDb for unit tests (spec §5.7, §14.1). It reproduces the migration so judgment-
// layer unit tests see what the database does: the triggers (append-only rows — nothing here
// mutates a judgment, settlement, event or calibration; the methodology row changes only through
// syncMethodology; settlement seq = 1 + max with the transition table, admin-only transitions by
// actor), the table constraints a caller can hit (thrown as JudgmentError('unknown', <constraint
// name>)), every §5.6 RPC — sync events and formula_hash_drift; register_judgment validations, settle
// window recompute (time.ts settleWindowOf on the methodology's params/horizon), retrospective,
// queue insert, duplicate id → duplicate_key; claim order and fresh lease tokens; release fencing
// and the next_attempt_at clamp; append_settlement in the R06 order (request_key first, then queue,
// already_final for cron/script on a closed queue, lease, transition, validity +1 on
// withdrawn/reopened); insert_calibration's revision check; set_job_state's optimistic lock with a
// strictly increasing millisecond updated_at; repair_stale_batches, quarantine_settlement (lease-checked item
// upsert + queue publish, Q1-02), apply_quarantine_override (statuses, lease revocation) and
// reject_quarantined_settlement (expected evidence identity, Q1-03) on the shared TableClient; the frozen calibration
// cohorts (claim marker / freeze / members / clear, Q1-05) — and the RLS publishable gate on the public reads (latestCards,
// historyOf, envelopeById, calibrationCohort, latestCalibration; listMethodologies and methodologyStateAt are open
// like their tables). Replays compare digest + judgment id: the digest is computed from the same
// nine fields the SQL rebuilds, so digest equality is payload equality here. Operations run one at a
// time (a promise chain), like row locks; the clock is injectable (setNow).
// ingest_batches / dq_quarantine / research_audit_log live in the TableClient passed in (default: a
// fresh memoryTableClient) so plan-1 startBatch / quarantine() and this db share rows.
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {TableClient} from '../db/table-client';
import {canonicalize,jsonClean} from './canonical';
import {isRetrospective} from './contract';
import {ADMIN_ACTOR,COHORT_PAGE_MAX,CLAIM_LIMIT_MAX,HISTORY_LIMIT_MAX,PUBLIC_INPUT_KIND_SET,QUEUE_LIST_MAX,SETTLEMENT_ACTOR,assertLimit,bySettlementOrder,calibrationIsValid,isAutomaticActor,isoTs,subjectStatus,transitionAllowed} from './db';
import {JudgmentError} from './errors';
import type {JudgmentErrorCode} from './errors';
import {operationDigest} from './settlement-digest';
import {settleWindowOf} from './time';
import {PUBLIC_SUBJECT_TYPES} from './types';
import type {AppendStatus,CalibrationRow,CardView,Envelope,JudgmentRow,JudgmentsDb,MethodologyEvent,MethodologyEventKind,MethodologyRow,MethodologyStatus,QueueRow,SettlementInsert,SettlementRow} from './types';

type Validity={methodology_id:string;version:string;revision:number;bumped_at:string;reason:string|null};
type Job={state:Record<string,unknown>;updated_at:string};
export interface MemoryJudgmentsSnapshot{methodologies:MethodologyRow[];events:MethodologyEvent[];judgments:JudgmentRow[];settlements:SettlementRow[];queue:QueueRow[];calibrations:CalibrationRow[];validity:Validity[];jobs:({job:string}&Job)[]}
export interface MemoryJudgmentsDb extends JudgmentsDb{
 tables:TableClient;
 /** Fixes "now" (registered_at, due-ness, leases, timestamps); null returns to the wall clock. */
 setNow(iso:string|null):void;
 addIssuer(id:string,status?:'active'|'merged'|'dissolved',mergedInto?:string|null):void;
 addIndustry(scheme:string,version:string,code:string):void;
 /** Ends a lease now without clearing its token (a worker that stalled past leased_until). */
 expireLease(judgmentId:string):void;
 snapshot():MemoryJudgmentsSnapshot;
}

const HEX64=/^[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const QUEUE_STATUSES:readonly string[]=['pending','unavailable','inconsistent','error'];
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const ms=(iso:string)=>Date.parse(iso);
const clone=<T>(v:T):T=>structuredClone(v);
const same=(a:unknown,b:unknown)=>canonicalize(jsonClean(a??null))===canonicalize(jsonClean(b??null));
function fail(code:JudgmentErrorCode,message?:string):never{throw new JudgmentError(code,message);}
const isObj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** last_detail without the open-incident sub-object (plan audit R3-01). */
const withoutIncident=(d:Record<string,unknown>)=>Object.fromEntries(Object.entries(d).filter(([k])=>k!=='incident'));
const mk=(id:string,version:string)=>`${id}@${version}`;
/** SQL: a lease is live only while leased_until > clock_timestamp() (review fix 78014c50: an expired lease is lost even with the matching token). */
const leaseLive=(q:QueueRow,t:number)=>q.lease_token!==null&&q.leased_until!==null&&ms(q.leased_until)>t;
const cardOrder=(a:JudgmentRow,b:JudgmentRow)=>cmp(b.as_of,a.as_of)||ms(b.registered_at)-ms(a.registered_at)||cmp(a.judgment_id,b.judgment_id);
const historyOrder=(a:JudgmentRow,b:JudgmentRow)=>cmp(b.as_of,a.as_of)||ms(b.registered_at)-ms(a.registered_at)||cmp(b.judgment_id,a.judgment_id);
const immutableOf=(r:Omit<MethodologyRow,'created_at'|'synced_at'>)=>({methodology_id:r.methodology_id,version:r.version,judgment_type:r.judgment_type,kind:r.kind,producer_kind:r.producer_kind,subject_types:r.subject_types,input_kinds:r.input_kinds,markets:r.markets??null,
 title_zh:r.title_zh,title_en:r.title_en,doc_path:r.doc_path,doc_sha256:r.doc_sha256,implementation_sha256:r.implementation_sha256,params:r.params,params_json:r.params_json,horizon:r.horizon,upstream:r.upstream,deps_sha256:r.deps_sha256,formula_hash:r.formula_hash});
function checkMethodology(r:Omit<MethodologyRow,'created_at'|'synced_at'>):void{
 if(!/^[a-z][a-z0-9_]{1,63}$/.test(r.methodology_id))fail('unknown','judgment_methodologies_methodology_id_check');
 if(!/^v[1-9][0-9]{0,3}$/.test(r.version))fail('unknown','judgment_methodologies_version_check');
 for(const k of ['doc_sha256','implementation_sha256','deps_sha256','formula_hash'] as const)if(!HEX64.test(r[k]))fail('unknown',`judgment_methodologies_${k}_check`);
 if(!['probability','categorical','score','interval'].includes(r.kind))fail('unknown','judgment_methodologies_kind_check');
 if(!['rule','model','human','third_party'].includes(r.producer_kind))fail('unknown','judgment_methodologies_producer_kind_check');
 if(!['draft','active','retired'].includes(r.status))fail('unknown','judgment_methodologies_status_check');
 if(!isObj(r.horizon))fail('unknown','judgment_methodologies_horizon_check');
}

export function memoryJudgmentsDb(opts:{tables?:TableClient}={}):MemoryJudgmentsDb{
 const tables=opts.tables??memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],research_audit_log:['id']});
 let fixed:string|null=null;
 const now=()=>fixed??new Date().toISOString();
 const meth=new Map<string,MethodologyRow>();
 const events:MethodologyEvent[]=[];
 const judgments=new Map<string,JudgmentRow>();
 const settlements:SettlementRow[]=[];
 const queue=new Map<string,QueueRow>();
 const calibrations:CalibrationRow[]=[];
 const validity=new Map<string,Validity>();
 const jobs=new Map<string,Job>();
 /** freeze_calibration_cohort's table: generation → members sorted by judgment_id (P1-10). */
 const members=new Map<string,{judgment_id:string;settlement_id:string|null;ord:number}[]>();
 const issuers=new Map<string,{status:string;merged_into:string|null}>();
 const industries=new Set<string>();

 const publishable=(id:string,version:string)=>meth.get(mk(id,version))?.publishable===true;
 const historyOfJ=(id:string)=>settlements.filter(s=>s.judgment_id===id).sort((a,b)=>a.seq-b.seq);
 const lastEvent=(id:string,version:string,cutoff:string|null)=>events.filter(e=>e.methodology_id===id&&e.version===version&&(cutoff===null||ms(e.occurred_at)<=ms(cutoff))).sort((a,b)=>ms(b.occurred_at)-ms(a.occurred_at)||b.seq-a.seq)[0]??null;
 const assertView=(view:CardView,cutoff?:string)=>{if((view!=='latest'&&view!=='as_known')||(view==='as_known'&&!cutoff))fail('invalid_parameter','view');};
 const knownAt=(j:JudgmentRow,cutoff:string)=>ms(j.registered_at)<=ms(cutoff)&&lastEvent(j.methodology_id,j.methodology_version,cutoff)!==null;
 const envelope=(j:JudgmentRow,view:CardView,cutoff:string|null):Envelope=>{
  const c=view==='latest'?null:cutoff;
  const s=historyOfJ(j.judgment_id).filter(x=>c===null||ms(x.settled_at)<=ms(c)).at(-1)??null;
  const cal=calibrations.filter(x=>x.methodology_id===j.methodology_id&&x.methodology_version===j.methodology_version&&x.scope_type==='all'&&x.scope_key===''&&(c===null||ms(x.computed_at)<=ms(c)))
   .sort((a,b)=>ms(b.computed_at)-ms(a.computed_at)||cmp(a.calibration_id,b.calibration_id))[0]??null;
  const v=validity.get(mk(j.methodology_id,j.methodology_version));
  return clone({judgment:j,settlement:s,calibration:cal,calibration_valid:cal!==null&&calibrationIsValid(cal,v?v.revision:null,view==='latest'?now():cutoff!),methodology_state:lastEvent(j.methodology_id,j.methodology_version,c)});
 };
 const cohort=(gated:boolean)=>async(m:string,v:string,w:{from:string;to:string},cutoff:string,after:string|null,limit:number):Promise<Envelope[]>=>{
  if(!cutoff||!w.from||!w.to||w.from>w.to)fail('invalid_parameter','window');
  assertLimit(limit,COHORT_PAGE_MAX);
  if(gated&&!publishable(m,v))return [];
  return [...judgments.values()].filter(j=>j.methodology_id===m&&j.methodology_version===v&&!j.abstained&&j.as_of>=w.from&&j.as_of<=w.to&&ms(j.registered_at)<=ms(cutoff)&&(after===null||j.judgment_id>after))
   .sort((a,b)=>cmp(a.judgment_id,b.judgment_id)).slice(0,limit)
   .map(j=>clone({judgment:j,settlement:historyOfJ(j.judgment_id).filter(s=>ms(s.settled_at)<=ms(cutoff)).at(-1)??null,calibration:null,calibration_valid:false,methodology_state:null}));
 };
 const batchExists=async(id:string)=>(await tables.select('ingest_batches',{batch_id:id},{limit:1})).length===1;
 const addEvent=(r:Omit<MethodologyRow,'created_at'|'synced_at'>,seq:number,event:MethodologyEventKind,status:MethodologyStatus,pub:boolean,actor:string,reason:string|null,at:string)=>
  events.push({event_id:randomUUID(),methodology_id:r.methodology_id,version:r.version,seq,event,status,publishable:pub,formula_hash:r.formula_hash,code_version:r.code_version,actor,reason,occurred_at:at});

 /** E-04: a multi-store mutation is all-or-nothing, like the SQL function's transaction. The in-memory stores are snapshotted and put
  *  back on any thrown error; writes to the shared TableClient (no delete there) register an undo and are ordered so the one that can
  *  fail without a trace (the last insert) comes last. */
 const atomic=async<T>(f:(undo:(u:()=>Promise<void>)=>void)=>Promise<T>):Promise<T>=>{
  const snap=structuredClone({settlements,queue:[...queue],validity:[...validity],jobs:[...jobs],members:[...members]});
  const undos:(()=>Promise<void>)[]=[];
  try{return await f(u=>{undos.push(u);});}
  catch(e){
   settlements.length=0;settlements.push(...snap.settlements);
   for(const [store,entries] of [[queue,snap.queue],[validity,snap.validity],[jobs,snap.jobs],[members,snap.members]] as [Map<string,unknown>,[string,unknown][]][]){store.clear();for(const [k,v] of entries)store.set(k,v);}
   for(const u of undos.reverse())await u();
   throw e;
  }
 };
 /** The single append implementation (append_settlement / judgment_append_settlement_internal in SQL); also used by
  *  rejectQuarantinedSettlement inside its own serialised operation (plan audit P1-05). */
 const appendCore=async(judgmentId:string,leaseToken:string|null,requestKey:string,row:SettlementInsert):Promise<{seq:number;status:AppendStatus}>=>{
  if(!isObj(row)||typeof row.kind!=='string'||typeof row.actor!=='string'||typeof requestKey!=='string')fail('invalid_parameter','settlement');
  const digest=operationDigest(judgmentId,row);
  const replay=(hit:SettlementRow)=>({seq:hit.seq,status:hit.judgment_id===judgmentId&&hit.request_digest===digest?'already_applied' as const:'request_key_conflict' as const});
  const hit=settlements.find(s=>s.request_key===requestKey);
  if(hit)return replay(hit);
  const j=judgments.get(judgmentId);
  if(!j)return fail('unknown_judgment');
  const q=queue.get(judgmentId);
  if(!q)return fail('settlement_sequence',`settlement_sequence: judgment ${judgmentId} has no settle queue (abstained)`);
  const list=historyOfJ(judgmentId);const seq=list.at(-1)?.seq??0;const prev=list.at(-1)?.kind??null;
  if(q.closed_at!==null&&isAutomaticActor(row.actor))return {seq,status:'already_final'};
  if(leaseToken===null){if(!ADMIN_ACTOR.test(row.actor))fail('lease_lost');}
  else if(q.lease_token!==leaseToken||!leaseLive(q,ms(now())))fail('lease_lost');
  if(!transitionAllowed(prev,row.kind,row.actor))fail('settlement_sequence',`settlement_sequence: ${prev??'none'} -> ${row.kind} by ${row.actor}`);
  if((row.kind==='settled')!==(row.outcome!==null)||(row.kind==='settled')!==(row.realized!==null))fail('unknown','settlements_outcome_iff_settled');
  if(row.kind!=='settled'&&row.reason===null)fail('unknown','settlements_reason_unless_settled');
  if(!SETTLEMENT_ACTOR.test(row.actor))fail('unknown','judgment_settlements_actor_check');
  if(requestKey.length<8||requestKey.length>128)fail('unknown','judgment_settlements_request_key_check');
  if(!(await batchExists(row.batch_id)))fail('unknown','judgment_settlements_batch_id_fkey');
  const at=now();const id=randomUUID();
  settlements.push(jsonClean({settlement_id:id,judgment_id:judgmentId,seq:seq+1,kind:row.kind,outcome:row.outcome,realized:row.realized,evidence:row.evidence??{},resolver:row.resolver,resolver_version:row.resolver_version,reason:row.reason,actor:row.actor,settled_at:at,request_key:requestKey,request_digest:digest,code_version:row.code_version,batch_id:row.batch_id}) as SettlementRow);
  if(row.kind==='reopened')Object.assign(q,{closed_at:null,next_attempt_at:at,attempts:0,last_status:null,last_detail:{},override:null,leased_until:null,lease_token:null,updated_at:at});
  else Object.assign(q,{closed_at:at,last_detail:withoutIncident(q.last_detail),leased_until:null,lease_token:null,updated_at:at});   // R3-01: a final settlement ends the incident
  if(row.kind==='withdrawn'||row.kind==='reopened'){
   const v=validity.get(mk(j.methodology_id,j.methodology_version));
   if(v)Object.assign(v,{revision:v.revision+1,bumped_at:at,reason:`${row.kind}:${id}`});
  }
  return {seq:seq+1,status:'applied'};
 };
 const impl:JudgmentsDb={
  async serverTime(){return now();},
  async methodology(id,version){const r=meth.get(mk(id,version));return r?clone(r):null;},
  subjectExists:subject=>subjectStatus(subject,{
   async issuerStatus(id){return issuers.get(id)?.status??null;},
   async industryExists(scheme,version,code){return industries.has(`${scheme}:${version}:${code}`);},
  }),
  async getJudgment(id){const j=judgments.get(id);return j?clone(j):null;},
  async judgmentsBySnapshot(snapshotId){
   return [...judgments.values()].filter(j=>j.inputs.some(i=>i.kind==='macro_snapshot'&&(i.ref as {snapshot_id?:string}).snapshot_id===snapshotId)).map(j=>j.judgment_id).sort();
  },
  async registerJudgment(row,q){
   const m=meth.get(mk(row.methodology_id,row.methodology_version));
   if(!m||m.status!=='active')return fail('methodology_unavailable',`${row.methodology_id}@${row.methodology_version} ${m?.status??'missing'}`);
   if(m.producer_kind!=='rule'&&m.producer_kind!=='model')fail('methodology_unavailable',`producer_kind ${m.producer_kind} is not public`);
   if(!(PUBLIC_SUBJECT_TYPES as readonly string[]).includes(row.subject_type))fail('subject_type_not_public',String(row.subject_type));
   if(row.judgment_type!==m.judgment_type||row.kind!==m.kind||row.producer_kind!==m.producer_kind||!m.subject_types.includes(row.subject_type))fail('methodology_mismatch','judgment_type/kind/producer_kind/subject_type');
   if(!Array.isArray(row.inputs)||row.inputs.some(i=>!m.input_kinds.includes(i.kind)||!PUBLIC_INPUT_KIND_SET.has(i.kind)))fail('input_not_allowed');
   if(row.abstained){if(q!==null)fail('settle_window_mismatch','abstained judgments have no queue row');}
   else{
    if(!same(row.horizon,m.horizon))fail('methodology_mismatch','horizon');
    let w:{settle_after:string;settle_by:string}|null=null;
    try{w=row.target?settleWindowOf(row.target,m.horizon,m.params):null;}catch{w=null;}
    const eq=(a:string|null|undefined,b:string)=>typeof a==='string'&&ms(a)===ms(b);
    if(!w||!q||!eq(row.settle_after,w.settle_after)||!eq(row.settle_by,w.settle_by)||!eq(q.settle_after,w.settle_after)||!eq(q.settle_by,w.settle_by)||q.label_policy!==row.label_policy)fail('settle_window_mismatch');
   }
   const shapeOk=row.abstained
    ?row.claim===null&&row.condition===null&&row.horizon===null&&row.target===null&&row.label_policy===null&&row.settle_after===null&&row.settle_by===null&&row.abstain_reason!==null
    :row.claim!==null&&row.condition!==null&&row.horizon!==null&&row.target!==null&&row.label_policy!==null&&row.settle_after!==null&&row.settle_by!==null&&row.abstain_reason===null;
   if(!shapeOk)fail('unknown','judgments_active_shape');
   if(!row.abstained&&row.inputs.length===0)fail('unknown','judgments_active_has_inputs');
   if(typeof row.subject_key!=='string'||row.subject_key.length<1||row.subject_key.length>128)fail('unknown','judgments_subject_key_check');
   if(!HEX64.test(row.inputs_hash))fail('unknown','judgments_inputs_hash_check');
   if(typeof row.code_version!=='string'||row.code_version.length<7||row.code_version.length>64)fail('unknown','judgments_code_version_check');
   if(!(await batchExists(row.batch_id)))fail('unknown','judgments_batch_id_fkey');
   if(judgments.has(row.judgment_id))fail('duplicate_key','duplicate key value violates unique constraint "judgments_pkey"');
   const at=now();
   const retrospective=isRetrospective({as_of:row.as_of,registered_at:at,settle_after:row.abstained?null:row.settle_after,label_available_at:row.retrospective_hint?.label_available_at??null});
   const {retrospective_hint:_hint,...rest}=row;
   judgments.set(row.judgment_id,jsonClean({...rest,settle_after:row.settle_after===null?null:isoTs(row.settle_after),settle_by:row.settle_by===null?null:isoTs(row.settle_by),registered_at:at,retrospective,created_at:at}) as JudgmentRow);
   if(!row.abstained)queue.set(row.judgment_id,{judgment_id:row.judgment_id,settle_after:isoTs(row.settle_after),settle_by:isoTs(row.settle_by),label_policy:row.label_policy!,next_attempt_at:isoTs(row.settle_after),attempts:0,last_status:null,last_detail:{},leased_until:null,lease_token:null,override:null,closed_at:null,updated_at:at});
   return {registered_at:at,retrospective};
  },
  async latestCards(subject,o){
   assertView(o.view,o.cutoff);
   const keys=new Set([subject.key]);
   if(subject.type==='issuer'){
    let frontier=[subject.key];
    for(let depth=0;depth<8&&frontier.length>0;depth++){
     const next:string[]=[];
     for(const [id,i] of issuers)if(i.merged_into!==null&&frontier.includes(i.merged_into)&&!keys.has(id)){keys.add(id);next.push(id);}
     frontier=next;
    }
   }
   const best=new Map<string,JudgmentRow>();
   for(const j of [...judgments.values()].filter(x=>x.subject_type===subject.type&&keys.has(x.subject_key)&&(o.types===undefined||o.types.includes(x.judgment_type))&&publishable(x.methodology_id,x.methodology_version)&&(o.view==='latest'||knownAt(x,o.cutoff!))).sort(cardOrder)){
    const k=`${j.judgment_type}|${j.methodology_id}|${j.methodology_version}`;
    if(!best.has(k))best.set(k,j);
   }
   return [...best.values()].sort(cardOrder).map(j=>envelope(j,o.view,o.cutoff??null));
  },
  async historyOf(subject,type,m,o){
   assertView(o.view,o.cutoff);assertLimit(o.limit,HISTORY_LIMIT_MAX);
   let b:JudgmentRow|undefined;
   if(o.before!==undefined){b=judgments.get(o.before);if(!b||!publishable(b.methodology_id,b.methodology_version))fail('unknown_judgment');}
   return [...judgments.values()].filter(j=>j.subject_type===subject.type&&j.subject_key===subject.key&&j.judgment_type===type&&j.methodology_id===m.id&&j.methodology_version===m.version
    &&publishable(m.id,m.version)&&(o.view==='latest'||knownAt(j,o.cutoff!))&&(b===undefined||historyOrder(j,b)>0)).sort(historyOrder).slice(0,o.limit).map(j=>envelope(j,o.view,o.cutoff??null));
  },
  async claimDue(limit,leaseSeconds){
   assertLimit(limit,CLAIM_LIMIT_MAX);
   if(!Number.isInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600)fail('invalid_parameter','lease_seconds');
   const at=now();const t=ms(at);
   const due=[...queue.values()].filter(q=>q.closed_at===null&&ms(q.next_attempt_at)<=t&&(q.leased_until===null||ms(q.leased_until)<t))
    .sort((a,b)=>ms(a.next_attempt_at)-ms(b.next_attempt_at)||cmp(a.judgment_id,b.judgment_id)).slice(0,limit);
   for(const q of due){q.leased_until=new Date(t+leaseSeconds*1000).toISOString();q.lease_token=randomUUID();q.updated_at=at;}
   return clone(due);
  },
  async claimOne(judgmentId,leaseSeconds){
   if(!Number.isInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600)fail('invalid_parameter','lease_seconds');
   const q=queue.get(judgmentId);
   if(!q||q.closed_at!==null)return {status:'closed'};
   const at=now();const t=ms(at);
   if(leaseLive(q,t))return {status:'leased'};
   Object.assign(q,{leased_until:new Date(t+leaseSeconds*1000).toISOString(),lease_token:randomUUID(),updated_at:at});
   return {status:'claimed',lease_token:q.lease_token!,row:clone(q)};
  },
  async releaseLease(judgmentId,leaseToken,patch){
   if(!isObj(patch)||!QUEUE_STATUSES.includes(patch.last_status)||!isObj(patch.last_detail)||typeof patch.next_attempt_at!=='string'||!Number.isFinite(ms(patch.next_attempt_at))||(patch.attempts_increment!==0&&patch.attempts_increment!==1))fail('invalid_parameter','patch');
   const q=queue.get(judgmentId);
   if(!q||q.lease_token!==leaseToken||!leaseLive(q,ms(now())))fail('lease_lost');
   const at=now();
   // R3-01: the locked row's open incident is carried over unchanged; a patch incident is dropped (= SQL release_lease).
   const carried=isObj(q!.last_detail.incident)?{incident:clone(q!.last_detail.incident)}:{};
   Object.assign(q!,{last_status:patch.last_status,last_detail:{...withoutIncident(clone(patch.last_detail)),...carried},next_attempt_at:new Date(Math.max(ms(patch.next_attempt_at),ms(at))).toISOString(),attempts:q!.attempts+patch.attempts_increment,leased_until:null,lease_token:null,updated_at:at});
  },
  async queueRow(id){const q=queue.get(id);return q?clone(q):null;},
  async queueList(o){
   if(!['due','backoff','leased','all'].includes(o.filter))fail('invalid_parameter',`filter:${String(o.filter)}`);
   assertLimit(o.limit,QUEUE_LIST_MAX);
   const t=ms(now());const free=(q:QueueRow)=>q.leased_until===null||ms(q.leased_until)<t;
   const keep=(q:QueueRow)=>o.filter==='due'?q.closed_at===null&&ms(q.next_attempt_at)<=t&&free(q)
    :o.filter==='backoff'?q.closed_at===null&&ms(q.next_attempt_at)>t&&free(q)
    :o.filter==='leased'?q.closed_at===null&&q.leased_until!==null&&ms(q.leased_until)>=t:true;
   return clone([...queue.values()].filter(q=>keep(q)&&(o.after===undefined||q.judgment_id>o.after)).sort((a,b)=>cmp(a.judgment_id,b.judgment_id)).slice(0,o.limit));
  },
  async settlementsOf(ids){const want=new Set(ids);return clone(settlements.filter(s=>want.has(s.judgment_id)).sort(bySettlementOrder));},
  appendSettlement:(judgmentId,leaseToken,requestKey,row)=>appendCore(judgmentId,leaseToken,requestKey,row),
  /** quarantine_settlement (Q1-02): one serialised operation — lease check, quarantine()-style upsert of the open item
   *  (same key + reason reused, payload refreshed), queue publish with last_detail.incident (R3-01) keeping an open incident's
   *  quarantined_at whatever the last attempt status (Q1-01). */
  quarantineSettlement:(judgmentId,leaseToken,reasonCode,payload,patch,batchId)=>atomic(async undo=>{
   const d=(isObj(patch)&&isObj(patch.last_detail)?patch.last_detail:null) as Record<string,unknown>|null;
   const pi=d!==null&&isObj(d.incident)?d.incident:null;   // the incident settle.ts proposes (R3-01)
   if(!isObj(payload)||typeof payload.evidence_hash!=='string'||!HEX64.test(payload.evidence_hash)||typeof payload.cutoff!=='string'
    ||typeof reasonCode!=='string'||reasonCode===''||reasonCode.length>64||typeof batchId!=='string'||!isObj(patch)||patch.last_status!=='inconsistent'||patch.attempts_increment!==0
    ||typeof patch.next_attempt_at!=='string'||!Number.isFinite(ms(patch.next_attempt_at))||d===null||d.evidence_hash!==payload.evidence_hash||d.cutoff!==payload.cutoff
    ||pi===null||typeof pi.quarantined_at!=='string'||pi.evidence_hash!==payload.evidence_hash||pi.cutoff!==payload.cutoff)fail('invalid_parameter','quarantine_settlement');
   const q=queue.get(judgmentId);
   if(!q)return fail('unknown_judgment');
   if(q.lease_token!==leaseToken||!leaseLive(q,ms(now())))return {status:'lease_lost',quarantine_id:null};
   const at=now();
   const key={dataset:'judgments',table_name:'judgment_settlements',natural_key:judgmentId,reason_code:reasonCode};
   const [open]=await tables.select('dq_quarantine',{...key,status:'open'},{limit:1});
   let id:string;
   if(open){id=String(open.id);await tables.update('dq_quarantine',{id,status:'open'},{payload:clone(payload)});undo(async()=>{await tables.update('dq_quarantine',{id,status:'open'},{payload:open.payload});});}
   else{id=randomUUID();await tables.insert('dq_quarantine',{id,...key,detail:{},payload:clone(payload),batch_id:batchId,status:'open',resolved_by:null,resolved_at:null,created_at:at});}
   const prior=q.last_detail.incident;   // R3-01: an open incident keeps its first quarantine time, whatever the last attempt status
   const incident={quarantine_id:id,reason_code:reasonCode,evidence_hash:String(payload.evidence_hash),cutoff:String(payload.cutoff),
    quarantined_at:isObj(prior)&&typeof prior.quarantined_at==='string'?prior.quarantined_at:at};   // T-06: a NEW incident is stamped here, never the worker's earlier instant
   Object.assign(q,{last_status:'inconsistent',last_detail:{...withoutIncident(clone(d!)),incident},next_attempt_at:new Date(Math.max(ms(patch.next_attempt_at),ms(at))).toISOString(),leased_until:null,lease_token:null,updated_at:at});
   return {status:'quarantined',quarantine_id:id};
  }),
  applyQuarantineOverride:(judgmentId,override,quarantineId,audit)=>atomic(async undo=>{
   const o=override as unknown as Record<string,unknown>;
   if(!isObj(o)||!isObj(o.resolution)||typeof o.reason_code!=='string'||o.reason_code===''||typeof o.evidence_hash!=='string'||!HEX64.test(o.evidence_hash)
    ||typeof o.resolved_by!=='string'||!UUID.test(o.resolved_by)||typeof o.at!=='string'||typeof o.cutoff!=='string'||!isObj(audit))fail('invalid_parameter','override');
   const q=queue.get(judgmentId);
   if(!q)return fail('unknown_judgment');
   const [item]=await tables.select('dq_quarantine',{id:quarantineId},{limit:1});
   if(!item||item.dataset!=='judgments'||item.natural_key!==judgmentId)return 'item_not_open';
   if(item.status!=='open')return item.status==='resolved_accept'&&same(q.override,override)?'applied':'item_not_open';
   if(q.closed_at!==null)return 'closed';
   const payload=(isObj(item.payload)?item.payload:{}) as Record<string,unknown>;
   const inc=q.last_detail.incident;   // R3-01: the open incident decides, not last_status
   if(item.table_name!=='judgment_settlements'||!isObj(inc)||inc.quarantine_id!==quarantineId||inc.evidence_hash!==override.evidence_hash||inc.cutoff!==override.cutoff||payload.evidence_hash!==override.evidence_hash||payload.cutoff!==override.cutoff)return 'stale';
   const at=now();
   await tables.update('dq_quarantine',{id:quarantineId,status:'open'},{status:'resolved_accept',resolved_by:override.resolved_by,resolved_at:at,detail:{...(item.detail as Record<string,unknown>??{}),override}});
   undo(async()=>{await tables.update('dq_quarantine',{id:quarantineId,status:'resolved_accept'},{status:'open',resolved_by:item.resolved_by??null,resolved_at:item.resolved_at??null,detail:item.detail});});
   await tables.insert('research_audit_log',{id:randomUUID(),user_id:override.resolved_by,actor:'user',action:'dq.quarantine_resolve',object_type:'dq',object_id:quarantineId,detail:{...audit,judgment_id:judgmentId,override},created_at:at});   // last write: its failure leaves no trace
   Object.assign(q,{override:clone(override),next_attempt_at:at,leased_until:null,lease_token:null,updated_at:at});   // the lease is revoked (P1-04)
   return 'applied';
  }),
  rejectQuarantinedSettlement:(judgmentId,quarantineId,expected,requestKey,row,audit)=>atomic(async undo=>{
   if(!isObj(row)||row.kind!=='void'||typeof row.actor!=='string'||!/^admin:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.actor)||typeof requestKey!=='string'||!isObj(audit)
    ||!isObj(expected)||typeof expected.evidence_hash!=='string'||!HEX64.test(expected.evidence_hash)||typeof expected.cutoff!=='string')fail('invalid_parameter','rejection');
   const digest=operationDigest(judgmentId,row);
   const hit=settlements.find(s=>s.request_key===requestKey);
   if(hit)return {seq:hit.seq,status:hit.judgment_id===judgmentId&&hit.request_digest===digest?'already_applied':'request_key_conflict'};
   const q=queue.get(judgmentId);
   if(!q)return fail('unknown_judgment');
   const [item]=await tables.select('dq_quarantine',{id:quarantineId},{limit:1});
   const seq=historyOfJ(judgmentId).at(-1)?.seq??0;
   if(!item||item.dataset!=='judgments'||item.natural_key!==judgmentId||item.status!=='open')return {seq,status:'item_not_open'};
   const payload=(isObj(item.payload)?item.payload:{}) as Record<string,unknown>;
   // Q1-03: the identity the hook read must still be the locked queue's AND the locked item's.
   const inc=q.last_detail.incident;   // R3-01: the open incident decides, not last_status
   if(q.closed_at!==null||item.table_name!=='judgment_settlements'||!isObj(inc)||inc.quarantine_id!==quarantineId||inc.evidence_hash!==expected.evidence_hash||inc.cutoff!==expected.cutoff
    ||payload.evidence_hash!==expected.evidence_hash||payload.cutoff!==expected.cutoff)return {seq,status:'stale'};
   const res=await appendCore(judgmentId,null,requestKey,row);
   if(res.status!=='applied')return res;
   const at=now();const by=row.actor.slice('admin:'.length);
   await tables.update('dq_quarantine',{id:quarantineId,status:'open'},{status:'resolved_reject',resolved_by:by,resolved_at:at,detail:{...(item.detail as Record<string,unknown>??{}),rejected_settlement_seq:res.seq}});
   undo(async()=>{await tables.update('dq_quarantine',{id:quarantineId,status:'resolved_reject'},{status:'open',resolved_by:item.resolved_by??null,resolved_at:item.resolved_at??null,detail:item.detail});});
   await tables.insert('research_audit_log',{id:randomUUID(),user_id:by,actor:'user',action:'dq.quarantine_resolve',object_type:'dq',object_id:quarantineId,detail:{...audit,judgment_id:judgmentId,decision:'reject',seq:res.seq},created_at:at});
   return res;
  }),
  async envelopeById(id,o){
   assertView(o.view,o.cutoff);
   const j=judgments.get(id);
   if(!j||!publishable(j.methodology_id,j.methodology_version)||(o.view==='as_known'&&!knownAt(j,o.cutoff!)))return null;
   return envelope(j,o.view,o.cutoff??null);
  },
  async freezeCalibrationCohort(generation,m,v,w){
   if(typeof generation!=='string'||!UUID.test(generation)||!w.from||!w.to||w.from>w.to)fail('invalid_parameter','window');
   // Q1-05: claim the generation first (marker cohort:<generation> in the job-state map, like the SQL); a claimed one — even empty — is reported, not refrozen.
   const marker=`cohort:${generation}`;const claimed=jobs.get(marker);
   if(claimed)return {status:'already_frozen',frozen_at:String(claimed.state.frozen_at),n:Number(claimed.state.n??0)};
   const at=now();
   const list=[...judgments.values()].filter(j=>j.methodology_id===m&&j.methodology_version===v&&!j.abstained&&j.as_of>=w.from&&j.as_of<=w.to&&ms(j.registered_at)<=ms(at))   // frozen_at bounds registrations and settlements
    .sort((a,b)=>cmp(a.judgment_id,b.judgment_id)).map((j,i)=>({judgment_id:j.judgment_id,settlement_id:historyOfJ(j.judgment_id).filter(x=>ms(x.settled_at)<=ms(at)).at(-1)?.settlement_id??null,ord:i+1}));
   members.set(generation,list);
   jobs.set(marker,{state:{frozen_at:at,n:list.length,methodology:m,version:v,window:{from:w.from,to:w.to}},updated_at:at});
   return {status:'frozen',frozen_at:at,n:list.length};
  },
  async cohortMembers(generation,after,limit){
   if(typeof generation!=='string'||!UUID.test(generation))fail('invalid_parameter','generation');
   assertLimit(limit,COHORT_PAGE_MAX);
   return (members.get(generation)??[]).filter(x=>after===null||x.judgment_id>after).slice(0,limit)
    .map(x=>clone({judgment:judgments.get(x.judgment_id)!,settlement:x.settlement_id===null?null:settlements.find(s=>s.settlement_id===x.settlement_id)??null,calibration:null,calibration_valid:false,methodology_state:null}));
  },
  async clearCalibrationGeneration(generation){
   if(typeof generation!=='string'||!UUID.test(generation))fail('invalid_parameter','generation');
   const n=members.get(generation)?.length??0;members.delete(generation);jobs.delete(`cohort:${generation}`);return n;
  },
  calibrationCohort:cohort(true),
  calibrationCohortInternal:cohort(false),
  async latestCalibration(m,v,scope){
   if(!publishable(m,v))return null;
   const row=calibrations.filter(c=>c.methodology_id===m&&c.methodology_version===v&&c.scope_type===scope.scope_type&&c.scope_key===scope.scope_key).sort((a,b)=>ms(b.computed_at)-ms(a.computed_at)||cmp(a.calibration_id,b.calibration_id))[0];
   if(!row)return null;
   const x=validity.get(mk(m,v));
   return {row:clone(row),valid:calibrationIsValid(row,x?x.revision:null,now())};
  },
  async calibrationValidity(m,v){const x=validity.get(mk(m,v));if(!x)return fail('unknown_methodology',`${m}@${v}`);return {revision:x.revision};},
  async insertCalibration(row,expectedRevision){
   const v=validity.get(mk(row.methodology_id,row.methodology_version));
   if(!v)return fail('unknown_methodology',`${row.methodology_id}@${row.methodology_version}`);
   if(row.validity_revision!==expectedRevision||expectedRevision!==v.revision)return 'stale_revision';
   if(calibrations.some(c=>c.fingerprint===row.fingerprint))return 'duplicate';
   if(calibrations.some(c=>c.calibration_id===row.calibration_id))fail('duplicate_key','duplicate key value violates unique constraint "judgment_calibrations_pkey"');
   const okState=row.kind==='score'?['insufficient','evaluated'].includes(row.state):['insufficient','failed','calibrated'].includes(row.state);
   if(!okState)fail('unknown','judgment_calibrations_state_by_kind');
   if(!(await batchExists(row.batch_id)))fail('unknown','judgment_calibrations_batch_id_fkey');
   calibrations.push(jsonClean(clone(row)));
   return 'inserted';
  },
  async syncMethodology(row,actor,reason){
   if(!/^(script|admin:[0-9a-f-]{36})$/.test(actor))fail('unknown','judgment_methodology_events_actor_check');
   checkMethodology(row);
   const k=mk(row.methodology_id,row.version);const old=meth.get(k);const at=now();const pub=row.publishable??false;
   if(!old){
    meth.set(k,jsonClean(clone({...row,markets:row.markets??null,publishable:pub,created_at:at,synced_at:at})));
    if(!validity.has(k))validity.set(k,{methodology_id:row.methodology_id,version:row.version,revision:1,bumped_at:at,reason:'initial'});
    addEvent(row,1,'registered',row.status,pub,actor,reason,at);
    return {changed:true,seq:1};
   }
   if(!same(immutableOf(row),immutableOf(old)))fail('formula_hash_drift',`formula_hash_drift: ${row.methodology_id}@${row.version} stored ${old.formula_hash}`);
   let seq=Math.max(0,...events.filter(e=>e.methodology_id===row.methodology_id&&e.version===row.version).map(e=>e.seq));let changed=false;
   if(row.status!==old.status){addEvent(row,++seq,'status_changed',row.status,old.publishable,actor,reason,at);changed=true;}
   if(pub!==old.publishable){addEvent(row,++seq,'publishable_changed',row.status,pub,actor,reason,at);changed=true;}
   if(!changed)addEvent(row,++seq,'resynced',row.status,pub,actor,reason,at);
   meth.set(k,{...old,status:row.status,publishable:pub,code_version:row.code_version,synced_at:at});
   return {changed,seq};
  },
  async listMethodologies(status){return clone([...meth.values()].filter(r=>status===undefined||r.status===status).sort((a,b)=>cmp(a.methodology_id,b.methodology_id)||cmp(a.version,b.version)));},
  async methodologyStateAt(id,version,cutoff){const e=lastEvent(id,version,cutoff);return e?clone(e):null;},
  async jobState(job){const r=jobs.get(job);return r?clone({state:r.state,updated_at:r.updated_at}):null;},
  async setJobState(job,expectedUpdatedAt,state){
   if(!isObj(state))fail('invalid_parameter','job_state');
   if(typeof job!=='string'||job.length<1||job.length>512)fail('unknown','judgment_job_state_job_check');
   const t=ms(now());const r=jobs.get(job);
   if(expectedUpdatedAt===null){if(r)return {ok:false,updated_at:null};const at=new Date(t).toISOString();jobs.set(job,{state:clone(state),updated_at:at});return {ok:true,updated_at:at};}
   if(!r||ms(r.updated_at)!==ms(expectedUpdatedAt))return {ok:false,updated_at:null};
   const at=new Date(Math.max(t,ms(r.updated_at)+1)).toISOString();
   jobs.set(job,{state:clone(state),updated_at:at});
   return {ok:true,updated_at:at};
  },
  async repairStaleBatches(dataset,olderThanSeconds){
   if(typeof dataset!=='string'||!/^judgments\.[a-z0-9_.]{1,54}$/.test(dataset)||!Number.isFinite(olderThanSeconds)||olderThanSeconds<60)fail('invalid_parameter','repair_stale_batches');
   const t=ms(now());let n=0;
   for(const b of await tables.select('ingest_batches',{dataset,status:'running'})){
    const started=ms(String(b.started_at));
    if(!(started<t-olderThanSeconds*1000))continue;
    const errors=Array.isArray(b.errors)?b.errors:[];
    n+=await tables.update('ingest_batches',{batch_id:b.batch_id,status:'running'},{status:'failed',finished_at:new Date(Math.max(t,started)).toISOString(),
     errors:[...errors,{code:'stale_running',message:`running since ${String(b.started_at)}, repaired after ${olderThanSeconds} seconds`}]});
   }
   return n;
  },
 };

 let chain:Promise<unknown>=Promise.resolve();
 const serial=<T>(f:()=>Promise<T>):Promise<T>=>{const p=chain.then(f,f);chain=p.then(()=>undefined,()=>undefined);return p;};
 const wrapped=Object.fromEntries(Object.entries(impl).map(([k,f])=>[k,(...a:unknown[])=>serial(()=>(f as (...x:unknown[])=>Promise<unknown>)(...a))])) as unknown as JudgmentsDb;
 return {
  ...wrapped,
  tables,
  setNow(iso){fixed=iso===null?null:isoTs(iso);},
  addIssuer(id,status='active',mergedInto=null){issuers.set(id,{status,merged_into:mergedInto});},
  addIndustry(scheme,version,code){industries.add(`${scheme}:${version}:${code}`);},
  expireLease(judgmentId){const q=queue.get(judgmentId);if(q&&q.leased_until!==null)q.leased_until=new Date(ms(now())-1).toISOString();},
  snapshot(){return clone({methodologies:[...meth.values()],events,judgments:[...judgments.values()],settlements,queue:[...queue.values()],calibrations,validity:[...validity.values()],jobs:[...jobs.entries()].map(([job,r])=>({job,...r}))});},
 };
}
