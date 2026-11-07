// src/app/api/judgments/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {calibrationRow,envelope,methodologyRow} from '@/lib/judgments/testing/envelopes';

const mocks=vi.hoisted(()=>({latestCards:vi.fn(),listMethodologies:vi.fn()}));
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:{latestCards:mocks.latestCards,listMethodologies:mocks.listMethodologies}})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));

import {GET} from './route';

const ISSUER='11111111-1111-4111-8111-111111111111';
const get=(qs:string)=>GET(new Request(`https://alpha.example/api/judgments?${qs}`));
const TODAY=new Date().toISOString().slice(0,10);

describe('GET /api/judgments',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.latestCards.mockResolvedValue([envelope()]);
  mocks.listMethodologies.mockResolvedValue([methodologyRow()]);
 });
 it('returns cards with codeVersion and the public cache; an uncalibrated probability has NO percent key (D2, spec §1.1)',async()=>{
  const res=await get(`subject_type=issuer&subject_key=${ISSUER}`);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=600');
  const body=await res.json();
  expect(body).toMatchObject({codeVersion:'abc1234',subject:{type:'issuer',key:ISSUER},asOf:null,view:'latest'});
  expect(body.cards).toHaveLength(1);
  expect('percent' in body.cards[0].display).toBe(false);
  expect(body.cards[0].display.band).toBe('high');
  expect(mocks.latestCards).toHaveBeenCalledWith({type:'issuer',key:ISSUER},{types:undefined,view:'latest',cutoff:undefined});
 });
 it('macro region US: a calibrated method shows percent; types are passed through',async()=>{
  mocks.latestCards.mockResolvedValue([envelope({judgment:{subject_type:'macro_region',subject_key:'US'},calibration:{state:'calibrated',valid_until:'2999-01-01T00:00:00.000Z'}})]);
  const body=await (await get('subject_type=macro_region&subject_key=US&types=synthetic_fact_metric,macro_regime')).json();
  expect(body.cards[0].display.percent).toBe(70);
  expect(mocks.latestCards.mock.calls[0][1].types).toEqual(['synthetic_fact_metric','macro_regime']);
 });
 it('view=as_known&asOf= passes cutoff = asOf end of UTC day; asOf alone implies as_known',async()=>{
  await get(`subject_type=issuer&subject_key=${ISSUER}&view=as_known&asOf=2026-06-30`);
  expect(mocks.latestCards).toHaveBeenLastCalledWith({type:'issuer',key:ISSUER},{types:undefined,view:'as_known',cutoff:'2026-06-30T23:59:59.999Z'});
  const body=await (await get(`subject_type=issuer&subject_key=${ISSUER}&asOf=2026-06-30`)).json();
  expect(body).toMatchObject({view:'as_known',asOf:'2026-06-30'});
 });
 it('uses the historical cutoff to expire calibration, independently of wall time',async()=>{
  mocks.latestCards.mockResolvedValue([envelope({calibration:{valid_until:'2026-06-30T23:59:59.999Z'}})]);
  const expired=await (await get(`subject_type=issuer&subject_key=${ISSUER}&asOf=2026-06-30`)).json();
  expect(expired.cards[0].calibration).toBe('insufficient');
  expect(expired.cards[0].display).not.toHaveProperty('percent');
  const valid=await (await get(`subject_type=issuer&subject_key=${ISSUER}&asOf=2026-06-29`)).json();
  expect(valid.cards[0].display.percent).toBe(70);
 });
 it('400 invalid_parameter:<name> with no-store for missing, malformed, repeated or future parameters',async()=>{
  const cases:[string,string][]=[
   ['subject_key=x','invalid_parameter:subject_type'],
   ['subject_type=security&subject_key=US:AAPL','invalid_parameter:subject_type'],
   ['subject_type=issuer','invalid_parameter:subject_key'],
   ['subject_type=issuer&subject_key=not-a-uuid','invalid_parameter:subject_key'],
   ['subject_type=macro_region&subject_key=HK','invalid_parameter:subject_key'],
   [`subject_type=issuer&subject_key=${ISSUER}&subject_key=${ISSUER}`,'invalid_parameter:subject_key'],
   [`subject_type=issuer&subject_key=${ISSUER}&types=nope`,'invalid_parameter:types'],
   [`subject_type=issuer&subject_key=${ISSUER}&view=as_known`,'invalid_parameter:asOf'],
   [`subject_type=issuer&subject_key=${ISSUER}&view=latest&asOf=2026-01-01`,'invalid_parameter:asOf'],
   [`subject_type=issuer&subject_key=${ISSUER}&asOf=2999-01-01`,'invalid_parameter:asOf'],
   [`subject_type=issuer&subject_key=${ISSUER}&asOf=2026-02-30`,'invalid_parameter:asOf'],
   [`subject_type=issuer&subject_key=${ISSUER}&view=old`,'invalid_parameter:view'],
   [`subject_type=issuer&subject_key=${ISSUER}&include_abstained=yes`,'invalid_parameter:include_abstained'],
  ];
  for(const [qs,code] of cases){
   const res=await get(qs);
   expect(res.status,qs).toBe(400);
   expect(res.headers.get('cache-control'),qs).toBe('no-store');
   expect((await res.json()).error.code,qs).toBe(code);
  }
  expect(mocks.latestCards).not.toHaveBeenCalled();
  expect(TODAY<'2999-01-01').toBe(true);
 });
 it('an empty result and an unpublished method are both an empty no-store answer',async()=>{
  mocks.listMethodologies.mockResolvedValue([methodologyRow({publishable:false})]);
  const res=await get(`subject_type=issuer&subject_key=${ISSUER}`);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect((await res.json()).cards).toEqual([]);
 });
 it('abstained cards only with include_abstained=1; merged issuers are marked',async()=>{
  const old='33333333-3333-4333-8333-333333333333';
  mocks.latestCards.mockResolvedValue([envelope({judgment:{n:2,abstained:true,abstain_reason:'missing',claim:null,condition:null,horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null}}),envelope({judgment:{n:3,subject_key:old}})]);
  const plain=await (await get(`subject_type=issuer&subject_key=${ISSUER}`)).json();
  expect(plain.cards.map((c:{merged_from?:string})=>c.merged_from)).toEqual([old]);
  const all=await (await get(`subject_type=issuer&subject_key=${ISSUER}&include_abstained=1`)).json();
  expect(all.cards.map((c:{lifecycle:string})=>c.lifecycle)).toEqual(['abstained','open']);
 });
 it('an invalidated calibration (calibration_valid=false) never yields a percent',async()=>{
  mocks.latestCards.mockResolvedValue([envelope({calibration:calibrationRow({valid_until:'2999-01-01T00:00:00.000Z'}),calibration_valid:false})]);
  const body=await (await get(`subject_type=issuer&subject_key=${ISSUER}`)).json();
  expect(body.cards[0].calibration).toBe('insufficient');expect('percent' in body.cards[0].display).toBe(false);
 });
 it('a failing read is a code-only 500 with no-store',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.latestCards.mockRejectedValue(new Error('secret db detail'));
  const res=await get(`subject_type=issuer&subject_key=${ISSUER}`);
  expect(res.status).toBe(500);expect(res.headers.get('cache-control')).toBe('no-store');
  const text=JSON.stringify(await res.json());
  expect(text).not.toContain('secret');expect(text).toContain('"code":"internal"');
  spy.mockRestore();
 });
});
