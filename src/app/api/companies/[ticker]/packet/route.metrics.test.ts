// Packet metric lineage, clip accounting and the over-size fallback (Task 15 review fixes).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';
import type {MetricRow} from '@/lib/facts/types';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,metrics:null as null|(()=>unknown[])}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/company/evidence-gate',async(orig)=>({...(await orig<typeof import('@/lib/company/evidence-gate')>()),applyGate:(await import('@/lib/company/route-test-kit')).fakeApplyGate}));
vi.mock('@/lib/facts/derive',async(orig)=>{const real=await orig<typeof import('@/lib/facts/derive')>();return {...real,deriveMetrics:(...a:Parameters<typeof real.deriveMetrics>)=>mocks.metrics?mocks.metrics():real.deriveMetrics(...a)};});

import {GET} from './route';
import {PACKET_MAX_BYTES} from '@/lib/company/handlers/packet';
import {CN,US,cnSummary,emptySnapshot,fact,makeDeps,seededTables,summary,FIL_CN_PENDING} from '@/lib/company/route-test-kit';

const get=(t:string,qs='')=>GET(new Request(`https://alpha.example/api/companies/${t}/packet?${qs}`),{params:Promise.resolve({ticker:t})});
const fn=(x:unknown)=>x as ReturnType<typeof vi.fn>;
const metric=(p:Partial<MetricRow>):MetricRow=>({issuer_id:US,market:'US',metric:'roe',period_start:'2022-09-25',period_end:'2023-09-30',duration:'TTM',value:'0.25',unit:'ratio',input_unit:'USD',basis:'pure',formula_version:'f1',inputs:[],based_on_rev:1,as_of:'2024-01-01',...p});

describe('packet metrics, clipping, fallback',()=>{
 beforeEach(async()=>{vi.clearAllMocks();mocks.metrics=null;mocks.deps=makeDeps(await seededTables());});
 it('ROE keeps per-input lineage: a fact reused across quarters with mixed YTD rules keeps every input',async()=>{
  const a=fact(),b=fact({concept:'net_income',statement:'IS'});
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[a,b],filings:[summary()]}));
  mocks.metrics=()=>[metric({inputs:[
   {fact_id:a.fact_id,concept:'revenue',filing_id:a.filing_id,available_date:'2023-11-03',quarter:['2023-04-01','2023-06-30'],ytd_rule:'same_filing'},
   {fact_id:a.fact_id,concept:'revenue',filing_id:a.filing_id,available_date:'2023-11-03',quarter:['2023-07-01','2023-09-30'],ytd_rule:'never_revised'},
   {fact_id:b.fact_id,concept:'net_income',filing_id:b.filing_id,available_date:'2023-11-03'}]})];
  const body=await (await get('AAPL')).json();
  const roe=body.metrics.find((m:{metric:string})=>m.metric==='roe');
  expect(roe).toMatchObject({value:'0.25',inputUnit:'USD'});
  expect(roe.inputs).toEqual([
   {factId:a.fact_id,availableDate:'2023-11-03',quarter:['2023-04-01','2023-06-30'],ytdRule:'a'},
   {factId:a.fact_id,availableDate:'2023-11-03',quarter:['2023-07-01','2023-09-30'],ytdRule:'b'},
   {factId:b.fact_id,availableDate:'2023-11-03'}]);
 });
 it('a metric with zero inputs is withheld',async()=>{
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[fact()],filings:[summary()]}));
  mocks.metrics=()=>[metric({inputs:[]})];
  const roe=(await (await get('AAPL')).json()).metrics.find((m:{metric:string})=>m.metric==='roe');
  expect(roe).toMatchObject({withheld:'evidence_incomplete'});
  expect(roe.value).toBeUndefined();
 });
 it('a metric withheld on citation_pending alone (CN, filing not linked)',async()=>{
  const f=fact({issuer_id:CN,market:'CN',filing_id:FIL_CN_PENDING,period_start:'2023-01-01',period_end:'2023-12-31',available_date:'2024-04-03',unit:'CNY'});
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[f],filings:[cnSummary()]}));
  mocks.metrics=()=>[metric({issuer_id:CN,market:'CN',period_start:'2023-01-01',period_end:'2023-12-31',inputs:[{fact_id:f.fact_id,concept:'revenue',filing_id:f.filing_id,available_date:'2024-04-03'}]})];
  const body=await (await get('600519.SH')).json();
  const roe=body.metrics.find((m:{metric:string})=>m.metric==='roe');
  expect(roe).toMatchObject({withheld:'citation_pending',factId:f.fact_id});
 });
 it('clipped counts only periods really removed: requesting more periods than exist reports 0',async()=>{
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[fact()],filings:[summary()]}));
  const body=await (await get('AAPL','annualPeriods=10&recentPeriods=8')).json();
  expect(body.clipped).toEqual({annual:0,recent:0});
 });
 it('when even 1/1 exceeds 32 KB: empty statements and metrics, clipped = all, withheld counts reset',async()=>{
  const a=fact();
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({rows:[a],filings:[summary()]}));
  mocks.metrics=()=>[metric({inputs:Array.from({length:600},()=>({fact_id:a.fact_id,concept:'revenue',filing_id:a.filing_id,available_date:'2023-11-03'}))})];
  const res=await get('AAPL');
  const text=await res.text();
  expect(Buffer.byteLength(text,'utf8')).toBeLessThanOrEqual(PACKET_MAX_BYTES);
  const body=JSON.parse(text);
  expect(body.metrics).toEqual([]);
  expect(body.annual.periods).toEqual([]);
  expect(body.clipped.annual+body.clipped.recent).toBeGreaterThan(0);
  expect(body.withheld).toEqual({evidenceIncomplete:0,citationPending:0});
 });
});
