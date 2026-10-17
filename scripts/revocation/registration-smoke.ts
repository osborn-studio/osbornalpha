import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {POST as observationRoute} from '../../src/app/api/research/s6/observations/[id]/route';
import {prepareRegisteredInput,prepareRegisteredEvaluation,prepareInput,prepareEvaluation,makeCommit,createS6Store,createRegisteredS6Store,createRegisteredEvaluatorStore,tokenHash} from '../../src/lib/research/s6/store';
import {freezeRegisteredMarket,freezeRegisteredMarketHandoff,benchmarkIdentity} from '../../src/lib/research/s6/market';
import {syntheticMapping} from '../s6/fixtures';
import {addRecord} from '../../src/lib/research/s4/records';
import {transaction} from '../../src/lib/research/s4/db';
import {registeredObservationReport} from '../../src/lib/research/s6/report';
import {localSessionToken} from '../../src/lib/research/s4/auth';
import {GET as statusRoute} from '../../src/app/api/research/s4/candidates/[id]/status/route';
import {POST as revealRoute} from '../../src/app/api/research/s4/candidates/[id]/reveal/route';
import {POST as decisionsRoute} from '../../src/app/api/research/s4/candidates/[id]/decisions/route';
import {POST as historyRoute} from '../../src/app/api/research/s4/candidates/[id]/history/route';
import {POST as citationRoute} from '../../src/app/api/research/s4/candidates/[id]/citation/route';
import {s4Http} from '../../src/lib/research/s4/http';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync,sign,createHmac} from 'node:crypto';
import {importRegisteredCandidate} from '../../src/lib/research/s4/import';
import {submitRegisteredDecision,type DecisionInput} from '../../src/lib/research/s4/decisions';
import {registeredCandidateStatus,registeredCitation,registeredReviewHistory} from '../../src/lib/research/s4/read';
import {revealRegisteredCards,weekPeriod} from '../../src/lib/research/s4/cards';
import {closeS4Pool} from '../../src/lib/research/s4/db';
import {startLocalDatabase,stopLocalDatabase,ownedPool} from '../s4/local-db';
import {testPack} from '../s4/test-pack';
import {canonicalize,digest} from '../../src/lib/research/ingest/pa-v1/json.js';
import {prepareRevocationCandidate} from '../../src/lib/research/revocation/candidate';
import {registerCandidateReference} from '../../src/lib/research/revocation/register';
import {withRegisteredCandidate,withRegisteredCandidateInTransaction,withRegisteredCandidatesInTransaction} from '../../src/lib/research/revocation/access';
import {withStoredCandidateInTransaction} from '../../src/lib/research/revocation/registered-access';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
let interrupted=false;const interrupt=()=>{interrupted=true;};process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function main(){
 const state=await startLocalDatabase(),db=ownedPool({connectionString:state.adminUrl,max:3,connectionTimeoutMillis:5000,statement_timeout:10000});let primary:unknown;
 try{
  await db.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  // Disposable runtime role only; no production ACL provisioning is claimed.
  await db.query('grant usage on schema research_revocation_candidate to alpha_s4_runtime; grant select on all tables in schema research_revocation_candidate to alpha_s4_runtime');
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  process.env.ALPHA_S4_LOCAL_AUTH='1';process.env.ALPHA_S4_ORIGIN='http://127.0.0.1:3199';process.env.ALPHA_S4_LOCAL_SESSION_SECRET=randomUUID();
  const actor=randomUUID(),t=testPack(actor),feedId=randomUUID();
  const s4Actor={userId:actor,kind:'agent' as const};
  const expected={feedId,scope:t.scope,sourceId:t.sourceId,grantId:t.config.grant.grant_id,grantVersion:1};
  const reference={protocol_version:'pa-grant-reference/v1',feed_id:feedId,owner_scope:t.scope,source_id:t.sourceId,grant_id:expected.grantId,grant_version:1,observed_at:t.version.ingested_at,revocation_seq_at_export:'0'};
  t.pack.manifest.extensions['pa.revocation_reference']=reference;t.pack.files['manifest.json']=canonicalize(t.pack.manifest);t.binding.approvedManifestHash=digest(t.pack.manifest);
  const raw=JSON.stringify(t.pack),hash=t.binding.approvedPayloadHash;
  prepareRevocationCandidate(raw,actor,t.binding,expected);
  const rejected=(promise:Promise<unknown>,cause:string)=>assert.rejects(promise,e=>e instanceof Error&&e.message==='revocation_registration_failed'&&e.cause===cause);
  const register=()=>registerCandidateReference(db,actor,hash,raw,expected);
  await db.query('insert into auth.users(id) values($1)',[actor]);
  await db.query("update public.profiles set role='admin' where id=$1",[actor]);
  await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[feedId,actor,t.scope.user_id]);
  await rejected(register(),'binding_missing'); // no approval, no side-effect
  await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor,hash,t.binding]);
  await rejected(register(),'checkpoint_unavailable'); // no committed heartbeat
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const registration={feedId,localOwner:actor,scope:t.scope,key:publicKey};
  const page={protocol_version:'pa-revocation/v1',feed_id:feedId,owner_scope:t.scope,from_seq:'0',through_seq:'0',latest_seq:'0',published_at:new Date().toISOString(),events:[]};
  const apply=async(p:unknown)=>{const b=Buffer.from(JSON.stringify(p));return applyRevocationPage(db,registration,b,sign(null,b,privateKey).toString('hex'));};
  await apply(page);
  await assert.rejects(importRegisteredCandidate(s4Actor,raw),/revocation_access_denied/);
  const httpDenied=await s4Http(()=>importRegisteredCandidate(s4Actor,raw));
  assert.equal(httpDenied.status,503);
  assert.equal((await db.query('select count(*)::int n from public.research_s4_candidates')).rows[0].n,0);
  let called=false;
  await assert.rejects(withRegisteredCandidate(db,actor,hash,expected,async()=>{called=true;return 'denied';}),/revocation_access_denied/);
  assert.equal(called,false);
  await rejected(registerCandidateReference(db,actor,hash,raw,{...expected,grantVersion:2}),'validation_or_database');
  const ahead=structuredClone(t.pack);
  ahead.manifest.extensions['pa.revocation_reference']={...reference,revocation_seq_at_export:'1'};
  ahead.files['manifest.json']=canonicalize(ahead.manifest);
  await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,{...t.binding,approvedManifestHash:digest(ahead.manifest)}]);
  await rejected(registerCandidateReference(db,actor,hash,JSON.stringify(ahead),expected),'export_watermark_ahead');
  await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,t.binding]);
  for(const update of ["published_at=clock_timestamp()-interval '61 seconds'","latest_seq=1","upstream_user='11111111-1111-4111-8111-111111111111'"]){
   await db.query('update research_revocation_candidate.feed set '+update+' where feed_id=$1',[feedId]);await rejected(register(),update.startsWith('upstream_user')?'scope_mismatch':'checkpoint_unavailable');
   await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp(),latest_seq=0,upstream_user=$2 where feed_id=$1',[feedId,t.scope.user_id]);
  }
  await db.query('update research_revocation_candidate.feed set cursor=1,latest_seq=1 where feed_id=$1',[feedId]);
  await rejected(register(),'inbox_coverage_gap');
  await db.query('update research_revocation_candidate.feed set cursor=0,latest_seq=0 where feed_id=$1',[feedId]);
  assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.binding_map')).rows[0].n,0);
  await db.query(`create function research_revocation_candidate.reject_mapping() returns trigger language plpgsql as $$ begin raise exception 'synthetic after insert failure'; end $$;create trigger reject_mapping after insert on research_revocation_candidate.binding_map for each row execute function research_revocation_candidate.reject_mapping()`);
  await assert.rejects(register());assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.binding_map')).rows[0].n,0);
  await db.query('drop trigger reject_mapping on research_revocation_candidate.binding_map');
  assert.deepEqual((await Promise.all([register(),register()])).map(x=>x.status).sort(),['duplicate','registered']);
  assert.equal((await db.query('select cursor from research_revocation_candidate.feed')).rows[0].cursor,'0');
  const imported=await importRegisteredCandidate(s4Actor,raw);
  assert.equal(imported.duplicate,false);
  const handlers={status:statusRoute,reveal:revealRoute,decisions:decisionsRoute,history:historyRoute,citation:citationRoute};
  const origin=process.env.ALPHA_S4_ORIGIN,cookie='alpha_s4_local_session='+localSessionToken(actor,process.env.ALPHA_S4_LOCAL_SESSION_SECRET,Date.now()+3600000);
  const evaluateRoute=(id:string,body:unknown)=>observationRoute(new Request(origin+'/api/research/s6/observations/'+id,{method:'POST',headers:{host:'127.0.0.1:3199',origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id})});
  const route=(name:keyof typeof handlers,body:unknown={},query='',headers:Record<string,string>={})=>handlers[name](new Request(origin+'/api/research/s4/candidates/'+imported.id+'/'+name+query,{method:name==='status'?'GET':'POST',headers:{host:'127.0.0.1:3199',origin,cookie,'content-type':'application/json',...headers},...(name==='status'?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({id:imported.id})});
  const success=async(response:Promise<Response>)=>{const result=await response;assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');return result.json();};
  for(const name of Object.keys(handlers) as Array<keyof typeof handlers>){assert.equal((await route(name,{},'',{cookie:''})).status,401);assert.equal((await route(name,{},'',{host:'evil.example'})).status,403);assert.equal((await route(name,{},'',{'sec-fetch-site':'cross-site'})).status,403);}
  assert.deepEqual(await success(route('status')),{revision:0,observations:[]});

  assert.deepEqual(await registeredCandidateStatus(s4Actor,imported.id),{revision:0,observations:[]});
  const revealInput={requestKey:randomUUID(),judgment:'Synthetic automated acceptance only',alreadySeen:[],independentJudgment:false};
  const shown=await success(route('reveal',revealInput));
  assert.ok(shown);
  const label=(await db.query("select payload from public.research_s4_records where user_id=$1 and kind='HumanLabel'",[actor])).rows[0].payload;
  assert.equal(label.actor_kind,'agent');assert.equal(label.independent,false);
  await db.query(`insert into public.stocks_universe(ticker,name,market,exchange,currency,metadata) values('REVTEST','Synthetic','US','XNYS','USD','{"synthetic":true}')`);
  const decision:DecisionInput={requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic automated test; not investment advice',cardId:shown.cards[0].id,labelId:shown.labelId,exposureId:shown.exposureId,securityTicker:'REVTEST',companyEntityId:null,newObservation:true,reviewAt:null};
  const decided=await success(route('decisions',decision));
  assert.equal(decided.revision,1);assert.equal(decided.duplicate,false);
  assert.equal((await success(route('decisions',decision))).duplicate,true);
  await assert.rejects(submitRegisteredDecision(s4Actor,imported.id,{...decision,reason:'changed'}),/idempotency_conflict/);
  await assert.rejects(submitRegisteredDecision(s4Actor,imported.id,{...decision,requestKey:randomUUID()}),/revision_conflict/);
  assert.equal((await registeredCitation(s4Actor,imported.id,shown.cards[0].id,0)).text,t.raw);
  assert.ok((await registeredReviewHistory(s4Actor,imported.id)).records.some((r:{kind:string})=>r.kind==='Decision'));

  const businessCounts=async()=>{
   const counts:Record<string,number>={};
   for(const table of ['research_s6_evaluations','research_s4_records','research_s4_requests','research_s4_outbox','research_audit_log','research_judgments','research_labels','research_decisions','research_s4_observation_state']){
    counts[table]=(await db.query('select count(*)::int n from public.'+table+' where user_id=$1',[actor])).rows[0].n;
   }
   return counts;
  };
  process.env.ALPHA_S6_ENABLED='1'; // Disposable local fixture only.
  const reportBefore=await businessCounts();
  const observationReport=await registeredObservationReport(s4Actor,decided.observationId);
  assert.equal(observationReport.observationId,decided.observationId);assert.equal(observationReport.synthetic,true);
  assert.equal((await businessCounts()).research_s4_records,reportBefore.research_s4_records+1);
  const reportExposure=(await db.query("select candidate_id,payload from public.research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'origin'='alpha_evaluation_report'",[actor])).rows;
  assert.equal(reportExposure.length,1);assert.equal(reportExposure[0].candidate_id,imported.id);assert.deepEqual(reportExposure[0].payload.exposed_artifact_ids,[]);
  const reportSource=(await db.query('select imported from public.research_s4_candidates where id=$1',[imported.id])).rows[0].imported.sourceRef;assert.deepEqual(reportExposure[0].payload.subject_refs,[digest([reportSource.owner_system,reportSource.owner_scope,reportSource.source_id])]);
  const beforeReplay=await businessCounts();await assert.rejects(registeredObservationReport(s4Actor,decided.observationId,randomUUID()),/not_found/);assert.deepEqual(await businessCounts(),beforeReplay);

  // Generate an actual synthetic evaluation through the existing S6 fixture API.
  // This setup is not a claim that evaluator commit/market paths are registered.
  const frozenObservation=(await createS6Store(s4Actor).readObservation(decided.observationId)).observation;
  const handoffRaw=readFileSync('docs/handoffs/alpha-s6/market-interface/spy.synthetic.json','utf8');
  const handoffId='registered-handoff-spy';
  const handoffCli=async(statePath=state.stateFile,bundlePath='docs/handoffs/alpha-s6/market-interface/spy.synthetic.json',extraEnv:Record<string,string>={})=>{
   try{const result=await promisify(execFile)(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/s6/freeze-market-handoff.ts',statePath,actor,decided.observationId,bundlePath,'--id',handoffId],{env:{PATH:process.env.PATH,NODE_ENV:'test',...extraEnv},timeout:30000});return {code:0,result:JSON.parse(result.stdout)};}
   catch(error){const e=error as {code:number;stdout:string};return {code:e.code,result:JSON.parse(e.stdout)};}
  };
  const handoffCliPositive=await handoffCli();assert.equal(handoffCliPositive.code,0);assert.equal(handoffCliPositive.result.duplicate,false);
  assert.equal((await handoffCli()).result.duplicate,true);
  assert.equal((await freezeRegisteredMarketHandoff(s4Actor,decided.observationId,{raw:handoffRaw,id:handoffId})).duplicate,true);
  assert.equal((await db.query('select count(*)::int n from research_s6_markets where user_id=$1 and id=$2',[actor,handoffId])).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from research_s4_records where user_id=$1 and payload->>'type'='market.freeze' and payload->>'snapshot_ref'=$2",[actor,handoffId])).rows[0].n,1);
  const registeredMappings=[frozenObservation.securities[0],benchmarkIdentity(true)].map(security=>syntheticMapping(security));
  for(const mapping of registeredMappings){
   assert.equal((await freezeRegisteredMarket(s4Actor,decided.observationId,mapping,'synthetic')).duplicate,false);
   assert.equal((await freezeRegisteredMarket(s4Actor,decided.observationId,mapping,'synthetic')).duplicate,true);
  }
  const freezeSnapshot=async()=>({counts:await businessCounts(),markets:(await db.query('select * from public.research_s6_markets where user_id=$1 order by id',[actor])).rows});
  const beforeCliGuards=await freezeSnapshot();
  for(const change of [{runtimeUrl:state.runtimeUrl.replace('127.0.0.1','192.0.2.1')},{runtimeUrl:state.runtimeUrl+'?host=192.0.2.1'},{directory:''}]){
   const badState=state.directory+'/bad-state.json';writeFileSync(badState,JSON.stringify({...state,...change}),{mode:0o600});
   const denied=await handoffCli(badState);assert.equal(denied.code,3);assert.equal(denied.result.code,'local_acceptance_only');
  }
  const realBundle=state.directory+'/real-flag.synthetic-test.json';writeFileSync(realBundle,JSON.stringify({...JSON.parse(handoffRaw),synthetic:false}),{mode:0o600});
  const deniedReal=await handoffCli(state.stateFile,realBundle,{ALPHA_S6_REAL_MARKET:'1'});assert.equal(deniedReal.code,1);assert.equal(deniedReal.result.code,'rule_unsupported');assert.deepEqual(await freezeSnapshot(),beforeCliGuards);
  for(const cause of ['revocation_stale','binding_revoked'] as const){
   if(cause==='revocation_stale')await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '61 seconds'");
   else await db.query('update public.research_s4_bindings set revoked=true where user_id=$1 and payload_hash=$2',[actor,hash]);
   const before=await freezeSnapshot();
   try{for(const id of [handoffId,randomUUID()])await assert.rejects(freezeRegisteredMarketHandoff(s4Actor,decided.observationId,{raw:handoffRaw,id}),e=>e instanceof Error&&e.cause===cause);const cliDenied=await handoffCli();assert.equal(cliDenied.code,3);assert.equal(cliDenied.result.code,cause==='revocation_stale'?'revocation_check_unavailable':'revocation_access_denied');for(const id of [registeredMappings[0].id,randomUUID()])await assert.rejects(freezeRegisteredMarket(s4Actor,decided.observationId,{...registeredMappings[0],id},'synthetic'),e=>e instanceof Error&&e.cause===cause);assert.deepEqual(await freezeSnapshot(),before);}
   finally{await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');await db.query('update public.research_s4_bindings set revoked=false where user_id=$1 and payload_hash=$2',[actor,hash]);}
  }
  const beforeMarketNegatives=await freezeSnapshot();
  await assert.rejects(freezeRegisteredMarket(s4Actor,decided.observationId,{...registeredMappings[0],providerVersion:'synthetic-changed/2'},'synthetic'),/idempotency_conflict/);
  await assert.rejects(freezeRegisteredMarket(s4Actor,decided.observationId,{...registeredMappings[0],security:{...registeredMappings[0].security,ticker:'OUTSIDE'}},'synthetic'),/scope_denied/);
  await assert.rejects(freezeRegisteredMarket(s4Actor,'invalid',registeredMappings[0],'synthetic'),/invalid_schema/);
  await assert.rejects(freezeRegisteredMarket(s4Actor,randomUUID(),registeredMappings[0],'synthetic'),/not_found/);
  await assert.rejects(freezeRegisteredMarketHandoff(s4Actor,decided.observationId,{raw:JSON.stringify({...JSON.parse(handoffRaw),synthetic:false}),id:randomUUID()}),/rule_unsupported/);
  assert.deepEqual(await freezeSnapshot(),beforeMarketNegatives);
  // Actual insert completes only after freshness expires; all market/control/outbox writes roll back.
  await db.query(`create function public.synthetic_market_delay() returns trigger language plpgsql as $$ begin perform pg_sleep(6); return new; end $$; create trigger synthetic_market_delay before insert on public.research_s6_markets for each row execute function public.synthetic_market_delay()`);
  const beforeSlowMarket=await freezeSnapshot();
  try{
   await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
   const started=performance.now();await assert.rejects(freezeRegisteredMarket(s4Actor,decided.observationId,{...registeredMappings[0],id:randomUUID()},'synthetic'),e=>e instanceof Error&&e.cause==='revocation_stale');
   assert.ok(performance.now()-started>=5900);assert.deepEqual(await freezeSnapshot(),beforeSlowMarket);
  }finally{await db.query('drop trigger synthetic_market_delay on public.research_s6_markets; drop function public.synthetic_market_delay()');await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');}

  const preparation=await prepareRegisteredEvaluation(s4Actor,decided.observationId);
  const registeredToken='synthetic-session-'+randomUUID();
  await db.query("insert into public.research_s6_sessions(user_id,token_hash,subject,audience,scopes,expires_at) values($1,$2,'synthetic-registered','alpha-evaluator',array['observation:read','evaluation:append'],clock_timestamp()+interval '1 hour')",[actor,tokenHash(registeredToken)]);
  const registeredStore=createRegisteredS6Store(s4Actor,registeredToken);
  assert.deepEqual(await registeredStore.readObservation(decided.observationId),await createS6Store(s4Actor).readObservation(decided.observationId));
  for(const mid of preparation.marketIds)assert.deepEqual(await registeredStore.readMarketSnapshot(mid),await createS6Store(s4Actor).readMarketSnapshot(mid));
  await assert.rejects(createRegisteredS6Store(s4Actor,'invalid').readObservation(decided.observationId),/not_authenticated/);
  // Machine disclosure adapter: no transport activation, synthetic session only.
  const evaluatorStore=createRegisteredEvaluatorStore(s4Actor,registeredToken);
  assert.throws(()=>createRegisteredEvaluatorStore(s4Actor,undefined as unknown as string),/not_authenticated/);
  for(const [origin,id,read,control] of [
   ['alpha_evaluator_observation',decided.observationId,()=>evaluatorStore.readObservation(decided.observationId),()=>registeredStore.readObservation(decided.observationId)],
   ['alpha_evaluator_market',preparation.marketIds[0],()=>evaluatorStore.readMarketSnapshot(preparation.marketIds[0]),()=>registeredStore.readMarketSnapshot(preparation.marketIds[0])],
  ] as const){
   const before=await businessCounts();assert.deepEqual(await read(),await control());
   const after=await businessCounts();
   for(const table of ['research_s4_records','research_s4_outbox','research_audit_log'])assert.equal(after[table],before[table]+1);
   const exposures=(await db.query("select candidate_id,payload from public.research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'origin'=$2",[actor,origin])).rows;
   assert.equal(exposures.length,1);const e=exposures[0];assert.equal(e.candidate_id,imported.id);
   assert.deepEqual(e.payload.exposed_artifact_ids,[id]);assert.deepEqual(e.payload.subject_refs,reportExposure[0].payload.subject_refs);
   assert.equal(e.payload.actor_ref,actor);assert.equal(e.payload.session_token_hash,tokenHash(registeredToken));assert.ok(!JSON.stringify(e.payload).includes(registeredToken));assert.equal(e.payload.actor_kind,'agent');assert.equal(e.payload.shadow_exposed,false);assert.equal(e.payload.evaluation_period_id,weekPeriod(e.payload.displayed_at));
  }
  const repeatBefore=await businessCounts();await evaluatorStore.readObservation(decided.observationId);await evaluatorStore.readMarketSnapshot(preparation.marketIds[1]);assert.equal((await businessCounts()).research_s4_records,repeatBefore.research_s4_records+2);
  const repeated=(await db.query("select payload from public.research_s4_records where user_id=$1 and payload->>'origin'='alpha_evaluator_observation'",[actor])).rows;assert.equal(repeated.length,2);
  assert.throws(()=>createRegisteredEvaluatorStore(s4Actor,''),/not_authenticated/);
  assert.throws(()=>createRegisteredEvaluatorStore({...s4Actor,kind:'human'},registeredToken),/scope_denied/);
  for(const [mutation,code] of [["revoked=true",'not_authenticated'],["scopes=array['evaluation:append']",'scope_denied']] as const){
   const before=await businessCounts();
   await db.query('update public.research_s6_sessions set '+mutation+' where user_id=$1 and token_hash=$2',[actor,tokenHash(registeredToken)]);
   try{for(const read of [()=>evaluatorStore.readObservation(decided.observationId),()=>evaluatorStore.readMarketSnapshot(preparation.marketIds[0])])await assert.rejects(read(),new RegExp(code));assert.deepEqual(await businessCounts(),before);}
   finally{await db.query("update public.research_s6_sessions set revoked=false,scopes=array['observation:read','evaluation:append'] where user_id=$1 and token_hash=$2",[actor,tokenHash(registeredToken)]);}
  }
  const foreignSessionBefore=await businessCounts();await assert.rejects(createRegisteredEvaluatorStore({userId:randomUUID(),kind:'agent'},registeredToken).readObservation(decided.observationId),/not_authenticated/);assert.deepEqual(await businessCounts(),foreignSessionBefore);
  const missingBefore=await businessCounts();await assert.rejects(createRegisteredEvaluatorStore(s4Actor,'invalid').readObservation(decided.observationId),/not_authenticated/);assert.deepEqual(await businessCounts(),missingBefore);
  await db.query(`create function research_revocation_candidate.delay_machine_exposure() returns trigger language plpgsql as $$ begin
   if new.kind='ExposureEvent' and new.payload->>'origin' in ('alpha_evaluator_observation','alpha_evaluator_market') then perform pg_sleep(6);end if;return new;end $$;
   create trigger delay_machine_exposure before insert on public.research_s4_records for each row execute function research_revocation_candidate.delay_machine_exposure()`);
  try{
   for(const read of [()=>evaluatorStore.readObservation(decided.observationId),()=>evaluatorStore.readMarketSnapshot(preparation.marketIds[0])]){
    for(const mode of ['session','feed']){
     await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
     if(mode==='session')await db.query("update public.research_s6_sessions set expires_at=clock_timestamp()+interval '5 seconds' where user_id=$1 and token_hash=$2",[actor,tokenHash(registeredToken)]);
     else await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
     const before=await businessCounts(),started=performance.now();
     await assert.rejects(read(),e=>e instanceof Error&&(mode==='session'?e.message==='not_authenticated':e.cause==='revocation_stale'));
     assert.ok(performance.now()-started>=5900);assert.deepEqual(await businessCounts(),before);
     await db.query("update public.research_s6_sessions set expires_at=created_at+interval '1 hour' where user_id=$1 and token_hash=$2",[actor,tokenHash(registeredToken)]);
    }
   }
  }finally{
   await db.query('drop trigger delay_machine_exposure on public.research_s4_records');
   await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
   await db.query("update public.research_s6_sessions set expires_at=created_at+interval '1 hour' where user_id=$1 and token_hash=$2",[actor,tokenHash(registeredToken)]);
  }
  const preparedInput=await prepareRegisteredInput(s4Actor,decided.observationId,preparation.marketIds,preparation.asOf);
  assert.deepEqual(preparedInput,await prepareInput(s4Actor,decided.observationId,preparation.marketIds,preparation.asOf));
  assert.equal(preparedInput.observation.id,decided.observationId);
  assert.deepEqual(preparedInput.market_snapshots.map(m=>m.id).sort(),preparation.marketIds);
  // Independently denied candidate: synthetic operator provisioning only; no trusted mapping.
  const deniedCandidate=randomUUID(),deniedHash=digest({fixture:'denied preparation candidate'});
  await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding,revoked) values($1,$2,$3,true)',[actor,deniedHash,{...t.binding,approvedPayloadHash:deniedHash}]);
  await db.query(`insert into public.research_s4_candidates(user_id,id,source_version_id,external_candidate_id,payload_hash,imported)
   select user_id,$2,source_version_id,$2,$3,imported from public.research_s4_candidates where user_id=$1 and id=$4`,[actor,deniedCandidate,deniedHash,imported.id]);
  const snapshot=(await db.query('select * from public.research_s4_records where user_id=$1 and id=$2',[actor,preparedInput.observation.input_snapshot_ref])).rows[0];
  const observationRecord=(await db.query('select * from public.research_s4_records where user_id=$1 and id=$2',[actor,decided.observationId])).rows[0];
  const alternateSource=randomUUID();
  await db.query(`insert into public.research_source_versions(user_id,id,source_document_id,version_identity,source_key,source_ref,source_version)
   select user_id,$2::uuid,source_document_id,$2::uuid::text,$2::uuid::text,source_ref,source_version from public.research_source_versions where user_id=$1 and id=$3`,[actor,alternateSource,snapshot.payload.source_version_id]);
  const noPreparedDisclosure=async()=>{const before=await businessCounts();await assert.rejects(prepareRegisteredInput(s4Actor,decided.observationId,preparation.marketIds,preparation.asOf),/hash_mismatch/);assert.deepEqual(await businessCounts(),before);};
  await db.query('alter table public.research_s4_records disable trigger research_s4_records_immutable');
  try{
   try{
    await db.query('update public.research_s4_records set candidate_id=$3 where user_id=$1 and id=$2',[actor,observationRecord.id,deniedCandidate]);
    const before=await businessCounts();
    for(const op of [()=>registeredStore.readObservation(decided.observationId),()=>registeredStore.readMarketSnapshot(preparation.marketIds[0]),()=>registeredStore.commitEvaluationResult(makeCommit(preparedInput,randomUUID(),preparation.revision))])await assert.rejects(op(),/revocation_access_denied/);
    const marketBefore=await freezeSnapshot();await assert.rejects(freezeRegisteredMarket(s4Actor,decided.observationId,registeredMappings[0],'synthetic'),/revocation_access_denied/);assert.deepEqual(await freezeSnapshot(),marketBefore);
    assert.deepEqual(await businessCounts(),before);
   }finally{await db.query('update public.research_s4_records set candidate_id=$3 where user_id=$1 and id=$2',[actor,observationRecord.id,imported.id]);}
   assert.deepEqual(await registeredStore.readObservation(decided.observationId),await createS6Store(s4Actor).readObservation(decided.observationId));
   for(const id of [snapshot.id,snapshot.payload.card_ref,snapshot.payload.label_ref,...snapshot.payload.exposure_refs,...(snapshot.payload.thesis_revision_ref?[snapshot.payload.thesis_revision_ref]:[])]){
    try{await db.query('update public.research_s4_records set candidate_id=$3 where user_id=$1 and id=$2',[actor,id,deniedCandidate]);await noPreparedDisclosure();}
    finally{await db.query('update public.research_s4_records set candidate_id=$3 where user_id=$1 and id=$2',[actor,id,imported.id]);}
   }
   for(const [id,payload] of [[observationRecord.id,{...observationRecord.payload,candidate_ref:deniedCandidate}],[snapshot.id,{...snapshot.payload,source_version_id:alternateSource}]] as const){
    const original=id===observationRecord.id?observationRecord:snapshot;
    try{
     await db.query('update public.research_s4_records set payload=$3,payload_hash=$4 where user_id=$1 and id=$2',[actor,id,payload,digest(payload)]);
     if(id===snapshot.id){const changed={...observationRecord.payload,input_snapshot_hash:digest(payload)};await db.query('update public.research_s4_records set payload=$3,payload_hash=$4 where user_id=$1 and id=$2',[actor,observationRecord.id,changed,digest(changed)]);}
     if(id===observationRecord.id){const before=await freezeSnapshot();await assert.rejects(freezeRegisteredMarket(s4Actor,decided.observationId,registeredMappings[0],'synthetic'),/hash_mismatch/);assert.deepEqual(await freezeSnapshot(),before);}
     await noPreparedDisclosure();
    }finally{
     await db.query('update public.research_s4_records set payload=$3,payload_hash=$4 where user_id=$1 and id=$2',[actor,id,original.payload,original.payload_hash]);
     await db.query('update public.research_s4_records set payload=$3,payload_hash=$4 where user_id=$1 and id=$2',[actor,observationRecord.id,observationRecord.payload,observationRecord.payload_hash]);
    }
   }
   try{await db.query("update public.research_s4_records set kind='ExposureEvent' where user_id=$1 and id=$2",[actor,snapshot.payload.label_ref]);await noPreparedDisclosure();}
   finally{await db.query("update public.research_s4_records set kind='HumanLabel' where user_id=$1 and id=$2",[actor,snapshot.payload.label_ref]);}
  }finally{
   await db.query('alter table public.research_s4_records enable trigger research_s4_records_immutable');
   await db.query('delete from public.research_s4_candidates where user_id=$1 and id=$2',[actor,deniedCandidate]);
   await db.query('delete from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[actor,deniedHash]);
  }
  const commitBody=makeCommit(preparedInput,'synthetic-registered-replay',preparation.revision);
  await db.query(`create function public.synthetic_registered_commit_delay() returns trigger language plpgsql as $$ begin perform pg_sleep(6); return new; end $$; create trigger synthetic_registered_commit_delay before insert on public.research_s6_evaluations for each row execute function public.synthetic_registered_commit_delay()`);
  try{
   for(const mode of ['feed','session']){
    await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
    if(mode==='feed')await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
    if(mode==='session')await db.query("update public.research_s6_sessions set expires_at=clock_timestamp()+interval '5 seconds' where user_id=$1 and token_hash=$2",[actor,tokenHash(registeredToken)]);
    const before=await businessCounts(),state=(await db.query('select * from public.research_s4_observation_state where user_id=$1 and observation_id=$2',[actor,decided.observationId])).rows[0],started=performance.now();
    try{if(mode==='feed'){const response=await evaluateRoute(decided.observationId,{action:'evaluate',asOf:preparation.asOf,key:commitBody.idempotency_key,revision:preparation.revision,marketIds:preparation.marketIds});assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{error:{code:'revocation_check_unavailable'}});}else await assert.rejects(registeredStore.commitEvaluationResult(commitBody),e=>e instanceof Error&&e.message==='not_authenticated');assert.ok(performance.now()-started>=5900);assert.deepEqual(await businessCounts(),before);assert.deepEqual((await db.query('select * from public.research_s4_observation_state where user_id=$1 and observation_id=$2',[actor,decided.observationId])).rows[0],state);}
    finally{await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1 and payload_hash=$3',[actor,t.binding,hash]);await db.query("update public.research_s6_sessions set expires_at=created_at+interval '1 hour' where user_id=$1 and token_hash=$2",[actor,tokenHash(registeredToken)]);}
   }
   await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
   const acceptedStarted=performance.now();const accepted=await evaluateRoute(decided.observationId,{action:'evaluate',asOf:preparation.asOf,key:commitBody.idempotency_key,revision:preparation.revision,marketIds:preparation.marketIds});assert.equal(accepted.status,200);assert.equal(accepted.headers.get('cache-control'),'no-store');assert.equal((await accepted.json()).status,'accepted');assert.ok(performance.now()-acceptedStarted>=5900);
  }finally{await db.query('drop trigger synthetic_registered_commit_delay on public.research_s6_evaluations; drop function public.synthetic_registered_commit_delay()');}
  const evaluation=await registeredStore.commitEvaluationResult(commitBody);assert.equal(evaluation.status,'duplicate');
  const duplicateRoute=await evaluateRoute(decided.observationId,{action:'evaluate',asOf:preparation.asOf,key:commitBody.idempotency_key,revision:preparation.revision,marketIds:preparation.marketIds});assert.equal(duplicateRoute.status,200);assert.equal((await duplicateRoute.json()).status,'duplicate');
  const conflictRoute=await evaluateRoute(decided.observationId,{action:'evaluate',asOf:preparation.asOf,key:randomUUID(),revision:preparation.revision,marketIds:preparation.marketIds});assert.equal(conflictRoute.status,409);assert.deepEqual(await conflictRoute.json(),{error:{code:'revision_conflict'}});
  await assert.rejects(registeredStore.commitEvaluationResult({...commitBody,expected_revision:commitBody.expected_revision+1}),/idempotency_conflict/);
  await assert.rejects(registeredStore.commitEvaluationResult(makeCommit(preparedInput,randomUUID(),preparation.revision)),/revision_conflict/);
  const replayId=evaluation.evaluation_ref;
  const replayBefore=await businessCounts(),replayed=await registeredObservationReport(s4Actor,decided.observationId,replayId);
  assert.equal(replayed.schema_version,'alpha-replay-export/1.0');assert.equal(replayed.replay?.matches,true);assert.equal(replayed.market_evidence?.length,2);
  assert.equal((await businessCounts()).research_s4_records,replayBefore.research_s4_records+1);
  const replayExposure=(await db.query("select candidate_id,payload from public.research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'origin'='alpha_evaluation_replay'",[actor])).rows;
  assert.equal(replayExposure.length,1);assert.equal(replayExposure[0].candidate_id,imported.id);assert.deepEqual(replayExposure[0].payload.exposed_artifact_ids,[replayId,...preparation.marketIds]);assert.equal(replayExposure[0].payload.shadow_exposed,false);assert.deepEqual(replayExposure[0].payload.subject_refs,reportExposure[0].payload.subject_refs);
  const originalEvaluation=(await db.query('select * from public.research_s6_evaluations where user_id=$1 and id=$2',[actor,replayId])).rows[0];
  const forged=makeCommit({...originalEvaluation.input,as_of:new Date(Date.parse(originalEvaluation.input.as_of)+1000).toISOString()},originalEvaluation.idempotency_key,0);
  await db.query('alter table public.research_s6_evaluations disable trigger research_s6_evaluations_immutable');
  try{
   await db.query('update public.research_s6_evaluations set input=$3,result=$4,result_hash=$5,receipt=$6 where user_id=$1 and id=$2',[actor,replayId,forged.input,forged.result,forged.result_sha256,{...originalEvaluation.receipt,input_sha256:forged.input_sha256,result_sha256:forged.result_sha256}]);
   const beforeForged=await businessCounts();await assert.rejects(registeredObservationReport(s4Actor,decided.observationId,replayId),/hash_mismatch/);assert.deepEqual(await businessCounts(),beforeForged);
  }finally{
   await db.query('update public.research_s6_evaluations set input=$3,result=$4,result_hash=$5,receipt=$6 where user_id=$1 and id=$2',[actor,replayId,originalEvaluation.input,originalEvaluation.result,originalEvaluation.result_hash,originalEvaluation.receipt]);
   await db.query('alter table public.research_s6_evaluations enable trigger research_s6_evaluations_immutable');
  }
  // A valid but cancelled other observation must never be consulted by this replay.
  const foreignObservation=randomUUID();
  await transaction(s4Actor,async client=>{await addRecord(client,s4Actor,imported.id,'Observation',{...frozenObservation,id:foreignObservation},{id:foreignObservation});await client.query("insert into public.research_s4_observation_state(user_id,observation_id,status) values($1,$2,'pending_start')",[actor,foreignObservation]);});
  const foreignPreparation=await prepareEvaluation(s4Actor,foreignObservation);
  const foreignEvaluation=await createS6Store(s4Actor).commitEvaluationResult(makeCommit(await prepareInput(s4Actor,foreignObservation,foreignPreparation.marketIds,foreignPreparation.asOf),'synthetic-foreign-replay',foreignPreparation.revision));
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  const collisionBefore=await businessCounts();
  const collision=await evaluateRoute(foreignObservation,{action:'evaluate',asOf:foreignPreparation.asOf,key:commitBody.idempotency_key,revision:foreignPreparation.revision+1,marketIds:foreignPreparation.marketIds});
  // The owner-wide key lookup detects another observation before attempting an insert.
  // This is a deterministic conflict, not an unavailable revocation service.
  assert.equal(collision.status,409);assert.equal(collision.headers.get('cache-control'),'no-store');assert.deepEqual(await collision.json(),{error:{code:'idempotency_conflict'}});assert.deepEqual(await businessCounts(),collisionBefore);
  // Authorization denial must win over the same cross-observation key conflict.
  const crossKeyBody=makeCommit(await prepareInput(s4Actor,foreignObservation,foreignPreparation.marketIds,foreignPreparation.asOf),commitBody.idempotency_key,foreignPreparation.revision+1);
  for(const deniedStatus of [503,403]){
   if(deniedStatus===503)await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '61 seconds'");
   else await db.query('update public.research_s4_bindings set revoked=true where user_id=$1 and payload_hash=$2',[actor,hash]);
   const before=await businessCounts(),state=(await db.query('select * from public.research_s4_observation_state where user_id=$1 order by observation_id',[actor])).rows;
   try{
    const denied=await evaluateRoute(foreignObservation,{action:'evaluate',asOf:foreignPreparation.asOf,key:commitBody.idempotency_key,revision:foreignPreparation.revision+1,marketIds:foreignPreparation.marketIds});
    await assert.rejects(registeredStore.commitEvaluationResult(crossKeyBody),e=>e instanceof Error&&e.cause===(deniedStatus===403?'binding_revoked':'revocation_stale'));
    assert.equal(denied.status,deniedStatus);assert.equal(denied.headers.get('cache-control'),'no-store');
    assert.deepEqual(await denied.json(),{error:{code:deniedStatus===403?'revocation_access_denied':'revocation_check_unavailable'}});
    assert.deepEqual(await businessCounts(),before);assert.deepEqual((await db.query('select * from public.research_s4_observation_state where user_id=$1 order by observation_id',[actor])).rows,state);
   }finally{await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');await db.query('update public.research_s4_bindings set revoked=false where user_id=$1 and payload_hash=$2',[actor,hash]);}
  }
  const expiredBefore=await businessCounts();
  await db.query("update public.research_s6_sessions set expires_at=clock_timestamp()-interval '1 second' where user_id=$1 and token_hash=$2",[actor,tokenHash(registeredToken)]);
  try{await assert.rejects(registeredStore.commitEvaluationResult(crossKeyBody),e=>e instanceof Error&&e.message==='not_authenticated');assert.deepEqual(await businessCounts(),expiredBefore);}
  finally{await db.query("update public.research_s6_sessions set expires_at=created_at+interval '1 hour' where user_id=$1 and token_hash=$2",[actor,tokenHash(registeredToken)]);}
  const crossReplayBefore=await businessCounts();await assert.rejects(registeredObservationReport(s4Actor,decided.observationId,foreignEvaluation.evaluation_ref),/not_found/);assert.deepEqual(await businessCounts(),crossReplayBefore);
  await db.query("update public.research_s4_observation_state set status='cancelled' where user_id=$1 and observation_id=$2",[actor,foreignObservation]);
  const marketId=preparation.marketIds[0];
  await assert.rejects(db.query('update public.research_s6_markets set observation_id=$3 where user_id=$1 and id=$2',[actor,marketId,foreignObservation]),/immutable_record/);
  await db.query('alter table public.research_s6_markets disable trigger research_s6_markets_immutable');
  await db.query('update public.research_s6_markets set observation_id=$3 where user_id=$1 and id=$2',[actor,marketId,foreignObservation]);
  const beforeForeignReplay=await businessCounts();
  await assert.rejects(prepareRegisteredInput(s4Actor,decided.observationId,preparation.marketIds,preparation.asOf),/hash_mismatch/);await assert.rejects(registeredObservationReport(s4Actor,decided.observationId,replayId),/hash_mismatch/);assert.deepEqual(await businessCounts(),beforeForeignReplay);
  await db.query('update public.research_s6_markets set observation_id=$3 where user_id=$1 and id=$2',[actor,marketId,decided.observationId]);
  await db.query('alter table public.research_s6_markets enable trigger research_s6_markets_immutable');
  const savedEvaluation=(await db.query('select result from public.research_s6_evaluations where user_id=$1 and id=$2',[actor,replayId])).rows[0].result;
  await db.query('alter table public.research_s6_evaluations disable trigger research_s6_evaluations_immutable');
  await db.query("update public.research_s6_evaluations set result='{}' where user_id=$1 and id=$2",[actor,replayId]);
  const beforeCorruptReplay=await businessCounts();await assert.rejects(registeredObservationReport(s4Actor,decided.observationId,replayId),/hash_mismatch/);assert.deepEqual(await businessCounts(),beforeCorruptReplay);
  await db.query('update public.research_s6_evaluations set result=$3 where user_id=$1 and id=$2',[actor,replayId,savedEvaluation]);await db.query('alter table public.research_s6_evaluations enable trigger research_s6_evaluations_immutable');
  const citationQuery='?cardId='+shown.cards[0].id+'&index=0';
  assert.equal((await success(route('citation',{},citationQuery))).text,t.raw);
  assert.ok((await success(route('history'))).records.some((r:{kind:string})=>r.kind==='Decision'));
  for(const query of ['?cardId='+shown.cards[0].id,'?cardId='+shown.cards[0].id+'&index=','?cardId='+shown.cards[0].id+'&index=0&index=1','?cardId='+shown.cards[0].id+'&index=00','?cardId='+shown.cards[0].id+'&index=8','?cardId='+shown.cards[0].id+'&index=0&extra=1','?cardId='+shown.cards[0].id+'&cardId='+shown.cards[0].id+'&index=0'])assert.equal((await route('citation',{},query)).status,422);
  const s6Route=(action:'read'|'replay'|'prepare',headers:Record<string,string>={})=>observationRoute(new Request(origin+'/api/research/s6/observations/'+decided.observationId,{method:'POST',headers:{host:'127.0.0.1:3199',origin,cookie,'content-type':'application/json',...headers},body:JSON.stringify(action!=='replay'?{action}:{action,evaluationId:replayId})}),{params:Promise.resolve({id:decided.observationId})});
  // Synthetic corruption only: no real-market feature is enabled.
  const beforePolicyRecord=(await db.query('select payload,payload_hash from public.research_s4_records where user_id=$1 and id=$2',[actor,decided.observationId])).rows[0];
  await db.query('alter table public.research_s4_records disable trigger research_s4_records_immutable');
  try{for(const [version,code] of [['alpha-observation-contract/1.0','rule_unsupported'],['alpha-observation-contract/2.0','policy_blocked']]){
   const payload={...beforePolicyRecord.payload,schema_version:version,synthetic:false};await db.query('update public.research_s4_records set payload=$3,payload_hash=$4 where user_id=$1 and id=$2',[actor,decided.observationId,payload,digest(payload)]);
   const before=await businessCounts(),response=await s6Route('prepare');assert.equal(response.status,code==='rule_unsupported'?422:403);assert.deepEqual(await response.json(),{error:{code}});assert.deepEqual(await businessCounts(),before);
  }}finally{await db.query('update public.research_s4_records set payload=$3,payload_hash=$4 where user_id=$1 and id=$2',[actor,decided.observationId,beforePolicyRecord.payload,beforePolicyRecord.payload_hash]);await db.query('alter table public.research_s4_records enable trigger research_s4_records_immutable');}
  const originalMarket=(await db.query('select * from public.research_s6_markets where user_id=$1 and id=$2',[actor,preparation.marketIds[0]])).rows[0];
  await db.query('alter table public.research_s6_markets disable trigger research_s6_markets_immutable');
  try{for(const field of ['snapshot_hash','raw_response','evidence_hash','evidence']){
   const value=field==='evidence'?{kind:'synthetic-invalid'}:field==='raw_response'?'changed synthetic raw':'0'.repeat(64);
   try{await db.query('update public.research_s6_markets set '+field+'=$3 where user_id=$1 and id=$2',[actor,originalMarket.id,value]);const before=await businessCounts(),response=await s6Route('prepare');assert.equal(response.status,field==='evidence'?403:422);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{error:{code:field==='evidence'?'policy_blocked':'hash_mismatch'}});assert.deepEqual(await businessCounts(),before);}
   finally{await db.query('update public.research_s6_markets set '+field+'=$3 where user_id=$1 and id=$2',[actor,originalMarket.id,originalMarket[field]]);}
  }}finally{await db.query('alter table public.research_s6_markets enable trigger research_s6_markets_immutable');}
  for(const action of ['read','replay','prepare'] as const){
   const before=await businessCounts(),response=await s6Route(action);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
   const result=await response.json();if(action==='replay'){assert.equal(result.replay.matches,true);assert.equal(result.market_evidence.length,2);}else if(action==='read')assert.ok(Array.isArray(result.evaluations));else{assert.deepEqual(Object.keys(result).sort(),['asOf','marketIds','revision']);assert.deepEqual(result.marketIds,preparation.marketIds);const exposures=(await db.query("select candidate_id,payload from public.research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'origin'='alpha_evaluation_prepare' and payload->>'displayed_at'=$2",[actor,result.asOf])).rows;assert.equal(exposures.length,1);const exposure=exposures[0];assert.equal(exposure.payload.displayed_at,result.asOf);assert.equal(exposure.payload.evaluation_period_id,weekPeriod(result.asOf));assert.equal(exposure.payload.shadow_exposed,false);assert.equal(result.revision,(await db.query('select revision from public.research_s4_observation_state where user_id=$1 and observation_id=$2',[actor,decided.observationId])).rows[0].revision);assert.equal(exposure.candidate_id,imported.id);assert.deepEqual(exposure.payload.exposed_artifact_ids,[decided.observationId,...preparation.marketIds]);assert.deepEqual(exposure.payload.subject_refs,reportExposure[0].payload.subject_refs);assert.equal(exposure.payload.actor_kind,'agent');}
   assert.equal((await businessCounts()).research_s4_records,before.research_s4_records+1);
   for(const headers of [{cookie:''},{host:'evil.example'},{'sec-fetch-site':'cross-site'}] as Array<Record<string,string>>){const denied=await s6Route(action,headers);assert.equal(denied.status,headers.cookie===''?401:403);assert.equal(denied.headers.get('cache-control'),'no-store');}
  }
  const denyRoutes=async(status:number)=>{const before=await businessCounts(),candidateBefore=(await db.query('select revision,status,last_observation_id from public.research_s4_candidates where id=$1',[imported.id])).rows[0];for(const [name,body,query] of [['status',{},''],['history',{},''],['citation',{},citationQuery],['reveal',revealInput,''],['decisions',decision,'']] as const){const response=await route(name,body,query);assert.equal(response.status,status);assert.deepEqual(await response.json(),{error:{code:status===403?'revocation_access_denied':'revocation_check_unavailable'}});}for(const action of ['read','replay','prepare'] as const){const response=await s6Route(action);assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{error:{code:status===403?'revocation_access_denied':'revocation_check_unavailable'}});}for(const body of [{action:'prepare'},{action:'evaluate',asOf:preparation.asOf,key:'synthetic-registered-replay',revision:preparation.revision,marketIds:preparation.marketIds}]){const response=await observationRoute(new Request(origin+'/api/research/s6/observations/'+decided.observationId,{method:'POST',headers:{host:'127.0.0.1:3199',origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:decided.observationId})});assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');const result=await response.json();assert.deepEqual(result,{error:{code:status===403?'revocation_access_denied':'revocation_check_unavailable'}});const freshDenied=await evaluateRoute(decided.observationId,{action:'evaluate',asOf:preparation.asOf,key:randomUUID(),revision:preparation.revision+1,marketIds:preparation.marketIds});assert.equal(freshDenied.status,status);assert.equal(freshDenied.headers.get('cache-control'),'no-store');assert.deepEqual(await freshDenied.json(),{error:{code:status===403?'revocation_access_denied':'revocation_check_unavailable'}});}assert.deepEqual(await businessCounts(),before);assert.deepEqual((await db.query('select revision,status,last_observation_id from public.research_s4_candidates where id=$1',[imported.id])).rows[0],candidateBefore);};
  const signed=(payload:unknown)=>{const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');return 'alpha_s4_local_session='+encoded+'.'+createHmac('sha256',process.env.ALPHA_S4_LOCAL_SESSION_SECRET!).update(encoded).digest('base64url');};
  const now=Date.now(),session={userId:actor,kind:'agent',purpose:'alpha_s4_acceptance',issuedAt:now-1000,expiresAt:now+60000};
  const invalidCookies=['alpha_s4_local_session=forged.x',...[
   {...session,expiresAt:now-1},{...session,issuedAt:now+60000},{...session,expiresAt:now+7200000},{...session,purpose:'wrong'},{...session,kind:'human'}
  ].map(signed)];
  const beforeAuth=await businessCounts();
  for(const bad of invalidCookies)for(const name of Object.keys(handlers) as Array<keyof typeof handlers>)assert.equal((await route(name,{},'',{cookie:bad})).status,401);
  assert.deepEqual(await businessCounts(),beforeAuth);
  const other=randomUUID();await db.query('insert into auth.users(id) values($1)',[other]);await db.query("update public.profiles set role='admin' where id=$1",[other]);
  const foreignBefore=await businessCounts(),otherRecords=(await db.query('select count(*)::int n from public.research_s4_records where user_id=$1',[other])).rows[0].n;
  await assert.rejects(freezeRegisteredMarket({userId:other,kind:'agent'},decided.observationId,registeredMappings[0],'synthetic'),/not_found/);
  await assert.rejects(registeredObservationReport({userId:other,kind:'agent'},decided.observationId),/not_found/);await assert.rejects(registeredObservationReport({userId:other,kind:'agent'},decided.observationId,replayId),/not_found/);
  await assert.rejects(registeredObservationReport(s4Actor,randomUUID()),/not_found/);
  await assert.rejects(prepareRegisteredEvaluation({userId:other,kind:'agent'},decided.observationId),/not_found/);
  await assert.rejects(prepareRegisteredInput({userId:other,kind:'agent'},decided.observationId,preparation.marketIds,preparation.asOf),/not_found/);
  assert.deepEqual(await businessCounts(),foreignBefore);assert.equal((await db.query('select count(*)::int n from public.research_s4_records where user_id=$1',[other])).rows[0].n,otherRecords);
  const otherCookie='alpha_s4_local_session='+localSessionToken(other,process.env.ALPHA_S4_LOCAL_SESSION_SECRET,Date.now()+3600000),beforeOther=await businessCounts();
  for(const action of ['read','replay','prepare'] as const){const response=await s6Route(action,{cookie:otherCookie});assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:{code:'not_found'}});}
  for(const [name,body,query] of [['status',{},''],['history',{},''],['citation',{},citationQuery],['reveal',revealInput,''],['decisions',decision,'']] as const){const response=await route(name,body,query,{cookie:otherCookie});assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:{code:'scope_denied'}});}
  assert.deepEqual(await businessCounts(),beforeOther);
  const conflictResponse=await route('decisions',{...decision,requestKey:randomUUID()});assert.equal(conflictResponse.status,409);assert.deepEqual(await conflictResponse.json(),{error:{code:'revision_conflict'}});
  await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '61 seconds'");await denyRoutes(503);
  for(const op of [()=>registeredStore.readObservation(decided.observationId),()=>registeredStore.readMarketSnapshot(preparation.marketIds[0]),()=>registeredStore.commitEvaluationResult(makeCommit(preparedInput,'synthetic-registered-replay',preparation.revision)),()=>prepareRegisteredEvaluation(s4Actor,decided.observationId),()=>prepareRegisteredInput(s4Actor,decided.observationId,preparation.marketIds,preparation.asOf)])await assert.rejects(op(),e=>e instanceof Error&&e.cause==='revocation_stale');
  await assert.rejects(registeredObservationReport(s4Actor,decided.observationId),e=>e instanceof Error&&e.cause==='revocation_stale');
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  // Report writes an exposure; final expiry must roll that real write back.
  await db.query(`create function research_revocation_candidate.delay_report() returns trigger language plpgsql as $$ begin
   if NEW.kind='ExposureEvent' and NEW.payload->>'origin' in ('alpha_evaluation_report','alpha_evaluation_replay','alpha_evaluation_prepare') then perform pg_sleep(6); end if; return NEW; end $$;
   create trigger synthetic_delay_report before insert on public.research_s4_records for each row execute function research_revocation_candidate.delay_report()`);
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  const prepareBefore=await businessCounts(),freshPrepare=await s6Route('prepare');assert.equal(freshPrepare.status,200);assert.equal((await businessCounts()).research_s4_records,prepareBefore.research_s4_records+1);
  await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
  const stalePrepareBefore=await businessCounts(),prepareStarted=performance.now(),stalePrepare=await s6Route('prepare');assert.equal(stalePrepare.status,503);assert.deepEqual(await stalePrepare.json(),{error:{code:'revocation_check_unavailable'}});assert.ok(performance.now()-prepareStarted>=5900);assert.deepEqual(await businessCounts(),stalePrepareBefore);
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  const positiveReportBefore=await businessCounts();await registeredObservationReport(s4Actor,decided.observationId);
  assert.equal((await businessCounts()).research_s4_records,positiveReportBefore.research_s4_records+1);
  const delayedReportBefore=await businessCounts();
  await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
  const reportStarted=performance.now();
  await assert.rejects(registeredObservationReport(s4Actor,decided.observationId),e=>e instanceof Error&&e.cause==='revocation_stale');
  assert.ok(performance.now()-reportStarted>=5900);assert.deepEqual(await businessCounts(),delayedReportBefore);
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  const positiveReplayBefore=await businessCounts();await registeredObservationReport(s4Actor,decided.observationId,replayId);assert.equal((await businessCounts()).research_s4_records,positiveReplayBefore.research_s4_records+1);
  const delayedReplayBefore=await businessCounts();await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");const replayStarted=performance.now();
  await assert.rejects(registeredObservationReport(s4Actor,decided.observationId,replayId),e=>e instanceof Error&&e.cause==='revocation_stale');assert.ok(performance.now()-replayStarted>=5900);assert.deepEqual(await businessCounts(),delayedReplayBefore);
  await db.query('drop trigger synthetic_delay_report on public.research_s4_records');
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  const savedImported=(await db.query('select imported from public.research_s4_candidates where id=$1',[imported.id])).rows[0].imported;
  for(const mutation of ['missing','version','watermark','source']){
   const changed=structuredClone(savedImported);
   if(mutation==='missing')delete changed.manifest.extensions['pa.revocation_reference'];
   if(mutation==='version')changed.manifest.extensions['pa.revocation_reference'].grant_version=2;
   if(mutation==='watermark')changed.manifest.extensions['pa.revocation_reference'].revocation_seq_at_export='1';
   if(mutation==='source')changed.sourceRef.source_id=randomUUID();
   await db.query('update public.research_s4_candidates set imported=$2 where id=$1',[imported.id,changed]);
   await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,{...t.binding,approvedManifestHash:digest(changed.manifest)}]);
   const before=await businessCounts(),code=mutation==='watermark'?'export_watermark_ahead':mutation==='source'?'source_version_conflict':'invalid_revocation_candidate';
   for(const op of [()=>registeredStore.readObservation(decided.observationId),()=>registeredStore.readMarketSnapshot(preparation.marketIds[0]),()=>registeredStore.commitEvaluationResult(makeCommit(preparedInput,'synthetic-registered-replay',preparation.revision)),()=>prepareRegisteredEvaluation(s4Actor,decided.observationId),()=>prepareRegisteredInput(s4Actor,decided.observationId,preparation.marketIds,preparation.asOf),()=>registeredObservationReport(s4Actor,decided.observationId),()=>registeredCitation(s4Actor,imported.id,shown.cards[0].id,0),()=>registeredReviewHistory(s4Actor,imported.id),()=>submitRegisteredDecision(s4Actor,imported.id,decision),()=>registeredCandidateStatus(s4Actor,imported.id),()=>revealRegisteredCards(s4Actor,imported.id,{...revealInput,requestKey:randomUUID()})]){
    await assert.rejects(op(),error=>error instanceof Error&&error.message===code);
    const response=await s4Http(op);
    assert.equal(response.status,code==='export_watermark_ahead'?503:code==='source_version_conflict'?409:422);
    assert.deepEqual(await response.json(),{error:{code}});
   }
   for(const action of ['read','replay','prepare'] as const){const response=await s6Route(action);assert.equal(response.status,code==='export_watermark_ahead'?503:code==='source_version_conflict'?409:422);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{error:{code}});}
   assert.deepEqual(await businessCounts(),before);
  }
  await db.query('update public.research_s4_candidates set imported=$2 where id=$1',[imported.id,savedImported]);
  await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,t.binding]);
  const sourceVersion=(await db.query('select v.* from public.research_source_versions v join public.research_s4_candidates c on c.source_version_id=v.id and c.user_id=v.user_id where c.id=$1',[imported.id])).rows[0];
  // Privileged corruption rehearsal in this disposable database only. Normal
  // writes are already rejected by immutable triggers; preserve that evidence.
  await assert.rejects(db.query('update public.research_source_versions set source_key=source_key where id=$1',[sourceVersion.id]),/immutable_record/);
  await db.query('alter table public.research_source_versions disable trigger research_source_versions_immutable');
  for(const field of ['source_ref','source_key']){
   const changed=field==='source_ref'?{...sourceVersion.source_ref,source_id:randomUUID()}:digest({synthetic:'unrelated version'});
   await db.query('update public.research_source_versions set '+field+'=$2 where id=$1',[sourceVersion.id,changed]);
   const before=await businessCounts();
   for(const op of [()=>registeredStore.readObservation(decided.observationId),()=>registeredStore.readMarketSnapshot(preparation.marketIds[0]),()=>registeredStore.commitEvaluationResult(makeCommit(preparedInput,'synthetic-registered-replay',preparation.revision)),()=>prepareRegisteredEvaluation(s4Actor,decided.observationId),()=>prepareRegisteredInput(s4Actor,decided.observationId,preparation.marketIds,preparation.asOf),()=>registeredObservationReport(s4Actor,decided.observationId),()=>registeredCandidateStatus(s4Actor,imported.id),()=>revealRegisteredCards(s4Actor,imported.id,revealInput),()=>registeredCitation(s4Actor,imported.id,shown.cards[0].id,0),()=>registeredReviewHistory(s4Actor,imported.id),()=>submitRegisteredDecision(s4Actor,imported.id,decision)])await assert.rejects(op(),/source_version_conflict/);
   assert.deepEqual(await businessCounts(),before);
   await db.query('update public.research_source_versions set '+field+'=$2 where id=$1',[sourceVersion.id,sourceVersion[field]]);
  }
  await db.query('alter table public.research_source_versions enable trigger research_source_versions_immutable');
  const storedCard=(await db.query('select payload from public.research_s4_records where id=$1',[shown.cards[0].id])).rows[0].payload;
  await assert.rejects(db.query('update public.research_s4_records set payload=payload where id=$1',[shown.cards[0].id]),/immutable_record/);
  await db.query('alter table public.research_s4_records disable trigger research_s4_records_immutable');
  const changedCard=structuredClone(storedCard);changedCard.facts[0].source_ref.source_id=randomUUID();
  await db.query('update public.research_s4_records set payload=$2 where id=$1',[shown.cards[0].id,changedCard]);
  const beforeCitation=await businessCounts();
  await assert.rejects(registeredCitation(s4Actor,imported.id,shown.cards[0].id,0),/hash_mismatch/);
  assert.deepEqual(await businessCounts(),beforeCitation);
  await db.query('update public.research_s4_records set payload=$2 where id=$1',[shown.cards[0].id,storedCard]);
  await db.query('alter table public.research_s4_records enable trigger research_s4_records_immutable');
  await db.query("create function research_revocation_candidate.delay_request() returns trigger language plpgsql as $$ begin perform pg_sleep(6);return new;end $$;create trigger synthetic_delay_request before insert on public.research_s4_requests for each row execute function research_revocation_candidate.delay_request()");
  // Positive controls use exactly the same slow trigger and runtime role.
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  const positiveBefore=await businessCounts();
  assert.ok(await revealRegisteredCards(s4Actor,imported.id,{...revealInput,requestKey:randomUUID()}));
  const positiveDecision=await submitRegisteredDecision(s4Actor,imported.id,{...decision,requestKey:randomUUID(),expectedRevision:1,action:'defer',newObservation:false});
  assert.equal(positiveDecision.revision,2);
  assert.ok((await businessCounts()).research_s4_requests>positiveBefore.research_s4_requests);
  const slowInput={...revealInput,requestKey:randomUUID()},beforeSlow=await businessCounts();
  await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
  const slowStarted=performance.now();
  const delayedRevealResponse=await route('reveal',slowInput);assert.equal(delayedRevealResponse.status,503);assert.deepEqual(await delayedRevealResponse.json(),{error:{code:'revocation_check_unavailable'}});
  assert.ok(performance.now()-slowStarted>=5900,'must reach delayed request insert before post-check denial');
  assert.deepEqual(await businessCounts(),beforeSlow);
  assert.equal((await s4Http(()=>registeredCandidateStatus(s4Actor,imported.id))).status,503);
  await assert.rejects(revealRegisteredCards(s4Actor,imported.id,slowInput),error=>error instanceof Error&&error.cause==='revocation_stale');
  await assert.rejects(registeredCandidateStatus(s4Actor,imported.id),/revocation_access_denied/);
  assert.deepEqual(await businessCounts(),beforeSlow);

  const delayedDecision={...decision,requestKey:randomUUID(),expectedRevision:2,action:'defer' as const,newObservation:false};
  const statusBefore=(await db.query('select revision,status,last_observation_id from public.research_s4_candidates where id=$1',[imported.id])).rows[0];
  const countsBefore=await businessCounts();
  await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
  const decisionStarted=performance.now();
  const delayedDecisionResponse=await route('decisions',delayedDecision);assert.equal(delayedDecisionResponse.status,503);assert.deepEqual(await delayedDecisionResponse.json(),{error:{code:'revocation_check_unavailable'}});
  assert.ok(performance.now()-decisionStarted>=5900);
  assert.deepEqual((await db.query('select revision,status,last_observation_id from public.research_s4_candidates where id=$1',[imported.id])).rows[0],statusBefore);
  assert.deepEqual(await businessCounts(),countsBefore);
  for(const op of [()=>submitRegisteredDecision(s4Actor,imported.id,delayedDecision),()=>registeredReviewHistory(s4Actor,imported.id),()=>registeredCitation(s4Actor,imported.id,shown.cards[0].id,0)])await assert.rejects(op(),/revocation_access_denied/);
  await db.query('drop trigger synthetic_delay_request on public.research_s4_requests');
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');

  assert.deepEqual(await importRegisteredCandidate(s4Actor,raw),{id:imported.id,duplicate:true});
  await db.query("insert into public.research_s4_integrity(user_id,reason) values($1,'anchor_integrity_failed')",[actor]);
  await assert.rejects(importRegisteredCandidate(s4Actor,raw),/anchor_integrity_failed/);
  assert.equal((await s4Http(()=>importRegisteredCandidate(s4Actor,raw))).status,403);
  await db.query('delete from public.research_s4_integrity where user_id=$1',[actor]);
  for(const change of [{grant_version:2},{source_id:randomUUID()},{revocation_seq_at_export:'1'},{revocation_seq_at_export:'1.5'},{revocation_seq_at_export:'-1'},{revocation_seq_at_export:''},{revocation_seq_at_export:1},{revocation_seq_at_export:'01'},{revocation_seq_at_export:'9223372036854775808'}]){
   const changed=structuredClone(t.pack);changed.manifest.extensions['pa.revocation_reference']={...reference,...change};changed.files['manifest.json']=canonicalize(changed.manifest);
   await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,{...t.binding,approvedManifestHash:digest(changed.manifest)}]);
   await assert.rejects(importRegisteredCandidate(s4Actor,JSON.stringify(changed)),change.revocation_seq_at_export==='1'?/export_watermark_ahead/:/invalid_revocation_candidate/);
   const response=await s4Http(()=>importRegisteredCandidate(s4Actor,JSON.stringify(changed)));
   assert.equal(response.status,change.revocation_seq_at_export==='1'?503:422);
   assert.deepEqual(await response.json(),{error:{code:change.revocation_seq_at_export==='1'?'export_watermark_ahead':'invalid_revocation_candidate'}});
   assert.equal((await db.query('select count(*)::int n from public.research_s4_candidates')).rows[0].n,1);
  }
  await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,t.binding]);
  // Unsafe JSON numbers are rejected by the strict parser before reference validation.
  const unsafe=structuredClone(t.pack);
  unsafe.files['manifest.json']=t.pack.files['manifest.json'].replace(/"revocation_seq_at_export":"0"/,'"revocation_seq_at_export":9007199254740992');
  assert.notEqual(unsafe.files['manifest.json'],t.pack.files['manifest.json']);
  const unsafeResponse=await s4Http(()=>importRegisteredCandidate(s4Actor,JSON.stringify(unsafe)));
  assert.equal(unsafeResponse.status,422);
  assert.deepEqual(await unsafeResponse.json(),{error:{code:'invalid_schema'}});
  const tampered=structuredClone(t.pack);tampered.manifest.extensions['pa.revocation_reference']={...reference,grant_version:2};tampered.files['manifest.json']=canonicalize(tampered.manifest);
  await assert.rejects(importRegisteredCandidate(s4Actor,JSON.stringify(tampered)),error=>error instanceof Error&&error.message==='policy_blocked');
  assert.equal((await db.query('select count(*)::int n from public.research_s4_candidates')).rows[0].n,1);

  assert.equal(await withRegisteredCandidate(db,actor,hash,expected,async client=>(await client.query('select 7 as value')).rows[0].value),7);
  const deniedAccess=async(e=expected,cause?:string)=>{
   let entered=false;
   await assert.rejects(withRegisteredCandidate(db,actor,hash,e,async()=>{entered=true;return true;}),error=>error instanceof Error&&error.message==='revocation_access_denied'&&(!cause||error.cause===cause));
   assert.equal(entered,false);
  };
  for(const e of [{...expected,grantVersion:2},{...expected,sourceId:randomUUID()},{...expected,feedId:randomUUID()},{...expected,scope:{...expected.scope,workspace_id:randomUUID()}}])await deniedAccess(e);
  for(const field of ['rights','grant'] as const){
   for(const expiry of [undefined,'2000-01-01T00:00:00.000Z']){
    const binding=structuredClone(t.binding);const config=binding.trustedConfig as unknown as Record<string,Record<string,unknown>>;
    config[field].valid_until=expiry;
    await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,binding]);
    await deniedAccess(expected,expiry===undefined?'grant_config_invalid':'grant_expired');
   }
  }
  await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,t.binding]);
  await db.query('create table research_revocation_candidate.synthetic_access_result(value integer)');
  // Compose on one checked-out client: require a clean outer transaction;
  // denied work cannot be committed by a catch-and-COMMIT caller. A single-connection pool would
  // deadlock if the helper tried to acquire a nested connection.
  const secondHash='e'.repeat(64);
  await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor,secondHash,{...t.binding,approvedPayloadHash:secondHash}]);
  await db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[feedId,actor,t.sourceId,expected.grantId,1,secondHash]);
  const batchItems=[{payloadHash:hash,expected},{payloadHash:secondHash,expected}];
  const batchClient=await db.connect();
  try{
   await batchClient.query('begin isolation level read committed');
   assert.equal(await withRegisteredCandidatesInTransaction(batchClient,actor,async()=>batchItems,async()=>2),2);
   await batchClient.query('rollback');
   await db.query('update public.research_s4_bindings set revoked=true where user_id=$1 and payload_hash=$2',[actor,secondHash]);
   await batchClient.query('begin isolation level read committed');let entered=false;
   await assert.rejects(withRegisteredCandidatesInTransaction(batchClient,actor,async()=>batchItems,async()=>{entered=true;return 2;}),error=>error instanceof Error&&error.cause==='binding_revoked');
   assert.equal(entered,false);assert.equal((await batchClient.query('commit')).command,'ROLLBACK');
   await batchClient.query('begin isolation level read committed');
   await assert.rejects(withRegisteredCandidatesInTransaction(batchClient,actor,async()=>[batchItems[0],batchItems[0]],async()=>{entered=true;}),error=>error instanceof Error&&error.cause==='invalid_batch');
   assert.equal(entered,false);await batchClient.query('rollback');
   await db.query('update public.research_s4_bindings set revoked=false where user_id=$1 and payload_hash=$2',[actor,secondHash]);
   for(const items of [[],Array(101).fill(batchItems[0]),[{}],null]){
    await batchClient.query('begin isolation level read committed');
    await assert.rejects(withRegisteredCandidatesInTransaction(batchClient,actor,async()=>items as typeof batchItems,async()=>{entered=true;}),error=>error instanceof Error&&error.cause==='invalid_batch');
    assert.equal(entered,false);assert.equal((await batchClient.query('commit')).command,'ROLLBACK');
   }
   await batchClient.query('begin isolation level read committed');
   const original=structuredClone(batchItems);
   assert.equal(await withRegisteredCandidatesInTransaction(batchClient,actor,async()=>original,async(_,authorized)=>{
    original.splice(0);assert.equal(authorized.length,2);assert.ok(Object.isFrozen(authorized[0].expected.scope));return 2;
   }),2);await batchClient.query('rollback');
   const short=structuredClone(t.binding);
   const setShort=async()=>{
    (short.trustedConfig.grant as Record<string,unknown>).valid_until=(await db.query("select clock_timestamp()+interval '5 seconds' as t")).rows[0].t.toISOString();
    await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1 and payload_hash=$3',[actor,short,hash]);
   };
   await setShort();await batchClient.query('begin isolation level read committed');
   // Delay only the later reference read; it has a fresh grant. The common
   // final clock must still reject the earlier reference's expired grant.
   let delayed=false;
   const proxy=new Proxy(batchClient,{get(target,key){if(key==='query')return async(text:string,values?:unknown[])=>{
    if(!delayed&&text.startsWith('select binding,revoked')&&values?.[1]===secondHash){delayed=true;await target.query('select pg_sleep(6)');}
    return target.query(text,values);
   };return Reflect.get(target,key);}});
   await assert.rejects(withRegisteredCandidatesInTransaction(proxy,actor,async()=>batchItems,async()=>{entered=true;}),error=>error instanceof Error&&error.cause==='grant_expired');
   assert.equal(entered,false);assert.equal(delayed,true);assert.equal((await batchClient.query('commit')).command,'ROLLBACK');
   for(const businessError of [false,true]){
    await setShort();await batchClient.query('begin isolation level read committed');let workEntered=false;
    await assert.rejects(withRegisteredCandidatesInTransaction(batchClient,actor,async()=>batchItems,async client=>{
     workEntered=true;await client.query('insert into research_revocation_candidate.synthetic_access_result values(77)');await client.query('select pg_sleep(6)');
     if(businessError)throw Object.assign(new Error('revision_conflict'),{code:'revision_conflict',recovery:'synthetic'});return 2;
    }),error=>error instanceof Error&&error.cause==='grant_expired');
    assert.equal(workEntered,true);assert.equal((await batchClient.query('commit')).command,'ROLLBACK');
    assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.synthetic_access_result')).rows[0].n,0);
   }
   await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1 and payload_hash=$3',[actor,t.binding,hash]);
   const hundred=Array.from({length:100},(_,i)=>({payloadHash:(i+1).toString(16).padStart(64,'0'),expected}));
   for(const item of hundred){
    await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor,item.payloadHash,{...t.binding,approvedPayloadHash:item.payloadHash}]);
    await db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[feedId,actor,t.sourceId,expected.grantId,1,item.payloadHash]);
   }
   await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
   await batchClient.query('begin isolation level read committed');
   assert.equal(await withRegisteredCandidatesInTransaction(batchClient,actor,async()=>hundred,async(_,items)=>items.length),100);
   await batchClient.query('rollback');
   await db.query('delete from research_revocation_candidate.binding_map where payload_hash=any($1::text[])',[hundred.map(i=>i.payloadHash)]);
   await db.query('delete from public.research_s4_bindings where payload_hash=any($1::text[])',[hundred.map(i=>i.payloadHash)]);
  }finally{await batchClient.query('rollback');batchClient.release();}
  await db.query('delete from research_revocation_candidate.binding_map where payload_hash=$1',[secondHash]);
  await db.query('delete from public.research_s4_bindings where payload_hash=$1',[secondHash]);
  const single=ownedPool({connectionString:state.adminUrl,max:1,connectionTimeoutMillis:500,statement_timeout:10000});
  const client=await single.connect();
  try{
   let entered=false;
   await assert.rejects(withRegisteredCandidateInTransaction(client,actor,hash,expected,async()=>{entered=true;}),error=>error instanceof Error&&error.cause==='explicit_transaction_required');
   assert.equal(entered,false);
   await client.query('begin isolation level repeatable read');
   await assert.rejects(withRegisteredCandidateInTransaction(client,actor,hash,expected,async()=>{entered=true;}),error=>error instanceof Error&&error.cause==='transaction_isolation');
   assert.equal(entered,false);await client.query('rollback');
   await client.query('begin isolation level read committed');
   await client.query('insert into research_revocation_candidate.synthetic_access_result values(9)');
   await assert.rejects(withRegisteredCandidateInTransaction(client,actor,hash,expected,async()=>{entered=true;}),error=>error instanceof Error&&error.cause==='transaction_not_clean');
   assert.equal(entered,false);
   assert.equal((await client.query('commit')).command,'ROLLBACK');
   for(const [owner,payload] of [[randomUUID(),hash],[actor,'0'.repeat(64)],['invalid-uuid',hash]]){
    await client.query('begin');
    await assert.rejects(withStoredCandidateInTransaction(client,owner,payload,async()=>{entered=true;}),/revocation_access_denied/);
    assert.equal(entered,false);assert.equal((await client.query('commit')).command,'ROLLBACK');
   }
   await client.query('begin');
   await client.query('insert into research_revocation_candidate.synthetic_access_result values(99)');
   await assert.rejects(withStoredCandidateInTransaction(client,actor,'0'.repeat(64),async()=>{entered=true;}),error=>error instanceof Error&&error.message==='revocation_access_denied'&&error.cause==='transaction_not_clean');
   assert.equal(entered,false);assert.equal((await client.query('commit')).command,'ROLLBACK');
   await client.query('begin');await assert.rejects(client.query('select 1/0'));
   await assert.rejects(withStoredCandidateInTransaction(client,actor,hash,async()=>{entered=true;}),error=>error instanceof Error&&error.message==='revocation_access_denied');
   assert.equal(entered,false);assert.equal((await client.query('commit')).command,'ROLLBACK');
   await client.query('begin isolation level read committed');
   const count=await withStoredCandidateInTransaction(client,actor,hash,async same=>{
    await same.query('insert into research_revocation_candidate.synthetic_access_result values(9)');
    assert.equal(same,client);
    return (await same.query('select count(*)::int n from research_revocation_candidate.synthetic_access_result')).rows[0].n;
   });
   assert.equal(count,1);await client.query('rollback');
   assert.equal((await client.query('select count(*)::int n from research_revocation_candidate.synthetic_access_result')).rows[0].n,0);
   await client.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
   await client.query('begin');
   let postEntered=false;
   await assert.rejects(withStoredCandidateInTransaction(client,actor,hash,async same=>{
    postEntered=true;await same.query('insert into research_revocation_candidate.synthetic_access_result values(10)');
    await same.query('select pg_sleep(6)');return true;
   }),/revocation_access_denied/);
   assert.equal(postEntered,true);assert.equal((await client.query('commit')).command,'ROLLBACK');
   assert.equal((await client.query('select count(*)::int n from research_revocation_candidate.synthetic_access_result')).rows[0].n,0);
   await client.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
   await client.query('begin');
   await assert.rejects(withRegisteredCandidateInTransaction(client,actor,hash,expected,async same=>{await same.query('rollback');return 'must not return';}),error=>error instanceof Error&&error.cause==='transaction_changed');
  }finally{await client.query('rollback');client.release();await single.end();}
  // Real elapsed database time, without mutating security state inside work.
  await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
  let elapsedEntered=false;
  await assert.rejects(withRegisteredCandidate(db,actor,hash,expected,async client=>{
   elapsedEntered=true;
   await client.query('insert into research_revocation_candidate.synthetic_access_result values(1)');
   await client.query('select pg_sleep(6)');
   return 'must not disclose';
  }),/revocation_access_denied/);
  assert.equal(elapsedEntered,true);
  assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.synthetic_access_result')).rows[0].n,0);
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  assert.equal(await withRegisteredCandidate(db,actor,hash,expected,async()=>true),true);
  const shortBinding=structuredClone(t.binding);
  (shortBinding.trustedConfig.grant as Record<string,unknown>).valid_until=(await db.query("select clock_timestamp()+interval '5 seconds' as expiry")).rows[0].expiry.toISOString();
  await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,shortBinding]);
  let grantEntered=false;
  await assert.rejects(withRegisteredCandidate(db,actor,hash,expected,async client=>{
   grantEntered=true;await client.query('insert into research_revocation_candidate.synthetic_access_result values(3)');
   await client.query('select pg_sleep(6)');return true;
  }),error=>error instanceof Error&&error.cause==='grant_expired');
  assert.equal(grantEntered,true);
  assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.synthetic_access_result')).rows[0].n,0);
  await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,t.binding]);
  const lockWait=async(holder:number)=>{
   for(let i=0;i<100;i++){
    const found=await db.query(`select w.pid from pg_locks h join pg_locks w
      on h.locktype=w.locktype and h.database=w.database and h.classid=w.classid and h.objid=w.objid and h.objsubid=w.objsubid
      join pg_stat_activity a on a.pid=w.pid
      where h.pid=$1 and h.locktype='advisory' and h.granted and not w.granted
      and a.query like '%pg_advisory_xact_lock%'`,[holder]);
    if(found.rowCount)return;await db.query('select pg_sleep(0.01)');
   }
   assert.fail('expected competing operation blocked on holder owner lock');
  };
  let holderPid=0;
  let release!:()=>void,entered!:()=>void;
  const barrier=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});
  const malformedAt=(await db.query('select clock_timestamp() as now')).rows[0].now.toISOString();
  await assert.rejects(apply({...page,through_seq:'1',latest_seq:'1',published_at:malformedAt,events:[{revocation_id:randomUUID(),monotonic_seq:'1',source_id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',grant_id:expected.grantId,grant_version:1,effective_at:malformedAt}]}),/revocation_apply_failed/);
  assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.inbox')).rows[0].n,0);
  const operation=withRegisteredCandidate(db,actor,hash,expected,async client=>{
   holderPid=(await client.query('select pg_backend_pid() as pid')).rows[0].pid;entered();await barrier;
   await client.query('insert into research_revocation_candidate.synthetic_access_result values(2)');return 'committed before revocation';
  });
  await started;
  // One instant: separate wall-clock reads can make effective_at later than publication.
  const revokedAt=(await db.query('select clock_timestamp() as now')).rows[0].now.toISOString();
  const consume=apply({...page,through_seq:'1',latest_seq:'1',published_at:revokedAt,events:[{revocation_id:randomUUID(),monotonic_seq:'1',source_id:t.sourceId,grant_id:expected.grantId,grant_version:1,effective_at:revokedAt}]});
  // Attach handlers immediately, and always release the transaction on failure.
  const settled=Promise.allSettled([operation,consume]);
  try{
   await lockWait(holderPid);
  }finally{release();await settled;}
  assert.equal(await operation,'committed before revocation');await assert.doesNotReject(consume,'signed consumer after owner-lock handoff');
  assert.equal((await db.query('select value from research_revocation_candidate.synthetic_access_result')).rows[0].value,2);
  const deniedClient=await db.connect();
  try{
   await deniedClient.query('begin');let leaked=false;
   await assert.rejects(withStoredCandidateInTransaction(deniedClient,actor,hash,async()=>{leaked=true;}),/revocation_access_denied/);
   assert.equal(leaked,false);assert.equal((await deniedClient.query('commit')).command,'ROLLBACK');
  }finally{await deniedClient.query('rollback');deniedClient.release();}
  const recordsBefore=(await db.query('select count(*)::int n from public.research_s4_records where user_id=$1',[actor])).rows[0].n;
  for(const op of [()=>submitRegisteredDecision(s4Actor,imported.id,decision),()=>registeredReviewHistory(s4Actor,imported.id),()=>registeredCitation(s4Actor,imported.id,shown.cards[0].id,0)])await assert.rejects(op(),/revocation_access_denied/);
  await assert.rejects(registeredCandidateStatus(s4Actor,imported.id),/revocation_access_denied/);
  await assert.rejects(revealRegisteredCards(s4Actor,imported.id,revealInput),/revocation_access_denied/);
  assert.equal((await db.query('select count(*)::int n from public.research_s4_records where user_id=$1',[actor])).rows[0].n,recordsBefore);
  await rejected(register(),'binding_revoked');
  assert.equal((await s4Http(()=>importRegisteredCandidate(s4Actor,raw))).status,403);
  await assert.rejects(importRegisteredCandidate(s4Actor,raw),/revocation_access_denied/);
  assert.equal((await db.query('select count(*)::int n from public.research_s4_candidates')).rows[0].n,1);
  await assert.rejects(withRegisteredCandidate(db,actor,hash,expected,async()=>true),/revocation_access_denied/);
  // Even an accidentally reset binding must not bypass a retained tombstone.
  const marketTombstoneBefore=await freezeSnapshot();
  await db.query('update public.research_s4_bindings set revoked=false where user_id=$1',[actor]);await rejected(register(),'grant_version_revoked');await deniedAccess(expected,'grant_version_revoked');await denyRoutes(403);await assert.rejects(registeredObservationReport(s4Actor,decided.observationId),e=>e instanceof Error&&e.cause==='grant_version_revoked');
  await assert.rejects(freezeRegisteredMarket(s4Actor,decided.observationId,registeredMappings[0],'synthetic'),e=>e instanceof Error&&e.cause==='grant_version_revoked');assert.deepEqual(await freezeSnapshot(),marketTombstoneBefore);
  for(const op of [()=>registeredCitation(s4Actor,imported.id,shown.cards[0].id,0),()=>registeredReviewHistory(s4Actor,imported.id),()=>submitRegisteredDecision(s4Actor,imported.id,decision),()=>registeredCandidateStatus(s4Actor,imported.id),()=>revealRegisteredCards(s4Actor,imported.id,revealInput)]){
   await assert.rejects(op(),error=>error instanceof Error&&error.cause==='grant_version_revoked');
  }

  const storedTombstone=await db.connect();
  try{
   await storedTombstone.query('begin');let entered=false;
   await assert.rejects(withStoredCandidateInTransaction(storedTombstone,actor,hash,async()=>{entered=true;}),error=>error instanceof Error&&error.cause==='grant_version_revoked');
   assert.equal(entered,false);assert.equal((await storedTombstone.query('commit')).command,'ROLLBACK');
  }finally{await storedTombstone.query('rollback');storedTombstone.release();}

  await assert.rejects(db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6) on conflict do nothing',[feedId,actor,t.sourceId,expected.grantId,1,hash]),/grant_version_revoked/);
  assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.binding_map')).rows[0].n,1);
  // Reverse ordering: retained tombstone is visible only after the writer commits.
  const retained=(await db.query('delete from research_revocation_candidate.inbox where feed_id=$1 returning *',[feedId])).rows[0];
  const writer=await db.connect();
  let pending:Promise<void>|undefined;
  try{
   await writer.query('begin');
   await writer.query('select pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',[actor]);
   const pid=(await writer.query('select pg_backend_pid() as pid')).rows[0].pid;
   await writer.query('insert into research_revocation_candidate.inbox(feed_id,sequence,revocation_id,event) values($1,$2,$3,$4)',[feedId,retained.sequence,retained.revocation_id,retained.event]);
   // The uncommitted tombstone alone must deny after lock handoff.
   await writer.query('update public.research_s4_bindings set revoked=false where user_id=$1',[actor]);
   pending=deniedAccess(expected,'grant_version_revoked');
   void pending.catch(()=>{});
   await lockWait(pid);await writer.query('commit');await pending;
  }finally{await writer.query('rollback');writer.release();await pending;}
  await db.query('delete from research_revocation_candidate.inbox where feed_id=$1',[feedId]);
  await rejected(register(),'inbox_coverage_gap');await deniedAccess(expected,'inbox_coverage_gap');
  if(interrupted)throw new Error('interrupted');
  console.log('Registration acceptance passed: missing approval, freshness/scope, rollback, concurrent idempotency, consumer revoke and tombstone denial.');
 }catch(error){primary=error;throw error;}finally{try{await closeS4Pool();await db.end();}finally{stopLocalDatabase(state,primary);}}
}
void main().catch(error=>{console.error(error instanceof Error?error.stack:'registration test failed');process.exitCode=1;});
