// src/lib/documents/db.ts
// DocumentsDb over Supabase (spec §4.8, §4.11): every write is one SQL function of migration one
// (rpc) because no role writes the document tables directly (§4.12) — the one exception is
// extraction_approvals (service_role insert + update(revoked_at)). Reads that need a join, the
// server clock or a POST body are service-only SQL functions (read_documents, documents_stored_due,
// extractions_candidates_due, known_source_refs, list_candidates, list_candidate_publications);
// single-table reads use .from() with an explicit limit. Errors: the functions raise with the code
// as the first word of the message (lease_lost 55P03; not_eligible, revision_exists, decided, … P0001;
// not_found P0002; invalid_citation / invalid_input 22023); toDocumentsDbError maps that, check /
// not-null / foreign-key / bad-text violations → invalid_input, the rest → unknown. Cursors are
// opaque base64url JSON arrays of the sort key in the database's own text form (PostgREST keeps
// microseconds), so a keyset never skips or repeats a row. New RPCs are not registered in
// database.types.ts (repo convention): the client is narrowed locally.
import type {SupabaseClient} from '@supabase/supabase-js';
import {canonicalDecimal} from '../facts/json-numbers';
import {DocumentsDbError,EXTRACTOR_VERSION,PAGE_LIMIT_MAX,TABLE_ALGO_VERSION} from './types';
import type {
 Acquisition,ApprovalRow,AssetInsert,AssetRow,CandidateRow,CandidatesFilter,CandidateStatus,CitationRow,DocScopeRow,DocumentInsert,DocumentRow,
 DocumentsDb,DocumentsDbErrorCode,ExtractionInsert,ExtractionRow,InsertVersionResult,ListedSource,Page,PageInsert,PageOpts,PageRow,PublicationRow,
} from './types';
export {DocumentsDbError} from './types';
export type {DocumentsDb} from './types';

/** refs per known_source_refs call (spec §4.11). */
export const REFS_CHUNK=500;
/** ids per bounded read (pagesOf, citationsByIds, publicationsOf candidateIds). */
export const IDS_MAX=100;
/** ids per `.in()` filter (URL length). */
export const IN_CHUNK=100;
/** Most rows one insert_candidates / write_candidate_checks call takes. Each is ONE rpc (one transaction): larger inputs are refused before any mutation, never split (F3 review). */
export const WRITE_MAX=5000;
/** Most assets one document version carries (insert_document_version: invalid_input: assets); assetsOf can therefore never truncate. */
export const ASSETS_MAX=100;
/** Rejects an oversized batch write with invalid_input before any call or mutation (all implementations). */
export function checkWriteRows<T>(rows:readonly T[]):readonly T[]{
 if(rows.length>WRITE_MAX)throw new DocumentsDbError('invalid_input',`too_many_rows:${rows.length}`);
 return rows;
}
/** Strict shapes of a decoded keyset cursor that is interpolated into a PostgREST .or() filter. */
const CURSOR_TS=/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const CURSOR_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function timestampUuidCursor(cursor:string):[string,string]{
 const [at,id]=decodeCursor(cursor);
 if(typeof at!=='string'||typeof id!=='string'||!CURSOR_TS.test(at)||!CURSOR_UUID.test(id))throw new DocumentsDbError('invalid_input','invalid_cursor');
 return [at,id];
}
const MESSAGE_CODES:readonly DocumentsDbErrorCode[]=['lease_lost','not_eligible','revision_exists','evidence_incomplete','approval_revoked','not_publishable','invalid_citation','decided','already_staged','binding_conflict','invalid_expected_rev','stale_plan','not_hk_item','run_pending','invalid_chosen','item_not_open','too_many_approvals','not_found','invalid_input','cursor_regression'];
const INPUT_STATES=new Set(['23514','23502','23503','22023','22P02','22007','22008','22003']);

