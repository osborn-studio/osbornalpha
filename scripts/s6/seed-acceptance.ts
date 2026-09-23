/** Explicitly supplied, already-authorized synthetic S3 package; isolated DB only. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {digest} from 'dsh-trade-strategy-evaluator/engine';
import {importCandidate} from '../../src/lib/research/s4/import';
import {revealCards} from '../../src/lib/research/s4/cards';
import {submitDecision} from '../../src/lib/research/s4/decisions';
import {closeS4Pool} from '../../src/lib/research/s4/db';
import {drainOutbox} from '../../src/lib/research/s4/anchor';
const [statePath,packPath,configPath,receiptRoot]=process.argv.slice(2);
const state=JSON.parse(readFileSync(statePath,'utf8'));
if(new URL(state.adminUrl).hostname!=='127.0.0.1'||!state.directory.includes('alpha-s4-db-'))throw Error('local_acceptance_only');
Object.assign(process.env,{ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl});
const db=new Pool({connectionString:state.adminUrl}),actor={userId:randomUUID(),kind:'agent' as const};
async function main(){
 const pack=JSON.parse(readFileSync(packPath,'utf8')),config=JSON.parse(readFileSync(configPath,'utf8'));
 const binding={localUserId:actor.userId,upstreamScope:pack.manifest.owner_scope,trustedConfig:config,synthetic:true,revoked:false,approvedPayloadHash:pack.manifest.payload_digest,approvedManifestHash:digest(pack.manifest)};
 await db.query('insert into auth.users(id,email) values($1,$2)',[actor.userId,actor.userId+'@example.test']);await db.query("update profiles set role='admin' where id=$1",[actor.userId]);
 await db.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,binding.approvedPayloadHash,binding]);
 await db.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('S6SYNTH','合成验收证券','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
 const c=await importCandidate(actor,JSON.stringify(pack));
 const cards=await revealCards(actor,c.id,{requestKey:randomUUID(),judgment:'S3.4 合成工程样例接到 S6，无独立人工投研判断。',alreadySeen:['S3 walkthrough'],independentJudgment:false});
 const decision=await submitDecision(actor,c.id,{requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'验证冻结窗口、计算与 Replay；真实行情待获准。',cardId:cards.cards[0].id,labelId:cards.labelId,exposureId:cards.exposureId,securityTicker:'S6SYNTH',companyEntityId:null,newObservation:true,reviewAt:null});
 mkdirSync(receiptRoot,{recursive:true,mode:0o700});await drainOutbox(actor,receiptRoot);
 const evidence={actor,candidateId:c.id,observationId:decision.observationId,decisionId:decision.decisionId,upstream_payload_sha256:pack.manifest.payload_digest,upstream_producer_commit:pack.manifest.producer_commit,receiptRoot,synthetic:true,scope:'local_engineering_only'};
 writeFileSync(join(state.directory,'s6-demo.json'),JSON.stringify(evidence,null,2),{mode:0o600});
 console.log(JSON.stringify(evidence));
}
main().finally(async()=>{await closeS4Pool();await db.end();});
