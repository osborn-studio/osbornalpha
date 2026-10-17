import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
let interrupted=false;const interrupt=()=>{interrupted=true;};process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function main(){
 const state=await startLocalDatabase(),db=new Pool({connectionString:state.adminUrl,max:2,connectionTimeoutMillis:5000,statement_timeout:10000});let primary:unknown;
 try{
  await db.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  await db.query(readFileSync('scripts/revocation/retention-guards.sql','utf8'));
  const owner=randomUUID(),feed=randomUUID(),source=randomUUID(),grant=randomUUID(),hash='a'.repeat(64);
  await db.query('insert into auth.users(id) values($1)',[owner]);
  await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[owner,hash,{}]);
  await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[feed,owner,randomUUID()]);
  await db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,1,$5)',[feed,owner,source,grant,hash]);
  await db.query('insert into research_revocation_candidate.inbox values($1,1,$2,$3)',[feed,randomUUID(),{source_id:source,grant_id:grant,grant_version:1}]);
  await db.query('create role synthetic_retention_writer nologin nosuperuser nobypassrls; grant usage on schema research_revocation_candidate to synthetic_retention_writer; grant select,update,delete,truncate on research_revocation_candidate.inbox,research_revocation_candidate.binding_map to synthetic_retention_writer');
  const client=await db.connect();
  try{
   await client.query('set role synthetic_retention_writer');
   assert.equal((await client.query('select count(*)::int n from research_revocation_candidate.inbox')).rows[0].n,1);
   for(const sql of ['delete from research_revocation_candidate.inbox','update research_revocation_candidate.inbox set event=\'{}\'','truncate research_revocation_candidate.inbox','delete from research_revocation_candidate.binding_map','truncate research_revocation_candidate.binding_map'])
    await assert.rejects(client.query(sql),/revocation_evidence_immutable/);
   await assert.rejects(client.query('update research_revocation_candidate.binding_map set grant_version=grant_version+1'),/immutable_revocation_mapping/);
   await assert.rejects(client.query('alter table research_revocation_candidate.inbox disable trigger retain_inbox_rows'),/must be owner/);
   await assert.rejects(client.query("set session_replication_role='replica'"),/permission denied/);
   assert.equal((await client.query('select count(*)::int n from research_revocation_candidate.inbox')).rows[0].n,1);
   assert.equal((await client.query('select count(*)::int n from research_revocation_candidate.binding_map')).rows[0].n,1);
  }finally{await client.query('reset role');client.release();}
  if(interrupted)throw new Error('interrupted');
  console.log('PASS: non-owner writer without owner/superuser/SET-parameter privileges cannot alter/prune inbox or remove mappings, truncate, disable triggers or bypass retention.');
 }catch(error){primary=error;throw error;}finally{try{await db.end();}finally{stopLocalDatabase(state,primary);}}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'retention test failed');process.exitCode=1;});
