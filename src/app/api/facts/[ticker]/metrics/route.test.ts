// src/app/api/facts/[ticker]/metrics/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {FactRow,LineageRev,MetricRow} from '@/lib/facts/types';
import {FORMULA_VERSION} from '@/lib/facts/derive';
import {FactsDbError} from '@/lib/facts/types';

const mocks=vi.hoisted(()=>({resolve:vi.fn(),readFactsLineage:vi.fn(),metricsOfIssuer:vi.fn(),lineageOf:vi.fn(),stateRevs:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({rpc:()=>Promise.resolve({data:null,error:{message:'unexpected rpc'}})})}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolve}));
vi.mock('@/lib/facts/db',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/facts/db')>(),
 supabaseFactsDb:()=>({readFactsLineage:mocks.readFactsLineage,metricsOfIssuer:mocks.metricsOfIssuer,lineageOf:mocks.lineageOf,stateRevs:mocks.stateRevs})}));

import {GET} from './route';

const ISSUER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SRC='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const V3:LineageRev[]=[{issuer_id:ISSUER,state_rev:3}];
const metric=(p:Partial<MetricRow>={}):MetricRow=>({issuer_id:ISSUER,market:'US',metric:'gross_margin',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION,
 inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],based_on_rev:3,based_on_lineage:V3,as_of:'2024-06-01',...p});
