// src/lib/industry/facts-scope.test.ts
import {describe,it,expect,afterEach,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {MAX_PAGE} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {reconcileScope} from '../facts/scope';
import type {FactsDb,Market} from '../facts/types';
import {closedWindowTicker,industryCnUniverse,industryUniverseEnabled,mergeDesired} from './facts-scope';

const TODAY='2026-11-06';
const K='33333333-3333-4333-8333-333333333333';   // cohort issuer (Moutai), also an sw2021 member
const W='44444444-4444-4444-8444-444444444444';   // sw2021 member only (五粮液)
const D='55555555-5555-4555-8555-555555555555';   // historical member, delisted: closed window only
const A='66666666-6666-4666-8666-666666666666';   // a_stock universe only, not an industry member
const G='77777777-7777-4777-8777-777777777777';   // merged issuer resolved from a source row
let n=0;
/** Like PostgREST: an unlimited select returns at most MAX_PAGE rows, so a read that forgets to page loses rows. `onSelect` observes every select. */
function capped<T extends TableClient>(t:T,onSelect?:(table:string,call:number)=>Promise<void>|void):T{
 const select=t.select.bind(t);let calls=0;
 return {...t,select:async(table:string,match:Record<string,unknown>,opts:Parameters<T['select']>[2]={})=>{
  const out=await select(table,match,{...opts,limit:Math.min(opts?.limit??MAX_PAGE,MAX_PAGE)});
  await onSelect?.(table,++calls);
  return out;
 }} as T;
}
const src=(over:Record<string,unknown>)=>({id:`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,scheme:'sw2021',version:'2021',source:'tushare:index_member_all',ts_code:'600519.SH',l1_code:'801120.SI',l2_code:'801125.SI',l3_code:'851251.SI',in_date:'2021-07-30',out_date:null,status:'current',issuer_id:null,...over});
async function seed(){
 const t=capped(memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],industry_source_memberships:['id']}));
 for(const [id,status] of [[K,'active'],[W,'active'],[D,'dissolved'],[A,'active'],[G,'merged']] as const)await t.insert('issuers',{issuer_id:id,cik:null,status,merged_into:status==='merged'?K:null});
 const sec=(issuer:string,ticker:string,from:string,to:string|null,primary=true)=>t.insert('issuer_securities',{issuer_id:issuer,ticker,is_primary:primary,share_class:'A',valid_from:from,valid_to:to});
 await sec(K,'600519.SH','2001-08-27',null);await sec(W,'000858.SZ','1998-04-27',null);await sec(A,'601318.SH','2007-03-01',null);
 await sec(D,'600087.SH','1997-06-06','2023-10-20');await sec(D,'600088.SH','1990-01-01','2000-01-01');   // latest closed window wins
 await t.insert('research_entity_keys',{user_id:'u',entity_id:'e1',in_scope:true,issuer_id:K,home_market:'A'});
 await t.insert('security_universe_memberships',{ticker:'601318.SH',universe:'a_stock',is_active:true,as_of_date:TODAY});
 await t.insert('security_universe_memberships',{ticker:'600519.SH',universe:'a_stock',is_active:true,as_of_date:TODAY});
 await t.insert('security_universe_memberships',{ticker:'688888.SH',universe:'a_stock',is_active:true,as_of_date:TODAY});   // no owner
 await t.insert('industry_source_memberships',src({ts_code:'600519.SH',issuer_id:K}));
 await t.insert('industry_source_memberships',src({ts_code:'000858.SZ',issuer_id:W}));
 await t.insert('industry_source_memberships',src({ts_code:'600087.SH',issuer_id:D,l2_code:'801124.SI',l3_code:'851241.SI',out_date:'2023-10-20'}));
 await t.insert('industry_source_memberships',src({ts_code:'688999.SH',issuer_id:null}));                 // unresolved: never enters
 await t.insert('industry_source_memberships',src({ts_code:'600999.SH',issuer_id:G}));                    // merged issuer: skipped
 await t.insert('industry_source_memberships',src({ts_code:'000001.SZ',issuer_id:'99999999-9999-4999-8999-999999999999',status:'superseded'}));   // not current
 return t;
}
function recordingDb(){
 const db=memoryFactsDb();db.setNow(`${TODAY}T00:00:00.000Z`);const calls:{market:Market;rows:Parameters<FactsDb['reconcileScope']>[1]}[]=[];
 return {db:{...db,reconcileScope:(m:Market,rows:Parameters<FactsDb['reconcileScope']>[1],s?:string)=>{calls.push({market:m,rows});return db.reconcileScope(m,rows,s);}} as FactsDb,calls};
}
afterEach(()=>{vi.unstubAllEnvs();});

describe('industryCnUniverse',()=>{
 it('unions resolved current source issuers and a_stock owners; historical members take their last closed A-share window',async()=>{
  const t=await seed();const skipped:Record<string,number>={};
  const rows=await industryCnUniverse(t,TODAY,skipped);
  expect(rows).toEqual([
   {issuer_id:K,reasons:['universe:a_stock','universe:sw2021'],priority:10,fetch_key:'600519.SH'},
   {issuer_id:W,reasons:['universe:sw2021'],priority:10,fetch_key:'000858.SZ'},
   {issuer_id:D,reasons:['universe:sw2021'],priority:10,fetch_key:'600087.SH'},
   {issuer_id:A,reasons:['universe:a_stock'],priority:10,fetch_key:'601318.SH'},
  ]);
  expect(skipped).toEqual({industry_unknown_ticker:1,industry_issuer_merged:1});
 });
 it('counts no_cn_ticker when neither a current nor a closed A-share window exists',async()=>{
  const t=await seed();
  const X='88888888-8888-4888-8888-888888888888';
  await t.insert('issuers',{issuer_id:X,cik:null,status:'active'});
  await t.insert('issuer_securities',{issuer_id:X,ticker:'0700.HK',is_primary:true,share_class:'H',valid_from:'2004-06-16',valid_to:null});
  await t.insert('industry_source_memberships',src({ts_code:'600700.SH',issuer_id:X}));
  const skipped:Record<string,number>={};
  expect((await industryCnUniverse(t,TODAY,skipped)).some(r=>r.issuer_id===X)).toBe(false);
  expect(skipped).toMatchObject({industry_no_cn_ticker:1});
  expect(skipped.no_cn_ticker).toBeUndefined();
 });
 it('reads more than one page of source rows (1000-row PostgREST cap)',async()=>{
  const t=capped(memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],industry_source_memberships:['id']}));
  for(let i=0;i<1100;i++){
   const id=`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
   await t.insert('issuers',{issuer_id:id,cik:null,status:'active'});
   await t.insert('issuer_securities',{issuer_id:id,ticker:`${String(600000+i)}.SH`,is_primary:true,share_class:'A',valid_from:'2010-01-01',valid_to:null});
   await t.insert('industry_source_memberships',src({ts_code:`${String(600000+i)}.SH`,issuer_id:id}));
  }
  expect(await industryCnUniverse(t,TODAY,{})).toHaveLength(1100);
 },60000);
});

