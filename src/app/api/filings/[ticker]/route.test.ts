// src/app/api/filings/[ticker]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {FilingRow} from '@/lib/facts/types';

const mocks=vi.hoisted(()=>({resolve:vi.fn(),filingsOfIssuer:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({filingsOfIssuer:mocks.filingsOfIssuer})}));

import {GET} from './route';

const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const filing=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:'g',issuer_id:ISSUER,market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2024,fiscal_period:'FY',period_end:'2024-12-31',available_date:'2025-04-01',source_ref:'600519.SH:20241231:1:20250401',url:null,document_ref:'1222',document_url:'https://static.cninfo.com.cn/x.pdf',link_attempts:1,mapping_gen:1,run_id:'r',created_at:'2025-04-01T00:00:00Z',...p});
const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/filings/${ticker}?${qs}`),{params:Promise.resolve({ticker})});

describe('GET /api/filings/[ticker]',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[]});
  mocks.filingsOfIssuer.mockResolvedValue([filing(),filing({filing_id:'h',form_type:'q1',document_ref:null,document_url:null,link_attempts:5,available_date:'2025-04-29'})]);
 });
 it('lists filings in the available_date window with citation and caches until midnight',async()=>{
  const res=await get('600519.SH','from=2025-01-01&to=2025-12-31&limit=50');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({issuerId:ISSUER,ticker:'600519.SH',market:'CN'});
  expect(body.filings.map((f:{filingId:string;citation:string})=>[f.filingId,f.citation])).toEqual([['g','linked'],['h','pending']]);
  expect(mocks.filingsOfIssuer).toHaveBeenCalledWith(ISSUER,'CN',{from:'2025-01-01',to:'2025-12-31'});
  expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=/);
 });
 it('exposes only published filings (mapping_gen > 0), filtered before the limit',async()=>{
  mocks.filingsOfIssuer.mockResolvedValue([filing({filing_id:'s1',mapping_gen:0}),filing({filing_id:'s2',mapping_gen:0}),filing({filing_id:'p1'}),filing({filing_id:'p2'})]);
  const body=await (await get('600519.SH','limit=2')).json();
  expect(body.filings.map((f:{filingId:string})=>f.filingId)).toEqual(['p1','p2']);
 });
 it('canonicalises CN tickers and answers 400 for malformed percent-encoding, 409 for ambiguous owners',async()=>{
  for(const t of ['600519','SH600519','600519.SS']){
   const b=await (await get(t,'')).json();
   expect(b).toMatchObject({ticker:'600519.SH',market:'CN'});
  }
  expect(mocks.resolve.mock.calls.every((c:unknown[])=>(c[1] as {ticker:string}).ticker==='600519.SH')).toBe(true);
  const mal=await GET(new Request('https://alpha.example/api/filings/%E0%A4%A'),{params:Promise.resolve({ticker:'%E0%A4%A'})});
  expect(mal.status).toBe(400);expect((await mal.json()).error.code).toBe('invalid_parameter:ticker');
  mocks.resolve.mockRejectedValue(new Error('ambiguous_owner'));
  const amb=await get('AAPL','');
  expect(amb.status).toBe(409);expect((await amb.json()).error.code).toBe('ambiguous_ticker');
 });
 it('empty result is no-store; bad limit and duplicate from are 400; unknown ticker 404',async()=>{
  mocks.filingsOfIssuer.mockResolvedValue([]);
  const res=await get('600519.SH','');
  expect((await res.json()).filings).toEqual([]);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect((await get('600519.SH','limit=0')).status).toBe(400);
  expect((await get('600519.SH','from=2025-01-01&from=2025-01-02')).status).toBe(400);
  mocks.resolve.mockResolvedValue(null);
  expect((await get('600519.SH','')).status).toBe(404);
 });
});
