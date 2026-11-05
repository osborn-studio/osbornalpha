// src/lib/facts/providers/edgar-companyfacts.test.ts
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Budget,ConceptDef} from '../types';
import {FACT_CONCEPTS} from '../concepts';
import {ProviderError,rawHashOf,snapshotOf,stringifyPreservingNumbers} from './shared';
import {companyFactsUrl,fetchCompanyFacts,parseCompanyFacts,resetSecPacing} from './edgar-companyfacts';
import {scanJsonNumbers} from '../json-numbers';

const budget=(ms:number):Budget=>({remainingMs:()=>ms,signal:new AbortController().signal});
const bytes=(s:string)=>new TextEncoder().encode(s);
const doc=(facts:Record<string,unknown>)=>snapshotOf(bytes(JSON.stringify({cik:320193,entityName:'T',facts})),{source:'edgar'});
const entry=(o:Record<string,unknown>)=>({accn:'0000320193-23-000106',fy:2023,fp:'FY',form:'10-K',filed:'2023-11-03',...o});
const revenue=FACT_CONCEPTS.find(c=>c.id==='revenue')!;
const assets=FACT_CONCEPTS.find(c=>c.id==='total_assets')!;
// Mocks are typed against the real callable (round-1 #5): a zero-argument vi.fn() has no call
// arguments to index, and `typeof fetch` takes RequestInfo | URL, not a bare string.
type FetchFn=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;

describe('fetchCompanyFacts',()=>{
 beforeEach(()=>{resetSecPacing();});
 afterEach(()=>{vi.useRealTimers();});
 const ok=()=>new Response('{"cik":320193,"facts":{}}',{status:200,headers:{'content-length':'25'}});
 it('backs off 1/2/4/8 s on 429/503 and keeps the 120 ms pace, then returns a sha256-stamped snapshot',async()=>{
  let t=1_000_000;const now=()=>t;
  const waits:number[]=[];const sleep=vi.fn(async(ms:number)=>{waits.push(ms);t+=ms;});
  let attempts=0;   // own counter: an initializer that reads `fetch.mock.calls` refers to the variable being declared (TS7022/TS7024, round-2 #5)
  const fetch=vi.fn<FetchFn>(async()=>{attempts++;t+=10;return attempts<3?new Response('',{status:attempts===1?429:503}):ok();});
  const s=await fetchCompanyFacts('0000320193',budget(300_000),{fetch,sleep,now,userAgent:'ua'});
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[0][0]).toBe(companyFactsUrl('0000320193'));
  expect(fetch.mock.calls[0][1]?.headers).toMatchObject({'User-Agent':'ua','Accept-Encoding':'gzip, deflate'});
  expect(waits.filter(w=>w>=1000)).toEqual([1000,2000]);
  expect(waits.filter(w=>w<1000).every(w=>w<=120)).toBe(true);
  expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);expect(s.meta).toMatchObject({source:'edgar',http_status:200,url:companyFactsUrl('0000320193')});
 });
 it('maps 404 → no_companyfacts, exhausted retries → sec_unavailable, >50 MB → snapshot_too_large, no budget → sec_unavailable without a request',async()=>{
  const sleep=async()=>{};
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:async()=>new Response('',{status:404}),sleep})).rejects.toMatchObject({code:'no_companyfacts'});
  const always429=vi.fn<FetchFn>(async()=>new Response('',{status:429}));
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:always429,sleep})).rejects.toMatchObject({code:'sec_unavailable'});
  expect(always429).toHaveBeenCalledTimes(5);
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:async()=>new Response('{}',{status:200,headers:{'content-length':String(51*1024*1024)}}),sleep})).rejects.toMatchObject({code:'snapshot_too_large'});
  const noCall=vi.fn();
  await expect(fetchCompanyFacts('0000000001',budget(15_000),{fetch:noCall,sleep})).rejects.toMatchObject({code:'sec_unavailable'});
  expect(noCall).not.toHaveBeenCalled();
  await expect(fetchCompanyFacts('320193',budget(300_000),{fetch:noCall,sleep})).rejects.toBeInstanceOf(ProviderError);
 });
});

