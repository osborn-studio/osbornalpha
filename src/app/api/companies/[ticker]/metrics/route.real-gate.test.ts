// Metrics proxy with the REAL applyGate (no fakeApplyGate): a metric with a withheld input never shows its value (spec §0 #62 #67).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
import {GET} from './route';
import {metricKey} from '@/lib/company/metrics-computed-at';
import {filingRow,makeDeps,metricRow,realEvidence,realFact,seededTables} from '@/lib/company/route-test-kit';

const fn=(x:unknown)=>x as ReturnType<typeof vi.fn>;
describe('GET /api/companies/[ticker]/metrics (real evidence gate)',()=>{
 const gp=realFact({concept:'gross_profit',value:'169148000000',value_text:'169148000000'}),rev=realFact();
 const m=metricRow({value:'0.4413',inputs:[{fact_id:gp.fact_id,concept:'gross_profit',filing_id:gp.filing_id,available_date:gp.available_date},{fact_id:rev.fact_id,concept:'revenue',filing_id:rev.filing_id,available_date:rev.available_date}]});
 beforeEach(async()=>{
  vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());
  fn(mocks.deps.stateRev).mockResolvedValue(3);
  fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([m]);
  fn(mocks.deps.facts.factsByIds).mockResolvedValue([gp,rev]);
  fn(mocks.deps.facts.filingsOfIssuer).mockResolvedValue([filingRow()]);
  fn(mocks.deps.metricsComputedAt).mockResolvedValue(new Map([[metricKey(m),{computedAt:'2026-11-06T02:00:00Z',basedOnRev:3}]]));
  realEvidence(mocks.deps,[gp,rev]);
 });
 const get=()=>GET(new Request('https://alpha.example/api/companies/AAPL/metrics?metrics=gross_margin'),{params:Promise.resolve({ticker:'AAPL'})});
 it('all inputs verified: the derived value is published',async()=>{
  const body=await (await get()).json();
  expect(body.metrics[0].cell).toMatchObject({kind:'derived',value:'0.4413'});
 });
 it('one input without evidence withholds the metric; the value appears nowhere in the JSON',async()=>{
  mocks.deps.noEvidence.add(rev.fact_id);
  const text=await (await get()).text();
  const body=JSON.parse(text);
  expect(body.metrics[0].cell).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:rev.fact_id});
  expect(text).not.toContain('0.4413');
  expect(body.withheld.evidenceIncomplete).toBe(1);
 });
});
