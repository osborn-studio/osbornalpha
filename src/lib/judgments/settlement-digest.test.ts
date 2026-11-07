// src/lib/judgments/settlement-digest.test.ts
// spec §5.3 S02: request_digest = digest of the full semantic payload (judgment_id, kind, outcome,
// realized, evidence, resolver, resolver_version, reason, actor); run metadata is excluded.
import {describe,expect,it} from 'vitest';
import {digest} from './canonical';
import {OPERATION_FIELDS,operationDigest,operationPayload} from './settlement-digest';
import type {SettlementInsert} from './types';

const J='1d5b6a9e-7f00-8a00-8000-000000000000';
const ROW:SettlementInsert={kind:'settled',outcome:'hit',realized:{value:0.12,unit:'ratio',from:'2026-01-02',to:'2026-02-02',label_policy:'first_observed'},evidence:{bars_sha256:'b'.repeat(64),bars:[{time:'2026-01-02',close:10}]},resolver:'price_return',resolver_version:'1.0.0',reason:null,actor:'cron',code_version:'abcdef1',batch_id:'0b0e1d8e-0000-4000-8000-000000000001'};

describe('operationDigest',()=>{
 it('is the RFC 8785 digest of exactly the nine semantic fields',()=>{
  expect(Object.keys(operationPayload(J,ROW)).sort()).toEqual([...OPERATION_FIELDS].sort());
  expect(operationDigest(J,ROW)).toBe(digest({judgment_id:J,kind:'settled',outcome:'hit',realized:ROW.realized,evidence:ROW.evidence,resolver:'price_return',resolver_version:'1.0.0',reason:null,actor:'cron'}));
 });
 it('changes when only resolver_version differs (S02)',()=>{
  expect(operationDigest(J,{...ROW,resolver_version:'1.0.1'})).not.toBe(operationDigest(J,ROW));
 });
 it('changes with every other semantic field and with the judgment id',()=>{
  const base=operationDigest(J,ROW);
  const variants:SettlementInsert[]=[{...ROW,kind:'void',outcome:null,realized:null,reason:'no_data'},{...ROW,outcome:'miss'},{...ROW,realized:{...ROW.realized!,value:0.13}},{...ROW,evidence:{}},{...ROW,resolver:'fact_metric'},{...ROW,reason:'x'},{...ROW,actor:'script'}];
  for(const v of variants)expect(operationDigest(J,v)).not.toBe(base);
  expect(operationDigest('1d5b6a9e-7f00-8a00-8000-000000000001',ROW)).not.toBe(base);
 });
 it('ignores run metadata, key order and undefined optional members',()=>{
  const base=operationDigest(J,ROW);
  expect(operationDigest(J,{...ROW,code_version:'1234567',batch_id:'0b0e1d8e-0000-4000-8000-000000000002'})).toBe(base);
  expect(operationDigest(J,{...ROW,realized:{label_policy:'first_observed',to:'2026-02-02',from:'2026-01-02',unit:'ratio',value:0.12,label:undefined}})).toBe(base);
  expect(operationDigest(J,{...ROW,evidence:{bars:[{close:10,time:'2026-01-02'}],bars_sha256:'b'.repeat(64)}})).toBe(base);
 });
});
