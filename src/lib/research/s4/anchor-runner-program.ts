import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {canonicalize,digest,fail} from '../ingest/pa-v1/json.js';
import {receiptBody} from './anchor';
import {parseRunnerManifest,type RunnerManifest} from './anchor-manifest';
import {ZERO_HASH,fileAnchorStore,type AnchorReceiptEntry,type AnchorStore,type AnchorTail,type OpenFile} from './anchor-store';
import {MAX_BATCH_BYTES,MAX_BATCH_ROWS} from './anchor-two-phase';
import {reconcileCheckpoint} from './checkpoint-reconcile';
import type {createCheckpointRegistry} from './checkpoint-registry';

/** The anchor runner program (ADR 2026-10-18 §4; I1.4a store + I1.4b scoped functions + I1.5
 * registry). It runs as the runner login, which holds no table privilege: every database
 * access below is one of the SECURITY DEFINER functions. Per owner and per cycle:
 *   1. fence: registry identity, database tail/identity, cached checkpoint, manifest → reconcile;
 *   2. Phase A: full journal verification against the outbox, outside any owner lock;
 *   3. Phase B: append + flush the journal, then acknowledge every durable receipt in one short
 *      transaction (the first `anchor_ack` takes the owner advisory lock), each I/O leg under
 *      the watchdog;
 *   4. after commit: confirm the checkpoint in the registry with a deterministic request id,
 *      then mirror it into the Alpha cache.
 * A watchdog expiry destroys the session and pauses the owner for this process. An integrity
 * failure is reported, never repaired; quarantine remains an operator action for now. */
export type CheckpointRegistryClient=ReturnType<typeof createCheckpointRegistry>;
export interface AnchorRunnerOptions {
  manifest:RunnerManifest;
  /** Operator config: absolute journal root, one per database. */
  root:string;
  /** The runner's principal id as registered in `research_s4_anchor_principals`. */
  principalId:string;
  /** Owner user ids this process serves; each must map to a manifest scope hash. */
  owners:string[];
  /** Pool for the runner login (member of alpha_anchor_runner). */
  db:Pick<Pool,'connect'>;
  registry:CheckpointRegistryClient;
  watchdogMs?:number;
  batch?:{rows?:number;bytes?:number};
  openFile?:OpenFile;
}
export interface OwnerCycleResult {
  owner_scope_hash:string;
  status:'drained'|'paused'|'integrity_failed'|'error';
  reason?:string; code?:string;
  appended:number; acknowledged:number; remaining:number;
  confirmed:{last_sequence:string;last_hash:string}|null;
  checkpoint_outcome?:'confirmed'|'duplicate'|'unknown'|'denied'|'conflict'|'unavailable';
  phase_a_ms:number; lock_hold_ms:number; scanned_entries:number;
  store_id:string; provenance_level:'local_receipt';
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFAULT_WATCHDOG_MS=5000,WATCHDOG='anchor_watchdog_expired';
const pausedOwners=new Set<string>();

interface OutboxRow { sequence:string; candidate_id:string; record_id:string; event:any; event_hash:string; anchored_at:string|null; receipt_hash:string|null }
interface Tail { last_sequence:string|null; last_anchored_sequence:string|null; last_receipt_hash:string|null; checkpoint_sequence:string|null; database_identity:string; generation:string }

/** Stable per (identity, owner, sequence, hash): a lost confirm response is retried as a duplicate. */
export function checkpointRequestId(databaseIdentity:string,ownerScopeHash:string,lastSequence:string,lastHash:string):string{
  const hex=createHash('sha256').update(canonicalize({databaseIdentity,ownerScopeHash,lastSequence,lastHash})).digest('hex');
  const v=hex.slice(0,12)+'4'+hex.slice(13,16)+(8+(parseInt(hex[16],16)&3)).toString(16)+hex.slice(17,20)+hex.slice(20,32);
  return `${v.slice(0,8)}-${v.slice(8,12)}-${v.slice(12,16)}-${v.slice(16,20)}-${v.slice(20,32)}`;
}
/** The `AnchorReceipt` record the ack function stores; the function re-checks every bound field. */
export function anchorReceiptRecord(entry:AnchorReceiptEntry,storeId:string,principalId:string){
  return {observation_ref:entry.record_id,record_id:entry.record_id,outbox_sequence:entry.sequence,receipt_hash:entry.receipt_hash,previous_hash:entry.previous_hash,
    store_id:storeId,execution_principal_id:principalId,provenance_level:'local_receipt' as const,journal_ref:'receipts.jsonl'};
}
function withDeadline<T>(work:Promise<T>,ms:number,reason:string):Promise<T>{
  let timer:NodeJS.Timeout|undefined;work.catch(()=>{});
  const expiry=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(WATCHDOG),{code:WATCHDOG,reason})),ms);});
  return Promise.race([work,expiry]).finally(()=>clearTimeout(timer));
}
function code(e:unknown):string{
  const err=e as {code?:string;message?:string};
  if(typeof err?.code==='string'&&/^[a-z_]+$/.test(err.code))return err.code;
  const m=typeof err?.message==='string'?/^[a-z][a-z0-9_]*/.exec(err.message):null;
  return m?m[0]:'error';
}
async function* outboxPages(db:PoolClient,owner:string,generation:number,after:string){
  for(;;){
    const rows=(await db.query('select sequence::text as sequence,candidate_id,record_id,event,event_hash,anchored_at,receipt_hash from public.research_s4_anchor_read_outbox($1,$2,$3,$4)',[owner,generation,after,500])).rows as OutboxRow[];
    for(const row of rows){after=row.sequence;yield row;}
    if(rows.length<500)return;
  }
}
async function readTail(db:PoolClient,owner:string,generation:number):Promise<Tail>{
  const row=(await db.query('select last_sequence::text as last_sequence,last_anchored_sequence::text as last_anchored_sequence,last_receipt_hash,checkpoint_sequence::text as checkpoint_sequence,database_identity,generation::text as generation from public.research_s4_anchor_tail($1,$2)',[owner,generation])).rows[0];
  if(!row)fail('anchor_tail_unavailable');
  return row as Tail;
}
async function readCache(db:PoolClient,owner:string,generation:number){
  const row=(await db.query('select last_sequence::text as last_sequence,last_hash,generation::text as generation,store_id from public.research_s4_anchor_checkpoint_cache($1,$2)',[owner,generation])).rows[0];
  return row?{last_sequence:row.last_sequence as string,last_hash:row.last_hash as string,generation:Number(row.generation),store_id:row.store_id as string}:null;
}
function checkEntry(entry:AnchorReceiptEntry,row:OutboxRow,owner:string,previous:string,now:number){
  const exported=Date.parse(entry.exported_at);
  if(!Number.isFinite(exported)||exported<Date.parse(row.event.server_time)||exported>now)fail('anchor_integrity_failed');
  const body=receiptBody(row,owner,previous,entry.exported_at);
  if(canonicalize(entry)!==canonicalize({...body,receipt_hash:digest(body)})||(row.receipt_hash&&row.receipt_hash!==entry.receipt_hash))fail('anchor_integrity_failed');
}

