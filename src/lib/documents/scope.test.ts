// src/lib/documents/scope.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryDocumentsDb} from './memory-documents-db';
import {cninfoFetchKey,documentScopeRowFor,hkFetchKey,reconcileDocumentScope} from './scope';
import type {DocumentsDb,ListedSource} from './types';

const A='11111111-1111-4111-8111-111111111111',K='33333333-3333-4333-8333-333333333333',H='44444444-4444-4444-8444-444444444444';
const J='55555555-5555-4555-8555-555555555555',X='66666666-6666-4666-8666-666666666666',B='77777777-7777-4777-8777-777777777777';
const TODAY='2026-11-06',NOW_ISO=`${TODAY}T00:00:00.000Z`;
async function seed(){
 const c=memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from']});
 await c.insert('issuers',{issuer_id:A,cik:'1321655',cninfo_org_id:null,hkex_stock_code_primary:null,status:'active'});
 await c.insert('issuers',{issuer_id:K,cik:null,cninfo_org_id:'gssh0600570',hkex_stock_code_primary:null,status:'active'});
 await c.insert('issuers',{issuer_id:H,cik:null,cninfo_org_id:null,hkex_stock_code_primary:'00268',status:'active'});
 await c.insert('issuers',{issuer_id:J,cik:null,cninfo_org_id:null,hkex_stock_code_primary:null,status:'active'});      // SZ, org id unknown
 await c.insert('issuers',{issuer_id:B,cik:null,cninfo_org_id:null,hkex_stock_code_primary:null,status:'active'});      // BJ only
 await c.insert('issuers',{issuer_id:X,cik:null,cninfo_org_id:null,hkex_stock_code_primary:'09999',status:'merged',merged_into:H});
 await c.insert('issuer_securities',{issuer_id:A,ticker:'PLTR',is_primary:true,valid_from:'2020-09-30',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:K,ticker:'600570.SH',is_primary:true,valid_from:'2003-12-16',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:J,ticker:'000001.SZ',is_primary:true,valid_from:'1991-04-03',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:B,ticker:'830799.BJ',is_primary:true,valid_from:'2021-11-15',valid_to:null});
 await c.insert('issuer_securities',{issuer_id:H,ticker:'0268.HK',is_primary:true,valid_from:'2001-02-15',valid_to:null});
 await c.insert('security_universe_memberships',{ticker:'PLTR',universe:'sp500',is_active:true,as_of_date:TODAY});
 await c.insert('security_universe_memberships',{ticker:'PLTR',universe:'watchlist',is_active:true,as_of_date:TODAY});   // not a scope source
 for(const [e,id] of [['e-k',K],['e-h',H],['e-j',J],['e-b',B],['e-x',X]] as const)await c.insert('research_entity_keys',{user_id:'u',entity_id:e,in_scope:true,issuer_id:id});
 await c.insert('research_entity_keys',{user_id:'u',entity_id:'e-none',in_scope:true,issuer_id:null});
 await c.insert('research_entity_keys',{user_id:'u',entity_id:'e-a',in_scope:false,issuer_id:A});
 return c;
}
function recordingDb(){
 const db=memoryDocumentsDb();db.setNow(NOW_ISO);
 const calls:{source:ListedSource;rows:Parameters<DocumentsDb['reconcileScope']>[1]}[]=[];
 const wrapped={...db,reconcileScope:(source:ListedSource,rows:Parameters<DocumentsDb['reconcileScope']>[1])=>{calls.push({source,rows});return db.reconcileScope(source,rows);}};
 return {db:wrapped as typeof db,calls};
}

describe('fetch keys',()=>{
 it('hk: the 5-digit primary code; cninfo: code,orgId with an empty org slot when unknown',()=>{
  expect(hkFetchKey({hkex_stock_code_primary:'00268'})).toBe('00268');
  expect(()=>hkFetchKey({hkex_stock_code_primary:null})).toThrow('missing_hkex_code');
  expect(()=>hkFetchKey({hkex_stock_code_primary:'268'})).toThrow('missing_hkex_code');
  expect(cninfoFetchKey('600570','gssh0600570')).toBe('600570,gssh0600570');
  expect(cninfoFetchKey('000001',null)).toBe('000001,');
  expect(()=>cninfoFetchKey('60057','x')).toThrow('not_cn_code');
 });
});

