/** Finite served-Next/Chromium acceptance; owns a disposable local DB and synthetic feed. */
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes,randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,openSync,closeSync,copyFileSync,cpSync,symlinkSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {Pool} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
import {testPack} from '../s4/test-pack';
import {canonicalize,digest} from '../../src/lib/research/ingest/pa-v1/json.js';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
import {registerCandidateReference} from '../../src/lib/research/revocation/register';
import {importRegisteredCandidate} from '../../src/lib/research/s4/import';
import {revealRegisteredCards} from '../../src/lib/research/s4/cards';
import {submitRegisteredDecision} from '../../src/lib/research/s4/decisions';
import {closeS4Pool} from '../../src/lib/research/s4/db';
const output=resolve(process.argv[2]||'reports/registered-browser');
async function main(){
 if(readdirSync('.').some(n=>['.env','.env.local','.env.development','.env.development.local'].includes(n)))throw Error('acceptance_requires_env_free_worktree');
 mkdirSync(output,{recursive:true,mode:0o700});
 const state=await startLocalDatabase(),db=new Pool({connectionString:state.adminUrl,statement_timeout:5000,connectionTimeoutMillis:5000});
 let web:ChildProcess|undefined,browser:ChildProcess|undefined,primary:unknown,timer:ReturnType<typeof setInterval>|undefined,heartbeat=Promise.resolve(),heartbeatError:unknown;
 const app=join(state.directory,'web');
 const log=openSync(join(output,'next.log'),'w',0o600);
 const stopGroup=async(child:ChildProcess|undefined)=>{if(!child?.pid)return;const send=(signal:NodeJS.Signals)=>{try{process.kill(-child.pid!,signal);}catch{}};send('SIGTERM');await new Promise(r=>setTimeout(r,500));send('SIGKILL');};
 try{
 mkdirSync(app);
 for(const name of ['src','public','messages','config','docs','data','package.json','tsconfig.json','next.config.mjs','postcss.config.mjs','tailwind.config.ts'])cpSync(name,join(app,name),{recursive:true});
 symlinkSync(resolve('node_modules'),join(app,'node_modules'),'dir');
  await db.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  await db.query('grant usage on schema research_revocation_candidate to alpha_s4_runtime;grant select on all tables in schema research_revocation_candidate to alpha_s4_runtime');
  const actor={userId:randomUUID(),kind:'agent' as const},pack=testPack(actor.userId),feedId=randomUUID(),keys=generateKeyPairSync('ed25519');
  const expected={feedId,scope:pack.scope,sourceId:pack.sourceId,grantId:pack.config.grant.grant_id,grantVersion:1};
  pack.pack.manifest.extensions['pa.revocation_reference']={protocol_version:'pa-grant-reference/v1',feed_id:feedId,owner_scope:pack.scope,source_id:pack.sourceId,grant_id:expected.grantId,grant_version:1,observed_at:pack.version.ingested_at,revocation_seq_at_export:'0'};
  pack.pack.files['manifest.json']=canonicalize(pack.pack.manifest);pack.binding.approvedManifestHash=digest(pack.pack.manifest);
  await db.query('insert into auth.users(id) values($1)',[actor.userId]);await db.query("update profiles set role='admin' where id=$1",[actor.userId]);
  await db.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,pack.binding.approvedPayloadHash,pack.binding]);
  await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[feedId,actor.userId,pack.scope.user_id]);
  const publish=async()=>{const raw=Buffer.from(JSON.stringify({protocol_version:'pa-revocation/v1',feed_id:feedId,owner_scope:pack.scope,from_seq:'0',through_seq:'0',latest_seq:'0',published_at:new Date().toISOString(),events:[]}));await applyRevocationPage(db,{feedId,localOwner:actor.userId,scope:pack.scope,key:keys.publicKey},raw,sign(null,raw,keys.privateKey).toString('hex'));};
  await publish();await registerCandidateReference(db,actor.userId,pack.binding.approvedPayloadHash,JSON.stringify(pack.pack),expected);
  Object.assign(process.env,{ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl});
  await db.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('S6SYNTH','Synthetic browser','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
  const c=await importRegisteredCandidate(actor,JSON.stringify(pack.pack)),shown=await revealRegisteredCards(actor,c.id,{requestKey:randomUUID(),judgment:'Synthetic agent browser acceptance',alreadySeen:[],independentJudgment:false});
  const decision=await submitRegisteredDecision(actor,c.id,{requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic browser verification only',cardId:shown.cards[0].id,labelId:shown.labelId,exposureId:shown.exposureId,securityTicker:'S6SYNTH',companyEntityId:null,newObservation:true,reviewAt:null});
  const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,'127.0.0.1',r));const port=(portServer.address() as {port:number}).port;await new Promise<void>(r=>portServer.close(()=>r()));
  const origin='http://localhost:'+port,secret=randomBytes(32).toString('hex');
  writeFileSync(join(state.directory,'web-state.json'),JSON.stringify({origin,secret}),{mode:0o600});writeFileSync(join(state.directory,'s6-demo.json'),JSON.stringify({actor,candidateId:c.id,observationId:decision.observationId,revocation:{feedId,scope:pack.scope,sourceId:pack.sourceId,grantId:expected.grantId,privateKey:keys.privateKey.export({format:'pem',type:'pkcs8'})}}),{mode:0o600});
  web=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{cwd:app,detached:true,stdio:['ignore',log,log],env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl,ALPHA_S4_LOCAL_AUTH:'1',ALPHA_S4_ORIGIN:origin,ALPHA_S4_LOCAL_SESSION_SECRET:secret}});
  timer=setInterval(()=>{heartbeat=heartbeat.then(async()=>{if(!existsSync(join(state.directory,'stop-feed')))await publish();}).catch(e=>{heartbeatError=e;});},10000);
  const deadline=Date.now()+90000;let ready=false;
  while(Date.now()<deadline){if(web.exitCode!==null)throw Error('acceptance_web_exited');try{const r=await fetch(origin+'/research/observations',{signal:AbortSignal.timeout(3000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  if(!ready)throw Error('acceptance_web_timeout');
  await new Promise<void>((done,reject)=>{browser=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/s6/browser-smoke.ts',state.stateFile],{detached:true,stdio:['ignore',log,log],env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development'}});const timeout=setTimeout(()=>{void stopGroup(browser);reject(Error('acceptance_browser_timeout'));},120000);browser.on('error',e=>{clearTimeout(timeout);reject(e);});browser.on('exit',code=>{clearTimeout(timeout);code===0?done():reject(Error('acceptance_browser_failed'));});});
  if(heartbeatError)throw heartbeatError;
  for(const name of ['s6-browser-result.json','s6-desktop.png','s6-mobile.png','s6-replay.json'])copyFileSync(join(state.directory,name),join(output,name));
  console.log('Registered served Next + PostgreSQL + Chromium acceptance passed; synthetic fixtures only.');
 }catch(e){primary=e;throw e;}finally{
  if(timer)clearInterval(timer);await heartbeat;
  await stopGroup(browser);await stopGroup(web);
  closeSync(log);await closeS4Pool();await db.end();stopLocalDatabase(state,primary);
 }
}
void main().catch(e=>{console.error(e instanceof Error?e.message:'acceptance_failed');process.exitCode=1;});
