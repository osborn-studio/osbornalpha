// src/app/api/analyst/recommendations/route.test.ts
// Task 20 (spec §11.2, §10): GET /api/analyst/recommendations adds judgment_card (PrivateJudgmentCard) to every row and keeps
// every existing field; an issuer-lookup failure degrades to security subjects instead of failing the request.
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({list:vi.fn(),create:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/analyst/store',()=>({listRecommendations:mocks.list,createRecommendation:mocks.create}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn(async()=>({from:mocks.from}))}));

import {fixtureRecommendation,fixtureScore} from '@/lib/judgments/testing/recommendation-fixture';
import {GET} from './route';

const view={...fixtureRecommendation(),score:fixtureScore(),adopted_by:[] as string[]};
const url=(q='')=>new Request(`https://alpha.example/api/analyst/recommendations${q}`);
const tables:Record<string,unknown[]>={issuer_securities:[{issuer_id:'7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',ticker:'600519',valid_from:'2001-08-27',valid_to:null}],stocks_universe:[{ticker:'600519',market:'A'}]};

describe('GET /api/analyst/recommendations',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([view]);
  mocks.from.mockImplementation((table:string)=>({select:()=>({in:async()=>({data:tables[table]??[],error:null})})}));
 });

 it('adds judgment_card to each row without changing the existing fields',async()=>{
  const res=await GET(url());
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(Object.keys(body)).toEqual(['recommendations']);
  const [row]=body.recommendations;
  expect(Object.keys(row).sort()).toEqual([...Object.keys(view),'judgment_card'].sort());
  expect(row.judgment_card.display).not.toHaveProperty('percent');
  expect(row).toMatchObject(JSON.parse(JSON.stringify(view)));
  expect(row.judgment_card).toMatchObject({source:'recommendation',lifecycle:'settled',outcome:'hit',calibration:'self_assessed',
   subject:{type:'issuer',key:'7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'},display:{band:'high',value:0.72}});
 });

 it('falls back to security subjects when the issuer lookup fails, and logs it',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.from.mockImplementation(()=>{throw new Error('lookup down');});
  const res=await GET(url());
  expect(res.status).toBe(200);
  expect((await res.json()).recommendations[0].judgment_card.subject).toEqual({type:'security',key:'A:600519'});
  expect(spy).toHaveBeenCalledWith('[analyst/recommendations] issuer lookup','lookup down');
  spy.mockRestore();
 });

 it('still validates parameters before reading anything',async()=>{
  expect((await GET(url('?analyst=nope'))).status).toBe(400);
  expect((await GET(url('?source=nope'))).status).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
 });
});
