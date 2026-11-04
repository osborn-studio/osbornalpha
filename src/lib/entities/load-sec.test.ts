import {describe,it,expect,vi,beforeEach} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {batchStatusFromCounts} from '../dq/batches';
import type {IssuerInput,IssuerSecurityInput} from './types';
import {applySecLoad,loaderOutcome,planSecLoad} from './load-sec';

// Stand-ins for the issuer master writes: hard id → issuer, ticker → owner. Conflicting ciks are
// listed in `conflicts`; every created issuer/security is also written to the memory client.
const fake=vi.hoisted(()=>({issuers:new Map<string,string>(),owners:new Map<string,string>(),conflicts:new Set<string>()}));
vi.mock('./issuers',()=>({
 upsertIssuerByIdentifiers:vi.fn(async(client:{insert:(t:string,r:object)=>Promise<unknown>},input:IssuerInput)=>{
  const id=String(input.cik??input.lei??input.usci);
  if(fake.conflicts.has(id))return {issuer_id:null,created:false,conflict:true,reason:'hard_id_conflict'};
  const existing=fake.issuers.get(id);
  if(existing)return {issuer_id:existing,created:false};
  const issuer_id=`iss-${id}`;fake.issuers.set(id,issuer_id);
  await client.insert('issuers',{issuer_id,...input});
  return {issuer_id,created:true};
 }),
 attachSecurity:vi.fn(async(client:{insert:(t:string,r:object)=>Promise<unknown>},sec:IssuerSecurityInput)=>{
  const owner=fake.owners.get(sec.ticker);
  if(owner)return owner===sec.issuer_id?'duplicate':'conflict';
  fake.owners.set(sec.ticker,sec.issuer_id);
  await client.insert('issuer_securities',{...sec});
  return 'inserted';
 }),
}));

beforeEach(()=>{fake.issuers.clear();fake.owners.clear();fake.conflicts.clear();});

const AS_OF='2026-11-05';
const prov={source:'sec_company_tickers_exchange',as_of:AS_OF};

describe('planSecLoad',()=>{
 it('keeps only tickers present in the universe, normalizes them, and builds issuer + security inputs without inventing domicile or share class',()=>{
  const plan=planSecLoad([
   {cik:'320193',name:'Apple Inc.',ticker:'AAPL',exchange:'Nasdaq'},
   {cik:'1652044',name:'Alphabet Inc.',ticker:'GOOG',exchange:'Nasdaq'},
   {cik:'1652044',name:'Alphabet Inc.',ticker:'GOOGL',exchange:'Nasdaq'},
   {cik:'99999',name:'Not Listed',ticker:'ZZZZ',exchange:'OTC'},
   {cik:'1067983',name:'Berkshire',ticker:'BRK-B',exchange:'NYSE'},
  ],new Set(['AAPL','GOOG','GOOGL','BRK.B']),AS_OF);
  expect(plan.asOf).toBe(AS_OF);
  expect(plan.skipped).toEqual(['ZZZZ']);
  expect(plan.issuers).toEqual([
   {cik:'320193',canonical_name_en:'Apple Inc.',provenance:{cik:prov,canonical_name_en:prov}},
   {cik:'1652044',canonical_name_en:'Alphabet Inc.',provenance:{cik:prov,canonical_name_en:prov}},
   {cik:'1067983',canonical_name_en:'Berkshire',provenance:{cik:prov,canonical_name_en:prov}},
  ]);
  expect(plan.securities).toEqual([
   {cik:'320193',ticker:'AAPL',share_class:'unknown',is_primary:true,valid_from:AS_OF,source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}},
   {cik:'1652044',ticker:'GOOG',share_class:'unknown',is_primary:true,valid_from:AS_OF,source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}},
   {cik:'1652044',ticker:'GOOGL',share_class:'unknown',is_primary:false,valid_from:AS_OF,source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}},
   {cik:'1067983',ticker:'BRK.B',share_class:'unknown',is_primary:true,valid_from:AS_OF,source:'sec_company_tickers_exchange',provenance:{exchange:'NYSE'}},
  ]);
 });

 it('matches a dotted ticker exactly before normalizing, so BRK.A never collapses to BRK',()=>{
  const plan=planSecLoad([
   {cik:'1067983',name:'Berkshire',ticker:'BRK.A',exchange:'NYSE'},
   {cik:'1067983',name:'Berkshire',ticker:'brk.a',exchange:'NYSE'},
  ],new Set(['BRK.A','BRK']),AS_OF);
  expect(plan.securities.map(s=>s.ticker)).toEqual(['BRK.A','BRK.A']);
  expect(plan.skipped).toEqual([]);
 });

 it('refuses plans above the row limit',()=>{
  const rows=Array.from({length:100_001},(_,i)=>({cik:String(i+1),name:'X',ticker:'X',exchange:'NYSE'}));
  expect(()=>planSecLoad(rows,new Set(),AS_OF)).toThrow('too_many_rows');
 });
});

