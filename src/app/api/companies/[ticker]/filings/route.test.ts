import {randomUUID} from 'node:crypto';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {factInsert,filingInsert} from '@/lib/facts/db-contract';
import {memorySnapshotReader} from '@/lib/company/snapshot-read';
// src/app/api/companies/[ticker]/filings/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {KitDeps} from '@/lib/company/route-test-kit';

const mocks=vi.hoisted(()=>({deps:null as unknown as KitDeps,requireAdmin:vi.fn()}));
vi.mock('@/lib/company/deps',()=>({productionReadDeps:()=>mocks.deps}));
vi.mock('@/lib/admin/auth',()=>{class AdminUnauthenticated extends Error{}class AdminForbidden extends Error{}return {AdminUnauthenticated,AdminForbidden,requireAdminUser:mocks.requireAdmin};});

import {GET} from './route';
import {GET as ADMIN_GET} from '../../../admin/companies/[ticker]/filings/route';
import {US,OLD,emptySnapshot,makeDeps,seededTables,summary} from '@/lib/company/route-test-kit';

const get=(h:typeof GET,ticker:string,qs:string)=>h(new Request(`https://alpha.example/api/companies/${ticker}/filings?${qs}`),{params:Promise.resolve({ticker})});

describe('GET /api/companies/[ticker]/filings',()=>{
 beforeEach(async()=>{vi.clearAllMocks();mocks.deps=makeDeps(await seededTables());mocks.requireAdmin.mockResolvedValue({id:'u'});});
 it('one snapshot read (filings independent of the facts limit), newest first, asOf echoed only when given',async()=>{
  const older=summary({filingId:'f0000000-0000-4000-8000-00000000000a',availableDate:'2023-02-03'}),newer=summary();
  (mocks.deps.snapshot as ReturnType<typeof vi.fn>).mockResolvedValue(emptySnapshot({stateRev:3,filings:[older,newer]}));
  const res=await get(GET,'AAPL','asOf=2024-06-30');
  const body=await res.json();
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(US,'US',{concepts:['revenue'],asOf:'2024-06-30',history:false,limit:1});
  expect(body).toMatchObject({issuerId:US,ticker:'AAPL',market:'US',asOf:'2024-06-30',stateRev:3});
  expect(body.filings.map((f:{filingId:string})=>f.filingId)).toEqual([newer.filingId,older.filingId]);
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(1);
  expect(body.lineage).toEqual([US]);
  expect(body.stateRevs).toEqual([{issuer_id:US,state_rev:3}]);
  expect((await (await get(GET,'AAPL','')).json()).asOf).toBeNull();
 });
 it('reads predecessor filings through the resolved successor for both ticker aliases',async()=>{
  const old=summary({filingId:'old-filing',availableDate:'2022-02-03',factCount:24});
  const current=summary();
  vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValue([US,OLD]);
  vi.mocked(mocks.deps.facts.stateRevs).mockResolvedValue([{issuer_id:US,state_rev:3},{issuer_id:OLD,state_rev:7}]);
  vi.mocked(mocks.deps.snapshot).mockImplementation(async(id)=>emptySnapshot({stateRev:id===OLD?7:3,filings:[id===OLD?old:current]}));
  for(const ticker of ['AAPL','OLDX']){
   const res=await get(GET,ticker,'asOf=2024-06-30');
   expect(res.status).toBe(200);
   const body=await res.json();
   expect(body).toMatchObject({issuerId:US,stateRev:3,lineage:[US,OLD],stateRevs:[{issuer_id:US,state_rev:3},{issuer_id:OLD,state_rev:7}]});
   expect(body.filings).toEqual([current,old]);
  }
  expect(mocks.deps.snapshot).toHaveBeenCalledWith(OLD,'US',{concepts:['revenue'],asOf:'2024-06-30',history:false,limit:1});
 });
 it('retries a changed predecessor revision and never returns the first mixed read',async()=>{
  vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValue([US,OLD]);
  const vector=(rev:number)=>[{issuer_id:US,state_rev:3},{issuer_id:OLD,state_rev:rev}];
  vi.mocked(mocks.deps.facts.stateRevs).mockResolvedValueOnce(vector(7)).mockResolvedValue(vector(8));
  let oldReads=0;
  vi.mocked(mocks.deps.snapshot).mockImplementation(async(id)=>id===OLD
   ?emptySnapshot({stateRev:++oldReads===1?7:8,filings:[summary({filingId:oldReads===1?'mixed':'stable'})]})
   :emptySnapshot({stateRev:3}));
  const res=await get(GET,'AAPL','');
  expect(res.status).toBe(200);
  expect((await res.json()).filings.map((f:{filingId:string})=>f.filingId)).toEqual(['stable']);
  expect(oldReads).toBe(2);
 });
 it('rejects ongoing lineage membership churn with no cacheable partial filings',async()=>{
  let reads=0;
  vi.mocked(mocks.deps.facts.lineageOf).mockImplementation(async()=>++reads%2?[US,OLD]:[US]);
  vi.mocked(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({stateRev:3,filings:[summary()]}));
  const res=await get(GET,'AAPL','');
  expect(res.status).toBe(503);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect((await res.json()).error.code).toBe('lineage_unstable');
  expect(reads).toBeLessThanOrEqual(6);
 });
 it('uses real member snapshots: published/asOf filters, fact counts and all filings survive the facts limit',async()=>{
  const db=memoryFactsDb();
  const expected:string[]=[];
  for(const id of [US,OLD]){
   const batch=randomUUID();
   await db.reconcileScope('US',[{issuer_id:id,reasons:[],priority:1,fetch_key:id}]);
   await db.claimLease(id,'US',batch,600);
   const run=await db.beginRun(id,'US',batch,1);
   const filings=[filingInsert(id,{availableDate:'2024-02-01'}),filingInsert(id,{availableDate:'2024-03-01'}),filingInsert(id,{availableDate:'2025-01-01'})];
   await db.stageFilings(run,filings);
   await db.stageFacts(run,[factInsert(id,filings[0]),factInsert(id,filings[0],{concept:'net_income_parent',value:'7'})]);
   await db.publishRun(run,filings.map(f=>f.filing_id));
   // A staged (unpublished) filing must not appear even with an early available date.
   const stagedRun=await db.beginRun(id,'US',batch,1);
   await db.stageFilings(stagedRun,[filingInsert(id,{availableDate:'2024-01-01'})]);
   expected.push(...filings.slice(0,2).map(f=>f.filing_id));
  }
  db.setTopology({[US]:{status:'active',merged_into:null},[OLD]:{status:'merged',merged_into:US}});
  mocks.deps.facts=db;
  mocks.deps.snapshot=memorySnapshotReader(db);
  for(const handler of [GET,ADMIN_GET]){
   const res=await get(handler,'OLDX','asOf=2024-06-30');
   const body=await res.json();
   expect(res.status).toBe(200);
   expect(body.filings.map((f:{filingId:string})=>f.filingId).sort()).toEqual(expected.sort());
   expect(body.filings.map((f:{factCount:number})=>f.factCount).sort()).toEqual([0,0,2,2]);
   expect(body.filings).toEqual([...body.filings].sort((a,b)=>b.availableDate.localeCompare(a.availableDate)||b.filingId.localeCompare(a.filingId)));
   expect(body.stateRev).toBe(1);
   expect(body.stateRevs).toEqual([{issuer_id:US,state_rev:1},{issuer_id:OLD,state_rev:1}]);
  }
 });
 it('rejects snapshots that disagree with a stable revision vector',async()=>{
  vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValue([US,OLD]);
  vi.mocked(mocks.deps.facts.stateRevs).mockResolvedValue([{issuer_id:US,state_rev:3},{issuer_id:OLD,state_rev:8}]);
  vi.mocked(mocks.deps.snapshot).mockImplementation(async(id)=>emptySnapshot({stateRev:id===OLD?7:3,filings:[summary()]}));
  const res=await get(ADMIN_GET,'OLDX','');
  expect(res.status).toBe(503);
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  const body=await res.json();
  expect(body.error.code).toBe('lineage_unstable');
  expect(body.filings).toBeUndefined();
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(6);
 });
 it('retries when a single issuer gains a predecessor while reading',async()=>{
  vi.mocked(mocks.deps.facts.lineageOf).mockResolvedValueOnce([US]).mockResolvedValue([US,OLD]);
  vi.mocked(mocks.deps.snapshot).mockResolvedValue(emptySnapshot({stateRev:3,filings:[summary()]}));
  const res=await get(GET,'AAPL','');
  expect(res.status).toBe(200);
  expect((await res.json()).lineage).toEqual([US,OLD]);
  expect(mocks.deps.snapshot).toHaveBeenCalledTimes(3);
 });
 it('HK → 404 market_not_served; admin twin is private, no-store',async()=>{
  const hk=await get(GET,'00700.HK','');expect(hk.status).toBe(404);expect((await hk.json()).error.code).toBe('market_not_served');
  expect((await get(ADMIN_GET,'AAPL','')).headers.get('cache-control')).toBe('private, no-store');
 });
});
