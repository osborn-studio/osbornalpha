// Topic local fixture mode (spec §9, §13.2).
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {fixtureMode} from './e2e-fixture';
import {fixtureDeps} from './fixtures/deps';
import {topicsEnabled} from './flags';
describe('topic fixture mode fails closed',()=>{
 it.each([[{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development'},true],[{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'production'},false],
  [{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development',VERCEL:'1'},false],[{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development',NEXT_PUBLIC_SUPABASE_URL:'x'},false],
  [{TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development',SUPABASE_SERVICE_ROLE_KEY:'x'},false],[{NODE_ENV:'development'},false]] as const)('%j → %s',(env,on)=>{
  expect(fixtureMode(env)).toBe(on);
 });
 it('turns the module on in fixture mode without TOPICS_ENABLED',()=>{expect(topicsEnabled({TOPICS_E2E_FIXTURES:'1',NODE_ENV:'development'})).toBe(true);});
});

vi.mock('@/lib/macro/route-helpers',()=>({requireSessionUser:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:vi.fn()}));
import {requireSessionUser} from '@/lib/macro/route-helpers';
import {getServerSupabase} from '@/lib/supabase/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {publicDeps,previewDeps} from './deps';
import {jsonNoStore,topicRoute} from './public-route';
import {listTopics} from './public-read';
beforeEach(()=>{
 vi.stubEnv('TOPICS_ENABLED',undefined);vi.stubEnv('TOPICS_E2E_FIXTURES','1');vi.stubEnv('NODE_ENV','development');
 for(const key of ['VERCEL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])vi.stubEnv(key,undefined);
 vi.mocked(requireSessionUser).mockResolvedValue({ok:false,response:jsonNoStore({},401)});
});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('shares public fixture dependencies with preview without opening Supabase',async()=>{
 const d=fixtureDeps();expect(fixtureDeps()).toBe(d);expect(await publicDeps()).toBe(d);expect(previewDeps()).toBe(d);
 expect(d.preview).toBe(false);expect(d.now()).toBeInstanceOf(Date);expect(await d.db.publicOpen()).toBe(true);
 expect((await listTopics(d,{limit:50})).items.map(i=>i.slug)).toEqual(['rates-and-banks','cn-company']);
 expect(getServerSupabase).not.toHaveBeenCalled();expect(getAdminSupabase).not.toHaveBeenCalled();
});
it('skips session lookup on an isolated local fixture server',async()=>{
 const res=await topicRoute('test',async()=>jsonNoStore(await listTopics(await publicDeps(),{limit:50})))(new Request('http://x/api/topics'),{});
 expect(res.status).toBe(200);expect((await res.json()).items).toHaveLength(2);
 expect(res.headers.get('cache-control')).toBe('private, no-store');expect(requireSessionUser).not.toHaveBeenCalled();
});
it.each([['NODE_ENV','production'],['VERCEL','1'],['NEXT_PUBLIC_SUPABASE_URL','x'],['SUPABASE_SERVICE_ROLE_KEY','x'],['TOPICS_E2E_FIXTURES','0']])('retains session checks with %s=%s',async(key,value)=>{
 vi.stubEnv(key,value);const fn=vi.fn();const res=await topicRoute('test',fn)(new Request('http://x/api/topics'),{});
 expect(res.status).toBe(401);expect(requireSessionUser).toHaveBeenCalledOnce();expect(fn).not.toHaveBeenCalled();
});
