// src/lib/dq/reconcile/gold-cn.schema.test.ts
import {describe,expect,it} from 'vitest';
import {CN_GOLD_CONCEPTS,GOLD_CN_SCHEMA,autoQuarantinable,cnGoldKey,cnPeriodOf,goldTemplate,pickCnSample,printedInterval,validateGoldCn} from './gold-cn';
import {goldRow} from './testing';

const TICKERS=['000001.SZ','600519.SH'];
const YEARS=[2022,2023,2024,2025];
const product=(tickers=TICKERS)=>tickers.flatMap(t=>YEARS.flatMap(fy=>CN_GOLD_CONCEPTS.map(c=>goldRow(t,fy,c))));
const file=(rows=product(),o:Record<string,unknown>={})=>({schema:GOLD_CN_SCHEMA,tickers:TICKERS,fiscal_years:YEARS,concepts:[...CN_GOLD_CONCEPTS],recorded_by:'R1',reviewed_by:'R2',rows,...o});
const errorsOf=(j:unknown)=>{const r=validateGoldCn(j);return r.ok?[]:r.errors;};

describe('validateGoldCn (spec §5.4 validator)',()=>{
 it('accepts the exact tickers × 4 years × 6 concepts product',()=>{
  const r=validateGoldCn(file());
  expect(r.ok).toBe(true);
  if(r.ok)expect(r.file.rows).toHaveLength(2*4*6);
 });
 it.each([
  ['a missing combination',()=>file(product().slice(1))],
  ['a duplicate row',()=>file([...product(),goldRow('600519.SH',2024,'total_assets')])],
  ['an extra ticker row',()=>file([...product(),goldRow('600000.SH',2024,'total_assets')])],
  ['empty tickers',()=>file([],{tickers:[]})],
  ['an invalid ticker',()=>file(product(),{tickers:['600519','000001.SZ']})],
  ['fiscal years other than FY2022–FY2025',()=>file(product(),{fiscal_years:[2023,2024,2025]})],
  ['concepts other than the fixed six',()=>file(product(),{concepts:[...CN_GOLD_CONCEPTS.slice(1),'revenue']})],
  ['recorded_by == reviewed_by',()=>file(product(),{reviewed_by:'R1'})],
  ['a printed value with thousands separators',()=>file(product().map((r,i)=>i===0?{...r,printed_value:'1,234,567.89'}:r))],
  ['decimals not matching printed_decimals',()=>file(product().map((r,i)=>i===0?{...r,printed_value:'1234567.8'}:r))],
  ['eps with a multiplier',()=>file(product().map(r=>r.concept==='eps_basic'?{...r,printed_unit_multiplier:10000}:r))],
  ['an unknown multiplier',()=>file(product().map((r,i)=>i===0?{...r,printed_unit_multiplier:100}:r))],
  ['column other than 本期',()=>file(product().map((r,i)=>i===0?{...r,column:'上期' as '本期'}:r))],
  ['a missing page',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,page:0}}:r))],
  ['a malformed pdf sha256',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,pdf_sha256:'abc'}}:r))],
  ['a missing announcement id',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,cninfo_announcement_id:''}}:r))],
  ['a missing announcement date',()=>file(product().map((r,i)=>i===0?{...r,source:{...r.source,announcement_date:'2025/04/03'}}:r))],
  ['a missing tushare_source_ref',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:''}:r))],
  ['a source ref of another ticker',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:r.tushare_source_ref.replace(/^\d{6}\.\w{2}/,'600000.SH')}:r))],
  ['a source ref of another period',()=>file(product().map((r,i)=>i===0?{...r,tushare_source_ref:r.tushare_source_ref.replace(/:\d{8}:/,':20230630:')}:r))],
  ['a report_type segment that differs from the row',()=>file(product().map((r,i)=>i===0?{...r,report_type:5}:r))],
 ])('rejects %s',(_n,make)=>{expect(errorsOf(make()).length).toBeGreaterThan(0);});
 it('natural key is <ticker>:<fy>:<concept>:<report_type>',()=>{
  expect(cnGoldKey(goldRow('600519.SH',2024,'revenue_operating'))).toBe('600519.SH:2024:revenue_operating:1');
 });
});

describe('printed-precision interval and the review/quarantine boundary',()=>{
 it.each([
  ['1234567.89',1,2,'1234567.89','0.005'],
  ['123.46',10000,2,'1234600','50'],
  ['1235',1000000,0,'1235000000','500000'],
  ['-12.3',1000,1,'-12300','50'],
  ['49.93',1,2,'49.93','0.005'],
 ])('%s × %d (%d decimals) → center %s radius %s',(v,m,d,center,radius)=>{
  expect(printedInterval({printed_value:v,printed_unit_multiplier:m,printed_decimals:d})).toEqual({center,radius});
 });
 it('only exact printing (multiplier 1, two decimals) may quarantine automatically',()=>{
  expect(autoQuarantinable({printed_unit_multiplier:1,printed_decimals:2})).toBe(true);
  expect(autoQuarantinable({printed_unit_multiplier:10000,printed_decimals:2})).toBe(false);
  expect(autoQuarantinable({printed_unit_multiplier:1,printed_decimals:0})).toBe(false);
 });
 it('periods and units per concept: BS instant, IS/CF 12M from Jan 1, eps per share',()=>{
  expect(cnPeriodOf(2024,'total_assets')).toEqual({period_start:null,period_end:'2024-12-31',duration:'INSTANT',unit:'CNY'});
  expect(cnPeriodOf(2024,'revenue_operating')).toEqual({period_start:'2024-01-01',period_end:'2024-12-31',duration:'12M',unit:'CNY'});
  expect(cnPeriodOf(2024,'eps_basic')).toEqual({period_start:'2024-01-01',period_end:'2024-12-31',duration:'12M',unit:'CNY/share'});
 });
});

describe('sample selection and transcription template',()=>{
 it('pickCnSample: valid unique tickers ascending, first min(n, N)',()=>{
  expect(pickCnSample(['600519.SH','000001.SZ',null,'600519.SH','bad','300750.SZ'],2)).toEqual(['000001.SZ','300750.SZ']);
  expect(pickCnSample([],30)).toEqual([]);
 });
 it('goldTemplate is the exact product with <pending> fields and fails validation until transcribed',()=>{
  const t=goldTemplate(['600519.SH']);
  expect(t.rows).toHaveLength(4*6);
  expect(t.rows[0]).toMatchObject({ticker:'600519.SH',fiscal_year:2022,concept:CN_GOLD_CONCEPTS[0],printed_value:'<pending>',tushare_source_ref:'<pending>'});
  expect(validateGoldCn(t).ok).toBe(false);
 });
});
