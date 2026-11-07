// src/lib/macro/db.ts
// MacroDb (plan shared contract; spec §4.3, §0.2 M10, M16, M24, N2, N3; 第 4 稿 P1-4…P2-4) is the only way macro
// code touches the database. supabaseMacroDb writes through the service-role client's RPCs (no role has table
// writes) and reads through the anon client, so RLS applies (ok observations only); publish state, chunk
// receipts, ingest runs, quarantine members, judgments (regimeOf: macro_regime_results is service-only, 第 6 稿 P1-2) and the
// publication-eligible reads (latestEligible / eligibleHistory: ingest_batches is service-only) go through the admin client.
// finalizeBatch / recordFreshness (第 6 稿 P1-1) are the fenced finish side effects (macro_finalize_batch / macro_record_freshness). memory-db.ts implements the
// same semantics and db-contract.ts pins both. Postgres messages that are contract codes (stale_publisher,
// invalid_manifest, quota_exceeded, not_found, already_resolved, reject_only, fenced, quarantine_closed) become
// MacroDbError codes; any other failure is rpc_failed with the original message (invalid_value_text, member_ineligible, chunk_total_mismatch,
// chunk_not_processing, not_quarantined, evidence_mismatch, catalog_version_conflict, constraint texts, …). The new RPCs are not in
// Database['public']['Functions']; a narrow structural client calls them (as src/lib/facts/db.ts).
// Counted strategy histories use bounded parallel pages; id chunks preserve result order.
import type {SupabaseClient} from '@supabase/supabase-js';
import type {ChunkCounts,ChunkError,ChunkRecord,EvidenceObject,FinalizeResult,FinishProgress,IngestRunState,Locator,ObservationRow,ObservationStatus,ObservationWrite,PublishInput,QuarantineMember,RegimeRecord,Region,Retrieval,SnapshotRecord,WriteResult} from './types';

