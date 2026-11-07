// src/lib/industry/load-a-share.test.ts
import {describe,it,expect,vi} from 'vitest';
import {TableError} from '../db/table-client';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {applyAShareLoad,planAShareLoad,runLoadAShare} from './load-a-share';
import {memoryIndustryDb} from './memory-industry-db';
import {memorySnapshotStore} from '../facts/snapshot-store';
import {IndustryProviderError,fixtureTushareCall} from './providers/tushare-industry';
import type {TushareCall} from './providers/tushare-industry';
import type {StockBasicRow} from './providers/tushare-industry';
import type {IndustryDeps,ManifestStore} from './types';

const TODAY='2026-11-06';
const NOW=`${TODAY}T22:30:00.000Z`;
const BATCH='33333333-3333-4333-8333-333333333333';
const UNIVERSE=new Set(['600519.SH','000858.SZ','000895.SZ','600584.SH','002463.SZ','600183.SH']);
const ORG:Record<string,string>={'600519':'gssz0600519','000858':'gssz0000858','000895':'gssz0000895','600584':'gssh0600584','002463':'gssz0002463','600183':'gssh0600183'};
const lookup=vi.fn(async(symbol:string)=>ORG[symbol]?{orgId:ORG[symbol],name:symbol,category:'A股'}:null);
const noSleep=async()=>{};
const tablesFor=()=>memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],issuer_identifier_claims:['id'],ingest_batches:['batch_id'],dq_freshness:['dataset']});
const sb=(over:Partial<StockBasicRow>):StockBasicRow=>({ts_code:'600519.SH',symbol:'600519',name:'贵州茅台',fullname:'贵州茅台酒股份有限公司',exchange:'SSE',list_status:'L',list_date:'20010827',delist_date:null,...over});
const unusedManifests:ManifestStore={put:async()=>{throw new Error('unused');},get:async()=>{throw new Error('unused');},remove:async()=>{throw new Error('unused');}};
const opts=(over={})=>({batchId:BATCH,observedAt:NOW,lookupOrgId:lookup,sleep:noSleep,...over});

describe('planAShareLoad',()=>{
 it('keeps universe A shares; skips delisted, B shares, repeats and non-universe rows; rejects bad codes, dates and names',()=>{
  const plan=planAShareLoad([
   sb({}),sb({ts_code:'600519.SH'}),
   sb({ts_code:'600087.SH',symbol:'600087',list_status:'D',delist_date:'20231020'}),
   sb({ts_code:'900901.SH',symbol:'900901'}),
   sb({ts_code:'601318.SH',symbol:'601318'}),
   sb({ts_code:'AAPL',symbol:'AAPL'}),
   sb({ts_code:'000858.SZ',symbol:'000858',list_date:'20230230'}),
   sb({ts_code:'000895.SZ',symbol:'000895',fullname:null,name:' '}),
   sb({ts_code:'600584.SH',symbol:null,fullname:null,name:'长电科技',list_date:null}),
  ],new Set([...UNIVERSE,'900901.SH']),TODAY);
  expect(plan.fetched).toBe(9);
  expect(plan.candidates).toEqual([
   {ts_code:'600519.SH',symbol:'600519',name_zh:'贵州茅台酒股份有限公司',list_date:'2001-08-27',exchange:'SSE',list_status:'L'},
   {ts_code:'600584.SH',symbol:'600584',name_zh:'长电科技',list_date:null,exchange:'SSE',list_status:'L'},
  ]);
  expect(plan.skipped).toEqual(['repeated_row:600519.SH','delisted:600087.SH','b_share:900901.SH','not_in_universe:601318.SH']);
  expect(plan.rejected).toEqual(['rejected_ts_code:AAPL','rejected_list_date:000858.SZ','rejected_name:000895.SZ']);
 });
});

