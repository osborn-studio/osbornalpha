// src/lib/macro/memory-db.ts
// In-memory MacroDb with the semantics of the Task 1 SQL functions: catalog append + mirror,
// evidence objects + per-fetch retrievals (host/path/precision checks), the observation write rules
// (conflicting_rows, missing_evidence, missing_input, stale_delivery, inserted, duplicate,
// versioned, unexpected_revision, conflict observation ids, input_revision bump), publication
// eligibility (ok + batch success/partial + ancestors, includeBatch), publish / republish with
// stale_publisher / invalid_manifest, failed snapshots, quarantine members and conflict resolution
// with an audit row, the ingest lease, chunk claims and finish progress, and ok-only reads. Every
// write validates the whole call first and commits atomically (one SQL call). Reads return copies.
// 第 5 稿: owner-token fence on every ingest mutation (assertOwner = SQL macro_assert_owner), takeover → 'aborted',
// rotating finish tokens, publish-key replay, previously_rejected before any action, quarantine reuse only from
// eligible / current batches, member_ineligible, quarantine_closed on a closed item. 第 6 稿: finalizeBatch / recordFreshness
// write the injected DQ TableClient (opts.tables) after the same token checks as the SQL; native_usable on chunks; a closed
// item whose exact member this item disposed of completes the link (0); claimIngest declares its batch running.
// There is no ingest_batches table here: setBatchStatus declares a batch's status and a batch never
// declared counts as success (= SQL after finishBatch). For unit tests and the shared contract.
import {randomUUID} from 'node:crypto';
import {recordAttempt} from '../dq/freshness';
import type {TableClient} from '../db/table-client';
import {canonicalJson} from './catalog';
import {MacroDbError,highestPerPeriod} from './db';
import type {MacroDb} from './db';
import type {ChunkCounts,ChunkRecord,EvidenceObject,FinalizeResult,FinishFence,FinishProgress,IngestRunState,MacroSeriesDef,ObservationRow,ObservationWrite,QuarantineMember,Region,RegimeRecord,Retrieval,SnapshotRecord,WriteResult} from './types';

const VALUE=/^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERIES_ID=/^[A-Z][A-Z0-9_]{0,63}$/;
const NATURAL_KEY=/^[A-Z][A-Z0-9_]{0,63}\|\d{4}-\d{2}-\d{2}$/;
const CHUNK_KEYS=['fetched','inserted','duplicates','versioned','quarantined','failed'] as const;
const FINISH_STEPS=['derived','batch_finished','published','publish_attempt','receipt'] as const;   // freshness_recorded: recordFreshness only (第 6 稿 P1-1)
const FINAL_STATUSES=['success','partial','failed','rejected'] as const;
const CADENCES=['daily','monthly','quarterly','event'] as const;
const MAX_ATTEMPTS=20;
const DATASET=/^macro\.[a-z0-9_]{1,32}$/;
const rpc=(m:string)=>new MacroDbError('rpc_failed',m);
const fenced=()=>new MacroDbError('fenced');
export type MemoryBatchStatus='running'|'success'|'partial'|'failed'|'rejected';
const validDate=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(`${s}T00:00:00Z`))&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s;
const msOf=(s:string)=>Date.parse(s);
const clone=<T>(v:T):T=>structuredClone(v);

export interface QuarantineItem{id:string;dataset:string;table_name:string;natural_key:string;reason_code:string;batch_id:string;status:'open'|'resolved_accept'|'resolved_reject';resolved_by:string|null;resolved_at:string|null}
export interface AuditRow{user_id:string;action:string;object_type:string;object_id:string;detail:Record<string,unknown>}
export interface MemoryMacroDb extends MacroDb{
 setNow(iso:string):void;
 /** Declares a batch's ingest_batches status (undeclared batches count as 'success'). */
 setBatchStatus(batchId:string,status:MemoryBatchStatus):void;
 /** Registers an open dq_quarantine item; `id` lets a test mirror the TableClient's dq_quarantine rows (Task 6). */
 addQuarantineItem(i:{id?:string;dataset:string;table_name?:string;natural_key:string;reason_code?:string;batch_id:string}):string;
 quarantineItem(id:string):QuarantineItem|undefined;
 readonly audit:readonly AuditRow[];
 /** Every observation incl. quarantined (tests only; MacroDb reads are ok-only). */
 allObservations():ObservationRow[];
}

/** opts.tables: the DQ TableClient finalizeBatch / recordFreshness write (ingest_batches, dq_freshness) — route tests pass the same
 *  memoryTableClient the route uses; without it those two methods throw rpc_failed:memory_tables_required. */
