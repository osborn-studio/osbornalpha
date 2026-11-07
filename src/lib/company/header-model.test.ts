// src/lib/company/header-model.test.ts
import {describe,it,expect} from 'vitest';
import {displayNames,securityChips,padCik,streamOptions,securityMarket,datasetOf,factStateOf,freshnessKey} from './header-model';
import type {ResolvedIssuer} from '@/lib/entities/resolve';
import type {CoverageRow} from './types';

const sec=(ticker:string,is_primary=false)=>({ticker,isin:null,figi:null,share_class:'common',is_primary,valid_from:'2000-01-01',valid_to:null,valid_from_method:null,valid_to_method:null});
const issuer=(secs:ReturnType<typeof sec>[]):ResolvedIssuer=>({issuer_id:'i1',status:'active',names:{zh:'百济神州',en:'BeOne Medicines'},identifiers:{cik:'1651308',lei:null,usci:null},securities:secs});
const cov=(market:'US'|'CN'):CoverageRow=>({issuer_id:'i1',market,filings_count:1,facts_count:1,concepts_covered:1,earliest_period_end:null,latest_period_end:'2025-09-30',latest_available_date:'2025-11-06',citation_summary:{linked:0,pending:0,edgar:0},scope_last_success_at:null,scope_last_status:null,based_on_rev:1,rebuilt_at:'x',rebuild_id:'r',rebuild_batch_id:'b'});

describe('header model',()=>{
 it('picks the locale name as title and the other as subtitle, ticker when both empty',()=>{
  expect(displayNames({zh:'贵州茅台',en:'Kweichow Moutai'},'zh','600519.SH')).toEqual({title:'贵州茅台',subtitle:'Kweichow Moutai'});
  expect(displayNames({zh:'贵州茅台',en:'Kweichow Moutai'},'en','600519.SH')).toEqual({title:'Kweichow Moutai',subtitle:'贵州茅台'});
  expect(displayNames({zh:null,en:'Apple Inc.'},'zh','AAPL')).toEqual({title:'Apple Inc.',subtitle:null});
  expect(displayNames({zh:null,en:null},'en','AAPL')).toEqual({title:'AAPL',subtitle:null});
 });
 it('orders chips primary first then by ticker and flags the current ticker case-insensitively',()=>{
  expect(securityChips([sec('06160.HK'),sec('ONC',true),sec('688235.SH')],'688235.sh')).toEqual([
   {ticker:'ONC',primary:true,current:false,market:'US'},{ticker:'06160.HK',primary:false,current:false,market:'HK'},{ticker:'688235.SH',primary:false,current:true,market:'CN'}]);
 });
 it('pads CIK to 10 digits and passes null through',()=>{
  expect(padCik('320193')).toBe('0000320193');expect(padCik(null)).toBeNull();expect(padCik('abc')).toBe('abc');
 });
 it('classifies security markets',()=>{
  expect(securityMarket('600519.SH')).toBe('CN');expect(securityMarket('000333.SZ')).toBe('CN');expect(securityMarket('00700.HK')).toBe('HK');
  expect(securityMarket('BRK.A')).toBe('US');expect(securityMarket('AAPL')).toBe('US');
  expect(datasetOf('US')).toBe('facts.us');expect(datasetOf('CN')).toBe('facts.cn');
 });
 it('offers a stream switch only when coverage has both markets, each to that market primary ticker',()=>{
  const iss=issuer([sec('ONC',true),sec('688235.SH'),sec('06160.HK')]);
  expect(streamOptions(iss,[cov('CN'),cov('US')])).toEqual([{market:'US',ticker:'ONC'},{market:'CN',ticker:'688235.SH'}]);
  expect(streamOptions(iss,[cov('CN')])).toEqual([]);
 });
 it('derives the fact state',()=>{
  expect(factStateOf(null,null,null)).toBe('no_issuer');
  expect(factStateOf(issuer([sec('00700.HK',true)]),null,null)).toBe('hk_pending');
  expect(factStateOf(issuer([sec('AAPL',true)]),'US',null)).toBe('no_facts');
  expect(factStateOf(issuer([sec('AAPL',true)]),'US',cov('US'))).toBe('ok');
  expect(factStateOf(issuer([sec('XYZ.T',true)]),null,null)).toBe('no_facts');
 });
});

describe('freshnessKey',()=>{
 it('maps null, unknown and absent statuses to unknown',()=>{
  expect(freshnessKey('fresh')).toBe('fresh');expect(freshnessKey('missing')).toBe('missing');
  expect(freshnessKey(null)).toBe('unknown');expect(freshnessKey(undefined)).toBe('unknown');expect(freshnessKey('weird')).toBe('unknown');
 });
});
