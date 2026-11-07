// CN overview with the REAL applyGate: public withholds a value whose filing has no linked PDF (citation_pending);
// the admin twin (CN PDF conditions exempt) shows it. Spec §5.6, §6.4.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});
import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/overview/route';
import {CN,FIL_CN_PENDING,cnSummary,emptySnapshot,makeDeps,realEvidence,realFact,seededTables} from '@/lib/company/route-test-kit';

describe('GET /api/companies/[ticker]/overview (CN, real evidence gate)',()=>{
 const rev=realFact({issuer_id:CN,market:'CN',filing_id:FIL_CN_PENDING,concept:'revenue_operating',unit:'CNY',period_start:'2023-01-01',period_end:'2023-12-31',available_date:'2024-04-03',value:'147693604994.14',value_text:'147693604994.14'});
 beforeEach(async()=>{
  vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});
  (mocks.deps.snapshot as ReturnType<typeof vi.fn>).mockResolvedValue(emptySnapshot({stateRev:2,rows:[rev],filings:[cnSummary()]}));
  realEvidence(mocks.deps,[rev]);
 });
 const call=(h:typeof GET)=>h(new Request('https://alpha.example/api/companies/600519.SH/overview'),{params:Promise.resolve({ticker:'600519.SH'})});
 it('public: citation_pending, value absent; admin twin: value shown, private no-store',async()=>{
  const text=await (await call(GET)).text();
  expect(JSON.parse(text).latest.facts.revenue_operating).toEqual({kind:'withheld',reason:'citation_pending',factId:rev.fact_id});
  expect(text).not.toContain('147693604994.14');
  const res=await call(ADMIN_GET);
  expect((await res.json()).latest.facts.revenue_operating).toMatchObject({kind:'fact',value:'147693604994.14'});
  expect(res.headers.get('cache-control')).toBe('private, no-store');
 });
});
