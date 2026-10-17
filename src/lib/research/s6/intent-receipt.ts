import {digest,inputDigest} from 'dsh-trade-strategy-evaluator/engine';
import {fail} from '../ingest/pa-v1/json';
import type {Commit} from './store';
type StoredEvaluation={user_id:string;id:string;observation_id:string;idempotency_key:string;body_hash:string;input:Commit['input'];result:Commit['result'];result_hash:string;receipt:{schema_version:string;owner_scope:{user_id:string;workspace_id:null};status:string;observation_ref:string;revision:number;idempotency_key:string;input_sha256:string;result_sha256:string;evaluation_ref:string}};
/** Verify a durable receipt without executing today's evaluator. This proves stored
 * consistency, not a fresh investment judgment or a replay of the historical engine.
 * Caller must authenticate, check authority/integrity and serialize with commits.
 */
export function verifyStoredIntent(row:StoredEvaluation,owner:string,id:string,key:string){
 try{
  const r=row.receipt,i=row.input,result=row.result;
  if(row.user_id!==owner||row.observation_id!==id||row.idempotency_key!==key||r.schema_version!=='evaluator-rpc/1.0'||r.owner_scope.user_id!==owner||r.owner_scope.workspace_id!==null||r.status!=='accepted'||r.observation_ref!==id||r.idempotency_key!==key||r.evaluation_ref!==row.id||!Number.isSafeInteger(r.revision)||r.revision<1)fail('hash_mismatch');
  if(i.observation.id!==id||digest(i.observation)!==i.observation_sha256||inputDigest(i)!==i.input_sha256||r.input_sha256!==i.input_sha256||digest(result)!==row.result_hash||r.result_sha256!==row.result_hash||result.rule_version!==i.observation.market_policy_version)fail('hash_mismatch');
  if(i.market_snapshots.length!==i.market_snapshot_sha256s.length||i.market_snapshots.some((m,n)=>digest(m)!==i.market_snapshot_sha256s[n]))fail('hash_mismatch');
  const body={schema_version:'evaluator-rpc/1.0',observation_ref:{id,sha256:i.observation_sha256},market_snapshot_refs:i.market_snapshots.map((m,n)=>({id:m.id,sha256:i.market_snapshot_sha256s[n]})),engine_version:result.engine_version,rule_version:result.rule_version,input_sha256:i.input_sha256,input:i,result,result_sha256:row.result_hash,expected_revision:r.revision-1,idempotency_key:key,request_key:key};
  if(digest(body)!==row.body_hash)fail('hash_mismatch');
  return row.id;
 }catch{fail('hash_mismatch');}
}
