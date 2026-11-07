// src/lib/judgments/settle.ts
// Settlement cron core (spec §7.1, §7.2, §5.4, §7.5). runSettle: repair_stale_batches('judgments.settle', 15 min)
// → step 0 compensation (compensateMacro; its info codes join this receipt) → startBatch(judgments.settle) → claim
// batches of 20 (600 s lease) while the budget allows: stop at start + 200 s, or when the remaining budget is under
// too little budget for even one wave (waves × max resolver maxFetchMs < remaining − 30 s, strictly; claims are sized to the waves that fit), or once the run signal fired → each batch
// sorted by resolver and settled ≤ 4 at a time → finishBatch → recordAttempt('judgments.settle', daily). One
// AbortSignal (external abort ∪ the 280 s deadline) reaches every resolver / provider call.
// settleOne applies the §7.2 state machine through the pure decide(): exactly one of settle / void (append_settlement
// under the lease token, request_key `<batch_id>:<judgment_id>:<expected seq>`), defer (release_lease with the §5.4
// backoff, clamped to settle_by and never in the past) or quarantine (ONE lease-checked quarantine_settlement RPC: the
// dq_quarantine item with the full evidence and the inconsistent queue state in one transaction, plan audit Q1-02). A
// queued override matching the queued inconsistency (reason_code + evidence_hash; for cutoff_vintage also override.cutoff
// = settle_by) settles from resolver.fromOverride (no reads); cutoff_vintage rows never resolve before settle_by
// (planOf, P1-03); a row whose open incident (last_detail.incident, whatever the last attempt status; R3-01) reaches
// its review deadline (max(settle_by, first quarantined_at + 7 d), inclusive; Q1-01) voids as unresolved_inconsistency;
// every defer / error patch carries that incident forward unchanged. Counters (§7.5): fetched
// claimed, inserted settled, versioned void, duplicates already_final, quarantined, failed resolver errors, deferred
// pending / unavailable / lease_lost. preview=true lists the due queue without claiming and reports the decisions.
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import type {TableClient} from '../db/table-client';
import {AbortedError,raceAbort} from './abort';
import {COMPENSATION_BUDGET_MS,compensateMacro} from './compensate';
import type {CompensateDeps,CompensationReport} from './compensate';
import {JudgmentError} from './errors';
import {MAX_FETCH_MS,resolverFor as defaultResolverFor} from './resolvers';
import type {Condition,JudgmentInputsDb,JudgmentRow,JudgmentsDb,QueuePatch,QueueRow,Realized,ResolveContext,Resolver,ResolverResult,SettlementInsert} from './types';

export const SETTLE_DATASET='judgments.settle';
export const PRODUCER='ts-judgments';
export const DEADLINE_MS=280_000,STOP_CLAIM_MS=200_000,TAIL_MS=30_000,BATCH_SIZE=20,CONCURRENCY=4,LEASE_SECONDS=600,STALE_BATCH_SECONDS=900,DAY_MS=86_400_000;
/** Unavailable failures that can never become available: void at once (spec §7.2, O6, §12.4). */
export const IMMEDIATE_VOID:ReadonlySet<string>=new Set(['adjustment_unsupported','delisted']);

export interface SettleDeps{
 db:JudgmentsDb;inputsDb:JudgmentInputsDb;tables:TableClient;codeVersion:string;
 actor:'cron'|'script';triggeredBy:TriggeredBy;
 /** Resolver lookup (default resolvers/index resolverFor); tests inject stubs. */
 resolverFor?:(name:string)=>Resolver;
 /** Worst-case fetch time per judgment for the claim budget (default MAX_FETCH_MS over RESOLVERS). */
 maxFetchMs?:number;
 /** Budget clock in ms (default Date.now). */
 clock?:()=>number;
 signal?:AbortSignal;
 /** Step 0 (spec §7.1); default compensateMacro; null skips it. */
 compensate?:((d:CompensateDeps)=>Promise<CompensationReport>)|null;
}
export interface SettleOptions{preview?:boolean;deadlineMs?:number;/** Decision instant override (tests / preview); default db.serverTime() per claimed batch. */now?:string}
export type SettleAction='settled'|'void'|'deferred'|'quarantined'|'duplicate'|'failed'|'lease_lost'|'conflict';
export interface SettleItem{judgment_id:string;action:SettleAction;reason:string|null;seq:number|null}
export interface SettleReceipt{batchId:string|null;status:BatchStatus|'preview';counts:BatchCounts;errors:BatchError[];idle:boolean;preview:boolean;
 detail:{repaired:number;batches:number;deadline_hit:boolean;compensation:CompensationReport|null};items:SettleItem[]}

type AppendRow=Pick<SettlementInsert,'kind'|'outcome'|'realized'|'evidence'|'resolver'|'resolver_version'|'reason'>;
export type Decision=
 |{action:'append';row:AppendRow}
 |{action:'defer';patch:QueuePatch;summary:'pending'|'unavailable';reason:string}
 |{action:'quarantine';reasonCode:string;payload:Record<string,unknown>;patch:QueuePatch};
