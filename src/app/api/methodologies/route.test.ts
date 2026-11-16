// src/app/api/methodologies/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {calibrationRow,methodologyRow} from '@/lib/judgments/testing/envelopes';

const mocks=vi.hoisted(()=>({listMethodologies:vi.fn(),latestCalibration:vi.fn()}));
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:{listMethodologies:mocks.listMethodologies,latestCalibration:mocks.latestCalibration}})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));

import {GET} from './route';

const get=(qs='')=>GET(new Request(`https://alpha.example/api/methodologies?${qs}`));

describe('GET /api/methodologies',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.listMethodologies.mockResolvedValue([methodologyRow(),methodologyRow({methodology_id:'macro_regime',publishable:false})]);
  mocks.latestCalibration.mockImplementation(async(id:string)=>id==='synthetic_fact_metric'?{row:calibrationRow(),valid:false}:null);
 });
 it('lists rows with the all-scope calibration summary; an invalid report reads insufficient; unpublished → null',async()=>{
  const res=await get();
  expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=600');
  const body=await res.json();
  expect(body.codeVersion).toBe('abc1234');
  expect(body.methodologies[0].calibration).toEqual({state:'insufficient',valid:false,n_independent:110,threshold_n:100,computed_at:'2026-11-09T04:00:00.000Z',valid_until:'2026-11-23T04:00:00.000Z',metrics:calibrationRow().metrics});   // metrics: Task 21 list shows Brier
  expect(body.methodologies[1].calibration).toBeNull();
  expect(mocks.latestCalibration).toHaveBeenCalledWith('synthetic_fact_metric','v1',{scope_type:'all',scope_key:''});
 });
 it('status filter and its validation',async()=>{
  await get('status=active');
  expect(mocks.listMethodologies).toHaveBeenCalledWith('active');
  for(const qs of ['status=x','status=active&status=draft']){const res=await get(qs);expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:status');}
 });
 it('empty registry → no-store',async()=>{
  mocks.listMethodologies.mockResolvedValue([]);
  expect((await get()).headers.get('cache-control')).toBe('no-store');
 });
});
