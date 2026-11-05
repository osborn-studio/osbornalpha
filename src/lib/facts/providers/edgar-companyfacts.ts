// src/lib/facts/providers/edgar-companyfacts.ts
// EDGAR companyfacts adapter (spec §6.2; §3 selection rule; §4.7 raw_hash). fetchCompanyFacts: one paced
// GET (≥120 ms between SEC requests per process), timeout min(60 s, remaining − 20 s), 429/503 backoff
// 1→2→4→8 s stopped by the budget, 404 → no_companyfacts, >50 MB → snapshot_too_large. parseCompanyFacts:
// numbers decoded by field schema (cik/fy control, val decimal), per (accn,start,end,unit) the first tag
// in catalogue order with an entry wins and lower tags only fill missing periods, same-tag disagreement
// → ambiguous_value (frame only there), filings.period_end = max end of the accn's duration entries,
// fy/fp only on filings.
import type {Budget,ConceptDef,Duration,FactCandidate,FilingCandidate,FormType,ParseResult,RawSnapshot} from '../types';
import {FACT_CONCEPTS} from '../concepts';
import {EDGAR_NUMBER_SCHEMA,canonicalDecimal,decodeWithSchema,scanJsonNumbers} from '../json-numbers';
import type {NumberSchema} from '../json-numbers';
import {normalizeUnit,unitKindOf} from '../units';
import {classifyDuration,daysBetween as daysBetweenOrNull,isDate} from '../classify';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {nearestDuration,ProviderError,rawHashOf,sleep,snapshotOf} from './shared';

