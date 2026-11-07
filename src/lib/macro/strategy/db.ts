// src/lib/macro/strategy/db.ts
// StrategyDb (spec §4.4, plan 2026-11-07 Task 3): the only storage access of the strategy module. Writes are the eight
// service-role RPCs of 20261115090000_macro_strategy.sql; reads are table selects under the caller's role (anon for
// manifests and reviews, admin for run lookups, the user's session for the RLS projection). The SQL raises with the
// code as the message (not_found, payload_conflict, invalid_transition, cutoff_mismatch, invalid_argument); toStrategyDbError maps those, everything
// else is rpc_failed. strategyDbOver(transport) holds all mapping logic so the same code runs over Supabase
// (supabaseStrategyDb) and, in the integration test, over node-postgres. memoryStrategyDb reproduces the SQL rules for
// unit tests; db-contract.ts runs the same cases against both. New RPCs are not registered in database.types.ts
// (repo convention, src/lib/supabase/admin.ts): the client is narrowed locally. Timestamps are normalised to ISO-8601
// UTC with milliseconds; bigint generation arrives as a string from pg and as a number from PostgREST → Number().
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {canonicalJson,sha256Hex} from './hash';
import type {ExplanationProjection,ExplanationState,Region,RenderedExplanation,ReviewFacts,ReviewResult,ReviewStatus,StoredManifest,StrategyManifest} from './contract';

/** A run row as completion recovery reads it (service role). */
export interface RunDetail{explanation_id:string;user_id:string;state:ExplanationState;locale:'zh'|'en';manifest_id:string;usage_audit_key:string;raw_output:unknown;finalize_payload:Record<string,unknown>|null;finalized:boolean}
/** A completion is recorded when raw_output is a json object (the completion envelope); the SQL tests jsonb_typeof = 'object'. */
export const hasRecordedCompletion=(raw:unknown):boolean=>typeof raw==='object'&&raw!==null&&!Array.isArray(raw);
/** Running rows scanned per recoverableRuns call. */
export const RECOVERY_SCAN=50;

