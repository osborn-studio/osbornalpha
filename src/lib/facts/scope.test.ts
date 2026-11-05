// src/lib/facts/scope.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsDb} from './memory-facts-db';
import {fetchKey,reconcileScope,scopeRowFor} from './scope';
import type {FactsDb,Market} from './types';

const A='11111111-1111-4111-8111-111111111111',M='22222222-2222-4222-8222-222222222222',K='33333333-3333-4333-8333-333333333333';
// One frozen clock for the whole file: reconciliation reads `today`, the memory db stamps next_due_at
// with its own clock, and the due queries ask for TODAY — all three must agree (round-1 #23).
const TODAY='2026-11-04';
const NOW_ISO=`${TODAY}T00:00:00.000Z`;
async function seed(){
 const c=memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from']});
 await c.insert('issuers',{issuer_id:A,cik:'320193',status:'active'});
 await c.insert('issuers',{issuer_id:M,cik:null,status:'active'});          // no CIK → not in US scope
 await c.insert('issuers',{issuer_id:K,cik:null,status:'active'});          // Moutai
 await c.insert('issuer_securities',{issuer_id:A,ticker:'AAPL',is_primary:true,valid_from:'2000-01-01',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:M,ticker:'MSFT',is_primary:true,valid_from:'2000-01-01',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:K,ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:K,ticker:'600519.OLD',is_primary:true,valid_from:'1990-01-01',valid_to:'2001-08-26'});
 for(const [u,t] of [['sp500','AAPL'],['nasdaq_top500','AAPL'],['sp500','MSFT'],['us_china','BABA']] as const)
  await c.insert('security_universe_memberships',{ticker:t,universe:u,is_active:true,as_of_date:TODAY});
 await c.insert('security_universe_memberships',{ticker:'AAPL',universe:'watchlist',is_active:true,as_of_date:TODAY});  // owner decision B: ignored
 await c.insert('security_universe_memberships',{ticker:'MSFT',universe:'nasdaq_top500',is_active:false,as_of_date:TODAY});
 await c.insert('research_entity_keys',{user_id:'u',entity_id:'e1',in_scope:true,issuer_id:K,home_market:'A'});
 await c.insert('research_entity_keys',{user_id:'u',entity_id:'e2',in_scope:true,issuer_id:null,home_market:'A'});
 await c.insert('research_entity_keys',{user_id:'u',entity_id:'e3',in_scope:false,issuer_id:A,home_market:'US'});
 return c;
}
/** memoryFactsDb on the frozen clock plus a recorder of what reconcileScope received. */
function recordingDb(){
 const db=memoryFactsDb();db.setNow(NOW_ISO);const calls:{market:Market;rows:Parameters<FactsDb['reconcileScope']>[1]}[]=[];
 const wrapped:FactsDb={...db,reconcileScope:(market,rows)=>{calls.push({market,rows});return db.reconcileScope(market,rows);}};
 return {db:wrapped,calls};
}

describe('fetchKey',()=>{
 it('pads US CIKs to 10 digits and keeps CN tickers as-is',()=>{
  expect(fetchKey('US',{cik:'320193'})).toBe('0000320193');
  expect(fetchKey('CN',{ticker:'600519.SH'})).toBe('600519.SH');
  expect(()=>fetchKey('US',{cik:null})).toThrow('missing_cik');
  expect(()=>fetchKey('CN',{ticker:'AAPL'})).toThrow('not_cn_ticker');
 });
});

