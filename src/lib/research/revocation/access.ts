import {RevocationAccessDenied} from './error';
import type {Pool,PoolClient} from 'pg';
import {fail} from '../ingest/pa-v1/json.js';
import {validateCandidateBinding} from '../ingest/candidate';
import type {ExpectedGrantReference} from './candidate';
import {assertRevocationFresh} from './freshness';
class AccessGateError extends Error {}
const deny=(code:string):never=>{throw new AccessGateError(code);};
/** Composes with an existing explicit READ COMMITTED transaction on this client.
 * Enter before any transaction writes/row locks; commit immediately after return.
 * Failure aborts the unchanged transaction; caller must rollback. Trusted
 * DB-only work cannot control transactions, mutate security tables or emit results.
 * Caller retains session/role authorization and source/payload integrity duties. */
export async function withRegisteredCandidateInTransaction<T>(db:PoolClient,actor:string,payloadHash:string,expectedOrResolve:ExpectedGrantReference|((db:PoolClient)=>Promise<ExpectedGrantReference>),work:(db:PoolClient)=>Promise<T>):Promise<T>{
 let transactionId:string|null=null;let inWork=false;
 try{
  const state=(await db.query("select pg_catalog.pg_current_xact_id_if_assigned()::text as id,current_setting('transaction_isolation') as isolation")).rows[0];
  transactionId=state.id;
  if(state.id!==null)deny('transaction_not_clean');
  if(state.isolation!=='read committed')deny('transaction_isolation');
  transactionId=(await db.query('select pg_catalog.pg_current_xact_id()::text as id')).rows[0].id;
  await db.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::uuid::text,0))',[actor]);
  if((await db.query('select pg_catalog.pg_current_xact_id()::text as id')).rows[0].id!==transactionId)deny('explicit_transaction_required');
  // Resolver is trusted read-only application code; never supplied by a request.
  const expected=typeof expectedOrResolve==='function'?await expectedOrResolve(db):expectedOrResolve;
  const check=async()=>{
   const binding=(await db.query('select binding,revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[actor,payloadHash])).rows[0];
   if(!binding)deny('binding_missing');
   if(binding.revoked)deny('binding_revoked');
   validateCandidateBinding(binding.binding);const b=binding.binding;
   if(b.localUserId!==actor||b.revoked||b.approvedPayloadHash!==payloadHash||b.upstreamScope.user_id!==expected.scope.user_id||b.upstreamScope.workspace_id!==expected.scope.workspace_id)throw new Error();
   const rows=(await db.query(`select m.source_id,m.grant_id,m.grant_version,f.* from research_revocation_candidate.binding_map m
    join research_revocation_candidate.feed f on f.feed_id=m.feed_id and f.local_owner=m.local_owner
    where m.local_owner=$1 and m.payload_hash=$2`,[actor,payloadHash])).rows;
   if(rows.length!==1)deny('mapping_mismatch');const row=rows[0];
   if(row.feed_id!==expected.feedId||row.source_id!==expected.sourceId||row.grant_id!==expected.grantId||row.grant_version!==expected.grantVersion)deny('mapping_mismatch');
   const coverage=(await db.query('select count(*)::text as count,max(sequence)::text as last from research_revocation_candidate.inbox where feed_id=$1',[expected.feedId])).rows[0];
   if(coverage.count!==row.cursor||(coverage.last??'0')!==row.cursor)deny('inbox_coverage_gap');
   if((await db.query(`select 1 from research_revocation_candidate.inbox where feed_id=$1
    and event->>'source_id'=$2 and event->>'grant_id'=$3 and (event->>'grant_version')::integer=$4 limit 1`,[expected.feedId,expected.sourceId,expected.grantId,expected.grantVersion])).rowCount)deny('grant_version_revoked');
   const now=(await db.query('select pg_catalog.clock_timestamp() as now')).rows[0].now.getTime();
   const config=b.trustedConfig as {rights?:{valid_until?:string};grant?:{grant_id?:string;valid_until?:string}};
   const expiries=[config.rights?.valid_until,config.grant?.valid_until];
   if(config.grant?.grant_id!==expected.grantId||expiries.some(t=>!t||!Number.isFinite(Date.parse(t))))deny('grant_config_invalid');
   if(expiries.some(t=>Date.parse(t!)<=now))deny('grant_expired');
   try{assertRevocationFresh({feedId:row.feed_id,scope:{user_id:row.upstream_user,workspace_id:row.workspace_id},cursor:row.cursor,latestSeq:row.latest_seq,publishedAt:row.published_at?.toISOString()??null},{feedId:expected.feedId,scope:expected.scope},now);}catch{deny('revocation_stale');}
  };
  await check();inWork=true;const result=await work(db);inWork=false;
  if((await db.query('select pg_catalog.pg_current_xact_id()::text as id')).rows[0].id!==transactionId)deny('transaction_changed');
  // A long operation must not commit or disclose its result on an expired checkpoint.
  await check();return result;
 }catch(error){
  // Do not allow a caller's catch-and-COMMIT path to publish denied work. Never
  // abort a different transaction created by a callback that broke the contract.
  try{
   const current=(await db.query('select pg_catalog.pg_current_xact_id_if_assigned()::text as id')).rows[0].id;
   if(transactionId!==null&&current===transactionId)await db.query('select 1/0');
  }catch{/* Already aborted, disconnected, or deliberately poisoned. */}
  const code=(error as {code?:unknown})?.code;
  if(inWork&&error instanceof Error&&typeof code==='string'&&/^[a-z][a-z_]{0,63}$/.test(code)&&error.message===code&&typeof (error as {recovery?:unknown}).recovery==='string')fail(code);
  throw new RevocationAccessDenied(error instanceof AccessGateError?error.message:'validation_or_database');
 }
}
/** Standalone candidate adapter. Do not nest inside an existing pool transaction. */
export async function withRegisteredCandidate<T>(pool:Pool,actor:string,payloadHash:string,expected:ExpectedGrantReference,work:(db:PoolClient)=>Promise<T>):Promise<T>{
 const db=await pool.connect();let discard=false;
 try{
  await db.query('begin isolation level read committed');
  const result=await withRegisteredCandidateInTransaction(db,actor,payloadHash,expected,work);
  await db.query('commit');return result;
 }catch(error){try{await db.query('rollback');}catch{discard=true;}throw error;}
 finally{db.release(discard);}
}