describe('reconcileDocumentScope',()=>{
 it('edgar: the facts US universes → issuers with a CIK, priority 10',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  const r=await reconcileDocumentScope({tables,db},'edgar',{today:TODAY});
  expect(r).toMatchObject({desired:1,retired:0});
  expect(calls[0]).toEqual({source:'edgar',rows:[{issuer_id:A,reasons:['universe:sp500'],priority:10,fetch_key:'0001321655'}]});
 });
 it('cninfo: in_scope issuers with a current .SH/.SZ listing; .BJ skipped; org id slot empty when unknown',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  const r=await reconcileDocumentScope({tables,db},'cninfo',{today:TODAY});
  expect(r.desired).toBe(2);
  expect(r.skipped).toMatchObject({bj_excluded:1,no_issuer:1,issuer_merged:1,no_cn_ticker:1});
  expect(calls[0].rows).toEqual([
   {issuer_id:K,reasons:['cohort'],priority:10,fetch_key:'600570,gssh0600570'},
   {issuer_id:J,reasons:['cohort'],priority:10,fetch_key:'000001,'},
  ]);
 });
 it('hkexnews: in_scope issuers with hkex_stock_code_primary; merged issuers never enter',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  const r=await reconcileDocumentScope({tables,db},'hkexnews',{today:TODAY});
  expect(r).toMatchObject({desired:1,retired:0,skipped:{issuer_merged:1,no_hkex_code:3,no_issuer:1}});
  expect(calls[0].rows).toEqual([{issuer_id:H,reasons:['cohort'],priority:10,fetch_key:'00268'}]);
  expect((await db.scopeDue('hkexnews',NOW_ISO,10)).map(s=>s.issuer_id)).toEqual([H]);
 });
 it('is idempotent and retires vanished rows with reasons [] and priority 0, keeping the fetch_key',async()=>{
  const tables=await seed();const {db,calls}=recordingDb();
  await reconcileDocumentScope({tables,db},'hkexnews',{today:TODAY});
  await reconcileDocumentScope({tables,db},'hkexnews',{today:TODAY});
  expect(calls[1].rows).toEqual(calls[0].rows);
  await tables.update('research_entity_keys',{user_id:'u',entity_id:'e-h'},{in_scope:false});
  const r=await reconcileDocumentScope({tables,db},'hkexnews',{today:TODAY});
  expect(r).toMatchObject({desired:0,retired:1});
  expect(calls[2].rows).toEqual([{issuer_id:H,reasons:[],priority:0,fetch_key:'00268'}]);
  expect(await db.scopeDue('hkexnews',NOW_ISO,10)).toEqual([]);
  // a retired row is not retired again (priority already 0): nothing to write
  const again=await reconcileDocumentScope({tables,db},'hkexnews',{today:TODAY});
  expect(again).toMatchObject({desired:0,retired:0});
  expect(calls).toHaveLength(3);
 });
});

describe('documentScopeRowFor',()=>{
 it('builds the explicit row per source; null for unknown, merged or keyless issuers',async()=>{
  const tables=await seed();
  expect(await documentScopeRowFor(tables,'hkexnews',H,{today:TODAY})).toEqual({issuer_id:H,reasons:['explicit'],priority:10,fetch_key:'00268'});
  expect(await documentScopeRowFor(tables,'edgar',A,{today:TODAY})).toEqual({issuer_id:A,reasons:['explicit'],priority:10,fetch_key:'0001321655'});
  expect(await documentScopeRowFor(tables,'cninfo',K,{today:TODAY})).toEqual({issuer_id:K,reasons:['explicit'],priority:10,fetch_key:'600570,gssh0600570'});
  expect(await documentScopeRowFor(tables,'cninfo',B,{today:TODAY})).toBeNull();
  expect(await documentScopeRowFor(tables,'hkexnews',X,{today:TODAY})).toBeNull();
  expect(await documentScopeRowFor(tables,'edgar',H,{today:TODAY})).toBeNull();
  expect(await documentScopeRowFor(tables,'hkexnews','99999999-9999-4999-8999-999999999999',{today:TODAY})).toBeNull();
 });
});
