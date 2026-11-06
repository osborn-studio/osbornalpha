// src/lib/dq/reconcile/run.ts
// Reconciliation cycle runner (spec §5.5; §3.1 cycles/cursor; §3.2 apply_reconcile_result and the cursor
// functions; §5.6; §8). One call = one batch for one pair:
//  0. pending hooks: open reconcile_mismatch items of this pair whose detail.hook is pending/failed are
//     materialized first, at T(i) = issuers.merged_into ?? i (crash between apply and materialize, U2);
//  1. cycle: the pair's running cycle, else (plan audit Q2) snapshot pending_members → resolve keys AFTER
//     the snapshot (pair.members, then pair.memberFor for each snapshot target members() missed) →
//     db.openReconcileCycle: under the cycle lock set_merge also takes, cycle row + cursors + removal of
//     exactly the snapshot entries in one transaction (later registrations wait for the next cycle; a
//     concurrent creator's running cycle is returned). Cursor rows are still ensured on every run (heal);
//  2. members in (issuer_id, market) order whose cursor is claimable; a member starts only with >= 60 s of
//     budget; every claim goes through claim_reconcile_member (fence);
//  3. keys this member already committed in this cycle (an earlier attempt) are read back first and are
//     final: they count as duplicates and are NEVER re-evaluated; evaluate runs only for the missing keys,
//     and a member whose keys all exist completes without any upstream read (spec T2; plan audit P5; their
//     pending hooks are step 0's job). One apply_reconcile_result per remaining key (result row + item +
//     visibility, atomic); a reused key is a duplicate; fence_failed stops this worker at once (committed
//     keys stay valid, the next claimer reuses them); visibility changes are materialized once per target at
//     the end of the member and the item hooks set done/failed — detail.hook alone, through
//     patchQuarantineDetail (row lock; a concurrent latest_result is never rolled back, plan audit P4); complete_reconcile_member derives the counts; any other exception →
//     fail_reconcile_member (the third failure is terminal);
//  4. settlement when every cursor is done or terminally failed: each done cursor must satisfy
//     drc_done_accounted (never coalesced); complete iff not_compared = 0 and no failed member; freshness
//     reconcile.<pair> (weekly) is recorded ONLY by the worker whose guarded update settled the cycle.
// Batch counts (§5.5): fetched = keys applied; inserted = passed; duplicates = reused; quarantined =
// mismatches that went to (or back to) an item; failed = non-compared results + mismatches recorded without
// an item + member failures. A ReconcileConfigError (bad gold/sample file, unresolvable issuer) fails the
// batch with its code and creates no cycle. Dry run: members + evaluate only, no writes by the runner.
import {randomUUID} from 'node:crypto';
import {TableError,selectAll} from '../../db/table-client';
import type {Row,TableClient} from '../../db/table-client';
import {materialize as materializeFacts} from '../../facts/derive';
import {makeBudget} from '../../facts/sync';
import {FactsDbError} from '../../facts/types';
import type {FactsDb,Market} from '../../facts/types';
import {emptyCounts,finishBatch,startBatch} from '../batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../batches';
import {DATASETS} from '../datasets';
import {recordAttempt} from '../freshness';
import {patchQuarantineDetail} from '../quarantine';
import type {RawStore} from '../raw-store';
import {ReconcileConfigError,sha256Hex} from './pair-support';
import type {PairRunContext,RegisteredPair} from './pair-support';
import {RECONCILE_PAIRS} from './pairs';
import {MAX_CURSOR_ATTEMPTS} from './types';
import type {ApplyReconcileOutcome,CyclePairId,CycleStatus,ExpectedKey,Fence,MemberCounts,MemberPlan,PendingMember,ReconcileResultInput} from './types';

export const MIN_MEMBER_MS=60_000;
export const CYCLE_TABLE='dq_reconcile_cycles',CURSOR_TABLE='dq_reconcile_cursor';
const MARKETS:readonly Market[]=['US','CN'];

export interface ReconcileDeps{
 db:FactsDb;tables:TableClient;raw:RawStore;fetch:typeof fetch;readRepoFile:(path:string)=>Promise<Uint8Array>;
 now:()=>Date;deadline:Date|null;codeVersion:string;
 pairs?:Partial<Record<CyclePairId,RegisteredPair>>;
 materialize?:(db:FactsDb,issuer:string,market:Market)=>Promise<unknown>;
}
export interface ReconcileOptions{pair:CyclePairId;triggeredBy:TriggeredBy;issuerIds?:string[];dryRun?:boolean}
export type MemberOutcome='done'|'failed'|'claimed_elsewhere'|'fence_lost'|'not_started';
export interface MemberReport{issuerId:string;market:Market;outcome:MemberOutcome;counts?:MemberCounts;code?:string}
export interface CycleReport{cycleId:string;status:CycleStatus;created:boolean;settled:boolean;expectedTotal:number}
export interface ReconcileReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];cycle:CycleReport|null;members:MemberReport[];hooks:{retried:number;failed:number};dryRun?:{issuerId:string;market:Market;results:ReconcileResultInput[]}[]}
export class ReconcileError extends Error{constructor(public readonly code:string,message?:string){super(message??code);this.name='ReconcileError';}}

