// src/app/api/companies/[ticker]/packet/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/company/evidence-gate',async(orig)=>({...(await orig<typeof import('@/lib/company/evidence-gate')>()),applyGate:(await import('@/lib/company/route-test-kit')).fakeApplyGate}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});

import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/packet/route';
import {FACT_CONCEPTS,MAPPING_GEN} from '@/lib/facts/concepts';
import {FORMULA_VERSION} from '@/lib/facts/derive';
import type {FactRow} from '@/lib/facts/types';
import {PACKET_MAX_BYTES} from '@/lib/company/handlers/packet';
import {US,emptySnapshot,fact,makeDeps,seededTables,summary} from '@/lib/company/route-test-kit';

const get=(h:typeof GET,ticker:string,qs='')=>h(new Request(`https://alpha.example/api/companies/${ticker}/packet?${qs}`),{params:Promise.resolve({ticker})});
const fn=(x:unknown)=>x as ReturnType<typeof vi.fn>;
/** `years` fiscal years of every US concept (12M or INSTANT) + 3M quarters of the last year: large enough to exceed 32 KB uncut. */
function bigRows(years:number):FactRow[]{
 const out:FactRow[]=[];
 const usConcepts=FACT_CONCEPTS.filter(c=>c.usGaap.length>0);
 for(let i=0;i<years;i++){
  const y=2023-i,end=`${y}-12-31`,start=`${y}-01-01`;
  for(const c of usConcepts){
   const instant=c.nature==='instant';
   out.push(fact({concept:c.id,statement:c.statement,period_start:instant?null:start,period_end:end,duration:instant?'INSTANT':'12M',unit:c.unitKind==='shares'?'shares':c.unitKind==='per_share'?'USD/shares':'USD',value:String(1000000000+i*7+c.id.length),value_text:String(1000000000+i*7+c.id.length),available_date:`${y+1}-02-15`}));
  }
 }
 for(const [s,e] of [['2023-01-01','2023-03-31'],['2023-04-01','2023-06-30'],['2023-07-01','2023-09-30']] as const)
  for(const c of usConcepts.filter(c=>c.nature==='duration'))out.push(fact({concept:c.id,statement:c.statement,period_start:s,period_end:e,duration:'3M',value:'123456789',value_text:'123456789',available_date:'2023-11-01'}));
 return out;
}

