import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {GET} from './route';

const {read,admin}=vi.hoisted(()=>({read:vi.fn(),admin:vi.fn()}));
vi.mock('../../../../../../integrations/feishu/feishu-formal-read.mjs',async importOriginal=>{
  const original=await importOriginal<Record<string,unknown>>();
  return {...original,readFormalOverview:read};
});
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:admin}));
const owner='d81a3536-90e1-40a5-b0b2-461ceb994f69',analyst='d6f7d06f-cd1a-42e6-8e53-f01f821467a1',token='x'.repeat(64);
const request=(query:string,auth=token)=>new Request('https://formal.test/api/integrations/feishu/overview?'+query,{headers:{authorization:'Bearer '+auth}});
describe('authenticated formal read-only overview',()=>{
  beforeEach(()=>{
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED','true');vi.stubEnv('FEISHU_SIMULATION_INGEST_TOKEN',token);
    vi.stubEnv('FEISHU_SIMULATION_OWNER_ID',owner);vi.stubEnv('FEISHU_SIMULATION_ANALYSTS',JSON.stringify({A:analyst}));read.mockResolvedValue('正式评分');
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
  it('resolves analyst keys on the trusted server and disables response caching',async()=>{
    const r=await GET(request('owner='+owner+'&analyst=A&sections=scores,trades'));
    expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');
    expect(await r.json()).toEqual({text:'正式评分'});
    expect(read).toHaveBeenCalledWith(admin.mock.results[0].value,{ownerId:owner,analystId:analyst,sections:['scores','trades']});
    await GET(request('owner='+owner+'&sections=trades'));
    expect(read).toHaveBeenLastCalledWith(admin.mock.results[1].value,{ownerId:owner,analystId:null,sections:['trades']});
  });
  it('rejects invalid authentication, owner, roles, duplicate params and unknown sections before accessing the data',async()=>{
    expect((await GET(request('owner='+owner+'&sections=scores','wrong'))).status).toBe(401);
    for(const [query,status] of [['owner='+analyst+'&sections=scores',403],['owner='+owner+'&analyst=B&sections=scores',403],
      ['owner='+owner+'&analyst=&sections=scores',400],['owner='+owner+'&sections=trades&sections=scores',400],
      ['owner='+owner+'&sections=scores&user_id='+analyst,400],['owner='+owner+'&sections=positions',400]] as const){
      expect((await GET(request(query))).status).toBe(status);
    }
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED','false');expect((await GET(request('owner='+owner+'&sections=scores'))).status).toBe(404);
    expect(admin).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
  });
  it('keeps backend failure details private',async()=>{
    read.mockRejectedValue(new Error('private backend error'));
    const r=await GET(request('owner='+owner+'&sections=trades'));
    expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'query_unavailable'});
  });
});
