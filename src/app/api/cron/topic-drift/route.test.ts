import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({deps:vi.fn(),run:vi.fn(),code:vi.fn()}));
vi.mock('@/lib/topics/deps',()=>({cronDeps:mocks.deps}));
vi.mock('@/lib/topics/drift',()=>({runDrift:mocks.run}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.code}));
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('checks secret, bearer, switch and code version before loading dependencies',async()=>{
 const {GET,POST}=await import('./route');
 const request=new Request('http://localhost',{headers:{authorization:'Bearer test'}});
 vi.stubEnv('CRON_SECRET','');vi.stubEnv('TOPICS_ENABLED','');vi.stubEnv('TOPICS_E2E_FIXTURES','');
 expect((await GET(request)).status).toBe(503);
 vi.stubEnv('CRON_SECRET','test');expect((await GET(new Request(request.url))).status).toBe(401);
 expect(await (await POST(request)).json()).toEqual({skipped:'disabled'});
 expect(mocks.code).not.toHaveBeenCalled();
 vi.stubEnv('TOPICS_ENABLED','1');expect((await GET(request)).status).toBe(503);
 expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 mocks.code.mockReturnValue('version');const receipt={checked:1,complete:true,counts:{unchanged:1}};
 mocks.run.mockResolvedValue(receipt);expect(await (await GET(request)).json()).toEqual(receipt);
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  mocks.run.mockRejectedValue(new Error('offline'));
  const failure=await POST(request);
  expect(failure.status).toBe(500);
  expect(await failure.json()).toEqual({error:{code:'internal',message:'job_failed'}});
  expect(log).toHaveBeenCalledWith('[topic-drift]','offline');
 }finally{log.mockRestore();}
});
