// src/app/api/companies/[ticker]/overview/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn(),derive:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/company/evidence-gate',async(orig)=>({...(await orig<typeof import('@/lib/company/evidence-gate')>()),applyGate:(await import('@/lib/company/route-test-kit')).fakeApplyGate}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});
vi.mock('@/lib/company/events',()=>({deriveIssuerEvents:mocks.derive}));

import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/overview/route';
import {DERIVE_CONCEPTS} from '@/lib/facts/derive';
import {periodKeyOf} from '@/lib/company/statements-grid';
import {US,emptySnapshot,eventRow,fact,makeDeps,seededTables,summary} from '@/lib/company/route-test-kit';
import type {CoverageRow} from '@/lib/company/types';

const get=(h:typeof GET,ticker:string,qs='')=>h(new Request(`https://alpha.example/api/companies/${ticker}/overview?${qs}`),{params:Promise.resolve({ticker})});
const fn=(x:unknown)=>x as ReturnType<typeof vi.fn>;
const cov=(market:'US'|'CN'):CoverageRow=>({issuer_id:US,market,filings_count:3,facts_count:90,concepts_covered:20,earliest_period_end:'2019-09-28',latest_period_end:'2023-09-30',latest_available_date:'2023-11-03',citation_summary:{linked:0,pending:0,edgar:3},scope_last_success_at:'2026-11-06T00:00:00Z',scope_last_status:'success',based_on_rev:3,rebuilt_at:'2026-11-06T00:00:00Z',rebuild_id:'c0000000-0000-4000-8000-000000000000',rebuild_batch_id:'d0000000-0000-4000-8000-000000000000'});

describe('GET /api/companies/[ticker]/overview',()=>{
 const rev23=fact(),rev22=fact({period_start:'2021-09-26',period_end:'2022-09-24',value:'394328000000',value_text:'394328000000',available_date:'2022-10-28'});
 const q4=fact({period_start:'2023-07-02',period_end:'2023-09-30',duration:'3M',value:'89498000000',value_text:'89498000000'});
 const ni=fact({concept:'net_income_parent',value:'96995000000',value_text:'96995000000'});
 const ocf=fact({concept:'operating_cash_flow',statement:'CF',value:'110543000000',value_text:'110543000000'});
 const gp=fact({concept:'gross_profit',value:'169148000000',value_text:'169148000000'});
 beforeEach(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-09T00:00:01Z'));
  vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({stateRev:6,rows:[rev22,rev23,q4,ni,ocf,gp],filings:[summary(),summary({filingId:'f0000000-0000-4000-8000-000000000008',availableDate:'2022-10-28'})]}));
  fn(mocks.deps.publicCompany.coverageOf).mockResolvedValue([cov('US')]);
  fn(mocks.deps.company.eventsOfIssuer).mockResolvedValue({rows:[eventRow()],nextCursor:null});
 });
 afterEach(()=>vi.useRealTimers());
 it.each(['','asOf=2026-11-09'])('current nonempty overview uses a 60s shared cache without SWR (%s)',async(qs)=>{
  mocks.derive.mockReturnValue([]);
  const res=await get(GET,'AAPL',qs);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=60');
  expect(await res.json()).toMatchObject({asOf:'2026-11-09',coverage:cov('US'),eventsComputed:qs?'live':'materialized'});
 });
 it('prior UTC day preserves historical cache and current coverage decoration',async()=>{
  mocks.derive.mockReturnValue([]);
  const res=await get(GET,'AAPL','asOf=2026-11-08');
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
  expect(await res.json()).toMatchObject({asOf:'2026-11-08',coverage:cov('US'),eventsComputed:'live'});
 });
 it.each(['','asOf=2026-11-09','asOf=2026-11-08'])('empty overview stays no-store (%s)',async(qs)=>{
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot());
  fn(mocks.deps.publicCompany.coverageOf).mockResolvedValue([]);
  fn(mocks.deps.company.eventsOfIssuer).mockResolvedValue({rows:[],nextCursor:null});
  mocks.derive.mockReturnValue([]);
  const res=await get(GET,'AAPL',qs);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toMatchObject({latest:null,coverage:null,recentEvents:[]});
 });
 it.each(['','asOf=2026-11-09'])('admin current success overrides the public cache policy (%s)',async(qs)=>{
  mocks.derive.mockReturnValue([]);
  const res=await get(ADMIN_GET,'AAPL',qs);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(await res.json()).toMatchObject({coverage:cov('US')});
  expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
 });
 it('current read failure stays no-store',async()=>{
  fn(mocks.deps.snapshot).mockRejectedValue(new Error('snapshot_failed'));
  const res=await get(GET,'AAPL');
  expect(res.status).toBe(500);
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('latest block from ONE history envelope (12M wins over the 3M of the same end), derived gross_margin + revenue_yoy, latestFiling from the same snapshot, coverage, 3 materialized events',async()=>{
  const body=await (await get(GET,'AAPL')).json();
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(1);
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',expect.objectContaining({concepts:[...DERIVE_CONCEPTS.US],history:true}));
  expect(body.issuer).toMatchObject({issuer_id:US});
  expect(body).toMatchObject({market:'US',coverage:{market:'US'},coverageOtherMarket:null,latestFiling:{filingId:summary().filingId,availableDate:'2023-11-03'},eventsComputed:'materialized'});
  expect(body.latest).toMatchObject({periodKey:periodKeyOf({period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M'}),stateRev:6,truncated:false,
   facts:{revenue:{kind:'fact',value:'383285000000'},net_income_parent:{kind:'fact'},operating_cash_flow:{kind:'fact'}},
   derived:{gross_margin:{kind:'derived',metric:'gross_margin'},revenue_yoy:{kind:'derived',metric:'revenue_yoy'}}});
  expect(mocks.deps.company.eventsOfIssuer).toHaveBeenCalledWith(US,'US',{limit:3});
  expect(body.recentEvents).toHaveLength(1);
 });
 it('gate: an ineligible revenue fact withholds the fact cell AND both derived cells that use it',async()=>{
  mocks.deps.noEvidence.add(rev23.fact_id);
  const body=await (await get(GET,'AAPL')).json();
  expect(body.latest.facts.revenue).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:rev23.fact_id});
  expect(body.latest.derived.gross_margin.kind).toBe('withheld');
  expect(body.latest.derived.revenue_yoy.kind).toBe('withheld');
  expect(JSON.stringify(body)).not.toContain('383285000000');
 });
 it('asOf: one full-concept history snapshot drives latest AND live events; no materialized read',async()=>{
  mocks.derive.mockReturnValue([]);
  const res=await get(GET,'AAPL','asOf=2024-06-30');
  const body=await res.json();
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(1);
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',{concepts:null,asOf:'2024-06-30',history:true});
  expect(mocks.derive).toHaveBeenCalledWith(expect.objectContaining({cutoff:'2024-06-30'}));
  expect(mocks.deps.company.eventsOfIssuer).not.toHaveBeenCalled();
  expect(body.eventsComputed).toBe('live');
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
 });
 it('truncated envelope → latest {truncated:true} with no values; admin twin private no-store',async()=>{
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({truncated:true}));
  const body=await (await get(GET,'AAPL')).json();
  expect(body.latest).toEqual({periodKey:null,facts:{},derived:{},stateRev:1,truncated:true});
  expect((await get(ADMIN_GET,'AAPL')).headers.get('cache-control')).toBe('private, no-store');
 });
});