export interface PgErrorLike{message?:string;code?:string|null;details?:string|null;hint?:string|null}
/** PostgreSQL / PostgREST error → DocumentsDbError (shared by the Supabase and pg adapters). */
export function toDocumentsDbError(e:PgErrorLike|DocumentsDbError):DocumentsDbError{
 if(e instanceof DocumentsDbError)return e;
 const message=e.message??'';
 const head=message.split(/[\s:]/,1)[0];
 if(e.code==='55P03'||head==='lease_lost')return new DocumentsDbError('lease_lost',message||'lease_lost');
 if((MESSAGE_CODES as readonly string[]).includes(head))return new DocumentsDbError(head as DocumentsDbErrorCode,message);
 if(e.code&&INPUT_STATES.has(e.code))return new DocumentsDbError('invalid_input',message);
 return new DocumentsDbError('unknown',message||'unknown');
}

/** Opaque cursor: base64url(JSON array of the sort key). */
export function encodeCursor(parts:(string|number)[]):string{return Buffer.from(JSON.stringify(parts),'utf8').toString('base64url');}
export function decodeCursor(c:string):(string|number)[]{
 let v:unknown;
 try{v=JSON.parse(Buffer.from(c,'base64url').toString('utf8'));}catch{throw new DocumentsDbError('invalid_input','invalid_cursor');}
 if(!Array.isArray(v)||v.length===0||!v.every(x=>typeof x==='string'||typeof x==='number'))throw new DocumentsDbError('invalid_input','invalid_cursor');
 return v as (string|number)[];
}
/** Plain chunking (an empty input yields no chunk). */
export function chunk<T>(xs:T[],size:number):T[][]{const out:T[][]=[];for(let i=0;i<xs.length;i+=size)out.push(xs.slice(i,i+size));return out;}
export function checkLimit(limit:number):number{
 if(!Number.isInteger(limit)||limit<1||limit>PAGE_LIMIT_MAX)throw new DocumentsDbError('invalid_input',`invalid_limit:${limit}`);
 return limit;
}
/** PostgREST answers at most 1,000 rows (max_rows), so a limit + 1 look-ahead read must ask for ≤ 1,000 (codex plan round 1 P2-1). */
export const LOOKAHEAD_MAX=999;
/** Page size of a limit + 1 look-ahead read (documentVersions, extractionsOf), the same in all three implementations: a valid limit capped at LOOKAHEAD_MAX (a short page with a next cursor is an ordinary page). */
export const lookaheadLimit=(limit:number)=>Math.min(checkLimit(limit),LOOKAHEAD_MAX);
/** approvalsFor detects overflow by look-ahead, so its limit itself must be ≤ LOOKAHEAD_MAX (all three implementations). */
export function checkApprovalsLimit(limit:number):number{
 const l=checkLimit(limit);
 if(l>LOOKAHEAD_MAX)throw new DocumentsDbError('invalid_input',`invalid_limit:${limit}`);
 return l;
}
export function checkIds<T>(ids:T[],max=IDS_MAX):T[]{if(ids.length>max)throw new DocumentsDbError('invalid_input',`too_many_ids:${ids.length}`);return ids;}

