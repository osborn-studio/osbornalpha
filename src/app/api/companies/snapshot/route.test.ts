// src/app/api/companies/snapshot/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});
import {GET} from './route';
import {GET as ADMIN_GET} from '../../admin/companies/snapshot/route';
import {makeDeps,record,seededTables} from '@/lib/company/route-test-kit';

const EDGAR='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',TS='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NONE='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const req=(h:typeof GET,fact:string)=>h(new Request(`https://alpha.example/api/companies/snapshot?fact=${fact}`));

describe('snapshot download (§0.1 item 2\'\', §6.4)',()=>{
 beforeEach(async()=>{
  vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u-admin'});
  (mocks.deps.company.evidenceOf as ReturnType<typeof vi.fn>).mockImplementation(async(ids:string[])=>new Map(ids.filter(i=>i!==NONE).map(i=>[i,record(i,i===TS?{source:'tushare',snapshot_path:`tushare/x/${'t'.repeat(64)}.json`,api:'income',url:null}:{})])));
 });
 afterEach(()=>vi.useRealTimers());
 it('EDGAR: 302 to a freshly minted 60 s signed URL with no-store; a download link older than 60 s still works (re-minted each call)',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));
  const a=await req(GET,EDGAR);
  expect(a.status).toBe(302);expect(a.headers.get('cache-control')).toBe('no-store');
  expect(a.headers.get('location')).toContain(record(EDGAR).snapshot_path);
  vi.setSystemTime(new Date('2026-11-06T00:05:00Z'));
  const b=await req(GET,EDGAR);
  expect(b.status).toBe(302);
  expect(mocks.deps.signSnapshot).toHaveBeenCalledTimes(2);
  expect(mocks.deps.signSnapshot).toHaveBeenCalledWith(record(EDGAR).snapshot_path,60);
 });
 it('Tushare → 403 not_redistributable; unknown → 404; bad id → 400; all no-store; public never audits',async()=>{
  const t=await req(GET,TS);expect(t.status).toBe(403);expect((await t.json()).error.code).toBe('not_redistributable');
  const n=await req(GET,NONE);expect(n.status).toBe(404);expect((await n.json()).error.code).toBe('not_found');
  const b=await req(GET,'nope');expect(b.status).toBe(400);expect((await b.json()).error.code).toBe('invalid_parameter:fact');
  for(const r of [t,n,b])expect(r.headers.get('cache-control')).toBe('no-store');
  expect(mocks.deps.audit).not.toHaveBeenCalled();expect(mocks.requireAdmin).not.toHaveBeenCalled();
 });
 it('admin: any source, audited before signing, private no-store; non-admin 401; audit failure → 500 without a URL',async()=>{
  const r=await req(ADMIN_GET,TS);
  expect(r.status).toBe(302);expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.deps.audit).toHaveBeenCalledWith('u-admin','facts.snapshot.download',TS,{source:'tushare',path:`tushare/x/${'t'.repeat(64)}.json`,sha256:'s'.repeat(64)});
  const {AdminUnauthenticated}=await import('@/lib/admin/auth');
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));
  const u=await req(ADMIN_GET,EDGAR);expect(u.status).toBe(401);expect(u.headers.get('cache-control')).toBe('private, no-store');
  (mocks.deps.audit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('insert failed'));
  vi.mocked(mocks.deps.signSnapshot).mockClear();
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const f=await req(ADMIN_GET,EDGAR);spy.mockRestore();
  expect(f.status).toBe(500);expect(mocks.deps.signSnapshot).not.toHaveBeenCalled();
 });
});