export interface DecideInput{judgment:JudgmentRow;queue:QueueRow;resolver:Pick<Resolver,'name'|'version'>;result:ResolverResult|null;now:string;cutoff:string;viaOverride:boolean;overrideDiscarded?:boolean}
export interface SettlePlan{cutoff:string;early:boolean;viaOverride:boolean;overrideDiscarded:boolean}

/**
 * Which path settles a queue row now (spec §3.4, §7.2, §7.3; plan audit P1-03 / P1-04).
 * cutoff_vintage: the resolver never runs before settle_by (`early` → defer to settle_by, override or not); at or
 * after settle_by the cutoff is settle_by, and an override counts only if it was produced from a quarantine raised
 * by a resolution at that same cutoff (override.cutoff); any other override is discarded and the row re-resolves.
 * first_observed: cutoff = now and a matching override is used as before. An override matches only the queued
 * inconsistency it was accepted for: same reason_code AND same evidence_hash.
 */
export function planOf(q:QueueRow,now:string):SettlePlan{
 const vintage=q.label_policy==='cutoff_vintage';
 const cutoff=vintage?q.settle_by:now;
 const early=vintage&&now<q.settle_by;
 const o=q.override,inc=incidentOf(q);
 // R3-01: matched against the open incident, not last_status — a transient attempt in between keeps an accepted override usable.
 const matches=o!==null&&inc!==null&&inc.reason_code===o.reason_code&&inc.evidence_hash===o.evidence_hash;
 const sameCutoff=!vintage||(o!==null&&o.cutoff===cutoff);
 return {cutoff,early,viaOverride:!early&&matches&&sameCutoff,overrideDiscarded:!early&&matches&&!sameCutoff};
}

/** §5.4 backoff. pending: now + max(1 d, (estimate − now) / 2); unavailable / error: now + 1 d × min(attempts, 7);
 * inconsistent: min(settle_by, now + 7 d). pending / unavailable / error are clamped to a future settle_by; the
 * result is never before now. */
export function backoff(kind:'pending'|'unavailable'|'inconsistent'|'error',x:{now:string;attempts:number;settleBy:string;estimatedAt?:string|null}):string{
 const now=Date.parse(x.now),by=Date.parse(x.settleBy);
 let t:number;
 if(kind==='pending'){const est=x.estimatedAt?Date.parse(x.estimatedAt):Number.NaN;t=now+Math.max(DAY_MS,((Number.isFinite(est)?est:by)-now)/2);}
 else if(kind==='inconsistent')t=Math.min(by,now+7*DAY_MS);
 else t=now+DAY_MS*Math.min(Math.max(x.attempts,1),7);
 if(kind!=='inconsistent'&&by>now)t=Math.min(t,by);
 return new Date(Math.max(Math.round(t),now)).toISOString();
}
export function predicateHolds(p:Condition['predicate'],v:number|string|boolean):boolean{
 if(p.op==='eq')return v===p.rhs;
 if(typeof v!=='number'||!Number.isFinite(v))return false;
 if(p.op==='between'){const [lo,hi]=p.rhs as [number,number];return v>=lo&&v<=hi;}
 const rhs=p.rhs as number;
 return p.op==='>'?v>rhs:p.op==='>='?v>=rhs:p.op==='<'?v<rhs:v<=rhs;
}
/** Commander decision (plan audit round 1 follow-up): a quarantined inconsistency always gets an admin review window of
 *  REVIEW_WINDOW_DAYS after it was quarantined, even when quarantined at or near settle_by (cutoff_vintage resolves only at
 *  settle_by). The settlement cutoff is unchanged; only the void deadline moves. Spec 7th draft §5.4/§7.2.
 *  Plan audit Q1-01: quarantined_at is the FIRST quarantine of the unresolved incident (a repeat while the incident is open
 *  keeps it; only a final settlement — an override's or any other —, a reject or a reopen clearing it starts a new
 *  incident), so the deadline cannot move; expiry is inclusive (now >= deadline) and the inconsistent backoff lands exactly
 *  on the deadline. Plan audit R3-01: the incident lives in last_detail.incident, independent of the attempt status, so a
 *  transient error / pending / unavailable attempt between two quarantines does not restart the window either. */
export const REVIEW_WINDOW_DAYS=7;
/** The open quarantine incident (spec §5.4, plan audit R3-01): written only by quarantine_settlement, carried unchanged through
 *  every later patch (carryIncident here, release_lease in SQL), cleared by a final settlement, a reject's void or a reopen. */