export class MacroDbError extends Error{constructor(readonly code:'stale_publisher'|'invalid_manifest'|'quota_exceeded'|'not_found'|'truncated'|'already_resolved'|'reject_only'|'fenced'|'quarantine_closed'|'rpc_failed',message?:string){super(message??code);this.name='MacroDbError';}}
export interface MacroDb{
 /** Finalization receipts for candidate observations; null means the cutoff cannot be proven. service */
 batchFinishedAt(batchIds:string[]):Promise<Record<string,string|null>>;
 /** Upserts macro_series mirror and appends macro_catalog_versions (no-op if the version exists). service */
 upsertCatalog(defs:readonly import('./types').MacroSeriesDef[],catalogVersion:string,rulesVersion:string):Promise<void>;
 /** RPC macro_put_retrieval: inserts the evidence object if new (by sha256) and ALWAYS a new retrieval row; returns retrieval_id.
  *  ownerToken (第 5 稿 P1-3): the AKShare path passes its run's token (verified under the run lock, else `fenced`); FRED cron
  *  passes nothing (its batch has no run row; a batch WITH a run refuses a missing token). service */
 putRetrieval(obj:Omit<import('./types').EvidenceObject,'created_at'>,r:Omit<import('./types').Retrieval,'retrieval_id'|'sha256'>,ownerToken?:string|null):Promise<string>;
 evidenceObject(sha256:string):Promise<import('./types').EvidenceObject|null>;                                   // anon
 retrieval(retrievalId:string):Promise<import('./types').Retrieval|null>;                                        // anon
 /** Every retrieval of one evidence object, fetched_at ascending (≤ 1000). anon. */
 retrievalsOf(sha256:string):Promise<import('./types').Retrieval[]>;
 /** Retrievals by id, input order, unknown ids dropped, deduplicated. anon. */
 retrievalsByIds(ids:string[]):Promise<import('./types').Retrieval[]>;
 /** RPC macro_claim_ingest (第 4 稿 P1-6; 第 5 稿 P1-3/P2-1): single-writer lease per dataset with a fresh owner token. In one
  *  transaction under the dataset lock it first aborts (state 'aborted') every live run older than maxAgeMs and — only when
  *  takeover is true — every live run holding a chunk in 'processing' for longer than that run's processingTimeoutMs; then a
  *  remaining live run ⇒ busy (the caller finishes its own batch rejected), else the run is inserted open with a new
  *  owner_token. `aborted` lists the dataset's aborted runs whose batch is still running (the caller finishes them failed,
  *  ignoring batch_not_running). service */
 claimIngest(batchId:string,dataset:string,opts:{maxAgeMs:number;processingTimeoutMs:number;takeover:boolean}):Promise<import('./types').IngestClaim>;
 /** RPC macro_claim_chunk: inserts (batch, seq) as processing; a repeat returns the stored row without claiming. Wrong token or
  *  an aborted run ⇒ fenced. service */
 claimChunk(batchId:string,seq:number,total:number,ownerToken:string):Promise<{status:'claimed'}|{status:'processing'|'done';chunk:import('./types').ChunkRecord}>;
 /** RPC macro_complete_chunk: processing → done with counts, nativeUsable (第 6 稿 P2-1: usable native rows, previously_rejected
  *  excluded; 0 ≤ nativeUsable ≤ inserted+versioned+duplicates), sanitized errors and claim/location key sets (owner-fenced). service */
 completeChunk(batchId:string,seq:number,result:{counts:import('./types').ChunkCounts;nativeUsable:number;errors:import('./types').ChunkError[];claimKeys:string[];locatedKeys:string[]},ownerToken:string):Promise<import('./types').ChunkRecord>;
 chunksOf(batchId:string):Promise<import('./types').ChunkRecord[]>;                                              // service, seq order
 ingestRun(batchId:string):Promise<{dataset:string;state:import('./types').IngestRunState;progress:import('./types').FinishProgress}|null>;   // service
 /** RPC macro_begin_finish (第 5 稿 P1-4): only the token owner; open → finishing once every chunk 0..total−1 is done; a
  *  finishing run resumes. Both hand out a NEW finishToken (an older finisher is fenced at its next step); finished returns
  *  the stored progress; another owner or an aborted run ⇒ fenced. service */
 beginFinish(batchId:string,total:number,ownerToken:string):Promise<{status:'incomplete';missing:number[]}|{status:'finishing';progress:import('./types').FinishProgress;finishToken:string}|{status:'finished';progress:import('./types').FinishProgress}>;
 /** RPC macro_record_finish_step: merges one step into finish_progress (publish_attempt appends to attempts[]); 'receipt'
  *  finishes the run. Both tokens must match the run, checked before any state error (else fenced, 第 6 稿 P1-1). service */
 recordFinishStep(batchId:string,step:import('./types').FinishStep,data:Record<string,unknown>,fence:import('./types').FinishFence):Promise<import('./types').FinishProgress>;
 /** RPC macro_finalize_batch (第 6 稿 P1-1/P2-4): under the run lock (fence = owner + finish token of the AKShare finish; null for
  *  cron, whose batch has no run row — a batch WITH a run refuses a null fence) writes ingest_batches status/counts/errors/
  *  finished_at (≥ started_at) only while status='running'; otherwise returns the stored status with finalized:false (an
  *  earlier attempt finished it). Token mismatch / aborted run ⇒ fenced; unknown batch ⇒ not_found. service */
 finalizeBatch(batchId:string,input:import('./types').FinalizeInput,fence:import('./types').FinishFence|null):Promise<import('./types').FinalizeResult>;
 /** RPC macro_record_freshness (第 6 稿 P1-1): under the run lock, both tokens checked first (fenced), run finishing
  *  (run_not_finishing), dataset = the run's dataset; upserts dq_freshness with recordAttempt / computeFreshness semantics and
  *  writes the freshness_recorded checkpoint in the same transaction. Already recorded for this run ⇒ returns the progress
  *  unchanged (no second write). Returns the progress. service */
 recordFreshness(batchId:string,input:import('./types').FreshnessWrite,fence:import('./types').FinishFence):Promise<import('./types').FinishProgress>;
 /** RPC macro_write_observations. ownerToken as putRetrieval (第 5 稿 P1-3). service */
 writeObservations(batchId:string,codeVersion:string,rows:import('./types').ObservationWrite[],ownerToken?:string|null):Promise<import('./types').WriteResult>;
 /** Latest period per series, highest ok version within it; asOf ⇒ only rows with available_at ≤ asOf. anon. */
 latestObservations(seriesIds:string[],opts?:{asOf?:string;periodEndLte?:string}):Promise<import('./types').ObservationRow[]>;
 /** Same, over publication-eligible rows only (ok + batch success/partial + ancestors eligible; includeBatch also admits that
  *  open batch's rows). RPC macro_latest_eligible_observations. service (第 4 稿 P1-5) */
 latestEligible(seriesIds:string[],opts?:{asOf?:string;periodEndLte?:string;includeBatch?:string}):Promise<import('./types').ObservationRow[]>;
 /** Highest eligible version per period, ascending, paged to completion via RPC macro_eligible_history (throws truncated
  *  beyond maxRows periods). Publication and derivation read through this. service (第 4 稿 P1-5/P1-7) */
 eligibleHistory(seriesId:string,opts:{from?:string;to?:string;asOf?:string;includeBatch?:string;maxRows:number}):Promise<import('./types').ObservationRow[]>;
 /** Point-in-time eligible vintages, with each candidate and ancestor batch finalized by cutoff. service. */
 eligibleHistoryAsOf(seriesId:string,opts:{to:string;asOf:string;maxRows:number}):Promise<import('./types').ObservationRow[]>;
 /** Highest ok version per period, ascending period_end, paged to completion (throws truncated beyond maxRows). anon. */
 seriesHistory(seriesId:string,opts:{from?:string;to?:string;asOf?:string;maxRows:number}):Promise<import('./types').ObservationRow[]>;
 /** All ok versions of one series (revision history for the drawer). anon. */
 versionsOf(seriesId:string,periodEnd:string):Promise<import('./types').ObservationRow[]>;
 observationsByIds(ids:string[]):Promise<import('./types').ObservationRow[]>;                                    // anon; ok only
 publishState(region:import('./types').Region):Promise<{revision:number;inputRevision:number}>;                   // service
 /** RPC macro_link_quarantine (第 4 稿 P1-4; 第 5 稿 P2-3; 第 6 稿 P2-3): locks the dq_quarantine row FOR UPDATE and binds
  *  quarantined/rejected rows of the item's natural key. A closed item: if every given row is a member of THIS item and is now
  *  ok or rejected (the item's recorded resolution disposed of it), linking is already complete ⇒ returns 0; otherwise (a row
  *  still quarantined) ⇒ quarantine_closed and the caller re-parks. Callers link one observation per call. batchId + ownerToken
  *  fence the AKShare path (第 5 稿 P1-3). service */
 linkQuarantine(quarantineId:string,observationIds:string[],fence?:{batchId:string;ownerToken:string|null}):Promise<number>;
 /** Members of one item with their current status, version ascending. service */
 quarantineMembers(quarantineId:string):Promise<import('./types').QuarantineMember[]>;
 /** RPC macro_resolve_conflict (spec §0.2 M10, 第 4 稿 P1-4): accept needs observationId (a quarantined member whose batch is not
  *  failed/rejected — 第 5 稿 P1-6, else member_ineligible) — it becomes ok, every other member rejected; reject rejects every
  *  member. Throws already_resolved / not_found / reject_only. service */
 resolveConflict(quarantineId:string,decision:'accept'|'reject',resolvedBy:string,observationId?:string):Promise<void>;
 /** RPC publish_macro_snapshot; throws stale_publisher / invalid_manifest / fenced. An already used publishKey returns its
  *  snapshot with replayed:true and publishes nothing (第 5 稿 P1-4). service */
 publishSnapshot(input:import('./types').PublishInput):Promise<import('./types').PublishResult>;
 /** RPC republish_macro_snapshot (第 4 稿 P1-11): a NEW active snapshot copying a non-failed snapshot's manifest, history and
  *  regime after re-validating eligibility (rollback). Throws stale_publisher / invalid_manifest / not_found. service */
 republishSnapshot(snapshotId:string,expectedRevision:number,expectedInputRevision:number):Promise<{snapshot_id:string;revision:number}>;
 recordFailedSnapshot(input:{region:import('./types').Region;asOf:string;methodologyVersion:string;catalogVersion:string;reason:string}):Promise<string>;
 activeSnapshot(region:import('./types').Region):Promise<import('./types').SnapshotRecord|null>;                  // anon
 snapshot(snapshotId:string):Promise<import('./types').SnapshotRecord|null>;                                      // anon
 snapshotsSince(marker:{created_at:string;snapshot_id:string}|null,limit:number):Promise<import('./types').SnapshotRecord[]>;   // anon; active+superseded only
 /** The newest non-failed snapshot of the region created strictly before beforeCreatedAt ("changes since the previous snapshot"). anon. */
 previousSnapshot(region:import('./types').Region,beforeCreatedAt:string):Promise<import('./types').SnapshotRecord|null>;
 /** macro_regime_results is service-only (第 6 稿 P1-2): read through the admin client; callers expose it only server-side
  *  behind MACRO_JUDGMENTS_ENABLED. service */
 regimeOf(snapshotId:string):Promise<import('./types').RegimeRecord|null>;
}

