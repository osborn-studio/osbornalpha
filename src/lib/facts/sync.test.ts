// src/lib/facts/sync.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';

const mocks=vi.hoisted(()=>({reconcileScope:vi.fn(),scopeRowFor:vi.fn(),materialize:vi.fn()}));
vi.mock('./scope',()=>({reconcileScope:mocks.reconcileScope,scopeRowFor:mocks.scopeRowFor}));
vi.mock('./derive',()=>({materialize:mocks.materialize,FORMULA_VERSION:'facts-derive/1.0'}));

import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsDb} from './memory-facts-db';
import {memorySnapshotStore} from './snapshot-store';
import {runFactsSync,makeBudget,resolveCodeVersion,LEASE_TTL_S,MAX_LINK_ATTEMPTS} from './sync';
import type {CoverageEntry,SyncDeps} from './sync';
import {SyncError} from './errors';
import {FactsDbError} from './types';
import type {Duration,FactCandidate,FactsDb,FilingCandidate,Market,ParseResult,RawSnapshot} from './types';

const ISSUER='00000000-0000-4000-8000-000000000001',ISSUER2='00000000-0000-4000-8000-000000000002';
const NOW=new Date('2027-03-01T08:00:00.000Z');   // later than any real clock during the test so new scope rows (next_due_at = now()) are due
const snap=(text:string):RawSnapshot=>({bytes:new TextEncoder().encode(text),sha256:createHash('sha256').update(text).digest('hex'),meta:{source:'edgar',fetched_at:NOW.toISOString(),http_status:200}});
const filing=(ref:string,availableDate:string,over:Partial<FilingCandidate>={}):FilingCandidate=>({sourceRef:ref,market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-09-30',availableDate,url:null,...over});
const cand=(ref:string,concept:string,value:string,over:Partial<FactCandidate>={}):FactCandidate=>({concept,sourceConcept:concept,statement:'IS',periodStart:'2022-10-01',periodEnd:'2023-09-30',duration:'12M' as Duration,value,unit:'USD',consolidation:'consolidated',filingRef:ref,rawHash:'a'.repeat(64),...over});
const bs=(ref:string,concept:string,value:string):FactCandidate=>cand(ref,concept,value,{statement:'BS',periodStart:null,duration:'INSTANT'});
const parsed=(filings:FilingCandidate[],candidates:FactCandidate[],extra:Partial<ParseResult>={}):ParseResult=>({candidates,filings,skipped:[],ambiguous:[],oddDuration:[],missingAvailableDate:[],...extra});
const FY23=parsed([filing('acc-1','2023-11-03')],[cand('acc-1','revenue','383285000000'),cand('acc-1','net_income_parent','96995000000')]);

function harness(parse:ParseResult|(()=>ParseResult)=FY23,over:Partial<SyncDeps>={},scopes:{issuer_id:string;fetch_key:string;market?:Market}[]=[{issuer_id:ISSUER,fetch_key:'0000320193'}]){
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset'],issuers:['issuer_id']});
 const db=memoryFactsDb(tables);const storage=memorySnapshotStore();
 for(const s of scopes)void tables.insert('issuers',{issuer_id:s.issuer_id,status:'active'});
 const deps:SyncDeps={db,tables,storage,fetchUs:async()=>snap('{"facts":{}}'),fetchCn:async()=>[snap('{"code":0}')],parseUs:()=>typeof parse==='function'?parse():parse,parseCn:()=>typeof parse==='function'?parse():parse,now:()=>NOW,deadline:null,codeVersion:'a'.repeat(40),...over};
 mocks.reconcileScope.mockImplementation(async(d:{db:FactsDb},market:Market)=>d.db.reconcileScope(market,scopes.filter(s=>(s.market??'US')===market).map(s=>({issuer_id:s.issuer_id,reasons:['sp500'],priority:10,fetch_key:s.fetch_key}))));
 // scopeRowFor (Task 14) answers for the issuers this harness knows; anyone else is unresolvable.
 mocks.scopeRowFor.mockImplementation(async(_tables:unknown,market:Market,issuerId:string)=>{const s=scopes.find(x=>x.issuer_id===issuerId&&(x.market??'US')===market);return s?{issuer_id:issuerId,reasons:['explicit'],priority:10,fetch_key:s.fetch_key}:null;});
 return {tables,db,storage,deps};
}
const CN_REF='600519.SH:20231231:1:20240403';
const cnFiling=()=>filing(CN_REF,'2024-04-03',{market:'CN',source:'tushare',origin:'sse',formType:'annual',periodEnd:'2023-12-31'});
const cnRevenue=()=>cand(CN_REF,'revenue','100',{periodStart:'2023-01-01',periodEnd:'2023-12-31',unit:'CNY'});
const CN_SCOPE=[{issuer_id:ISSUER,fetch_key:'600519.SH',market:'CN' as Market}];
const run=(deps:SyncDeps,over:Partial<Parameters<typeof runFactsSync>[1]>={})=>runFactsSync(deps,{market:'US',limit:25,dryRun:false,triggeredBy:'script',...over});
const current=(db:FactsDb,asOf=NOW.toISOString().slice(0,10))=>db.readFacts(ISSUER,'US',{concepts:['revenue','net_income_parent','total_assets','liabilities_and_equity'],asOf,history:false});

/** Counter contract: after a published run the outcomes add up to fetched; after a failure at least so. */
const balanced=(c:{fetched:number;inserted:number;versioned:number;duplicates:number;quarantined:number;failed:number})=>{
 const n=c.inserted+c.versioned+c.duplicates+c.quarantined+c.failed;
 if(c.failed===0)expect(n).toBe(c.fetched);else expect(n).toBeGreaterThanOrEqual(c.fetched);
};
beforeEach(()=>{vi.clearAllMocks();mocks.materialize.mockResolvedValue(0);});

describe('runFactsSync — lifecycle',()=>{
 it('publishes a run: facts visible, filing generation activated, snapshot stored, batch and freshness ok, lease released',async()=>{
  const {tables,db,storage,deps}=harness();
  const r=await run(deps);
  expect(r.status).toBe('success');
  expect(r.counts).toMatchObject({fetched:2,inserted:2,versioned:0,duplicates:0,quarantined:0,failed:0});
  expect(r.detail).toEqual({attempted:1,published:1,failed:0,skipped:0,idle:false});
  expect(r.issuers[0]).toMatchObject({issuerId:ISSUER,fetchKey:'0000320193',outcome:'published',snapshotSha256:[snap('{"facts":{}}').sha256]});
  const facts=await current(db);
  expect(facts.rows.map(f=>[f.concept,f.value,f.status,f.mapping_gen,f.disclosure_seq])).toEqual([['net_income_parent','96995000000','ok',1,1],['revenue','383285000000','ok',1,1]]);
  expect((await db.filingsOfIssuer(ISSUER,'US',{}))[0]).toMatchObject({source_ref:'acc-1',mapping_gen:1,available_date:'2023-11-03'});
  expect([...storage.objects.keys()]).toEqual([`edgar/${ISSUER}/${snap('{"facts":{}}').sha256}.json`,`edgar/${ISSUER}/${snap('{"facts":{}}').sha256}.meta.json`]);
  const batch=tables.rows('ingest_batches')[0];
  expect(batch).toMatchObject({producer:'facts-sync',dataset:'facts.us',status:'success',code_version:'a'.repeat(40),triggered_by:'script',tool_versions:{mapping_gen:'1',rules:'dq-rules/1.0',formula:'facts-derive/1.0',source:'edgar'}});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'facts.us',status:'fresh',consecutive_errors:0,detail:{attempted:1,published:1,failed:0,skipped:0,idle:false}});
  const scope=(await db.scopeDue('US','9999-12-31T00:00:00.000Z',10))[0];
  expect(scope).toMatchObject({last_status:'success',lease_batch_id:null,next_due_at:'2027-03-08T08:00:00.000Z'});
  expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
  expect(mocks.reconcileScope).toHaveBeenCalledWith({db,tables},'US');
 });
 it('counts a second identical pass as duplicates and a later filing with a new value as versioned, replayable by asOf',async()=>{
  const {db,deps}=harness();
  await run(deps);
  const again=await run(deps,{issuerIds:[ISSUER]});   // explicit issuer ignores next_due_at
  expect(again.counts).toMatchObject({inserted:0,duplicates:2,versioned:0});
  deps.parseUs=()=>parsed([filing('acc-2','2024-11-01')],[cand('acc-2','revenue','383285000001'),cand('acc-2','net_income_parent','96995000000')]);
  const third=await run(deps,{issuerIds:[ISSUER]});
  expect(third.counts).toMatchObject({inserted:1,versioned:1,duplicates:0});
  expect((await current(db,'2024-06-30')).rows.find(f=>f.concept==='revenue')).toMatchObject({value:'383285000000',disclosure_seq:1});
  expect((await current(db,'2025-06-30')).rows.find(f=>f.concept==='revenue')).toMatchObject({value:'383285000001',disclosure_seq:2,is_revision:true});
 });
 it('runs idle when nothing is due: success batch, freshness ok with idle=true',async()=>{
  const {tables,deps}=harness(FY23,{},[]);
  const r=await run(deps);
  expect(r).toMatchObject({idle:true,status:'success',issuers:[]});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({status:'fresh',detail:{idle:true,attempted:0}});
 });
 it('publishes an empty run and reports no_rows when the source has nothing',async()=>{
  const {db,deps}=harness(parsed([],[]));
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'published',code:'no_rows'});
  expect(r.errors).toEqual([{code:'skipped_summary',key:ISSUER,message:'{"no_rows":1}'}]);
  expect(r.status).toBe('success');
  expect(db.runs()[0]).toMatchObject({status:'published',manifest:[]});
 });
});