export class StrategyDbError extends Error{constructor(readonly code:'stale_generation'|'payload_conflict'|'invalid_transition'|'not_found'|'cutoff_mismatch'|'invalid_argument'|'rpc_failed',message?:string){super(message??code);this.name='StrategyDbError';}}
export interface StrategyDb{
 putManifest(body:StrategyManifest):Promise<StoredManifest>;   // computes manifest_hash = sha256Hex(canonicalJson(body)); RPC macro_put_manifest; idempotent by hash
 manifest(id:string):Promise<StoredManifest|null>;                                                          // anon
 reviewCurrent(region:Region,month:string):Promise<{result:ReviewResult;generation:number;cutoff:string}|null>;   // anon
 reviewIndex(region:Region,months:number):Promise<{month:string;status:ReviewStatus;generation:number;result_id:string;updated_at:string}[]>;  // anon
 /** Immutable review result by id (anon): review explanations bind to result_id, never to the moving pointer. */
 reviewResult(resultId:string):Promise<ReviewResult|null>;
 publishReview(a:{region:Region;month:string;expectedGeneration:number;cutoff:string;status:ReviewStatus;manifestId:string;manifestHash:string;facts:ReviewFacts;methodVersion:string;codeVersion:string}):Promise<{result_id:string;generation:number;outcome:'advanced'|'replayed'|'stale'}>;   // RPC macro_publish_review; absent pointer = generation 0; stale is a return value, never thrown
 recordReviewAttempt(region:Region,month:string,status:'failed',error:Record<string,unknown>):Promise<void>;   // service
 /** Admin-side lookup used for idempotent replay before any other check (spec §6.3 step 2). */
 runOf(userId:string,requestId:string):Promise<{explanation_id:string;payload_hash:string;state:ExplanationState}|null>;
 /** RPC generates explanation_id and usage_audit_key; ONLY outcome 'claimed' may bill or call the model. payload_conflict throws. */
 claimExplanation(a:{userId:string;requestId:string;payloadHash:string;subjectKind:'snapshot'|'review';subjectId:string;locale:'zh'|'en';manifestId:string}):Promise<{outcome:'claimed'|'existing';explanation_id:string;usage_audit_key:string;projection:ExplanationProjection}>;
 /** RPC macro_record_completion: durable raw output + the exact finalizeUsageRun payload, right after the provider returns
  *  (or throws, or begin fails) and before validation / finish; running or abandoned rows; same values → no-op. */
 recordCompletion(a:{explanationId:string;rawOutput:unknown;finalizePayload:Record<string,unknown>}):Promise<void>;
 /** running → final; same final state + same raw output → idempotent; other final → invalid_transition; abandoned → late_output only.
  *  finalizePayload is stored atomically when the row has none yet (a failed recordCompletion), never overwritten (plan audit R2-2). */
 finishExplanation(a:{explanationId:string;state:'accepted'|'rejected'|'failed';provider:string|null;model:string|null;promptVersion:string;validatorVersion:string;rawOutput:unknown;validation:Record<string,unknown>;rendered:RenderedExplanation|null;failureCodes:string[];accounting:unknown;finalizePayload:Record<string,unknown>|null}):Promise<ExplanationProjection>;
 markFinalized(explanationId:string):Promise<void>;   // RPC macro_mark_finalized; needs a recorded finalize payload; any state; idempotent
 /** RPC macro_expire_explanations: the user's running rows claimed > 5 minutes ago WITHOUT a recorded completion → abandoned
  *  (projection failed); a row whose raw output is recorded is left for completion recovery (plan audit R2-1). */
 expireExplanations(userId:string):Promise<number>;
 /** Admin read of one run row for completion recovery and settlement (plan audit R2-1 / R2-2); non-uuid → null without a query. */
 runDetail(explanationId:string):Promise<RunDetail|null>;
 /** Admin: ids of the user's running rows with a recorded raw output, oldest claim first, at most `limit` (GET recovery). */
 recoverableRuns(userId:string,limit:number):Promise<string[]>;
 explanationsOf(client:'session',subjectKind:'snapshot'|'review',subjectId:string,limit:number):Promise<ExplanationProjection[]>;   // user session client (RLS)
}

// ---------------------------------------------------------------- transport
export type StrategyTable='macro_strategy_manifests'|'macro_review_results'|'macro_review_current'|'macro_explanation_runs'|'macro_explanations';
export type ReadRole='anon'|'admin'|'session';
export interface SelectSpec{columns?:readonly string[];table:StrategyTable;eq:Record<string,string>;in?:{column:string;values:string[]};order:{column:string;ascending:boolean}[];limit:number}
/** rpc runs as service_role and rejects with the database error (message = code for raised errors); select runs under `role`. */
export interface StrategyTransport{
 rpc(fn:string,args:Record<string,unknown>):Promise<unknown>;
 select(role:ReadRole,spec:SelectSpec):Promise<Record<string,unknown>[]>;
}
/** Rows per select (PostgREST max_rows = 1000). */
export const MAX_SELECT=1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODES=['stale_generation','payload_conflict','invalid_transition','not_found','cutoff_mismatch','invalid_argument'] as const;
export function toStrategyDbError(e:unknown):StrategyDbError{
 if(e instanceof StrategyDbError)return e;
 const message=typeof e==='object'&&e!==null&&typeof (e as {message?:unknown}).message==='string'?(e as {message:string}).message:String(e);
 const code=CODES.find(c=>c===message);
 return new StrategyDbError(code??'rpc_failed',message);
}
const iso=(v:unknown):string=>{const t=v instanceof Date?v.getTime():Date.parse(String(v));if(!Number.isFinite(t))throw new StrategyDbError('rpc_failed',`invalid_timestamp:${String(v)}`);return new Date(t).toISOString();};
const isoOrNull=(v:unknown):string|null=>v===null||v===undefined?null:iso(v);
const str=(v:unknown):string|null=>v===null||v===undefined?null:String(v);

