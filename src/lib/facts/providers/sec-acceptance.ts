// src/lib/facts/providers/sec-acceptance.ts
// SEC acceptance times (plan 3 spec §4.5; step 9b of the US facts sync; E7). One submissions
// snapshot (sec-submissions.ts: `parsed.filings` = filings.recent plus any fetched files[] pages; the
// main document's raw bytes are in the reconcile-raw bucket under main.sha256, each page's under its own
// sha256) is indexed by accessionNumber. The snapshot is fetched with coverFrom = the earliest pending
// available_date − 7 days (plan audit R3), so every files[] page that can hold a pending filing is fetched:
// a filing listed only in a historical page is written, never left acceptance_not_found. Every edgar
// filing of the issuer whose accepted_at is null:
//  - in the snapshot with an acceptance time and filingDate = available_date →
//    set_filing_acceptance(filing, acceptanceDateTime, 'sec_submissions'): true → inserted,
//    false (same value already) → duplicates, acceptance_conflict → failed + one error per filing;
//  - filingDate ≠ available_date → a sec.filing_date_vs_submissions result (kind 'date', failed,
//    both dates as text) handed to the injected recordDateMismatch (record.ts, wired by plan-3
//    Part D) or returned unrecorded — and NO acceptance write (the filing's identity is in doubt);
//  - absent, ambiguous (conflicting copies), or without a parseable acceptance time → never a guessed time.
// Mismatches, ambiguous and not-found filings are DATA properties: they are counted under the informational
// skipped_summary (acceptance_mismatch / acceptance_ambiguous / acceptance_not_found), never in `failed`.
// Pending filings older than ACCEPTANCE_LOOKBACK_DAYS are left out of the pass and of coverFrom
// (acceptance_out_of_window) unless opts.fullHistory. Only real failures (acceptance_conflict, write
// errors, sec_unavailable) count as failed.
// fetched counts the filings for which a write was attempted. A submissions failure → sec_unavailable.
import {emptyCounts} from '../../dq/batches';
import type {BatchCounts,BatchError} from '../../dq/batches';
import type {ReconcileResultInput} from '../../dq/reconcile/types';
import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
import {FactsDbError} from '../types';
import type {Budget,FactsDb,FilingRow} from '../types';

/** Pending filings older than this (days before today) are not looked up unless fullHistory. */
export const ACCEPTANCE_LOOKBACK_DAYS=3*365;
export const ACCEPTANCE_SOURCE='sec_submissions' as const;
export const DATE_MISMATCH_PAIR='sec.filing_date_vs_submissions' as const;
/** page = the SubmissionFiling page ('recent' = the main document, else the files[] page name), kept per entry for mismatch evidence. */
export interface AcceptanceEntry{accessionNumber:string;filingDate:string;form:string;acceptedAt:string|null;page:string}
/** Margin before the earliest pending available_date: a mismatching filingDate may precede it. */
export const ACCEPTANCE_COVER_MARGIN_DAYS=7;
export interface AcceptanceDeps{
 db:Pick<FactsDb,'filingsOfIssuer'|'setFilingAcceptance'>;
 /** coverFrom ('YYYY-MM-DD') is passed to fetchSubmissions: every files[] page with filingTo >= coverFrom is fetched (plan audit R3). */
 submissions:(cik10:string,b:Budget,coverFrom:string)=>Promise<SubmissionsSnapshot>;
 /** records one sec.filing_date_vs_submissions result (record.ts, plan-3 Part D); absent → returned in `mismatches` only */
 recordDateMismatch?:(r:ReconcileResultInput)=>Promise<void>;
 /** clock for the lookback window (default: real time) */
 now?:()=>Date;
}
export interface AcceptanceOptions{/** lift the ACCEPTANCE_LOOKBACK_DAYS bound (script --full-history) */fullHistory?:boolean}
export interface AcceptanceOutcome{issuerId:string;counts:BatchCounts;errors:BatchError[];mismatches:ReconcileResultInput[];snapshotSha256:string|null}

