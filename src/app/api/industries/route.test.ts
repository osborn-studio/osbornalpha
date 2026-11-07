// src/app/api/industries/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({deps:vi.fn()}));
vi.mock('@/lib/industry/public-deps',()=>({publicReadDeps:mocks.deps}));
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:()=>true}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:(m:{cells:unknown[]})=>({cells:m.cells})}));

import {RUN_ID,cellRow,classRow,missingCell,readDepsOf,runRow,stubIndustryDb} from '@/lib/industry/fixture-rows';
import {GET} from './route';

const get=(qs:string)=>GET(new Request(`https://alpha.example/api/industries?${qs}`));
const TREE=[classRow(),classRow({code:'801080.SI',name_zh:'电子'})];

describe('GET /api/industries',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.deps.mockImplementation((now:Date)=>readDepsOf(stubIndustryDb({tree:TREE,runs:[runRow()],cells:[cellRow(),missingCell({code:'801080.SI'})],freshness:[{dataset:'industry.agg.sw2021',status:'fresh',last_ok_at:now.toISOString()}]}),{now}));
 });
 it('returns the run header at the top level, cells with missing reasons, and a midnight-bounded shared cache',async()=>{
  const res=await get('scheme=sw2021&metric=gross_margin&periods=10');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({methodVersion:'industry-agg/1.0',runId:RUN_ID,factsAsOf:'2026-11-03',historyClass:'reconstruction',freshness:'fresh',state:'ok',kind:'aggregate',scheme:'sw2021',version:'2021',level:1,metric:'gross_margin',duration:'12M'});
  expect(body.cells.map((c:{code:string;status:string;missingReason:string|null;value:string|null})=>[c.code,c.status,c.missingReason,c.value])).toEqual([['801120.SI','ok',null,'0.478'],['801080.SI','missing','financial_excluded',null]]);
  expect(body.valuation).toEqual({state:'not_enabled'});
  expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=\d+, stale-while-revalidate=600$/);
 });
 it('403 unlicensed with no-store when the scheme dataset is not public',async()=>{
  mocks.deps.mockImplementation((now:Date)=>readDepsOf(stubIndustryDb({public:new Set(),tree:TREE}),{now}));
  const res=await get('');
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe('unlicensed');
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('empty (no active run) is 200 with runId null and no-store',async()=>{
  mocks.deps.mockImplementation((now:Date)=>readDepsOf(stubIndustryDb({tree:TREE}),{now}));
  const res=await get('');
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({state:'empty',runId:null,methodVersion:null});
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('validates parameters (400 invalid_parameter:<name>, no-store, deps untouched)',async()=>{
  const bad=async(qs:string,code:string)=>{const res=await get(qs);expect(res.status,qs).toBe(400);expect((await res.json()).error.code).toBe(code);expect(res.headers.get('cache-control')).toBe('no-store');};
  await bad('scheme=gics','invalid_parameter:scheme');
  await bad('version=2014','invalid_parameter:version');
  await bad('level=4','invalid_parameter:level');
  await bad('metric=pe','invalid_parameter:metric');
  await bad('metric=gross_margin&duration=3M','invalid_parameter:duration');
  await bad('periods=45','invalid_parameter:periods');
  await bad('metric=roe&metric=roe','invalid_parameter:metric');
  await bad('scheme=sic&level=2','invalid_parameter:level');
  expect(mocks.deps).not.toHaveBeenCalled();
 });
 it('SIC answers the navigation list',async()=>{
  mocks.deps.mockImplementation((now:Date)=>readDepsOf(stubIndustryDb({tree:[classRow({scheme:'sic',version:'sec-current',code:'3674',name_zh:null,name_en:'Semiconductors'})]}),{now,memberCounts:async()=>new Map([['3674',62]])}));
  const body=await (await get('scheme=sic')).json();
  expect(body).toMatchObject({state:'ok',kind:'navigation',runId:null,nodes:[{code:'3674',members:62}]});
 });
 it('500 internal without leaking the error',async()=>{
  mocks.deps.mockImplementation(()=>{throw new Error('NEXT_PUBLIC_SUPABASE_URL secret detail');});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const res=await get('');
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain('secret');
  expect(res.headers.get('cache-control')).toBe('no-store');
  spy.mockRestore();
 });
});
