// src/lib/judgments/settle.test.ts
// F4 Task 12 (spec §7.1, §7.2, §5.4, §7.5, §14.1 settle bullets, acceptance 3 and 6) on memoryJudgmentsDb: one test
// per state-machine row (incl. the late void, cutoff_vintage before/after settle_by, unresolved_inconsistency and
// the override path), backoff formulas, lease_lost, append statuses, request_key format, batches of 20 with ≤ 4
// in flight, the 200 s / budget stop rules, signal propagation, repair_stale_batches, deferred counts, freshness,
// preview, compensation info codes, and the real price_return resolver over the synthetic fixture.
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {startBatch} from '@/lib/dq/batches';
import type {CompensationReport} from './compensate';
import {REGISTRY} from './registry';
import {JudgmentError} from './errors';
import {memoryJudgmentsDb} from './memory-judgments-db';
import {priceReturnResolverWith} from './resolvers/price';
import {MAX_FETCH_MS} from './resolvers';
import {BATCH_SIZE,DAY_MS,LEASE_SECONDS,REVIEW_WINDOW_DAYS,STALE_BATCH_SECONDS,backoff,decide,incidentOf,isUnresolvedInconsistency,planOf,predicateHolds,reviewDeadline,runSettle,settleNow,settleOne} from './settle';
import type {SettleDeps} from './settle';
import {TEST_CODE_VERSION,fixtureKline,loadKlineFixture,priceJudgment,stubInputsDb,stubResolver,testMethodologyRow,truncateFixture,verifiedCapability,withOverrides} from './testing/fixtures';
import type {KlineFixture,PriceJudgmentSpec} from './testing/fixtures';
import type {JudgmentsDb,QuarantineOverride,QueueRow,ResolveContext,Resolver,ResolverResult} from './types';

const T0='2026-03-02T04:00:00.000Z';
const BASE='2026-01-12',SETTLE_BY='2026-03-18T00:00:00.000Z',AFTER='2026-03-19T03:00:00.000Z';
const LABEL='2026-01-20T21:00:00.000Z';
const ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const at=(iso:string,ms:number)=>new Date(Date.parse(iso)+ms).toISOString();
const resolved=(over:Partial<Extract<ResolverResult,{status:'resolved'}>>={}):ResolverResult=>({status:'resolved',value:0.05,unit:'ratio',from:BASE,to:'2026-01-20',label_available_at:LABEL,evidence:{probe:1},...over});
const INC:ResolverResult={status:'inconsistent',reason_code:'settlement_basis_mismatch',detail:{registered_bar:{close:107},refetched_bar:{close:106},source:'eastmoney'},evidence:{bars:[1,2,3]},evidence_hash:'e'.repeat(64)};

async function harness(now=T0){
 const tables=memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id'],dq_freshness:['dataset']});
 const db=memoryJudgmentsDb({tables});db.setNow(now);
 await db.syncMethodology(testMethodologyRow(),'script',null);
 const {batchId}=await startBatch(tables,{producer:'ts-judgments',dataset:'judgments.produce.synthetic_price_return',codeVersion:TEST_CODE_VERSION});
 const register=async(spec:Partial<PriceJudgmentSpec>={})=>{const {insert,queue}=priceJudgment({baseDate:BASE,registeredClose:106,batchId,...spec});await db.registerJudgment(insert,queue);return insert.judgment_id;};
 const deps=(resolver:Resolver,over:Partial<SettleDeps>={}):SettleDeps=>({db,inputsDb:stubInputsDb(),tables,codeVersion:TEST_CODE_VERSION,actor:'cron',triggeredBy:'cron',compensate:null,resolverFor:()=>resolver,...over});
 const settlements=async(id:string)=>(await db.settlementsOf([id])).sort((a,b)=>a.seq-b.seq);
 const queue=(id:string)=>db.queueRow(id);
 return {tables,db,batchId,register,deps,settlements,queue};
}
const scripted=(r:ResolverResult|(()=>ResolverResult))=>vi.fn(async(_ctx:ResolveContext)=>typeof r==='function'?r():r);

