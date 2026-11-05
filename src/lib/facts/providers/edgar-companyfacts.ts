// src/lib/facts/providers/edgar-companyfacts.ts
// EDGAR companyfacts adapter (spec §6.2; §3 selection rule; §4.7 raw_hash). fetchCompanyFacts: one paced
// GET (≥120 ms between SEC requests per process), timeout min(60 s, remaining − 20 s), 429/503 backoff
// 1→2→4→8 s stopped by the budget, 404 → no_companyfacts, >50 MB → snapshot_too_large. parseCompanyFacts:
// numbers decoded by field schema (cik/fy control, val decimal), per (accn,start,end,unit) the first tag
// in catalogue order with an entry wins and lower tags only fill missing periods, same-tag disagreement
// → ambiguous_value (frame only there), filings.period_end = max end of the accn's duration entries,
// fy/fp only on filings.
// Deviations from the first plan text (Task 10 review follow-up): (1) tag selection and ambiguity run over all
// entries before availability filtering; an undated higher-priority row claims its slot and parks as
// missing_available_date (its lower tags never substitute). (2) raw_hash locator is ROW level, not group level
// (spec §4.7 says group): facts.<tax>.<tag>.units.<rawUnit>[<array index>](accn=…,start=…,end=…); the string is
// also exposed as `locator` on candidates/ambiguous/odd entries and in missingAvailableDate payloads.
// (3) odd durations: disagreement → ambiguous, otherwise every entry is parked. (4) SEC pacing reserves request
// slots synchronously (concurrency-safe). (5) The body download sits inside the retry boundary. (6) Filings
// of other forms (8-K, DEF 14A, …) become formType 'other' filings and are kept as disclosures, by design.
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
let nextSlotAt=0;   // module-level: one pace across every issuer and every concurrent caller of this process
/** Test hook: forget the reserved pacing slots (tests use fake clocks). */
export const resetSecPacing=()=>{nextSlotAt=0;};
/** Reserve the next request-start slot synchronously (so concurrent callers queue in call order), then wait for it. */
async function paceSlot(now:()=>number,wait:typeof sleep,signal:AbortSignal){
 const at=Math.max(now(),nextSlotAt);
 nextSlotAt=at+SEC_MIN_INTERVAL_MS;
 const gap=at-now();
 if(gap>0)await wait(gap,signal);
}

export interface FetchOptions{fetch?:typeof fetch;userAgent?:string;sleep?:typeof sleep;now?:()=>number}

