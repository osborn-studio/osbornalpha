// src/lib/company/db.ts
// CompanyDb (spec §4.7, §0 #64, §0.1): the only data access of the company module. Writes and
// snapshot-sensitive reads are SQL functions (20261112091000_company_research_functions.sql) called
// through rpc; plain reads use .from() under RLS. The functions raise with the code as the message
// (detail in `details`/`detail`); toCompanyDbError maps the first word to CompanyDbError.code and keeps
// the detail in the message ("<code>: <detail>"); anything else is internal. Shared normalisers make
// the three implementations return identical rows: timestamps → toISOString(), bigint → Number.
// Keyset cursors: eventsOfIssuer (occurred_on desc, event_id asc); eventsOfIssuers (first_seen_at desc,
// event_id desc) with the RAW database timestamp text in the cursor (microseconds; tsKey compares it
// exactly). New RPCs are not registered in database.types.ts (repo convention): the client is narrowed.
import type {SupabaseClient} from '@supabase/supabase-js';
import {isoTs} from '../facts/db';
import {CompanyDbError,EVENT_KINDS} from './types';
import type {CompanyDb,CoverageRow,DigestStateRow,DueStream,EventKind,EventRow,EvidenceRecord,Market,ReplaceResult,WatchRow} from './types';
export {CompanyDbError} from './types';
export type {CompanyDb} from './types';

/** Decision F; enforced by the company_watches_limit trigger. */
export const MAX_COMPANY_WATCHES=200;
/** company_fact_evidence accepts at most this many ids per call. */
export const EVIDENCE_IDS_PER_CALL=100;
/** ids per `.in()` filter (URL length). */
export const IN_CHUNK=100;
export const MAX_EVENTS_PAGE=500;
export const MAX_COVERAGE_PAGE=200;
export const MAX_WATCH_NOTE=2000;

type Code=CompanyDbError['code'];
const MESSAGE_CODES:readonly Code[]=['stale_computation','stale_attempt','invalid_event','unknown_stream','watch_limit','invalid_read','invalid_evidence'];
export interface PgErrorLike{message?:string;code?:string|null;details?:string|null;detail?:string|null}
/** PostgreSQL / PostgREST error → CompanyDbError (shared by the Supabase, pg and snapshot adapters). `fk` names the code a 23503 maps to. */
export function toCompanyDbError(e:unknown,fk?:Code):CompanyDbError{
 if(e instanceof CompanyDbError)return e;
 const x=(e&&typeof e==='object'?e:{}) as PgErrorLike;
 const message=x.message??String(e);
 const head=message.split(/[\s:]/,1)[0];
 const detail=x.details??x.detail??null;
 if((MESSAGE_CODES as readonly string[]).includes(head))return new CompanyDbError(head as Code,detail?`${head}: ${detail}`:head);
 if(fk!==undefined&&x.code==='23503')return new CompanyDbError(fk,`${fk}: ${message}`);
 return new CompanyDbError('internal',message||'internal');
}
const invalidRead=(what:string)=>new CompanyDbError('invalid_read',`invalid_read: ${what}`);

// ---------------------------------------------------------------- validation shared by all implementations
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const EVENT_ID=/^[0-9a-f]{64}$/;
export function checkLimit(limit:number,max:number):number{
 if(!Number.isInteger(limit)||limit<1||limit>max)throw invalidRead('limit');
 return limit;
}
export function checkEventsQuery(o:{since?:string;until?:string;kinds?:EventKind[];limit:number}):void{
 checkLimit(o.limit,MAX_EVENTS_PAGE);
 if(o.since!==undefined&&!DATE.test(o.since))throw invalidRead('since');
 if(o.until!==undefined&&!DATE.test(o.until))throw invalidRead('until');
 if(o.kinds!==undefined&&o.kinds.some(k=>!EVENT_KINDS.includes(k)))throw invalidRead('kinds');
}
/** Deduplicated event ids; every id must be a 64-hex event id. */
export function checkEventIds(ids:string[]):string[]{
 const out=[...new Set(ids)];
 if(out.some(id=>typeof id!=='string'||!EVENT_ID.test(id)))throw invalidRead('eventIds');
 return out;
}
/** Only the two mutable columns; note ≤ 2000 characters or null, muted boolean; undefined keys are dropped. */
export function watchPatch(p:{note?:string|null;muted?:boolean}):Record<string,unknown>{
 const out:Record<string,unknown>={};
 if(p.note!==undefined){
  if(p.note!==null&&(typeof p.note!=='string'||[...p.note].length>MAX_WATCH_NOTE))throw new CompanyDbError('internal','invalid_watch_note');
  out.note=p.note;
 }
 if(p.muted!==undefined){if(typeof p.muted!=='boolean')throw new CompanyDbError('internal','invalid_watch_muted');out.muted=p.muted;}
 return out;
}
export const chunkOf=<T>(xs:T[],n=IN_CHUNK):T[][]=>{const out:T[][]=[];for(let i=0;i<xs.length;i+=n)out.push(xs.slice(i,i+n));return out;};

