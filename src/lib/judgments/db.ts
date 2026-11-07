// src/lib/judgments/db.ts
// JudgmentsDb (spec §5.7): the only data access of the judgment layer. supabaseJudgmentsDb takes
// two clients (plan 契约补充): `anon` for the public reads — serverTime, latestCards, historyOf,
// calibrationCohort, methodologyStateAt, listMethodologies, latestCalibration — so the RLS
// publishable gate applies exactly as on the public routes, and `admin` (service_role) for every
// other method. Writes are RPCs only (no role has direct write grants, §5.6). New RPCs are not
// registered in database.types.ts: calls go through the narrowed RpcFn. Rows are normalised here so
// the three implementations (this, memory, pg) return identical shapes: timestamps toISOString()
// (PostgREST sends microseconds and +00:00), dates 'YYYY-MM-DD', bigint/numeric → number, jsonb
// parsed, absent composites → null. SQL functions raise with the code as the message head;
// toJudgmentError maps that (55P03 → lease_lost, 23505 → duplicate_key, the rest → unknown).
// Also hosts the rules the memory twin shares with the SQL: transitionAllowed (the
// settlement_sequence trigger), subjectStatus, calibrationIsValid, limits.
import type {SupabaseClient} from '@supabase/supabase-js';
import {validateSubject} from './contract';
import {JUDGMENT_ERROR_CODES,JudgmentError} from './errors';
import type {JudgmentErrorCode} from './errors';
import {operationDigest} from './settlement-digest';
import {PUBLIC_INPUT_KINDS} from './types';
import type {AppendStatus,CalibrationRow,Envelope,JudgmentRow,JudgmentsDb,MethodologyEvent,MethodologyRow,QueueRow,SettlementInsert,SettlementKind,SettlementRow,Subject} from './types';
export type {JudgmentsDb} from './types';

export const CLAIM_LIMIT_MAX=100;
export const HISTORY_LIMIT_MAX=500;
export const COHORT_PAGE_MAX=1000;
export const QUEUE_LIST_MAX=500;
/** Page size of complete-set table reads (= PostgREST max_rows). */
export const READ_PAGE=1000;
/** ids per `.in()` filter (URL length). */
export const IN_CHUNK=200;
export const PUBLIC_INPUT_KIND_SET:ReadonlySet<string>=new Set<string>(PUBLIC_INPUT_KINDS);
export const ADMIN_ACTOR=/^admin:[0-9a-f-]{36}$/;
export const SETTLEMENT_ACTOR=/^(cron|script|admin:[0-9a-f-]{36})$/;
export const isAutomaticActor=(actor:string)=>actor==='cron'||actor==='script';

/** The transition table of the settlement_sequence trigger (spec §5.3); admin = actor 'admin:…'. */
export function transitionAllowed(prev:SettlementKind|null,next:SettlementKind,actor:string):boolean{
 const admin=actor.startsWith('admin:');
 if(prev===null)return next==='settled'||next==='void';
 if(prev==='void')return next==='reopened'&&admin;
 if(prev==='reopened')return next==='settled'||next==='void';
 if(prev==='settled')return next==='withdrawn'&&admin;
 if(prev==='withdrawn')return next==='reopened'&&admin;
 return false;
}

export interface PgErrorLike{message?:string;code?:string|null;details?:string|null;hint?:string|null}
const CODES:readonly string[]=JUDGMENT_ERROR_CODES;
/** PostgreSQL / PostgREST error (or anything thrown) → JudgmentError. */
export function toJudgmentError(e:unknown):JudgmentError{
 if(e instanceof JudgmentError)return e;
 const p=(e!==null&&typeof e==='object'?e:{}) as PgErrorLike&{detail?:string|null};
 const message=p.message??String(e);
 // E-07: the original SQLSTATE / details / hint stay available (PostgREST says `details`, node-postgres `detail`).
 const detail:Record<string,unknown>={sqlstate:p.code??null,details:p.details??p.detail??null,hint:p.hint??null};
 const head=message.split(/[\s:]/,1)[0];
 if(p.code==='55P03'||head==='lease_lost')return new JudgmentError('lease_lost',message,detail);
 if(CODES.includes(head))return new JudgmentError(head as JudgmentErrorCode,message,detail);
 if(p.code==='23505')return new JudgmentError('duplicate_key',message,detail);
 return new JudgmentError('unknown',message,detail);
}
export function assertLimit(n:number,max:number):void{
 if(!Number.isInteger(n)||n<1||n>max)throw new JudgmentError('invalid_parameter',`limit:${String(n)}`);
}