describe('runFactsSync — conflicts and rules',()=>{
 it('parks two same-day disclosures with different values into one same_day_conflict item and leaves no ok value for that day',async()=>{
  const {tables,db,deps}=harness(parsed([filing('acc-1','2023-11-03'),filing('acc-2','2023-11-03')],[cand('acc-1','revenue','100'),cand('acc-2','revenue','200')]));
  const r=await run(deps);
  expect(r.counts).toMatchObject({inserted:0,versioned:0,quarantined:2});balanced(r.counts);
  expect(r.status).toBe('success');
  const items=tables.rows('dq_quarantine');
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({dataset:'facts.us',table_name:'financial_facts',reason_code:'same_day_conflict',status:'open',natural_key:`${ISSUER}:US:revenue:2022-10-01:2023-09-30:consolidated:USD:2023-11-03`});
  expect((items[0].payload as {fact_ids:string[]}).fact_ids).toHaveLength(2);
  expect((items[0].payload as {run_id:string}).run_id).toBe(r.issuers[0].runId);
  expect((await current(db)).rows).toEqual([]);
  // a third filing for the same day joins the open item whatever its value
  deps.parseUs=()=>parsed([filing('acc-3','2023-11-03')],[cand('acc-3','revenue','100')]);
  const r2=await run(deps,{issuerIds:[ISSUER]});
  expect(r2.counts).toMatchObject({quarantined:1,inserted:0});
  expect((tables.rows('dq_quarantine')[0].payload as {fact_ids:string[]}).fact_ids).toHaveLength(3);
  expect(tables.rows('dq_quarantine')).toHaveLength(1);
 });
 it('quarantines identity_bs failures (only the new rows) and keeps the rest of the run published',async()=>{
  const {tables,db,deps}=harness(parsed([filing('acc-1','2023-11-03')],[bs('acc-1','total_assets','1000'),bs('acc-1','liabilities_and_equity','1100'),cand('acc-1','revenue','5')]));
  const r=await run(deps);
  expect(r.counts).toMatchObject({inserted:1,quarantined:2});
  const item=tables.rows('dq_quarantine')[0];
  expect(item).toMatchObject({reason_code:'identity_bs',natural_key:`${ISSUER}:US:BS:2023-09-30:USD:acc-1:1`});
  expect((item.payload as {fact_ids:string[];rule:string}).rule).toBe('identity_bs');
  expect((await current(db)).rows.map(f=>f.concept)).toEqual(['revenue']);
  const all=await db.readFacts(ISSUER,'US',{concepts:['total_assets','liabilities_and_equity'],asOf:'2030-01-01',history:true,includeNonOk:true});
  expect(all.rows.map(f=>f.status)).toEqual(['quarantined','quarantined']);
 });
 it('records parser leftovers as quarantine items without fact rows and warnings as one rule_warning_summary per rule',async()=>{
  const odd=cand('acc-1','revenue','1',{periodStart:'2023-08-01',duration:'3M'});
  const {tables,deps}=harness(parsed([filing('acc-1','2023-11-03')],[cand('acc-1','revenue','100'),cand('acc-1','cost_of_revenue','250')],{oddDuration:[odd],ambiguous:[{key:`${ISSUER}:US:cash::2023-09-30:consolidated:USD:acc-1:1`,candidates:[bs('acc-1','cash','1'),bs('acc-1','cash','2')]}]}));
  const r=await run(deps);
  expect(r.counts).toMatchObject({fetched:5,inserted:2,quarantined:3});balanced(r.counts);
  expect(tables.rows('dq_quarantine').map(i=>i.reason_code).sort()).toEqual(['ambiguous_value','odd_duration']);
  expect(r.errors).toEqual([{code:'rule_warning_summary',key:'gross_margin_range',message:JSON.stringify({count:1,keys:[`${ISSUER}:US:IS:2022-10-01:2023-09-30:USD:acc-1:1`]})}]);
  expect(r.status).toBe('success');
 });
});

