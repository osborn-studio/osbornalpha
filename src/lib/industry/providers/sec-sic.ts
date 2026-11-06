// src/lib/industry/providers/sec-sic.ts
// SEC SIC adapter (spec §4.1, §4.2, §4.4 SIC; primary source, no token). Two inputs:
//  - submissions JSON per CIK (https://data.sec.gov/submissions/CIK##########.json): `sic` (string, may be ''),
//    `sicDescription`, `fiscalYearEnd` ('MMDD'), `name`; raw_hash = sha256 of the response bytes.
//  - the SIC code list page (https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list):
//    one HTML table "SIC Code | Office | Industry Title"; codes below 1000 are shown with three digits and are
//    left-padded to four (0100). Recorded 2026-11-06: 430 rows, 5 three-digit codes.
// Both requests declare the User-Agent (env EDGAR_USER_AGENT, else the landed DEFAULT_USER_AGENT of
// collectors/shared.ts). Fair access (≤ 10 req/s) is the caller's pacing (sic.ts). Outcomes are values, not
// throws: 404 → not_found (no_submissions); 429 / 5xx / network → unavailable (sec_unavailable).
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';

export const SIC_CODE_LIST_URL='https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list';
export const submissionsUrl=(cik:string)=>`https://data.sec.gov/submissions/CIK${normalizeCik10(cik)}.json`;
export const secUserAgent=()=>process.env.EDGAR_USER_AGENT||DEFAULT_USER_AGENT;
const sha256Hex=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');

export function normalizeCik10(cik:string):string{
 const t=cik.trim();
 if(!/^\d{1,10}$/.test(t)||/^0+$/.test(t))throw new Error('invalid_cik');
 return t.padStart(10,'0');
}
/** 1–4 digit SIC → 4 digits; anything else → null. */
export function padSic(v:string):string|null{
 const t=v.trim();
 return /^\d{1,4}$/.test(t)&&!/^0+$/.test(t)?t.padStart(4,'0'):null;
}

export interface SubmissionsSic{cik:string;name:string|null;sic:string|null;sicRaw:string|null;sicDescription:string|null;fiscalYearEnd:string|null}
/** Pure parse of a submissions document; an empty or malformed `sic` is null (sicRaw keeps what was sent). */
export function parseSubmissionsSic(bytes:Uint8Array):SubmissionsSic{
 let doc:Record<string,unknown>;
 try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Record<string,unknown>;}catch{throw new Error('submissions_json_invalid');}
 if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new Error('submissions_json_invalid');
 const s=(k:string)=>typeof doc[k]==='string'?(doc[k] as string):doc[k]===null||doc[k]===undefined?null:String(doc[k]);
 const cikRaw=s('cik');
 if(!cikRaw)throw new Error('submissions_no_cik');
 const sicRaw=s('sic');
 const fye=s('fiscalYearEnd');
 return {cik:String(Number(cikRaw)),name:s('name'),sic:sicRaw===null?null:padSic(sicRaw),sicRaw,sicDescription:s('sicDescription')||null,fiscalYearEnd:fye&&/^\d{4}$/.test(fye)?fye:null};
}

export type SubmissionsFetch={kind:'ok';url:string;fetchedAt:string;rawHash:string;parsed:SubmissionsSic}|{kind:'not_found';url:string;status:number}|{kind:'unavailable';url:string;status:number|null};
export async function fetchSubmissionsSic(cik:string,opts:{fetch?:typeof fetch;userAgent?:string;now?:()=>Date}={}):Promise<SubmissionsFetch>{
 const url=submissionsUrl(cik);
 let res:Response;
 try{res=await (opts.fetch??fetch)(url,{headers:{'User-Agent':opts.userAgent??secUserAgent(),Accept:'application/json'},signal:AbortSignal.timeout(30_000)});}
 catch{return {kind:'unavailable',url,status:null};}
 if(res.status===404)return {kind:'not_found',url,status:404};
 if(!res.ok)return {kind:'unavailable',url,status:res.status};
 const bytes=new Uint8Array(await res.arrayBuffer());
 return {kind:'ok',url,fetchedAt:(opts.now??(()=>new Date()))().toISOString(),rawHash:sha256Hex(bytes),parsed:parseSubmissionsSic(bytes)};
}

