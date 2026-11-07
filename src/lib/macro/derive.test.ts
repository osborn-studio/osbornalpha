// src/lib/macro/derive.test.ts
import {describe,expect,it} from 'vitest';
import {deriveSeries} from './derive';
import type {MacroSeriesDef,ObservationRow} from './types';

const def=(id:string,derive:MacroSeriesDef['derive'],period:MacroSeriesDef['period']='month',revisionPolicy:MacroSeriesDef['revisionPolicy']='revisable'):MacroSeriesDef=>({
 id,region:'US',role:'indicator',type:'bond_yield',name:{zh:id,en:id},unit:'pct',nativeFrequency:'monthly',period,adjustment:'na',status:'active',
 source:null,derive,revisionPolicy,weight:0,changeKind:'bp',definitionVersion:1,
});
let n=0;
const obs=(series:string,period_end:string,value_text:string,available_at='2026-11-01T05:30:00.000Z',extra:Partial<ObservationRow>={}):ObservationRow=>({
 observation_id:`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,series_id:series,period_end,value_text,version:1,
 available_at,availability_basis:'first_seen',ingested_at:available_at,status:'ok',retrieval_id:'r',locator:{kind:'csv_row',line:2,column:1},
 derived_from:null,transform:null,code_version:'c',batch_id:'b',...extra,
});
const NOW=new Date('2026-11-06T05:30:00Z');

describe('deriveSeries month_end',()=>{
 const me=def('US_DGS10',{kind:'month_end',from:'US_DGS10_D'});
 it('takes the last valid observation of each completed month that has a later observation',()=>{
  const a=obs('US_DGS10_D','2026-08-28','4.1'),b=obs('US_DGS10_D','2026-08-31','4.2'),c=obs('US_DGS10_D','2026-09-29','4.3'),d=obs('US_DGS10_D','2026-10-01','4.4');
  const w=deriveSeries(me,[d,b,a,c],{now:NOW});
  expect(w).toEqual([
   {series_id:'US_DGS10',period_end:'2026-08-31',value_text:'4.2',available_at:b.available_at,revisable:true,derived_from:[b.observation_id,c.observation_id],transform:'month_end@1'},
   {series_id:'US_DGS10',period_end:'2026-09-30',value_text:'4.3',available_at:c.available_at,revisable:true,derived_from:[c.observation_id,d.observation_id],transform:'month_end@1'},
  ]);
 });
 it('available_at and derived_from include the completion witness; replay from derived_from reproduces the row',()=>{
  const oct=obs('US_DGS10_D','2026-10-30','4.4','2026-10-30T20:00:00.000Z'),nov=obs('US_DGS10_D','2026-11-02','4.5','2026-11-02T20:00:00.000Z');
  const [row]=deriveSeries(me,[oct,nov],{now:NOW});
  expect(row.period_end).toBe('2026-10-31');
  expect(row.available_at).toBe('2026-11-02T20:00:00.000Z');
  expect(row.derived_from).toEqual([oct.observation_id,nov.observation_id]);
  const all=[oct,nov],used=all.filter(r=>row.derived_from.includes(r.observation_id));
  expect(deriveSeries(me,used,{now:NOW})).toEqual([row]);
 });
 it('never emits the current month, nor the newest month before a later observation exists',()=>{
  const w=deriveSeries(me,[obs('US_DGS10_D','2026-10-30','4.4'),obs('US_DGS10_D','2026-11-05','4.5')],{now:NOW});
  expect(w.map(x=>x.period_end)).toEqual(['2026-10-31']);
  expect(deriveSeries(me,[obs('US_DGS10_D','2026-10-30','4.4')],{now:NOW})).toEqual([]);   // October has no later observation yet
  expect(deriveSeries(me,[obs('US_DGS10_D','2026-11-02','4.4'),obs('US_DGS10_D','2026-11-03','4.5')],{now:NOW})).toEqual([]);
 });
 it('uses the highest ok version per day, ignores quarantined rows and other series',()=>{
  const v1=obs('US_DGS10_D','2026-09-30','4.3'),v2=obs('US_DGS10_D','2026-09-30','4.31',undefined,{version:2});
  const q=obs('US_DGS10_D','2026-09-30','9.99',undefined,{version:3,status:'quarantined'});
  const wit=obs('US_DGS10_D','2026-10-01','4.4');
  const w=deriveSeries(me,[v1,v2,q,obs('US_DFF','2026-09-30','5'),wit],{now:NOW});
  expect(w).toHaveLength(1);expect(w[0].value_text).toBe('4.31');expect(w[0].derived_from).toEqual([v2.observation_id,wit.observation_id]);
 });
 it('leaves a month with no observation missing (no carry-forward)',()=>{
  const w=deriveSeries(me,[obs('US_DGS10_D','2026-07-31','4'),obs('US_DGS10_D','2026-09-30','4.3'),obs('US_DGS10_D','2026-10-01','4.4')],{now:NOW});
  expect(w.map(x=>x.period_end)).toEqual(['2026-07-31','2026-09-30']);
 });
});

describe('deriveSeries yoy_from_index',()=>{
 const yoy=def('US_CPI_YOY',{kind:'yoy_from_index',from:'US_CPI_INDEX'});
 it('computes (cur/prev − 1) × 100 in decimals with available_at = max of both inputs',()=>{
  const p=obs('US_CPI_INDEX','2025-09-30','324.368','2026-01-01T00:00:00.000Z'),c=obs('US_CPI_INDEX','2026-09-30','336.298','2026-10-15T12:00:00.000Z');
  const w=deriveSeries(yoy,[c,p],{now:NOW});
  expect(w).toHaveLength(1);
  expect(w[0]).toMatchObject({series_id:'US_CPI_YOY',period_end:'2026-09-30',available_at:'2026-10-15T12:00:00.000Z',derived_from:[c.observation_id,p.observation_id],transform:'yoy_from_index@1'});
  expect(w[0].value_text).toBe('3.6779');           // (336.298/324.368 − 1) × 100 = 3.67792… → half-even 4 dp
  const later=deriveSeries(yoy,[obs('US_CPI_INDEX','2025-09-30','100','2026-11-05T00:00:00.000Z'),obs('US_CPI_INDEX','2026-09-30','103','2026-10-01T00:00:00.000Z')],{now:NOW});
  expect(later[0].available_at).toBe('2026-11-05T00:00:00.000Z');   // the older period's value arrived later: max wins
  expect(later[0].value_text).toBe('3');
 });
 it('emits nothing when the same month of the previous year is missing (2025 shutdown month)',()=>{
  const w=deriveSeries(yoy,[obs('US_CPI_INDEX','2024-10-31','315.664'),obs('US_CPI_INDEX','2026-10-31','337'),obs('US_CPI_INDEX','2024-11-30','316.4'),obs('US_CPI_INDEX','2025-11-30','324.1')],{now:NOW});
  expect(w.map(x=>x.period_end)).toEqual(['2025-11-30']);
 });
 it('handles February of a leap year against a non-leap February',()=>{
  const w=deriveSeries(yoy,[obs('US_CPI_INDEX','2023-02-28','100'),obs('US_CPI_INDEX','2024-02-29','102.5')],{now:NOW});
  expect(w.map(x=>[x.period_end,x.value_text])).toEqual([['2024-02-29','2.5']]);
 });
 it('works for quarterly inputs (same quarter one year earlier)',()=>{
  const q=def('X_YOY',{kind:'yoy_from_index',from:'X'},'quarter');
  const w=deriveSeries(q,[obs('X','2025-09-30','200'),obs('X','2026-06-30','1'),obs('X','2026-09-30','210')],{now:NOW});
  expect(w.map(x=>[x.period_end,x.value_text])).toEqual([['2026-09-30','5']]);
 });
});

describe('deriveSeries index_minus_100',()=>{
 it('subtracts 100 exactly and keeps one input id',()=>{
  const m=def('CN_CPI_YOY',{kind:'index_minus_100',from:'CN_CPI_INDEX'},'month','immutable');
  const a=obs('CN_CPI_INDEX','2026-09-30','100.9'),b=obs('CN_CPI_INDEX','2026-08-31','99.6'),c=obs('CN_CPI_INDEX','2026-07-31','100');
  const w=deriveSeries(m,[a,b,c],{now:NOW});
  expect(w.map(x=>[x.period_end,x.value_text,x.derived_from,x.revisable,x.transform])).toEqual([
   ['2026-07-31','0',[c.observation_id],false,'index_minus_100@1'],['2026-08-31','-0.4',[b.observation_id],false,'index_minus_100@1'],['2026-09-30','0.9',[a.observation_id],false,'index_minus_100@1'],
  ]);
 });
 it('rejects non-derived definitions and invalid clocks',()=>{
  expect(()=>deriveSeries(def('X',undefined),[],{now:NOW})).toThrow('not_derived');
  expect(()=>deriveSeries(def('X',{kind:'month_end',from:'Y'}),[],{now:new Date('x')})).toThrow('invalid_now');
 });
});