export interface QueueIncident{quarantine_id:string;reason_code:string;evidence_hash:string;cutoff:string;quarantined_at:string}
export function incidentOf(q:Pick<QueueRow,'last_detail'>):QueueIncident|null{
 const i=q.last_detail.incident;
 return i!==null&&typeof i==='object'&&!Array.isArray(i)&&typeof (i as {quarantined_at?:unknown}).quarantined_at==='string'?i as QueueIncident:null;
}
export function reviewDeadline(q:QueueRow):string{
 const inc=incidentOf(q);
 const at=inc?Date.parse(inc.quarantined_at):Number.NaN;
 const win=Number.isFinite(at)?at+REVIEW_WINDOW_DAYS*DAY_MS:Number.NEGATIVE_INFINITY;
 return new Date(Math.max(Date.parse(q.settle_by),win)).toISOString();
}
/** A row whose open incident is past its review deadline with no usable override voids without a read (whatever the last
 *  attempt status, R3-01); a discarded (wrong-cutoff) override re-resolves once instead. */
export const isUnresolvedInconsistency=(q:QueueRow,now:string,plan:Pick<SettlePlan,'viaOverride'|'overrideDiscarded'>)=>!plan.viaOverride&&!plan.overrideDiscarded&&incidentOf(q)!==null&&now>=reviewDeadline(q);
/** R3-01: a defer / error patch carries the open incident unchanged, and its backoff never passes the incident's review
 *  deadline while that deadline is still ahead (so the void happens at the original deadline). */
function carryIncident(q:QueueRow,patch:QueuePatch,now:string):QueuePatch{
 const inc=incidentOf(q);
 if(!inc)return patch;
 const deadline=reviewDeadline(q);
 const next=Date.parse(deadline)>Date.parse(now)&&Date.parse(patch.next_attempt_at)>Date.parse(deadline)?deadline:patch.next_attempt_at;
 return {...patch,last_detail:{...patch.last_detail,incident:inc},next_attempt_at:next};
}

/** The §7.2 table as a pure function; result=null when the resolver was not called (cutoff_vintage before settle_by, or
 *  the unresolved-inconsistency row). Every defer patch carries the open incident forward (R3-01). */
export function decide(x:DecideInput):Decision{
 const d=decideAttempt(x);
 return d.action==='defer'?{...d,patch:carryIncident(x.queue,d.patch,x.now)}:d;
}
function decideAttempt(x:DecideInput):Decision{
 const {judgment:j,queue:q,result:r,now}=x,settleBy=q.settle_by;
 const open=incidentOf(q);
 const meta={resolver:x.resolver.name,resolver_version:x.resolver.version};
 const voided=(reason:string,evidence:Record<string,unknown>):Decision=>({action:'append',row:{kind:'void',outcome:null,realized:null,evidence:{...evidence,observed_at:now},reason,...meta}});
 // P1-03: cutoff_vintage never settles (nor even resolves) before settle_by, whether or not an override is queued.
 if(q.label_policy==='cutoff_vintage'&&now<settleBy)
  return {action:'defer',summary:'pending',reason:'cutoff_vintage',patch:{last_status:'pending',last_detail:{reason:'cutoff_vintage',estimated_at:settleBy},next_attempt_at:settleBy,attempts_increment:0}};
 const plan={viaOverride:x.viaOverride,overrideDiscarded:x.overrideDiscarded===true};
 if(r===null||isUnresolvedInconsistency(q,now,plan))
  return voided('unresolved_inconsistency',{reason_code:open?.reason_code??null,quarantine_id:open?.quarantine_id??null,settle_by:settleBy});
 if(r.status==='resolved'){
  if(r.label_available_at>settleBy)return voided('no_data:late',{label_available_at:r.label_available_at,settle_by:settleBy});
  // P1-07: the label must also be available by the observation cutoff (now for first_observed, settle_by for
  // cutoff_vintage): a resolver that returns a later label has not observed it yet.
  if(r.label_available_at>x.cutoff)
   return {action:'defer',summary:'pending',reason:'label_after_cutoff',patch:{last_status:'pending',last_detail:{reason:'label_after_cutoff',estimated_at:r.label_available_at},
    next_attempt_at:backoff('pending',{now,attempts:q.attempts,settleBy,estimatedAt:r.label_available_at}),attempts_increment:0}};
  if(!j.condition)return voided('invalid_condition',{});
  const realized:Realized={value:r.value,...(r.label===undefined?{}:{label:r.label}),unit:r.unit,from:r.from,to:r.to,label_policy:q.label_policy};
  return {action:'append',row:{kind:'settled',outcome:predicateHolds(j.condition.predicate,r.value)?'hit':'miss',realized,
   evidence:{...r.evidence,observed_at:now,cutoff:x.cutoff,label_available_at:r.label_available_at},reason:null,...meta}};
 }
 if(r.status==='pending'){
  if(now>settleBy)return voided(`no_data:${r.reason}`,{pending_reason:r.reason,settle_by:settleBy});
  return {action:'defer',summary:'pending',reason:r.reason,patch:{last_status:'pending',last_detail:{reason:r.reason,...(r.estimated_at?{estimated_at:r.estimated_at}:{})},
   next_attempt_at:backoff('pending',{now,attempts:q.attempts,settleBy,estimatedAt:r.estimated_at??null}),attempts_increment:0}};
 }
 if(r.status==='unavailable'){
  if(IMMEDIATE_VOID.has(r.failure))return voided(r.failure,{failure:r.failure});
  if(now>settleBy)return voided(`no_data:${r.failure}`,{failure:r.failure,settle_by:settleBy});
  return {action:'defer',summary:'unavailable',reason:r.failure,patch:{last_status:'unavailable',last_detail:{failure:r.failure},
   next_attempt_at:backoff('unavailable',{now,attempts:q.attempts+1,settleBy}),attempts_increment:1}};
 }
 // A re-resolution after a discarded (wrong-cutoff) override that is inconsistent again past settle_by gets no new review window.
 if(x.overrideDiscarded===true&&now>=reviewDeadline(q))
  return voided('unresolved_inconsistency',{reason_code:r.reason_code,quarantine_id:open?.quarantine_id??null,settle_by:settleBy,override_discarded:true});
 // cutoff in the payload and last_detail: an acceptance is bound to the cutoff this evidence was resolved at (P1-03).
 // Q1-01 / R3-01: a repeat while the incident is open (whatever the last attempt status) keeps its first quarantined_at, so
 // the deadline never moves; the backoff is min(deadline, now + 7 d) — exactly the deadline at the latest.
 // quarantine_settlement adds quarantine_id and re-checks the kept quarantined_at under the row lock.
 const quarantinedAt=open?open.quarantined_at:now;
 const deadline=reviewDeadline({...q,last_detail:{incident:{quarantined_at:quarantinedAt}}});
 const attempt={reason_code:r.reason_code,evidence_hash:r.evidence_hash,cutoff:x.cutoff};
 return {action:'quarantine',reasonCode:r.reason_code,payload:{...r.detail,evidence:r.evidence,evidence_hash:r.evidence_hash,judgment_id:j.judgment_id,cutoff:x.cutoff},
  patch:{last_status:'inconsistent',last_detail:{...attempt,incident:{...attempt,quarantined_at:quarantinedAt}},next_attempt_at:backoff('inconsistent',{now,attempts:q.attempts,settleBy:deadline}),attempts_increment:0}};
}