export interface SicCodeRow{code:string;office:string;title:string}
const ENTITIES:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const decodeEntities=(s:string)=>s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e:string)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):(ENTITIES[e.toLowerCase()]??m));
const cellText=(s:string)=>decodeEntities(s.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim();

/** Pure parse of the SIC code table: header row skipped, codes left-padded, duplicates and malformed rows rejected. */
export function parseSicCodeTable(html:string):{rows:SicCodeRow[];rejected:string[]}{
 const table=/<table[^>]*>([\s\S]*?)<\/table>/i.exec(html.replace(/<!--[\s\S]*?-->/g,''));
 if(!table)throw new Error('sic_table_not_found');
 const rows:SicCodeRow[]=[];const rejected:string[]=[];const seen=new Set<string>();
 const trs=[...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>cellText(c[1])));
 trs.forEach((cells,i)=>{
  if(i===0&&cells[0]&&!/^\d+$/.test(cells[0]))return;   // header
  const code=cells.length===3?padSic(cells[0]):null;
  if(!code||!cells[2]){rejected.push(`row_${i}`);return;}
  if(seen.has(code)){rejected.push(`duplicate_${code}`);return;}
  seen.add(code);rows.push({code,office:cells[1],title:cells[2]});
 });
 if(rows.length===0)throw new Error('sic_table_empty');
 return {rows,rejected};
}

export type SicTableFetch={kind:'ok';url:string;fetchedAt:string;rawHash:string;rows:SicCodeRow[];rejected:string[]}|{kind:'unavailable';url:string;status:number|null};
export async function fetchSicCodeTable(opts:{fetch?:typeof fetch;userAgent?:string;now?:()=>Date}={}):Promise<SicTableFetch>{
 const url=SIC_CODE_LIST_URL;
 let res:Response;
 try{res=await (opts.fetch??fetch)(url,{headers:{'User-Agent':opts.userAgent??secUserAgent(),Accept:'text/html'},signal:AbortSignal.timeout(30_000)});}
 catch{return {kind:'unavailable',url,status:null};}
 if(!res.ok)return {kind:'unavailable',url,status:res.status};
 const bytes=new Uint8Array(await res.arrayBuffer());
 const {rows,rejected}=parseSicCodeTable(new TextDecoder('utf-8').decode(bytes));
 return {kind:'ok',url,fetchedAt:(opts.now??(()=>new Date()))().toISOString(),rawHash:sha256Hex(bytes),rows,rejected};
}

// repo-root relative (see tushare-industry.ts: a directory URL breaks `next build` of the cron route)
export const SEC_FIXTURE_DIR=join(process.cwd(),'src/lib/industry/fixtures/sec')+'/';
/** Recorded fixture bytes (fixtures/sec/submissions-<cik10>.json, fixtures/sec/sic-codes.html). */
export const secFixture=(name:string)=>new Uint8Array(readFileSync(`${SEC_FIXTURE_DIR}${name}`));
/** A fetch stand-in that serves the recorded fixtures by URL (404 for any other CIK); used by tests and offline runs. */
export function fixtureSecFetch(overrides:Record<string,Response|(()=>Response)>={}):typeof fetch{
 return (async(input:RequestInfo|URL)=>{
  const url=String(input);
  const o=overrides[url];if(o)return typeof o==='function'?o():o;
  if(url===SIC_CODE_LIST_URL)return new Response(secFixture('sic-codes.html'),{status:200,headers:{'content-type':'text/html'}});
  const m=/CIK(\d{10})\.json$/.exec(url);
  if(m){try{return new Response(secFixture(`submissions-${m[1]}.json`),{status:200,headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}}
  return new Response('',{status:404});
 }) as typeof fetch;
}
