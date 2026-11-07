// src/lib/company/statements-grid.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import type {FactRow} from '@/lib/facts/types';
import {badgesOf,buildStatementsGrid,gridReadConcepts,periodKeyOf,primaryUnitOf,statementConcepts} from './statements-grid';
import type {GridResult} from './statements-grid';
import {factRow,filingSummary,resetBuilders,sequenced} from './test-builders';
import type {FactCell,FilingSummary,ReadSnapshotResult} from './types';

const AS_OF='2026-11-06';
const snap=(rows:FactRow[],filings:FilingSummary[],o:Partial<ReadSnapshotResult>={}):ReadSnapshotResult=>({stateRev:7,rows:sequenced(rows,filings,AS_OF),truncated:false,filings,...o});
const ok=(r:ReturnType<typeof buildStatementsGrid>):GridResult=>{if(!r.ok)throw new Error(r.error);return r;};
const opts=(o:Partial<Parameters<typeof buildStatementsGrid>[1]>={})=>({statement:'IS' as const,basis:'disclosed' as const,periods:8 as const,market:'US' as const,asOf:AS_OF,...o});
const cellOf=(g:GridResult,concept:string,key:string)=>g.rows.find(r=>r.concept===concept)?.cells[key];
beforeEach(()=>resetBuilders());

describe('helpers',()=>{
 it('period keys: INSTANT uses period_end as start',()=>{
  expect(periodKeyOf({period_start:'2024-01-01',period_end:'2024-06-30',duration:'6M'})).toBe('2024-01-01:2024-06-30:6M');
  expect(periodKeyOf({period_start:null,period_end:'2023-12-31',duration:'INSTANT'})).toBe('2023-12-31:2023-12-31:INSTANT');
 });
 it('primary unit: most periods, tie → smallest code unit',()=>{
  expect(primaryUnitOf([{period:'a',unit:'USD'},{period:'b',unit:'USD'},{period:'a',unit:'EUR'}])).toBe('USD');
  expect(primaryUnitOf([{period:'a',unit:'USD'},{period:'b',unit:'EUR'}])).toBe('EUR');
  expect(primaryUnitOf([])).toBeNull();
 });
 it('statement concepts in catalogue order, shares_outstanding last on BS; quarterly read concepts per market',()=>{
  const bs=statementConcepts('BS');expect(bs[bs.length-1]).toBe('shares_outstanding');expect(bs[0]).toBe('total_assets');
  expect(statementConcepts('IS')[0]).toBe('revenue');
  expect(gridReadConcepts('IS','quarterly','CN')).toEqual(['revenue','net_income_parent','operating_income']);
  expect(gridReadConcepts('CF','quarterly','US')).toEqual(['operating_cash_flow','capex']);
  expect(gridReadConcepts('CF','quarterly','CN')).toEqual(['operating_cash_flow','capex_incl_intangibles']);
  expect(gridReadConcepts('BS','annual','US')).toEqual(statementConcepts('BS'));
 });
});

