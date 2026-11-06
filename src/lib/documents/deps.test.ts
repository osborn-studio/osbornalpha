// src/lib/documents/deps.test.ts
// Production wiring (Task 8): adapter and request gap per source, extraForms de-duplication,
// allAnnouncements pass-through, deadline-bounded transport, dry-run scope plan parity (T8-01/T8-02).
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({edgar:vi.fn(),cninfo:vi.fn(),hkex:vi.fn(),http:vi.fn()}));
vi.mock('./sources/edgar',async()=>({...(await vi.importActual<object>('./sources/edgar')),edgarAdapter:mocks.edgar}));
vi.mock('./sources/cninfo',async()=>({...(await vi.importActual<object>('./sources/cninfo')),cninfoAdapter:mocks.cninfo}));
vi.mock('./sources/hkexnews',async()=>({...(await vi.importActual<object>('./sources/hkexnews')),hkexnewsAdapter:mocks.hkex}));
vi.mock('./sources/shared',async()=>({...(await vi.importActual<object>('./sources/shared')),politeHttp:mocks.http}));

import {memoryTableClient} from '../db/memory-table-client';
import {BUDGET_RESERVE_MS} from './sources/shared';
import {EDGAR_DOC_FORMS,EDGAR_INTERVAL_MS} from './sources/edgar';
import {CNINFO_INTERVAL_MS} from './sources/cninfo';
import {HKEX_INTERVAL_MS} from './sources/hkexnews';
import {REQUEST_CAP_MS,SOURCE_INTERVAL_MS,deadlineFetch,documentsCodeVersion,planScheduledIssuers,productionDocumentsDeps} from './deps';
import {memoryDocumentsDb} from './memory-documents-db';

const SHA='a'.repeat(40);
const fakeAdmin=()=>({from:vi.fn(),rpc:vi.fn(),storage:{from:vi.fn()}}) as never;
const env={...process.env};

describe('productionDocumentsDeps',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.http.mockReturnValue({userAgentFor:()=>'ua',fetchBytes:vi.fn(),request:vi.fn(),getText:vi.fn(),postForm:vi.fn()});
  mocks.edgar.mockReturnValue({source:'edgar'});mocks.cninfo.mockReturnValue({source:'cninfo'});mocks.hkex.mockReturnValue({source:'hkexnews'});
 });
 const base=()=>({deadline:null,codeVersion:SHA,admin:fakeAdmin()});
 it('wires the adapter of each source with that source\'s request gap on one shared PoliteHttp',()=>{
  expect(SOURCE_INTERVAL_MS).toEqual({edgar:EDGAR_INTERVAL_MS,cninfo:CNINFO_INTERVAL_MS,hkexnews:HKEX_INTERVAL_MS});
  const e=productionDocumentsDeps('edgar',base());
  expect(mocks.http.mock.calls[0][0].minIntervalMs).toBe(120);expect(mocks.edgar).toHaveBeenCalledOnce();expect(e.adapter).toEqual({source:'edgar'});
  expect(e.userAgent).toBe('ua');expect(e.codeVersion).toBe(SHA);expect(e.deadline).toBeNull();
  productionDocumentsDeps('cninfo',base());
  expect(mocks.http.mock.calls[1][0].minIntervalMs).toBe(500);expect(mocks.cninfo).toHaveBeenCalledOnce();
  productionDocumentsDeps('hkexnews',base());
  expect(mocks.http.mock.calls[2][0].minIntervalMs).toBe(1000);expect(mocks.hkex).toHaveBeenCalledOnce();
  expect(mocks.cninfo.mock.calls[0][0].http).toBe(mocks.http.mock.results[1].value);
 });
 it('edgar: extraForms are added to the default forms once, de-duplicated',()=>{
  productionDocumentsDeps('edgar',{...base(),extraForms:['SC 13D','10-K','SC 13D']});
  const forms:string[]=mocks.edgar.mock.calls[0][0].forms;
  expect(forms).toEqual([...EDGAR_DOC_FORMS,'SC 13D']);expect(new Set(forms).size).toBe(forms.length);
 });
 it('allAnnouncements reaches cninfo and hkexnews, and is not passed to edgar',()=>{
  productionDocumentsDeps('cninfo',{...base(),allAnnouncements:true});
  productionDocumentsDeps('hkexnews',{...base(),allAnnouncements:true});
  productionDocumentsDeps('hkexnews',base());
  expect(mocks.cninfo.mock.calls[0][0].allAnnouncements).toBe(true);
  expect(mocks.hkex.mock.calls[0][0].allAnnouncements).toBe(true);expect(mocks.hkex.mock.calls[1][0].allAnnouncements).toBeUndefined();
  productionDocumentsDeps('edgar',{...base(),allAnnouncements:true});
  expect(mocks.edgar.mock.calls[0][0]).not.toHaveProperty('allAnnouncements');
 });
});

