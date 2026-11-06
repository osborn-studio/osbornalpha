// src/lib/entities/identifiers/apply.test.ts
import {describe,it,expect,vi} from 'vitest';
import {TableError,type TableClient} from '../../db/table-client';
import {memoryTableClient} from '../../db/memory-table-client';
import {batchStatusFromCounts} from '../../dq/batches';
import {applyIdentifierPlan} from './apply';
import type {FigiJob,FigiRecord} from './openfigi';
import {planIdentifierWrites,type PlanInput} from './plan';

const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.identifiers';
const I1='10000000-0000-4000-8000-000000000001';
const LEI1='HWUPKR0MPOU8FGXBT394';
const job:FigiJob={idType:'ID_ISIN',idValue:'US0378331005'};
const rec=(o:Partial<FigiRecord>={}):FigiRecord=>({figi:'BBG000B9XRY4',compositeFIGI:'BBG000B9XRY4',ticker:'AAPL',exchCode:'US',securityType:'Common Stock',marketSector:'Equity',...o});
// Explicit row type: inferred from the literal, isin/figi/valid_to would be `null` only and Partial<…> would
// reject setup({figi:'BBG000OTHER1'}) under strict TS (plan audit P8).
interface SecFixture{issuer_id:string;ticker:string;isin:string|null;figi:string|null;share_class:string;is_primary:boolean;valid_from:string;valid_to:string|null;valid_from_method:string;valid_to_method:string|null;source:string;provenance:Record<string,unknown>}
const secRow:SecFixture={issuer_id:I1,ticker:'AAPL',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2026-01-02',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}};
async function setup(over:Partial<SecFixture>={}){
 const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id'],dq_reconciliations:['id']});
 await c.insert('issuer_securities',{...secRow,...over});
 return c;
}
const input=(c:{isin:string|null;figi:string|null},o:Partial<PlanInput>={}):PlanInput=>({
 asOf:ASOF,stages:new Set(['A','B']),issuers:[{issuer_id:I1,lei:LEI1,usci:null}],
 openRows:[{issuer_id:I1,ticker:'AAPL',valid_from:'2026-01-02',isin:c.isin,figi:c.figi,provenance:{exchange:'Nasdaq'}}],
 universe:new Set(['AAPL']),gleif:{sha256:'a'.repeat(64),byLei:new Map([[LEI1,['US0378331005']]])},
 isinResults:new Map([['US0378331005',{job,status:'ok',records:[rec()],evidence:{request_sha256:'b'.repeat(64),response_sha256:'c'.repeat(64),index:0}}]]),
 tickerResults:new Map(),hkex:null,...o,
});
const opts={batchId:BATCH,dataset:DATASET};

describe('applyIdentifierPlan',()=>{
 it('lands guarded sets, merging each provenance key into the stored object, and replays as duplicates',async()=>{
  const c=await setup();
  const first=await applyIdentifierPlan(c,planIdentifierWrites(input({isin:null,figi:null})),opts);
  expect(first.counts).toMatchObject({fetched:2,inserted:2,duplicates:0,failed:0});
  const [r]=c.rows('issuer_securities');
  expect(r).toMatchObject({isin:'US0378331005',figi:'BBG000B9XRY4'});
  expect(Object.keys(r.provenance as object).sort()).toEqual(['exchange','figi','isin']);
  // a stale plan (built before the first apply) only finds filled columns: duplicates, nothing rewritten
  const again=await applyIdentifierPlan(c,planIdentifierWrites(input({isin:null,figi:null})),opts);
  expect(again.counts).toMatchObject({inserted:0,duplicates:2,failed:0});
  expect(batchStatusFromCounts(again.counts,again.errors)).toBe('success');
 });
 it('a column filled with another value between plan and apply becomes a correct_identifier claim',async()=>{
  const c=await setup({figi:'BBG000OTHER1'});
  const res=await applyIdentifierPlan(c,planIdentifierWrites(input({isin:null,figi:null})),opts);
  const claims=c.rows('issuer_identifier_claims');
  expect(claims.map(x=>[x.op,x.id_type,x.value,x.status])).toEqual([['correct_identifier','figi','BBG000B9XRY4','pending']]);
  expect((claims[0].detail as {params:unknown}).params).toEqual({expected_current:'BBG000OTHER1',new_value:'BBG000B9XRY4'});
  expect(res.errors.map(e=>e.code)).toEqual(['claims_summary','identifier_mismatch']);
  expect(batchStatusFromCounts(res.counts,res.errors)).toBe('partial');
 });
 it('an ISIN exclusion violation files a set_identifier claim and quarantines ownership_conflict',async()=>{
  const c=await setup();
  const failing:TableClient={...c,rpc:async(fn,a)=>{
   if(fn==='set_security_identifier'&&a.p_column==='isin')throw new TableError('rpc','set_security_identifier','conflicting key value violates exclusion constraint "issuer_securities_isin_no_overlap"','23P01');
   return c.rpc(fn,a);
  }};
  const res=await applyIdentifierPlan(failing,planIdentifierWrites(input({isin:null,figi:null})),opts);
  expect(res.counts).toMatchObject({inserted:1,quarantined:1,failed:0});
  expect(c.rows('issuer_identifier_claims').map(x=>[x.op,x.id_type,x.value])).toEqual([['set_identifier','isin','US0378331005']]);
  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,table_name:'issuer_securities',natural_key:'isin:US0378331005',reason_code:'ownership_conflict',batch_id:BATCH,status:'open'})]);
 });
 it('files plan claims once, writes HKEX-vs-GLEIF text reconciliations, and summarises skips and claims',async()=>{
  const c=await setup({ticker:'00700.HK'});
  const hkRes={job,status:'ok' as const,records:[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})],evidence:{request_sha256:'b'.repeat(64),response_sha256:'c'.repeat(64),index:0}};
  const plan=planIdentifierWrites(input({isin:null,figi:null},{stages:new Set(['A','B','D']),universe:new Set(['00700.HK']),
   openRows:[{issuer_id:I1,ticker:'00700.HK',valid_from:'2026-01-02',isin:null,figi:null,provenance:{}}],
   isinResults:new Map([['US0378331005',hkRes]]),hkex:new Map([['00700',{isin:'KYG875721634',file:'list_of_securities',sha256:'d'.repeat(64),row:5}]])}));
  const res=await applyIdentifierPlan(c,plan,opts);
  expect(c.rows('issuer_securities')[0]).toMatchObject({isin:'KYG875721634',figi:'BBG000TENCT1'});
  const [recon]=c.rows('dq_reconciliations');
  expect(recon).toMatchObject({dataset:'reconcile.entities.isin_hkex_vs_gleif',pair:'entities.isin_hkex_vs_gleif',kind:'text',outcome:'compared',passed:false,
   left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:0,left_source:'gleif_openfigi',right_source:'hkex_list_of_securities',
   natural_key:'00700.HK:2026-01-02',batch_id:BATCH,cycle_id:null,issuer_id:null,market:null,attempt:null});
  expect(recon.detail).toMatchObject({left_text:'US0378331005',right_text:'KYG875721634'});
  expect(res.claimsSummary).toEqual({correct_identifier:1});
  const again=await applyIdentifierPlan(c,plan,opts);
  expect(again.claimsSummary).toEqual({correct_identifier_appended:1});
  expect(c.rows('issuer_identifier_claims')).toHaveLength(1);
 });
 it('concurrent ISIN and FIGI applies on one row keep both values and both provenance keys (plan audit R2)',async()=>{
  const c=await setup();
  const p=planIdentifierWrites(input({isin:null,figi:null}));
  const only=(col:'isin'|'figi')=>({...p,writes:p.writes.filter(w=>w.column===col),claims:[],quarantines:[],recons:[],duplicates:0,skipped:[]});
  const spy=vi.spyOn(c,'rpc');
  const [a,b]=await Promise.all([applyIdentifierPlan(c,only('isin'),opts),applyIdentifierPlan(c,only('figi'),opts)]);
  expect([a.counts.inserted,b.counts.inserted]).toEqual([1,1]);
  expect(spy.mock.calls.map(x=>x[0])).toEqual(['set_security_identifier','set_security_identifier']);   // no read-merge-replace update
  const [r]=c.rows('issuer_securities');
  expect(r).toMatchObject({isin:'US0378331005',figi:'BBG000B9XRY4'});
  expect(Object.keys(r.provenance as object).sort()).toEqual(['exchange','figi','isin']);
 });
});
