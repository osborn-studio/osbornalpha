import {createHash,verify,type KeyObject} from 'node:crypto';
import type {Pool} from 'pg';
import {verifyRevocationPage,type OwnerScope,type FeedCheckpoint} from './feed';
export interface FeedRegistration {feedId:string;localOwner:string;scope:OwnerScope;key:KeyObject}
/** Candidate persistence adapter for the isolated acceptance schema. Not wired to production.
 * Registration and pool are trusted operator dependencies, never request parameters. */
export async function applyRevocationPage(pool:Pool,registration:FeedRegistration,raw:Buffer,signature:string) {
 if(raw.length>65536||registration.key.type!=='public'||registration.key.asymmetricKeyType!=='ed25519'||! /^[0-9a-f]{128}$/.test(signature)||!verify(null,raw,registration.key,Buffer.from(signature,'hex')))throw new Error('revocation_apply_failed');
 const hash=createHash('sha256').update(raw).digest('hex');
 const db=await pool.connect();let discard=false;
 try{
  await db.query('begin isolation level read committed');
  // Match S4 owner lock ordering before locking feed or updating a binding.
  await db.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::uuid::text,0))',[registration.localOwner]);
  const row=(await db.query('select * from research_revocation_candidate.feed where feed_id=$1 and local_owner=$2 for update',[registration.feedId,registration.localOwner])).rows[0];
  if(!row||row.upstream_user!==registration.scope.user_id||row.workspace_id!==registration.scope.workspace_id)throw new Error();
  if(row.last_page_hash===hash){await db.query('commit');return {status:'duplicate' as const};}
  const checkpoint:FeedCheckpoint={feedId:row.feed_id,scope:registration.scope,cursor:row.cursor,latestSeq:row.latest_seq,publishedAt:row.published_at?.toISOString()??null};
  const now=(await db.query('select pg_catalog.clock_timestamp() as now')).rows[0].now.getTime();
  const plan=verifyRevocationPage(raw,signature,registration.key,checkpoint,now);
  for(const event of plan.events){
   await db.query('insert into research_revocation_candidate.inbox(feed_id,sequence,revocation_id,event) values($1,$2,$3,$4)',[registration.feedId,event.monotonic_seq,event.revocation_id,event]);
   await db.query(`update public.research_s4_bindings b set revoked=true from research_revocation_candidate.binding_map m
    where m.feed_id=$1 and m.local_owner=$2 and m.source_id=$3 and m.grant_id=$4 and m.grant_version=$5
    and b.user_id=m.local_owner and b.payload_hash=m.payload_hash`,[registration.feedId,registration.localOwner,event.source_id,event.grant_id,event.grant_version]);
  }
  await db.query('update research_revocation_candidate.feed set cursor=$2,latest_seq=$3,published_at=$4,last_page_hash=$5 where feed_id=$1',[registration.feedId,plan.checkpoint.cursor,plan.checkpoint.latestSeq,plan.checkpoint.publishedAt,hash]);
  await db.query('commit');return {status:'applied' as const,caughtUp:plan.caughtUp};
 }catch{
  try{await db.query('rollback');}catch{discard=true;}
  throw new Error('revocation_apply_failed');
 }finally{db.release(discard);}
}
