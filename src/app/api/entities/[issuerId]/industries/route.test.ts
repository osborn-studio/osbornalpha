// src/app/api/entities/[issuerId]/industries/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({deps:vi.fn()}));
vi.mock('@/lib/industry/public-deps',()=>({publicReadDeps:mocks.deps}));
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:(m:{status:string})=>m.status==='ok'}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:(m:{cells:unknown[]})=>({cells:m.cells})}));

import {ISSUER_A,ISSUER_B,classRow,membershipRow,readDepsOf,stubIndustryDb} from '@/lib/industry/fixture-rows';
import {GET} from './route';

const get=(id:string,qs='')=>GET(new Request(`https://alpha.example/api/entities/${id}/industries?${qs}`),{params:Promise.resolve({issuerId:id})});
const TREE=[classRow(),classRow({scheme:'sic',version:'sec-current',code:'3674',name_zh:null,name_en:'Semiconductors'})];
const ROWS=[membershipRow(),membershipRow({membership_id:'s',scheme:'sic',version:'sec-current',code:'3674',valid_from:'2026-06-02',available_date:'2026-06-02'})];

describe('GET /api/entities/[issuerId]/industries',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.deps.mockImplementation((now:Date)=>readDepsOf(stubIndustryDb({public:new Set(['scheme:sic:sec-current']),tree:TREE,memberships:ROWS}),{now,issuers:async ids=>new Map(ids.filter(i=>i===ISSUER_A).map(i=>[i,{issuerId:i,nameZh:null,nameEn:'X',ticker:'X'}]))}));
 });
 it('only public schemes, with the scheme list',async()=>{
  const res=await get(ISSUER_A,'on=2026-11-01');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.industries.map((i:{scheme:string;currentOnly:boolean})=>[i.scheme,i.currentOnly])).toEqual([['sic',true]]);
  expect(body.schemes).toEqual([{scheme:'sw2021',version:'2021',datasetKey:'scheme:sw2021:2021',public:false},{scheme:'sic',version:'sec-current',datasetKey:'scheme:sic:sec-current',public:true}]);
 });
 it('400 bad uuid or future on; 404 unknown issuer',async()=>{
  expect((await (await get('not-a-uuid')).json()).error.code).toBe('invalid_parameter:issuerId');
  expect((await (await get(ISSUER_A,'on=2999-01-01')).json()).error.code).toBe('invalid_parameter:on');
  const nf=await get(ISSUER_B);
  expect(nf.status).toBe(404);expect((await nf.json()).error.code).toBe('unknown_issuer');
 });
});