// ---------------------------------------------------------------- row normalisation (PostgREST json, to_jsonb, or pg text)
// F3 recheck N1: timestamps keep PostgreSQL's microseconds. Canonical form = UTC ISO with 3 fractional digits, extended to 6
// only when the sub-millisecond part is non-zero ('.123Z', '.123456Z'); canonical strings are NOT lexicographically ordered
// across those two widths, so compare with tsSortKey.
const TS_PARTS=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;
/** String-based timestamptz parser (offsets, 1–9 fractional digits, rounded half up to microseconds); null if not a timestamp. */
export function canonTs(v:string):string|null{
 const m=TS_PARTS.exec(v.trim());if(!m)return null;
 const [y,mo,d,h,mi,sec]=[m[1],m[2],m[3],m[4]??'0',m[5]??'0',m[6]??'0'].map(Number);
 if(mo<1||mo>12||d<1||d>31||h>23||mi>59||sec>59)return null;
 let off=0;
 if(m[8]&&m[8]!=='Z'){const o=m[8];const sign=o[0]==='-'?-1:1;const digits=o.slice(1).replace(':','');const oh=Number(digits.slice(0,2)),om=Number(digits.slice(2)||'0');if(oh>15||om>59)return null;off=sign*(oh*60+om);}
 const base=Date.UTC(y,mo-1,d,h,mi,sec);const chk=new Date(base);
 if(Number.isNaN(base)||chk.getUTCDate()!==d||chk.getUTCMonth()!==mo-1)return null;   // 31 February and friends
 const frac=(m[7]??'').padEnd(7,'0');
 const micros=BigInt(base-off*60000)*1000n+BigInt(frac.slice(0,6))+(Number(frac[6])>=5?1n:0n);
 const msPart=micros/1000n,sub=Number(micros%1000n);   // BigInt division truncates toward zero; pre-1970 values are not expected
 const iso=new Date(Number(msPart)).toISOString();
 return sub===0?iso:`${iso.slice(0,-1)}${String(sub).padStart(3,'0')}Z`;
}
/** Fixed-width key (always 6 fractional digits) so string comparison = chronological comparison; null for non-timestamps. */
export function tsSortKey(v:string):string|null{
 const c=canonTs(v);if(c===null)return null;
 return c.length===24?`${c.slice(0,-1)}000Z`:c;
}
const ts=(v:unknown):string=>v instanceof Date?v.toISOString():(canonTs(String(v))??new Date(String(v)).toISOString());
const tsOrNull=(v:unknown):string|null=>v===null||v===undefined?null:ts(v);
const strOrNull=(v:unknown):string|null=>v===null||v===undefined?null:String(v);
const numOrNull=(v:unknown):number|null=>v===null||v===undefined?null:Number(v);
const obj=<T>(v:unknown):T=>(v&&typeof v==='object'?v:{}) as T;