// ---------------------------------------------------------------- cursors
const TS=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;
/** Exact sort key (microseconds since epoch) of a timestamptz text as PostgREST, node-postgres or toISOString() write it; null if not one. */
export function tsKey(s:string):bigint|null{
 const m=typeof s==='string'?TS.exec(s):null;
 if(!m)return null;
 let off=m[4];
 if(off!=='Z')off=off.length===3?`${off}:00`:off.includes(':')?off:`${off.slice(0,3)}:${off.slice(3)}`;
 const ms=Date.parse(`${m[1]}T${m[2]}${off}`);
 if(Number.isNaN(ms))return null;
 return BigInt(ms)*1000n+BigInt((m[3]??'').padEnd(6,'0'));
}
export const encodeCursor=(parts:[string,string]):string=>Buffer.from(JSON.stringify(parts),'utf8').toString('base64url');
function decodeCursor(cursor:string,first:(s:string)=>boolean):[string,string]{
 let v:unknown=null;
 try{v=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));}catch{v=null;}
 if(Array.isArray(v)&&v.length===2&&typeof v[0]==='string'&&typeof v[1]==='string'&&first(v[0])&&EVENT_ID.test(v[1]))return [v[0],v[1]];
 throw invalidRead('cursor');
}
/** eventsOfIssuer cursor: [occurred_on, event_id]. */
export const decodeIssuerCursor=(c:string)=>decodeCursor(c,s=>DATE.test(s));
/** eventsOfIssuers cursor: [raw first_seen_at, event_id]. */
export const decodeInboxCursor=(c:string)=>decodeCursor(c,s=>tsKey(s)!==null);
/** limit+1 rows in (occurred_on desc, event_id asc) order → one page. */
export function issuerPage(rows:EventRow[],limit:number):{rows:EventRow[];nextCursor:string|null}{
 const page=rows.slice(0,limit);
 return {rows:page,nextCursor:rows.length>limit?encodeCursor([page[limit-1].occurred_on,page[limit-1].event_id]):null};
}
export interface RawEvent{row:EventRow;seen:string}
/** Rows (possibly several keyset pages, one per chunk) → one page in (first_seen_at desc, event_id desc) order; the cursor keeps the raw timestamp. */
export function inboxPage(raw:RawEvent[],limit:number):{rows:EventRow[];nextCursor:string|null}{
 const key=(t:string)=>{const k=tsKey(t);if(k===null)throw new CompanyDbError('internal',`unparsable first_seen_at: ${t}`);return k;};
 const sorted=[...raw].sort((a,b)=>{const ka=key(a.seen),kb=key(b.seen);return ka>kb?-1:ka<kb?1:a.row.event_id>b.row.event_id?-1:a.row.event_id<b.row.event_id?1:0;});
 const page=sorted.slice(0,limit);
 return {rows:page.map(r=>r.row),nextCursor:sorted.length>limit?encodeCursor([page[limit-1].seen,page[limit-1].row.event_id]):null};
}

