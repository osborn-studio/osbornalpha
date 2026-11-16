import {describe,expect,it} from 'vitest';
import {eventLink,eventSummary,groupDigits,ratioToPercent,valueView} from './event-text';

const CNY_100M={unit:'CNY',scaleId:'hundred_million'};
describe('event text (no floating point)',()=>{
 it('groupDigits keeps the decimal text exact',()=>{
  expect(groupDigits('383285000000')).toBe('383,285,000,000');
  expect(groupDigits('-1234567.891')).toBe('-1,234,567.891');
  expect(groupDigits('12345678901234567890')).toBe('12,345,678,901,234,567,890');
  expect(groupDigits('n/a')).toBe('n/a');
 });
 it('ratioToPercent rounds half away from zero with BigInt',()=>{
  expect(ratioToPercent('0.0000760000')).toBe('+0.0076%');
  expect(ratioToPercent('-0.5')).toBe('-50.0000%');
  expect(ratioToPercent('1')).toBe('+100.0000%');
  expect(ratioToPercent('0.000000049')).toBe('0.0000%');
  expect(ratioToPercent('-0.0000005')).toBe('-0.0001%');
  expect(ratioToPercent('abc')).toBeNull();
 });
 it('valueView: currency + scale are always carried (unitCaption), withheld shows its reason, missing',()=>{
  expect(valueView('1708990000000','CNY','zh')).toEqual({kind:'value',text:'17,089.90',caption:CNY_100M});
  expect(valueView('1708990000000','CNY','en')).toEqual({kind:'value',text:'1,708,990.00',caption:{unit:'CNY',scaleId:'million'}});
  expect(valueView('3810000000','USD','zh')).toEqual({kind:'value',text:'3,810.00',caption:{unit:'USD',scaleId:'million'}});
  expect(valueView('164','shares','zh')).toEqual({kind:'value',text:'164',caption:{unit:'shares',scaleId:null}});
  expect(valueView('0.1234','pure','zh')).toEqual({kind:'value',text:'12.34%',caption:null});
  expect(valueView('42',null,'zh')).toEqual({kind:'value',text:'42',caption:null});
  expect(valueView({kind:'withheld',reason:'citation_pending'},'CNY','zh')).toEqual({kind:'withheld',reason:'citation_pending'});
  expect(valueView(undefined,null,'zh')).toEqual({kind:'missing'});
 });
 it('summaries of the three kinds, withheld values never leak a number',()=>{
  expect(eventSummary({kind:'filing_published',payload:{formType:'10-K',fiscalYear:2025,fiscalPeriod:'FY',periodEnd:'2025-09-27',availableDate:'2025-10-31',sourceRef:'x',factCount:498}},'zh'))
   .toEqual({kind:'filing_published',formType:'10-K',fiscalYear:2025,fiscalPeriod:'FY',factCount:498});
  const p=eventSummary({kind:'period_first_seen',payload:{periodStart:'2025-01-01',periodEnd:'2025-09-30',duration:'9M',filingId:'f',conceptCount:12,
   headline:{net_income_parent:{factId:'a',value:'100000000',unit:'CNY'},revenue:{factId:'b',value:{kind:'withheld',reason:'citation_pending',factId:'b'},unit:'CNY'}},ambiguousUnits:['operating_cash_flow']}},'zh');
  expect(p).toEqual({kind:'period_first_seen',periodEnd:'2025-09-30',duration:'9M',conceptCount:12,headlineAsOf:null,
   headline:[{concept:'revenue',value:{kind:'withheld',reason:'citation_pending'}},{concept:'net_income_parent',value:{kind:'value',text:'1.00',caption:CNY_100M}}],ambiguousUnits:['operating_cash_flow']});
  const r=eventSummary({kind:'fact_revised',payload:{concept:'revenue',statement:'IS',periodStart:'2024-01-01',periodEnd:'2024-12-31',duration:'12M',consolidation:'consolidated',unit:'CNY',
   from:{factId:'a',value:'170899000000',filingId:'f1',availableDate:'2025-03-01'},to:{factId:'b',value:{kind:'withheld',reason:'evidence_incomplete',factId:'b'},filingId:'f2',availableDate:'2025-08-13'},relChange:{kind:'withheld',reason:'evidence_incomplete'}}},'zh');
  expect(r).toEqual({kind:'fact_revised',concept:'revenue',periodEnd:'2024-12-31',duration:'12M',from:{kind:'value',text:'1,708.99',caption:CNY_100M},to:{kind:'withheld',reason:'evidence_incomplete'},relChange:{kind:'withheld',reason:'evidence_incomplete'}});
 });
 it('fact_revised with plain values and an exact relChange',()=>{
  const r=eventSummary({kind:'fact_revised',payload:{concept:'revenue',unit:'CNY',periodEnd:'2024-12-31',duration:'12M',
   from:{factId:'a',value:'170899000000'},to:{factId:'b',value:'170912000000'},relChange:'0.0000760000'}},'zh');
  expect(r).toMatchObject({from:{kind:'value',text:'1,708.99'},to:{kind:'value',text:'1,709.12'},relChange:{kind:'value',text:'+0.0076%'}});
 });
});

describe('review fixes',()=>{
 const rev=(from:string,to:string)=>({kind:'fact_revised' as const,occurredOn:'2025-08-13',payload:{concept:'revenue',unit:'CNY',periodEnd:'2024-12-31',duration:'12M',from:{factId:'a',value:from},to:{factId:'b',value:to},relChange:'0.0000001'}});
 it('a small revision picks the largest scale at which from and to differ (fallback raw digits)',()=>{
  const s1=eventSummary(rev('170899000000','170899400000'),'zh');
  expect(s1).toMatchObject({from:{text:'170,899.00',caption:{scaleId:'million'}},to:{text:'170,899.40',caption:{scaleId:'million'}}});
  const s2=eventSummary(rev('170899000000','170899000001'),'zh');
  expect(s2).toMatchObject({from:{text:'170,899,000,000',caption:{scaleId:null}},to:{text:'170,899,000,001',caption:{scaleId:null}}});
  const s3=eventSummary(rev('170899000000','171899000000'),'zh');
  expect(s3).toMatchObject({from:{text:'1,708.99',caption:{scaleId:'hundred_million'}},to:{text:'1,718.99'}});
 });
 it('period_first_seen exposes the headline cutoff and links at it, keeping concept/period/unit/factId',()=>{
  const e={kind:'period_first_seen' as const,occurredOn:'2025-10-25',meta:{headlineAsOf:'2025-11-03'},
   payload:{periodEnd:'2025-09-30',duration:'9M',conceptCount:3,headline:{net_income_parent:{factId:'f9',value:'1',unit:'CNY'}},ambiguousUnits:[]}};
  expect(eventSummary(e,'zh')).toMatchObject({headlineAsOf:'2025-11-03'});
  const q=new URL(eventLink(e,'600519.SH')!,'http://x').searchParams;
  expect(Object.fromEntries(q)).toEqual({view:'statements',asOf:'2025-11-03',periodEnd:'2025-09-30',concept:'net_income_parent',factId:'f9',unit:'CNY'});
 });
 it('every event has its own link: own ticker (market) and own cutoff',()=>{
  expect(eventLink({kind:'filing_published',occurredOn:'2025-10-31',payload:{}},'AAPL')).toBe('/stock/AAPL?view=filings');
  expect(eventLink(rev('1','2'),'600519.SH')).toContain('asOf=');
  expect(eventLink(rev('1','2'),null)).toBeNull();
 });
});
