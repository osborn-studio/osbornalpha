import {join} from 'node:path';
import type {PoolClient} from 'pg';
import {canonicalize,digest,fail} from '../ingest/pa-v1/json.js';
import {assertRuntimePrivileges} from '../runtime/privileges';
import {s4Pool,serverTime,type S4Actor} from './db';
import {acknowledgeRow,quarantineOwner,receiptBody} from './anchor';
import {parseRunnerManifest,type RunnerManifest} from './anchor-manifest';
import {ZERO_HASH,fileAnchorStore,type AnchorReceiptEntry,type AnchorStore,type AnchorTail,type OpenFile} from './anchor-store';

/** Local-only two-phase anchor drain (ADR 2026-10-18 §4, 06 §D). No production path exists:
 * the fence below is an injected stand-in for the C1 checkpoint registry and
 * `research_s4_runtime_identity`, neither of which has been created. `drainOutbox` in
 * anchor.ts remains the single-transaction regression oracle. */
export interface AnchorFence { generation():Promise<number> }
export interface TwoPhaseOptions {
  /** Operator config, never an HTTP input. One root per database. */
  root:string;
  manifest:RunnerManifest;
  /** Authoritative generation. Defaults to the manifest's own, i.e. no external authority yet. */
  fence?:AnchorFence;
  /** Budget for the journal flush and for the ACK+COMMIT, each. */
  watchdogMs?:number;
  /** Lower caps for tests; never above MAX_BATCH_ROWS / MAX_BATCH_BYTES. */
  batch?:{rows?:number;bytes?:number};
  /** Test-only file handle injection (stalled fsync). */
  openFile?:OpenFile;
}
export const MAX_BATCH_ROWS=500,MAX_BATCH_BYTES=1024*1024,DEFAULT_WATCHDOG_MS=5000,MAX_ATTEMPTS=3;
interface DbTail { last_anchored_sequence:string|null; last_anchored_hash:string|null; unanchored:number }
interface Recovered { sequence:string; entry:AnchorReceiptEntry }
export interface PhaseAResult {
  tail:AnchorTail; entries:number; scan_ms:number; recovered:Recovered[]; pending:number; db_tail:DbTail; generation:number;
}
interface Base { remaining:number; last_hash:string; provenance_level:'local_receipt'; phase_a_ms:number; lock_hold_ms:number; attempts:number; scanned_entries:number; store_id:string }
export type TwoPhaseResult=
  |({status:'drained';appended:number;acknowledged:number}&Base)
  |({status:'paused';reason:'flush_timeout'|'ack_timeout';appended:0;acknowledged:0}&Base);

const RETRY='anchor_tail_moved',WATCHDOG='anchor_watchdog_expired';
/** Owners whose writer hit the watchdog in this process: no second writer starts until a restart reconciles. */
const pausedOwners=new Set<string>();
/** One drain at a time per owner journal in this process; the owner lock and the store CAS cover other processes. */
const queues=new Map<string,Promise<unknown>>();
async function serialized<T>(key:string,work:()=>Promise<T>):Promise<T>{
  const run=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(work);
  queues.set(key,run);
  try{return await run;}finally{if(queues.get(key)===run)queues.delete(key);}
}
function prepare(actor:S4Actor,options:TwoPhaseOptions){
  const manifest=parseRunnerManifest(Buffer.from(JSON.stringify(options.manifest)));
  const scope=digest(actor.userId);
  if(!manifest.authorized_owner_scope.includes(scope))fail('scope_denied');
  const rows=options.batch?.rows??MAX_BATCH_ROWS,bytes=options.batch?.bytes??MAX_BATCH_BYTES,watchdogMs=options.watchdogMs??DEFAULT_WATCHDOG_MS;
  if(!Number.isInteger(rows)||rows<1||rows>MAX_BATCH_ROWS||!Number.isInteger(bytes)||bytes<1||bytes>MAX_BATCH_BYTES)fail('invalid_schema');
  if(!Number.isInteger(watchdogMs)||watchdogMs<1)fail('invalid_schema');
  const store=fileAnchorStore(options.root,scope,{openFile:options.openFile});
  const fence:AnchorFence=options.fence??{generation:async()=>manifest.deployment_generation};
  return {manifest,scope,rows,bytes,watchdogMs,store,fence,key:join(options.root,scope)};
}
async function fencedGeneration(fence:AnchorFence,manifest:RunnerManifest){
  const generation=await fence.generation();
  if(!Number.isSafeInteger(generation)||generation<0)fail('invalid_schema');
  if(generation>manifest.deployment_generation)fail('generation_fenced');
  return generation;
}
async function* outboxRows(db:PoolClient,userId:string){
  let after='0';
  for(;;){const rows=(await db.query('select * from public.research_s4_outbox where user_id=$1 and sequence>$2 order by sequence limit 1000',[userId,after])).rows;
    for(const row of rows){after=row.sequence;yield row;}
    if(rows.length<1000)return;
  }
}
async function dbTail(db:PoolClient,userId:string):Promise<DbTail>{
  const last=(await db.query('select sequence,receipt_hash from public.research_s4_outbox where user_id=$1 and anchored_at is not null order by sequence desc limit 1',[userId])).rows[0];
  const unanchored=Number((await db.query('select count(*) n from public.research_s4_outbox where user_id=$1 and anchored_at is null',[userId])).rows[0].n);
  return {last_anchored_sequence:last?.sequence??null,last_anchored_hash:last?.receipt_hash??null,unanchored};
}
async function session(actor:S4Actor,db:PoolClient){
  await assertRuntimePrivileges(db);
  await db.query("select pg_catalog.set_config('request.jwt.claim.sub',$1,true)",[actor.userId]);
}
async function requireAdmin(actor:S4Actor,db:PoolClient){
  const profile=await db.query('select role from public.profiles where id=$1',[actor.userId]);
  if(profile.rows[0]?.role!=='admin')fail('scope_denied');
}
/** Same per-entry checks as the oracle, against the row the entry claims to receipt. */
function checkAgainstRow(entry:AnchorReceiptEntry,row:any,userId:string,previous:string,now:number){
  const exported=Date.parse(entry.exported_at);
  if(!Number.isFinite(exported)||exported<Date.parse(row.event.server_time)||exported>now)fail('anchor_integrity_failed');
  const body=receiptBody(row,userId,previous,entry.exported_at);
  if(canonicalize(entry)!==canonicalize({...body,receipt_hash:digest(body)})||(row.receipt_hash&&row.receipt_hash!==entry.receipt_hash))fail('anchor_integrity_failed');
}

