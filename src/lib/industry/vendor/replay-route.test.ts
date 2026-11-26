import {afterEach,expect,it,vi} from 'vitest';
import {vendorPageDeps} from './page-deps';
import {GET} from '../../../app/api/industries/vendor/replay/route';
const mocks=vi.hoisted(()=>({select:vi.fn(),raw:vi.fn(),db:vi.fn(),cookies:vi.fn(),signedIn:vi.fn(),admin:vi.fn()}));
vi.mock('next/headers',()=>({cookies:mocks.cookies}));
vi.mock('../admin-viewer',()=>({isAdminViewer:mocks.admin,isSignedInViewer:mocks.signedIn}));
vi.mock('../../supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('../../db/table-client',async original=>({...await original<typeof import('../../db/table-client')>(),supabaseTableClient:()=>({select:mocks.select})}));
vi.mock('../../vendor/raw-store',async original=>({...await original<typeof import('../../vendor/raw-store')>(),supabaseVendorRawStore:mocks.raw}));
vi.mock('./db',async original=>({...await original<typeof import('./db')>(),supabaseVendorIndustryDb:mocks.db}));
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
const query='code=801080.SI&metric=revenue_cum&duration=YTD&period_end=2025-12-31';
async function get(q:string,status:number){
 const res=await GET(new Request('https://example.test/?'+q));
 expect(res.status).toBe(status);expect(res.headers.get('cache-control')).toBe('no-store');
 return res.json();
}
it.each([['internal','internal',true],['internal','public',true],['public','internal',true],['public','missing',true],
 ['public','throw',true],['public','public',false]] as const)('denies %s/%s, signed in %s before validation and storage',async(first,second,signedIn)=>{
 vi.stubEnv('INDUSTRY_E2E_FIXTURES','');
 mocks.select.mockImplementation(async(_,match)=>{
  const status=match.dataset_key==='scheme:sw2021:2021'?first:second;
  if(status==='throw')throw Error();
  return status==='missing'?[]:[{status}];
 });
 mocks.signedIn.mockResolvedValue(signedIn);mocks.admin.mockResolvedValue(false);
 expect(await get('view=runs',403)).toEqual({error:{code:'unlicensed',message:'dataset vendor:gildata:industry-financials is not public'}});
 expect(mocks.db).not.toHaveBeenCalled();expect(mocks.raw).not.toHaveBeenCalled();
});
it('serves replay for both fixture viewers and enforces replay parameters',async()=>{
 vi.stubEnv('INDUSTRY_E2E_FIXTURES','1');vi.stubEnv('NODE_ENV','test');
 for(const key of ['VERCEL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])vi.stubEnv(key,'');
 for(const value of ['public','']){
  mocks.cookies.mockResolvedValue({get:()=>value?{value}:undefined});
  const deps=await vendorPageDeps();
  expect(await deps.isSignedIn()).toBe(true);expect(await deps.isAdmin()).toBe(value!=='public');
  for(const dataset_key of ['scheme:sw2021:2021','vendor:gildata:industry-financials']){
   const [row]=await deps.tables.select('industry_dataset_licenses',{dataset_key});
   expect(row.status).toBe(value==='public'?'public':'internal');
  }
  const result=await get(query,200);
  expect(Object.keys(result).sort()).toEqual(['match','observation','replayed_text','run','source']);
  expect(result.match).toBe(true);
 }
 for(const extra of ['view=replay','other=1'])await get(query+'&'+extra,400);
 expect((await get(query.replace('2025','2001'),404)).error.code).toBe('not_found');
});
it('keeps unexpected failures private',async()=>{
 vi.stubEnv('INDUSTRY_E2E_FIXTURES','');
 mocks.select.mockResolvedValue([{status:'public'}]);mocks.signedIn.mockResolvedValue(true);
 mocks.db.mockImplementation(()=>{throw Error('private detail');});
 expect(await get(query,500)).toEqual({error:{code:'read_failed',message:'Vendor read failed'}});
});