/** clock0: deps.clock() when `now` was read, so the lease left at a later write is judged against now + the time elapsed since (T-03). */
export interface SettleContext{deps:SettleDeps;batchId:string|null;now:string;signal:AbortSignal;preview:boolean;clock0?:number}
export interface SettleOutcome{item:SettleItem;counter:keyof BatchCounts|null;summary:{kind:'pending'|'unavailable'|'voided';reason:string}|null;errors:BatchError[]}
const isLeaseLost=(e:unknown)=>e instanceof JudgmentError&&e.code==='lease_lost';
const messageOf=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,500);
const item=(judgment_id:string,action:SettleAction,reason:string|null=null,seq:number|null=null):SettleItem=>({judgment_id,action,reason,seq});
const leaseLost=(id:string):SettleOutcome=>({item:item(id,'lease_lost'),counter:'deferred',summary:null,errors:[{code:'lease_lost',key:id}]});

async function failed(ctx:SettleContext,q:QueueRow,code:string,message:string):Promise<SettleOutcome>{
 const error:BatchError={code,key:q.judgment_id,message};
 if(ctx.preview)return {item:item(q.judgment_id,'failed',code),counter:null,summary:null,errors:[error]};
 try{
  // R3-01: an error attempt keeps the open incident (and its review deadline) unchanged.
  await ctx.deps.db.releaseLease(q.judgment_id,q.lease_token!,carryIncident(q,{last_status:'error',last_detail:{code,message},
   next_attempt_at:backoff('error',{now:ctx.now,attempts:q.attempts+1,settleBy:q.settle_by}),attempts_increment:1},ctx.now));
 }catch(e){if(!isLeaseLost(e))throw e;}
 return {item:item(q.judgment_id,'failed',code),counter:'failed',summary:null,errors:[error]};
}
function planned(id:string,d:Decision):SettleItem{
 if(d.action==='append')return item(id,d.row.kind==='settled'?'settled':'void',d.row.reason);
 return d.action==='defer'?item(id,'deferred',d.reason):item(id,'quarantined',d.reasonCode);
}
const isSequenceError=(e:unknown)=>e instanceof JudgmentError&&e.code==='settlement_sequence';
/** A settlement_sequence from append means another writer already moved the judgment on; when the queue is closed that is a duplicate (review minor 1). */
async function closedAfterSequence(db:JudgmentsDb,id:string):Promise<boolean>{return (await db.queueRow(id))?.closed_at!=null;}
/** Time left on the claimed lease at this instant, judged on the database clock read at batch start plus the time elapsed since (T-03); null = no lease deadline known. */
function leaseLeftMs(ctx:SettleContext,q:QueueRow):number|null{
 if(q.leased_until===null)return null;
 const elapsed=ctx.clock0===undefined?0:Math.max(0,(ctx.deps.clock??Date.now)()-ctx.clock0);
 return Date.parse(q.leased_until)-(Date.parse(ctx.now)+elapsed);
}
/** T-03: the run is over (abort / deadline) or the lease is about to be: write nothing, hand the row back untouched (the cron picks it up next run). */
async function deadlineOutcome(ctx:SettleContext,q:QueueRow):Promise<SettleOutcome>{
 if(!ctx.preview)await releaseUntouched(ctx.deps.db,q).catch(()=>undefined);
 return {item:item(q.judgment_id,'deferred','deadline_hit'),counter:'deferred',summary:null,errors:[{code:'deadline_hit',key:q.judgment_id}]};
}
async function apply(ctx:SettleContext,j:JudgmentRow,q:QueueRow,d:Decision,latestSeq:number):Promise<SettleOutcome>{
 const {db}=ctx.deps,id=j.judgment_id;
 const left=leaseLeftMs(ctx,q);
 if(ctx.signal.aborted||(left!==null&&left<TAIL_MS))return deadlineOutcome(ctx,q);
 try{
  if(d.action==='append'){
   let res:{seq:number;status:string};
   try{res=await db.appendSettlement(id,q.lease_token,`${ctx.batchId}:${id}:${latestSeq+1}`,{...d.row,actor:ctx.deps.actor,code_version:ctx.deps.codeVersion,batch_id:ctx.batchId!});}
   catch(e){if(isSequenceError(e)&&await closedAfterSequence(db,id))return {item:item(id,'duplicate'),counter:'duplicates',summary:null,errors:[]};throw e;}
   if(res.status==='already_final')return {item:item(id,'duplicate',null,res.seq),counter:'duplicates',summary:null,errors:[]};
   if(res.status==='request_key_conflict')return {item:item(id,'conflict',null,res.seq),counter:'failed',summary:null,errors:[{code:'request_key_conflict',key:id}]};
   if(d.row.kind==='settled')return {item:item(id,'settled',null,res.seq),counter:'inserted',summary:null,errors:[]};
   return {item:item(id,'void',d.row.reason,res.seq),counter:'versioned',summary:{kind:'voided',reason:d.row.reason??'void'},errors:[]};
  }
  if(d.action==='defer'){
   await db.releaseLease(id,q.lease_token!,d.patch);
   return {item:item(id,'deferred',d.reason),counter:'deferred',summary:{kind:d.summary,reason:d.reason},errors:[]};
  }
  // Q1-02: ONE lease-checked RPC upserts the open item (quarantine() semantics: same key + reason reused, payload refreshed
  // to THIS inconsistency) and publishes the queue state; a stale worker gets lease_lost and writes nothing, and there is
  // no second write to crash before. T-06: the database stamps a NEW incident's quarantined_at at that write.
  const r=await db.quarantineSettlement(id,q.lease_token!,d.reasonCode,d.payload,d.patch,ctx.batchId!);
  if(r.status==='lease_lost')return leaseLost(id);
  return {item:item(id,'quarantined',d.reasonCode),counter:'quarantined',summary:null,errors:[{code:d.reasonCode,key:id}]};
 }catch(e){
  if(isLeaseLost(e))return leaseLost(id);
  throw e;
 }
}

