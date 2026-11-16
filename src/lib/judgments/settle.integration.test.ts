// src/lib/judgments/settle.integration.test.ts
// F4 Task 14 (spec §14.3, acceptance 5) on real PostgreSQL: pgJudgmentsDb + pgTableClient, synthetic K-line
// fixtures served through a stub inputs db, the real price_return resolver with a verified capability stub, and a
// hand-built synthetic_price_return@v1 methodology synced through syncMethodology. Cases (in order; they share the
// fixture array and the methodology): two cron passes (inserted > 0, then an empty claim and an idle success);
// void(1) → admin reopened(2) → data arrives → settled(3); settled(1) → withdrawn(2) → reopened(3) → settled(4) with
// calibration validity revision + 1 at each admin transition and no claim while withdrawn (acceptance 5); an
// inconsistency quarantined on real dq tables and voided as unresolved_inconsistency on the next pass (settle_by
// is long past). The database is shared with other suites: every case registers its due judgments AND claims them
// inside withClaimLock (Task 4: pg_advisory_lock(F4_CLAIM_LOCK); Tasks 3/4/16 take the same lock), and claimDue is
// additionally wrapped so only this file's judgments are processed and any other due row is released untouched.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {withClaimLock} from './db-contract';
import type {TableClient} from '../db/table-client';
import {startBatch} from '../dq/batches';
import {pgJudgmentsDb} from './pg-judgments-db';
import {resolverFor} from './resolvers';
import {PRICE_RESOLVER_VERSION,priceReturnResolverWith} from './resolvers/price';
import {runSettle} from './settle';
import type {SettleReceipt} from './settle';
import {TEST_CODE_VERSION,TEST_METHOD,fixtureKline,loadKlineFixture,priceJudgment,stubInputsDb,testMethodologyRow,truncateFixture,verifiedCapability,withOverrides} from './testing/fixtures';
import type {KlineFixture,PriceJudgmentSpec} from './testing/fixtures';
import type {JudgmentsDb,QueueRow,SettlementKind} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const ADMIN=randomUUID();

