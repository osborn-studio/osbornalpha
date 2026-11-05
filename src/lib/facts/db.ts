// src/lib/facts/db.ts
// FactsDb (spec §4.8): the only data access the facts layer uses. Writes are SQL functions
// (rpc) because no role may touch the fact tables directly (§4.7); reads that need no snapshot
// use .from() under RLS (factsByIds, openConflicts, filingsOfIssuer, scopeDue, metricsOfIssuer,
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
import type {ConflictItem,FactRow,FactsDb,FactsDbErrorCode,FilingInsert,FilingRow,Market,MetricRow,ReadFactsOptions,ReadFactsResult,ScopeRow} from './types';
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
const MESSAGE_CODES:readonly FactsDbErrorCode[]=['run_pending','run_published','mapping_gen_regression','stale_computation'];

export interface PgErrorLike{message?:string;code?:string|null;details?:string|null;hint?:string|null}
/** PostgreSQL / PostgREST error → FactsDbError (shared by the Supabase and pg adapters). */
export function toFactsDbError(e:PgErrorLike):FactsDbError{
 const message=e.message??'';
 const head=message.split(/[\s:]/,1)[0];
 if(e.code==='55P03'||head==='lease_lost')return new FactsDbError('lease_lost',message||'lease_lost');
 if((MESSAGE_CODES as readonly string[]).includes(head))return new FactsDbError(head as FactsDbErrorCode,message);
 if(e.code==='23505')return new FactsDbError('duplicate_key',message);
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
/** A filings table row (PostgREST or pg) → FilingRow; created_at is ISO. */
export function filingFromTable(r:Record<string,unknown>):FilingRow{return {...(r as unknown as FilingRow),created_at:isoTs(r.created_at)};}
export function scopeFromTable(r:Record<string,unknown>):ScopeRow{
 return {issuer_id:String(r.issuer_id),market:r.market as Market,reasons:Array.isArray(r.reasons)?r.reasons as string[]:[],priority:Number(r.priority),fetch_key:String(r.fetch_key),
  next_due_at:isoTs(r.next_due_at),lease_until:isoOrNull(r.lease_until),lease_batch_id:r.lease_batch_id===null?null:String(r.lease_batch_id),state_rev:Number(r.state_rev),
  last_attempt_at:isoOrNull(r.last_attempt_at),last_success_at:isoOrNull(r.last_success_at),last_batch_id:r.last_batch_id===null?null:String(r.last_batch_id),last_status:(r.last_status??null) as ScopeRow['last_status']};
}
export function metricFromTable(r:Record<string,unknown>):MetricRow{
 return {issuer_id:String(r.issuer_id),market:r.market as Market,metric:String(r.metric),period_start:String(r.period_start),period_end:String(r.period_end),duration:r.duration as MetricRow['duration'],
  value:String(r.value_text),unit:String(r.unit),input_unit:String(r.input_unit),basis:String(r.basis),formula_version:String(r.formula_version),inputs:(Array.isArray(r.inputs)?r.inputs:[]) as MetricRow['inputs'],based_on_rev:Number(r.based_on_rev),as_of:String(r.as_of)};
}
/** MetricRow → replace_financial_metrics row (issuer/market come from the call). */
export function metricArgs(m:MetricRow){return {metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,value:m.value,unit:m.unit,input_unit:m.input_unit,basis:m.basis,formula_version:m.formula_version,inputs:m.inputs,as_of:m.as_of};}
/** FilingInsert → stage_filings row (issuer/market come from the run). */
export function filingArgs(rows:FilingInsert[]){return rows.map(r=>({filing_id:r.filing_id,source:r.source,origin:r.origin,form_type:r.formType,fiscal_year:r.fiscalYear,fiscal_period:r.fiscalPeriod,period_end:r.periodEnd,available_date:r.availableDate,source_ref:r.sourceRef,url:r.url}));}
export function readArgs(issuer:string,market:Market,o:ReadFactsOptions){return {p_issuer:issuer,p_market:market,p_concepts:o.concepts,p_as_of:o.asOf,p_from:o.from??null,p_to:o.to??null,p_history:o.history===true,p_limit:o.limit??null,p_include_non_ok:o.includeNonOk===true};}
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
  async publishRun(run,manifest){return Number(await call<unknown>('publish_sync_run',{p_run:run,p_manifest:manifest}));},
  async abandonRun(run){await call('abandon_sync_run',{p_run:run});},
  async releaseLease(issuer,market,batch,outcome,nextDue){await call('release_fact_sync_lease',{p_issuer:issuer,p_market:market,p_batch:batch,p_outcome:outcome,p_next_due:nextDue});},
  async resolveFactsQuarantine(item,chosen,by){const x=await call<{promoted:unknown;skipped:unknown}>('resolve_facts_quarantine',{p_item:item,p_chosen:chosen,p_resolved_by:by});return {promoted:Number(x.promoted),skipped:Number(x.skipped)};},
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
  async reconcileScope(market,input){return Number(await call<unknown>('reconcile_fact_sync_scope',{p_market:market,p_rows:input}));},
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
   // the same based_on_rev and the row count equals the first page's exact count; else retry, then fail.
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
    const rev=out[0]?.based_on_rev;
    if(total===out.length&&out.every(r=>Number(r.based_on_rev)===Number(rev)))return out.map(metricFromTable);
   }
   throw new FactsDbError('unknown','metrics_unstable');
  },
 };
}