// ---------------------------------------------------------------- row mapping
const manifestFrom=(r:Record<string,unknown>):StoredManifest=>({manifest_id:String(r.manifest_id),manifest_hash:String(r.manifest_hash),body:r.body as StrategyManifest,created_at:iso(r.created_at)});
const resultFrom=(r:Record<string,unknown>):ReviewResult=>({result_id:String(r.result_id),region:r.region as Region,month:String(r.month),status:r.status as ReviewStatus,
 manifest_id:String(r.manifest_id),manifest_hash:String(r.manifest_hash),facts:r.facts as ReviewFacts,method_version:String(r.method_version),code_version:String(r.code_version),created_at:iso(r.created_at)});
const runDetailFrom=(r:Record<string,unknown>):RunDetail=>({explanation_id:String(r.explanation_id),user_id:String(r.user_id),state:r.state as ExplanationState,locale:r.locale as 'zh'|'en',
 manifest_id:String(r.manifest_id),usage_audit_key:String(r.usage_audit_key),raw_output:r.raw_output??null,finalize_payload:(r.finalize_payload??null) as Record<string,unknown>|null,finalized:r.finalized===true});
/** Projection row or RPC projection json → ExplanationProjection. prompt_version / validator_version are null until finish → ''. */
export function projectionFrom(r:Record<string,unknown>):ExplanationProjection{
 return {explanation_id:String(r.explanation_id),subject_kind:r.subject_kind as 'snapshot'|'review',subject_id:String(r.subject_id),locale:r.locale as 'zh'|'en',
  manifest_id:String(r.manifest_id),state:r.state as ExplanationState,rendered:(r.rendered??null) as RenderedExplanation|null,
  failure_codes:Array.isArray(r.failure_codes)?r.failure_codes.map(String):[],provider:str(r.provider),model:str(r.model),
  prompt_version:str(r.prompt_version)??'',validator_version:str(r.validator_version)??'',created_at:iso(r.created_at),finished_at:isoOrNull(r.finished_at)};
}

