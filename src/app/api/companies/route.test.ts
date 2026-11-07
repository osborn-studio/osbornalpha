// src/app/api/companies/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {CoverageRow} from '@/lib/company/types';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const m=vi.hoisted(()=>({listCoverage:vi.fn(),prefix:vi.fn(),lites:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({tag:'anon'})}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn(()=>{throw new Error('public route must not read the session');})}));
vi.mock('@/lib/company/db',()=>({supabaseCompanyDb:()=>({listCoverage:m.listCoverage})}));
vi.mock('@/lib/company/directory',async(orig)=>({...await orig<typeof import('@/lib/company/directory')>(),issuerIdsByPrefix:m.prefix}));
vi.mock('@/lib/company/tracking-issuers',async(orig)=>({...await orig<typeof import('@/lib/company/tracking-issuers')>(),loadIssuerLites:m.lites}));

import {GET} from './route';
import {FACT_CONCEPTS} from '@/lib/facts/concepts';

const cov=(p:Partial<CoverageRow>={}):CoverageRow=>({issuer_id:A,market:'US',filings_count:10,facts_count:500,concepts_covered:30,earliest_period_end:null,latest_period_end:'2025-09-27',latest_available_date:'2025-10-31',citation_summary:{linked:0,pending:0,edgar:10},scope_last_success_at:null,scope_last_status:'success',based_on_rev:3,rebuilt_at:'x',rebuild_id:'r',rebuild_batch_id:'b',...p});
const get=(qs='')=>GET(new Request(`https://alpha.example/api/companies${qs?`?${qs}`:''}`));

describe('GET /api/companies',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  m.listCoverage.mockResolvedValue({rows:[cov()],total:1});
  m.prefix.mockResolvedValue([A]);
  m.lites.mockResolvedValue({issuers:[{issuer_id:A,canonical_name_zh:null,canonical_name_en:'Apple Inc.'}],securities:[{issuer_id:A,ticker:'AAPL',is_primary:true,valid_from:'2000-01-01',valid_to:null}]});
 });
 it('defaults: sort latest_available_date, page 1, pageSize 100; shared cache; conceptsTotal',async()=>{
  const res=await get();
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(m.listCoverage).toHaveBeenCalledWith({market:undefined,issuerIds:undefined},'latest_available_date',{offset:0,limit:100});
  expect(body).toMatchObject({total:1,page:1,pageSize:100,conceptsTotal:FACT_CONCEPTS.length});
  expect(body.rows[0]).toMatchObject({issuerId:A,market:'US',primaryTicker:'AAPL',names:{en:'Apple Inc.'}});
  expect(Object.keys(body.rows[0]).sort()).toEqual(['citationSummary','conceptsCovered','issuerId','latestAvailableDate','latestPeriodEnd','market','names','primaryTicker','scopeLastStatus','scopeLastSuccessAt','tickers']);
  expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=\d+, stale-while-revalidate=600$/);
 });
 it('market, q, sort, page, pageSize are passed through',async()=>{
  await get('market=US&q=AAP&sort=name&page=3&pageSize=50');
  expect(m.prefix).toHaveBeenCalledWith(expect.anything(),'AAP',expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  expect(m.listCoverage).toHaveBeenCalledWith({market:'US',issuerIds:[A]},'name',{offset:100,limit:50});
 });
 it('q with no match → empty, no-store, coverage not queried',async()=>{
  m.prefix.mockResolvedValue([]);
  const res=await get('q=ZZZZ');
  expect(await res.json()).toMatchObject({total:0,rows:[]});
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(m.listCoverage).not.toHaveBeenCalled();
 });
 it('400 invalid_parameter for bad market, q, sort, page, pageSize and repeated parameters',async()=>{
  for(const qs of ['market=HK','q=a%2Cb','q='+'x'.repeat(25),'sort=rating','page=0','pageSize=201','market=US&market=CN']){
   const res=await get(qs);
   expect(res.status,qs).toBe(400);
   expect((await res.json()).error.code).toMatch(/^invalid_parameter:/);
   expect(res.headers.get('cache-control')).toBe('no-store');
  }
 });
 it('internal failure → 500 internal, no-store',async()=>{
  m.listCoverage.mockRejectedValue(new Error('boom'));
  const res=await get();
  expect(res.status).toBe(500);expect(res.headers.get('cache-control')).toBe('no-store');
 });
});
