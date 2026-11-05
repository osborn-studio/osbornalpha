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
  expect(mocks.filingsOfIssuer).toHaveBeenCalledWith(ISSUER,'CN',{from:'2025-01-01',to:'2025-12-31',limit:50});
  expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=/);
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
