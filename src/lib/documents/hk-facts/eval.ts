// src/lib/documents/hk-facts/eval.ts
// HK gold-set scoring and offline candidate pipeline (spec §11.4, §11.3 真实字节验证).
// scoreHkFacts: precision = checks-passed candidates equal to their gold entry / checks-passed
// candidates that have a gold entry for the same (document_sha256, natural_key) — a gold 'missing'
// entry with a candidate counts in the denominator as a mismatch; recall = valued gold entries
// covered by an equal checks-passed candidate / valued gold entries. Pending gold entries and
// candidates without a gold entry (unscored) do not count. Ratios are integer arithmetic, floored
// to four decimals, canonical decimal strings (the approvals route compares them exactly).
// offlineHkCandidates runs generateHkCandidates + runHkChecks on a PagesJson without any database:
// citations are code-point slices of the page text kept in memory (integrity ok, current; line positions
// from the layout lines), prior facts and English candidates are empty — eval-hk-facts.ts --source fixtures and
// validate-extraction.ts use it. loadRecordedFixture reads record-fixture.ts output.
import {randomUUID} from 'node:crypto';
import type {BatchError} from '../../dq/batches';
import {canonicalDecimal} from '../../facts/json-numbers';
import {cpSlice} from '../extract/pages-json';
import {CLASSIFIER_GEN} from '../types';
import type {CandidateRow,DocumentRow,ExtractionRow,FinancialFactPayload,PagesJson} from '../types';
import {HK_CONCEPT_IDS,runHkChecks} from './checks';
import type {CheckRowResult,CitationCheck} from './checks';
import {generateHkCandidates} from './generate';

export const PENDING='<pending>';
export interface HkGoldEntry{issuer:{ticker:string};concept:string;period_start:string|null;period_end:string;duration:'6M'|'12M'|'INSTANT';unit:string;value:string;
 source:{document_sha256:string;page:number|string;line_text:string};recorded_by:string;recorded_at:string|null}
export interface HkGoldFile{version:number;note?:string;ready:boolean;required:{HK:boolean};issuers:{ticker:string;documents?:{source_ref:string;document_sha256:string;period_end:string}[]}[];entries:HkGoldEntry[]}
export const isPendingGold=(e:HkGoldEntry)=>e.recorded_by===PENDING||e.value===PENDING||e.source.document_sha256===PENDING;
export const goldNaturalKey=(e:Pick<HkGoldEntry,'concept'|'period_start'|'period_end'|'duration'|'unit'>)=>`${e.concept}:${e.period_start??''}:${e.period_end}:${e.duration}:${e.unit}`;
/** Provenance a human must have written down; returns the missing fields. */
export const goldProvenanceGaps=(e:HkGoldEntry):string[]=>[
 ...(/^[0-9a-f]{64}$/.test(e.source.document_sha256)?[]:['source.document_sha256']),
 ...(e.source.page===PENDING||e.source.page===''?['source.page']:[]),
 ...(typeof e.source.line_text!=='string'||e.source.line_text===PENDING||e.source.line_text.trim()===''?['source.line_text']:[]),
 ...(e.recorded_at===null||e.recorded_at===PENDING||e.recorded_at.trim()===''?['recorded_at']:[]),
];

export interface ScoredCandidate{document_sha256:string;natural_key:string;value:string;checks_passed:boolean}
export interface HkEvalVersions{extractor_ref:string;extractor_version:string;table_algo_version:string;code_version:string}
export interface HkEvalMismatch{document_sha256:string;natural_key:string;gold:string;candidate:string|null;kind:'value_mismatch'|'missing_but_extracted'|'not_extracted'}
export interface HkEvalReport extends HkEvalVersions{gold_sha256:string;concepts:string[];precision:string;recall:string;
 counts:{considered:number;matched:number;gold_values:number;covered:number;unscored:number};mismatches:HkEvalMismatch[]}

/** n/d floored to 4 decimals as a canonical decimal string; 0 when d = 0. n, d are counts. */
export function ratio(n:number,d:number):string{
 if(d===0)return '0';
 const s=(BigInt(n)*10000n/BigInt(d)).toString().padStart(5,'0');
 return canonicalDecimal(`${s.slice(0,s.length-4)}.${s.slice(s.length-4)}`);
}
const same=(a:string,b:string)=>{try{return canonicalDecimal(a)===canonicalDecimal(b);}catch{return false;}};

