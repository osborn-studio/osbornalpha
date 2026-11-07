// src/components/company/drawer-model.test.ts
import {describe,it,expect} from 'vitest';
import {drawerRows,defaultSelected,factsRequest,keyFromFactRow,filingLink,evidenceFields} from './drawer-model';
import type {FactSeriesResponse,SeriesEntry} from '@/lib/company/client';
import type {EvidenceDto,FilingSummary} from '@/lib/company/types';

type FactEntry=Extract<SeriesEntry,{kind:'fact'}>;
const base={factId:'f',sourceConcept:'income.revenue',unit:'CNY',availableDate:'2025-04-03',filingId:'g1',disclosureSeq:1,isCurrent:null,isRevision:false,mappingVersion:'facts-map/1',mappingGen:1};
const e=(o:Partial<FactEntry>):SeriesEntry=>({...base,kind:'fact',value:'170899152276.34',rawHash:'h',runId:'r',unitRule:null,delta:null,relChange:null,...o});
const w=(o:Partial<typeof base>&{reason:'citation_pending'|'evidence_incomplete'}):SeriesEntry=>({...base,kind:'withheld',...o});
const ev=(factId:string,codeVersion:string|null):EvidenceDto=>({factId,rawHash:'7f2c',snapshot:{source:'tushare',sha256:'s',path:'tushare/i/x.json',api:'income',url:null,params:{ts_code:'600519.SH'},capturedAt:'2025-04-03T10:20:00Z',httpStatus:200,page:null,download:null},locator:{hashLocator:'income:0',jsonPointer:'/data/items/0',field:'revenue',pdf:{page:112,table:'合并利润表',row:'营业收入',column:'本期发生额',documentUrl:'https://static.cninfo.com.cn/x.pdf'}},run:{runId:'r',codeVersion,toolVersions:{tushare:'1'}},mappingVersion:'facts-map/1',unitRule:'cny_yuan',sourceDocument:{kind:'cninfo_pdf',url:'https://static.cninfo.com.cn/x.pdf'}});
const resp=(series:SeriesEntry[]):FactSeriesResponse=>({issuerId:'i',ticker:'600519.SH',market:'CN',asOf:'2026-11-06',mappingGen:1,stateRev:1,truncated:false,history:true,concept:'revenue_operating',periodStart:'2024-01-01',periodEnd:'2024-12-31',unit:'CNY',otherUnits:[],series,otherUnitSeries:[],filings:{},evidence:{f1:ev('f1','3f9c2e1aaaa'),f3:ev('f3','5a10b7dbbbb')},withheld:{evidenceIncomplete:0,citationPending:0}});

