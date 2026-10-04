import type {PoolClient} from 'pg';
import type {ExpectedGrantReference} from './candidate';
import {withRegisteredCandidateInTransaction} from './access';
/** Resolve only an already-registered server record, never an uploaded reference.
 * Operational roles must prevent request writers from creating/changing mappings
 * or feed identities. registerCandidateReference remains the trusted provisioning
 * boundary; this function does not authenticate PA metadata or create approval.
 * Resolution and rechecking run under the same clean transaction and owner lock. */
export async function withStoredCandidateInTransaction<T>(db:PoolClient,actor:string,payloadHash:string,work:(db:PoolClient)=>Promise<T>):Promise<T>{
 return withRegisteredCandidateInTransaction(db,actor,payloadHash,async client=>{
 const rows=(await client.query(`select m.feed_id,m.source_id,m.grant_id,m.grant_version,f.upstream_user,f.workspace_id
  from research_revocation_candidate.binding_map m
  join research_revocation_candidate.feed f on f.feed_id=m.feed_id and f.local_owner=m.local_owner
  where m.local_owner=$1 and m.payload_hash=$2`,[actor,payloadHash])).rows;
 if(rows.length!==1)throw new Error('registered_reference_unavailable');
 const row=rows[0];
 const expected:ExpectedGrantReference={feedId:row.feed_id,sourceId:row.source_id,grantId:row.grant_id,
  grantVersion:row.grant_version,scope:{user_id:row.upstream_user,workspace_id:row.workspace_id}};
 return expected;
 },work);
}
