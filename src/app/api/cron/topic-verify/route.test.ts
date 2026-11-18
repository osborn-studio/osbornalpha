import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {scenario,actor,hashOf} from '@/lib/topics/fixtures/scenario';
import {checkDraft,publishTopic} from '@/lib/topics/publish';
import {sha256Hex} from '@/lib/evidence/hash';
import {cronDeps} from '@/lib/topics/deps';
import {verifyVersion} from '@/lib/topics/verify';
import {resolveCodeVersion} from '@/lib/facts/deps';

vi.mock('@/lib/topics/deps',()=>({cronDeps:vi.fn()}));
vi.mock('@/lib/topics/verify',async original=>({...await original<typeof import('@/lib/topics/verify')>(),verifyVersion:vi.fn()}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:vi.fn()}));
const req=new Request('http://localhost',{headers:{authorization:'Bearer test'}});
beforeEach(()=>{
 vi.stubEnv('CRON_SECRET','test');vi.stubEnv('TOPICS_ENABLED','1');vi.stubEnv('TOPICS_E2E_FIXTURES','');
 vi.mocked(resolveCodeVersion).mockReturnValue('code');
});
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
it('checks authentication before the switch and deployment version before database access',async()=>{
 const {GET,POST}=await import('./route');
 vi.stubEnv('TOPICS_ENABLED','');vi.stubEnv('CRON_SECRET','');
 expect((await GET(req)).status).toBe(503);vi.stubEnv('CRON_SECRET','test');
 expect((await GET(new Request(req.url))).status).toBe(401);
 expect(await (await POST(req)).json()).toEqual({skipped:'disabled'});
 expect(resolveCodeVersion).not.toHaveBeenCalled();
 vi.stubEnv('TOPICS_ENABLED','1');vi.mocked(resolveCodeVersion).mockReturnValue(null);
 expect((await GET(req)).status).toBe(503);expect(cronDeps).not.toHaveBeenCalled();
});
it('shuffles 25 live versions by ISO week and uses the system actor',async()=>{
 const {GET,POST}=await import('./route');
 const {deps,topicId}=await scenario(true);
 await checkDraft(deps,{topicId,actor});
 const expectedDraftHash=await hashOf(deps,topicId);
 for(let i=0;i<26;i++)await publishTopic(deps,{topicId,expectedDraftHash,actor});
 await deps.db.unpublish({topicId,reason:'error',note:null,actor});
 let date='2026-12-31';
 vi.mocked(cronDeps).mockResolvedValue({...deps,now:()=>new Date(date)});
 vi.mocked(verifyVersion).mockImplementation(async(_,input)=>{
  expect(input.actor).toBe('00000000-0000-0000-0000-000000000000');
  expect(input.topicId).toBe(topicId);
  return {version_no:input.versionNo,matched:0,skipped:0,mismatched:[{ordinal:1,reason:'digest_changed'}]};
 });
 const receipt={verified:20,mismatched_versions:20};
 expect(await (await GET(req)).json()).toEqual(receipt);
 const numbers=()=>vi.mocked(verifyVersion).mock.calls.map(([,input])=>input.versionNo);
 const first=numbers();expect(new Set(first).size).toBe(20);expect(first).not.toContain(26);
 vi.mocked(verifyVersion).mockClear();date='2027-01-03';
 expect(await (await POST(req)).json()).toEqual(receipt);expect(numbers()).toEqual(first);
 vi.mocked(verifyVersion).mockClear();date='2027-01-04';
 await GET(req);
 const nextWeek=(await deps.db.liveVersionRefs()).map(v=>({n:v.version_no,rank:sha256Hex('2027-W01|'+v.version_id)}))
  .sort((a,b)=>a.rank.localeCompare(b.rank)).slice(0,20);
 expect(numbers()).toEqual(nextWeek.map(v=>v.n));
});
it('stops starting versions at the deadline',async()=>{
 const {GET}=await import('./route');
 const {deps,topicId}=await scenario(true);await checkDraft(deps,{topicId,actor});
 for(let i=0;i<2;i++)await publishTopic(deps,{topicId,actor,expectedDraftHash:await hashOf(deps,topicId)});
 let elapsed=0;vi.mocked(cronDeps).mockResolvedValue({...deps,now:()=>new Date(elapsed)});
 vi.mocked(verifyVersion).mockImplementation(async()=>{elapsed+=250000;return {version_no:1,matched:1,skipped:0,mismatched:[]};});
 expect(await (await GET(req)).json()).toEqual({verified:1,mismatched_versions:0});
});