describe('settle state machine (spec §7.2)',()=>{
 it('Resolved, first_observed, label ≤ settle_by → settled (hit/miss by the predicate); request_key <batch>:<judgment>:<seq>; queue closed',async()=>{
  const h=await harness();const id=await h.register();const missId=await h.register({predicate:{op:'>',rhs:0.1}});
  const resolve=scripted(resolved());
  const r=await runSettle(h.deps(stubResolver(resolve)));
  expect(r).toMatchObject({status:'success',idle:false,preview:false});
  expect(r.counts).toMatchObject({fetched:2,inserted:2,versioned:0,deferred:0,failed:0,quarantined:0,duplicates:0});
  expect(resolve.mock.calls[0][0]).toMatchObject({cutoff:T0,now:T0});
  const [s]=await h.settlements(id);
  expect(s).toMatchObject({seq:1,kind:'settled',outcome:'hit',reason:null,actor:'cron',resolver:'price_return',resolver_version:'stub/1',request_key:`${r.batchId}:${id}:1`,batch_id:r.batchId,code_version:TEST_CODE_VERSION});
  expect(s.realized).toEqual({value:0.05,unit:'ratio',from:BASE,to:'2026-01-20',label_policy:'first_observed'});
  expect(s.evidence).toMatchObject({probe:1,observed_at:T0,cutoff:T0,label_available_at:LABEL});
  expect((await h.settlements(missId))[0]).toMatchObject({kind:'settled',outcome:'miss'});
  expect((await h.queue(id))?.closed_at).not.toBeNull();
  const [batch]=await h.tables.select('ingest_batches',{batch_id:r.batchId!},{limit:1});
  expect(batch).toMatchObject({status:'success',dataset:'judgments.settle',producer:'ts-judgments',triggered_by:'cron'});
 });
 it('Resolved with label_available_at > settle_by → void(no_data:late) judged by availability, not run time',async()=>{
  const h=await harness();const id=await h.register();
  const r=await runSettle(h.deps(stubResolver(scripted(resolved({label_available_at:'2026-03-18T00:00:00.001Z'})))));
  expect(r.counts).toMatchObject({versioned:1,inserted:0});
  expect((await h.settlements(id))[0]).toMatchObject({kind:'void',outcome:null,realized:null,reason:'no_data:late',evidence:{label_available_at:'2026-03-18T00:00:00.001Z',settle_by:SETTLE_BY}});
  expect(r.errors).toContainEqual({code:'voided_summary',message:JSON.stringify({'no_data:late':1})});
 });
 it('cutoff_vintage before settle_by → the resolver is NOT run, queue pending until settle_by; at/after settle_by → resolved with cutoff = settle_by and settled (P1-03)',async()=>{
  const h=await harness();const id=await h.register({labelPolicy:'cutoff_vintage'});
  const resolve=scripted(resolved());
  const r1=await runSettle(h.deps(stubResolver(resolve)));
  expect(r1.counts).toMatchObject({fetched:1,deferred:1,inserted:0});
  expect(resolve).not.toHaveBeenCalled();
  expect(await h.settlements(id)).toEqual([]);
  expect(await h.queue(id)).toMatchObject({last_status:'pending',next_attempt_at:SETTLE_BY,attempts:0,closed_at:null,last_detail:{reason:'cutoff_vintage',estimated_at:SETTLE_BY}});
  h.db.setNow(AFTER);
  await runSettle(h.deps(stubResolver(resolve)));
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(resolve.mock.calls[0][0]).toMatchObject({cutoff:SETTLE_BY,now:AFTER});
  expect((await h.settlements(id))[0]).toMatchObject({kind:'settled',realized:{label_policy:'cutoff_vintage'},evidence:{cutoff:SETTLE_BY,observed_at:AFTER}});
 });
 it('cutoff_vintage + override: never used before settle_by; used at settle_by only when produced at cutoff = settle_by (P1-03)',async()=>{
  const h=await harness(SETTLE_BY);const id=await h.register({labelPolicy:'cutoff_vintage'});
  await runSettle(h.deps(stubResolver(scripted(INC))));                                   // resolved at cutoff = settle_by → quarantined
  const item=h.tables.rows('dq_quarantine')[0];
  expect(item.payload).toMatchObject({cutoff:SETTLE_BY,evidence_hash:'e'.repeat(64)});
  const override:QuarantineOverride={reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:'e'.repeat(64),evidence:{bars:[1,2,3]}},evidence_hash:'e'.repeat(64),resolved_by:ADMIN,at:SETTLE_BY,cutoff:SETTLE_BY};
  expect(await h.db.applyQuarantineOverride(id,override,String(item.id),{action:'dq.quarantine_resolve'})).toBe('applied');
  const resolve=scripted(INC);
  const fromOverride=vi.fn(()=>resolved({label_available_at:'2026-03-10T00:00:00.000Z',evidence:{bars:[1,2,3],override:{reason_code:'settlement_basis_mismatch'}}}));
  h.db.setNow(at(SETTLE_BY,-DAY_MS));                                                       // before settle_by (admin "settle now" ignores due-ness): no settlement, no override use
  expect(await settleNow(h.deps(stubResolver(resolve,{fromOverride})),id,{actor:`admin:${ADMIN}`,requestKey:'adm:p103-early'})).toMatchObject({outcome:'deferred',reason:'cutoff_vintage',seq:null});
  expect(fromOverride).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();
  expect(await h.settlements(id)).toEqual([]);
  h.db.setNow(SETTLE_BY);
  const r=await runSettle(h.deps(stubResolver(resolve,{fromOverride})));
  expect(fromOverride).toHaveBeenCalledTimes(1);expect(resolve).not.toHaveBeenCalled();
  expect(r.counts.inserted).toBe(1);
  expect((await h.settlements(id))[0]).toMatchObject({kind:'settled',realized:{label_policy:'cutoff_vintage'},evidence:{cutoff:SETTLE_BY}});
 });
 it('planOf: cutoff per policy, early defer, override matched on reason_code + evidence_hash, wrong-cutoff override discarded (P1-03, P1-04)',()=>{
  const o=(cutoff:string,hash='e'.repeat(64)):QuarantineOverride=>({reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:hash,evidence:{}},evidence_hash:hash,resolved_by:ADMIN,at:T0,cutoff});
  const attempt={reason_code:'settlement_basis_mismatch',evidence_hash:'e'.repeat(64),cutoff:T0};
  const row=(over:Partial<QueueRow>):QueueRow=>({judgment_id:'j',settle_after:'2026-02-16T00:00:00.000Z',settle_by:SETTLE_BY,label_policy:'first_observed',next_attempt_at:T0,attempts:0,last_status:'inconsistent',
   last_detail:{...attempt,incident:{...attempt,quarantine_id:'00000000-0000-4000-8000-0000000000aa',quarantined_at:T0}},leased_until:null,lease_token:null,override:null,closed_at:null,updated_at:T0,...over});
  expect(planOf(row({}),T0)).toEqual({cutoff:T0,early:false,viaOverride:false,overrideDiscarded:false});
  expect(planOf(row({override:o('2026-01-01T00:00:00.000Z')}),T0)).toMatchObject({viaOverride:true});            // first_observed: cutoff not compared
  expect(planOf(row({override:o(T0,'f'.repeat(64))}),T0)).toMatchObject({viaOverride:false,overrideDiscarded:false}); // another inconsistency
  expect(planOf(row({override:o(T0),last_status:'pending'}),T0).viaOverride).toBe(true);                         // R3-01: a transient status keeps the open incident
  expect(planOf(row({override:o(T0),last_detail:attempt}),T0).viaOverride).toBe(false);                            // no open incident → no match
  const v=(over:Partial<QueueRow>)=>row({label_policy:'cutoff_vintage',...over});
  expect(planOf(v({override:o(SETTLE_BY)}),T0)).toEqual({cutoff:SETTLE_BY,early:true,viaOverride:false,overrideDiscarded:false});
  expect(planOf(v({override:o(SETTLE_BY)}),AFTER)).toEqual({cutoff:SETTLE_BY,early:false,viaOverride:true,overrideDiscarded:false});
  expect(planOf(v({override:o(T0)}),AFTER)).toEqual({cutoff:SETTLE_BY,early:false,viaOverride:false,overrideDiscarded:true});
 });
 it('Resolved with a label after the observation cutoff (first_observed: now) → not settled, deferred until the label time (P1-07)',async()=>{
  const h=await harness();const id=await h.register();
  const r=await runSettle(h.deps(stubResolver(scripted(resolved({label_available_at:at(T0,3*DAY_MS)})))));
  expect(r.counts).toMatchObject({inserted:0,deferred:1});
  expect(await h.settlements(id)).toEqual([]);
  expect(await h.queue(id)).toMatchObject({last_status:'pending',last_detail:{reason:'label_after_cutoff',estimated_at:at(T0,3*DAY_MS)},next_attempt_at:at(T0,DAY_MS*1.5)});
 });
 it('Pending with now ≤ settle_by → backoff max(1 d, (estimate − now)/2), attempts unchanged, deferred + pending_summary',async()=>{
  const h=await harness();const id=await h.register();
  const r=await runSettle(h.deps(stubResolver(scripted({status:'pending',reason:'awaiting_bars',estimated_at:at(T0,10*DAY_MS)}))));
  expect(r).toMatchObject({status:'success',counts:{fetched:1,deferred:1}});
  expect(r.errors).toContainEqual({code:'pending_summary',message:JSON.stringify({awaiting_bars:1})});
  expect(await h.queue(id)).toMatchObject({last_status:'pending',next_attempt_at:at(T0,5*DAY_MS),attempts:0,last_detail:{reason:'awaiting_bars',estimated_at:at(T0,10*DAY_MS)}});
 });
 it('Pending or Unavailable with now > settle_by → void(no_data:<reason>)',async()=>{
  const h=await harness(AFTER);const a=await h.register();
  await runSettle(h.deps(stubResolver(scripted({status:'pending',reason:'awaiting_bars'}))));
  expect((await h.settlements(a))[0]).toMatchObject({kind:'void',reason:'no_data:awaiting_bars'});
  const b=await h.register();
  const r=await runSettle(h.deps(stubResolver(scripted({status:'unavailable',failure:'timeout'}))));
  expect((await h.settlements(b))[0]).toMatchObject({kind:'void',reason:'no_data:timeout'});
  expect(r.counts.versioned).toBe(1);
 });
 it('Unavailable with now ≤ settle_by → backoff 1 d × min(attempts, 7), attempts + 1, deferred + unavailable_summary',async()=>{
  const h=await harness();const id=await h.register();
  const res=stubResolver(scripted({status:'unavailable',failure:'rate_limited'}));
  const r=await runSettle(h.deps(res));
  expect(r.errors).toContainEqual({code:'unavailable_summary',message:JSON.stringify({rate_limited:1})});
  expect(await h.queue(id)).toMatchObject({last_status:'unavailable',attempts:1,next_attempt_at:at(T0,DAY_MS),last_detail:{failure:'rate_limited'}});
  h.db.setNow(at(T0,DAY_MS));
  await runSettle(h.deps(res));
  expect(await h.queue(id)).toMatchObject({attempts:2,next_attempt_at:at(T0,3*DAY_MS)});
 });
 it('Unavailable(adjustment_unsupported | delisted) → void at once, even long before settle_by',async()=>{
  for(const failure of ['adjustment_unsupported','delisted']){
   const h=await harness();const id=await h.register();
   const r=await runSettle(h.deps(stubResolver(scripted({status:'unavailable',failure}))));
   expect((await h.settlements(id))[0]).toMatchObject({kind:'void',reason:failure,evidence:{failure}});
   expect(r.counts).toMatchObject({versioned:1,deferred:0});
  }
 });
 it('Inconsistent → dq_quarantine item with the full evidence, queue inconsistent until min(settle_by, now + 7 d), batch partial; a repeat reuses the open item',async()=>{
  const h=await harness();const id=await h.register();
  const r=await runSettle(h.deps(stubResolver(scripted(INC))));
  expect(r).toMatchObject({status:'partial',counts:{fetched:1,quarantined:1}});
  expect(r.errors).toContainEqual(expect.objectContaining({code:'settlement_basis_mismatch',key:id}));
  const items=h.tables.rows('dq_quarantine');
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({dataset:'judgments',table_name:'judgment_settlements',natural_key:id,reason_code:'settlement_basis_mismatch',status:'open',batch_id:r.batchId,
   payload:{registered_bar:{close:107},refetched_bar:{close:106},source:'eastmoney',evidence:{bars:[1,2,3]},evidence_hash:'e'.repeat(64),judgment_id:id,cutoff:T0}});
  expect(await h.queue(id)).toMatchObject({last_status:'inconsistent',next_attempt_at:at(T0,7*DAY_MS),last_detail:{reason_code:'settlement_basis_mismatch',evidence_hash:'e'.repeat(64),cutoff:T0,
   incident:{quarantine_id:items[0].id,reason_code:'settlement_basis_mismatch',evidence_hash:'e'.repeat(64),cutoff:T0,quarantined_at:T0}}});
  expect(await h.settlements(id)).toEqual([]);
  h.db.setNow(at(T0,7*DAY_MS));
  const again:ResolverResult={...INC,evidence:{bars:[4,5,6]},evidence_hash:'d'.repeat(64)} as ResolverResult;
  await runSettle(h.deps(stubResolver(scripted(again))));
  const after=h.tables.rows('dq_quarantine');
  expect(after).toHaveLength(1);
  // P1-04: the reused open item now carries THIS inconsistency, matching the queue
  expect(after[0].payload).toMatchObject({evidence:{bars:[4,5,6]},evidence_hash:'d'.repeat(64),cutoff:at(T0,7*DAY_MS)});
  // Q1-01: same unresolved incident → quarantined_at stays T0; deadline max(settle_by, T0 + 7 d) = settle_by; backoff min(deadline, now + 7 d)
  expect(await h.queue(id)).toMatchObject({last_detail:{evidence_hash:'d'.repeat(64),incident:{evidence_hash:'d'.repeat(64),quarantined_at:T0,quarantine_id:items[0].id}},next_attempt_at:at(T0,14*DAY_MS)});
 });
 it('a quarantine is ONE quarantineSettlement call under the claimed lease — settle.ts writes no item and no separate release; lease_lost there is deferred (Q1-02)',async()=>{
  const h=await harness();const id=await h.register();
  const qs=vi.fn<JudgmentsDb['quarantineSettlement']>(async()=>({status:'quarantined',quarantine_id:'00000000-0000-4000-8000-0000000000aa'}));
  const release=vi.fn(h.db.releaseLease.bind(h.db));
  const db=withOverrides<JudgmentsDb>(h.db,{quarantineSettlement:qs,releaseLease:release});
  const r=await runSettle(h.deps(stubResolver(scripted(INC)),{db}));
  expect(r.counts.quarantined).toBe(1);
  expect(qs).toHaveBeenCalledTimes(1);
  const [jid,token,reason,payload,patch,batch]=qs.mock.calls[0];
  expect({jid,reason,batch}).toEqual({jid:id,reason:'settlement_basis_mismatch',batch:r.batchId});
  expect(typeof token).toBe('string');
  expect(payload).toMatchObject({evidence_hash:'e'.repeat(64),cutoff:T0,judgment_id:id,evidence:{bars:[1,2,3]}});
  expect(patch).toEqual({last_status:'inconsistent',last_detail:{reason_code:'settlement_basis_mismatch',evidence_hash:'e'.repeat(64),cutoff:T0,
   incident:{reason_code:'settlement_basis_mismatch',evidence_hash:'e'.repeat(64),cutoff:T0,quarantined_at:T0}},next_attempt_at:at(T0,7*DAY_MS),attempts_increment:0});
  expect(release).not.toHaveBeenCalled();
  expect(h.tables.rows('dq_quarantine')).toEqual([]);                                         // nothing written outside the one RPC: no crash window
  const h2=await harness();await h2.register();
  const lost=withOverrides<JudgmentsDb>(h2.db,{quarantineSettlement:async()=>({status:'lease_lost' as const,quarantine_id:null})});
  const r2=await runSettle(h2.deps(stubResolver(scripted(INC)),{db:lost}));
  expect(r2.counts).toMatchObject({quarantined:0,deferred:1});
  expect(r2.errors).toContainEqual(expect.objectContaining({code:'lease_lost'}));
  expect(h2.tables.rows('dq_quarantine')).toEqual([]);
 });
 it('an override matching the queued inconsistency settles through fromOverride without calling resolve',async()=>{
  const h=await harness();const id=await h.register();
  await runSettle(h.deps(stubResolver(scripted(INC))));
  const qid=String(h.tables.rows('dq_quarantine')[0].id);
  const override:QuarantineOverride={reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:'e'.repeat(64),evidence:{bars:[1,2,3]}},evidence_hash:'e'.repeat(64),resolved_by:ADMIN,at:at(T0,DAY_MS),cutoff:T0};
  h.db.setNow(at(T0,DAY_MS));
  expect(await h.db.applyQuarantineOverride(id,override,qid,{action:'dq.quarantine_resolve',user_id:ADMIN,object_id:qid})).toBe('applied');
  const resolve=scripted(INC);
  const fromOverride=vi.fn(()=>resolved({evidence:{bars:[1,2,3],override:{reason_code:'settlement_basis_mismatch'}}}));
  const r=await runSettle(h.deps(stubResolver(resolve,{fromOverride})));
  expect(resolve).not.toHaveBeenCalled();
  expect(fromOverride).toHaveBeenCalledWith(expect.objectContaining({judgment_id:id}),expect.objectContaining({reason_code:'settlement_basis_mismatch'}));
  expect(r.counts.inserted).toBe(1);
  expect((await h.settlements(id))[0]).toMatchObject({kind:'settled',outcome:'hit',evidence:{override:{reason_code:'settlement_basis_mismatch'}}});
 });
 it('still inconsistent after settle_by → void(unresolved_inconsistency) without calling the resolver; the quarantine item stays open',async()=>{
  const h=await harness();const id=await h.register();
  await runSettle(h.deps(stubResolver(scripted(INC))));
  h.db.setNow(AFTER);
  const resolve=scripted(resolved());
  const r=await runSettle(h.deps(stubResolver(resolve)));
  expect(resolve).not.toHaveBeenCalled();
  expect((await h.settlements(id))[0]).toMatchObject({kind:'void',reason:'unresolved_inconsistency',evidence:{reason_code:'settlement_basis_mismatch'}});
  expect(r.errors).toContainEqual({code:'voided_summary',message:JSON.stringify({unresolved_inconsistency:1})});
  expect(h.tables.rows('dq_quarantine')[0]).toMatchObject({status:'open'});
 });
 it('an inconsistency quarantined past settle_by keeps a 7-day review window from its FIRST quarantine: repeats inside the window keep the deadline, the backoff lands on it, and the void happens exactly at it (Q1-01)',async()=>{
  const h=await harness();const id=await h.register();
  h.db.setNow(AFTER);                                   // first resolution happens past settle_by (e.g. cutoff_vintage)
  await runSettle(h.deps(stubResolver(scripted(INC))));
  expect(await h.settlements(id)).toEqual([]);          // quarantined, not voided
  const deadline=at(AFTER,REVIEW_WINDOW_DAYS*DAY_MS);
  const q1=(await h.queue(id))!;
  expect(q1).toMatchObject({last_status:'inconsistent',next_attempt_at:deadline,last_detail:{incident:{quarantined_at:AFTER}}});
  expect(reviewDeadline(q1)).toBe(deadline);
  // Repeats inside the window — identical evidence or another inconsistency — keep quarantined_at and the deadline.
  const j=(await h.db.getJudgment(id))!;const meta={name:'price_return' as const,version:'stub/1'};
  const day6=at(AFTER,6*DAY_MS);
  for(const r of [INC,{...INC,evidence:{bars:[9]},evidence_hash:'d'.repeat(64)} as ResolverResult]){
   const d=decide({judgment:j,queue:q1,resolver:meta,result:r,now:day6,cutoff:day6,viaOverride:false});
   expect(d).toMatchObject({action:'quarantine',patch:{last_detail:{cutoff:day6,incident:{quarantined_at:AFTER,cutoff:day6}},next_attempt_at:deadline}});
  }
  // A new incident (no open incident any more, e.g. after a reopen) starts a fresh window.
  expect(decide({judgment:j,queue:{...q1,last_status:null,last_detail:{}},resolver:meta,result:INC,now:day6,cutoff:day6,viaOverride:false}))
   .toMatchObject({action:'quarantine',patch:{last_detail:{incident:{quarantined_at:day6}},next_attempt_at:at(day6,7*DAY_MS)}});
  // The boundary is inclusive: 1 ms before → still reviewable; at the deadline → unresolved.
  const none={viaOverride:false,overrideDiscarded:false};
  expect(isUnresolvedInconsistency(q1,at(deadline,-1),none)).toBe(false);
  expect(isUnresolvedInconsistency(q1,deadline,none)).toBe(true);
  // The cron run scheduled at exactly the deadline voids without reading.
  h.db.setNow(deadline);
  const resolve=scripted(INC);
  await runSettle(h.deps(stubResolver(resolve)));
  expect(resolve).not.toHaveBeenCalled();
  expect((await h.settlements(id))[0]).toMatchObject({kind:'void',reason:'unresolved_inconsistency'});
 });
 it('an open incident survives transient attempt statuses: inconsistency → error → pending → unavailable → the same inconsistency keeps the first quarantined_at and the original deadline; the void happens exactly at it (R3-01)',async()=>{
  const h=await harness();const id=await h.register();
  await runSettle(h.deps(stubResolver(scripted(INC))));                                     // T0: first quarantine
  const [item]=h.tables.rows('dq_quarantine');
  const inc0={quarantine_id:item.id,reason_code:'settlement_basis_mismatch',evidence_hash:'e'.repeat(64),cutoff:T0,quarantined_at:T0};
  const q0=(await h.queue(id))!;
  expect(q0.last_detail.incident).toEqual(inc0);
  const deadline=reviewDeadline(q0);
  expect(deadline).toBe(SETTLE_BY);                                                          // max(settle_by, T0 + 7 d)
  // T0 + 7 d: the resolver throws → error; the incident is carried, attempts + 1, backoff 1 d (before the deadline).
  h.db.setNow(at(T0,7*DAY_MS));
  await runSettle(h.deps(stubResolver(vi.fn(async(_ctx:ResolveContext):Promise<ResolverResult>=>{throw new Error('provider down');}))));
  expect(await h.queue(id)).toMatchObject({last_status:'error',attempts:1,next_attempt_at:at(T0,8*DAY_MS),last_detail:{code:'resolver_failed',incident:inc0}});
  // T0 + 8 d: pending → the incident is carried.
  h.db.setNow(at(T0,8*DAY_MS));
  await runSettle(h.deps(stubResolver(scripted({status:'pending',reason:'awaiting_bars',estimated_at:at(T0,9*DAY_MS)}))));
  expect(await h.queue(id)).toMatchObject({last_status:'pending',next_attempt_at:at(T0,9*DAY_MS),last_detail:{reason:'awaiting_bars',incident:inc0}});
  // T0 + 9 d: unavailable → the incident is carried (attempts 2 → 2 d).
  h.db.setNow(at(T0,9*DAY_MS));
  await runSettle(h.deps(stubResolver(scripted({status:'unavailable',failure:'rate_limited'}))));
  expect(await h.queue(id)).toMatchObject({last_status:'unavailable',attempts:2,next_attempt_at:at(T0,11*DAY_MS),last_detail:{failure:'rate_limited',incident:inc0}});
  expect(reviewDeadline((await h.queue(id))!)).toBe(deadline);
  // T0 + 11 d: the same inconsistency → same item, quarantined_at still T0 (not T0 + 11 d, which would move the deadline to T0 + 18 d).
  h.db.setNow(at(T0,11*DAY_MS));
  await runSettle(h.deps(stubResolver(scripted(INC))));
  const q5=(await h.queue(id))!;
  expect(q5).toMatchObject({last_status:'inconsistent',next_attempt_at:deadline,last_detail:{incident:{...inc0,cutoff:at(T0,11*DAY_MS)}}});
  expect(reviewDeadline(q5)).toBe(deadline);
  expect(h.tables.rows('dq_quarantine')).toHaveLength(1);
  // A transient status at the deadline is still an unresolved incident (pure check), and an error backoff past a later
  // deadline is clamped to it.
  const errored={...q5,last_status:'error' as const,last_detail:{code:'resolver_failed',message:'x',incident:incidentOf(q5)}};
  expect(isUnresolvedInconsistency(errored,deadline,{viaOverride:false,overrideDiscarded:false})).toBe(true);
  expect(isUnresolvedInconsistency(errored,at(deadline,-1),{viaOverride:false,overrideDiscarded:false})).toBe(false);
  const late={...q5,settle_by:at(T0,-30*DAY_MS),attempts:5,lease_token:'0b0e1d8e-0000-4000-8000-0000000000aa'};   // deadline = T0 + 7 d, ahead of now = T0 + 6 d
  const release=vi.fn<JudgmentsDb['releaseLease']>(async()=>undefined);
  const j=(await h.db.getJudgment(id))!;
  await settleOne({deps:h.deps(stubResolver(vi.fn(async():Promise<ResolverResult>=>{throw new Error('boom');})),{db:withOverrides<JudgmentsDb>(h.db,{releaseLease:release})}),batchId:null,now:at(T0,6*DAY_MS),signal:new AbortController().signal,preview:false},
   {...late,last_detail:{...late.last_detail,incident:{...inc0}}},j,0);
  expect(release).toHaveBeenCalledWith(id,late.lease_token,{last_status:'error',last_detail:{code:'resolver_failed',message:'boom',incident:inc0},next_attempt_at:at(T0,7*DAY_MS),attempts_increment:1});
  // The cron run at exactly the original deadline voids without reading.
  h.db.setNow(deadline);
  const resolve=scripted(INC);
  await runSettle(h.deps(stubResolver(resolve)));
  expect(resolve).not.toHaveBeenCalled();
  expect((await h.settlements(id))[0]).toMatchObject({kind:'void',reason:'unresolved_inconsistency',evidence:{reason_code:'settlement_basis_mismatch',quarantine_id:item.id}});
  expect((await h.queue(id))!.last_detail.incident).toBeUndefined();                        // the final settlement ends the incident
 });
});

