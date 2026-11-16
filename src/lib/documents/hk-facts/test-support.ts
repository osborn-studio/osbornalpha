// src/lib/documents/hk-facts/test-support.ts
// TEST-ONLY helpers for the HK candidate / promotion tests (Tasks 15–17); production code never
// imports this file. hkHarness wires one in-memory world: memoryTableClient (ingest_batches,
// dq_quarantine, dq_freshness, issuers) shared by memoryFactsDb and plan-1 quarantine(),
// memoryDocumentsDb, memoryObjectStore and memoryHkFactsPort, all on one fixed clock.
// seedHkExtraction stores a Chinese HKEX periodic report (public, hkexnews) through the real
// DocumentsDb functions (sync lease → insertDocumentVersion; extract lease → finishExtract) with a
// stored pages.json built from SeedFacts: one page per statement, the supplementary-plane character
// 𠀋 on line 0 so every cited span sits behind a non-BMP code point. seedHkCandidates cites every
// value/label/unit/period span with the real cite(), inserts the candidates, writes passing (or
// failing) checks and finishes the version — the state Task 15's run leaves behind.
import {createHash} from 'node:crypto';
import {memoryTableClient} from '../../db/memory-table-client';
import type {Row,TableClient} from '../../db/table-client';
import {startBatch} from '../../dq/batches';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';
import {cite} from '../citations';
import {cpLength,pageInsertsOf,sha256Hex} from '../extract/pages-json';
import {memoryDocumentsDb} from '../memory-documents-db';
import type {MemoryDocumentsDb} from '../memory-documents-db';
import {blobPath,memoryObjectStore,pagesJsonPath} from '../object-store';
import {CLASSIFIER_GEN,EXTRACTOR_VERSION,HK_EXTRACTOR_REF,HK_LABEL_GEN,HK_RULES_VERSION,TABLE_ALGO_VERSION} from '../types';
import type {CandidateInsert,CandidateRow,DocumentInsert,DocumentRow,ExtractionRow,FactCitations,FinancialFactPayload,InputSnapshot,LayoutLine,PagesJson} from '../types';
import type {CandidatesDeps} from '../candidates/run';
import {memoryHkFactsPort} from './facts-port';
import type {HkFactsPort} from './facts-port';

export const ISSUER='00000000-0000-4000-8000-0000000000a1';
export const ADMIN='00000000-0000-4000-8000-0000000000ad';
export const CODE='test-code-version';
export const NOW='2026-11-06T02:00:00.000Z';

export interface HkHarness{
 tables:TableClient&{rows(table:string):Row[]};facts:MemoryFactsDb;docs:MemoryDocumentsDb;store:ReturnType<typeof memoryObjectStore>;port:HkFactsPort;
 now:()=>Date;batch():Promise<string>;
}
export function hkHarness(o:{now?:string;issuers?:{issuer_id:string;code:string|null}[]}={}):HkHarness{
 const nowIso=o.now??NOW;
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset'],issuers:['issuer_id']});
 const facts=memoryFactsDb(tables);facts.setNow(nowIso);
 const docs=memoryDocumentsDb({now:()=>new Date(nowIso)});
 const store=memoryObjectStore();
 const port=memoryHkFactsPort(facts,docs,{now:()=>new Date(nowIso)});   // same clock as the pinned memoryFactsDb leases
 for(const i of o.issuers??[{issuer_id:ISSUER,code:'00268'}])void tables.insert('issuers',{issuer_id:i.issuer_id,hkex_stock_code_primary:i.code,status:'active'});
 return {tables,facts,docs,store,port,now:()=>new Date(nowIso),
  batch:async()=>(await startBatch(tables,{producer:'test',dataset:'test',codeVersion:CODE,triggeredBy:'script'})).batchId};
}
/** CandidatesDeps over the harness (also a valid PromoteDeps: same db/port/tables/now/deadline). */
export const candidatesDepsOf=(h:HkHarness):CandidatesDeps=>({db:h.docs,tables:h.tables,store:h.store,port:h.port,now:h.now,deadline:null,codeVersion:CODE});