describe('reconcileScope',()=>{
 it('US: active tickers of the three public universes → issuers with a CIK, priority 10, reasons per universe',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  const r=await reconcileScope({tables,db},'US',{today:TODAY});
  expect(r).toMatchObject({desired:1,retired:0,skipped:{no_cik:1,unknown_ticker:1}});
  expect(calls[0].rows).toEqual([{issuer_id:A,reasons:['universe:nasdaq_top500','universe:sp500'],priority:10,fetch_key:'0000320193'}]);
  expect((await db.scopeDue('US',`${TODAY}T23:59:59Z`,10)).map(s=>s.issuer_id)).toEqual([A]);
 });
 it('CN: in_scope entity keys with an issuer → current primary .SH/.SZ/.BJ ticker, reasons cohort; watchlists never enter',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  const r=await reconcileScope({tables,db},'CN',{today:TODAY});
  expect(r).toMatchObject({desired:1,retired:0,skipped:{no_issuer:1}});
  expect(calls[0].rows).toEqual([{issuer_id:K,reasons:['cohort'],priority:10,fetch_key:'600519.SH'}]);
 });
 it('is idempotent and retires rows that vanished from the sources with priority 0',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  await reconcileScope({tables,db},'US',{today:TODAY});
  await reconcileScope({tables,db},'US',{today:TODAY});
  expect(calls[1].rows).toEqual(calls[0].rows);
  await tables.update('security_universe_memberships',{ticker:'AAPL',universe:'sp500'},{is_active:false});
  await tables.update('security_universe_memberships',{ticker:'AAPL',universe:'nasdaq_top500'},{is_active:false});
  const r=await reconcileScope({tables,db},'US',{today:TODAY});
  expect(r).toMatchObject({desired:0,retired:1});
  expect(calls[2].rows).toEqual([{issuer_id:A,reasons:[],priority:0,fetch_key:'0000320193'}]);
  expect(await db.scopeDue('US',`${TODAY}T23:59:59Z`,10)).toEqual([]);
 });
 it('ownership with a scheduled future end is still current; an end at or before today is not (the landed validity predicate, round-1 #22)',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  await tables.update('issuer_securities',{issuer_id:A,ticker:'AAPL'},{valid_to:'2030-12-31'});   // ends in the future: AAPL is still owned today
  expect(await reconcileScope({tables,db},'US',{today:TODAY})).toMatchObject({desired:1,retired:0});
  expect(calls[0].rows.map(x=>x.issuer_id)).toEqual([A]);
  expect((await db.scopeDue('US',`${TODAY}T23:59:59Z`,10)).map(s=>[s.issuer_id,s.next_due_at])).toEqual([[A,NOW_ISO]]);
  await tables.update('issuer_securities',{issuer_id:A,ticker:'AAPL'},{valid_to:TODAY});          // valid_to > today fails: no owner today
  expect((await reconcileScope({tables,db},'US',{today:TODAY})).skipped).toMatchObject({unknown_ticker:2});
  expect(await scopeRowFor(tables,'CN',K,{today:'2001-08-26'})).toBeNull();                      // 600519.OLD ends 2001-08-26, 600519.SH starts 2001-08-27
  expect(await scopeRowFor(tables,'CN',K,{today:'2001-08-27'})).toMatchObject({fetch_key:'600519.SH'});
 });
});

describe('scopeRowFor',()=>{
 it('derives one explicit scope row per market from the issuer tables; null when the issuer is unknown, merged or has no fetch key (round-1 #13)',async()=>{
  const tables=await seed();
  expect(await scopeRowFor(tables,'US',A,{today:TODAY})).toEqual({issuer_id:A,reasons:['explicit'],priority:10,fetch_key:'0000320193'});
  expect(await scopeRowFor(tables,'US',M,{today:TODAY})).toBeNull();                              // no CIK
  expect(await scopeRowFor(tables,'CN',K,{today:TODAY})).toEqual({issuer_id:K,reasons:['explicit'],priority:10,fetch_key:'600519.SH'});
  expect(await scopeRowFor(tables,'CN',A,{today:TODAY})).toBeNull();                              // no A-share listing
  expect(await scopeRowFor(tables,'US','44444444-4444-4444-8444-444444444444',{today:TODAY})).toBeNull();
  await tables.update('issuers',{issuer_id:A},{status:'merged'});
  expect(await scopeRowFor(tables,'US',A,{today:TODAY})).toBeNull();
 });
});