/** The resolver call, raced against the run's signal and a bound (T-03). Abort → AbortedError; a hung provider → BoundedWaitTimeout. */
const RESOLVE_SLACK_MS=5_000;
function resolveBounded(resolver:Resolver,ctx:ResolveContext,signal:AbortSignal):Promise<ResolverResult>{
 return raceAbort(Promise.resolve().then(()=>resolver.resolve(ctx)),signal,`resolve:${resolver.name}`,resolver.maxFetchMs+RESOLVE_SLACK_MS);
}

/** One claimed queue row through the §7.2 machine. */
export async function settleOne(ctx:SettleContext,q:QueueRow,j:JudgmentRow|null,latestSeq:number):Promise<SettleOutcome>{
 if(!j||j.abstained||!j.condition)return failed(ctx,q,'judgment_missing',`no active judgment for queue row ${q.judgment_id}`);
 let resolver:Resolver;
 try{resolver=(ctx.deps.resolverFor??defaultResolverFor)(j.condition.resolver);}catch(e){return failed(ctx,q,'resolver_unavailable',messageOf(e));}
 const plan=planOf(q,ctx.now);
 let result:ResolverResult|null=null;
 if(!plan.early&&!isUnresolvedInconsistency(q,ctx.now,plan)){
  try{
   result=plan.viaOverride&&q.override?resolver.fromOverride(j,q.override)
    :await resolveBounded(resolver,{judgment:j,cutoff:plan.cutoff,now:ctx.now,inputsDb:ctx.deps.inputsDb,signal:ctx.signal},ctx.signal);
  }catch(e){
   if(e instanceof AbortedError||ctx.signal.aborted)return deadlineOutcome(ctx,q);
   return failed(ctx,q,'resolver_failed',messageOf(e));
  }
 }
 const d=decide({judgment:j,queue:q,resolver,result,now:ctx.now,cutoff:plan.cutoff,viaOverride:plan.viaOverride,overrideDiscarded:plan.overrideDiscarded});
 if(ctx.preview)return {item:planned(j.judgment_id,d),counter:null,summary:null,errors:[]};
 return apply(ctx,j,q,d,latestSeq);
}