export const READ_PAGE=1000;      // PostgREST max_rows
export const IN_CHUNK=200;        // ids per .in() filter (URL length)
export const WRITE_CHUNK=2000;    // rows per macro_write_observations call when a caller packs writes itself (packWrites)
export async function selectEligibleHistoryAsOf(candidates:ObservationRow[],cutoff:string,maxRows:number,
 loadRows:(ids:string[])=>Promise<ObservationRow[]>,loadBatches:(ids:string[])=>Promise<Record<string,{status:string;finished_at:string|null}>>):Promise<ObservationRow[]>{
 if(!Number.isInteger(maxRows)||maxRows<1)throw new MacroDbError('rpc_failed','invalid_max_rows');
 const found=new Map(candidates.map(r=>[r.observation_id,r]));let pending=[...new Set(candidates.flatMap(r=>r.derived_from??[]))];
 for(let depth=1;pending.length;depth++){
  if(depth>8)throw new MacroDbError('rpc_failed','ancestry_too_deep');
  pending=pending.filter(id=>!found.has(id));if(!pending.length)break;
  const got=await loadRows(pending);for(const row of got)found.set(row.observation_id,row);
  pending=[...new Set(got.flatMap(r=>r.derived_from??[]))];
 }
 const batches=await loadBatches([...new Set([...found.values()].map(r=>r.batch_id))]);const cutoffMs=Date.parse(cutoff);
 const eligible=(r:ObservationRow,depth=0):boolean=>{
  if(depth>8)throw new MacroDbError('rpc_failed','ancestry_too_deep');
  if(r.status!=='ok'||Date.parse(r.available_at)>cutoffMs)return false;
  const b=batches[r.batch_id];if(b&&!['success','partial'].includes(b.status))return false;
  if(!b?.finished_at||!Number.isFinite(Date.parse(b.finished_at)))throw new Error('historical_cutoff_unsupported');
  if(Date.parse(b.finished_at)>cutoffMs)return false;
  return (r.derived_from??[]).every(id=>{const ancestor=found.get(id);return !!ancestor&&eligible(ancestor,depth+1);});
 };
 const byPeriod=new Map<string,ObservationRow>();
 for(const r of [...candidates].sort((a,b)=>b.version-a.version))if(!byPeriod.has(r.period_end)&&eligible(r))byPeriod.set(r.period_end,r);
 if(byPeriod.size>maxRows)throw new MacroDbError('truncated',`eligible_history_asof:>${maxRows}`);
 return [...byPeriod.values()].sort((a,b)=>a.period_end.localeCompare(b.period_end));
}
const CONTRACT_CODES=['stale_publisher','invalid_manifest','quota_exceeded','not_found','already_resolved','reject_only','fenced','quarantine_closed','truncated'] as const;
interface PgErrorLike{message?:string;code?:string}
export function toMacroDbError(e:PgErrorLike):MacroDbError{
 const m=String(e?.message??'');
 const hit=CONTRACT_CODES.find(c=>m===c||m.startsWith(`${c}:`));
 return new MacroDbError(hit??'rpc_failed',m||'rpc_failed');
}

