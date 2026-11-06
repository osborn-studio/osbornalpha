// src/lib/facts/db.ts
// FactsDb (spec §4.8): the only data access the facts layer uses. Writes are SQL functions
// (rpc) because no role may touch the fact tables directly (§4.7); reads that need no snapshot
// use .from() under RLS (factsByIds, openConflicts, filingsOfIssuer, scopeDue, metricsOfIssuer,
// targetOf, lineageOf, findFilingBySourceRef, filingsForCalendar,
// and the one column-level write updateFilingLink). The functions raise with the code as the
// message (lease_lost 55P03; run_pending, run_published, mapping_gen_regression,
// stale_computation P0001); toFactsDbError maps that, 23505 → duplicate_key, the rest → unknown.
// The read_facts envelope is normalised here so all three implementations return identical rows
// (value = value_text, null sequence fields → undefined). New RPCs are not registered in
// database.types.ts (repo convention): the client is narrowed locally. Table reads that feed
// planning, evidence or scheduling are COMPLETE-SET reads: PostgREST silently truncates at
// max_rows (1,000 locally and hosted), so they page by `.range()` in a fixed order until a short
// page (audit round-1 #7); an explicit `limit` caps the total instead.
import type {SupabaseClient} from '@supabase/supabase-js';
import {FactsDbError} from './types';
import type {CalendarFiling,ConflictItem,FactRow,FactsDb,FactsDbErrorCode,FilingFactRow,FilingInsert,FilingRow,LineageConflict,LineageRev,Market,MetricRow,ReadFactsLineageResult,ReadFactsOptions,ReadFactsResult,RunStatus,ScopeRow} from './types';
import type {ApplyReconcileOutcome,CyclePairId,Fence,MemberCounts,OpenCycleResult} from '../dq/reconcile/types';
export {FactsDbError} from './types';
export type {FactsDb} from './types';

/** Rows per stage_filings / stage_facts call (§4.8). */
export const STAGE_CHUNK=500;
/** read_facts hard cap (§4.6); above it the envelope is truncated and carries no rows. */
export const READ_FACTS_CAP=10000;
/** Page size of complete-set table reads (= PostgREST max_rows). */
export const READ_PAGE=1000;
/** ids per `.in()` filter (URL length). */
export const IN_CHUNK=200;
/** attempts of a metrics read before it fails as metrics_unstable. */
export const METRICS_ATTEMPTS=3;
const MESSAGE_CODES:readonly FactsDbErrorCode[]=['run_pending','run_published','mapping_gen_regression','stale_computation','stale_plan','run_abandoned','invalid_chosen','item_not_open',
 'fence_failed','member_incomplete','stale_evaluation','batch_mismatch','invalid_choice','invalid_candidate','generation_moved','duplicate','conflict_exists','replay_required',
 'filing_not_found','not_passing','lineage_changed','scope_missing','unresolved','acceptance_conflict','source_not_active','has_referrers','topology_write_forbidden','invalid_result','use_dedicated_resolver','target_not_active','invalid_members'];

export interface PgErrorLike{message?:string;code?:string|null;details?:string|null;hint?:string|null}
/** PostgreSQL / PostgREST error → FactsDbError (shared by the Supabase and pg adapters). 23505 is checked before the head word: "duplicate key value …" must stay duplicate_key, not the plan-3 code duplicate. */
export function toFactsDbError(e:PgErrorLike):FactsDbError{
 const message=e.message??'';
 const head=message.split(/[\s:]/,1)[0];
 if(e.code==='55P03'||head==='lease_lost')return new FactsDbError('lease_lost',message||'lease_lost');
 if(e.code==='23505')return new FactsDbError('duplicate_key',message);
 if((MESSAGE_CODES as readonly string[]).includes(head))return new FactsDbError(head as FactsDbErrorCode,message);
 return new FactsDbError('unknown',message||'unknown');
}