describe('settle mechanics',()=>{
 it('§5.4 backoff formulas: clamped to settle_by, never in the past',()=>{
  const x={now:T0,attempts:1,settleBy:SETTLE_BY};
  expect(backoff('pending',{...x,estimatedAt:at(T0,10*DAY_MS)})).toBe(at(T0,5*DAY_MS));
  expect(backoff('pending',{...x,estimatedAt:at(T0,DAY_MS)})).toBe(at(T0,DAY_MS));
  expect(backoff('pending',{...x,estimatedAt:'2025-01-01T00:00:00.000Z'})).toBe(at(T0,DAY_MS));
  expect(backoff('pending',{...x,estimatedAt:null})).toBe(at(T0,(Date.parse(SETTLE_BY)-Date.parse(T0))/2));
  expect(backoff('pending',{...x,estimatedAt:'2026-09-01T00:00:00.000Z'})).toBe(SETTLE_BY);
  for(const [n,d] of [[1,1],[3,3],[7,7],[9,7]])expect(backoff('unavailable',{...x,attempts:n,settleBy:'2027-01-01T00:00:00.000Z'})).toBe(at(T0,d*DAY_MS));
  expect(backoff('error',{...x,attempts:2,settleBy:'2027-01-01T00:00:00.000Z'})).toBe(at(T0,2*DAY_MS));
  expect(backoff('inconsistent',x)).toBe(at(T0,7*DAY_MS));
  expect(backoff('inconsistent',{...x,settleBy:at(T0,2*DAY_MS)})).toBe(at(T0,2*DAY_MS));
  expect(backoff('inconsistent',{...x,settleBy:'2026-01-01T00:00:00.000Z'})).toBe(T0);
  expect(backoff('unavailable',{...x,settleBy:'2026-01-01T00:00:00.000Z'})).toBe(at(T0,DAY_MS));
 });
 it('predicateHolds: numeric ops, between inclusive, eq on classes',()=>{
  expect(predicateHolds({op:'>',rhs:0},0.01)).toBe(true);expect(predicateHolds({op:'>',rhs:0},0)).toBe(false);
  expect(predicateHolds({op:'>=',rhs:0},0)).toBe(true);expect(predicateHolds({op:'<',rhs:0},-1)).toBe(true);expect(predicateHolds({op:'<=',rhs:1},1)).toBe(true);
  expect(predicateHolds({op:'between',rhs:[1,2]},1)).toBe(true);expect(predicateHolds({op:'between',rhs:[1,2]},2.0001)).toBe(false);
  expect(predicateHolds({op:'eq',rhs:'recovery'},'recovery')).toBe(true);expect(predicateHolds({op:'eq',rhs:'recovery'},'stagflation')).toBe(false);
  expect(predicateHolds({op:'>',rhs:0},'1')).toBe(false);expect(predicateHolds({op:'>',rhs:0},Number.NaN)).toBe(false);
 });
 it('lease_lost on append or release: nothing written, counted deferred, info lease_lost',async()=>{
  const h=await harness();const id=await h.register();
  const db=withOverrides<JudgmentsDb>(h.db,{appendSettlement:async()=>{throw new JudgmentError('lease_lost');}});
  const r=await runSettle(h.deps(stubResolver(scripted(resolved())),{db}));
  expect(r).toMatchObject({status:'success',counts:{fetched:1,deferred:1,inserted:0}});
  expect(r.errors).toContainEqual({code:'lease_lost',key:id});
  expect(r.items).toEqual([{judgment_id:id,action:'lease_lost',reason:null,seq:null}]);
  const h2=await harness();const id2=await h2.register();
  const db2=withOverrides<JudgmentsDb>(h2.db,{releaseLease:async()=>{throw new JudgmentError('lease_lost');}});
  const r2=await runSettle(h2.deps(stubResolver(scripted({status:'pending',reason:'awaiting_bars'})),{db:db2}));
  expect(r2.errors).toContainEqual({code:'lease_lost',key:id2});
 });
 it('append statuses: already_final → duplicates; request_key_conflict → failed (non-info error)',async()=>{
  const h=await harness();await h.register();
  const final=withOverrides<JudgmentsDb>(h.db,{appendSettlement:async()=>({seq:1,status:'already_final'})});
  expect((await runSettle(h.deps(stubResolver(scripted(resolved())),{db:final}))).counts).toMatchObject({fetched:1,duplicates:1});
  const h2=await harness();const id2=await h2.register();
  const conflict=withOverrides<JudgmentsDb>(h2.db,{appendSettlement:async()=>({seq:1,status:'request_key_conflict'})});
  const r=await runSettle(h2.deps(stubResolver(scripted(resolved())),{db:conflict}));
  expect(r).toMatchObject({status:'failed',counts:{failed:1}});
  expect(r.errors).toContainEqual({code:'request_key_conflict',key:id2});
 });
 it('claims in batches of 20 with a 600 s lease, resolves at most 4 at a time, and stops when a claim comes back empty',async()=>{
  const h=await harness();for(let i=0;i<25;i++)await h.register();
  let inflight=0,peak=0;
  const resolve=async()=>{inflight++;peak=Math.max(peak,inflight);await new Promise(r=>setTimeout(r,5));inflight--;return resolved();};
  const claim=vi.spyOn(h.db,'claimDue');
  const r=await runSettle(h.deps(stubResolver(resolve),{maxFetchMs:1_000}));
  expect(claim.mock.calls).toEqual([[BATCH_SIZE,LEASE_SECONDS],[BATCH_SIZE,LEASE_SECONDS],[BATCH_SIZE,LEASE_SECONDS]]);
  expect(r.counts).toMatchObject({fetched:25,inserted:25});
  expect(r.detail.batches).toBe(2);
  expect(peak).toBe(4);
 });
 it('stops claiming at start + 200 s (deadline_hit, info) and claims nothing when the batch worst case + 30 s exceeds the budget',async()=>{
  const h=await harness();for(let i=0;i<25;i++)await h.register();
  let ms=0;
  const r=await runSettle(h.deps(stubResolver(async()=>{ms=201_000;return resolved();}),{clock:()=>ms,maxFetchMs:1_000}));
  expect(r).toMatchObject({status:'success',counts:{fetched:20},detail:{deadline_hit:true,batches:1}});
  expect(r.errors).toContainEqual(expect.objectContaining({code:'deadline_hit'}));
  // T-05 / review minor 4: admission is strict (waves × maxFetchMs < remaining − 30 s) and the claim is SIZED to the waves that fit.
  const h2=await harness();await h2.register();
  const claim=vi.spyOn(h2.db,'claimDue');
  const slow=await runSettle(h2.deps(stubResolver(scripted(resolved())),{maxFetchMs:250_000}));   // (280 − 30) s / 250 s is not > 1 wave: exactly the boundary admits nothing
  expect(claim).not.toHaveBeenCalled();
  expect(slow).toMatchObject({status:'success',idle:true,counts:{fetched:0},detail:{deadline_hit:true}});
  const ok=await runSettle(h2.deps(stubResolver(scripted(resolved())),{maxFetchMs:49_000}));      // 4 × 49 s + 30 s = 226 s < 280 s
  expect(ok.counts.fetched).toBe(1);
 });
 it('T-05: claims are sized to the waves that fit — maxFetchMs 51 s → 4 waves × 4 = 16 rows, 62.5 s → exactly 4 waves is not strictly less → 3 waves = 12, 249.999 s → 1 wave = 4; the default is the real MAX_FETCH_MS',async()=>{
  for(const [maxFetchMs,limit] of [[51_000,16],[62_500,12],[249_999,4],[undefined,Math.min(BATCH_SIZE,4*(Math.ceil(250_000/MAX_FETCH_MS)-1))]] as const){
   const h=await harness();await h.register();
   const claim=vi.spyOn(h.db,'claimDue');
   await runSettle(h.deps(stubResolver(scripted(resolved())),maxFetchMs===undefined?{}:{maxFetchMs}));
   expect({maxFetchMs,first:claim.mock.calls[0]}).toEqual({maxFetchMs,first:[limit,LEASE_SECONDS]});
  }
  expect(MAX_FETCH_MS).toBe(60_000);
 });
 it('hands one AbortSignal (external abort or the 280 s deadline) to every resolver and stops claiming once it fires',async()=>{
  const h=await harness();for(let i=0;i<25;i++)await h.register();
  const ctl=new AbortController();const seen:boolean[]=[];
  const resolve=async(ctx:ResolveContext)=>{ctl.abort();seen.push(ctx.signal.aborted);return {status:'unavailable',failure:'timeout'} as ResolverResult;};
  const r=await runSettle(h.deps(stubResolver(resolve),{signal:ctl.signal,maxFetchMs:1_000}));
  expect(seen.every(Boolean)).toBe(true);
  expect(r.counts.fetched).toBe(20);expect(r.detail.deadline_hit).toBe(true);
 });
 it('repairs stale judgments.settle batches (15 min) before claiming',async()=>{
  const h=await harness();
  const repair=vi.spyOn(h.db,'repairStaleBatches');
  await runSettle(h.deps(stubResolver(scripted(resolved()))));
  expect(repair).toHaveBeenCalledWith('judgments.settle',STALE_BATCH_SECONDS);
  expect(STALE_BATCH_SECONDS).toBe(900);
 });
 it('acceptance 6: offline run, everything deferred(unavailable) → batch success with info codes, no settlement, freshness ok',async()=>{
  const h=await harness();const ids=[await h.register(),await h.register(),await h.register()];
  const r=await runSettle(h.deps(stubResolver(scripted({status:'unavailable',failure:'timeout'}))));
  expect(r).toMatchObject({status:'success',counts:{fetched:3,deferred:3,inserted:0,versioned:0,failed:0}});
  expect(r.errors).toEqual([{code:'unavailable_summary',message:JSON.stringify({timeout:3})}]);
  for(const id of ids)expect(await h.settlements(id)).toEqual([]);
  expect(h.tables.rows('dq_freshness').find(x=>x.dataset==='judgments.settle')).toMatchObject({status:'fresh',consecutive_errors:0,expected_cadence:'daily'});
 });
 it('acceptance 6: a resolver that throws fails the batch; two failed runs in a row → dq_freshness error',async()=>{
  const h=await harness();const id=await h.register();
  const boom=stubResolver(async()=>{throw new Error('provider exploded');});
  const r1=await runSettle(h.deps(boom));
  expect(r1).toMatchObject({status:'failed',counts:{fetched:1,failed:1}});
  expect(r1.errors).toContainEqual({code:'resolver_failed',key:id,message:'provider exploded'});
  expect(await h.queue(id)).toMatchObject({last_status:'error',attempts:1,next_attempt_at:at(T0,DAY_MS)});
  h.db.setNow(at(T0,DAY_MS));
  expect((await runSettle(h.deps(boom))).status).toBe('failed');
  expect(h.tables.rows('dq_freshness').find(x=>x.dataset==='judgments.settle')).toMatchObject({status:'error',consecutive_errors:2});
 });
 it('an empty queue is an idle success heartbeat',async()=>{
  const h=await harness();
  const r=await runSettle(h.deps(stubResolver(scripted(resolved()))));
  expect(r).toMatchObject({status:'success',idle:true,counts:{fetched:0},items:[]});
  expect(h.tables.rows('dq_freshness').find(x=>x.dataset==='judgments.settle')).toMatchObject({status:'fresh'});
 });
 it('preview: no claim, no batch, no settlement, no freshness write; reports the planned decisions',async()=>{
  const h=await harness();const id=await h.register();
  const claim=vi.spyOn(h.db,'claimDue');const repair=vi.spyOn(h.db,'repairStaleBatches');
  const compensate=vi.fn(async()=>({}) as CompensationReport);
  const r=await runSettle(h.deps(stubResolver(scripted(resolved())),{compensate}),{preview:true});
  expect(r).toMatchObject({status:'preview',preview:true,batchId:null,counts:{fetched:1}});
  expect(r.items).toEqual([{judgment_id:id,action:'settled',reason:null,seq:null}]);
  expect(claim).not.toHaveBeenCalled();expect(repair).not.toHaveBeenCalled();expect(compensate).not.toHaveBeenCalled();
  expect(await h.settlements(id)).toEqual([]);
  expect(await h.queue(id)).toMatchObject({leased_until:null,attempts:0,closed_at:null});
  expect(h.tables.rows('ingest_batches')).toHaveLength(1);
  expect(h.tables.rows('dq_freshness')).toEqual([]);
 });
 it('step 0 runs first; its info codes (macro_unavailable) land in the settle receipt without degrading it',async()=>{
  const h=await harness();
  const report:CompensationReport={status:'skipped',reason:'macro_unavailable',scanned:0,produced:0,existing:0,skippedFailed:0,stoppedAt:null,batchId:null,errors:[{code:'macro_unavailable'}]};
  const compensate=vi.fn(async()=>report);
  const r=await runSettle(h.deps(stubResolver(scripted(resolved())),{compensate}));
  expect(compensate).toHaveBeenCalledTimes(1);
  expect(r).toMatchObject({status:'success',detail:{compensation:{reason:'macro_unavailable'}}});
  expect(r.errors).toContainEqual({code:'macro_unavailable'});
 });
});

