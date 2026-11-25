import {afterEach,expect,it,vi} from 'vitest';
import {AdminForbidden,AdminUnauthenticated} from '../../admin/auth';
import {memoryTableClient} from '../../db/memory-table-client';
import {GET as cron} from '../../../app/api/cron/industry-vendor-sync/route';
import {GET as admin} from '../../../app/api/admin/industries/vendor/route';
const mocks=vi.hoisted(()=>({auth:vi.fn(),run:vi.fn(),supabase:vi.fn(()=>({})),version:vi.fn()}));
vi.mock('@/lib/admin/auth',async original=>({...await original<typeof import('../../admin/auth')>(),requireAdminUser:mocks.auth}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.supabase}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.version}));
vi.mock('./jobs',async original=>({...await original<typeof import('./jobs')>(),productionVendorDeps:()=>({}),runVendorJob:mocks.run}));
vi.mock('./db',async original=>{const real=await original<typeof import('./db')>();return {...real,supabaseVendorIndustryDb:real.memoryVendorIndustryDb};});
vi.mock('@/lib/db/table-client',async original=>({...await original<typeof import('../../db/table-client')>(),supabaseTableClient:()=>memoryTableClient()}));
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
const req=(q:string,auth='Bearer test')=>new Request('https://example.test/?'+q,{headers:{authorization:auth}});
it('checks secret, authorization, job, enable flag, key and version in order',async()=>{
 const job=req('job=gildata-memberships');
 vi.stubEnv('CRON_SECRET','');expect((await cron(job)).status).toBe(503);
 vi.stubEnv('CRON_SECRET','test');expect((await cron(req('','wrong'))).status).toBe(401);
 expect((await cron(req('job=no'))).status).toBe(400);
 vi.stubEnv('INDUSTRY_CN_VENDOR_ENABLED','');expect((await cron(job)).status).toBe(403);
 vi.stubEnv('INDUSTRY_CN_VENDOR_ENABLED','1');vi.stubEnv('GILDATA_API_KEY','');expect((await cron(job)).status).toBe(503);
 vi.stubEnv('GILDATA_API_KEY','test');expect((await cron(job)).status).toBe(503);
 expect(mocks.run).not.toHaveBeenCalled();
 mocks.version.mockReturnValue('version');mocks.run.mockResolvedValue({status:'success',counts:{},errors:[],batchId:null});
 expect((await cron(job)).status).toBe(200);
 expect(mocks.run).toHaveBeenCalledWith('gildata-memberships',{},expect.objectContaining({mode:'apply',deadlineMs:270000}));
});
it.each([AdminForbidden,AdminUnauthenticated])('withholds before parameter validation or db access',async ErrorType=>{
 mocks.auth.mockRejectedValueOnce(new ErrorType('test'));
 const res=await admin(req('view=bad'));expect(res.status).toBe(403);
 expect(res.headers.get('cache-control')).toBe('no-store');
 expect(await res.json()).toEqual({error:{code:'unlicensed',message:'dataset vendor:gildata:industry-financials is not public'}});
 expect(mocks.supabase).not.toHaveBeenCalled();
});
it.each(['runs','classifications','observations&code=801080.SI','memberships&code=801080.SI','retrievals'])('serves admin %s',async view=>{
 const res=await admin(req('view='+view));expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');
});
it('rejects unknown admin parameters',async()=>expect((await admin(req('bad=1'))).status).toBe(400));
it.each(['grid','replay'])('denies %s before touching the service client',async view=>{
 mocks.auth.mockRejectedValueOnce(new AdminForbidden());
 const res=await admin(req('view='+view+'&invalid=1'));
 expect(res.status).toBe(403);expect(res.headers.get('cache-control')).toBe('no-store');
 expect((await res.json()).error.code).toBe('unlicensed');expect(mocks.supabase).not.toHaveBeenCalled();
});
it.each([['grid&metric=bad',400],['replay&code=801080.SI&metric=revenue_cum&duration=YTD&period_end=2024-12-31',404]])('uncached %s error',async(view,status)=>{
 const res=await admin(req('view='+view));expect(res.status).toBe(status);expect(res.headers.get('cache-control')).toBe('no-store');
 if(status===404)expect((await res.json()).error.code).toBe('not_found');
});
it('keeps unexpected errors uncached and omits internal details',async()=>{
 mocks.auth.mockRejectedValueOnce(Error('internal detail'));
 const res=await admin(req('view=grid'));
 expect(res.status).toBe(500);expect(res.headers.get('cache-control')).toBe('no-store');
 expect(await res.json()).toEqual({error:{code:'read_failed',message:'Vendor read failed'}});
});
