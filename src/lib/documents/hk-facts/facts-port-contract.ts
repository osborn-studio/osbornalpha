// src/lib/documents/hk-facts/facts-port-contract.ts
// Shared HkFactsPort contract (spec §4.8, §4.9, §7.7; plan F3 Task 13): the same scenarios run
// against memoryHkFactsPort (facts-port.test.ts) and pgHkFactsPort (fact-citations.integration.test.ts),
// so the in-memory rules the promote.ts unit tests rely on are exactly migration two's functions.
// Not a test file: it registers describe/it only when called. Documents, extractions, citations
// and candidates are created through the DocumentsDb contract (migration one's functions), facts
// through the port, quarantine items with plan-1 quarantine() on the harness TableClient. The
// world helpers are exported for the pg-only cases of the integration test.
import {createHash,randomInt,randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {TableClient} from '../../db/table-client';
import {quarantine} from '../../dq/quarantine';
import {FactsDbError} from '../../facts/types';
import type {FactInsert} from '../../facts/types';
import {DocumentsDbError,EXTRACTOR_VERSION,HK_EXTRACTOR_REF,HK_LABEL_GEN,HK_PUB_GEN,HK_RULES_VERSION,TABLE_ALGO_VERSION} from '../types';
import type {CandidateInsert,CitationRole,DocumentInsert,DocumentsDb,FinancialFactPayload} from '../types';
import {HK_MARKET} from './facts-port';
import type {HkFactsPort,HkFilingInsert} from './facts-port';

export interface HkPortHarness{
 port:HkFactsPort;docs:DocumentsDb;tables:TableClient;
 issuer():Promise<string>;batch():Promise<string>;user():Promise<string>;
 expireHkLease(issuer:string):Promise<void>;
 close?():Promise<void>;
}
/** Extractor version of a world's first extraction: older than EXTRACTOR_VERSION, so request_document_extract may open a current one. */
export const OLD_EXTRACTOR_VERSION='docs-extract/0.9';
/** One statement page; supplementary-plane characters precede every cited range (code-point offsets, §4.4). */
export const HK_PAGE_TEXT=['😀𠀋 綜合損益表','截至二零二五年十二月三十一日止年度','附註 二零二五年 二零二四年','人民幣千元','收益 5 1,234 1,000'].join('\n');
export const sha256=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
/** Code-point index of `needle` in `text` at or after code point `from`; -1 if absent. */
export function cpIndexOf(text:string,needle:string,from=0):number{
 const t=Array.from(text),n=Array.from(needle);
 outer:for(let i=from;i+n.length<=t.length;i++){for(let j=0;j<n.length;j++)if(t[i+j]!==n[j])continue outer;return i;}
 return -1;
}
/** Code of a DocumentsDbError rejection, 'facts:<code>' of a FactsDbError, 'resolved' when it did not reject. */
export const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof DocumentsDbError?e.code:e instanceof FactsDbError?`facts:${e.code}`:`other:${String(e)}`);
export const hkSourceRef=(lang:'zh'|'en'='zh')=>`2026${String(randomInt(1_000_000_000)).padStart(9,'0')}_${lang==='zh'?'c':'e'}`;
const byRoleThenId=(a:{role:string;citation_id:string},b:{role:string;citation_id:string})=>a.role<b.role?-1:a.role>b.role?1:a.citation_id<b.citation_id?-1:a.citation_id>b.citation_id?1:0;

