// src/app/api/industries/[scheme]/[code]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({deps:vi.fn()}));
vi.mock('@/lib/industry/public-deps',()=>({publicReadDeps:mocks.deps}));
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:(m:{status:string})=>m.status==='ok'}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:(m:{cells:unknown[]})=>({cells:m.cells})}));

import {RUN_ID,cellRow,classRow,membershipRow,readDepsOf,runRow,stubIndustryDb} from '@/lib/industry/fixture-rows';
import {GET} from './route';

const get=(scheme:string,code:string,qs='')=>GET(new Request(`https://alpha.example/api/industries/${scheme}/${code}?${qs}`),{params:Promise.resolve({scheme,code})});

describe('GET /api/industries/[scheme]/[code]',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.deps.mockImplementation((now:Date)=>readDepsOf(stubIndustryDb({tree:[classRow()],runs:[runRow()],cells:[cellRow()],memberships:[membershipRow()]}),{now,unresolved:{unresolvedCount:async()=>1}}));
 });
 it('node, members (unresolved as a count), series, method, sources, top-level header',async()=>{
  const res=await get('sw2021','801120.SI','metrics=gross_margin&window=all');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({methodVersion:'industry-agg/1.0',runId:RUN_ID,factsAsOf:'2026-11-03',historyClass:'reconstruction',scheme:'sw2021',window:'all',reconciliationSummary:null,
   node:{code:'801120.SI',nameZh:'食品饮料'},members:{count:1,unresolved:1},aggregated:true,valuation:{state:'not_enabled'}});
  expect(body.series).toHaveLength(1);
  expect(body.sources).toEqual(['sw_via_tushare','exchange_via_tushare','tushare_statements']);
  expect(JSON.stringify(body)).not.toContain('ts_code');   // no source record leaves the server
 });
 it('404 unknown_industry; 403 unlicensed; 400 on bad scheme/code/window',async()=>{
  const nf=await get('sw2021','999999.SI');
  expect(nf.status).toBe(404);expect((await nf.json()).error.code).toBe('unknown_industry');
  mocks.deps.mockImplementation((now:Date)=>readDepsOf(stubIndustryDb({public:new Set(),tree:[classRow()]}),{now}));
  expect((await get('sw2021','801120.SI')).status).toBe(403);
  expect((await (await get('gics','801120.SI')).json()).error.code).toBe('invalid_parameter:scheme');
  expect((await (await get('sw2021','a%2Fb')).json()).error.code).toBe('invalid_parameter:code');
  expect((await (await get('sw2021','801120.SI','window=3y')).json()).error.code).toBe('invalid_parameter:window');
 });
});
