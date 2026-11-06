// src/lib/dq/reconcile/us-sample-live.ts
// Live generation of the US iXBRL sample manifest (spec §5.3, selection 'live/1'); the network, the companyfacts
// fetch and the RawStore are injected so the whole flow is testable offline. Rules:
//  - candidates are deduplicated by CIK BEFORE sampling (GOOG/GOOGL are one issuer); the representative is the
//    first required ticker of the CIK, else the lowest ticker; a required ticker covered by another required
//    ticker of the same CIK is satisfied by it;
//  - the exact companyfacts, submissions and primary-document bytes are retained through the RawStore BEFORE a
//    filing enters the manifest (a retention failure aborts the run) and their paths/hashes are recorded in
//    filing.provenance;
//  - the FINAL manifest (after failed issuers/filings were dropped) is re-checked: issuer count, mandatory
//    tickers, quotas, required filing coverage (10-K issuer: a 10-K and a 10-Q; 20-F issuer: a 20-F) and the
//    >= 4 keys per side (validateUsSample). Every shortfall is returned in `unmet`.
import {padCik} from '../../facts/providers/shared';
import type {RawSnapshot} from '../../facts/types';
import type {RawStore} from '../raw-store';
import {filerClass} from './pair-us-ixbrl';
import {US_SAMPLE_SCHEMA,buildSampleFiling,pickSample,unmetQuotas} from './us-sample';
import type {SampleCandidate,SampleFiling,SampleIssuer,UsSample} from './us-sample';

export interface LiveDeps{
 get(url:string):Promise<Uint8Array>;
 companyfacts(cik10:string):Promise<RawSnapshot>;
 store:RawStore;
 now():string;
}
export interface LiveInput{universe:{constituents:{ticker:string;exchange?:string}[]};required:readonly string[];n:number}
export interface LiveResult{sample:UsSample;unmet:string[];warnings:string[]}
interface Submissions{category?:string;fiscalYearEnd?:string;exchanges?:string[];filings?:{recent?:Record<string,unknown[]>}}
interface Recent{accn:string;form:string;filingDate:string;reportDate:string|null;primaryDocument:string;inline:boolean}

/** Exchange names compared case-insensitively: NYSE stays upper case, Nasdaq is 'Nasdaq', others as given. */
export function normalizeExchange(x:string|null|undefined):string|null{
 const t=(x??'').trim();if(t==='')return null;
 const u=t.toUpperCase();return u==='NASDAQ'?'Nasdaq':u==='NYSE'?'NYSE':t;
}
const dec=(b:Uint8Array)=>new TextDecoder().decode(b);
function recentOf(s:Submissions):Recent[]{
 const r=s.filings?.recent??{};const n=(r.accessionNumber??[]).length;const out:Recent[]=[];
 for(let i=0;i<n;i++)out.push({accn:String(r.accessionNumber![i]),form:String(r.form?.[i]??''),filingDate:String(r.filingDate?.[i]??''),reportDate:r.reportDate?.[i]?String(r.reportDate[i]):null,primaryDocument:String(r.primaryDocument?.[i]??''),inline:r.isInlineXBRL?.[i]===1||r.isInlineXBRL?.[i]===true});
 return out.sort((a,b)=>a.filingDate<b.filingDate?1:a.filingDate>b.filingDate?-1:0);
}

/** One candidate per CIK. Returns the effective required list (representatives of required CIKs + required tickers not in the universe). */
export function dedupeByCik(candidates:readonly SampleCandidate[],required:readonly string[]):{candidates:SampleCandidate[];required:string[]}{
 const req=new Set(required);
 const byCik=new Map<string,SampleCandidate[]>();
 for(const c of candidates){const g=byCik.get(c.cik);if(g)g.push(c);else byCik.set(c.cik,[c]);}
 const out:SampleCandidate[]=[];const reqOut=new Set<string>();
 for(const g of byCik.values()){
  g.sort((a,b)=>a.ticker<b.ticker?-1:a.ticker>b.ticker?1:0);
  const rep=g.find(c=>req.has(c.ticker))??g[0];
  out.push(rep);
  if(g.some(c=>req.has(c.ticker)))reqOut.add(rep.ticker);
 }
 const inUniverse=new Set(candidates.map(c=>c.ticker));
 for(const t of required)if(!inUniverse.has(t))reqOut.add(t);
 return {candidates:out,required:[...reqOut].sort()};
}

/** Shortfalls of the final manifest against what was picked (pure). */
export function finalUnmet(sample:UsSample,picked:readonly SampleCandidate[],required:readonly string[]):string[]{
 const unmet:string[]=[];
 const tickers=new Set(sample.issuers.map(i=>i.ticker));
 if(sample.issuers.length<picked.length)unmet.push(`issuers:${sample.issuers.length}/${picked.length}`);
 for(const t of required)if(!tickers.has(t))unmet.push(`required:${t}`);
 const byTicker=new Map(picked.map(p=>[p.ticker,p]));
 unmet.push(...unmetQuotas(sample.issuers.map(i=>byTicker.get(i.ticker)).filter((c):c is SampleCandidate=>c!==undefined)));
 for(const i of sample.issuers){
  const forms=new Set(i.filings.map(f=>f.form));
  for(const need of i.regime==='10-K'?['10-K','10-Q']:['20-F'])if(!forms.has(need))unmet.push(`coverage:${i.ticker}:${need}`);
 }
 return [...new Set(unmet)];
}

