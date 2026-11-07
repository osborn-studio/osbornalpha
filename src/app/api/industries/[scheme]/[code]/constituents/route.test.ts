// src/app/api/industries/[scheme]/[code]/constituents/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({deps:vi.fn()}));
vi.mock('@/lib/industry/public-deps',()=>({publicReadDeps:mocks.deps}));
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:(m:{status:string;valid_from:string},on:string)=>m.status==='ok'&&m.valid_from<=on}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:(m:{cells:unknown[]})=>({cells:m.cells})}));

import {ISSUER_A,classRow,membershipRow,readDepsOf,stubIndustryDb} from '@/lib/industry/fixture-rows';
import {GET} from './route';

const get=(qs:string,scheme='sw2021',code='801120.SI')=>GET(new Request(`https://alpha.example/api/industries/${scheme}/${code}/constituents?${qs}`),{params:Promise.resolve({scheme,code})});
const TODAY=new Date().toISOString().slice(0,10);

describe('GET /api/industries/[scheme]/[code]/constituents',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.deps.mockImplementation((now:Date)=>readDepsOf(stubIndustryDb({tree:[classRow()],memberships:[membershipRow()]}),{now,unresolved:{unresolvedCount:async()=>3},
   issuers:async ids=>new Map(ids.map(id=>[id,{issuerId:id,nameZh:'贵州茅台',nameEn:null,ticker:'600519.SH'}]))}));
 });
 it('members on `on` with the membership evidence and unresolvedCount; a past `on` gets the long cache',async()=>{
  const res=await get('on=2024-06-30&pageSize=20');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({on:'2024-06-30',total:1,page:1,pageSize:20,unresolvedCount:3,currentOnly:false});
  expect(body.rows[0]).toMatchObject({issuerId:ISSUER_A,ticker:'600519.SH',membership:{availability:'effective_date_assumed',validFrom:'2021-07-30'}});
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
 });
 it('defaults on to today; no members is no-store',async()=>{
  const res=await get('on=2020-01-01');
  expect((await res.json()).rows).toEqual([]);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect((await (await get('')).json()).on).toBe(TODAY);
 });
 it('400 on future on, pageSize > 200, page 0; 404 unknown code',async()=>{
  expect((await (await get('on=2999-01-01')).json()).error.code).toBe('invalid_parameter:on');
  expect((await (await get('pageSize=201')).json()).error.code).toBe('invalid_parameter:pageSize');
  expect((await (await get('page=0')).json()).error.code).toBe('invalid_parameter:page');
  expect((await get('','sw2021','999999.SI')).status).toBe(404);
 });
});