export type SettleNowOutcome='settled'|'void'|'duplicate'|'conflict'|'deferred'|'quarantined'|'quarantine_pending'|'leased'|'closed';
export interface SettleNowResult{outcome:SettleNowOutcome;seq:number|null;reason:string|null;batchId:string|null}
const ADMIN_ACTOR_RE=/^admin:[0-9a-f-]{36}$/;
/** Admin "settle one now" (spec §9.5, plan audit T-01): FENCED by a real lease — claimOne locks the queue row and leases it (a cron
 *  holding it → 'leased', a closed / abstained queue → 'closed'), then the same resolver + decide() as the cron run and the decision is
 *  written WITH that lease token: append (actor admin:<uuid>, the caller's request_key, its own manual judgments.settle batch), defer
 *  (release_lease), quarantine (quarantine_settlement). A cron claim after the manual lease expired makes the late manual write
 *  lease_lost → 'leased'; both can never write. Every exit releases the lease it still holds. */
export async function settleNow(deps:SettleDeps,judgmentId:string,o:{actor:string;requestKey:string}):Promise<SettleNowResult>{
 if(!ADMIN_ACTOR_RE.test(o.actor))throw new JudgmentError('invalid_parameter',`settleNow needs an admin actor, got ${o.actor}`);
 const j=await deps.db.getJudgment(judgmentId);
 if(!j)throw new JudgmentError('unknown_judgment',judgmentId);
 const none=(outcome:SettleNowOutcome,reason:string|null,batchId:string|null=null,seq:number|null=null):SettleNowResult=>({outcome,seq,reason,batchId});
 if(j.abstained||!j.condition)return none('closed','abstained');
 const claim=await deps.db.claimOne(judgmentId,LEASE_SECONDS);
 if(claim.status!=='claimed')return claim.status==='leased'?none('leased','lease_held'):none('closed','queue_closed');
 const q=claim.row;
 const clock=deps.clock??Date.now;
 const signal=deps.signal??new AbortController().signal;
 const counts:Required<BatchCounts>={...emptyCounts(),fetched:1,deferred:0};
 const errors:BatchError[]=[];
 let batchId:string|null=null;
 // T2-04: everything after a successful claim runs under a handler that hands the owned lease back on any failure.
 const ctx0:SettleContext={deps,batchId:null,now:'',signal,preview:false,clock0:clock()};
 try{
 const now=await deps.db.serverTime();
 batchId=(await startBatch(deps.tables,{producer:PRODUCER,dataset:SETTLE_DATASET,codeVersion:deps.codeVersion,triggeredBy:'manual'})).batchId;
 const bid:string=batchId;
 const ctx:SettleContext={...ctx0,batchId:bid,now};
 const done=async(r:SettleNowResult):Promise<SettleNowResult>=>{await finishBatch(deps.tables,bid,{counts,errors});return r;};
  const resolver=(deps.resolverFor??defaultResolverFor)(j.condition.resolver);
  const plan=planOf(q,now);
  const result=plan.early||isUnresolvedInconsistency(q,now,plan)?null
   :plan.viaOverride&&q.override?resolver.fromOverride(j,q.override)
   :await resolveBounded(resolver,{judgment:j,cutoff:plan.cutoff,now,inputsDb:deps.inputsDb,signal},signal);
  const d=decide({judgment:j,queue:q,resolver,result,now,cutoff:plan.cutoff,viaOverride:plan.viaOverride,overrideDiscarded:plan.overrideDiscarded});
  const left=leaseLeftMs(ctx,q);
  if(signal.aborted||(left!==null&&left<TAIL_MS)){await releaseUntouched(deps.db,q);counts.deferred=1;errors.push({code:'deadline_hit',key:judgmentId});return await done(none('deferred','deadline_hit',batchId));}
  try{
   if(d.action==='defer'){
    await deps.db.releaseLease(judgmentId,q.lease_token!,d.patch);
    counts.deferred=1;
    return await done(none('deferred',d.reason,batchId));
   }
   if(d.action==='quarantine'){
    const r=await deps.db.quarantineSettlement(judgmentId,q.lease_token!,d.reasonCode,d.payload,d.patch,batchId);
    if(r.status==='lease_lost'){counts.deferred=1;errors.push({code:'lease_lost',key:judgmentId});return await done(none('leased','lease_lost',batchId));}
    counts.quarantined=1;errors.push({code:d.reasonCode,key:judgmentId});
    return await done(none('quarantined',d.reasonCode,batchId));
   }
   let res:{seq:number;status:string};
   try{res=await deps.db.appendSettlement(judgmentId,q.lease_token,o.requestKey,{...d.row,actor:o.actor,code_version:deps.codeVersion,batch_id:batchId});}
   catch(e){
    if(isSequenceError(e)&&await closedAfterSequence(deps.db,judgmentId)){counts.duplicates=1;return await done(none('duplicate',null,batchId));}
    throw e;
   }
   if(res.status==='already_final'||res.status==='already_applied'){
    if(res.status==='already_applied')await releaseUntouched(deps.db,q);   // a replay of the caller's request_key wrote nothing, so the lease is still ours
    counts.duplicates=1;return await done(none('duplicate',null,batchId,res.seq));
   }
   if(res.status==='request_key_conflict'){await releaseUntouched(deps.db,q);counts.failed=1;errors.push({code:'request_key_conflict',key:judgmentId});return await done(none('conflict',null,batchId,res.seq));}
   if(d.row.kind==='settled')counts.inserted=1;else counts.versioned=1;
   return await done({outcome:d.row.kind==='settled'?'settled':'void',seq:res.seq,reason:d.row.reason,batchId});
  }catch(e){
   if(isLeaseLost(e)){counts.deferred=1;errors.push({code:'lease_lost',key:judgmentId});return await done(none('leased','lease_lost',batchId));}
   throw e;
  }
 }catch(e){
  // The lease is still ours on every other failure: hand it back (error attempt, open incident carried), then fail the batch and rethrow.
  if(e instanceof AbortedError){
   await releaseUntouched(deps.db,q).catch(()=>undefined);counts.deferred=1;errors.push({code:'deadline_hit',key:judgmentId});
   if(batchId)return await finishBatch(deps.tables,batchId,{counts,errors}).then(()=>none('deferred','deadline_hit',batchId));
   return none('deferred','deadline_hit');
  }
  await failed({...ctx0,now:ctx0.now||new Date().toISOString()},q,'settle_now_failed',messageOf(e)).catch(()=>undefined);
  if(batchId)await finishBatch(deps.tables,batchId,{counts:{...counts,deferred:0,failed:1},errors:[{code:'settle_now_failed',key:judgmentId,message:messageOf(e)}]}).catch(()=>undefined);
  throw e;
 }
}