describe('reconcileScope: CN ticker choice, skips and paging',()=>{
 const sec=(c:Awaited<ReturnType<typeof seed>>,issuer:string,ticker:string,primary:boolean,extra:Record<string,unknown>={})=>c.insert('issuer_securities',{issuer_id:issuer,ticker,is_primary:primary,valid_from:'2010-01-01',valid_to:null,...extra});
 const key=(c:Awaited<ReturnType<typeof seed>>,entity:string,issuer:string|null)=>c.insert('research_entity_keys',{user_id:'u',entity_id:entity,in_scope:true,issuer_id:issuer,home_market:'A'});
 const I1='55555555-5555-4555-8555-555555555555',I2='66666666-6666-4666-8666-666666666666',I3='77777777-7777-4777-8777-777777777777';
 it('A+H issuer with an H primary gets its A share; B-share-only is skipped; two A candidates without a primary are ambiguous; two primaries are ambiguous',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  for(const i of [I1,I2,I3])await tables.insert('issuers',{issuer_id:i,cik:null,status:'active'});
  await sec(tables,I1,'0700.HK',true);await sec(tables,I1,'000001.SZ',false);
  await sec(tables,I2,'900901.SH',true);await sec(tables,I2,'200002.SZ',false);
  await sec(tables,I3,'600000.SH',false);await sec(tables,I3,'000002.SZ',false);
  await tables.insert('issuers',{issuer_id:'88888888-8888-4888-8888-888888888888',cik:null,status:'active'});
  await sec(tables,'88888888-8888-4888-8888-888888888888','300001.SZ',true);await sec(tables,'88888888-8888-4888-8888-888888888888','300002.SZ',true);
  for(const [e,i] of [['e4',I1],['e5',I2],['e6',I3],['e7','88888888-8888-4888-8888-888888888888']])await key(tables,e,i);
  const r=await reconcileScope({tables,db},'CN',{today:TODAY});
  expect(calls[0].rows.map(x=>[x.issuer_id,x.fetch_key])).toEqual([[K,'600519.SH'],[I1,'000001.SZ']]);
  expect(r.skipped).toEqual({no_issuer:1,no_cn_ticker:1,ambiguous_cn_ticker:2});
  expect(await scopeRowFor(tables,'CN',I1,{today:TODAY})).toMatchObject({fetch_key:'000001.SZ'});
  expect(await scopeRowFor(tables,'CN',I2,{today:TODAY})).toBeNull();
  expect(await scopeRowFor(tables,'CN',I3,{today:TODAY})).toBeNull();
 });
 it('two tickers on one US issuer collapse to one row with both reasons; an inactive issuer is skipped as issuer_not_active',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  await tables.insert('issuer_securities',{issuer_id:A,ticker:'AAPL.B',is_primary:false,valid_from:'2000-01-01',valid_to:null});
  await tables.insert('security_universe_memberships',{ticker:'AAPL.B',universe:'us_china',is_active:true,as_of_date:TODAY});
  await tables.update('issuers',{issuer_id:M},{status:'merged',cik:'789019'});
  const r=await reconcileScope({tables,db},'US',{today:TODAY});
  expect(calls[0].rows).toEqual([{issuer_id:A,reasons:['universe:nasdaq_top500','universe:sp500','universe:us_china'],priority:10,fetch_key:'0000320193'}]);
  expect(r.skipped).toMatchObject({issuer_not_active:1});
 });
 it('pages past 1000 rows: research_entity_keys and securities with a scheduled end',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  const ids:string[]=[];
  for(let n=0;n<1100;n++){
   const id=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;ids.push(id);
   await tables.insert('issuers',{issuer_id:id,cik:null,status:'active'});
   await sec(tables,id,`${String(100000+n)}.SH`,true,{valid_to:'2030-01-01'});   // all via the "ending" read
   await key(tables,`e-${String(n).padStart(5,'0')}`,id);
  }
  const r=await reconcileScope({tables,db},'CN',{today:TODAY});
  expect(r.desired).toBe(1101);expect(calls[0].rows).toHaveLength(1101);
 },60000);
 it('retirement reads the scope rows through FactsDb, so memory harnesses retire too; DB errors propagate from scopeRowFor',async()=>{
  const tables=await seed();const {db}=recordingDb();
  await db.reconcileScope('CN',[{issuer_id:'99999999-9999-4999-8999-999999999999',reasons:['cohort'],priority:10,fetch_key:'688001.SH'}]);
  const r=await reconcileScope({tables,db},'CN',{today:TODAY});
  expect(r).toMatchObject({desired:1,retired:1});
  const boom:typeof tables={...tables,select:async()=>{throw new Error('db_down');}};
  await expect(scopeRowFor(boom,'CN',K,{today:TODAY})).rejects.toThrow('db_down');
 });
});
