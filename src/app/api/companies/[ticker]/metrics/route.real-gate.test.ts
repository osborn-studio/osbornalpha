// Metrics proxy with the REAL applyGate (no fakeApplyGate): a metric with a withheld input never shows its value (spec §0 #62 #67).
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
import {GET} from './route';
import {metricKey} from '@/lib/company/metrics-computed-at';
import {US,OLD,filingRow,makeDeps,metricRow,realEvidence,realFact,seededTables} from '@/lib/company/route-test-kit';

const fn=(x:unknown)=>x as ReturnType<typeof vi.fn>;
describe('GET /api/companies/[ticker]/metrics (real evidence gate)',()=>{
 const gp=realFact({concept:'gross_profit',value:'169148000000',value_text:'169148000000'}),rev=realFact();
 const m=metricRow({value:'0.4413',inputs:[{fact_id:gp.fact_id,concept:'gross_profit',filing_id:gp.filing_id,available_date:gp.available_date},{fact_id:rev.fact_id,concept:'revenue',filing_id:rev.filing_id,available_date:rev.available_date}]});
 beforeEach(async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());
  fn(mocks.deps.stateRev).mockResolvedValue(3);
  fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([m]);
  fn(mocks.deps.facts.factsByIds).mockResolvedValue([gp,rev]);
  fn(mocks.deps.facts.filingsOfIssuer).mockResolvedValue([filingRow()]);
  fn(mocks.deps.metricsComputedAt).mockResolvedValue(new Map([[metricKey(m),{computedAt:'2026-11-06T02:00:00Z',basedOnRev:3,basedOnLineage:m.based_on_lineage}]]));
  realEvidence(mocks.deps,[gp,rev]);
 });
 afterEach(()=>vi.useRealTimers());
 const get=(suffix='')=>GET(new Request('https://alpha.example/api/companies/AAPL/metrics?metrics=gross_margin'+suffix),{params:Promise.resolve({ticker:'AAPL'})});
 it('all inputs verified: the derived value is published',async()=>{
  const body=await (await get()).json();
  expect(body.metrics[0].cell).toMatchObject({kind:'derived',value:'0.4413'});
 });
 it.each(['materialized','replay'])('eligible predecessor input passes the real gate: %s',async(mode)=>{
  const old={...gp,issuer_id:OLD,filing_id:'f0000000-0000-4000-8000-000000000009'};
  const vector=[{issuer_id:US,state_rev:3},{issuer_id:OLD,state_rev:7}];
  fn(mocks.deps.facts.lineageOf).mockResolvedValue([US,OLD]);
  fn(mocks.deps.facts.stateRevs).mockResolvedValue(vector);
  fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([{...m,based_on_lineage:vector,inputs:m.inputs.map(i=>i.fact_id===old.fact_id?{...i,filing_id:old.filing_id}:i)}]);
  fn(mocks.deps.facts.filingsOfIssuer).mockImplementation(async(id:string)=>id===OLD?[filingRow({issuer_id:OLD,filing_id:old.filing_id})]:[filingRow()]);
  fn(mocks.deps.facts.factsByIds).mockResolvedValue([old,rev]);
  Object.assign(mocks.deps.facts,{readFactsLineage:vi.fn(async()=>({rows:[old,rev],lineage:[US,OLD],stateRevs:vector,conflicts:[],truncated:false}))});
  realEvidence(mocks.deps,[old,rev]);
  const body=await (await get(mode==='replay'?'&asOf=2024-06-30':'')).json();
  expect(body.metrics[0]).toMatchObject({basedOnLineage:vector,cell:{kind:'derived'}});
  expect(Number(body.metrics[0].cell.value)).toBeGreaterThan(0);
  expect(body.evidence[old.fact_id]).toBeDefined();
  expect(mocks.deps.facts.filingsOfIssuer).toHaveBeenCalledWith(OLD,'US',{});
 });
 it.each(['materialized','replay'])('post-bound filing withholds input and evidence: %s',async(mode)=>{
  const bound=mode==='replay'?'2024-06-30':'2026-11-06';
  fn(mocks.deps.facts.readFactsLineage).mockResolvedValue({rows:[gp,rev],lineage:[US],stateRevs:m.based_on_lineage,conflicts:[],truncated:false});
  fn(mocks.deps.facts.filingsOfIssuer).mockResolvedValue([filingRow({available_date:bound==='2024-06-30'?'2024-07-01':'2026-11-07'})]);
  const response=await get(mode==='replay'?'&asOf='+bound:'');
  expect(response.ok).toBe(true);
  const body=await response.json();
  expect(body.metrics[0].cell).toMatchObject({kind:'withheld',reason:'evidence_incomplete'});
  expect(body.metrics[0].cell).not.toHaveProperty('value');
  expect(body.evidence).toEqual({});
 });
 it.each(['materialized','replay'])('post-bound fact cannot enter metrics: %s',async(mode)=>{
  const future={...gp,available_date:mode==='replay'?'2024-07-01':'2026-11-07'};
  // Materialized inputs use factsByIds; replay checks both snapshot and fallback inputs.
  fn(mocks.deps.facts.readFactsLineage).mockResolvedValue({rows:[gp,rev],lineage:[US],stateRevs:m.based_on_lineage,conflicts:[],truncated:false});
  fn(mocks.deps.facts.factsByIds).mockResolvedValue([future,rev]);
  if(mode==='replay')fn(mocks.deps.facts.readFactsLineage).mockResolvedValue({rows:[future,rev],lineage:[US],stateRevs:m.based_on_lineage,conflicts:[],truncated:false});
  realEvidence(mocks.deps,[future,rev]);
  const body=await (await get(mode==='replay'?'&asOf=2024-06-30':'')).json();
  expect(body.metrics[0].cell).toMatchObject({kind:'withheld',reason:'evidence_incomplete'});
  expect(body.evidence[gp.fact_id]).toBeUndefined();
 });
 it.each(['materialized','replay'])('a predecessor fact cannot borrow the target filing: %s',async(mode)=>{
  const old={...gp,issuer_id:OLD};
  const vector=[{issuer_id:US,state_rev:3},{issuer_id:OLD,state_rev:7}];
  fn(mocks.deps.facts.lineageOf).mockResolvedValue([US,OLD]);
  fn(mocks.deps.facts.stateRevs).mockResolvedValue(vector);
  fn(mocks.deps.facts.metricsOfIssuer).mockResolvedValue([{...m,based_on_lineage:vector}]);
  fn(mocks.deps.facts.factsByIds).mockResolvedValue([old,rev]);
  fn(mocks.deps.facts.filingsOfIssuer).mockImplementation(async(id:string)=>id===US?[filingRow()]:[]);
  fn(mocks.deps.facts.readFactsLineage).mockResolvedValue({rows:[old,rev],lineage:[US,OLD],stateRevs:vector,conflicts:[],truncated:false});
  realEvidence(mocks.deps,[old,rev]);
  const body=await (await get(mode==='replay'?'&asOf=2024-06-30':'')).json();
  expect(body.metrics[0].cell).toMatchObject({kind:'withheld',reason:'evidence_incomplete'});
  expect(body.evidence[old.fact_id]).toBeUndefined();
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
