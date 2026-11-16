// Overview with the REAL applyGate (no fakeApplyGate): a withheld fact never appears in the JSON (spec §0 #62, §5.6).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,derive:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));

import {GET} from './route';
import {HEADLINE_FACT,emptySnapshot,eventRow,makeDeps,realEvidence,realFact,seededTables,summary} from '@/lib/company/route-test-kit';

const fn=(x:unknown)=>x as ReturnType<typeof vi.fn>;
describe('GET /api/companies/[ticker]/overview (real evidence gate)',()=>{
 const rev=realFact({value:'383285000000',value_text:'383285000000'});
 const gp=realFact({concept:'gross_profit',value:'169148000000',value_text:'169148000000'});
 const ni=realFact({concept:'net_income_parent',value:'96995000000',value_text:'96995000000'});
 const head=realFact({fact_id:HEADLINE_FACT,period_start:'2023-07-02',period_end:'2023-09-30',duration:'3M',value:'89498000000',value_text:'89498000000'});
 beforeEach(async()=>{
  vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({stateRev:6,rows:[rev,gp,ni],filings:[summary()]}));
  fn(mocks.deps.company.eventsOfIssuer).mockResolvedValue({rows:[eventRow()],nextCursor:null});
  fn(mocks.deps.facts.factsByIds).mockResolvedValue([head]);
  realEvidence(mocks.deps,[rev,gp,ni,head]);
 });
 const get=()=>GET(new Request('https://alpha.example/api/companies/AAPL/overview'),{params:Promise.resolve({ticker:'AAPL'})});
 it('all evidence present: values are published',async()=>{
  const body=await (await get()).json();
  expect(body.latest.facts.revenue).toMatchObject({kind:'fact',value:'383285000000'});
  expect(body.latest.derived.gross_margin).toMatchObject({kind:'derived',value:'0.4413112958'});
  expect(body.withheld).toEqual({evidenceIncomplete:0,citationPending:0});
 });
 it('a fact without a verified evidence record is withheld everywhere: fact cell and the derived cell built on it',async()=>{
  mocks.deps.noEvidence.add(rev.fact_id);
  const text=await (await get()).text();
  const body=JSON.parse(text);
  expect(body.latest.facts.revenue).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:rev.fact_id});
  expect(body.latest.derived.gross_margin.kind).toBe('withheld');
  expect(text).not.toContain('383285000000');
  expect(text).not.toContain('0.4413');
  expect(body.latest.facts.net_income_parent).toMatchObject({kind:'fact',value:'96995000000'});
 });
 it('recentEvents hides a withheld headline value (materialized)',async()=>{
  mocks.deps.noEvidence.add(HEADLINE_FACT);
  const text=await (await get()).text();
  expect(JSON.parse(text).recentEvents[0].payload.headline.revenue.value).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:HEADLINE_FACT});
  expect(text).not.toContain('89498000000');
 });
 it('asOf (live events from the snapshot): a withheld fact appears nowhere, neither in latest nor in the derived events',async()=>{
  mocks.deps.noEvidence.add(rev.fact_id);mocks.deps.noEvidence.add(head.fact_id);
  fn(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({stateRev:6,rows:[rev,gp,ni,head],filings:[summary()]}));
  const res=await GET(new Request('https://alpha.example/api/companies/AAPL/overview?asOf=2024-06-30'),{params:Promise.resolve({ticker:'AAPL'})});
  const text=await res.text();const body=JSON.parse(text);
  expect(body.eventsComputed).toBe('live');
  expect(fn(mocks.deps.company.eventsOfIssuer)).not.toHaveBeenCalled();
  expect(body.latest.facts.revenue.kind).toBe('withheld');
  expect(text).not.toContain('383285000000');
  expect(text).not.toContain('89498000000');
 });
});