export function documentFromRow(r:Record<string,unknown>):DocumentRow{
 return {
  document_id:String(r.document_id),issuer_id:strOrNull(r.issuer_id),source:r.source as DocumentRow['source'],market:r.market as DocumentRow['market'],
  source_ref:String(r.source_ref),source_version:Number(r.source_version),supersedes_document_id:strOrNull(r.supersedes_document_id),observed_replacement:r.observed_replacement===true,
  form_type:strOrNull(r.form_type),doc_class:r.doc_class as DocumentRow['doc_class'],classifier_gen:Number(r.classifier_gen),title:String(r.title),
  language:(r.language??null) as DocumentRow['language'],source_url:strOrNull(r.source_url),content_sha256:String(r.content_sha256),bytes:Number(r.bytes),
  mime:r.mime as DocumentRow['mime'],storage_path:String(r.storage_path),acquisition:obj<Acquisition>(r.acquisition),published_at:ts(r.published_at),
  published_at_precision:r.published_at_precision as DocumentRow['published_at_precision'],available_at:ts(r.available_at),available_date:String(r.available_date),
  fiscal_year:numOrNull(r.fiscal_year),fiscal_period:(r.fiscal_period??null) as DocumentRow['fiscal_period'],period_end:strOrNull(r.period_end),
  filing_source_ref:strOrNull(r.filing_source_ref),permission:r.permission as DocumentRow['permission'],owner_user_id:strOrNull(r.owner_user_id),
  license_ref:strOrNull(r.license_ref),status:r.status as DocumentRow['status'],current_extraction_id:strOrNull(r.current_extraction_id),
  extract_lease_until:tsOrNull(r.extract_lease_until),extract_lease_batch_id:strOrNull(r.extract_lease_batch_id),extract_attempts:Number(r.extract_attempts),
  batch_id:String(r.batch_id),code_version:String(r.code_version),created_at:ts(r.created_at),
 };
}
export function assetFromRow(r:Record<string,unknown>):AssetRow{
 return {asset_id:String(r.asset_id),document_id:String(r.document_id),role:r.role as AssetRow['role'],filename:String(r.filename),source_url:String(r.source_url),
  content_sha256:String(r.content_sha256),bytes:Number(r.bytes),mime:String(r.mime),storage_path:String(r.storage_path),acquisition:obj<Acquisition>(r.acquisition),created_at:ts(r.created_at)};
}
export function extractionFromRow(r:Record<string,unknown>):ExtractionRow{
 return {extraction_id:String(r.extraction_id),document_id:String(r.document_id),extractor_version:String(r.extractor_version),table_algo_version:String(r.table_algo_version),
  code_version:String(r.code_version),has_text_layer:r.has_text_layer===true,page_count:Number(r.page_count),pages_json_path:String(r.pages_json_path),
  pages_json_sha256:String(r.pages_json_sha256),candidates_role:r.candidates_role as ExtractionRow['candidates_role'],candidates_status:r.candidates_status as ExtractionRow['candidates_status'],
  candidates_attempts:Number(r.candidates_attempts),candidates_lease_until:tsOrNull(r.candidates_lease_until),candidates_lease_batch_id:strOrNull(r.candidates_lease_batch_id),
  batch_id:String(r.batch_id),created_at:ts(r.created_at)};
}
export function pageFromRow(r:Record<string,unknown>):PageRow{
 return {extraction_id:String(r.extraction_id),page_no:Number(r.page_no),text:String(r.text),text_hash:String(r.text_hash),char_count:Number(r.char_count),
  width:numOrNull(r.width),height:numOrNull(r.height),line_count:Number(r.line_count),has_tables:r.has_tables===true};
}
export function citationFromRow(r:Record<string,unknown>):CitationRow{
 return {citation_id:String(r.citation_id),document_id:String(r.document_id),extraction_id:String(r.extraction_id),page_no:Number(r.page_no),
  char_start:Number(r.char_start),char_end:Number(r.char_end),bbox:(r.bbox??null) as CitationRow['bbox'],snippet:String(r.snippet),text_hash:String(r.text_hash),
  visibility:r.visibility as CitationRow['visibility'],created_by:r.created_by as CitationRow['created_by'],created_ref:String(r.created_ref),created_at:ts(r.created_at)};
}
export function candidateFromRow(r:Record<string,unknown>):CandidateRow{
 return {candidate_id:String(r.candidate_id),document_id:String(r.document_id),extraction_id:String(r.extraction_id),kind:r.kind as CandidateRow['kind'],
  extractor_kind:r.extractor_kind as CandidateRow['extractor_kind'],extractor_ref:String(r.extractor_ref),natural_key:String(r.natural_key),
  citations:obj<CandidateRow['citations']>(r.citations),payload:obj<CandidateRow['payload']>(r.payload),fingerprint:String(r.fingerprint),
  checks:(Array.isArray(r.checks)?r.checks:[]) as CandidateRow['checks'],checks_passed:r.checks_passed===true,status:r.status as CandidateStatus,
  decision_kind:(r.decision_kind??null) as CandidateRow['decision_kind'],decided_by:strOrNull(r.decided_by),approval_id:strOrNull(r.approval_id),
  decided_at:tsOrNull(r.decided_at),inherited_from:strOrNull(r.inherited_from),input_snapshot:obj<CandidateRow['input_snapshot']>(r.input_snapshot),
  batch_id:String(r.batch_id),created_at:ts(r.created_at)};
}
export function publicationFromRow(r:Record<string,unknown>):PublicationRow{
 return {candidate_id:String(r.candidate_id),pub_gen:Number(r.pub_gen),run_id:String(r.run_id),fact_id:String(r.fact_id),state:r.state as PublicationRow['state'],created_at:ts(r.created_at),updated_at:ts(r.updated_at)};
}
export function approvalFromRow(r:Record<string,unknown>):ApprovalRow{
 return {approval_id:String(r.approval_id),extractor_ref:String(r.extractor_ref),extractor_version:String(r.extractor_version),table_algo_version:String(r.table_algo_version),
  code_version:String(r.code_version),concepts:(Array.isArray(r.concepts)?r.concepts:[]).map(x=>x===null||x===undefined?null:String(x)) as string[],   // a NULL element stays null, not 'null'
  gold_sha256:String(r.gold_sha256),
  precision:canonicalDecimal(String(r.precision)),recall:canonicalDecimal(String(r.recall)),report_path:String(r.report_path),approved_by:String(r.approved_by),
  approved_at:ts(r.approved_at),revoked_at:tsOrNull(r.revoked_at)};
}
export function scopeFromRow(r:Record<string,unknown>):DocScopeRow{
 return {issuer_id:String(r.issuer_id),source:r.source as ListedSource,reasons:(Array.isArray(r.reasons)?r.reasons:[]).map(String),priority:Number(r.priority),
  fetch_key:String(r.fetch_key),backfill_cursor:obj<DocScopeRow['backfill_cursor']>(r.backfill_cursor),backfill_done:r.backfill_done===true,
  poll_cursor:obj<DocScopeRow['poll_cursor']>(r.poll_cursor),next_due_at:ts(r.next_due_at),lease_until:tsOrNull(r.lease_until),lease_batch_id:strOrNull(r.lease_batch_id),
  last_attempt_at:tsOrNull(r.last_attempt_at),last_success_at:tsOrNull(r.last_success_at),last_status:(r.last_status??null) as DocScopeRow['last_status'],updated_at:ts(r.updated_at)};
}

