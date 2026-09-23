/** Local restore drill; neither production backup nor an independent off-host receipt. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import assert from 'node:assert/strict';
import {bytesDigest,digest,replayObservation} from 'dsh-trade-strategy-evaluator/engine';
import {drainOutbox} from '../../src/lib/research/s4/anchor';
import {closeS4Pool} from '../../src/lib/research/s4/db';
import {createS6Store} from '../../src/lib/research/s6/store';
const [stateFile,root]=process.argv.slice(2),state=JSON.parse(readFileSync(stateFile,'utf8')),demo=JSON.parse(readFileSync(join(state.directory,'s6-demo.json'),'utf8'));
const url=new URL(state.adminUrl);if(url.hostname!=='127.0.0.1'||!state.directory.includes('alpha-s4-db-'))throw Error('local_acceptance_only');
Object.assign(process.env,{ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl});
async function main(){
 mkdirSync(root,{recursive:true,mode:0o700});chmodSync(root,0o700);
 let remaining;do{remaining=(await drainOutbox(demo.actor,demo.receiptRoot)).remaining;}while(remaining);
 const before=await createS6Store(demo.actor).readObservation(demo.observationId);await closeS4Pool();
 const name='s6_restore_'+randomBytes(6).toString('hex'),dump=join(root,name+'.dump');
 const args=['-h',url.hostname,'-p',url.port,'-U',decodeURIComponent(url.username)],env={...process.env,PGPASSWORD:decodeURIComponent(url.password)};
 execFileSync(join(state.bin,'pg_dump'),[...args,'-d',url.pathname.slice(1),'-Fc','-f',dump],{env,stdio:'pipe'});chmodSync(dump,0o600);
 const admin=new Pool({connectionString:state.adminUrl});try{await admin.query('create database '+name);}finally{await admin.end();}
 execFileSync(join(state.bin,'pg_restore'),[...args,'-d',name,'--exit-on-error',dump],{env,stdio:'pipe'});
 const runtime=new URL(state.runtimeUrl);runtime.pathname='/'+name;process.env.ALPHA_S4_DATABASE_URL=runtime.toString();
 const after=await createS6Store(demo.actor).readObservation(demo.observationId);assert.deepEqual(after,before);await closeS4Pool();
 const restoredUrl=new URL(state.adminUrl);restoredUrl.pathname='/'+name;const restored=new Pool({connectionString:restoredUrl.toString()});
 try{
  const rows=(await restored.query('select input,result,result_hash from research_s6_evaluations where user_id=$1',[demo.actor.userId])).rows;
  assert.ok(rows.length>0);for(const r of rows)assert.equal(replayObservation(r.input,{ok:true,result:r.result,result_sha256:r.result_hash}).matches,true);
  for(const n of ['s6-desktop.png','s6-mobile.png','s6-browser-result.json','s6-replay.json']){copyFileSync(join(state.directory,n),join(root,n));chmodSync(join(root,n),0o600);}
  const journal=readFileSync(join(demo.receiptRoot,digest(demo.actor.userId),'receipts.jsonl'));writeFileSync(join(root,'receipts.jsonl'),journal,{mode:0o600});
  const summary={passed:true,synthetic:true,restored_database:name,evaluations_replayed:rows.length,registration_unchanged:true,dump_sha256:bytesDigest(readFileSync(dump)),receipt_sha256:bytesDigest(journal),receipt_lines:journal.toString().trim().split('\n').length,off_host:false};
  writeFileSync(join(root,'restore-summary.json'),JSON.stringify(summary,null,2),{mode:0o600});writeFileSync(join(root,'state-location.txt'),stateFile+'\n',{mode:0o600});console.log(JSON.stringify(summary));
 }finally{await restored.end();}
}
main().catch(e=>{console.error((e as Error).message);process.exitCode=1;}).finally(closeS4Pool);