describe('applyAShareLoad',()=>{
 it('(c) creates an issuer keyed by orgId and attaches the A share; a rerun takes the fast path without lookups',async()=>{
  const t=tablesFor();lookup.mockClear();
  const plan=planAShareLoad([sb({})],UNIVERSE,TODAY);
  const first=await applyAShareLoad(t,plan,opts());
  expect(first.counts).toEqual({fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0});
  expect(first.issuers).toEqual({created:1,backfilled:0});
  const [issuer]=t.rows('issuers');
  expect(issuer).toMatchObject({canonical_name_zh:'贵州茅台酒股份有限公司',cninfo_org_id:'gssz0600519',status:'active',lei:null,cik:null,usci:null,
   provenance:{cninfo_org_id:{source:'cninfo:topSearch',observed_at:NOW},canonical_name_zh:{source:'tushare:stock_basic',observed_at:NOW}}});
  expect(t.rows('issuer_securities')).toEqual([{issuer_id:issuer.issuer_id,ticker:'600519.SH',isin:null,figi:null,share_class:'A',is_primary:true,valid_from:'2001-08-27',valid_to:null,valid_from_method:'listing_date',valid_to_method:null,source:'tushare:stock_basic',
   // plan 3: public provenance whitelist → the stock_basic listing evidence is the single valid_from key
   provenance:{valid_from:{source:'tushare:stock_basic',as_of:TODAY,observed_at:NOW,row:{ts_code:'600519.SH',list_date:'2001-08-27',exchange:'SSE',list_status:'L'}}}}]);
  const second=await applyAShareLoad(t,plan,opts());
  expect(second.counts).toMatchObject({inserted:0,duplicates:1});
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(t.rows('issuers')).toHaveLength(1);
 });
 it('(a) matches an existing issuer by orgId; a list_date-less row uses the observed date',async()=>{
  const t=tablesFor();
  await t.insert('issuers',{issuer_id:'i-1',canonical_name_zh:'长电',cninfo_org_id:'gssh0600584',status:'active',provenance:{}});
  const res=await applyAShareLoad(t,planAShareLoad([sb({ts_code:'600584.SH',symbol:'600584',list_date:null})],UNIVERSE,TODAY),opts());
  expect(res.counts.inserted).toBe(1);expect(res.issuers).toEqual({created:0,backfilled:0});
  expect(t.rows('issuer_securities')[0]).toMatchObject({issuer_id:'i-1',ticker:'600584.SH',valid_from:TODAY,valid_from_method:'first_observed'});
 });
 it('(b) backfills a null orgId on the current owner of the ticker, with provenance',async()=>{
  const t=tablesFor();
  await t.insert('issuers',{issuer_id:'i-2',canonical_name_zh:'五粮液',cninfo_org_id:null,status:'active',provenance:{canonical_name_zh:{source:'x'}},updated_at:'2026-01-01T00:00:00.000Z'});
  await t.insert('issuer_securities',{issuer_id:'i-2',ticker:'000858.SZ',isin:null,share_class:'A',is_primary:true,valid_from:'1998-04-27',valid_to:null,source:'seed',provenance:{}});
  const res=await applyAShareLoad(t,planAShareLoad([sb({ts_code:'000858.SZ',symbol:'000858',list_date:'19980427'})],UNIVERSE,TODAY),opts());
  expect(res.issuers).toEqual({created:0,backfilled:1});
  expect(res.counts).toMatchObject({inserted:0,duplicates:1});
  expect(t.rows('issuers')[0]).toMatchObject({cninfo_org_id:'gssz0000858',provenance:{canonical_name_zh:{source:'x'},cninfo_org_id:{source:'cninfo:topSearch',observed_at:NOW}}});
 });
 it('(b) a different stored orgId is not overwritten: claim on the security owner + skipped org_id_mismatch (recheck run)',async()=>{
  const t=tablesFor();
  await t.insert('issuers',{issuer_id:'i-3',canonical_name_zh:'双汇',cninfo_org_id:'old-org',status:'active',provenance:{}});
  await t.insert('issuer_securities',{issuer_id:'i-3',ticker:'000895.SZ',isin:null,share_class:'A',is_primary:true,valid_from:'1998-12-10',valid_to:null,source:'seed',provenance:{}});
  const res=await applyAShareLoad(t,planAShareLoad([sb({ts_code:'000895.SZ',symbol:'000895'})],UNIVERSE,TODAY),opts({recheckOrgIds:true}));
  expect(res.skippedSummary).toEqual({org_id_mismatch:1});
  expect(t.rows('issuers')[0].cninfo_org_id).toBe('old-org');
  expect(t.rows('issuer_identifier_claims').map(c=>[c.issuer_id,c.id_type,c.value,c.source,c.status,c.op])).toEqual([['i-3','cninfo_org_id','gssz0000895','cninfo:topSearch','pending','correct_identifier']]);
  expect(t.rows('issuer_identifier_claims')[0].detail).toMatchObject({schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:'i-3'},params:{expected_current:'old-org',new_value:'gssz0000895'}});
 });
 it('ticker held by another issuer → attachSecurity conflict → claim + skipped claim_pending; a second current A ticker on the orgId issuer → claim_pending',async()=>{
  const t=tablesFor();
  await t.insert('issuers',{issuer_id:'i-4',canonical_name_zh:'沪电',cninfo_org_id:'gssz0002463',status:'active',provenance:{}});
  await t.insert('issuers',{issuer_id:'i-5',canonical_name_zh:'别家',cninfo_org_id:'zzz',status:'active',provenance:{}});
  await t.insert('issuer_securities',{issuer_id:'i-5',ticker:'002463.SZ',isin:null,share_class:'A',is_primary:true,valid_from:'2026-01-01',valid_to:null,source:'seed',provenance:{}});
  const res=await applyAShareLoad(t,planAShareLoad([sb({ts_code:'002463.SZ',symbol:'002463',list_date:'20100818'})],UNIVERSE,TODAY),opts({recheckOrgIds:true}));
  expect(res.skippedSummary).toEqual({claim_pending:1});
  // plan 3 claim/1: the reviewable action is attaching the ticker (id_type ticker), not a cninfo_org_id the issuer already holds
  expect(t.rows('issuer_identifier_claims').map(c=>[c.issuer_id,c.id_type,c.value,c.source,c.op])).toEqual([['i-4','ticker','002463.SZ','tushare:stock_basic','attach_security']]);
  expect(t.rows('issuer_identifier_claims')[0].detail).toMatchObject({target:{issuer_id:'i-4'},params:{share_class:'A',valid_from:'2010-08-18',valid_from_method:'listing_date',source:'tushare:stock_basic'}});
  const t2=tablesFor();
  await t2.insert('issuers',{issuer_id:'i-6',canonical_name_zh:'生益',cninfo_org_id:'gssh0600183',status:'active',provenance:{}});
  await t2.insert('issuer_securities',{issuer_id:'i-6',ticker:'600999.SH',isin:null,share_class:'A',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'seed',provenance:{}});
  const res2=await applyAShareLoad(t2,planAShareLoad([sb({ts_code:'600183.SH',symbol:'600183'})],UNIVERSE,TODAY),opts());
  expect(res2.skippedSummary).toEqual({claim_pending:1});
  expect(t2.rows('issuer_securities').map(r=>r.ticker)).toEqual(['600999.SH']);
  expect(t2.rows('issuer_identifier_claims').map(c=>[c.issuer_id,c.id_type,c.value,c.op])).toEqual([['i-6','ticker','600183.SH','evidence_only']]);
 });
 it('a concurrent creator wins issuers_cninfo_idx (23505): re-read by orgId and attach to the winner',async()=>{
  const t=tablesFor();
  const insert=t.insert.bind(t);let raced=false;
  t.insert=async(table,row)=>{
   if(table==='issuers'&&!raced){
    raced=true;
    await insert('issuers',{issuer_id:'winner',canonical_name_zh:'茅台',cninfo_org_id:row.cninfo_org_id,status:'active',provenance:{}});
    throw new TableError('insert','issuers','duplicate key value violates unique constraint "issuers_cninfo_idx"','23505');
   }
   return insert(table,row);
  };
  const res=await applyAShareLoad(t,planAShareLoad([sb({})],UNIVERSE,TODAY),opts());
  expect(res.counts.inserted).toBe(1);expect(res.issuers.created).toBe(0);
  expect(t.rows('issuers').map(r=>r.issuer_id)).toEqual(['winner']);
  expect(t.rows('issuer_securities')[0].issuer_id).toBe('winner');
 });
 it('no orgId → skipped no_org_id; maxLookups defers the rest; lookups are paced; a thrown error counts as failed',async()=>{
  const t=tablesFor();const sleep=vi.fn(noSleep);
  const plan=planAShareLoad([sb({}),sb({ts_code:'601318.SH',symbol:'601318'}),sb({ts_code:'000858.SZ',symbol:'000858'})],new Set([...UNIVERSE,'601318.SH']),TODAY);
  const res=await applyAShareLoad(t,plan,opts({sleep,maxLookups:2}));
  expect(res.counts).toMatchObject({inserted:1,failed:0});
  expect(res.skippedSummary).toEqual({no_org_id:1,lookup_deferred:1});
  expect(sleep).toHaveBeenCalledTimes(1);expect(sleep).toHaveBeenCalledWith(500);
  const boom=await applyAShareLoad(tablesFor(),planAShareLoad([sb({})],UNIVERSE,TODAY),opts({lookupOrgId:async()=>{throw new Error('cninfo 503');}}));
  expect(boom.counts.failed).toBe(1);expect(boom.errors).toEqual([{code:'a_share_error',key:'600519.SH',message:'cninfo 503'}]);
 });
});