export function strategyDbOver(t:StrategyTransport):StrategyDb{
 const rpc=async(fn:string,args:Record<string,unknown>)=>{try{return await t.rpc(fn,args);}catch(e){throw toStrategyDbError(e);}};
 const select=async(role:ReadRole,spec:SelectSpec)=>{try{return await t.select(role,{...spec,limit:Math.min(Math.max(1,Math.trunc(spec.limit)),MAX_SELECT)});}catch(e){throw toStrategyDbError(e);}};
 const manifestById=async(role:ReadRole,id:string)=>{
  if(!UUID.test(id))return null;
  const [r]=await select(role,{table:'macro_strategy_manifests',eq:{manifest_id:id},order:[],limit:1});
  return r?manifestFrom(r):null;
 };
 return {
  async putManifest(body){
   // Capture one JSON value before awaiting I/O: hash, RPC payload and returned evidence must agree,
   // even if the caller changes its object while the RPC is in flight. Undefined fields disappear as on wire.
   const canonical=canonicalJson(body),hash=sha256Hex(canonical);
   const frozen=JSON.parse(canonical) as StrategyManifest;
   const id=await rpc('macro_put_manifest',{p_kind:frozen.kind,p_body:frozen,p_manifest_hash:hash,p_cutoff:frozen.cutoff,p_method_version:frozen.method_version,p_code_version:frozen.code_version,p_catalog_version:frozen.catalog_version});
   if(typeof id!=='string'||!UUID.test(id))throw new StrategyDbError('rpc_failed','invalid_manifest_id');
   // The service-only RPC inserts this exact JSONB value or verifies equality on hash conflict.
   // Manifest rows have no update/delete grants. Read metadata only; manifest(id) still reads full evidence.
   const rows=await select('admin',{table:'macro_strategy_manifests',columns:['manifest_id','manifest_hash','created_at'],eq:{manifest_id:id},order:[],limit:1});
   const r=rows[0];
   if(rows.length!==1||!r||typeof r.manifest_id!=='string'||r.manifest_id.toLowerCase()!==id.toLowerCase()||r.manifest_hash!==hash
    ||!(r.created_at instanceof Date||typeof r.created_at==='string'&&/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(r.created_at)))
    throw new StrategyDbError('rpc_failed','invalid_manifest_metadata');
   return {manifest_id:r.manifest_id,manifest_hash:hash,body:frozen,created_at:iso(r.created_at)};
  },
  manifest:id=>manifestById('anon',id),
  async reviewCurrent(region,month){
   const [cur]=await select('anon',{table:'macro_review_current',eq:{region,month},order:[],limit:1});
   if(!cur)return null;
   const [res]=await select('anon',{table:'macro_review_results',eq:{result_id:String(cur.result_id)},order:[],limit:1});
   if(!res)throw new StrategyDbError('rpc_failed',`review_result_missing:${String(cur.result_id)}`);
   return {result:resultFrom(res),generation:Number(cur.generation),cutoff:iso(cur.cutoff)};
  },
  async reviewIndex(region,months){
   const cur=await select('anon',{table:'macro_review_current',eq:{region},order:[{column:'month',ascending:false}],limit:months});
   if(!cur.length)return [];
   const res=await select('anon',{table:'macro_review_results',eq:{},in:{column:'result_id',values:cur.map(r=>String(r.result_id))},order:[],limit:cur.length});
   const status=new Map(res.map(r=>[String(r.result_id),r.status as ReviewStatus]));
   return cur.map(r=>{
    const s=status.get(String(r.result_id));if(!s)throw new StrategyDbError('rpc_failed',`review_result_missing:${String(r.result_id)}`);
    return {month:String(r.month),status:s,generation:Number(r.generation),result_id:String(r.result_id),updated_at:iso(r.updated_at)};
   });
  },
  async publishReview(a){
   const x=await rpc('macro_publish_review',{p_region:a.region,p_month:a.month,p_expected_generation:a.expectedGeneration??null,p_cutoff:a.cutoff,p_status:a.status,p_manifest_id:a.manifestId,
    p_manifest_hash:a.manifestHash,p_facts:a.facts,p_method_version:a.methodVersion,p_code_version:a.codeVersion}) as {result_id:string;generation:number|string;outcome:'advanced'|'replayed'|'stale'};
   return {result_id:String(x.result_id),generation:Number(x.generation),outcome:x.outcome};
  },
  async reviewResult(resultId){
   if(!UUID.test(resultId))return null;
   const [r]=await select('anon',{table:'macro_review_results',eq:{result_id:resultId},order:[],limit:1});
   return r?resultFrom(r):null;
  },
  async recordReviewAttempt(region,month,status,error){await rpc('macro_record_review_attempt',{p_region:region,p_month:month,p_status:status,p_error:error});},
  async runOf(userId,requestId){
   if(!UUID.test(userId)||!UUID.test(requestId))return null;
   const [r]=await select('admin',{table:'macro_explanation_runs',eq:{user_id:userId,request_id:requestId},order:[],limit:1});
   return r?{explanation_id:String(r.explanation_id),payload_hash:String(r.payload_hash),state:r.state as ExplanationState}:null;
  },
  async claimExplanation(a){
   const x=await rpc('macro_claim_explanation',{p_user_id:a.userId,p_request_id:a.requestId,p_payload_hash:a.payloadHash,p_subject_kind:a.subjectKind,p_subject_id:a.subjectId,p_locale:a.locale,p_manifest_id:a.manifestId}) as {outcome:'claimed'|'existing';explanation_id:string;usage_audit_key:string;projection:Record<string,unknown>};
   return {outcome:x.outcome,explanation_id:String(x.explanation_id),usage_audit_key:String(x.usage_audit_key),projection:projectionFrom(x.projection)};
  },
  async recordCompletion(a){await rpc('macro_record_completion',{p_explanation_id:a.explanationId,p_raw_output:a.rawOutput??null,p_finalize_payload:a.finalizePayload});},
  async finishExplanation(a){
   return projectionFrom(await rpc('macro_finish_explanation',{p_explanation_id:a.explanationId,p_state:a.state,p_provider:a.provider,p_model:a.model,p_prompt_version:a.promptVersion,
    p_validator_version:a.validatorVersion,p_raw_output:a.rawOutput??null,p_validation:a.validation,p_rendered:a.rendered,p_failure_codes:a.failureCodes,p_accounting:a.accounting??null,
    p_finalize_payload:a.finalizePayload??null}) as Record<string,unknown>);
  },
  async markFinalized(id){await rpc('macro_mark_finalized',{p_explanation_id:id});},
  async expireExplanations(userId){if(!UUID.test(userId))return 0;return Number(await rpc('macro_expire_explanations',{p_user_id:userId}));},
  async runDetail(id){
   if(!UUID.test(id))return null;
   const [r]=await select('admin',{table:'macro_explanation_runs',eq:{explanation_id:id},order:[],limit:1});
   return r?runDetailFrom(r):null;
  },
  async recoverableRuns(userId,limit){
   if(!UUID.test(userId))return [];
   const rows=await select('admin',{table:'macro_explanation_runs',eq:{user_id:userId,state:'running'},order:[{column:'claimed_at',ascending:true},{column:'explanation_id',ascending:true}],limit:RECOVERY_SCAN});
   return rows.filter(r=>hasRecordedCompletion(r.raw_output)).slice(0,Math.max(0,Math.trunc(limit))).map(r=>String(r.explanation_id));
  },
  async explanationsOf(_client,subjectKind,subjectId,limit){
   const rows=await select('session',{table:'macro_explanations',eq:{subject_kind:subjectKind,subject_id:subjectId},order:[{column:'created_at',ascending:false},{column:'explanation_id',ascending:false}],limit});
   return rows.map(projectionFrom);
  },
 };
}

