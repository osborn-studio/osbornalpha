// Middleware gate: public /api/companies/* never touches the Supabase session (shared-cache safety, plan Task 9 review).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const mocks=vi.hoisted(()=>({getUser:vi.fn(),create:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:(...a:unknown[])=>{mocks.create(...a);return {auth:{getUser:mocks.getUser}};}}));

import {middleware} from './middleware';

const req=(path:string)=>new NextRequest(`https://alpha.example${path}`,{headers:{cookie:'sb-x-auth-token=abc'}});
describe('middleware /api/companies',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://proj.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','anon');mocks.getUser.mockResolvedValue({data:{user:null}});});
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
