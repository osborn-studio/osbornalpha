// src/app/api/companies/[ticker]/facts/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/company/evidence-gate',async(orig)=>({...(await orig<typeof import('@/lib/company/evidence-gate')>()),applyGate:(await import('@/lib/company/route-test-kit')).fakeApplyGate}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});

import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/facts/route';
import {US,cnFact,cnSummary,emptySnapshot,fact,makeDeps,seededTables,summary} from '@/lib/company/route-test-kit';

const Q='concept=revenue&periodStart=2022-09-25&periodEnd=2023-09-30&unit=USD';
const get=(h:typeof GET,ticker:string,qs:string)=>h(new Request(`https://alpha.example/api/companies/${ticker}/facts?${qs}`),{params:Promise.resolve({ticker})});

describe('GET /api/companies/[ticker]/facts (drawer series, §0 #68)',()=>{
 beforeEach(async()=>{vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});});
 const setSnap=(s:Parameters<typeof emptySnapshot>[0])=>(mocks.deps.snapshot as ReturnType<typeof vi.fn>).mockResolvedValue(emptySnapshot(s));
 it('history:true read by natural key; ascending series with seq/revision; transform chain fields; other units listed',async()=>{
  const a=fact({value:'100',value_text:'100',disclosure_seq:1,is_current:false,available_date:'2023-11-03'});
  const b=fact({value:'110',value_text:'110',disclosure_seq:2,is_current:true,is_revision:true,available_date:'2024-11-01',filing_id:'f0000000-0000-4000-8000-000000000009'});
  const other=fact({unit:'EUR'}),wrongPeriod=fact({period_start:'2021-09-26',period_end:'2022-09-24'});
  setSnap({stateRev:4,rows:[b,a,other,wrongPeriod],filings:[summary(),summary({filingId:'f0000000-0000-4000-8000-000000000009',availableDate:'2024-11-01'})]});
  const res=await get(GET,'AAPL',`${Q}&asOf=2025-01-31`);
  const body=await res.json();
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',{concepts:['revenue'],asOf:'2025-01-31',from:'2023-09-30',to:'2023-09-30',history:true});
  expect(body).toMatchObject({concept:'revenue',periodStart:'2022-09-25',periodEnd:'2023-09-30',unit:'USD',otherUnits:['EUR'],stateRev:4,truncated:false});
  expect(body.series.map((s:{factId:string})=>s.factId)).toEqual([a.fact_id,b.fact_id]);
  expect(body.series[0]).toMatchObject({kind:'fact',value:'100',disclosureSeq:1,isCurrent:false,isRevision:false,sourceConcept:'Revenues',mappingVersion:'facts-map/1',mappingGen:1,delta:null,relChange:null});
  expect(body.series[1]).toMatchObject({kind:'fact',value:'110',disclosureSeq:2,isRevision:true,delta:'10',relChange:'0.1'});
  expect(body.otherUnitSeries).toEqual([expect.objectContaining({kind:'fact',factId:other.fact_id,unit:'EUR',delta:null,relChange:null})]);
  expect(Object.keys(body.evidence).sort()).toEqual([a.fact_id,b.fact_id,other.fact_id].sort());
  expect(Object.keys(body.filings)).toHaveLength(2);
 });
 it('withheld entries carry no value and break the delta chain (no value leaks through a difference)',async()=>{
  const a=fact({value:'100',value_text:'100',disclosure_seq:1}),b=fact({value:'110',value_text:'110',disclosure_seq:2});
  mocks.deps.noEvidence.add(a.fact_id);setSnap({rows:[a,b],filings:[summary()]});
  const body=await (await get(GET,'AAPL',Q)).json();
  expect(body.series[0]).toMatchObject({kind:'withheld',reason:'evidence_incomplete',factId:a.fact_id});
  expect(body.series[0].value).toBeUndefined();
  expect(body.series[1]).toMatchObject({kind:'fact',value:'110',delta:null,relChange:null});
  expect(body.withheld).toEqual({evidenceIncomplete:1,citationPending:0});
 });
 it('INSTANT periodStart is the period end; CN pending withheld publicly, shown by the admin twin',async()=>{
  const v=cnFact({concept:'monetary_funds',statement:'BS',period_start:null,period_end:'2023-12-31',duration:'INSTANT',value:'69621263173.71',value_text:'69621263173.71'});
  setSnap({rows:[v],filings:[cnSummary()]});
  const qs='concept=monetary_funds&periodStart=2023-12-31&periodEnd=2023-12-31&unit=CNY';
  const pub=await (await get(GET,'600519.SH',qs)).json();
  expect(pub.series[0]).toMatchObject({kind:'withheld',reason:'citation_pending'});
  expect(JSON.stringify(pub)).not.toContain('69621263173.71');
  const adm=await get(ADMIN_GET,'600519.SH',qs);
  expect((await adm.json()).series[0]).toMatchObject({kind:'fact',value:'69621263173.71'});
  expect(adm.headers.get('cache-control')).toBe('private, no-store');
 });
 it('validation: concept/periodStart/periodEnd/unit required; unknown concept; bad dates; truncated → 200 empty no-store',async()=>{
  for(const [qs,code] of [['periodStart=2022-09-25&periodEnd=2023-09-30&unit=USD','concept'],['concept=nope&periodStart=2022-09-25&periodEnd=2023-09-30&unit=USD','concept'],['concept=revenue&periodEnd=2023-09-30&unit=USD','periodStart'],['concept=revenue&periodStart=2022-09-25&periodEnd=2023-02-30&unit=USD','periodEnd'],['concept=revenue&periodStart=2022-09-25&periodEnd=2023-09-30','unit'],['concept=revenue&periodStart=2022-09-25&periodEnd=2023-09-30&unit=US%20D','unit']] as const){
   const r=await get(GET,'AAPL',qs);expect(r.status).toBe(400);expect((await r.json()).error.code).toBe(`invalid_parameter:${code}`);
  }
  setSnap({truncated:true});
  const t=await get(GET,'AAPL',Q);
  expect(await t.json()).toMatchObject({truncated:true,series:[]});expect(t.headers.get('cache-control')).toBe('no-store');
 });
});
