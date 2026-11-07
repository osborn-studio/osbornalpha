// src/lib/documents/db-contract.ts
// Shared DocumentsDb contract (spec §4.8, §4.11): the same scenarios run against memoryDocumentsDb
// (db.test.ts) and pgDocumentsDb (documents.integration.test.ts), so the in-memory rules the unit
// tests rely on are exactly the migration-one SQL functions' rules. Not a test file: it registers
// describe/it only when called. Every scenario creates its own issuer, so it also runs on a shared
// database; global reads (storedDue, candidatesDue, scopeDue) are asserted with `some`/`find`.
import {createHash,randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {encodeCursor} from './db';
import {DocumentsDbError,EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from './types';
import type {AssetInsert,CandidateInsert,CitationInsert,DocScopeCursor,DocumentInsert,DocumentsDb,ExtractionInsert,ListedSource,Page,PageInsert,PageOpts} from './types';

export interface DocsContractHarness{
 db:DocumentsDb;
 /** A pre-created issuer (FK target) for callers that need just one. */
 issuerId:string;
 /** A fresh issuer (pg: an issuers row). */
 issuer():Promise<string>;
 /** A fresh ingest_batches row id. */
 batchId():Promise<string>;
 /** A fresh auth.users id (owners, deciders, approvers). */
 user():Promise<string>;
 /** Moves a lease into the past: sync (issuer + source), extract (document), candidates (extraction). */
 expire(kind:'sync'|'extract'|'candidates',key:string,source?:ListedSource):Promise<void>;
 /** Marks a publication abandoned — a state only migration two's functions produce. */
 abandonPublication(candidateId:string,pubGen:number):Promise<void>;
 close?():Promise<void>;
}

export const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
/** Code-point length / slice, like PostgreSQL length()/substr() on UTF8. */
export const cpLen=(s:string)=>Array.from(s).length;
export const cpSlice=(s:string,start:number,end:number)=>Array.from(s).slice(start,end).join('');

export function docInsert(o:Partial<DocumentInsert>={}):DocumentInsert{
 const content=sha(randomUUID());
 const ref=o.source_ref??`${Date.now()}${Math.floor(Math.random()*1e6)}_c`;
 return {issuer_id:null,source:'hkexnews',market:'HK',source_ref:ref,form_type:'Annual Report',doc_class:'annual_report',classifier_gen:1,title:'二零二五年年報',language:'zh',
  source_url:`https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0320/${ref}.pdf`,content_sha256:content,bytes:1024,mime:'application/pdf',storage_path:`blobs/${content}.pdf`,
  acquisition:{fetched_at:'2026-03-20T10:00:00.000Z',http_status:200,content_type:'application/pdf',content_length:1024,etag:null,last_modified:null,user_agent:'test'},
  published_at:'2026-03-20T09:00:00.000Z',published_at_precision:'instant',available_at:'2026-03-20T09:00:00.000Z',available_date:'2026-03-20',
  fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',filing_source_ref:null,permission:'public',owner_user_id:null,license_ref:null,
  batch_id:randomUUID(),code_version:'test-code',...o};
}
export function assetInsert(o:Partial<AssetInsert>={}):AssetInsert{
 const content=sha(randomUUID());
 return {role:'filing_index',filename:'index.json',source_url:'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/index.json',content_sha256:content,bytes:10,
  mime:'application/json',storage_path:`blobs/${content}.json`,acquisition:{fetched_at:'2026-03-20T10:00:00.000Z',http_status:200},...o};
}
export function pageInsert(page_no:number,text:string,o:Partial<PageInsert>={}):PageInsert{
 return {page_no,text,text_hash:sha(text),char_count:cpLen(text),width:595,height:842,line_count:text===''?0:text.split('\n').length,has_tables:false,...o};
}
export function extractionInsert(pageCount:number,o:Partial<ExtractionInsert>={}):ExtractionInsert{
 return {extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:'test-code',has_text_layer:true,page_count:pageCount,
  pages_json_path:`extractions/${sha('c')}/${sha(String(pageCount))}.pages.json`,pages_json_sha256:sha(randomUUID()),...o};
}
/** 'code' of a DocumentsDbError rejection, 'resolved' when it did not reject. */
export const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof DocumentsDbError?e.code:`not_documents_db_error:${String(e)}`);
export async function drain<T>(read:(p:PageOpts)=>Promise<Page<T>>,limit:number):Promise<{rows:T[];pages:number}>{
 const rows:T[]=[];let cursor:string|null=null;let pages=0;
 do{const p:Page<T>=await read({cursor,limit});rows.push(...p.rows);cursor=p.nextCursor;pages++;}while(cursor);
 return {rows,pages};
}
export const PAGE_TEXT='損益表 a\u{2000B}b\u{1F600}c 收益 1,234\n毛利 (56)';

export function documentsDbContract(label:string,setup:()=>Promise<DocsContractHarness>):void{
 describe(label,()=>{
  let h:DocsContractHarness;let db:DocumentsDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  const ready=async(source:ListedSource='hkexnews')=>{
   const iss=await h.issuer();const b=await h.batchId();
   expect(await db.reconcileScope(source,[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'00268'}])).toBe(1);
   expect(await db.claimSyncLease(iss,source,b,600)).toBe(true);
   return {iss,b};
  };
  const stored=async(o:Partial<DocumentInsert>={},assets:AssetInsert[]=[])=>{
   const source=(o.source??'hkexnews') as ListedSource;const {iss,b}=await ready(source);
   const r=await db.insertDocumentVersion(iss,source,b,docInsert(o),assets);
   expect(r.outcome).toBe('inserted');
   return {iss,b,doc:r.document_id};
  };
  const extracted=async(o:Partial<DocumentInsert>={},texts:string[]=[PAGE_TEXT,'第二頁'],x:Partial<ExtractionInsert>={})=>{
   const s=await stored(o);
   expect(await db.claimExtractLease(s.doc,s.b,600)).toBe(true);
   const ext=await db.finishExtract(s.doc,s.b,extractionInsert(texts.length,x),texts.map((t,i)=>pageInsert(i+1,t)));
   return {...s,ext};
  };
  const cite=(doc:string,ext:string,text:string,needle:string,by:CitationInsert['created_by']='extractor',page_no=1)=>{
   const cp=Array.from(text);const start=cp.findIndex((_,i)=>cp.slice(i,i+cpLen(needle)).join('')===needle);
   const end=start+cpLen(needle);
   return db.insertCitation({document_id:doc,extraction_id:ext,page_no,char_start:start,char_end:end,bbox:null,snippet:cpSlice(text,start,end),text_hash:sha(text),created_by:by,created_ref:'test'});
  };
  const factCandidate=async(doc:string,ext:string,o:Partial<CandidateInsert>={}):Promise<CandidateInsert>=>{
   const v=await cite(doc,ext,PAGE_TEXT,'1,234');const l=await cite(doc,ext,PAGE_TEXT,'收益');const t=await cite(doc,ext,PAGE_TEXT,'損益表');
   return {kind:'financial_fact',extractor_kind:'rule',extractor_ref:'hk-facts/1/hk-facts/1.0',natural_key:'revenue::2025-12-31:12M:HKD',
    citations:{value:v,label:l,unit:t,period:[{role:'statement_title',citation_id:t},{role:'column_header',citation_id:t}]},
    payload:{concept:'revenue',statement:'IS',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value:'1234000',presented:'1,234',unit:'HKD',scale:'1000',sign_flip:false,
     period_derivation:{rule:'title_duration',title_date:'2025-12-31',column_text:'2025'},consolidation:'consolidated'},
    fingerprint:sha('revenue-1234'),input_snapshot:{content_sha256:sha('x'),pages_json_sha256:sha('y'),page_nos:[1],extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:'test-code'},...o};
  };

  it('sync scope: reconcile counts real changes; the lease is exclusive, renewable and expires; cursor and release need the holder',async()=>{
   const iss=await h.issuer();const b=await h.batchId();const b2=await h.batchId();
   const row={issuer_id:iss,reasons:['in_scope'],priority:10,fetch_key:'00268'};
   expect(await db.reconcileScope('hkexnews',[row])).toBe(1);
   expect(await db.reconcileScope('hkexnews',[row])).toBe(0);
   expect(await db.reconcileScope('hkexnews',[{...row,priority:20}])).toBe(1);
   expect(await code(db.reconcileScope('hkexnews',[row,row]))).toBe('invalid_input');   // F3: duplicate issuer ids in one call
   expect(await db.claimSyncLease(randomUUID(),'hkexnews',b,600)).toBe(false);
   expect(await db.claimSyncLease(iss,'hkexnews',b,600)).toBe(true);
   expect(await db.claimSyncLease(iss,'hkexnews',b2,600)).toBe(false);
   expect(await db.claimSyncLease(iss,'hkexnews',b,600)).toBe(true);
   expect(await code(db.advanceCursor(iss,'hkexnews',b2,'backfill',{segment:'2024',last_ref:'r1',settled:[],attempts:{},seq:1},false))).toBe('lease_lost');
   await db.advanceCursor(iss,'hkexnews',b,'backfill',{segment:'2024',last_ref:'r3',settled:['r2'],attempts:{r4:1},seq:3},false);
   await db.advanceCursor(iss,'hkexnews',b,'poll',{segment:'p',last_ref:null,settled:[],attempts:{},seq:1},false);
   await db.advanceCursor(iss,'hkexnews',b,'poll',null,false);
   expect((await db.scopeRows('hkexnews',[iss]))[0]).toMatchObject({issuer_id:iss,source:'hkexnews',priority:20,reasons:['in_scope'],backfill_cursor:{segment:'2024',last_ref:'r3',settled:['r2'],attempts:{r4:1},seq:3},backfill_done:false,poll_cursor:{},lease_batch_id:b});
   await h.expire('sync',iss,'hkexnews');
   expect(await db.claimSyncLease(iss,'hkexnews',b2,600)).toBe(true);
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'backfill',null,true))).toBe('lease_lost');
   expect(await code(db.releaseSyncLease(iss,'hkexnews',b,'failed','2030-01-01T00:00:00.000Z'))).toBe('lease_lost');
   await db.advanceCursor(iss,'hkexnews',b2,'backfill',null,true);
   await db.releaseSyncLease(iss,'hkexnews',b2,'success','2030-01-01T00:00:00.000Z');
   const s=(await db.scopeRows('hkexnews',[iss]))[0];
   expect(s).toMatchObject({backfill_cursor:{},backfill_done:true,lease_until:null,lease_batch_id:null,last_status:'success',next_due_at:'2030-01-01T00:00:00.000Z'});
   expect(s.last_success_at).not.toBeNull();
   expect((await db.scopeDue('hkexnews','2029-12-31T23:59:59.000Z',1000)).some(r=>r.issuer_id===iss)).toBe(false);
   expect((await db.scopeDue('hkexnews','2030-01-01T00:00:00.000Z',1000)).some(r=>r.issuer_id===iss)).toBe(true);
   expect(await db.scopeRows('cninfo',[iss])).toEqual([]);
   expect(await code(db.claimSyncLease(iss,'hkexnews',b,0))).toBe('invalid_input');
   // scopeAll (B-1): every row of the source, priority 0 included, issuer_id ascending
   const iss0=await h.issuer();
   await db.reconcileScope('hkexnews',[{issuer_id:iss0,reasons:[],priority:0,fetch_key:'00002'}]);
   const all=await db.scopeAll('hkexnews');
   expect(all.map(r=>r.issuer_id)).toEqual([...all.map(r=>r.issuer_id)].sort());
   expect(all.find(r=>r.issuer_id===iss0)?.priority).toBe(0);
   expect(all.some(r=>r.issuer_id===iss)).toBe(true);
   expect((await db.scopeAll('cninfo')).some(r=>r.issuer_id===iss)).toBe(false);
  });

  it('renewSyncLease (Task 7 review): holder-only, never reacquires; false for another batch, an expired lease, or no row',async()=>{
   const {iss,b}=await ready();const b2=await h.batchId();
   expect(await db.renewSyncLease(iss,'hkexnews',b,600)).toBe(true);
   expect(await db.renewSyncLease(iss,'hkexnews',b2,600)).toBe(false);
   expect(await db.renewSyncLease(randomUUID(),'hkexnews',b,600)).toBe(false);
   expect(await code(db.renewSyncLease(iss,'hkexnews',b,0))).toBe('invalid_input');
   await db.advanceCursor(iss,'hkexnews',b,'backfill',{segment:'y1',last_ref:'r',settled:[],attempts:{},seq:99},false);
   await h.expire('sync',iss,'hkexnews');
   expect(await db.renewSyncLease(iss,'hkexnews',b,600)).toBe(false);                               // expired: the old holder may not renew …
   expect(await db.claimSyncLease(iss,'hkexnews',b2,600)).toBe(true);                               // … another batch takes over,
   expect(await db.renewSyncLease(iss,'hkexnews',b,600)).toBe(false);                               // and the paused holder cannot reclaim it
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'backfill',null,true))).toBe('lease_lost');
   expect((await db.scopeRows('hkexnews',[iss]))[0]).toMatchObject({lease_batch_id:b2,backfill_done:false,backfill_cursor:{seq:99}});
   await db.releaseSyncLease(iss,'hkexnews',b2,'success','2030-01-01T00:00:00.000Z');
  });

  it('advanceCursor never moves backwards without reset (P2-4): stale or missing seq, reopening a finished backfill',async()=>{
   const {iss,b}=await ready();
   const cur=(seq:number,last_ref:string|null='r'):DocScopeCursor=>({segment:'y2026',last_ref,settled:[],attempts:{},seq});
   await db.advanceCursor(iss,'hkexnews',b,'backfill',cur(3),false);
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'backfill',null,false))).toBe('cursor_regression');   // clearing without completing …
   await db.advanceCursor(iss,'hkexnews',b,'backfill',null,false,true);                                  // … only as an explicit restart (the EDGAR coverage-gap path, recheck N1)
   expect((await db.scopeRows('hkexnews',[iss]))[0]).toMatchObject({backfill_done:false,backfill_cursor:{}});
   await db.advanceCursor(iss,'hkexnews',b,'backfill',cur(5),false);
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'backfill',cur(5,'older'),false))).toBe('cursor_regression');
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'backfill',cur(4),false))).toBe('cursor_regression');
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'backfill',{segment:'y2026'} as unknown as DocScopeCursor,false))).toBe('cursor_regression');
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'backfill',{...cur(9),seq:'9'} as unknown as DocScopeCursor,false))).toBe('invalid_input');
   expect((await db.scopeRows('hkexnews',[iss]))[0].backfill_cursor).toEqual(cur(5));               // nothing changed
   await db.advanceCursor(iss,'hkexnews',b,'backfill',cur(6),false);
   await db.advanceCursor(iss,'hkexnews',b,'backfill',null,true);                                    // completion
   await db.advanceCursor(iss,'hkexnews',b,'backfill',null,true);                                    // a repeated completion is fine
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'backfill',null,false))).toBe('cursor_regression');   // done → not done
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'backfill',cur(1),false))).toBe('cursor_regression'); // a backfill cursor after completion
   expect((await db.scopeRows('hkexnews',[iss]))[0]).toMatchObject({backfill_done:true,backfill_cursor:{}});
   await db.advanceCursor(iss,'hkexnews',b,'backfill',null,false,true);                              // explicit operator reset
   expect((await db.scopeRows('hkexnews',[iss]))[0]).toMatchObject({backfill_done:false,backfill_cursor:{}});
   await db.advanceCursor(iss,'hkexnews',b,'poll',cur(2),false);
   expect(await code(db.advanceCursor(iss,'hkexnews',b,'poll',cur(2),false))).toBe('cursor_regression');
   await db.advanceCursor(iss,'hkexnews',b,'poll',cur(1),false,true);                                // reset may move it back
   expect((await db.scopeRows('hkexnews',[iss]))[0].poll_cursor).toEqual(cur(1));
   await db.releaseSyncLease(iss,'hkexnews',b,'success','2030-01-01T00:00:00.000Z');
  });

  it('renewExtractLease / renewCandidatesLease (P2-7): the holder extends without counting an attempt; after a takeover they are false',async()=>{
   const {doc,b}=await stored();const b2=await h.batchId();
   expect(await db.renewExtractLease(doc,b,600)).toBe(false);                                        // not leased
   expect(await db.renewExtractLease(doc,null as unknown as string,600)).toBe(false);                // F3: a null batch never matches an unleased row
   expect(await db.claimExtractLease(doc,b,600)).toBe(true);
   expect(await db.renewExtractLease(doc,b,600)).toBe(true);
   expect(await db.renewExtractLease(doc,b2,600)).toBe(false);
   expect((await db.documentById(doc))!.extract_attempts).toBe(1);
   await h.expire('extract',doc);
   expect(await db.renewExtractLease(doc,b,600)).toBe(true);                                         // expired but nobody took over: still ours
   await h.expire('extract',doc);
   expect(await db.claimExtractLease(doc,b2,600)).toBe(true);                                        // takeover
   expect(await db.renewExtractLease(doc,b,600)).toBe(false);
   expect(await code(db.finishExtract(doc,b,extractionInsert(1),[pageInsert(1,'x')]))).toBe('lease_lost');
   expect(await code(db.renewExtractLease(doc,b2,0))).toBe('invalid_input');
   const x=await extracted();
   expect(await db.renewCandidatesLease(x.ext,x.b,600)).toBe(false);
   expect(await db.renewCandidatesLease(x.ext,null as unknown as string,600)).toBe(false);   // F3
   expect(await db.claimCandidatesLease(x.ext,x.b,600)).toBe(true);
   expect(await db.renewCandidatesLease(x.ext,x.b,600)).toBe(true);
   expect((await db.extractionById(x.ext))!.candidates_attempts).toBe(1);
   await h.expire('candidates',x.ext);
   expect(await db.claimCandidatesLease(x.ext,b2,600)).toBe(true);
   expect(await db.renewCandidatesLease(x.ext,x.b,600)).toBe(false);
   expect(await code(db.finishCandidates(x.ext,x.b,'done'))).toBe('lease_lost');
   await db.finishCandidates(x.ext,b2,'done');
   expect(await db.renewCandidatesLease(x.ext,b2,600)).toBe(false);                                  // moved on
  });

  it('insertDocumentVersion: inserted, duplicate, versioned with supersedes; assets in the same call; lease and issuer guards',async()=>{
   const {iss,b,doc}=await stored({source:'edgar',market:'US',language:'en',source_ref:`0000000000-26-${randomUUID().slice(0,6)}/x.htm`,mime:'text/html',doc_class:'annual_report',fiscal_period:null,fiscal_year:null,period_end:null},[assetInsert()]);
   const first=(await db.documentById(doc))!;
   expect(first).toMatchObject({issuer_id:iss,source:'edgar',source_version:1,supersedes_document_id:null,observed_replacement:false,status:'stored',permission:'public',extract_attempts:0,batch_id:b,current_extraction_id:null});
   const again=await db.insertDocumentVersion(iss,'edgar',b,docInsert({...pick(first),source:'edgar'}),[assetInsert()]);
   expect(again).toEqual({outcome:'duplicate',document_id:doc});
   const v2=await db.insertDocumentVersion(iss,'edgar',b,docInsert({...pick(first),content_sha256:sha('v2'),available_at:'2026-04-01T00:00:00.000Z',available_date:'2026-04-01'}),[]);
   expect(v2.outcome).toBe('versioned');
   expect(await db.documentById(v2.document_id)).toMatchObject({source_version:2,supersedes_document_id:doc,observed_replacement:true,published_at:first.published_at,available_date:'2026-04-01'});
   expect((await db.assetsOf(doc)).map(a=>[a.role,a.filename,a.document_id])).toEqual([['filing_index','index.json',doc]]);
   expect(await db.assetsOf(v2.document_id)).toEqual([]);
   expect([...await db.knownSourceRefs(iss,'edgar',[first.source_ref,'nope'])]).toEqual([first.source_ref]);
   expect([...await db.knownSourceRefs(await h.issuer(),'edgar',[first.source_ref])]).toEqual([]);
   const p1=await db.documentVersions('edgar',first.source_ref,{limit:1});
   expect(p1.rows.map(r=>r.source_version)).toEqual([1]);expect(p1.nextCursor).not.toBeNull();
   const p2=await db.documentVersions('edgar',first.source_ref,{limit:1,cursor:p1.nextCursor});
   expect(p2.rows.map(r=>r.source_version)).toEqual([2]);expect(p2.nextCursor).toBeNull();
   expect(await code(db.insertDocumentVersion(iss,'edgar',b,docInsert({source:'edgar',content_sha256:'XYZ'}),[]))).toBe('invalid_input');
   expect(await code(db.insertDocumentVersion(iss,'edgar',b,docInsert({source:'edgar',market:'US',language:'en'}),[assetInsert(),assetInsert()]))).toBe('invalid_input');   // same role + filename
   const other=await ready('edgar');
   expect(await code(db.insertDocumentVersion(other.iss,'edgar',other.b,docInsert({...pick(first),content_sha256:sha('v3')}),[]))).toBe('invalid_input');
   await h.expire('sync',iss,'edgar');
   expect(await code(db.insertDocumentVersion(iss,'edgar',b,docInsert({source:'edgar',market:'US',language:'en'}),[]))).toBe('lease_lost');
   expect(await code(db.insertDocumentVersion(iss,'cninfo',b,docInsert({source:'cninfo'}),[]))).toBe('lease_lost');   // no cninfo scope row
   expect(await db.documentById(randomUUID())).toBeNull();
  });

  it('insertUploadDocument: licensed/private only, duplicate per owner, another owner gets its own row',async()=>{
   const owner=await h.user();const owner2=await h.user();const b=await h.batchId();const content=sha(randomUUID());
   const up=(o:string,p:Partial<DocumentInsert>={})=>db.insertUploadDocument(o,docInsert({source:'upload',market:'other',source_url:null,language:null,permission:'private',owner_user_id:o,batch_id:b,content_sha256:content,storage_path:`blobs/${content}.pdf`,acquisition:{uploaded_at:'2026-03-20T10:00:00.000Z',filename:'r.pdf'},...p}));
   const a=await up(owner);expect(a.outcome).toBe('inserted');
   expect(await up(owner)).toEqual({outcome:'duplicate',document_id:a.document_id});
   const c=await up(owner2,{permission:'licensed',license_ref:'lic-1'});expect(c.outcome).toBe('inserted');expect(c.document_id).not.toBe(a.document_id);
   expect(await db.documentById(a.document_id)).toMatchObject({source:'upload',source_ref:`${owner}/${content}`,source_version:1,permission:'private',owner_user_id:owner,issuer_id:null,source_url:null});
   expect(await code(up(await h.user(),{permission:'public',owner_user_id:null}))).toBe('invalid_input');
  });

  it('extract lease: attempts are counted at claim and the claim after a third crash closes the document as extract_failed',async()=>{
   const {doc,b}=await stored();const b2=await h.batchId();const actor=await h.user();
   expect((await db.storedDue(1000)).some(d=>d.document_id===doc)).toBe(true);
   expect(await db.claimExtractLease(doc,b,600)).toBe(true);
   expect((await db.storedDue(1000)).some(d=>d.document_id===doc)).toBe(false);          // leased
   expect(await db.claimExtractLease(doc,b2,600)).toBe(false);
   await h.expire('extract',doc);expect(await db.claimExtractLease(doc,b2,600)).toBe(true);
   await h.expire('extract',doc);expect(await db.claimExtractLease(doc,b,600)).toBe(true);
   expect((await db.documentById(doc))!.extract_attempts).toBe(3);
   await h.expire('extract',doc);
   expect((await db.storedDue(1000)).some(d=>d.document_id===doc)).toBe(true);           // not filtered by attempts
   expect(await db.claimExtractLease(doc,b2,600)).toBe(false);
   expect(await db.documentById(doc)).toMatchObject({status:'extract_failed',extract_lease_until:null,extract_lease_batch_id:null,extract_attempts:3});
   expect(await code(db.failExtract(doc,b,'extract_error'))).toBe('lease_lost');
   await db.requestExtract(doc,actor);
   expect(await db.documentById(doc)).toMatchObject({status:'stored',extract_attempts:0});
   expect(await db.claimExtractLease(doc,b,600)).toBe(true);
   await db.failExtract(doc,b,'extract_error');                                            // attempt 1 < 3: stays stored
   expect(await db.documentById(doc)).toMatchObject({status:'stored',extract_lease_batch_id:null,extract_attempts:1});
   expect(await code(db.requestExtract(randomUUID(),actor))).toBe('not_found');
  });

  it('finishExtract: candidates role per source/market/class/language, pages validated, revision_exists for the current versions',async()=>{
   const zh=await extracted();
   const e=(await db.extractionById(zh.ext))!;
   expect(e).toMatchObject({document_id:zh.doc,candidates_role:'primary',candidates_status:'pending',candidates_attempts:0,has_text_layer:true,page_count:2,extractor_version:EXTRACTOR_VERSION});
   expect(await db.documentById(zh.doc)).toMatchObject({status:'extracted',current_extraction_id:zh.ext,extract_lease_until:null});
   expect((await db.pagesOf(zh.ext,[2,1,7])).map(p=>[p.page_no,p.char_count,p.text_hash])).toEqual([[1,cpLen(PAGE_TEXT),sha(PAGE_TEXT)],[2,3,sha('第二頁')]]);
   expect((await db.candidatesDue(1000)).some(x=>x.extraction_id===zh.ext)).toBe(true);
   expect(await code(db.finishExtract(zh.doc,zh.b,extractionInsert(1),[pageInsert(1,'x')]))).toBe('lease_lost');
   expect(await code(db.requestExtract(zh.doc,await h.user()))).toBe('revision_exists');
   expect((await db.extractionById((await extracted({language:'en',source_ref:`${Date.now()}${Math.floor(Math.random()*1e6)}_e`})).ext))!.candidates_role).toBe('comparison');
   const us=await extracted({source:'edgar',market:'US',language:'en',mime:'text/html',source_ref:`0000000000-26-${randomUUID().slice(0,6)}/a.htm`});
   expect(await db.extractionById(us.ext)).toMatchObject({candidates_role:'none',candidates_status:'n/a'});
   expect((await db.candidatesDue(1000)).some(x=>x.extraction_id===us.ext)).toBe(false);
   const scan=await extracted({},['',''],{has_text_layer:false});
   expect(await db.documentById(scan.doc)).toMatchObject({status:'no_text_layer',current_extraction_id:scan.ext});
   expect(await db.extractionById(scan.ext)).toMatchObject({candidates_role:'none',candidates_status:'n/a'});
   const bad=await stored();expect(await db.claimExtractLease(bad.doc,bad.b,600)).toBe(true);
   expect(await code(db.finishExtract(bad.doc,bad.b,extractionInsert(1),[pageInsert(1,'abc',{char_count:2})]))).toBe('invalid_input');
   expect(await code(db.finishExtract(bad.doc,bad.b,extractionInsert(1),[pageInsert(1,'abc',{text_hash:sha('abd')})]))).toBe('invalid_input');
   expect(await code(db.finishExtract(bad.doc,bad.b,extractionInsert(2),[pageInsert(1,'a'),pageInsert(3,'c')]))).toBe('invalid_input');
   expect(await db.pagesOf(zh.ext,[])).toEqual([]);
   // an older extractor version: requestExtract re-queues, the new version is added beside the old one
   const old=await extracted({},['舊版'],{extractor_version:'docs-extract/0.9'});
   await db.requestExtract(old.doc,await h.user());
   expect(await db.documentById(old.doc)).toMatchObject({status:'stored',current_extraction_id:old.ext});
   expect(await db.claimExtractLease(old.doc,old.b,600)).toBe(true);
   const ext2=await db.finishExtract(old.doc,old.b,extractionInsert(1),[pageInsert(1,'新版')]);
   const {rows,pages}=await drain(p=>db.extractionsOf(old.doc,p),1);
   expect(rows.map(r=>r.extraction_id)).toEqual([ext2,old.ext]);expect(pages).toBe(2);
   expect((await db.pagesOf(old.ext,[1]))[0].text).toBe('舊版');
   expect((await db.documentById(old.doc))!.current_extraction_id).toBe(ext2);
  });

  it('citations: code-point offsets, snippet and hash checks; publish only human/module citations of public documents',async()=>{
   const {doc,ext}=await extracted();
   const id=await cite(doc,ext,PAGE_TEXT,'收益');
   const start=Array.from(PAGE_TEXT).indexOf('收');
   expect(await db.citationById(id)).toMatchObject({citation_id:id,document_id:doc,extraction_id:ext,page_no:1,char_start:start,char_end:start+2,snippet:'收益',text_hash:sha(PAGE_TEXT),visibility:'internal',created_by:'extractor'});
   const utf16=PAGE_TEXT.indexOf('收');expect(utf16).not.toBe(start);                      // the supplementary characters shift UTF-16 indexes
   const base={document_id:doc,extraction_id:ext,page_no:1,bbox:null,text_hash:sha(PAGE_TEXT),created_by:'extractor' as const,created_ref:'t'};
   expect(await code(db.insertCitation({...base,char_start:utf16,char_end:utf16+2,snippet:PAGE_TEXT.slice(utf16,utf16+2)}))).toBe('invalid_citation');
   expect(await code(db.insertCitation({...base,char_start:0,char_end:cpLen(PAGE_TEXT)+1,snippet:PAGE_TEXT}))).toBe('invalid_citation');
   expect(await code(db.insertCitation({...base,char_start:3,char_end:3,snippet:''}))).toBe('invalid_citation');
   expect(await code(db.insertCitation({...base,char_start:0,char_end:3,snippet:cpSlice(PAGE_TEXT,0,3),text_hash:sha('other')}))).toBe('invalid_citation');
   expect(await code(db.insertCitation({...base,page_no:9,char_start:0,char_end:1,snippet:'損'}))).toBe('invalid_citation');
   const other=await extracted();
   expect(await code(db.insertCitation({...base,extraction_id:other.ext,char_start:0,char_end:1,snippet:'損'}))).toBe('invalid_citation');   // extraction of another document
   const emoji=await db.insertCitation({...base,char_start:Array.from(PAGE_TEXT).indexOf('\u{1F600}'),char_end:Array.from(PAGE_TEXT).indexOf('\u{1F600}')+1,snippet:'\u{1F600}'});
   expect((await db.citationById(emoji))!.snippet).toBe('\u{1F600}');
   expect(await code(db.publishCitations([id]))).toBe('not_publishable');
   const human=await cite(doc,ext,PAGE_TEXT,'毛利','human');
   expect(await db.publishCitations([human,human])).toBe(1);
   expect(await db.publishCitations([human])).toBe(0);
   expect((await db.citationById(human))!.visibility).toBe('public');
   expect(await code(db.publishCitations([human,randomUUID()]))).toBe('not_publishable');
   expect((await db.citationsByIds([emoji,id,randomUUID()])).map(c=>c.citation_id).sort()).toEqual([emoji,id].sort());
   // a private upload's citation can never be published
   const owner=await h.user();const b=await h.batchId();const content=sha(randomUUID());
   const up=await db.insertUploadDocument(owner,docInsert({source:'upload',market:'other',source_url:null,language:null,permission:'private',owner_user_id:owner,batch_id:b,content_sha256:content,storage_path:`blobs/${content}.pdf`}));
   expect(await db.claimExtractLease(up.document_id,b,600)).toBe(true);
   const upExt=await db.finishExtract(up.document_id,b,extractionInsert(1),[pageInsert(1,'研報 目標價 12')]);
   expect(await db.extractionById(upExt)).toMatchObject({candidates_role:'none'});
   const priv=await cite(up.document_id,upExt,'研報 目標價 12','目標價','human');
   expect(await code(db.publishCitations([priv]))).toBe('not_publishable');
  });

  it('candidates: lease, citation references, idempotent insert, checks with human-decision inheritance by fingerprint, human decisions',async()=>{
   const {iss,doc,ext,b}=await extracted();const b2=await h.batchId();const user=await h.user();
   const c1=await factCandidate(doc,ext);
   expect(await code(db.insertCandidates(ext,b,[c1]))).toBe('lease_lost');
   expect(await db.claimCandidatesLease(ext,b,600)).toBe(true);
   expect(await db.claimCandidatesLease(ext,b2,600)).toBe(false);
   const c2=await factCandidate(doc,ext,{natural_key:'cost_of_revenue::2025-12-31:12M:HKD',fingerprint:sha('cost')});
   expect(await db.insertCandidates(ext,b,[c1,c2])).toEqual({inserted:2});
   expect(await db.insertCandidates(ext,b,[c1])).toEqual({inserted:0});
   const foreign=await extracted();const fv=await cite(foreign.doc,foreign.ext,PAGE_TEXT,'收益');
   expect(await code(db.insertCandidates(ext,b,[{...c1,natural_key:'x',citations:{...(c1.citations as object),value:fv}}]))).toBe('invalid_citation');
   expect(await code(db.insertCandidates(ext,b,[{...c1,natural_key:'y',citations:{...(c1.citations as object),label:'not-a-uuid'}}]))).toBe('invalid_citation');
   expect(await code(db.insertCandidates(ext,b,[{...c1,natural_key:'z',citations:{value:(c1.citations as {value:string}).value}}]))).toBe('invalid_citation');   // financial_fact needs label/unit/period
   const cz=c1.citations as {period:{role:string;citation_id:string}[]};
   expect(await code(db.insertCandidates(ext,b,[{...c1,natural_key:'r1',citations:{...cz,period:[{role:'value',citation_id:cz.period[0].citation_id}]}}]))).toBe('invalid_citation');   // F3: period roles are statement_title|column_header
   expect(await code(db.insertCandidates(ext,b,[{...c1,natural_key:'r2',citations:{...cz,period:[{citation_id:cz.period[0].citation_id}]}}]))).toBe('invalid_citation');
   expect(await code(db.insertCandidates(ext,b,[{...c1,natural_key:'r3',citations:{...cz,period:[...cz.period,'not-an-object']}}]))).toBe('invalid_citation');   // non-object element → reference error
   expect(await code(db.insertCandidates(ext,b,[{...c1,natural_key:'r4',citations:{...cz,period:[{role:'statement_title',citation_id:null}]}}]))).toBe('invalid_citation');
   const listed=await drain(p=>db.candidatesOf({extractionId:ext},p),1);
   expect(listed.rows).toHaveLength(2);expect(listed.pages).toBe(2);
   const r1=listed.rows.find(r=>r.natural_key===c1.natural_key)!;const r2=listed.rows.find(r=>r.natural_key===c2.natural_key)!;expect(r1).toMatchObject({status:'candidate',checks:[],checks_passed:false,decision_kind:null,batch_id:b,document_id:doc});
   const passed=[{check:'citation_verified',blocking:true,passed:true}];
   expect(await db.writeCandidateChecks(ext,b,[{candidate_id:r1.candidate_id,checks:passed,checks_passed:true},{candidate_id:r2.candidate_id,checks:[{check:'unit_known',blocking:true,passed:false}],checks_passed:false}])).toEqual({written:2,inherited:0});
   expect(await code(db.writeCandidateChecks(ext,b2,[]))).toBe('lease_lost');
   expect(await code(db.decideCandidate(r2.candidate_id,{kind:'human',decided_by:user,status:'confirmed'}))).toBe('not_eligible');
   expect(await db.decideCandidate(r1.candidate_id,{kind:'human',decided_by:user,status:'confirmed'})).toEqual({status:'confirmed'});
   expect(await db.decideCandidate(r1.candidate_id,{kind:'human',decided_by:user,status:'confirmed'})).toEqual({status:'confirmed'});
   expect(await code(db.decideCandidate(r1.candidate_id,{kind:'human',decided_by:user,status:'rejected'}))).toBe('decided');
   expect(await db.decideCandidate(r1.candidate_id,{kind:'human',decided_by:user,status:'candidate'})).toEqual({status:'candidate'});
   expect(await db.candidateById(r1.candidate_id)).toMatchObject({status:'candidate',decision_kind:null,decided_by:null,decided_at:null});
   expect(await db.decideCandidate(r1.candidate_id,{kind:'human',decided_by:user,status:'confirmed'})).toEqual({status:'confirmed'});
   expect(await db.decideCandidate(r2.candidate_id,{kind:'human',decided_by:user,status:'rejected'})).toEqual({status:'rejected'});
   expect(await code(db.writeCandidateChecks(ext,b,[{candidate_id:r1.candidate_id,checks:passed,checks_passed:true}]))).toBe('decided');
   expect(await code(db.decideCandidate(randomUUID(),{kind:'human',decided_by:user,status:'confirmed'}))).toBe('not_found');
   // regeneration under a new extractor_ref: same fingerprint → the human decision is inherited once checks pass
   await db.finishCandidates(ext,b,'done');
   expect(await db.requestCandidatesRegen({document_id:doc},user)).toBe(1);
   expect(await db.claimCandidatesLease(ext,b2,600)).toBe(true);
   expect(await db.insertCandidates(ext,b2,[{...c1,extractor_ref:'hk-facts/2/hk-facts/1.0'},{...c2,extractor_ref:'hk-facts/2/hk-facts/1.0'}])).toEqual({inserted:2});
   const regen=(await drain(p=>db.candidatesOf({extractionId:ext},p),10)).rows.filter(r=>r.extractor_ref==='hk-facts/2/hk-facts/1.0');
   const r3=regen.find(r=>r.fingerprint===c1.fingerprint)!;const r4=regen.find(r=>r.fingerprint===c2.fingerprint)!;
   expect(await db.writeCandidateChecks(ext,b2,[{candidate_id:r3.candidate_id,checks:passed,checks_passed:true},{candidate_id:r4.candidate_id,checks:passed,checks_passed:true}])).toEqual({written:2,inherited:1});
   expect(await db.candidateById(r3.candidate_id)).toMatchObject({status:'confirmed',decision_kind:'human',decided_by:user,inherited_from:r1.candidate_id});
   expect(await db.candidateById(r4.candidate_id)).toMatchObject({status:'candidate',inherited_from:null});   // rejections are not inherited
   expect((await drain(p=>db.candidatesOf({issuerId:iss,status:'confirmed'},p),1)).rows.map(r=>r.candidate_id).sort()).toEqual([r1.candidate_id,r3.candidate_id].sort());
   expect((await drain(p=>db.candidatesOf({status:'rejected'},p),1000)).rows.some(r=>r.candidate_id===r2.candidate_id)).toBe(true);
  });

  it('auto decisions and publications: version-matched unrevoked approvals only; the publication state machine; revocation reverts at staging',async()=>{
   const {iss,doc,ext,b}=await extracted();const user=await h.user();
   expect(await db.claimCandidatesLease(ext,b,600)).toBe(true);
   const base=await factCandidate(doc,ext);
   const mk=(key:string,concept='revenue')=>({...base,natural_key:`${key}::2025-12-31:12M:HKD`,fingerprint:sha(key),payload:{...(base.payload as object),concept}});
   await db.insertCandidates(ext,b,[mk('a'),mk('b'),mk('c','gross_profit'),mk('d'),mk('e')]);
   const rows=(await drain(p=>db.candidatesOf({extractionId:ext},p),10)).rows;
   const byKey=(k:string)=>rows.find(r=>r.natural_key.startsWith(`${k}:`))!.candidate_id;
   const passed=[{check:'citation_verified',blocking:true,passed:true}];
   await db.writeCandidateChecks(ext,b,['a','b','c','e'].map(k=>({candidate_id:byKey(k),checks:passed,checks_passed:true})));
   const e=(await db.extractionById(ext))!;
   const approval={extractor_ref:base.extractor_ref,extractor_version:e.extractor_version,table_algo_version:e.table_algo_version,code_version:e.code_version,concepts:['revenue'],gold_sha256:sha('gold'),precision:'0.96',recall:'0.970',report_path:'docs/audits/x.json',approved_by:user};
   expect(await code(db.insertApproval({...approval,precision:'0.94'}))).toBe('invalid_input');
   expect(await code(db.insertApproval({...approval,precision:'0.9499999999999999999'}))).toBe('invalid_input');   // F3 review: exact decimals, never a float compare
   expect(await code(db.insertApproval({...approval,recall:'1.0000000000000000001'}))).toBe('invalid_input');
   expect(await code(db.insertApproval({...approval,gold_sha256:sha('g95'),precision:'0.95',recall:'1'}))).toBe('resolved');
   // F3 recheck N2: exponent notation is numeric to PostgreSQL; the boundary is exact
   expect(await code(db.insertApproval({...approval,gold_sha256:sha('g-exp-1'),precision:'9.5e-1',recall:'1E0'}))).toBe('resolved');
   expect(await code(db.insertApproval({...approval,gold_sha256:sha('g-exp-2'),precision:'9.4999999e-1'}))).toBe('invalid_input');
   expect(await code(db.insertApproval({...approval,gold_sha256:sha('g-exp-3'),recall:'1.0000001e0'}))).toBe('invalid_input');
   expect(await code(db.insertApproval({...approval,gold_sha256:sha('g-exp-4'),recall:'95e-2',precision:'0.9500e0'}))).toBe('resolved');
   const A=await db.insertApproval(approval);
   const wrongCode=await db.insertApproval({...approval,code_version:'other'});
   expect((await db.approvalsFor(base.extractor_ref,{limit:100})).find(x=>x.approval_id===A)).toMatchObject({precision:'0.96',recall:'0.97',revoked_at:null,concepts:['revenue']});
   expect(await code(db.approvalsFor(base.extractor_ref,{limit:1}))).toBe('too_many_approvals');
   expect(await code(db.approvalsFor(base.extractor_ref,{limit:1000}))).toBe('invalid_input');   // P2-1: a look-ahead limit stays ≤ 999 everywhere
   expect(await code(db.decideCandidate(byKey('d'),{kind:'auto',approval_id:A}))).toBe('not_eligible');        // checks not passed
   expect(await code(db.decideCandidate(byKey('c'),{kind:'auto',approval_id:A}))).toBe('not_eligible');        // concept out of scope
   expect(await code(db.decideCandidate(byKey('a'),{kind:'auto',approval_id:wrongCode}))).toBe('not_eligible'); // code_version differs from the extraction row
   const withNull=await db.insertApproval({...approval,gold_sha256:sha('gold-null'),concepts:['revenue',null as unknown as string]});
   expect(await code(db.decideCandidate(byKey('a'),{kind:'auto',approval_id:withNull}))).toBe('not_eligible');   // F3: a NULL element in concepts fails closed
   expect((await db.approvalsFor(base.extractor_ref,{limit:100})).find(x=>x.approval_id===withNull)!.concepts).toEqual(['revenue',null]);   // a NULL stays null, not the string 'null'
   expect(await db.decideCandidate(byKey('a'),{kind:'auto',approval_id:A})).toEqual({status:'confirmed'});
   expect(await db.decideCandidate(byKey('a'),{kind:'auto',approval_id:A})).toEqual({status:'confirmed'});     // idempotent
   expect(await db.candidateById(byKey('a'))).toMatchObject({decision_kind:'auto',approval_id:A,decided_by:null});
   const run1=randomUUID(),fact1=randomUUID();
   expect(await code(db.stageCandidatePublication(byKey('d'),1,run1,fact1))).toBe('not_eligible');
   await db.stageCandidatePublication(byKey('a'),1,run1,fact1);
   expect(await code(db.stageCandidatePublication(byKey('a'),1,randomUUID(),randomUUID()))).toBe('already_staged');
   await db.stageCandidatePublication(byKey('a'),2,run1,randomUUID());                                    // another generation is another row
   expect((await db.publicationsOf({candidateIds:[byKey('a')]},{limit:10})).rows.map(p=>[p.pub_gen,p.state,p.run_id])).toEqual([[1,'staged',run1],[2,'staged',run1]]);
   expect(await code(db.decideCandidate(byKey('a'),{kind:'human',decided_by:user,status:'candidate'}))).toBe('not_eligible');   // published-staged: the revert is refused
   await h.abandonPublication(byKey('a'),1);
   const run2=randomUUID(),fact2=randomUUID();
   await db.stageCandidatePublication(byKey('a'),1,run2,fact2);
   expect((await db.publicationsOf({runId:run2},{limit:10})).rows).toMatchObject([{candidate_id:byKey('a'),pub_gen:1,run_id:run2,fact_id:fact2,state:'staged'}]);
   expect((await drain(p=>db.publicationsOf({issuerId:iss,pubGen:1,state:'staged'},p),1)).rows.map(p=>p.candidate_id)).toEqual([byKey('a')]);
   // human confirmation with a publication cannot be withdrawn
   expect(await db.decideCandidate(byKey('e'),{kind:'human',decided_by:user,status:'confirmed'})).toEqual({status:'confirmed'});
   await db.stageCandidatePublication(byKey('e'),1,run2,randomUUID());
   expect(await code(db.decideCandidate(byKey('e'),{kind:'human',decided_by:user,status:'candidate'}))).toBe('not_eligible');
   // revocation: a confirmed auto candidate returns to 'candidate' when it is next staged
   const B=await db.insertApproval({...approval,gold_sha256:sha('gold-b')});
   expect(await db.decideCandidate(byKey('b'),{kind:'auto',approval_id:B})).toEqual({status:'confirmed'});
   await db.revokeApproval(B);await db.revokeApproval(B);
   expect(await code(db.stageCandidatePublication(byKey('b'),1,run2,randomUUID()))).toBe('approval_revoked');
   expect(await db.candidateById(byKey('b'))).toMatchObject({status:'candidate',decision_kind:null,approval_id:null,decided_at:null});
   expect(await code(db.decideCandidate(byKey('b'),{kind:'auto',approval_id:B}))).toBe('approval_revoked');
   expect((await db.approvalsFor(base.extractor_ref,{limit:100})).some(x=>x.approval_id===B)).toBe(false);
   expect(await code(db.revokeApproval(randomUUID()))).toBe('not_found');
  });

  it('candidates lease: attempts and exhaustion, finishCandidates needs the lease, regen resets current done/failed/exhausted versions only',async()=>{
   const {doc,ext,b}=await extracted();const b2=await h.batchId();const user=await h.user();
   expect(await db.claimCandidatesLease(ext,b,600)).toBe(true);
   expect(await code(db.finishCandidates(ext,b2,'done'))).toBe('lease_lost');
   expect(await code(db.finishCandidates(ext,b,'pending' as 'done'))).toBe('invalid_input');
   await db.finishCandidates(ext,b,'failed');
   expect(await db.extractionById(ext)).toMatchObject({candidates_status:'failed',candidates_attempts:1,candidates_lease_until:null});
   expect((await db.candidatesDue(1000)).some(x=>x.extraction_id===ext)).toBe(true);
   expect(await db.claimCandidatesLease(ext,b2,600)).toBe(true);await h.expire('candidates',ext);
   expect(await db.claimCandidatesLease(ext,b,600)).toBe(true);await h.expire('candidates',ext);
   expect(await db.claimCandidatesLease(ext,b2,600)).toBe(false);
   expect(await db.extractionById(ext)).toMatchObject({candidates_status:'exhausted',candidates_attempts:3,candidates_lease_batch_id:null});
   expect((await db.candidatesDue(1000)).some(x=>x.extraction_id===ext)).toBe(false);
   expect(await db.requestCandidatesRegen({document_id:doc},user)).toBe(1);
   expect(await db.extractionById(ext)).toMatchObject({candidates_status:'pending',candidates_attempts:0});
   expect(await db.requestCandidatesRegen({document_id:doc},user)).toBe(0);           // pending is not reset again
   expect(await code(db.requestCandidatesRegen({bogus:'x'} as never,user))).toBe('invalid_input');
  });

  it('readDocuments: as-of version selection, filters, every version, keyset paging; reclassify changes classification only',async()=>{
   const {iss,b}=await ready();
   const ref=`${Date.now()}${Math.floor(Math.random()*1e6)}_c`;
   const v1=await db.insertDocumentVersion(iss,'hkexnews',b,docInsert({source_ref:ref,available_at:'2026-01-10T01:00:00.000Z',available_date:'2026-01-10',published_at:'2026-01-10T01:00:00.000Z'}),[]);
   const v2=await db.insertDocumentVersion(iss,'hkexnews',b,docInsert({source_ref:ref,available_at:'2026-03-10T01:00:00.000Z',available_date:'2026-03-10',published_at:'2026-01-10T01:00:00.000Z'}),[]);
   const r2=await db.insertDocumentVersion(iss,'hkexnews',b,docInsert({doc_class:'interim_report',fiscal_period:'H1',period_end:'2025-06-30',available_at:'2026-02-01T01:00:00.000Z',available_date:'2026-02-01'}),[]);
   const ids=(p:{rows:{document_id:string}[]})=>p.rows.map(r=>r.document_id);
   expect(ids(await db.readDocuments(iss,{asOf:'2026-02-15',limit:10}))).toEqual([r2.document_id,v1.document_id]);
   expect(ids(await db.readDocuments(iss,{asOf:'2026-04-01',limit:10}))).toEqual([v2.document_id,r2.document_id]);
   expect(ids(await db.readDocuments(iss,{asOf:'2026-01-09',limit:10}))).toEqual([]);
   expect(ids(await db.readDocuments(iss,{asOf:'2026-04-01',limit:10,allVersions:true}))).toEqual([v2.document_id,r2.document_id,v1.document_id]);
   expect(ids(await db.readDocuments(iss,{asOf:'2026-04-01',limit:10,docClass:'interim_report'}))).toEqual([r2.document_id]);
   expect(ids(await db.readDocuments(iss,{asOf:'2026-04-01',limit:10,from:'2026-03-01',to:'2026-03-31'}))).toEqual([v2.document_id]);
   expect(ids(await db.readDocuments(iss,{asOf:'2026-04-01',limit:10,source:'edgar'}))).toEqual([]);
   const paged=await drain(p=>db.readDocuments(iss,{asOf:'2026-04-01',allVersions:true,...p}),1);
   expect(paged.rows.map(r=>r.document_id)).toEqual([v2.document_id,r2.document_id,v1.document_id]);expect(paged.pages).toBe(3);
   expect(await code(db.readDocuments(iss,{asOf:'2026-04-01',limit:0}))).toBe('invalid_input');
   expect(await code(db.readDocuments(iss,{asOf:'2026-04-01',limit:10,cursor:'not-a-cursor'}))).toBe('invalid_input');
   const actor=await h.user();
   await db.reclassifyDocument(r2.document_id,{doc_class:'annual_report',fiscal_period:'FY',period_end:'2025-12-31',classifier_gen:2},actor);
   expect(await db.documentById(r2.document_id)).toMatchObject({doc_class:'annual_report',fiscal_period:'FY',period_end:'2025-12-31',classifier_gen:2,fiscal_year:2025,title:'二零二五年年報'});
   expect(await code(db.reclassifyDocument(r2.document_id,{title:'x'} as never,actor))).toBe('invalid_input');
   expect(await code(db.reclassifyDocument(r2.document_id,{doc_class:'nope'} as never,actor))).toBe('invalid_input');
   expect(await code(db.reclassifyDocument(randomUUID(),{classifier_gen:3},actor))).toBe('not_found');
  });

  it('batch writes are atomic and bounded (F3 review): a failure on the last row writes nothing, the retry succeeds, and more than 5000 rows are refused first',async()=>{
   const {doc,ext,b}=await extracted();
   expect(await db.claimCandidatesLease(ext,b,600)).toBe(true);
   const ok1=await factCandidate(doc,ext,{natural_key:'at1::2025-12-31:12M:HKD',fingerprint:sha('at1')});
   const ok2=await factCandidate(doc,ext,{natural_key:'at2::2025-12-31:12M:HKD',fingerprint:sha('at2')});
   const bad={...ok1,natural_key:'at3::2025-12-31:12M:HKD',citations:{...(ok1.citations as object),label:randomUUID()}};   // a well-formed uuid that is no citation of this extraction
   expect(await code(db.insertCandidates(ext,b,[ok1,ok2,bad]))).toBe('invalid_citation');
   expect((await drain(p=>db.candidatesOf({extractionId:ext},p),10)).rows).toEqual([]);
   expect(await db.insertCandidates(ext,b,[ok1,ok2])).toEqual({inserted:2});
   const rows=(await drain(p=>db.candidatesOf({extractionId:ext},p),10)).rows;
   const passed=[{check:'citation_verified',blocking:true,passed:true}];
   const row=(r:{candidate_id:string})=>({candidate_id:r.candidate_id,checks:passed,checks_passed:true});
   expect(await code(db.writeCandidateChecks(ext,b,[row(rows[0]),row(rows[1]),row({candidate_id:randomUUID()})]))).toBe('not_found');
   for(const r of await Promise.all(rows.map(x=>db.candidateById(x.candidate_id))))expect(r).toMatchObject({checks:[],checks_passed:false,status:'candidate'});
   expect(await db.writeCandidateChecks(ext,b,[row(rows[0]),row(rows[1])])).toEqual({written:2,inherited:0});
   const many=Array.from({length:5001},(_,i)=>({...ok1,natural_key:`m${i}::x`}));
   expect(await code(db.insertCandidates(ext,b,many))).toBe('invalid_input');
   expect(await code(db.writeCandidateChecks(ext,b,many.map(()=>row(rows[0]))))).toBe('invalid_input');
   expect((await drain(p=>db.candidatesOf({extractionId:ext},p),10)).rows).toHaveLength(2);
  });

  it('a document version carries at most 100 assets; argument shape is checked before the lease (F3 review)',async()=>{
   const {iss,b}=await ready('edgar');
   const ref=`0000000000-26-${randomUUID().slice(0,6)}/b.htm`;
   const doc=()=>docInsert({source:'edgar',market:'US',language:'en',source_ref:ref,mime:'text/html',fiscal_period:null,fiscal_year:null,period_end:null});
   const mk=(n:number)=>Array.from({length:n},(_,i)=>assetInsert({filename:`a${i}.json`}));
   expect(await code(db.insertDocumentVersion(iss,'edgar',b,doc(),mk(101)))).toBe('invalid_input');
   expect((await db.documentVersions('edgar',ref,{limit:10})).rows).toEqual([]);
   const r=await db.insertDocumentVersion(iss,'edgar',b,doc(),mk(100));
   expect(r.outcome).toBe('inserted');
   expect(await db.assetsOf(r.document_id)).toHaveLength(100);
   // shape (duplicate role/filename) is judged before the lease; a good call without a lease is lease_lost
   const lonely=await h.issuer();
   expect(await code(db.insertDocumentVersion(lonely,'edgar',b,doc(),[assetInsert(),assetInsert()]))).toBe('invalid_input');
   expect(await code(db.insertDocumentVersion(lonely,'edgar',b,doc(),[assetInsert()]))).toBe('lease_lost');
  });

  it('reconcileScope validates the whole call before changing anything (F3 review): a bad later row leaves the state unchanged',async()=>{
   const a=await h.issuer();const c=await h.issuer();
   const good={issuer_id:a,reasons:['x'],priority:5,fetch_key:'00001'};
   for(const bad of [{issuer_id:c,reasons:[],priority:1,fetch_key:''},{issuer_id:c,reasons:[],priority:1,fetch_key:'k'.repeat(65)},{issuer_id:c,reasons:[],priority:1.5,fetch_key:'k'},
    {issuer_id:c,reasons:[],priority:-1,fetch_key:'k'},{issuer_id:c,reasons:'x' as unknown as string[],priority:1,fetch_key:'k'},{...good,fetch_key:'dup'}]){
    expect(await code(db.reconcileScope('hkexnews',[good,bad]))).toBe('invalid_input');
    expect(await db.scopeRows('hkexnews',[a,c])).toEqual([]);
   }
   expect(await db.reconcileScope('hkexnews',[good])).toBe(1);
  });

  it('reconcileScope retirement guard (Task 5 review): A reads, B activates, A retires with the older snapshot - the row stays active',async()=>{
   const iss=await h.issuer();
   const active={issuer_id:iss,reasons:['cohort'],priority:10,fetch_key:'00268'};
   const retire={issuer_id:iss,reasons:[],priority:0,fetch_key:'00268'};
   const hourAgo=new Date(Date.now()-3_600_000).toISOString(),inAnHour=new Date(Date.now()+3_600_000).toISOString();
   expect(await db.reconcileScope('hkexnews',[active],inAnHour)).toBe(1);                       // B activates (the row is confirmed now)
   expect(await db.reconcileScope('hkexnews',[retire],hourAgo)).toBe(0);                        // A's stale retirement: refused
   expect((await db.scopeRows('hkexnews',[iss]))[0]).toMatchObject({priority:10,reasons:['cohort']});
   expect(await db.reconcileScope('hkexnews',[active],inAnHour)).toBe(0);                       // unchanged confirmation: not counted, but it refreshes the guard
   expect(await db.reconcileScope('hkexnews',[retire],hourAgo)).toBe(0);
   expect((await db.scopeRows('hkexnews',[iss]))[0].priority).toBe(10);
   // an activation or upsert always applies, whatever the snapshot
   expect(await db.reconcileScope('hkexnews',[{...active,priority:20}],hourAgo)).toBe(1);
   // a snapshot taken after the last change retires; no snapshot applies everything (legacy callers)
   expect(await db.reconcileScope('hkexnews',[retire],inAnHour)).toBe(1);
   expect((await db.scopeRows('hkexnews',[iss]))[0]).toMatchObject({priority:0,reasons:[]});
   expect(await db.reconcileScope('hkexnews',[active])).toBe(1);
   expect(await db.reconcileScope('hkexnews',[retire])).toBe(1);
   // retiring a row that is already retired is never stale (nothing to protect)
   expect(await db.reconcileScope('hkexnews',[{...retire,fetch_key:'00269'}],hourAgo)).toBe(1);
  });

  it('timestamps are instants (F3 review): mixed UTC offsets order and paginate chronologically',async()=>{
   const {iss,b}=await ready();
   const at=(x:string)=>({available_at:x,published_at:x,available_date:'2026-03-20'});
   const ins=async(x:string)=>(await db.insertDocumentVersion(iss,'hkexnews',b,docInsert(at(x)),[])).document_id;
   const a1=await ins('2026-03-20T09:00:00+08:00');   // 01:00Z
   const a2=await ins('2026-03-20T02:00:00Z');         // 02:00Z
   const a3=await ins('2026-03-20T10:30:00+09:00');   // 01:30Z
   const seen=await drain(p=>db.readDocuments(iss,{asOf:'2026-03-21',...p}),1);
   expect(seen.rows.map(r=>r.document_id)).toEqual([a2,a3,a1]);
   expect(seen.pages).toBe(3);
   expect(seen.rows.map(r=>r.available_at)).toEqual(['2026-03-20T02:00:00.000Z','2026-03-20T01:30:00.000Z','2026-03-20T01:00:00.000Z']);
  });

  it('timestamps keep microseconds like timestamptz (F3 recheck N1): twelve documents .000001Z–.000012Z order and paginate exactly',async()=>{
   const {iss,b}=await ready();
   const stamp=(n:number)=>`2026-03-20T00:00:00.${String(n).padStart(6,'0')}Z`;
   const ids=new Map<number,string>();
   // shuffled insertion order; #7 arrives with a +08:00 offset, #12 with a space separator and short +00 offset
   for(const n of [5,12,1,9,3,7,11,2,8,4,10,6]){
    const x=n===7?'2026-03-20T08:00:00.000007+08:00':n===12?'2026-03-20 00:00:00.000012+00':stamp(n);
    ids.set(n,(await db.insertDocumentVersion(iss,'hkexnews',b,docInsert({available_at:x,published_at:x,available_date:'2026-03-20'}),[])).document_id);
   }
   const want=[12,11,10,9,8,7,6,5,4,3,2,1];
   for(const limit of [5,1,12]){
    const seen=await drain(p=>db.readDocuments(iss,{asOf:'2026-03-21',...p}),limit);
    expect(seen.rows.map(r=>r.document_id)).toEqual(want.map(n=>ids.get(n)));
    expect(seen.pages).toBe(Math.ceil(12/limit));
    expect(seen.rows.map(r=>r.available_at)).toEqual(want.map(stamp));
   }
  });

  it('writer timestamps follow one grammar (Task 3 review): impossible dates and zone-less values are invalid_input everywhere, nothing is stored',async()=>{
   const {iss,b}=await ready();
   for(const x of ['2026-02-31T00:00:00Z','2026-03-20T09:00:00','2026-03-20','2026-03-20T09:00:60Z']){
    const at={available_at:x,published_at:'2026-03-20T09:00:00Z',available_date:'2026-03-20'};
    expect(await code(db.insertDocumentVersion(iss,'hkexnews',b,docInsert(at),[])),x).toBe('invalid_input');
    expect(await code(db.insertDocumentVersion(iss,'hkexnews',b,docInsert({...at,available_at:'2026-03-20T09:00:00Z',published_at:x}),[])),x).toBe('invalid_input');
   }
   expect(await code(db.scopeDue('hkexnews','2026-03-20',10))).toBe('invalid_input');
   expect((await db.readDocuments(iss,{asOf:'2026-03-21',limit:10})).rows).toHaveLength(0);
  });

  it('pre-1970 sub-millisecond timestamps round-trip and sort across the epoch (Task 3 review)',async()=>{
   const {iss,b}=await ready();
   const xs=['1970-01-01T00:00:00.000001Z','1969-12-31T23:59:59.999999Z','1969-12-31T15:59:59.5-08:00','1970-01-01T00:00:00Z'];
   const ids=[];for(const x of xs)ids.push((await db.insertDocumentVersion(iss,'hkexnews',b,docInsert({available_at:x,published_at:x,available_date:'1970-01-01'}),[])).document_id);
   const seen=await drain(p=>db.readDocuments(iss,{asOf:'1971-01-01',...p}),1);
   expect(seen.rows.map(r=>r.available_at)).toEqual(['1970-01-01T00:00:00.000001Z','1970-01-01T00:00:00.000Z','1969-12-31T23:59:59.999999Z','1969-12-31T23:59:59.500Z']);
   expect(seen.rows.map(r=>r.document_id)).toEqual([ids[0],ids[3],ids[1],ids[2]]);
  });

  it('approval decimals: canonical, length-bounded and readable back; an over-long precision is refused before any write (Task 3 review)',async()=>{
   const user=await h.user();
   const ref=`long-${randomUUID()}`;
   const base={extractor_ref:ref,extractor_version:'v',table_algo_version:'t',code_version:'c',concepts:['revenue'],gold_sha256:sha('gold-long'),precision:'0.97',recall:'0.97',report_path:'r',approved_by:user};
   expect(await code(db.insertApproval({...base,precision:'0.95'+'0'.repeat(509)}))).toBe('invalid_input');
   expect(await db.approvalsFor(ref,{limit:10})).toEqual([]);
   const id=await db.insertApproval({...base,precision:'9.7e-1',recall:'0.9700'});
   expect(await db.approvalsFor(ref,{limit:10})).toMatchObject([{approval_id:id,precision:'0.97',recall:'0.97'}]);
  });

  it('extractionsOf refuses a malformed one-element cursor (Task 3 review)',async()=>{
   const bad=encodeCursor(['2026-03-20T09:00:00.000Z']);
   expect(await code(db.extractionsOf(randomUUID(),{cursor:bad,limit:5}))).toBe('invalid_input');
  });

  it('finishExtract stores a missing line_count as 0, like the SQL coalesce (F3 review)',async()=>{
   const s=await stored();
   expect(await db.claimExtractLease(s.doc,s.b,600)).toBe(true);
   const ext=await db.finishExtract(s.doc,s.b,extractionInsert(1),[pageInsert(1,'x',{line_count:null as unknown as number})]);
   expect((await db.pagesOf(ext,[1]))[0].line_count).toBe(0);
  });
 });
}

/** The writer-side fields of a stored row, to re-submit the same document. */
function pick(d:Awaited<ReturnType<DocumentsDb['documentById']>>&object):Partial<DocumentInsert>{
 const {document_id:_a,source_version:_b,supersedes_document_id:_c,observed_replacement:_d,status:_e,current_extraction_id:_f,extract_lease_until:_g,extract_lease_batch_id:_h,extract_attempts:_i,created_at:_j,...rest}=d;
 return rest;
}
