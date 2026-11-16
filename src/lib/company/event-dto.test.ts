// src/lib/company/event-dto.test.ts
import {describe,expect,it,vi} from 'vitest';
vi.mock('./evidence-gate',async(orig)=>({...(await orig<typeof import('./evidence-gate')>()),applyGate:(await import('./route-test-kit')).fakeApplyGate}));
import {eventFactIds,gateEventRows,toPublicEvent} from './event-dto';
import type {GateEventItem} from './event-dto';
import type {Eligibility} from './evidence-gate';
import {CN,HEADLINE_FACT,US,eventRow,fact,filingRow,makeDeps,seededTables} from './route-test-kit';

const NO:Eligibility={ok:false,reason:'evidence_incomplete'};const OK:Eligibility={ok:true};
const revised={concept:'revenue',statement:'IS',periodStart:'2022-09-25',periodEnd:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:'USD',
 from:{factId:'A',value:'100',filingId:'F1',availableDate:'2023-11-03'},to:{factId:'B',value:'110',filingId:'F2',availableDate:'2024-11-01'},relChange:'0.1'};
const first={periodStart:'2023-07-02',periodEnd:'2023-09-30',duration:'3M',filingId:'F1',conceptCount:3,headline:{revenue:{factId:'H1',value:'5',unit:'USD'},net_income_parent:{factId:'H2',value:'1',unit:'USD'}},ambiguousUnits:[]};
const item=(kind:'fact_revised'|'period_first_seen',payload:Record<string,unknown>):GateEventItem=>({e:{kind,natural_key:'k',occurred_on:'2024-11-01',period_end:'2023-09-30',concept:null,filing_id:null,payload,meta:{}},eventId:'e'.repeat(64),issuerId:US,market:'US'});

describe('event payload gate',()=>{
 it('lists every value-bearing fact id per kind; filing_published has none',()=>{
  expect(eventFactIds({kind:'fact_revised',payload:revised})).toEqual(['A','B']);
  expect(eventFactIds({kind:'period_first_seen',payload:first}).sort()).toEqual(['H1','H2']);
  expect(eventFactIds({kind:'filing_published',payload:{formType:'10-K',factCount:9}})).toEqual([]);
 });
 it('fact_revised: an ineligible side replaces its value AND relChange; eligible payload is unchanged',()=>{
  expect(toPublicEvent(item('fact_revised',revised),new Map([['A',OK],['B',OK]]),undefined).payload).toEqual(revised);
  const g=toPublicEvent(item('fact_revised',revised),new Map<string,Eligibility>([['A',NO],['B',OK]]),undefined).payload as typeof revised&{from:{value:unknown};relChange:unknown};
  expect(g.from).toEqual({factId:'A',value:{kind:'withheld',reason:'evidence_incomplete',factId:'A'},filingId:'F1',availableDate:'2023-11-03'});
  expect(g.to.value).toBe('110');
  expect(g.relChange).toEqual({kind:'withheld',reason:'evidence_incomplete'});
  expect(JSON.stringify(g)).not.toContain('"100"');
 });
 it('period_first_seen: only the ineligible headline value is withheld',()=>{
  const g=toPublicEvent(item('period_first_seen',first),new Map<string,Eligibility>([['H1',OK],['H2',NO]]),undefined).payload as {headline:Record<string,{value:unknown}>};
  expect(g.headline.revenue.value).toBe('5');
  expect(g.headline.net_income_parent.value).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:'H2'});
 });
 it('gateEventRows: several issuers in order; per-stream reads; filing summary attached; withheld counted',async()=>{
  const deps=makeDeps(await seededTables());
  (deps.facts.factsByIds as ReturnType<typeof vi.fn>).mockResolvedValue([fact({fact_id:HEADLINE_FACT})]);
  (deps.facts.filingsOfIssuer as ReturnType<typeof vi.fn>).mockResolvedValue([filingRow()]);
  const cnRow=eventRow({event_id:'f'.repeat(64),issuer_id:CN,market:'CN',kind:'filing_published',natural_key:'g',filing_id:null,payload:{formType:'annual'}});
  const out=await gateEventRows([eventRow(),cnRow],deps,{admin:false});
  expect(out.events.map(e=>e.eventId)).toEqual(['e'.repeat(64),'f'.repeat(64)]);
  expect(out.events[0]).toMatchObject({issuerId:US,market:'US',filing:{formType:'10-K',citation:'edgar'},payload:{headline:{revenue:{value:'89498000000'}}}});
  expect(out.events[1]).toMatchObject({issuerId:CN,market:'CN',filing:null});
  expect(Object.keys(out.evidence)).toEqual([HEADLINE_FACT]);
  deps.noEvidence.add(HEADLINE_FACT);
  const gated=await gateEventRows([eventRow()],deps,{admin:false});
  expect(gated.events[0].payload).toMatchObject({headline:{revenue:{value:{kind:'withheld',reason:'evidence_incomplete',factId:HEADLINE_FACT}}}});
  expect(gated.withheld).toEqual({evidenceIncomplete:1,citationPending:0});
 });
});
