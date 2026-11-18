// Topic research public route (spec §6, §9).
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {requireSessionUser} from '@/lib/macro/route-helpers';
import {TopicError} from './errors';
import {jsonNoStore,topicRoute} from './public-route';
vi.mock('@/lib/macro/route-helpers',()=>({requireSessionUser:vi.fn()}));
const request=new Request('http://localhost/api/topics');
beforeEach(()=>{vi.stubEnv('TOPICS_ENABLED','1');vi.mocked(requireSessionUser).mockResolvedValue({ok:true,user:{id:'user'}});});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('topicRoute',()=>{
 it('requires a session before calling the handler',async()=>{
  vi.mocked(requireSessionUser).mockResolvedValue({ok:false,response:jsonNoStore({error:{code:'unauthenticated'}},401)});
  const fn=vi.fn();const r=await topicRoute('test',fn)(request,{});
  expect(r.status).toBe(401);expect(fn).not.toHaveBeenCalled();
 });
 it('is closed when the flag is unset',async()=>{
  vi.stubEnv('TOPICS_ENABLED',undefined);const fn=vi.fn();const r=await topicRoute('test',fn)(request,{});
  expect(r.status).toBe(404);expect(await r.json()).toMatchObject({error:{code:'topics_disabled'}});expect(fn).not.toHaveBeenCalled();
 });
 it('returns withdrawal metadata',async()=>{
  const detail={version_no:2,reason:'privacy'};
  const r=await topicRoute('test',async()=>{throw new TopicError('version_unpublished',detail);})(request,{});
  expect(r.status).toBe(410);expect(await r.json()).toEqual({error:{code:'version_unpublished',message:'version_unpublished'},meta:detail});
 });
 it('marks every response no-store',async()=>{
  for(const fn of [async()=>jsonNoStore({ok:true}),async()=>new Response('ok'),async()=>{throw new TopicError('not_found');}]){
   expect((await topicRoute('test',fn)(request,{})).headers.get('Cache-Control')).toContain('no-store');
  }
  vi.stubEnv('TOPICS_ENABLED',undefined);
  expect((await topicRoute('test',async()=>jsonNoStore({}))(request,{})).headers.get('Cache-Control')).toContain('no-store');
 });
});

// Dependency boundaries are tested here to keep the task's file scope unchanged.
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:vi.fn()}));
vi.mock('./db',()=>({supabaseTopicsDb:vi.fn()}));
import {getServerSupabase} from '@/lib/supabase/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTopicsDb} from './db';
import {publicDeps,previewDeps} from './deps';
import {publishedFixture} from './fixtures/published';
import {readTopic} from './public-read';
it('uses the session client for public dependencies',async()=>{
 const session={} as Awaited<ReturnType<typeof getServerSupabase>>;
 vi.mocked(getServerSupabase).mockResolvedValue(session);
 vi.mocked(supabaseTopicsDb).mockReturnValue(publishedFixture().db);
 const d=await publicDeps();expect(d.preview).toBe(false);expect(d.now()).toBeInstanceOf(Date);
 expect(supabaseTopicsDb).toHaveBeenCalledWith({session});expect(getAdminSupabase).not.toHaveBeenCalled();
});
it('projects preview base reads with the switch off and preserves per-row drift time',async()=>{
 const f=publishedFixture();const t=await f.db.publicTopicBySlug('rates-and-banks');
 const checked_at='2026-11-14T00:00:00.000Z';
 await f.db.upsertDrift([{version_id:t!.current_version_id!,ordinal:1,drift:'revised',current_identity:null}],checked_at,false,null);
 await f.unpublishCurrent('rates-and-banks','privacy');f.db.setPublicFlag(false);
 const admin={} as ReturnType<typeof getAdminSupabase>;vi.mocked(getAdminSupabase).mockReturnValue(admin);vi.mocked(supabaseTopicsDb).mockReturnValue(f.db);
 const d=previewDeps();expect(d.preview).toBe(true);expect(await d.db.publicOpen()).toBe(true);
 expect(supabaseTopicsDb).toHaveBeenCalledWith({admin});
 expect((await d.db.publicTopics()).map(t=>t.topic_slug).sort()).toEqual(['cn-company','rates-and-banks']);
 const versions=await d.db.publicVersions(t!.topic_id);expect(versions.find(v=>v.version_no===2)?.snapshot).toBeNull();
 expect((await d.db.publicDrift(t!.current_version_id!))).toEqual([]);
 const current=await d.db.publicTopicBySlug('rates-and-banks');
 await f.db.upsertDrift([{version_id:current!.current_version_id!,ordinal:1,drift:'revised',current_identity:null}],checked_at,false,null);
 expect((await d.db.publicDrift(current!.current_version_id!))[0].checked_at).toBe(checked_at);
 expect((await readTopic(d,'rates-and-banks',{})).version.version_no).toBe(1);
 await f.retire('cn-company','licence');
 expect((await d.db.publicTopicBySlug('cn-company'))?.retired_reason).toBe('licence');
});