describe('documentsCodeVersion',()=>{
 afterEach(()=>{process.env={...env};});
 it('is the facts rule: a full sha from the env; cron (allowGit false) never falls back to git',()=>{
  process.env.VERCEL_GIT_COMMIT_SHA=SHA;expect(documentsCodeVersion({allowGit:false})).toBe(SHA);expect(documentsCodeVersion()).toBe(SHA);
  delete process.env.VERCEL_GIT_COMMIT_SHA;expect(documentsCodeVersion({allowGit:false})).toBeNull();expect(documentsCodeVersion()).toBeNull();
 });
});

describe('deadlineFetch (T8-02)',()=>{
 const stall:typeof fetch=(_i,init)=>new Promise((_,rej)=>{init?.signal?.addEventListener('abort',()=>rej(init.signal?.reason??new Error('aborted')));});
 afterEach(()=>vi.useRealTimers());
 it('aborts a stalled request at the per-request cap and surfaces a TimeoutError',async()=>{
  vi.useFakeTimers();
  const f=deadlineFetch(stall,new Date(Date.now()+240_000));
  const p=f('https://x.test/rpc/y',{method:'POST'});const assertion=expect(p).rejects.toMatchObject({name:'TimeoutError',message:'request_timeout'});
  await vi.advanceTimersByTimeAsync(REQUEST_CAP_MS-1);
  await vi.advanceTimersByTimeAsync(2);await assertion;
 });
 it('near the deadline the budget minus the 20 s reserve wins over the cap; with none left the transport is not called',async()=>{
  vi.useFakeTimers();
  const base=vi.fn(stall);
  const f=deadlineFetch(base,new Date(Date.now()+BUDGET_RESERVE_MS+5_000));
  const p=f('https://x.test/storage/upload');const assertion=expect(p).rejects.toMatchObject({name:'TimeoutError'});
  await vi.advanceTimersByTimeAsync(5_001);await assertion;
  await expect(f('https://x.test/again')).rejects.toMatchObject({name:'TimeoutError',message:'request_deadline'});
  expect(base).toHaveBeenCalledTimes(1);
 });
 it('passes a fast response through and does not leave a timer behind; a caller abort is not rewritten',async()=>{
  vi.useFakeTimers();
  const ok=new Response('{}');
  const f=deadlineFetch(async()=>ok,new Date(Date.now()+240_000));
  expect(await f('https://x.test')).toBe(ok);expect(vi.getTimerCount()).toBe(0);
  const ctl=new AbortController();const g=deadlineFetch(stall,new Date(Date.now()+240_000));
  const p=g('https://x.test',{signal:ctl.signal});const a=expect(p).rejects.toMatchObject({message:'caller'});
  ctl.abort(new Error('caller'));await a;
 });
});

describe('planScheduledIssuers: dry-run lists what apply would process (T8-01)',()=>{
 const H='44444444-4444-4444-8444-444444444444',Z='55555555-5555-4555-8555-555555555555';
 const NOW=new Date('2026-11-06T00:00:00.000Z');
 async function tables(){
  const c=memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from']});
  await c.insert('issuers',{issuer_id:H,cik:null,cninfo_org_id:null,hkex_stock_code_primary:'00268',status:'active'});
  await c.insert('issuers',{issuer_id:Z,cik:null,cninfo_org_id:null,hkex_stock_code_primary:'00700',status:'active'});
  await c.insert('issuer_securities',{issuer_id:H,ticker:'0268.HK',is_primary:true,valid_from:'2001-02-15',valid_to:null});
  await c.insert('research_entity_keys',{user_id:'u',entity_id:'e-h',in_scope:true,issuer_id:H});
  return c;
 }
 it('empty scope: the eligible issuer is planned (apply would create the row and list it); nothing is written',async()=>{
  const db=memoryDocumentsDb();db.setNow(NOW.toISOString());const t=await tables();
  const ids=await planScheduledIssuers({tables:t,db},'hkexnews',{limit:25,now:NOW});
  expect(ids).toEqual([H]);
  expect(await db.scopeAll('hkexnews')).toEqual([]);
 });
 it('retired scope: a stored row no longer wanted is excluded, as apply (which retires it first) would; the limit applies',async()=>{
  const db=memoryDocumentsDb();db.setNow(NOW.toISOString());const t=await tables();
  await db.reconcileScope('hkexnews',[{issuer_id:H,reasons:['cohort'],priority:10,fetch_key:'00268'},{issuer_id:Z,reasons:['cohort'],priority:10,fetch_key:'00700'}]);
  const ids=await planScheduledIssuers({tables:t,db},'hkexnews',{limit:25,now:NOW});
  expect(ids).toEqual([H]);                                    // Z is retired by the real reconcile
  expect((await db.scopeAll('hkexnews')).find(r=>r.issuer_id===Z)?.priority).toBe(10);   // dry-run did not retire it
  expect(await planScheduledIssuers({tables:t,db},'hkexnews',{limit:0,now:NOW})).toEqual([]);
 });
});