describe('acceptance 3 with the real price_return resolver',()=>{
 it('session_index n=5 with only 4 later bars → deferred(pending) and backoff; once the 5th bar prints → settled with ≥ 11 evidence bars',async()=>{
  const h=await harness();const id=await h.register();
  const full=loadKlineFixture('synthetic-us-zza.json');
  const fixtures:KlineFixture[]=[truncateFixture(full,'2026-01-16')];
  const inputsDb=stubInputsDb({kline:fixtureKline(fixtures),issuerPrimarySecurity:async()=>({ticker:'ZZA',market:'US'})});
  const resolver=priceReturnResolverWith({capabilityOf:verifiedCapability});
  const r1=await runSettle(h.deps(resolver,{inputsDb}));
  expect(r1).toMatchObject({status:'success',counts:{fetched:1,deferred:1}});
  const q=await h.queue(id);
  expect(q).toMatchObject({last_status:'pending',next_attempt_at:at(T0,DAY_MS),last_detail:{reason:'awaiting_bars'}});
  fixtures[0]=full;
  h.db.setNow(q!.next_attempt_at);
  const r2=await runSettle(h.deps(resolver,{inputsDb}));
  expect(r2.counts).toMatchObject({fetched:1,inserted:1});
  const [s]=await h.settlements(id);
  expect(s).toMatchObject({kind:'settled',outcome:'hit',resolver:'price_return',resolver_version:'price_return/1',realized:{from:BASE,to:'2026-01-20',unit:'ratio'}});
  expect(s.realized?.value).toBeCloseTo(111/106-1,12);
  const bars=(s.evidence as {bars:{date:string}[]}).bars;
  expect(bars.length).toBeGreaterThanOrEqual(11);
  expect(bars[0].date).toBe('2026-01-05');expect(bars.at(-1)?.date).toBe('2026-01-20');
 });
});