export async function fetchCompanyFacts(cik10:string,budget:Budget,opts:FetchOptions={}):Promise<RawSnapshot>{
 if(!/^\d{10}$/.test(cik10))throw new ProviderError('parse_error',`bad cik ${cik10}`);
 const doFetch=opts.fetch??fetch,wait=opts.sleep??sleep,now=opts.now??Date.now;
 const ua=opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const url=companyFactsUrl(cik10);
 for(let attempt=0;;attempt++){
  if(budget.remainingMs()-RESERVE_MS<=0)throw new ProviderError('sec_unavailable','budget_exhausted');
  try{await paceSlot(now,wait,budget.signal);}catch{throw new ProviderError('sec_unavailable','budget_aborted');}
  // re-check after the pacing wait: the budget may have run out or been cancelled while queued
  const timeoutMs=Math.min(60_000,budget.remainingMs()-RESERVE_MS);
  if(budget.signal.aborted||timeoutMs<=0)throw new ProviderError('sec_unavailable','budget_exhausted');
  let detail:string;
  try{
   const res=await doFetch(url,{headers:{'User-Agent':ua,'Accept-Encoding':'gzip, deflate',Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)])});
   if(res.status===404)throw new ProviderError('no_companyfacts',`404 ${url}`);
   if(res.status===429||res.status===503)detail=`http_${res.status}_retries_exhausted`;
   else{
    if(!res.ok)throw new ProviderError('sec_unavailable',`http_${res.status}`);
    const declared=Number(res.headers.get('content-length')??'0');
    if(declared>MAX_SNAPSHOT_BYTES)throw new ProviderError('snapshot_too_large',`content-length ${declared}`);
    // the body download is inside the retry boundary: a disconnect or per-request timeout mid-body retries like a network error
    return snapshotOf(await readBounded(res,MAX_SNAPSHOT_BYTES),{source:'edgar',url,http_status:res.status});
   }
  }catch(e){
   if(e instanceof ProviderError)throw e;
   if(budget.signal.aborted)throw new ProviderError('sec_unavailable','budget_aborted');
   // includes the per-request timeout (an AbortError/TimeoutError here is not the global deadline)
   detail=`network: ${(e as Error).message}`;
  }
  if(attempt>=BACKOFF_MS.length)throw new ProviderError('sec_unavailable',detail);
  await backoff(attempt,budget,wait);
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
 type Ent={e:CompanyFactsEntry;index:number;rawUnit:string;unit:string;dated:boolean;value:string};
 for(const concept of concepts){
  const taken=new Set<string>();
  for(const qualified of tagsOf(concept)){
   const [tax,tag]=qualified.split(':');
   const units=doc.facts[tax]?.[tag]?.units;
   if(!units||typeof units!=='object')continue;
   // Selection and ambiguity are decided over ALL entries of the tag (dated or not); availability only
   // decides afterwards whether a surviving period becomes a candidate or a missing_available_date row.
   const groups=new Map<string,Ent[]>();
   for(const [rawUnit,entries] of Object.entries(units)){
    if(!Array.isArray(entries))continue;
    // normalizeUnit (units.ts) is shape-only; the concept's unit kind is enforced here (§3: a money
    // concept never takes 'shares', 'pure' matches no concept).
    const normalized=normalizeUnit(rawUnit);
    const unit=normalized!==null&&unitKindOf(normalized)===concept.unitKind?normalized:null;
    if(unit===null){for(let n=0;n<entries.length;n++)bump(`unit_not_allowed:${qualified}:${rawUnit}`);continue;}
    entries.forEach((e,index)=>{
     if(!isDate(e?.end)||typeof e.val!=='string'||typeof e.accn!=='string'||!validDecimal(e.val)||(e.start!==undefined&&!isDate(e.start))){bump('entry_shape');return;}
     if(e.end<sinceDate){bump('before_since_year');return;}
     const isDuration=isDate(e.start);
     if(isDuration!==(concept.nature==='duration')){bump(`nature_mismatch:${qualified}`);return;}
     if(isDate(e.filed))touchFiling(e,isDuration);
     const key=`${e.accn}|${e.start??''}|${e.end}|${unit}`;
     if(taken.has(key))return;                         // a higher-priority tag already claimed this period (even if its row was parked)
     const list=groups.get(key)??[];list.push({e,index,rawUnit,unit,dated:isDate(e.filed),value:canonicalDecimal(e.val)});groups.set(key,list);
    });
   }
   for(const [key,g] of groups){
    taken.add(key);
    const first=g[0].e,unit=g[0].unit;
    const locator=(x:Ent)=>`facts.${tax}.${tag}.units.${x.rawUnit}[${x.index}](accn=${x.e.accn},start=${x.e.start??''},end=${x.e.end})`;
    const build=(x:Ent,duration:Duration):FactCandidate&{locator:string}=>({concept:concept.id,sourceConcept:qualified,statement:tax==='dei'?'DEI':concept.statement,periodStart:x.e.start??null,periodEnd:x.e.end,duration,value:x.value,unit,consolidation:'consolidated',filingRef:x.e.accn,rawHash:rawHashOf(snapshot.sha256,locator(x)),locator:locator(x)});
    const duration=first.start?classifyDuration(first.start,first.end):'INSTANT';
    const days=first.start?daysBetween(first.start,first.end):0;
    const asDuration:Duration=duration==='odd'?nearestDuration(days):duration;
    if(new Set(g.map(x=>x.value)).size>1){
     out.ambiguous.push({key:`${concept.id}:${first.start??''}:${first.end}:${unit}:${first.accn}`,candidates:g.map(x=>Object.assign(build(x,asDuration),{frame:x.e.frame??null}))});
     continue;
    }
    if(duration==='odd'){for(const x of g)out.oddDuration.push(Object.assign(build(x,asDuration),{periodDays:days}));continue;}
    const dated=g.find(x=>x.dated);
    if(!dated){
     for(const x of g)out.missingAvailableDate.push({accn:x.e.accn,tag:qualified,start:x.e.start??null,end:x.e.end,unit:x.rawUnit,form:x.e.form??null,value:x.value,frame:x.e.frame??null,snapshot_sha256:snapshot.sha256,locator:locator(x)});
     continue;
    }
    out.candidates.push(build(dated,duration));
   }
  }
 }
 for(const {maxDurationEnd,...row} of filings.values())out.filings.push({...row,periodEnd:maxDurationEnd});
 out.filings.sort((a,b)=>a.availableDate.localeCompare(b.availableDate)||a.sourceRef.localeCompare(b.sourceRef));
 out.skipped=[...skip].map(([reason,n])=>({reason,n}));
 return out;
}