describe('listing-date evidence, delisting and merged owners',()=>{
 const sec=(issuer:string,ticker:string,prov:Record<string,unknown>={})=>({issuer_id:issuer,ticker,isin:null,share_class:'A',is_primary:true,valid_from:'2026-01-05',valid_to:null,source:'seed',provenance:prov});
 // plan 3: issuer_securities.provenance is whitelisted (isin/figi/valid_from/valid_to/pending_change) and an evidenced
 // valid_from is written only by set_security_window (backfill-windows), so existing rows are left untouched here.
 it('fast path: an existing security is a duplicate and is not rewritten (valid_from and provenance untouched)',async()=>{
  const t=tablesFor();
  await t.insert('issuers',{issuer_id:'i-1',canonical_name_zh:'茅台',cninfo_org_id:'gssz0600519',status:'active',provenance:{}});
  await t.insert('issuer_securities',sec('i-1','600519.SH',{keep:1}));
  const plan=planAShareLoad([sb({})],UNIVERSE,TODAY);
  const r=await applyAShareLoad(t,plan,opts());
  expect(r.counts).toMatchObject({duplicates:1,inserted:0});
  const row=t.rows('issuer_securities')[0];
  expect(row.valid_from).toBe('2026-01-05');
  expect(row.provenance).toEqual({keep:1});
  const upd=vi.spyOn(t,'update');
  await applyAShareLoad(t,plan,opts({observedAt:'2026-11-07T22:30:00.000Z'}));
  expect(upd).not.toHaveBeenCalled();
 });
 it('attachSecurity duplicate (recheck path) leaves the existing row untouched',async()=>{
  const t=tablesFor();
  await t.insert('issuers',{issuer_id:'i-1',canonical_name_zh:'茅台',cninfo_org_id:'gssz0600519',status:'active',provenance:{}});
  await t.insert('issuer_securities',sec('i-1','600519.SH'));
  const r=await applyAShareLoad(t,planAShareLoad([sb({})],UNIVERSE,TODAY),opts({recheckOrgIds:true}));
  expect(r.counts).toMatchObject({duplicates:1,inserted:0});
  expect(t.rows('issuer_securities')).toEqual([sec('i-1','600519.SH')]);
 });
 it('a merged owner is not a fast-path duplicate: it goes through the full path and is skipped with a reason',async()=>{
  const t=tablesFor();lookup.mockClear();
  await t.insert('issuers',{issuer_id:'i-m',canonical_name_zh:'旧',cninfo_org_id:'gssz0600519',status:'merged',merged_into:'x',provenance:{}});
  await t.insert('issuer_securities',{...sec('i-m','600519.SH'),valid_to:'2099-01-01'});
  const r=await applyAShareLoad(t,planAShareLoad([sb({})],UNIVERSE,TODAY),opts());
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(r.counts.duplicates).toBe(0);expect(r.skippedSummary).toEqual({issuer_not_active:1});
 });
 it('delisted needs list_status D and a delist_date; a D row without one is rejected, not attached',()=>{
  const plan=planAShareLoad([sb({list_status:'D',delist_date:'20231020'}),sb({ts_code:'000858.SZ',symbol:'000858',list_status:'D',delist_date:null})],UNIVERSE,TODAY);
  expect(plan.skipped).toEqual(['delisted:600519.SH']);expect(plan.rejected).toEqual(['rejected_delist_date:000858.SZ']);expect(plan.candidates).toEqual([]);
 });
});