export interface ReadFactsEnvelope{state_rev:number|string;rows:Record<string,unknown>[];truncated:boolean;row_count:number}
export function rowFromEnvelope(r:Record<string,unknown>):FactRow{
 const seq=r.disclosure_seq;
 return {...(r as unknown as FactRow),value:String(r.value_text),disclosure_seq:seq===null||seq===undefined?undefined:Number(seq),is_current:r.is_current===true,is_revision:r.is_revision===true};
}
export function resultFromEnvelope(env:ReadFactsEnvelope):ReadFactsResult{
 return {stateRev:Number(env.state_rev),rows:(env.rows??[]).map(rowFromEnvelope),truncated:env.truncated===true};
}
/** Timestamps arrive as '2030-01-01T00:00:00+00:00' / microseconds (PostgREST) or '2030-01-01 00:00:00+00' (pg text): every adapter returns toISOString() form. */
export const isoTs=(v:unknown):string=>new Date(String(v)).toISOString();
const isoOrNull=(v:unknown):string|null=>v===null||v===undefined?null:isoTs(v);
/** A financial_facts table row (PostgREST or pg) → FactRow; value comes from value_text, never from the numeric; created_at is ISO. */
export function factRowFromTable(r:Record<string,unknown>):FactRow{return {...(r as unknown as FactRow),value:String(r.value_text),created_at:isoTs(r.created_at)};}
/** A filings table row (PostgREST or pg) → FilingRow; created_at and accepted_at are ISO. */
export function filingFromTable(r:Record<string,unknown>):FilingRow{return {...(r as unknown as FilingRow),accepted_at:isoOrNull(r.accepted_at),acceptance_source:(r.acceptance_source??null) as FilingRow['acceptance_source'],created_at:isoTs(r.created_at)};}
/** filingsForCalendar row: a filings row plus run_status. */
export function calendarFilingFromRow(r:Record<string,unknown>):CalendarFiling{return {...filingFromTable(r),run_status:r.run_status as RunStatus};}
/** LineageRev[] in the canonical order (issuer_id ascending; lowercase uuids compare like PostgreSQL's uuid order); state_rev as a number. */
export function lineageRevsFrom(x:unknown):LineageRev[]{
 if(!Array.isArray(x))return [];
 return x.map(e=>({issuer_id:String((e as {issuer_id:unknown}).issuer_id),state_rev:Number((e as {state_rev:unknown}).state_rev)}))
  .sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
}
export const lineageKey=(v:LineageRev[]):string=>lineageRevsFrom(v).map(r=>`${r.issuer_id}=${r.state_rev}`).join(',');
/** The complete vector compared (T8): same members, same revs. */
export const lineageRevsEqual=(a:LineageRev[],b:LineageRev[]):boolean=>lineageKey(a)===lineageKey(b);
export function scopeFromTable(r:Record<string,unknown>):ScopeRow{
 return {issuer_id:String(r.issuer_id),market:r.market as Market,reasons:Array.isArray(r.reasons)?r.reasons as string[]:[],priority:Number(r.priority),fetch_key:String(r.fetch_key),
  next_due_at:isoTs(r.next_due_at),lease_until:isoOrNull(r.lease_until),lease_batch_id:r.lease_batch_id===null?null:String(r.lease_batch_id),state_rev:Number(r.state_rev),
  last_attempt_at:isoOrNull(r.last_attempt_at),last_success_at:isoOrNull(r.last_success_at),last_batch_id:r.last_batch_id===null?null:String(r.last_batch_id),last_status:(r.last_status??null) as ScopeRow['last_status']};
}
export function metricFromTable(r:Record<string,unknown>):MetricRow{
 return {issuer_id:String(r.issuer_id),market:r.market as Market,metric:String(r.metric),period_start:String(r.period_start),period_end:String(r.period_end),duration:r.duration as MetricRow['duration'],
  value:String(r.value_text),unit:String(r.unit),input_unit:String(r.input_unit),basis:String(r.basis),formula_version:String(r.formula_version),inputs:(Array.isArray(r.inputs)?r.inputs:[]) as MetricRow['inputs'],based_on_rev:Number(r.based_on_rev),
  based_on_lineage:lineageRevsFrom(r.based_on_lineage),as_of:String(r.as_of)};
}
/** MetricRow → replace_financial_metrics row (issuer/market come from the call). */
export function metricArgs(m:MetricRow){return {metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,value:m.value,unit:m.unit,input_unit:m.input_unit,basis:m.basis,formula_version:m.formula_version,inputs:m.inputs,as_of:m.as_of};}
/** FilingInsert → stage_filings row (issuer/market come from the run). */
export function filingArgs(rows:FilingInsert[]){return rows.map(r=>({filing_id:r.filing_id,source:r.source,origin:r.origin,form_type:r.formType,fiscal_year:r.fiscalYear,fiscal_period:r.fiscalPeriod,period_end:r.periodEnd,available_date:r.availableDate,source_ref:r.sourceRef,url:r.url}));}
export function readArgs(issuer:string,market:Market,o:ReadFactsOptions){return {p_issuer:issuer,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
export function readLineageArgs(issuers:string[],market:Market,o:ReadFactsOptions){return {p_issuers:issuers,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
export interface ReadFactsLineageEnvelope{state_revs:unknown;lineage:unknown;rows:Record<string,unknown>[];conflicts:unknown;truncated:boolean;row_count:number}
export function lineageResultFromEnvelope(env:ReadFactsLineageEnvelope):ReadFactsLineageResult{
 const conflicts=(Array.isArray(env.conflicts)?env.conflicts:[]) as {key?:unknown;available_date?:unknown;fact_ids?:unknown}[];
 return {stateRevs:lineageRevsFrom(env.state_revs),lineage:Array.isArray(env.lineage)?env.lineage.map(String):[],rows:(env.rows??[]).map(rowFromEnvelope),
  conflicts:conflicts.map((c):LineageConflict=>({key:(c.key&&typeof c.key==='object'?c.key:{}) as Record<string,string|null>,available_date:String(c.available_date),fact_ids:Array.isArray(c.fact_ids)?c.fact_ids.map(String):[]})),
  truncated:env.truncated===true};
}
/** read_filing_facts row → FilingFactRow (value from value_text, ISO created_at). */
export function filingFactFromJson(r:Record<string,unknown>):FilingFactRow{return {...factRowFromTable(r),run_status:r.run_status as RunStatus};}
export const fenceArgs=(f:Fence)=>({pair:f.pair,cycle_id:f.cycle_id,issuer_id:f.issuer_id,market:f.market,batch_id:f.batch_id,attempt:f.attempt});
export function fenceFromJson(x:unknown):Fence|null{
 if(x===null||x===undefined)return null;
 const f=x as Record<string,unknown>;
 return {pair:String(f.pair) as CyclePairId,cycle_id:String(f.cycle_id),issuer_id:String(f.issuer_id),market:f.market as Market,batch_id:String(f.batch_id),attempt:Number(f.attempt)};
}
export function applyOutcomeFromJson(x:unknown):ApplyReconcileOutcome{
 const o=(x??{}) as Record<string,unknown>;const m=o.materialize as {issuer_id?:unknown;market?:unknown}|null|undefined;
 return {reused:o.reused===true,reconciliationId:String(o.reconciliation_id),itemId:o.item_id===null||o.item_id===undefined?null:String(o.item_id),quarantined:Number(o.quarantined)===1?1:0,
  materialize:m&&typeof m==='object'?{issuerId:String(m.issuer_id),market:m.market as Market}:null};
}
export const countsFromJson=(x:unknown):MemberCounts=>{const o=(x??{}) as Record<string,unknown>;return {compared_passed:Number(o.compared_passed),compared_failed:Number(o.compared_failed),not_compared:Number(o.not_compared)};};
/** open_reconcile_cycle envelope → OpenCycleResult (plan audit Q2); the cycle row is passed through as stored (to_jsonb). */
export function openCycleFromJson(x:unknown):OpenCycleResult{
 const o=(x??{}) as {created?:unknown;cycle?:unknown;transferred?:unknown};
 if(!o.cycle||typeof o.cycle!=='object')throw new FactsDbError('unknown','open_reconcile_cycle: no cycle');
 return {created:o.created===true,cycle:o.cycle as Record<string,unknown>,
  transferred:(Array.isArray(o.transferred)?o.transferred:[]).map(p=>{const e=p as Record<string,unknown>;return {issuer_id:String(e.issuer_id),market:e.market as Market,source:String(e.source)};})};
}
export const adoptFromJson=(x:unknown)=>{const o=(x??{}) as Record<string,unknown>;return {factId:String(o.fact_id),runId:String(o.run_id),issuerId:String(o.issuer_id),market:o.market as Market};};
export const restoreFromJson=(x:unknown)=>{const o=(x??{}) as {promoted?:unknown;skipped?:unknown};return {promoted:Number(o.promoted),skipped:(Array.isArray(o.skipped)?o.skipped:[]).map(s=>({fact_id:String((s as {fact_id:unknown}).fact_id),reason:String((s as {reason:unknown}).reason)}))};};
/** Only the three link columns service_role may update (§4.7); undefined keys are dropped. */
export function linkPatch(p:{document_ref?:string|null;document_url?:string|null;link_attempts:number}):Record<string,unknown>{
 if(!Number.isInteger(p.link_attempts)||p.link_attempts<0)throw new FactsDbError('unknown','invalid_link_attempts');
 const out:Record<string,unknown>={link_attempts:p.link_attempts};
 if(p.document_ref!==undefined)out.document_ref=p.document_ref;
 if(p.document_url!==undefined)out.document_url=p.document_url;
 return out;
}
/** dq_quarantine row → ConflictItem: fact_ids from payload, available_date from payload.key or the natural key's last segment. */
export function conflictFromItem(r:{id:string;natural_key:string;payload:Record<string,unknown>}):ConflictItem{
 const p=r.payload??{};
 const key=(p.key&&typeof p.key==='object'&&!Array.isArray(p.key)?p.key:{}) as Record<string,string|null>;
 const ids=Array.isArray(p.fact_ids)?p.fact_ids.filter((x):x is string=>typeof x==='string'):[];
 return {id:r.id,natural_key:r.natural_key,fact_ids:ids,available_date:key.available_date??r.natural_key.slice(r.natural_key.lastIndexOf(':')+1),key};
}
/** natural_key prefix of every facts quarantine item of an issuer+market (§7.1). */
export const conflictPrefix=(issuer:string,market:Market)=>`${issuer}:${market}:`;
/** Splits rows into STAGE_CHUNK-sized calls; an empty input still yields one empty call so the run/lease check runs. */
export function chunk<T>(rows:T[],size=STAGE_CHUNK):T[][]{
 if(rows.length===0)return [[]];
 const out:T[][]=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out;
}
/** stage_filings omits a source_ref already owned by another issuer; a missing key is an error for every adapter, never a silent skip. */
export function assertAllStaged(input:FilingInsert[],out:Map<string,string>):Map<string,string>{
 for(const r of input)if(!out.has(r.sourceRef))throw new FactsDbError('unknown',`filing_not_staged:${r.source}:${r.sourceRef}`);
 return out;
}
/** Plain id chunking for `.in()` filters (an empty input yields no chunk). */
export function chunkIds(ids:string[],size=IN_CHUNK):string[][]{
 const out:string[][]=[];for(let i=0;i<ids.length;i+=size)out.push(ids.slice(i,i+size));return out;
}

interface RpcResult{data:unknown;error:PgErrorLike|null;count?:number|null}
// The query builder is left untyped on purpose (same as table-client.ts): the hand-maintained
// Database type lacks the Relationships/Views that supabase-js inference now needs.
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;from:(table:string)=>any}
type Query=PromiseLike<RpcResult>&{range:(from:number,to:number)=>Query};

export function supabaseFactsDb(client:SupabaseClient):FactsDb{
 const c=client as unknown as NarrowClient;
 const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toFactsDbError(error);return data as T;};
 const rows=async<T>(q:PromiseLike<RpcResult>):Promise<T[]>=>{const {data,error}=await q;if(error)throw toFactsDbError(error);return (data??[]) as T[];};
 /** `make` builds the filtered AND ordered query afresh per page (builders are single-use); pages until a short page or `limit` rows. */
 const pageAll=async<T>(make:()=>Query,limit?:number):Promise<T[]>=>{
  const out:T[]=[];
  for(let from=0;;from+=READ_PAGE){
   const size=limit===undefined?READ_PAGE:Math.min(READ_PAGE,limit-out.length);
   if(size<=0)return out;
   const part=await rows<T>(make().range(from,from+size-1));
   out.push(...part);
   if(part.length<size)return out;
  }
 };
 return {
  async claimLease(issuer,market,batch,ttl){return (await call<unknown>('claim_fact_sync_lease',{p_issuer:issuer,p_market:market,p_batch:batch,p_ttl_seconds:ttl}))===true;},
  beginRun:(issuer,market,batch,gen)=>call<string>('begin_sync_run',{p_issuer:issuer,p_market:market,p_batch:batch,p_mapping_gen:gen}),
  async stageFilings(run,input){
   const out=new Map<string,string>();
   for(const part of chunk(input)){const m=await call<Record<string,string>|null>('stage_filings',{p_run:run,p_rows:filingArgs(part)});for(const [k,v] of Object.entries(m??{}))out.set(k,v);}
   return assertAllStaged(input,out);
  },
  async stageFacts(run,input){let n=0;for(const part of chunk(input))n+=Number(await call<number>('stage_facts',{p_run:run,p_rows:part}));return n;},
  async quarantineFacts(run,ids,item){return Number(await call<unknown>('quarantine_facts',{p_run:run,p_fact_ids:ids,p_item:item}));},
  async publishRun(run,manifest,expectedRev){return Number(await call<unknown>('publish_sync_run',{p_run:run,p_manifest:manifest,p_expected_rev:expectedRev??null}));},
  async abandonRun(run){await call('abandon_sync_run',{p_run:run});},
  async releaseLease(issuer,market,batch,outcome,nextDue){await call('release_fact_sync_lease',{p_issuer:issuer,p_market:market,p_batch:batch,p_outcome:outcome,p_next_due:nextDue});},
  async resolveFactsQuarantine(item,chosen,by){const x=await call<{promoted:unknown;skipped:unknown;chosen_fact_ids?:unknown}>('resolve_facts_quarantine',{p_item:item,p_chosen:chosen,p_resolved_by:by});return {promoted:Number(x.promoted),skipped:Number(x.skipped),chosenFactIds:Array.isArray(x.chosen_fact_ids)?x.chosen_fact_ids.map(String):[]};},
  async replaceMetrics(issuer,market,rev,input){return Number(await call<unknown>('replace_financial_metrics',{p_issuer:issuer,p_market:market,p_based_on_rev:rev,p_rows:input.map(metricArgs)}));},
  async readFacts(issuer,market,opts){return resultFromEnvelope(await call<ReadFactsEnvelope>('read_facts',readArgs(issuer,market,opts)));},
  async factsByIds(ids){
   const out:FactRow[]=[];
   for(const part of chunkIds([...new Set(ids)]))out.push(...(await pageAll<Record<string,unknown>>(()=>c.from('financial_facts').select('*').in('fact_id',part).order('fact_id'))).map(factRowFromTable));
   return out.sort((a,b)=>a.fact_id<b.fact_id?-1:a.fact_id>b.fact_id?1:0);   // deduped, ordered by fact_id across chunks
  },
  async openConflicts(issuer,market){
   return (await pageAll<{id:string;natural_key:string;payload:Record<string,unknown>}>(()=>c.from('dq_quarantine').select('id,natural_key,payload').eq('table_name','financial_facts').eq('reason_code','same_day_conflict').eq('status','open').like('natural_key',`${conflictPrefix(issuer,market)}%`).order('created_at').order('id'))).map(conflictFromItem);
  },
  async filingsOfIssuer(issuer,market,opts){
   return (await pageAll<Record<string,unknown>>(()=>{
    let q=c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market);
    if(opts.from!==undefined)q=q.gte('available_date',opts.from);
    if(opts.to!==undefined)q=q.lte('available_date',opts.to);
    if(opts.unlinkedOnly)q=q.is('document_ref',null);
    return q.order('available_date',{ascending:false}).order('filing_id');
   },opts.limit)).map(filingFromTable);
  },
  async updateFilingLink(filingId,patch){const {error}=await c.from('filings').update(linkPatch(patch)).eq('filing_id',filingId);if(error)throw toFactsDbError(error);},
  async reconcileScope(market,input,snapshotAt){return Number(await call<unknown>('reconcile_fact_sync_scope',{p_market:market,p_rows:input,p_snapshot_at:snapshotAt??null}));},
  async scopeDue(market,now,limit){
   if(limit<1)return [];
   return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).gt('priority',0).lte('next_due_at',now).order('next_due_at').order('priority',{ascending:false}).order('issuer_id'),limit)).map(scopeFromTable);
  },
  async scopeRows(market,issuerIds){
   const out:ScopeRow[]=[];
   for(const part of chunkIds(issuerIds))out.push(...(await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).in('issuer_id',part).order('issuer_id'))).map(scopeFromTable));
   return out;
  },
  async scopeAll(market){return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).order('issuer_id'))).map(scopeFromTable);},
  async metricsOfIssuer(issuer,market,formulaVersion){
   // Pages may span a concurrent replace_financial_metrics: accept a read only when every row carries
   // the same based_on_rev AND the same based_on_lineage vector (T8) and the row count equals the first page's exact count; else retry, then fail.
   for(let attempt=0;attempt<METRICS_ATTEMPTS;attempt++){
    const out:Record<string,unknown>[]=[];let total:number|null=null;
    for(let from=0;;from+=READ_PAGE){
     const q=c.from('financial_metrics').select('*',from===0?{count:'exact'}:undefined).eq('issuer_id',issuer).eq('market',market).eq('formula_version',formulaVersion).order('metric').order('period_end').order('period_start').order('input_unit').order('basis') as Query;
     const {data,error,count}=await q.range(from,from+READ_PAGE-1);
     if(error)throw toFactsDbError(error);
     if(from===0)total=count??null;
     const part=(data??[]) as Record<string,unknown>[];
     out.push(...part);
     if(part.length<READ_PAGE)break;
    }
    const rev=out[0]?.based_on_rev;const vector=lineageKey(lineageRevsFrom(out[0]?.based_on_lineage));
    if(total===out.length&&out.every(r=>Number(r.based_on_rev)===Number(rev)&&lineageKey(lineageRevsFrom(r.based_on_lineage))===vector))return out.map(metricFromTable);
   }
   throw new FactsDbError('unknown','metrics_unstable');
  },
  async targetOf(issuer){const r=await rows<{merged_into:string|null}>(c.from('issuers').select('merged_into').eq('issuer_id',issuer).limit(1));return r[0]?.merged_into??issuer;},
  async lineageOf(target){return [target,...(await pageAll<{issuer_id:string}>(()=>c.from('issuers').select('issuer_id').eq('merged_into',target).order('issuer_id'))).map(r=>String(r.issuer_id))];},
  async stateRevs(issuers,market){
   if(issuers.length===0)return [];
   // read_facts_lineage with no concepts: the revs of every member in one snapshot (anon may call it)
   return lineageRevsFrom((await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,{concepts:[],asOf:'1900-01-01'}))).state_revs);
  },
  async readFactsLineage(issuers,market,opts){return lineageResultFromEnvelope(await call<ReadFactsLineageEnvelope>('read_facts_lineage',readLineageArgs(issuers,market,opts)));},
  async readFilingFacts(filingId,includeNonOk){return ((await call<{rows?:Record<string,unknown>[]}|null>('read_filing_facts',{p_filing:filingId,p_include_non_ok:includeNonOk}))?.rows??[]).map(filingFactFromJson);},
  async replaceMetricsLineage(issuer,market,basedOn,input){return Number(await call<unknown>('replace_financial_metrics_lineage',{p_issuer:issuer,p_market:market,p_based_on:basedOn,p_rows:input.map(metricArgs)}));},
  async findFilingBySourceRef(source,sourceRef){const r=await rows<Record<string,unknown>>(c.from('filings').select('*').eq('source',source).eq('source_ref',sourceRef).limit(1));return r[0]?filingFromTable(r[0]):null;},
  async filingsForCalendar(issuer,market,opts){
   const list=await pageAll<Record<string,unknown>>(()=>c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market).gte('period_end',opts.fromPeriodEnd).order('period_end').order('available_date').order('filing_id'));
   const status=new Map<string,string>();
   for(const part of chunkIds([...new Set(list.map(r=>String(r.run_id)))]))
    for(const r of await pageAll<{run_id:string;status:string}>(()=>c.from('fact_sync_runs').select('run_id,status').in('run_id',part).order('run_id')))status.set(String(r.run_id),String(r.status));
   return list.map(r=>{const s=status.get(String(r.run_id));if(s===undefined)throw new FactsDbError('unknown',`run_not_found:${String(r.run_id)}`);return calendarFilingFromRow({...r,run_status:s});});
  },
  async setFilingAcceptance(filingId,acceptedAt,source){return (await call<unknown>('set_filing_acceptance',{p_filing:filingId,p_accepted:acceptedAt,p_source:source}))===true;},
  async adoptCandidate(item,index,batch,expectedRev,by){return adoptFromJson(await call<unknown>('adopt_candidate',{p_item:item,p_index:index,p_batch:batch,p_expected_rev:expectedRev,p_resolved_by:by}));},
  async restoreReconciled(item,batch,hash,by){return restoreFromJson(await call<unknown>('restore_reconciled',{p_item:item,p_batch:batch,p_inputs_hash_now:hash,p_resolved_by:by}));},
  async resolveLineageConflict(item,keep,batch,by){return {quarantined:Number((await call<{quarantined:unknown}>('resolve_lineage_conflict',{p_item:item,p_keep:keep,p_batch:batch,p_resolved_by:by})).quarantined)};},
  async claimReconcileMember(pair,cycleId,issuer,market,batch){return fenceFromJson(await call<unknown>('claim_reconcile_member',{p_pair:pair,p_cycle_id:cycleId,p_issuer:issuer,p_market:market,p_batch:batch}));},
  async applyReconcileResult(fence,result){return applyOutcomeFromJson(await call<unknown>('apply_reconcile_result',{p_fence:fenceArgs(fence),p_result:result}));},
  async completeReconcileMember(fence){return countsFromJson(await call<unknown>('complete_reconcile_member',{p_fence:fenceArgs(fence)}));},
  async failReconcileMember(fence,error){await call('fail_reconcile_member',{p_fence:fenceArgs(fence),p_error:error});},
  async openReconcileCycle(i){return openCycleFromJson(await call<unknown>('open_reconcile_cycle',{p_pair:i.pair,p_cycle_id:i.cycleId,p_started_at:i.startedAt,p_members:i.members,p_pending:i.pending}));},
  async setMerge(source,target,by){return {repointed:Number((await call<{repointed:unknown}>('set_merge',{p_source:source,p_target:target,p_resolved_by:by})).repointed)};},
  async setDissolved(issuer,by){await call('set_dissolved',{p_issuer:issuer,p_resolved_by:by});},
 };
}
