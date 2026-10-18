/** Dedicated synthetic cluster: privilege mutations never touch the shared suite database. */
import assert from 'node:assert/strict';
import {startLocalDatabase,stopLocalDatabase,ownedPool} from './local-db';
import {assertRuntimePrivileges} from '../../src/lib/research/runtime/privileges';
let interrupted=false;
const interrupt=()=>{interrupted=true;};
process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function main(){
 const state=await startLocalDatabase();const admin=ownedPool({connectionString:state.adminUrl,connectionTimeoutMillis:5000,statement_timeout:15000}),runtime=ownedPool({connectionString:state.runtimeUrl,connectionTimeoutMillis:5000,statement_timeout:15000});
 let primary:unknown;let checks=0;
 const check=async()=>{const db=await runtime.connect();try{await assertRuntimePrivileges(db);}finally{db.release();}};
 try{
  await check();checks++;
  for(const [up,down] of [
   ['create role synthetic_privileged nologin bypassrls; grant synthetic_privileged to s4_app with inherit false','revoke synthetic_privileged from s4_app; drop role synthetic_privileged'],
   ['grant pg_write_all_data to s4_app with inherit false','revoke pg_write_all_data from s4_app'],
   ['create role synthetic_ddl nologin; grant create on schema public to synthetic_ddl; grant synthetic_ddl to s4_app with inherit false','revoke synthetic_ddl from s4_app; revoke create on schema public from synthetic_ddl; drop role synthetic_ddl'],
   [`create role synthetic_ddl nologin; grant create on database "${new URL(state.adminUrl).pathname.slice(1)}" to synthetic_ddl; grant synthetic_ddl to s4_app with inherit false`,`revoke synthetic_ddl from s4_app; revoke create on database "${new URL(state.adminUrl).pathname.slice(1)}" from synthetic_ddl; drop role synthetic_ddl`],
   ['alter role s4_app createrole','alter role s4_app nocreaterole'],
   ['grant create on schema public to s4_app','revoke create on schema public from s4_app'],
   ['alter table research_s4_bindings owner to alpha_s4_runtime','alter table research_s4_bindings owner to s4_admin'],
   ['alter table research_s4_bindings disable row level security','alter table research_s4_bindings enable row level security'],
   ['alter table research_s4_bindings no force row level security','alter table research_s4_bindings force row level security'],
  ]){
   await admin.query(up);try{await assert.rejects(check,/scope_denied/);checks++;}finally{await admin.query(down);}
   await check();
  }
  if(interrupted)throw new Error('interrupted');
  console.log(JSON.stringify({checks,scope:'dedicated synthetic PostgreSQL role negatives',production:false}));
 }catch(e){primary=e;throw e;}finally{try{await runtime.end();}finally{try{await admin.end();}finally{stopLocalDatabase(state,primary);}}}
}
main().catch(()=>{console.error('Runtime privilege verification failed');process.exitCode=1;}).finally(()=>{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);});
