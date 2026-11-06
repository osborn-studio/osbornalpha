// Offline tests of the live sample generator (injected network, companyfacts and RawStore).
// The Apple fixtures stand in for every issuer; the CIK/ticker universe is synthetic where noted.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {snapshotOf} from '../../facts/providers/shared';
import {memoryRawStore} from '../raw-store';
import type {RawStore} from '../raw-store';
import {dedupeByCik,finalUnmet,liveSample,normalizeExchange} from './us-sample-live';
import type {LiveDeps} from './us-sample-live';
import {validateUsSample} from './us-sample';
import type {SampleCandidate} from './us-sample';

const enc=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x));
const file=(p:string)=>new Uint8Array(readFileSync(p));
const AAPL={cik:'320193',accn:'0000320193-23-000106',cf:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'};
const MSFT={cik:'789019',accn:'0000950170-23-035122',cf:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'};
const submissions=(x:typeof AAPL,primary:string)=>({category:'Large accelerated filer',fiscalYearEnd:'0930',exchanges:['Nasdaq'],filings:{recent:{accessionNumber:[x.accn],form:['10-K'],filingDate:['2023-11-03'],reportDate:['2023-09-30'],primaryDocument:[primary],isInlineXBRL:[1]}}});

function world(opts:{tickers:Record<string,string>;failCompanyfacts?:string[];failSubmissions?:Record<string,string>;failRefetch?:Record<string,string>;store?:RawStore}){
 const store=opts.store??memoryRawStore();
 const calls=new Map<string,number>();
 const byCik:Record<string,typeof AAPL>={[AAPL.cik]:AAPL,[MSFT.cik]:MSFT};
 const deps:LiveDeps={
  async get(url){
   if(url.endsWith('company_tickers.json'))return enc(Object.fromEntries(Object.entries(opts.tickers).map(([t,c],i)=>[String(i),{cik_str:Number(c),ticker:t}])));
   const sub=/submissions\/CIK0*(\d+)\.json$/.exec(url);
   if(sub){const n=(calls.get(sub[1])??0)+1;calls.set(sub[1],n);if(n>1&&opts.failRefetch?.[sub[1]])throw new Error(opts.failRefetch[sub[1]]);}
   if(sub&&opts.failSubmissions?.[sub[1]])throw new Error(opts.failSubmissions[sub[1]]);
   if(sub)return enc(submissions(byCik[sub[1]],byCik[sub[1]]===AAPL?'aapl-20230930.htm':'msft-20230630.htm'));
   const doc=/Archives\/edgar\/data\/(\d+)\//.exec(url);
   if(doc)return file(byCik[doc[1]].doc);
   throw new Error(`unexpected ${url}`);
  },
  async companyfacts(cik10){
   const c=byCik[String(Number(cik10))];
   if(opts.failCompanyfacts?.includes(c.cik))throw new Error('no_companyfacts');
   return snapshotOf(file(c.cf),{source:'edgar',url:`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`});
  },
  store,
  now:()=>'2026-11-06T00:00:00.000Z',
 };
 return {deps,store:store as ReturnType<typeof memoryRawStore>};
}
const cand=(ticker:string,cik:string):SampleCandidate=>({ticker,cik,exchange:'NYSE',fiscalYearEnd:'1231',acceleration:'large_accelerated'});

describe('dedupeByCik',()=>{
 it('keeps one issuer per CIK, preferring the required ticker (GOOG/GOOGL)',()=>{
  const cs=[cand('GOOG','1652044'),cand('GOOGL','1652044'),cand('AAPL','320193')];
  expect(dedupeByCik(cs,['GOOGL']).candidates.map(c=>c.ticker)).toEqual(['GOOGL','AAPL']);
  expect(dedupeByCik(cs,['GOOGL']).required).toEqual(['GOOGL']);
  expect(dedupeByCik(cs,[]).candidates.map(c=>c.ticker)).toEqual(['GOOG','AAPL']);
  // both tickers required: the CIK is covered once; a required ticker missing from the universe stays required
  expect(dedupeByCik(cs,['GOOG','GOOGL','ZZZ']).required).toEqual(['GOOG','ZZZ']);
 });
});

describe('liveSample',()=>{
 it('samples a dual-class CIK once and retains the exact bytes with provenance',async()=>{
  const {deps,store}=world({tickers:{GOOG:AAPL.cik,GOOGL:AAPL.cik,MSFT:MSFT.cik}});
  const r=await liveSample(deps,{universe:{constituents:[{ticker:'GOOG'},{ticker:'GOOGL'},{ticker:'MSFT'}]},required:['GOOGL','MSFT'],n:30});
  expect(r.sample.issuers.map(i=>[i.ticker,i.cik])).toEqual([['GOOGL','320193'],['MSFT','789019']]);
  for(const i of r.sample.issuers)for(const f of i.filings){
   const pv=f.provenance!;
   expect(pv.companyfacts.sha256).toBe(f.raw_sha256);
   expect(pv.document.sha256).toBe(f.doc_sha256);
   for(const ref of [pv.companyfacts,pv.submissions,pv.document])expect(store.objects.has(ref.path),ref.path).toBe(true);
   expect(Buffer.from(store.objects.get(pv.document.path)!).equals(Buffer.from(file(i.cik==='320193'?AAPL.doc:MSFT.doc)))).toBe(true);
  }
  expect(validateUsSample(r.sample).ok).toBe(true);
 });

 it('re-validates the final manifest: a dropped issuer and missing 10-Q coverage are unmet',async()=>{
  const {deps}=world({tickers:{AAPL:AAPL.cik,MSFT:MSFT.cik},failCompanyfacts:[MSFT.cik]});
  const r=await liveSample(deps,{universe:{constituents:[{ticker:'AAPL'},{ticker:'MSFT'}]},required:['AAPL','MSFT'],n:30});
  expect(r.sample.issuers.map(i=>i.ticker)).toEqual(['AAPL']);
  expect(r.unmet).toEqual(expect.arrayContaining(['issuers:1/2','required:MSFT','coverage:AAPL:10-Q']));
  expect(r.warnings.some(w=>w.startsWith('MSFT: companyfacts'))).toBe(true);
 });

 it('fails when retention fails, before any manifest is returned',async()=>{
  const bad:RawStore={sha256Of:memoryRawStore().sha256Of,put:()=>Promise.reject(new Error('raw_upload_failed'))};
  const {deps}=world({tickers:{AAPL:AAPL.cik},store:bad});
  await expect(liveSample(deps,{universe:{constituents:[{ticker:'AAPL'}]},required:['AAPL'],n:30})).rejects.toThrow('raw_upload_failed');
 });
});

describe('finalUnmet',()=>{
 it('is empty for a complete manifest and names every shortfall otherwise',()=>{
  const f=(form:string)=>({form}) as never;
  const sample={schema:'us-ixbrl-sample/1',generated_at:'x',selection:'live/1',issuers:[{cik:'1',ticker:'A',regime:'10-K',filings:[f('10-K'),f('10-Q')]},{cik:'2',ticker:'B',regime:'20-F',filings:[f('20-F')]}]} as never;
  const picked=[{...cand('A','1'),exchange:'NYSE'},{...cand('B','2'),exchange:'NYSE'}];
  expect(finalUnmet(sample,picked,['A','B']).filter(u=>!['nyse','nasdaq','fye_not_1231','not_large_accelerated'].includes(u))).toEqual([]);
  expect(finalUnmet(sample,[...picked,cand('C','3')],['A','C'])).toEqual(expect.arrayContaining(['issuers:2/3','required:C']));
 });
});

describe('universe scan and helpers',()=>{
 it('reports a failed universe submissions fetch as unmet and fails the run on HTTP 429',async()=>{
  const a=world({tickers:{AAPL:AAPL.cik,MSFT:MSFT.cik},failSubmissions:{[MSFT.cik]:'http_503 x'}});
  const r=await liveSample(a.deps,{universe:{constituents:[{ticker:'AAPL'},{ticker:'MSFT'}]},required:['AAPL'],n:30});
  expect(r.unmet).toContain('universe_fetch:MSFT');
  const b=world({tickers:{AAPL:AAPL.cik,MSFT:MSFT.cik},failSubmissions:{[MSFT.cik]:'http_429 x'}});
  await expect(liveSample(b.deps,{universe:{constituents:[{ticker:'AAPL'},{ticker:'MSFT'}]},required:['AAPL'],n:30})).rejects.toThrow('http_429');
 });
 it('normalises exchange case',()=>{
  expect([normalizeExchange('nasdaq'),normalizeExchange('NASDAQ'),normalizeExchange('nyse'),normalizeExchange('Cboe'),normalizeExchange(' '),normalizeExchange(undefined)]).toEqual(['Nasdaq','Nasdaq','NYSE','Cboe',null,null]);
 });
 it('drops an issuer whose submissions refetch fails (non-429) and reports it; 429 aborts',async()=>{
  const a=world({tickers:{AAPL:AAPL.cik,MSFT:MSFT.cik},failRefetch:{[MSFT.cik]:'network: timeout'}});
  const r=await liveSample(a.deps,{universe:{constituents:[{ticker:'AAPL'},{ticker:'MSFT'}]},required:['AAPL','MSFT'],n:30});
  expect(r.sample.issuers.map(i=>i.ticker)).toEqual(['AAPL']);
  expect(r.unmet).toEqual(expect.arrayContaining(['issuers:1/2','required:MSFT']));
  expect(r.warnings.some(w=>w.startsWith('MSFT: submissions'))).toBe(true);
  const b=world({tickers:{AAPL:AAPL.cik,MSFT:MSFT.cik},failRefetch:{[MSFT.cik]:'http_429 x'}});
  await expect(liveSample(b.deps,{universe:{constituents:[{ticker:'AAPL'},{ticker:'MSFT'}]},required:['AAPL','MSFT'],n:30})).rejects.toThrow('http_429');
 });
});