describe('parseCompanyFacts (synthetic documents)',()=>{
 it('decodes val as canonical decimal and control fields as numbers; 20-digit integers survive',()=>{
  // Literals are spliced into the JSON text: a JS number would already have lost the 20 digits.
  const text=JSON.stringify({cik:320193,facts:{'us-gaap':{Revenues:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:'@1'}),entry({start:'2021-09-26',end:'2022-09-24',val:'@2'})]}}}}}).replace('"@1"','1e5').replace('"@2"','12345678901234567890');
  const s=snapshotOf(bytes(text),{source:'edgar'});
  const r=parseCompanyFacts(s,{concepts:[revenue],sinceYear:2019});
  expect(r.candidates.map(c=>c.value).sort()).toEqual(['100000','12345678901234567890']);
  expect(r.filings[0]).toMatchObject({sourceRef:'0000320193-23-000106',fiscalYear:2023,fiscalPeriod:'FY',formType:'10-K',availableDate:'2023-11-03',periodEnd:'2023-09-30',origin:'sec',source:'edgar',market:'US'});
  expect(r.filings[0].url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/');
  for(const c of r.candidates){expect('fy' in c).toBe(false);expect('frame' in c).toBe(false);expect(c.rawHash).toMatch(/^[0-9a-f]{64}$/);}
 });
 it('takes the first tag with an entry per (accn,start,end,unit); lower tags only fill missing periods',()=>{
  const s=doc({'us-gaap':{Revenues:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:1})]}},RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:2}),entry({start:'2021-09-26',end:'2022-09-24',val:3})]}}}});
  const r=parseCompanyFacts(s,{concepts:[revenue],sinceYear:2019});
  expect(r.candidates.map(c=>[c.periodEnd,c.value,c.sourceConcept])).toEqual([['2023-09-30','1','us-gaap:Revenues'],['2022-09-24','3','us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax']]);
 });
 it('same tag, same key, different val → ambiguous with frame in the payload and nothing in candidates',()=>{
  const s=doc({'us-gaap':{Revenues:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:1,frame:'CY2023'}),entry({start:'2022-09-25',end:'2023-09-30',val:2})]}},RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:9})]}}}});
  const r=parseCompanyFacts(s,{concepts:[revenue],sinceYear:2019});
  expect(r.candidates).toEqual([]);
  expect(r.ambiguous).toHaveLength(1);
  expect(r.ambiguous[0].candidates.map(c=>(c as {frame?:string|null}).frame)).toEqual(['CY2023',null]);
 });
 it('instant concepts ignore duration entries, odd durations go to oddDuration with periodDays, missing filed → missingAvailableDate, unit normalised',()=>{
  const s=doc({'us-gaap':{Assets:{units:{USD:[entry({end:'2023-09-30',val:5}),entry({start:'2022-09-25',end:'2023-09-30',val:6})]}},Revenues:{units:{USD:[entry({start:'2023-01-01',end:'2023-05-15',val:7}),{...entry({start:'2022-09-25',end:'2023-09-30',val:8}),filed:undefined}]}}}});
  const r=parseCompanyFacts(s,{concepts:[revenue,assets],sinceYear:2019});
  expect(r.candidates).toEqual([expect.objectContaining({concept:'total_assets',duration:'INSTANT',periodStart:null,value:'5',unit:'USD'})]);
  expect(r.oddDuration).toEqual([expect.objectContaining({concept:'revenue',periodDays:134,duration:'3M'})]);
  expect(r.missingAvailableDate).toEqual([expect.objectContaining({accn:'0000320193-23-000106',tag:'us-gaap:Revenues'})]);
  expect(r.skipped).toContainEqual({reason:'nature_mismatch:us-gaap:Assets',n:1});
 });
 it('dei: tags resolve in facts.dei; sinceYear drops older entries; ifrs-full tags are read after us-gaap',()=>{
  const shares=FACT_CONCEPTS.find(c=>c.id==='shares_outstanding')!;
  const ifrsRevenue:ConceptDef={...revenue,usGaap:[],ifrs:['Revenue']};
  const s=doc({dei:{EntityCommonStockSharesOutstanding:{units:{shares:[entry({end:'2023-10-20',val:15550061000}),entry({end:'2018-10-20',val:1})]}}},'ifrs-full':{Revenue:{units:{CNY:[entry({start:'2023-01-01',end:'2023-12-31',val:3})]}}}});
  const r=parseCompanyFacts(s,{concepts:[shares,ifrsRevenue],sinceYear:2019});
  expect(r.candidates).toEqual([expect.objectContaining({concept:'shares_outstanding',sourceConcept:'dei:EntityCommonStockSharesOutstanding',unit:'shares',value:'15550061000'}),expect.objectContaining({concept:'revenue',sourceConcept:'ifrs-full:Revenue',unit:'CNY'})]);
  expect(r.skipped).toContainEqual({reason:'before_since_year',n:1});
 });
 it('rejects documents without cik/facts as parse_error',()=>{
  const codeOf=(fn:()=>unknown)=>{try{fn();return null;}catch(e){return e instanceof ProviderError?e.code:'not_provider_error';}};
  expect(codeOf(()=>parseCompanyFacts(snapshotOf(bytes('{"facts":{}}'),{source:'edgar'})))).toBe('parse_error');
  expect(codeOf(()=>parseCompanyFacts(snapshotOf(bytes('{nope'),{source:'edgar'})))).toBe('parse_error');
 });
});

