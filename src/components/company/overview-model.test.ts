import {describe,it,expect} from 'vitest';
import {quickItems,eventView} from './overview-model';
import type {PublicEvent} from '@/lib/company/client';

const ev=(o:Partial<PublicEvent>):PublicEvent=>({eventId:'e',issuerId:'i',market:'CN',kind:'filing_published',naturalKey:'k',occurredOn:'2025-11-06',periodEnd:null,concept:null,filingId:'g',payload:{},meta:{},firstSeenAt:null,payloadChangedAt:null,filing:null,...o});
describe('overview model',()=>{
 it('quick card uses revenue_operating for CN and revenue for US, then the fixed four',()=>{
  expect(quickItems('CN').map(i=>i.key)).toEqual(['revenue_operating','net_income_parent','operating_cash_flow','gross_margin','revenue_yoy']);
  expect(quickItems('US')[0]).toEqual({key:'revenue',group:'facts'});
  expect(quickItems('US')[3]).toEqual({key:'gross_margin',group:'derived'});
 });
 it('filing events link to filings; period and revision events link to statements at occurredOn',()=>{
  const f=eventView(ev({payload:{formType:'q3',fiscalYear:2025,fiscalPeriod:'Q3',factCount:198}}),'CN');
  expect(f).toMatchObject({chip:'kindFiling',link:{view:'filings',asOf:null},filing:{form:'q3',fiscal:'2025 Q3',factCount:198}});
  const p=eventView(ev({kind:'period_first_seen',payload:{periodStart:'2025-01-01',periodEnd:'2025-09-30',duration:'9M',headline:{revenue:{factId:'a',value:'1',unit:'CNY'},revenue_operating:{factId:'b',value:'27595000000',unit:'CNY'}}}}),'CN');
  expect(p).toMatchObject({chip:'kindPeriod',link:{view:'statements',asOf:'2025-11-06'},period:{periodEnd:'2025-09-30',duration:'9M',headline:{concept:'revenue_operating',ref:{factId:'b',value:'27595000000',unit:'CNY'}}}});
  const w=eventView(ev({kind:'period_first_seen',payload:{periodStart:'s',periodEnd:'e',duration:'12M',headline:{revenue:{factId:'a',value:{kind:'withheld',reason:'citation_pending',factId:'a'},unit:'USD'}}}}),'US');
  expect(w.period?.headline).toEqual({concept:'revenue',ref:{kind:'withheld',reason:'citation_pending',factId:'a'}});
  const r=eventView(ev({kind:'fact_revised',payload:{concept:'rd_expense',periodStart:'2024-01-01',periodEnd:'2024-12-31',duration:'12M',unit:'CNY',from:{factId:'x',value:'14140000000',filingId:'g1',availableDate:'2025-03-01'},to:{factId:'y',value:'14160000000',filingId:'g2',availableDate:'2025-08-28'},relChange:'0.0014144272'}}),'CN');
  expect(r).toMatchObject({chip:'kindRevised',revised:{concept:'rd_expense',unit:'CNY',from:{factId:'x'},to:{factId:'y'},relChange:'0.0014144272'}});
  // gated payload straight from Task 6 gateEventPayload: the marker sits under .value (plan audit Q1)
  const wr=eventView(ev({kind:'fact_revised',payload:{concept:'revenue',periodStart:'2024-01-01',periodEnd:'2024-12-31',duration:'12M',unit:'CNY',from:{factId:'x',value:{kind:'withheld',reason:'citation_pending',factId:'x'},filingId:'g1',availableDate:'2025-03-01'},to:{factId:'y',value:'5',filingId:'g2',availableDate:'2025-08-28'},relChange:{kind:'withheld',reason:'citation_pending'}}}),'CN');
  expect(wr.revised?.from).toEqual({kind:'withheld',reason:'citation_pending',factId:'x'});
  expect(wr.revised?.to).toMatchObject({factId:'y',value:'5'});
  expect(eventView(ev({payloadChangedAt:'2026-01-01T00:00:00Z'}),'CN').updated).toBe(true);
 });
});
