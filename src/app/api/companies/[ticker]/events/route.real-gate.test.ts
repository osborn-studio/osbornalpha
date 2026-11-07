// Events with the REAL applyGate (no fakeApplyGate): a withheld fact value never appears in the JSON (spec §0 #62 #64).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
import {GET} from './route';
import {HEADLINE_FACT,emptySnapshot,eventRow,filingRow,summary,makeDeps,realEvidence,realFact,seededTables} from '@/lib/company/route-test-kit';

const fn=(x:unknown)=>x as ReturnType<typeof vi.fn>;
describe('GET /api/companies/[ticker]/events (real evidence gate)',()=>{
 const head=realFact({fact_id:HEADLINE_FACT,period_start:'2023-07-02',period_end:'2023-09-30',duration:'3M',value:'89498000000',value_text:'89498000000'});
 const from=realFact({value:'111222333444',value_text:'111222333444'}),to=realFact({value:'555666777888',value_text:'555666777888'});
 const revised=eventRow({event_id:'f'.repeat(64),kind:'fact_revised',natural_key:'rev',payload:{concept:'revenue',statement:'IS',periodStart:'2022-09-25',periodEnd:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:'USD',
  from:{factId:from.fact_id,value:'111222333444',filingId:from.filing_id,availableDate:'2023-11-03'},to:{factId:to.fact_id,value:'555666777888',filingId:to.filing_id,availableDate:'2024-11-01'},relChange:'3.5'}});
 beforeEach(async()=>{
  vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());
  fn(mocks.deps.company.eventsOfIssuer).mockResolvedValue({rows:[eventRow(),revised],nextCursor:null});
  fn(mocks.deps.facts.factsByIds).mockResolvedValue([head,from,to]);
  fn(mocks.deps.facts.filingsOfIssuer).mockResolvedValue([filingRow()]);
  realEvidence(mocks.deps,[head,from,to]);
 });
 const get=()=>GET(new Request('https://alpha.example/api/companies/AAPL/events'),{params:Promise.resolve({ticker:'AAPL'})});
 it('all evidence present: headline and revision values are published',async()=>{
  const body=await (await get()).json();
  expect(body.rows[0].payload.headline.revenue.value).toBe('89498000000');
  expect(body.rows[1].payload).toMatchObject({from:{value:'111222333444'},to:{value:'555666777888'},relChange:'3.5'});
  expect(body.withheld).toEqual({evidenceIncomplete:0,citationPending:0});
 });
 it('missing evidence withholds the headline value, the revised side AND relChange; nothing leaks',async()=>{
  mocks.deps.noEvidence.add(HEADLINE_FACT);mocks.deps.noEvidence.add(from.fact_id);
  const text=await (await get()).text();
  const body=JSON.parse(text);
  expect(body.rows[0].payload.headline.revenue.value).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:HEADLINE_FACT});
  expect(body.rows[1].payload.from.value).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:from.fact_id});
  expect(body.rows[1].payload.to.value).toBe('555666777888');
  expect(body.rows[1].payload.relChange).toEqual({kind:'withheld',reason:'evidence_incomplete'});
  for(const v of ['89498000000','111222333444','"3.5"'])expect(text).not.toContain(v);
  expect(body.withheld.evidenceIncomplete).toBe(2);
 });
 it('asOf (live): events derived from the snapshot never carry a withheld value; control shows it',async()=>{
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({stateRev:5,rows:[head],filings:[summary()]}));
  const url='https://alpha.example/api/companies/AAPL/events?asOf=2024-06-30';
  const ok=await (await GET(new Request(url),{params:Promise.resolve({ticker:'AAPL'})})).text();
  expect(JSON.parse(ok).computed).toBe('live');
  expect(ok).toContain('89498000000');
  mocks.deps.noEvidence.add(HEADLINE_FACT);
  const text=await (await GET(new Request(url),{params:Promise.resolve({ticker:'AAPL'})})).text();
  expect(JSON.parse(text).rows.length).toBeGreaterThan(0);
  expect(text).not.toContain('89498000000');
 });
});
