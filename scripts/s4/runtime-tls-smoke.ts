/** Real TLS handshakes against an owned local PG cluster; never uses production credentials. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync,chmodSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Client,type ClientConfig} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from './local-db';
import {researchConfig} from '../../src/lib/research/runtime/config';
let interrupted=false;
const interrupt=()=>{interrupted=true;};
process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function main(){
 const state=await startLocalDatabase();let primary:unknown;
 try{
  const cert=join(state.directory,'server.crt'),key=join(state.directory,'server.key');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=db.example.test','-addext','subjectAltName=DNS:db.example.test','-keyout',key,'-out',cert],{stdio:'pipe',timeout:30000});chmodSync(key,0o600);
  const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
  appendFileSync(join(state.directory,'data','postgresql.auto.conf'),`\nssl=on\nssl_cert_file=${quote(cert)}\nssl_key_file=${quote(key)}\n`);
  execFileSync(join(state.bin,'pg_ctl'),['-D',join(state.directory,'data'),'-l',join(state.directory,'postgres.log'),'-m','fast','-w','restart'],{stdio:'pipe',timeout:30000});
  const url=new URL(state.runtimeUrl),host='db.example.test';url.hostname=host;
  const config=researchConfig({ALPHA_RESEARCH_RUNTIME_MODE:'production',ALPHA_S4_ENABLED:'1',VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),ALPHA_S4_RELEASE_SHA:'a'.repeat(40),ALPHA_S4_ORIGIN:'https://alpha.example.test',ALPHA_S4_DATABASE_URL:url.toString(),ALPHA_S4_DB_HOST:host,ALPHA_S4_DB_PORT:url.port,ALPHA_S4_DB_NAME:'postgres',ALPHA_S4_DB_ROLE:'s4_app',ALPHA_S4_OWNER_IDS:'10000000-0000-4000-8000-000000000001'});
  // Transport override is fixture-only. TLS authority remains the parsed DNS name.
  const base={...config.db,host:'127.0.0.1'};
  async function connect(options:ClientConfig){const client=new Client(options);try{await client.connect();return (await client.query('select ssl from pg_stat_ssl where pid=pg_backend_pid()')).rows[0]?.ssl;}finally{await client.end();}}
  await assert.rejects(()=>connect(base),/self.signed|certificate/i);
  const ssl={...config.db.ssl as object,ca:readFileSync(cert,'utf8')};
  assert.equal(await connect({...base,ssl}),true);
  await assert.rejects(()=>connect({...base,ssl:{...ssl,servername:'wrong.example.test'}}),/hostname|altnames|does not match/i);
  if(interrupted)throw new Error('interrupted');
  console.log(JSON.stringify({checks:3,scope:'real PostgreSQL TLS, synthetic CA, loopback transport override',production:false}));
 }catch(e){primary=e;throw e;}finally{stopLocalDatabase(state,primary);}
}
main().catch(()=>{console.error('Runtime TLS verification failed');process.exitCode=1;}).finally(()=>{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);});
