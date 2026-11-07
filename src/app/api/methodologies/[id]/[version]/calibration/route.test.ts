// src/app/api/methodologies/[id]/[version]/calibration/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {calibrationRow,methodologyRow} from '@/lib/judgments/testing/envelopes';

const mocks=vi.hoisted(()=>({listMethodologies:vi.fn(),latestCalibration:vi.fn(),sample:vi.fn()}));
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:{listMethodologies:mocks.listMethodologies,latestCalibration:mocks.latestCalibration}}),readCohortSample:mocks.sample}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));

import {GET} from './route';

const get=(qs='')=>GET(new Request(`https://alpha.example/api/methodologies/synthetic_fact_metric/v1/calibration?${qs}`),{params:Promise.resolve({id:'synthetic_fact_metric',version:'v1'})});

describe('GET /api/methodologies/[id]/[version]/calibration',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.listMethodologies.mockResolvedValue([methodologyRow()]);
  mocks.latestCalibration.mockResolvedValue({row:calibrationRow({reliability:[{bin_low:0,bin_high:0.1,n:0,mean_p:null,hit_rate:null,wilson_low:null,wilson_high:null}]}),valid:true});
  mocks.sample.mockResolvedValue({status:'ok',entries:[{judgment_id:'x'}]});
 });
 it('latest row with reliability and temporal split; the sample only with sample=1',async()=>{
  const body=await (await get()).json();
  expect(body).toMatchObject({scope:{scope_type:'all',scope_key:''},valid:true,state:'calibrated',temporal_split:{ece_raw_holdout:0.06},sample:null,sample_status:null});
  expect(body.reliability).toHaveLength(1);
  expect(mocks.sample).not.toHaveBeenCalled();
  const s=await (await get('sample=1')).json();
  expect(s).toMatchObject({sample:[{judgment_id:'x'}],sample_status:'ok'});
  expect(mocks.sample).toHaveBeenCalledWith(`cohorts/${'9'.repeat(64)}.json`,'9'.repeat(64));
 });
 it('scope parameters: all needs an empty key, market / subject_type need one',async()=>{
  await get('scope_type=market&scope_key=A');
  expect(mocks.latestCalibration).toHaveBeenLastCalledWith('synthetic_fact_metric','v1',{scope_type:'market',scope_key:'A'});
  for(const qs of ['scope_key=A','scope_type=market','scope_type=x','sample=2','scope_type=all&scope_type=all']){const res=await get(qs);expect(res.status,qs).toBe(400);}
 });
 it('no calibration yet → empty no-store body; an invalid row reads insufficient; integrity failure is reported',async()=>{
  mocks.latestCalibration.mockResolvedValueOnce(null);
  const res=await get();
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toMatchObject({calibration:null,state:'insufficient'});
  mocks.latestCalibration.mockResolvedValueOnce({row:calibrationRow(),valid:false});
  mocks.sample.mockResolvedValueOnce({status:'integrity_failed',entries:null});
  expect(await (await get('sample=1')).json()).toMatchObject({valid:false,state:'insufficient',sample:null,sample_status:'integrity_failed'});
 });
 it('404 for an unknown methodology',async()=>{
  mocks.listMethodologies.mockResolvedValueOnce([]);
  expect((await get()).status).toBe(404);
 });
});