// ---------------------------------------------------------------- argument builders (shared by the Supabase and pg adapters)
/** DocumentInsert → p_doc (the function supplies id, version, supersedes, status, timestamps). */
export const docArg=(d:DocumentInsert)=>({...d});
export const assetsArg=(a:AssetInsert[])=>a.map(x=>({...x}));
export const extractionArg=(e:ExtractionInsert)=>({...e});
export const pagesArg=(p:PageInsert[])=>p.map(x=>({...x}));
export const approvalArg=(a:Omit<ApprovalRow,'approval_id'|'approved_at'|'revoked_at'>)=>({...a});
export function candidatesWhere(where:{extractionId:string}|{status:CandidateStatus}|{issuerId:string;status?:CandidateStatus}){
 if('extractionId' in where)return {p_extraction:where.extractionId,p_status:null,p_issuer:null};
 if('issuerId' in where)return {p_extraction:null,p_status:where.status??null,p_issuer:where.issuerId};
 return {p_extraction:null,p_status:where.status,p_issuer:null};
}
export function publicationsWhere(where:{candidateIds:string[]}|{runId:string}|{issuerId:string;pubGen:number;state?:PublicationRow['state']}){
 if('candidateIds' in where)return {p_candidate_ids:checkIds(where.candidateIds),p_run:null,p_issuer:null,p_pub_gen:null,p_state:null};
 if('runId' in where)return {p_candidate_ids:null,p_run:where.runId,p_issuer:null,p_pub_gen:null,p_state:null};
 return {p_candidate_ids:null,p_run:null,p_issuer:where.issuerId,p_pub_gen:where.pubGen,p_state:where.state??null};
}
export const regenFilter=(f:CandidatesFilter)=>Object.fromEntries(Object.entries(f).filter(([,v])=>v!==undefined));
/** Envelope of read_documents / list_* → Page (the SQL cursor object becomes an opaque string). */
export interface Envelope{rows:Record<string,unknown>[];next_cursor:Record<string,unknown>|null}
export function pageOf<T>(env:Envelope,map:(r:Record<string,unknown>)=>T,keys:string[]):Page<T>{
 const nc=env.next_cursor;
 return {rows:(env.rows??[]).map(map),nextCursor:nc?encodeCursor(keys.map(k=>nc[k] as string|number)):null};
}
/** Opaque cursor → the SQL cursor object of read_documents / list_* (keys in order). */
export function sqlCursor(cursor:string|null|undefined,keys:string[]):Record<string,string|number>|null{
 if(!cursor)return null;
 const parts=decodeCursor(cursor);
 if(parts.length!==keys.length)throw new DocumentsDbError('invalid_input','invalid_cursor');
 return Object.fromEntries(keys.map((k,i)=>[k,parts[i]]));
}
export const READ_DOC_KEYS=['available_at','document_id'];
export const CANDIDATE_KEYS=['created_at','candidate_id'];
export const PUBLICATION_KEYS=['candidate_id','pub_gen'];
export function readDocumentsArgs(issuer:string,o:Parameters<DocumentsDb['readDocuments']>[1]){
 return {p_issuer:issuer,p_as_of:o.asOf,p_source:o.source??null,p_doc_class:o.docClass??null,p_from:o.from??null,p_to:o.to??null,
  p_cursor:sqlCursor(o.cursor,READ_DOC_KEYS),p_limit:checkLimit(o.limit),p_all_versions:o.allVersions===true};
}
/** Keyset slice of an ordered page read with limit + 1 rows: the extra row only signals "more". */
export function sliceRows<R,T>(raw:R[],limit:number,map:(r:R)=>T,key:(r:R)=>(string|number)[]):Page<T>{
 const more=raw.length>limit;const kept=more?raw.slice(0,limit):raw;
 return {rows:kept.map(map),nextCursor:more?encodeCursor(key(kept[kept.length-1])):null};
}

