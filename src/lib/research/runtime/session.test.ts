import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {ResearchForbidden,requireResearchUser} from '../store';
import {requireProductionResearchActor} from './session';
import {requireS4Actor} from '../s4/auth';
vi.mock('../store',async importOriginal=>({...await importOriginal<typeof import('../store')>(),requireResearchUser:vi.fn()}));
const owner='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const env={ALPHA_S4_ENABLED:'1',ALPHA_RESEARCH_RUNTIME_MODE:'production',VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),ALPHA_S4_RELEASE_SHA:'a'.repeat(40),ALPHA_S4_ORIGIN:'https://alpha.example.test',ALPHA_S4_DATABASE_URL:'postgres://research_app:synthetic@db.example.test:6543/research',ALPHA_S4_DB_HOST:'db.example.test',ALPHA_S4_DB_PORT:'6543',ALPHA_S4_DB_NAME:'research',ALPHA_S4_DB_ROLE:'research_app',ALPHA_S4_OWNER_IDS:owner};
const request=(headers:Record<string,string>={})=>new Request('https://alpha.example.test/api/research/s4',{method:'POST',headers:{host:'alpha.example.test',origin:'https://alpha.example.test',...headers},body:JSON.stringify({userId:other,kind:'agent'})});
beforeEach(()=>{vi.resetAllMocks();for(const [key,value]of Object.entries(env))vi.stubEnv(key,value);vi.stubEnv('ALPHA_S4_LOCAL_AUTH',undefined);vi.stubEnv('ALPHA_S4_LOCAL_SESSION_SECRET',undefined);vi.mocked(requireResearchUser).mockResolvedValue({userId:owner,supabase:{from:vi.fn()}});});
afterEach(()=>vi.unstubAllEnvs());
describe('production candidate session authority',()=>{
 it('uses only the verified admin session and ignores body identity and kind',async()=>{
  expect(await requireProductionResearchActor(request({'x-user-id':other,'x-actor-kind':'agent'}))).toEqual({userId:owner,kind:'human'});
 });
 it('rejects another verified admin outside the explicit owner allowlist',async()=>{
  vi.mocked(requireResearchUser).mockResolvedValue({userId:other,supabase:{from:vi.fn()}});
  await expect(requireProductionResearchActor(request())).rejects.toThrow('scope_denied');
 });
 it.each(['alpha_s4_local_session=anything','other=ok; alpha_s4_local_session=','alpha_s4_local_session','alpha_s4_local_session =value'])('rejects local cookie %s before any identity lookup',async cookie=>{
  await expect(requireProductionResearchActor(request({cookie}))).rejects.toThrow('scope_denied');expect(requireResearchUser).not.toHaveBeenCalled();
 });
 it.each<Record<string,string>>([{host:'evil.test'},{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'}])('rejects request authority before identity lookup %j',async headers=>{
  await expect(requireProductionResearchActor(request(headers))).rejects.toThrow('scope_denied');expect(requireResearchUser).not.toHaveBeenCalled();
 });
 it.each(['expired token','private provider error with synthetic secret'])('fails closed and sanitizes session errors',async message=>{
  vi.mocked(requireResearchUser).mockRejectedValue(new Error(message));await expect(requireProductionResearchActor(request())).rejects.toThrow(/^not_authenticated$/);
 });
 it('rejects a verified non-admin',async()=>{vi.mocked(requireResearchUser).mockRejectedValue(new ResearchForbidden());await expect(requireProductionResearchActor(request())).rejects.toThrow('scope_denied');});
 it('does not expose the candidate through the actual S4 entrypoint',async()=>{
  await expect(requireS4Actor(request())).rejects.toThrow('not_configured');expect(requireResearchUser).not.toHaveBeenCalled();
 });
});