describe('stringifyPreservingNumbers',()=>{
 it('re-serialises a scanJsonNumbers tree with the original literals',()=>{
  const src='{"a":1e5,"b":12345678901234567890,"c":[-0.0,"1e5"],"d":{"val":383285000000}}';
  expect(stringifyPreservingNumbers(scanJsonNumbers(bytes(src)))).toBe(src);
 });
});

const fx=(n:string)=>snapshotOf(new Uint8Array(readFileSync(new URL(`../fixtures/edgar/${n}`,import.meta.url))),{source:'edgar'});
const canonical=/^-?(0|[1-9]\d*)(\.\d*[1-9])?$/;
describe('parseCompanyFacts (recorded AAPL / MSFT fixtures)',()=>{
 const aapl=parseCompanyFacts(fx('CIK0000320193.trimmed.json'),{sinceYear:2019});
 const msft=parseCompanyFacts(fx('CIK0000789019.trimmed.json'),{sinceYear:2019});
 it('AAPL FY2023 revenue comes from the 2023-11-03 10-K via the second us-gaap tag, re-disclosed by later 10-Ks',()=>{
  const fy23=aapl.candidates.filter(c=>c.concept==='revenue'&&c.periodEnd==='2023-09-30'&&c.duration==='12M');
  expect(fy23.length).toBeGreaterThanOrEqual(2);
  expect(fy23.find(c=>c.filingRef==='0000320193-23-000106')).toMatchObject({value:'383285000000',unit:'USD',periodStart:'2022-09-25',sourceConcept:'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',statement:'IS'});
  expect(aapl.filings.find(f=>f.sourceRef==='0000320193-23-000106')).toMatchObject({formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',availableDate:'2023-11-03',periodEnd:'2023-09-30'});
  expect(new Set(fy23.map(c=>c.value)).size).toBe(1);
 });
 it('MSFT FY2023 (2023-06-30) revenue is a 10-K FY row in USD',()=>{
  const row=msft.candidates.find(c=>c.concept==='revenue'&&c.periodEnd==='2023-06-30'&&c.duration==='12M');
  expect(row).toBeDefined();
  expect(msft.filings.find(f=>f.sourceRef===row!.filingRef)).toMatchObject({formType:'10-K',fiscalPeriod:'FY',fiscalYear:2023});
  expect(row!.value).toBe('211915000000');
 });
 it('every candidate is canonical, keyed to a filing, instant iff no start; filings are sorted by availableDate',()=>{
  for(const r of [aapl,msft]){
   const refs=new Set(r.filings.map(f=>f.sourceRef));
   for(const c of r.candidates){expect(c.value).toMatch(canonical);expect(refs.has(c.filingRef)).toBe(true);expect(c.periodStart===null).toBe(c.duration==='INSTANT');expect(c.consolidation).toBe('consolidated');}
   for(const f of r.filings){expect(f.availableDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);expect(['10-K','10-Q','10-K/A','10-Q/A','other']).toContain(f.formType);}
   expect(r.filings.map(f=>f.availableDate)).toEqual([...r.filings.map(f=>f.availableDate)].sort());
   expect(r.missingAvailableDate).toEqual([]);
   expect(r.candidates.some(c=>c.concept==='total_assets'&&c.duration==='INSTANT')).toBe(true);
   expect(r.candidates.some(c=>c.concept==='revenue'&&c.duration==='3M')).toBe(true);
  }
 });
 it('the revised fixture adds exactly one later FY2023 revenue disclosure with a different value',()=>{
  const rev=parseCompanyFacts(fx('CIK0000320193.revised.json'),{sinceYear:2019});
  const added=rev.candidates.filter(c=>c.concept==='revenue'&&c.periodEnd==='2023-09-30'&&c.duration==='12M'&&c.filingRef==='0000320193-25-900001');
  expect(added).toEqual([expect.objectContaining({value:'383285000001',periodStart:'2022-09-25'})]);
  expect(rev.filings.find(f=>f.sourceRef==='0000320193-25-900001')).toMatchObject({availableDate:'2025-11-01',formType:'10-K',fiscalYear:2025});
  expect(rev.candidates.length).toBe(aapl.candidates.length+1);
 });
});

describe('parseCompanyFacts (landed-code additions)',()=>{
 const shares=FACT_CONCEPTS.find(c=>c.id==='shares_outstanding')!;
 it('shares_outstanding: dei tag yields statement DEI, us-gaap tag keeps BS',()=>{
  const dei=parseCompanyFacts(doc({dei:{EntityCommonStockSharesOutstanding:{units:{shares:[entry({end:'2023-10-20',val:15550061000})]}}}}),{concepts:[shares],sinceYear:2019});
  expect(dei.candidates).toEqual([expect.objectContaining({statement:'DEI',sourceConcept:'dei:EntityCommonStockSharesOutstanding'})]);
  const gaap=parseCompanyFacts(doc({'us-gaap':{CommonStockSharesOutstanding:{units:{shares:[entry({end:'2023-09-30',val:15550061000})]}}}}),{concepts:[shares],sinceYear:2019});
  expect(gaap.candidates).toEqual([expect.objectContaining({statement:'BS',sourceConcept:'us-gaap:CommonStockSharesOutstanding'})]);
 });
 it('missingAvailableDate rows carry the fields sync.ts keys on (accn, tag, start, end, unit)',()=>{
  const r=parseCompanyFacts(doc({'us-gaap':{Revenues:{units:{USD:[{...entry({start:'2022-09-25',end:'2023-09-30',val:8}),filed:undefined}]}}}}),{concepts:[revenue],sinceYear:2019});
  expect(r.missingAvailableDate).toEqual([expect.objectContaining({accn:'0000320193-23-000106',tag:'us-gaap:Revenues',start:'2022-09-25',end:'2023-09-30',unit:'USD'})]);
 });
 it('an undecodable or non-date entry is skipped as entry_shape, not thrown',()=>{
  const r=parseCompanyFacts(doc({'us-gaap':{Revenues:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:'abc'}),entry({start:'2022-02-30',end:'2023-09-30',val:1})]}}}}),{concepts:[revenue],sinceYear:2019});
  expect(r.candidates).toEqual([]);expect(r.skipped).toContainEqual({reason:'entry_shape',n:2});
 });
 it('raw_hash is sha256(snapshot.sha256 + newline + row-level locator with the array index)',()=>{
  const s=doc({'us-gaap':{Revenues:{units:{USD:[entry({start:'2022-09-25',end:'2023-09-30',val:1})]}}}});
  const r=parseCompanyFacts(s,{concepts:[revenue],sinceYear:2019});
  expect(r.candidates[0].rawHash).toBe(rawHashOf(s.sha256,'facts.us-gaap.Revenues.units.USD[0](accn=0000320193-23-000106,start=2022-09-25,end=2023-09-30)'));
 });
});

