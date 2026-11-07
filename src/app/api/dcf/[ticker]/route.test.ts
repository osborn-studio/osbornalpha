// src/app/api/dcf/[ticker]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,llm:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/company/evidence-gate',async(orig)=>({...(await orig<typeof import('@/lib/company/evidence-gate')>()),applyGate:(await import('@/lib/company/route-test-kit')).fakeApplyGate}));
vi.mock('@/lib/llm/resolve',()=>({resolveUserLlm:mocks.llm}));
vi.mock('@/lib/data/sources/llm',()=>({chatResolved:vi.fn(),extractJson:(s:string)=>JSON.parse(s)}));

import {GET,POST} from './route';
import {SEED_CONCEPTS} from '@/lib/company/dcf-seed';
import {usRows,cnRows} from '@/lib/company/dcf-seed.test-rows';
import {CN,FIL_CN_LINKED,US,cnSummary,emptySnapshot,makeDeps,seededTables,summary} from '@/lib/company/route-test-kit';

const ctx=(ticker:string)=>({params:Promise.resolve({ticker})});
const post=(ticker:string,body:unknown={})=>POST(new Request(`https://alpha.example/api/dcf/${ticker}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),ctx(ticker));
const fn=(x:unknown)=>x as ReturnType<typeof vi.fn>;
const linked=cnSummary({filingId:FIL_CN_LINKED,citation:'linked',documentUrl:'https://static.cninfo.com.cn/x.PDF'});

describe('/api/dcf/[ticker] (spec §9.1, §0 #65)',()=>{
 let tables:Awaited<ReturnType<typeof seededTables>>;
 beforeEach(async()=>{
  vi.clearAllMocks();tables=await seededTables();mocks.deps=makeDeps(tables);mocks.llm.mockResolvedValue(null);
  fn(mocks.deps.snapshot).mockImplementation(async(issuer:string)=>issuer===US?emptySnapshot({stateRev:3,rows:usRows(),filings:[summary()]}):emptySnapshot({stateRev:4,rows:cnRows(),filings:[linked]}));
 });
 it('never self-calls /api/financials; one seed snapshot of SEED_CONCEPTS with history',async()=>{
  const spy=vi.spyOn(globalThis,'fetch');
  await GET(new Request('https://alpha.example/api/dcf/AAPL'),ctx('AAPL'));
  expect(spy).not.toHaveBeenCalled();spy.mockRestore();
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',expect.objectContaining({concepts:[...SEED_CONCEPTS.US],history:true}));
 });
 it('600519.SH with injected PDF locators: bridge leaves are fact (revenue_operating, monetary_funds basis), one divisor 1e8, runs',async()=>{
  // fresh ids per call: register exactly the ids the snapshot returns (计划第 3 轮审计 R1: mock 不再被注释吞掉)
  const rows=cnRows();
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({stateRev:4,rows,filings:[linked]}));
  for(const r of rows)mocks.deps.pdfFor.add(r.fact_id);
  const res=await post('600519.SH');
  const body=await res.json();
  expect(body.status).toBe('ok');
  expect(body.provenance).toMatchObject({'revenueLines[0].baseRevenue':'fact',sharesDiluted:'fact',netDebt:'fact'});
  expect(body.factProvenance.netDebt.basis).toBe('cn_borrowings_less_monetary_funds_incl_restricted');
  expect(new Set(['revenueLines[0].baseRevenue','sharesDiluted','netDebt'].map(k=>body.factProvenance[k].divisor))).toEqual(new Set(['100000000']));
  expect(body.factProvenance['revenueLines[0].baseRevenue'].factIds).toEqual([rows[0].fact_id]);
  expect(body.result.valuation.rangePerShare).toBeDefined();
  expect(Object.keys(body.evidence).length).toBeGreaterThan(0);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(CN).toBeTruthy();
 });
 it('600519.SH without PDF locators (public): unavailable, dcf_bridge_missing, no LLM call, no valuation',async()=>{
  const body=await (await post('600519.SH')).json();
  expect(body).toMatchObject({status:'unavailable',code:'dcf_bridge_missing',result:null,assumptions:null});
  expect(body.missing.map((m:{reason:string})=>m.reason)).toEqual(['citation_pending','citation_pending','citation_pending']);
  expect(mocks.llm).not.toHaveBeenCalled();
 });
 it('AAPL with share_class unknown: sharesDiluted share_basis_unverified → unavailable; user confirmation runs',async()=>{
  await tables.update('issuer_securities',{issuer_id:US,ticker:'AAPL'},{share_class:'unknown'});
  const a=await (await post('AAPL')).json();
  expect(a).toMatchObject({status:'unavailable',code:'dcf_bridge_missing',missing:[{field:'sharesDiluted',reason:'share_basis_unverified'}]});
  const b=await (await post('AAPL',{overrides:{sharesDiluted:15550}})).json();
  expect(b.status).toBe('ok');expect(b.provenance).toMatchObject({sharesDiluted:'user','revenueLines[0].baseRevenue':'fact',netDebt:'fact'});
 });
 it('GET returns the bridge panel seed (no engine, no LLM); HK and unknown tickers 404',async()=>{
  const body=await (await GET(new Request('https://alpha.example/api/dcf/AAPL'),ctx('AAPL'))).json();
  expect(body).toMatchObject({status:'seed',market:'US',meta:{currency:'USD',currencyUnit:'百万',divisor:'1000000'},bridge:{baseRevenue:{source:'fact'},sharesDiluted:{source:'fact'},netDebt:{source:'fact',basis:'us_standard'}}});
  expect(mocks.llm).not.toHaveBeenCalled();
  expect((await GET(new Request('https://alpha.example/api/dcf/00700.HK'),ctx('00700.HK'))).status).toBe(404);
  expect((await post('ZZZZ')).status).toBe(404);
 });
});
