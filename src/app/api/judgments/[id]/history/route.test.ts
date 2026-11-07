// src/app/api/judgments/[id]/history/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {envelope,methodologyRow,uuidOf} from '@/lib/judgments/testing/envelopes';

const mocks=vi.hoisted(()=>({locator:vi.fn(),historyOf:vi.fn(),listMethodologies:vi.fn()}));
vi.mock('@/lib/judgments/public-reads',()=>({publicReads:()=>({db:{historyOf:mocks.historyOf,listMethodologies:mocks.listMethodologies},judgmentLocator:mocks.locator})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));

import {GET} from './route';

const ID=uuidOf(7);
const get=(qs='')=>GET(new Request(`https://alpha.example/api/judgments/${ID}/history?${qs}`),{params:Promise.resolve({id:ID})});

describe('GET /api/judgments/[id]/history',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.locator.mockResolvedValue({subject_type:'issuer',subject_key:'11111111-1111-4111-8111-111111111111',judgment_type:'synthetic_fact_metric',methodology_id:'synthetic_fact_metric',methodology_version:'v1'});
  mocks.historyOf.mockResolvedValue([envelope({judgment:{n:9}}),envelope({judgment:{n:8}})]);
  mocks.listMethodologies.mockResolvedValue([methodologyRow()]);
 });
 it('defaults to 50, passes before; next_before = the last id of any non-empty page, null only on an empty page (a short page is not the end: P1-02)',async()=>{
  const body=await (await get()).json();
  expect(body.cards.map((c:{judgment_id:string})=>c.judgment_id)).toEqual([uuidOf(9),uuidOf(8)]);
  expect(body.next_before).toBe(uuidOf(8));
  for(const card of body.cards)expect(card.display).not.toHaveProperty('percent');
  expect(mocks.historyOf.mock.calls[0][3]).toEqual({view:'latest',before:undefined,limit:50});
  const full=await (await get(`limit=2&before=${uuidOf(10)}`)).json();
  expect(full.next_before).toBe(uuidOf(8));
  expect(mocks.historyOf.mock.calls[1][3]).toEqual({view:'latest',before:uuidOf(10),limit:2});
  mocks.historyOf.mockResolvedValueOnce([]);
  expect((await (await get(`before=${uuidOf(8)}`)).json()).next_before).toBeNull();
 });
 it('limit 1..500 and a uuid before; 404 for an unknown judgment',async()=>{
  for(const qs of ['limit=0','limit=501','limit=x','before=x','limit=5&limit=6'])expect((await get(qs)).status,qs).toBe(400);
  mocks.locator.mockResolvedValueOnce(null);
  expect((await get()).status).toBe(404);
 });
});
