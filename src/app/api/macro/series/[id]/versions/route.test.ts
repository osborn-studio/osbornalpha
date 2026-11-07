// GET /api/macro/series/[id]/versions: session, catalog whitelist, ISO period, provenance per version (+ derived inputs).
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),versionsOf:vi.fn(),retrieval:vi.fn(),evidenceObject:vi.fn(),observationsByIds:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn(async()=>({auth:{getUser:m.auth}}))}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:vi.fn(()=>({}))}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:vi.fn(()=>({}))}));
vi.mock('@/lib/macro/db',async orig=>({...(await orig<typeof import('@/lib/macro/db')>()),supabaseMacroDb:vi.fn(()=>({versionsOf:m.versionsOf,retrieval:m.retrieval,evidenceObject:m.evidenceObject,observationsByIds:m.observationsByIds}))}));
import {GET} from './route';
const get=(id:string,q:string)=>GET(new Request(`https://x/api/macro/series/${id}/versions?${q}`),{params:Promise.resolve({id})});
const base={series_id:'US_CPI_YOY',period_end:'2026-09-30',availability_basis:'first_seen',status:'ok',ingested_at:'2026-10-15T12:31:00Z',code_version:'c',batch_id:'b'};
describe('GET versions',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  m.auth.mockResolvedValue({data:{user:{id:'u'}}});
  m.versionsOf.mockResolvedValue([
   {...base,observation_id:'d1',version:1,value_text:'2.9',available_at:'2026-10-15T12:30:00Z',retrieval_id:null,locator:null,derived_from:['i1','i0'],transform:'yoy_from_index@1'},
  ]);
  m.observationsByIds.mockResolvedValue([{...base,series_id:'US_CPI_INDEX',observation_id:'i1',version:1,value_text:'336.298',available_at:'2026-10-15T12:30:00Z',retrieval_id:'r1',locator:{kind:'csv_row',line:310,column:1},derived_from:null,transform:null}]);
  m.retrieval.mockResolvedValue({retrieval_id:'r1',sha256:'c'.repeat(64),fetch_url:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:'2026-10-15T12:30:00Z',batch_id:'b',tool_versions:{parser:'fred-csv@1'}});
  m.evidenceObject.mockResolvedValue({sha256:'c'.repeat(64),object_path:'fred_csv/x.csv',adapter:'fred_csv',content_type:'text/csv',byte_length:9999,created_at:'2026-10-15T12:30:00Z'});
 });
 it('401 without session; 404 unknown series; 400 bad period',async()=>{
  expect((await get('US_CPI_YOY','period_end=2026-09-30')).status).toBe(200);
  expect((await get('NOPE','period_end=2026-09-30')).status).toBe(404);
  expect((await get('US_CPI_YOY','period_end=2026-9-30')).status).toBe(400);
  expect((await get('US_CPI_YOY','period_end=2026-02-30')).status).toBe(400);
  expect((await get('US_CPI_YOY','period_end=2026-09-30&x=1')).status).toBe(400);
  expect((await get('US_CPI_YOY','')).status).toBe(400);
  m.auth.mockResolvedValue({data:{user:null}});const r=await get('NOPE','period_end=bad');expect(r.status).toBe(401);expect(r.headers.get('cache-control')).toBe('no-store');
 });
 it('failures are no-store; every version and input carries code_version',async()=>{
  const ok=await get('US_CPI_YOY','period_end=2026-09-30');
  const j=await ok.json();
  expect(j.versions[0].code_version).toBe('c');expect(j.versions[0].inputs[0].code_version).toBe('c');
  m.versionsOf.mockRejectedValue(new Error('db down'));
  const bad=await get('US_CPI_YOY','period_end=2026-09-30');
  expect(bad.status).toBe(500);expect(bad.headers.get('cache-control')).toBe('no-store');
 });
 it('derived version lists each input with its own receipt; an unreadable input is marked missing, not dropped',async()=>{
  const j=await (await get('US_CPI_YOY','period_end=2026-09-30')).json();
  expect(j.versions).toHaveLength(1);
  const v=j.versions[0];
  expect(v).toMatchObject({observation_id:'d1',transform:'yoy_from_index@1',retrieval:null,evidence:null});
  expect(v.inputs[0]).toMatchObject({observation_id:'i1',retrieval:{fetch_host:'fred.stlouisfed.org'},evidence:{sha256:'c'.repeat(64)},locator:{kind:'csv_row',line:310,column:1}});
  expect(v.inputs[1]).toEqual({observation_id:'i0',missing:true});
 });
});