describe('settleNow (admin "settle one now", spec §9.5; used by Task 18)',()=>{
 it('appends as admin:<uuid> with a null lease in its own manual batch; a closed queue, a leased row and a non-admin actor write nothing; a defer is released under the manual lease',async()=>{
  const h=await harness();const id=await h.register();
  const r=await settleNow(h.deps(stubResolver(scripted(resolved()))),id,{actor:`admin:${ADMIN}`,requestKey:'admin:req-1'});
  expect(r).toMatchObject({outcome:'settled',seq:1,reason:null});
  const [s]=await h.settlements(id);
  expect(s).toMatchObject({kind:'settled',outcome:'hit',actor:`admin:${ADMIN}`,request_key:'admin:req-1',batch_id:r.batchId});
  const [batch]=await h.tables.select('ingest_batches',{batch_id:r.batchId!},{limit:1});
  expect(batch).toMatchObject({dataset:'judgments.settle',producer:'ts-judgments',triggered_by:'manual',status:'success'});
  expect(await settleNow(h.deps(stubResolver(scripted(resolved()))),id,{actor:`admin:${ADMIN}`,requestKey:'admin:req-1'})).toMatchObject({outcome:'closed',seq:null});
  const pending=await h.register({predicate:{op:'>',rhs:0.2}});
  expect(await settleNow(h.deps(stubResolver(scripted({status:'pending',reason:'not_reported'}))),pending,{actor:`admin:${ADMIN}`,requestKey:'admin:req-2'})).toMatchObject({outcome:'deferred',reason:'not_reported'});
  expect(await h.settlements(pending)).toEqual([]);
  expect(await h.queue(pending)).toMatchObject({last_status:'pending',last_detail:{reason:'not_reported'},leased_until:null,lease_token:null});   // T-01: the defer was written under the manual claim and released
  await h.db.claimOne(pending,LEASE_SECONDS);
  expect(await settleNow(h.deps(stubResolver(scripted(resolved()))),pending,{actor:`admin:${ADMIN}`,requestKey:'admin:req-3'})).toMatchObject({outcome:'leased'});
  await expect(settleNow(h.deps(stubResolver(scripted(resolved()))),pending,{actor:'cron',requestKey:'k'})).rejects.toMatchObject({code:'invalid_parameter'});
  await expect(settleNow(h.deps(stubResolver(scripted(resolved()))),'00000000-0000-4000-8000-0000000000ff',{actor:`admin:${ADMIN}`,requestKey:'k'})).rejects.toMatchObject({code:'unknown_judgment'});
 });
});

