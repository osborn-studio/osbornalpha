// src/lib/documents/memory-documents-db.ts
// In-memory DocumentsDb for unit tests (spec §4.8, §4.11, §11.1). It reproduces the rules of the
// migration-one SQL functions so sync/extract/candidates unit tests see the database's behaviour:
// sync scope leases (claim / renew / expiry against an injectable clock), version allocation per
// (source, source_ref) with duplicate / versioned / supersedes / observed_replacement, extract and
// candidates leases with attempts counted only at claim and the third crash closed by the next claim
// (extract_failed / exhausted), the candidates role decided at finishExtract, revision_exists,
// code-point citation validation, publish_citations limits, candidate insertion (always
// 'candidate'), write_candidate_checks with human-decision inheritance by fingerprint,
// decide_candidate (human and auto rules), the publication state machine of
// stage_candidate_publication (incl. approval_revoked with the reversion kept), approvals with the
// threshold and too_many_approvals, read_documents as-of version selection, and keyset cursors.
// Every method validates fully before it writes (one SQL statement / transaction) and contains no
// await between its reads and writes, so calls are atomic with respect to each other.
// _raw exposes the maps for memoryHkFactsPort (Task 13) and for tests that need a state no
// migration-one function produces (e.g. a publication marked abandoned by migration two).
import {createHash,randomUUID} from 'node:crypto';
import {canonicalDecimal} from '../facts/json-numbers';
import {ASSETS_MAX,canonTs,checkApprovalsLimit,tsSortKey,checkIds,checkLimit,checkWriteRows,decodeCursor,encodeCursor,lookaheadLimit,regenFilter} from './db';
import {DocumentsDbError,EXTRACTOR_VERSION,PAGE_LIMIT_MAX,TABLE_ALGO_VERSION} from './types';
import type {
 ApprovalRow,AssetRow,CandidateRow,CitationRow,DocScopeRow,DocumentInsert,DocumentRow,DocumentsDb,ExtractionRow,ListedSource,Page,PageRow,PublicationRow,
} from './types';

export interface MemoryDocumentsDb extends DocumentsDb{
 /** Fixes "now" for leases and timestamps; null returns to the wall clock. */
 setNow(iso:string|null):void;
 expireSyncLease(issuer:string,source:ListedSource):void;
 expireExtractLease(document:string):void;
 expireCandidatesLease(extraction:string):void;
 documents():DocumentRow[];extractions():ExtractionRow[];pages():PageRow[];citations():CitationRow[];candidates():CandidateRow[];
 publications():PublicationRow[];approvals():ApprovalRow[];scope():DocScopeRow[];assets():AssetRow[];
 _raw:{documents:Map<string,DocumentRow>;assets:Map<string,AssetRow>;extractions:Map<string,ExtractionRow>;pages:Map<string,PageRow>;citations:Map<string,CitationRow>;
  candidates:Map<string,CandidateRow>;publications:Map<string,PublicationRow>;approvals:Map<string,ApprovalRow>;scope:Map<string,DocScopeRow>};
}

const LISTED:readonly string[]=['edgar','cninfo','hkexnews'];
const MARKETS:readonly string[]=['US','CN','HK','other'];
const CLASSES:readonly string[]=['annual_report','interim_report','quarterly_report','results_announcement','current_report','registration','proxy','ownership','other'];
const MIMES:readonly string[]=['application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json'];
const SHA=/^[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid=(m:string)=>new DocumentsDbError('invalid_input',m);
const leaseLost=()=>new DocumentsDbError('lease_lost');
const notFound=()=>new DocumentsDbError('not_found');
const clone=<T>(v:T):T=>structuredClone(v);
// F3 recheck N1: timestamp-looking strings compare chronologically at microsecond resolution (canonical strings of different widths do not sort lexicographically)
const cmpKey=(x:string|number):string|number=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}[T ]/.test(x)?(tsSortKey(x)??x):x;
const cmp=(a0:string|number,b0:string|number)=>{const a=cmpKey(a0),b=cmpKey(b0);return a<b?-1:a>b?1:0;};
const sk=(issuer:string,source:string)=>`${issuer}|${source}`;
const pk=(extraction:string,page:number)=>`${extraction}|${page}`;
const ck=(candidate:string,gen:number)=>`${candidate}|${gen}`;
const sha256=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
/** Code points, like PostgreSQL length()/substr() on a UTF8 database. */
const cps=(s:string)=>Array.from(s);
/** A timestamp every writer-supplied value is normalised to (canonical UTC ISO), so string order = chronological order like timestamptz in SQL (F3 review). */
const normTs=(v:unknown,what:string):string=>{
 if(typeof v!=='string')throw invalid(what);
 const c=canonTs(v);if(c!==null)return c;   // string parser: keeps microseconds, handles offsets
 const t=Date.parse(v);if(Number.isNaN(t))throw invalid(what);return new Date(t).toISOString();
};
/** Exact comparison of two non-negative plain decimal strings: <0, 0, >0 (no Number: ea_threshold is numeric in SQL). */
function cmpDecimal(a:string,b:string):number{
 const parse=(x:string)=>{const m=/^(\d+)(?:\.(\d*))?$/.exec(x);if(!m)throw invalid('decimal');return {int:m[1],frac:m[2]??''};};
 const x=parse(a),y=parse(b);const n=Math.max(x.frac.length,y.frac.length);
 const big=(d:{int:string;frac:string})=>BigInt(d.int+d.frac.padEnd(n,'0'));
 const bx=big(x),by=big(y);return bx<by?-1:bx>by?1:0;
}
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);