// ---------------------------------------------------------------- row normalisers (PostgREST JSON and pg rows alike)
const str=(v:unknown)=>String(v);
const strOrNull=(v:unknown)=>v===null||v===undefined?null:String(v);
const numOrNull=(v:unknown)=>v===null||v===undefined?null:Number(v);
const isoOrNull=(v:unknown)=>v===null||v===undefined?null:isoTs(v);
const obj=(v:unknown)=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,unknown>;
const objOrNull=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
export function eventFromRow(r:Record<string,unknown>):EventRow{
 return {event_id:str(r.event_id),issuer_id:str(r.issuer_id),market:r.market as Market,kind:r.kind as EventKind,natural_key:str(r.natural_key),occurred_on:str(r.occurred_on),
  period_end:strOrNull(r.period_end),concept:strOrNull(r.concept),filing_id:strOrNull(r.filing_id),payload:obj(r.payload),meta:obj(r.meta),payload_hash:str(r.payload_hash),
  based_on_rev:Number(r.based_on_rev),first_seen_at:isoTs(r.first_seen_at),payload_changed_at:isoOrNull(r.payload_changed_at),retired_at:isoOrNull(r.retired_at),
  rebuilt_at:isoTs(r.rebuilt_at),rebuild_id:str(r.rebuild_id),rebuild_batch_id:str(r.rebuild_batch_id)};
}
export function coverageFromRow(r:Record<string,unknown>):CoverageRow{
 const c=obj(r.citation_summary);
 return {issuer_id:str(r.issuer_id),market:r.market as Market,filings_count:Number(r.filings_count),facts_count:Number(r.facts_count),concepts_covered:Number(r.concepts_covered),
  earliest_period_end:strOrNull(r.earliest_period_end),latest_period_end:strOrNull(r.latest_period_end),latest_available_date:strOrNull(r.latest_available_date),
  citation_summary:{linked:Number(c.linked??0),pending:Number(c.pending??0),edgar:Number(c.edgar??0)},scope_last_success_at:isoOrNull(r.scope_last_success_at),
  scope_last_status:(r.scope_last_status??null) as CoverageRow['scope_last_status'],based_on_rev:Number(r.based_on_rev),rebuilt_at:isoTs(r.rebuilt_at),rebuild_id:str(r.rebuild_id),rebuild_batch_id:str(r.rebuild_batch_id)};
}
export const sortCoverage=(rows:CoverageRow[])=>rows.sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:a.market<b.market?-1:a.market>b.market?1:0);
export function watchFromRow(r:Record<string,unknown>):WatchRow{
 return {user_id:str(r.user_id),issuer_id:str(r.issuer_id),note:strOrNull(r.note),muted:r.muted===true,created_at:isoTs(r.created_at),updated_at:isoTs(r.updated_at)};
}
export function digestStateFromRow(r:Record<string,unknown>):DigestStateRow{
 return {issuer_id:str(r.issuer_id),market:r.market as Market,digested_rev:Number(r.digested_rev),attempt_seq:Number(r.attempt_seq),last_attempt_id:numOrNull(r.last_attempt_id),
  last_success_attempt_id:numOrNull(r.last_success_attempt_id),last_failed_attempt_id:numOrNull(r.last_failed_attempt_id),last_attempt_at:isoOrNull(r.last_attempt_at),
  last_status:(r.last_status??null) as DigestStateRow['last_status'],consecutive_failures:Number(r.consecutive_failures),next_attempt_at:isoTs(r.next_attempt_at),
  swept_at:isoOrNull(r.swept_at),updated_at:isoTs(r.updated_at)};
}
export function evidenceFromJson(r:Record<string,unknown>):EvidenceRecord{
 return {fact_id:str(r.fact_id),raw_hash:str(r.raw_hash),snapshot_sha256:str(r.snapshot_sha256),snapshot_path:str(r.snapshot_path),hash_locator:str(r.hash_locator),json_pointer:str(r.json_pointer),
  field:strOrNull(r.field),source:r.source as EvidenceRecord['source'],api:strOrNull(r.api),url:strOrNull(r.url),params:objOrNull(r.params),captured_at:isoOrNull(r.captured_at),
  http_status:numOrNull(r.http_status),page:numOrNull(r.page),index_version:str(r.index_version),run_id:str(r.run_id),code_version:strOrNull(r.code_version),
  tool_versions:objOrNull(r.tool_versions),mapping_version:str(r.mapping_version)};
}
export function dueFromJson(v:unknown):DueStream[]{
 return (Array.isArray(v)?v:[]).map((x:Record<string,unknown>)=>({issuerId:str(x.issuerId),market:x.market as Market,stateRev:Number(x.stateRev),digestedRev:Number(x.digestedRev)}));
}
export function replaceResultFromJson(v:unknown):ReplaceResult{
 const x=obj(v);return {upserted:Number(x.upserted),changed:Number(x.changed),retired:Number(x.retired),revived:Number(x.revived)};
}
export function coveragePageFromJson(v:unknown):{rows:CoverageRow[];total:number}{
 const x=obj(v);return {rows:(Array.isArray(x.rows)?x.rows:[]).map(r=>coverageFromRow(r as Record<string,unknown>)),total:Number(x.total)};
}

