// src/app/api/methodologies/[id]/[version]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {calibrationRow,methodologyRow,settlementRow} from '@/lib/judgments/testing/envelopes';

const mocks=vi.hoisted(()=>({listMethodologies:vi.fn(),latestCalibration:vi.fn(),recent:vi.fn(),doc:vi.fn()}));
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:{listMethodologies:mocks.listMethodologies,latestCalibration:mocks.latestCalibration},recentSettlements:mocks.recent}),readMethodologyDoc:mocks.doc}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));

import {GET} from './route';

const get=(id:string,version:string)=>GET(new Request(`https://alpha.example/api/methodologies/${id}/${version}`),{params:Promise.resolve({id,version})});

describe('GET /api/methodologies/[id]/[version]',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.listMethodologies.mockResolvedValue([methodologyRow({markets:['A']})]);
  mocks.latestCalibration.mockImplementation(async(_i:string,_v:string,s:{scope_type:string})=>s.scope_type==='all'?{row:calibrationRow(),valid:true}:null);
  mocks.recent.mockResolvedValue([{...settlementRow(),subject_type:'issuer',subject_key:'k',judgment_type:'synthetic_fact_metric'}]);
  mocks.doc.mockResolvedValue({markdown:'# 合成事实判断',sha256_matches:true});
 });
 it('returns row, document, per-scope calibrations and recent settlements',async()=>{
  const res=await get('synthetic_fact_metric','v1');
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({codeVersion:'abc1234',row:{methodology_id:'synthetic_fact_metric'},doc_markdown:'# 合成事实判断',doc_sha256_matches:true});
  expect(body.calibrations).toEqual([expect.objectContaining({scope:{scope_type:'all',scope_key:''},valid:true})]);
  expect(mocks.latestCalibration.mock.calls.map(c=>c[2])).toEqual([{scope_type:'all',scope_key:''},{scope_type:'market',scope_key:'A'},{scope_type:'subject_type',scope_key:'issuer'}]);
  expect(body.recent_settlements).toHaveLength(1);
  expect(mocks.doc).toHaveBeenCalledWith('docs/methodologies/synthetic_fact_metric/v1.md','a'.repeat(64));
  expect(mocks.recent).toHaveBeenCalledWith('synthetic_fact_metric','v1',20);
 });
 it('400 for malformed id / version, 404 unknown_methodology',async()=>{
  expect((await (await get('Bad-Id','v1')).json()).error.code).toBe('invalid_parameter:id');
  expect((await (await get('synthetic_fact_metric','1')).json()).error.code).toBe('invalid_parameter:version');
  const res=await get('synthetic_fact_metric','v2');
  expect(res.status).toBe(404);expect((await res.json()).error.code).toBe('unknown_methodology');
 });
});