export const companyFactsUrl=(cik10:string)=>`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
export const MAX_SNAPSHOT_BYTES=50*1024*1024;
export const SEC_MIN_INTERVAL_MS=120;
/** Same schema as json-numbers.ts: cik/fy control integers, val decimal text. */
export const COMPANYFACTS_SCHEMA:NumberSchema=EDGAR_NUMBER_SCHEMA;
const BACKOFF_MS=[1000,2000,4000,8000];
const RESERVE_MS=20_000;
let lastSecRequestAt=0;   // module-level: one pace across every issuer handled by this process

export interface FetchOptions{fetch?:typeof fetch;userAgent?:string;sleep?:typeof sleep;now?:()=>number}

export async function fetchCompanyFacts(cik10:string,budget:Budget,opts:FetchOptions={}):Promise<RawSnapshot>{
 if(!/^\d{10}$/.test(cik10))throw new ProviderError('parse_error',`bad cik ${cik10}`);
 const doFetch=opts.fetch??fetch,wait=opts.sleep??sleep,now=opts.now??Date.now;
 const ua=opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const url=companyFactsUrl(cik10);
 for(let attempt=0;;attempt++){
  const timeoutMs=Math.min(60_000,budget.remainingMs()-RESERVE_MS);
  if(timeoutMs<=0)throw new ProviderError('sec_unavailable','budget_exhausted');
  const gap=lastSecRequestAt+SEC_MIN_INTERVAL_MS-now();
  if(gap>0)await wait(gap,budget.signal);
  lastSecRequestAt=now();
  let res:Response;
  try{
   res=await doFetch(url,{headers:{'User-Agent':ua,'Accept-Encoding':'gzip, deflate',Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)])});
  }catch(e){
   if(budget.signal.aborted)throw new ProviderError('sec_unavailable','budget_aborted');
   if(attempt>=BACKOFF_MS.length)throw new ProviderError('sec_unavailable',`network: ${(e as Error).message}`);
   await backoff(attempt,budget,wait);continue;
  }
  if(res.status===404)throw new ProviderError('no_companyfacts',`404 ${url}`);
  if(res.status===429||res.status===503){
   if(attempt>=BACKOFF_MS.length)throw new ProviderError('sec_unavailable',`http_${res.status}_retries_exhausted`);
   await backoff(attempt,budget,wait);continue;
  }
  if(!res.ok)throw new ProviderError('sec_unavailable',`http_${res.status}`);
  const declared=Number(res.headers.get('content-length')??'0');
  if(declared>MAX_SNAPSHOT_BYTES)throw new ProviderError('snapshot_too_large',`content-length ${declared}`);
  return snapshotOf(await readBounded(res,MAX_SNAPSHOT_BYTES),{source:'edgar',url,http_status:res.status});
 }
}
async function backoff(attempt:number,budget:Budget,wait:typeof sleep){
 const ms=BACKOFF_MS[attempt];
 if(budget.remainingMs()-ms<=RESERVE_MS)throw new ProviderError('sec_unavailable','budget_exhausted_during_backoff');
 await wait(ms,budget.signal);
}
async function readBounded(res:Response,max:number):Promise<Uint8Array>{
 if(!res.body){const b=new Uint8Array(await res.arrayBuffer());if(b.byteLength>max)throw new ProviderError('snapshot_too_large',String(b.byteLength));return b;}
 const reader=res.body.getReader();const chunks:Uint8Array[]=[];let total=0;
 for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new ProviderError('snapshot_too_large',`>${max}`);}chunks.push(value);}
 const out=new Uint8Array(total);let o=0;for(const c of chunks){out.set(c,o);o+=c.byteLength;}
 return out;
}

export interface CompanyFactsEntry{start?:string;end:string;val:string;accn:string;fy:number|null;fp:string|null;form:string;filed:string;frame?:string}
export interface CompanyFactsDoc{cik:number;entityName?:string;facts:Record<string,Record<string,{units:Record<string,CompanyFactsEntry[]>}>>}
export function decodeCompanyFacts(bytes:Uint8Array):CompanyFactsDoc{
 let d:Partial<CompanyFactsDoc>;
 try{d=decodeWithSchema(scanJsonNumbers(bytes),COMPANYFACTS_SCHEMA) as Partial<CompanyFactsDoc>;}catch(e){throw new ProviderError('parse_error',`json: ${(e as Error).message}`);}
 if(!d||typeof d!=='object'||typeof d.cik!=='number'||!d.facts||typeof d.facts!=='object')throw new ProviderError('parse_error','companyfacts shape: cik/facts');
 return d as CompanyFactsDoc;
}
const FORM_TYPES:readonly string[]=['10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A'];
export const mapForm=(form:unknown):FormType=>typeof form==='string'&&FORM_TYPES.includes(form)?form as FormType:'other';
export const mapFp=(fp:unknown):FilingCandidate['fiscalPeriod']=>fp==='FY'||fp==='Q1'||fp==='Q2'||fp==='Q3'?fp:null;
const qualify=(tag:string,tax:string)=>tag.includes(':')?tag:`${tax}:${tag}`;
export const tagsOf=(c:ConceptDef)=>[...c.usGaap.map(t=>qualify(t,'us-gaap')),...c.ifrs.map(t=>qualify(t,'ifrs-full'))];
const daysBetween=(a:string,b:string)=>daysBetweenOrNull(a,b)??0;

const validDecimal=(v:string)=>{try{canonicalDecimal(v);return true;}catch{return false;}};

export interface ParseOptions{concepts?:readonly ConceptDef[];sinceYear?:number;today?:Date}   // readonly: FACT_CONCEPTS is readonly (round-1 #4)
export function parseCompanyFacts(snapshot:RawSnapshot,opts:ParseOptions={}):ParseResult{
 const doc=decodeCompanyFacts(snapshot.bytes);
 const concepts=opts.concepts??FACT_CONCEPTS;
 const sinceDate=`${opts.sinceYear??(opts.today??new Date()).getUTCFullYear()-10}-01-01`;
 const cikPlain=String(doc.cik);
 const out:ParseResult={candidates:[],filings:[],skipped:[],ambiguous:[],oddDuration:[],missingAvailableDate:[]};
 const skip=new Map<string,number>();const bump=(r:string)=>skip.set(r,(skip.get(r)??0)+1);
 const filings=new Map<string,FilingCandidate&{maxDurationEnd:string|null}>();
 const touchFiling=(e:CompanyFactsEntry,isDuration:boolean)=>{
  let f=filings.get(e.accn);
  if(!f){f={sourceRef:e.accn,market:'US',source:'edgar',origin:'sec',formType:mapForm(e.form),fiscalYear:typeof e.fy==='number'?e.fy:null,fiscalPeriod:mapFp(e.fp),periodEnd:null,availableDate:e.filed,url:`https://www.sec.gov/Archives/edgar/data/${cikPlain}/${e.accn.replace(/-/g,'')}/`,maxDurationEnd:null};filings.set(e.accn,f);}
  if(isDuration&&(f.maxDurationEnd===null||e.end>f.maxDurationEnd))f.maxDurationEnd=e.end;
 };
 for(const concept of concepts){
  const taken=new Set<string>();
  for(const qualified of tagsOf(concept)){
   const [tax,tag]=qualified.split(':');
   const units=doc.facts[tax]?.[tag]?.units;
   if(!units||typeof units!=='object')continue;
   const groups=new Map<string,{entries:CompanyFactsEntry[];unit:string;rawUnit:string}>();
   for(const [rawUnit,entries] of Object.entries(units)){
    if(!Array.isArray(entries))continue;
    // normalizeUnit (units.ts) is shape-only; the concept's unit kind is enforced here (§3: a money
    // concept never takes 'shares', 'pure' matches no concept).
    const normalized=normalizeUnit(rawUnit);
    const unit=normalized!==null&&unitKindOf(normalized)===concept.unitKind?normalized:null;
    if(unit===null){bump(`unit_not_allowed:${qualified}:${rawUnit}`);continue;}
    for(const e of entries){
     if(!isDate(e?.end)||typeof e.val!=='string'||typeof e.accn!=='string'||!validDecimal(e.val)||(e.start!==undefined&&!isDate(e.start))){bump('entry_shape');continue;}
     if(e.end<sinceDate){bump('before_since_year');continue;}
     const isDuration=isDate(e.start);
     if(isDuration!==(concept.nature==='duration')){bump(`nature_mismatch:${qualified}`);continue;}
     if(!isDate(e.filed)){out.missingAvailableDate.push({accn:e.accn,tag:qualified,start:e.start??null,end:e.end,unit:rawUnit,form:e.form??null});continue;}
     touchFiling(e,isDuration);
     const key=`${e.accn}|${e.start??''}|${e.end}|${unit}`;
     if(taken.has(key))continue;                       // a higher-priority tag already covers this period
     const g=groups.get(key)??{entries:[],unit,rawUnit};g.entries.push(e);groups.set(key,g);
    }
   }
   for(const [key,g] of groups){
    taken.add(key);
    const first=g.entries[0];
    const locator=(e:CompanyFactsEntry)=>`facts.${tax}.${tag}.units.${g.rawUnit}[accn=${e.accn},start=${e.start??''},end=${e.end}]`;
    const build=(e:CompanyFactsEntry,duration:Duration):FactCandidate=>({concept:concept.id,sourceConcept:qualified,statement:tax==='dei'?'DEI':concept.statement,periodStart:e.start??null,periodEnd:e.end,duration,value:canonicalDecimal(e.val),unit:g.unit,consolidation:'consolidated',filingRef:e.accn,rawHash:rawHashOf(snapshot.sha256,locator(e))});
    const duration=first.start?classifyDuration(first.start,first.end):'INSTANT';
    if(duration==='odd'){const days=daysBetween(first.start!,first.end);out.oddDuration.push(Object.assign(build(first,nearestDuration(days)),{periodDays:days}));continue;}
    if(new Set(g.entries.map(e=>canonicalDecimal(e.val))).size>1){
     out.ambiguous.push({key:`${concept.id}:${first.start??''}:${first.end}:${g.unit}:${first.accn}`,candidates:g.entries.map(e=>Object.assign(build(e,duration),{frame:e.frame??null}))});
     continue;
    }
    out.candidates.push(build(first,duration));
   }
  }
 }
 for(const {maxDurationEnd,...row} of filings.values())out.filings.push({...row,periodEnd:maxDurationEnd});
 out.filings.sort((a,b)=>a.availableDate.localeCompare(b.availableDate)||a.sourceRef.localeCompare(b.sourceRef));
 out.skipped=[...skip].map(([reason,n])=>({reason,n}));
 return out;
}