const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));

describe('settleNow is lease-fenced (T-01)',()=>{
 it('a cron claim and a manual attempt never both write: the manual attempt holds a real lease, so cron cannot claim it; once that lease is lost, the late manual append is lease_lost and exactly one settlement exists',async()=>{
  const h=await harness();const id=await h.register();
  let go!:()=>void;const gate=new Promise<void>(r=>{go=r;});let started=false;
  const manual=settleNow(h.deps(stubResolver(async()=>{started=true;await gate;return resolved();})),id,{actor:`admin:${ADMIN}`,requestKey:'adm:race-0001'});
  while(!started)await sleep(1);
  expect(await h.queue(id)).toMatchObject({lease_token:expect.any(String)});
  expect((await runSettle(h.deps(stubResolver(scripted(resolved()))))).idle).toBe(true);        // the live manual lease blocks the cron
  h.db.expireLease(id);                                                                          // the manual attempt stalled past its lease
  const cron=await runSettle(h.deps(stubResolver(scripted(resolved()))));
  expect(cron.counts.inserted).toBe(1);
  go();
  expect(await manual).toMatchObject({outcome:'leased',reason:'lease_lost',seq:null});
  const all=await h.settlements(id);
  expect(all).toHaveLength(1);expect(all[0].actor).toBe('cron');
 });
 it('settled / void append under the manual claim as admin:<uuid>; defer releases the lease; a quarantine decision is published under it; a thrown resolver releases it and rethrows',async()=>{
  const h=await harness();
  const a=await h.register();
  const r=await settleNow(h.deps(stubResolver(scripted(resolved()))),a,{actor:`admin:${ADMIN}`,requestKey:'adm:ok-00001'});
  expect(r).toMatchObject({outcome:'settled',seq:1});
  expect((await h.settlements(a))[0]).toMatchObject({actor:`admin:${ADMIN}`,request_key:'adm:ok-00001'});
  expect(await h.queue(a)).toMatchObject({lease_token:null,leased_until:null});
  const b=await h.register({predicate:{op:'>',rhs:0.3}});
  const q=await settleNow(h.deps(stubResolver(scripted(INC))),b,{actor:`admin:${ADMIN}`,requestKey:'adm:inc-0001'});
  expect(q).toMatchObject({outcome:'quarantined',reason:'settlement_basis_mismatch',seq:null});
  expect(h.tables.rows('dq_quarantine').filter(x=>x.natural_key===b)).toHaveLength(1);
  expect(await h.queue(b)).toMatchObject({last_status:'inconsistent',leased_until:null,lease_token:null,last_detail:{incident:{evidence_hash:'e'.repeat(64)}}});
  const c=await h.register({predicate:{op:'>',rhs:0.4}});
  await expect(settleNow(h.deps(stubResolver(async()=>{throw new Error('provider down');})),c,{actor:`admin:${ADMIN}`,requestKey:'adm:err-0001'})).rejects.toThrow('provider down');
  expect(await h.queue(c)).toMatchObject({last_status:'error',attempts:1,leased_until:null,lease_token:null});
 });
 it('T2-04: startBatch (or anything else) failing AFTER a successful claim still releases the owned lease',async()=>{
  const h=await harness();const id=await h.register();
  const tables={...h.tables,insert:async(t:string,r:Record<string,unknown>)=>{if(t==='ingest_batches')throw new Error('batch store down');return h.tables.insert(t,r);}} as typeof h.tables;
  await expect(settleNow(h.deps(stubResolver(scripted(resolved())),{tables}),id,{actor:`admin:${ADMIN}`,requestKey:'adm:t204-001'})).rejects.toThrow('batch store down');
  expect(await h.queue(id)).toMatchObject({leased_until:null,lease_token:null,closed_at:null});
  const h2=await harness();const id2=await h2.register();
  await expect(settleNow(h2.deps(stubResolver(scripted(resolved())),{db:withOverrides<JudgmentsDb>(h2.db,{serverTime:async()=>{throw new Error('clock down');}})}),id2,{actor:`admin:${ADMIN}`,requestKey:'adm:t204-002'})).rejects.toThrow('clock down');
  expect(await h2.queue(id2)).toMatchObject({leased_until:null,lease_token:null});
 });
 it('a settlement_sequence from a settled queue is a duplicate after re-reading the queue; with the queue still open it is released and rethrown (review minor 1)',async()=>{
  const h=await harness();const id=await h.register();
  const seqErr=()=>new JudgmentError('settlement_sequence','settlement_sequence: settled -> settled by admin');
  const closedLater=withOverrides<JudgmentsDb>(h.db,{appendSettlement:async()=>{throw seqErr();},queueRow:async(x:string)=>{const r=await h.db.queueRow(x);return r?{...r,closed_at:T0}:r;}});
  expect(await settleNow(h.deps(stubResolver(scripted(resolved())),{db:closedLater}),id,{actor:`admin:${ADMIN}`,requestKey:'adm:seq-0001'})).toMatchObject({outcome:'duplicate',seq:null});
  const h2=await harness();const id2=await h2.register();
  const open=withOverrides<JudgmentsDb>(h2.db,{appendSettlement:async()=>{throw seqErr();}});
  await expect(settleNow(h2.deps(stubResolver(scripted(resolved())),{db:open}),id2,{actor:`admin:${ADMIN}`,requestKey:'adm:seq-0002'})).rejects.toMatchObject({code:'settlement_sequence'});
  expect(await h2.queue(id2)).toMatchObject({leased_until:null,lease_token:null});
 });
});

