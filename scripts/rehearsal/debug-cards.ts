import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {importCandidate} from '../../src/lib/research/s4/import';
import {revealCards} from '../../src/lib/research/s4/cards';
import {closeS4Pool} from '../../src/lib/research/s4/db';
import {digest} from '../../src/lib/research/ingest/pa-v1/json.js';
const state=JSON.parse(readFileSync('/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/alpha-s4-db-3ogaDr/state.json','utf8'));
Object.assign(process.env,{ALPHA_S4_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl});
const W='/Volumes/AIMATE_WORK/Developer/CodeX/Osborn-PA-pkg-g/docs/handoffs/pa-brain-s3/walkthrough';
const pack=JSON.parse(readFileSync(W+'/research-candidate-pack.json','utf8')),config=JSON.parse(readFileSync(W+'/alpha-trusted-config.json','utf8'));
const admin=new Pool({connectionString:state.adminUrl});const actor={userId:randomUUID(),kind:'agent' as const};
async function main(){
 await admin.query('insert into auth.users(id,email) values($1,$2)',[actor.userId,actor.userId+'@d.test']);await admin.query("update profiles set role='admin' where id=$1",[actor.userId]);
 const binding={localUserId:actor.userId,upstreamScope:pack.manifest.owner_scope,trustedConfig:config,synthetic:true,revoked:false,approvedPayloadHash:pack.manifest.payload_digest,approvedManifestHash:digest(pack.manifest)};
 await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,binding.approvedPayloadHash,binding]);
 const c=await importCandidate(actor,JSON.stringify(pack));console.log('imported',c);
 console.log('rows',(await admin.query('select id,payload_hash,status from research_s4_candidates where user_id=$1',[actor.userId])).rows);
 try{const cards=await revealCards(actor,c.id,{requestKey:randomUUID(),judgment:'debug',alreadySeen:[],independentJudgment:false});console.log('cards',cards.cards.length);}
 catch(e){console.log('ERR',(e as Error).message);console.log((e as Error).stack?.split('\n').slice(0,8).join('\n'));}
}
main().finally(async()=>{await closeS4Pool();await admin.end();});