/** cents: a per-share fact whose label carries the currency-less sub-unit （仙）: unit cites 仙, unit_currency the statement unit line, scale 0.01 (R3-P1-1). */
export interface SeedFact{concept:string;statement:'IS'|'BS'|'CF';period_start:string|null;period_end:string;duration:'6M'|'12M'|'INSTANT';value:string;unit?:string;presented?:string;column?:'primary'|'comparative';label?:string;cents?:boolean}
const LABELS:Record<string,string>={revenue:'收益',cost_of_revenue:'銷售成本',gross_profit:'毛利',operating_income:'經營溢利',income_tax:'所得稅開支',net_income:'年內溢利',
 net_income_parent:'本公司擁有人',eps_basic:'基本',eps_diluted:'攤薄',total_assets:'資產總值',total_liabilities:'負債總額',equity_parent:'本公司擁有人應佔權益',equity_total:'權益總額',
 cash:'現金及現金等價物',operating_cash_flow:'經營活動所得現金淨額',investing_cash_flow:'投資活動所用現金淨額',financing_cash_flow:'融資活動所用現金淨額',net_change_in_cash:'現金及現金等價物增加淨額'};
const TITLES={IS:'綜合損益表',BS:'綜合財務狀況表',CF:'綜合現金流量表'} as const;
const D25={period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M' as const};
const I25={period_start:null,period_end:'2025-12-31',duration:'INSTANT' as const};
/** A consistent FY2025 set: gross profit = revenue − cost; assets = liabilities + equity. */
export const FY25:readonly SeedFact[]=[
 {concept:'revenue',statement:'IS',...D25,value:'6256000'},
 {concept:'cost_of_revenue',statement:'IS',...D25,value:'2100000'},
 {concept:'gross_profit',statement:'IS',...D25,value:'4156000'},
 {concept:'total_assets',statement:'BS',...I25,value:'20000000'},
 {concept:'total_liabilities',statement:'BS',...I25,value:'8000000'},
 {concept:'equity_total',statement:'BS',...I25,value:'12000000'},
];
export const naturalKeyOf=(f:Pick<SeedFact,'concept'|'period_start'|'period_end'|'duration'|'unit'>)=>`${f.concept}:${f.period_start??''}:${f.period_end}:${f.duration}:${f.unit??'CNY'}`;
const labelOf=(f:SeedFact)=>f.label??LABELS[f.concept]??f.concept;
const presentedOf=(f:SeedFact)=>f.presented??(f.value.startsWith('-')?`(${f.value.slice(1)})`:f.value);

export interface Span{page_no:number;start:number;end:number}
export interface SeedLayout{pages:PagesJson;title:Map<string,Span>;header:Map<string,Span>;unit:Map<string,Span>;value:Map<string,Span>;label:Map<string,Span>;factUnit:Map<string,Span>}
/** One page per statement present (an empty fact list still yields one IS page): company, title, period, unit, year header, then one `label value` line per fact. Offsets are code points. */
export function buildSeedPages(facts:readonly SeedFact[],meta:{contentSha256:string;periodEnd:string;extractorVersion:string}):SeedLayout{
 const present=(['IS','BS','CF'] as const).filter(s=>facts.some(f=>f.statement===s));
 const statements=present.length>0?present:(['IS'] as const);
 const out:SeedLayout={pages:{extractor_version:meta.extractorVersion,table_algo_version:TABLE_ALGO_VERSION,code_version:CODE,content_sha256:meta.contentSha256,has_text_layer:true,pages:[]},
  title:new Map(),header:new Map(),unit:new Map(),value:new Map(),label:new Map(),factUnit:new Map()};
 const year=meta.periodEnd.slice(0,4);const prior=String(Number(year)-1);
 statements.forEach((s,i)=>{
  const page_no=i+1;
  const rows=facts.filter(f=>f.statement===s);
  const texts=['金蝶國際𠀋軟件集團有限公司',TITLES[s],s==='BS'?`於${year}年12月31日`:`截至${year}年12月31日止年度`,'單位：元 幣種：人民幣',`${year} ${prior}`,...rows.map(f=>`${labelOf(f)}${f.cents?'（仙）':''} ${presentedOf(f)}`)];
  const lines:LayoutLine[]=[];let pos=0;
  texts.forEach((text,index)=>{const n=cpLength(text);const y=800-index*20;lines.push({index,y,x0:50,x1:500,text,char_start:pos,char_end:pos+n,items:[{text,x0:50,x1:500,y,h:10,char_start:pos,char_end:pos+n}]});pos+=n+1;});
  const span=(li:number,from=0,to?:number):Span=>({page_no,start:lines[li].char_start+from,end:to===undefined?lines[li].char_end:lines[li].char_start+to});
  out.title.set(s,{page_no,start:lines[1].char_start,end:lines[2].char_end});   // title line + period phrase: one range (the period replay reads both)
  out.unit.set(s,span(3));out.header.set(s,span(4,0,cpLength(year)));
  rows.forEach((f,k)=>{
   const li=5+k;const n=cpLength(labelOf(f));const extra=f.cents?3:0;   // （仙）
   out.label.set(naturalKeyOf(f),span(li,0,n));out.value.set(naturalKeyOf(f),span(li,n+extra+1));
   if(f.cents)out.factUnit.set(naturalKeyOf(f),span(li,n+1,n+2));        // the 仙 token
  });
  out.pages.pages.push({page_no,width:595,height:842,text:texts.join('\n'),lines,tables:[]});
 });
 return out;
}

export type CiteAt=(at:{page_no:number;char_start:number;char_end:number;bbox?:{x0:number;y0:number;x1:number;y1:number}|null})=>Promise<string>;
/** value, label, unit and two period spans (statement title + column header) of one fact. */
export async function citeSeedFact(citeAt:CiteAt,layout:SeedLayout,f:SeedFact):Promise<FactCitations>{
 const at=(s:Span|undefined)=>{if(!s)throw new Error(`seed: no span for ${naturalKeyOf(f)}`);return citeAt({page_no:s.page_no,char_start:s.start,char_end:s.end});};
 const k=naturalKeyOf(f);
 return {value:await at(layout.value.get(k)),label:await at(layout.label.get(k)),unit:await at(layout.factUnit.get(k)??layout.unit.get(f.statement)),
  ...(f.cents?{unit_currency:await at(layout.unit.get(f.statement))}:{}),period:[{role:'statement_title',citation_id:await at(layout.title.get(f.statement))},{role:'column_header',citation_id:await at(layout.header.get(f.statement))}]};
}
export function snapshotOf(ex:Pick<SeededExtraction,'document'>,row:Pick<ExtractionRow,'pages_json_sha256'|'extractor_version'|'table_algo_version'|'code_version'>):InputSnapshot{
 return {content_sha256:ex.document.content_sha256,pages_json_sha256:row.pages_json_sha256,page_nos:[1,2,3],extractor_version:row.extractor_version,table_algo_version:row.table_algo_version,code_version:row.code_version,hk_label_gen:HK_LABEL_GEN,hk_rules_version:HK_RULES_VERSION};
}
export function seedCandidateInsert(f:SeedFact,citations:FactCitations,snapshot:InputSnapshot,titleDate:string,extractor:{kind:'rule'|'llm';ref:string}={kind:'rule',ref:HK_EXTRACTOR_REF}):CandidateInsert{
 const unit=f.unit??'CNY';
 const rule:FinancialFactPayload['period_derivation']['rule']=f.column==='comparative'?(f.duration==='INSTANT'?'column_date':'title_year_substitution'):(f.duration==='INSTANT'?'title_instant':'title_duration');
 const payload:FinancialFactPayload={concept:f.concept,statement:f.statement,period_start:f.period_start,period_end:f.period_end,duration:f.duration,value:f.value,presented:presentedOf(f),unit,scale:f.cents?'0.01':'1',sign_flip:false,
  period_derivation:{rule,title_date:titleDate,column_text:f.period_end.slice(0,4)},consolidation:'consolidated'};
 const natural_key=naturalKeyOf(f);
 return {kind:'financial_fact',extractor_kind:extractor.kind,extractor_ref:extractor.ref,natural_key,citations,payload,
  fingerprint:createHash('sha256').update(JSON.stringify({natural_key,payload,ref:extractor.ref})).digest('hex'),input_snapshot:snapshot};
}

export interface SeedDocOptions{issuerId?:string;sourceRef:string;availableAt?:string;docClass?:'annual_report'|'interim_report';periodEnd?:string;language?:'zh'|'en';facts:readonly SeedFact[];extractorVersion?:string;bytesTag?:string}
export interface SeededExtraction{document:DocumentRow;extractionId:string;layout:SeedLayout;facts:readonly SeedFact[]}

/** Stores the document (a new source_ref → v1; same source_ref + bytesTag → next version) and its first extraction (candidates pending). */
export async function seedHkExtraction(h:HkHarness,o:SeedDocOptions):Promise<SeededExtraction>{
 const issuer=o.issuerId??ISSUER;const periodEnd=o.periodEnd??'2025-12-31';const availableAt=o.availableAt??'2026-03-25T08:30:00.000Z';
 const batch=await h.batch();
 const bytes=new TextEncoder().encode(`%PDF-1.4\n% F3 seed ${o.sourceRef} ${o.bytesTag??''}\n%%EOF\n`);
 const sha=sha256Hex(bytes);
 await h.store.put(blobPath(sha,'application/pdf'),bytes,'application/pdf');
 await h.docs.reconcileScope('hkexnews',[{issuer_id:issuer,reasons:['test'],priority:10,fetch_key:'00268'}]);
 if(!await h.docs.claimSyncLease(issuer,'hkexnews',batch,600))throw new Error('seed: sync lease busy');
 const interim=o.docClass==='interim_report';
 const doc:DocumentInsert={issuer_id:issuer,source:'hkexnews',market:'HK',source_ref:o.sourceRef,form_type:interim?'財務報表 - [中期/半年度報告]':'財務報表 - [年報]',doc_class:o.docClass??'annual_report',classifier_gen:CLASSIFIER_GEN,
  title:interim?`截至${periodEnd.slice(0,4)}年6月30日止六個月之中期報告`:`截至${periodEnd.slice(0,4)}年12月31日止年度之年報`,language:o.language??'zh',
  source_url:`https://www1.hkexnews.hk/listedco/listconews/sehk/${availableAt.slice(0,4)}/${availableAt.slice(5,7)}${availableAt.slice(8,10)}/${o.sourceRef}.pdf`,
  content_sha256:sha,bytes:bytes.length,mime:'application/pdf',storage_path:blobPath(sha,'application/pdf'),
  acquisition:{fetched_at:availableAt,http_status:200,content_type:'application/pdf',user_agent:'test'},published_at:availableAt,published_at_precision:'instant',
  available_at:availableAt,available_date:availableAt.slice(0,10),fiscal_year:Number(periodEnd.slice(0,4)),fiscal_period:interim?'H1':'FY',period_end:periodEnd,filing_source_ref:null,
  permission:'public',owner_user_id:null,license_ref:null,batch_id:batch,code_version:CODE};
 const ins=await h.docs.insertDocumentVersion(issuer,'hkexnews',batch,doc,[]);
 await h.docs.releaseSyncLease(issuer,'hkexnews',batch,'success',h.now().toISOString());
 return seedExtraction(h,ins.document_id,o.facts,o.extractorVersion??EXTRACTOR_VERSION);
}
/** A new extraction of a stored document (status must be 'stored': a fresh document, or after requestExtract). */
export async function seedExtraction(h:HkHarness,documentId:string,facts:readonly SeedFact[],extractorVersion:string=EXTRACTOR_VERSION):Promise<SeededExtraction>{
 const batch=await h.batch();
 const before=await h.docs.documentById(documentId);if(!before)throw new Error('seed: no document');
 const layout=buildSeedPages(facts,{contentSha256:before.content_sha256,periodEnd:before.period_end??'2025-12-31',extractorVersion});
 const bytes=new TextEncoder().encode(JSON.stringify(layout.pages));const pagesSha=sha256Hex(bytes);
 const path=pagesJsonPath(before.content_sha256,pagesSha);
 await h.store.put(path,bytes,'application/json');
 if(!await h.docs.claimExtractLease(documentId,batch,600))throw new Error('seed: extract lease refused');
 const extractionId=await h.docs.finishExtract(documentId,batch,{extractor_version:extractorVersion,table_algo_version:TABLE_ALGO_VERSION,code_version:CODE,has_text_layer:true,page_count:layout.pages.pages.length,pages_json_path:path,pages_json_sha256:pagesSha},pageInsertsOf(layout.pages));
 return {document:(await h.docs.documentById(documentId))!,extractionId,layout,facts};
}
export async function allCandidatesOf(h:HkHarness,extractionId:string):Promise<CandidateRow[]>{
 const out:CandidateRow[]=[];let cursor:string|null=null;
 do{const p=await h.docs.candidatesOf({extractionId},{cursor,limit:1000});out.push(...p.rows);cursor=p.nextCursor;}while(cursor!==null);
 return out;
}
/** claim → cite + insert → checks (all passing unless `passed` says otherwise) → finish(done). Returns natural_key → candidate_id. */
export async function seedHkCandidates(h:HkHarness,ex:SeededExtraction,o:{passed?:(f:SeedFact)=>boolean;extractor?:{kind:'rule'|'llm';ref:string}}={}):Promise<Map<string,string>>{
 const batch=await h.batch();
 if(!await h.docs.claimCandidatesLease(ex.extractionId,batch,600))throw new Error('seed: candidates lease refused');
 const row=(await h.docs.extractionById(ex.extractionId))!;
 const citeAt:CiteAt=at=>cite(h.docs,{document_id:ex.document.document_id,extraction_id:ex.extractionId,page_no:at.page_no,char_start:at.char_start,char_end:at.char_end,bbox:at.bbox??null,created_by:'extractor',created_ref:o.extractor?.ref??HK_EXTRACTOR_REF});
 const rows:CandidateInsert[]=[];
 for(const f of ex.facts)rows.push(seedCandidateInsert(f,await citeSeedFact(citeAt,ex.layout,f),snapshotOf(ex,row),ex.document.period_end??f.period_end,o.extractor));
 await h.docs.insertCandidates(ex.extractionId,batch,rows);
 const all=await allCandidatesOf(h,ex.extractionId);
 const byKey=new Map(ex.facts.map(f=>[naturalKeyOf(f),f]));
 await h.docs.writeCandidateChecks(ex.extractionId,batch,all.filter(c=>c.status==='candidate').map(c=>{
  const f=byKey.get(c.natural_key);const passed=f!==undefined&&o.passed!==undefined?o.passed(f):true;
  return {candidate_id:c.candidate_id,checks:[{check:'seed',blocking:true,passed}],checks_passed:passed};
 }));
 await h.docs.finishCandidates(ex.extractionId,batch,'done');
 return new Map(all.map(c=>[c.natural_key,c.candidate_id]));
}
export async function confirm(h:HkHarness,ids:Iterable<string>,by:string=ADMIN):Promise<void>{
 for(const id of ids)await h.docs.decideCandidate(id,{kind:'human',decided_by:by,status:'confirmed'});
}