export interface HkDoc{docId:string;sourceRef:string;sourceVersion:number;content:string}
/** A public HKEXnews annual report of `iss`, inserted under the sync lease of `batch`. */
export async function hkDocument(h:HkPortHarness,iss:string,batch:string,o:{lang?:'zh'|'en';sourceRef?:string;seed?:string}={}):Promise<HkDoc>{
 const lang=o.lang??'zh';const sourceRef=o.sourceRef??hkSourceRef(lang);const content=sha256(`${sourceRef}:${o.seed??'v1'}`);
 await h.docs.reconcileScope('hkexnews',[{issuer_id:iss,reasons:['test'],priority:1,fetch_key:'00268'}]);
 expect(await h.docs.claimSyncLease(iss,'hkexnews',batch,600)).toBe(true);
 const doc:DocumentInsert={issuer_id:iss,source:'hkexnews',market:'HK',source_ref:sourceRef,form_type:'年報',doc_class:'annual_report',classifier_gen:1,title:'年報 2025',language:lang,
  source_url:`https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0320/${sourceRef}.pdf`,content_sha256:content,bytes:1024,mime:'application/pdf',storage_path:`blobs/${content}.pdf`,
  acquisition:{fetched_at:'2026-03-20T10:00:00.000Z',http_status:200,content_type:'application/pdf',user_agent:'test'},published_at:'2026-03-20T09:00:00.000Z',published_at_precision:'instant',
  available_at:'2026-03-20T09:00:00.000Z',available_date:'2026-03-20',fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',filing_source_ref:null,permission:'public',owner_user_id:null,license_ref:null,batch_id:batch,code_version:'test'};
 const r=await h.docs.insertDocumentVersion(iss,'hkexnews',batch,doc,[]);
 expect(r.outcome).not.toBe('duplicate');
 const row=await h.docs.documentById(r.document_id);
 return {docId:r.document_id,sourceRef,sourceVersion:row!.source_version,content};
}
/** Extracts one page under the extract lease of `batch`; returns the extraction id. */
export async function hkExtraction(h:HkPortHarness,docId:string,batch:string,content:string,extractorVersion=OLD_EXTRACTOR_VERSION,text=HK_PAGE_TEXT):Promise<string>{
 expect(await h.docs.claimExtractLease(docId,batch,600)).toBe(true);
 const pagesSha=sha256(`${docId}:${extractorVersion}`);
 return h.docs.finishExtract(docId,batch,{extractor_version:extractorVersion,table_algo_version:TABLE_ALGO_VERSION,code_version:'test',has_text_layer:true,page_count:1,pages_json_path:`extractions/${content}/${pagesSha}.pages.json`,pages_json_sha256:pagesSha},
  [{page_no:1,text,text_hash:sha256(text),char_count:Array.from(text).length,width:595,height:842,line_count:text.split('\n').length,has_tables:true}]);
}
export async function hkCite(h:HkPortHarness,docId:string,extractionId:string,needle:string,from=0,text=HK_PAGE_TEXT):Promise<string>{
 const start=cpIndexOf(text,needle,from);expect(start).toBeGreaterThanOrEqual(0);
 return h.docs.insertCitation({document_id:docId,extraction_id:extractionId,page_no:1,char_start:start,char_end:start+Array.from(needle).length,bbox:null,snippet:needle,text_hash:sha256(text),created_by:'extractor',created_ref:HK_EXTRACTOR_REF});
}

export interface HkWorld extends HkDoc{iss:string;docBatch:string;user:string;extractionId:string;
 cit:{title:string;col25:string;col24:string;label:string;unit:string;v25:string;v24:string};cand25:string;cand24:string}
const payload=(year:'2025'|'2024',value:string,presented:string):FinancialFactPayload=>({concept:'revenue',statement:'IS',period_start:`${year}-01-01`,period_end:`${year}-12-31`,duration:'12M',value,presented,unit:'CNY',scale:'1000',sign_flip:false,
 period_derivation:{rule:year==='2025'?'title_duration':'title_year_substitution',title_date:'2025-12-31',column_text:year==='2025'?'二零二五年':'二零二四年'},consolidation:'consolidated'});
/** One HK issuer with a public Chinese annual report, one extraction, seven citations and two confirmed revenue candidates (2025, 2024); candidates_status done. */
export async function hkWorld(h:HkPortHarness):Promise<HkWorld>{
 const iss=await h.issuer();const docBatch=await h.batch();const user=await h.user();
 const doc=await hkDocument(h,iss,docBatch);
 const ext=await hkExtraction(h,doc.docId,docBatch,doc.content);
 const after=cpIndexOf(HK_PAGE_TEXT,'附註');
 const cit={title:await hkCite(h,doc.docId,ext,'截至二零二五年十二月三十一日止年度'),col25:await hkCite(h,doc.docId,ext,'二零二五年',after),col24:await hkCite(h,doc.docId,ext,'二零二四年'),
  label:await hkCite(h,doc.docId,ext,'收益'),unit:await hkCite(h,doc.docId,ext,'人民幣千元'),v25:await hkCite(h,doc.docId,ext,'1,234'),v24:await hkCite(h,doc.docId,ext,'1,000')};
 const e=(await h.docs.extractionById(ext))!;
 expect(await h.docs.claimCandidatesLease(ext,docBatch,600)).toBe(true);
 const cand=(y:'2025'|'2024',value:string,presented:string,valueCit:string,colCit:string):CandidateInsert=>({kind:'financial_fact',extractor_kind:'rule',extractor_ref:HK_EXTRACTOR_REF,natural_key:`revenue:${y}-01-01:${y}-12-31:12M:CNY`,
  citations:{value:valueCit,label:cit.label,unit:cit.unit,period:[{role:'statement_title',citation_id:cit.title},{role:'column_header',citation_id:colCit}]},payload:payload(y,value,presented),fingerprint:sha256(`${doc.docId}:${y}`),
  input_snapshot:{content_sha256:doc.content,pages_json_sha256:e.pages_json_sha256,page_nos:[1],extractor_version:e.extractor_version,table_algo_version:e.table_algo_version,code_version:e.code_version,hk_label_gen:HK_LABEL_GEN,hk_rules_version:HK_RULES_VERSION}});
 expect(await h.docs.insertCandidates(ext,docBatch,[cand('2025','1234000','1,234',cit.v25,cit.col25),cand('2024','1000000','1,000',cit.v24,cit.col24)])).toEqual({inserted:2});
 const rows=(await h.docs.candidatesOf({extractionId:ext},{limit:100})).rows;
 expect(rows).toHaveLength(2);
 expect(await h.docs.writeCandidateChecks(ext,docBatch,rows.map(c=>({candidate_id:c.candidate_id,checks:[{check:'unit_known',blocking:true,passed:true}],checks_passed:true})))).toEqual({written:2,inherited:0});
 for(const c of rows)expect(await h.docs.decideCandidate(c.candidate_id,{kind:'human',decided_by:user,status:'confirmed'})).toEqual({status:'confirmed'});
 await h.docs.finishCandidates(ext,docBatch,'done');
 const id=(y:string)=>rows.find(c=>c.natural_key.startsWith(`revenue:${y}`))!.candidate_id;
 return {...doc,iss,docBatch,user,extractionId:ext,cit,cand25:id('2025'),cand24:id('2024')};
}
/** Opens a current extraction (EXTRACTOR_VERSION) for the world's document; the world's citations become non-current. */
export async function hkReextract(h:HkPortHarness,w:HkWorld):Promise<string>{
 await h.docs.requestExtract(w.docId,w.user);
 return hkExtraction(h,w.docId,w.docBatch,w.content,EXTRACTOR_VERSION);
}
export function hkFilingRow(w:HkWorld,o:Partial<HkFilingInsert>={}):HkFilingInsert{
 return {filing_id:randomUUID(),issuer_id:w.iss,source:'hkex',origin:'hkex',formType:'annual',fiscalYear:2025,fiscalPeriod:'FY',periodEnd:'2025-12-31',availableDate:'2026-03-20',sourceRef:`hkex:${w.sourceRef}:v${w.sourceVersion}`,url:null,...o};
}
export function hkFact(w:HkWorld,filingId:string,year:'2025'|'2024',value:string):FactInsert{
 return {fact_id:randomUUID(),issuer_id:w.iss,market:HK_MARKET,filing_id:filingId,concept:'revenue',source_concept:'收益',statement:'IS',period_start:`${year}-01-01`,period_end:`${year}-12-31`,duration:'12M',value,unit:'CNY',consolidation:'consolidated',available_date:'2026-03-20',mapping_gen:HK_PUB_GEN,mapping_version:HK_EXTRACTOR_REF,raw_hash:`hkex:test:${year}`};
}
/** value, label, unit and two period rows per fact (10 rows for the two facts). */
export function evidenceRows(w:HkWorld,fact25:string,fact24:string):{fact_id:string;citation_id:string;role:CitationRole}[]{
 const rows=(fact:string,value:string,col:string)=>[{fact_id:fact,citation_id:value,role:'value' as const},{fact_id:fact,citation_id:w.cit.label,role:'label' as const},{fact_id:fact,citation_id:w.cit.unit,role:'unit' as const},
  {fact_id:fact,citation_id:w.cit.title,role:'period' as const},{fact_id:fact,citation_id:col,role:'period' as const}];
 return [...rows(fact25,w.cit.v25,w.cit.col25),...rows(fact24,w.cit.v24,w.cit.col24)];
}
export const sortedEvidence=(rows:{fact_id:string;citation_id:string;role:CitationRole}[],fact:string)=>rows.filter(r=>r.fact_id===fact).map(({role,citation_id})=>({role,citation_id})).sort(byRoleThenId);
export interface HkRun{batch:string;run:string;filingId:string;fact25:FactInsert;fact24:FactInsert;bound:number}
/** ensureHkScope → claimLease (new batch) → beginRun → stageFilings → bind → stageFacts → candidate links → evidence; nothing published. */
export async function hkStagedRun(h:HkPortHarness,w:HkWorld,o:{bind?:boolean;link?:boolean;evidence?:boolean}={}):Promise<HkRun>{
 await h.port.ensureHkScope(w.iss,'00268');
 const batch=await h.batch();expect(await h.port.claimLease(w.iss,batch,600)).toBe(true);
 const run=await h.port.beginRun(w.iss,batch,HK_PUB_GEN);
 const f=hkFilingRow(w);const filingId=(await h.port.stageFilings(run,[f])).get(f.sourceRef)!;
 const bound=o.bind===false?0:await h.port.bindFilingDocuments(run,[{filing_id:filingId,document_id:w.docId}]);
 const fact25=hkFact(w,filingId,'2025','1234000');const fact24=hkFact(w,filingId,'2024','1000000');
 expect(await h.port.stageFacts(run,[fact25,fact24])).toBe(2);
 if(o.link!==false){await h.docs.stageCandidatePublication(w.cand25,HK_PUB_GEN,run,fact25.fact_id);await h.docs.stageCandidatePublication(w.cand24,HK_PUB_GEN,run,fact24.fact_id);}
 if(o.evidence!==false)expect(await h.port.insertFactCitations(run,evidenceRows(w,fact25.fact_id,fact24.fact_id))).toBe(10);
 return {batch,run,filingId,fact25,fact24,bound};
}
export const stateRev=async(h:HkPortHarness,iss:string)=>(await h.port.readFacts(iss,{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true})).stateRev;
const dueIds=async(h:HkPortHarness,gen:number)=>(await h.port.promotionDue(gen,1000)).map(x=>x.issuerId);
const itemRow=async(h:HkPortHarness,id:string)=>(await h.tables.select('dq_quarantine',{id}))[0];

export function hkFactsPortContract(label:string,setup:()=>Promise<HkPortHarness>):void{
 describe(label,()=>{
  let h:HkPortHarness;
  beforeAll(async()=>{h=await setup();},60000);
  afterAll(async()=>{await h?.close?.();},30000);

  it('an HK run end to end: stage, bind, link, evidence, publishHkRun, finishCandidatePublications; reads, links and promotionDue follow',async()=>{
   const w=await hkWorld(h);
   expect(await dueIds(h,HK_PUB_GEN)).toContain(w.iss);                                          // (ab) confirmed, never linked
   const r=await hkStagedRun(h,w);
   expect(r.bound).toBe(1);
   expect(await h.port.runStatus(r.run)).toBe('staged');
   expect(await h.port.runStatus(randomUUID())).toBeNull();
   expect(await dueIds(h,HK_PUB_GEN)).toContain(w.iss);                                          // (c) staged links
   const rev=await stateRev(h,w.iss);
   expect(await code(h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],rev,[{document_id:w.docId,extraction_id:'x'}]))).toBe('invalid_input');
   expect(await h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],rev,[{document_id:w.docId,extraction_id:w.extractionId}])).toBe(2);   // the zero-output selection still holds
   expect(await h.port.runStatus(r.run)).toBe('published');
   expect(await h.port.finishCandidatePublications(r.run)).toEqual({published:2,still_staged:0,abandoned:0});
   expect(await h.port.finishCandidatePublications(r.run)).toEqual({published:0,still_staged:0,abandoned:0});   // idempotent (crash recovery)
   expect((await h.docs.candidateById(w.cand25))?.status).toBe('promoted');
   expect((await h.docs.candidateById(w.cand24))?.status).toBe('promoted');
   const read=await h.port.readFacts(w.iss,{concepts:['revenue'],asOf:'2030-01-01',history:true});
   expect(read.stateRev).toBe(rev+1);
   expect(read.rows.map(f=>[f.fact_id,String(f.market),f.status,f.value]).sort()).toEqual([[r.fact24.fact_id,'HK','ok','1000000'],[r.fact25.fact_id,'HK','ok','1234000']].sort());
   expect((await h.port.factsByIds([r.fact25.fact_id]))[0]).toMatchObject({status:'ok',mapping_gen:HK_PUB_GEN,filing_id:r.filingId});
   expect(await h.port.citationsOfFact(r.fact25.fact_id)).toEqual(sortedEvidence(evidenceRows(w,r.fact25.fact_id,r.fact24.fact_id),r.fact25.fact_id));
   expect(await h.port.citationsOfFact(randomUUID())).toEqual([]);
   expect(await h.port.hkFilingOfDocument(w.docId)).toEqual({filing_id:r.filingId,mapping_gen:HK_PUB_GEN});
   expect(await h.port.hkFilingOfDocument(randomUUID())).toBeNull();
   expect(await h.port.openConflicts(w.iss)).toEqual([]);
   expect(await dueIds(h,HK_PUB_GEN)).not.toContain(w.iss);                                      // everything published under this generation
   expect(await h.port.zeroOutputDocuments(w.iss,HK_PUB_GEN)).toEqual([]);
   expect(await h.port.zeroOutputDocuments(w.iss,HK_PUB_GEN+1)).toEqual([w.docId]);              // (d) the filing sits on an older generation
   expect(await dueIds(h,HK_PUB_GEN+1)).toContain(w.iss);
   await h.port.releaseLease(w.iss,r.batch,'success','2030-01-01T00:00:00.000Z');
   expect(await code(h.port.releaseLease(w.iss,r.batch,'success','2030-01-01T00:00:00.000Z'))).toBe('facts:lease_lost');
  });

  it('ensureHkScope creates the HK scope row once and never changes it (the lease survives); a malformed fetch key is invalid_input',async()=>{
   const iss=await h.issuer();
   expect(await code(h.port.ensureHkScope(iss,'268'))).toBe('invalid_input');
   expect(await h.port.claimLease(iss,await h.batch(),600)).toBe(false);                        // no scope row yet
   await h.port.ensureHkScope(iss,'00268');
   const b1=await h.batch();const b2=await h.batch();
   expect(await h.port.claimLease(iss,b1,600)).toBe(true);
   await h.port.ensureHkScope(iss,'99999');
   expect(await h.port.claimLease(iss,b2,600)).toBe(false);
   await h.expireHkLease(iss);
   expect(await h.port.claimLease(iss,b2,600)).toBe(true);
  });

  it('bindFilingDocuments: validates filing and document, is idempotent per pair, refuses a second document; a pruned gen-0 filing takes its binding along',async()=>{
   const w=await hkWorld(h);
   const en=await hkDocument(h,w.iss,w.docBatch,{lang:'en'});
   const other=await hkDocument(h,w.iss,w.docBatch);
   await h.port.ensureHkScope(w.iss,'00268');const b=await h.batch();expect(await h.port.claimLease(w.iss,b,600)).toBe(true);
   const run=await h.port.beginRun(w.iss,b,HK_PUB_GEN);
   const f=hkFilingRow(w);const g=hkFilingRow(w,{sourceRef:`hkex:${en.sourceRef}:v${en.sourceVersion}`});
   const m=await h.port.stageFilings(run,[f,g]);const fid=m.get(f.sourceRef)!;const gid=m.get(g.sourceRef)!;
   expect(await code(h.port.bindFilingDocuments(run,[{filing_id:gid,document_id:en.docId}]))).toBe('invalid_input');        // English version: no filing
   expect(await code(h.port.bindFilingDocuments(run,[{filing_id:fid,document_id:other.docId}]))).toBe('invalid_input');     // source_ref names another document
   expect(await code(h.port.bindFilingDocuments(run,[{filing_id:randomUUID(),document_id:w.docId}]))).toBe('invalid_input'); // unknown filing
   expect(await h.port.bindFilingDocuments(run,[{filing_id:fid,document_id:w.docId},{filing_id:fid,document_id:w.docId}])).toBe(1);
   expect(await h.port.bindFilingDocuments(run,[{filing_id:fid,document_id:w.docId}])).toBe(0);
   expect(await code(h.port.bindFilingDocuments(run,[{filing_id:fid,document_id:other.docId}]))).toBe('binding_conflict');
   expect(await h.port.hkFilingOfDocument(w.docId)).toEqual({filing_id:fid,mapping_gen:0});
   await h.expireHkLease(w.iss);
   expect(await code(h.port.bindFilingDocuments(run,[{filing_id:fid,document_id:w.docId}]))).toBe('lease_lost');            // the run's batch lost its lease
   const b2=await h.batch();expect(await h.port.claimLease(w.iss,b2,600)).toBe(true);
   await h.port.beginRun(w.iss,b2,HK_PUB_GEN);                                                   // abandons `run`, prunes its empty gen-0 filings
   expect(await h.port.runStatus(run)).toBe('abandoned');
   expect(await h.port.hkFilingOfDocument(w.docId)).toBeNull();
  });

  it('insertFactCitations refuses bad roles, unknown facts, facts of another run, foreign documents, unbound filings and non-current extractions; it is idempotent',async()=>{
   const w=await hkWorld(h);const w2=await hkWorld(h);
   const r=await hkStagedRun(h,w,{evidence:false});
   const r2=await hkStagedRun(h,w2,{bind:false,evidence:false});
   const row=(o:Partial<{fact_id:string;citation_id:string;role:CitationRole}>={})=>({fact_id:r.fact25.fact_id,citation_id:w.cit.v25,role:'value' as CitationRole,...o});
   expect(await code(h.port.insertFactCitations(r.run,[row({role:'bogus' as CitationRole})]))).toBe('invalid_citation');
   expect(await code(h.port.insertFactCitations(r.run,[row({fact_id:randomUUID()})]))).toBe('invalid_citation');
   expect(await code(h.port.insertFactCitations(r.run,[row({fact_id:r2.fact25.fact_id})]))).toBe('invalid_citation');     // staged in another run
   expect(await code(h.port.insertFactCitations(r.run,[row({citation_id:w2.cit.v25})]))).toBe('invalid_citation');        // another document
   expect(await code(h.port.insertFactCitations(r2.run,[{fact_id:r2.fact25.fact_id,citation_id:w2.cit.v25,role:'value'}]))).toBe('invalid_citation');   // filing never bound
   expect(await h.port.insertFactCitations(r.run,evidenceRows(w,r.fact25.fact_id,r.fact24.fact_id))).toBe(10);
   expect(await h.port.insertFactCitations(r.run,evidenceRows(w,r.fact25.fact_id,r.fact24.fact_id))).toBe(0);
   await hkReextract(h,w);
   expect(await code(h.port.insertFactCitations(r.run,[row()]))).toBe('invalid_citation');                                 // extraction no longer current
  });

  it('publishHkRun refuses a missing revision, incomplete evidence, a foreign batch and a stale plan without publishing anything',async()=>{
   const w=await hkWorld(h);const r=await hkStagedRun(h,w,{evidence:false});const rev=await stateRev(h,w.iss);
   const publish=(batch=r.batch,expected=rev)=>h.port.publishHkRun(w.iss,batch,r.run,[r.filingId],expected,[]);
   expect(await code(publish(r.batch,Number.NaN))).toBe('invalid_expected_rev');
   expect(await code(publish())).toBe('evidence_incomplete');
   const rows=evidenceRows(w,r.fact25.fact_id,r.fact24.fact_id);
   expect(await h.port.insertFactCitations(r.run,rows.filter(x=>!(x.fact_id===r.fact24.fact_id&&x.role==='unit')))).toBe(9);
   expect(await code(publish())).toBe('evidence_incomplete');                                    // fact24 lacks its unit
   expect(await h.port.insertFactCitations(r.run,rows)).toBe(1);
   expect(await code(publish(await h.batch()))).toBe('lease_lost');
   expect(await code(publish(r.batch,rev+1))).toBe('stale_plan');
   expect(await h.port.runStatus(r.run)).toBe('staged');
   expect((await h.port.factsByIds([r.fact25.fact_id,r.fact24.fact_id])).map(f=>f.status)).toEqual(['staged','staged']);
   expect(await stateRev(h,w.iss)).toBe(rev);
   expect(await publish()).toBe(2);
   // evidence complete but no candidate_publications link: still incomplete
   const v=await hkWorld(h);const s=await hkStagedRun(h,v,{link:false});
   expect(await code(h.port.publishHkRun(v.iss,s.batch,s.run,[s.filingId],await stateRev(h,v.iss),[]))).toBe('evidence_incomplete');
   expect(await h.port.runStatus(s.run)).toBe('staged');
  });

  it('mixed outcome: a quarantined fact keeps its link staged until resolveHkFactsQuarantine promotes it with the hook done; non-HK items are refused',async()=>{
   const w=await hkWorld(h);const r=await hkStagedRun(h,w);
   const item=await quarantine(h.tables,{dataset:'facts.hk',table:'financial_facts',naturalKey:`${w.iss}:HK:revenue:2024-01-01:2024-12-31:consolidated:CNY:2026-03-20`,reasonCode:'identity_gp',batchId:r.batch,payload:{fact_ids:[],run_id:r.run}});
   expect(await h.port.quarantineFacts(r.run,[r.fact24.fact_id],item)).toBe(1);
   expect(await h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],await stateRev(h,w.iss),[])).toBe(1);
   expect(await h.port.finishCandidatePublications(r.run)).toEqual({published:1,still_staged:1,abandoned:0});
   expect((await h.docs.candidateById(w.cand25))?.status).toBe('promoted');
   expect((await h.docs.candidateById(w.cand24))?.status).toBe('confirmed');
   expect(await dueIds(h,HK_PUB_GEN)).not.toContain(w.iss);                                      // (c) the staged link waits on the owner's decision: not due (P2-6)
   expect(await code(h.port.abandonCandidatePublications(r.run))).toBe('invalid_input');          // a published run is never abandoned
   const stray=await quarantine(h.tables,{dataset:'facts.hk',table:'financial_facts',naturalKey:`${w.iss}:HK:stray`,reasonCode:'identity_bs',batchId:r.batch,payload:{fact_ids:[],run_id:randomUUID()}});
   expect(await code(h.port.resolveHkFactsQuarantine(stray,[],w.user))).toBe('not_hk_item');
   expect((await itemRow(h,stray)).status).toBe('open');
   expect(await code(h.port.resolveHkFactsQuarantine(randomUUID(),[],w.user))).toBe('not_found');
   expect(await h.port.resolveHkFactsQuarantine(item,[],w.user)).toEqual({promoted:1,skipped:0,chosenFactIds:[r.fact24.fact_id]});
   const it1=await itemRow(h,item);
   expect(it1.status).toBe('resolved_accept');
   expect((it1.detail as {hook?:unknown}).hook).toMatchObject({stage:'done',state:'done',message:'hk_no_metrics'});
   expect(await code(h.port.resolveHkFactsQuarantine(item,[],w.user))).toBe('item_not_open');
   expect(await dueIds(h,HK_PUB_GEN)).toContain(w.iss);                                          // (c) the decision made the link actionable
   expect(await h.port.finishCandidatePublications(r.run)).toEqual({published:1,still_staged:0,abandoned:0});
   expect((await h.docs.candidateById(w.cand24))?.status).toBe('promoted');
   expect(await dueIds(h,HK_PUB_GEN)).not.toContain(w.iss);
  });

  it('renewLease (R3-P2-1) extends only a lease the batch holds unexpired; it never acquires an unowned or released scope',async()=>{
   const w=await hkWorld(h);await h.port.ensureHkScope(w.iss,'00268');
   const b=await h.batch();const other=await h.batch();
   expect(await h.port.renewLease(w.iss,b,600)).toBe(false);                                     // unowned: not acquired
   expect(await h.port.claimLease(w.iss,b,600)).toBe(true);
   expect(await h.port.renewLease(w.iss,b,600)).toBe(true);
   expect(await h.port.renewLease(w.iss,other,600)).toBe(false);
   await h.port.releaseLease(w.iss,b,'success','2030-01-01T00:00:00.000Z');
   expect(await h.port.renewLease(w.iss,b,600)).toBe(false);                                     // released: stays released
   expect(await h.port.claimLease(w.iss,other,600)).toBe(true);                                  // free for anyone
   await h.port.releaseLease(w.iss,other,'success','2030-01-01T00:00:00.000Z');
   expect(await code(h.port.renewLease(w.iss,b,0))).toBe('invalid_input');
  });

  it('R3-P1-1: the published unit evidence is exactly what the candidate declared — an undeclared unit_currency or a second unit is evidence_incomplete',async()=>{
   const w=await hkWorld(h);const r=await hkStagedRun(h,w);
   expect(await h.port.insertFactCitations(r.run,[{fact_id:r.fact25.fact_id,citation_id:w.cit.title,role:'unit_currency'}])).toBe(1);   // an amount with "currency" evidence
   expect(await code(h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],await stateRev(h,w.iss),[]))).toBe('evidence_incomplete');
   expect(await h.port.runStatus(r.run)).toBe('staged');
   await h.port.abandonRun(r.run);await h.port.releaseLease(w.iss,r.batch,'failed','2030-01-01T00:00:00.000Z');
   const v=await hkWorld(h);const s=await hkStagedRun(h,v);
   expect(await h.port.insertFactCitations(s.run,[{fact_id:s.fact24.fact_id,citation_id:v.cit.title,role:'unit'}])).toBe(1);             // a second unit citation
   expect(await code(h.port.publishHkRun(v.iss,s.batch,s.run,[s.filingId],await stateRev(h,v.iss),[]))).toBe('evidence_incomplete');
   expect((await h.port.factsByIds([s.fact25.fact_id,s.fact24.fact_id])).map(f=>f.status)).toEqual(['staged','staged']);
   await h.port.abandonRun(s.run);await h.port.releaseLease(v.iss,s.batch,'failed','2030-01-01T00:00:00.000Z');
  });

  it('publishHkRun revalidates the zero-output selection under the document locks (P1-4): a switched extraction is stale_plan and publishes nothing',async()=>{
   const w=await hkWorld(h);const r=await hkStagedRun(h,w);const rev=await stateRev(h,w.iss);
   const planned=[{document_id:w.docId,extraction_id:w.extractionId}];
   const next=await hkReextract(h,w);                                                            // between selection and publish: a new extraction, candidates pending
   expect((await h.docs.extractionById(next))?.candidates_status).toBe('pending');
   expect(await code(h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],rev,planned))).toBe('stale_plan');
   expect(await code(h.port.publishHkRun(w.iss,r.batch,r.run,[r.filingId],rev,[{document_id:w.docId,extraction_id:next}]))).toBe('stale_plan');   // current, but candidates not done
   expect(await h.port.runStatus(r.run)).toBe('staged');
   expect(await stateRev(h,w.iss)).toBe(rev);                                                    // no generation advance, nothing published
   expect((await h.port.factsByIds([r.fact25.fact_id,r.fact24.fact_id])).map(f=>f.status)).toEqual(['staged','staged']);
   expect(await h.port.hkFilingOfDocument(w.docId)).toMatchObject({filing_id:r.filingId});
   await h.port.abandonRun(r.run);await h.port.releaseLease(w.iss,r.batch,'failed','2030-01-01T00:00:00.000Z');
  });

  it('abandoned runs: links of a staged run cannot be closed; after abandonRun they are abandoned, evidence is gone, and a later run re-stages them',async()=>{
   const w=await hkWorld(h);const r=await hkStagedRun(h,w);
   expect(await code(h.port.abandonCandidatePublications(r.run))).toBe('run_pending');
   expect(await code(h.port.finishCandidatePublications(r.run))).toBe('run_pending');
   await h.port.abandonRun(r.run);
   expect(await h.port.runStatus(r.run)).toBe('abandoned');
   expect(await h.port.citationsOfFact(r.fact25.fact_id)).toEqual([]);                           // cascaded with the deleted staged facts
   expect(await code(h.port.finishCandidatePublications(r.run))).toBe('invalid_input');
   expect(await h.port.abandonCandidatePublications(r.run)).toBe(2);
   expect(await h.port.abandonCandidatePublications(r.run)).toBe(0);
   expect(await code(h.port.abandonCandidatePublications(randomUUID()))).toBe('not_found');
   await h.port.releaseLease(w.iss,r.batch,'failed','2030-01-01T00:00:00.000Z');
   const r2=await hkStagedRun(h,w);                                                              // abandoned → staged with the new run's facts
   expect(r2.filingId).toBe(r.filingId);                                                          // abandonRun keeps filings; stage_filings reuses it …
   expect(r2.bound).toBe(0);                                                                      // … with its binding
   expect(await h.port.publishHkRun(w.iss,r2.batch,r2.run,[r2.filingId],await stateRev(h,w.iss),[])).toBe(2);
   expect(await h.port.finishCandidatePublications(r2.run)).toEqual({published:2,still_staged:0,abandoned:0});
  });

  it('promotionDue: unlinked confirmed candidates are due, rejected ones are not; limit 0 and ascending order; (d) needs a published filing',async()=>{
   const w=await hkWorld(h);
   expect(await dueIds(h,HK_PUB_GEN)).toContain(w.iss);
   expect(await h.port.promotionDue(HK_PUB_GEN,0)).toEqual([]);
   const all=await dueIds(h,HK_PUB_GEN);
   expect(all).toEqual([...all].sort());
   expect(await h.port.zeroOutputDocuments(w.iss,HK_PUB_GEN+1)).toEqual([]);                     // never bound to a filing
   for(const id of [w.cand25,w.cand24]){
    await h.docs.decideCandidate(id,{kind:'human',decided_by:w.user,status:'candidate'});
    await h.docs.decideCandidate(id,{kind:'human',decided_by:w.user,status:'rejected'});
   }
   expect(await dueIds(h,HK_PUB_GEN)).not.toContain(w.iss);
  });
 });
}
