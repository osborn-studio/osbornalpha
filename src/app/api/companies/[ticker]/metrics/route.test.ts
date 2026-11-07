// src/app/api/companies/[ticker]/metrics/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/company/evidence-gate',async(orig)=>({...(await orig<typeof import('@/lib/company/evidence-gate')>()),applyGate:(await import('@/lib/company/route-test-kit')).fakeApplyGate}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});

import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/metrics/route';
import {DERIVE_CONCEPTS,FORMULA_VERSION} from '@/lib/facts/derive';
import {FactsDbError} from '@/lib/facts/types';
import {metricKey} from '@/lib/company/metrics-computed-at';
import {US,OLD,emptySnapshot,fact,filingRow,makeDeps,metricRow,seededTables,summary} from '@/lib/company/route-test-kit';

const get=(h:typeof GET,ticker:string,qs:string)=>h(new Request(`https://alpha.example/api/companies/${ticker}/metrics?${qs}`),{params:Promise.resolve({ticker})});
const fn=(x:unknown)=>x as ReturnType<typeof vi.fn>;

describe('GET /api/companies/[ticker]/metrics (proxy, §0 #67)',()=>{
 const gp=fact({concept:'gross_profit',value:'169148000000',value_text:'169148000000'}),rev=fact();
 const m=metricRow({inputs:[{fact_id:gp.fact_id,concept:'gross_profit',filing_id:gp.filing_id,available_date:gp.available_date},{fact_id:rev.fact_id,concept:'revenue',filing_id:rev.filing_id,available_date:rev.available_date}]});
 beforeEach(async()=>{
  vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});
  fn(mocks.deps.stateRev).mockResolvedValue(3);
  fn(mocks.deps.facts.stateRevs).mockResolvedValue([{issuer_id:US,state_rev:3}]);
  fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([m]);
  fn(mocks.deps.facts.factsByIds).mockResolvedValue([gp,rev]);
  fn(mocks.deps.facts.filingsOfIssuer).mockResolvedValue([filingRow()]);
  fn(mocks.deps.metricsComputedAt).mockResolvedValue(new Map([[metricKey(m),{computedAt:'2026-11-06T02:00:00Z',basedOnRev:3}]]));
 });
 it('materialized: rev → metricsOfIssuer → rev; computedAt from financial_metrics; gated cell; fresh cache ≤ 60',async()=>{
  const res=await get(GET,'AAPL','metrics=gross_margin');
  const body=await res.json();
  expect(body).toMatchObject({market:'US',asOf:null,formulaVersion:FORMULA_VERSION,stale:false,truncated:false,withheld:{evidenceIncomplete:0,citationPending:0}});
  expect(body.metrics[0]).toMatchObject({metric:'gross_margin',basedOnRev:3,computedAt:'2026-11-06T02:00:00Z',computedAtKind:'materialized',cell:{kind:'derived',value:'0.4413'}});
  expect(Object.keys(body.evidence).sort()).toEqual([gp.fact_id,rev.fact_id].sort());
  expect(mocks.deps.facts.stateRevs).toHaveBeenCalledTimes(2);
  expect(mocks.deps.facts.metricsOfIssuer).toHaveBeenCalledWith(US,'US',FORMULA_VERSION);
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
 });
 it('any ineligible input withholds the whole metric row',async()=>{
  mocks.deps.noEvidence.add(gp.fact_id);
  const body=await (await get(GET,'AAPL','')).json();
  expect(body.metrics[0].cell).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:gp.fact_id});
  expect(JSON.stringify(body)).not.toContain('0.4413');
  expect(body.withheld.evidenceIncomplete).toBe(1);
 });
 it('stale: based_on_rev behind, rev moving, or metrics_unstable → {metrics:[], stale:true}, s-maxage 30',async()=>{
  fn(mocks.deps.facts.stateRevs).mockResolvedValue([{issuer_id:US,state_rev:4}]);
  const a=await get(GET,'AAPL','');expect(await a.json()).toMatchObject({stale:true,metrics:[]});expect(a.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
  fn(mocks.deps.facts.stateRevs).mockResolvedValueOnce([{issuer_id:US,state_rev:3}]).mockResolvedValue([{issuer_id:US,state_rev:4}]);
  expect(await (await get(GET,'AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
  fn(mocks.deps.facts.stateRevs).mockResolvedValueOnce([{issuer_id:US,state_rev:3}]).mockResolvedValue([{issuer_id:US,state_rev:4}]);fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValueOnce([]);   // empty result while the rev moves is still stale (§0 #67, plan audit P8)
  {const e=await get(GET,'AAPL','');expect(await e.json()).toMatchObject({stale:true,metrics:[]});expect(e.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');}
  fn(mocks.deps.facts.stateRevs).mockResolvedValue([{issuer_id:US,state_rev:3}]);fn(mocks.deps.facts.metricsOfIssuer).mockRejectedValue(new FactsDbError('unknown','metrics_unstable'));
  expect(await (await get(GET,'AAPL','')).json()).toMatchObject({stale:true,metrics:[]});
 });
 it.each(['row vector','member rev','membership','empty membership'])('stale when %s changes while the target rev stays fixed',async(kind)=>{
  const before=[{issuer_id:US,state_rev:3},{issuer_id:OLD,state_rev:7}];
  fn(mocks.deps.facts.lineageOf).mockResolvedValue([US,OLD]);
  fn(mocks.deps.facts.stateRevs).mockResolvedValue(before);
  fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([{...m,based_on_lineage:before}]);
  if(kind==='row vector')fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([m]);
  if(kind==='member rev')fn(mocks.deps.facts.stateRevs).mockResolvedValueOnce(before).mockResolvedValue([{issuer_id:US,state_rev:3},{issuer_id:OLD,state_rev:8}]);
  if(kind.includes('membership'))fn(mocks.deps.facts.lineageOf).mockResolvedValueOnce([US,OLD]).mockResolvedValue([US]);
  if(kind==='empty membership')fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([]);
  const res=await get(GET,'AAPL','');
  expect(await res.json()).toMatchObject({stale:true,metrics:[]});
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30');
 });
 it('fresh when the complete lineage vector matches regardless of vector order',async()=>{
  const vector=[{issuer_id:US,state_rev:3},{issuer_id:OLD,state_rev:7}];
  fn(mocks.deps.facts.lineageOf).mockResolvedValue([US,OLD]);
  fn(mocks.deps.facts.stateRevs).mockResolvedValue(vector);
  fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([{...m,based_on_lineage:[...vector].reverse()}]);
  const res=await get(GET,'AAPL','');
  expect(await res.json()).toMatchObject({stale:false,metrics:[{metric:'gross_margin'}]});
 });
 it('asOf: live derive on one history snapshot (computedAtKind live), truncated passed through',async()=>{
  const cor=fact({concept:'cost_of_revenue',value:'214137000000',value_text:'214137000000'});
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({stateRev:9,rows:[rev,cor],filings:[summary()]}));
  const res=await get(GET,'AAPL','asOf=2024-06-30&metrics=gross_margin');
  const body=await res.json();
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',{concepts:[...DERIVE_CONCEPTS.US],asOf:'2024-06-30',history:true});
  expect(body.metrics[0]).toMatchObject({metric:'gross_margin',basedOnRev:9,computedAtKind:'live',cell:{kind:'derived'}});
  expect(mocks.deps.facts.metricsOfIssuer).not.toHaveBeenCalled();
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({truncated:true}));
  const t=await get(GET,'AAPL','asOf=2024-06-30');
  expect(await t.json()).toMatchObject({truncated:true,metrics:[]});expect(t.headers.get('cache-control')).toBe('no-store');
 });
 it('periods=8|20|40 keeps every metric row of the newest period keys; no row limit then (计划第 3 轮审计 R5)',async()=>{
  // 3 metrics × 80 fiscal years = 240 rows, landed order: metric, then oldest period first.
  const many=['gross_margin','net_margin','roe'].flatMap(metric=>Array.from({length:80},(_,i)=>{const y=1945+i;return metricRow({metric,period_start:`${y}-01-01`,period_end:`${y}-12-31`,value:'0.1'});}));
  fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue(many);
  const capped=await (await get(GET,'AAPL','')).json();
  expect(capped.metrics).toHaveLength(200);   // without periods the landed default row limit still applies
  const body=await (await get(GET,'AAPL','periods=8')).json();
  expect(body.metrics).toHaveLength(24);
  expect(new Set(body.metrics.map((m:{metric:string})=>m.metric))).toEqual(new Set(['gross_margin','net_margin','roe']));
  const ends=[...new Set(body.metrics.map((m:{periodEnd:string})=>m.periodEnd))].sort();
  expect(ends).toEqual(Array.from({length:8},(_,i)=>`${2017+i}-12-31`));
  expect(body.truncated).toBe(false);
  expect((await (await get(GET,'AAPL','periods=40')).json()).metrics).toHaveLength(120);
  expect((await get(GET,'AAPL','periods=10')).status).toBe(400);
  expect((await (await get(GET,'AAPL','periods=10')).json()).error.code).toBe('invalid_parameter:periods');
 });
 it('inputUnit and basis are top-level on every row, also when the cell is withheld (计划第 3 轮审计 R6)',async()=>{
  const eur=fact({concept:'operating_cash_flow',source_concept:'NetCashProvidedByUsedInOperatingActivities',statement:'CF',unit:'EUR',value:'5',value_text:'5'});
  const inputOf=(f:typeof rev)=>({fact_id:f.fact_id,concept:'operating_cash_flow',filing_id:f.filing_id,available_date:f.available_date});
  const mU=metricRow({metric:'fcf',unit:'USD',input_unit:'USD',value:'99000000000',inputs:[inputOf(rev)]});
  const mE=metricRow({metric:'fcf',unit:'EUR',input_unit:'EUR',value:'5',inputs:[inputOf(eur)]});
  fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([mU,mE]);
  fn(mocks.deps.facts.factsByIds).mockResolvedValue([rev,eur]);
  mocks.deps.noEvidence.add(eur.fact_id);
  const body=await (await get(GET,'AAPL','metrics=fcf')).json();
  expect(body.metrics.map((x:{inputUnit:string;basis:string;periodEnd:string;cell:{kind:string}})=>[x.inputUnit,x.basis,x.periodEnd,x.cell.kind])).toEqual([['USD','us_standard','2023-09-30','derived'],['EUR','us_standard','2023-09-30','withheld']]);
 });
 it('metric names validated per market; admin twin private no-store',async()=>{
  expect((await get(GET,'AAPL','metrics=ttm_capex_incl_intangibles')).status).toBe(400);
  expect((await get(GET,'AAPL','limit=1001')).status).toBe(400);
  expect((await get(ADMIN_GET,'AAPL','')).headers.get('cache-control')).toBe('private, no-store');
 });
});