type Row=Record<string,unknown>;
export const isoTs=(v:unknown):string=>new Date(v instanceof Date?v.getTime():String(v)).toISOString();
const isoOrNull=(v:unknown):string|null=>v===null||v===undefined?null:isoTs(v);
const dateOf=(v:unknown):string=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const json=<T>(v:unknown,fallback:T):T=>(v===null||v===undefined?fallback:v) as T;
const jopt=<T>(v:unknown):T|null=>(v===null||v===undefined?null:v) as T|null;
const nullable=<T>(v:unknown):T|null=>(v===null||v===undefined?null:v) as T|null;
const strArr=(v:unknown):string[]=>json<unknown[]>(v,[]).map(String);
const present=(v:unknown,key:string):v is Row=>v!==null&&typeof v==='object'&&(v as Row)[key]!==null&&(v as Row)[key]!==undefined;
type M=MethodologyRow;type J=JudgmentRow;type S=SettlementRow;type Q=QueueRow;type C=CalibrationRow;

export function methodologyFromTable(r:Row):MethodologyRow{
 return {methodology_id:String(r.methodology_id),version:String(r.version),judgment_type:r.judgment_type as M['judgment_type'],kind:r.kind as M['kind'],producer_kind:r.producer_kind as M['producer_kind'],
  subject_types:strArr(r.subject_types) as M['subject_types'],input_kinds:strArr(r.input_kinds) as M['input_kinds'],markets:r.markets===null||r.markets===undefined?null:strArr(r.markets) as M['markets'],
  title_zh:String(r.title_zh),title_en:String(r.title_en),doc_path:String(r.doc_path),doc_sha256:String(r.doc_sha256),implementation_sha256:String(r.implementation_sha256),
  params:json<M['params']>(r.params,{}),params_json:json<M['params_json']>(r.params_json,{}),horizon:json<M['horizon']>(r.horizon,{unit:'calendar_days',n:0}),upstream:json<M['upstream']>(r.upstream,{}),
  deps_sha256:String(r.deps_sha256),formula_hash:String(r.formula_hash),status:r.status as M['status'],publishable:r.publishable===true,code_version:String(r.code_version),created_at:isoTs(r.created_at),synced_at:isoTs(r.synced_at)};
}
export function eventFromTable(r:Row):MethodologyEvent{
 return {event_id:String(r.event_id),methodology_id:String(r.methodology_id),version:String(r.version),seq:Number(r.seq),event:r.event as MethodologyEvent['event'],status:r.status as MethodologyEvent['status'],
  publishable:r.publishable===true,formula_hash:String(r.formula_hash),code_version:String(r.code_version),actor:String(r.actor),reason:nullable<string>(r.reason),occurred_at:isoTs(r.occurred_at)};
}
export function judgmentFromTable(r:Row):JudgmentRow{
 return {judgment_id:String(r.judgment_id),subject_type:r.subject_type as J['subject_type'],subject_key:String(r.subject_key),judgment_type:r.judgment_type as J['judgment_type'],
  methodology_id:String(r.methodology_id),methodology_version:String(r.methodology_version),kind:r.kind as J['kind'],producer_kind:r.producer_kind as J['producer_kind'],
  producer_ref:json<J['producer_ref']>(r.producer_ref,{}),producer_nonce:String(r.producer_nonce??''),as_of:dateOf(r.as_of),registered_at:isoTs(r.registered_at),retrospective:r.retrospective===true,
  inputs:json<J['inputs']>(r.inputs,[]),inputs_hash:String(r.inputs_hash),abstained:r.abstained===true,abstain_reason:nullable<string>(r.abstain_reason),
  claim:jopt<NonNullable<J['claim']>>(r.claim),condition:jopt<NonNullable<J['condition']>>(r.condition),horizon:jopt<NonNullable<J['horizon']>>(r.horizon),target:jopt<NonNullable<J['target']>>(r.target),
  label_policy:nullable<NonNullable<J['label_policy']>>(r.label_policy),settle_after:isoOrNull(r.settle_after),settle_by:isoOrNull(r.settle_by),code_version:String(r.code_version),batch_id:String(r.batch_id),created_at:isoTs(r.created_at)};
}
export function settlementFromTable(r:Row):SettlementRow{
 return {settlement_id:String(r.settlement_id),judgment_id:String(r.judgment_id),seq:Number(r.seq),kind:r.kind as SettlementKind,outcome:nullable<NonNullable<S['outcome']>>(r.outcome),realized:jopt<NonNullable<S['realized']>>(r.realized),
  evidence:json<S['evidence']>(r.evidence,{}),resolver:String(r.resolver),resolver_version:String(r.resolver_version),reason:nullable<string>(r.reason),actor:String(r.actor),settled_at:isoTs(r.settled_at),
  request_key:String(r.request_key),request_digest:String(r.request_digest),code_version:String(r.code_version),batch_id:String(r.batch_id)};
}
export function queueFromTable(r:Row):QueueRow{
 return {judgment_id:String(r.judgment_id),settle_after:isoTs(r.settle_after),settle_by:isoTs(r.settle_by),label_policy:r.label_policy as Q['label_policy'],next_attempt_at:isoTs(r.next_attempt_at),
  attempts:Number(r.attempts),last_status:nullable<NonNullable<Q['last_status']>>(r.last_status),last_detail:json<Q['last_detail']>(r.last_detail,{}),leased_until:isoOrNull(r.leased_until),
  lease_token:r.lease_token===null||r.lease_token===undefined?null:String(r.lease_token),override:jopt<NonNullable<Q['override']>>(r.override),closed_at:isoOrNull(r.closed_at),updated_at:isoTs(r.updated_at)};
}
export function calibrationFromTable(r:Row):CalibrationRow{
 return {calibration_id:String(r.calibration_id),methodology_id:String(r.methodology_id),methodology_version:String(r.methodology_version),scope_type:r.scope_type as C['scope_type'],scope_key:String(r.scope_key??''),
  window_from:dateOf(r.window_from),window_to:dateOf(r.window_to),n_registered:Number(r.n_registered),n_settled:Number(r.n_settled),n_independent:Number(r.n_independent),n_void:Number(r.n_void),
  n_retrospective_excluded:Number(r.n_retrospective_excluded),threshold_n:Number(r.threshold_n),ece_max:Number(r.ece_max),kind:r.kind as C['kind'],state:r.state as C['state'],
  valid_until:isoTs(r.valid_until),validity_revision:Number(r.validity_revision),metrics:json<C['metrics']>(r.metrics,{}),reliability:json<C['reliability']>(r.reliability,[]),isotonic_segments:jopt<NonNullable<C['isotonic_segments']>>(r.isotonic_segments),
  cohort_path:String(r.cohort_path),cohort_sha256:String(r.cohort_sha256),query_bounds:json<C['query_bounds']>(r.query_bounds,{window_from:'',window_to:'',registered_at_lte:'',settled_at_lte:'',frozen_at:'',n:0}),fingerprint:String(r.fingerprint),
  algorithm_version:String(r.algorithm_version),code_version:String(r.code_version),computed_at:isoTs(r.computed_at),batch_id:String(r.batch_id)};
}
/** One judgment_envelope row (PostgREST JSON or pg to_jsonb) → Envelope; an all-null composite is null. */
export function envelopeFromRpc(r:Row):Envelope{
 return {judgment:judgmentFromTable(r.judgment as Row),settlement:present(r.settlement,'settlement_id')?settlementFromTable(r.settlement):null,
  calibration:present(r.calibration,'calibration_id')?calibrationFromTable(r.calibration):null,calibration_valid:r.calibration_valid===true,
  methodology_state:present(r.methodology_state,'event_id')?eventFromTable(r.methodology_state):null};
}
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
export const byQueueOrder=(a:QueueRow,b:QueueRow)=>Date.parse(a.next_attempt_at)-Date.parse(b.next_attempt_at)||cmp(a.judgment_id,b.judgment_id);
export const bySettlementOrder=(a:SettlementRow,b:SettlementRow)=>cmp(a.judgment_id,b.judgment_id)||a.seq-b.seq;
export const calibrationIsValid=(row:CalibrationRow,revision:number|null,now:string)=>revision!==null&&row.validity_revision===revision&&Date.parse(row.valid_until)>Date.parse(now);

