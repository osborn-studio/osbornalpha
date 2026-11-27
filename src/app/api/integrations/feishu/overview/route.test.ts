import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {GET} from './route';
import {createClient} from '@supabase/supabase-js';

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
    expect(read).toHaveBeenCalledWith(admin.mock.results[0].value,{ownerId:owner,analystId:analyst,boundAnalystIds:[analyst],sections:['scores','trades']});
    const second='c448bfbc-130a-416d-8f74-a54ed0beb948';
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS',JSON.stringify({A:analyst,B:second}));
    await GET(request('owner='+owner+'&sections=trades'));
    expect(read).toHaveBeenLastCalledWith(admin.mock.results[1].value,{ownerId:owner,analystId:null,boundAnalystIds:[analyst,second],sections:['trades']});
  });
  it('rejects invalid authentication, owner, roles, duplicate params and unknown sections before accessing the data',async()=>{
    expect((await GET(request('owner='+owner+'&sections=scores','wrong'))).status).toBe(401);
    for(const [query,status] of [['owner='+analyst+'&sections=scores',403],['owner='+owner+'&analyst=B&sections=scores',403],
      ['owner='+owner+'&analyst=&sections=scores',400],['owner='+owner+'&sections=trades&sections=scores',400],
      ['owner='+owner+'&sections=scores&user_id='+analyst,400],['owner='+owner+'&sections=account_positions',400]] as const){
      expect((await GET(request(query))).status).toBe(status);
    }
    vi.stubEnv('FEISHU_SIMULATION_ANALYSTS','{}');
    expect((await GET(request('owner='+owner+'&sections=trades'))).status).toBe(403);
    vi.stubEnv('FEISHU_SIMULATION_INGEST_ENABLED','false');expect((await GET(request('owner='+owner+'&sections=scores'))).status).toBe(404);
    expect(admin).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
  });
  it('reads named positions through the actual overview implementation and the owner-scoped fill joins',async()=>{
    const {readFormalOverview}=await vi.importActual<typeof import('../../../../../../integrations/feishu/feishu-formal-read.mjs')>('../../../../../../integrations/feishu/feishu-formal-read.mjs');
    read.mockImplementationOnce(readFormalOverview);
    const profile={id:analyst,user_id:owner,display_name:'分析员甲',is_self:false};
    const requests:string[]=[];
    const db=createClient('https://example.test','test-key',{global:{fetch:async(input)=>{
      const url=new URL(input as string);requests.push(url.pathname);
      expect(url.searchParams.get('user_id')).toBe('eq.'+owner);
      if(url.pathname.endsWith('/analyst_profiles'))return Response.json([profile]);
      expect(url.pathname).toMatch(/\/trades$/);
      expect(url.searchParams.get('decision.rec.analyst_id')).toBe('in.('+analyst+')');
      for(const key of ['decision.user_id','decision.rec.user_id','decision.rec.profile.user_id'])expect(url.searchParams.get(key)).toBe('eq.'+owner);
      expect(url.searchParams.get('decision.rec.profile.is_self')).toBe('eq.false');
      const row={id:'8c9b2599-86f2-405b-8754-a409c27dc092',user_id:owner,ticker:'00700.HK',direction:'buy',price:'20',quantity:'10',fee:'2',currency:'HKD',
        executed_at:'2026-11-01T12:00:00Z',decision:{user_id:owner,rec:{user_id:owner,analyst_id:analyst,profile,action:'buy',recommended_at:'2026-11-01T11:00:00Z'}}};
      return Response.json([row],{headers:{'content-range':'0-0/1'}});
    }}});
    admin.mockReturnValueOnce(db);
    const res=await GET(request('owner='+owner+'&analyst=A&sections=trades,positions'));
    expect(res.status).toBe(200);
    const {text}=await res.json();
    expect(text).toContain('正式模拟账户查询（分析师 分析员甲，北京时间）');
    expect(text).toContain('分析员甲 · 建议关联的模拟成交（共 1 条）');
    expect(text).toContain('00700.HK｜净股数 10｜均价 20.2｜持仓成本 202 HKD｜已实现盈亏 0 HKD｜占比 100%');
    expect(requests.sort()).toEqual(['/rest/v1/analyst_profiles','/rest/v1/trades']);
  });
  it('keeps backend failure details private',async()=>{
    read.mockRejectedValue(new Error('private backend error'));
    const r=await GET(request('owner='+owner+'&sections=trades'));
    expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'query_unavailable'});
  });
});
