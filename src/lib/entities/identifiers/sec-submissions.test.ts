// src/lib/entities/identifiers/sec-submissions.test.ts
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {memoryRawStore} from '../../dq/raw-store';
import {budgetFor,createPacer} from '../../facts/providers/shared';
import {fetchCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {sanitizeProvenance} from '../provenance';
import {
 SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
 submissionsCategory,submissionsClient,submissionsEvidenceClaims,submissionsUrl,
} from './sec-submissions';

const read=(rel:string)=>readFileSync(new URL(rel,import.meta.url),'utf8');
const PLTR=read('../../research/ingest/__fixtures__/collectors/edgar-submissions-1321655.json');
const MAIN=read('../fixtures/sec-submissions/zz-main.json');
const PAGE=read('../fixtures/sec-submissions/zz-page-001.json');
const ISSUER='10000000-0000-4000-8000-000000000009';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');

function harness(map:Record<string,()=>Response>){
 const calls:{url:string;init:RequestInit}[]=[];const sleeps:number[]=[];let t=0;
 const fetch=(async(u:string|URL|Request,init?:RequestInit)=>{const url=String(u);calls.push({url,init:init??{}});const r=map[url];if(!r)throw new TypeError(`fetch failed: ${url}`);return r();}) as typeof globalThis.fetch;
 const raw=memoryRawStore();
 return {calls,sleeps,raw,deps:{fetch,raw,pacer:createPacer(SEC_MIN_INTERVAL_MS),userAgent:'ZZ test ua@example.com',now:()=>t,sleep:async(ms:number)=>{sleeps.push(ms);t+=ms;},clock:()=>new Date('2026-11-05T08:00:00Z')}};
}
const json=(s:string)=>()=>new Response(s,{status:200,headers:{'content-type':'application/json'}});
const MAIN_URL='https://data.sec.gov/submissions/CIK0000999001.json';
const PAGE_URL='https://data.sec.gov/submissions/CIK0000999001-submissions-001.json';

describe('parseSubmissions',()=>{
 it('parses the landed PLTR fixture: category, fiscal year end, former names, tickers, 40 recent filings, no pages',()=>{
  const p=parseSubmissions(PLTR);
  expect(p).toMatchObject({cik:'1321655',name:'Palantir Technologies Inc.',category:'Large accelerated filer',fiscalYearEnd:'1231',tickers:['PLTR'],exchanges:['Nasdaq'],files:[]});
  expect(submissionsCategory(p.category)).toBe('large_accelerated');
  expect(p.formerNames).toEqual([{name:'Palantir Technologies Inc',from:'2005-03-22T05:00:00.000Z',to:'2011-09-07T04:00:00.000Z'}]);
  expect(p.filings).toHaveLength(40);
  expect(p.filings.every(f=>f.page==='recent'&&/^\d{10}-\d{2}-\d{6}$/.test(f.accessionNumber))).toBe(true);
 });
 it('maps empty strings to null, 0/1 to booleans, and lists pages',()=>{
  const p=parseSubmissions(MAIN);
  expect(p.fiscalYearEnd).toBe('0630');
  expect(p.filings[1]).toEqual({accessionNumber:'0000999001-25-000031',filingDate:'2025-09-12',reportDate:null,acceptanceDateTime:'2025-09-12T09:00:00.000Z',form:'25-NSE',primaryDocument:'xslF25X02/primary_doc.xml',isInlineXBRL:false,page:'recent'});
  expect(p.files).toEqual([{name:'CIK0000999001-submissions-001.json',filingCount:2,filingFrom:'2001-02-03',filingTo:'2014-12-31'}]);
  expect(parseSubmissionsPage(PAGE,'CIK0000999001-submissions-001.json').map(f=>[f.form,f.page])).toEqual([['10-Q','CIK0000999001-submissions-001.json'],['8-A12B','CIK0000999001-submissions-001.json']]);
 });
 it('reads filer categories: only SRC (or nothing) is unknown',()=>{
  expect(submissionsCategory('Large accelerated filer')).toBe('large_accelerated');
  expect(submissionsCategory('Accelerated filer')).toBe('accelerated');
  expect(submissionsCategory('Accelerated filer<br>Smaller reporting company')).toBe('accelerated');
  expect(submissionsCategory('Non-accelerated filer')).toBe('non_accelerated');
  expect(submissionsCategory('Non-accelerated filer<br>Smaller reporting company')).toBe('non_accelerated');
  expect(submissionsCategory('Smaller reporting company')).toBe('unknown');
  expect(submissionsCategory('')).toBe('unknown');expect(submissionsCategory(null)).toBe('unknown');
 });
 it('separates absent or malformed tickers/files (invalid_schema) from valid empty lists',()=>{
  const doc=JSON.parse(MAIN);
  const code=(d:unknown)=>{try{parseSubmissions(JSON.stringify(d));return null;}catch(e){return e instanceof SecSubmissionsError?e.code:'other';}};
  const {tickers:_t,...noTickers}=doc;void _t;
  expect(code(noTickers)).toBe('invalid_schema');
  expect(code({...doc,tickers:'ZZFX'})).toBe('invalid_schema');
  expect(code({...doc,tickers:[1]})).toBe('invalid_schema');
  expect(code({...doc,filings:{recent:doc.filings.recent}})).toBe('invalid_schema');
  expect(code({...doc,filings:{...doc.filings,files:{}}})).toBe('invalid_schema');
  const blank=parseSubmissions(JSON.stringify({...doc,tickers:['',' zzfx ']}));
  expect(blank).toMatchObject({tickers:['ZZFX'],tickerPositions:[1]});
  expect(code({...doc,tickers:[],filings:{...doc.filings,files:[]}})).toBeNull();
  expect(parseSubmissions(JSON.stringify({...doc,tickers:[],filings:{...doc.filings,files:[]}}))).toMatchObject({tickers:[],files:[]});
 });
 it('rejects malformed documents with invalid_schema',()=>{
  const bad=(s:string)=>{try{parseSubmissions(s);return null;}catch(e){return e instanceof SecSubmissionsError?e.code:'other';}};
  expect(bad('{')).toBe('invalid_schema');
  const doc=JSON.parse(MAIN);
  expect(bad(JSON.stringify({...doc,cik:'abc'}))).toBe('invalid_schema');
  expect(bad(JSON.stringify({...doc,filings:{...doc.filings,recent:{...doc.filings.recent,form:['10-Q']}}}))).toBe('invalid_schema');
  expect(bad(JSON.stringify({...doc,filings:{...doc.filings,files:[{name:'../../etc/passwd'}]}}))).toBe('invalid_schema');
 });
});

describe('submissionsClient',()=>{
 it('fetches the main document only by default, with the declared User-Agent, and stores its bytes',async()=>{
  const h=harness({[MAIN_URL]:json(MAIN)});
  const s=await fetchSubmissions('999001',h.deps);
  expect(submissionsUrl('0000999001')).toBe(MAIN_URL);
  expect(h.calls.map(c=>c.url)).toEqual([MAIN_URL]);
  expect((h.calls[0].init.headers as Record<string,string>)['User-Agent']).toBe('ZZ test ua@example.com');
  expect(s).toMatchObject({cik:'999001',fetchedAt:'2026-11-05T08:00:00.000Z',main:{name:'main',sha256:sha(MAIN)},pages:[],complete:false});
  expect(s.parsed.filings).toHaveLength(3);
  expect(h.raw.objects.size).toBe(2);   // the document + its .meta.json sidecar
 });
 it('fetches the pages a coverFrom date needs, 120 ms apart, merging filings by accession',async()=>{
  const h=harness({[MAIN_URL]:json(MAIN),[PAGE_URL]:json(PAGE)});
  const s=await submissionsClient(h.deps).fetch('999001',{coverFrom:'2001-01-01'});
  expect(h.calls.map(c=>c.url)).toEqual([MAIN_URL,PAGE_URL]);
  expect(h.sleeps).toEqual([SEC_MIN_INTERVAL_MS]);
  expect(s.complete).toBe(true);
  expect(s.pages).toEqual([{name:'CIK0000999001-submissions-001.json',sha256:sha(PAGE),path:expect.any(String)}]);
  expect(s.parsed.filings.map(f=>f.form)).toEqual(['10-Q','25-NSE','10-K','10-Q','8-A12B']);
  expect(filingsByAccession(s.parsed).get('0000999001-01-000001')?.page).toBe('CIK0000999001-submissions-001.json');
  const later=await submissionsClient(harness({[MAIN_URL]:json(MAIN)}).deps).fetch('999001',{coverFrom:'2015-01-01'});
  expect(later.pages).toEqual([]);expect(later.complete).toBe(false);
 });
 it('keeps the User-Agent (which may hold an email) out of raw metadata, and stores failure bodies before reporting them',async()=>{
  const h=harness({[MAIN_URL]:json(MAIN)});
  await fetchSubmissions('999001',h.deps);
  const meta=[...h.raw.objects].filter(([p])=>p.endsWith('.meta.json')).map(([,b])=>new TextDecoder().decode(b)).join('');
  expect(meta).not.toContain('example.com');expect(meta).toContain('"cik":"999001"');
  const f=harness({[MAIN_URL]:()=>new Response('nope',{status:503})});
  await expect(fetchSubmissions('999001',f.deps)).rejects.toMatchObject({code:'sec_unavailable'});
  expect(f.raw.objects.size).toBe(2);
  const err=await fetchSubmissions('999001',{...f.deps,pacer:createPacer(SEC_MIN_INTERVAL_MS)}).catch((e:unknown)=>e) as SecSubmissionsError;
  expect(err.raw).toEqual({sha256:sha('nope'),path:expect.stringMatching(/^sec-submissions\/[0-9a-f]{64}\.json$/)});
  expect([...f.raw.objects.keys()]).toContain(err.raw!.path);
  const bad=await fetchSubmissions('999001',harness({[MAIN_URL]:json('{"cik":"0000999001"}')}).deps).catch((e:unknown)=>e) as SecSubmissionsError;
  expect(bad).toMatchObject({code:'invalid_schema',raw:{sha256:sha('{"cik":"0000999001"}')}});
  expect(JSON.parse(new TextDecoder().decode([...f.raw.objects].find(([p])=>p.endsWith('.meta.json'))![1]))).toMatchObject({http_status:503});
 });
 it('starts no request and no upload once the budget is aborted',async()=>{
  const h=harness({[MAIN_URL]:json(MAIN)});
  const ctl=new AbortController();ctl.abort();
  const budget={remainingMs:()=>60_000,signal:ctl.signal};
  await expect(fetchSubmissions('999001',{...h.deps,budget})).rejects.toMatchObject({code:'sec_unavailable'});
  expect(h.calls).toEqual([]);expect(h.raw.objects.size).toBe(0);
 });
 it('spaces successive and concurrent calls through the shared process-wide pacer when none is injected',async()=>{
  const stamps:number[]=[];
  const f=(async()=>{stamps.push(Date.now());return new Response(MAIN,{status:200});}) as typeof globalThis.fetch;
  const deps={fetch:f,raw:memoryRawStore()};
  await fetchSubmissions('999001',deps);
  await Promise.all([fetchSubmissions('999001',deps),fetchSubmissions('999001',{...deps,raw:memoryRawStore()})]);
  await submissionsClient(deps).fetch('999001');
  expect(stamps).toHaveLength(4);
  for(let i=1;i<stamps.length;i++)expect(stamps[i]-stamps[i-1]).toBeGreaterThanOrEqual(SEC_MIN_INTERVAL_MS-5);
 });
 it('shares one SEC pacer with companyfacts: a companyfacts call and a submissions call are >= 120 ms apart',async()=>{
  const stamps:number[]=[];
  const f=(async()=>{stamps.push(Date.now());return new Response(MAIN,{status:200});}) as typeof globalThis.fetch;
  await fetchCompanyFacts('0000999001',budgetFor(60_000),{fetch:f});
  await fetchSubmissions('999001',{fetch:f,raw:memoryRawStore()});
  await fetchCompanyFacts('0000999001',budgetFor(60_000),{fetch:f});
  expect(stamps).toHaveLength(3);
  for(let i=1;i<3;i++)expect(stamps[i]-stamps[i-1]).toBeGreaterThanOrEqual(SEC_MIN_INTERVAL_MS-5);
 });
 it('maps HTTP errors and network failures to sec_unavailable and a CIK mismatch to invalid_schema',async()=>{
  const code=async(p:Promise<unknown>)=>p.then(()=>null,(e:unknown)=>e instanceof SecSubmissionsError?e.code:'other');
  expect(await code(fetchSubmissions('999001',harness({[MAIN_URL]:()=>new Response('nope',{status:404})}).deps))).toBe('sec_unavailable');
  expect(await code(fetchSubmissions('999001',harness({}).deps))).toBe('sec_unavailable');
  expect(await code(fetchSubmissions('999002',harness({'https://data.sec.gov/submissions/CIK0000999002.json':json(MAIN)}).deps))).toBe('invalid_schema');
 });
});

describe('submissionsEvidenceClaims',()=>{
 it('files one evidence_only claim per 8-A/25 filing, citing the document that lists it, with no security or date prefilled',async()=>{
  const h=harness({[MAIN_URL]:json(MAIN),[PAGE_URL]:json(PAGE)});
  const s=await fetchSubmissions('999001',h.deps,{coverFrom:'1993-01-01'});
  const claims=submissionsEvidenceClaims(ISSUER,s,'2026-11-05');
  expect(claims.map(c=>[c.op,c.id_type,c.value,c.source])).toEqual([['evidence_only','ticker','0000999001-25-000031','sec_submissions'],['evidence_only','ticker','0000999001-01-000001','sec_submissions']]);
  expect(claims[0].detail).toEqual({schema:'claim/1',evidence_kind:'filing_form',target:{issuer_id:ISSUER},
   params:{suggested_op:'close_security',accession:'0000999001-25-000031',form:'25-NSE',filing_date:'2025-09-12',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
   evidence:{source:'sec_submissions',as_of:'2026-11-05',evidence_sha256:sha(MAIN),locator:'recent#accessionNumber=0000999001-25-000031',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
   sources:[claims[0].detail.evidence]});
  expect(claims[1].detail.params).toMatchObject({suggested_op:'backdate_window',form:'8-A12B'});
  expect(claims[1].detail.evidence.evidence_sha256).toBe(sha(PAGE));
  expect(claims[1].detail.evidence.locator).toBe('CIK0000999001-submissions-001.json#accessionNumber=0000999001-01-000001');
  // locators and evidence must pass the public-provenance guards (no '?' query, no key=/token: text; the plan's '#accessionNumber=' form is verified to pass them)
  for(const c of claims)expect(()=>sanitizeProvenance({valid_from:c.detail.evidence},['valid_from'])).not.toThrow();
 });
});
