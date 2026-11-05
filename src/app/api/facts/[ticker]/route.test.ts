// src/app/api/facts/[ticker]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {FactRow,FilingRow} from '@/lib/facts/types';

const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFacts:vi.fn(),factsByIds:vi.fn(),filingsOfIssuer:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({readFacts:mocks.readFacts,factsByIds:mocks.factsByIds,filingsOfIssuer:mocks.filingsOfIssuer})}));

import {GET} from './route';

const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',FID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',F1='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER='99999999-9999-4999-8999-999999999999';   // a VALID uuid: the route validates factIds before filtering, so '9'.repeat(36) would be a 400 (round-1 #17d)
const fact=(p:Partial<FactRow>={}):FactRow=>({fact_id:F1,issuer_id:ISSUER,market:'US',filing_id:FID,run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M',value:'383285000000',value_text:'383285000000',unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-01-01T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false,...p});
const filing=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:FID,issuer_id:ISSUER,market:'US',source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-09-30',available_date:'2023-11-03',source_ref:'0000320193-23-000106',url:'https://www.sec.gov/x',document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2024-01-01T00:00:00Z',...p});
const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/facts/${ticker}?${qs}`),{params:Promise.resolve({ticker})});
const TODAY=new Date().toISOString().slice(0,10);

describe('GET /api/facts/[ticker]',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({issuer_id:ISSUER,status:'active',names:{zh:null,en:'Apple'},identifiers:{cik:'320193',lei:null,usci:null},securities:[]});
  mocks.readFacts.mockResolvedValue({stateRev:5,rows:[fact()],truncated:false});
  mocks.filingsOfIssuer.mockResolvedValue([filing()]);
  mocks.factsByIds.mockResolvedValue([fact()]);
 });
 it('returns facts with value_text, filings with citation edgar, mappingGen, and a long shared cache for a past asOf',async()=>{
  const res=await get('AAPL','concepts=revenue&asOf=2024-06-30');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:'2024-06-30',mappingGen:1,truncated:false});
  expect(body.facts[0]).toMatchObject({factId:F1,concept:'revenue',sourceConcept:'Revenues',value:'383285000000',availableDate:'2023-11-03',disclosureSeq:1,isCurrent:true,isRevision:false,mappingGen:1,filingId:FID});
  expect(body.filings).toEqual([{filingId:FID,formType:'10-K',periodEnd:'2023-09-30',availableDate:'2023-11-03',sourceRef:'0000320193-23-000106',url:'https://www.sec.gov/x',documentRef:null,documentUrl:null,citation:'edgar'}]);
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
  expect(mocks.readFacts).toHaveBeenCalledWith(ISSUER,'US',{concepts:['revenue'],asOf:'2024-06-30',from:undefined,to:undefined,history:false,limit:200});
  expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(),{ticker:'AAPL'},{today:TODAY});
 });
 it('CN tickers: market CN, citation linked/pending from document_ref',async()=>{
  mocks.readFacts.mockResolvedValue({stateRev:1,rows:[fact({market:'CN',unit:'CNY'}),fact({fact_id:'d'.repeat(36),filing_id:'e'.repeat(36),market:'CN',unit:'CNY'})],truncated:false});
  mocks.filingsOfIssuer.mockResolvedValue([filing({market:'CN',source:'tushare',origin:'sse',form_type:'annual',document_ref:'1217982000'}),filing({filing_id:'e'.repeat(36),market:'CN',source:'tushare',origin:'sse',form_type:'q1'}),filing({filing_id:'f'.repeat(36),market:'CN'})]);
  const body=await (await get('600519.SH','concepts=revenue')).json();
  expect(body.market).toBe('CN');
  expect(body.filings.map((f:{citation:string})=>f.citation)).toEqual(['linked','pending']);   // only filings referenced by returned facts
 });
 it('passes truncated through and does not cache it',async()=>{
  mocks.readFacts.mockResolvedValue({stateRev:1,rows:[],truncated:true});
  const res=await get('AAPL','concepts=revenue');
  expect(await res.json()).toMatchObject({truncated:true,facts:[]});
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('factIds evidence mode: ≤100 uuids, no concepts, other issuers filtered out, no limit/durations',async()=>{
  mocks.factsByIds.mockResolvedValue([fact(),fact({fact_id:OTHER,issuer_id:'other'})]);
  const res=await get('AAPL',`factIds=${F1},${OTHER}`);
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.facts.map((f:{factId:string})=>f.factId)).toEqual([F1]);
  expect(mocks.factsByIds).toHaveBeenCalledWith([F1,OTHER]);
  expect(mocks.readFacts).not.toHaveBeenCalled();
  expect((await get('AAPL',`factIds=${F1}&concepts=revenue`)).status).toBe(400);
  expect((await get('AAPL',`factIds=${Array.from({length:101},()=>F1).join(',')}`)).status).toBe(400);
  expect((await get('AAPL','factIds=not-a-uuid')).status).toBe(400);
 });
 it('validates parameters: missing concepts, unknown concept, bad asOf, future asOf, duplicate, bad limit, bad durations, history',async()=>{
  const bad=async(qs:string,code:string)=>{const res=await get('AAPL',qs);expect(res.status).toBe(400);expect((await res.json()).error.code).toBe(code);expect(res.headers.get('cache-control')).toBe('no-store');};
  await bad('','invalid_parameter:concepts');
  await bad('concepts=foo','invalid_parameter:concepts');
  await bad('concepts=revenue&asOf=2024-13-01','invalid_parameter:asOf');
  await bad('concepts=revenue&asOf=2999-01-01','invalid_parameter:asOf');
  await bad('concepts=revenue&asOf=2024-01-01&asOf=2024-01-02','invalid_parameter:asOf');
  await bad('concepts=revenue&limit=0','invalid_parameter:limit');
  await bad('concepts=revenue&limit=1001','invalid_parameter:limit');
  await bad('concepts=revenue&durations=5M','invalid_parameter:durations');
  await bad('concepts=revenue&history=yes','invalid_parameter:history');
  await bad('concepts=revenue&from=2024-02-30','invalid_parameter:from');
  expect((await get('AA PL','concepts=revenue')).status).toBe(400);
 });
 it('history=1 and durations filter; limit caps at 1000; today asOf uses the midnight-bounded cache',async()=>{
  mocks.readFacts.mockResolvedValue({stateRev:1,rows:[fact(),fact({fact_id:'2'.repeat(36),duration:'3M'})],truncated:false});
  const res=await get('AAPL','concepts=revenue,net_income_parent&history=1&durations=3M&limit=1000');
  const body=await res.json();
  expect(body.facts.map((f:{duration:string})=>f.duration)).toEqual(['3M']);
  expect(mocks.readFacts.mock.calls[0][2]).toMatchObject({concepts:['revenue','net_income_parent'],history:true,limit:1000,asOf:TODAY});
  expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=\d+, stale-while-revalidate=600$/);
 });
 it('404 unknown_ticker, 500 internal on db failure, both no-store',async()=>{
  mocks.resolve.mockResolvedValue(null);
  const nf=await get('ZZZZ','concepts=revenue');
  expect(nf.status).toBe(404);expect((await nf.json()).error.code).toBe('unknown_ticker');
  mocks.resolve.mockResolvedValue({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[]});
  mocks.readFacts.mockRejectedValue(new Error('boom'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const err=await get('AAPL','concepts=revenue');
  expect(err.status).toBe(500);expect(err.headers.get('cache-control')).toBe('no-store');
  spy.mockRestore();
 });
});
