import type {Pool,PoolClient} from 'pg';
import {validateCandidateBinding} from '../ingest/candidate';
import type {ExpectedGrantReference} from './candidate';
import {assertRevocationFresh} from './freshness';
class AccessGateError extends Error {}
const deny=(code:string):never=>{throw new AccessGateError(code);};
/** Candidate protected-operation boundary. Trusted caller supplies pool/expected.
 * Work is trusted application code: DB-only, no external side effects, transaction
 * control, or mutation of security tables. This is not a sandbox for arbitrary SQL.
 * Not routed in production. All revocation writers must share the owner lock. */
export async function withRegisteredCandidate<T>(pool:Pool,actor:string,payloadHash:string,expected:ExpectedGrantReference,work:(db:PoolClient)=>Promise<T>):Promise<T>{
 const db=await pool.connect();let discard=false;
 try{
  await db.query('begin isolation level read committed');
  await db.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::uuid::text,0))',[actor]);
  const check=async()=>{
   const binding=(await db.query('select binding,revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[actor,payloadHash])).rows[0];
   if(!binding||binding.revoked)deny('binding_unavailable');
   validateCandidateBinding(binding.binding);const b=binding.binding;
   if(b.localUserId!==actor||b.revoked||b.approvedPayloadHash!==payloadHash||b.upstreamScope.user_id!==expected.scope.user_id||b.upstreamScope.workspace_id!==expected.scope.workspace_id)throw new Error();
   const rows=(await db.query(`select m.source_id,m.grant_id,m.grant_version,f.* from research_revocation_candidate.binding_map m
    join research_revocation_candidate.feed f on f.feed_id=m.feed_id and f.local_owner=m.local_owner
    where m.local_owner=$1 and m.payload_hash=$2`,[actor,payloadHash])).rows;
   if(rows.length!==1)throw new Error();const row=rows[0];
   if(row.feed_id!==expected.feedId||row.source_id!==expected.sourceId||row.grant_id!==expected.grantId||row.grant_version!==expected.grantVersion)throw new Error();
   const now=(await db.query('select pg_catalog.clock_timestamp() as now')).rows[0].now.getTime();
   const config=b.trustedConfig as {rights?:{valid_until?:string};grant?:{grant_id?:string;valid_until?:string}};
   if(config.grant?.grant_id!==expected.grantId||[config.rights?.valid_until,config.grant?.valid_until].some(t=>!t||!Number.isFinite(Date.parse(t))||Date.parse(t)<=now))deny('grant_invalid_or_expired');
   assertRevocationFresh({feedId:row.feed_id,scope:{user_id:row.upstream_user,workspace_id:row.workspace_id},cursor:row.cursor,latestSeq:row.latest_seq,publishedAt:row.published_at?.toISOString()??null},{feedId:expected.feedId,scope:expected.scope},now);
   const coverage=(await db.query('select count(*)::text as count,max(sequence)::text as last from research_revocation_candidate.inbox where feed_id=$1',[expected.feedId])).rows[0];
   if(coverage.count!==row.cursor||(coverage.last??'0')!==row.cursor)deny('inbox_coverage_gap');
   if((await db.query(`select 1 from research_revocation_candidate.inbox where feed_id=$1
    and event->>'source_id'=$2 and event->>'grant_id'=$3 and (event->>'grant_version')::integer=$4 limit 1`,[expected.feedId,expected.sourceId,expected.grantId,expected.grantVersion])).rowCount)deny('grant_version_revoked');
  };
  await check();const result=await work(db);
  // A long operation must not commit or disclose its result on an expired checkpoint.
  await check();await db.query('commit');return result;
 }catch(error){try{await db.query('rollback');}catch{discard=true;}throw new Error('revocation_access_denied',{cause:error instanceof AccessGateError?error.message:'validation_or_database'});}
 finally{db.release(discard);}
}
