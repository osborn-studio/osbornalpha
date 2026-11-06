// src/lib/entities/identifiers/sec-submissions.ts
// SEC submissions (spec §4.3.3; reused by acceptance times §4.5 and the filing calendar §6.1).
// One fetch per CIK serves several consumers. submissionsClient paces requests (declared
// User-Agent; at least SEC_MIN_INTERVAL_MS apart within one client), stores the exact bytes of the
// main document and of each fetched filings.files[] page in reconcile-raw, and returns the parsed,
// merged snapshot. Parsers are pure and strict about the columnar `filings.recent` shape (every
// column has one entry per accession). 8-A12B/8-A12G/25/25-NSE become evidence_only claims that
// never prefill a security or an effective date (the reviewer reads the filing, spec §4.2.1).
import type {Budget} from '../../facts/types';
import type {Pacer} from '../../facts/providers/shared';
import {PacerError,SEC_MIN_INTERVAL_MS as SHARED_INTERVAL,secPacer} from '../../facts/providers/shared';
import type {RawStore} from '../../dq/raw-store';
import {normalizeCik} from '../../research/entity-keys/identifiers';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import type {ClaimInput} from '../claims';
import type {ClaimEvidence} from '../types';

export const SEC_SUBMISSIONS_BASE='https://data.sec.gov/submissions/';
export const SEC_MIN_INTERVAL_MS=SHARED_INTERVAL;
export const SUBMISSIONS_PARSER_VERSION='sec-submissions/1';
const PAGE_NAME=/^CIK\d{10}-submissions-\d{3}\.json$/;
export const submissionsUrl=(cik:string)=>`${SEC_SUBMISSIONS_BASE}CIK${normalizeCik(cik).padStart(10,'0')}.json`;

