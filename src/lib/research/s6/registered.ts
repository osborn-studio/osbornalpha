import type {PoolClient} from 'pg';
import {transaction,type S4Actor} from '../s4/db';
import {validateRegisteredStoredCandidate} from '../s4/registered';
import {withStoredCandidateInTransaction} from '../revocation/registered-access';
import {fail} from '../ingest/pa-v1/json.js';
/** Resolve an observation to its candidate under the existing owner lock, before
 * any writes. Trusted DB-only work must stay within this observation/candidate.
 * This browser/internal adapter does not authorize an evaluator session token. */
export function registeredObservationTransaction<T>(actor:S4Actor,id:string,work:(db:PoolClient)=>Promise<T>){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))fail('invalid_schema');
 return transaction(actor,async db=>{
  const selected=(await db.query(`select r.candidate_id,c.payload_hash from public.research_s4_records r
   join public.research_s4_candidates c on c.user_id=r.user_id and c.id=r.candidate_id
   where r.user_id=$1 and r.id=$2 and r.kind='Observation'`,[actor.userId,id])).rows[0];
  if(!selected)fail('not_found');
  return withStoredCandidateInTransaction(db,actor.userId,selected.payload_hash,async(client,expected)=>{
   await validateRegisteredStoredCandidate(client,actor,selected.candidate_id,selected.payload_hash,expected);
   return work(client);
  });
 });
}
