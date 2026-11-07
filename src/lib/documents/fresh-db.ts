// src/lib/documents/fresh-db.ts
// Test-only (plan F3 Task 1; codex plan round 1 P2-2): migration-replay assertions run in a dedicated
// temporary database of the test cluster, never in the shared test database the other suites use —
// replaying an earlier migration there (migration one's document_citations policy, or the spec-2
// migration's market checks without 'HK') would undo later migrations under concurrent suites until
// the suffix is re-applied. freshMigratedDatabase(adminUrl) creates f3_replay_<random> (the harness
// admin is a superuser), installs the auth/storage stand-ins of scripts/s4/local-db.ts (keep the two
// in sync; the cluster roles postgres/anon/authenticated/service_role already exist and the
// migrations create their own roles only if missing), applies every supabase/migrations file in
// order (optionally stopping before beforeMigration) and returns a pool on it; drop() closes the pool and drops the database. replayFiles applies
// files again, each in one transaction. Not a test file: it never reads S4_TEST_STATE itself.
import {randomBytes} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Pool} from 'pg';

const MIGRATIONS_DIR='supabase/migrations';
const SHIM=`create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`;

export interface FreshDatabase{pool:Pool;name:string;drop():Promise<void>}
async function onAdmin(adminUrl:string,sql:string):Promise<void>{
 const a=new Pool({connectionString:adminUrl,max:1});a.on('error',()=>{});
 try{await a.query(sql);}finally{await a.end();}
}
export async function freshMigratedDatabase(adminUrl:string,beforeMigration?:string):Promise<FreshDatabase>{
 const name=`f3_replay_${randomBytes(6).toString('hex')}`;
 await onAdmin(adminUrl,`create database ${name}`);
 const url=new URL(adminUrl);url.pathname=`/${name}`;
 const pool=new Pool({connectionString:url.toString(),max:2});pool.on('error',()=>{});
 let dropped=false;
 const drop=async()=>{if(dropped)return;dropped=true;await pool.end().catch(()=>{});await onAdmin(adminUrl,`drop database if exists ${name} with (force)`);};
 try{
  await pool.query(SHIM);
  for(const file of readdirSync(MIGRATIONS_DIR).filter(n=>n.endsWith('.sql')&&(!beforeMigration||n<beforeMigration)).sort()){
   try{await pool.query(readFileSync(join(MIGRATIONS_DIR,file),'utf8'));}
   catch(e){throw new Error(`fresh database: migration ${file}: ${(e as Error).message}`);}
  }
 }catch(e){await drop().catch(()=>{});throw e;}
 return {pool,name,drop};
}
/** Applies each file again, in order, each in one transaction (a replay). */
export async function replayFiles(pool:Pool,files:string[]):Promise<void>{
 for(const file of files){
  const c=await pool.connect();
  try{await c.query(`begin;\n${readFileSync(file,'utf8')}\n;commit;`);}
  catch(e){await c.query('rollback').catch(()=>{});throw e;}
  finally{c.release();}
 }
}