async function mapLimit<T>(xs:T[],n:number,f:(x:T)=>Promise<void>):Promise<void>{
 let next=0;
 await Promise.all(Array.from({length:Math.min(n,xs.length)},async()=>{for(;;){const k=next++;if(k>=xs.length)return;await f(xs[k]);}}));
}
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
/** T-02: f never rejects — a row that throws becomes a `failed` outcome (its lease handed back) and is reported through onOutcome as soon as
 *  it finishes; Promise.all therefore only resolves after EVERY worker is done, so the caller never finalizes the batch under running workers. */
async function crashed(ctx:SettleContext,q:QueueRow,e:unknown):Promise<SettleOutcome>{
 const message=messageOf(e);
 try{return await failed(ctx,q,'settle_row_failed',message);}
 catch{return {item:item(q.judgment_id,'failed','settle_row_failed'),counter:ctx.preview?null:'failed',summary:null,errors:[{code:'settle_row_failed',key:q.judgment_id,message}]};}
}
async function processRows(ctx:SettleContext,rows:QueueRow[],onOutcome:(o:SettleOutcome)=>void):Promise<void>{
 const ids=rows.map(r=>r.judgment_id);
 const [judgments,settlements]=await Promise.all([Promise.all(ids.map(id=>ctx.deps.db.getJudgment(id))),ctx.deps.db.settlementsOf(ids)]);
 const latest=new Map<string,number>();
 for(const s of settlements)latest.set(s.judgment_id,Math.max(latest.get(s.judgment_id)??0,s.seq));
 const work=rows.map((q,i)=>({q,j:judgments[i]})).sort((a,b)=>cmp(a.j?.condition?.resolver??'',b.j?.condition?.resolver??'')||cmp(a.q.judgment_id,b.q.judgment_id));
 await mapLimit(work,CONCURRENCY,async w=>{
  let o:SettleOutcome;
  try{o=await settleOne(ctx,w.q,w.j,latest.get(w.q.judgment_id)??0);}
  catch(e){o=await crashed(ctx,w.q,e);}
  onOutcome(o);
 });
}
async function releaseUntouched(db:JudgmentsDb,r:QueueRow):Promise<void>{
 try{await db.releaseLease(r.judgment_id,r.lease_token!,{last_status:r.last_status??'pending',last_detail:r.last_detail,next_attempt_at:r.next_attempt_at,attempts_increment:0});}
 catch(e){if(!isLeaseLost(e))throw e;}
}

/** T2-02 (documented limit): database waits are NOT bounded by the 280 s deadline — only resolver reads race the signal. A write that lands after
 *  the deadline is still lease-fenced (append / release / quarantine check the token), so it is correct, merely late. A platform kill leaves a
 *  'running' judgments.settle batch, which repair_stale_batches marks failed at the start of the next run (Task 22 runbook mentions it). */
