// src/components/company/statements-model.test.ts
import {describe,it,expect} from 'vitest';
import {badgesOf,cellView,moneyCurrency,statementsCsv,barSeries,gridEmptyState,periodKeyParts} from './statements-model';
import type {StatementsResponse} from '@/lib/company/client';
import type {FactCell,FilingSummary,GridRow} from '@/lib/company/types';

const fact=(o:Partial<FactCell>={}):FactCell=>({kind:'fact',factId:'f1',value:'170899152276.34',unit:'CNY',availableDate:'2025-04-03',filingId:'g1',disclosureSeq:1,isRevision:false,mappingGen:1,rawHash:'h',runId:'r',otherUnits:false,...o});
const filing=(citation:'edgar'|'linked'|'pending'):FilingSummary=>({filingId:'g1',formType:'annual',fiscalYear:2024,fiscalPeriod:'FY',periodEnd:'2024-12-31',availableDate:'2025-04-03',sourceRef:'600519_2024_annual',source:'tushare',url:null,documentUrl:null,citation,linkAttempts:0,factCount:10,mappingGen:1});
const row=(cells:GridRow['cells'],o:Partial<GridRow>={}):GridRow=>({concept:'revenue_operating',unit:'CNY',unitKind:'money',sourceConcepts:['income.revenue'],notes:null,cells,...o});
const K1='2024-01-01:2024-12-31:12M',K2='2024-01-01:2024-09-30:9M';
const resp=(rows:GridRow[],o:Partial<StatementsResponse>={}):StatementsResponse=>({issuerId:'i',ticker:'600519.SH',market:'CN',asOf:'2026-11-06',otherUnitOnly:{},otherUnitsAlso:{},mappingGen:1,stateRev:4,truncated:false,statement:'IS',basis:'disclosed',periods:[{key:K1,periodStart:'2024-01-01',periodEnd:'2024-12-31',duration:'12M'},{key:K2,periodStart:'2024-01-01',periodEnd:'2024-09-30',duration:'9M'}],rows,filings:{g1:filing('linked')},evidence:{},withheld:{evidenceIncomplete:0,citationPending:0},...o});

describe('badges',()=>{
 it('R for revisions, n for unchanged re-disclosure, ! only for pending filings, U for other units',()=>{
  expect(badgesOf(fact({isRevision:true,disclosureSeq:2}),{g1:filing('linked')})).toEqual([{code:'R'}]);
  expect(badgesOf(fact({disclosureSeq:3}),{g1:filing('linked')})).toEqual([{code:'n',seq:3}]);
  expect(badgesOf(fact({otherUnits:true}),{g1:filing('pending')})).toEqual([{code:'!'},{code:'U'}]);
  expect(badgesOf(fact(),{})).toEqual([]);
  // committed DTO otherUnitsAlso → U on a value cell whose own flag is false
  expect(badgesOf(fact(),{},true)).toEqual([{code:'U'}]);
  expect(cellView(fact(),row({}),8,{},false,true)).toMatchObject({kind:'fact',badges:[{code:'U'}]});
 });
});
describe('cellView',()=>{
 it('scales money rows only and keeps per-share raw; maps withheld and missing',()=>{
  expect(cellView(fact(),row({}),8,{})).toMatchObject({kind:'fact',text:'1,708.99'});
  expect(cellView(fact({value:'68.64',unit:'CNY/shares'}),row({},{unitKind:'per_share',unit:'CNY/shares'}),8,{})).toMatchObject({text:'68.64'});
  expect(cellView({kind:'withheld',reason:'citation_pending',factId:'f'},row({}),8,{})).toEqual({kind:'withheld',reason:'citation_pending',factId:'f'});
  expect(cellView(null,row({}),8,{})).toEqual({kind:'missing'});
  expect(cellView(null,row({}),8,{},true)).toEqual({kind:'missing',otherUnitOnly:true});
  expect(cellView({kind:'derived',metric:'q_single_revenue',value:'396490000000',unit:'CNY',inputUnit:'CNY',basis:'disclosed',formulaVersion:'facts-derive/1.0',inputs:[]},row({}),8,{})).toMatchObject({kind:'derived',text:'3,964.90'});
 });
});
describe('grid helpers',()=>{
 it('splits period keys, picks the money currency, and decides the empty state',()=>{
  expect(periodKeyParts(K2)).toEqual({periodStart:'2024-01-01',periodEnd:'2024-09-30',duration:'9M'});
  expect(moneyCurrency([row({},{unitKind:'per_share',unit:'CNY/shares'}),row({},{unit:'CNY'})])).toBe('CNY');
  expect(moneyCurrency([])).toBeNull();
  expect(gridEmptyState(resp([],{periods:[]}),'2001-06-30')).toBe('before_first');
  expect(gridEmptyState(resp([],{periods:[]}),null)).toBe('empty');
  expect(gridEmptyState(resp([row({})]),null)).toBeNull();
 });
 it('exports value_text verbatim with ids and escapes CSV fields',()=>{
  const csv=statementsCsv(resp([row({[K1]:fact(),[K2]:{kind:'withheld',reason:'citation_pending',factId:'f2'}},{notes:'x'}),row({[K1]:null},{concept:'rd,"x"'})]));
  const lines=csv.trim().split('\n');
  expect(lines[0]).toBe('concept,unit,period_key,period_start,period_end,duration,kind,fact_id,filing_id,available_date,value_text,withheld_reason');
  expect(lines[1]).toBe(`revenue_operating,CNY,${K1},2024-01-01,2024-12-31,12M,fact,f1,g1,2025-04-03,170899152276.34,`);
  expect(lines[2]).toBe(`revenue_operating,CNY,${K2},2024-01-01,2024-09-30,9M,withheld,f2,,,,citation_pending`);
  expect(lines).toHaveLength(3);   // null cells are not exported
 });
 it('bar series follows the column order and marks withheld or missing cells',()=>{
  const s=barSeries(row({[K1]:fact({value:'-5'}),[K2]:{kind:'withheld',reason:'evidence_incomplete',factId:'f'}}),resp([]).periods);
  expect(s).toEqual([{key:K1,value:-5,blank:false},{key:K2,value:null,blank:true}]);
 });
});

describe('withheld cells expose no digits (review fix 8)',()=>{
 it('the cell view model and the CSV value column of a withheld cell carry no number',()=>{
  const v=cellView({kind:'withheld',reason:'evidence_incomplete',factId:'fx'},row({}),8,{});
  expect(JSON.stringify(v)).not.toMatch(/\d/);
  const csv=statementsCsv(resp([row({[K1]:{kind:'withheld',reason:'evidence_incomplete',factId:'fx'}})]));
  expect(csv.trim().split('\n')[1].split(',')[10]).toBe('');
 });
});