// ---------------------------------------------------------------- Supabase
interface PgErrorLike{message?:string;code?:string}
interface RpcResult{data:unknown;error:PgErrorLike|null}
// The query builder is left untyped on purpose (same as src/lib/facts/db.ts): the hand-maintained Database type lacks
// the Relationships/Views that supabase-js inference needs, and the eight RPCs are not registered there.
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;from:(table:string)=>any}
export function supabaseTransport(c:{admin:SupabaseClient;anon:SupabaseClient;session?:SupabaseClient}):StrategyTransport{
 const pick=(role:ReadRole):NarrowClient=>{
  const client=role==='admin'?c.admin:role==='anon'?c.anon:c.session;
  if(!client)throw new StrategyDbError('rpc_failed','no_session_client');
  return client as unknown as NarrowClient;
 };
 return {
  async rpc(fn,args){const {data,error}=await pick('admin').rpc(fn,args);if(error)throw error;return data;},
  async select(role,spec){
   let q=pick(role).from(spec.table).select(spec.columns?.join(',')??'*');
   for(const [k,v] of Object.entries(spec.eq))q=q.eq(k,v);
   if(spec.in)q=q.in(spec.in.column,spec.in.values);
   for(const o of spec.order)q=q.order(o.column,{ascending:o.ascending});
   const {data,error}=await q.limit(spec.limit) as RpcResult;
   if(error)throw error;
   return (data??[]) as Record<string,unknown>[];
  },
 };
}
export function supabaseStrategyDb(c:{admin:SupabaseClient;anon:SupabaseClient;session?:SupabaseClient}):StrategyDb{return strategyDbOver(supabaseTransport(c));}