// ---------------------------------------------------------------- row normalisation (PostgREST → contract types)
const iso=(v:unknown):string=>{const t=Date.parse(String(v));if(!Number.isFinite(t))throw new MacroDbError('rpc_failed',`invalid_timestamp:${String(v).slice(0,40)}`);return new Date(t).toISOString();};
const strOrNull=(v:unknown)=>v===null||v===undefined?null:String(v);
export function observationFromRow(r:Record<string,unknown>):ObservationRow{
 return {observation_id:String(r.observation_id),series_id:String(r.series_id),period_end:String(r.period_end),value_text:String(r.value_text),version:Number(r.version),
  available_at:iso(r.available_at),availability_basis:'first_seen',ingested_at:iso(r.ingested_at),status:r.status as ObservationStatus,
  retrieval_id:strOrNull(r.retrieval_id),locator:(r.locator??null) as Locator|null,derived_from:Array.isArray(r.derived_from)?r.derived_from.map(String):null,
  transform:strOrNull(r.transform),code_version:String(r.code_version),batch_id:String(r.batch_id)};
}
export function snapshotFromRow(r:Record<string,unknown>):SnapshotRecord{
 const c=(r.catalog_counts??{}) as Record<string,unknown>;
 return {snapshot_id:String(r.snapshot_id),region:r.region as Region,as_of:String(r.as_of),revision:Number(r.revision),methodology_version:String(r.methodology_version),
  catalog_version:String(r.catalog_version),observation_ids:Array.isArray(r.observation_ids)?r.observation_ids.map(String):[],history_ids:Array.isArray(r.history_ids)?r.history_ids.map(String):[],
  catalog_counts:{verified:Number(c.verified),missing:Number(c.missing),restricted:Number(c.restricted)},status:r.status as SnapshotRecord['status'],
  failure_reason:strOrNull(r.failure_reason),created_at:iso(r.created_at)};
}
export function regimeFromRow(r:Record<string,unknown>):RegimeRecord{
 return {snapshot_id:String(r.snapshot_id),region:r.region as Region,regime:(r.regime??null) as RegimeRecord['regime'],contributions:(Array.isArray(r.contributions)?r.contributions:[]) as RegimeRecord['contributions'],rules_version:String(r.rules_version),uncovered_weight:Number(r.uncovered_weight)};
}
export function evidenceFromRow(r:Record<string,unknown>):EvidenceObject{
 return {sha256:String(r.sha256),object_path:String(r.object_path),adapter:r.adapter as EvidenceObject['adapter'],content_type:String(r.content_type),byte_length:Number(r.byte_length),created_at:iso(r.created_at)};
}
export function retrievalFromRow(r:Record<string,unknown>):Retrieval{
 return {retrieval_id:String(r.retrieval_id),sha256:String(r.sha256),fetch_url:String(r.fetch_url),fetch_host:String(r.fetch_host),http_status:Number(r.http_status),fetched_at:iso(r.fetched_at),batch_id:String(r.batch_id),tool_versions:(r.tool_versions??{}) as Record<string,string>};
}
const countsOf=(v:unknown):ChunkCounts=>{const c=(v??{}) as Record<string,unknown>;return {fetched:Number(c.fetched),inserted:Number(c.inserted),duplicates:Number(c.duplicates),versioned:Number(c.versioned),quarantined:Number(c.quarantined),failed:Number(c.failed)};};
const errorsOf=(v:unknown):ChunkError[]=>(Array.isArray(v)?v:[]).map(e=>{const o=(e??{}) as Record<string,unknown>;return {code:String(o.code),...(o.key!==undefined?{key:String(o.key)}:{}),...(o.message!==undefined?{message:String(o.message)}:{})};});
const stringsOf=(v:unknown):string[]=>(Array.isArray(v)?v:[]).map(String);
export function chunkFromRow(r:Record<string,unknown>):ChunkRecord{
 return {seq:Number(r.seq),total:Number(r.total),state:r.state==='done'?'done':'processing',counts:countsOf(r.counts),native_usable:Number(r.native_usable??0),errors:errorsOf(r.errors),claim_keys:stringsOf(r.claim_keys),located_keys:stringsOf(r.located_keys)};
}
const progressOf=(v:unknown):FinishProgress=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as FinishProgress;

/** Highest version per period_end; input sorted by (period_end, version) ascending. */
export function highestPerPeriod(rows:ObservationRow[]):ObservationRow[]{
 const out:ObservationRow[]=[];
 for(const r of rows){const last=out[out.length-1];if(last&&last.period_end===r.period_end){if(r.version>last.version)out[out.length-1]=r;}else out.push(r);}
 return out;
}
/** Splits rows into calls of ≤ size rows, keeping every (series_id, period_end) group in one call (conflicting_rows is decided per call); groups keep first-appearance order. */
export function packWrites(rows:ObservationWrite[],size=WRITE_CHUNK):ObservationWrite[][]{
 const groups=new Map<string,ObservationWrite[]>();
 for(const r of rows){const k=`${r.series_id}|${r.period_end}`;const g=groups.get(k);if(g)g.push(r);else groups.set(k,[r]);}
 const out:ObservationWrite[][]=[];let cur:ObservationWrite[]=[];
 for(const g of groups.values()){
  if(cur.length>0&&cur.length+g.length>size){out.push(cur);cur=[];}
  cur.push(...g);
 }
 if(cur.length>0)out.push(cur);
 return out;
}
export function mergeResults(parts:WriteResult[]):WriteResult{
 const out:WriteResult={inserted:0,duplicates:0,versioned:0,quarantined:0,conflicts:[]};
 for(const p of parts){out.inserted+=Number(p.inserted);out.duplicates+=Number(p.duplicates);out.versioned+=Number(p.versioned);out.quarantined+=Number(p.quarantined);out.conflicts.push(...(p.conflicts??[]));}
 return out;
}
export function publishArgs(i:PublishInput){
 return {p_region:i.region,p_expected_revision:i.expectedRevision,p_expected_input_revision:i.expectedInputRevision,p_as_of:i.asOf,p_methodology_version:i.methodologyVersion,
  p_catalog_version:i.catalogVersion,p_observation_ids:i.observationIds,p_history_ids:i.historyIds,p_catalog_counts:i.catalogCounts,p_regime:i.regime,p_contributions:i.contributions,
  p_rules_version:i.rulesVersion,p_uncovered_weight:i.uncoveredWeight,p_publish_key:i.publishKey??null,p_batch_id:i.batchId??null,p_owner_token:i.ownerToken??null,p_finish_token:i.finishToken??null};
}
/** Interval literal for the lease RPC (ms precision; PostgreSQL parses 'N milliseconds'). */
const msInterval=(ms:number)=>`${Math.max(1,Math.round(ms))} milliseconds`;