describe('runFactsSync — failures',()=>{
 it('skips a leased issuer with skipped_summary(leased) and a merged issuer with issuer_merged',async()=>{
  const {tables,db,deps}=harness();
  await mocks.reconcileScope(deps,'US');
  expect(await db.claimLease(ISSUER,'US','99999999-0000-4000-8000-000000000000',LEASE_TTL_S)).toBe(true);
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'skipped',code:'leased',runId:null});
  expect(r.errors).toEqual([{code:'skipped_summary',key:ISSUER,message:'{"leased":1}'}]);
  expect(r.status).toBe('success');
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:1,detail:{attempted:1,published:0,skipped:1}});
  await db.releaseLease(ISSUER,'US','99999999-0000-4000-8000-000000000000','failed',NOW.toISOString());
  await tables.update('issuers',{issuer_id:ISSUER},{status:'merged'});
  expect((await run(deps)).issuers[0]).toMatchObject({outcome:'skipped',code:'issuer_merged'});
 });
 it('abandons the run and fails the issuer when the fetch fails; old data stays, lease released as failed',async()=>{
  const {db,deps}=harness();
  await run(deps);
  deps.fetchUs=async()=>{throw new SyncError('sec_unavailable');};
  const r=await run(deps,{issuerIds:[ISSUER]});
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'sec_unavailable'});
  expect(r.errors).toEqual([{code:'sec_unavailable',key:ISSUER}]);
  expect(r.counts.failed).toBe(1);
  expect(r.status).toBe('failed');
  expect(db.runs().map(x=>x.status)).toEqual(['published','abandoned']);
  expect((await current(db)).rows).toHaveLength(2);
  expect((await db.scopeDue('US','9999-12-31T00:00:00.000Z',10))[0]).toMatchObject({last_status:'failed',lease_batch_id:null,next_due_at:'2027-03-02T08:00:00.000Z'});
  deps.fetchUs=async()=>{throw new SyncError('no_companyfacts');};
  expect((await run(deps,{issuerIds:[ISSUER]})).errors[0].code).toBe('no_companyfacts');
 });
 it('fails with parse_error (message, no values), snapshot_upload_failed and read_truncated, each abandoning the run',async()=>{
  const {db,deps}=harness();
  deps.parseUs=()=>{throw new Error('bad field: val');};
  expect((await run(deps)).issuers[0]).toMatchObject({outcome:'failed',code:'parse_error'});
  deps.parseUs=()=>FY23;
  deps.storage={put:async()=>{throw new SyncError('snapshot_upload_failed','storage down');}};
  expect((await run(deps,{issuerIds:[ISSUER]})).errors[0]).toEqual({code:'snapshot_upload_failed',key:ISSUER});
  deps.storage=memorySnapshotStore();
  const real=db.readFacts.bind(db);
  db.readFacts=async(...a)=>({...(await real(...a)),truncated:true});
  expect((await run(deps,{issuerIds:[ISSUER]})).issuers[0]).toMatchObject({outcome:'failed',code:'read_truncated'});
  expect(db.runs().every(x=>x.status==='abandoned')).toBe(true);
  // abandon_sync_run keeps the filings the run staged (gen 0, no facts); only begin_sync_run prunes,
  // and only for runs still staged at that moment. The next run reuses the row by source_ref
  // (stage_filings on-conflict) and activates it on publish (round-1 #17a).
  expect(await db.filingsOfIssuer(ISSUER,'US',{})).toEqual([expect.objectContaining({source_ref:'acc-1',mapping_gen:0})]);
  db.readFacts=real;
  expect((await run(deps,{issuerIds:[ISSUER]})).issuers[0].outcome).toBe('published');
  expect(await db.filingsOfIssuer(ISSUER,'US',{})).toEqual([expect.objectContaining({source_ref:'acc-1',mapping_gen:1})]);
 });
 it('stops the issuer on lease_lost without calling abandon or release',async()=>{
  const {db,deps}=harness();
  db.stageFacts=async()=>{throw new FactsDbError('lease_lost');};
  const abandonSpy=vi.spyOn(db,'abandonRun');const releaseSpy=vi.spyOn(db,'releaseLease');
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'lease_lost'});
  expect(r.errors).toEqual([{code:'lease_lost',key:ISSUER}]);
  expect(abandonSpy).not.toHaveBeenCalled();expect(releaseSpy).not.toHaveBeenCalled();
  expect(r.status).toBe('failed');
 });
 it('fails with mapping_gen_regression when a filing already carries a newer generation',async()=>{
  const {db,deps}=harness();
  await run(deps,{mappingGen:2});
  const r=await run(deps,{issuerIds:[ISSUER],mappingGen:1});
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'mapping_gen_regression'});
  expect(r.counts).toMatchObject({fetched:2,inserted:0,versioned:0,duplicates:0,quarantined:0,failed:2});balanced(r.counts);   // nothing committed, failure counted once
  expect(r.status).toBe('failed');
  expect(db.runs().map(x=>x.status)).toEqual(['published','abandoned']);
  expect((await db.filingsOfIssuer(ISSUER,'US',{}))[0].mapping_gen).toBe(2);
 });
 it('records stale_computation from materialize without un-publishing the run',async()=>{
  const {db,deps}=harness();
  mocks.materialize.mockRejectedValueOnce(new FactsDbError('stale_computation'));
  const r=await run(deps);
  expect(r.issuers[0].outcome).toBe('published');
  expect(r.errors).toEqual([{code:'stale_computation',key:ISSUER,message:'stale_computation'}]);
  expect(r.status).toBe('partial');
  expect((await current(db)).rows).toHaveLength(2);
  // the lease is released as failed: the issuer retries on the failure schedule (round-3 #5)
  expect((await db.scopeDue('US','9999-12-31T00:00:00.000Z',10))[0]).toMatchObject({last_status:'failed',lease_batch_id:null,next_due_at:'2027-03-02T08:00:00.000Z'});
  mocks.materialize.mockRejectedValueOnce(new FactsDbError('read_truncated'));
  const r2=await run(deps,{issuerIds:[ISSUER]});
  expect(r2.issuers[0].outcome).toBe('published');
  expect(r2.errors).toEqual([{code:'read_truncated',key:ISSUER,message:'read_truncated'}]);
  expect((await db.scopeDue('US','9999-12-31T00:00:00.000Z',10))[0]).toMatchObject({last_status:'failed'});
 });
 it('skips the remaining issuers after quota_exhausted (CN)',async()=>{
  const {deps}=harness(parsed([],[]),{fetchCn:async()=>{throw new SyncError('quota_exhausted');}},[{issuer_id:ISSUER,fetch_key:'600519.SH',market:'CN'},{issuer_id:ISSUER2,fetch_key:'000333.SZ',market:'CN'}]);
  const r=await run(deps,{market:'CN'});
  expect(r.issuers.map(i=>[i.outcome,i.code])).toEqual([['failed','quota_exhausted']]);
  expect(r.errors).toEqual([{code:'quota_exhausted',key:ISSUER},{code:'skipped_summary',key:ISSUER2,message:'{"quota_exhausted":1}'}]);
  expect(r.status).toBe('failed');
 });
 it('does not start an issuer with less than 90 s left and reports deadline_hit as information',async()=>{
  const {tables,deps}=harness(FY23,{deadline:new Date(NOW.getTime()+60_000)});
  const r=await run(deps);
  expect(r.issuers).toEqual([]);
  expect(r.errors).toEqual([{code:'deadline_hit',message:'{"not_started":1}'}]);
  expect(r.status).toBe('success');
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:1});   // nothing published, not idle
 });
 it('abandons an in-flight run when the budget aborts mid-fetch',async()=>{
  const {db,deps}=harness(FY23,{deadline:new Date(NOW.getTime()+120_000)});
  deps.fetchUs=async(_cik,b)=>{const c=new AbortController();c.abort();Object.defineProperty(b,'signal',{value:c.signal});const e=new Error('aborted');e.name='AbortError';throw e;};
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'deadline_hit'});
  expect(db.runs()[0].status).toBe('abandoned');
  expect(r.counts.failed).toBe(0);
 });
 it('closes the batch as failed when infrastructure fails outside an issuer',async()=>{
  const {tables,deps}=harness();
  mocks.reconcileScope.mockRejectedValueOnce(new Error('db down'));
  await expect(run(deps)).rejects.toThrow('db down');
  expect(tables.rows('ingest_batches')[0]).toMatchObject({status:'failed',errors:[{code:'unknown',message:'db down'}]});
 });
});

