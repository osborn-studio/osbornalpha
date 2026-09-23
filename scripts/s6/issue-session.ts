/** Operator provisioning for an isolated local DB. Token is written only to a private file. */
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {tokenHash} from '../../src/lib/research/s6/store';
const [stateFile,owner,file]=process.argv.slice(2),state=JSON.parse(readFileSync(stateFile,'utf8'));
if(new URL(state.adminUrl).hostname!=='127.0.0.1'||!state.directory.includes('alpha-s4-db-')||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(owner))throw Error('local_acceptance_only');
const db=new Pool({connectionString:state.adminUrl}),token=owner+'.'+randomBytes(32).toString('hex');
async function main(){
 const row=(await db.query("select role from profiles where id=$1",[owner])).rows[0];if(row?.role!=='admin')throw Error('scope_denied');
 // wx refuses to overwrite an existing credential file, including symlink targets.
 writeFileSync(file,JSON.stringify({token,owner_scope:{user_id:owner,workspace_id:null},audience:'alpha-evaluator'}),{mode:0o600,flag:'wx'});
 await db.query("insert into research_s6_sessions(user_id,token_hash,subject,audience,scopes,expires_at) values($1,$2,'local-operator','alpha-evaluator',array['observation:read','evaluation:append'],clock_timestamp()+interval '1 hour')",[owner,tokenHash(token)]);
 console.log(JSON.stringify({created:true,credential_file:file,max_lifetime_seconds:3600}));
}
main().catch(e=>{console.error((e as Error).message);process.exitCode=1;}).finally(()=>db.end());
