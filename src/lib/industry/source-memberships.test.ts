// src/lib/industry/source-memberships.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {runClassificationsSw} from './classifications';
import {memoryIndustryDb} from './memory-industry-db';
import {fixtureTushareCall} from './providers/tushare-industry';
import type {TushareCall} from './providers/tushare-industry';
import {isNullToDate,planSourceMemberships,runMembershipsSw,sameContent,sourceKey} from './source-memberships';
import type {FetchedMember} from './source-memberships';
import type {IndustryDeps,ManifestStore,SourceMembershipRow} from './types';

const NOW='2026-11-09T02:00:00.000Z';
const loc=(row:number)=>({api:'index_member_all',params:{l1_code:'801080.SI',is_new:'Y'},page:1,offset:0,row});
const m=(over:Partial<FetchedMember>):FetchedMember=>({l1_code:'801080.SI',l1_name:'电子',l2_code:'801083.SI',l2_name:'元件',l3_code:'850822.SI',l3_name:'印制电路板',ts_code:'600183.SH',name:'生益科技',in_date:'20210730',out_date:null,is_new:'Y',raw_hash:'h1',locator:loc(0),fetched_at:NOW,...over});
const cur=(over:Partial<SourceMembershipRow>):SourceMembershipRow=>({id:'old-1',scheme:'sw2021',version:'2021',source:'tushare:index_member_all',ts_code:'600183.SH',name:'生益科技',l1_code:'801080.SI',l2_code:'801083.SI',l3_code:'850822.SI',in_date:'2021-07-30',out_date:null,observed_at:'2026-11-01T00:00:00.000Z',batch_id:'b0',raw_hash:'h0',locator:{},status:'current',superseded_by:null,issuer_id:null,resolution:{},resolution_error:null,...over});
const unusedManifests:ManifestStore={put:async()=>{throw new Error('unused');},get:async()=>{throw new Error('unused');},remove:async()=>{throw new Error('unused');}};
const noSleep=async()=>{};

describe('planSourceMemberships',()=>{
 it('normalizes dates and keeps evidence (raw_hash, locator, observed_at) outside the content comparison',()=>{
  const plan=planSourceMemberships([m({})],[cur({raw_hash:'other',observed_at:'2020-01-01T00:00:00.000Z'})]);
  expect(plan.inputs).toEqual([{source:'tushare:index_member_all',ts_code:'600183.SH',name:'生益科技',l1_code:'801080.SI',l2_code:'801083.SI',l3_code:'850822.SI',in_date:'2021-07-30',out_date:null,observed_at:NOW,raw_hash:'h1',locator:loc(0)}]);
  expect(plan.expected).toEqual({newKeys:0,unchanged:1,nullToDate:0,changed:0});
 });
 it('same key twice in one fetch with identical content → one input; with different content → ambiguous, nothing written',()=>{
  const dup=planSourceMemberships([m({}),m({raw_hash:'h2',locator:loc(5),is_new:'N'})],[]);
  expect(dup.inputs).toHaveLength(1);expect(dup.duplicatesInFetch).toBe(1);expect(dup.inputs[0].raw_hash).toBe('h1');
  const amb=planSourceMemberships([m({}),m({out_date:'20240110'})],[]);
  expect(amb.inputs).toEqual([]);
  expect(amb.ambiguous).toHaveLength(1);
  expect(amb.ambiguous[0].key).toBe('sw2021:2021:tushare:index_member_all:600183.SH:850822.SI:2021-07-30');
 });
 it('classifies against current records: new key, out_date null→date, other change (incl. date correction and name)',()=>{
  const plan=planSourceMemberships([
   m({out_date:'20240110'}),                                             // null → date
   m({ts_code:'002463.SZ',l3_code:'851241.SI',out_date:'20230801'}),     // date correction (20230731 → 20230801)
   m({ts_code:'000858.SZ',name:'五粮液Ａ'}),                               // name change
   m({ts_code:'600584.SH'}),                                             // new key
  ],[cur({}),cur({id:'old-2',ts_code:'002463.SZ',l3_code:'851241.SI',out_date:'2023-07-31'}),cur({id:'old-3',ts_code:'000858.SZ',name:'五粮液'})]);
  expect(plan.expected).toEqual({newKeys:1,unchanged:0,nullToDate:1,changed:2});
  expect(plan.changes.map(c=>[c.old.id,c.nullToDate])).toEqual([['old-1',true],['old-2',false],['old-3',false]]);
 });
 it('rejects malformed rows: missing codes, invalid dates, out_date not after in_date',()=>{
  const plan=planSourceMemberships([m({l3_code:''}),m({in_date:'20210231'}),m({in_date:null}),m({out_date:'2024-01-10'}),m({out_date:'20210729'})],[]);
  expect(plan.inputs).toEqual([]);
  expect(plan.rejected).toEqual(['rejected_row_shape:600183.SH::20210730','rejected_date:600183.SH:850822.SI:20210231','rejected_date:600183.SH:850822.SI:','rejected_date:600183.SH:850822.SI:20210730','rejected_window:600183.SH:850822.SI:20210730']);
  expect(planSourceMemberships([m({out_date:'20210730'})],[]).inputs.map(i=>[i.in_date,i.out_date])).toEqual([['2021-07-30','2021-07-30']]);   // one-day record: out_date is inclusive (K3)
 });
 it('maps member codes through SW2021_CODE_ALIASES (original kept in the locator) and holds back codes missing from the tree',()=>{
  const known=new Set(['801040.SI','801043.SI','850401.SI','801080.SI','801083.SI','850822.SI']);
  const plan=planSourceMemberships([m({ts_code:'600399.SH',l1_code:'801040.SI',l2_code:'801043.SI',l3_code:'850412.SI'}),m({l3_code:'859999.SI'})],[],known);
  expect(plan.inputs.map(i=>[i.ts_code,i.l3_code,i.locator.code_aliases])).toEqual([['600399.SH','850401.SI',{l3_code:'850412.SI'}]]);
  expect(plan.unknownCodes.map(u=>[u.row.ts_code,u.codes])).toEqual([['600183.SH',['859999.SI']]]);
 });
 it('helpers: sourceKey, sameContent, isNullToDate',()=>{
  const a={source:'s',ts_code:'t',l3_code:'l',in_date:'2021-01-01',name:'n',l1_code:'a',l2_code:'b',out_date:null as string|null};
  expect(sourceKey(a)).toBe('sw2021:2021:s:t:l:2021-01-01');
  expect(sameContent(a,{...a})).toBe(true);
  expect(isNullToDate(a,{...a,out_date:'2022-01-01'})).toBe(true);
  expect(isNullToDate(a,{...a,out_date:'2022-01-01',name:'x'})).toBe(false);
  expect(isNullToDate({...a,out_date:'2022-01-01'},{...a,out_date:'2022-02-01'})).toBe(false);
 });
});

