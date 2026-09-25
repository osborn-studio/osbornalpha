import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { canonicalize, digest, fail } from '../ingest/pa-v1/json.js';
import { bindingFor, serverTime, type S4Actor } from './db';
import { authorize } from '../ingest/pa-v1/pack.js';

export async function candidateFor(db: PoolClient, actor: S4Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) fail('invalid_schema');
  const row = (await db.query('select * from public.research_s4_candidates where user_id=$1 and id=$2 for update',[actor.userId,id])).rows[0];
  if (!row) fail('scope_denied');
  const binding = await bindingFor(db,actor,row.payload_hash);
  if(binding.approvedManifestHash!==digest(row.imported.manifest)||binding.approvedPayloadHash!==row.payload_hash||
    canonicalize(binding.trustedConfig.rights)!==canonicalize(row.imported.rights)||
    canonicalize(binding.trustedConfig.grant)!==canonicalize(row.imported.grant)) fail('policy_blocked');
  authorize({rights:binding.trustedConfig.rights,grant:binding.trustedConfig.grant,source:row.imported.sourceVersion,
    scope:binding.upstreamScope,purpose:'alpha_research_import',recipient:'alpha-local',now:new Date(await serverTime(db))});
  return { row,binding };
}
export async function addRecord(db: PoolClient, actor: S4Actor, candidateId: string, kind: string,
  payload: Record<string,unknown>, options: { id?:string; outbox?:boolean } = {}) {
  const id = options.id || randomUUID(), at = await serverTime(db), hash = digest(payload);
  await db.query(`insert into public.research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash,recorded_at)
    values($1,$2,$3,$4,$5,$6,$7)`,[actor.userId,id,candidateId,kind,canonicalize(payload),hash,at]);
  await db.query(`insert into public.research_audit_log(id,user_id,actor,action,object_type,object_id,detail,created_at)
    values($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),actor.userId,actor.kind,'s4.'+kind,kind,id,canonicalize({candidate_id:candidateId,payload_hash:hash}),at]);
  if (options.outbox !== false) {
    const event = { record_id:id,kind,payload_hash:hash,server_time:at,
      observation_hash:kind === 'Observation' ? hash : null,
      rule_hash:kind === 'Observation' ? payload.market_policy_hash : null,
      provenance_level:'local_receipt' };
    await db.query('insert into public.research_s4_outbox(user_id,candidate_id,record_id,event,event_hash) values($1,$2,$3,$4,$5)',
      [actor.userId,candidateId,id,canonicalize(event),digest(event)]);
  }
  return { id,kind,payload,payload_hash:hash,recorded_at:at };
}
export async function replayRequest(db: PoolClient, actor: S4Actor, key: string, request: unknown) {
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) fail('invalid_schema');
  const row = (await db.query('select request_hash,response from public.research_s4_requests where user_id=$1 and request_key=$2',[actor.userId,key])).rows[0];
  if (row && row.request_hash !== digest(request)) fail('idempotency_conflict');
  return row ? { ...row.response,duplicate:true } : null;
}
export async function saveRequest(db:PoolClient,actor:S4Actor,key:string,request:unknown,response:unknown) {
  await db.query('insert into public.research_s4_requests(user_id,request_key,request_hash,response) values($1,$2,$3,$4)',
    [actor.userId,key,digest(request),canonicalize(response)]);
}