describe('runFactsSync — round-1 audit cases',()=>{
 it('an input whose rows all lack an available date publishes an empty run AND parks every row as missing_available_date (#9)',async()=>{
  const {tables,db,deps}=harness(parsed([],[],{missingAvailableDate:[{accn:'0000320193-23-000106',tag:'us-gaap:Revenues',end:'2023-09-30'},{accn:'0000320193-23-000106',tag:'us-gaap:Assets',end:'2023-09-30'}]}));
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'published',code:'no_rows'});
  expect(r.counts).toMatchObject({fetched:2,inserted:0,quarantined:2,failed:0});
  expect(tables.rows('dq_quarantine').map(i=>[i.reason_code,i.natural_key]).sort()).toEqual([
   ['missing_available_date',`${ISSUER}:0000320193:0000320193-23-000106:us-gaap:Assets::2023-09-30:`],
   ['missing_available_date',`${ISSUER}:0000320193:0000320193-23-000106:us-gaap:Revenues::2023-09-30:`],
  ]);
  expect(db.runs()[0]).toMatchObject({status:'published',manifest:[]});
  expect(r.status).toBe('success');
 });
 it('a failure after publication keeps the run published, records the original error, releases the lease as failed and never calls abandonRun (#11)',async()=>{
  const {db,deps}=harness();
  mocks.materialize.mockRejectedValueOnce(new Error('metrics table missing'));
  const abandonSpy=vi.spyOn(db,'abandonRun');
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'published'});
  expect(r.errors).toEqual([{code:'unknown',key:ISSUER,message:'metrics table missing'}]);
  expect(r.status).toBe('partial');expect(r.counts.failed).toBe(0);
  expect(abandonSpy).not.toHaveBeenCalled();
  expect(db.runs()[0].status).toBe('published');
  expect((await current(db)).rows).toHaveLength(2);
  expect((await db.scopeDue('US','9999-12-31T00:00:00.000Z',10))[0]).toMatchObject({last_status:'failed',lease_batch_id:null,next_due_at:'2027-03-02T08:00:00.000Z'});
 });
 it('parser skip counters become one skipped_summary(parser) and CN coverage one compact coverage_summary per issuer (#12)',async()=>{
  const cn=parsed([cnFiling()],[cnRevenue()],{skipped:[{reason:'is_calc',n:1},{reason:'null:bonds_payable',n:3}]});
  const coverage:CoverageEntry[]=[{api:'income',report_type:1,years:{'2023':1}},{api:'cashflow',report_type:1,years:{'2022':4,'2023':4}}];   // annotated: inference would widen the two `years` shapes to optional keys (TS2322, round-2 N1)
  const {deps}=harness(cn,{coverageCn:()=>coverage},CN_SCOPE);
  const r=await run(deps,{market:'CN'});
  expect(r.status).toBe('success');
  expect(r.errors).toEqual([
   {code:'skipped_summary',key:`${ISSUER}:parser`,message:JSON.stringify({'null:bonds_payable':3,is_calc:1})},
   {code:'coverage_summary',key:ISSUER,message:JSON.stringify({'income:rt1':'2023-2023:1','cashflow:rt1':'2022-2023:8'})},
  ]);
  expect(r.counts).toMatchObject({inserted:1,quarantined:0});
 });
 it('explicit issuers without a scope row: apply seeds the row (reasons explicit) and publishes; dry-run plans on a constructed row and writes nothing; an unresolvable issuer fails with scope_unresolved (#13)',async()=>{
  const {tables,db,deps}=harness(FY23,{},[{issuer_id:ISSUER,fetch_key:'0000320193'}]);   // known to scopeRowFor, never reconciled
  const dry=await run(deps,{dryRun:true,issuerIds:[ISSUER,ISSUER2]});
  expect(dry.issuers.map(i=>[i.issuerId,i.outcome,i.code??null])).toEqual([[ISSUER,'planned',null],[ISSUER2,'failed','scope_unresolved']]);
  expect(dry.detail).toEqual({attempted:2,published:0,failed:1,skipped:0,idle:false});
  expect(db.scope()).toEqual([]);                                                        // the dry run constructed the row, never wrote it
  const r=await run(deps,{issuerIds:[ISSUER,ISSUER2]});
  expect(r.issuers.map(i=>[i.issuerId,i.outcome,i.code??null])).toEqual([[ISSUER,'published',null],[ISSUER2,'failed','scope_unresolved']]);
  expect(r.errors).toEqual([{code:'scope_unresolved',key:ISSUER2}]);
  expect(r.status).toBe('partial');expect(r.detail).toEqual({attempted:2,published:1,failed:1,skipped:0,idle:false});
  expect(db.scope()).toEqual([expect.objectContaining({issuer_id:ISSUER,reasons:['explicit'],priority:10,fetch_key:'0000320193',last_status:'success',lease_batch_id:null})]);
  expect(mocks.reconcileScope).not.toHaveBeenCalled();                                   // explicit issuers never reconcile the whole market
  expect(mocks.scopeRowFor).toHaveBeenCalledWith(tables,'US',ISSUER2,{today:'2027-03-01'});
  expect((await current(db)).rows).toHaveLength(2);
  const both=await run(deps,{dryRun:true,issuerIds:[ISSUER,ISSUER2],limit:1});            // limit never drops a requested issuer (round-2 #13)
  expect(both.issuers.map(i=>i.issuerId)).toEqual([ISSUER,ISSUER2]);
 });
 it('a thrown cninfo request still counts as a persisted link attempt, capped at MAX_LINK_ATTEMPTS; a request cut by the budget counts too; a budget too low BEFORE the request counts nothing (#21)',async()=>{
  const linkCn=vi.fn(async()=>{throw new Error('cninfo 500');});
  const {db,deps}=harness(parsed([cnFiling()],[cnRevenue()]),{linkCn},CN_SCOPE);
  const r=await run(deps,{market:'CN'});
  expect(r.issuers[0].errors).toContainEqual({code:'skipped_summary',key:`${ISSUER}:cninfo_link`,message:'{"link_failed":1}'});
  expect((await db.filingsOfIssuer(ISSUER,'CN',{}))[0]).toMatchObject({document_ref:null,link_attempts:1});
  for(let i=0;i<6;i++)await run(deps,{market:'CN',issuerIds:[ISSUER]});
  expect((await db.filingsOfIssuer(ISSUER,'CN',{}))[0].link_attempts).toBe(MAX_LINK_ATTEMPTS);
  expect(linkCn).toHaveBeenCalledTimes(MAX_LINK_ATTEMPTS);
  // started, then cut by the budget mid-request: still one persisted attempt (round-2 #21)
  const cut=vi.fn(async(_f:unknown,b:{signal:AbortSignal})=>{const c=new AbortController();c.abort();Object.defineProperty(b,'signal',{value:c.signal});throw new Error('aborted');});
  const second=harness(parsed([cnFiling()],[cnRevenue()]),{linkCn:cut as unknown as SyncDeps['linkCn']},CN_SCOPE);
  const r2=await run(second.deps,{market:'CN'});
  expect(r2.issuers[0].outcome).toBe('published');
  expect(r2.issuers[0].errors).toContainEqual({code:'skipped_summary',key:`${ISSUER}:cninfo_link`,message:'{"link_failed":1}'});
  expect((await second.db.filingsOfIssuer(ISSUER,'CN',{}))[0].link_attempts).toBe(1);
  // budget already below MIN_ISSUER_MS/3 when linking starts (the clock advances during the fetch): no request, nothing persisted
  let t=NOW.getTime();const never=vi.fn();
  const third=harness(parsed([cnFiling()],[cnRevenue()]),{linkCn:never,now:()=>new Date(t),deadline:new Date(NOW.getTime()+100_000),fetchCn:async()=>{t+=80_000;return [snap('{"code":0}')];}},CN_SCOPE);
  const r3=await run(third.deps,{market:'CN'});
  expect(r3.issuers[0].outcome).toBe('published');
  expect(never).not.toHaveBeenCalled();
  expect((await third.db.filingsOfIssuer(ISSUER,'CN',{}))[0].link_attempts).toBe(0);
 });
});