describe('runSettle accounting and deadline (T-02, T-03, T-06)',()=>{
 it('T-02: a row that throws is accounted failed as it finishes while the others complete — first append commits, second throws → inserted 1, failed 1, status partial; the batch is finished only after every worker',async()=>{
  const h=await harness();const a=await h.register();const b=await h.register({predicate:{op:'>',rhs:0.1}});
  const real=h.db.appendSettlement.bind(h.db);
  const db=withOverrides<JudgmentsDb>(h.db,{appendSettlement:async(id,t,k,row)=>{if(id===a)throw new Error('db down');return real(id,t,k,row);}});
  const resolve=async(ctx:ResolveContext)=>{if(ctx.judgment.judgment_id===b)await sleep(30);return resolved();};   // b is still running when a's append throws
  const r=await runSettle(h.deps(stubResolver(resolve),{db}));
  expect(r).toMatchObject({status:'partial',counts:{fetched:2,inserted:1,failed:1}});
  expect(r.errors).toContainEqual(expect.objectContaining({code:'settle_row_failed',key:a,message:'db down'}));
  expect(await h.settlements(b)).toHaveLength(1);expect(await h.settlements(a)).toEqual([]);
  expect(await h.queue(a)).toMatchObject({last_status:'error',attempts:1,leased_until:null,lease_token:null});
  const [batch]=await h.tables.select('ingest_batches',{batch_id:r.batchId!},{limit:1});
  expect(batch).toMatchObject({status:'partial'});
 });
 it('T-03: a resolver that ignores the signal and resolves after the abort writes nothing — the lease is released, the row counts deferred with info deadline_hit',async()=>{
  const h=await harness();const id=await h.register();
  const ctl=new AbortController();
  const r=await runSettle(h.deps(stubResolver(async()=>{ctl.abort();await sleep(20);return resolved();}),{signal:ctl.signal}));
  expect(await h.settlements(id)).toEqual([]);
  expect(r.counts).toMatchObject({fetched:1,deferred:1,inserted:0,failed:0});
  expect(r.errors).toContainEqual(expect.objectContaining({code:'deadline_hit',key:id}));
  expect(r.status).toBe('success');
  expect(await h.queue(id)).toMatchObject({leased_until:null,lease_token:null,closed_at:null,attempts:0});
 });
 it('T-03: a resolver that never returns cannot block the run past the abort',async()=>{
  const h=await harness();const id=await h.register();
  const ctl=new AbortController();setTimeout(()=>ctl.abort(),15);
  const r=await runSettle(h.deps(stubResolver(()=>new Promise<ResolverResult>(()=>undefined)),{signal:ctl.signal}));
  expect(r.counts).toMatchObject({fetched:1,deferred:1});expect(await h.settlements(id)).toEqual([]);
  expect(await h.queue(id)).toMatchObject({leased_until:null});
 });
 it('T-03: a lease with less than 30 s left is not written under — released untouched, deferred, deadline_hit',async()=>{
  const h=await harness();const id=await h.register();
  const claim=h.db.claimDue.bind(h.db);
  const db=withOverrides<JudgmentsDb>(h.db,{claimDue:async(l:number,s:number)=>(await claim(l,s)).map(x=>({...x,leased_until:at(T0,29_000)}))});
  const r=await runSettle(h.deps(stubResolver(scripted(resolved())),{db}));
  expect(await h.settlements(id)).toEqual([]);
  expect(r.counts).toMatchObject({deferred:1,inserted:0});expect(r.errors).toContainEqual(expect.objectContaining({code:'deadline_hit',key:id}));
  expect(await h.queue(id)).toMatchObject({leased_until:null,lease_token:null});
  const h2=await harness();const id2=await h2.register();
  const claim2=h2.db.claimDue.bind(h2.db);
  const db2=withOverrides<JudgmentsDb>(h2.db,{claimDue:async(l:number,s:number)=>(await claim2(l,s)).map(x=>({...x,leased_until:at(T0,31_000)}))});
  expect((await runSettle(h2.deps(stubResolver(scripted(resolved())),{db:db2}))).counts.inserted).toBe(1);   // ≥ 30 s left: writes
 });
 it('T-06: a NEW incident is stamped by the database at the write, not the worker\'s pre-resolution instant; a repeat keeps it',async()=>{
  const h=await harness();const id=await h.register();
  await runSettle(h.deps(stubResolver(scripted(INC))),{now:'2026-03-02T03:00:00.000Z'});          // the worker decided at 03:00; the database clock says T0
  expect((await h.queue(id))!.last_detail.incident).toMatchObject({quarantined_at:T0});
  h.db.setNow(at(T0,DAY_MS));
  await runSettle(h.deps(stubResolver(scripted(INC))));
  expect((await h.queue(id))!.last_detail.incident).toMatchObject({quarantined_at:T0});
 });
});

