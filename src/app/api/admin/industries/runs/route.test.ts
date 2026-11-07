// src/app/api/admin/industries/runs/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),client:null as unknown,freshness:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/db/table-client',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>mocks.client}));
vi.mock('@/lib/industry/db',()=>({supabaseIndustryDb:()=>({freshness:mocks.freshness})}));

import {AdminForbidden} from '@/lib/admin/auth';
import {runRow} from '@/lib/industry/fixture-rows';
import {GET} from './route';

const get=(qs:string)=>GET(new Request(`https://alpha.example/api/admin/industries/runs?${qs}`));

describe('GET /api/admin/industries/runs',()=>{
 beforeEach(async()=>{
  vi.clearAllMocks();
  const client=memoryTableClient({industry_metric_runs:['run_id'],industry_valuation_runs:['run_id'],industry_dataset_licenses:['dataset_key']});
  mocks.client=client;
  await client.insert('industry_metric_runs',{...runRow(),status:'failed',coverage_summary:{failure_reason:'facts_scope_not_ready'}});
  await client.insert('industry_metric_runs',{...runRow({run_id:'22222222-0000-4000-8000-000000000000',generation:4})});
  await client.insert('industry_dataset_licenses',{dataset_key:'scheme:sw2021:2021',status:'internal',decided_by:'migration',decided_at:'2026-11-11T00:00:00Z',note:null});
  mocks.requireAdmin.mockResolvedValue({id:'admin'});
  mocks.freshness.mockResolvedValue([{dataset:'industry.agg.sw2021',status:'error',last_ok_at:null}]);
 });
 it('lists every run of the scheme newest generation first, with failure reasons, licences and freshness',async()=>{
  const res=await get('scheme=sw2021');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.metricRuns.map((r:{generation:number;status:string})=>[r.generation,r.status])).toEqual([[4,'active'],[3,'failed']]);
  expect(body.metricRuns[1].coverage_summary).toEqual({failure_reason:'facts_scope_not_ready'});
  expect(body.licenses).toHaveLength(1);
  expect(body.freshness[0].status).toBe('error');
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('400 without a valid scheme; 403 for non-admins',async()=>{
  expect((await get('')).status).toBe(400);
  expect((await get('scheme=gics')).status).toBe(400);
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));
  expect((await get('scheme=sw2021')).status).toBe(403);
 });
});