export interface SubjectLookup{issuerStatus(id:string):Promise<string|null>;industryExists(scheme:string,version:string,code:string):Promise<boolean>}
/** spec §3.1: format first (a malformed key is missing without a query); macro_series has no table yet. */
export async function subjectStatus(subject:Subject,lookup:SubjectLookup):Promise<'active'|'inactive'|'missing'>{
 let s:Subject;
 try{s=validateSubject(subject,{publicOnly:false});}catch{return 'missing';}
 if(s.type==='issuer'){const st=await lookup.issuerStatus(s.key);return st===null?'missing':st==='active'?'active':'inactive';}
 if(s.type==='industry'){const [scheme,version,code]=s.key.split(':');return (await lookup.industryExists(scheme,version,code))?'active':'missing';}
 if(s.type==='macro_region')return 'active';
 return 'missing';
}
/** The append_settlement row: the SettlementInsert plus request_digest from the single implementation (S02). */
export const settlementArgs=(judgmentId:string,row:SettlementInsert)=>({...row,request_digest:operationDigest(judgmentId,row)});
const QUEUE_FILTERS=['due','backoff','leased','all'];

interface RpcResult{data:unknown;error:PgErrorLike|null}
export type RpcFn=(fn:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;
// The query builder is left untyped on purpose (same as table-client.ts / facts db.ts).
type Query=PromiseLike<RpcResult>&{range:(from:number,to:number)=>Query};
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>Query;from:(table:string)=>any}

