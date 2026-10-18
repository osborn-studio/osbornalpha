import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type {PoolClient} from 'pg';
import { canonicalize, digest, fail } from '../ingest/pa-v1/json.js';
import { serverTime, transaction, type S4Actor } from './db';
import { addRecord } from './records';
import { ZERO_HASH as ZERO, controlledDirectory, journalEntries } from './anchor-store';
async function* outboxRows(db:PoolClient,userId:string){
  let after='0';
  for(;;){const rows=(await db.query('select * from public.research_s4_outbox where user_id=$1 and sequence>$2 order by sequence limit 1000',[userId,after])).rows;
    for(const row of rows){after=row.sequence;yield row;}
    if(rows.length<1000)return;
  }
}
export function receiptBody(row:any,userId:string,previous:string,exportedAt:string){
  return {sequence:row.sequence,owner_scope_hash:digest(userId),record_id:row.record_id,event_hash:row.event_hash,
    record_kind:row.event.kind,observation_hash:row.event.observation_hash,rule_hash:row.event.rule_hash,
    server_time:row.event.server_time,exported_at:exportedAt,previous_hash:previous,provenance_level:'local_receipt'};
}
/** SQL ACK of one outbox row against its durable receipt: outbox mark, observation gate, AnchorReceipt record. */
export async function acknowledgeRow(db:PoolClient,actor:S4Actor,row:any,entry:any){
  await db.query('update public.research_s4_outbox set anchored_at=clock_timestamp(),receipt_hash=$3 where user_id=$1 and sequence=$2',[actor.userId,row.sequence,entry.receipt_hash]);
  if(row.event.kind==='Observation'){
    await db.query("update public.research_s4_observation_state set anchor_status='anchored',revision=revision+1 where user_id=$1 and observation_id=$2 and anchor_status='anchor_pending'",[actor.userId,row.record_id]);
    await addRecord(db,actor,row.candidate_id,'AnchorReceipt',{observation_ref:row.record_id,outbox_sequence:row.sequence,receipt_hash:entry.receipt_hash,previous_hash:entry.previous_hash,provenance_level:'local_receipt',journal_ref:'receipts.jsonl'},{outbox:false});
  }
}
/** Quarantines the owner's whole chain after an integrity failure: no truncation, hash repair or provenance restoration. */
export async function quarantineOwner(actor:S4Actor){
  await transaction(actor,async db=>{
    await db.query("insert into public.research_s4_integrity(user_id,reason) values($1,'anchor_integrity_failed') on conflict do nothing",[actor.userId]);
    const changed=await db.query("update public.research_s4_observation_state set anchor_status='integrity_failed',revision=revision+1 where user_id=$1 and anchor_status<>'integrity_failed' returning observation_id",[actor.userId]);
    for(const r of changed.rows){const record=(await db.query('select candidate_id from public.research_s4_records where user_id=$1 and id=$2',[actor.userId,r.observation_id])).rows[0];
      await addRecord(db,actor,record.candidate_id,'ControlEvent',{observation_ref:r.observation_id,reason:'anchor_integrity_failed',research_stream:'descriptive'},{outbox:false});}
  }).catch(()=>{console.error('S4 anchor integrity failure: quarantine transaction failed; stop evaluation and retry operator investigation.');});
}
/** Internal worker API: root is operator config, never an HTTP input. One root per DB.
 * Journal and SQL share the same owner lock; entries are durable before SQL commit.
 * Integrity failures deliberately quarantine the owner's whole chain until operator
 * investigation. No automatic truncation, hash repair, or provenance restoration.
 * Kept as the single-transaction regression oracle for the two-phase drain (anchor-two-phase.ts).
 */
export async function drainOutbox(actor:S4Actor,root:string) {
  if(!isAbsolute(root)||typeof process.getuid!=='function') fail('scope_denied');
  try { return await transaction(actor,async db=>{
    await controlledDirectory(root);
    const dir=join(root,digest(actor.userId));await controlledDirectory(dir);
    const file=await open(join(dir,'receipts.jsonl'),constants.O_CREAT|constants.O_RDWR|constants.O_APPEND|constants.O_NOFOLLOW,0o600);
    try {
      const stat=await file.stat();
      if(!stat.isFile()||stat.uid!==process.getuid!()||(stat.mode&0o077)!==0) fail('anchor_integrity_failed');
      for(const directoryPath of [dir,root,dirname(root)]){
        const handle=await open(directoryPath,constants.O_RDONLY);try{await handle.sync();}finally{await handle.close();}
      }
      const journal=journalEntries(file,stat.size);let next=await journal.next(),previous=ZERO,appended=0,acknowledged=0;
      const now=Date.parse(await serverTime(db));
      // Any recovered bytes must be durable before SQL acknowledges them.
      await file.sync();
      const pending:Array<{row:any;entry:any}>=[];
      const acknowledge=async(row:any,entry:any)=>{await acknowledgeRow(db,actor,row,entry);acknowledged++;};
      for await(const row of outboxRows(db,actor.userId)){
        if(digest(row.event)!==row.event_hash)fail('anchor_integrity_failed');
        let entry=next.done?null:next.value;const recovered=!!entry;
        if(entry){
          if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.exported_at!=='string')fail('anchor_integrity_failed');
          const exported=Date.parse(entry.exported_at);
          if(!Number.isFinite(exported)||exported<Date.parse(row.event.server_time)||exported>now)fail('anchor_integrity_failed');
          const body=receiptBody(row,actor.userId,previous,entry.exported_at);
          if(canonicalize(entry)!==canonicalize({...body,receipt_hash:digest(body)})||
            (row.receipt_hash&&row.receipt_hash!==entry.receipt_hash))fail('anchor_integrity_failed');
          next=await journal.next();
        }else{
          if(row.anchored_at||row.receipt_hash)fail('anchor_integrity_failed');
          if(appended>=500)continue;
          const body=receiptBody(row,actor.userId,previous,await serverTime(db));entry={...body,receipt_hash:digest(body)};
          await file.writeFile(canonicalize(entry)+'\n');appended++;
        }
        previous=entry.receipt_hash;
        if(!row.anchored_at){if(recovered)await acknowledge(row,entry);else pending.push({row,entry});}
      }
      if(!next.done)fail('anchor_integrity_failed');
      await file.sync();
      for(const {row,entry}of pending)await acknowledge(row,entry);
      const remaining=Number((await db.query('select count(*) n from public.research_s4_outbox where user_id=$1 and anchored_at is null',[actor.userId])).rows[0].n);
      return {appended,acknowledged,remaining,last_hash:previous,provenance_level:'local_receipt'};
    }finally{await file.close();}
  });}catch(e){
    if((e as {code?:string}).code==='anchor_integrity_failed')await quarantineOwner(actor);
    throw e;
  }
}
