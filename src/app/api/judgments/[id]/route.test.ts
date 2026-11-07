// src/app/api/judgments/[id]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {envelope,methodologyRow,settlementRow,uuidOf} from '@/lib/judgments/testing/envelopes';
import {judgmentDetailOf} from '@/lib/macro/strategy/f4-client';
import {judgmentDetailPayload} from '@/lib/judgments/detail-payload';
import {publicReads} from '@/lib/judgments/public-reads';

const mocks=vi.hoisted(()=>({envelopeById:vi.fn(),historyOf:vi.fn(),listMethodologies:vi.fn(),settlements:vi.fn()}));
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:{envelopeById:mocks.envelopeById,historyOf:mocks.historyOf,listMethodologies:mocks.listMethodologies},settlements:mocks.settlements})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));

import {GET} from './route';

const ID=uuidOf(7);
const LOC={subject_type:'issuer',subject_key:'11111111-1111-4111-8111-111111111111',judgment_type:'synthetic_fact_metric',methodology_id:'synthetic_fact_metric',methodology_version:'v1'};
const get=(id:string,qs='')=>GET(new Request(`https://alpha.example/api/judgments/${id}?${qs}`),{params:Promise.resolve({id})});

describe('GET /api/judgments/[id]',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.envelopeById.mockResolvedValue(envelope({judgment:{n:7,subject_key:LOC.subject_key},settlement:{judgment_id:ID}}));
  mocks.listMethodologies.mockResolvedValue([methodologyRow()]);
  mocks.settlements.mockResolvedValue([settlementRow({judgment_id:ID,seq:1,settled_at:'2026-03-01T03:00:00.000Z'}),settlementRow({judgment_id:ID,seq:2,kind:'withdrawn',outcome:null,realized:null,reason:'x',settled_at:'2026-07-01T00:00:00.000Z'})]);
 });
 it('returns card, judgment, settlements and calibration from ONE envelopeById lookup (no history scan; P2-01)',async()=>{
  const res=await get(ID);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=600');
  const body=await res.json();
  expect(body).toMatchObject({codeVersion:'abc1234',view:'latest',card:{judgment_id:ID,lifecycle:'settled'},judgment:{judgment_id:ID},calibration:null});
  expect(body.settlements).toHaveLength(2);
  expect(body.card.display).not.toHaveProperty('percent');
  expect(mocks.envelopeById).toHaveBeenCalledWith(ID,{view:'latest',cutoff:undefined});
  expect(mocks.historyOf).not.toHaveBeenCalled();
 });
 it('projects the same frozen detail from the shared library helper',async()=>{
  const payload=await judgmentDetailPayload(publicReads(),ID,{view:'latest',asOf:null},'2026-07-02T00:00:00.000Z');
  expect(payload).toMatchObject({view:'latest',asOf:null,judgment:{judgment_id:ID},card:{judgment_id:ID},calibration:null});
  expect(payload?.settlements).toHaveLength(2);
 });
 it('preserves frozen input ref/snapshot and settlement evidence for the macro detail parser',async()=>{
  mocks.settlements.mockResolvedValue([settlementRow({judgment_id:ID,evidence:{observation_refs:[{series_id:'US_CPI_YOY',vintage_id:'1'}]}})]);
  const body=await (await get(ID)).json();
  expect(body.judgment.inputs).toHaveLength(1);
  for(const input of body.judgment.inputs as {kind:string;ref:Record<string,unknown>;snapshot:Record<string,unknown>}[]){
   expect(input.kind.length).toBeGreaterThan(0);
   expect(Object.keys(input.ref).length).toBeGreaterThan(0);
   expect(Object.keys(input.snapshot).length).toBeGreaterThan(0);
  }
  const parsed=judgmentDetailOf(body);
  expect(parsed.inputs[0]).toMatchObject({kind:'financial_fact',ref:{fact_id:uuidOf(500007)},snapshot:{fact_id:uuidOf(500007)}});
  expect(parsed.settlements[0].evidence).toEqual({observation_refs:[{series_id:'US_CPI_YOY',vintage_id:'1'}]});
 });
 it('as_known cuts settlements at the cutoff and asks envelopeById for the same view',async()=>{
  const body=await (await get(ID,'view=as_known&asOf=2026-06-30')).json();
  expect(body.settlements.map((s:{seq:number})=>s.seq)).toEqual([1]);
  expect(mocks.envelopeById).toHaveBeenCalledWith(ID,{view:'as_known',cutoff:'2026-06-30T23:59:59.999Z'});
 });
 it('expires calibration at the as_known cutoff',async()=>{
  mocks.envelopeById.mockResolvedValue(envelope({judgment:{n:7},calibration:{valid_until:'2026-06-30T23:59:59.999Z'}}));
  const body=await (await get(ID,'asOf=2026-06-30')).json();
  expect(body.card.calibration).toBe('insufficient');
  expect(body.card.display).not.toHaveProperty('percent');
 });
 it('404 unknown_judgment when anon cannot see it, or it is not known at the view',async()=>{
  mocks.envelopeById.mockResolvedValueOnce(null);
  const res=await get(ID);
  expect(res.status).toBe(404);expect((await res.json()).error.code).toBe('unknown_judgment');
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it('400 for a malformed id or parameters',async()=>{
  expect((await get('nope')).status).toBe(400);
  const res=await get(ID,'view=as_known');
  expect((await res.json()).error.code).toBe('invalid_parameter:asOf');
  expect((await get(ID,'asOf=2026-01-01&asOf=2026-01-02')).status).toBe(400);
 });
});