const fact=(p:Partial<FactRow>):FactRow=>({fact_id:'f',issuer_id:ISSUER,market:'US',filing_id:'g',run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'10',value_text:'10',unit:'USD',consolidation:'consolidated',available_date:'2024-05-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-05-01T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false,...p});
const get=(ticker:string,qs:string)=>GET(new Request(`https://alpha.example/api/facts/${ticker}/metrics?${qs}`),{params:Promise.resolve({ticker})});

describe('GET /api/facts/[ticker]/metrics',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.resolve.mockImplementation(async(_c:unknown,q:{ticker:string})=>({issuer_id:ISSUER,status:'active',names:{zh:null,en:null},identifiers:{cik:null,lei:null,usci:null},securities:[{ticker:q.ticker,isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null}]}));
  mocks.lineageOf.mockImplementation(async(t:string)=>[t]);
  mocks.stateRevs.mockResolvedValue(V3);
  mocks.metricsOfIssuer.mockResolvedValue([metric(),metric({metric:'net_margin',value:'0.1',period_end:'2024-06-30',period_start:'2024-04-01'})]);
  mocks.readFactsLineage.mockResolvedValue({stateRevs:[{issuer_id:ISSUER,state_rev:9}],lineage:[ISSUER],conflicts:[],truncated:false,rows:[fact({fact_id:'f1'}),fact({fact_id:'f2',concept:'gross_profit',source_concept:'GrossProfit',value:'4',value_text:'4'})]});
 });
 it('without asOf serves the materialized rows of the target when lineage and revs agree before and after and every row carries that vector',async()=>{
  const res=await get('AAPL','metrics=gross_margin&from=2024-01-01&to=2024-03-31');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({issuerId:ISSUER,ticker:'AAPL',market:'US',asOf:null,mappingGen:1,formulaVersion:FORMULA_VERSION,truncated:false,stale:false,lineage:[ISSUER],resolution:{tickerAsOf:expect.any(String),issuerId:ISSUER,validFromMethod:null}});
  expect(body.metrics).toEqual([{metric:'gross_margin',periodStart:'2024-01-01',periodEnd:'2024-03-31',duration:'3M',value:'0.4',unit:'pure',inputUnit:'USD',basis:'us_standard',inputs:[{fact_id:'f1',concept:'gross_profit',filing_id:'g',available_date:'2024-05-01'}],basedOnRev:3,basedOnLineage:V3}]);
  expect(mocks.metricsOfIssuer).toHaveBeenCalledWith(ISSUER,'US',FORMULA_VERSION);
  expect(mocks.readFactsLineage).toHaveBeenCalledTimes(1);   // conflicts only, inside the bracket
  expect(body.conflicts).toEqual([]);
  expect(mocks.lineageOf).toHaveBeenCalledTimes(2);expect(mocks.stateRevs).toHaveBeenCalledTimes(2);
  expect(mocks.stateRevs).toHaveBeenCalledWith([ISSUER],'US');
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
 });
 it('a merged target: lineage [T, S] with both revs in every row is served',async()=>{
  const V=[{issuer_id:ISSUER,state_rev:3},{issuer_id:SRC,state_rev:7}];
  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);mocks.stateRevs.mockResolvedValue(V);
  mocks.metricsOfIssuer.mockResolvedValue([metric({based_on_lineage:V})]);
  const body=await (await get('AAPL','')).json();
  expect(body).toMatchObject({stale:false,lineage:[ISSUER,SRC]});
  expect(body.metrics[0].basedOnLineage).toEqual(V);
  expect(mocks.stateRevs).toHaveBeenCalledWith([ISSUER,SRC],'US');
 });
 it('T8: revs that move while the metrics are read are stale (no rows, short cache)',async()=>{
  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:4}]);
  const res=await get('AAPL','metrics=gross_margin');
  expect(await res.json()).toMatchObject({stale:true,metrics:[]});
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
 });
 it('T8: rows whose based_on_lineage is not the current vector are stale even when based_on_rev matches the target',async()=>{
  const V=[{issuer_id:ISSUER,state_rev:3},{issuer_id:SRC,state_rev:7}];
  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);mocks.stateRevs.mockResolvedValue(V);
  mocks.metricsOfIssuer.mockResolvedValue([metric()]);                                   // materialized before the merge: [T@3] only
  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
 });
 it('T8: a lineage that changes membership between the two reads is stale',async()=>{
  mocks.lineageOf.mockResolvedValueOnce([ISSUER]).mockResolvedValue([ISSUER,SRC]);
  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:3},{issuer_id:SRC,state_rev:1}]);
  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
 });
 it('a stateRevs failure is a 500 (never reported as stale); an unstable metrics read is stale; no rows yet is an empty non-stale answer',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.stateRevs.mockRejectedValueOnce(new Error('rpc down'));
  const res=await get('AAPL','');
  expect(res.status).toBe(500);expect((await res.json()).error.code).toBe('internal');
  spy.mockRestore();
  mocks.metricsOfIssuer.mockRejectedValueOnce(new FactsDbError('unknown','metrics_unstable'));
  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
  mocks.metricsOfIssuer.mockResolvedValueOnce([]);
  const empty=await get('AAPL','');
  expect(await empty.json()).toMatchObject({stale:false,metrics:[]});
  expect(empty.headers.get('cache-control')).toBe('no-store');
 });
 it('internal errors give a code only, no message',async()=>{
  mocks.metricsOfIssuer.mockRejectedValue(new Error('secret db detail'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const res=await get('AAPL','');
  spy.mockRestore();
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain('secret');
 });
 it('with asOf derives live over the lineage envelope: basedOnRev = the target rev, basedOnLineage = the envelope vector',async()=>{
  const V=[{issuer_id:ISSUER,state_rev:9},{issuer_id:SRC,state_rev:2}];
  mocks.lineageOf.mockResolvedValue([ISSUER,SRC]);
  mocks.readFactsLineage.mockResolvedValue({stateRevs:V,lineage:[ISSUER,SRC],conflicts:[],truncated:false,rows:[fact({fact_id:'f1',issuer_id:SRC}),fact({fact_id:'f2',concept:'gross_profit',source_concept:'GrossProfit',value:'4',value_text:'4'})]});
  const res=await get('AAPL','asOf=2024-06-30&metrics=gross_margin');
  const body=await res.json();
  expect(body.asOf).toBe('2024-06-30');
  expect(body.metrics).toEqual([expect.objectContaining({metric:'gross_margin',value:'0.4',basedOnRev:9,basedOnLineage:V})]);
  expect(mocks.readFactsLineage.mock.calls[0][0]).toEqual([ISSUER,SRC]);
  expect(mocks.readFactsLineage.mock.calls[0][2]).toMatchObject({asOf:'2024-06-30',history:true});
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
 });
 it('passes truncated through with no rows and no-store',async()=>{
  mocks.readFactsLineage.mockResolvedValue({stateRevs:V3,lineage:[ISSUER],conflicts:[],rows:[],truncated:true});
  const res=await get('AAPL','asOf=2024-06-30');
  expect(await res.json()).toMatchObject({truncated:true,metrics:[]});
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('validates metrics against the market vocabulary, limit, dates and tickerAsOf; 404 unknown ticker',async()=>{
  expect((await get('AAPL','metrics=ttm_capex_incl_intangibles')).status).toBe(400);
  expect((await get('600519.SH','metrics=ttm_capex_incl_intangibles')).status).toBe(200);
  expect((await get('AAPL','limit=1001')).status).toBe(400);
  expect((await get('AAPL','asOf=2024-02-30')).status).toBe(400);
  expect((await get('AAPL','tickerAsOf=2999-01-01')).status).toBe(400);
  await get('AAPL','tickerAsOf=2021-01-04');
  expect(mocks.resolve).toHaveBeenLastCalledWith(expect.anything(),{ticker:'AAPL'},{asOf:'2021-01-04'});
  mocks.resolve.mockResolvedValue(null);
  expect((await get('AAPL','')).status).toBe(404);
 });
 it('T8: the after-guard also runs for an empty read: moving membership or revs make it stale with the short cache',async()=>{
  mocks.metricsOfIssuer.mockResolvedValue([]);
  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:4}]);
  const a=await get('AAPL','');
  expect(await a.json()).toMatchObject({stale:true,metrics:[]});
  expect(a.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
  mocks.lineageOf.mockResolvedValueOnce([ISSUER]).mockResolvedValue([ISSUER,SRC]);
  mocks.stateRevs.mockReset();mocks.stateRevs.mockResolvedValue(V3);
  const b=await get('AAPL','');
  expect(await b.json()).toMatchObject({stale:true,metrics:[],conflicts:[]});
  expect(b.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
 });
 it('conflicts: exposed on the materialized read (from the bracketed lineage read) and on the live asOf read, in the facts-route shape; dropped when stale',async()=>{
  const c={key:{concept:'revenue',period_end:'2024-03-31'},available_date:'2024-05-01',fact_ids:['x','y']};
  mocks.readFactsLineage.mockResolvedValue({stateRevs:V3,lineage:[ISSUER],conflicts:[c],truncated:false,rows:[]});
  const m=await (await get('AAPL','')).json();
  expect(m.conflicts).toEqual([{key:c.key,availableDate:'2024-05-01',factIds:['x','y']}]);
  const live=await (await get('AAPL','asOf=2024-06-30')).json();
  expect(live.conflicts).toEqual([{key:c.key,availableDate:'2024-05-01',factIds:['x','y']}]);
  mocks.stateRevs.mockResolvedValueOnce(V3).mockResolvedValue([{issuer_id:ISSUER,state_rev:4}]);
  expect(await (await get('AAPL','')).json()).toMatchObject({stale:true,conflicts:[]});
 });
 it('conflicts read passes limit:1 and its truncated flag is not the response\'s: fresh cache, truncated:false',async()=>{
  mocks.readFactsLineage.mockResolvedValue({stateRevs:V3,lineage:[ISSUER],conflicts:[],truncated:true,rows:[]});
  const res=await get('AAPL','');
  expect(await res.json()).toMatchObject({truncated:false,stale:false});
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
  expect(mocks.readFactsLineage.mock.calls[0][2]).toMatchObject({limit:1});
 });
 it('a bad metrics value is 400 even for an unknown ticker (validated before resolution)',async()=>{
  mocks.resolve.mockResolvedValue(null);
  expect((await get('ZZZZ','metrics=not_a_metric')).status).toBe(400);
  expect((await get('ZZZZ','metrics=gross_margin')).status).toBe(404);
 });
});
