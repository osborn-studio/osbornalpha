// src/app/api/analyst/book/route.test.ts
// Task 20 (spec §8.6, §10): GET /api/analyst/book keeps { profile, book } and adds self_assessment (state self_assessed, no percent).
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({getProfile:vi.fn(),loadBookRows:vi.fn()}));
vi.mock('@/lib/analyst/store',()=>({getProfile:mocks.getProfile,loadBookRows:mocks.loadBookRows}));

import {buildBook} from '@/lib/analyst/book';
import {selfAssessment} from '@/lib/judgments/adapters/recommendation';
import {fixtureRecommendation,fixtureScore} from '@/lib/judgments/testing/recommendation-fixture';
import {GET} from './route';

const ANALYST='9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const url=(q:string)=>new Request(`https://alpha.example/api/analyst/book${q}`);

describe('GET /api/analyst/book',()=>{
 beforeEach(()=>vi.clearAllMocks());

 it('rejects a non-uuid analyst before reading',async()=>{
  const res=await GET(url('?analyst=nope'));
  expect(res.status).toBe(400);
  expect(mocks.loadBookRows).not.toHaveBeenCalled();
 });

 it('keeps profile and book unchanged and adds a self_assessment that never carries a percent',async()=>{
  const rows=[{recommendation:fixtureRecommendation(),score:fixtureScore()}];
  mocks.getProfile.mockResolvedValue({id:ANALYST,display_name:'我'});
  mocks.loadBookRows.mockResolvedValue(rows);
  const res=await GET(url(`?analyst=${ANALYST}`));
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(Object.keys(body).sort()).toEqual(['book','profile','self_assessment']);
  expect(body.profile).toEqual({id:ANALYST,display_name:'我'});
  expect(body.book).toEqual(JSON.parse(JSON.stringify(buildBook(rows))));
  expect(body.self_assessment).toEqual(JSON.parse(JSON.stringify(selfAssessment(rows))));
  expect(body.self_assessment).toMatchObject({state:'self_assessed',auditable:false,n_total:1,n_independent:1});
  expect(JSON.stringify(body)).not.toContain('"percent"');
 });

 it('maps store errors through analystError',async()=>{
  mocks.getProfile.mockRejectedValue(new Error('not authenticated'));
  mocks.loadBookRows.mockResolvedValue([]);
  expect((await GET(url(`?analyst=${ANALYST}`))).status).toBe(401);
 });
});