/** The column checks of disclosure_documents (§4.1) that a writer could violate. */
function checkDocument(d:DocumentRow):void{
 if(!MARKETS.includes(d.market))throw invalid('market');
 if(!CLASSES.includes(d.doc_class))throw invalid('doc_class');
 if(!Number.isInteger(d.classifier_gen)||d.classifier_gen<0)throw invalid('classifier_gen');
 if(typeof d.title!=='string')throw invalid('title');
 if(d.language!==null&&d.language!=='zh'&&d.language!=='en')throw invalid('language');
 if(!SHA.test(d.content_sha256))throw invalid('content_sha256');
 if(!Number.isInteger(d.bytes)||d.bytes<=0)throw invalid('bytes');
 if(!MIMES.includes(d.mime))throw invalid('mime');
 if(typeof d.storage_path!=='string'||!d.storage_path)throw invalid('storage_path');
 if(!isObj(d.acquisition))throw invalid('acquisition');
 if(d.published_at_precision!=='instant'&&d.published_at_precision!=='date')throw invalid('published_at_precision');
 if(Number.isNaN(Date.parse(d.published_at))||Number.isNaN(Date.parse(d.available_at))||!/^\d{4}-\d{2}-\d{2}$/.test(d.available_date))throw invalid('dates');
 if(d.fiscal_period!==null&&!['FY','H1','Q1','Q3'].includes(d.fiscal_period))throw invalid('fiscal_period');
 if(!['public','licensed','private'].includes(d.permission))throw invalid('permission');
 if((d.permission==='public')!==(d.owner_user_id===null))throw invalid('dd_owner_iff_private');
 if(d.permission==='public'&&d.issuer_id===null)throw invalid('dd_issuer_required');
 if((d.source==='upload')!==(d.source_url===null))throw invalid('dd_upload_shape');
 if(typeof d.code_version!=='string'||!d.batch_id)throw invalid('code_version/batch_id');
}