describe('runFactsSync — dry run and code version',()=>{
 it('plans without writing anything in dryRun',async()=>{
  const {tables,db,deps}=harness();
  await mocks.reconcileScope(deps,'US');
  const r=await run(deps,{dryRun:true});
  expect(r).toMatchObject({batchId:null,status:'dry_run',counts:{fetched:2,inserted:2},detail:{attempted:1,published:0,failed:0,skipped:0,idle:false}});
  expect(r.issuers[0]).toMatchObject({issuerId:ISSUER,fetchKey:'0000320193',outcome:'planned',runId:null});
  expect(r.issuers[0].snapshotSha256).toEqual([snap('{"facts":{}}').sha256]);
  expect(tables.rows('ingest_batches')).toEqual([]);
  expect(db.runs()).toEqual([]);
  expect((await current(db)).rows).toEqual([]);
 });
 it('refuses to apply without a code version, but allows a dry run',async()=>{
  const {deps}=harness(FY23,{codeVersion:null});
  await expect(run(deps)).rejects.toThrow('code_version_unavailable');
  await expect(run(deps,{dryRun:true})).resolves.toBeDefined();
 });
 it('resolves the code version from VERCEL_GIT_COMMIT_SHA, else git HEAD with -dirty',()=>{
  const sha='b'.repeat(40);
  expect(resolveCodeVersion({VERCEL_GIT_COMMIT_SHA:sha},()=>{throw new Error('no git');})).toBe(sha);
  const clean=(cmd:string,args:string[])=>args[0]==='rev-parse'?`${sha}\n`:'';
  expect(resolveCodeVersion({},clean)).toBe(sha);
  const dirty=(cmd:string,args:string[])=>args[0]==='rev-parse'?`${sha}\n`:' M src/x.ts\n';
  expect(resolveCodeVersion({},dirty)).toBe(`${sha}-dirty`);
  expect(resolveCodeVersion({VERCEL_GIT_COMMIT_SHA:'short'},()=>{throw new Error('no git');})).toBeNull();
  expect(resolveCodeVersion(process.env)).toMatch(/^[0-9a-f]{40}(-dirty)?$/);
 });
 it('makeBudget: no deadline is unlimited, a past deadline has no time and aborts',async()=>{
  const open=makeBudget(null);
  expect(open.remainingMs()).toBe(Number.POSITIVE_INFINITY);expect(open.signal.aborted).toBe(false);
  const past=makeBudget(new Date(NOW.getTime()-1),()=>NOW);
  expect(past.remainingMs()).toBe(0);
  await new Promise(r=>setTimeout(r,5));
  expect(past.signal.aborted).toBe(true);
  expect(makeBudget(new Date(NOW.getTime()+5000),()=>NOW).remainingMs()).toBe(5000);
 });
});