export function memoryMacroDb(opts:{tables?:TableClient}={}):MemoryMacroDb{
 let fixedNow:string|null=null;let lastMs=0;
 // Real-clock timestamps are strictly increasing (SQL now() has µs resolution; two writes in one ms must still order),
 // so previousSnapshot / snapshotsSince see insertion order. setNow pins the clock exactly (tests).
 const now=()=>{if(fixedNow)return fixedNow;const ms=Math.max(Date.now(),lastMs+1);lastMs=ms;return new Date(ms).toISOString();};
 const catalogVersions=new Map<string,{json:string;rules:string}>();
 const series=new Map<string,MacroSeriesDef>();
 const evidence=new Map<string,EvidenceObject>();
 const retrievals=new Map<string,Retrieval>();
 let observations:ObservationRow[]=[];
 const snapshots:SnapshotRecord[]=[];
 const regimes=new Map<string,RegimeRecord>();
 const state:Record<Region,{revision:number;inputRevision:number}>={US:{revision:0,inputRevision:0},CN:{revision:0,inputRevision:0}};
 const chunks=new Map<string,Map<number,ChunkRecord>>();
 const chunkReceivedMs=new Map<string,number>();                                                      // `${batch}|${seq}` → claim time
 interface Run{dataset:string;state:IngestRunState;progress:FinishProgress;createdMs:number;ownerToken:string;processingTimeoutMs:number;finishToken:string|null}
 const runs=new Map<string,Run>();
 const publishKeys=new Map<string,string>();                                                           // publish_key → snapshot_id
 const batchStatus=new Map<string,MemoryBatchStatus>();
 const items=new Map<string,QuarantineItem>();
 const members=new Map<string,Set<string>>();
 const audit:AuditRow[]=[];
 const zeroCounts=():ChunkCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});
 const needTables=():TableClient=>{if(!opts.tables)throw rpc('memory_tables_required');return opts.tables;};
 // ---- run lock (四轮 P2-1): SQL holds the run row FOR UPDATE until commit (claim: the dataset advisory lock, then the live runs'
 // rows; record_freshness: also the dq_freshness:<dataset> advisory lock). finalizeBatch / recordFreshness await the TableClient,
 // so without a lock they would yield between the token check and the write. Every fenced method runs under FIFO promise-chain
 // locks keyed `run:<batch_id>` (plus `dataset:` / `freshness:`) held through completion of its awaited mutations. Keys are taken
 // in sorted order; only claimIngest takes several run keys and it holds its dataset key first, so there is no cycle.
 const tails=new Map<string,Promise<void>>();
 const acquire=async(key:string):Promise<()=>void>=>{
  const prev=tails.get(key)??Promise.resolve();
  let release!:()=>void;const mine=new Promise<void>(r=>{release=r;});
  const tail=prev.then(()=>mine);tails.set(key,tail);
  await prev;
  return ()=>{release();if(tails.get(key)===tail)tails.delete(key);};
 };
 const locked=async<T>(keys:readonly (string|null|undefined)[],fn:()=>Promise<T>):Promise<T>=>{
  const held:(()=>void)[]=[];
  try{for(const k of [...new Set(keys.filter((k):k is string=>!!k))].sort())held.push(await acquire(k));return await fn();}
  finally{for(const r of held.reverse())r();}
 };
 const runKey=(batchId:string|null|undefined)=>batchId?`run:${batchId}`:null;

 // ---- publication eligibility (SQL macro_ineligible_ids)
 const batchOk=(b:string,include?:string|null)=>b===include||['success','partial'].includes(batchStatus.get(b)??'success');
 const byId=(id:string)=>observations.find(o=>o.observation_id===id);
 const eligible=(id:string,include?:string|null,depth=0):boolean=>{
  const o=byId(id);
  if(!o||o.status!=='ok'||!batchOk(o.batch_id,include))return false;
  return depth>=8||(o.derived_from??[]).every(a=>eligible(a,include,depth+1));
 };
 const manifestOk=(region:Region,ids:readonly string[])=>ids.every(id=>{const o=byId(id);return !!o&&o.status==='ok'&&series.get(o.series_id)?.region===region&&eligible(id,null);});
 // ---- owner fence (SQL macro_assert_owner, 第 5 稿 P1-3): no batch → no check; no run → token must be null; else token + state
 const assertOwner=(batchId:string|null|undefined,token:string|null|undefined,states:readonly IngestRunState[])=>{
  if(!batchId)return;
  const run=runs.get(batchId);
  if(!run){if(token!=null)throw fenced();return;}
  if(token==null||run.ownerToken!==token||!states.includes(run.state))throw fenced();
 };
 // ---- finish fence (SQL record_finish_step / finalize_batch / record_freshness, 第 6 稿 P1-1): both tokens and 'aborted' are
 // checked BEFORE the state, so an obsolete finish token is fenced even after the run finished
 const finishingRun=(batchId:string,fence:FinishFence|null|undefined)=>{
  const run=runs.get(batchId);
  if(!run)throw rpc('batch_not_claimed');
  if(!fence?.ownerToken||run.ownerToken!==fence.ownerToken||!fence.finishToken||run.finishToken!==fence.finishToken||run.state==='aborted')throw fenced();
  if(run.state!=='finishing')throw rpc('run_not_finishing');
  return run;
 };

 const validateRow=(r:ObservationWrite)=>{
  const x=r as unknown as Record<string,unknown>;
  if(!r||typeof r!=='object'||typeof x.value_text!=='string'||!VALUE.test(x.value_text)||x.value_text==='-0')throw rpc('invalid_value_text');
  if(typeof x.series_id!=='string'||typeof x.period_end!=='string'||typeof x.available_at!=='string'||typeof x.revisable!=='boolean')throw rpc('invalid_row');
  if(!validDate(x.period_end)||!Number.isFinite(msOf(x.available_at)))throw rpc('invalid_row');
  const s=series.get(x.series_id);
  if(!s||s.status!=='active'||s.aliasOf)throw rpc('invalid_series');
  if('retrieval_id' in x){
   const loc=x.locator as {kind?:unknown}|null|undefined;
   if(s.derive||'derived_from' in x||'transform' in x||!loc||typeof loc!=='object'||(loc.kind!=='csv_row'&&loc.kind!=='json_pointer'&&loc.kind!=='html_cell'))throw rpc('invalid_row');
   if(typeof x.retrieval_id!=='string'||!UUID.test(x.retrieval_id))throw rpc('invalid_row');
  }else{
   const from=x.derived_from;
   if(!s.derive||'locator' in x||!Array.isArray(from)||from.length===0||typeof x.transform!=='string'||!x.transform.startsWith(`${s.derive.kind}@`))throw rpc('invalid_row');
   if(from.some(v=>typeof v!=='string'||!UUID.test(v)))throw rpc('invalid_row');
  }
 };

 const db:MemoryMacroDb={
  setNow(iso){fixedNow=new Date(iso).toISOString();},
  setBatchStatus(batchId,status){batchStatus.set(batchId,status);},
  addQuarantineItem(i){const id=i.id??randomUUID();items.set(id,{id,dataset:i.dataset,table_name:i.table_name??'macro_observations',natural_key:i.natural_key,reason_code:i.reason_code??'unexpected_revision',batch_id:i.batch_id,status:'open',resolved_by:null,resolved_at:null});return id;},
  quarantineItem(id){const q=items.get(id);return q?clone(q):undefined;},
  get audit(){return clone(audit);},
  allObservations(){return clone(observations);},

  async upsertCatalog(defs,catalogVersion,rulesVersion){
   if(typeof catalogVersion!=='string'||!/^macro-catalog\/[0-9a-f]{12}$/.test(catalogVersion))throw rpc('invalid_catalog_version');
   if(!Array.isArray(defs)||defs.length===0)throw rpc('invalid_catalog');
   const json=canonicalJson(JSON.parse(JSON.stringify(defs)));
   const existing=catalogVersions.get(catalogVersion);
   if(existing&&existing.json!==json)throw rpc('catalog_version_conflict');
   for(const d of defs)if(!d||typeof d!=='object'||!SERIES_ID.test(d.id))throw rpc('invalid_catalog');
   if(!existing)catalogVersions.set(catalogVersion,{json,rules:rulesVersion});
   for(const d of defs)series.set(d.id,clone(d));
  },

  async putRetrieval(obj,r,ownerToken){
   assertOwner(r.batch_id,ownerToken,['open','finishing']);
   const frac=/\.(\d+)/.exec(r.fetched_at??'');
   if(typeof r.fetched_at!=='string'||!Number.isFinite(msOf(r.fetched_at))||(frac&&/[1-9]/.test(frac[1].slice(3))))throw rpc('invalid_retrieval');
   if(!/^[0-9a-f]{64}$/.test(obj.sha256))throw rpc('violates check constraint macro_evidence_objects_sha256_check');
   if(!new RegExp(`^${obj.adapter}/${obj.sha256}\\.(csv|json|html|txt)$`).test(obj.object_path))throw rpc('violates check constraint macro_evidence_path');
   let host:string|null=null;try{const u=new URL(r.fetch_url);host=/^https?:$/.test(u.protocol)?u.hostname.toLowerCase():null;}catch{host=null;}
   if(host!==r.fetch_host)throw rpc('violates check constraint macro_retrievals_host');
   const cur=evidence.get(obj.sha256);
   if(cur&&(cur.object_path!==obj.object_path||cur.adapter!==obj.adapter||cur.content_type!==obj.content_type||cur.byte_length!==obj.byte_length))throw rpc('evidence_mismatch');
   if(!cur)evidence.set(obj.sha256,{...obj,created_at:now()});
   const id=randomUUID();
   retrievals.set(id,{retrieval_id:id,sha256:obj.sha256,fetch_url:r.fetch_url,fetch_host:r.fetch_host,http_status:r.http_status,fetched_at:new Date(r.fetched_at).toISOString(),batch_id:r.batch_id,tool_versions:clone(r.tool_versions??{})});
   return id;
  },
  async evidenceObject(sha256){const e=evidence.get(sha256);return e?clone(e):null;},
  async retrieval(id){const r=retrievals.get(id);return r?clone(r):null;},
  async retrievalsOf(sha256){return [...retrievals.values()].filter(r=>r.sha256===sha256).sort((a,b)=>a.fetched_at<b.fetched_at?-1:a.fetched_at>b.fetched_at?1:a.retrieval_id<b.retrieval_id?-1:1).slice(0,1000).map(clone);},
  async retrievalsByIds(ids){return [...new Set(ids)].flatMap(id=>{const r=retrievals.get(id);return r?[clone(r)]:[];});},

  async claimIngest(batchId,dataset,o){
   if(!batchId||typeof dataset!=='string'||!DATASET.test(dataset)||!(o.maxAgeMs>0)||!(o.processingTimeoutMs>0)||typeof o.takeover!=='boolean')throw rpc('invalid_claim');
   const nowMs=msOf(now());
   const live=(r:Run)=>r.state==='open'||r.state==='finishing';
   const stalled=(id:string,r:Run)=>[...(chunks.get(id)?.values()??[])].some(c=>c.state==='processing'&&(chunkReceivedMs.get(`${id}|${c.seq}`)??nowMs)<nowMs-r.processingTimeoutMs);
   for(const [id,r] of runs){
    if(r.dataset!==dataset||!live(r))continue;
    const old=r.createdMs<nowMs-o.maxAgeMs;
    if(old||(o.takeover&&stalled(id,r))){r.state='aborted';r.progress={...r.progress,aborted:{by:batchId,reason:old?'max_age':'stalled_chunk'}};}
   }
   // every aborted run whose batch still runs (SQL joins ingest_batches; memory: a declared 'running' status)
   const aborted=[...runs].filter(([id,r])=>r.dataset===dataset&&r.state==='aborted'&&batchStatus.get(id)==='running').map(([id])=>id).sort();
   const holder=[...runs].find(([,r])=>r.dataset===dataset&&live(r));
   if(holder)return {status:'busy',ownerToken:null,aborted,holder:holder[0]};
   const ownerToken=randomUUID();
   runs.set(batchId,{dataset,state:'open',progress:{},createdMs:nowMs,ownerToken,processingTimeoutMs:o.processingTimeoutMs,finishToken:null});
   batchStatus.set(batchId,'running');                                                                 // SQL: only a running batch claims
   return {status:'claimed',ownerToken,aborted,holder:null};
  },
  async claimChunk(batchId,seq,total,ownerToken){
   if(!Number.isInteger(seq)||!Number.isInteger(total)||seq<0||total<1||total>10000||seq>=total)throw rpc('invalid_chunk');
   const run=runs.get(batchId);
   if(!run)throw rpc('batch_not_claimed');
   if(!ownerToken||run.ownerToken!==ownerToken||run.state==='aborted')throw fenced();
   const m=chunks.get(batchId)??new Map<number,ChunkRecord>();
   const stored=m.get(seq);
   if(stored)return {status:stored.state,chunk:clone(stored)};
   if(run.state!=='open')throw rpc('batch_not_open');
   const first=m.values().next().value;
   if(first&&first.total!==total)throw rpc('chunk_total_mismatch');
   m.set(seq,{seq,total,state:'processing',counts:zeroCounts(),native_usable:0,errors:[],claim_keys:[],located_keys:[]});chunks.set(batchId,m);
   chunkReceivedMs.set(`${batchId}|${seq}`,msOf(now()));
   return {status:'claimed'};
  },
  async completeChunk(batchId,seq,res,ownerToken){
   const c=res.counts as unknown as Record<string,unknown>;
   if(!c||typeof c!=='object'||Object.keys(c).length!==6||!CHUNK_KEYS.every(k=>Number.isSafeInteger(c[k])&&(c[k] as number)>=0))throw rpc('invalid_chunk');
   if(!Number.isSafeInteger(res.nativeUsable)||res.nativeUsable<0||res.nativeUsable>res.counts.inserted+res.counts.versioned+res.counts.duplicates)throw rpc('invalid_chunk');   // 第 6 稿 P2-1
   if(!Array.isArray(res.errors)||res.errors.length>500||res.errors.some(e=>!e||typeof e.code!=='string'))throw rpc('invalid_chunk');
   if(!Array.isArray(res.claimKeys)||!Array.isArray(res.locatedKeys)||[...res.claimKeys,...res.locatedKeys].some(k=>typeof k!=='string'))throw rpc('invalid_chunk');
   assertOwner(batchId,ownerToken,['open']);
   const row=chunks.get(batchId)?.get(seq);
   if(!row||row.state!=='processing')throw rpc('chunk_not_processing');
   Object.assign(row,{state:'done',counts:clone(res.counts),native_usable:res.nativeUsable,errors:clone(res.errors),claim_keys:[...res.claimKeys],located_keys:[...res.locatedKeys]});
   return clone(row);
  },
  async chunksOf(batchId){return [...(chunks.get(batchId)??new Map<number,ChunkRecord>()).values()].sort((a,b)=>a.seq-b.seq).map(clone);},
  async ingestRun(batchId){const r=runs.get(batchId);return r?{dataset:r.dataset,state:r.state,progress:clone(r.progress)}:null;},
  async beginFinish(batchId,total,ownerToken){
   if(!Number.isInteger(total)||total<0||total>10000)throw rpc('invalid_chunk');
   const run=runs.get(batchId);
   if(!run)throw rpc('batch_not_claimed');
   if(!ownerToken||run.ownerToken!==ownerToken||run.state==='aborted')throw fenced();
   if(run.state==='finished')return {status:'finished',progress:clone(run.progress)};
   if(run.state==='open'){
    const m=chunks.get(batchId)??new Map<number,ChunkRecord>();
    const missing=Array.from({length:total},(_,i)=>i).filter(i=>m.get(i)?.state!=='done');
    if(missing.length||[...m.values()].some(c=>c.total!==total||c.state!=='done'))return {status:'incomplete',missing};
   }
   const finishToken=randomUUID();run.state='finishing';run.finishToken=finishToken;                   // rotated on every begin (第 5 稿 P1-4)
   return {status:'finishing',progress:clone(run.progress),finishToken};
  },
  async recordFinishStep(batchId,step,data,fence){
   if(!(FINISH_STEPS as readonly string[]).includes(step)||!data||typeof data!=='object'||Array.isArray(data))throw rpc('invalid_step');
   const run=finishingRun(batchId,fence);
   if(step==='publish_attempt'){
    const attempts=[...(run.progress.attempts??[])];
    if(attempts.length<MAX_ATTEMPTS)attempts.push(clone(data) as NonNullable<FinishProgress['attempts']>[number]);
    run.progress={...run.progress,attempts};
   }else run.progress={...run.progress,[step]:clone(data)};
   if(step==='receipt')run.state='finished';
   return clone(run.progress);
  },
  async finalizeBatch(batchId,input,fence){
   const tables=needTables();
   const c=input?.counts as unknown as Record<string,unknown>;
   if(!input||!(FINAL_STATUSES as readonly string[]).includes(input.status)||!Number.isFinite(msOf(input.finishedAt))
      ||!c||typeof c!=='object'||Object.keys(c).length!==6||!CHUNK_KEYS.every(k=>Number.isSafeInteger(c[k])&&(c[k] as number)>=0)
      ||!Array.isArray(input.errors)||input.errors.length>101||input.errors.some(e=>!e||typeof e.code!=='string'))throw rpc('invalid_finalize');
   if(runs.has(batchId))finishingRun(batchId,fence);                                                     // owner + finish token, finishing
   else if(fence)throw fenced();                                                                         // cron: a run-less batch takes no tokens
   const [b]=await tables.select('ingest_batches',{batch_id:batchId},{limit:1});
   if(!b)throw new MacroDbError('not_found');
   if(b.status!=='running')return {status:String(b.status) as FinalizeResult['status'],finalized:false};
   const finishedAt=new Date(Math.max(msOf(input.finishedAt),msOf(String(b.started_at)))).toISOString();
   await tables.update('ingest_batches',{batch_id:batchId,status:'running'},{status:input.status,counts:clone(input.counts),errors:clone(input.errors),finished_at:finishedAt});
   batchStatus.set(batchId,input.status);                                                                // eligibility follows the written status
   return {status:input.status,finalized:true};
  },
  async recordFreshness(batchId,input,fence){
   const tables=needTables();
   if(!input||typeof input.dataset!=='string'||input.dataset.length<1||input.dataset.length>64||typeof input.ok!=='boolean'
      ||!(CADENCES as readonly string[]).includes(input.cadence)||!Number.isFinite(msOf(input.now))||!input.detail||typeof input.detail!=='object'||Array.isArray(input.detail))throw rpc('invalid_freshness');
   const run=runs.get(batchId);
   if(!run)throw rpc('batch_not_claimed');
   finishingRun(batchId,fence);
   if(input.dataset!==run.dataset)throw rpc('invalid_dataset');
   if(run.progress.freshness_recorded)return clone(run.progress);                                        // once per run
   const status=await recordAttempt(tables,input.dataset,{ok:input.ok,cadence:input.cadence,now:new Date(input.now),detail:clone(input.detail)});
   run.progress={...run.progress,freshness_recorded:{ok:input.ok,status}};
   return clone(run.progress);
  },

  async writeObservations(batchId,codeVersion,rows,ownerToken){
   if(!Array.isArray(rows))throw rpc('invalid_rows');
   if(typeof codeVersion!=='string'||codeVersion.length<1||codeVersion.length>128)throw rpc('invalid_code_version');
   assertOwner(batchId,ownerToken,['open','finishing']);
   for(const r of rows)validateRow(r);
   const obs=[...observations];const touched=new Set<Region>();
   const res:WriteResult={inserted:0,duplicates:0,versioned:0,quarantined:0,conflicts:[]};
   const groups=new Map<string,ObservationWrite[]>();
   for(const r of rows){const k=`${r.series_id}|${r.period_end}`;const g=groups.get(k);if(g)g.push(r);else groups.set(k,[r]);}
   for(const g of groups.values()){
    const {series_id,period_end}=g[0];const s=series.get(series_id)!;
    const same=obs.filter(o=>o.series_id===series_id&&o.period_end===period_end);
    // cur: highest ok version whose batch is eligible or this call's batch (rows of abandoned batches are invisible)
    const cur=same.filter(o=>o.status==='ok'&&batchOk(o.batch_id,batchId)).sort((a,b)=>b.version-a.version)[0];
    const conflict=(reason:WriteResult['conflicts'][number]['reason'],value_text:string,observation_id:string|null=null)=>res.conflicts.push({series_id,period_end,reason,value_text,current_value_text:cur?.value_text??null,observation_id});
    const distinct:string[]=[];for(const r of g)if(!distinct.includes(r.value_text))distinct.push(r.value_text);   // canonical text: string equality = numeric equality
    if(distinct.length>1){for(const v of distinct)conflict('conflicting_rows',v);res.quarantined++;continue;}
    const e=g[0];let avail:string;
    if('retrieval_id' in e){
     const ret=retrievals.get(e.retrieval_id);
     if(!ret){conflict('missing_evidence',e.value_text);continue;}
     if(msOf(e.available_at)!==msOf(ret.fetched_at))throw rpc('invalid_available_at');
     avail=ret.fetched_at;
    }else{
     const inputs=[...new Set(e.derived_from)].map(id=>obs.find(o=>o.observation_id===id&&o.status==='ok'));
     if(inputs.some(i=>!i)||[...new Set(e.derived_from)].some(id=>!eligible(id,batchId))){conflict('missing_input',e.value_text);continue;}
     const max=Math.max(...inputs.map(i=>msOf(i!.available_at)));
     if(msOf(e.available_at)!==max)throw rpc('invalid_available_at');
     avail=new Date(max).toISOString();
    }
    // rejected-value finality (第 5 稿 P1-2): before any action is chosen
    const rejected=same.filter(o=>o.status==='rejected'&&o.value_text===e.value_text).sort((a,b)=>b.version-a.version)[0];
    if(rejected){res.duplicates++;conflict('previously_rejected',e.value_text,rejected.observation_id);continue;}
    let action:'inserted'|'duplicate'|'versioned'|'stale_delivery'|'unexpected_revision';
    if(cur&&cur.value_text!==e.value_text&&msOf(avail)<msOf(cur.available_at))action='stale_delivery';
    else if(!cur)action='inserted';
    else if(cur.value_text===e.value_text)action='duplicate';
    else if(e.revisable)action='versioned';
    else action='unexpected_revision';
    if(action==='duplicate'){res.duplicates++;continue;}
    // reuse a same-value quarantined row only from an eligible or this call's batch (第 5 稿 P1-6)
    const existing=action==='inserted'||action==='versioned'?undefined
     :same.filter(o=>o.status==='quarantined'&&o.value_text===e.value_text&&batchOk(o.batch_id,batchId)).sort((a,b)=>b.version-a.version)[0];
    let obsId:string|null=existing?.observation_id??null;
    if(!existing){
     const status=action==='inserted'||action==='versioned'?'ok' as const:'quarantined' as const;
     const version=same.reduce((m,o)=>Math.max(m,o.version),0)+1;
     const prov='retrieval_id' in e
      ?{retrieval_id:e.retrieval_id,locator:clone(e.locator),derived_from:null,transform:null}
      :{retrieval_id:null,locator:null,derived_from:[...e.derived_from],transform:e.transform};
     obsId=randomUUID();
     obs.push({observation_id:obsId,series_id,period_end,value_text:e.value_text,version,available_at:avail,availability_basis:'first_seen',ingested_at:now(),status,
      ...prov,code_version:codeVersion,batch_id:batchId});
     touched.add(s.region);
    }
    if(action==='inserted')res.inserted++;
    else if(action==='versioned')res.versioned++;
    else{res.quarantined++;conflict(action,e.value_text,obsId);}
   }
   observations=obs;
   for(const r of touched)state[r].inputRevision++;
   return res;
  },

  async latestObservations(ids,opts){
   const want=new Set(ids);const best=new Map<string,ObservationRow>();
   for(const o of observations){
    if(!want.has(o.series_id)||o.status!=='ok')continue;
    if(opts?.asOf&&msOf(o.available_at)>msOf(opts.asOf))continue;
    if(opts?.periodEndLte&&o.period_end>opts.periodEndLte)continue;
    const b=best.get(o.series_id);
    if(!b||o.period_end>b.period_end||(o.period_end===b.period_end&&o.version>b.version))best.set(o.series_id,o);
   }
   return [...best.values()].sort((a,b)=>a.series_id<b.series_id?-1:1).map(clone);
  },
  async latestEligible(ids,opts){
   const want=new Set(ids);const best=new Map<string,ObservationRow>();
   for(const o of observations){
    if(!want.has(o.series_id)||!eligible(o.observation_id,opts?.includeBatch))continue;
    if(opts?.asOf&&msOf(o.available_at)>msOf(opts.asOf))continue;
    if(opts?.periodEndLte&&o.period_end>opts.periodEndLte)continue;
    const b=best.get(o.series_id);
    if(!b||o.period_end>b.period_end||(o.period_end===b.period_end&&o.version>b.version))best.set(o.series_id,o);
   }
   return [...best.values()].sort((a,b)=>a.series_id<b.series_id?-1:1).map(clone);
  },
  async eligibleHistory(id,o){
   if(!Number.isInteger(o.maxRows)||o.maxRows<1)throw rpc('invalid_max_rows');
   const got=highestPerPeriod(observations.filter(x=>x.series_id===id&&eligible(x.observation_id,o.includeBatch)&&(!o.from||x.period_end>=o.from)&&(!o.to||x.period_end<=o.to)&&(!o.asOf||msOf(x.available_at)<=msOf(o.asOf)))
    .sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:a.version-b.version));
   if(got.length>o.maxRows)throw new MacroDbError('truncated',`eligible_history:${id}:>${o.maxRows}`);
   return got.map(clone);
  },
  async seriesHistory(id,o){
   if(!Number.isInteger(o.maxRows)||o.maxRows<1)throw rpc('invalid_max_rows');
   const got=observations.filter(x=>x.series_id===id&&x.status==='ok'&&(!o.from||x.period_end>=o.from)&&(!o.to||x.period_end<=o.to)&&(!o.asOf||msOf(x.available_at)<=msOf(o.asOf)))
    .sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:a.version-b.version);
   if(got.length>o.maxRows)throw new MacroDbError('truncated',`series_history:${id}:>${o.maxRows}`);
   return highestPerPeriod(got).map(clone);
  },
  async versionsOf(id,periodEnd){return observations.filter(o=>o.series_id===id&&o.period_end===periodEnd&&o.status==='ok').sort((a,b)=>a.version-b.version).map(clone);},
  async observationsByIds(ids){return [...new Set(ids)].flatMap(id=>{const o=observations.find(x=>x.observation_id===id&&x.status==='ok');return o?[clone(o)]:[];});},
  async publishState(region){const s=state[region];if(!s)throw new MacroDbError('not_found',`publish_state:${region}`);return {...s};},

  async linkQuarantine(quarantineId,observationIds,fence){
   assertOwner(fence?.batchId,fence?.ownerToken??null,['open','finishing']);
   const q=items.get(quarantineId);
   if(!q)throw new MacroDbError('not_found');
   if(!q.dataset.startsWith('macro.')||q.table_name!=='macro_observations')throw rpc('invalid_item');
   if(q.status!=='open'){
    // 第 6 稿 P2-3: every row already a member of THIS item and disposed (ok / rejected) by its resolution → link complete
    const mine=members.get(quarantineId)??new Set<string>();
    if(Array.isArray(observationIds)&&observationIds.length>0&&observationIds.every(id=>mine.has(id)&&['ok','rejected'].includes(byId(id)?.status??'')))return 0;
    throw new MacroDbError('quarantine_closed');
   }
   if(!Array.isArray(observationIds)||observationIds.length===0||observationIds.some(id=>{const o=byId(id);return !o||(o.status!=='quarantined'&&o.status!=='rejected')||`${o.series_id}|${o.period_end}`!==q.natural_key;}))throw rpc('invalid_member');
   const m=members.get(quarantineId)??new Set<string>();let added=0;
   for(const id of observationIds)if(!m.has(id)){m.add(id);added++;}
   members.set(quarantineId,m);
   return added;
  },
  async quarantineMembers(quarantineId){
   return [...(members.get(quarantineId)??[])].map(id=>byId(id)!).sort((a,b)=>a.version-b.version)
    .map((o):QuarantineMember=>({observation_id:o.observation_id,series_id:o.series_id,period_end:o.period_end,value_text:o.value_text,version:o.version,status:o.status}));
  },
  async resolveConflict(quarantineId,decision,resolvedBy,observationId){
   if(decision!=='accept'&&decision!=='reject')throw rpc('invalid_decision');
   if(!resolvedBy)throw rpc('invalid_resolver');
   const q=items.get(quarantineId);
   if(!q)throw new MacroDbError('not_found');
   if(!q.dataset.startsWith('macro.')||q.table_name!=='macro_observations'||!NATURAL_KEY.test(q.natural_key))throw rpc('invalid_item');
   if(q.status!=='open')throw new MacroDbError('already_resolved');
   const s=series.get(q.natural_key.split('|')[0]);
   if(!s)throw rpc('invalid_item');
   const m=members.get(quarantineId)??new Set<string>();
   let rejected=0;let status:QuarantineItem['status'];
   const reject=(keep:string|null)=>{
    observations=observations.map(o=>{
     if(!m.has(o.observation_id)||o.observation_id===keep||o.status!=='quarantined')return o;
     rejected++;return {...o,status:'rejected' as const};
    });
   };
   if(decision==='accept'){
    if(q.reason_code==='adapter_mismatch'||q.reason_code.startsWith('rule_failed:'))throw new MacroDbError('reject_only');
    if(!observationId)throw rpc('observation_required');
    if(!m.has(observationId))throw rpc('not_member');
    const target=byId(observationId);
    if(target?.status!=='quarantined')throw rpc('not_quarantined');
    if(['failed','rejected'].includes(batchStatus.get(target.batch_id)??'success'))throw rpc('member_ineligible');   // 第 5 稿 P1-6
    observations=observations.map(o=>o.observation_id===observationId?{...o,status:'ok' as const}:o);
    reject(observationId);
    state[s.region].inputRevision++;
    status='resolved_accept';
   }else{
    if(observationId)throw rpc('observation_not_allowed');
    reject(null);
    status='resolved_reject';
   }
   items.set(quarantineId,{...q,status,resolved_by:resolvedBy,resolved_at:now()});
   audit.push({user_id:resolvedBy,action:'dq.quarantine_resolve',object_type:'dq',object_id:quarantineId,
    detail:{id:quarantineId,status,decision,dataset:q.dataset,natural_key:q.natural_key,reason_code:q.reason_code,observation_id:decision==='accept'?observationId!:null,rejected}});
  },

  async publishSnapshot(i){
   assertOwner(i.batchId,i.ownerToken??null,['open','finishing']);
   const st=state[i.region];
   if(!st)throw new MacroDbError('invalid_manifest');
   if(i.publishKey!==undefined&&(typeof i.publishKey!=='string'||i.publishKey.length<1||i.publishKey.length>128))throw new MacroDbError('invalid_manifest');
   const prior=i.publishKey?snapshots.find(x=>x.snapshot_id===publishKeys.get(i.publishKey!)):undefined;
   if(prior)return {snapshot_id:prior.snapshot_id,revision:prior.revision,replayed:true};          // before the revision check (第 5 稿 P1-4)
   if(st.revision!==i.expectedRevision||st.inputRevision!==i.expectedInputRevision)throw new MacroDbError('stale_publisher');
   const bad=()=>new MacroDbError('invalid_manifest');
   if(!validDate(i.asOf)||!i.methodologyVersion||i.methodologyVersion.length>64||!i.rulesVersion||i.rulesVersion.length>64||!catalogVersions.has(i.catalogVersion))throw bad();
   if(!Array.isArray(i.observationIds)||new Set(i.observationIds).size!==i.observationIds.length)throw bad();
   if(!Array.isArray(i.historyIds)||new Set(i.historyIds).size!==i.historyIds.length)throw bad();
   if(!manifestOk(i.region,i.observationIds)||!manifestOk(i.region,i.historyIds))throw bad();   // ok + region + eligible
   const c=i.catalogCounts as unknown as Record<string,unknown>;
   if(!c||typeof c!=='object'||Object.keys(c).length!==3||!['verified','missing','restricted'].every(k=>Number.isInteger(c[k])&&(c[k] as number)>=0))throw bad();
   if((i.regime!==null&&typeof i.regime!=='object')||!Array.isArray(i.contributions)||!(typeof i.uncoveredWeight==='number'&&i.uncoveredWeight>=0))throw bad();
   for(const s of snapshots)if(s.region===i.region&&s.status==='active')s.status='superseded';
   const snapshot_id=randomUUID();const revision=i.expectedRevision+1;
   snapshots.push({snapshot_id,region:i.region,as_of:i.asOf,revision,methodology_version:i.methodologyVersion,catalog_version:i.catalogVersion,observation_ids:[...i.observationIds],
    history_ids:[...i.historyIds],catalog_counts:clone(i.catalogCounts),status:'active',failure_reason:null,created_at:now()});
   regimes.set(snapshot_id,{snapshot_id,region:i.region,regime:clone(i.regime),contributions:clone(i.contributions),rules_version:i.rulesVersion,uncovered_weight:i.uncoveredWeight});
   if(i.publishKey)publishKeys.set(i.publishKey,snapshot_id);
   st.revision=revision;
   return {snapshot_id,revision,replayed:false};
  },
  async republishSnapshot(snapshotId,expectedRevision,expectedInputRevision){
   const src=snapshots.find(x=>x.snapshot_id===snapshotId);
   if(!src)throw new MacroDbError('not_found');
   if(src.status==='failed')throw new MacroDbError('invalid_manifest');
   const st=state[src.region];
   if(st.revision!==expectedRevision||st.inputRevision!==expectedInputRevision)throw new MacroDbError('stale_publisher');
   const rr=regimes.get(snapshotId);
   if(!rr||!manifestOk(src.region,src.observation_ids)||!manifestOk(src.region,src.history_ids))throw new MacroDbError('invalid_manifest');
   for(const x of snapshots)if(x.region===src.region&&x.status==='active')x.status='superseded';
   const snapshot_id=randomUUID();const revision=expectedRevision+1;
   snapshots.push({...clone(src),snapshot_id,revision,status:'active',failure_reason:null,created_at:now()});
   regimes.set(snapshot_id,{...clone(rr),snapshot_id});
   st.revision=revision;
   return {snapshot_id,revision};
  },
  async recordFailedSnapshot(i){
   const st=state[i.region];
   if(!st)throw rpc('invalid_region');
   if(typeof i.reason!=='string'||i.reason.length<1||i.reason.length>2000)throw rpc('invalid_reason');
   const snapshot_id=randomUUID();
   snapshots.push({snapshot_id,region:i.region,as_of:i.asOf,revision:st.revision,methodology_version:i.methodologyVersion,catalog_version:i.catalogVersion,observation_ids:[],
    history_ids:[],catalog_counts:{verified:0,missing:0,restricted:0},status:'failed',failure_reason:i.reason,created_at:now()});
   return snapshot_id;
  },
  async activeSnapshot(region){const s=snapshots.find(x=>x.region===region&&x.status==='active');return s?clone(s):null;},
  async snapshot(id){const s=snapshots.find(x=>x.snapshot_id===id);return s?clone(s):null;},
  async snapshotsSince(marker,limit){
   if(limit<=0)return [];
   const after=(s:SnapshotRecord)=>!marker||s.created_at>marker.created_at||(s.created_at===marker.created_at&&s.snapshot_id>marker.snapshot_id);
   return snapshots.filter(s=>s.status!=='failed'&&after(s))
    .sort((a,b)=>a.created_at<b.created_at?-1:a.created_at>b.created_at?1:a.snapshot_id<b.snapshot_id?-1:1)
    .slice(0,Math.min(limit,1000)).map(clone);
  },
  async previousSnapshot(region,beforeCreatedAt){
   const s=snapshots.filter(x=>x.region===region&&x.status!=='failed'&&x.created_at<beforeCreatedAt)
    .sort((a,b)=>a.created_at<b.created_at?1:a.created_at>b.created_at?-1:a.snapshot_id<b.snapshot_id?1:-1)[0];
   return s?clone(s):null;
  },
  async regimeOf(id){const r=regimes.get(id);return r?clone(r):null;},
 };
 // ---- every fenced method under the run lock (四轮 P2-1). Tests that monkeypatch a method replace the wrapper, as before.
 const {claimIngest,claimChunk,completeChunk,beginFinish,recordFinishStep,finalizeBatch,recordFreshness,putRetrieval,writeObservations,linkQuarantine,publishSnapshot}=db;
 db.claimChunk=(b,seq,total,t)=>locked([runKey(b)],()=>claimChunk(b,seq,total,t));
 db.completeChunk=(b,seq,res,t)=>locked([runKey(b)],()=>completeChunk(b,seq,res,t));
 db.beginFinish=(b,total,t)=>locked([runKey(b)],()=>beginFinish(b,total,t));
 db.recordFinishStep=(b,step,data,fence)=>locked([runKey(b)],()=>recordFinishStep(b,step,data,fence));
 db.finalizeBatch=(b,input,fence)=>locked([runKey(b)],()=>finalizeBatch(b,input,fence));
 db.recordFreshness=(b,input,fence)=>locked([runKey(b),typeof input?.dataset==='string'?`freshness:${input.dataset}`:null],()=>recordFreshness(b,input,fence));
 db.putRetrieval=(obj,r,t)=>locked([runKey(r?.batch_id)],()=>putRetrieval(obj,r,t));
 db.writeObservations=(b,c,rows,t)=>locked([runKey(b)],()=>writeObservations(b,c,rows,t));
 db.linkQuarantine=(q,ids,fence)=>locked([runKey(fence?.batchId)],()=>linkQuarantine(q,ids,fence));
 db.publishSnapshot=i=>locked([runKey(i?.batchId)],()=>publishSnapshot(i));
 db.claimIngest=async(batchId,dataset,o)=>{
  const releaseDataset=await acquire(`dataset:${String(dataset)}`);
  try{
   // the SQL update locks every live run row of the dataset before judging it: wait for their in-flight fenced calls
   const live=[...runs].filter(([,r])=>r.dataset===dataset&&(r.state==='open'||r.state==='finishing')).map(([id])=>runKey(id));
   return await locked([...live,runKey(batchId)],()=>claimIngest(batchId,dataset,o));
  }finally{releaseDataset();}
 };
 return db;
}
