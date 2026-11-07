// src/lib/judgments/origins.test.ts
import {describe,expect,it} from 'vitest';
import {ORIGINS,originFor,originKey,originKnown} from './origins';
import {JudgmentError} from './errors';
import {PUBLIC_INPUT_KINDS} from './types';
import type {Origin} from './types';

const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof JudgmentError?e.code:'other';}};
describe('ORIGINS (spec §3.5: origin is a frozen table, not free text)',()=>{
 it('is frozen, keyed kind×adapter, covers every public kind, and every row is unverified',()=>{
  expect(Object.isFrozen(ORIGINS)).toBe(true);
  for(const [k,t] of Object.entries(ORIGINS)){expect(Object.isFrozen(t)).toBe(true);expect(k).toBe(originKey(k.split('×')[0] as never,t.adapter));expect('license_status' in t).toBe(false);}
  for(const kind of PUBLIC_INPUT_KINDS)expect(Object.keys(ORIGINS).some(k=>k.startsWith(`${kind}×`))).toBe(true);
  expect(Object.keys(ORIGINS).some(k=>k.startsWith('document_span×'))).toBe(false);
  expect(ORIGINS['legacy_fill×eastmoney']).toBeDefined();   // spec §11.2: the private adapter's origin row
 });
 it('originFor fills the locator template and the fixed / optional transform',()=>{
  expect(originFor('price_bar','eastmoney',{market:'A',ticker:'600519.SH',date:'2024-06-19',adjustment:'qfq'})).toEqual({publisher:'交易所行情（经东方财富转发）',adapter:'eastmoney',locator:'eastmoney:kline:A:600519.SH:2024-06-19:qfq'});
  expect(originFor('financial_metric','edgar',{issuer_id:'i',metric:'ttm_revenue',period_start:'2023-10-01',period_end:'2024-09-28',formula_version:'facts-derive/1.0'}).transform).toBe('derive:facts-derive/1.0');
  expect(originFor('price_bar','datagateway',{market:'US',ticker:'NVDA',date:'2024-06-10',adjustment:'qfq'},{transform:'close_only'}).transform).toBe('close_only');
  expect('transform' in originFor('price_bar','datagateway',{market:'US',ticker:'NVDA',date:'2024-06-10',adjustment:'qfq'})).toBe(false);
 });
 it('unknown key, missing variable and a disallowed transform → input_origin_unknown',()=>{
  expect(code(()=>originFor('price_bar','sina',{}))).toBe('input_origin_unknown');
  expect(code(()=>originFor('document_span','f3',{}))).toBe('input_origin_unknown');
  expect(code(()=>originFor('judgment','judgments',{}))).toBe('input_origin_unknown');
  expect(code(()=>originFor('price_bar','eastmoney',{market:'A',ticker:'x',date:'d',adjustment:'qfq'},{transform:'close_only'}))).toBe('input_origin_unknown');
  expect(code(()=>originFor('financial_metric','edgar',{issuer_id:'i',metric:'m',period_start:'s',period_end:'e',formula_version:'f'},{transform:'other'}))).toBe('input_origin_unknown');
 });
 it('originKnown accepts built origins and rejects edited ones',()=>{
  const o=originFor('judgment','judgments',{judgment_id:'00000000-0000-8000-8000-000000000001'});
  expect(originKnown('judgment',o)).toBe(true);
  expect(originKnown('judgment',{...o,publisher:'x'})).toBe(false);
  expect(originKnown('judgment',{...o,license_status:'confirmed'} as never)).toBe(false);   // D3: a licence field is an unknown key
  expect(originKnown('judgment',{...o,locator:'elsewhere'})).toBe(false);
  expect(originKnown('judgment',{...o,transform:'x'})).toBe(false);
  expect(originKnown('macro_snapshot',o)).toBe(false);
  expect(originKnown('judgment',{...o,extra:1} as unknown as Origin)).toBe(false);
  const m=originFor('financial_metric','tushare',{issuer_id:'i',metric:'roe',period_start:'2023-01-01',period_end:'2023-12-31',formula_version:'facts-derive/1.0'});
  expect(originKnown('financial_metric',m)).toBe(true);
  expect(originKnown('financial_metric',{...m,transform:undefined} as unknown as Origin)).toBe(false);
  const c=originFor('price_bar','datagateway',{market:'HK',ticker:'00700.HK',date:'2024-05-17',adjustment:'qfq'},{transform:'close_only'});
  expect(originKnown('price_bar',c)).toBe(true);
 });
});
