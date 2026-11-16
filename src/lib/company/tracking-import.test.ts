// src/lib/company/tracking-import.test.ts
import {describe,expect,it,vi} from 'vitest';
import {CompanyDbError} from './types';
import {importWatchlist} from './tracking-import';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',D='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const IDS:Record<string,string>={AAPL:A,'600519.SH':B,'600519':B,MSFT:C,NVDA:D};

describe('importWatchlist',()=>{
 it('classifies added / existing / unresolved, dedupes tickers and issuers',async()=>{
  const upsert=vi.fn(async(id:string)=>({created:id!==C}));
  const r=await importWatchlist(['aapl','AAPL','600519.SH','600519','NVTS','MSFT'],{
   resolve:async t=>IDS[t]??null,existing:new Set([A]),upsert,
  });
  expect(r).toEqual({
   added:[{ticker:'600519',issuerId:B}],
   existing:[{ticker:'600519.SH',issuerId:B},{ticker:'AAPL',issuerId:A},{ticker:'MSFT',issuerId:C}],
   unresolved:[{ticker:'NVTS'}],skippedByLimit:[],
  });
  expect(upsert).toHaveBeenCalledTimes(2);   // B once (second ticker of the same issuer is existing), C once (server says it already existed)
 });
 it('a resolver error counts as unresolved, not as a failure',async()=>{
  const r=await importWatchlist(['BAD'],{resolve:async()=>{throw new Error('ambiguous_owner');},existing:new Set(),upsert:vi.fn()});
  expect(r.unresolved).toEqual([{ticker:'BAD'}]);
 });
 it('after watch_limit every further new issuer is skippedByLimit without another insert',async()=>{
  const upsert=vi.fn(async(id:string)=>{if(id===C)throw new CompanyDbError('watch_limit');return {created:true};});
  const r=await importWatchlist(['NVDA','MSFT','AAPL'],{resolve:async t=>IDS[t]??null,existing:new Set(),upsert});   // processed sorted: AAPL, MSFT, NVDA
  expect(r.added).toEqual([{ticker:'AAPL',issuerId:A}]);
  expect(r.skippedByLimit).toEqual([{ticker:'MSFT',issuerId:C},{ticker:'NVDA',issuerId:D}]);
  expect(upsert).toHaveBeenCalledTimes(2);   // AAPL, MSFT; NVDA is not attempted after the limit
 });
 it('other insert errors propagate',async()=>{
  await expect(importWatchlist(['AAPL'],{resolve:async()=>A,existing:new Set(),upsert:async()=>{throw new Error('boom');}})).rejects.toThrow('boom');
 });
});