describe('drawerRows',()=>{
 // 计划第 3 轮审计 R2/R3: the difference is the server's guarded entry.delta / entry.relChange (Task 9), only formatted here.
 // 170912400118.02 − 170899152276.34 = 13247841.68 → ÷1e8 = 0.1324784168 → '+0.13';
 // relChange = 13247841.68 / 170899152276.34 = 0.0000775184750… → 10 places '0.0000775185' → 0.0078%.
 it('formats the server revision difference and marks same-value re-disclosures',()=>{
  const rows=drawerRows(resp([e({factId:'f1'}),e({factId:'f2',availableDate:'2025-04-29',disclosureSeq:2,delta:'0',relChange:'0'}),e({factId:'f3',availableDate:'2025-08-13',disclosureSeq:3,isRevision:true,value:'170912400118.02',delta:'13247841.68',relChange:'0.0000775185'})]),8);
  expect(rows.map(r=>r.revision)).toEqual([{kind:'first'},{kind:'same'},{kind:'diff',abs:'+0.13',rel:'+0.0078%'}]);
  expect(rows[0].codeVersion).toBe('3f9c2e1');expect(rows[1].codeVersion).toBeNull();
 });
 it('withheld entries carry no value and break no diff chain',()=>{
  const rows=drawerRows(resp([e({factId:'f1'}),w({factId:'f2',reason:'citation_pending',disclosureSeq:2,isRevision:true})]),8);
  expect(rows[1]).toMatchObject({valueText:null,revision:{kind:'withheld'}});
  expect(defaultSelected(rows)).toBe('f1');
 });
 it('eligible → withheld → eligible revised: no numerical delta across the withheld disclosure (计划第 3 轮审计 R3)',()=>{
  // Task 9 emits delta/relChange null after a withheld predecessor; the drawer must not recompute 120 − 100.
  const rows=drawerRows(resp([e({factId:'f1',value:'100'}),w({factId:'f2',reason:'evidence_incomplete',disclosureSeq:2,isRevision:true}),e({factId:'f3',value:'120',disclosureSeq:3,isRevision:true,delta:null,relChange:null})]),0);
  expect(rows.map(r=>r.revision)).toEqual([{kind:'first'},{kind:'withheld'},{kind:'withheld'}]);
  expect(rows[2].valueText).toBe('120');
  expect(JSON.stringify(rows[2].revision)).not.toMatch(/20/);
 });
});
describe('requests and links',()=>{
 it('builds the series request; INSTANT uses periodEnd as periodStart; a null unit is simply omitted from the URL',()=>{
  expect(factsRequest('600519.SH',{concept:'cash',periodStart:null,periodEnd:'2024-12-31',unit:'CNY'},'2024-06-30',false)).toBe('/api/companies/600519.SH/facts?concept=cash&periodStart=2024-12-31&periodEnd=2024-12-31&unit=CNY&asOf=2024-06-30');
  expect(factsRequest('AAPL',{concept:'eps_basic',periodStart:'2023-10-01',periodEnd:'2024-09-28',unit:null},null,true)).toBe('/api/admin/companies/AAPL/facts?concept=eps_basic&periodStart=2023-10-01&periodEnd=2024-09-28');
  expect(keyFromFactRow({factId:'x',concept:'cash',periodStart:null,periodEnd:'2024-12-31',duration:'INSTANT',unit:'USD'})).toEqual({concept:'cash',periodStart:'2024-12-31',periodEnd:'2024-12-31',unit:'USD'});
 });
 it('links filings by citation and never links pending ones',()=>{
  const f=(citation:FilingSummary['citation']):FilingSummary=>({filingId:'g',formType:'10-K',fiscalYear:2024,fiscalPeriod:'FY',periodEnd:'2024-09-28',availableDate:'2024-11-01',sourceRef:'0000320193-24-000123',source:'edgar',url:'https://www.sec.gov/x-index.htm',documentUrl:'https://static.cninfo.com.cn/y.pdf',citation,linkAttempts:0,factCount:1,mappingGen:1});
  expect(filingLink(f('edgar'))).toBe('https://www.sec.gov/x-index.htm');
  expect(filingLink(f('linked'))).toBe('https://static.cninfo.com.cn/y.pdf');
  expect(filingLink(f('pending'))).toBeNull();
 });
 it('lists evidence fields in a fixed order with JSON for objects',()=>{
  const fields=evidenceFields(ev('f1','3f9c2e1'));
  expect(fields.map(([k])=>k)).toEqual(['rawHash','snapshot.source','snapshot.sha256','snapshot.path','snapshot.api','snapshot.url','snapshot.params','snapshot.capturedAt','snapshot.httpStatus','snapshot.page','locator.hashLocator','locator.jsonPointer','locator.field','locator.pdf','run.runId','run.codeVersion','run.toolVersions','mappingVersion','unitRule']);
  expect(Object.fromEntries(fields)['snapshot.params']).toBe('{"ts_code":"600519.SH"}');
  expect(Object.fromEntries(fields)['locator.pdf']).toBe('page 112 · 合并利润表 · 营业收入 · 本期发生额');
 });
});
