import type {PoolClient} from 'pg';
import {fail} from '../ingest/pa-v1/json.js';
import type {S4Actor} from './db';

/** The checkpoint gate exists only once a runtime identity has been registered
 * (production enablement). Local acceptance without a registered identity keeps
 * today's behaviour; nothing is silently blocked in local mode. */
export async function anchorGateActive(db:PoolClient):Promise<boolean>{
 return (await db.query('select 1 from public.research_s4_runtime_identity')).rowCount===1;
}

/** Evaluation may reference an observation only when its outbox event is anchored AND
 * its sequence is at or below the owner's last checkpoint confirmed by the runner
 * (ADR 2026-10-18 §4). Sequences above the confirmed checkpoint stay pending even
 * when the local journal already holds them. */
export async function assertCheckpointed(db:PoolClient,actor:S4Actor,observationId:string):Promise<{active:false}|{active:true;sequence:string;checkpoint:string}>{
 if(!(await anchorGateActive(db)))return {active:false};
 const row=(await db.query(`select o.sequence::text as sequence,o.anchored_at,c.last_sequence::text as checkpoint
  from public.research_s4_outbox o
  left join public.research_s4_anchor_checkpoints c on c.user_id=o.user_id
  where o.user_id=$1 and o.record_id=$2`,[actor.userId,observationId])).rows[0];
 if(!row||!row.anchored_at||row.checkpoint===null||BigInt(row.sequence)>BigInt(row.checkpoint))fail('anchor_checkpoint_pending');
 return {active:true,sequence:row.sequence,checkpoint:row.checkpoint};
}