interface FrozenMember{issuer_id:string;market:Market;expected_keys:ExpectedKey[]}
interface Hook{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
const mkey=(issuer:string,market:string)=>`${issuer}:${market}`;
const isFence=(e:unknown)=>e instanceof FactsDbError&&e.code==='fence_failed';
const codeOf=(e:unknown):string=>e instanceof FactsDbError||e instanceof ReconcileError||e instanceof ReconcileConfigError?e.code:`exception:${(e instanceof Error?e.message:String(e)).slice(0,200)}`;

function frozenOf(row:Row):FrozenMember[]{
 if(!Array.isArray(row.members))throw new ReconcileError('cycle_members_invalid');
 return row.members.map(m=>{
  const x=m as Partial<FrozenMember>;
  if(typeof x.issuer_id!=='string'||(x.market!=='US'&&x.market!=='CN')||!Array.isArray(x.expected_keys))throw new ReconcileError('cycle_members_invalid');
  return {issuer_id:x.issuer_id,market:x.market,expected_keys:x.expected_keys};
 });
}
/** set_merge registrations still waiting in a cycle row; an entry leaves only through open_reconcile_cycle (plan audit Q2). */
const pendingOf=(row:Row):PendingMember[]=>{
 const d=(row.detail??{}) as {pending_members?:unknown};
 if(!Array.isArray(d.pending_members))return [];
 return d.pending_members.filter((p):p is PendingMember=>!!p&&typeof (p as Row).issuer_id==='string'&&typeof (p as Row).source==='string'&&((p as Row).market==='US'||(p as Row).market==='CN'));
};
function freeze(plans:MemberPlan[]):FrozenMember[]{
 const byKey=new Map<string,FrozenMember>();
 for(const p of plans){
  const k=mkey(p.issuerId,p.market);if(byKey.has(k))throw new ReconcileError('duplicate_member',k);
  if(new Set(p.expectedKeys.map(e=>e.naturalKey)).size!==p.expectedKeys.length)throw new ReconcileError('duplicate_expected_key',k);
  byKey.set(k,{issuer_id:p.issuerId,market:p.market,expected_keys:p.expectedKeys});
 }
 return [...byKey.values()].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:a.market<b.market?-1:a.market>b.market?1:0);
}

/**
 * A new cycle without a window (plan audit Q2):
 *  1. snapshot the pending entries (plain read);
 *  2. resolve expected keys AFTER the snapshot — pair.members(ctx), then pair.memberFor for each snapshot
 *     target members() did not list — so every merge in the snapshot is visible to the resolver (a zero-key
 *     member is a resolved answer, never a placeholder);
 *  3. db.openReconcileCycle: under the cycle lock set_merge also takes, the cycle row, its cursors and the
 *     removal of exactly the snapshot entries commit together. An entry registered after the snapshot is not
 *     consumed and joins the next cycle; a running cycle created meanwhile is returned (created:false).
 * The runner never rewrites a cycle row's detail. A crash before 3 leaves nothing; after 3 the cycle and
 * cursors exist and the next run uses them.
 */
async function openCycle(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunContext):Promise<{row:Row;created:boolean}>{
 const [existing]=await deps.tables.select(CYCLE_TABLE,{pair:pair.id,status:'running'},{limit:1});
 if(existing)return {row:existing,created:false};
 const pending=(await selectAll(deps.tables,CYCLE_TABLE,{pair:pair.id},'cycle_id')).flatMap(pendingOf);
 const plans=[...await pair.members(ctx)];
 const listed=new Set(plans.map(p=>mkey(p.issuerId,p.market)));
 for(const p of pending){
  const k=mkey(p.issuer_id,p.market);if(listed.has(k))continue;
  if(!pair.memberFor)throw new ReconcileError('pending_without_resolver',`${pair.id}:${k}`);
  const plan=await pair.memberFor(ctx,p.issuer_id,p.market);
  if(plan.issuerId!==p.issuer_id||plan.market!==p.market)throw new ReconcileError('evaluate_contract',k);
  plans.push(plan);listed.add(k);
 }
 const members=freeze(plans);
 const startedAt=deps.now();
 const cycleId=`${pair.id}-${startedAt.toISOString().slice(0,10)}-${randomUUID().slice(0,8)}`;
 const out=await deps.db.openReconcileCycle({pair:pair.id,cycleId,startedAt:startedAt.toISOString(),members,pending});
 return {row:out.cycle as Row,created:out.created};
}

