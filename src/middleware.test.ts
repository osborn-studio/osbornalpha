// Middleware gate: public /api/companies/* never touches the Supabase session (shared-cache safety, plan Task 9 review).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const mocks=vi.hoisted(()=>({getUser:vi.fn(),create:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:(...a:unknown[])=>{mocks.create(...a);return {auth:{getUser:mocks.getUser}};}}));

import {middleware} from './middleware';

const req=(path:string)=>new NextRequest(`https://alpha.example${path}`,{headers:{cookie:'sb-x-auth-token=abc'}});
describe('middleware auth gate',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://proj.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','anon');mocks.getUser.mockResolvedValue({data:{user:null}});});
 it.each(['/manifest.json','/manifest.json?v=1'])('%s is public without a session lookup',async path=>{
  const res=await middleware(new NextRequest(`https://alpha.example${path}`));
  expect(res.status).toBe(200);
  expect(res.headers.get('x-middleware-next')).toBe('1');
  expect(res.headers.get('location')).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(res.headers.get('set-cookie')).toBeNull();
 });
 it.each(['/macro','/manifest.json/private','/manifest.json.bak','/private.json'])('%s still requires authentication',async path=>{
  const res=await middleware(new NextRequest(`https://alpha.example${path}`));
  expect(mocks.getUser).toHaveBeenCalledTimes(1);
  expect(res.status).toBe(307);
  expect(res.headers.get('location')).toBe(`https://alpha.example/login?next=${encodeURIComponent(path)}`);
 });
 it('keeps industry selectors in the login destination without forwarding credentials or nested returns',async()=>{
  const res=await middleware(req('/intel/industries?scheme=sic&metric=member_count&access_token=private&next=https://evil.example'));
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get('location')!).searchParams.get('next')).toBe('/intel/industries?scheme=sic&metric=member_count');
 });
 it('preserves selectors through the locale canonicalization and auth redirects',async()=>{
  const first=await middleware(req('/en/intel/industries?scheme=sic&metric=member_count'));
  expect(first.headers.get('location')).toBe('https://alpha.example/intel/industries?scheme=sic&metric=member_count');
  const second=await middleware(new NextRequest(first.headers.get('location')!));
  expect(new URL(second.headers.get('location')!).searchParams.get('next')).toBe('/intel/industries?scheme=sic&metric=member_count');
 });
 it('allows an authenticated industry request without redirecting',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'user-1'}}});
  const res=await middleware(req('/intel/industries?scheme=sic&metric=member_count'));
  expect(res.headers.get('location')).toBeNull();
  expect(res.headers.get('x-middleware-next')).toBe('1');
 });
 it.each(['/api/companies','/api/companies/AAPL/statements','/en/api/companies/AAPL/facts'])('%s: no client, no getUser, no Set-Cookie',async path=>{
  const res=await middleware(req(path));
  expect(mocks.create).not.toHaveBeenCalled();expect(mocks.getUser).not.toHaveBeenCalled();
  expect(res.headers.get('set-cookie')).toBeNull();
 });
 it.each(['/api/admin/companies/AAPL/statements','/api/tracking/inbox','/api/companiesx'])('%s still runs the session refresh',async path=>{
  await middleware(req(path));
  expect(mocks.getUser).toHaveBeenCalledTimes(1);
 });
 it('sends an authenticated login visitor to macro',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'user-1'}}});
  const res=await middleware(req('/login'));
  expect(res.status).toBe(307);
  expect(res.headers.get('location')).toMatch(/\/macro$/);
 });
});