describe.skipIf(!enabled)('F4 settlement core on real PostgreSQL',()=>{
 let pool:Pool;let db:JudgmentsDb;let tables:TableClient;let batchId:string;
 const mine=new Set<string>();
 const full=loadKlineFixture('synthetic-us-zza.json');
 const fixtures:KlineFixture[]=[full];
 const inputsDb=stubInputsDb({kline:fixtureKline(fixtures),issuerPrimarySecurity:async()=>({ticker:'ZZA',market:'US'})});
 const price=priceReturnResolverWith({capabilityOf:verifiedCapability});
 /** Only this file's judgments are processed; other suites' due rows go back untouched. */
 const ownDb=()=>withOverrides<JudgmentsDb>(db,{async claimDue(limit:number,lease:number){
  const rows=await db.claimDue(limit,lease);const own:QueueRow[]=[];
  for(const r of rows){
   if(mine.has(r.judgment_id))own.push(r);
   else await db.releaseLease(r.judgment_id,r.lease_token!,{last_status:r.last_status??'pending',last_detail:r.last_detail,next_attempt_at:r.next_attempt_at,attempts_increment:0});
  }
  return own;
 }});
 const settle=():Promise<SettleReceipt>=>runSettle({db:ownDb(),inputsDb,tables,codeVersion:TEST_CODE_VERSION,actor:'script',triggeredBy:'script',compensate:null,
  resolverFor:name=>name==='price_return'?price:resolverFor(name)},{deadlineMs:280_000});
 const register=async(spec:Partial<PriceJudgmentSpec>={})=>{
  const {insert,queue}=priceJudgment({baseDate:'2026-01-12',registeredClose:106,batchId,...spec});
  await db.registerJudgment(insert,queue);mine.add(insert.judgment_id);return insert.judgment_id;
 };
 const history=async(id:string)=>(await db.settlementsOf([id])).sort((a,b)=>a.seq-b.seq).map(s=>[s.seq,s.kind,s.reason] as [number,SettlementKind,string|null]);
 const admin=(id:string,kind:'reopened'|'withdrawn',reason:string,seq:number)=>db.appendSettlement(id,null,`it-${kind}-${seq}-${id}`,{kind,outcome:null,realized:null,
  evidence:{note:'settle.integration'},resolver:'price_return',resolver_version:PRICE_RESOLVER_VERSION,reason,actor:`admin:${ADMIN}`,code_version:TEST_CODE_VERSION,batch_id:batchId});
 const revision=async()=>(await db.calibrationValidity(TEST_METHOD.id,TEST_METHOD.version)).revision;

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  pool=new Pool({connectionString:state.adminUrl});
  db=pgJudgmentsDb(pool);tables=pgTableClient(pool);
  ({batchId}=await startBatch(tables,{producer:'ts-judgments',dataset:'judgments.produce.synthetic_price_return',codeVersion:TEST_CODE_VERSION}));
  await db.syncMethodology(testMethodologyRow(),'script','settle.integration');
 });
 afterAll(async()=>{await pool?.end();});

 it('two passes: the first settles every due judgment, the second claims nothing and is an idle success',async()=>withClaimLock(pool,async()=>{
  const a=await register(),b=await register({registeredClose:106.2});
  const first=await settle();
  expect(first).toMatchObject({status:'success',counts:{fetched:2,inserted:2,deferred:0,failed:0}});
  const [s]=await db.settlementsOf([a]);
  expect(s).toMatchObject({seq:1,kind:'settled',outcome:'hit',resolver:'price_return',resolver_version:PRICE_RESOLVER_VERSION,actor:'script',batch_id:first.batchId,request_key:`${first.batchId}:${a}:1`});
  expect(s.realized).toMatchObject({unit:'ratio',from:'2026-01-12',to:'2026-01-20',label_policy:'first_observed'});
  expect(s.realized?.value).toBeCloseTo(111/106-1,12);
  expect((s.evidence as {bars:unknown[]}).bars).toHaveLength(11);
  expect((await db.queueRow(a))?.closed_at).not.toBeNull();expect((await db.queueRow(b))?.closed_at).not.toBeNull();
  const second=await settle();
  expect(second).toMatchObject({status:'success',idle:true,counts:{fetched:0}});
  expect((await tables.select('ingest_batches',{batch_id:second.batchId!},{limit:1}))[0]).toMatchObject({status:'success',dataset:'judgments.settle',triggered_by:'script'});
  expect((await tables.select('dq_freshness',{dataset:'judgments.settle'},{limit:1}))[0]).toMatchObject({status:'fresh',expected_cadence:'daily'});
 }));

 it('void(1) → admin reopened(2) → the missing bars arrive → settled(3)',async()=>withClaimLock(pool,async()=>{
  try{
   fixtures[0]=truncateFixture(full,'2026-01-16');
   const id=await register();
   await settle();                                                     // settle_by 2026-03-18 is past: Pending → void
   expect(await history(id)).toEqual([[1,'void','no_data:awaiting_bars']]);
   expect((await db.queueRow(id))?.closed_at).not.toBeNull();
   expect(await admin(id,'reopened','data_backfilled',2)).toEqual({seq:2,status:'applied'});
   expect(await db.queueRow(id)).toMatchObject({closed_at:null});
   fixtures[0]=full;
   const r=await settle();
   expect(r.counts).toMatchObject({fetched:1,inserted:1});
   expect(await history(id)).toEqual([[1,'void','no_data:awaiting_bars'],[2,'reopened','data_backfilled'],[3,'settled',null]]);
   expect((await db.settlementsOf([id])).find(x=>x.seq===3)?.request_key).toBe(`${r.batchId}:${id}:3`);
  }finally{fixtures[0]=full;}
 }));

 it('acceptance 5: settled(1) → withdrawn(2) → reopened(3) → settled(4); each admin transition bumps validity.revision; a withdrawn judgment is not claimed',async()=>withClaimLock(pool,async()=>{
  const id=await register();
  await settle();
  expect(await history(id)).toEqual([[1,'settled',null]]);
  const rev0=await revision();
  expect(await admin(id,'withdrawn','correction',2)).toEqual({seq:2,status:'applied'});
  expect(await revision()).toBe(rev0+1);
  const idle=await settle();
  expect(idle.items.some(i=>i.judgment_id===id)).toBe(false);
  expect(await admin(id,'reopened','resettle_after_correction',3)).toEqual({seq:3,status:'applied'});
  expect(await revision()).toBe(rev0+2);
  const r=await settle();
  expect(await history(id)).toEqual([[1,'settled',null],[2,'withdrawn','correction'],[3,'reopened','resettle_after_correction'],[4,'settled',null]]);
  expect((await db.settlementsOf([id])).find(x=>x.seq===4)?.request_key).toBe(`${r.batchId}:${id}:4`);
  expect(await admin(id,'withdrawn','correction',2)).toEqual({seq:2,status:'already_applied'});   // request_key replay converges
 }));

 it('basis mismatch → quarantined on the real dq tables through quarantine_settlement (partial); after the review window the next pass voids it as unresolved_inconsistency',async()=>withClaimLock(pool,async()=>{
  const id=await register({registeredClose:107});
  const r=await settle();
  expect(r).toMatchObject({status:'partial',counts:{fetched:1,quarantined:1}});
  const [item]=await tables.select('dq_quarantine',{dataset:'judgments',natural_key:id},{limit:1});
  expect(item).toMatchObject({table_name:'judgment_settlements',reason_code:'settlement_basis_mismatch',status:'open',batch_id:r.batchId});
  expect((item.payload as {evidence_hash:string}).evidence_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(await db.queueRow(id)).toMatchObject({last_status:'inconsistent',last_detail:{reason_code:'settlement_basis_mismatch',incident:{quarantine_id:item.id,reason_code:'settlement_basis_mismatch'}}});
  // Q1-02: item and queue were published by ONE quarantine_settlement transaction, so they name the same evidence
  const p0=item.payload as {evidence_hash:string;cutoff:string};
  expect((await db.queueRow(id))!.last_detail).toMatchObject({evidence_hash:p0.evidence_hash,cutoff:p0.cutoff,incident:{evidence_hash:p0.evidence_hash,cutoff:p0.cutoff}});
  await settle();
  expect(await history(id)).toEqual([]);   // inside the 7-day review window (REVIEW_WINDOW_DAYS): not voided yet
  // Simulate the review window elapsing (owner connection; the table has no client write grants).
  await pool.query(`update public.judgment_settle_queue set next_attempt_at=now(), last_detail=jsonb_set(last_detail,'{incident,quarantined_at}',to_jsonb(to_char((now()-interval '8 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where judgment_id=$1`,[id]);
  await settle();
  expect(await history(id)).toEqual([[1,'void','unresolved_inconsistency']]);
  expect((await tables.select('dq_quarantine',{id:item.id as string},{limit:1}))[0].status).toBe('open');
 }));
});