describe('GET /api/companies/[ticker]/packet (spec §6.1, §9.2)',()=>{
 beforeEach(async()=>{vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});});
 it('defaults 5 annual / 4 recent; three statements; six metrics; every value has factId + availableDate; provenance; one envelope',async()=>{
  const rev=fact(),gp=fact({concept:'gross_profit',value:'169148000000',value_text:'169148000000'});
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({stateRev:8,rows:[rev,gp],filings:[summary()]}));
  const res=await get(GET,'AAPL');
  const body=await res.json();
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(1);
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',expect.objectContaining({concepts:null,history:true}));
  expect(body).toMatchObject({market:'US',provenance:{mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,stateRev:8},clipped:{annual:0,recent:0},truncated:false});
  const revRow=body.annual.IS.find((r:{concept:string})=>r.concept==='revenue');
  expect(Object.values(revRow.values)[0]).toEqual({value:'383285000000',factId:rev.fact_id,availableDate:'2023-11-03'});
  expect(body.metrics.find((m:{metric:string})=>m.metric==='gross_margin')).toMatchObject({value:expect.any(String),factIds:expect.arrayContaining([rev.fact_id,gp.fact_id]),availableDate:'2023-11-03'});
  expect(body.metrics.every((m:{metric:string})=>['gross_margin','net_margin','fcf','revenue_yoy','net_income_yoy','roe'].includes(m.metric))).toBe(true);
  expect(body.evidence).toBeUndefined();
 });
 it('gate: an ineligible fact is {withheld, factId} with no value; metric on it withheld too',async()=>{
  const rev=fact({value:'383285000777',value_text:'383285000777'}),gp=fact({concept:'gross_profit'});
  mocks.deps.noEvidence.add(rev.fact_id);
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[rev,gp],filings:[summary()]}));
  const body=await (await get(GET,'AAPL')).json();
  expect(JSON.stringify(body)).not.toContain('383285000777');
  expect(Object.values(body.annual.IS.find((r:{concept:string})=>r.concept==='revenue').values)[0]).toEqual({withheld:'evidence_incomplete',factId:rev.fact_id});
  expect(body.metrics.find((m:{metric:string})=>m.metric==='gross_margin')).toMatchObject({withheld:'evidence_incomplete'});
  expect(body.withheld.evidenceIncomplete).toBeGreaterThan(0);
 });
 it('JSON ≤ 32 KB guaranteed by clipping periods; clipped counts reported',async()=>{
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:bigRows(12),filings:[summary()]}));
  const res=await get(GET,'AAPL','annualPeriods=10&recentPeriods=8');
  const text=await res.text();
  expect(Buffer.byteLength(text,'utf8')).toBeLessThanOrEqual(PACKET_MAX_BYTES);
  const body=JSON.parse(text);
  expect(body.clipped.annual+body.clipped.recent).toBeGreaterThan(0);
  // periods are the IS/BS/CF union (计划第 3 轮审计 R4): 12M and INSTANT keys share one period end per fiscal year
  expect(new Set(body.annual.periods.map((p:{periodEnd:string})=>p.periodEnd)).size).toBe(10-body.clipped.annual);
 });
 it('section periods are the union over IS/BS/CF; every emitted values key is declared (计划第 3 轮审计 R4)',async()=>{
  const is=fact();   // IS revenue 2022-09-25..2023-09-30 12M
  const bs=fact({concept:'cash',source_concept:'CashAndCashEquivalentsAtCarryingValue',statement:'BS',period_start:null,period_end:'2023-09-30',duration:'INSTANT',value:'29965000000',value_text:'29965000000'});
  const cf=fact({concept:'operating_cash_flow',source_concept:'NetCashProvidedByUsedInOperatingActivities',statement:'CF',period_start:'2022-07-01',period_end:'2023-06-30',duration:'12M',value:'110543000000',value_text:'110543000000',available_date:'2023-08-01'});
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[is,bs,cf],filings:[summary()]}));
  const body=await (await get(GET,'AAPL','annualPeriods=1&recentPeriods=1')).json();
  type Sec={periods:{key:string}[];IS:{values:Record<string,unknown>}[];BS:{values:Record<string,unknown>}[];CF:{values:Record<string,unknown>}[]};
  for(const sec of [body.annual,body.recent] as Sec[]){
   const declared=new Set(sec.periods.map(p=>p.key));
   for(const st of ['IS','BS','CF'] as const)for(const row of sec[st])for(const k of Object.keys(row.values))expect(declared.has(k)).toBe(true);
  }
  expect(body.annual.periods.map((p:{key:string})=>p.key)).toEqual(['2023-09-30:2023-09-30:INSTANT','2022-09-25:2023-09-30:12M','2022-07-01:2023-06-30:12M']);
  expect(body.annual.BS.find((r:{concept:string})=>r.concept==='cash').values).toEqual({'2023-09-30:2023-09-30:INSTANT':{value:'29965000000',factId:bs.fact_id,availableDate:'2023-11-03'}});
  expect(Object.keys(body.annual.CF.find((r:{concept:string})=>r.concept==='operating_cash_flow').values)).toEqual(['2022-07-01:2023-06-30:12M']);
 });
 it('parameters: annualPeriods ≤ 10, recentPeriods ≤ 8; truncated → 200 empty no-store; admin twin private',async()=>{
  expect((await get(GET,'AAPL','annualPeriods=11')).status).toBe(400);
  expect((await get(GET,'AAPL','recentPeriods=9')).status).toBe(400);
  expect((await get(GET,'AAPL','recentPeriods=0')).status).toBe(400);
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({truncated:true}));
  const t=await get(GET,'AAPL');
  expect(await t.json()).toMatchObject({truncated:true,metrics:[],annual:{periods:[],IS:[],BS:[],CF:[]}});
  expect(t.headers.get('cache-control')).toBe('no-store');
  expect((await get(ADMIN_GET,'AAPL')).headers.get('cache-control')).toBe('private, no-store');
 });
});
