// src/app/api/companies/freshness/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';

const mocks=vi.hoisted(()=>({tables:null as unknown as import('@/lib/db/table-client').TableClient}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>({freshnessTables:()=>mocks.tables})}));
import {GET} from './route';

describe('GET /api/companies/freshness',()=>{
 beforeEach(async()=>{
  mocks.tables=memoryTableClient({dq_freshness:['dataset']});
  const now=new Date().toISOString();
  await mocks.tables.insert('dq_freshness',{dataset:'facts.us',expected_cadence:'daily',last_ok_at:now,last_attempt_at:now,consecutive_errors:0,status:'fresh',detail:{secret:'x'},updated_at:now});
  await mocks.tables.insert('dq_freshness',{dataset:'company.events',expected_cadence:'daily',last_ok_at:'2020-01-01T00:00:00.000Z',last_attempt_at:now,consecutive_errors:0,status:'fresh',detail:{},updated_at:now});
  await mocks.tables.insert('dq_freshness',{dataset:'quotes',expected_cadence:'daily',last_ok_at:now,last_attempt_at:now,consecutive_errors:0,status:'fresh',detail:{},updated_at:now});
 });
 it('three datasets, status recomputed at read time, only four fields, public max-age=60',async()=>{
  const res=await GET();
  const body=await res.json();
  expect(body.datasets.map((d:{dataset:string})=>d.dataset)).toEqual(['facts.us','facts.cn','company.events']);
  expect(body.datasets[0]).toEqual({dataset:'facts.us',status:'fresh',lastOkAt:expect.any(String),lastAttemptAt:expect.any(String)});
  expect(body.datasets[1]).toEqual({dataset:'facts.cn',status:'missing',lastOkAt:null,lastAttemptAt:null});
  expect(body.datasets[2].status).toBe('stale');          // stored 'fresh' is recomputed with now
  expect(JSON.stringify(body)).not.toContain('secret');
  expect(res.headers.get('cache-control')).toBe('public, max-age=60');
 });
});
