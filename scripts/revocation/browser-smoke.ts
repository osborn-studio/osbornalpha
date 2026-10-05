/** Finite served-Next/Chromium acceptance; owns a disposable local DB and synthetic feed. */
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash,randomBytes,randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,openSync,closeSync,copyFileSync,cpSync,symlinkSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setDefaultResultOrder} from 'node:dns';
setDefaultResultOrder('ipv4first');
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
const serveMode=process.argv[3]??'development';
if(!['development','built'].includes(serveMode))throw Error('invalid_acceptance_serve_mode');
let interrupted:Error|undefined;
let interruptOwned=()=>{};
const signals=['SIGINT','SIGTERM','SIGHUP'] as const;
const onSignal=()=>{interrupted=Error('acceptance_interrupted');interruptOwned();};
for(const signal of signals)process.on(signal,onSignal);
async function main(){
 if(readdirSync('.').some(n=>['.env','.env.local','.env.development','.env.development.local'].includes(n)))throw Error('acceptance_requires_env_free_worktree');
 mkdirSync(output,{recursive:true,mode:0o700});
 if(existsSync(join(output,'acceptance-result.json')))throw Error('acceptance_output_already_completed');
 const state=await startLocalDatabase(),db=new Pool({connectionString:state.adminUrl,statement_timeout:5000,connectionTimeoutMillis:5000});
 let build:ChildProcess|undefined,web:ChildProcess|undefined,browser:ChildProcess|undefined,primary:unknown,timer:ReturnType<typeof setInterval>|undefined,heartbeat=Promise.resolve(),heartbeatError:unknown;
 const app=join(state.directory,'web');
 let log:number|undefined,buildId:string|undefined,sourceDigest:string|undefined,repoDigest:string|undefined,webPid:number|undefined;
 let childEvidence:Record<string,unknown>|undefined,dependencyEvidence:Record<string,unknown>|undefined;
 const stopped=new Map<ChildProcess,Promise<void>>();
 const stopGroup=(child:ChildProcess|undefined):Promise<void>=>{
  if(!child?.pid)return Promise.resolve();const old=stopped.get(child);if(old)return old;
  const task=(async()=>{const pid=child.pid!;const alive=()=>{try{process.kill(-pid,0);return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')return false;throw e;}};
   const send=(signal:NodeJS.Signals)=>{try{process.kill(-pid,signal);}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}};
   if(alive()){send('SIGTERM');await new Promise(r=>setTimeout(r,child===browser?5000:500));if(alive())send('SIGKILL');}
   const deadline=Date.now()+5000;while((alive()||(child.exitCode===null&&child.signalCode===null))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
   if(alive()||(child.exitCode===null&&child.signalCode===null))throw Error('owned_process_group_cleanup_unconfirmed');
  })();stopped.set(child,task);return task;
 };
 interruptOwned=()=>{for(const child of [build,web,browser])void stopGroup(child).catch(()=>{});};
 const checkInterrupted=()=>{if(interrupted)throw interrupted;};
 try{
 log=openSync(join(output,'next.log'),'w',0o600);
 mkdirSync(app);
 for(const name of ['src','public','messages','config','docs','data','package.json','tsconfig.json','next.config.mjs','postcss.config.mjs','tailwind.config.ts'])cpSync(name,join(app,name),{recursive:true});
 symlinkSync(resolve('node_modules'),join(app,'node_modules'),'dir');
 const treeDigest=(root:string,paths:string[])=>{const hash=createHash('sha256');const visit=(rel:string)=>{for(const entry of readdirSync(join(root,rel),{withFileTypes:true}).sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)))){const path=join(rel,entry.name);if(entry.isSymbolicLink()){if(root===app&&path==='node_modules')continue;throw Error('acceptance_source_symlink');}if(entry.isDirectory())visit(path);else{const content=readFileSync(join(root,path));hash.update(JSON.stringify([path,content.length])+'\n');hash.update(content);}}};for(const path of paths)visit(path);return hash.digest('hex');};
 sourceDigest=treeDigest(app,['']);repoDigest=treeDigest(process.cwd(),['src','scripts','supabase/migrations']);
 const repoUnchanged=()=>{if(repoDigest!==treeDigest(process.cwd(),['src','scripts','supabase/migrations']))throw Error('acceptance_inputs_changed');};
 dependencyEvidence={node:process.version,next:JSON.parse(readFileSync('node_modules/next/package.json','utf8')).version,react:JSON.parse(readFileSync('node_modules/react/package.json','utf8')).version,lock_sha256:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex')};

 const nonce=randomBytes(24).toString('hex'),noncePath='/acceptance-'+randomUUID()+'.txt';writeFileSync(join(app,'public',noncePath),nonce);
 checkInterrupted();
  if(serveMode==='built')await new Promise<void>((done,reject)=>{
   // Build with no database/session credentials. This run uses local runtime;
   // production-mode research configuration is still hard closed by s4Pool.
   build=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{cwd:app,detached:true,stdio:['ignore',log,log],env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'}});
   const timeout=setTimeout(()=>{void stopGroup(build).catch(()=>{});reject(Error('acceptance_build_timeout'));},120000);
   build.on('error',e=>{clearTimeout(timeout);reject(e);});build.on('exit',code=>{clearTimeout(timeout);code===0?done():reject(Error('acceptance_build_failed'));});
  });
  if(build){await stopGroup(build);buildId=readFileSync(join(app,'.next','BUILD_ID'),'utf8').trim();if(!buildId)throw Error('missing_build_identity');}
  checkInterrupted();
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
  writeFileSync(join(state.directory,'web-state.json'),JSON.stringify({origin,secret,serveMode}),{mode:0o600});writeFileSync(join(state.directory,'s6-demo.json'),JSON.stringify({actor,candidateId:c.id,observationId:decision.observationId,revocation:{feedId,scope:pack.scope,sourceId:pack.sourceId,grantId:expected.grantId,privateKey:keys.privateKey.export({format:'pem',type:'pkcs8'})}}),{mode:0o600});
  checkInterrupted();
  web=spawn(process.execPath,['node_modules/next/dist/bin/next',serveMode==='built'?'start':'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:app,detached:true,stdio:['ignore',log,log],env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:serveMode==='built'?'production':'development',NEXT_TELEMETRY_DISABLED:'1',ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl,ALPHA_S4_LOCAL_AUTH:'1',ALPHA_S4_ORIGIN:origin,ALPHA_S4_LOCAL_SESSION_SECRET:secret}});
  webPid=web.pid;
  timer=setInterval(()=>{heartbeat=heartbeat.then(async()=>{if(!existsSync(join(state.directory,'stop-feed')))await publish();}).catch(e=>{heartbeatError=e;});},10000);
  const deadline=Date.now()+90000;let ready=false;
  while(Date.now()<deadline){checkInterrupted();if(web.exitCode!==null)throw Error('acceptance_web_exited');try{const r=await fetch(origin+noncePath,{signal:AbortSignal.timeout(3000)});if(r.ok&&await r.text()===nonce){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  if(!ready)throw Error('acceptance_web_timeout');
  checkInterrupted();if(web.exitCode!==null||!web.pid)throw Error('acceptance_web_exited');
  const listener=execFileSync(process.platform==='darwin'?'/usr/sbin/lsof':'lsof',['-nP','-a','-iTCP:'+port,'-sTCP:LISTEN','-Fpg'],{encoding:'utf8',timeout:5000});
  const groups=listener.split('\n').filter(line=>/^g[0-9]+$/.test(line));
  if(!groups.length||groups.some(line=>line!=='g'+web!.pid)||web.exitCode!==null)throw Error('acceptance_listener_not_owned');
  if(buildId){const served=await fetch(origin+'/_next/static/'+buildId+'/_buildManifest.js',{signal:AbortSignal.timeout(5000)});if(!served.ok)throw Error('acceptance_build_not_served');}
  repoUnchanged();
  await new Promise<void>((done,reject)=>{browser=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/s6/browser-smoke.ts',state.stateFile],{detached:true,stdio:['ignore',log,log],env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development'}});const timeout=setTimeout(()=>{void stopGroup(browser).catch(()=>{});reject(Error('acceptance_browser_timeout'));},120000);browser.on('error',e=>{clearTimeout(timeout);reject(e);});browser.on('exit',code=>{clearTimeout(timeout);code===0?done():reject(Error('acceptance_browser_failed'));});});
  if(heartbeatError)throw heartbeatError;
  repoUnchanged();
  childEvidence=JSON.parse(readFileSync(join(state.directory,'s6-browser-result.json'),'utf8'));
  for(const name of ['s6-browser-result.json','s6-desktop.png','s6-mobile.png','s6-replay.json'])copyFileSync(join(state.directory,name),join(output,name));
  checkInterrupted();
 }catch(e){primary=e;throw e;}finally{
  if(timer)clearInterval(timer);await heartbeat;
  const cleanupErrors:unknown[]=[];
  for(const child of [browser,web,build])try{await stopGroup(child);}catch(e){cleanupErrors.push(e);}
  // Playwright's Chromium is a separate process group from the test child.
  try{
   const file=join(state.directory,'chromium-pid.json');if(existsSync(file)){
    const {pid}=JSON.parse(readFileSync(file,'utf8'));if(!Number.isSafeInteger(pid)||pid<=1)throw Error('invalid_chromium_pid');
    const alive=()=>{try{process.kill(-pid,0);return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')return false;throw e;}};
    if(alive()){process.kill(-pid,'SIGTERM');await new Promise(r=>setTimeout(r,1000));if(alive())process.kill(-pid,'SIGKILL');}
    const until=Date.now()+5000;while(alive()&&Date.now()<until)await new Promise(r=>setTimeout(r,50));if(alive())throw Error('chromium_cleanup_unconfirmed');
   }
  }catch(e){cleanupErrors.push(e);}
  try{if(log!==undefined)closeSync(log);}catch(e){cleanupErrors.push(e);}
  try{await closeS4Pool();}catch(e){cleanupErrors.push(e);}try{await db.end();}catch(e){cleanupErrors.push(e);}
  try{stopLocalDatabase(state,primary,cleanupErrors.length>0);}catch(e){cleanupErrors.push(e);}
  if(cleanupErrors.length)throw new AggregateError([primary,...cleanupErrors].filter(Boolean),'acceptance_cleanup_failed; retained local state '+state.directory);
  if(heartbeatError)throw heartbeatError;checkInterrupted();
 }
 if(!childEvidence)throw Error('missing_browser_evidence');
 writeFileSync(join(output,'acceptance-result.json'),JSON.stringify({passed:true,cleanup_ok:true,serve_mode:serveMode,research_runtime:'local',production_deployment_verified:false,app_copy_sha256:sourceDigest,repo_input_sha256:repoDigest,dependencies:dependencyEvidence,build_id:buildId??null,web_pid:webPid,listener_group_verified:true,nonce_verified:true,child:childEvidence},null,2),{mode:0o600});
 console.log('Registered served Next + PostgreSQL + Chromium acceptance and cleanup passed; synthetic fixtures only.');
}
void main().catch(e=>{console.error(e instanceof Error?e.message:'acceptance_failed');process.exitCode=1;}).finally(()=>{for(const signal of signals)process.off(signal,onSignal);});