/** Phase A: full chain verification outside any owner lock. A read-only repeatable-read snapshot
 * streams the outbox while the journal streams from the store; nothing here blocks business writes. */
export async function verifyAnchorChain(actor:S4Actor,options:TwoPhaseOptions):Promise<PhaseAResult>{
  const {manifest,store,fence}=prepare(actor,options);
  return scanChain(actor,manifest,store,fence);
}
async function scanChain(actor:S4Actor,manifest:RunnerManifest,store:AnchorStore,fence:AnchorFence):Promise<PhaseAResult>{
  const started=performance.now();
  const generation=await fencedGeneration(fence,manifest);
  const checkpoint=await store.readCheckpoint();
  const db=await s4Pool().connect();let released=false;
  try{
    await db.query('begin isolation level repeatable read read only');
    await session(actor,db);await requireAdmin(actor,db);
    const now=Date.parse(await serverTime(db));
    const receipts=store.readReceipts()[Symbol.asyncIterator]();
    let next=await receipts.next(),previous=ZERO_HASH,lastSequence:string|null=null,entries=0,pending=0;
    const recovered:Recovered[]=[];const tail:DbTail={last_anchored_sequence:null,last_anchored_hash:null,unanchored:0};
    try{
    for await(const row of outboxRows(db,actor.userId)){
      if(digest(row.event)!==row.event_hash)fail('anchor_integrity_failed');
      if(!next.done){
        const entry=next.value;
        checkAgainstRow(entry,row,actor.userId,previous,now);
        previous=entry.receipt_hash;lastSequence=entry.sequence;entries++;
        if(row.anchored_at){tail.last_anchored_sequence=row.sequence;tail.last_anchored_hash=row.receipt_hash;}
        else{tail.unanchored++;recovered.push({sequence:row.sequence,entry});}
        next=await receipts.next();
      }else{
        if(row.anchored_at||row.receipt_hash)fail('anchor_integrity_failed');
        tail.unanchored++;pending++;
      }
    }
    if(!next.done)fail('anchor_integrity_failed');
    }finally{await receipts.return?.(undefined);}
    // The file must not have moved under the scan; a later append is Phase B's compare-and-append problem.
    if(checkpoint.last_hash!==previous||checkpoint.last_sequence!==lastSequence)fail(RETRY);
    return {tail:checkpoint,entries,scan_ms:performance.now()-started,recovered,pending,db_tail:tail,generation};
  }finally{
    try{await db.query('rollback');}catch{db.release(true);released=true;}
    if(!released)db.release();
  }
}

function withDeadline<T>(work:Promise<T>,ms:number,reason:'flush_timeout'|'ack_timeout'):Promise<T>{
  let timer:NodeJS.Timeout|undefined;
  work.catch(()=>{});
  const expiry=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(WATCHDOG),{code:WATCHDOG,reason})),ms);});
  return Promise.race([work,expiry]).finally(()=>clearTimeout(timer));
}

/** Phase B: one short owner transaction. Re-reads generation, DB tail and store tail; any
 * movement aborts back to Phase A. Appends at most `rows`/`bytes`, flushes, ACKs, commits, each
 * I/O leg under the watchdog. On expiry the session is destroyed (the server rolls back and
 * releases the owner lock) and the owner is paused for the rest of this process. */