describe('runMembershipsSw (real index_member_all recordings: 801120.SI and 801780.SI)',()=>{
 async function setup(call:TushareCall=fixtureTushareCall()){
  const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id']});const db=memoryIndustryDb();
  const deps:IndustryDeps={tables,db,facts:memoryFactsDb(),manifests:unusedManifests,now:()=>new Date(NOW),codeVersion:'sha',tushare:call};
  await runClassificationsSw({...deps,tushare:fixtureTushareCall()},{sleep:noSleep});
  return {tables,db,deps};
 }
 it('Y and N passes for all 31 L1s with paging: every recorded row becomes one current source record; a rerun is all duplicates',async()=>{
  const {tables,db,deps}=await setup();
  const r=await runMembershipsSw(deps,{apply:true,sleep:noSleep,pageSize:50,triggeredBy:'cron'});
  expect(r.status).toBe('success');
  expect(r.counts).toEqual({fetched:229,inserted:229,duplicates:0,versioned:0,quarantined:0,failed:0});
  expect(r.plans).toHaveLength(31);
  const all=await db.currentSourceMemberships({});
  expect(all).toHaveLength(229);
  expect(all.every(s=>s.issuer_id===null&&s.status==='current'&&/^[0-9a-f]{64}$/.test(s.raw_hash))).toBe(true);
  expect(all.filter(s=>s.ts_code==='000869.SZ').map(s=>[s.l3_code,s.in_date,s.out_date]).sort()).toEqual([['851233.SI','2000-10-10','2007-06-29'],['851233.SI','2007-07-02',null]]);
  expect(all.find(s=>s.ts_code==='002770.SZ')).toMatchObject({l1_code:'801120.SI',in_date:'2015-01-19',out_date:null});   // delisted 2022-06-23, window still open upstream (K3)
  expect(all.find(s=>s.ts_code==='600090.SH')).toMatchObject({out_date:'2017-06-28',locator:{api:'index_member_all',params:{l1_code:'801120.SI',is_new:'N'}}});
  const again=await runMembershipsSw(deps,{apply:true,sleep:noSleep});
  expect(again.counts).toMatchObject({inserted:0,duplicates:229,versioned:0});
  expect(tables.rows('ingest_batches').filter(b=>b.producer==='industry-sw-members').map(b=>b.dataset)).toEqual(['industry.sw2021.source','industry.sw2021.source']);
 });
 it('out_date null→date supersedes without quarantine; any other change supersedes AND is quarantined (batch partial)',async()=>{
  // synthetic edit of real responses = an earlier upstream state: 600866.SH still open in 食品饮料 (Y pass, no N row);
  // 600090.SH's exit dated 2017-06-20 instead of 2017-06-28
  const earlier:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);
   const f=r.fields;const ts=f.indexOf('ts_code'),out=f.indexOf('out_date'),isNew=f.indexOf('is_new');
   if(api!=='index_member_all')return r;
   const moved=r.items.find(it=>it[ts]==='600866.SH');
   let items=r.items.map(it=>it[ts]==='600090.SH'?it.map((v,i)=>i===out?'20170620':v):it);
   if(params.is_new==='N')items=items.filter(it=>it[ts]!=='600866.SH');
   if(params.is_new==='Y'&&params.l1_code==='801120.SI'){
    const n=await fixtureTushareCall()(api,{l1_code:'801120.SI',is_new:'N'},fields);
    const src=n.items.find(it=>it[ts]==='600866.SH')!;
    items=[...items,src.map((v,i)=>i===out?null:i===isNew?'Y':v)];
   }
   return {...r,items:moved&&params.is_new==='N'?items:items};
  };
  const {tables,db,deps}=await setup(earlier);
  await runMembershipsSw(deps,{apply:true,sleep:noSleep});
  const before=await db.currentSourceMemberships({});
  const r=await runMembershipsSw({...deps,tushare:fixtureTushareCall()},{apply:true,sleep:noSleep});
  expect(r.counts).toMatchObject({fetched:229,inserted:0,versioned:2,duplicates:227});
  expect(r.status).toBe('partial');
  expect(r.errors.map(e=>e.code)).toEqual(['source_membership_changed']);
  const q=tables.rows('dq_quarantine');
  expect(q.map(x=>[x.reason_code,x.natural_key])).toEqual([['source_membership_changed','sw2021:2021:tushare:index_member_all:600090.SH:851232.SI:1997-06-16']]);
  expect(q[0].payload).toMatchObject({old:{out_date:'2017-06-20'},next:{out_date:'2017-06-28'}});
  const after=await db.currentSourceMemberships({});
  expect(after).toHaveLength(229);
  const oldIds=new Set(before.map(s=>s.id));
  expect(after.filter(s=>!oldIds.has(s.id)).map(s=>[s.ts_code,s.out_date]).sort()).toEqual([['600090.SH','2017-06-28'],['600866.SH','2021-07-29']]);
 });
 it('an alias code is stored under the tree code; a code missing from the tree is quarantined classification_code_unknown',async()=>{
  // synthetic edit of a real response: two 801120.SI rows re-labelled with 特钢Ⅲ's member code and an unknown L3
  const edited:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);
   if(api!=='index_member_all'||params.is_new!=='Y'||params.l1_code!=='801120.SI')return r;
   const f=r.fields;const ts=f.indexOf('ts_code'),l1=f.indexOf('l1_code'),l2=f.indexOf('l2_code'),l3=f.indexOf('l3_code');
   return {...r,items:r.items.map(it=>it[ts]==='600519.SH'?it.map((v,i)=>i===l1?'801040.SI':i===l2?'801043.SI':i===l3?'850412.SI':v):it[ts]==='000858.SZ'?it.map((v,i)=>i===l3?'859999.SI':v):it)};
  };
  const {tables,db,deps}=await setup(edited);
  const r=await runMembershipsSw(deps,{apply:true,sleep:noSleep,l1Codes:['801120.SI']});
  expect(r.status).toBe('partial');
  expect(r.counts).toMatchObject({fetched:187,inserted:186,quarantined:1});
  const moutai=(await db.currentSourceMemberships({})).find(s=>s.ts_code==='600519.SH')!;
  expect(moutai).toMatchObject({l1_code:'801040.SI',l3_code:'850401.SI',locator:{code_aliases:{l3_code:'850412.SI'}}});
  expect(tables.rows('dq_quarantine').map(x=>[x.reason_code,(x.detail as {codes:string[]}).codes])).toEqual([['classification_code_unknown',['859999.SI']]]);
 });
 it('dry run writes nothing and reports expected counts; quota exhaustion stops the job with quota_exhausted',async()=>{
  const {tables,db,deps}=await setup();
  const dry=await runMembershipsSw(deps,{apply:false,l1Codes:['801120.SI'],sleep:noSleep});
  expect(dry).toMatchObject({status:'dry_run',batchId:null,plans:[{l1:'801120.SI',expected:{newKeys:187,unchanged:0,nullToDate:0,changed:0},inputs:187,unknownCodes:0}]});
  expect(await db.currentSourceMemberships({})).toEqual([]);
  let calls=0;
  const {IndustryProviderError}=await import('./providers/tushare-industry');
  // synthetic: the third call answers a quota error
  const quota:TushareCall=async(a,p,f)=>{if(++calls>2)throw new IndustryProviderError('quota_exhausted','api_code_40203');return fixtureTushareCall()(a,p,f);};
  const r=await runMembershipsSw({...deps,tushare:quota},{apply:true,sleep:noSleep});
  expect(r.errors.map(e=>e.code)).toEqual(['quota_exhausted']);
  expect(r.status).toBe('failed');                                  // 801010.SI (the only L1 fetched) has no recorded members: nothing written
  expect(r.plans.map(p=>p.l1)).toEqual(['801010.SI']);
  expect(tables.rows('ingest_batches').at(-1)).toMatchObject({status:'failed'});
 });
 it('no classification nodes → no_classifications, batch failed',async()=>{
  const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset']});
  const deps:IndustryDeps={tables,db:memoryIndustryDb(),facts:memoryFactsDb(),manifests:unusedManifests,now:()=>new Date(NOW),codeVersion:'sha',tushare:fixtureTushareCall()};
  const r=await runMembershipsSw(deps,{apply:true,sleep:noSleep});
  expect(r).toMatchObject({status:'failed',exitCode:1});
  expect(r.errors.map(e=>e.code)).toEqual(['no_classifications']);
 });
});
