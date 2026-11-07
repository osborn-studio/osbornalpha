// src/app/api/admin/industries/replay/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),db:null as unknown}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/industry/db',()=>({supabaseIndustryDb:()=>mocks.db}));
vi.mock('@/lib/industry/manifest',async()=>{const f=await import('@/lib/industry/fixture-rows');return {supabaseManifestStore:()=>({get:async()=>f.manifestOf()})};});
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:()=>true}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:(m:{cells:unknown[]})=>({cells:m.cells}),replayCell:(m:{cells:{metric:string;duration:string;period_start:string}[]},k:{metric:string;duration:string;period_start:string})=>({cell:m.cells.find(c=>c.metric===k.metric&&c.duration===k.duration&&c.period_start===k.period_start)??null,reproduced:true,mismatches:[]})}));

import {RUN_ID,cellRow,runRow,stubIndustryDb} from '@/lib/industry/fixture-rows';
import {GET} from './route';

const get=(qs:string)=>GET(new Request(`https://alpha.example/api/admin/industries/replay?${qs}`));

describe('GET /api/admin/industries/replay',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({id:'admin'});
  mocks.db={...stubIndustryDb({runs:[runRow({status:'failed'})],cells:[cellRow()]}),unresolvedOf:async()=>[{ts_code:'600999.SH',in_date:'2021-07-30',out_date:null,source_membership_id:'s1'}]};
 });
 it('replays a failed run’s cell with the unresolved list and a focus',async()=>{
  const res=await get(`runId=${RUN_ID}&code=801120.SI&periodEnd=2025-12-31&metric=gross_margin`);
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.run.status).toBe('failed');
  expect(body.unresolved).toEqual([{ts_code:'600999.SH',in_date:'2021-07-30',out_date:null,source_membership_id:'s1'}]);
  expect(body.focus).toMatchObject({reproduced:true,cell:{metric:'gross_margin'}});
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('400 on bad params, 404 unknown run / cell',async()=>{
  expect((await get(`code=801120.SI&periodEnd=2025-12-31`)).status).toBe(400);
  expect((await get(`runId=${RUN_ID}&periodEnd=2025-12-31`)).status).toBe(400);
  expect((await get(`runId=${RUN_ID}&code=801120.SI`)).status).toBe(400);
  expect((await get(`runId=00000000-0000-4000-8000-000000000000&code=801120.SI&periodEnd=2025-12-31`)).status).toBe(404);
  expect((await (await get(`runId=${RUN_ID}&code=801080.SI&periodEnd=2025-12-31`)).json()).error).toBe('unknown_cell');
 });
});
