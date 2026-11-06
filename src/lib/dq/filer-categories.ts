// src/lib/dq/filer-categories.ts
// Per-fiscal-year filer categories from 10-K covers (spec §6.1 申报人类别, §3.1 issuer_filer_categories).
// For each in-scope US issuer: SEC submissions → its latest 3 original 10-Ks → each primary document
// (raw bytes into bucket reconcile-raw, sha256 = evidence_sha256) → the §5.2 inline-XBRL parser →
// dei:EntityFilerCategory → acceleration. Only-SRC / unparseable covers write no row (no usable
// category; the calendar then has no rule for that fiscal year). The latest 10-K's cover is also
// compared with submissions `category` as pair sec.filer_category (record.ts, kind text, record only).
// fiscal_year = calendar year of the month end nearest the 10-K's period end (calendar.ts
// fiscalYearOfPeriodEnd), the same label the calendar uses for its N−1 lookup.
import {PacerError,secPacer,sleep} from '../facts/providers/shared';
import type {Budget,FactsDb} from '../facts/types';
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from './batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from './batches';
import {recordAttempt} from './freshness';
import {DATASETS,DQ_DATASET_INVENTORY} from './datasets';
import type {RawStore} from './raw-store';
import {CALENDAR_RULES_VERSION,fiscalYearOfPeriodEnd} from './calendar';
import type {Acceleration,FilerCategoryRow} from './calendar';
import {IXBRL_PARSER_VERSION,parseInlineXbrl} from './reconcile/ixbrl';
import {recordReconciliation} from './reconcile/record';
import {primaryDocumentUrl} from '../research/ingest/collectors/edgar';
import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
import type {SubmissionsSnapshot} from '../entities/identifiers/sec-submissions';

/** The submissions fields the calendar and this module read. Built only by submissionsView (one adaptation point to Task 6's snapshot). */
export interface SubmissionsEntryView{accessionNumber:string;filingDate:string;reportDate:string|null;form:string;primaryDocument:string;isInlineXBRL:boolean}
export interface SubmissionsView{cik10:string;sha256:string;category:string|null;fiscalYearEnd:string|null;entries:SubmissionsEntryView[]}
// Task 6a shape (Part B): SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:ParsedSubmissions, complete};
// parsed.filings already merges recent with the fetched files[] pages; primaryDocument / isInlineXBRL may be null.
export function submissionsView(s:SubmissionsSnapshot):SubmissionsView{
 return {cik10:s.cik.padStart(10,'0'),sha256:s.main.sha256,category:s.parsed.category,fiscalYearEnd:s.parsed.fiscalYearEnd,
  entries:s.parsed.filings.map(e=>({accessionNumber:e.accessionNumber,filingDate:e.filingDate,reportDate:e.reportDate||null,form:e.form,primaryDocument:e.primaryDocument??'',isInlineXBRL:e.isInlineXBRL===true}))};
}

/**
 * Cover text → category. The non-accelerated test runs first because "Non-accelerated Filer" also
 * contains "accelerated filer" (spec §6.1 lists large → accelerated → non; same outcomes). Smaller
 * reporting status is only ever `true` (the words appear) or null (unknown) — never inferred false.
 */
export function parseFilerCategory(raw:string):{acceleration:Acceleration;smaller_reporting:boolean|null}|null{
 const t=raw.replace(/\s+/g,' ').trim().toLowerCase();
 const src=t.includes('smaller reporting')?true:null;
 if(/non-?\s?accelerated/.test(t))return {acceleration:'non_accelerated',smaller_reporting:src};
 if(t.includes('large accelerated'))return {acceleration:'large_accelerated',smaller_reporting:src};
 if(t.includes('accelerated filer'))return {acceleration:'accelerated',smaller_reporting:src};
 return null;
}
const norm=(s:string)=>s.replace(/\s+/g,' ').trim().toLowerCase();
/** Latest n original 10-Ks by filing date (amendments never: a 10-K/A cover restates, it does not determine status). */
export const latestTenKs=(v:SubmissionsView,n=3)=>v.entries.filter(e=>e.form==='10-K'&&e.primaryDocument!=='').sort((a,b)=>b.filingDate.localeCompare(a.filingDate)||b.accessionNumber.localeCompare(a.accessionNumber)).slice(0,n);
const ISO=/^\d{4}-\d{2}-\d{2}$/;
/** dei values by local name; Task 13's parser keys nonNumeric by the canonical 'dei:<Local>' QName. */
export function coverOf(doc:string):{category:string|null;periodEnd:string|null}{
 const nn=parseInlineXbrl(doc).nonNumeric;
 const cat=nn['dei:EntityFilerCategory'];const pe=nn['dei:DocumentPeriodEndDate'];
 return {category:cat!==undefined&&cat.trim()!==''?cat.trim():null,periodEnd:pe!==undefined&&ISO.test(pe.trim())?pe.trim():null};
}

