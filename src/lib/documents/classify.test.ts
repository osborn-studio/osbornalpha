// src/lib/documents/classify.test.ts
import {describe,expect,it} from 'vitest';
import {CLASSIFIER_GEN,classify,cnDate} from './classify';

describe('cnDate',()=>{
 it('parses Chinese-numeral, Arabic-numeral and English dates to ISO',()=>{
  expect(cnDate('二零二五年十二月三十一日')).toBe('2025-12-31');
  expect(cnDate('二〇二六年六月三十日')).toBe('2026-06-30');
  expect(cnDate('二零二六年一月十日')).toBe('2026-01-10');
  expect(cnDate('二零二六年三月二十日')).toBe('2026-03-20');
  expect(cnDate('2025年12月31日')).toBe('2025-12-31');
  expect(cnDate('２０２５年１２月３１日')).toBe('2025-12-31');   // full-width digits (NFKC)
  expect(cnDate('31 December 2025')).toBe('2025-12-31');
  expect(cnDate('for the year ended December 31, 2025')).toBe('2025-12-31');
 });
 it('returns the first date in the text and null for none or an impossible date',()=>{
  expect(cnDate('截至二零二六年六月三十日止六個月（比較：2025年6月30日）')).toBe('2026-06-30');
  expect(cnDate('二零二六年中期報告')).toBeNull();
  expect(cnDate('2025年2月30日')).toBeNull();
  expect(cnDate('二零二五年十三月一日')).toBeNull();
  expect(cnDate('')).toBeNull();
 });
});

describe('classify edgar',()=>{
 const e=(form:string)=>classify('edgar',{form_type:form,title:`${form} filing`,source_ref:'0001321655-26-000041/pltr-20260630.htm'});
 it('maps forms to classes, accession as filing_source_ref, English, no fiscal fields',()=>{
  expect(e('10-K')).toEqual({doc_class:'annual_report',fiscal_year:null,fiscal_period:null,period_end:null,filing_source_ref:'0001321655-26-000041',language:'en'});
  for(const f of ['20-F','40-F','10-K/A','20-F/A'])expect(e(f).doc_class,f).toBe('annual_report');
  for(const f of ['10-Q','10-Q/A'])expect(e(f).doc_class,f).toBe('quarterly_report');
  for(const f of ['8-K','8-K/A','6-K'])expect(e(f).doc_class,f).toBe('current_report');
  for(const f of ['S-1','424B4','424B2'])expect(e(f).doc_class,f).toBe('registration');
  expect(e('DEF 14A').doc_class).toBe('proxy');
  for(const f of ['SC 13D','SC 13G','SCHEDULE 13G','SC 13G/A'])expect(e(f).doc_class,f).toBe('ownership');
  for(const f of ['4','144','S-8',''])expect(e(f).doc_class,f).toBe('other');
 });
});