export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string}
export interface SubmissionsPageRef{name:string;filingCount:number|null;filingFrom:string|null;filingTo:string|null}
export interface FormerName{name:string;from:string|null;to:string|null}
export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];/** index of each tickers[] entry in the raw document (blank entries are dropped, positions kept) */tickerPositions:number[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
export interface StoredDoc{name:string;sha256:string;path:string}
export interface SubmissionsSnapshot{cik:string;fetchedAt:string;main:StoredDoc;pages:StoredDoc[];parsed:ParsedSubmissions;complete:boolean}
export class SecSubmissionsError extends Error{
 constructor(readonly code:'sec_unavailable'|'invalid_schema',detail?:string,readonly raw?:{sha256:string;path:string}){super(detail?`${code}: ${detail}`:code);this.name='SecSubmissionsError';}
}
export type FilerAcceleration='large_accelerated'|'accelerated'|'non_accelerated'|'unknown';

/** Acceleration named in submissions `category` (reference only; deadlines use the 10-K cover, spec §6.1). Only "Smaller reporting company" → unknown. */
export function submissionsCategory(raw:string|null|undefined):FilerAcceleration{
 const s=(raw??'').toLowerCase();
 if(s.includes('non-accelerated'))return 'non_accelerated';
 if(s.includes('large accelerated'))return 'large_accelerated';
 if(s.includes('accelerated filer'))return 'accelerated';
 return 'unknown';
}

const text=(v:unknown)=>typeof v==='string'&&v.trim()!==''?v:null;
const invalid=(detail:string)=>new SecSubmissionsError('invalid_schema',detail);

function columnar(o:unknown,page:string):SubmissionFiling[]{
 if(!o||typeof o!=='object'||Array.isArray(o))throw invalid(`${page}: not an object`);
 const c=o as Record<string,unknown>;
 const acc=c.accessionNumber;
 if(!Array.isArray(acc))throw invalid(`${page}: accessionNumber`);
 const col=(k:string,required:boolean):unknown[]|null=>{
  const v=c[k];
  if(v===undefined&&!required)return null;
  if(!Array.isArray(v)||v.length!==acc.length)throw invalid(`${page}: ${k}`);
  return v;
 };
 const fd=col('filingDate',true)!,form=col('form',true)!;
 const rd=col('reportDate',false),ad=col('acceptanceDateTime',false),pd=col('primaryDocument',false),ix=col('isInlineXBRL',false);
 return acc.map((a,i)=>{
  if(typeof a!=='string'||typeof fd[i]!=='string'||typeof form[i]!=='string')throw invalid(`${page}: row ${i}`);
  const x=ix?.[i];
  return {accessionNumber:a,filingDate:fd[i] as string,reportDate:text(rd?.[i]),acceptanceDateTime:text(ad?.[i]),form:form[i] as string,
   primaryDocument:text(pd?.[i]),isInlineXBRL:x===1||x===true?true:x===0||x===false?false:null,page};
 });
}
const parseJson=(json:string,what:string)=>{try{return JSON.parse(json) as unknown;}catch{throw invalid(`${what}: not JSON`);}};

export function parseSubmissionsPage(json:string,name:string):SubmissionFiling[]{return columnar(parseJson(json,name),name);}

export function parseSubmissions(json:string):ParsedSubmissions{
 const doc=parseJson(json,'main');
 if(!doc||typeof doc!=='object'||Array.isArray(doc))throw invalid('main: not an object');
 const d=doc as Record<string,unknown>;
 let cik:string;
 try{cik=normalizeCik(d.cik);}catch{throw invalid('cik');}
 const filings=d.filings as {recent?:unknown;files?:unknown}|undefined;
 if(!filings||typeof filings!=='object')throw invalid('filings');
 // Absent or malformed tickers / files are NOT empty lists: consumers read [] as "SEC lists none", so they fail instead.
 const requiredArray=(v:unknown,what:string):unknown[]=>{if(!Array.isArray(v))throw invalid(what);return v;};
 const requiredStrings=(v:unknown,what:string)=>requiredArray(v,what).map(x=>{if(typeof x!=='string')throw invalid(what);return x;});
 const tickerList=(v:unknown)=>{
  const all=requiredStrings(v,'tickers').map(t=>t.trim().toUpperCase());
  const tickerPositions=all.flatMap((t,i)=>t===''?[]:[i]);
  return {tickers:tickerPositions.map(i=>all[i]),tickerPositions};
 };
 const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.trim()!==''):[];
 const fye=text(d.fiscalYearEnd);
 return {
  cik,name:text(d.name),category:text(d.category),
  fiscalYearEnd:fye&&/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(fye)?fye:null,
  ...tickerList(d.tickers),exchanges:strings(d.exchanges),
  formerNames:(Array.isArray(d.formerNames)?d.formerNames:[]).flatMap(f=>{
   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
   return n?[{name:n,from:text(o.from),to:text(o.to)}]:[];
  }),
  filings:columnar(filings.recent,'recent'),
  files:requiredArray(filings.files,'filings.files').map(f=>{
   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
   if(!n||!PAGE_NAME.test(n))throw invalid('files[].name');
   return {name:n,filingCount:typeof o.filingCount==='number'?o.filingCount:null,filingFrom:text(o.filingFrom),filingTo:text(o.filingTo)};
  }),
 };
}

export interface FetchSubmissionsDeps{fetch:typeof fetch;raw:RawStore;userAgent?:string;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;clock?:()=>Date;budget?:Budget;
 /** Default: one process-wide SEC pacer shared by every client and fetchSubmissions call. Tests inject their own for isolation. */pacer?:Pacer}

const FETCH_TIMEOUT_MS=30_000;
/** Runs a parse of stored bytes; a schema failure carries the stored document's sha256/path so the evidence can be found. */
function parseStored<T>(doc:StoredDoc,parse:()=>T):T{
 try{return parse();}
 catch(e){
  if(e instanceof SecSubmissionsError&&!e.raw)throw new SecSubmissionsError(e.code,e.message.replace(/^[a-z_]+: ?/,''),{sha256:doc.sha256,path:doc.path});
  throw e;
 }
}
// Process-wide: SEC's limit is per source address, so every SEC caller (also companyfacts) shares secPacer.
const SEC_PACER:Pacer=secPacer;
const unlimited=():Budget=>({remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal});