describe('review follow-up: selection, odd durations, locators, evidence',()=>{
 const base={start:'2022-09-25',end:'2023-09-30'};
 const P={concepts:[revenue],sinceYear:2019};
 it('an undated higher-priority row claims its slot: it parks as missing_available_date and the lower tag does not substitute',()=>{
  const s=doc({'us-gaap':{Revenues:{units:{USD:[{...entry({...base,val:1,frame:'CY2023'}),filed:undefined}]}},RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[entry({...base,val:2})]}}}});
  const r=parseCompanyFacts(s,P);
  expect(r.candidates).toEqual([]);
  expect(r.missingAvailableDate).toEqual([expect.objectContaining({accn:'0000320193-23-000106',tag:'us-gaap:Revenues',start:base.start,end:base.end,unit:'USD',value:'1',frame:'CY2023',snapshot_sha256:s.sha256,locator:'facts.us-gaap.Revenues.units.USD[0](accn=0000320193-23-000106,start=2022-09-25,end=2023-09-30)'})]);
 });
 it('same tag, one undated value 1 and one dated value 2 → ambiguous (either order), not a silent 2',()=>{
  const undated={...entry({...base,val:1}),filed:undefined},dated=entry({...base,val:2});
  for(const list of [[undated,dated],[dated,undated]]){
   const r=parseCompanyFacts(doc({'us-gaap':{Revenues:{units:{USD:list}}}}),P);
   expect(r.candidates).toEqual([]);expect(r.missingAvailableDate).toEqual([]);
   expect(r.ambiguous).toHaveLength(1);expect(r.ambiguous[0].candidates.map(c=>c.value).sort()).toEqual(['1','2']);
  }
 });
 it('odd duration: disagreement → ambiguous; agreement → every entry parked; same result in both input orders',()=>{
  const odd={start:'2023-01-01',end:'2023-05-15'};
  for(const [a,b] of [[1,2],[2,1]]){
   const r=parseCompanyFacts(doc({'us-gaap':{Revenues:{units:{USD:[entry({...odd,val:a}),entry({...odd,val:b})]}}}}),P);
   expect(r.oddDuration).toEqual([]);expect(r.ambiguous).toHaveLength(1);expect(r.ambiguous[0].candidates.map(c=>c.value).sort()).toEqual(['1','2']);
  }
  const same=parseCompanyFacts(doc({'us-gaap':{Revenues:{units:{USD:[entry({...odd,val:1}),entry({...odd,val:1,accn:'0000320193-23-000106'})]}}}}),P);
  expect(same.oddDuration).toHaveLength(2);expect(same.oddDuration.every(c=>(c as {periodDays?:number}).periodDays===134)).toBe(true);
  expect(new Set(same.oddDuration.map(c=>c.rawHash)).size).toBe(2);
 });
 it('every source row has a distinct rawHash and exposes its locator', ()=>{
  const r=parseCompanyFacts(doc({'us-gaap':{Revenues:{units:{USD:[entry({...base,val:1}),entry({...base,val:1,filed:'2024-01-01'})]}}}}),P);
  expect(r.candidates).toHaveLength(1);
  expect((r.candidates[0] as {locator?:string}).locator).toContain('[0](accn=');
 });
 it('unit_not_allowed is counted per entry', ()=>{
  const r=parseCompanyFacts(doc({'us-gaap':{Revenues:{units:{shares:[entry({...base,val:1}),entry({...base,val:2})]}}}}),P);
  expect(r.skipped).toContainEqual({reason:'unit_not_allowed:us-gaap:Revenues:shares',n:2});
 });
});