describe('keyset reads and historical windows',()=>{
 it('a source row superseded between pages does not drop another issuer (offset paging would skip one)',async()=>{
  const raw=memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],industry_source_memberships:['id']});
  const ids:string[]=[],srcIds:string[]=[];
  for(let i=0;i<1100;i++){
   const id=`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;ids.push(id);
   await raw.insert('issuers',{issuer_id:id,cik:null,status:'active'});
   await raw.insert('issuer_securities',{issuer_id:id,ticker:`${String(600000+i)}.SH`,is_primary:true,share_class:'A',valid_from:'2010-01-01',valid_to:null});
   const row=src({ts_code:`${String(600000+i)}.SH`,issuer_id:id});srcIds.push(String(row.id));
   await raw.insert('industry_source_memberships',row);
  }
  let superseded=false;
  const t=capped(raw,async(table)=>{   // after the first source page: the first row leaves the current set
   if(table==='industry_source_memberships'&&!superseded){superseded=true;await raw.update('industry_source_memberships',{id:srcIds[0]},{status:'superseded'});}
  });
  const got=new Set((await industryCnUniverse(t,TODAY,{})).map(r=>r.issuer_id));
  expect(superseded).toBe(true);
  for(const id of ids.slice(1))expect(got.has(id)).toBe(true);
 },60000);
 it('reads a historical issuer’s windows to exhaustion: the winning (latest closed) window sits beyond the first page',async()=>{
  const t=capped(memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],industry_source_memberships:['id']}));
  const H='99999999-9999-4999-8999-999999999990';
  await t.insert('issuers',{issuer_id:H,cik:null,status:'active'});
  for(let i=0;i<1100;i++)await t.insert('issuer_securities',{issuer_id:H,ticker:`${String(100000+i)}.SZ`,is_primary:true,share_class:'A',valid_from:'1990-01-01',valid_to:'2000-01-01'});
  await t.insert('issuer_securities',{issuer_id:H,ticker:'688001.SH',is_primary:true,share_class:'A',valid_from:'2001-01-01',valid_to:'2020-05-05'});   // sorts after 1000 rows
  await t.insert('industry_source_memberships',src({ts_code:'688001.SH',issuer_id:H}));
  expect((await industryCnUniverse(t,TODAY,{})).find(r=>r.issuer_id===H)?.fetch_key).toBe('688001.SH');
 },60000);
 it('a fallback ticker now owned by another issuer is skipped industry_ticker_reused',async()=>{
  const t=await seed();
  await t.insert('issuer_securities',{issuer_id:W,ticker:'600087.SH',is_primary:false,share_class:'A',valid_from:'2024-01-01',valid_to:null});   // D's old ticker reused by W
  const skipped:Record<string,number>={};
  const rows=await industryCnUniverse(t,TODAY,skipped);
  expect(rows.some(r=>r.issuer_id===D)).toBe(false);expect(skipped.industry_ticker_reused).toBe(1);
 });
});

describe('closedWindowTicker / mergeDesired',()=>{
 it('ignores open, B-share and non-A rows; ambiguous ties are reported',()=>{
  expect(closedWindowTicker([{ticker:'600087.SH',valid_to:null,is_primary:true}],TODAY)).toEqual({reason:'no_cn_ticker'});
  expect(closedWindowTicker([{ticker:'900901.SH',valid_to:'2020-01-01',is_primary:true}],TODAY)).toEqual({reason:'no_cn_ticker'});
  expect(closedWindowTicker([{ticker:'600001.SH',valid_to:'2020-01-01',is_primary:false},{ticker:'000001.SZ',valid_to:'2020-01-01',is_primary:false}],TODAY)).toEqual({reason:'ambiguous_cn_ticker'});
 });
 it('only windows already closed (valid_to <= today) count: a future end never wins over an expired window',()=>{
  expect(closedWindowTicker([{ticker:'600001.SH',valid_to:'2020-01-01',is_primary:true},{ticker:'600002.SH',valid_to:'2030-01-01',is_primary:true}],TODAY)).toEqual({ticker:'600001.SH'});
  expect(closedWindowTicker([{ticker:'600002.SH',valid_to:'2030-01-01',is_primary:true}],TODAY)).toEqual({reason:'no_cn_ticker'});
  expect(closedWindowTicker([{ticker:'600003.SH',valid_to:TODAY,is_primary:true}],TODAY)).toEqual({ticker:'600003.SH'});
 });
 it('merges reasons per issuer (sorted) and keeps the cohort fetch_key',()=>{
  expect(mergeDesired([{issuer_id:K,reasons:['cohort'],priority:10,fetch_key:'600519.SH'}],[{issuer_id:K,reasons:['universe:sw2021'],priority:10,fetch_key:'600519.SH'},{issuer_id:A,reasons:['universe:a_stock'],priority:10,fetch_key:'601318.SH'}]))
   .toEqual([{issuer_id:K,reasons:['cohort','universe:sw2021'],priority:10,fetch_key:'600519.SH'},{issuer_id:A,reasons:['universe:a_stock'],priority:10,fetch_key:'601318.SH'}]);
 });
 it('reads the flag strictly as "1"',()=>{
  expect(industryUniverseEnabled({})).toBe(false);expect(industryUniverseEnabled({FACTS_CN_INDUSTRY_UNIVERSE:'true'})).toBe(false);
  expect(industryUniverseEnabled({FACTS_CN_INDUSTRY_UNIVERSE:'1'})).toBe(true);
 });
});

describe('desiredCn INDUSTRY block (via reconcileScope)',()=>{
 it('flag off: the CN scope is exactly plan 2’s cohort set, industry tables are ignored',async()=>{
  vi.stubEnv('FACTS_CN_INDUSTRY_UNIVERSE','');
  const t=await seed();const {db,calls}=recordingDb();
  const r=await reconcileScope({tables:t,db},'CN',{today:TODAY});
  expect(r).toMatchObject({desired:1,retired:0});expect(r.skipped).toEqual({});
  expect(calls[0].rows).toEqual([{issuer_id:K,reasons:['cohort'],priority:10,fetch_key:'600519.SH'}]);
 });
 it('flag on: union with per-issuer merged reasons; a later run without the flag retires only the industry-only issuers',async()=>{
  vi.stubEnv('FACTS_CN_INDUSTRY_UNIVERSE','1');
  const t=await seed();const {db,calls}=recordingDb();
  const r=await reconcileScope({tables:t,db},'CN',{today:TODAY});
  expect(r).toMatchObject({desired:4,retired:0,skipped:{industry_unknown_ticker:1,industry_issuer_merged:1}});
  expect(calls[0].rows).toEqual([
   {issuer_id:K,reasons:['cohort','universe:a_stock','universe:sw2021'],priority:10,fetch_key:'600519.SH'},
   {issuer_id:W,reasons:['universe:sw2021'],priority:10,fetch_key:'000858.SZ'},
   {issuer_id:D,reasons:['universe:sw2021'],priority:10,fetch_key:'600087.SH'},
   {issuer_id:A,reasons:['universe:a_stock'],priority:10,fetch_key:'601318.SH'},
  ]);
  vi.stubEnv('FACTS_CN_INDUSTRY_UNIVERSE','0');
  const off=await reconcileScope({tables:t,db},'CN',{today:TODAY,snapshotAt:'2099-01-01T00:00:00.000Z'});
  expect(off).toMatchObject({desired:1,retired:3});
  expect(calls[1].rows.filter(x=>x.priority===0).map(x=>x.issuer_id)).toEqual([W,D,A].sort());
 });
});
