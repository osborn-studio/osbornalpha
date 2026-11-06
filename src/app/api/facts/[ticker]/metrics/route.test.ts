// src/app/api/facts/[ticker]/metrics/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {FactRow,MetricRow} from '@/lib/facts/types';
import {FORMULA_VERSION} from '@/lib/facts/derive';
import {FactsDbError} from '@/lib/facts/types';

const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFacts:vi.fn(),metricsOfIssuer:vi.fn(),rev:vi.fn(),revArgs:vi.fn(),revError:vi.fn((): {message:string}|null=>null)}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({rpc:(fn:string,args:unknown)=>Promise.resolve(fn==='fact_state_rev'?(mocks.revArgs(args),mocks.revError()?{data:null,error:mocks.revError()}:{data:mocks.rev(),error:null}):{data:null,error:{message:'unexpected'}})})}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
vi.mock('@/lib/facts/db',()=>({supabaseFactsDb:()=>({readFacts:mocks.readFacts,metricsOfIssuer:mocks.metricsOfIssuer})}));

import {GET} from './route';

const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const metric=(p:Partial<MetricRow>={}):MetricRow=>({issuer_id:ISSUER,market:'US',metric:'gross_margin',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION,inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],based_on_rev:3,based_on_lineage:[{issuer_id:ISSUER,state_rev:3}],as_of:'2024-06-01',...p});
const fact=(p:Partial<FactRow>):FactRow=>({fact_id:'f',issuer_id:ISSUER,market:'US',filing_id:'g',run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'10',value_text:'10',unit:'USD',consolidation:'consolidated',available_date:'2024-05-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-05-01T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false,...p});
const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/facts/${ticker}/metrics?${qs}`),{params:Promise.resolve({ticker})});

describe('GET /api/facts/[ticker]/metrics',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.revError.mockReturnValue(null);
  mocks.rev.mockReturnValue(3);
  mocks.resolve.mockImplementation(async(_c:unknown,q:{ticker:string})=>({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[{ticker:q.ticker,isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null}]}));
  mocks.metricsOfIssuer.mockResolvedValue([metric(),metric({metric:'net_margin',value:'0.1',period_end:'2024-06-30',period_start:'2024-04-01'})]);
  mocks.readFacts.mockResolvedValue({stateRev:9,rows:[fact({fact_id:'f1'}),fact({fact_id:'f2',concept:'gross_profit',source_concept:'GrossProfit',value:'4',value_text:'4'})],truncated:false});
 });
 it('without asOf reads the materialized table for the current formula version, filtered and shaped',async()=>{
  const res=await get('AAPL','metrics=gross_margin&from=2024-01-01&to=2024-03-31');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:null,mappingGen:1,formulaVersion:FORMULA_VERSION,truncated:false,stale:false});
  expect(body.metrics).toEqual([{metric:'gross_margin',periodStart:'2024-01-01',periodEnd:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',inputUnit:'USD',basis:'us_standard',inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],basedOnRev:3}]);
  expect(mocks.metricsOfIssuer).toHaveBeenCalledWith(ISSUER,'US',FORMULA_VERSION);
  expect(mocks.readFacts).not.toHaveBeenCalled();
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
  expect(mocks.rev).toHaveBeenCalledTimes(2);
  expect(mocks.revArgs).toHaveBeenCalledWith({p_issuer:ISSUER,p_market:'US'});
 });
 it('stale metrics (based_on_rev behind the current fact state) are not served: stale:true, no rows, short cache',async()=>{
  mocks.rev.mockReturnValue(4);
  const res=await get('AAPL','metrics=gross_margin');
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({stale:true,metrics:[]});
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
 });
 it('rev that moves while the metrics are being read is stale too',async()=>{
  mocks.rev.mockReturnValueOnce(3).mockReturnValue(4);
  const body=await (await get('AAPL','')).json();
  expect(body).toMatchObject({stale:true,metrics:[]});
 });
 it('a fact_state_rev RPC error is a 500, never reported as stale',async()=>{
  mocks.revError.mockReturnValue({message:'rpc down'});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const res=await get('AAPL','');
  spy.mockRestore();
  expect(res.status).toBe(500);
  expect((await res.json()).error.code).toBe('internal');
 });
 it('an unstable metrics read is stale, not a 500',async()=>{
  mocks.metricsOfIssuer.mockRejectedValue(new FactsDbError('unknown','metrics_unstable'));
  const res=await get('AAPL','');
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({stale:true,metrics:[]});
 });
 it('current metrics with no rows yet are an empty, non-stale answer',async()=>{
  mocks.metricsOfIssuer.mockResolvedValue([]);
  const res=await get('AAPL','');
  expect(await res.json()).toMatchObject({stale:false,metrics:[]});
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('internal errors give a code only, no message',async()=>{
  mocks.metricsOfIssuer.mockRejectedValue(new Error('secret db detail'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const res=await get('AAPL','');
  spy.mockRestore();
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain('secret');
 });
 it('with asOf derives live from the read_facts envelope and stamps basedOnRev with its state_rev',async()=>{
  const res=await get('AAPL','asOf=2024-06-30&metrics=gross_margin');
  const body=await res.json();
  expect(body.asOf).toBe('2024-06-30');
  expect(body.metrics).toEqual([expect.objectContaining({metric:'gross_margin',value:'0.4',basedOnRev:9})]);
  expect(mocks.readFacts.mock.calls[0][2]).toMatchObject({asOf:'2024-06-30',history:true});
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
 });
 it('passes truncated through with no rows and no-store',async()=>{
  mocks.readFacts.mockResolvedValue({stateRev:1,rows:[],truncated:true});
  const res=await get('AAPL','asOf=2024-06-30');
  expect(await res.json()).toMatchObject({truncated:true,metrics:[]});
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('validates metrics against the market vocabulary, limit and dates; 404 unknown ticker',async()=>{
  expect((await get('AAPL','metrics=ttm_capex_incl_intangibles')).status).toBe(400);   // CN-only name on a US ticker
  expect((await get('600519.SH','metrics=ttm_capex_incl_intangibles')).status).toBe(200);
  expect((await get('AAPL','limit=1001')).status).toBe(400);
  expect((await get('AAPL','asOf=2024-02-30')).status).toBe(400);
  mocks.resolve.mockResolvedValue(null);
  expect((await get('AAPL','')).status).toBe(404);
 });
});