describe('fetchCompanyFacts: pacing and body failures',()=>{
 beforeEach(()=>{resetSecPacing();});
 afterEach(()=>{vi.useRealTimers();});
 it('12 concurrent calls start at least 120 ms apart',async()=>{
  vi.useFakeTimers();
  const starts:number[]=[];
  const fetch=vi.fn<FetchFn>(async()=>{starts.push(Date.now());return new Response('{"cik":1,"facts":{}}',{status:200});});
  const calls=Array.from({length:12},()=>fetchCompanyFacts('0000000001',budget(300_000),{fetch,userAgent:'ua'}));
  await vi.advanceTimersByTimeAsync(5000);
  await Promise.all(calls);
  expect(starts).toHaveLength(12);
  for(let i=1;i<starts.length;i++)expect(starts[i]-starts[i-1]).toBeGreaterThanOrEqual(120);
 });
 it('a body failure is retried like a network error and ends as sec_unavailable; too-large stays non-retryable',async()=>{
  const sleep=async()=>{};
  const broken=()=>new Response(new ReadableStream({start(c){c.error(new Error('socket hang up'));}}),{status:200});
  const failing=vi.fn<FetchFn>(async()=>broken());
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:failing,sleep})).rejects.toMatchObject({code:'sec_unavailable'});
  expect(failing).toHaveBeenCalledTimes(5);
  let n=0;
  const flaky=vi.fn<FetchFn>(async()=>(++n<2?broken():new Response('{"cik":1,"facts":{}}',{status:200})));
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:flaky,sleep})).resolves.toMatchObject({meta:{http_status:200}});
  expect(flaky).toHaveBeenCalledTimes(2);
  const big=vi.fn<FetchFn>(async()=>new Response('{}',{status:200,headers:{'content-length':String(51*1024*1024)}}));
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:big,sleep})).rejects.toMatchObject({code:'snapshot_too_large'});
  expect(big).toHaveBeenCalledTimes(1);
 });
 it('a per-request timeout (AbortError) is wrapped as sec_unavailable, not a deadline abort',async()=>{
  const timeout=vi.fn<FetchFn>(async()=>{throw new DOMException('The operation was aborted','AbortError');});
  await expect(fetchCompanyFacts('0000000001',budget(300_000),{fetch:timeout,sleep:async()=>{}})).rejects.toMatchObject({code:'sec_unavailable',name:'SyncError'});
  expect(timeout).toHaveBeenCalledTimes(5);
 });
});