describe('cutoff_vintage corners (review minor)',()=>{
 it('a label after settle_by is void(no_data:late) under cutoff_vintage too',async()=>{
  const h=await harness(AFTER);const id=await h.register({labelPolicy:'cutoff_vintage'});
  await runSettle(h.deps(stubResolver(scripted(resolved({label_available_at:'2026-03-18T00:00:00.001Z'})))));
  expect((await h.settlements(id))[0]).toMatchObject({kind:'void',reason:'no_data:late',evidence:{settle_by:SETTLE_BY}});
 });
 it('a discarded (wrong-cutoff) override re-resolves ONCE through the resolver: a clean result settles, an inconsistent one past the review deadline voids with override_discarded and no new window',async()=>{
  const h=await harness(AFTER);
  const inc={quarantine_id:'00000000-0000-4000-8000-0000000000aa',reason_code:'settlement_basis_mismatch',evidence_hash:'e'.repeat(64),cutoff:T0,quarantined_at:T0};
  const override:QuarantineOverride={reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:'e'.repeat(64),evidence:{}},evidence_hash:'e'.repeat(64),resolved_by:ADMIN,at:T0,cutoff:T0};   // cutoff T0 ≠ settle_by
  const run=async(result:ResolverResult)=>{
   const id=await h.register({labelPolicy:'cutoff_vintage',predicate:{op:'>',rhs:Math.random()*0.04}});
   const [claimed]=(await h.db.claimDue(100,LEASE_SECONDS)).filter(x=>x.judgment_id===id);
   const q={...claimed,override,last_status:'inconsistent' as const,last_detail:{...inc,incident:inc}};
   const resolve=scripted(result);const fromOverride=vi.fn(()=>resolved());
   const j=await h.db.getJudgment(id);
   const out=await settleOne({deps:h.deps(stubResolver(resolve,{fromOverride})),batchId:h.batchId,now:AFTER,signal:new AbortController().signal,preview:false},q,j,0);
   return {id,out,resolve,fromOverride};
  };
  const clean=await run(resolved());
  expect(clean.resolve).toHaveBeenCalledTimes(1);expect(clean.fromOverride).not.toHaveBeenCalled();
  expect(clean.out.item).toMatchObject({action:'settled'});
  const dirty=await run(INC);
  expect(dirty.resolve).toHaveBeenCalledTimes(1);expect(dirty.fromOverride).not.toHaveBeenCalled();
  expect(dirty.out.item).toMatchObject({action:'void',reason:'unresolved_inconsistency'});
  expect((await h.settlements(dirty.id))[0]).toMatchObject({kind:'void',evidence:{override_discarded:true,quarantine_id:inc.quarantine_id}});
 });
});

describe('T12 r3 post-claim infrastructure failures',()=>{
 it.each(['serverTime','getJudgment','settlementsOf'] as const)('releases and accounts every claimed row on %s failure',async method=>{
  const h=await harness();const ids=[await h.register(),await h.register({predicate:{op:'>',rhs:0.2}})];
  const db=withOverrides<JudgmentsDb>(h.db,{[method]:async()=>{throw new Error('setup down');}});
  await expect(runSettle(h.deps(stubResolver(scripted(resolved())),{db}))).rejects.toThrow('setup down');
  for(const id of ids)expect(await h.queue(id)).toMatchObject({lease_token:null,attempts:0});
  const batch=h.tables.rows('ingest_batches').find(b=>b.dataset==='judgments.settle')!;
  expect(batch).toMatchObject({counts:{fetched:2,failed:2},status:'failed'});
  expect(batch.errors).toEqual(expect.arrayContaining(ids.map(key=>expect.objectContaining({key,code:'settle_setup_failed'}))));
 });
 it.each([false,true])('manual setup failure does not charge an attempt, clock permanently down=%s',async permanent=>{
  const h=await harness();const id=await h.register();let calls=0;
  const db=withOverrides<JudgmentsDb>(h.db,{serverTime:async()=>{if(permanent||calls++===0)throw new Error('clock down');return T0;}});
  await expect(settleNow(h.deps(stubResolver(scripted(resolved())),{db}),id,{actor:`admin:${ADMIN}`,requestKey:'r3-clock'})).rejects.toThrow('clock down');
  expect(await h.queue(id)).toMatchObject({lease_token:null,attempts:0});
 });
 it('repairs every registered produce dataset before compensation',async()=>{
  const h=await harness();const seen:string[]=[];
  const spy=vi.spyOn(await import('./registry'),'REGISTRY','get').mockReturnValue([{id:'repair_a'},{id:'repair_b'}] as unknown as typeof REGISTRY);
  try{
   await runSettle(h.deps(stubResolver(scripted(resolved())),{db:withOverrides<JudgmentsDb>(h.db,{repairStaleBatches:async dataset=>{seen.push(dataset);return 0;}})}));
   expect(seen).toEqual(['judgments.settle','judgments.produce.repair_a','judgments.produce.repair_b']);
  }finally{spy.mockRestore();}
 });
});
