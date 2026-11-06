// scripts/dq/select-us-sample.ts
/**
 * Builds the US iXBRL sample manifest (spec §5.3).
 *
 *   npx tsx scripts/dq/select-us-sample.ts --fixtures [--out src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json] [--generated-at <ISO>]
 *   node --env-file=.env.local --import tsx scripts/dq/select-us-sample.ts --live --universe <sp500 payload.json> --out <path> [--n 30]
 *
 * --fixtures (offline, deterministic): plan 2's companyfacts fixtures of AAPL and MSFT and the recorded trimmed
 * primary documents of their FY2023 10-Ks (record-ixbrl-fixture.ts) → selection 'fixture/1', sinceYear 2016.
 * doc_sha256 = the SOURCE document sha256 from the recording meta (the trimmed copy differs; the pair then marks
 * detail.right.doc_sha_mismatch); is_inline_xbrl, submissions_category and primary_document come from the
 * recorded submissions entry.
 * --live (network, never in CI): candidates = universe constituents ∩ SEC company_tickers.json (ticker → CIK);
 * required = the US tickers of plan2.json; per candidate the submissions JSON gives fiscalYearEnd, category,
 * exchanges and recent filings; pickSample(n) applies the quotas; per picked issuer: regime = latest annual form
 * (10-K or 20-F); filings = latest inline 10-K + latest inline 10-Q, or latest inline 20-F; companyfacts and each
 * primary document are fetched and buildSampleFiling derives the keys → selection 'live/1'. A filing whose sides
 * are too small is skipped with a warning; unmet quotas are printed and give exit code 1 (the file is still
 * written for review).
 * The manifest is validated before it is written. Exit 0 ok, 1 on failure or unmet quota, 2 on bad arguments.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fetchCompanyFacts} from '../../src/lib/facts/providers/edgar-companyfacts';
import {budgetFor,padCik,snapshotOf} from '../../src/lib/facts/providers/shared';
import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
import {filerClass} from '../../src/lib/dq/reconcile/pair-us-ixbrl';
import {US_GOLD_PATH,usGoldEntries} from '../../src/lib/dq/reconcile/pair-us-gold';
import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,buildSampleFiling,pickSample,validateUsSample} from '../../src/lib/dq/reconcile/us-sample';
import type {SampleCandidate,SampleFiling,SampleIssuer,UsSample} from '../../src/lib/dq/reconcile/us-sample';

const USAGE='usage: select-us-sample.ts (--fixtures [--out <path>] [--generated-at <ISO>] | --live --universe <path> --out <path> [--n 30])';
const FIXTURE_SINCE_YEAR=2016;
const FIXTURES=[
 {ticker:'AAPL',cik:'320193',accn:'0000320193-23-000106',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
 {ticker:'MSFT',cik:'789019',accn:'0000950170-23-035122',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'},
] as const;
interface RecordingMeta{source_url:string;source_sha256:string;submissions:{form:string|null;reportDate:string|null;primaryDocument:string;isInlineXBRL:boolean;category:string|null}}

function fixtureSample(generatedAt:string):UsSample{
 const issuers:SampleIssuer[]=FIXTURES.map(fx=>{
  const meta=JSON.parse(readFileSync(`${fx.doc}.meta.json`,'utf8')) as RecordingMeta;
  const filing=buildSampleFiling({cik:fx.cik,accn:fx.accn,form:meta.submissions.form??'10-K',period_end:meta.submissions.reportDate,primary_document:meta.submissions.primaryDocument,doc_url:meta.source_url,
   is_inline_xbrl:meta.submissions.isInlineXBRL,submissions_category:meta.submissions.category,companyfacts:snapshotOf(new Uint8Array(readFileSync(fx.companyfacts)),{source:'edgar'}),
   doc:new Uint8Array(readFileSync(fx.doc)),doc_sha256:meta.source_sha256,sinceYear:FIXTURE_SINCE_YEAR});
  return {cik:fx.cik,ticker:fx.ticker,regime:'10-K',filings:[filing]};
 });
 return {schema:US_SAMPLE_SCHEMA,generated_at:generatedAt,selection:'fixture/1',issuers};
}

const UA=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function get(url:string):Promise<Uint8Array>{
 await pause(150);
 const res=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(60_000)});
 if(!res.ok)throw new Error(`http_${res.status} ${url}`);
 return new Uint8Array(await res.arrayBuffer());
}
const json=async<T>(url:string)=>JSON.parse(new TextDecoder().decode(await get(url))) as T;
interface Submissions{category?:string;fiscalYearEnd?:string;exchanges?:string[];filings?:{recent?:Record<string,unknown[]>}}
interface Recent{accn:string;form:string;filingDate:string;reportDate:string|null;primaryDocument:string;inline:boolean}
function recentOf(s:Submissions):Recent[]{
 const r=s.filings?.recent??{};const n=(r.accessionNumber??[]).length;const out:Recent[]=[];
 for(let i=0;i<n;i++)out.push({accn:String(r.accessionNumber![i]),form:String(r.form?.[i]??''),filingDate:String(r.filingDate?.[i]??''),reportDate:r.reportDate?.[i]?String(r.reportDate[i]):null,primaryDocument:String(r.primaryDocument?.[i]??''),inline:r.isInlineXBRL?.[i]===1||r.isInlineXBRL?.[i]===true});
 return out.sort((a,b)=>a.filingDate<b.filingDate?1:a.filingDate>b.filingDate?-1:0);
}

async function liveSample(universePath:string,n:number):Promise<{sample:UsSample;unmet:string[];warnings:string[]}>{
 const universe=JSON.parse(readFileSync(universePath,'utf8')) as {constituents:{ticker:string;exchange?:string}[]};
 const tickers=await json<Record<string,{cik_str:number;ticker:string}>>('https://www.sec.gov/files/company_tickers.json');
 const cikOf=new Map(Object.values(tickers).map(t=>[t.ticker.toUpperCase(),String(t.cik_str)]));
 const required=usGoldEntries(JSON.parse(readFileSync(US_GOLD_PATH,'utf8'))).entries.map(e=>e.ticker);
 const subs=new Map<string,Submissions>();const candidates:SampleCandidate[]=[];const warnings:string[]=[];
 for(const c of universe.constituents){
  const ticker=c.ticker.toUpperCase().replace(/\./g,'-');const cik=cikOf.get(ticker);
  if(!cik){warnings.push(`no CIK for ${c.ticker}`);continue;}
  const s=await json<Submissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`).catch(e=>{warnings.push(`${ticker}: ${(e as Error).message}`);return null;});
  if(!s)continue;
  subs.set(cik,s);
  candidates.push({ticker,cik,exchange:c.exchange==='NASDAQ'?'Nasdaq':c.exchange??s.exchanges?.[0]??null,fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
 }
 const {picked,unmet}=pickSample(candidates,required,n);
 const sinceYear=new Date().getUTCFullYear()-10;
 const issuers:SampleIssuer[]=[];
 for(const p of picked){
  const s=subs.get(p.cik)!;const recent=recentOf(s).filter(r=>r.inline);
  const annual=recent.find(r=>r.form==='10-K'||r.form==='20-F');
  if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
  const regime=annual.form as '10-K'|'20-F';
  const chosen=regime==='10-K'?[annual,recent.find(r=>r.form==='10-Q')].filter((x):x is Recent=>!!x):[annual];
  const companyfacts=await fetchCompanyFacts(padCik(p.cik),budgetFor(120_000));
  const filings:SampleFiling[]=[];
  for(const r of chosen){
   const url=`https://www.sec.gov/Archives/edgar/data/${p.cik}/${r.accn.replace(/-/g,'')}/${r.primaryDocument}`;
   try{filings.push(buildSampleFiling({cik:p.cik,accn:r.accn,form:r.form,period_end:r.reportDate,primary_document:r.primaryDocument,doc_url:url,is_inline_xbrl:r.inline,submissions_category:s.category??null,companyfacts,doc:await get(url),sinceYear}));}
   catch(e){warnings.push(`${p.ticker} ${r.accn}: ${(e as Error).message}`);}
  }
  if(filings.length>0)issuers.push({cik:p.cik,ticker:p.ticker,regime,filings});
 }
 return {sample:{schema:US_SAMPLE_SCHEMA,generated_at:new Date().toISOString(),selection:'live/1',issuers},unmet,warnings};
}

async function main(){
 const argv=process.argv.slice(2);let mode:''|'fixtures'|'live'='';let out='';let universe='';let n=30;let generatedAt=new Date().toISOString();
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--fixtures')mode='fixtures';
  else if(x==='--live')mode='live';
  else if(x==='--out'&&v){out=v;i++;}
  else if(x==='--universe'&&v){universe=v;i++;}
  else if(x==='--n'&&v&&/^\d{1,3}$/.test(v)){n=Number(v);i++;}
  else if(x==='--generated-at'&&v&&!Number.isNaN(Date.parse(v))){generatedAt=v;i++;}
  else{console.error(USAGE);process.exit(2);}
 }
 if(mode===''||(mode==='live'&&(!universe||!out))){console.error(USAGE);process.exit(2);}
 let sample:UsSample;let unmet:string[]=[];let warnings:string[]=[];
 if(mode==='fixtures'){sample=fixtureSample(generatedAt);out||=US_SAMPLE_PATH;}
 else ({sample,unmet,warnings}=await liveSample(universe,n));
 const v=validateUsSample(sample);
 if(!v.ok){console.error(JSON.stringify({invalid:v.errors}));process.exit(1);}
 writeFileSync(out,`${JSON.stringify(sample,null,1)}\n`);
 for(const w of warnings)console.error(`warning: ${w}`);
 console.log(JSON.stringify({out,selection:sample.selection,issuers:sample.issuers.length,filings:sample.issuers.reduce((k,i)=>k+i.filings.length,0),keys:sample.issuers.reduce((k,i)=>k+i.filings.reduce((m,f)=>m+f.expected_keys.length,0),0),unmet}));
 process.exit(unmet.length>0?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