async function runOwner(owner:string,o:AnchorRunnerOptions,manifest:RunnerManifest,rows:number,bytes:number,watchdogMs:number):Promise<OwnerCycleResult>{
  const scope=digest(owner),generation=manifest.deployment_generation;
  const base={owner_scope_hash:scope,appended:0,acknowledged:0,remaining:0,confirmed:null,phase_a_ms:0,lock_hold_ms:0,scanned_entries:0,store_id:manifest.store_id,provenance_level:'local_receipt' as const};
  const error=(c:string,extra:Partial<OwnerCycleResult>={}):OwnerCycleResult=>({...base,status:'error',code:c,...extra});
  if(!UUID.test(owner))return error('invalid_schema');
  if(!manifest.authorized_owner_scope.includes(scope))return error('scope_denied');
  const key=`${o.root}:${scope}`;
  if(pausedOwners.has(key))return {...base,status:'paused',reason:'watchdog_paused'};
  const store:AnchorStore=fileAnchorStore(o.root,scope,{openFile:o.openFile});
  // 1. Fence and reconcile: registry identity, database tail, cache, manifest.
  const identity=await o.registry.identityState(manifest.database_identity);
  if(!identity.ok)return error(identity.code,{reason:'registry_'+identity.outcome});
  if(identity.value.storeId!==manifest.store_id)return error('anchor_store_mismatch');
  const latest=await o.registry.latest(manifest.database_identity,scope);
  if(!latest.ok)return error(latest.code,{reason:'registry_'+latest.outcome});
  const db=await o.db.connect();let destroyed=false;
  const destroy=()=>{if(!destroyed){destroyed=true;db.release(true);}};
  try{
    let tail:Tail,cache:Awaited<ReturnType<typeof readCache>>;
    try{tail=await readTail(db,owner,generation);cache=await readCache(db,owner,generation);}
    catch(e){const c=code(e);if(c==='anchor_generation_fenced')return {...base,status:'paused',reason:'generation_mismatch',code:c};return error(c);}
    if(tail.database_identity!==manifest.database_identity)return error('anchor_identity_mismatch');
    let receiptAtRegistry:string|null=null;
    if(latest.value){
      const at=(await db.query('select receipt_hash,anchored_at from public.research_s4_anchor_read_outbox($1,$2,$3,$4)',[owner,generation,(BigInt(latest.value.lastSequence)-1n).toString(),1])).rows[0];
      receiptAtRegistry=at&&at.anchored_at&&String(at.receipt_hash).length===64?at.receipt_hash:null;
    }
    const verdict=reconcileCheckpoint({manifestGeneration:generation,registryGeneration:identity.value.generation,
      registry:latest.value?{last_sequence:latest.value.lastSequence,last_hash:latest.value.lastHash,generation:latest.value.generation}:null,
      cache:cache?{last_sequence:cache.last_sequence,last_hash:cache.last_hash,generation:cache.generation}:null,
      database:{last_anchored_sequence:tail.last_anchored_sequence,receipt_hash_at_registry_sequence:receiptAtRegistry,generation:Number(tail.generation)}});
    if(verdict.state==='paused')return {...base,status:'paused',reason:verdict.reason};
    // 2. Phase A: verify the journal against the outbox, no owner lock.
    const started=performance.now();
    const now=Date.parse((await db.query('select pg_catalog.clock_timestamp()::text as t')).rows[0].t);
    const recovered:Array<{row:OutboxRow;entry:AnchorReceiptEntry}>=[];const pending:OutboxRow[]=[];
    let checkpoint:AnchorTail,previous=ZERO_HASH,lastSequence:string|null=null,entries=0;
    try{
      // A damaged tail line fails here, before any receipt is read.
      checkpoint=await store.readCheckpoint();
      const receipts=store.readReceipts()[Symbol.asyncIterator]();
      let next=await receipts.next();
      try{
        for await(const row of outboxPages(db,owner,generation,'0')){
          if(digest(row.event)!==row.event_hash)fail('anchor_integrity_failed');
          if(!next.done){
            const entry=next.value;checkEntry(entry,row,owner,previous,now);
            previous=entry.receipt_hash;lastSequence=entry.sequence;entries++;
            if(!row.anchored_at)recovered.push({row,entry});
            next=await receipts.next();
          }else{
            if(row.anchored_at||row.receipt_hash)fail('anchor_integrity_failed');
            pending.push(row);
          }
        }
        if(!next.done)fail('anchor_integrity_failed');
      }finally{await receipts.return?.(undefined);}
      if(checkpoint.last_hash!==previous||checkpoint.last_sequence!==lastSequence)fail('anchor_tail_moved');
    }catch(e){
      const c=code(e);
      if(c==='anchor_integrity_failed')return {...base,status:'integrity_failed',code:c,phase_a_ms:performance.now()-started,scanned_entries:entries};
      return error(c,{phase_a_ms:performance.now()-started,scanned_entries:entries});
    }
    const phaseA=performance.now()-started;
    // 3. Phase B: append + flush, then acknowledge in one short transaction.
    const exportedAt=new Date(now).toISOString();const toAppend:Array<{row:OutboxRow;entry:AnchorReceiptEntry}>=[];
    let prev=checkpoint.last_hash,size=0;
    for(const row of pending){
      const body=receiptBody(row,owner,prev,exportedAt);const entry={...body,receipt_hash:digest(body)} as AnchorReceiptEntry;
      const lineBytes=Buffer.byteLength(canonicalize(entry))+1;
      if(toAppend.length>=rows||(toAppend.length&&size+lineBytes>bytes))break;
      toAppend.push({row,entry});size+=lineBytes;prev=entry.receipt_hash;
    }
    let locked=0,lastHash=prev,acknowledged=0;
    if(recovered.length||toAppend.length){
      try{
        if(toAppend.length){
          await store.appendExpected(checkpoint,toAppend.map(a=>a.entry));
          await withDeadline(store.flush(),watchdogMs,'flush_timeout');
        }
        const ack=async()=>{
          await db.query('begin isolation level read committed');locked=performance.now();
          for(const {row,entry} of [...recovered,...toAppend]){
            const record=anchorReceiptRecord(entry,manifest.store_id,o.principalId);
            const r=(await db.query('select acknowledged,duplicate from public.research_s4_anchor_ack($1,$2,$3,$4,$5,$6,$7,$8,$9)',
              [owner,generation,row.sequence,row.event_hash,entry.receipt_hash,entry.previous_hash,manifest.store_id,canonicalize(record),digest(record)])).rows[0];
            if(!r||(r.acknowledged!==true&&r.duplicate!==true))fail('anchor_ack_refused');
            acknowledged++;
          }
          await db.query('commit');
        };
        await withDeadline(ack(),watchdogMs,'ack_timeout');
      }catch(e){
        const c=code(e);
        if(c===WATCHDOG){destroy();pausedOwners.add(key);return {...base,status:'paused',reason:(e as {reason:string}).reason,phase_a_ms:phaseA,lock_hold_ms:locked?performance.now()-locked:0,scanned_entries:entries};}
        if(!destroyed){try{await db.query('rollback');}catch{destroy();}}
        if(c==='anchor_integrity_failed'||c==='anchor_hash_conflict'||c==='anchor_order_violation')return {...base,status:'integrity_failed',code:c,phase_a_ms:phaseA,scanned_entries:entries};
        if(c==='anchor_generation_fenced')return {...base,status:'paused',reason:'generation_mismatch',code:c,phase_a_ms:phaseA,scanned_entries:entries};
        return error(c,{phase_a_ms:phaseA,scanned_entries:entries});
      }
    }
    const lockHold=locked?performance.now()-locked:0;
    // 4. After commit: registry confirm (deterministic request id), then the Alpha cache.
    const after=await readTail(db,owner,generation);
    const remaining=after.last_sequence&&after.last_anchored_sequence?Number(BigInt(after.last_sequence)-BigInt(after.last_anchored_sequence)):after.last_sequence?Number(after.last_sequence):0;
    let confirmed:OwnerCycleResult['confirmed']=null,outcome:OwnerCycleResult['checkpoint_outcome'];
    if(after.last_anchored_sequence&&after.last_receipt_hash){
      const seq=after.last_anchored_sequence,hash=after.last_receipt_hash;lastHash=hash;
      const request={requestId:checkpointRequestId(manifest.database_identity,scope,seq,hash),databaseIdentity:manifest.database_identity,ownerScopeHash:scope,storeId:manifest.store_id,lastSequence:seq,lastHash:hash,generation};
      let r=await o.registry.confirm(request);
      if(!r.ok&&r.outcome==='unknown')r=await o.registry.confirm(request);
      if(r.ok){
        outcome=r.value.duplicate?'duplicate':'confirmed';
        try{await db.query('select confirmed from public.research_s4_anchor_confirm_checkpoint($1,$2,$3,$4,$5,$6)',[owner,generation,manifest.store_id,manifest.database_identity,seq,hash]);confirmed={last_sequence:seq,last_hash:hash};}
        catch(e){return error(code(e),{appended:toAppend.length,acknowledged,remaining,checkpoint_outcome:outcome,phase_a_ms:phaseA,lock_hold_ms:lockHold,scanned_entries:entries});}
      }else outcome=r.outcome;
    }
    return {...base,status:'drained',appended:toAppend.length,acknowledged,remaining,confirmed,checkpoint_outcome:outcome,phase_a_ms:phaseA,lock_hold_ms:lockHold,scanned_entries:entries};
  }finally{if(!destroyed)db.release();}
}

export async function runAnchorCycle(options:AnchorRunnerOptions):Promise<OwnerCycleResult[]>{
  const manifest=parseRunnerManifest(Buffer.from(JSON.stringify(options.manifest)));
  if(!UUID.test(options.principalId))fail('invalid_schema');
  const rows=options.batch?.rows??MAX_BATCH_ROWS,bytes=options.batch?.bytes??MAX_BATCH_BYTES,watchdogMs=options.watchdogMs??DEFAULT_WATCHDOG_MS;
  if(!Number.isInteger(rows)||rows<1||rows>MAX_BATCH_ROWS||!Number.isInteger(bytes)||bytes<1||bytes>MAX_BATCH_BYTES||!Number.isInteger(watchdogMs)||watchdogMs<1)fail('invalid_schema');
  if(!Array.isArray(options.owners)||!options.owners.length||new Set(options.owners).size!==options.owners.length)fail('invalid_schema');
  const results:OwnerCycleResult[]=[];
  for(const owner of options.owners)results.push(await runOwner(owner,options,manifest,rows,bytes,watchdogMs));
  return results;
}