describe('buildStatementsGrid',()=>{
 it('disclosed: period-key columns, descending, cumulative and single-quarter columns side by side; fact cells carry value_text verbatim',()=>{
  const q2=filingSummary({availableDate:'2024-08-01',formType:'10-Q'}),fy=filingSummary({availableDate:'2024-02-01'});
  const rows=[factRow(fy,{value:'383285000000.00'}),factRow(q2,{period_start:'2024-04-01',period_end:'2024-06-30',duration:'3M',value:'5'}),factRow(q2,{period_start:'2024-01-01',period_end:'2024-06-30',duration:'6M',value:'9'})];
  const g=ok(buildStatementsGrid(snap(rows,[q2,fy]),opts()));
  expect(g.periods.map(p=>p.key)).toEqual(['2024-04-01:2024-06-30:3M','2024-01-01:2024-06-30:6M','2023-01-01:2023-12-31:12M']);
  expect(cellOf(g,'revenue','2023-01-01:2023-12-31:12M')).toMatchObject({kind:'fact',value:'383285000000.00',unit:'USD',filingId:fy.filingId,disclosureSeq:1,isRevision:false,otherUnits:false});
  expect(g).toMatchObject({stateRev:7,statement:'IS',basis:'disclosed',mappingGen:1});
  expect(g.rows.map(r=>r.concept)).toEqual(['revenue']);
  expect(g.rows[0]).toMatchObject({unit:'USD',unitKind:'money',sourceConcepts:['us-gaap:Revenues'],notes:null});
  expect(Object.keys(g.filings).sort()).toEqual([q2.filingId,fy.filingId].sort());
  expect(g.factIds).toEqual(rows.map(r=>r.fact_id).sort());
 });
 it('annual keeps 12M (IS) and INSTANT (BS); current disclosure only',()=>{
  const a=filingSummary({availableDate:'2024-02-01'}),b=filingSummary({availableDate:'2025-02-01'});
  const old=factRow(a,{value:'1'}),cur=factRow(b,{value:'2'}),q=factRow(b,{period_start:'2024-10-01',period_end:'2024-12-31',duration:'3M'});
  const g=ok(buildStatementsGrid(snap([old,cur,q],[a,b]),opts({basis:'annual'})));
  expect(g.periods.map(p=>p.key)).toEqual(['2023-01-01:2023-12-31:12M']);
  expect(cellOf(g,'revenue','2023-01-01:2023-12-31:12M')).toMatchObject({factId:cur.fact_id,disclosureSeq:2,isRevision:true});
  const bs=ok(buildStatementsGrid(snap([factRow(a,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT',value:'5'})],[a]),opts({statement:'BS',basis:'annual'})));
  expect(bs.periods.map(p=>p.key)).toEqual(['2023-12-31:2023-12-31:INSTANT']);
 });
 it('BS: DEI shares_outstanding is the last row; quarterly on BS is invalid_basis',()=>{
  const f=filingSummary();
  const rows=[factRow(f,{concept:'shares_outstanding',statement:'DEI',source_concept:'dei:EntityCommonStockSharesOutstanding',period_start:null,duration:'INSTANT',unit:'shares',value:'15000000000'}),factRow(f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT',value:'5'})];
  const g=ok(buildStatementsGrid(snap(rows,[f]),opts({statement:'BS'})));
  expect(g.rows.map(r=>r.concept)).toEqual(['total_assets','shares_outstanding']);
  expect(g.rows[1]).toMatchObject({unit:'shares',unitKind:'shares'});
  expect(buildStatementsGrid(snap(rows,[f]),opts({statement:'BS',basis:'quarterly'}))).toEqual({ok:false,error:'invalid_basis'});
 });
 it('quarterly: q_single_* only, derived on the same envelope with rule a/b recorded; direct 3M has no rule; CN single-quarter revenue is concept revenue',()=>{
  const q1=filingSummary({availableDate:'2024-05-01',formType:'10-Q'}),h1=filingSummary({availableDate:'2024-08-01',formType:'10-Q'});
  const rows=[factRow(q1,{period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'10'}),factRow(h1,{period_start:'2024-01-01',period_end:'2024-06-30',duration:'6M',value:'25'})];
  const g=ok(buildStatementsGrid(snap(rows,[q1,h1]),opts({basis:'quarterly'})));
  expect(g.periods.map(p=>p.key)).toEqual(['2024-04-01:2024-06-30:3M','2024-01-01:2024-03-31:3M']);
  const q2=cellOf(g,'revenue','2024-04-01:2024-06-30:3M');
  expect(q2).toMatchObject({kind:'derived',metric:'q_single_revenue',value:'15',unit:'USD',inputUnit:'USD',basis:'us_standard',formulaVersion:'facts-derive/1.0',rule:'b'});
  expect(q2&&q2.kind==='derived'?q2.inputs.map(i=>i.factId).sort():[]).toEqual(rows.map(r=>r.fact_id).sort());
  const direct=cellOf(g,'revenue','2024-01-01:2024-03-31:3M');
  expect(direct).toMatchObject({kind:'derived',value:'10'});expect(direct&&'rule' in direct).toBe(false);
  expect(g.factIds).toEqual(rows.map(r=>r.fact_id).sort());
  expect(g.periods.some(p=>p.duration==='TTM')).toBe(false);
  const cnF=filingSummary({source:'tushare',citation:'pending',formType:'q1'});
  const cn=[factRow(cnF,{market:'CN',unit:'CNY',source_concept:'income.total_revenue',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'7'}),
   factRow(cnF,{market:'CN',unit:'CNY',concept:'revenue_operating',source_concept:'income.revenue',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'6'})];
  const gc=ok(buildStatementsGrid(snap(cn,[cnF]),opts({basis:'quarterly',market:'CN'})));
  expect(gc.rows.map(r=>r.concept)).toEqual(['revenue']);
  expect(cellOf(gc,'revenue','2024-01-01:2024-03-31:3M')).toMatchObject({metric:'q_single_revenue',value:'7',basis:'cn_standard'});
 });
 it('per-row primary unit, U on mixed periods, other-unit-only periods are null and listed',()=>{
  const fs=[1,2,3,4].map(i=>filingSummary({availableDate:`202${i}-02-01`}));
  const per=(f:FilingSummary,y:number,unit:string,value:string)=>factRow(f,{period_start:`${y}-01-01`,period_end:`${y}-12-31`,unit,value});
  const rows=[per(fs[0],2020,'USD','1'),per(fs[0],2020,'EUR','0.9'),per(fs[1],2021,'USD','2'),per(fs[2],2022,'USD','3'),per(fs[3],2023,'EUR','4')];
  const g=ok(buildStatementsGrid(snap(rows,fs),opts()));
  expect(g.rows[0].unit).toBe('USD');
  expect((cellOf(g,'revenue','2020-01-01:2020-12-31:12M') as FactCell)).toMatchObject({value:'1',unit:'USD',otherUnits:true});
  expect((cellOf(g,'revenue','2021-01-01:2021-12-31:12M') as FactCell).otherUnits).toBe(false);
  expect(cellOf(g,'revenue','2023-01-01:2023-12-31:12M')).toBeNull();
  expect(g.otherUnitOnly).toEqual({revenue:['2023-01-01:2023-12-31:12M']});
  const tie=ok(buildStatementsGrid(snap([per(fs[0],2020,'USD','1'),per(fs[1],2021,'EUR','2')],fs),opts()));
  expect(tie.rows[0].unit).toBe('EUR');
 });
 it('crops to the latest `periods` columns',()=>{
  const fs=Array.from({length:10},(_,i)=>filingSummary({availableDate:`20${String(11+i)}-02-01`}));
  const rows=fs.map((f,i)=>factRow(f,{period_start:`20${String(10+i)}-01-01`,period_end:`20${String(10+i)}-12-31`,value:String(i)}));
  const g=ok(buildStatementsGrid(snap(rows,fs),opts({periods:8})));
  expect(g.periods).toHaveLength(8);
  expect(g.periods[0].periodEnd).toBe('2019-12-31');expect(g.periods[7].periodEnd).toBe('2012-12-31');
  expect(g.factIds).toHaveLength(8);
 });
 it('badges R / n / ! / U',()=>{
  const a=filingSummary({availableDate:'2024-02-01'}),b=filingSummary({availableDate:'2025-02-01',citation:'pending'}),c=filingSummary({availableDate:'2024-02-01'}),d=filingSummary({availableDate:'2025-02-01'});
  const rows=[factRow(a,{value:'1'}),factRow(b,{value:'2'}),
   factRow(c,{concept:'net_income_parent',value:'5'}),factRow(d,{concept:'net_income_parent',value:'5'})];
  const g=ok(buildStatementsGrid(snap(rows,[a,b,c,d]),opts()));
  const key='2023-01-01:2023-12-31:12M';
  expect(badgesOf(cellOf(g,'revenue',key)??null,g.filings,g.otherUnitOnly,'revenue',key)).toEqual(['R','!']);
  expect(badgesOf(cellOf(g,'net_income_parent',key)??null,g.filings,g.otherUnitOnly,'net_income_parent',key)).toEqual(['n']);
  expect(badgesOf(null,g.filings,{revenue:[key]},'revenue',key)).toEqual(['U']);
 });
 it('truncated envelope → error, never a partial grid; a row without disclosure_seq breaks the contract',()=>{
  const f=filingSummary();
  expect(buildStatementsGrid(snap([factRow(f)],[f],{truncated:true,rows:[]}),opts())).toEqual({ok:false,error:'read_truncated'});
  const raw=factRow(f);
  expect(()=>buildStatementsGrid({stateRev:1,rows:[{...raw,is_current:true}],truncated:false,filings:[f]},opts())).toThrow(/grid_sequence_missing/);
 });
});