export function scoreHkFacts(gold:HkGoldFile,goldSha256:string,candidates:ScoredCandidate[],versions:HkEvalVersions):HkEvalReport{
 const entries=gold.entries.filter(e=>!isPendingGold(e));
 const key=(sha:string,nk:string)=>`${sha}|${nk}`;
 const goldByKey=new Map(entries.map(e=>[key(e.source.document_sha256,goldNaturalKey(e)),e]));
 const passed=candidates.filter(c=>c.checks_passed);
 const candByKey=new Map(passed.map(c=>[key(c.document_sha256,c.natural_key),c]));
 const mismatches:HkEvalMismatch[]=[];let considered=0,matched=0,unscored=0;
 for(const c of passed){
  const g=goldByKey.get(key(c.document_sha256,c.natural_key));
  if(!g){unscored++;continue;}
  considered++;
  if(g.value==='missing'){mismatches.push({document_sha256:c.document_sha256,natural_key:c.natural_key,gold:'missing',candidate:c.value,kind:'missing_but_extracted'});continue;}
  if(same(g.value,c.value))matched++;
  else mismatches.push({document_sha256:c.document_sha256,natural_key:c.natural_key,gold:g.value,candidate:c.value,kind:'value_mismatch'});
 }
 const valued=entries.filter(e=>e.value!=='missing');
 let covered=0;
 for(const e of valued){
  const c=candByKey.get(key(e.source.document_sha256,goldNaturalKey(e)));
  if(c&&same(c.value,e.value))covered++;
  else if(!c)mismatches.push({document_sha256:e.source.document_sha256,natural_key:goldNaturalKey(e),gold:e.value,candidate:null,kind:'not_extracted'});
 }
 mismatches.sort((a,b)=>a.document_sha256<b.document_sha256?-1:a.document_sha256>b.document_sha256?1:a.natural_key<b.natural_key?-1:a.natural_key>b.natural_key?1:a.kind<b.kind?-1:1);
 const concepts=[...new Set(entries.map(e=>e.concept).filter(c=>HK_CONCEPT_IDS.includes(c)))].sort();
 return {...versions,gold_sha256:goldSha256,concepts,precision:ratio(matched,considered),recall:ratio(covered,valued.length),
  counts:{considered,matched,gold_values:valued.length,covered,unscored},mismatches};
}

export interface RecordedHeader{doc_class?:'annual_report'|'interim_report';language?:'zh'|'en';period_end?:string|null;recorded_at:string;source_url:string;content_sha256:string;bytes:number;page_count:number;extractor_version:string;table_algo_version:string;pages_subset?:boolean}
/** record-fixture.ts output: {header, pages_json} or the header fields flat next to the PagesJson fields (the shape
 * record-fixture.ts writes). A --pages subset (pages_subset: true) is expanded to page_count pages, the pages not
 * recorded being empty (text ''), so it can stand in for a whole extraction (finish_document_extract wants pages
 * 1..page_count); recordedPageNos lists the pages that carry recorded text. */
export function loadRecordedFixture(raw:unknown):{header:RecordedHeader;pages:PagesJson;recordedPageNos:number[]}{
 const r=(raw??{}) as Record<string,unknown>;
 const header=(r.header&&typeof r.header==='object'?r.header:r) as RecordedHeader;
 const pages=(r.pages_json&&typeof r.pages_json==='object'?r.pages_json:r) as PagesJson;
 if(!Array.isArray(pages.pages)||typeof header.content_sha256!=='string'||!/^[0-9a-f]{64}$/.test(header.content_sha256))throw new Error('recorded_fixture_shape');
 const recordedPageNos=pages.pages.map(p=>p.page_no);
 if(header.pages_subset!==true)return {header,pages,recordedPageNos};
 if(!Number.isInteger(header.page_count)||recordedPageNos.some((n,i)=>!Number.isInteger(n)||n<1||n>header.page_count||(i>0&&n<=recordedPageNos[i-1])))throw new Error('recorded_fixture_shape');
 const by=new Map(pages.pages.map(p=>[p.page_no,p]));
 const full=Array.from({length:header.page_count},(_,i)=>by.get(i+1)??{page_no:i+1,width:null,height:null,text:'',lines:[],tables:[]});
 return {header,pages:{...pages,pages:full},recordedPageNos};
}

