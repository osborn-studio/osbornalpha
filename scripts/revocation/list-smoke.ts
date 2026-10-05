import {registeredObservationReport} from '../../src/lib/research/s6/report';
import {revealRegisteredCards} from '../../src/lib/research/s4/cards';
import {submitRegisteredDecision} from '../../src/lib/research/s4/decisions';
import {createRegisteredS6Store,prepareRegisteredEvaluation,prepareRegisteredInput,makeCommit} from '../../src/lib/research/s6/store';
import {freezeMarket,benchmarkIdentity} from '../../src/lib/research/s6/market';
import {syntheticMapping} from '../s6/fixtures';
import {GET,POST} from '../../src/app/api/research/s4/candidates/route';
import {localSessionToken} from '../../src/lib/research/s4/auth';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
import {testPack} from '../s4/test-pack';
import {canonicalize,digest} from '../../src/lib/research/ingest/pa-v1/json.js';
import {registerCandidateReference} from '../../src/lib/research/revocation/register';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
import {listRegisteredCandidates,type CandidatePageCursor} from '../../src/lib/research/s4/registered-list';
import {closeS4Pool} from '../../src/lib/research/s4/db';
import {s4Http} from '../../src/lib/research/s4/http';
async function cleanupGate(gate:PoolClient,pending:Array<Promise<unknown>|undefined>,db:Pool,ddl:string,bodyFailure:unknown){
 const errors:unknown[]=[];
 try{await gate.query('rollback');}catch(error){errors.push(error);}finally{gate.release(true);}
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([Promise.allSettled(pending.filter(Boolean)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('race cleanup deadline')),15000);})]);}catch(error){errors.push(error);}finally{if(timer)clearTimeout(timer);}
 try{await db.query(ddl);}catch(error){errors.push(error);}
 if(bodyFailure!==undefined)throw bodyFailure;
 if(errors.length)throw new AggregateError(errors,'race cleanup failed');
}
async function main(){
 const state=await startLocalDatabase(),db=new Pool({connectionString:state.adminUrl,statement_timeout:30000,connectionTimeoutMillis:5000});let primary:unknown;
 try{
  await db.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  await db.query('grant usage on schema research_revocation_candidate to alpha_s4_runtime;grant select on all tables in schema research_revocation_candidate to alpha_s4_runtime');
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  process.env.ALPHA_S4_LOCAL_AUTH='1';process.env.ALPHA_S4_ORIGIN='http://127.0.0.1:3199';process.env.ALPHA_S4_LOCAL_SESSION_SECRET=randomUUID();
  const actor={userId:randomUUID(),kind:'agent' as const};
  await db.query('insert into auth.users(id) values($1)',[actor.userId]);
  await db.query("update public.profiles set role='admin' where id=$1",[actor.userId]);
  assert.deepEqual(await listRegisteredCandidates(actor),{candidates:[],nextCursor:null});
  const origin=process.env.ALPHA_S4_ORIGIN;
  const cookie='alpha_s4_local_session='+localSessionToken(actor.userId,process.env.ALPHA_S4_LOCAL_SESSION_SECRET,Date.now()+3600000);
  const get=(query='',headers:Record<string,string>={})=>GET(new Request(origin+'/api/research/s4/candidates'+query,{headers:{host:'127.0.0.1:3199',cookie,...headers}}));
  assert.equal((await get('',{cookie:''})).status,401);
  assert.equal((await get('',{host:'evil.example'})).status,403);
  assert.equal((await get('',{'sec-fetch-site':'cross-site'})).status,403);
  assert.deepEqual(await (await get()).json(),{candidates:[],nextCursor:null});
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const seeds:Array<{t:ReturnType<typeof testPack>;feedId:string;registration:Parameters<typeof applyRevocationPage>[1];page:Record<string,unknown>;id:string}>=[];
  for(let i=0;i<2;i++){
   const t=testPack(actor.userId),feedId=randomUUID();
   const expected={feedId,scope:t.scope,sourceId:t.sourceId,grantId:t.config.grant.grant_id,grantVersion:1};
   const ref={protocol_version:'pa-grant-reference/v1',feed_id:feedId,owner_scope:t.scope,source_id:t.sourceId,grant_id:expected.grantId,grant_version:1,observed_at:t.version.ingested_at,revocation_seq_at_export:'0'};
   t.pack.manifest.extensions['pa.revocation_reference']=ref;t.pack.files['manifest.json']=canonicalize(t.pack.manifest);t.binding.approvedManifestHash=digest(t.pack.manifest);
   await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,t.binding.approvedPayloadHash,t.binding]);
   await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[feedId,actor.userId,t.scope.user_id]);
   const registration={feedId,localOwner:actor.userId,scope:t.scope,key:publicKey};
   const page={protocol_version:'pa-revocation/v1',feed_id:feedId,owner_scope:t.scope,from_seq:'0',through_seq:'0',latest_seq:'0',published_at:new Date().toISOString(),events:[]};
   const bytes=Buffer.from(JSON.stringify(page));await applyRevocationPage(db,registration,bytes,sign(null,bytes,privateKey).toString('hex'));
   const raw=JSON.stringify(t.pack);
   const post=()=>POST(new Request(origin+'/api/research/s4/candidates',{method:'POST',headers:{host:'127.0.0.1:3199',origin,cookie,'content-type':'application/json'},body:raw}));
   assert.equal((await post()).status,503);
   await registerCandidateReference(db,actor.userId,t.binding.approvedPayloadHash,raw,expected);
   const response=await post();assert.equal(response.status,200);const imported=await response.json();assert.equal(imported.duplicate,false);
   assert.equal((await (await get()).json()).candidates.length,i+1);
   assert.deepEqual(await (await post()).json(),{id:imported.id,duplicate:true});
   await db.query('update public.research_s4_candidates set created_at=$2 where id=$1',[imported.id,`2026-10-01T00:00:00.00000${i+1}Z`]);
   seeds.push({t,feedId,registration,page,id:imported.id});
  }
  await assert.rejects(db.query(`insert into public.research_s4_candidates(user_id,id,source_version_id,external_candidate_id,payload_hash,imported)
   select user_id,$2,source_version_id,external_candidate_id,payload_hash,imported from public.research_s4_candidates where id=$1`,[seeds[0].id,randomUUID()]),e=>e instanceof Error&&(e as {code?:string}).code==='23505'&&(e as {constraint?:string}).constraint==='research_s4_candidates_user_id_payload_hash_key');
  process.env.ALPHA_S6_ENABLED='1';
  await db.query(`insert into public.stocks_universe(ticker,name,market,exchange,currency,metadata) values('PAIRTEST','Synthetic','US','XNYS','USD','{"synthetic":true}')`);
  const store=createRegisteredS6Store(actor);
  const evaluations:Array<{id:string;body:ReturnType<typeof makeCommit>;receipt:Awaited<ReturnType<typeof store.commitEvaluationResult>>;marketIds:string[]}>=[];
  for(const seed of seeds){
   const cards=await revealRegisteredCards(actor,seed.id,{requestKey:randomUUID(),judgment:'Synthetic agent pair isolation',alreadySeen:[],independentJudgment:false});
   const result=await submitRegisteredDecision(actor,seed.id,{requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic agent test only',cardId:cards.cards[0].id,labelId:cards.labelId,exposureId:cards.exposureId,securityTicker:'PAIRTEST',companyEntityId:null,newObservation:true,reviewAt:null});
   const id=result.observationId!;
   const observation=(await store.readObservation(id)).observation;
   const frozenIds=[];for(const security of [observation.securities[0],benchmarkIdentity(true)])frozenIds.push((await freezeMarket(actor,id,syntheticMapping(security),'synthetic')).id);
   const preparation=await prepareRegisteredEvaluation(actor,id),input=await prepareRegisteredInput(actor,id,preparation.marketIds,preparation.asOf);
   assert.equal(preparation.marketIds.length,2);assert.deepEqual(input.market_snapshots.map(m=>m.id).sort(),frozenIds.sort());
   const body=makeCommit(input,randomUUID(),preparation.revision),receipt=await store.commitEvaluationResult(body);
   assert.equal(receipt.status,'accepted');
   const stored=(await db.query('select observation_id,input from public.research_s6_evaluations where user_id=$1 and id=$2',[actor.userId,receipt.evaluation_ref])).rows[0];assert.equal(stored.observation_id,id);assert.deepEqual(stored.input.market_snapshots.map((m:{id:string})=>m.id).sort(),frozenIds);
   evaluations.push({id,body,receipt,marketIds:preparation.marketIds});
  }
  assert.notEqual(evaluations[0].id,evaluations[1].id);
  assert.equal(new Set(evaluations.flatMap(e=>e.marketIds)).size,4);
  const storeSnapshot=async()=>({
   markets:(await db.query('select * from public.research_s6_markets where user_id=$1 order by id',[actor.userId])).rows,
   evaluations:(await db.query('select * from public.research_s6_evaluations where user_id=$1 order by id',[actor.userId])).rows,
   states:(await db.query('select * from public.research_s4_observation_state where user_id=$1 order by observation_id',[actor.userId])).rows,
   records:(await db.query('select * from public.research_s4_records where user_id=$1 order by id',[actor.userId])).rows,
   outbox:(await db.query('select * from public.research_s4_outbox where user_id=$1 order by sequence',[actor.userId])).rows,
  });
  const healthyNext=await prepareRegisteredEvaluation(actor,evaluations[1].id),healthyInput=await prepareRegisteredInput(actor,evaluations[1].id,healthyNext.marketIds,healthyNext.asOf);
  const healthyBefore=await storeSnapshot();
  await assert.rejects(store.commitEvaluationResult(makeCommit(healthyInput,evaluations[0].body.idempotency_key,healthyNext.revision)),e=>e instanceof Error&&e.cause==='validation_or_database');
  assert.deepEqual(await storeSnapshot(),healthyBefore);
  const unique=(await db.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.research_s6_evaluations'::regclass and contype='u'")).rows;
  assert.ok(unique.some(r=>r.definition==='UNIQUE (user_id, idempotency_key)'));
  await assert.rejects(db.query(`insert into public.research_s6_evaluations(user_id,id,observation_id,idempotency_key,body_hash,input,result,result_hash,receipt) select user_id,$2,observation_id,idempotency_key,body_hash,input,result,result_hash,receipt from public.research_s6_evaluations where user_id=$1 and id=$3`,[actor.userId,randomUUID(),evaluations[0].receipt.evaluation_ref]),e=>typeof e==='object'&&e!==null&&(e as {code?:string}).code==='23505'&&unique.some(r=>r.conname===(e as {constraint?:string}).constraint));
  assert.equal((await store.commitEvaluationResult(makeCommit(healthyInput,randomUUID(),healthyNext.revision))).status,'accepted');
  const first=await listRegisteredCandidates(actor,1);assert.equal(first.candidates[0].id,seeds[1].id);assert.ok(first.nextCursor);
  assert.deepEqual(first.nextCursor,{createdAt:'2026-10-01T00:00:00.000002Z',id:seeds[1].id});
  const httpFirst=await get('?limit=1');assert.equal(httpFirst.status,200);assert.equal(httpFirst.headers.get('cache-control'),'no-store');
  const wireFirst=await httpFirst.json();assert.deepEqual(wireFirst.nextCursor,first.nextCursor);
  const wireSecond=await (await get('?'+new URLSearchParams({limit:'1',...wireFirst.nextCursor}).toString())).json();assert.equal(wireSecond.candidates[0].id,seeds[0].id);
  for(const query of ['?limit=0','?limit=101','?limit=999','?createdAt=x','?unknown='+('x'.repeat(2050)),'?limit=01','?limit=1&limit=2','?unknown=1','?id='+seeds[0].id,'?createdAt=x&id='+seeds[0].id]){
   const response=await get(query);assert.equal(response.status,422);assert.deepEqual(await response.json(),{error:{code:'invalid_schema'}});
  }
  assert.equal((await get('?limit=100')).status,200);
  const second=await listRegisteredCandidates(actor,1,first.nextCursor!);assert.equal(second.candidates[0].id,seeds[0].id);assert.ok(second.nextCursor);
  assert.deepEqual(await listRegisteredCandidates(actor,1,second.nextCursor!),{candidates:[],nextCursor:null});
  assert.equal((await listRegisteredCandidates(actor,2)).candidates.length,2);
  for(const limit of [0,101,1.5])await assert.rejects(listRegisteredCandidates(actor,limit),/invalid_schema/);
  await assert.rejects(listRegisteredCandidates(actor,1,{id:randomUUID(),createdAt:'2026-02-30T00:00:00.000001Z'}),/invalid_schema/);
  for(const bad of [null,'cursor',[],{id:[randomUUID()],createdAt:first.nextCursor!.createdAt},{...first.nextCursor!,extra:1}])await assert.rejects(listRegisteredCandidates(actor,1,bad as unknown as CandidatePageCursor),/invalid_schema/);
  const other={userId:randomUUID(),kind:'agent' as const};
  await db.query('insert into auth.users(id) values($1)',[other.userId]);await db.query("update public.profiles set role='admin' where id=$1",[other.userId]);
  assert.deepEqual(await listRegisteredCandidates(other),{candidates:[],nextCursor:null});
  const mapping=(await db.query('delete from research_revocation_candidate.binding_map where feed_id=$1 returning *',[seeds[0].feedId])).rows[0];
  assert.equal((await s4Http(()=>listRegisteredCandidates(actor,2))).status,503);
  const missing=await get();assert.equal(missing.status,503);assert.deepEqual(await missing.json(),{error:{code:'revocation_check_unavailable'}});
  await db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[mapping.feed_id,mapping.local_owner,mapping.source_id,mapping.grant_id,mapping.grant_version,mapping.payload_hash]);
  const original=(await db.query('select imported from public.research_s4_candidates where id=$1',[seeds[0].id])).rows[0].imported;
  const changed=structuredClone(original);changed.sourceRef.source_id=randomUUID();
  await db.query('update public.research_s4_candidates set imported=$2 where id=$1',[seeds[0].id,changed]);
  const conflict=await s4Http(()=>listRegisteredCandidates(actor,2));assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{error:{code:'source_version_conflict'}});
  await db.query('update public.research_s4_candidates set imported=$2 where id=$1',[seeds[0].id,original]);
  // Hold the later row to cross the deadline after the first row was collected.
  const locker=await db.connect();let pending:Promise<Response>|undefined;
  try{
   await locker.query('begin');await locker.query('select id from public.research_s4_candidates where id=$1 for update',[seeds[0].id]);
   const pid=(await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
   await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
   pending=s4Http(()=>listRegisteredCandidates(actor,2));
   let blocked=false;
   for(let i=0;i<100;i++){
    blocked=(await db.query('select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) as blocked',[pid])).rows[0].blocked;
    if(blocked)break;await db.query('select pg_sleep(0.01)');
   }
   assert.equal(blocked,true);await db.query('select pg_sleep(6)');
  }finally{await locker.query('rollback');locker.release();}
  const expired=await pending!;assert.equal(expired.status,503);assert.deepEqual(await expired.json(),{error:{code:'revocation_check_unavailable'}});
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');
  // Older/later item is on a different feed. Never return the first healthy row
  // as a partial success when the second row cannot be verified.
  const affected=seeds[0];
  await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '61 seconds' where feed_id=$1",[affected.feedId]);
  assert.equal((await listRegisteredCandidates(actor,1)).candidates[0].id,seeds[1].id);
  await assert.rejects(listRegisteredCandidates(actor,1,first.nextCursor!),e=>e instanceof Error&&e.cause==='revocation_stale');
  assert.deepEqual(await listRegisteredCandidates(actor,1,second.nextCursor!),{candidates:[],nextCursor:null});
  const routeStale=await get();assert.equal(routeStale.status,503);assert.deepEqual(await routeStale.json(),{error:{code:'revocation_check_unavailable'}});
  const stale=await s4Http(()=>listRegisteredCandidates(actor,2));assert.equal(stale.status,503);assert.deepEqual(await stale.json(),{error:{code:'revocation_check_unavailable'}});
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp() where feed_id=$1',[affected.feedId]);
  const forwardAt=(await db.query('select clock_timestamp() as now')).rows[0].now.toISOString();
  const event={revocation_id:randomUUID(),monotonic_seq:'1',source_id:affected.t.sourceId,grant_id:affected.t.config.grant.grant_id,grant_version:1,effective_at:forwardAt};
  const bytes=Buffer.from(JSON.stringify({...affected.page,through_seq:'1',latest_seq:'1',published_at:forwardAt,events:[event]}));
  const unaffectedSnapshot=async()=>({binding:(await db.query('select * from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[actor.userId,seeds[1].t.binding.approvedPayloadHash])).rows,feed:(await db.query('select * from research_revocation_candidate.feed where feed_id=$1',[seeds[1].feedId])).rows,mapping:(await db.query('select * from research_revocation_candidate.binding_map where feed_id=$1',[seeds[1].feedId])).rows});
  const unaffectedBefore=await unaffectedSnapshot();
  // A real registered commit owns the source lock while a synthetic DB gate
  // pauses its insert. Observe both lock waits before releasing either path.
  const contender=evaluations[0],preparedRace=await prepareRegisteredEvaluation(actor,contender.id);
  const raceInput=await prepareRegisteredInput(actor,contender.id,preparedRace.marketIds,preparedRace.asOf);
  const raceBody=makeCommit(raceInput,randomUUID(),preparedRace.revision),gateKey=Math.floor(Math.random()*1000000000);
  const gate=await db.connect();
  const installGate=()=>db.query(`create function public.synthetic_pair_commit_gate() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(713,${gateKey}); return new; end $$; create trigger synthetic_pair_commit_gate before insert on public.research_s6_evaluations for each row execute function public.synthetic_pair_commit_gate()`);
  let commitRace:ReturnType<typeof store.commitEvaluationResult>|undefined,consumerRace:ReturnType<typeof applyRevocationPage>|undefined;
  const waitFor=async(query:string,values:unknown[])=>{for(const deadline=performance.now()+3000;performance.now()<deadline;){const row=(await db.query(query,values)).rows[0];if(row)return row;await db.query('select pg_sleep(0.01)');}assert.fail('expected real database lock contention');};
  let racedEvaluation='',forwardFailure:unknown;
  try{
   await gate.query('begin');await gate.query('select pg_advisory_xact_lock(713,$1)',[gateKey]);await installGate();
   const beforeRace=await storeSnapshot();
   commitRace=store.commitEvaluationResult(raceBody);void commitRace.catch(()=>{});
   const blockedCommit=await waitFor("select pid from pg_locks where locktype='advisory' and classid=713 and objid=$1 and objsubid=2 and not granted",[gateKey]);
   consumerRace=applyRevocationPage(db,affected.registration,bytes,sign(null,bytes,privateKey).toString('hex'));void consumerRace.catch(()=>{});
   const waiting=await waitFor(`select w.pid from pg_locks h join pg_locks w on h.locktype=w.locktype and h.database=w.database and h.classid=w.classid and h.objid=w.objid and h.objsubid=w.objsubid
    where h.pid=$1 and h.locktype='advisory' and h.objsubid=1 and h.granted and not w.granted
    and h.classid::bigint=((hashtextextended($2,0)>>32)&4294967295) and h.objid::bigint=(hashtextextended($2,0)&4294967295)`,[blockedCommit.pid,actor.userId]);
   assert.notEqual(waiting.pid,blockedCommit.pid);
   assert.deepEqual(await storeSnapshot(),beforeRace);
   await gate.query('commit');
   const committed=await commitRace;assert.equal(committed.status,'accepted');assert.equal(committed.revision,preparedRace.revision+1);
   racedEvaluation=committed.evaluation_ref;
   await consumerRace;
   assert.equal((await db.query('select cursor::text from research_revocation_candidate.feed where feed_id=$1',[affected.feedId])).rows[0].cursor,'1');
   assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.inbox where feed_id=$1',[affected.feedId])).rows[0].n,1);
   assert.equal((await db.query('select revision from public.research_s4_observation_state where user_id=$1 and observation_id=$2',[actor.userId,contender.id])).rows[0].revision,preparedRace.revision+1);
   assert.equal((await db.query("select count(*)::int n from public.research_s4_records where user_id=$1 and kind='ControlEvent' and payload->>'evaluation_ref'=$2",[actor.userId,racedEvaluation])).rows[0].n,1);
   assert.equal((await db.query('select count(*)::int n from public.research_s6_evaluations where user_id=$1 and id=$2',[actor.userId,committed.evaluation_ref])).rows[0].n,1);
  }catch(error){forwardFailure=error;}finally{
   await cleanupGate(gate,[commitRace,consumerRace],db,'drop trigger if exists synthetic_pair_commit_gate on public.research_s6_evaluations; drop function if exists public.synthetic_pair_commit_gate()',forwardFailure);
  }


  assert.deepEqual(await unaffectedSnapshot(),unaffectedBefore);
  assert.equal((await db.query('select revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[actor.userId,affected.t.binding.approvedPayloadHash])).rows[0].revoked,true);
  const consumedBefore=await storeSnapshot();
  await assert.rejects(registeredObservationReport(actor,contender.id,racedEvaluation),e=>e instanceof Error&&e.cause==='binding_revoked');
  for(const op of [()=>store.readObservation(evaluations[0].id),...evaluations[0].marketIds.map(mid=>()=>store.readMarketSnapshot(mid)),()=>store.commitEvaluationResult(evaluations[0].body)])await assert.rejects(op(),e=>e instanceof Error&&e.cause==='binding_revoked');
  assert.equal((await store.readObservation(evaluations[1].id)).observation.id,evaluations[1].id);
  for(const mid of evaluations[1].marketIds)assert.equal((await store.readMarketSnapshot(mid)).snapshot.id,mid);
  assert.equal((await store.commitEvaluationResult(evaluations[1].body)).status,'duplicate');assert.deepEqual(await storeSnapshot(),consumedBefore);
  // Separate operator-reset corruption case below isolates retained tombstones.

  await db.query('update public.research_s4_bindings set revoked=false where user_id=$1 and payload_hash=$2',[actor.userId,affected.t.binding.approvedPayloadHash]);
  await assert.rejects(listRegisteredCandidates(actor,2),e=>e instanceof Error&&e.cause==='grant_version_revoked');
  const denied=evaluations[0],allowed=evaluations[1],beforeStore=await storeSnapshot();
  for(const op of [()=>store.readObservation(denied.id),...denied.marketIds.map(mid=>()=>store.readMarketSnapshot(mid)),()=>store.commitEvaluationResult(denied.body)])await assert.rejects(op(),e=>e instanceof Error&&e.cause==='grant_version_revoked');
  assert.equal((await store.readObservation(allowed.id)).observation.id,allowed.id);
  for(const mid of allowed.marketIds)assert.equal((await store.readMarketSnapshot(mid)).snapshot.id,mid);
  assert.equal((await store.commitEvaluationResult(allowed.body)).status,'duplicate');
  assert.deepEqual(await storeSnapshot(),beforeStore);
  // Foreign globally unique key never returns the denied candidate's receipt.
  const next=await prepareRegisteredEvaluation(actor,allowed.id),nextInput=await prepareRegisteredInput(actor,allowed.id,next.marketIds,next.asOf);
  await assert.rejects(store.commitEvaluationResult(makeCommit(nextInput,denied.body.idempotency_key,next.revision)),e=>e instanceof Error&&e.message==='revocation_access_denied'&&e.cause==='validation_or_database');
  assert.deepEqual(await storeSnapshot(),beforeStore);
  const freshReceipt=await store.commitEvaluationResult(makeCommit(nextInput,randomUUID(),next.revision));assert.equal(freshReceipt.status,'accepted');assert.equal(freshReceipt.revision,next.revision+1);
  await db.query('delete from research_revocation_candidate.inbox where feed_id=$1',[affected.feedId]);
  await assert.rejects(listRegisteredCandidates(actor,2),e=>e instanceof Error&&e.cause==='inbox_coverage_gap');
  // Reverse handoff: signed consumer holds owner lock before a previously
  // prepared evaluation queues. The prepared input must not authorize a write.
  const reverseSeed=seeds[1],reversePreparation=await prepareRegisteredEvaluation(actor,allowed.id);
  const reverseInput=await prepareRegisteredInput(actor,allowed.id,reversePreparation.marketIds,reversePreparation.asOf);
  const reverseBody=makeCommit(reverseInput,randomUUID(),reversePreparation.revision),reverseBefore=await storeSnapshot();
  const reverseAt=(await db.query('select clock_timestamp() as now')).rows[0].now.toISOString();
  const reverseBytes=Buffer.from(JSON.stringify({...reverseSeed.page,through_seq:'1',latest_seq:'1',published_at:reverseAt,events:[{revocation_id:randomUUID(),monotonic_seq:'1',source_id:reverseSeed.t.sourceId,grant_id:reverseSeed.t.config.grant.grant_id,grant_version:1,effective_at:reverseAt}]}));
  let reverseFailure:unknown;
  const reverseGate=await db.connect();let reverseConsumer:ReturnType<typeof applyRevocationPage>|undefined,reverseCommit:ReturnType<typeof store.commitEvaluationResult>|undefined;
  try{
   await reverseGate.query('begin');await reverseGate.query('select pg_advisory_xact_lock(714,$1)',[gateKey]);
   await db.query(`create function research_revocation_candidate.synthetic_consumer_gate() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(714,${gateKey}); return new; end $$; create trigger synthetic_consumer_gate before insert on research_revocation_candidate.inbox for each row execute function research_revocation_candidate.synthetic_consumer_gate()`);
   reverseConsumer=applyRevocationPage(db,reverseSeed.registration,reverseBytes,sign(null,reverseBytes,privateKey).toString('hex'));void reverseConsumer.catch(()=>{});
   const consumerPid=(await waitFor("select pid from pg_locks where locktype='advisory' and classid=714 and objid=$1 and objsubid=2 and not granted",[gateKey])).pid;
   reverseCommit=store.commitEvaluationResult(reverseBody);void reverseCommit.catch(()=>{});
   const commitWaiter=await waitFor(`select w.pid from pg_locks h join pg_locks w on h.locktype=w.locktype and h.database=w.database and h.classid=w.classid and h.objid=w.objid and h.objsubid=w.objsubid
    where h.pid=$1 and h.locktype='advisory' and h.objsubid=1 and h.granted and not w.granted
    and h.classid::bigint=((hashtextextended($2,0)>>32)&4294967295) and h.objid::bigint=(hashtextextended($2,0)&4294967295)`,[consumerPid,actor.userId]);
   assert.notEqual(commitWaiter.pid,consumerPid);
   assert.equal((await db.query('select wait_event_type from pg_stat_activity where pid=$1',[consumerPid])).rows[0].wait_event_type,'Lock');
   await reverseGate.query('commit');await reverseConsumer;
   await assert.rejects(reverseCommit,e=>e instanceof Error&&e.cause==='binding_revoked');
   assert.deepEqual(await storeSnapshot(),reverseBefore);
   assert.equal((await db.query('select cursor::text from research_revocation_candidate.feed where feed_id=$1',[reverseSeed.feedId])).rows[0].cursor,'1');
   assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.inbox where feed_id=$1',[reverseSeed.feedId])).rows[0].n,1);
   assert.equal((await db.query('select revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[actor.userId,reverseSeed.t.binding.approvedPayloadHash])).rows[0].revoked,true);
  }catch(error){reverseFailure=error;}finally{
   await cleanupGate(reverseGate,[reverseConsumer,reverseCommit],db,'drop trigger if exists synthetic_consumer_gate on research_revocation_candidate.inbox; drop function if exists research_revocation_candidate.synthetic_consumer_gate()',reverseFailure);
  }
  // Independently issue and approve each grant; never shorten only the
  // trusted binding after the source pack has already been signed/approved.
  for(const expiresDuringWork of [false,true]){
   const template=testPack(actor.userId),config=structuredClone(template.config);
   config.grant.valid_until=(await db.query(`select clock_timestamp()+interval '${expiresDuringWork?'8':'60'} seconds' as t`)).rows[0].t.toISOString();
   const short=testPack(actor.userId,{sourceId:template.sourceId,scope:template.scope,config}),shortFeed=randomUUID();
   const expected={feedId:shortFeed,scope:short.scope,sourceId:short.sourceId,grantId:short.config.grant.grant_id,grantVersion:1};
   short.pack.manifest.extensions['pa.revocation_reference']={protocol_version:'pa-grant-reference/v1',feed_id:shortFeed,owner_scope:short.scope,source_id:short.sourceId,grant_id:expected.grantId,grant_version:1,observed_at:short.version.ingested_at,revocation_seq_at_export:'0'};
   short.pack.files['manifest.json']=canonicalize(short.pack.manifest);short.binding.approvedManifestHash=digest(short.pack.manifest);
   await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,short.binding.approvedPayloadHash,short.binding]);
   await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[shortFeed,actor.userId,short.scope.user_id]);
   const shortPage=Buffer.from(JSON.stringify({protocol_version:'pa-revocation/v1',feed_id:shortFeed,owner_scope:short.scope,from_seq:'0',through_seq:'0',latest_seq:'0',published_at:new Date().toISOString(),events:[]}));
   await applyRevocationPage(db,{feedId:shortFeed,localOwner:actor.userId,scope:short.scope,key:publicKey},shortPage,sign(null,shortPage,privateKey).toString('hex'));
   const raw=JSON.stringify(short.pack);await registerCandidateReference(db,actor.userId,short.binding.approvedPayloadHash,raw,expected);
   const imported=await POST(new Request(origin+'/api/research/s4/candidates',{method:'POST',headers:{host:'127.0.0.1:3199',origin,cookie,'content-type':'application/json'},body:raw}));assert.equal(imported.status,200);
   const candidateId=(await imported.json()).id;
   const persisted=(await db.query('select imported from public.research_s4_candidates where user_id=$1 and id=$2',[actor.userId,candidateId])).rows[0].imported;
   assert.equal(persisted.grant.valid_until,config.grant.valid_until);assert.equal(short.binding.trustedConfig.grant.valid_until,config.grant.valid_until);
   assert.equal(digest(short.pack.manifest),short.binding.approvedManifestHash);assert.equal(short.pack.manifest.payload_digest,short.binding.approvedPayloadHash);
   const cards=await revealRegisteredCards(actor,candidateId,{requestKey:randomUUID(),judgment:'Synthetic expiry fixture',alreadySeen:[],independentJudgment:false});
   const decision=await submitRegisteredDecision(actor,candidateId,{requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic expiry only',cardId:cards.cards[0].id,labelId:cards.labelId,exposureId:cards.exposureId,securityTicker:'PAIRTEST',companyEntityId:null,newObservation:true,reviewAt:null});
   const oid=decision.observationId!,observation=(await store.readObservation(oid)).observation;
   for(const security of [observation.securities[0],benchmarkIdentity(true)])await freezeMarket(actor,oid,syntheticMapping(security),'synthetic');
   const prep=await prepareRegisteredEvaluation(actor,oid),input=await prepareRegisteredInput(actor,oid,prep.marketIds,prep.asOf),body=makeCommit(input,randomUUID(),prep.revision);
   const trustSnapshot=async()=>({binding:(await db.query('select * from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[actor.userId,short.binding.approvedPayloadHash])).rows,feed:(await db.query('select * from research_revocation_candidate.feed where feed_id=$1',[shortFeed])).rows,mapping:(await db.query('select * from research_revocation_candidate.binding_map where feed_id=$1',[shortFeed])).rows,inbox:(await db.query('select * from research_revocation_candidate.inbox where feed_id=$1',[shortFeed])).rows,candidate:(await db.query('select * from public.research_s4_candidates where user_id=$1 and id=$2',[actor.userId,candidateId])).rows});
   const before=await storeSnapshot(),trustBefore=await trustSnapshot();
   const witnessTables=['research_s6_evaluations','research_s4_observation_state','research_s4_records','research_s4_outbox'];
   await db.query(`create function public.synthetic_grant_write_witness() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin perform nextval(('research_revocation_candidate.synthetic_witness_'||TG_TABLE_NAME)::regclass); return new; end $$`);
   for(const table of witnessTables){await db.query('create sequence research_revocation_candidate.synthetic_witness_'+table);await db.query('create trigger synthetic_grant_write_witness after '+(table==='research_s4_observation_state'?'update':'insert')+' on public.'+table+' for each row execute function public.synthetic_grant_write_witness()');}

   await db.query(`create function public.synthetic_grant_expiry_delay() returns trigger language plpgsql as $$ begin if '${config.grant.valid_until}'::timestamptz-clock_timestamp()<=interval '0.5 seconds' then raise exception 'grant_setup_overrun'; end if; perform pg_sleep(9); return new; end $$; create trigger synthetic_grant_expiry_delay before insert on public.research_s6_evaluations for each row execute function public.synthetic_grant_expiry_delay()`);
   try{
    const started=performance.now();
    if(expiresDuringWork){await assert.rejects(store.commitEvaluationResult(body),e=>e instanceof Error&&e.cause==='grant_expired');assert.deepEqual(await storeSnapshot(),before);}
    else{const receipt=await store.commitEvaluationResult(body);assert.equal(receipt.status,'accepted');assert.equal(receipt.revision,prep.revision+1);
     assert.equal((await db.query('select count(*)::int n from public.research_s6_evaluations where user_id=$1 and id=$2',[actor.userId,receipt.evaluation_ref])).rows[0].n,1);
     assert.equal((await db.query('select revision from public.research_s4_observation_state where user_id=$1 and observation_id=$2',[actor.userId,oid])).rows[0].revision,receipt.revision);
     assert.equal((await db.query("select count(*)::int n from public.research_s4_records r join public.research_s4_outbox o on o.user_id=r.user_id and o.record_id=r.id where r.user_id=$1 and r.kind='ControlEvent' and r.payload->>'type'='evaluation.append' and r.payload->>'evaluation_ref'=$2",[actor.userId,receipt.evaluation_ref])).rows[0].n,1);
    }
    for(const table of witnessTables){const witness=(await db.query('select last_value::text,is_called from research_revocation_candidate.synthetic_witness_'+table)).rows[0];assert.deepEqual(witness,{last_value:'1',is_called:true});}
    assert.ok(performance.now()-started>=8900);
    assert.deepEqual(await trustSnapshot(),trustBefore);
   }finally{await db.query('drop trigger synthetic_grant_expiry_delay on public.research_s6_evaluations; drop function public.synthetic_grant_expiry_delay()');for(const table of witnessTables)await db.query('drop trigger synthetic_grant_write_witness on public.'+table+'; drop sequence research_revocation_candidate.synthetic_witness_'+table);await db.query('drop function public.synthetic_grant_write_witness()');}
  }
  console.log('Registered list acceptance passed: microsecond pagination, bounds, two feeds, stale/tombstone/pruning fail closed.');
 }catch(e){primary=e;throw e;}finally{try{await closeS4Pool();await db.end();}finally{stopLocalDatabase(state,primary);}}
}
void main().catch(e=>{console.error(e instanceof Error?e.message:'list test failed');process.exitCode=1;});