export const MAX_DOCUMENT_BYTES=50*1024*1024;
const RESERVE_MS=20_000;
// Shares THE process-wide SEC pacer (submissions, companyfacts, documents): the fair-access limit is per source address.
const pacer=secPacer;
export const resetDocumentPacing=()=>pacer.reset();
export class FilerCategoryError extends Error{constructor(public readonly code:'document_unavailable'|'document_too_large',message?:string){super(message??code);this.name='FilerCategoryError';}}
export interface DocumentFetchOptions{fetch?:typeof fetch;userAgent?:string;sleep?:typeof sleep;now?:()=>number}
/** One SEC archive document (UA, 120 ms pacing, 60 s timeout, 50 MB cap). Thrown messages carry status codes only. */
export async function fetchSecDocument(url:string,budget:Budget,opts:DocumentFetchOptions={}):Promise<Uint8Array>{
 try{await pacer.admit({budget,reserveMs:RESERVE_MS,now:opts.now,sleep:opts.sleep});}catch(e){throw new FilerCategoryError('document_unavailable',e instanceof PacerError?e.code:'budget_aborted');}
 const timeoutMs=Math.min(60_000,budget.remainingMs()-RESERVE_MS);
 if(timeoutMs<=0)throw new FilerCategoryError('document_unavailable','budget_exhausted');
 let res:Response;
 try{res=await (opts.fetch??fetch)(url,{headers:{'User-Agent':opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'text/html'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)])});}
 catch{throw new FilerCategoryError('document_unavailable','network');}
 if(!res.ok)throw new FilerCategoryError('document_unavailable',`http_${res.status}`);
 if(Number(res.headers.get('content-length')??'0')>MAX_DOCUMENT_BYTES)throw new FilerCategoryError('document_too_large');
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes.byteLength>MAX_DOCUMENT_BYTES)throw new FilerCategoryError('document_too_large');
 return bytes;
}

export interface FilerCategoryDeps{
 tables:TableClient;db:Pick<FactsDb,'scopeAll'>;raw:RawStore;
 submissions:(cik10:string,b:Budget)=>Promise<SubmissionsView>;
 fetchDocument:(url:string,b:Budget)=>Promise<Uint8Array>;
 now:()=>Date;budget:Budget;codeVersion:string|null;
}
export interface FilerCategoryOptions{issuerIds?:string[];limit:number;dryRun:boolean;triggeredBy:TriggeredBy}
export interface FilerCategoryReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];rows:FilerCategoryRow[];reconciliations:{natural_key:string;passed:boolean}[]}
/** Stop starting issuers when less than this remains (one submissions + three documents). */
export const MIN_ISSUER_MS=30_000;

