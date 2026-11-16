// src/lib/dcf/bridge.test.ts
import {describe,expect,it} from 'vitest';
import {bridgeFields,bridgeOverrides,canRun} from './bridge';
import type {DcfSeedResponse,SeedBridgeField} from './bridge';

const fact=(value:number):SeedBridgeField=>({value,source:'fact',factIds:['f'],basis:'b',periodEnd:'2023-09-30',divisor:'1000000',reason:null});
const missing=(reason:string):SeedBridgeField=>({value:null,source:null,factIds:[],basis:null,periodEnd:null,divisor:null,reason});
const seed=(shares:SeedBridgeField):DcfSeedResponse=>({status:'seed',ticker:'AAPL',market:'US',meta:{currency:'USD',currencyUnit:'百万',divisor:'1000000'},bridge:{baseRevenue:fact(383285),sharesDiluted:shares,netDebt:fact(75138)},grossMarginPct:{value:0.44,factIds:[]},missing:[],evidence:{}});

describe('equity bridge panel rules',()=>{
 it('Run only when all three are fact or user; a missing field blocks it',()=>{
  const f=bridgeFields(seed(missing('share_basis_unverified')),{});
  expect(f.sharesDiluted).toMatchObject({source:'missing',reason:'share_basis_unverified'});
  expect(canRun(f)).toBe(false);
 });
 it('a typed finite number is a user source and the only thing sent as an override',()=>{
  const f=bridgeFields(seed(missing('share_basis_unverified')),{sharesDiluted:' 15550.061 ',netDebt:'abc'});
  expect(f.sharesDiluted).toMatchObject({source:'user',value:15550.061});
  expect(f.netDebt.source).toBe('fact');
  expect(canRun(f)).toBe(true);
  expect(bridgeOverrides(f)).toEqual({sharesDiluted:15550.061});
  expect(bridgeOverrides(bridgeFields(seed(fact(1)),{baseRevenue:'1'}))).toEqual({revenueLines:[{baseRevenue:1}]});
 });
});
