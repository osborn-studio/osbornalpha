import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),deliver:vi.fn(),limit:vi.fn(),select:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.admin}));
vi.mock('@/lib/observability/service',()=>({recordAndDeliverCheck:mocks.deliver}));
import { GET } from './route';
describe('quote window bounded evidence before delivery',()=>{
  beforeEach(()=>{
    vi.stubEnv('CRON_SECRET','synthetic-cron-secret');vi.clearAllMocks();
    const query={select:mocks.select,in:vi.fn(()=>query),gte:vi.fn(()=>query),lt:vi.fn(()=>query),limit:mocks.limit};
    mocks.select.mockImplementation(()=>query);mocks.admin.mockReturnValue({from:vi.fn(()=>query)});mocks.limit.mockResolvedValue({data:[],count:0,error:null});mocks.deliver.mockResolvedValue({ok:true});vi.spyOn(console,'error').mockImplementation(()=>{});
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
  const request=()=>new Request('https://example.test/api/cron/alerts/quotes',{headers:{authorization:'Bearer synthetic-cron-secret'}});
  it('rejects missing secret and unauthorized requests before database work',async()=>{
    vi.stubEnv('CRON_SECRET','');expect((await GET(request())).status).toBe(503);vi.stubEnv('CRON_SECRET','synthetic-cron-secret');expect((await GET(new Request('https://example.test'))).status).toBe(401);for(const header of ['Bearer wrong-synthetic','Bearer '])expect((await GET(new Request('https://example.test',{headers:{authorization:header}}))).status).toBe(401);expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('reads one sentinel row, refuses overflowing evidence and performs no persistence/delivery',async()=>{
    mocks.limit.mockResolvedValue({data:Array.from({length:10001},()=>({event_name:'quote_batch_loaded',metadata:{count:1,stale:0}})),count:10001,error:null});const result=await GET(request());expect(result.status).toBe(500);expect(await result.json()).toEqual({error:'quote alert check unavailable'});expect(mocks.limit).toHaveBeenCalledWith(10001);expect(mocks.select).toHaveBeenCalledWith('event_name,metadata',{count:'exact'});expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it.each([null,undefined,{},'synthetic'])('does not turn missing/malformed source data %s into an empty healthy window',async data=>{
    mocks.limit.mockResolvedValue({data,error:null});expect((await GET(request())).status).toBe(500);expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it.each([5000,null,undefined,10001,NaN,Infinity,-1,.5,true])('rejects unavailable or mismatching source count %s before delivery',async count=>{
    mocks.limit.mockResolvedValue({data:Array.from({length:1000},()=>({event_name:'quote_batch_loaded',metadata:{count:1,stale:0}})),count,error:null});expect((await GET(request())).status).toBe(500);expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('rejects malformed event rows instead of persisting a healthy window',async()=>{
    mocks.limit.mockResolvedValue({data:[null],count:1,error:null});expect((await GET(request())).status).toBe(500);expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('accepts exact-cap complete evidence and preserves failures',async()=>{
    const rows=Array.from({length:10000},()=>({event_name:'quote_batch_loaded',metadata:{count:1,stale:0}}));rows[0].event_name='quote_batch_failed';mocks.limit.mockResolvedValue({data:rows,count:10000,error:null});expect((await GET(request())).status).toBe(200);expect(mocks.deliver.mock.calls[0][1].metrics.batches).toBe(10000);expect(mocks.deliver.mock.calls[0][1].violations).toContainEqual({code:'quote_batch_failed',value:1,threshold:0});
  });
  it('distinguishes actual empty evidence from source errors',async()=>{
    expect((await GET(request())).status).toBe(200);expect(mocks.deliver.mock.calls[0][1].metrics.batches).toBe(0);mocks.deliver.mockClear();mocks.limit.mockResolvedValue({data:[],error:{message:'synthetic private failure'}});expect((await GET(request())).status).toBe(500);expect(mocks.deliver).not.toHaveBeenCalled();expect(console.error).toHaveBeenCalledWith('quote 15-minute alert check failed');
  });
});