const SEC_TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** SEC acceptanceDateTime ('2024-11-01T06:01:36.000Z', UTC) → ISO; anything else (incl. rolled-over dates) → null. */
export function parseAcceptanceDateTime(v:unknown):string|null{
 if(typeof v!=='string'||!SEC_TS.test(v))return null;
 const ms=Date.parse(v);if(!Number.isFinite(ms))return null;
 const iso=new Date(ms).toISOString();
 return iso.slice(0,19)===v.slice(0,19)?iso:null;
}
/** accessionNumber → entry. An accession listed twice with different filing dates or acceptance times is ambiguous and left out. */
export function acceptanceIndex(entries:readonly SubmissionFiling[]):{index:Map<string,AcceptanceEntry>;ambiguous:string[]}{
 const index=new Map<string,AcceptanceEntry>();const bad=new Set<string>();
 for(const e of entries){
  const x:AcceptanceEntry={accessionNumber:e.accessionNumber,filingDate:e.filingDate,form:e.form,acceptedAt:parseAcceptanceDateTime(e.acceptanceDateTime),page:e.page};
  const seen=index.get(x.accessionNumber);
  if(seen&&(seen.filingDate!==x.filingDate||seen.acceptedAt!==x.acceptedAt))bad.add(x.accessionNumber);
  else if(!seen)index.set(x.accessionNumber,x);
 }
 for(const a of bad)index.delete(a);
 return {index,ambiguous:[...bad].sort()};
}
/** earliest pending available_date − ACCEPTANCE_COVER_MARGIN_DAYS, as YYYY-MM-DD. */
export function acceptanceCoverFrom(pending:readonly Pick<FilingRow,'available_date'>[]):string{
 const min=pending.map(f=>f.available_date).sort()[0];
 const d=new Date(`${min}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-ACCEPTANCE_COVER_MARGIN_DAYS);
 return d.toISOString().slice(0,10);
}
/** sha256 of the document an entry came from: the main document for 'recent', else that files[] page (null if not fetched). */
export const pageSha256=(snap:SubmissionsSnapshot,page:string):string|null=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
/** The sec.filing_date_vs_submissions result of one filing (natural key <cik>:<accession>, dates compared as text); the right side cites the entry's own page and hash. */
export function filingDateMismatch(cik:string,f:FilingRow,e:AcceptanceEntry,pageSha:string|null):ReconcileResultInput{
 return {natural_key:`${cik}:${f.source_ref}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
  left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
  detail:{left_text:f.available_date,right_text:e.filingDate,left:{filing_id:f.filing_id,source_ref:f.source_ref},right:e.page==='recent'
   ?{document:'submissions',sha256:pageSha,locator:`filings.recent[accessionNumber=${e.accessionNumber}]`}
   :{document:e.page,sha256:pageSha,locator:`${e.page}[accessionNumber=${e.accessionNumber}]`}}};
}

export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget,opts:AcceptanceOptions={}):Promise<AcceptanceOutcome>{
 const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
 const all=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
 const cutoff=new Date((deps.now?.()??new Date()).getTime()-ACCEPTANCE_LOOKBACK_DAYS*86_400_000).toISOString().slice(0,10);
 const pending=opts.fullHistory?all:all.filter(f=>f.available_date>=cutoff);
 const outOfWindow=all.length-pending.length;
 const outSummary=()=>{if(outOfWindow>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({acceptance_out_of_window:outOfWindow})});return out;};
 if(pending.length===0)return outSummary();
 let snap:SubmissionsSnapshot;
 try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
 catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
 out.snapshotSha256=snap.main.sha256;
 const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
 const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
 const amb=new Set(ambiguous);
 let notFound=0,unrecorded=0,ambiguousHit=0,mismatch=0;
 for(let i=0;i<pending.length;i++){
  const f=pending[i];
  if(budget.signal.aborted||budget.remainingMs()<=0){
   out.errors.push({code:'deadline_hit',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({remaining:pending.length-i})});break;
  }
  if(amb.has(f.source_ref)){ambiguousHit++;continue;}   // conflicting copies: never guess
  const e=index.get(f.source_ref);
  if(!e){notFound++;continue;}
  if(e.filingDate!==f.available_date){
   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);mismatch++;
   if(deps.recordDateMismatch){
    try{await deps.recordDateMismatch(r);}
    catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
   }else unrecorded++;
   continue;
  }
  if(e.acceptedAt===null){notFound++;continue;}
  out.counts.fetched++;
  try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
  catch(err){
   if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
   out.counts.failed++;out.errors.push({code:'acceptance_conflict',key:f.source_ref});
  }
 }
 const summary:Record<string,number>={};
 if(notFound>0)summary.acceptance_not_found=notFound;
 if(ambiguousHit>0)summary.acceptance_ambiguous=ambiguousHit;
 if(mismatch>0)summary.acceptance_mismatch=mismatch;
 if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
 if(outOfWindow>0)summary.acceptance_out_of_window=outOfWindow;
 if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
 return out;
}
