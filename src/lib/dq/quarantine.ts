// Quarantine queue (spec §5.2 dq_quarantine). Rows that fail validation are parked here with
// the batch that produced them instead of landing in the target table. An OPEN item is unique
// per (dataset, table_name, natural_key, reason_code) so re-running a producer does not pile up
// duplicates. Resolution only transitions rows that are still open and reports the outcome, so
// an unknown id or another admin's earlier decision is never silently overwritten. Rows are
// written so the DB invariants hold: (status='open') = (resolved_at is null), and
// status='open' or resolved_by is not null.
import {randomUUID} from 'node:crypto';
import type {Row,TableClient} from '../db/table-client';

export type QuarantineStatus='open'|'resolved_accept'|'resolved_reject';
export type ResolveOutcome='resolved'|'not_found'|'already_resolved';
export interface QuarantineInput{
 dataset:string;table:string;naturalKey:string;reasonCode:string;
 detail?:Record<string,unknown>;payload?:Record<string,unknown>;batchId:string;
}

const TABLE='dq_quarantine';
const RESOLUTIONS:readonly QuarantineStatus[]=['resolved_accept','resolved_reject'];

/** Parks a row in quarantine and returns its id; an existing OPEN item with the same key and reason is reused. */
export async function quarantine(client:TableClient,input:QuarantineInput):Promise<string>{
 const key={dataset:input.dataset,table_name:input.table,natural_key:input.naturalKey,reason_code:input.reasonCode};
 const [existing]=await client.select(TABLE,{...key,status:'open'},{limit:1});
 if(existing)return existing.id as string;
 const id=randomUUID();
 await client.insert(TABLE,{
  id,...key,detail:input.detail??{},payload:input.payload??{},batch_id:input.batchId,
  status:'open',resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
 });
 return id;
}

export async function resolveQuarantine(client:TableClient,id:string,input:{status:QuarantineStatus;resolvedBy:string}):Promise<ResolveOutcome>{
 if(!RESOLUTIONS.includes(input.status))throw new Error('invalid_status');
 if(typeof input.resolvedBy!=='string'||input.resolvedBy.length===0)throw new Error('invalid_resolver');
 const [row]=await client.select(TABLE,{id},{limit:1});
 if(!row)return 'not_found';
 if(row.status!=='open')return 'already_resolved';
 // Matching on status='open' keeps a concurrent resolution from being overwritten; zero
 // rows means another resolver won after our read.
 const n=await client.update(TABLE,{id,status:'open'},{status:input.status,resolved_by:input.resolvedBy,resolved_at:new Date().toISOString()});
 return n===1?'resolved':'already_resolved';
}

export async function listOpenQuarantine(client:TableClient,dataset?:string,limit=100):Promise<Row[]>{
 const match:Row=dataset===undefined?{status:'open'}:{status:'open',dataset};
 return client.select(TABLE,match,{orderBy:'created_at',desc:true,limit});
}
