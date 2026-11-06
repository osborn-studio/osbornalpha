// src/lib/documents/sources/edgar.ts
// EDGAR list adapter (spec §6.2, §5.1). Lists data.sec.gov/submissions/CIK{10}.json: the `recent`
// columnar arrays, and — only once `filesVerified` — the historical files named in filings.files[]
// ({name, filingFrom, filingTo}, each fetched from data.sec.gov/submissions/{name} and assumed to be
// the same columnar shape as `recent`). That shape and the filing index JSON (directory.item[], XBRL
// instance = *_htm.xml) are NOT verified in this repo (spec §15 q1): until the commander records a
// real files[] page and index.json as fixtures and flips EDGAR_FILES_VERIFIED, backfill has the
// `recent` segment only and the adapter reports coverageGap, so the sync core never sets
// backfill_done and emits coverage_summary. source_ref = '<accession>/<primaryDocument>'; asset =
// the filing index (required); the XBRL instance is added from the index (optional).
import {primaryDocumentUrl} from '../../research/ingest/collectors/edgar';
import {DAY_MS,orderListed,pollSegment} from './shared';
import type {Budget,Listed,ListedAsset,PoliteHttp,Segment,SourceAdapter} from './shared';
import type {DocScopeRow} from '../types';

export const EDGAR_INTERVAL_MS=120;
/** Spec §6.2 default form set; --forms adds to it. */
export const EDGAR_DOC_FORMS=['10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','8-K','8-K/A','6-K'] as const;
/** Flipped by the commander after recording real files[] / index.json fixtures (spec §15 q1). */
export const EDGAR_FILES_VERIFIED=false;
const SUBMISSIONS='https://data.sec.gov/submissions/';

interface Columnar{accessionNumber:string[];acceptanceDateTime:string[];form:string[];primaryDocument:string[];primaryDocDescription?:string[];filingDate?:string[]}
interface FileEntry{name?:unknown;filingFrom?:unknown;filingTo?:unknown}
interface Submissions{filings?:{recent?:unknown;files?:unknown}}
export interface EdgarAdapterOptions{http:PoliteHttp;forms?:readonly string[];filesVerified?:boolean}

function asColumnar(v:unknown,where:string):Columnar{
 const c=v as Partial<Columnar>|null;
 if(!c||!Array.isArray(c.accessionNumber)||!Array.isArray(c.acceptanceDateTime)||!Array.isArray(c.form)||!Array.isArray(c.primaryDocument))throw new Error(`layout_changed: ${where}`);
 return c as Columnar;
}
const archiveDir=(cik:string,accn:string)=>`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g,'')}/`;

export function edgarAdapter(opts:EdgarAdapterOptions):SourceAdapter{
 const forms=new Set(opts.forms??EDGAR_DOC_FORMS);
 const verified=opts.filesVerified??EDGAR_FILES_VERIFIED;
 const submissions=async(cik:string,budget:Budget):Promise<Submissions>=>{
  if(!/^\d{10}$/.test(cik))throw new Error('invalid_fetch_key');
  return JSON.parse(await opts.http.getText(`${SUBMISSIONS}CIK${cik}.json`,budget,{Accept:'application/json'})) as Submissions;
 };
 const toListed=(cik:string,c:Columnar,seg:Segment):Listed[]=>{
  const lo=Date.parse(`${seg.from}T00:00:00Z`),hi=Date.parse(`${seg.to}T00:00:00Z`)+DAY_MS;
  const out:Listed[]=[];
  for(let i=0;i<c.accessionNumber.length;i++){
   const form=String(c.form[i]??'');const accn=String(c.accessionNumber[i]??'');const doc=String(c.primaryDocument[i]??'');
   const t=Date.parse(String(c.acceptanceDateTime[i]??''));
   if(!forms.has(form)||!accn||!doc||!Number.isFinite(t)||t<lo||t>=hi)continue;
   const desc=String(c.primaryDocDescription?.[i]??'')||form;const filed=String(c.filingDate?.[i]??'');
   out.push({source_ref:`${accn}/${doc}`,source_url:primaryDocumentUrl(cik,accn,doc),title:filed?`${form} ${desc} (${filed})`:`${form} ${desc}`,form_type:form,
    published_at:new Date(t).toISOString(),precision:'instant',assets:[{role:'filing_index',filename:'index.json',url:`${archiveDir(cik,accn)}index.json`,required:true}]});
  }
  return out;
 };
 return {
  source:'edgar',
  coverageGap:verified?null:'edgar_files_unverified',
  segments(scope:DocScopeRow,mode,sinceYear,now){
   if(mode==='poll')return [pollSegment(scope,now)];
   const to=now.toISOString().slice(0,10);
   const recent={id:'recent',from:`${sinceYear}-01-01`,to};
   return verified?[{id:'history',from:recent.from,to},recent]:[recent];
  },
  async list(scope,seg,budget){
   const cik=scope.fetch_key;
   const sub=await submissions(cik,budget);
   const cols:Columnar[]=[];
   if(seg.id==='history'){
    const files=sub.filings?.files;
    if(!Array.isArray(files))throw new Error('layout_changed: filings.files');
    for(const f of files as FileEntry[]){
     if(typeof f.name!=='string'||!/^CIK\d{10}-submissions-\d{3}\.json$/.test(f.name))throw new Error('layout_changed: filings.files[].name');
     if(typeof f.filingTo==='string'&&f.filingTo<seg.from)continue;
     cols.push(asColumnar(JSON.parse(await opts.http.getText(`${SUBMISSIONS}${f.name}`,budget,{Accept:'application/json'})),f.name));
    }
   }else cols.push(asColumnar(sub.filings?.recent,'filings.recent'));
   return orderListed(cols.flatMap(c=>toListed(cik,c,seg)));
  },
  assetsFromIndex(listed,indexBytes){
   const idx=JSON.parse(new TextDecoder().decode(indexBytes)) as {directory?:{item?:{name?:unknown}[]}};
   const items=idx.directory?.item;
   if(!Array.isArray(items))return [];
   const base=listed.assets?.find(a=>a.role==='filing_index')?.url.replace(/index\.json$/,'');
   if(!base)return [];
   return items.map(i=>i.name).filter((n):n is string=>typeof n==='string'&&/^[\w.-]+_htm\.xml$/.test(n))
    .map((filename):ListedAsset=>({role:'xbrl_instance',filename,url:`${base}${filename}`,required:false}));
  },
 };
}
