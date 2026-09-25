/** Explicit local acceptance backup, outside the repository and database data dir. */
import {execFileSync} from 'node:child_process';
import {mkdirSync,chmodSync,readFileSync,writeFileSync,copyFileSync,lstatSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {drainOutbox} from '../../src/lib/research/s4/anchor';
import {closeS4Pool} from '../../src/lib/research/s4/db';
import {digest,sha256} from '../../src/lib/research/ingest/pa-v1/json.js';
const [stateFile,root,actor]=process.argv.slice(2);
async function main(){
 if(!isAbsolute(root))throw new Error('absolute_backup_root_required');mkdirSync(root,{recursive:true,mode:0o700});
 const stat=lstatSync(root);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error('private_backup_root_required');
 const state=JSON.parse(readFileSync(stateFile,'utf8')),receipt=JSON.parse(readFileSync(join(state.directory,'receipt-state.json'),'utf8'));
 process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
 let pending;do{const result=await drainOutbox({userId:actor,kind:'agent'},receipt.root);pending=result.remaining;}while(pending);
 const backupJournal=join(root,'receipts.jsonl');copyFileSync(join(receipt.root,digest(actor),'receipts.jsonl'),backupJournal);chmodSync(backupJournal,0o600);
 const db=new URL(state.adminUrl),dump=join(root,'database.dump');
 execFileSync(join(state.bin,'pg_dump'),['-h',db.hostname,'-p',db.port,'-U',decodeURIComponent(db.username),'-d',db.pathname.slice(1),'-Fc','-f',dump],{env:{...process.env,PGPASSWORD:decodeURIComponent(db.password)},stdio:'pipe'});chmodSync(dump,0o600);
 for(const name of ['s4-desktop.png','s4-mobile.png','browser-result.json']){copyFileSync(join(state.directory,name),join(root,name));chmodSync(join(root,name),0o600);}
 const summary={synthetic:true,provenance_level:'local_receipt',database_dump_sha256:sha256(readFileSync(dump)),journal_sha256:sha256(readFileSync(backupJournal)),journal_entries:readFileSync(backupJournal,'utf8').trim().split('\n').length};
 writeFileSync(join(root,'backup-summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
 // Contains no credentials; runtime URLs remain only in the original private state.
 writeFileSync(join(root,'local-state-location.txt'),stateFile+'\n',{mode:0o600});
 console.log(JSON.stringify({status:'passed',root,...summary}));
}
main().catch(e=>{console.error((e as Error).message);process.exitCode=1;}).finally(closeS4Pool);
