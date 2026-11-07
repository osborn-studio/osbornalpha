// src/lib/judgments/resolvers/index.test.ts
// F4 Task 11 (spec §3.3): every public resolver validates its condition params with a strict ajv schema (plus a
// real-calendar date check), exposes labelAvailableAt for the §3.4 retrospective rule and a maxFetchMs for the
// §7.1 budget; resolverFor() refuses recommendation_hit (private adapter only) and unimplemented resolvers.
import {describe,expect,it} from 'vitest';
import {FORMULA_VERSION} from '@/lib/facts/derive';
import {MAX_FETCH_MS,RESOLVERS,resolverFor} from './index';
import {factMetricResolver} from './facts';
import {macroRegimeReplayResolver} from './macro';
import {PRICE_MAX_FETCH_MS,priceReturnResolver} from './price';

const PRICE={ticker:'ZZA',market:'US',adjustment:'qfq',source:'eastmoney',base_date:'2026-01-12'};
const FACT={issuer_id:'11111111-1111-4111-8111-111111111111',market:'US',metric:'q_single_revenue',period_start:'2025-07-01',period_end:'2025-09-30',duration:'3M',unit:'USD',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION,compare:'value'};
const MACRO={region:'US',reference_period:'2026-06',macro_methodology_version:'v1.0',catalog_version:'catalog/1'};
const codeOf=(f:()=>unknown)=>{try{f();}catch(e){return (e as {code?:string}).code??null;}return 'no_throw';};

describe('resolver params and registry',()=>{
 it('price_return params: frozen source/adjustment, real dates, optional benchmark, nothing else',()=>{
  const v=(p:unknown)=>priceReturnResolver.validateParams(p);
  expect(v(PRICE)).toBe(true);
  expect(v({...PRICE,benchmark:{ticker:'ZZB',market:'US'}})).toBe(true);
  for(const bad of [{...PRICE,adjustment:'none'},{...PRICE,source:'yahoo'},{...PRICE,market:'JP'},{...PRICE,base_date:'2026-02-30'},{...PRICE,base_date:'2026-1-12'},
   {...PRICE,extra:1},{...PRICE,benchmark:{ticker:'ZZB'}},{...PRICE,benchmark:{ticker:'ZZB',market:'US',x:1}},{market:'US',adjustment:'qfq',source:'eastmoney',base_date:'2026-01-12'},null,'x'])
   expect({bad,ok:v(bad)}).toEqual({bad,ok:false});
 });
 it('fact_metric params: the full financial_metrics natural key and compare value|yoy',()=>{
  const v=(p:unknown)=>factMetricResolver.validateParams(p);
  expect(v(FACT)).toBe(true);expect(v({...FACT,compare:'yoy',duration:'TTM'})).toBe(true);
  for(const bad of [{...FACT,compare:'mom'},{...FACT,market:'HK'},{...FACT,issuer_id:'nope'},{...FACT,period_end:'2025-09-31'},{...FACT,duration:'2M'},{...FACT,basis:''},(({basis:_b,...rest})=>rest)(FACT),{...FACT,extra:true}])
   expect({bad,ok:v(bad)}).toEqual({bad,ok:false});
 });
 it('macro_regime_replay params: region, reference period YYYY-MM and both frozen versions',()=>{
  const v=(p:unknown)=>macroRegimeReplayResolver.validateParams(p);
  expect(v(MACRO)).toBe(true);
  for(const bad of [{...MACRO,region:'EU'},{...MACRO,reference_period:'2026-13'},{...MACRO,reference_period:'2026-06-01'},{...MACRO,catalog_version:''},{...MACRO,x:1}])
   expect({bad,ok:v(bad)}).toEqual({bad,ok:false});
 });
 it('labelAvailableAt per resolver (spec §3.4 retrospective rule 3)',()=>{
  expect(priceReturnResolver.labelAvailableAt(PRICE,{kind:'session_index',base_date:'2026-01-12',n:5})).toBe('2026-01-17T21:00:00.000Z');
  expect(priceReturnResolver.labelAvailableAt(PRICE,{kind:'date',date:'2026-07-06'})).toBe('2026-07-06T20:00:00.000Z');   // EDT
  expect(priceReturnResolver.labelAvailableAt({...PRICE,market:'A',ticker:'ZZ0001'},{kind:'session_index',base_date:'2026-01-12',n:5})).toBe('2026-01-17T07:00:00.000Z');
  expect(priceReturnResolver.labelAvailableAt(PRICE,{kind:'period',period:'2026-01'})).toBeNull();
  expect(priceReturnResolver.labelAvailableAt({bad:true},{kind:'date',date:'2026-01-20'})).toBeNull();
  expect(factMetricResolver.labelAvailableAt(FACT,{kind:'fiscal_period',period_end:'2025-09-30',calendar:{anchor_period_end:'2025-06-30',months:3},extrapolated:false})).toBe('2025-09-30T23:59:59.999Z');
  expect(macroRegimeReplayResolver.labelAvailableAt(MACRO,{kind:'period',period:'2026-09'})).toBe('2026-10-01T00:00:00.000Z');
  expect(macroRegimeReplayResolver.labelAvailableAt(MACRO,{kind:'date',date:'2026-09-30'})).toBeNull();
 });
 it('RESOLVERS: names match keys, versions are distinct, MAX_FETCH_MS is the slowest resolver',()=>{
  for(const [k,r] of Object.entries(RESOLVERS))expect(r.name).toBe(k);
  expect(new Set(Object.values(RESOLVERS).map(r=>r.version)).size).toBe(3);
  expect(MAX_FETCH_MS).toBe(PRICE_MAX_FETCH_MS);expect(MAX_FETCH_MS).toBe(30_000);
 });
 it('resolverFor: public resolvers by name; recommendation_hit, industry_aggregate and unknown names are invalid_condition',()=>{
  expect(resolverFor('price_return')).toBe(priceReturnResolver);
  expect(resolverFor('fact_metric')).toBe(factMetricResolver);
  expect(resolverFor('macro_regime_replay')).toBe(macroRegimeReplayResolver);
  for(const name of ['recommendation_hit','industry_aggregate','nope'])expect({name,code:codeOf(()=>resolverFor(name))}).toEqual({name,code:'invalid_condition'});
 });
});
