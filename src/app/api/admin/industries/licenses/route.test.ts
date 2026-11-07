// src/app/api/admin/industries/licenses/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),setLicense:vi.fn(),insert:vi.fn(),from:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({from:mocks.from})}));
vi.mock('@/lib/industry/db',()=>({supabaseIndustryDb:()=>({setDatasetLicense:mocks.setLicense})}));
vi.mock('next/cache',()=>({revalidateTag:mocks.revalidate}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {POST} from './route';

const ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const URL_='https://alpha.example/api/admin/industries/licenses';
const post=(body:unknown,headers:Record<string,string>={'content-type':'application/json'})=>POST(new Request(URL_,{method:'POST',headers,body:JSON.stringify(body)}));

describe('POST /api/admin/industries/licenses',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({id:ADMIN});
  mocks.setLicense.mockResolvedValue(undefined);
  mocks.insert.mockResolvedValue({error:null});
  mocks.from.mockReturnValue({insert:mocks.insert});
 });
 it('writes through setDatasetLicense, audits, then revalidates the industries tag',async()=>{
  const res=await post({dataset_key:'scheme:sw2021:2021',status:'public',note:'owner decision A 2026-11-10'},{'content-type':'application/json','origin':'https://alpha.example'});
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({dataset_key:'scheme:sw2021:2021',status:'public'});
  expect(mocks.setLicense).toHaveBeenCalledWith('scheme:sw2021:2021','public',ADMIN,'owner decision A 2026-11-10');
  expect(mocks.from).toHaveBeenCalledWith('research_audit_log');
  expect(mocks.insert.mock.calls[0][0]).toMatchObject({user_id:ADMIN,action:'industry.license_set',object_type:'industry',object_id:null,detail:{dataset_key:'scheme:sw2021:2021',status:'public',object_ref:'scheme:sw2021:2021'}});
  expect(mocks.revalidate).toHaveBeenCalledWith('industries');
  expect(mocks.setLicense.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidate.mock.invocationCallOrder[0]);
 });
 it('an audit failure after the committed switch is logged, still 200 and still revalidated',async()=>{
  mocks.insert.mockResolvedValue({error:{message:'audit down'}});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect((await post({dataset_key:'marks:tushare-daily_basic',status:'internal'})).status).toBe(200);
  expect(spy).toHaveBeenCalledWith('[admin/industries] audit failed','audit down');
  expect(mocks.revalidate).toHaveBeenCalledWith('industries');
  spy.mockRestore();
 });
 it('validates the body, media type and origin before writing',async()=>{
  expect((await post({dataset_key:'scheme:gics:x',status:'public'})).status).toBe(400);
  expect((await post({dataset_key:'scheme:sw2021:2021',status:'open'})).status).toBe(400);
  expect((await post({dataset_key:'scheme:sw2021:2021',status:'public',note:'x'.repeat(501)})).status).toBe(400);
  expect((await post({dataset_key:'scheme:sw2021:2021',status:'public'},{'content-type':'text/plain'})).status).toBe(415);
  expect((await post({dataset_key:'scheme:sw2021:2021',status:'public'},{'content-type':'application/json',origin:'https://evil.example'})).status).toBe(403);
  expect(mocks.setLicense).not.toHaveBeenCalled();expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it('401 / 403 for non-admins; 500 without detail when the write fails',async()=>{
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));
  expect((await post({dataset_key:'scheme:sw2021:2021',status:'public'})).status).toBe(401);
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));
  expect((await post({dataset_key:'scheme:sw2021:2021',status:'public'})).status).toBe(403);
  mocks.setLicense.mockRejectedValueOnce(new Error('42501 permission denied secret'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const res=await post({dataset_key:'scheme:sw2021:2021',status:'public'});
  expect(res.status).toBe(500);expect(JSON.stringify(await res.json())).not.toContain('secret');
  expect(mocks.revalidate).not.toHaveBeenCalled();
  spy.mockRestore();
 });
});