describe('runFactsSync — round-3 review cases',()=>{
 const ABORTED=()=>{const c=new AbortController();c.abort();return c.signal;};
 it('publishes with the state_rev of its planning read; a rev that moved afterwards is stale_plan: abandoned, failed, nothing counted, retried on the failure schedule (#1)',async()=>{
  const {db,deps}=harness();
  const spy=vi.spyOn(db,'publishRun');
  await run(deps);
  expect(spy).toHaveBeenLastCalledWith(expect.any(String),expect.any(Array),0);
  const real=db.readFacts.bind(db);
  db.readFacts=async(...a)=>{const r=await real(...a);return {...r,stateRev:r.stateRev-1};};   // as if a promotion landed after this read
  deps.parseUs=()=>parsed([filing('acc-2','2024-11-01')],[cand('acc-2','revenue','383285000001')]);
  const r=await run(deps,{issuerIds:[ISSUER]});
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'stale_plan'});
  expect(r.errors).toEqual([{code:'stale_plan',key:ISSUER}]);
  expect(r.counts).toMatchObject({inserted:0,versioned:0,failed:1});balanced(r.counts);
  expect(db.runs().map(x=>x.status)).toEqual(['published','abandoned']);
  expect((await db.scopeDue('US','9999-12-31T00:00:00.000Z',10))[0]).toMatchObject({last_status:'failed',lease_batch_id:null,next_due_at:'2027-03-01T08:10:00.000Z'});   // stale plan retries in 10 minutes, not a day (round-4 #7)
  expect((await current(db)).rows.map(f=>f.value)).toEqual(['96995000000','383285000000']);
 });
 it('missing_available_date rows of one accession park distinctly per period and unit (#2)',async()=>{
  const {tables,deps}=harness(parsed([],[],{missingAvailableDate:[
   {accn:'0000320193-23-000106',tag:'us-gaap:Revenues',start:'2022-10-01',end:'2023-09-30',unit:'USD'},
   {accn:'0000320193-23-000106',tag:'us-gaap:Revenues',start:'2021-10-01',end:'2022-09-30',unit:'USD'},
   {accn:'0000320193-23-000106',tag:'us-gaap:Revenues',start:'2021-10-01',end:'2022-09-30',unit:'EUR'}]}));
  const r=await run(deps);
  expect(tables.rows('dq_quarantine')).toHaveLength(3);
  expect(new Set(tables.rows('dq_quarantine').map(i=>i.natural_key)).size).toBe(3);
  expect(r.counts.quarantined).toBe(3);
 });
 it('stops between phases when the budget is spent: with time left the run is abandoned, without it the staged run is left for the next beginRun; deadline_hit is information (#3)',async()=>{
  let t=NOW.getTime();
  // The budget is driven through remainingMs (the injected clock), not the AbortSignal, so the spent case below is time-based.
  const odd=cand('acc-1','revenue','1',{periodStart:'2023-08-01',duration:'3M'});
  const spent=harness(parsed([filing('acc-1','2023-11-03')],[cand('acc-1','revenue','100')],{oddDuration:[odd]}),{now:()=>new Date(t),deadline:new Date(NOW.getTime()+120_000),fetchUs:async()=>{t+=121_000;return snap('{"facts":{}}');}});
  const r=await run(spent.deps);
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'deadline_hit'});
  expect(r.errors).toEqual([{code:'deadline_hit',key:ISSUER}]);
  expect(spent.db.runs().map(x=>x.status)).toEqual(['staged']);
  expect(spent.db.filings()).toEqual([]);expect(r.counts.failed).toBe(0);expect(r.status).toBe('success');
  expect(r.counts).toMatchObject({fetched:1,quarantined:1});balanced(r.counts);       // the odd_duration item survives and stays counted
  expect((await spent.db.scopeRows('US',[ISSUER]))[0].lease_batch_id).not.toBeNull();   // no time to clean up: the lease is left to expire
  const cut=harness(FY23,{deadline:new Date(NOW.getTime()+120_000),fetchUs:async(_c,b)=>{Object.defineProperty(b,'signal',{value:ABORTED()});return snap('{"facts":{}}');}});
  const r2=await run(cut.deps);
  expect(r2.issuers[0]).toMatchObject({outcome:'failed',code:'deadline_hit'});
  expect(cut.db.runs().map(x=>x.status)).toEqual(['abandoned']);
  expect(cut.db.facts()).toEqual([]);
 });
 it('a genuine error after the abort signal fired is a failure, not deadline_hit (#3)',async()=>{
  const {db,deps}=harness(FY23,{deadline:new Date(NOW.getTime()+120_000),fetchUs:async(_c,b)=>{Object.defineProperty(b,'signal',{value:ABORTED()});throw new Error('boom');}});
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'unknown'});
  expect(r.errors).toEqual([{code:'unknown',key:ISSUER,message:'boom'}]);
  expect(r.counts.failed).toBe(1);expect(r.status).toBe('failed');
  expect(db.runs().map(x=>x.status)).toEqual(['abandoned']);
 });
 it('the dry run refuses a truncated read instead of planning against nothing (#6)',async()=>{
  const {db,deps}=harness();
  await mocks.reconcileScope(deps,'US');
  const real=db.readFacts.bind(db);db.readFacts=async(...a)=>({...(await real(...a)),truncated:true});
  const r=await run(deps,{dryRun:true});
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'read_truncated'});
  expect(r.detail.failed).toBe(1);
 });
 it('parse_error carries the error kind and field name but never the value (#7)',async()=>{
  const {deps}=harness();
  deps.parseUs=()=>{throw new Error('invalid_control_field:update_flag');};
  expect((await run(deps)).errors).toEqual([{code:'parse_error',key:ISSUER,message:'invalid_control_field: update_flag'}]);
  deps.parseUs=()=>{throw new Error('invalid_decimal:98765432109876543210');};
  const r=await run(deps,{issuerIds:[ISSUER]});
  expect(r.errors[0].message).toBe('invalid_decimal');
  deps.parseUs=()=>{throw new Error('json: invalid_json_number:12.5e+400');};
  expect((await run(deps,{issuerIds:[ISSUER]})).errors[0].message).toBe('json: invalid_json_number');
 });
 it('refuses a snapshot whose bytes do not match its hash and candidates without a derived raw_hash (#8)',async()=>{
  const bad:RawSnapshot={...snap('{"a":1}'),sha256:'f'.repeat(64)};
  const {db,deps}=harness(FY23,{fetchUs:async()=>bad});
  expect((await run(deps)).issuers[0]).toMatchObject({outcome:'failed',code:'snapshot_hash_mismatch'});
  expect(db.facts()).toEqual([]);
  const h2=harness(parsed([filing('acc-1','2023-11-03')],[cand('acc-1','revenue','1',{rawHash:'h'})]));
  const r=await run(h2.deps);
  expect(r.errors).toEqual([{code:'parse_error',key:ISSUER,message:'raw_hash_invalid'}]);
 });
 it('renews the lease before a phase when it would lapse within two minutes (#9)',async()=>{
  let t=NOW.getTime();
  const {db,deps}=harness(FY23,{now:()=>new Date(t),fetchUs:async()=>{t+=500_000;return snap('{"facts":{}}');}});
  const claim=vi.spyOn(db,'claimLease');
  const r=await run(deps);
  expect(r.issuers[0].outcome).toBe('published');
  expect(claim.mock.calls.length).toBeGreaterThanOrEqual(2);        // the claim and at least one renewal with the same batch
  expect(claim.mock.calls[1].slice(0,3)).toEqual(claim.mock.calls[0].slice(0,3));
  const quiet=harness();const q=vi.spyOn(quiet.db,'claimLease');
  await run(quiet.deps);
  expect(q).toHaveBeenCalledTimes(1);                                // a fresh lease is never renewed
 });
});

