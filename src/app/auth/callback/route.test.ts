import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({exchange:vi.fn(),getUser:vi.fn(),insert:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{exchangeCodeForSession:mocks.exchange,getUser:mocks.getUser},from:()=>({insert:mocks.insert})})}));
import {GET} from './route';

describe('auth callback destinations',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.exchange.mockResolvedValue({error:null});
  mocks.getUser.mockResolvedValue({data:{user:{id:'user-1'}}});
  mocks.insert.mockResolvedValue({error:null});
 });
 it.each([
  ['?code=x','/macro'],
  ['?code=x&next=/portfolio','/portfolio'],
  ['','/login?error=auth_failed'],
 ])('%s redirects to %s',async(query,path)=>{
  const res=await GET(new Request(`https://alpha.example/auth/callback${query}`));
  expect(res.headers.get('location')).toBe(`https://alpha.example${path}`);
 });
});