export async function liveSample(deps:LiveDeps,input:LiveInput):Promise<LiveResult>{
 const json=<T>(b:Uint8Array)=>JSON.parse(dec(b)) as T;
 const tickers=json<Record<string,{cik_str:number;ticker:string}>>(await deps.get('https://www.sec.gov/files/company_tickers.json'));
 const cikOf=new Map(Object.values(tickers).map(t=>[t.ticker.toUpperCase(),String(t.cik_str)]));
 const subs=new Map<string,Submissions>();const raw:SampleCandidate[]=[];const warnings:string[]=[];const universeFailed=new Set<string>();
 for(const c of input.universe.constituents){
  const ticker=c.ticker.toUpperCase().replace(/\./g,'-');const cik=cikOf.get(ticker);
  if(!cik){warnings.push(`no CIK for ${c.ticker}`);continue;}
  if(!subs.has(cik)){
   try{subs.set(cik,json<Submissions>(await deps.get(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`)));}
   catch(e){
    const m=(e as Error).message;
    if(/http_429/.test(m))throw e;   // rate limited: the universe scan cannot be trusted, fail the run
    warnings.push(`${ticker}: ${m}`);universeFailed.add(`universe_fetch:${ticker}`);continue;
   }
  }
  const s=subs.get(cik)!;
  raw.push({ticker,cik,exchange:normalizeExchange(c.exchange??s.exchanges?.[0]),fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
 }
 const dd=dedupeByCik(raw,input.required);
 const {picked,unmet:pickUnmet}=pickSample(dd.candidates,dd.required,input.n);
 const sinceYear=Number(deps.now().slice(0,4))-10;
 const issuers:SampleIssuer[]=[];
 for(const p of picked){
  // the submissions bytes are fetched again for picked issuers only: these exact bytes are parsed and retained
  const subUrl=`https://data.sec.gov/submissions/CIK${padCik(p.cik)}.json`;
  const subBytes=await deps.get(subUrl);
  const s=json<Submissions>(subBytes);
  const recent=recentOf(s).filter(r=>r.inline);
  const annual=recent.find(r=>r.form==='10-K'||r.form==='20-F');
  if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
  const regime=annual.form as '10-K'|'20-F';
  const chosen=regime==='10-K'?[annual,recent.find(r=>r.form==='10-Q')].filter((x):x is Recent=>!!x):[annual];
  let cf:RawSnapshot;
  try{cf=await deps.companyfacts(padCik(p.cik));}catch(e){warnings.push(`${p.ticker}: companyfacts: ${(e as Error).message}`);continue;}
  const filings:SampleFiling[]=[];
  for(const r of chosen){
   const url=`https://www.sec.gov/Archives/edgar/data/${p.cik}/${r.accn.replace(/-/g,'')}/${r.primaryDocument}`;
   let doc:Uint8Array;let built:SampleFiling;
   try{
    doc=await deps.get(url);
    built=buildSampleFiling({cik:p.cik,accn:r.accn,form:r.form,period_end:r.reportDate,primary_document:r.primaryDocument,doc_url:url,is_inline_xbrl:r.inline,submissions_category:s.category??null,companyfacts:cf,doc,sinceYear});
   }catch(e){warnings.push(`${p.ticker} ${r.accn}: ${(e as Error).message}`);continue;}
   // Retain the exact bytes BEFORE the filing enters the manifest; a retention failure aborts the whole run.
   const rcf=await deps.store.put({kind:'sec-companyfacts',bytes:cf.bytes,contentType:'application/json',meta:{source_url:cf.meta.url??'',cik:p.cik}});
   const rsub=await deps.store.put({kind:'sec-submissions',bytes:subBytes,contentType:'application/json',meta:{source_url:subUrl,cik:p.cik}});
   const rdoc=await deps.store.put({kind:'sec-document',bytes:doc,contentType:'text/html',meta:{source_url:url,accession:r.accn}});
   if(rcf.sha256!==built.raw_sha256||rdoc.sha256!==built.doc_sha256)throw new Error(`retention_hash_mismatch:${r.accn}`);
   filings.push({...built,provenance:{companyfacts:{path:rcf.path,sha256:rcf.sha256},submissions:{path:rsub.path,sha256:rsub.sha256},document:{path:rdoc.path,sha256:rdoc.sha256}}});
  }
  if(filings.length>0)issuers.push({cik:p.cik,ticker:p.ticker,regime,filings});
 }
 const sample:UsSample={schema:US_SAMPLE_SCHEMA,generated_at:deps.now(),selection:'live/1',issuers};
 const final=finalUnmet(sample,picked,dd.required);
 return {sample,unmet:[...new Set([...pickUnmet,...final,...universeFailed])],warnings};
}