describe('runFactsSync — round-4 review cases',()=>{
 const ABORTED=()=>{const c=new AbortController();c.abort();return c.signal;};
 it('never persists parser content in a parse_error message: native JSON errors fall back to fixed text (#1)',async()=>{
  const {tables,deps}=harness();
  deps.parseUs=():ParseResult=>{JSON.parse('PRIVATE_VALUE');return FY23;};
  const r1=await run(deps);
  expect(r1.errors).toEqual([{code:'parse_error',key:ISSUER,message:'parse_error'}]);
  deps.parseUs=():ParseResult=>{try{JSON.parse('PRIVATE_VALUE');}catch(e){throw new Error(`json: ${(e as Error).message}`);}return FY23;};
  const r2=await run(deps,{issuerIds:[ISSUER]});
  expect(r2.errors[0].message).toBe('json');
  deps.parseUs=()=>{throw new Error('invalid_control_field:PRIVATE_VALUE');};
  const r3=await run(deps,{issuerIds:[ISSUER]});
  expect(r3.errors[0].message).toBe('invalid_control_field');
  expect(JSON.stringify([r1,r2,r3,tables.rows('ingest_batches')])).not.toContain('PRIVATE_VALUE');
 });
 it('cleanup never throws: a failing release is recorded as cleanup_failed beside the original code, called once, and the next issuer still runs (#2)',async()=>{
  const {db,deps}=harness(FY23,{},[{issuer_id:ISSUER,fetch_key:'0000320193'},{issuer_id:ISSUER2,fetch_key:'0000789019'}]);
  let n=0;deps.parseUs=()=>{if(n++===0)throw new Error('invalid_decimal:1');return FY23;};
  const release=vi.spyOn(db,'releaseLease');
  release.mockImplementationOnce(async()=>{throw new Error('net');});
  const r=await run(deps);
  const first=r.issuers.find(i=>i.issuerId===ISSUER)!;const second=r.issuers.find(i=>i.issuerId===ISSUER2)!;
  expect(first).toMatchObject({outcome:'failed',code:'parse_error'});
  expect(first.errors).toEqual([{code:'cleanup_failed',key:ISSUER,message:'release: net'},{code:'parse_error',key:ISSUER,message:'invalid_decimal'}]);
  expect(second.outcome).toBe('published');
  expect(release.mock.calls.filter(c=>c[0]===ISSUER)).toHaveLength(1);
  expect(r.status).toBe('partial');
 });
 it('a per-request timeout with budget left is a genuine failure; a spent budget makes the same error a deadline (#3)',async()=>{
  const timeout=()=>{const e=new Error('request timed out');e.name='TimeoutError';return e;};
  const live=harness(FY23,{deadline:new Date(NOW.getTime()+600_000),fetchUs:async()=>{throw timeout();}});
  expect((await run(live.deps)).issuers[0]).toMatchObject({outcome:'failed',code:'unknown'});
  let t=NOW.getTime();
  const spent=harness(FY23,{now:()=>new Date(t),deadline:new Date(NOW.getTime()+120_000),fetchUs:async()=>{t+=118_000;throw timeout();}});   // 2 s left < CLEANUP_MIN_MS
  expect((await run(spent.deps)).issuers[0]).toMatchObject({outcome:'failed',code:'deadline_hit'});
 });
 it('a refused lease renewal is lease_lost: the issuer stops, nothing is abandoned (#9)',async()=>{
  let t=NOW.getTime();
  const {db,deps}=harness(FY23,{now:()=>new Date(t),fetchUs:async()=>{t+=500_000;return snap('{"facts":{}}');}});
  const real=db.claimLease.bind(db);let calls=0;
  vi.spyOn(db,'claimLease').mockImplementation(async(...a)=>calls++===0?real(...a):false);
  const abandon=vi.spyOn(db,'abandonRun');
  const r=await run(deps);
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'lease_lost'});
  expect(abandon).not.toHaveBeenCalled();
 });
 it('lease_lost after publication keeps the issuer published and records lease_lost; run_abandoned counts as lease loss before it (#6, #9)',async()=>{
  const {db,deps}=harness();
  mocks.materialize.mockRejectedValueOnce(new FactsDbError('lease_lost'));
  const r=await run(deps);
  expect(r.issuers[0].outcome).toBe('published');
  expect(r.errors).toEqual([{code:'lease_lost',key:ISSUER}]);
  const h=harness();const abandon=vi.spyOn(h.db,'abandonRun');
  h.db.stageFacts=async()=>{throw new FactsDbError('run_abandoned');};
  expect((await run(h.deps)).issuers[0]).toMatchObject({outcome:'failed',code:'lease_lost'});
  expect(abandon).not.toHaveBeenCalled();
  expect(db.runs()[0].status).toBe('published');
 });
 it('renews the lease before every cninfo request and before materialize (#5)',async()=>{
  let t=NOW.getTime();
  const REF2='600519.SH:20221231:1:20230403';
  const two=parsed([cnFiling(),filing(REF2,'2023-04-03',{market:'CN',source:'tushare',origin:'sse',formType:'annual',periodEnd:'2022-12-31'})],[cnRevenue(),cand(REF2,'revenue','90',{periodStart:'2022-01-01',periodEnd:'2022-12-31',unit:'CNY'})]);
  let claims=0;const seen:number[]=[];
  const linkCn=vi.fn(async()=>{seen.push(claims);t+=500_000;return 'none' as const;});
  const {db,deps}=harness(two,{now:()=>new Date(t),linkCn},CN_SCOPE);
  const real=db.claimLease.bind(db);vi.spyOn(db,'claimLease').mockImplementation(async(...a)=>{claims++;return real(...a);});
  const r=await run(deps,{market:'CN'});
  expect(r.issuers[0].outcome).toBe('published');
  expect(seen).toHaveLength(2);expect(seen[1]).toBeGreaterThan(seen[0]);   // the second request was preceded by a renewal
  expect(claims).toBeGreaterThan(seen[1]);                              // and materialize by another
 });
});

