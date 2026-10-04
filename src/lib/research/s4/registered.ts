import type {PoolClient} from 'pg';
import {transaction,type S4Actor} from './db';
import {candidateFor} from './records';
import {withStoredCandidateInTransaction} from '../revocation/registered-access';
import {fail} from '../ingest/pa-v1/json.js';
/** Candidate-only composition for one stored candidate. Resolve without row locks
 * before guard entry; validate the stored content before any business work. */
export function registeredCandidateTransaction<T>(actor:S4Actor,id:string,work:(db:PoolClient)=>Promise<T>){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))fail('invalid_schema');
 return transaction(actor,async db=>{
  const selected=(await db.query('select payload_hash from public.research_s4_candidates where user_id=$1 and id=$2',[actor.userId,id])).rows[0];
  if(!selected)fail('scope_denied');
  return withStoredCandidateInTransaction(db,actor.userId,selected.payload_hash,async(client,expected)=>{
   const {row}=await candidateFor(client,actor,id);
   const ref=row.imported.manifest.extensions?.['pa.revocation_reference'];
   if(row.payload_hash!==selected.payload_hash||!ref||ref.protocol_version!=='pa-grant-reference/v1'
    ||ref.feed_id!==expected.feedId||ref.source_id!==expected.sourceId||ref.grant_id!==expected.grantId||ref.grant_version!==expected.grantVersion
    ||ref.owner_scope?.user_id!==expected.scope.user_id||ref.owner_scope?.workspace_id!==expected.scope.workspace_id
    ||row.imported.sourceRef.source_id!==expected.sourceId||row.imported.grant.grant_id!==expected.grantId
    ||typeof ref.revocation_seq_at_export!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(ref.revocation_seq_at_export))fail('invalid_revocation_candidate');
   const feed=(await client.query('select cursor from research_revocation_candidate.feed where feed_id=$1 and local_owner=$2',[expected.feedId,actor.userId])).rows[0];
   if(!feed||BigInt(ref.revocation_seq_at_export)>BigInt(feed.cursor))fail('export_watermark_ahead');
   return work(client);
  });
 });
}