export async function syncFilerCategories(deps:FilerCategoryDeps,opts:FilerCategoryOptions):Promise<FilerCategoryReceipt>{
 const today=deps.now().toISOString().slice(0,10);
 const scope=(await deps.db.scopeAll('US')).filter(r=>opts.issuerIds?opts.issuerIds.includes(r.issuer_id):r.priority>0);
 const members=scope.sort((a,b)=>a.issuer_id.localeCompare(b.issuer_id)).slice(0,opts.issuerIds?undefined:opts.limit);
 const counts=emptyCounts();const errors:BatchError[]=[];const rows:FilerCategoryRow[]=[];const recs:FilerCategoryReceipt['reconciliations']=[];
 const skipped:Record<string,number>={};const skip=(r:string)=>{skipped[r]=(skipped[r]??0)+1;};
 const batchId=opts.dryRun?null:(await startBatch(deps.tables,{producer:'filer-categories',dataset:DATASETS.filerCategories,toolVersions:{parser:IXBRL_PARSER_VERSION,rules:CALENDAR_RULES_VERSION},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy})).batchId;
 for(const m of members){
  if(deps.budget.remainingMs()<MIN_ISSUER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:members.length-members.indexOf(m)})});break;}
  let view:SubmissionsView;
  try{view=await deps.submissions(m.fetch_key,deps.budget);}
  catch(e){counts.fetched++;counts.failed++;errors.push({code:'sec_unavailable',key:m.issuer_id,message:(e as Error).message.slice(0,200)});continue;}
  const seen=new Set<number>();
  for(const [i,e] of latestTenKs(view).entries()){
   if(!e.isInlineXBRL){skip('not_inline_xbrl');continue;}
   const fail=(code:string)=>{counts.fetched++;counts.failed++;errors.push({code,key:`${m.issuer_id}:${e.accessionNumber}`});};
   let bytes:Uint8Array,sha256:string;
   try{bytes=await deps.fetchDocument(primaryDocumentUrl(view.cik10,e.accessionNumber,e.primaryDocument),deps.budget);}
   catch(err){fail(err instanceof FilerCategoryError?err.code:'document_unavailable');continue;}
   try{sha256=(await deps.raw.put({kind:'sec-document',bytes,contentType:'text/html',meta:{cik:view.cik10,accession:e.accessionNumber,document:e.primaryDocument}},deps.budget)).sha256;}
   catch{fail('raw_upload_failed');continue;}   // no evidence in the bucket → no row depends on it (spec §3.1 bucket rule)
   const cover=coverOf(new TextDecoder().decode(bytes));
   if(i===0&&view.category!==null&&cover.category!==null){
    const passed=norm(view.category)===norm(cover.category);
    recs.push({natural_key:`${view.cik10}:${e.accessionNumber}`,passed});
    if(batchId)await recordReconciliation(deps.tables,{pair:'sec.filer_category',batch_id:batchId,natural_key:`${view.cik10}:${e.accessionNumber}`,kind:'text',outcome:'compared',passed,
     left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec_submissions.category',right_source:'ixbrl_dei.EntityFilerCategory',
     detail:{left_text:view.category,right_text:cover.category,left:{sha256:view.sha256},right:{document:e.primaryDocument,sha256}},action:'record'});
   }
   const parsed=cover.category===null?null:parseFilerCategory(cover.category);
   if(!parsed){skip(cover.category===null?'no_category':'category_unusable');continue;}
   const periodEnd=e.reportDate&&ISO.test(e.reportDate)?e.reportDate:cover.periodEnd;
   if(!periodEnd){skip('no_period_end');continue;}
   const fiscalYear=fiscalYearOfPeriodEnd(periodEnd);
   if(seen.has(fiscalYear)){skip('fiscal_year_duplicate');continue;}   // a newer 10-K already covers this fiscal year
   seen.add(fiscalYear);
   const row:FilerCategoryRow={issuer_id:m.issuer_id,fiscal_year:fiscalYear,acceleration:parsed.acceleration,smaller_reporting:parsed.smaller_reporting,category_raw:cover.category!,source:'ixbrl_dei',accession:e.accessionNumber,evidence_sha256:sha256,as_of:today};
   rows.push(row);
   if(batchId)await deps.tables.upsert('issuer_filer_categories',{...row},'issuer_id,fiscal_year');
   counts.fetched++;counts.inserted++;
  }
 }
 if(Object.keys(skipped).length)errors.push({code:'skipped_summary',key:'filer-categories',message:JSON.stringify(skipped)});
 if(!batchId)return {batchId:null,status:'dry_run',counts,errors,rows,reconciliations:recs};
 const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
 const cadence=DQ_DATASET_INVENTORY.find(d=>d.dataset===DATASETS.filerCategories)!.cadence;
 await recordAttempt(deps.tables,DATASETS.filerCategories,{ok:status==='success',cadence,now:deps.now(),detail:{batch_id:batchId,rows:rows.length,issuers:members.length}});
 return {batchId,status,counts,errors,rows,reconciliations:recs};
}