describe('runFactsSync — grouped parser evidence',()=>{
 it('parks rows sharing a natural key as ONE odd_duration item holding every row, counts per row (round-5)',async()=>{
  const odd=(loc:string)=>({...cand('acc-1','revenue','1',{periodStart:'2023-08-01',duration:'3M',rawHash:loc.repeat(64)}),locator:`loc-${loc}`});
  const {tables,deps}=harness(parsed([filing('acc-1','2023-11-03')],[cand('acc-1','revenue','100')],{oddDuration:[odd('b'),odd('c')]}));
  const r=await run(deps);
  const items=tables.rows('dq_quarantine').filter(i=>i.reason_code==='odd_duration');
  expect(items).toHaveLength(1);
  const payload=items[0].payload as {candidate:{locator:string};rows:{locator:string;rawHash:string}[]};
  expect(payload.rows.map(x=>x.locator)).toEqual(['loc-b','loc-c']);
  expect(payload.rows.map(x=>x.rawHash)).toEqual(['b'.repeat(64),'c'.repeat(64)]);
  expect(payload.candidate.locator).toBe('loc-b');
  expect(r.counts).toMatchObject({fetched:3,inserted:1,quarantined:2,failed:0});balanced(r.counts);
 });
 it('parks undated rows sharing a natural key as ONE missing_available_date item holding every row (round-5)',async()=>{
  const row=(loc:string)=>({accn:'0000320193-23-000106',tag:'us-gaap:Revenues',start:'2022-10-01',end:'2023-09-30',unit:'USD',locator:loc});
  const {tables,deps}=harness(parsed([],[],{missingAvailableDate:[row('l1'),row('l2'),{...row('l3'),end:'2022-09-30'}]}));
  const r=await run(deps);
  const items=tables.rows('dq_quarantine');
  expect(items).toHaveLength(2);
  const shared=items.find(i=>(i.payload as {rows:unknown[]}).rows.length===2)!;
  expect((shared.payload as {rows:{locator:string}[]}).rows.map(x=>x.locator)).toEqual(['l1','l2']);
  expect((shared.payload as {row:{locator:string}}).row.locator).toBe('l1');
  expect(r.counts).toMatchObject({fetched:3,quarantined:3,failed:0});balanced(r.counts);
 });
 it("an 'unlinkable' answer (no usable A-share listing) consumes no link attempt, persists nothing and is summarised",async()=>{
  const linkCn=vi.fn(async()=>'unlinkable' as const);
  const {db,deps}=harness(parsed([cnFiling()],[cnRevenue()]),{linkCn},CN_SCOPE);
  const r=await run(deps,{market:'CN'});
  expect(r.issuers[0].outcome).toBe('published');
  expect(r.issuers[0].errors).toContainEqual({code:'skipped_summary',key:`${ISSUER}:cninfo_unlinkable`,message:'{"unlinkable":1}'});
  expect((await db.filingsOfIssuer(ISSUER,'CN',{}))[0]).toMatchObject({document_ref:null,link_attempts:0});
  for(let i=0;i<7;i++)await run(deps,{market:'CN',issuerIds:[ISSUER]});
  expect((await db.filingsOfIssuer(ISSUER,'CN',{}))[0].link_attempts).toBe(0);          // never reaches MAX_LINK_ATTEMPTS
 });
});