async function readCursors(tables:TableClient,pair:CyclePairId,cycleId:string):Promise<Row[]>{
 const out:Row[]=[];
 for(const market of MARKETS)out.push(...await selectAll(tables,CURSOR_TABLE,{pair,cycle_id:cycleId,market},'issuer_id'));
 return out.sort((a,b)=>String(a.issuer_id)<String(b.issuer_id)?-1:String(a.issuer_id)>String(b.issuer_id)?1:String(a.market)<String(b.market)?-1:1);
}
async function ensureCursors(tables:TableClient,pair:CyclePairId,cycleId:string,members:FrozenMember[]):Promise<void>{
 const have=new Set((await readCursors(tables,pair,cycleId)).map(c=>mkey(String(c.issuer_id),String(c.market))));
 for(const m of members){
  if(have.has(mkey(m.issuer_id,m.market)))continue;
  try{
   await tables.insert(CURSOR_TABLE,{pair,cycle_id:cycleId,issuer_id:m.issuer_id,market:m.market,expected:m.expected_keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
  }catch(e){if(!(e instanceof TableError&&e.code==='23505'))throw e;}
 }
}
function claimable(c:Row,now:Date):boolean{
 const until=c.claim_until===null||c.claim_until===undefined?null:Date.parse(String(c.claim_until));
 if(c.state==='pending')return true;
 if(c.state==='claimed')return until!==null&&until<now.getTime();
 if(c.state==='failed')return Number(c.attempts)<MAX_CURSOR_ATTEMPTS;
 return false;
}

async function targetOf(tables:TableClient,issuer:string):Promise<string>{
 const [r]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
 return typeof r?.merged_into==='string'?r.merged_into:issuer;
}
/** detail.hook alone, through the row-locking patch (plan audit P4); a missing item is a no-op. Never throws. */
async function setHook(tables:TableClient,id:string,hook:Hook):Promise<void>{
 try{await patchQuarantineDetail(tables,id,'hook',hook);}
 catch(e){console.error('[reconcile] hook write',e instanceof Error?e.message:String(e));}
}
/** Materializes each distinct target once and writes every listed item's hook; never throws. Returns the number of failed targets' items. */
async function runHooks(deps:ReconcileDeps,list:{itemId:string|null;issuerId:string;market:Market}[],errors:BatchError[]):Promise<number>{
 const mat=deps.materialize??((db:FactsDb,issuer:string,market:Market)=>materializeFacts(db,issuer,market));
 const groups=new Map<string,{target:string;market:Market;items:string[]}>();
 for(const x of list){
  const target=await targetOf(deps.tables,x.issuerId);const k=mkey(target,x.market);
  const g=groups.get(k)??{target,market:x.market,items:[]};if(x.itemId)g.items.push(x.itemId);groups.set(k,g);
 }
 let failed=0;
 for(const g of groups.values()){
  let hook:Hook;
  try{await mat(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:deps.now().toISOString()};}
  catch(e){
   const code=e instanceof FactsDbError?e.code:'materialize_failed';
   hook={stage:'materialize',state:'failed',at:deps.now().toISOString(),message:code};
   errors.push({code:'materialize_error',key:mkey(g.target,g.market),message:code});failed+=g.items.length;
  }
  for(const id of g.items)await setHook(deps.tables,id,hook);
 }
 return failed;
}
async function retryPendingHooks(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<{retried:number;failed:number}>{
 const rows=(await selectAll(deps.tables,'dq_quarantine',{reason_code:'reconcile_mismatch',status:'open'},'id')).filter(r=>{
  const d=(r.detail??{}) as {pair?:unknown;hook?:{state?:unknown};issuer_id?:unknown;market?:unknown};
  return d.pair===pair&&(d.hook?.state==='pending'||d.hook?.state==='failed')&&typeof d.issuer_id==='string'&&(d.market==='US'||d.market==='CN');
 });
 if(rows.length===0)return {retried:0,failed:0};
 const failed=await runHooks(deps,rows.map(r=>{const d=r.detail as {issuer_id:string;market:Market};return {itemId:String(r.id),issuerId:d.issuer_id,market:d.market};}),errors);
 return {retried:rows.length,failed};
}

/** Natural keys this member already committed in this cycle (any earlier attempt); final, never re-evaluated (spec T2; plan audit P5). */
async function acceptedKeys(tables:TableClient,fence:Fence):Promise<Set<string>>{
 const rows=await selectAll(tables,'dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market},'natural_key');
 return new Set(rows.map(r=>String(r.natural_key)));
}
function assertOnePerKey(plan:MemberPlan,results:ReconcileResultInput[]):void{
 if(results.length!==plan.expectedKeys.length||results.some((r,i)=>r.natural_key!==plan.expectedKeys[i].naturalKey))throw new ReconcileError('evaluate_contract');
}
function tally(r:ReconcileResultInput,out:ApplyReconcileOutcome,c:BatchCounts,outcomes:Map<string,number>):void{
 c.fetched++;
 if(out.reused){c.duplicates++;return;}
 if(r.outcome!=='compared'){c.failed++;outcomes.set(r.outcome,(outcomes.get(r.outcome)??0)+1);return;}
 if(r.passed){c.inserted++;return;}
 if(r.action==='record')c.failed++;else c.quarantined++;
}

async function processMember(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunContext,fence:Fence,plan:MemberPlan,counts:BatchCounts,errors:BatchError[],outcomes:Map<string,number>):Promise<MemberReport>{
 const key=mkey(fence.issuer_id,fence.market);
 const report=(outcome:MemberOutcome,extra:{counts?:MemberCounts;code?:string}={}):MemberReport=>({issuerId:fence.issuer_id,market:fence.market,outcome,...extra});
 const hooks:{itemId:string|null;issuerId:string;market:Market}[]=[];
 const flush=async()=>{if(hooks.length>0){await runHooks(deps,hooks.splice(0),errors);}};
 try{
  const accepted=await acceptedKeys(deps.tables,fence);
  const missing:MemberPlan={...plan,expectedKeys:plan.expectedKeys.filter(k=>!accepted.has(k.naturalKey))};
  const reused=plan.expectedKeys.length-missing.expectedKeys.length;
  counts.fetched+=reused;counts.duplicates+=reused;
  const results=missing.expectedKeys.length===0?[]:await pair.evaluate(ctx,missing);   // all keys committed → no upstream read at all
  assertOnePerKey(missing,results);
  for(const result of results){
   let out:ApplyReconcileOutcome;
   try{out=await deps.db.applyReconcileResult(fence,result);}
   catch(e){if(isFence(e)){errors.push({code:'fence_failed',key});await flush();return report('fence_lost');}throw e;}
   tally(result,out,counts,outcomes);
   if(out.materialize)hooks.push({itemId:out.itemId,issuerId:out.materialize.issuerId,market:out.materialize.market});
  }
  await flush();
  try{return report('done',{counts:await deps.db.completeReconcileMember(fence)});}
  catch(e){if(isFence(e)){errors.push({code:'fence_failed',key});return report('fence_lost');}throw e;}
 }catch(e){
  await flush();
  const code=codeOf(e);
  counts.failed++;errors.push({code:'member_failed',key,message:code});
  try{await deps.db.failReconcileMember(fence,code);}
  catch(f){if(isFence(f)){errors.push({code:'fence_failed',key});return report('fence_lost',{code});}throw f;}
  return report('failed',{code});
 }
}

async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string):Promise<{settled:boolean;status:CycleStatus}>{
 const rows=await readCursors(deps.tables,pair,cycleId);
 if(!rows.every(c=>c.state==='done'||(c.state==='failed'&&Number(c.attempts)>=MAX_CURSOR_ATTEMPTS)))return {settled:false,status:'running'};
 let passed=0,failedCmp=0,notCompared=0,failedMembers=0;
 for(const c of rows){
  if(c.state==='failed'){failedMembers++;continue;}
  const v=[c.compared_passed,c.compared_failed,c.not_compared].map(x=>x===null||x===undefined?null:Number(x));
  if(v.some(x=>x===null||!Number.isSafeInteger(x)||x<0)||(v[0]!+v[1]!+v[2]!)!==Number(c.expected))throw new ReconcileError('cursor_unaccounted',mkey(String(c.issuer_id),String(c.market)));
  passed+=v[0]!;failedCmp+=v[1]!;notCompared+=v[2]!;
 }
 const status:CycleStatus=notCompared===0&&failedMembers===0?'complete':'complete_with_gaps';
 const now=deps.now();
 const n=await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId,status:'running'},{status,finished_at:now.toISOString(),compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers});
 if(n!==1)return {settled:false,status};
 await recordAttempt(deps.tables,DATASETS.reconcile(pair),{ok:status==='complete',cadence:'weekly',now,detail:{cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers}});
 return {settled:true,status};
}

export async function runReconcile(deps:ReconcileDeps,opts:ReconcileOptions):Promise<ReconcileReceipt>{
 const pair=(deps.pairs??RECONCILE_PAIRS)[opts.pair];
 if(!pair)throw new ReconcileError('pair_not_registered',opts.pair);
 const budget=makeBudget(deps.deadline,deps.now);
 const base={db:deps.db,tables:deps.tables,raw:deps.raw,now:deps.now,budget,fetch:deps.fetch,readRepoFile:deps.readRepoFile};
 const want=opts.issuerIds?new Set(opts.issuerIds):null;
 if(opts.dryRun){
  const ctx:PairRunContext={...base,batchId:null,dryRun:true};
  const out:{issuerId:string;market:Market;results:ReconcileResultInput[]}[]=[];
  for(const plan of await pair.members(ctx)){
   if(want&&!want.has(plan.issuerId))continue;
   const results=await pair.evaluate(ctx,plan);assertOnePerKey(plan,results);
   out.push({issuerId:plan.issuerId,market:plan.market,results});
  }
  return {batchId:null,status:'dry_run',counts:emptyCounts(),errors:[],cycle:null,members:[],hooks:{retried:0,failed:0},dryRun:out};
 }
 const counts=emptyCounts();const errors:BatchError[]=[];const outcomes=new Map<string,number>();const members:MemberReport[]=[];
 const hooks=await retryPendingHooks(deps,pair.id,errors);
 const sample=pair.inputs.repoFile===null?'':await deps.readRepoFile(pair.inputs.repoFile).then(sha256Hex,()=>'');
 const tool=(cycleId:string)=>({pair:pair.id,cycle_id:cycleId,parser:pair.inputs.parserVersion,gold_schema:pair.inputs.goldSchema??'',sample_sha256:sample,code_version:deps.codeVersion});
 const {batchId}=await startBatch(deps.tables,{producer:'reconcile',dataset:DATASETS.reconcile(pair.id),toolVersions:tool(''),codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const finish=async(cycle:CycleReport|null)=>{
  if(outcomes.size>0)errors.push({code:'outcome_summary',message:JSON.stringify(Object.fromEntries([...outcomes.entries()].sort(([a],[b])=>a<b?-1:1)))});
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  return {batchId,status,counts,errors,cycle,members,hooks} satisfies ReconcileReceipt;
 };
 const ctx:PairRunContext={...base,batchId,dryRun:false};
 let opened:{row:Row;created:boolean};
 try{opened=await openCycle(deps,pair,ctx);}
 catch(e){if(e instanceof ReconcileConfigError){errors.push({code:e.code,message:e.message});return finish(null);}throw e;}
 const cycleId=String(opened.row.cycle_id);const frozen=frozenOf(opened.row);
 await deps.tables.update('ingest_batches',{batch_id:batchId,status:'running'},{tool_versions:tool(cycleId)});
 await ensureCursors(deps.tables,pair.id,cycleId,frozen);
 const plans=new Map<string,MemberPlan>(frozen.map(m=>[mkey(m.issuer_id,m.market),{issuerId:m.issuer_id,market:m.market,expectedKeys:m.expected_keys}]));
 for(const c of await readCursors(deps.tables,pair.id,cycleId)){
  const issuerId=String(c.issuer_id),market=c.market as Market,key=mkey(issuerId,market);
  if(want&&!want.has(issuerId))continue;
  if(!claimable(c,deps.now()))continue;
  const plan=plans.get(key);
  if(!plan){errors.push({code:'member_failed',key,message:'cursor_without_member'});continue;}
  if(budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',key});members.push({issuerId,market,outcome:'not_started'});continue;}
  const fence=await deps.db.claimReconcileMember(pair.id,cycleId,issuerId,market,batchId);
  if(!fence){errors.push({code:'skipped_summary',key:`${key}:claimed`});members.push({issuerId,market,outcome:'claimed_elsewhere'});continue;}
  const r=await processMember(deps,pair,ctx,fence,plan,counts,errors,outcomes);
  members.push(r);
  if(r.outcome==='fence_lost')break;
 }
 let settled:{settled:boolean;status:CycleStatus}={settled:false,status:'running'};
 try{settled=await settle(deps,pair.id,cycleId);}
 catch(e){if(e instanceof ReconcileError&&e.code==='cursor_unaccounted')errors.push({code:'cursor_unaccounted',key:e.message});else throw e;}
 return finish({cycleId,status:settled.status,created:opened.created,settled:settled.settled,expectedTotal:Number(opened.row.expected_total)});
}
