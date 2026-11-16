// src/lib/judgments/resolvers/price-capabilities.test.ts
// The table and the committed evidence must agree (spec §7.4): every verified/unsupported row names
// a recorded fixture whose re-judged verdict maps to that status, and every committed fixture's
// verdict is reflected in the table. Holds both before verification (no fixtures, all unverified)
// and after the reviewed table edit of Task 7 Step 12.
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {PRICE_CAPABILITIES,capabilityOf,isVerified,verifiedMarkets} from './price-capabilities';
import {capabilityStatusOf,judgeFixture} from '../adjustment-verify';
import type {KlineAdjustFixture} from '../adjustment-verify';

const DIR='fixtures/judgments/kline';
const fixtures=existsSync(DIR)?readdirSync(DIR).filter(f=>f.endsWith('.json')).sort().map(f=>({path:`${DIR}/${f}`,fx:JSON.parse(readFileSync(`${DIR}/${f}`,'utf8')) as KlineAdjustFixture})):[];
describe('PRICE_CAPABILITIES (spec §7.4)',()=>{
 it('is frozen, has one row per (eastmoney|datagateway) × (A|HK|US) × (qfq|hfq), and never lists none',()=>{
  expect(Object.isFrozen(PRICE_CAPABILITIES)).toBe(true);
  expect(PRICE_CAPABILITIES).toHaveLength(12);
  expect(new Set(PRICE_CAPABILITIES.map(c=>`${c.source}|${c.market}|${c.adjustment}`)).size).toBe(12);
  expect(PRICE_CAPABILITIES.every(c=>c.adjustment==='qfq'||c.adjustment==='hfq')).toBe(true);
 });
 it('rows carry evidence iff they are not unverified, and the evidence fixture exists',()=>{
  for(const c of PRICE_CAPABILITIES){
   if(c.status==='unverified'){expect(c.evidence).toBeNull();expect(c.verified_at).toBeNull();continue;}
   expect(c.evidence&&existsSync(c.evidence)).toBeTruthy();expect(c.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
 });
 it('every committed fixture re-judges to its stored verdicts and the table reflects them',()=>{
  for(const {path,fx} of fixtures){
   expect(judgeFixture(fx)).toEqual(fx.verdicts);
   for(const adj of ['qfq','hfq'] as const){
    const c=capabilityOf(fx.source,fx.market,adj);
    expect({path,adj,status:c.status}).toEqual({path,adj,status:capabilityStatusOf(fx.verdicts[adj])});
    if(c.status!=='unverified')expect(c.evidence).toBe(path);
   }
  }
 });
 it('absent rows are unsupported; helpers agree with the table',()=>{
  expect(capabilityOf('sina','A','qfq').status).toBe('unsupported');
  const verified=PRICE_CAPABILITIES.filter(c=>c.status==='verified');
  for(const c of PRICE_CAPABILITIES)expect(isVerified(c.source,c.market,c.adjustment)).toBe(c.status==='verified');
  expect(verifiedMarkets('eastmoney','qfq',['A','HK','US'])).toEqual(verified.filter(c=>c.source==='eastmoney'&&c.adjustment==='qfq').map(c=>c.market));
 });
});