/** precision / recall are numeric: read them as text so no digit is lost in JSON number parsing. */
const APPROVAL_SELECT='approval_id,extractor_ref,extractor_version,table_algo_version,code_version,concepts,gold_sha256,precision::text,recall::text,report_path,approved_by,approved_at,revoked_at';
interface RpcResult{data:unknown;error:PgErrorLike|null}
// The query builder is left untyped on purpose (same as src/lib/facts/db.ts).
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;from:(table:string)=>any}

export function supabaseDocumentsDb(client:SupabaseClient):DocumentsDb{
 const c=client as unknown as NarrowClient;
 const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toDocumentsDbError(error);return data as T;};
 const rows=async(q:PromiseLike<RpcResult>):Promise<Record<string,unknown>[]>=>{const {data,error}=await q;if(error)throw toDocumentsDbError(error);return (data??[]) as Record<string,unknown>[];};
 const maybe=async(q:PromiseLike<RpcResult>):Promise<Record<string,unknown>|null>=>{const {data,error}=await q;if(error)throw toDocumentsDbError(error);return (data??null) as Record<string,unknown>|null;};
 return {
  async reconcileScope(source,input){return Number(await call('reconcile_document_sync_scope',{p_source:source,p_rows:input}));},
  async claimSyncLease(issuer,source,batch,ttl){return (await call('claim_document_sync_lease',{p_issuer:issuer,p_source:source,p_batch:batch,p_ttl:ttl}))===true;},
  insertDocumentVersion:(issuer,source,batch,doc,assets)=>call<InsertVersionResult>('insert_document_version',{p_issuer:issuer,p_source:source,p_batch:batch,p_doc:docArg(doc),p_assets:assetsArg(assets)}),
  insertUploadDocument:(owner,doc)=>call<InsertVersionResult>('insert_upload_document',{p_owner:owner,p_doc:docArg(doc)}),
  async advanceCursor(issuer,source,batch,mode,cursor,done,reset=false){await call('advance_document_cursor',{p_issuer:issuer,p_source:source,p_batch:batch,p_mode:mode,p_cursor:cursor,p_done:done,p_reset:reset});},
  async releaseSyncLease(issuer,source,batch,outcome,nextDue){await call('release_document_sync_lease',{p_issuer:issuer,p_source:source,p_batch:batch,p_outcome:outcome,p_next_due:nextDue});},
  async reclassifyDocument(document,patch,actor){await call('reclassify_document',{p_document:document,p_patch:patch,p_actor:actor});},
  async claimExtractLease(document,batch,ttl){return (await call('claim_document_extract_lease',{p_document:document,p_batch:batch,p_ttl:ttl}))===true;},
  async renewExtractLease(document,batch,ttl){return (await call('renew_document_extract_lease',{p_document:document,p_batch:batch,p_ttl:ttl}))===true;},
  async finishExtract(document,batch,extraction,pages){return String(await call('finish_document_extract',{p_document:document,p_batch:batch,p_extraction:extractionArg(extraction),p_pages:pagesArg(pages)}));},
  async failExtract(document,batch,code){await call('fail_document_extract',{p_document:document,p_batch:batch,p_code:code});},
  async requestExtract(document,actor){await call('request_document_extract',{p_document:document,p_actor:actor,p_extractor_version:EXTRACTOR_VERSION,p_table_algo_version:TABLE_ALGO_VERSION});},
  async claimCandidatesLease(extraction,batch,ttl){return (await call('claim_candidates_lease',{p_extraction:extraction,p_batch:batch,p_ttl:ttl}))===true;},
  async renewCandidatesLease(extraction,batch,ttl){return (await call('renew_candidates_lease',{p_extraction:extraction,p_batch:batch,p_ttl:ttl}))===true;},
  async finishCandidates(extraction,batch,status){await call('finish_candidates',{p_extraction:extraction,p_batch:batch,p_status:status});},
  async requestCandidatesRegen(filter,actor){return Number(await call('request_candidates_regen',{p_filter:regenFilter(filter),p_actor:actor}));},
  async writeCandidateChecks(extraction,batch,input){
   checkWriteRows(input);   // one rpc = one transaction: no chunking, so a failure on any row writes nothing
   const r=await call<{written:number;inherited:number}>('write_candidate_checks',{p_extraction:extraction,p_batch:batch,p_rows:input});
   return {written:Number(r.written),inherited:Number(r.inherited)};
  },
  async insertCitation(row){return String(await call('insert_citation',{p_row:row}));},
  async publishCitations(ids){return Number(await call('publish_citations',{p_ids:ids}));},
  async insertCandidates(extraction,batch,input){
   checkWriteRows(input);
   return {inserted:Number((await call<{inserted:number}>('insert_candidates',{p_extraction:extraction,p_batch:batch,p_rows:input})).inserted)};
  },
  async decideCandidate(candidate,decision){const r=await call<{status:CandidateStatus}>('decide_candidate',{p_candidate:candidate,p_decision:decision});return {status:r.status};},
  async stageCandidatePublication(candidate,pubGen,run,factId){
   const r=await call<{outcome:string}>('stage_candidate_publication',{p_candidate:candidate,p_pub_gen:pubGen,p_run:run,p_fact_id:factId});
   if(r.outcome==='approval_revoked')throw new DocumentsDbError('approval_revoked');   // the reversion to 'candidate' is committed (§4.8)
  },
  async insertApproval(row){
   const r=await maybe(c.from('extraction_approvals').insert(approvalArg(row)).select('approval_id').single());
   if(!r)throw new DocumentsDbError('unknown','approval_not_returned');
   return String(r.approval_id);
  },
  async revokeApproval(approvalId){
   const changed=await rows(c.from('extraction_approvals').update({revoked_at:new Date().toISOString()}).eq('approval_id',approvalId).is('revoked_at',null).select('approval_id'));
   if(changed.length===0&&!(await maybe(c.from('extraction_approvals').select('approval_id').eq('approval_id',approvalId).maybeSingle())))throw new DocumentsDbError('not_found');
  },
  async documentVersions(source,sourceRef,page){
   const limit=lookaheadLimit(page.limit);
   let q=c.from('disclosure_documents').select('*').eq('source',source).eq('source_ref',sourceRef);
   if(page.cursor)q=q.gt('source_version',Number(decodeCursor(page.cursor)[0]));
   return sliceRows(await rows(q.order('source_version').limit(limit+1)),limit,documentFromRow,r=>[Number(r.source_version)]);
  },
  async knownSourceRefs(issuer,source,refs){
   const out=new Set<string>();
   for(const part of chunk([...new Set(refs)],REFS_CHUNK))for(const r of (await call<string[]|null>('known_source_refs',{p_issuer:issuer,p_source:source,p_refs:part}))??[])out.add(r);
   return out;
  },
  async readDocuments(issuer,opts){return pageOf(await call<Envelope>('read_documents',readDocumentsArgs(issuer,opts)),documentFromRow,READ_DOC_KEYS);},
  async documentById(id){const r=await maybe(c.from('disclosure_documents').select('*').eq('document_id',id).maybeSingle());return r?documentFromRow(r):null;},
  async assetsOf(documentId){return (await rows(c.from('document_assets').select('*').eq('document_id',documentId).order('role').order('filename').limit(PAGE_LIMIT_MAX))).map(assetFromRow);},
  async extractionsOf(documentId,page){
   const limit=lookaheadLimit(page.limit);
   const cur=page.cursor?timestampUuidCursor(page.cursor):null;   // validated before anything is built
   let q=c.from('document_extractions').select('*').eq('document_id',documentId);
   if(cur){const [at,id]=cur;q=q.or(`created_at.lt."${at}",and(created_at.eq."${at}",extraction_id.lt.${id})`);}
   return sliceRows(await rows(q.order('created_at',{ascending:false}).order('extraction_id',{ascending:false}).limit(limit+1)),limit,extractionFromRow,r=>[String(r.created_at),String(r.extraction_id)]);
  },
  async extractionById(id){const r=await maybe(c.from('document_extractions').select('*').eq('extraction_id',id).maybeSingle());return r?extractionFromRow(r):null;},
  async pagesOf(extractionId,pageNos){
   if(checkIds(pageNos).length===0)return [];
   return (await rows(c.from('document_pages').select('*').eq('extraction_id',extractionId).in('page_no',[...new Set(pageNos)]).order('page_no'))).map(pageFromRow);
  },
  async citationById(id){const r=await maybe(c.from('document_citations').select('*').eq('citation_id',id).maybeSingle());return r?citationFromRow(r):null;},
  async citationsByIds(ids){
   if(checkIds(ids).length===0)return [];
   return (await rows(c.from('document_citations').select('*').in('citation_id',[...new Set(ids)]).order('citation_id'))).map(citationFromRow);
  },
  async candidatesOf(where,page){
   return pageOf(await call<Envelope>('list_candidates',{...candidatesWhere(where),p_cursor:sqlCursor(page.cursor,CANDIDATE_KEYS),p_limit:checkLimit(page.limit)}),candidateFromRow,CANDIDATE_KEYS);
  },
  async candidateById(id){const r=await maybe(c.from('extraction_candidates').select('*').eq('candidate_id',id).maybeSingle());return r?candidateFromRow(r):null;},
  async publicationsOf(where,page){
   return pageOf(await call<Envelope>('list_candidate_publications',{...publicationsWhere(where),p_cursor:sqlCursor(page.cursor,PUBLICATION_KEYS),p_limit:checkLimit(page.limit)}),publicationFromRow,PUBLICATION_KEYS);
  },
  async approvalsFor(extractorRef,opts){
   const limit=checkApprovalsLimit(opts.limit);
   const r=await rows(c.from('extraction_approvals').select(APPROVAL_SELECT).eq('extractor_ref',extractorRef).is('revoked_at',null).order('approved_at',{ascending:false}).order('approval_id').limit(limit+1));
   if(r.length>limit)throw new DocumentsDbError('too_many_approvals',`more than ${limit} approvals for ${extractorRef}`);
   return r.map(approvalFromRow);
  },
  async storedDue(limit){return ((await call<Record<string,unknown>[]|null>('documents_stored_due',{p_limit:checkLimit(limit)}))??[]).map(documentFromRow);},
  async candidatesDue(limit){return ((await call<Record<string,unknown>[]|null>('extractions_candidates_due',{p_limit:checkLimit(limit)}))??[]).map(extractionFromRow);},
  async scopeDue(source,now,limit){
   return (await rows(c.from('document_sync_scope').select('*').eq('source',source).gt('priority',0).lte('next_due_at',now)
    .order('next_due_at').order('priority',{ascending:false}).order('issuer_id').limit(checkLimit(limit)))).map(scopeFromRow);
  },
  async scopeRows(source,issuerIds){
   const out:DocScopeRow[]=[];
   for(const part of chunk([...new Set(issuerIds)],IN_CHUNK))out.push(...(await rows(c.from('document_sync_scope').select('*').eq('source',source).in('issuer_id',part).order('issuer_id'))).map(scopeFromRow));
   return out;
  },
  async scopeAll(source){
   const out:DocScopeRow[]=[];
   for(let last:string|null=null;;){   // keyset on issuer_id (the primary key's leading column): stable under concurrent inserts, unlike offset ranges
    let q=c.from('document_sync_scope').select('*').eq('source',source);
    if(last!==null)q=q.gt('issuer_id',last);
    const r=await rows(q.order('issuer_id').limit(PAGE_LIMIT_MAX));
    out.push(...r.map(scopeFromRow));
    if(r.length<PAGE_LIMIT_MAX)return out;
    last=String(r[r.length-1].issuer_id);
   }
  },
 };
}
/** Exhaustive pager for callers that need every row of a paged read (tests, scripts). */
export async function allPages<T>(read:(page:PageOpts)=>Promise<Page<T>>,limit=PAGE_LIMIT_MAX):Promise<T[]>{
 const out:T[]=[];let cursor:string|null=null;
 do{const p:Page<T>=await read({cursor,limit});out.push(...p.rows);cursor=p.nextCursor;}while(cursor);
 return out;
}