export async function runSettle(deps:SettleDeps,opts:SettleOptions={}):Promise<SettleReceipt>{
 const clock=deps.clock??Date.now,t0=clock(),deadlineMs=opts.deadlineMs??DEADLINE_MS,preview=opts.preview===true;
 const ctl=new AbortController();
 const timer=setTimeout(()=>ctl.abort(new Error('deadline_hit')),Math.max(0,deadlineMs));
 const signal=deps.signal?AbortSignal.any([deps.signal,ctl.signal]):ctl.signal;
 // Task 5: deferred is optional on BatchCounts and absent from emptyCounts(); judgment-layer receipts always carry it.
 const counts:Required<BatchCounts>={...emptyCounts(),deferred:0},errors:BatchError[]=[],items:SettleItem[]=[];
 const summaries:Record<'pending'|'unavailable'|'voided',Map<string,number>>={pending:new Map(),unavailable:new Map(),voided:new Map()};
 const detail:SettleReceipt['detail']={repaired:0,batches:0,deadline_hit:false,compensation:null};
 let batchId:string|null=null;
 const absorb=(o:SettleOutcome)=>{
  items.push(o.item);errors.push(...o.errors);
  if(o.counter)counts[o.counter]++;
  if(o.summary){const m=summaries[o.summary.kind];m.set(o.summary.reason,(m.get(o.summary.reason)??0)+1);}
 };
 const receipt=(status:SettleReceipt['status']):SettleReceipt=>({batchId,status,counts,errors,idle:counts.fetched===0,preview,detail,items});
 try{
  if(preview){
   const rows=await deps.db.queueList({filter:'due',limit:BATCH_SIZE});
   counts.fetched=rows.length;
   const now=opts.now??await deps.db.serverTime();
   await processRows({deps,batchId:null,now,signal,preview:true,clock0:clock()},rows,o=>{items.push(o.item);errors.push(...o.errors);});
   return receipt('preview');
  }
  detail.repaired=await deps.db.repairStaleBatches(SETTLE_DATASET,STALE_BATCH_SECONDS);
  const compensate=deps.compensate===undefined?compensateMacro:deps.compensate;
  if(compensate){
   detail.compensation=await compensate({db:deps.db,inputsDb:deps.inputsDb,tables:deps.tables,codeVersion:deps.codeVersion,triggeredBy:deps.triggeredBy,signal,clock,deadlineAt:t0+COMPENSATION_BUDGET_MS});
   errors.push(...detail.compensation.errors);
  }
  ({batchId}=await startBatch(deps.tables,{producer:PRODUCER,dataset:SETTLE_DATASET,codeVersion:deps.codeVersion,triggeredBy:deps.triggeredBy}));
  const perRow=deps.maxFetchMs??MAX_FETCH_MS;
  const processed=new Set<string>();
  for(;;){
   const elapsed=clock()-t0;
   // T-05: strict admission and a SIZED claim. A wave of CONCURRENCY rows needs up to perRow ms; claim only as many waves as satisfy
   // waves × perRow < remaining − TAIL (strictly less), never more than BATCH_SIZE rows.
   const waves=Math.ceil((deadlineMs-elapsed-TAIL_MS)/perRow)-1;
   if(signal.aborted||elapsed>=STOP_CLAIM_MS||waves<1){detail.deadline_hit=true;break;}
   const rows=await deps.db.claimDue(Math.min(BATCH_SIZE,waves*CONCURRENCY),LEASE_SECONDS);
   const fresh=rows.filter(r=>!processed.has(r.judgment_id));
   for(const r of rows)if(processed.has(r.judgment_id))await releaseUntouched(deps.db,r);
   if(fresh.length===0)break;
   detail.batches++;counts.fetched+=fresh.length;
   const now=opts.now??await deps.db.serverTime();
   await processRows({deps,batchId,now,signal,preview:false,clock0:clock()},fresh,o=>{processed.add(o.item.judgment_id);absorb(o);});
  }
  if(detail.deadline_hit)errors.push({code:'deadline_hit',message:`claiming stopped after ${detail.batches} batch(es)`});
  for(const k of ['pending','unavailable','voided'] as const)
   if(summaries[k].size>0)errors.push({code:`${k}_summary`,message:JSON.stringify(Object.fromEntries([...summaries[k]].sort((a,b)=>cmp(a[0],b[0]))))});
  const status=await finishBatch(deps.tables,batchId,{counts,errors});
  await recordAttempt(deps.tables,SETTLE_DATASET,{ok:status==='success'||status==='partial',cadence:'daily',detail:{batch_id:batchId,status,idle:counts.fetched===0}});
  return receipt(status);
 }catch(e){
  if(batchId){
   try{
    const status=await finishBatch(deps.tables,batchId,{counts,errors:[...errors,{code:'settle_aborted',message:messageOf(e)}]});
    await recordAttempt(deps.tables,SETTLE_DATASET,{ok:false,cadence:'daily',detail:{batch_id:batchId,status}});
   }catch{/* the original error is what the caller needs */}
  }
  throw e;
 }finally{clearTimeout(timer);}
}
