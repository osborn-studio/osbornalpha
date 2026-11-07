// src/app/api/companies/[ticker]/filings/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});

import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/filings/route';
import {US,emptySnapshot,makeDeps,seededTables,summary} from '@/lib/company/route-test-kit';

const get=(h:typeof GET,ticker:string,qs:string)=>h(new Request(`https://alpha.example/api/companies/${ticker}/filings?${qs}`),{params:Promise.resolve({ticker})});

describe('GET /api/companies/[ticker]/filings',()=>{
 beforeEach(async()=>{vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});});
 it('one snapshot read (filings independent of the facts limit), newest first, asOf echoed only when given',async()=>{
  const older=summary({filingId:'f0000000-0000-4000-8000-00000000000a',availableDate:'2023-02-03'}),newer=summary();
  (mocks.deps.snapshot as ReturnType<typeof vi.fn>).mockResolvedValue(emptySnapshot({stateRev:3,filings:[older,newer]}));
  const res=await get(GET,'AAPL','asOf=2024-06-30');
  const body=await res.json();
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',{concepts:['revenue'],asOf:'2024-06-30',history:false,limit:1});
  expect(body).toMatchObject({issuerId:US,ticker:'AAPL',market:'US',asOf:'2024-06-30',stateRev:3});
  expect(body.filings.map((f:{filingId:string})=>f.filingId)).toEqual([newer.filingId,older.filingId]);
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
  expect((await (await get(GET,'AAPL','')).json()).asOf).toBeNull();
 });
 it('HK → 404 market_not_served; admin twin is private, no-store',async()=>{
  const hk=await get(GET,'00700.HK','');expect(hk.status).toBe(404);expect((await hk.json()).error.code).toBe('market_not_served');
  expect((await get(ADMIN_GET,'AAPL','')).headers.get('cache-control')).toBe('private, no-store');
 });
});
