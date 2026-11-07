// src/app/api/companies/[ticker]/events/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn(),derive:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/company/evidence-gate',async(orig)=>({...(await orig<typeof import('@/lib/company/evidence-gate')>()),applyGate:(await import('@/lib/company/route-test-kit')).fakeApplyGate}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});
vi.mock('@/lib/company/events',()=>({deriveIssuerEvents:mocks.derive}));

import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/events/route';
import {eventIdOf} from '@/lib/company/canonical';
import {CompanyDbError} from '@/lib/company/types';
import {HEADLINE_FACT,US,emptySnapshot,eventRow,fact,makeDeps,seededTables,summary} from '@/lib/company/route-test-kit';

const get=(h:typeof GET,ticker:string,qs:string)=>h(new Request(`https://alpha.example/api/companies/${ticker}/events?${qs}`),{params:Promise.resolve({ticker})});
const headline=()=>fact({fact_id:HEADLINE_FACT,period_start:'2023-07-02',period_end:'2023-09-30',duration:'3M',value:'89498000000',value_text:'89498000000'});

describe('GET /api/companies/[ticker]/events',()=>{
 beforeEach(async()=>{
  vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});
  (mocks.deps.company.eventsOfIssuer as ReturnType<typeof vi.fn>).mockResolvedValue({rows:[eventRow()],nextCursor:'abc_DEF-1'});
  (mocks.deps.facts.factsByIds as ReturnType<typeof vi.fn>).mockResolvedValue([headline()]);
  (mocks.deps.facts.filingsOfIssuer as ReturnType<typeof vi.fn>).mockResolvedValue([(await import('@/lib/company/route-test-kit')).filingRow()]);
 });
 it('materialized keyset page via service_role eventsOfIssuer; firstSeenAt kept; gated values; evidence dict',async()=>{
  const res=await get(GET,'AAPL','kinds=period_first_seen,fact_revised&since=2023-01-01&until=2024-12-31&limit=20&cursor=abc_DEF-0');
  const body=await res.json();
  expect(mocks.deps.company.eventsOfIssuer).toHaveBeenCalledWith(US,'US',{since:'2023-01-01',until:'2024-12-31',kinds:['period_first_seen','fact_revised'],cursor:'abc_DEF-0',limit:20});
  expect(body).toMatchObject({computed:'materialized',asOf:null,nextCursor:'abc_DEF-1',withheld:{evidenceIncomplete:0,citationPending:0}});
  expect(body.rows[0]).toMatchObject({eventId:'e'.repeat(64),firstSeenAt:'2026-11-06T01:00:00Z',payload:{headline:{revenue:{value:'89498000000'}}}});
  expect(Object.keys(body.evidence)).toEqual([HEADLINE_FACT]);
 });
 it('an ineligible headline fact is replaced by a withheld object',async()=>{
  mocks.deps.noEvidence.add(HEADLINE_FACT);
  const body=await (await get(GET,'AAPL','')).json();
  expect(body.rows[0].payload.headline.revenue.value).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:HEADLINE_FACT});
  expect(JSON.stringify(body)).not.toContain('89498000000');
  expect(body.withheld.evidenceIncomplete).toBe(1);
 });
 it('asOf: live derive on one full history snapshot, no firstSeenAt, computed live, event ids from eventIdOf, own keyset',async()=>{
  const h=headline();
  (mocks.deps.snapshot as ReturnType<typeof vi.fn>).mockResolvedValue(emptySnapshot({stateRev:5,rows:[h],filings:[summary()]}));
  const mk=(nk:string,occ:string)=>({kind:'period_first_seen',natural_key:nk,occurred_on:occ,period_end:'2023-09-30',concept:null,filing_id:summary().filingId,payload:eventRow().payload,meta:{headlineAsOf:'2024-06-30'}});
  mocks.derive.mockReturnValue([mk('k1','2023-08-04'),mk('k2','2023-11-03'),mk('k3','2024-02-02')]);
  const res=await get(GET,'AAPL','asOf=2024-06-30&limit=2');
  const body=await res.json();
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',{concepts:null,asOf:'2024-06-30',history:true});
  expect(mocks.derive).toHaveBeenCalledWith({rows:[h],filings:[summary()],cutoff:'2024-06-30'});
  expect(mocks.deps.company.eventsOfIssuer).not.toHaveBeenCalled();
  expect(body).toMatchObject({computed:'live',asOf:'2024-06-30',stateRev:5});
  expect(body.rows.map((r:{occurredOn:string})=>r.occurredOn)).toEqual(['2024-02-02','2023-11-03']);
  expect(body.rows[0]).toMatchObject({eventId:eventIdOf(US,'US','period_first_seen','k3'),firstSeenAt:null});
  const next=await (await get(GET,'AAPL',`asOf=2024-06-30&limit=2&cursor=${body.nextCursor}`)).json();
  expect(next.rows.map((r:{naturalKey:string})=>r.naturalKey)).toEqual(['k1']);
  expect(next.nextCursor).toBeNull();
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
 });
 it('replay truncated → 400 replay_truncated, no-store',async()=>{
  (mocks.deps.snapshot as ReturnType<typeof vi.fn>).mockResolvedValue(emptySnapshot({truncated:true}));
  const res=await get(GET,'AAPL','asOf=2024-06-30');
  expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('replay_truncated');expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('validation: limit ≤ 200, kinds vocabulary, cursor syntax and invalid_read → 400 cursor',async()=>{
  for(const [qs,code] of [['limit=201','limit'],['kinds=price_move','kinds'],['cursor=%20bad','cursor'],['since=2024-02-30','since']] as const){
   const r=await get(GET,'AAPL',qs);expect(r.status).toBe(400);expect((await r.json()).error.code).toBe(`invalid_parameter:${code}`);
  }
  (mocks.deps.company.eventsOfIssuer as ReturnType<typeof vi.fn>).mockRejectedValue(new CompanyDbError('invalid_read'));
  expect((await (await get(GET,'AAPL','cursor=zzz')).json()).error.code).toBe('invalid_parameter:cursor');
 });
 it('admin twin: private, no-store',async()=>{
  expect((await get(ADMIN_GET,'AAPL','')).headers.get('cache-control')).toBe('private, no-store');
 });
});
