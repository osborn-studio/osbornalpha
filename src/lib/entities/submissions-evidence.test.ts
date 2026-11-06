// src/lib/entities/submissions-evidence.test.ts
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryRawStore} from '../dq/raw-store';
import {fetchSubmissions} from './identifiers/sec-submissions';
import {applySubmissionsEvidence} from './submissions-evidence';

const MAIN=readFileSync(new URL('./fixtures/sec-submissions/zz-main.json',import.meta.url),'utf8');
const PAGE=readFileSync(new URL('./fixtures/sec-submissions/zz-page-001.json',import.meta.url),'utf8');
const ISSUER='10000000-0000-4000-8000-000000000009',OTHER='10000000-0000-4000-8000-00000000000a';
const BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.sec-submissions';
const fetch=(async(u:string|URL|Request)=>new Response(String(u).endsWith('-001.json')?PAGE:MAIN,{status:200})) as typeof globalThis.fetch;
const snapshot=()=>fetchSubmissions('999001',{fetch,raw:memoryRawStore(),sleep:async()=>{}},{coverFrom:'1993-01-01'});
const sec=(issuer_id:string,ticker:string,o:Record<string,unknown>={})=>({issuer_id,ticker,isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'sec_company_tickers_exchange',provenance:{},...o});
const client=()=>memoryTableClient({security_aliases:['alias','ticker','alias_type'],issuer_identifier_claims:['id'],dq_quarantine:['id']});

describe('applySubmissionsEvidence',()=>{
 it('writes former-name aliases on the primary row, evidence claims and SEC-only tickers; a replay changes nothing',async()=>{
  const c=client();
  await c.insert('issuer_securities',sec(ISSUER,'ZZF'));
  const input={issuerId:ISSUER,primaryTicker:'ZZF',snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZF','ZZFX'])};
  const first=await applySubmissionsEvidence(c,input);
  expect(c.rows('security_aliases')).toEqual([expect.objectContaining({alias:'ZZ Fixture Corp',ticker:'ZZF',alias_type:'name',source:'sec_submissions'})]);
  expect(c.rows('issuer_identifier_claims').map(r=>[r.op,r.value])).toEqual([['evidence_only','0000999001-25-000031'],['evidence_only','0000999001-01-000001']]);
  expect(c.rows('issuer_securities').find(r=>r.ticker==='ZZFX')).toMatchObject({issuer_id:ISSUER,valid_from:'2026-11-05',valid_from_method:'first_observed',source:'sec_submissions',share_class:'unknown',is_primary:false});
  expect(first.counts).toMatchObject({inserted:2,failed:0});
  expect(first.claims).toEqual({evidence_only:2});
  const again=await applySubmissionsEvidence(c,input);
  expect(again.counts).toMatchObject({inserted:0,duplicates:2,failed:0});
  expect(again.claims).toEqual({evidence_only_appended:2});
  expect(c.rows('issuer_identifier_claims')).toHaveLength(2);
 });
 it('quarantines an SEC ticker held by another issuer and skips tickers outside the universe',async()=>{
  const c=client();
  await c.insert('issuer_securities',sec(OTHER,'ZZFX'));
  const res=await applySubmissionsEvidence(c,{issuerId:ISSUER,primaryTicker:null,snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZFX'])});
  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,natural_key:'ZZFX:2026-11-05',reason_code:'ownership_conflict'})]);
  expect(c.rows('security_aliases')).toEqual([]);
  expect(res.skippedSummary).toEqual({no_primary_ticker:1});
  const none=await applySubmissionsEvidence(client(),{issuerId:ISSUER,primaryTicker:'ZZF',snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZF'])});
  expect(none.skippedSummary).toEqual({ticker_not_in_universe:1});
 });
});
