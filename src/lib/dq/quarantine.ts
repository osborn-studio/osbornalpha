// Quarantine queue (spec §5.2 dq_quarantine). Rows that fail validation are parked here with
// the batch that produced them instead of landing in the target table. An OPEN item is unique
// per (dataset, table_name, natural_key, reason_code) so re-running a producer does not pile up
// duplicates; the partial unique index dq_quarantine_open_key_uniq enforces it, so two producers
// racing on the same key converge on one row. Resolution only transitions rows that are still open and reports the outcome, so
// an unknown id or another admin's earlier decision is never silently overwritten. Rows are
// written so the DB invariants hold: (status='open') = (resolved_at is null), and
// status='open' or resolved_by is not null.
import {randomUUID} from 'node:crypto';
import {TableError,callRpc} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';

export type QuarantineStatus='open'|'resolved_accept'|'resolved_reject';
export type ResolveOutcome='resolved'|'not_found'|'already_resolved';
export interface QuarantineInput{
 dataset:string;table:string;naturalKey:string;reasonCode:string;
 detail?:Record<string,unknown>;payload?:Record<string,unknown>;batchId:string;
}

const TABLE='dq_quarantine';
const RESOLUTIONS:readonly QuarantineStatus[]=['resolved_accept','resolved_reject'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v);
export const MAX_LIST=1000;

/**
 * Parks a row in quarantine and returns its id; an existing OPEN item with the same key and reason
 * is reused. If a concurrent producer inserts the same open key between our read and insert, the
 * unique index rejects ours (23505) and the winner's id is returned instead.
 */
export async function quarantine(client:TableClient,input:QuarantineInput):Promise<string>{
 const key={dataset:input.dataset,table_name:input.table,natural_key:input.naturalKey,reason_code:input.reasonCode};
 const openRow=async()=>(await client.select(TABLE,{...key,status:'open'},{limit:1}))[0];
 const existing=await openRow();
 if(existing)return existing.id as string;
 const id=randomUUID();
 try{
  await client.insert(TABLE,{
   id,...key,detail:input.detail??{},payload:input.payload??{},batch_id:input.batchId,
   status:'open',resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
  });
 }catch(e){
  if(!(e instanceof TableError)||e.code!=='23505')throw e;
  const winner=await openRow();
  if(!winner)throw e; // the clash was not on the open key (or the winner was already resolved)
  return winner.id as string;
 }
 return id;
}

export async function resolveQuarantine(client:TableClient,id:string,input:{status:QuarantineStatus;resolvedBy:string}):Promise<ResolveOutcome>{
 if(!RESOLUTIONS.includes(input.status))throw new Error('invalid_status');
 if(!isUuid(id))throw new Error('invalid_id');
 if(!isUuid(input.resolvedBy))throw new Error('invalid_resolver');
 const [row]=await client.select(TABLE,{id},{limit:1});
 if(!row)return 'not_found';
 if(row.status!=='open')return 'already_resolved';
 // Matching on status='open' keeps a concurrent resolution from being overwritten; zero
 // rows means another resolver won after our read.
 const n=await client.update(TABLE,{id,status:'open'},{status:input.status,resolved_by:input.resolvedBy,resolved_at:new Date().toISOString()});
 return n===1?'resolved':'already_resolved';
}

/**
 * Newest open items first (created_at desc). Rows sharing a created_at have no defined relative
 * order: the TableClient supports a single orderBy column, so `id` cannot be added as a tiebreaker.
 * `limit` is an integer 1..MAX_LIST.
 */
export async function listOpenQuarantine(client:TableClient,dataset?:string,limit=100):Promise<Row[]>{
 if(!Number.isInteger(limit)||limit<1||limit>MAX_LIST)throw new Error('invalid_limit');
 const match:Row=dataset===undefined?{status:'open'}:{status:'open',dataset};
 return client.select(TABLE,match,{orderBy:'created_at',desc:true,limit});
}
/**
 * Sets ONE key of an item's detail — 'hook' or 'audit_written' — through the row-locking SQL function
 * patch_quarantine_detail (migration 20261107090000; plan audit round 1, P4). Every other detail key
 * (latest_result, chosen ids, …) and the resolution columns stay as the latest committed writer left
 * them. false = no such item. Needs client.rpc (callRpc: rpc_unavailable otherwise).
 */
export async function patchQuarantineDetail(client:TableClient,id:string,key:'hook'|'audit_written',value:unknown):Promise<boolean>{
 return (await callRpc(client,'patch_quarantine_detail',{p_id:id,p_key:key,p_value:value}))===true;
}