// ---------------------------------------------------------------- Supabase implementation
interface RpcResult{data:unknown;error:PgErrorLike|null;count?:number|null}
// The query builder is left untyped on purpose (same as src/lib/facts/db.ts).
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;from:(table:string)=>any}

export function supabaseCompanyDb(client:SupabaseClient):CompanyDb{
 const c=client as unknown as NarrowClient;
 const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toCompanyDbError(error);return data as T;};
 const rows=async(q:PromiseLike<RpcResult>,fk?:Code):Promise<Record<string,unknown>[]>=>{const {data,error}=await q;if(error)throw toCompanyDbError(error,fk);return (data??[]) as Record<string,unknown>[];};
 const watch=(userId:string,issuerId:string)=>c.from('company_watches').select('*').eq('user_id',userId).eq('issuer_id',issuerId).limit(1);
 return {
  async digestDue(now,limit,market){return dueFromJson(await call('company_digest_due',{p_now:now.toISOString(),p_limit:limit,p_market:market??null}));},
  async sweepDue(olderThan,now,limit,market){return dueFromJson(await call('company_sweep_due',{p_older_than:olderThan.toISOString(),p_now:now.toISOString(),p_limit:limit,p_market:market??null}));},
  async beginAttempt(issuer,market,now){return Number(await call('begin_company_digest_attempt',{p_issuer:issuer,p_market:market,p_now:now.toISOString()}));},
  async replaceDigest(issuer,market,batch,attemptId,rebuildId,basedOnRev,sweep,events,coverage){
   return replaceResultFromJson(await call('replace_company_digest',{p_issuer:issuer,p_market:market,p_batch:batch,p_attempt_id:attemptId,p_rebuild_id:rebuildId,p_based_on_rev:basedOnRev,p_sweep:sweep,p_events:events,p_coverage:coverage}));
  },
  async markDigestFailed(issuer,market,attemptId,now){return (await call('mark_company_digest_failed',{p_issuer:issuer,p_market:market,p_attempt_id:attemptId,p_now:now.toISOString()}))===true;},
  async backlog(){return {failedStreams:Number(await call('company_digest_backlog',{}))};},
  async digestState(issuer,market){const [r]=await rows(c.from('company_digest_state').select('*').eq('issuer_id',issuer).eq('market',market).limit(1));return r?digestStateFromRow(r):null;},
  async replaceEvidence(issuer,market,attemptId,basedOnRev,input){const x=obj(await call('replace_company_fact_evidence',{p_issuer:issuer,p_market:market,p_attempt_id:attemptId,p_based_on_rev:basedOnRev,p_rows:input}));return {upserted:Number(x.upserted),deleted:Number(x.deleted)};},
  async eventsOfIssuer(issuer,market,o){
   checkEventsQuery(o);
   const cur=o.cursor?decodeIssuerCursor(o.cursor):null;
   let q=c.from('issuer_events').select('*').eq('issuer_id',issuer).eq('market',market).is('retired_at',null);
   if(o.since!==undefined)q=q.gte('occurred_on',o.since);
   if(o.until!==undefined)q=q.lte('occurred_on',o.until);
   if(o.kinds?.length)q=q.in('kind',o.kinds);
   if(cur)q=q.or(`occurred_on.lt.${cur[0]},and(occurred_on.eq.${cur[0]},event_id.gt.${cur[1]})`);
   return issuerPage((await rows(q.order('occurred_on',{ascending:false}).order('event_id').limit(o.limit+1))).map(eventFromRow),o.limit);
  },
  async eventsOfIssuers(issuers,o){
   checkEventsQuery(o);
   const cur=o.cursor?decodeInboxCursor(o.cursor):null;
   const ids=[...new Set(issuers)];
   if(!ids.length)return {rows:[],nextCursor:null};
   const got:RawEvent[]=[];
   for(const part of chunkOf(ids)){
    let q=c.from('issuer_events').select('*').in('issuer_id',part).is('retired_at',null);
    if(o.kinds?.length)q=q.in('kind',o.kinds);
    if(cur)q=q.or(`first_seen_at.lt."${cur[0]}",and(first_seen_at.eq."${cur[0]}",event_id.lt.${cur[1]})`);
    for(const r of await rows(q.order('first_seen_at',{ascending:false}).order('event_id',{ascending:false}).limit(o.limit+1)))got.push({row:eventFromRow(r),seen:str(r.first_seen_at)});
   }
   return inboxPage(got,o.limit);
  },
  async evidenceOf(factIds){
   const out=new Map<string,EvidenceRecord>();
   for(const part of chunkOf([...new Set(factIds)],EVIDENCE_IDS_PER_CALL)){
    const x=obj(await call('company_fact_evidence',{p_fact_ids:part}));
    for(const [k,v] of Object.entries(x))out.set(k,evidenceFromJson(obj(v)));
   }
   return out;
  },
  async coverageOf(issuers){
   const out:CoverageRow[]=[];
   for(const part of chunkOf([...new Set(issuers)]))out.push(...(await rows(c.from('issuer_coverage').select('*').in('issuer_id',part))).map(coverageFromRow));
   return sortCoverage(out);
  },
  async listCoverage(filter,sort,page){
   return coveragePageFromJson(await call('company_list_coverage',{p_market:filter.market??null,p_issuer_ids:filter.issuerIds??null,p_sort:sort,p_offset:page.offset,p_limit:page.limit}));
  },
  async watchesOf(userId){return (await rows(c.from('company_watches').select('*').eq('user_id',userId).order('updated_at',{ascending:false}).order('issuer_id'))).map(watchFromRow);},
  async upsertWatch(userId,issuerId){
   const made=await rows(c.from('company_watches').upsert({user_id:userId,issuer_id:issuerId},{onConflict:'user_id,issuer_id',ignoreDuplicates:true}).select('*'));
   if(made.length)return {row:watchFromRow(made[0]),created:true};
   const [r]=await rows(watch(userId,issuerId));
   if(!r)throw new CompanyDbError('internal','watch_not_visible');
   return {row:watchFromRow(r),created:false};
  },
  async patchWatch(userId,issuerId,patch){
   const p=watchPatch(patch);
   const q=Object.keys(p).length?c.from('company_watches').update(p).eq('user_id',userId).eq('issuer_id',issuerId).select('*'):watch(userId,issuerId);
   const [r]=await rows(q);
   return r?watchFromRow(r):null;
  },
  async deleteWatch(userId,issuerId){return (await rows(c.from('company_watches').delete().eq('user_id',userId).eq('issuer_id',issuerId).select('issuer_id'))).length>0;},
  async markRead(userId,issuerId,eventIds){
   const ids=checkEventIds(eventIds);
   if(!ids.length)return {inserted:0};
   const made=await rows(c.from('company_event_reads').upsert(ids.map(event_id=>({user_id:userId,issuer_id:issuerId,event_id})),{onConflict:'user_id,event_id',ignoreDuplicates:true}).select('event_id'),'invalid_read');
   return {inserted:made.length};
  },
  async readEventIds(userId,eventIds){
   const out=new Set<string>();
   for(const part of chunkOf(checkEventIds(eventIds)))
    for(const r of await rows(c.from('company_event_reads').select('event_id').eq('user_id',userId).in('event_id',part)))out.add(str(r.event_id));
   return out;
  },
 };
}