describe('applySecLoad',()=>{
 const rows=[
  {cik:'320193',name:'Apple Inc.',ticker:'AAPL',exchange:'Nasdaq'},
  {cik:'1652044',name:'Alphabet Inc.',ticker:'GOOG',exchange:'Nasdaq'},
  {cik:'1652044',name:'Alphabet Inc.',ticker:'GOOGL',exchange:'Nasdaq'},
 ];
 const meta=(n=rows.length)=>({sourceRows:n,rejected:[] as {index:number;reason:'invalid_cik'}[]});

 it('counts issuer and security outcomes; a second run is all duplicates and succeeds',async()=>{
  const c=memoryTableClient();
  const plan=planSecLoad(rows,new Set(['AAPL','GOOG','GOOGL']),AS_OF);
  const first=await applySecLoad(c,plan,{asOf:AS_OF,batchProducerMeta:meta()});
  expect(first.counts).toEqual({fetched:3,inserted:5,duplicates:0,versioned:0,quarantined:0,failed:0});
  expect(first.errors).toEqual([]);
  const second=await applySecLoad(c,plan,{asOf:AS_OF,batchProducerMeta:meta()});
  expect(second.counts).toEqual({fetched:3,inserted:0,duplicates:5,versioned:0,quarantined:0,failed:0});
  const status=batchStatusFromCounts(second.counts,second.errors);
  expect(status).toBe('success');
  expect(loaderOutcome(status,second.counts)).toEqual({ok:true,exitCode:0});
 });

 it('quarantines a conflicting issuer and blocks its securities as failed; skips and rejects are summarized in one error',async()=>{
  fake.conflicts.add('1652044');
  const c=memoryTableClient();
  const plan=planSecLoad([...rows,{cik:'5',name:'Gone',ticker:'ZZZZ',exchange:'OTC'}],new Set(['AAPL','GOOG','GOOGL']),AS_OF);
  const res=await applySecLoad(c,plan,{asOf:AS_OF,batchProducerMeta:{sourceRows:5,rejected:[{index:4,reason:'invalid_cik'}]}});
  expect(res.counts).toEqual({fetched:5,inserted:2,duplicates:0,versioned:0,quarantined:1,failed:2});
  expect(res.skippedSummary).toEqual({rejected_invalid_cik:1,not_in_universe:1});
  expect(res.errors[0]).toEqual({code:'skipped_summary',message:JSON.stringify({rejected_invalid_cik:1,not_in_universe:1})});
  expect(res.errors.slice(1).map(e=>e.code)).toEqual(['issuer_conflict','blocked_by_issuer','blocked_by_issuer']);
  expect(c.rows('issuer_securities').map(r=>r.ticker)).toEqual(['AAPL']);
  const status=batchStatusFromCounts(res.counts,res.errors);
  expect(loaderOutcome(status,res.counts)).toEqual({ok:false,exitCode:1});
 });

 it('reports an empty plan as an error that finishes the batch as failed',async()=>{
  const res=await applySecLoad(memoryTableClient(),planSecLoad(rows,new Set(),AS_OF),{asOf:AS_OF,batchProducerMeta:meta()});
  expect(res.errors.map(e=>e.code)).toEqual(['skipped_summary','empty_plan']);
  const status=batchStatusFromCounts(res.counts,res.errors);
  expect(status).toBe('failed');
  expect(loaderOutcome(status,res.counts).exitCode).toBe(1);
 });

 it('rejects an as-of that differs from the plan',async()=>{
  await expect(applySecLoad(memoryTableClient(),planSecLoad(rows,new Set(['AAPL']),AS_OF),{asOf:'2026-11-06',batchProducerMeta:meta()})).rejects.toThrow('as_of_mismatch');
 });
});

describe('loaderOutcome',()=>{
 const counts=(over:object)=>({fetched:1,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0,...over});
 it('is ok on success or on a partial run that landed rows without failures, never on quarantine only',()=>{
  expect(loaderOutcome('success',counts({inserted:1}))).toEqual({ok:true,exitCode:0});
  expect(loaderOutcome('partial',counts({duplicates:1}))).toEqual({ok:true,exitCode:0});
  expect(loaderOutcome('partial',counts({quarantined:1}))).toEqual({ok:false,exitCode:0});
  expect(loaderOutcome('partial',counts({inserted:1,failed:1}))).toEqual({ok:false,exitCode:1});
  expect(loaderOutcome('failed',counts({}))).toEqual({ok:false,exitCode:1});
 });
});