/** Layout line holding a code-point offset (the line the checks' co-location rule compares); null when the page has no lines. */
function lineAt(pages:PagesJson,page_no:number,offset:number):number|null{
 const page=pages.pages.find(p=>p.page_no===page_no);
 if(!page||page.lines.length===0)return null;
 const hit=page.lines.find(l=>l.char_start<=offset&&offset<l.char_end);
 if(hit)return hit.index;
 const before=[...page.lines].filter(l=>l.char_start<=offset).sort((a,b)=>b.char_start-a.char_start)[0];
 return before?before.index:null;
}
export interface OfflineDoc{content_sha256:string;source_ref:string;doc_class?:'annual_report'|'interim_report';language?:'zh'|'en';period_end?:string|null}
/** Never silently reinterpret an unclassified recording as an annual report. */
export function recordedOfflineDoc(header:Pick<RecordedHeader,'content_sha256'|'doc_class'|'language'|'period_end'>,source_ref:string):OfflineDoc{
 if(header.doc_class!=='annual_report'&&header.doc_class!=='interim_report')throw new Error('recorded_fixture_doc_class_required');
 return {content_sha256:header.content_sha256,source_ref,doc_class:header.doc_class,language:header.language,period_end:header.period_end};
}
/** generate + check without a database (citations live in memory; prior facts and English candidates are empty). */
export async function offlineHkCandidates(pages:PagesJson,doc:OfflineDoc):Promise<{candidates:CandidateRow[];results:CheckRowResult[];info:BatchError[]}>{
 const now=new Date().toISOString();const documentId=randomUUID();const extractionId=randomUUID();const language=doc.language??'zh';
 const document:DocumentRow={document_id:documentId,issuer_id:null,source:'hkexnews',market:'HK',source_ref:doc.source_ref,source_version:1,supersedes_document_id:null,observed_replacement:false,form_type:null,
  doc_class:doc.doc_class??'annual_report',classifier_gen:CLASSIFIER_GEN,title:doc.source_ref,language,source_url:null,content_sha256:doc.content_sha256,bytes:1,mime:'application/pdf',storage_path:'',acquisition:{},
  published_at:now,published_at_precision:'instant',available_at:now,available_date:now.slice(0,10),fiscal_year:null,fiscal_period:null,period_end:doc.period_end??null,filing_source_ref:null,
  permission:'public',owner_user_id:null,license_ref:null,status:'extracted',current_extraction_id:extractionId,extract_lease_until:null,extract_lease_batch_id:null,extract_attempts:1,batch_id:'offline',code_version:pages.code_version,created_at:now};
 const extraction:ExtractionRow={extraction_id:extractionId,document_id:documentId,extractor_version:pages.extractor_version,table_algo_version:pages.table_algo_version,code_version:pages.code_version,
  has_text_layer:pages.has_text_layer,page_count:pages.pages.length,pages_json_path:'',pages_json_sha256:'',candidates_role:language==='zh'?'primary':'comparison',candidates_status:'pending',
  candidates_attempts:1,candidates_lease_until:null,candidates_lease_batch_id:null,batch_id:'offline',created_at:now};
 const snippets=new Map<string,{page_no:number;char_start:number;char_end:number;snippet:string}>();
 const gen=await generateHkCandidates(pages,{document,extraction,cite:async at=>{
  const page=pages.pages.find(p=>p.page_no===at.page_no);
  const snippet=page?cpSlice(page.text,at.char_start,at.char_end):'';
  if(snippet.length===0)throw new Error('invalid_citation');
  const id=randomUUID();snippets.set(id,{page_no:at.page_no,char_start:at.char_start,char_end:at.char_end,snippet});return id;
 }});
 const candidates:CandidateRow[]=gen.candidates.map(c=>({...c,candidate_id:randomUUID(),document_id:documentId,extraction_id:extractionId,checks:[],checks_passed:false,status:'candidate',
  decision_kind:null,decided_by:null,approval_id:null,decided_at:null,inherited_from:null,batch_id:'offline',created_at:now}));
 const verify=new Map<string,CitationCheck|null>([...snippets].map(([id,c])=>[id,{integrity:'ok' as const,currentExtraction:true,snippet:c.snippet,page_no:c.page_no,
  line_start:lineAt(pages,c.page_no,c.char_start),line_end:lineAt(pages,c.page_no,c.char_end-1)}]));
 return {candidates,results:runHkChecks(candidates,{verify,priorFacts:[],enCandidates:[],annual:document.doc_class==='annual_report'}),info:gen.info};
}
/** Candidates + their check results → scoring rows of one document. */
export function scoredRows(sha:string,candidates:CandidateRow[],results:{candidate_id:string;checks_passed:boolean}[]):ScoredCandidate[]{
 const ok=new Map(results.map(r=>[r.candidate_id,r.checks_passed]));
 return candidates.filter(c=>c.kind==='financial_fact').map(c=>({document_sha256:sha,natural_key:c.natural_key,value:(c.payload as FinancialFactPayload).value,checks_passed:ok.get(c.candidate_id)??c.checks_passed}));
}