describe('runLoadAShare (real stock_basic recordings: 10 listed, 2 delisted)',()=>{
 const REAL=['000001.SZ','000858.SZ','000869.SZ','600036.SH','600519.SH','600887.SH','601166.SH','601318.SH','601398.SH','603288.SH'];
 const realLookup=vi.fn(async(symbol:string)=>({orgId:`org${symbol}`,name:symbol,category:'A股'}));
 const depsFor=(t=tablesFor()):IndustryDeps=>({tables:t,db:memoryIndustryDb(),facts:memoryFactsDb(),manifests:unusedManifests,now:()=>new Date(NOW),codeVersion:'test-sha',tushare:fixtureTushareCall()});
 const seedUniverse=async(d:IndustryDeps)=>{for(const tk of [...REAL,'002770.SZ','600090.SH'])await d.tables.insert('security_universe_memberships',{ticker:tk,universe:'a_stock',is_active:true,as_of_date:TODAY,source:'seed'});};
 it('dry run fetches L/P/D and reports the plan without writing',async()=>{
  const d=depsFor();await seedUniverse(d);
  const r=await runLoadAShare(d,{apply:false,sleep:noSleep});
  expect(r).toMatchObject({status:'dry_run',batchId:null,plan:{candidates:10,skipped:{delisted:2},rejected:{}}});
  expect((d.tables as ReturnType<typeof tablesFor>).rows('issuers')).toEqual([]);
 });
 it('apply writes a receipt (producer load-a-share, dataset issuers.a_stock) and a daily freshness attempt',async()=>{
  const t=tablesFor();const d=depsFor(t);await seedUniverse(d);
  const r=await runLoadAShare(d,{apply:true,triggeredBy:'cron',sleep:noSleep,lookupOrgId:realLookup});
  expect(r.status).toBe('success');expect(r.exitCode).toBe(0);
  expect(r.apply!.counts).toEqual({fetched:12,inserted:10,duplicates:0,versioned:0,quarantined:0,failed:0});
  expect(t.rows('issuers')).toHaveLength(10);
  expect(t.rows('issuer_securities').find(x=>x.ticker==='600036.SH')).toMatchObject({valid_from:'2002-04-09',valid_to:null,share_class:'A'});
  const [batch]=t.rows('ingest_batches');
  expect(batch).toMatchObject({producer:'load-a-share',dataset:'issuers.a_stock',status:'success',triggered_by:'cron',code_version:'test-sha'});
  expect(batch.errors).toEqual([{code:'skipped_summary',message:JSON.stringify({delisted:2})}]);
  expect(t.rows('dq_freshness')[0]).toMatchObject({dataset:'issuers.a_stock',expected_cadence:'daily',status:'fresh'});
 });
 it('apply: a quota error while fetching is receipted (batch failed, ok:false attempt); a dry run with the same error writes nothing',async()=>{
  const t=tablesFor();const d={...depsFor(t),tushare:async()=>{throw new IndustryProviderError('quota_exhausted','api_code_40203');}};
  await expect(runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup})).rejects.toMatchObject({code:'quota_exhausted'});
  const [batch]=t.rows('ingest_batches');
  expect(batch).toMatchObject({producer:'load-a-share',status:'failed'});
  expect(batch.errors).toEqual([{code:'quota_exhausted',message:'api_code_40203'}]);
  expect(t.rows('dq_freshness')[0]).toMatchObject({dataset:'issuers.a_stock',status:'missing',last_ok_at:null});
  expect(t.rows('dq_freshness')[0].last_attempt_at).toBeTruthy();
  const t2=tablesFor();
  await expect(runLoadAShare({...depsFor(t2),tushare:d.tushare},{apply:false,sleep:noSleep})).rejects.toMatchObject({code:'quota_exhausted'});
  expect(t2.rows('ingest_batches')).toEqual([]);expect(t2.rows('dq_freshness')).toEqual([]);
 });
 it('apply with a snapshot store persists every stock_basic page',async()=>{
  const t=tablesFor();const d=depsFor(t);await seedUniverse(d);const store=memorySnapshotStore();
  await runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup,snapshots:{store}});
  expect(store.objects.size).toBe(6);   // L, P, D pages × (bytes + meta)
 });
 it('K4: the stock_basic D pass is persisted in industry_security_delistings with page evidence; a dry run writes none; an unchanged rerun keeps the rows; a changed date updates + quarantines delist_date_changed',async()=>{
  const t=memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],issuer_identifier_claims:['id'],ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id']});
  const d=depsFor(t);await seedUniverse(d);
  await runLoadAShare(d,{apply:false,sleep:noSleep});
  expect(await d.db.delistings()).toEqual([]);
  const first=await runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup});
  const rows=await d.db.delistings();
  expect(rows.map(r=>[r.ts_code,r.list_status])).toEqual([['002770.SZ','D'],['600090.SH','D']]);
  expect(rows.find(r=>r.ts_code==='002770.SZ')).toMatchObject({delist_date:'2022-06-23',batch_id:first.batchId,raw_hash:expect.stringMatching(/^[0-9a-f]{64}$/)});
  const again=await runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup});
  expect((await d.db.delistings()).find(r=>r.ts_code==='002770.SZ')!.batch_id).toBe(first.batchId);   // unchanged date: first evidence kept
  expect(again.apply!.errors.map(e=>e.code)).not.toContain('delist_date_changed');
  const moved:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='stock_basic')return r;
   const ts=r.fields.indexOf('ts_code'),dl=r.fields.indexOf('delist_date');
   return {...r,items:r.items.map(it=>it[ts]==='002770.SZ'?it.map((v,i)=>i===dl?'20220701':v):it)};
  };
  const third=await runLoadAShare({...d,tushare:moved},{apply:true,sleep:noSleep,lookupOrgId:realLookup});
  expect(third.status).toBe('partial');
  expect(third.apply!.errors).toContainEqual({code:'delist_date_changed',key:'002770.SZ'});
  expect((await d.db.delistings()).find(r=>r.ts_code==='002770.SZ')).toMatchObject({delist_date:'2022-07-01',batch_id:third.batchId});
  expect(t.rows('dq_quarantine').map(q=>[q.reason_code,q.natural_key,q.detail])).toEqual([['delist_date_changed','stock_basic:002770.SZ',{old_date:'2022-06-23',new_date:'2022-07-01'}]]);
 });
 it('refuses to apply without a code version',async()=>{
  const d={...depsFor(),codeVersion:null};await seedUniverse(d);
  await expect(runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup})).rejects.toThrow('code_version_missing');
 });
});