describe('classify cninfo',()=>{
 const c=(title:string)=>classify('cninfo',{form_type:'PDF',title,source_ref:'1225576776'});
 it('periodic reports with one year get period fields; zh',()=>{
  expect(c('恒生电子股份有限公司2025年年度报告')).toEqual({doc_class:'annual_report',fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',filing_source_ref:null,language:'zh'});
  expect(c('恒生电子2026年半年度报告')).toMatchObject({doc_class:'interim_report',fiscal_year:2026,fiscal_period:'H1',period_end:'2026-06-30'});
  expect(c('恒生电子2026年第一季度报告')).toMatchObject({doc_class:'quarterly_report',fiscal_period:'Q1',period_end:'2026-03-31'});
  expect(c('恒生电子2026年第三季度报告')).toMatchObject({doc_class:'quarterly_report',fiscal_period:'Q3',period_end:'2026-09-30'});
  expect(c('恒生电子2025年度业绩快报')).toMatchObject({doc_class:'results_announcement',fiscal_year:2025,fiscal_period:null,period_end:null});
 });
 it('exclusion words make the document other',()=>{
  for(const t of ['2025年年度报告摘要','2025年年度报告（英文版）','关于2025年年度报告的更正公告','2025年年度报告（已取消）','2025年年度报告补充公告','2026年半年度报告摘要'])expect(c(t).doc_class,t).toBe('other');
 });
 it('no year or several years leave the period fields null',()=>{
  expect(c('年度报告')).toMatchObject({doc_class:'annual_report',fiscal_year:null,fiscal_period:null,period_end:null});
  expect(c('2024年与2025年年度报告')).toMatchObject({doc_class:'annual_report',fiscal_year:null,period_end:null});
  expect(c('关于股票期权激励计划自主行权的公告')).toEqual({doc_class:'other',fiscal_year:null,fiscal_period:null,period_end:null,filing_source_ref:null,language:'zh'});
 });
});

describe('classify hkexnews',()=>{
 const h=(headline:string,title:string,ref='2026090300863_c')=>classify('hkexnews',{form_type:headline,headline,title,source_ref:ref});
 it('classes from the headline (recorded fixture headlines), language from the _c/_e suffix',()=>{
  expect(h('財務報表/環境、社會及管治資料 - [中期/半年度報告]','二零二六年中期報告')).toEqual({doc_class:'interim_report',fiscal_year:null,fiscal_period:null,period_end:null,filing_source_ref:null,language:'zh'});
  expect(h('財務報表/環境、社會及管治資料 - [年報]','二零二五年年報','2026042100123_e')).toMatchObject({doc_class:'annual_report',language:'en'});
  expect(h('公告及通告 - [中期業績]','截至二零二六年六月三十日止六個月之中期業績公佈','2026081100556_c')).toEqual({doc_class:'results_announcement',fiscal_year:2026,fiscal_period:'H1',period_end:'2026-06-30',filing_source_ref:null,language:'zh'});
  expect(h('月報表','截至2026年8月31日止之股份發行人的證券變動月報表','2026083100559_c')).toEqual({doc_class:'other',fiscal_year:null,fiscal_period:null,period_end:null,filing_source_ref:null,language:'zh'});
  expect(h('Financial Statements/ESG Information - [Annual Report]','Annual Report 2025','x').language).toBeNull();
  // English title-search headlines (unrecorded layout; spec §15 q2 verification records a fixture)
  expect(h('Financial Statements/ESG Information - [Interim/Half-Year Report]','Interim Report 2026','2026090300864_e')).toMatchObject({doc_class:'interim_report',language:'en'});
  expect(h('Announcements and Notices - [Final Results]','Annual Results Announcement for the year ended 31 December 2025','r_e')).toMatchObject({doc_class:'results_announcement',fiscal_period:'FY',period_end:'2025-12-31'});
  expect(h('Announcements and Notices - [Interim Results]','Interim results','r_e').doc_class).toBe('results_announcement');
 });
 it('parses the period from 截至…止 and from "for the … ended …"',()=>{
  expect(h('[年報]','截至二零二五年十二月三十一日止年度之年報')).toMatchObject({doc_class:'annual_report',fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31'});
  expect(h('[Annual Report]','Annual Report for the year ended 31 March 2026','r_e')).toMatchObject({fiscal_year:2026,fiscal_period:'FY',period_end:'2026-03-31',language:'en'});
  expect(h('[Interim Report]','Interim report for the six months ended June 30, 2026','r_e')).toMatchObject({fiscal_period:'H1',period_end:'2026-06-30'});
  expect(h('[中期業績]','截至2026年6月30日止六个月中期业绩公告')).toMatchObject({fiscal_period:'H1',period_end:'2026-06-30'});
 });
 it('an empty headline falls back to the title',()=>{
  expect(h('','二零二五年年報').doc_class).toBe('annual_report');
 });
});

it('CLASSIFIER_GEN is the shared generation',()=>{expect(CLASSIFIER_GEN).toBe(1);});