async function shortTransaction(actor:S4Actor,scanned:PhaseAResult,p:ReturnType<typeof prepare>):Promise<{appended:number;acknowledged:number;remaining:number;last_hash:string;lock_hold_ms:number}|{paused:'flush_timeout'|'ack_timeout';lock_hold_ms:number}>{
  const db=await s4Pool().connect();let destroyed=false,locked=0;
  const destroy=()=>{if(!destroyed){destroyed=true;db.release(true);}};
  try{
    await db.query('begin isolation level read committed');
    await session(actor,db);
    await db.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))',[actor.userId]);
    locked=performance.now();
    await requireAdmin(actor,db);
    if(await fencedGeneration(p.fence,p.manifest)!==scanned.generation)fail(RETRY);
    const tail=await dbTail(db,actor.userId);
    if(JSON.stringify(tail)!==JSON.stringify(scanned.db_tail))fail(RETRY);
    const checkpoint=await p.store.readCheckpoint();
    if(JSON.stringify(checkpoint)!==JSON.stringify(scanned.tail))fail(RETRY);
    const recoveredRows:Array<{row:any;entry:AnchorReceiptEntry}>=[];
    for(const {sequence,entry} of scanned.recovered){
      const row=(await db.query('select * from public.research_s4_outbox where user_id=$1 and sequence=$2',[actor.userId,sequence])).rows[0];
      if(!row||row.anchored_at||digest(row.event)!==row.event_hash||row.event_hash!==entry.event_hash||(row.receipt_hash&&row.receipt_hash!==entry.receipt_hash))fail('anchor_integrity_failed');
      recoveredRows.push({row,entry});
    }
    const fresh=(await db.query('select * from public.research_s4_outbox where user_id=$1 and sequence>$2 and anchored_at is null order by sequence limit $3',[actor.userId,scanned.tail.last_sequence??'0',p.rows])).rows;
    const exportedAt=await serverTime(db);const appendRows:Array<{row:any;entry:AnchorReceiptEntry}>=[];
    let previous=scanned.tail.last_hash,bytes=0;
    for(const row of fresh){
      if(row.receipt_hash||digest(row.event)!==row.event_hash)fail('anchor_integrity_failed');
      const body=receiptBody(row,actor.userId,previous,exportedAt);const entry={...body,receipt_hash:digest(body)} as AnchorReceiptEntry;
      const size=Buffer.byteLength(canonicalize(entry))+1;
      if(appendRows.length&&bytes+size>p.bytes)break;
      appendRows.push({row,entry});bytes+=size;previous=entry.receipt_hash;
    }
    await p.store.appendExpected(scanned.tail,appendRows.map(a=>a.entry));
    try{
      await withDeadline(p.store.flush(),p.watchdogMs,'flush_timeout');
      const ack=async()=>{
        for(const {row,entry} of recoveredRows)await acknowledgeRow(db,actor,row,entry);
        for(const {row,entry} of appendRows)await acknowledgeRow(db,actor,row,entry);
        const remaining=Number((await db.query('select count(*) n from public.research_s4_outbox where user_id=$1 and anchored_at is null',[actor.userId])).rows[0].n);
        await db.query('commit');
        return remaining;
      };
      const remaining=await withDeadline(ack(),p.watchdogMs,'ack_timeout');
      return {appended:appendRows.length,acknowledged:recoveredRows.length+appendRows.length,remaining,last_hash:previous,lock_hold_ms:performance.now()-locked};
    }catch(e){
      if((e as {code?:string}).code!==WATCHDOG)throw e;
      destroy();pausedOwners.add(p.key);
      return {paused:(e as {reason:'flush_timeout'|'ack_timeout'}).reason,lock_hold_ms:performance.now()-locked};
    }
  }catch(e){
    if(!destroyed){try{await db.query('rollback');}catch{destroy();}}
    throw e;
  }finally{if(!destroyed)db.release();}
}

export async function drainOutboxTwoPhase(actor:S4Actor,options:TwoPhaseOptions):Promise<TwoPhaseResult>{
  const p=prepare(actor,options);
  if(pausedOwners.has(p.key))fail('anchor_paused');
  return serialized(p.key,async()=>{
    if(pausedOwners.has(p.key))fail('anchor_paused');
    try{
      for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
        let scanned:PhaseAResult;
        try{scanned=await scanChain(actor,p.manifest,p.store,p.fence);}
        catch(e){if((e as {code?:string}).code===RETRY)continue;throw e;}
        let outcome;
        try{outcome=await shortTransaction(actor,scanned,p);}
        catch(e){if((e as {code?:string}).code===RETRY)continue;throw e;}
        const base={provenance_level:'local_receipt' as const,phase_a_ms:scanned.scan_ms,lock_hold_ms:outcome.lock_hold_ms,attempts:attempt,scanned_entries:scanned.entries,store_id:p.manifest.store_id};
        if('paused' in outcome)return {status:'paused',reason:outcome.paused,appended:0,acknowledged:0,remaining:scanned.recovered.length+scanned.pending,last_hash:scanned.tail.last_hash,...base};
        return {status:'drained',appended:outcome.appended,acknowledged:outcome.acknowledged,remaining:outcome.remaining,last_hash:outcome.last_hash,...base};
      }
      fail('anchor_tail_unstable');throw new Error('unreachable');
    }catch(e){
      if((e as {code?:string}).code==='anchor_integrity_failed')await quarantineOwner(actor);
      throw e;
    }
  });
}
