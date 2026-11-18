// Topic public routes (spec §6.1, §9).
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {requireSessionUser} from '@/lib/macro/route-helpers';
import {jsonNoStore} from '@/lib/topics/public-route';
import {publicDeps} from '@/lib/topics/deps';
import {publishedFixture} from '@/lib/topics/fixtures/published';
import * as list from './route';
import * as dossier from './[slug]/route';
import * as versions from './[slug]/versions/route';
import * as version from './[slug]/versions/[n]/route';
import * as evidence from './[slug]/evidence/[ordinal]/route';
vi.mock('@/lib/topics/deps',()=>({publicDeps:vi.fn()}));
vi.mock('@/lib/macro/route-helpers',()=>({requireSessionUser:vi.fn()}));
const context={params:Promise.resolve({slug:'rates-and-banks',n:'2',ordinal:'1'})};
const ROUTES=[[list,'http://x/api/topics',context],[dossier,'http://x/api/topics/rates-and-banks',context],
 [versions,'http://x/api/topics/rates-and-banks/versions',context],[version,'http://x/api/topics/rates-and-banks/versions/2',context],
 [evidence,'http://x/api/topics/rates-and-banks/evidence/1',context]] as const;
let fixture:ReturnType<typeof publishedFixture>;
beforeEach(()=>{
 vi.stubEnv('TOPICS_ENABLED','1');vi.stubEnv('TOPICS_E2E_FIXTURES',undefined);
 fixture=publishedFixture();vi.mocked(publicDeps).mockResolvedValue({db:fixture.db,now:()=>new Date('2026-11-15T00:00:00Z'),preview:false});
 vi.mocked(requireSessionUser).mockResolvedValue({ok:true,user:{id:'user'}});
});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('A1: every route is 404 topics_disabled while TOPICS_ENABLED is unset',async()=>{
 delete process.env.TOPICS_ENABLED;
 for(const [mod,url,ctx] of ROUTES){const res=await mod.GET(new Request(url),ctx);expect(res.status,url).toBe(404);expect((await res.json()).error.code).toBe('topics_disabled');}
});
it('401 without a session',async()=>{
 vi.mocked(requireSessionUser).mockResolvedValue({ok:false,response:jsonNoStore({},401)});
 for(const [mod,url,ctx] of ROUTES){const res=await mod.GET(new Request(url),ctx);expect(res.status).toBe(401);expect(res.headers.get('cache-control')).toBe('private, no-store');}
 expect(publicDeps).not.toHaveBeenCalled();
});
it('GET /api/topics returns items and nextCursor, no-store',async()=>{
 const res=await list.GET(new Request('http://x/api/topics?category=macro'),{params:Promise.resolve({})});
 expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');
 expect((await res.json()).items.map((i:{slug:string})=>i.slug)).toEqual(['rates-and-banks']);
});
it.each([['?limit=0','invalid_parameter:limit'],['?limit=201','invalid_parameter:limit'],['?category=sports','invalid_parameter:category'],
 ['?category=macro&category=macro','invalid_parameter:category'],['?q='+'长'.repeat(33),'invalid_parameter:q'],['?page=2','invalid_parameter:page']])('GET /api/topics%s → 400 %s',async(qs,code)=>{
 const res=await list.GET(new Request('http://x/api/topics'+qs),{params:Promise.resolve({})});
 expect(res.status).toBe(400);expect((await res.json()).error.code).toBe(code);
});
it('GET /api/topics/[slug]?asOf before the first version → 404 no_version_at_asof',async()=>{ const res=await dossier.GET(new Request('http://x/api/topics/rates-and-banks?asOf=2026-10-31'),context);expect(res.status).toBe(404);expect((await res.json()).error.code).toBe('no_version_at_asof'); });
it('GET /api/topics/[slug]/versions/[n] for an unpublished version → 410 with meta only',async()=>{
 await fixture.unpublishCurrent('rates-and-banks','privacy');
 const res=await version.GET(new Request('http://x/api/topics/rates-and-banks/versions/2'),context);
 expect(res.status).toBe(410);const body=await res.json();
 expect(body).toEqual({error:{code:'version_unpublished',message:'version_unpublished'},meta:{version_no:2,reason:'privacy'}});
 expect(JSON.stringify(body)).not.toContain('3.75');
 for(const e of fixture.snapshots['rates-and-banks'][2].evidence)for(const slot of Object.values(e.resolved.display.fact?.slots??{}))if(typeof slot!=='string')expect(JSON.stringify(body)).not.toContain(slot.value_text); });
it('GET /api/topics/[slug]/evidence/[ordinal] returns the frozen drawer',async()=>{ const res=await evidence.GET(new Request('http://x/api/topics/rates-and-banks/evidence/1'),context);expect(res.status).toBe(200);expect((await res.json()).drawer.kind).toBe('macro_observation'); });

it('returns 404 on every route while the directory is closed',async()=>{
 fixture.db.setPublicFlag(false);
 for(const [mod,url,ctx] of ROUTES){const res=await mod.GET(new Request(url),ctx);expect(res.status).toBe(404);expect((await res.json()).error.code).toBe('not_found');}
});
it('reads current, named and listed versions',async()=>{
 expect((await (await dossier.GET(new Request(ROUTES[1][1]),context)).json()).version.version_no).toBe(2);
 expect((await (await version.GET(new Request(ROUTES[3][1]),context)).json()).view).toBe('version');
 expect((await (await versions.GET(new Request(ROUTES[2][1]),context)).json()).map((v:{version_no:number})=>v.version_no)).toEqual([2,1]);
});
it('rejects unknown and repeated parameters on every route',async()=>{
 for(const [mod,url,ctx] of ROUTES){const res=await mod.GET(new Request(url+'?extra=1'),ctx);expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:extra');}
 for(const [mod,url,param] of [[dossier,ROUTES[1][1],'asOf'],[evidence,ROUTES[4][1],'version']] as const){
  const res=await mod.GET(new Request(url+'?'+param+'=1&'+param+'=1'),context);expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:'+param);
 }
});
it('rejects malformed path segments',async()=>{
 for(const slug of ['AB','a','a'.repeat(65),'a--b'])for(const [mod,url] of ROUTES.slice(1)){
  const res=await mod.GET(new Request(url),{params:Promise.resolve({slug,n:'2',ordinal:'1'})});expect(res.status).toBe(404);
 }
 for(const n of ['0','01','10000','-1','1.5']){
  expect((await version.GET(new Request(ROUTES[3][1]),{params:Promise.resolve({slug:'rates-and-banks',n})})).status).toBe(404);
  expect((await evidence.GET(new Request(ROUTES[4][1]),{params:Promise.resolve({slug:'rates-and-banks',ordinal:n})})).status).toBe(404);
 }
});