// MACRO-P3-LATENCY
export const HISTORY_PAGE_CONCURRENCY=8;
interface Res{data:unknown;error:PgErrorLike|null;count?:number|null}
// /MACRO-P3-LATENCY
// The query builder is left untyped on purpose (same as src/lib/facts/db.ts): the hand-maintained
// Database type lacks the Relationships/Views that supabase-js inference now needs.
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<Res>;from:(table:string)=>any}
type Query=PromiseLike<Res>&{range:(from:number,to:number)=>Query};

export function supabaseMacroDb(clients:{admin:SupabaseClient;anon:SupabaseClient}):MacroDb{
 const admin=clients.admin as unknown as NarrowClient;const anon=clients.anon as unknown as NarrowClient;
 const call=async<T>(c:NarrowClient,fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toMacroDbError(error);return data as T;};
 const rows=async(q:PromiseLike<Res>):Promise<Record<string,unknown>[]>=>{const {data,error}=await q;if(error)throw toMacroDbError(error);return (data??[]) as Record<string,unknown>[];};
 const maybe=async(q:PromiseLike<Res>):Promise<Record<string,unknown>|null>=>{const {data,error}=await q;if(error)throw toMacroDbError(error);return (data??null) as Record<string,unknown>|null;};
 /** `make` builds the filtered AND ordered query afresh per page; pages until a short page or `limit` rows. */
 const pageAll=async(make:()=>Query,limit:number):Promise<Record<string,unknown>[]>=>{
  const out:Record<string,unknown>[]=[];
  for(let from=0;;from+=READ_PAGE){
   const size=Math.min(READ_PAGE,limit-out.length);
   if(size<=0)return out;
   const part=await rows(make().range(from,from+size-1));
   out.push(...part);
   if(part.length<size)return out;
  }
 };
 const asOfReads={
  async candidates(id:string,o:{to:string;asOf:string},offset:number):Promise<ObservationRow[]>{
   return (await rows(admin.from('macro_observations').select('*,batch:ingest_batches!inner(status,finished_at)')
    .eq('series_id',id).eq('status','ok').lte('period_end',o.to).lte('available_at',o.asOf)
    .in('batch.status',['success','partial']).or(`finished_at.lte.${o.asOf},finished_at.is.null`,{referencedTable:'batch'})
    .order('period_end',{ascending:false}).order('version',{ascending:false}).range(offset,offset+READ_PAGE-1))).map(observationFromRow);
  },
  async observations(ids:string[]):Promise<ObservationRow[]>{
   const out:ObservationRow[]=[];
   for(let i=0;i<ids.length;i+=IN_CHUNK)out.push(...(await rows(admin.from('macro_observations').select('*').in('observation_id',ids.slice(i,i+IN_CHUNK)))).map(observationFromRow));
   return out;
  },
  async receipts(ids:string[]):Promise<Record<string,{status:string;finished_at:string|null}>>{
   const out:Record<string,{status:string;finished_at:string|null}>={};
   for(let i=0;i<ids.length;i+=IN_CHUNK)for(const r of await rows(admin.from('ingest_batches').select('batch_id,status,finished_at').in('batch_id',ids.slice(i,i+IN_CHUNK))))
    out[String(r.batch_id)]={status:String(r.status),finished_at:r.finished_at==null?null:iso(r.finished_at)};
   return out;
  },
 };
 return {
  async batchFinishedAt(batchIds){
   const out:Record<string,string|null>={};
   for(const id of [...new Set(batchIds)])out[id]=null;
   for(let i=0;i<batchIds.length;i+=IN_CHUNK){
    const got=await rows(admin.from('ingest_batches').select('batch_id,status,finished_at').in('batch_id',batchIds.slice(i,i+IN_CHUNK)));
    for(const r of got)out[String(r.batch_id)]=(r.status==='success'||r.status==='partial')&&r.finished_at!=null?iso(r.finished_at):null;
   }
   return out;
  },
  async upsertCatalog(defs,catalogVersion,rulesVersion){await call(admin,'macro_upsert_catalog',{p_catalog_version:catalogVersion,p_rules_version:rulesVersion,p_defs:defs});},
  async putRetrieval(obj,r,ownerToken){
   return String(await call<string>(admin,'macro_put_retrieval',{p_sha256:obj.sha256,p_object_path:obj.object_path,p_adapter:obj.adapter,p_content_type:obj.content_type,p_byte_length:obj.byte_length,
    p_fetch_url:r.fetch_url,p_fetch_host:r.fetch_host,p_http_status:r.http_status,p_fetched_at:r.fetched_at,p_batch_id:r.batch_id,p_tool_versions:r.tool_versions,p_owner_token:ownerToken??null}));
  },
  async evidenceObject(sha256){const r=await maybe(anon.from('macro_evidence_objects').select('*').eq('sha256',sha256).maybeSingle());return r?evidenceFromRow(r):null;},
  async retrieval(id){const r=await maybe(anon.from('macro_retrievals').select('*').eq('retrieval_id',id).maybeSingle());return r?retrievalFromRow(r):null;},
  async retrievalsOf(sha256){
   return (await rows(anon.from('macro_retrievals').select('*').eq('sha256',sha256).order('fetched_at',{ascending:true}).order('retrieval_id',{ascending:true}).range(0,READ_PAGE-1))).map(retrievalFromRow);
  },
  async retrievalsByIds(ids){
   const uniq=[...new Set(ids)];const found=new Map<string,Retrieval>();
   for(let i=0;i<uniq.length;i+=IN_CHUNK){
    for(const r of await rows(anon.from('macro_retrievals').select('*').in('retrieval_id',uniq.slice(i,i+IN_CHUNK))))found.set(String(r.retrieval_id),retrievalFromRow(r));
   }
   return uniq.flatMap(id=>{const r=found.get(id);return r?[r]:[];});
  },
  async claimIngest(batchId,dataset,o){
   const r=await call<{status:string;owner_token?:string|null;aborted?:unknown[];holder?:string|null}>(admin,'macro_claim_ingest',
    {p_batch_id:batchId,p_dataset:dataset,p_max_age:msInterval(o.maxAgeMs),p_processing_timeout:msInterval(o.processingTimeoutMs),p_takeover:o.takeover});
   if(r?.status!=='claimed'&&r?.status!=='busy')throw new MacroDbError('rpc_failed',`unexpected_claim_result:${String(r?.status)}`);
   if(r.status==='claimed'&&!r.owner_token)throw new MacroDbError('rpc_failed','claim_without_owner_token');
   return {status:r.status,ownerToken:r.status==='claimed'?String(r.owner_token):null,aborted:stringsOf(r.aborted),holder:r.holder?String(r.holder):null};
  },
  async claimChunk(batchId,seq,total,ownerToken){
   const r=await call<{status:string;chunk?:Record<string,unknown>}>(admin,'macro_claim_chunk',{p_batch_id:batchId,p_seq:seq,p_total:total,p_owner_token:ownerToken});
   if(r?.status==='claimed')return {status:'claimed'};
   if((r?.status==='processing'||r?.status==='done')&&r.chunk)return {status:r.status,chunk:chunkFromRow(r.chunk)};
   throw new MacroDbError('rpc_failed',`unexpected_chunk_result:${String(r?.status)}`);
  },
  async completeChunk(batchId,seq,res,ownerToken){
   return chunkFromRow(await call<Record<string,unknown>>(admin,'macro_complete_chunk',{p_batch_id:batchId,p_seq:seq,p_counts:res.counts,p_native_usable:res.nativeUsable,p_errors:res.errors,p_claim_keys:res.claimKeys,p_located_keys:res.locatedKeys,p_owner_token:ownerToken}));
  },
  async chunksOf(batchId){
   const got=await pageAll(()=>admin.from('macro_ingest_chunks').select('*').eq('batch_id',batchId).order('seq',{ascending:true}) as Query,Number.MAX_SAFE_INTEGER);
   return got.map(chunkFromRow);
  },
  async ingestRun(batchId){
   const r=await maybe(admin.from('macro_ingest_runs').select('dataset,state,finish_progress').eq('batch_id',batchId).maybeSingle());
   return r?{dataset:String(r.dataset),state:r.state as IngestRunState,progress:progressOf(r.finish_progress)}:null;
  },
  async beginFinish(batchId,total,ownerToken){
   const r=await call<{status:string;missing?:unknown[];progress?:unknown;finish_token?:string|null}>(admin,'macro_begin_finish',{p_batch_id:batchId,p_total:total,p_owner_token:ownerToken});
   if(r?.status==='incomplete')return {status:'incomplete',missing:(r.missing??[]).map(Number)};
   if(r?.status==='finishing'&&r.finish_token)return {status:'finishing',progress:progressOf(r.progress),finishToken:String(r.finish_token)};
   if(r?.status==='finished')return {status:'finished',progress:progressOf(r.progress)};
   throw new MacroDbError('rpc_failed',`unexpected_finish_result:${String(r?.status)}`);
  },
  async recordFinishStep(batchId,step,data,fence){
   return progressOf(await call(admin,'macro_record_finish_step',{p_batch_id:batchId,p_step:step,p_data:data,p_owner_token:fence.ownerToken,p_finish_token:fence.finishToken}));
  },
  async finalizeBatch(batchId,input,fence){
   const r=await call<{status?:string;finalized?:boolean}>(admin,'macro_finalize_batch',{p_batch_id:batchId,p_owner_token:fence?.ownerToken??null,p_finish_token:fence?.finishToken??null,
    p_status:input.status,p_counts:input.counts,p_errors:input.errors,p_finished_at:input.finishedAt});
   if(!r||typeof r.status!=='string'||typeof r.finalized!=='boolean')throw new MacroDbError('rpc_failed','unexpected_finalize_result');
   return {status:r.status as FinalizeResult['status'],finalized:r.finalized};
  },
  async recordFreshness(batchId,input,fence){
   return progressOf(await call(admin,'macro_record_freshness',{p_batch_id:batchId,p_owner_token:fence.ownerToken,p_finish_token:fence.finishToken,
    p_dataset:input.dataset,p_ok:input.ok,p_cadence:input.cadence,p_now:input.now,p_detail:input.detail}));
  },
  async writeObservations(batchId,codeVersion,input,ownerToken){
   // ONE RPC = one transaction (review T3-1): a later failure can never discard committed counts / conflict ids. Callers that
   // need several calls chunk with packWrites and merge the receipts with mergeResults themselves.
   if(input.length===0)return mergeResults([]);
   return mergeResults([await call<WriteResult>(admin,'macro_write_observations',{p_batch:batchId,p_code_version:codeVersion,p_rows:input,p_owner_token:ownerToken??null})]);
  },
  async latestObservations(ids,opts){
   if(ids.length===0)return [];
   return (await rows(anon.rpc('macro_latest_observations',{p_series_ids:ids,p_as_of:opts?.asOf??null,p_period_end_lte:opts?.periodEndLte??null}))).map(observationFromRow);
  },
  async latestEligible(ids,opts){
   if(ids.length===0)return [];
   return (await rows(admin.rpc('macro_latest_eligible_observations',{p_series_ids:ids,p_as_of:opts?.asOf??null,p_period_end_lte:opts?.periodEndLte??null,p_include_batch:opts?.includeBatch??null}))).map(observationFromRow);
  },
  async eligibleHistory(id,o){
   if(!Number.isInteger(o.maxRows)||o.maxRows<1)throw new MacroDbError('rpc_failed','invalid_max_rows');
   const out:ObservationRow[]=[];let after:string|null=null;
   for(;;){
    // one row per period; keyset paging on period_end (the RPC returns ascending, ≤ READ_PAGE per call)
    // explicit annotation (第 5 稿 P1-1): `part` feeds `after`, so inference would be circular (TS7022 under strict)
    const part:ObservationRow[]=(await rows(admin.rpc('macro_eligible_history',{p_series_id:id,p_from:o.from??null,p_to:o.to??null,p_as_of:o.asOf??null,p_include_batch:o.includeBatch??null,p_after:after,p_limit:READ_PAGE}))).map(observationFromRow);
    const lastPeriod:string|null=part.length>0?part[part.length-1].period_end:null;
    out.push(...part);
    if(out.length>o.maxRows)throw new MacroDbError('truncated',`eligible_history:${id}:>${o.maxRows}`);
    if(part.length<READ_PAGE||lastPeriod===null)return out;
    after=lastPeriod;
   }
  },
  async eligibleHistoryAsOf(id,o){
   if(!Number.isInteger(o.maxRows)||o.maxRows<1)throw new MacroDbError('rpc_failed','invalid_max_rows');
   const out:ObservationRow[]=[];let group:ObservationRow[]=[];let offset=0;
   const flush=async()=>{if(!group.length)return;out.push(...await selectEligibleHistoryAsOf(group,o.asOf,1,asOfReads.observations,asOfReads.receipts));group=[];if(out.length>o.maxRows)throw new MacroDbError('truncated',`eligible_history_asof:${id}:>${o.maxRows}`);};
   for(;;){
    const part=await asOfReads.candidates(id,o,offset);
    for(const candidate of part){if(group.length&&candidate.period_end!==group[0].period_end)await flush();group.push(candidate);}
    if(part.length<READ_PAGE){await flush();return out.sort((a,b)=>a.period_end.localeCompare(b.period_end));}
    offset+=READ_PAGE;
   }
  },
  async seriesHistory(id,o){
   if(!Number.isInteger(o.maxRows)||o.maxRows<1)throw new MacroDbError('rpc_failed','invalid_max_rows');
   // MACRO-P3-LATENCY
   const filtered=(q:any)=>{
    q=q.eq('series_id',id).eq('status','ok');
    if(o.from)q=q.gte('period_end',o.from);
    if(o.to)q=q.lte('period_end',o.to);
    if(o.asOf)q=q.lte('available_at',o.asOf);
    return q;
   };
   const make=()=>{
    const q=filtered(anon.from('macro_observations').select('*'));
    return q.order('period_end',{ascending:true}).order('version',{ascending:true}) as Query;
   };
   const limit=o.maxRows+1;
   const [first,countResult]=await Promise.all([rows(make().range(0,Math.min(READ_PAGE,limit)-1)),filtered(anon.from('macro_observations').select('*',{count:'exact',head:true})) as PromiseLike<Res>]);
   if(countResult.error)throw toMacroDbError(countResult.error);
   let got:Record<string,unknown>[];
   if(typeof countResult.count!=='number'||!Number.isInteger(countResult.count)||countResult.count<0){
    got=[...first];
    for(let from=READ_PAGE;first.length===Math.min(READ_PAGE,limit)&&got.length<limit;from+=READ_PAGE){
     const size=Math.min(READ_PAGE,limit-got.length),part=await rows(make().range(from,from+size-1));
     got.push(...part);if(part.length<size)break;
    }
   }else{
    const n=Math.min(countResult.count,limit),starts=Array.from({length:Math.max(0,Math.ceil(n/READ_PAGE)-1)},(_,i)=>(i+1)*READ_PAGE);
    const pages:Record<string,unknown>[][]=Array(starts.length);let next=0;
    await Promise.all(Array.from({length:Math.min(HISTORY_PAGE_CONCURRENCY,starts.length)},async()=>{
     for(;;){const index=next++;if(index>=starts.length)return;const from=starts[index];pages[index]=await rows(make().range(from,Math.min(from+READ_PAGE,n)-1));}
    }));
    got=[...first,...pages.flat()];
   }
   // /MACRO-P3-LATENCY
   if(got.length>o.maxRows)throw new MacroDbError('truncated',`series_history:${id}:>${o.maxRows}`);
   return highestPerPeriod(got.map(observationFromRow));
  },
  async versionsOf(id,periodEnd){
   // paged to completion (review T3-2): PostgREST silently caps a response at max_rows
   const got=await pageAll(()=>anon.from('macro_observations').select('*').eq('series_id',id).eq('period_end',periodEnd).eq('status','ok').order('version',{ascending:true}) as Query,Number.MAX_SAFE_INTEGER);
   return got.map(observationFromRow);
  },
  async observationsByIds(ids){
   // MACRO-P3-LATENCY
   const uniq=[...new Set(ids)];const found=new Map<string,ObservationRow>();
   const chunks=[] as Promise<Record<string,unknown>[]>[];
   for(let i=0;i<uniq.length;i+=IN_CHUNK)chunks.push(rows(anon.from('macro_observations').select('*').in('observation_id',uniq.slice(i,i+IN_CHUNK)).eq('status','ok')));
   for(const part of await Promise.all(chunks))for(const r of part)found.set(String(r.observation_id),observationFromRow(r));
   // /MACRO-P3-LATENCY
   return uniq.flatMap(id=>{const o=found.get(id);return o?[o]:[];});
  },
  async publishState(region){
   const r=await maybe(admin.from('macro_publish_state').select('revision,input_revision').eq('region',region).maybeSingle());
   if(!r)throw new MacroDbError('not_found',`publish_state:${region}`);
   return {revision:Number(r.revision),inputRevision:Number(r.input_revision)};
  },
  async linkQuarantine(quarantineId,observationIds,fence){
   return Number(await call(admin,'macro_link_quarantine',{p_quarantine_id:quarantineId,p_observation_ids:observationIds,p_batch_id:fence?.batchId??null,p_owner_token:fence?.ownerToken??null}));
  },
  async quarantineMembers(quarantineId){
   // review T3-2: member ids paged to completion in primary-key order, observations fetched in IN_CHUNK batches
   const ids=(await pageAll(()=>admin.from('macro_quarantine_members').select('observation_id').eq('quarantine_id',quarantineId).order('observation_id',{ascending:true}) as Query,Number.MAX_SAFE_INTEGER)).map(r=>String(r.observation_id));
   if(ids.length===0)return [];
   const obs:ObservationRow[]=[];
   for(let i=0;i<ids.length;i+=IN_CHUNK)obs.push(...(await rows(admin.from('macro_observations').select('*').in('observation_id',ids.slice(i,i+IN_CHUNK)))).map(observationFromRow));   // service: every status
   return obs.sort((a,b)=>a.version-b.version).map((o):QuarantineMember=>({observation_id:o.observation_id,series_id:o.series_id,period_end:o.period_end,value_text:o.value_text,version:o.version,status:o.status}));
  },
  async resolveConflict(quarantineId,decision,resolvedBy,observationId){await call(admin,'macro_resolve_conflict',{p_quarantine_id:quarantineId,p_decision:decision,p_resolved_by:resolvedBy,p_observation_id:observationId??null});},
  async publishSnapshot(i){
   const r=await call<{snapshot_id:string;revision:number|string;replayed?:boolean}>(admin,'publish_macro_snapshot',publishArgs(i));
   return {snapshot_id:String(r.snapshot_id),revision:Number(r.revision),replayed:r.replayed===true};
  },
  async republishSnapshot(snapshotId,expectedRevision,expectedInputRevision){
   const r=await call<{snapshot_id:string;revision:number|string}>(admin,'republish_macro_snapshot',{p_snapshot_id:snapshotId,p_expected_revision:expectedRevision,p_expected_input_revision:expectedInputRevision});
   return {snapshot_id:String(r.snapshot_id),revision:Number(r.revision)};
  },
  async recordFailedSnapshot(i){return String(await call<string>(admin,'record_failed_macro_snapshot',{p_region:i.region,p_as_of:i.asOf,p_methodology_version:i.methodologyVersion,p_catalog_version:i.catalogVersion,p_reason:i.reason}));},
  async activeSnapshot(region){const r=await maybe(anon.from('macro_snapshots').select('*').eq('region',region).eq('status','active').maybeSingle());return r?snapshotFromRow(r):null;},
  async snapshot(id){const r=await maybe(anon.from('macro_snapshots').select('*').eq('snapshot_id',id).maybeSingle());return r?snapshotFromRow(r):null;},
  async snapshotsSince(marker,limit){
   if(limit<=0)return [];
   return (await rows(anon.rpc('macro_snapshots_since',{p_created_at:marker?.created_at??null,p_snapshot_id:marker?.snapshot_id??null,p_limit:Math.min(limit,1000)}))).map(snapshotFromRow);
  },
  async previousSnapshot(region,beforeCreatedAt){
   const r=await maybe(anon.from('macro_snapshots').select('*').eq('region',region).neq('status','failed').lt('created_at',beforeCreatedAt)
    .order('created_at',{ascending:false}).order('snapshot_id',{ascending:false}).limit(1).maybeSingle());
   return r?snapshotFromRow(r):null;
  },
  // service-only table (第 6 稿 P1-2): never through the anon key
  async regimeOf(id){const r=await maybe(admin.from('macro_regime_results').select('*').eq('snapshot_id',id).maybeSingle());return r?regimeFromRow(r):null;},
 };
}