export function submissionsClient(deps:FetchSubmissionsDeps){
 const ua=deps.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const clock=deps.clock??(()=>new Date());
 const budget=deps.budget??unlimited();
 const pacer=deps.pacer??SEC_PACER;
 // The User-Agent may contain a contact address: it goes on the request only, never into raw metadata.
 const get=async(url:string,cik:string,name:string):Promise<{bytes:Uint8Array;doc:StoredDoc}>=>{
  try{
   await pacer.admit({budget,reserveMs:0,now:deps.now,sleep:deps.sleep as never});
  }catch(e){
   if(e instanceof PacerError)throw new SecSubmissionsError('sec_unavailable',`${name}: ${e.code}`);
   throw e;
  }
  let res:Response;
  try{res=await deps.fetch(url,{headers:{'User-Agent':ua,Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(FETCH_TIMEOUT_MS)])});}
  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
  let bytes:Uint8Array;
  try{bytes=new Uint8Array(await res.arrayBuffer());}
  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
  const contentType=(res.headers.get('content-type')??'').includes('html')?'text/html' as const:'application/json' as const;
  if(!res.ok){
   // Evidence first: the failure body is kept as received (an aborted budget starts no upload), then the failure is reported with its sha256/path.
   let stored:{sha256:string;path:string};
   try{stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);}
   catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status} (raw not stored: ${e instanceof Error?e.message:String(e)})`);}
   throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status}`,{sha256:stored.sha256,path:stored.path});
  }
  const stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);
  return {bytes,doc:{name,sha256:stored.sha256,path:stored.path}};
 };
 return {
  /** coverFrom: also fetch every files[] page whose filingTo >= coverFrom ('YYYY-MM-DD'); null/undefined: main document only. */
  async fetch(cik:string,opts:{coverFrom?:string|null}={}):Promise<SubmissionsSnapshot>{
   const c=normalizeCik(cik);
   const fetchedAt=clock().toISOString();
   const main=await get(submissionsUrl(c),c,'main');
   const parsed=parseStored(main.doc,()=>{const x=parseSubmissions(new TextDecoder().decode(main.bytes));if(x.cik!==c)throw invalid(`cik ${x.cik} != ${c}`);return x;});
   const from=opts.coverFrom??null;
   const wanted=from===null?[]:parsed.files.filter(f=>f.filingTo===null||f.filingTo>=from);
   const pages:StoredDoc[]=[];
   const filings=[...parsed.filings];
   // An accession repeated across pages is kept once only when the copies agree; a copy with a different filingDate/acceptanceDateTime is KEPT so consumers can see the conflict (additive: plan 3 Task 12).
   const sig=(f:SubmissionFiling)=>`${f.accessionNumber}|${f.filingDate}|${f.acceptanceDateTime??''}`;
   const seen=new Set(filings.map(sig));
   for(const f of wanted){
    const p=await get(`${SEC_SUBMISSIONS_BASE}${f.name}`,c,f.name);
    pages.push(p.doc);
    for(const x of parseStored(p.doc,()=>parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name)))if(!seen.has(sig(x))){seen.add(sig(x));filings.push(x);}
   }
   return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
  },
 };
}

export const fetchSubmissions=(cik:string,deps:FetchSubmissionsDeps,opts:{coverFrom?:string|null}={})=>submissionsClient(deps).fetch(cik,opts);
export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));

export const EVIDENCE_FORMS:Readonly<Record<string,{suggested_op:'backdate_window'|'close_security';note:string}>>={
 '8-A12B':{suggested_op:'backdate_window',note:'12(b) 交易所注册；所指证券类别与生效日须核对原文'},
 '8-A12G':{suggested_op:'backdate_window',note:'12(g) 注册，非交易所上市'},
 '25':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
 '25-NSE':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
};

/** One evidence_only claim per 8-A/25 filing; value = accession number (Part B contract issue 6). */
export function submissionsEvidenceClaims(issuerId:string,snap:SubmissionsSnapshot,asOf:string):ClaimInput[]{
 const shaOf=(page:string)=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
 return snap.parsed.filings.flatMap(f=>{
  const rule=Object.prototype.hasOwnProperty.call(EVIDENCE_FORMS,f.form)?EVIDENCE_FORMS[f.form]:null;
  const sha=rule?shaOf(f.page):null;
  if(!rule||!sha)return [];
  const evidence:ClaimEvidence={source:'sec_submissions',as_of:asOf,evidence_sha256:sha,locator:`${f.page}#accessionNumber=${f.accessionNumber}`,note:rule.note};
  return [{issuer_id:issuerId,id_type:'ticker' as const,value:f.accessionNumber,source:'sec_submissions',op:'evidence_only' as const,detail:{
   schema:'claim/1' as const,evidence_kind:'filing_form' as const,target:{issuer_id:issuerId},
   params:{suggested_op:rule.suggested_op,accession:f.accessionNumber,form:f.form,filing_date:f.filingDate,note:rule.note},evidence,sources:[evidence],
  }}];
 });
}
