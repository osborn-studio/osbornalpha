import type {Pool} from 'pg';
import {prepareRevocationCandidate,type ExpectedGrantReference} from './candidate';
import {assertRevocationFresh} from './freshness';
class RegistrationGateError extends Error {}
const reject=(code:string):never=>{throw new RegistrationGateError(code);};
/** Isolated candidate adapter. Pool and expected reference are trusted operator
 * dependencies. An existing approved binding is required; none is created here. */
export async function registerCandidateReference(pool:Pool,actor:string,payloadHash:string,raw:string,expected:ExpectedGrantReference){
 const db=await pool.connect();let discard=false;
 try{
  await db.query('begin isolation level read committed');
  await db.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::uuid::text,0))',[actor]);
  const feed=(await db.query('select * from research_revocation_candidate.feed where feed_id=$1 and local_owner=$2 for update',[expected.feedId,actor])).rows[0];
  const stored=(await db.query('select binding,revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2 for update',[actor,payloadHash])).rows[0];
  if(!feed)reject('feed_missing');
  if(!stored)reject('binding_missing');
  if(stored.revoked)reject('binding_revoked');
  const {prepared,reference}=prepareRevocationCandidate(raw,actor,stored.binding,expected);
  if(prepared.payloadHash!==payloadHash||feed.upstream_user!==expected.scope.user_id||feed.workspace_id!==expected.scope.workspace_id)reject('scope_mismatch');
  const now=(await db.query('select pg_catalog.clock_timestamp() as now')).rows[0].now.getTime();
  try{assertRevocationFresh({feedId:feed.feed_id,scope:{user_id:feed.upstream_user,workspace_id:feed.workspace_id},cursor:feed.cursor,latestSeq:feed.latest_seq,publishedAt:feed.published_at?.toISOString()??null},{feedId:expected.feedId,scope:expected.scope},now);}catch{reject('checkpoint_unavailable');}
  if(BigInt(feed.cursor)<BigInt(reference.revocation_seq_at_export))reject('export_watermark_ahead');
  if([prepared.rights.valid_until,prepared.grant.valid_until].some(t=>!Number.isFinite(Date.parse(t))||Date.parse(t)<=now))reject('grant_expired');
  // Candidate correctness gate: sequence PK and positivity plus count=max=cursor
  // prove retained coverage from zero. Never accept a bootstrapped/pruned interval.
  const coverage=(await db.query('select count(*)::text as count,max(sequence)::text as last from research_revocation_candidate.inbox where feed_id=$1',[expected.feedId])).rows[0];
  if(coverage.count!==feed.cursor||(coverage.last??'0')!==feed.cursor)reject('inbox_coverage_gap');
  const mappings=(await db.query('select feed_id,source_id,grant_id,grant_version from research_revocation_candidate.binding_map where local_owner=$1 and payload_hash=$2',[actor,payloadHash])).rows;
  if(mappings.some(m=>m.feed_id!==reference.feed_id||m.source_id!==reference.source_id||m.grant_id!==reference.grant_id||m.grant_version!==reference.grant_version))reject('mapping_conflict');
  // The INSERT trigger takes the same owner lock and rejects committed tombstones,
  // including on duplicate delivery. Do not advance or synthesize a checkpoint.
  const result=await db.query('insert into research_revocation_candidate.binding_map(feed_id,local_owner,source_id,grant_id,grant_version,payload_hash) values($1,$2,$3,$4,$5,$6) on conflict do nothing',[reference.feed_id,actor,reference.source_id,reference.grant_id,reference.grant_version,payloadHash]);
  await db.query('commit');return {status:result.rowCount?'registered' as const:'duplicate' as const};
 }catch(error){
  try{await db.query('rollback');}catch{discard=true;}
  throw new Error('revocation_registration_failed',{cause:error instanceof RegistrationGateError?error.message:error instanceof Error&&error.message==='grant_version_revoked'?'grant_version_revoked':'validation_or_database'});
 }finally{db.release(discard);}
}