// ---------------------------------------------------------------- memory (unit tests; same rules as the SQL)
interface MemRun{explanation_id:string;user_id:string;request_id:string;payload_hash:string;locale:'zh'|'en';manifest_id:string;state:ExplanationState;claimed_at:number;raw_output:unknown;finalize_payload:Record<string,unknown>|null;accounting:unknown;finalized:boolean;late_output:unknown;usage_audit_key:string}
const ABANDON_MS=5*60*1000;
export type MemRunView={state:ExplanationState;raw_output:unknown;finalize_payload:Record<string,unknown>|null;finalized:boolean;late_output:unknown};
export function memoryStrategyDb(opts:{now?:()=>Date}={}):StrategyDb&{_userId:(id:string)=>void;_run:(explanationId:string)=>MemRunView|null}{
 const now=opts.now??(()=>new Date());
 const clone=<T>(v:T):T=>v===undefined?v:JSON.parse(JSON.stringify(v)) as T;
 const manifests=new Map<string,StoredManifest>(),byHash=new Map<string,string>();
 const results=new Map<string,ReviewResult>(),resultByKey=new Map<string,string>();
 const current=new Map<string,{region:Region;month:string;result_id:string;generation:number;cutoff:string;updated_at:string}>();
 const attempts:{region:Region;month:string;status:string;result_id:string|null;error:unknown}[]=[];
 const runs=new Map<string,MemRun>(),runByRequest=new Map<string,string>();
 const projections=new Map<string,ExplanationProjection&{user_id:string}>();
 let sessionUser:string|null=null;
 const projection=(id:string):ExplanationProjection=>{const {user_id:_u,...p}=projections.get(id)!;return clone(p);};
 const abandon=(r:MemRun)=>{
  const t=now().toISOString();r.state='abandoned';
  const p=projections.get(r.explanation_id)!;if(p.state==='running'){p.state='failed';p.failure_codes=['abandoned'];p.finished_at=t;}
 };
 const expired=(r:MemRun)=>r.state==='running'&&r.claimed_at<now().getTime()-ABANDON_MS&&!hasRecordedCompletion(r.raw_output);
 /** finish's p_finalize_payload: validated like the column check, stored only when the row has none. */
 const payloadFill=(r:MemRun,p:Record<string,unknown>|null)=>{
  if(r.finalize_payload!==null||p===null)return null;
  if(p.status!=='completed'&&p.status!=='failed')throw new StrategyDbError('rpc_failed','macro_explanation_runs_finalize_payload');
  return clone(p);
 };
 return {
  _userId(id){sessionUser=id;},
  _run(id){const r=runs.get(id);return r?clone({state:r.state,raw_output:r.raw_output,finalize_payload:r.finalize_payload,finalized:r.finalized,late_output:r.late_output}):null;},
  async putManifest(body){
   const hash=sha256Hex(canonicalJson(body));
   const existing=byHash.get(hash);
   if(existing){const m=manifests.get(existing)!;if(canonicalJson(m.body)!==canonicalJson(body))throw new StrategyDbError('payload_conflict');return clone(m);}
   const m:StoredManifest={manifest_id:randomUUID(),manifest_hash:hash,body:clone(body),created_at:now().toISOString()};
   manifests.set(m.manifest_id,m);byHash.set(hash,m.manifest_id);return clone(m);
  },
  async manifest(id){const m=manifests.get(id);return m?clone(m):null;},
  async reviewCurrent(region,month){
   const c=current.get(`${region}|${month}`);if(!c)return null;
   return {result:clone(results.get(c.result_id)!),generation:c.generation,cutoff:c.cutoff};
  },
  async reviewIndex(region,months){
   return [...current.values()].filter(c=>c.region===region).sort((a,b)=>a.month<b.month?1:a.month>b.month?-1:0).slice(0,Math.max(1,Math.trunc(months)))
    .map(c=>({month:c.month,status:results.get(c.result_id)!.status,generation:c.generation,result_id:c.result_id,updated_at:c.updated_at}));
  },
  async publishReview(a){
   if(a.expectedGeneration===null||a.expectedGeneration===undefined)throw new StrategyDbError('invalid_argument');
   const m=manifests.get(a.manifestId);
   if(!m||m.manifest_hash!==a.manifestHash||m.body.kind!=='review')throw new StrategyDbError('not_found');
   // the pointer's cutoff always is its frozen evidence's cutoff: compare instants, not spellings
   if(Date.parse(m.body.cutoff)!==Date.parse(a.cutoff))throw new StrategyDbError('cutoff_mismatch');
   const key=`${a.region}|${a.month}|${a.manifestHash}`;let resultId=resultByKey.get(key);
   if(!resultId){
    resultId=randomUUID();resultByKey.set(key,resultId);
    results.set(resultId,{result_id:resultId,region:a.region,month:a.month,status:a.status,manifest_id:a.manifestId,manifest_hash:a.manifestHash,facts:clone(a.facts),method_version:a.methodVersion,code_version:a.codeVersion,created_at:now().toISOString()});
   }
   const ck=`${a.region}|${a.month}`;const cur=current.get(ck);let gen=cur?.generation??0;let outcome:'advanced'|'replayed'|'stale';
   if(cur?.result_id===resultId)outcome='replayed';
   else if(gen!==a.expectedGeneration)outcome='stale';
   else if(cur&&Date.parse(a.cutoff)<Date.parse(cur.cutoff))outcome='stale';
   else{gen+=1;current.set(ck,{region:a.region,month:a.month,result_id:resultId,generation:gen,cutoff:new Date(Date.parse(a.cutoff)).toISOString(),updated_at:now().toISOString()});outcome='advanced';}
   attempts.push({region:a.region,month:a.month,status:outcome==='advanced'?'ok':outcome,result_id:resultId,error:null});
   return {result_id:resultId,generation:gen,outcome};
  },
  async reviewResult(resultId){const r=results.get(resultId);return r?clone(r):null;},
  async recordReviewAttempt(region,month,status,error){
   if(status!=='failed')throw new StrategyDbError('rpc_failed','invalid_status');
   attempts.push({region,month,status,result_id:null,error:clone(error)});
  },
  async runOf(userId,requestId){
   const id=runByRequest.get(`${userId}|${requestId}`);if(!id)return null;
   const r=runs.get(id)!;return {explanation_id:r.explanation_id,payload_hash:r.payload_hash,state:r.state};
  },
  async claimExplanation(a){
   const id=runByRequest.get(`${a.userId}|${a.requestId}`);
   if(id){
    const r=runs.get(id)!;
    if(r.payload_hash!==a.payloadHash)throw new StrategyDbError('payload_conflict');
    if(expired(r))abandon(r);
    return {outcome:'existing',explanation_id:id,usage_audit_key:r.usage_audit_key,projection:projection(id)};
   }
   const m=manifests.get(a.manifestId);
   if(!m||m.body.kind!=='explain_facts')throw new StrategyDbError('not_found');
   const eid=randomUUID();const key=eid;const t=now();
   runs.set(eid,{explanation_id:eid,user_id:a.userId,request_id:a.requestId,payload_hash:a.payloadHash,locale:a.locale,manifest_id:a.manifestId,state:'running',claimed_at:t.getTime(),raw_output:null,finalize_payload:null,accounting:null,finalized:false,late_output:null,usage_audit_key:key});
   runByRequest.set(`${a.userId}|${a.requestId}`,eid);
   projections.set(eid,{user_id:a.userId,explanation_id:eid,subject_kind:a.subjectKind,subject_id:a.subjectId,locale:a.locale,manifest_id:a.manifestId,state:'running',rendered:null,failure_codes:[],
    provider:null,model:null,prompt_version:'',validator_version:'',created_at:t.toISOString(),finished_at:null});
   return {outcome:'claimed',explanation_id:eid,usage_audit_key:key,projection:projection(eid)};
  },
  async recordCompletion(a){
   if(a.finalizePayload===null||a.finalizePayload===undefined)throw new StrategyDbError('invalid_transition');   // checked before the row lookup, like the SQL
   const r=runs.get(a.explanationId);
   if(!r)throw new StrategyDbError('not_found');
   const raw=clone(a.rawOutput??null);
   if(r.state!=='running'&&r.state!=='abandoned')throw new StrategyDbError('invalid_transition');   // state first, like the SQL
   if(r.finalize_payload!==null){
    if(canonicalJson(r.finalize_payload)!==canonicalJson(a.finalizePayload)||canonicalJson(r.raw_output)!==canonicalJson(raw))throw new StrategyDbError('invalid_transition');
    return;
   }
   if(a.finalizePayload.status!=='completed'&&a.finalizePayload.status!=='failed')throw new StrategyDbError('rpc_failed','macro_explanation_runs_finalize_payload');
   r.raw_output=raw;r.finalize_payload=clone(a.finalizePayload);
  },
  async finishExplanation(a){
   const r=runs.get(a.explanationId);
   if(!r)throw new StrategyDbError('not_found');
   const raw=clone(a.rawOutput??null);
   if(r.state==='running'){
    if(r.finalize_payload!==null&&canonicalJson(r.raw_output)!==canonicalJson(raw))throw new StrategyDbError('invalid_transition');   // a recorded completion is evidence
    if(a.state==='accepted'&&a.rendered===null)throw new StrategyDbError('rpc_failed','macro_explanations_rendered');
    const fill=payloadFill(r,a.finalizePayload);
    const t=now().toISOString();r.state=a.state;r.raw_output=raw;r.accounting=clone(a.accounting??null);if(fill)r.finalize_payload=fill;
    const p=projections.get(a.explanationId)!;
    Object.assign(p,{state:a.state,rendered:a.state==='accepted'?clone(a.rendered):null,failure_codes:a.state==='accepted'?[]:[...a.failureCodes],provider:a.provider,model:a.model,
     prompt_version:a.promptVersion,validator_version:a.validatorVersion,finished_at:t});
   }else if(r.state==='abandoned'){
    const fill=payloadFill(r,a.finalizePayload);
    r.accounting=clone(a.accounting??null);r.late_output={state:a.state,raw_output:raw,validation:clone(a.validation),rendered:clone(a.rendered),failure_codes:[...a.failureCodes]};
    if(fill)r.finalize_payload=fill;
   }else if(r.state===a.state&&canonicalJson(r.raw_output)===canonicalJson(raw)){
    const fill=payloadFill(r,a.finalizePayload);if(fill)r.finalize_payload=fill;
   }else{
    throw new StrategyDbError('invalid_transition');
   }
   return projection(a.explanationId);
  },
  async markFinalized(id){
   const r=runs.get(id);
   if(!r)throw new StrategyDbError('not_found');
   if(r.finalize_payload===null)throw new StrategyDbError('invalid_transition');
   r.finalized=true;
  },
  async expireExplanations(userId){
   let n=0;
   for(const r of runs.values())if(r.user_id===userId&&expired(r)){abandon(r);n++;}
   return n;
  },
  async runDetail(id){
   const r=runs.get(id);if(!r)return null;
   return clone({explanation_id:r.explanation_id,user_id:r.user_id,state:r.state,locale:r.locale,manifest_id:r.manifest_id,usage_audit_key:r.usage_audit_key,raw_output:r.raw_output,
    finalize_payload:r.finalize_payload,finalized:r.finalized});
  },
  async recoverableRuns(userId,limit){
   return [...runs.values()].filter(r=>r.user_id===userId&&r.state==='running')   // same order and scan cap as production: oldest RECOVERY_SCAN running rows, then the recorded ones
    .sort((a,b)=>a.claimed_at-b.claimed_at||(a.explanation_id<b.explanation_id?-1:1)).slice(0,RECOVERY_SCAN)
    .filter(r=>hasRecordedCompletion(r.raw_output)).slice(0,Math.max(0,Math.trunc(limit))).map(r=>r.explanation_id);
  },
  async explanationsOf(_client,subjectKind,subjectId,limit){
   if(sessionUser===null)return [];
   return [...projections.values()].filter(p=>p.user_id===sessionUser&&p.subject_kind===subjectKind&&p.subject_id===subjectId)
    .sort((a,b)=>a.created_at!==b.created_at?(a.created_at<b.created_at?1:-1):(a.explanation_id<b.explanation_id?1:a.explanation_id>b.explanation_id?-1:0))
    .slice(0,Math.min(Math.max(1,Math.trunc(limit)),MAX_SELECT)).map(p=>projection(p.explanation_id));
  },
 };
}
