import {digest,fail} from '../ingest/pa-v1/json.js';
import {verifyStoredIntent} from './intent-receipt';
type Evaluation=Parameters<typeof verifyStoredIntent>[0];
interface Control {user_id:string;candidate_id:string;kind:string;payload:Record<string,unknown>;payload_hash:string}
/** Integrity only; caller must supply authorized observation hash and all evaluation
 * rows/append controls in one locked transaction. No grants or disclosure authority.
 * Result is highestInBatch only: it cannot attest query completeness or global latest.
 * Caller must fetch101 rows/controls without revision filtering and reject overflow.
 * Controls must be scoped to this observation, not merely the candidate.
 * Revisions may have gaps because intent fences consume revisions without evaluations. */
export function verifyArmEvaluationBatch(owner:string,candidateId:string,observationId:string,observationHash:string,rows:Evaluation[],controls:Control[]):{highestInBatch:Evaluation|null}{
 if(rows.length>100||controls.length>100)fail('input_limit');
 if(rows.length!==controls.length)fail('hash_mismatch');
 const revisions=new Set<number>(),ids=new Set<string>();let latest:Evaluation|null=null;
 for(const row of rows){
  verifyStoredIntent(row,owner,observationId,row.idempotency_key);
  if(row.input.observation_sha256!==observationHash||ids.has(row.id)||revisions.has(row.receipt.revision))fail('hash_mismatch');
  ids.add(row.id);revisions.add(row.receipt.revision);
  const matches=controls.filter(c=>c.payload.evaluation_ref===row.id);
  if(matches.length!==1)fail('hash_mismatch');
  const c=matches[0],p=c.payload;
  if(c.user_id!==owner||c.candidate_id!==candidateId||c.kind!=='ControlEvent'||digest(p)!==c.payload_hash||p.type!=='evaluation.append'||p.observation_ref!==observationId||p.revision!==row.receipt.revision||p.expected_revision!==row.receipt.revision-1||p.input_sha256!==row.receipt.input_sha256||p.result_sha256!==row.result_hash)fail('hash_mismatch');
  if(!latest||row.receipt.revision>latest.receipt.revision)latest=row;
 }
 return {highestInBatch:latest};
}