export function memoryDocumentsDb(opts:{now?:()=>Date}={}):MemoryDocumentsDb{
 const documents=new Map<string,DocumentRow>();const assets=new Map<string,AssetRow>();const extractions=new Map<string,ExtractionRow>();
 const pages=new Map<string,PageRow>();const citations=new Map<string,CitationRow>();const candidates=new Map<string,CandidateRow>();
 const publications=new Map<string,PublicationRow>();const approvals=new Map<string,ApprovalRow>();const scope=new Map<string,DocScopeRow>();
 let fixedNow:string|null=null;let lastStamp='';
 const now=()=>fixedNow??(opts.now?opts.now():new Date()).toISOString();
 const later=(secs:number)=>new Date(Date.parse(now())+secs*1000).toISOString();
 /** created_at: strictly increasing, so (created_at, id) orders like insertion. */
 const stamp=()=>{const t=now();lastStamp=cmp(t,lastStamp)>0?t:new Date(Date.parse(lastStamp)+1).toISOString();return lastStamp;};
 const live=(until:string|null)=>until!==null&&cmp(until,now())>0;
 const ttlCheck=(ttl:number)=>{if(!Number.isInteger(ttl)||ttl<1)throw invalid('ttl');};
 const listed=(source:string)=>{if(!LISTED.includes(source))throw invalid('source');};

 const scopeLock=(issuer:string,source:string,batch:string)=>{
  const s=scope.get(sk(issuer,source));
  if(!s||s.lease_batch_id!==batch||!live(s.lease_until))throw leaseLost();
  return s;
 };
 const docOf=(id:string)=>{const d=documents.get(id);if(!d)throw notFound();return d;};
 const extractLock=(document:string,batch:string)=>{const d=docOf(document);if(d.extract_lease_batch_id!==batch||!live(d.extract_lease_until))throw leaseLost();return d;};
 const candidatesLock=(extraction:string,batch:string)=>{
  const e=extractions.get(extraction);if(!e)throw notFound();
  if(e.candidates_lease_batch_id!==batch||!live(e.candidates_lease_until))throw leaseLost();
  return e;
 };
 const versionsOf=(source:string,ref:string)=>[...documents.values()].filter(d=>d.source===source&&d.source_ref===ref).sort((a,b)=>a.source_version-b.source_version);
 const candidateCitationIds=(c:Record<string,unknown>)=>{
  const out:unknown[]=[];
  for(const v of Object.values(c)){
   if(typeof v==='string')out.push(v);
   else if(Array.isArray(v))for(const a of v)out.push(isObj(a)?a.citation_id:null);   // F3: a non-object element yields a NULL id → reference error, like SQL
  }
  return out;
 };
 const page=<T>(sorted:T[],limit:number,key:(r:T)=>(string|number)[]):Page<T>=>{
  const more=sorted.length>limit;const kept=sorted.slice(0,limit);
  return {rows:kept.map(clone),nextCursor:more?encodeCursor(key(kept[kept.length-1])):null};
 };
 const after=(cursor:string|null|undefined,n:number)=>{if(!cursor)return null;const p=decodeCursor(cursor);if(p.length!==n)throw invalid('invalid_cursor');return p;};
 /** (a1,a2) > (b1,b2) lexicographic. */
 const gt2=(a:(string|number)[],b:(string|number)[])=>cmp(a[0],b[0])>0||(cmp(a[0],b[0])===0&&cmp(a[1],b[1])>0);

 const db:MemoryDocumentsDb={
  setNow(iso){fixedNow=iso===null?null:normTs(iso,'now');},
  expireSyncLease(issuer,source){const s=scope.get(sk(issuer,source));if(s&&s.lease_until)s.lease_until=new Date(Date.parse(now())-1000).toISOString();},
  expireExtractLease(document){const d=documents.get(document);if(d&&d.extract_lease_until)d.extract_lease_until=new Date(Date.parse(now())-1000).toISOString();},
  expireCandidatesLease(extraction){const e=extractions.get(extraction);if(e&&e.candidates_lease_until)e.candidates_lease_until=new Date(Date.parse(now())-1000).toISOString();},
  documents:()=>[...documents.values()].map(clone),extractions:()=>[...extractions.values()].map(clone),pages:()=>[...pages.values()].map(clone),
  citations:()=>[...citations.values()].map(clone),candidates:()=>[...candidates.values()].map(clone),publications:()=>[...publications.values()].map(clone),
  approvals:()=>[...approvals.values()].map(clone),scope:()=>[...scope.values()].map(clone),assets:()=>[...assets.values()].map(clone),
  _raw:{documents,assets,extractions,pages,citations,candidates,publications,approvals,scope},

  // ---------------------------------------------------------------- scope
  async reconcileScope(source,input){
   listed(source);
   // F3: the whole call is validated before any row is touched (SQL is one statement), duplicates included
   if(new Set(input.map(r=>r.issuer_id)).size!==input.length)throw invalid('duplicate issuer');
   for(const r of input){
    if(typeof r.fetch_key!=='string'||r.fetch_key.length<1||r.fetch_key.length>64)throw invalid('fetch_key');
    if(!Number.isInteger(r.priority??0)||(r.priority??0)<0)throw invalid('priority');
    if(r.reasons!==undefined&&!Array.isArray(r.reasons))throw invalid('reasons');
   }
   let n=0;
   for(const r of input){
    const s=scope.get(sk(r.issuer_id,source));
    if(!s){
     const t=now();
     scope.set(sk(r.issuer_id,source),{issuer_id:r.issuer_id,source,reasons:[...(r.reasons??[])],priority:r.priority??0,fetch_key:r.fetch_key,backfill_cursor:{},backfill_done:false,poll_cursor:{},
      next_due_at:t,lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:t});
     n++;
    }else if(JSON.stringify(s.reasons)!==JSON.stringify(r.reasons??[])||s.priority!==(r.priority??0)||s.fetch_key!==r.fetch_key){
     s.reasons=[...(r.reasons??[])];s.priority=r.priority??0;s.fetch_key=r.fetch_key;s.updated_at=now();n++;
    }
   }
   return n;
  },
  async claimSyncLease(issuer,source,batch,ttl){
   ttlCheck(ttl);
   const s=scope.get(sk(issuer,source));if(!s)return false;
   if(s.lease_batch_id===null||!live(s.lease_until)||s.lease_batch_id===batch){s.lease_batch_id=batch;s.lease_until=later(ttl);s.updated_at=now();return true;}
   return false;
  },
  async advanceCursor(issuer,source,batch,mode,cursor,done,reset=false){
   if(mode!=='backfill'&&mode!=='poll')throw invalid('mode');
   if(cursor!==null&&(typeof cursor!=='object'||Array.isArray(cursor)))throw invalid('cursor');
   const seqOf=(c:unknown)=>isObj(c)&&'seq' in c?c.seq:undefined;
   if(cursor!==null&&seqOf(cursor)!==undefined&&typeof seqOf(cursor)!=='number')throw invalid('cursor');
   const s=scopeLock(issuer,source,batch);
   if(!reset){
    // never backwards (P2-4): a finished backfill takes only a repeated completion; seq strictly increases
    if(mode==='backfill'&&cursor===null&&done!==true)throw new DocumentsDbError('cursor_regression','cursor_regression: cleared');   // a backfill cursor is cleared only to complete it (migration one review fix)
    if(mode==='backfill'&&s.backfill_done&&!(cursor===null&&done===true))throw new DocumentsDbError('cursor_regression','cursor_regression: backfill_done');
    const old=seqOf(mode==='backfill'?s.backfill_cursor:s.poll_cursor);
    if(cursor!==null&&typeof old==='number'){const next=seqOf(cursor);if(typeof next!=='number'||next<=old)throw new DocumentsDbError('cursor_regression','cursor_regression: seq');}
   }
   if(mode==='backfill'){s.backfill_cursor=cursor?{...cursor}:{};s.backfill_done=done===true;}else s.poll_cursor=cursor?{...cursor}:{};
   s.updated_at=now();
  },
  async releaseSyncLease(issuer,source,batch,outcome,nextDue){
   if(outcome!=='success'&&outcome!=='failed')throw invalid('outcome');
   const s=scope.get(sk(issuer,source));
   if(!s||s.lease_batch_id!==batch)throw leaseLost();
   const t=now();
   s.lease_until=null;s.lease_batch_id=null;s.last_attempt_at=t;if(outcome==='success')s.last_success_at=t;s.last_status=outcome;
   s.next_due_at=nextDue?normTs(nextDue,'next_due'):t;s.updated_at=t;
  },

  // ---------------------------------------------------------------- documents
  async insertDocumentVersion(issuer,source,batch,doc,input){
   listed(source);
   // SQL order: argument shape (incl. the asset bound and duplicate role/filename), then the lease, then the lookups
   if(!isObj(doc))throw invalid('doc');
   if(input.length>ASSETS_MAX)throw invalid('assets');
   const assetKeys=new Set<string>();
   for(const a of input){const k=`${a.role}|${a.filename}`;if(assetKeys.has(k))throw invalid('assets');assetKeys.add(k);}
   scopeLock(issuer,source,batch);
   if(!doc.source_ref||!doc.content_sha256)throw invalid('source_ref/content_sha256');
   const versions=versionsOf(source,doc.source_ref);
   if(versions.some(v=>v.issuer_id!==issuer))throw invalid('source_ref belongs to another issuer');
   const dup=versions.find(v=>v.content_sha256===doc.content_sha256);
   if(dup)return {outcome:'duplicate',document_id:dup.document_id};
   const prev=versions[versions.length-1];
   const row:DocumentRow={...nullDoc(doc),document_id:randomUUID(),issuer_id:issuer,source,batch_id:batch,permission:'public',owner_user_id:null,license_ref:null,
    source_version:(prev?.source_version??0)+1,supersedes_document_id:prev?.document_id??null,observed_replacement:!!prev,status:'stored',current_extraction_id:null,
    extract_lease_until:null,extract_lease_batch_id:null,extract_attempts:0,created_at:stamp()};
   checkDocument(row);
   const rows:AssetRow[]=input.map(a=>({...clone(a),asset_id:randomUUID(),document_id:row.document_id,created_at:row.created_at}));
   for(const a of rows){
    if(!['filing_index','xbrl_instance','exhibit'].includes(a.role)||!SHA.test(a.content_sha256)||!(a.bytes>0)||!isObj(a.acquisition))throw invalid('asset');
   }
   documents.set(row.document_id,row);for(const a of rows)assets.set(a.asset_id,a);
   return {outcome:prev?'versioned':'inserted',document_id:row.document_id};
  },
  async insertUploadDocument(owner,doc){
   if(!owner)throw invalid('owner');
   if(doc.permission!=='licensed'&&doc.permission!=='private')throw invalid('permission');
   const ref=`${owner}/${doc.content_sha256}`;
   const dup=versionsOf('upload',ref)[0];
   if(dup)return {outcome:'duplicate',document_id:dup.document_id};
   const row:DocumentRow={...nullDoc(doc),document_id:randomUUID(),source:'upload',source_ref:ref,owner_user_id:owner,source_url:null,source_version:1,supersedes_document_id:null,
    observed_replacement:false,status:'stored',current_extraction_id:null,extract_lease_until:null,extract_lease_batch_id:null,extract_attempts:0,created_at:stamp()};
   checkDocument(row);
   documents.set(row.document_id,row);
   return {outcome:'inserted',document_id:row.document_id};
  },
  async reclassifyDocument(document,patch,actor){
   if(!actor)throw invalid('actor');
   const allowed=['doc_class','classifier_gen','fiscal_year','fiscal_period','period_end','filing_source_ref'];
   if(Object.keys(patch).some(k=>!allowed.includes(k)))throw invalid('patch');
   const d=docOf(document);
   const next={...d,...patch};checkDocument(next);
   Object.assign(d,patch);
  },

  // ---------------------------------------------------------------- extraction
  async claimExtractLease(document,batch,ttl){
   ttlCheck(ttl);
   const d=documents.get(document);
   if(!d||d.status!=='stored')return false;
   if(!(d.extract_lease_batch_id===null||!live(d.extract_lease_until)||d.extract_lease_batch_id===batch))return false;
   if(d.extract_attempts>=3){d.status='extract_failed';d.extract_lease_until=null;d.extract_lease_batch_id=null;return false;}
   d.extract_lease_batch_id=batch;d.extract_lease_until=later(ttl);d.extract_attempts+=1;
   return true;
  },
  async renewExtractLease(document,batch,ttl){
   ttlCheck(ttl);
   const d=documents.get(document);
   if(!d||batch==null||d.status!=='stored'||d.extract_lease_batch_id!==batch)return false;   // an expired lease nobody took over is still ours
   d.extract_lease_until=later(ttl);
   return true;
  },
  async finishExtract(document,batch,extraction,input){
   const d=extractLock(document,batch);
   if(!extraction.extractor_version||!extraction.table_algo_version||typeof extraction.has_text_layer!=='boolean'||!Number.isInteger(extraction.page_count)||extraction.page_count<0)throw invalid('extraction fields');
   if(!SHA.test(extraction.pages_json_sha256))throw invalid('pages_json_sha256');
   if([...extractions.values()].some(x=>x.document_id===document&&x.extractor_version===extraction.extractor_version&&x.table_algo_version===extraction.table_algo_version))throw new DocumentsDbError('revision_exists');
   const nos=input.map(p=>p.page_no);
   const ok=input.length===extraction.page_count&&new Set(nos).size===nos.length&&(nos.length===0||(Math.min(...nos)===1&&Math.max(...nos)===nos.length))
    &&input.every(p=>typeof p.text==='string'&&p.char_count===cps(p.text).length&&p.text_hash===sha256(p.text)&&Number.isInteger(p.line_count??0)&&(p.line_count??0)>=0);
   if(!ok)throw invalid('pages do not match page_count, char_count or text_hash');
   const role=d.source==='hkexnews'&&d.market==='HK'&&(d.doc_class==='annual_report'||d.doc_class==='interim_report')&&extraction.has_text_layer?(d.language==='zh'?'primary':'comparison'):'none';
   const row:ExtractionRow={...clone(extraction),extraction_id:randomUUID(),document_id:document,candidates_role:role,candidates_status:role==='none'?'n/a':'pending',candidates_attempts:0,
    candidates_lease_until:null,candidates_lease_batch_id:null,batch_id:batch,created_at:stamp()};
   extractions.set(row.extraction_id,row);
   for(const p of input)pages.set(pk(row.extraction_id,p.page_no),{...clone(p),extraction_id:row.extraction_id,line_count:p.line_count??0,has_tables:p.has_tables===true});
   d.status=extraction.has_text_layer?'extracted':'no_text_layer';d.current_extraction_id=row.extraction_id;d.extract_lease_until=null;d.extract_lease_batch_id=null;
   return row.extraction_id;
  },
  async failExtract(document,batch,code){
   if(!code)throw invalid('code');
   const d=extractLock(document,batch);
   if(d.extract_attempts>=3)d.status='extract_failed';
   d.extract_lease_until=null;d.extract_lease_batch_id=null;
  },
  async requestExtract(document,actor){
   if(!actor)throw invalid('actor');
   const d=docOf(document);
   if([...extractions.values()].some(x=>x.document_id===document&&x.extractor_version===EXTRACTOR_VERSION&&x.table_algo_version===TABLE_ALGO_VERSION))throw new DocumentsDbError('revision_exists');
   if(d.status!=='stored'){d.status='stored';d.extract_attempts=0;d.extract_lease_until=null;d.extract_lease_batch_id=null;}
  },

  // ---------------------------------------------------------------- candidates scheduling
  async claimCandidatesLease(extraction,batch,ttl){
   ttlCheck(ttl);
   const e=extractions.get(extraction);
   if(!e||(e.candidates_status!=='pending'&&e.candidates_status!=='failed'))return false;
   if(!(e.candidates_lease_batch_id===null||!live(e.candidates_lease_until)||e.candidates_lease_batch_id===batch))return false;
   if(e.candidates_attempts>=3){e.candidates_status='exhausted';e.candidates_lease_until=null;e.candidates_lease_batch_id=null;return false;}
   e.candidates_lease_batch_id=batch;e.candidates_lease_until=later(ttl);e.candidates_attempts+=1;
   return true;
  },
  async renewCandidatesLease(extraction,batch,ttl){
   ttlCheck(ttl);
   const e=extractions.get(extraction);
   if(!e||batch==null||(e.candidates_status!=='pending'&&e.candidates_status!=='failed')||e.candidates_lease_batch_id!==batch)return false;
   e.candidates_lease_until=later(ttl);
   return true;
  },
  async finishCandidates(extraction,batch,status){
   if(status!=='done'&&status!=='failed')throw invalid('status');
   const e=candidatesLock(extraction,batch);
   e.candidates_status=status;e.candidates_lease_until=null;e.candidates_lease_batch_id=null;
  },
  async requestCandidatesRegen(filter,actor){
   if(!actor)throw invalid('actor');
   const f=regenFilter(filter) as {source?:string;issuer_id?:string;document_id?:string};
   if(Object.keys(f).some(k=>!['source','issuer_id','document_id'].includes(k)))throw invalid('filter');
   let n=0;
   for(const e of extractions.values()){
    const d=documents.get(e.document_id)!;
    if(d.current_extraction_id!==e.extraction_id||e.candidates_role==='none'||!['done','failed','exhausted'].includes(e.candidates_status))continue;
    if((f.source&&d.source!==f.source)||(f.issuer_id&&d.issuer_id!==f.issuer_id)||(f.document_id&&d.document_id!==f.document_id))continue;
    e.candidates_status='pending';e.candidates_attempts=0;e.candidates_lease_until=null;e.candidates_lease_batch_id=null;n++;
   }
   return n;
  },

  // ---------------------------------------------------------------- citations
  async insertCitation(row){
   const e=extractions.get(row.extraction_id);
   const p=pages.get(pk(row.extraction_id,row.page_no));
   if(!e||!p||e.document_id!==row.document_id)throw new DocumentsDbError('invalid_citation','invalid_citation: page');
   if(!Number.isInteger(row.char_start)||!Number.isInteger(row.char_end)||row.char_start<0||row.char_end<=row.char_start||row.char_end>p.char_count)throw new DocumentsDbError('invalid_citation','invalid_citation: range');
   if(row.snippet!==cps(p.text).slice(row.char_start,row.char_end).join(''))throw new DocumentsDbError('invalid_citation','invalid_citation: snippet');
   if(row.text_hash!==p.text_hash)throw new DocumentsDbError('invalid_citation','invalid_citation: text_hash');
   if(!['extractor','human','llm','module'].includes(row.created_by)||!row.created_ref)throw new DocumentsDbError('invalid_citation','invalid_citation: creator');
   if(row.bbox!==null&&row.bbox!==undefined&&!isObj(row.bbox))throw invalid('bbox');
   const id=randomUUID();
   citations.set(id,{...clone(row),bbox:row.bbox??null,citation_id:id,visibility:'internal',created_at:stamp()});
   return id;
  },
  async publishCitations(ids){
   for(const id of ids){
    const c=citations.get(id);const d=c&&documents.get(c.document_id);
    if(!c||!d||!(c.created_by==='human'||c.created_by==='module')||d.permission!=='public')throw new DocumentsDbError('not_publishable');
   }
   let n=0;
   for(const id of new Set(ids)){const c=citations.get(id)!;if(c.visibility==='internal'){c.visibility='public';n++;}}
   return n;
  },

  // ---------------------------------------------------------------- candidates
  async insertCandidates(extraction,batch,input){
   checkWriteRows(input);
   const e=candidatesLock(extraction,batch);
   for(const x of input){
    const cit=x.citations as Record<string,unknown>;
    if(!isObj(cit)||typeof cit.value!=='string')throw new DocumentsDbError('invalid_citation','invalid_citation: shape');
    if(x.kind==='financial_fact'&&(typeof cit.label!=='string'||typeof cit.unit!=='string'||!Array.isArray(cit.period)||cit.period.length===0||cit.period.some(pe=>isObj(pe)&&pe.role!=='statement_title'&&pe.role!=='column_header')))throw new DocumentsDbError('invalid_citation','invalid_citation: shape');   // F3: object elements carry a permitted role (migration one review fix)
    for(const id of candidateCitationIds(cit)){
     const c=typeof id==='string'&&UUID.test(id)?citations.get(id.toLowerCase()):undefined;
     if(!c||c.extraction_id!==extraction||c.document_id!==e.document_id)throw new DocumentsDbError('invalid_citation','invalid_citation: reference');
    }
    if(!['financial_fact','table_cell','field'].includes(x.kind)||!['rule','llm'].includes(x.extractor_kind)||!x.extractor_ref||!x.natural_key||!SHA.test(x.fingerprint)||!isObj(x.payload)||!isObj(x.input_snapshot))throw invalid('candidate');
   }
   const key=(c:{kind:string;extractor_ref:string;natural_key:string})=>`${c.kind}|${c.extractor_ref}|${c.natural_key}`;
   const existing=new Set([...candidates.values()].filter(c=>c.extraction_id===extraction).map(key));
   let inserted=0;
   for(const x of input){
    if(existing.has(key(x)))continue;existing.add(key(x));
    const id=randomUUID();
    candidates.set(id,{...clone(x),candidate_id:id,document_id:e.document_id,extraction_id:extraction,checks:[],checks_passed:false,status:'candidate',decision_kind:null,decided_by:null,
     approval_id:null,decided_at:null,inherited_from:null,batch_id:batch,created_at:stamp()});
    inserted++;
   }
   return {inserted};
  },
  async writeCandidateChecks(extraction,batch,input){
   checkWriteRows(input);
   candidatesLock(extraction,batch);
   const sorted=[...input].sort((a,b)=>cmp(a.candidate_id,b.candidate_id));
   for(const x of sorted){
    if(!Array.isArray(x.checks)||typeof x.checks_passed!=='boolean')throw invalid('checks');
    const c=candidates.get(x.candidate_id);
    if(!c||c.extraction_id!==extraction)throw notFound();
    if(c.status!=='candidate')throw new DocumentsDbError('decided');
   }
   let written=0,inherited=0;
   for(const x of sorted){
    const c=candidates.get(x.candidate_id)!;
    c.checks=clone(x.checks);c.checks_passed=x.checks_passed;written++;
    if(!x.checks_passed)continue;
    const src=[...candidates.values()]
     .filter(s=>s.document_id===c.document_id&&s.fingerprint===c.fingerprint&&s.candidate_id!==c.candidate_id&&s.decision_kind==='human'&&(s.status==='confirmed'||s.status==='promoted'))
     .sort((a,b)=>cmp(b.decided_at??'',a.decided_at??'')||cmp(a.candidate_id,b.candidate_id))[0];
    if(src){Object.assign(c,{status:'confirmed',decision_kind:'human',decided_by:src.decided_by,approval_id:null,decided_at:now(),inherited_from:src.candidate_id});inherited++;}
   }
   return {written,inherited};
  },
  async decideCandidate(candidate,decision){
   const c=candidates.get(candidate);if(!c)throw notFound();
   if(decision.kind==='human'){
    if(!decision.decided_by||!['confirmed','rejected','candidate'].includes(decision.status))throw invalid('human decision');
    if(c.status===decision.status)return {status:c.status};
    if(c.status==='candidate'&&decision.status==='confirmed'){
     if(!c.checks_passed)throw new DocumentsDbError('not_eligible');
     Object.assign(c,{status:'confirmed',decision_kind:'human',decided_by:decision.decided_by,approval_id:null,decided_at:now(),inherited_from:null});
    }else if(c.status==='candidate'&&decision.status==='rejected'){
     Object.assign(c,{status:'rejected',decision_kind:'human',decided_by:decision.decided_by,approval_id:null,decided_at:now(),inherited_from:null});
    }else if(c.status==='confirmed'&&decision.status==='candidate'){
     if([...publications.values()].some(p=>p.candidate_id===candidate))throw new DocumentsDbError('not_eligible');
     Object.assign(c,{status:'candidate',decision_kind:null,decided_by:null,approval_id:null,decided_at:null,inherited_from:null});
    }else throw new DocumentsDbError('decided');
    return {status:decision.status};
   }
   if(decision.kind!=='auto'||!decision.approval_id)throw invalid('decision');
   if(c.status==='confirmed'&&c.decision_kind==='auto'&&c.approval_id===decision.approval_id)return {status:c.status};
   if(c.status!=='candidate'||c.extractor_kind!=='rule'||!c.checks_passed)throw new DocumentsDbError('not_eligible');
   const a=approvals.get(decision.approval_id);
   if(!a)throw new DocumentsDbError('not_eligible');
   if(a.revoked_at!==null)throw new DocumentsDbError('approval_revoked');
   const e=extractions.get(c.extraction_id)!;
   const concept=(c.payload as {concept?:unknown}).concept;
   if(a.extractor_ref!==c.extractor_ref||a.extractor_version!==e.extractor_version||a.table_algo_version!==e.table_algo_version||a.code_version!==e.code_version||typeof concept!=='string'||a.concepts.some(x=>x===null||x===undefined)||!a.concepts.includes(concept))throw new DocumentsDbError('not_eligible');   // F3: a NULL concept element fails closed like SQL
   Object.assign(c,{status:'confirmed',decision_kind:'auto',decided_by:null,approval_id:a.approval_id,decided_at:now(),inherited_from:null});
   return {status:'confirmed'};
  },
  async stageCandidatePublication(candidate,pubGen,run,factId){
   if(!Number.isInteger(pubGen)||pubGen<1||!run||!factId)throw invalid('publication');
   const c=candidates.get(candidate);if(!c)throw notFound();
   if(c.status!=='confirmed'&&c.status!=='promoted')throw new DocumentsDbError('not_eligible');
   if(c.decision_kind==='auto'&&c.approval_id&&approvals.get(c.approval_id)?.revoked_at){
    if(c.status==='confirmed')Object.assign(c,{status:'candidate',decision_kind:null,decided_by:null,approval_id:null,decided_at:null,inherited_from:null});
    throw new DocumentsDbError('approval_revoked');   // the reversion stays (the SQL function commits it and answers the outcome)
   }
   const p=publications.get(ck(candidate,pubGen));const t=now();
   if(!p)publications.set(ck(candidate,pubGen),{candidate_id:candidate,pub_gen:pubGen,run_id:run,fact_id:factId,state:'staged',created_at:t,updated_at:t});
   else if(p.state==='abandoned')Object.assign(p,{state:'staged',run_id:run,fact_id:factId,updated_at:t});
   else throw new DocumentsDbError('already_staged');
  },
  async insertApproval(row){
   // exact decimal comparison, like SQL numeric (F3 review): '0.9499999999999999999' fails
   // F3 recheck N2: canonicalise first (numeric accepts exponents: '9.5e-1' = 0.95), then compare exactly
   const inBand=(v:unknown)=>{let t:string;try{t=canonicalDecimal(String(v));}catch{return false;}return /^\d+(\.\d+)?$/.test(t)&&cmpDecimal(t,'0.95')>=0&&cmpDecimal(t,'1')<=0;};
   if(!inBand(row.precision)||!inBand(row.recall))throw invalid('ea_threshold');
   if(!row.extractor_ref||!row.approved_by||!SHA.test(row.gold_sha256)||!Array.isArray(row.concepts))throw invalid('approval');
   const id=randomUUID();
   approvals.set(id,{...clone(row),precision:canonicalDecimal(row.precision),recall:canonicalDecimal(row.recall),approval_id:id,approved_at:stamp(),revoked_at:null});
   return id;
  },
  async revokeApproval(approvalId){
   const a=approvals.get(approvalId);if(!a)throw notFound();
   if(a.revoked_at===null)a.revoked_at=now();
  },

  // ---------------------------------------------------------------- reads
  async documentVersions(source,sourceRef,p){
   const limit=lookaheadLimit(p.limit);const a=after(p.cursor,1);
   return page(versionsOf(source,sourceRef).filter(d=>!a||d.source_version>Number(a[0])),limit,d=>[d.source_version]);
  },
  async knownSourceRefs(issuer,source,refs){
   const want=new Set(refs);
   return new Set([...documents.values()].filter(d=>d.issuer_id===issuer&&d.source===source&&want.has(d.source_ref)).map(d=>d.source_ref));
  },
  async readDocuments(issuer,o){
   const limit=checkLimit(o.limit);const a=after(o.cursor,2);
   const visible=[...documents.values()].filter(d=>d.issuer_id===issuer&&d.available_date<=o.asOf);
   const top=new Map<string,number>();
   for(const d of visible){const k=`${d.source}|${d.source_ref}`;top.set(k,Math.max(top.get(k)??0,d.source_version));}
   const picked=visible
    .filter(d=>(o.allVersions===true||top.get(`${d.source}|${d.source_ref}`)===d.source_version)
     &&(!o.source||d.source===o.source)&&(!o.docClass||d.doc_class===o.docClass)&&(!o.from||d.available_date>=o.from)&&(!o.to||d.available_date<=o.to)
     &&(!a||gt2([String(a[0]),String(a[1])],[d.available_at,d.document_id])))
    .sort((x,y)=>cmp(y.available_at,x.available_at)||cmp(y.document_id,x.document_id));
   return page(picked,limit,d=>[d.available_at,d.document_id]);
  },
  async documentById(id){const d=documents.get(id);return d?clone(d):null;},
  async assetsOf(documentId){return [...assets.values()].filter(a=>a.document_id===documentId).sort((x,y)=>cmp(x.role,y.role)||cmp(x.filename,y.filename)).slice(0,PAGE_LIMIT_MAX).map(clone);},
  async extractionsOf(documentId,p){
   const limit=lookaheadLimit(p.limit);const a=after(p.cursor,2);
   const rows=[...extractions.values()].filter(e=>e.document_id===documentId&&(!a||gt2([String(a[0]),String(a[1])],[e.created_at,e.extraction_id])))
    .sort((x,y)=>cmp(y.created_at,x.created_at)||cmp(y.extraction_id,x.extraction_id));
   return page(rows,limit,e=>[e.created_at,e.extraction_id]);
  },
  async extractionById(id){const e=extractions.get(id);return e?clone(e):null;},
  async pagesOf(extractionId,pageNos){
   checkIds(pageNos);
   return [...new Set(pageNos)].sort((x,y)=>x-y).map(n=>pages.get(pk(extractionId,n))).filter((p):p is PageRow=>!!p).map(clone);
  },
  async citationById(id){const c=citations.get(id);return c?clone(c):null;},
  async citationsByIds(ids){checkIds(ids);return [...new Set(ids)].sort(cmp).map(id=>citations.get(id)).filter((c):c is CitationRow=>!!c).map(clone);},
  async candidatesOf(where,p){
   const limit=checkLimit(p.limit);const a=after(p.cursor,2);
   const match=(c:CandidateRow)=>{
    if('extractionId' in where)return c.extraction_id===where.extractionId;
    if('issuerId' in where)return documents.get(c.document_id)?.issuer_id===where.issuerId&&(!where.status||c.status===where.status);
    return c.status===where.status;
   };
   const rows=[...candidates.values()].filter(c=>match(c)&&(!a||gt2([c.created_at,c.candidate_id],[String(a[0]),String(a[1])])))
    .sort((x,y)=>cmp(x.created_at,y.created_at)||cmp(x.candidate_id,y.candidate_id));
   return page(rows,limit,c=>[c.created_at,c.candidate_id]);
  },
  async candidateById(id){const c=candidates.get(id);return c?clone(c):null;},
  async publicationsOf(where,p){
   const limit=checkLimit(p.limit);const a=after(p.cursor,2);
   if('candidateIds' in where)checkIds(where.candidateIds);
   const match=(x:PublicationRow)=>{
    if('candidateIds' in where)return where.candidateIds.includes(x.candidate_id);
    if('runId' in where)return x.run_id===where.runId;
    const c=candidates.get(x.candidate_id);
    return !!c&&documents.get(c.document_id)?.issuer_id===where.issuerId&&x.pub_gen===where.pubGen&&(!where.state||x.state===where.state);
   };
   const rows=[...publications.values()].filter(x=>match(x)&&(!a||gt2([x.candidate_id,x.pub_gen],[String(a[0]),Number(a[1])])))
    .sort((x,y)=>cmp(x.candidate_id,y.candidate_id)||x.pub_gen-y.pub_gen);
   return page(rows,limit,x=>[x.candidate_id,x.pub_gen]);
  },
  async approvalsFor(extractorRef,o){
   const limit=checkApprovalsLimit(o.limit);
   const rows=[...approvals.values()].filter(a=>a.extractor_ref===extractorRef&&a.revoked_at===null).sort((x,y)=>cmp(y.approved_at,x.approved_at)||cmp(x.approval_id,y.approval_id));
   if(rows.length>limit)throw new DocumentsDbError('too_many_approvals',`more than ${limit} approvals for ${extractorRef}`);
   return rows.map(clone);
  },
  async storedDue(limit){
   checkLimit(limit);
   return [...documents.values()].filter(d=>d.status==='stored'&&!live(d.extract_lease_until)).sort((x,y)=>cmp(x.created_at,y.created_at)||cmp(x.document_id,y.document_id)).slice(0,limit).map(clone);
  },
  async candidatesDue(limit){
   checkLimit(limit);
   return [...extractions.values()].filter(e=>(e.candidates_status==='pending'||e.candidates_status==='failed')&&!live(e.candidates_lease_until)&&documents.get(e.document_id)?.current_extraction_id===e.extraction_id)
    .sort((x,y)=>cmp(x.created_at,y.created_at)||cmp(x.extraction_id,y.extraction_id)).slice(0,limit).map(clone);
  },
  async scopeDue(source,at,limit){
   checkLimit(limit);
   const t=normTs(at,'now');
   return [...scope.values()].filter(s=>s.source===source&&s.priority>0&&cmp(s.next_due_at,t)<=0)
    .sort((x,y)=>cmp(x.next_due_at,y.next_due_at)||y.priority-x.priority||cmp(x.issuer_id,y.issuer_id)).slice(0,limit).map(clone);
  },
  async scopeRows(source,issuerIds){
   const want=new Set(issuerIds);
   return [...scope.values()].filter(s=>s.source===source&&want.has(s.issuer_id)).sort((x,y)=>cmp(x.issuer_id,y.issuer_id)).map(clone);
  },
  async scopeAll(source){
   return [...scope.values()].filter(s=>s.source===source).sort((x,y)=>cmp(x.issuer_id,y.issuer_id)).map(clone);
  },
 };
 return db;
}

/** A DocumentInsert with every optional column as null (jsonb_populate_record semantics). */
function nullDoc(d:DocumentInsert):Omit<DocumentRow,'document_id'|'source_version'|'supersedes_document_id'|'observed_replacement'|'status'|'current_extraction_id'|'extract_lease_until'|'extract_lease_batch_id'|'extract_attempts'|'created_at'>{
 const x=clone(d);
 x.published_at=normTs(x.published_at,'dates');x.available_at=normTs(x.available_at,'dates');
 return {...x,issuer_id:x.issuer_id??null,form_type:x.form_type??null,language:x.language??null,source_url:x.source_url??null,fiscal_year:x.fiscal_year??null,
  fiscal_period:x.fiscal_period??null,period_end:x.period_end??null,filing_source_ref:x.filing_source_ref??null,owner_user_id:x.owner_user_id??null,license_ref:x.license_ref??null};
}