export function supabaseJudgmentsDb(clients:{anon:SupabaseClient;admin:SupabaseClient}):JudgmentsDb{
 const anon=clients.anon as unknown as NarrowClient;const admin=clients.admin as unknown as NarrowClient;
 const call=async<T>(c:NarrowClient,fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toJudgmentError(error);return data as T;};
 const rows=async(q:PromiseLike<RpcResult>):Promise<Row[]>=>{const {data,error}=await q;if(error)throw toJudgmentError(error);return (data??[]) as Row[];};
 /** Complete-set read: pages by range() in a fixed order until an EMPTY page, advancing by the rows actually
  *  returned — a PostgREST max-rows cap below READ_PAGE yields short pages that are not exhaustion
  *  (src/lib/db/table-client.ts pagination contract; plan audit P1-02). */
 const pageAll=async(make:()=>Query):Promise<Row[]>=>{
  const out:Row[]=[];
  for(let from=0;;){const part=await rows(make().range(from,from+READ_PAGE-1));if(part.length===0)return out;out.push(...part);from+=part.length;}
 };
 const envelopes=async(c:NarrowClient,fn:string,args:Record<string,unknown>)=>((await call<Row[]|null>(c,fn,args))??[]).map(envelopeFromRpc);
 const serverTime=async()=>isoTs(await call<string>(anon,'judgments_server_time',{}));
 return {
  serverTime,
  async methodology(id,version){const [r]=await rows(admin.from('judgment_methodologies').select('*').eq('methodology_id',id).eq('version',version).limit(1));return r?methodologyFromTable(r):null;},
  subjectExists:subject=>subjectStatus(subject,{
   async issuerStatus(id){const [r]=await rows(admin.from('issuers').select('status').eq('issuer_id',id).limit(1));return r?String(r.status):null;},
   async industryExists(scheme,version,code){return (await rows(admin.from('industry_classifications').select('code').eq('scheme',scheme).eq('version',version).eq('code',code).limit(1))).length>0;},
  }),
  async getJudgment(id){const [r]=await rows(admin.from('judgments').select('*').eq('judgment_id',id).limit(1));return r?judgmentFromTable(r):null;},
  async judgmentsBySnapshot(snapshotId){
   return (await pageAll(()=>admin.from('judgments').select('judgment_id').contains('inputs',[{kind:'macro_snapshot',ref:{snapshot_id:snapshotId}}]).order('judgment_id'))).map(r=>String(r.judgment_id));
  },
  async registerJudgment(row,queue){
   const r=await call<{registered_at:string;retrospective:boolean}>(admin,'register_judgment',{p_row:row,p_queue:queue});
   return {registered_at:isoTs(r.registered_at),retrospective:r.retrospective===true};
  },
  // E-02: one card per (type, methodology) can exceed a capped max_rows; the function orders deterministically, so drain by range() until an empty page.
  async latestCards(subject,o){
   const args={p_subject_type:subject.type,p_subject_key:subject.key,p_types:o.types??null,p_view:o.view,p_cutoff:o.cutoff??null};
   return (await pageAll(()=>anon.rpc('latest_judgment_cards',args))).map(envelopeFromRpc);
  },
  historyOf:(subject,type,m,o)=>envelopes(anon,'judgment_history',{p_subject_type:subject.type,p_subject_key:subject.key,p_type:type,p_methodology:m.id,p_version:m.version,p_view:o.view,p_cutoff:o.cutoff??null,p_before:o.before??null,p_limit:o.limit}),
  async claimDue(limit,leaseSeconds){return ((await call<Row[]|null>(admin,'claim_due_judgments',{p_limit:limit,p_lease_seconds:leaseSeconds}))??[]).map(queueFromTable).sort(byQueueOrder);},
  async releaseLease(judgmentId,leaseToken,patch){await call(admin,'release_lease',{p_judgment_id:judgmentId,p_lease_token:leaseToken,p_patch:patch});},
  async queueRow(id){const [r]=await rows(admin.from('judgment_settle_queue').select('*').eq('judgment_id',id).limit(1));return r?queueFromTable(r):null;},
  async queueList(o){
   if(!QUEUE_FILTERS.includes(o.filter))throw new JudgmentError('invalid_parameter',`filter:${String(o.filter)}`);
   assertLimit(o.limit,QUEUE_LIST_MAX);
   const now=await serverTime();const free=`leased_until.is.null,leased_until.lt."${now}"`;
   let q=admin.from('judgment_settle_queue').select('*');
   if(o.filter==='due')q=q.is('closed_at',null).lte('next_attempt_at',now).or(free);
   else if(o.filter==='backoff')q=q.is('closed_at',null).gt('next_attempt_at',now).or(free);
   else if(o.filter==='leased')q=q.is('closed_at',null).gte('leased_until',now);
   if(o.after!==undefined)q=q.gt('judgment_id',o.after);
   return (await rows(q.order('judgment_id').limit(o.limit))).map(queueFromTable);
  },
  async settlementsOf(ids){
   const unique=[...new Set(ids)];const out:SettlementRow[]=[];
   for(let i=0;i<unique.length;i+=IN_CHUNK){const part=unique.slice(i,i+IN_CHUNK);out.push(...(await pageAll(()=>admin.from('judgment_settlements').select('*').in('judgment_id',part).order('judgment_id').order('seq'))).map(settlementFromTable));}
   return out.sort(bySettlementOrder);
  },
  async appendSettlement(judgmentId,leaseToken,requestKey,row){
   const r=await call<{seq:number;status:AppendStatus}>(admin,'append_settlement',{p_judgment_id:judgmentId,p_lease_token:leaseToken,p_request_key:requestKey,p_row:settlementArgs(judgmentId,row)});
   return {seq:Number(r.seq),status:r.status};
  },
  async quarantineSettlement(judgmentId,leaseToken,reasonCode,payload,patch,batchId){
   const r=await call<{status:'quarantined'|'lease_lost';quarantine_id:string|null}>(admin,'quarantine_settlement',{p_judgment_id:judgmentId,p_lease_token:leaseToken,p_reason_code:reasonCode,p_payload:payload,p_patch:patch,p_batch_id:batchId});
   return {status:r.status,quarantine_id:r.quarantine_id??null};
  },
  async applyQuarantineOverride(judgmentId,override,quarantineId,audit){return await call<'applied'|'stale'|'closed'|'item_not_open'>(admin,'apply_quarantine_override',{p_judgment_id:judgmentId,p_override:override,p_quarantine_id:quarantineId,p_audit:audit});},
  async rejectQuarantinedSettlement(judgmentId,quarantineId,expected,requestKey,row,audit){
   const r=await call<{seq:number;status:AppendStatus|'stale'|'item_not_open'}>(admin,'reject_quarantined_settlement',{p_judgment_id:judgmentId,p_quarantine_id:quarantineId,p_expected:expected,p_request_key:requestKey,p_row:settlementArgs(judgmentId,row),p_audit:audit});
   return {seq:Number(r.seq),status:r.status};
  },
  async envelopeById(id,o){const [e]=await envelopes(anon,'judgment_envelope_by_id',{p_id:id,p_view:o.view,p_cutoff:o.cutoff??null});return e??null;},
  calibrationCohort:(m,v,w,cutoff,after,limit)=>envelopes(anon,'calibration_cohort',{p_methodology:m,p_version:v,p_window_from:w.from,p_window_to:w.to,p_cutoff:cutoff,p_after:after,p_limit:limit}),
  calibrationCohortInternal:(m,v,w,cutoff,after,limit)=>envelopes(admin,'calibration_cohort_internal',{p_methodology:m,p_version:v,p_window_from:w.from,p_window_to:w.to,p_cutoff:cutoff,p_after:after,p_limit:limit}),
  async freezeCalibrationCohort(generation,m,v,w){
   const r=await call<{status:'frozen'|'already_frozen';frozen_at:string;n:number}>(admin,'freeze_calibration_cohort',{p_generation:generation,p_methodology:m,p_version:v,p_window_from:w.from,p_window_to:w.to});
   return {status:r.status,frozen_at:isoTs(r.frozen_at),n:Number(r.n)};
  },
  cohortMembers:(generation,after,limit)=>envelopes(admin,'calibration_cohort_members',{p_generation:generation,p_after:after,p_limit:limit}),
  async clearCalibrationGeneration(generation){return Number(await call<unknown>(admin,'clear_calibration_generation',{p_generation:generation}));},
  async latestCalibration(m,v,scope){
   const [r]=await rows(anon.from('judgment_calibrations').select('*').eq('methodology_id',m).eq('methodology_version',v).eq('scope_type',scope.scope_type).eq('scope_key',scope.scope_key).order('computed_at',{ascending:false}).order('calibration_id').limit(1));
   if(!r)return null;
   const row=calibrationFromTable(r);
   const [x]=await rows(anon.from('judgment_calibration_validity').select('revision').eq('methodology_id',m).eq('version',v).limit(1));
   return {row,valid:calibrationIsValid(row,x?Number(x.revision):null,await serverTime())};
  },
  async calibrationValidity(m,v){
   const [x]=await rows(admin.from('judgment_calibration_validity').select('revision').eq('methodology_id',m).eq('version',v).limit(1));
   if(!x)throw new JudgmentError('unknown_methodology',`${m}@${v}`);
   return {revision:Number(x.revision)};
  },
  async insertCalibration(row,expectedRevision){return await call<'inserted'|'duplicate'|'stale_revision'>(admin,'insert_calibration',{p_row:row,p_expected_revision:expectedRevision});},
  async syncMethodology(row,actor,reason){const r=await call<{changed:boolean;seq:number}>(admin,'sync_methodology',{p_row:row,p_actor:actor,p_reason:reason});return {changed:r.changed===true,seq:Number(r.seq)};},
  async listMethodologies(status){
   return (await pageAll(()=>{let q=anon.from('judgment_methodologies').select('*');if(status!==undefined)q=q.eq('status',status);return q.order('methodology_id').order('version');})).map(methodologyFromTable);
  },
  async methodologyStateAt(id,version,cutoff){
   const r=await call<unknown>(anon,'methodology_state_at',{p_methodology:id,p_version:version,p_cutoff:cutoff});
   const x=Array.isArray(r)?r[0]:r;
   return present(x,'event_id')?eventFromTable(x):null;
  },
  async jobState(job){const [r]=await rows(admin.from('judgment_job_state').select('state,updated_at').eq('job',job).limit(1));return r?{state:json(r.state,{}),updated_at:isoTs(r.updated_at)}:null;},
  async setJobState(job,expectedUpdatedAt,state){return (await call<unknown>(admin,'set_job_state',{p_job:job,p_expected_updated_at:expectedUpdatedAt,p_state:state}))===true;},
  async repairStaleBatches(dataset,olderThanSeconds){return Number(await call<unknown>(admin,'repair_stale_batches',{p_dataset:dataset,p_older_than:`${olderThanSeconds} seconds`}));},
 };
}
