import {fenceEvaluationIntents} from './intent-fence';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {createServer,request as httpRequest,type Server} from 'node:http';
import {Pool} from 'pg';
import {registerCandidateReference} from '../revocation/register';
import {applyRevocationPage} from '../revocation/consumer';
import {canonicalize} from '../ingest/pa-v1/json.js';
import {resolveEvaluationIntent} from './intent';
import {testPack} from '../../../../scripts/s4/test-pack';
import {importCandidate} from '../s4/import';
import {revealRegisteredCards,revealCards} from '../s4/cards';
import {submitRegisteredDecision,submitDecision} from '../s4/decisions';
import {closeS4Pool,transaction} from '../s4/db';
import {digest,evaluateObservation} from 'dsh-trade-strategy-evaluator/engine';
import {createS6Store,createRegisteredS6Store,prepareInput,prepareEvaluation,makeCommit,tokenHash,currentMarketIds,cancelledEvaluationIntent} from './store';
import {createEvaluationHttpClient} from 'dsh-trade-strategy-evaluator/adapters';
// @ts-expect-error Fixed S5 conformance export has no bundled declaration.
import {assertEvaluationStoreConformance} from 'dsh-trade-strategy-evaluator/conformance';
import {evaluatorRpc} from './http';
import {freezeMarket,freezeMarketHandoff,benchmarkIdentity} from './market';
import {prepareRegisteredEvaluationDisplay,observationReport} from './report';
import {syntheticMapping} from '../../../../scripts/s6/fixtures';
import {runRelFixture} from './shadow';
import {runRelReadiness,settleRelFixture,releaseRelReservation,type RelFixtureAdapter} from './rel-readiness';

describe.skipIf(!process.env.S4_TEST_STATE)('S6 authoritative PostgreSQL store',()=>{
 let admin:Pool,id:string,candidate:string,body:ReturnType<typeof makeCommit>,server:Server,origin:string,token:string,feedId:string,applySignedRevocation:()=>Promise<unknown>;
 const actor={userId:randomUUID(),kind:'agent' as const},other={userId:randomUUID(),kind:'agent' as const};
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  Object.assign(process.env,{ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl});
  admin=new Pool({connectionString:state.adminUrl});
  for(const a of [actor,other]){await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,a.userId+'@example.test']);await admin.query("update profiles set role='admin' where id=$1",[a.userId]);}
  await admin.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('S6SYNTH','Synthetic S6','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
  // Isolated candidate schema and operator approval; no production provisioning.
  await admin.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  await admin.query('grant usage on schema research_revocation_candidate to alpha_s4_runtime; grant select on all tables in schema research_revocation_candidate to alpha_s4_runtime');
  const p=testPack(actor.userId);feedId=randomUUID();
  const expected={feedId,scope:p.scope,sourceId:p.sourceId,grantId:p.config.grant.grant_id,grantVersion:1};
  p.pack.manifest.extensions['pa.revocation_reference']={protocol_version:'pa-grant-reference/v1',feed_id:feedId,owner_scope:p.scope,source_id:p.sourceId,grant_id:expected.grantId,grant_version:1,observed_at:p.version.ingested_at,revocation_seq_at_export:'0'};
  p.pack.files['manifest.json']=canonicalize(p.pack.manifest);p.binding.approvedManifestHash=digest(p.pack.manifest);
  await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,p.binding.approvedPayloadHash,p.binding]);
  await admin.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[feedId,actor.userId,p.scope.user_id]);
  const keys=generateKeyPairSync('ed25519'),raw=Buffer.from(JSON.stringify({protocol_version:'pa-revocation/v1',feed_id:feedId,owner_scope:p.scope,from_seq:'0',through_seq:'0',latest_seq:'0',published_at:new Date().toISOString(),events:[]}));
  await applyRevocationPage(admin,{feedId,localOwner:actor.userId,scope:p.scope,key:keys.publicKey},raw,sign(null,raw,keys.privateKey).toString('hex'));
  await registerCandidateReference(admin,actor.userId,p.binding.approvedPayloadHash,JSON.stringify(p.pack),expected);
  applySignedRevocation=async()=>{
   const at=(await admin.query('select clock_timestamp() as now')).rows[0].now.toISOString();
   const bytes=Buffer.from(JSON.stringify({protocol_version:'pa-revocation/v1',feed_id:feedId,owner_scope:p.scope,from_seq:'0',through_seq:'1',latest_seq:'1',published_at:at,events:[{revocation_id:randomUUID(),monotonic_seq:'1',source_id:p.sourceId,grant_id:expected.grantId,grant_version:1,effective_at:at}]}));
   return applyRevocationPage(admin,{feedId,localOwner:actor.userId,scope:p.scope,key:keys.publicKey},bytes,sign(null,bytes,keys.privateKey).toString('hex'));
  };
  candidate=(await importCandidate(actor,JSON.stringify(p.pack))).id;
  const r=await revealCards(actor,candidate,{requestKey:randomUUID(),judgment:'Synthetic S6 only',alreadySeen:[],independentJudgment:false});
  id=(await submitDecision(actor,candidate,{requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic integration',cardId:r.cards[0].id,labelId:r.labelId,exposureId:r.exposureId,securityTicker:'S6SYNTH',companyEntityId:null,newObservation:true,reviewAt:null})).observationId!;
  const observation=(await createS6Store(actor).readObservation(id)).observation;
  // E3b: new registrations are alpha-observation-contract/2.0 with a listing MIC; SPY is the ARCX benchmark.
  expect(observation.schema_version).toBe('alpha-observation-contract/2.0');
  expect(observation.securities[0]).toMatchObject({ticker:'S6SYNTH',listing_mic:'XNYS',currency:'USD',synthetic:true});
  expect(observation.market_policy_version).toBe('market-policy/2.0');
  const marketIds=[];
  for(const security of [observation.securities[0],benchmarkIdentity(true)]){
   const mapping=syntheticMapping(security),frozen=await freezeMarket(actor,id,mapping,'synthetic');marketIds.push(frozen.id);
   expect((await freezeMarket(actor,id,mapping,'synthetic')).duplicate).toBe(true);
   await expect(freezeMarket(actor,id,{...mapping,evidence:{...mapping.evidence,raw_sha256:'0'.repeat(64)}},'synthetic')).rejects.toMatchObject({code:'hash_mismatch'});
  }
  body=makeCommit(await prepareInput(actor,id,marketIds,new Date().toISOString()),'synthetic-conformance',0);
  token=actor.userId+'.'+randomBytes(32).toString('hex');
  await admin.query("insert into research_s6_sessions(user_id,token_hash,subject,audience,scopes,expires_at,revoked) values($1,$2,'synthetic-http','alpha-evaluator',$3,clock_timestamp()+interval '1 hour',false)",[actor.userId,tokenHash(token),['observation:read','evaluation:append']]);
  server=createServer(async(req,res)=>{
   try{
    const parts=[];for await(const part of req)parts.push(part);
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
    const request=new Request(origin+req.url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})});
    const path=req.url!.split('/');const response=await evaluatorRpc(request,req.method==='POST'?'commit':path.includes('observations')?'observation':'market',path.at(-1));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
   }catch{res.writeHead(500);res.end();}
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+(server.address() as {port:number}).port;process.env.ALPHA_S4_ORIGIN=origin;
 });
 afterAll(async()=>{await new Promise<void>(r=>server?.close(()=>r()));await closeS4Pool();await admin?.end();});
 function remote(t=token){return createEvaluationHttpClient({baseUrl:origin,ownerScope:{user_id:actor.userId,workspace_id:null},tokenProvider:async()=>t});}
 async function counts(){return (await admin.query(`select (select count(*) from research_s6_evaluations where user_id=$1) results,(select count(*) from research_s4_outbox where user_id=$1) outbox,(select count(*) from research_audit_log where user_id=$1) audit`,[actor.userId])).rows[0];}
 it('recomputes pending observation, commits once and preserves the frozen registration',async()=>{
  const store=remote(),before=await store.readObservation(id);
  const proof=await assertEvaluationStoreConformance({store,input:body.input});expect(proof.passed).toBe(true);
  const accepted=proof.commit_receipt;expect(accepted.status).toBe('accepted');
  const n=await counts();const retry=await store.commitEvaluationResult(body);expect(retry.status).toBe('duplicate');expect(retry.evaluation_ref).toBe(accepted.evaluation_ref);expect(await counts()).toEqual(n);
  const after=await store.readObservation(id);expect(after.observation).toEqual(before.observation);expect(after.revision).toBe(1);
  expect(body.result.status).toBe('pending_start');
  await expect(store.commitEvaluationResult({...body,expected_revision:1})).rejects.toMatchObject({code:'idempotency_conflict'});
 });
 it('resolves committed keys and persists cancellation before rejecting a late commit',async()=>{
  const before=await counts();const resolved=await resolveEvaluationIntent(actor,id,body.idempotency_key);
  expect(resolved.status).toBe('committed');expect(await counts()).toEqual(before);
  const key=randomUUID(),late=makeCommit(body.input,key,1);
  await expect(resolveEvaluationIntent(other,id,key)).rejects.toMatchObject({code:'not_found'});
  expect(await resolveEvaluationIntent(actor,id,key)).toEqual({status:'cancelled',key});
  await expect(transaction(actor,db=>cancelledEvaluationIntent(db,actor,randomUUID(),key,candidate))).rejects.toMatchObject({code:'idempotency_conflict'});
  const cancelled=await counts();expect(Number(cancelled.results)).toBe(Number(before.results));
  expect(Number(cancelled.audit)).toBe(Number(before.audit)+1);expect(Number(cancelled.outbox)).toBe(Number(before.outbox)+1);
  expect(await resolveEvaluationIntent(actor,id,key)).toEqual({status:'cancelled',key});expect(await counts()).toEqual(cancelled);
  const persisted=(await admin.query("select * from research_s4_records where user_id=$1 and payload->>'type'='evaluation.intent_cancel' and payload->>'idempotency_key'=$2",[actor.userId,key])).rows[0];
  const insert=(payload:Record<string,unknown>)=>admin.query('insert into research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash) values($1,$2,$3,$4,$5,$6)',[actor.userId,randomUUID(),candidate,'ControlEvent',payload,digest(payload)]);
  await expect(insert(persisted.payload)).rejects.toMatchObject({code:'23505',constraint:'research_s6_intent_cancel_owner_key'});
  await expect(insert({...persisted.payload,observation_ref:randomUUID()})).rejects.toMatchObject({code:'23505',constraint:'research_s6_intent_cancel_owner_key'});
  for(const field of ['idempotency_key','observation_ref','actor_ref','actor_kind']){
   const missing={...persisted.payload,idempotency_key:randomUUID()};delete missing[field];
   await expect(insert(missing)).rejects.toMatchObject({code:'23514',constraint:'research_s6_intent_cancel_shape'});
   await expect(insert({...persisted.payload,idempotency_key:randomUUID(),[field]:null})).rejects.toMatchObject({code:'23514',constraint:'research_s6_intent_cancel_shape'});
  }
  await expect(insert({...persisted.payload,idempotency_key:randomUUID(),actor_ref:other.userId})).rejects.toMatchObject({code:'23514'});
  expect(await counts()).toEqual(cancelled);

  for(const patch of [{idempotency_key:123},{observation_ref:[]},{observation_ref:{}},{observation_ref:id.toUpperCase()},{idempotency_key:''},{idempotency_key:'x'.repeat(129)},{actor_kind:'system'}])
   await expect(insert({...persisted.payload,idempotency_key:randomUUID(),...patch})).rejects.toMatchObject({code:'23514'});
  await expect(admin.query("update research_s4_records set payload=jsonb_set(payload,'{type}','\"other\"') where user_id=$1 and id=$2",[actor.userId,persisted.id])).rejects.toThrow('immutable_record');
  await expect(admin.query('delete from research_s4_records where user_id=$1 and id=$2',[actor.userId,persisted.id])).rejects.toThrow('immutable_record');
  await expect(transaction(actor,db=>db.query('truncate research_s4_records'))).rejects.toMatchObject({code:'42501'});
  await expect(remote().commitEvaluationResult(late)).rejects.toMatchObject({code:'policy_blocked'});
  await expect(createS6Store(actor).commitEvaluationResult(late)).rejects.toMatchObject({code:'evaluation_intent_cancelled'});
  expect(await counts()).toEqual(cancelled);
 });
 it.each(['valid','missing','kind','duplicate'])('rehearses cancellation upgrade against legacy %s history atomically',async mode=>{
  const db=await admin.connect();
  try{
   await db.query('begin');
   await db.query('drop index research_s6_intent_cancel_owner_key;alter table research_s4_records drop constraint research_s6_intent_cancel_shape');
   const row=(await db.query("select * from research_s4_records where user_id=$1 and payload->>'type'='evaluation.intent_cancel' limit 1",[actor.userId])).rows[0];
   if(mode!=='valid'){
    const payload={...row.payload};if(mode==='missing')delete payload.observation_ref;if(mode==='kind')payload.actor_kind='system';
    if(mode==='duplicate')payload.observation_ref=randomUUID();else payload.idempotency_key=randomUUID();
    await db.query('insert into research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash) values($1,$2,$3,$4,$5,$6)',[actor.userId,randomUUID(),candidate,'ControlEvent',payload,digest(payload)]);
   }
   const snapshot=async()=> (await db.query("select id,payload,payload_hash from research_s4_records where user_id=$1 order by id",[actor.userId])).rows;
   const preflight=readFileSync('scripts/s6/cancellation-preflight.sql','utf8').replace(/^begin read only;$/m,'').replace(/^rollback;$/m,'');
   const reports=await db.query(preflight) as unknown as Array<{command:string;rows:Array<{invalid_shape:boolean;duplicate_key:boolean}>}>;
   const issues=reports.filter(r=>r.command==='SELECT')[0].rows;
   expect(issues).toHaveLength(mode==='valid'?0:mode==='duplicate'?2:1);
   if(mode!=='valid')expect(issues.every(r=>mode==='duplicate'?r.duplicate_key:r.invalid_shape)).toBe(true);
   const before=await snapshot();await db.query('savepoint legacy');
   // Run exact DDL inside a savepoint to preserve the intentionally bad pre-state
   // for inspection; outer rollback restores the shared disposable test schema.
   const ddl=readFileSync('supabase/migrations/20261005165000_evaluation_intent_cancel.sql','utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,'');
   if(mode==='valid')await db.query(ddl);
   else{await expect(db.query(ddl)).rejects.toMatchObject({code:mode==='duplicate'?'23505':'23514'});await db.query('rollback to savepoint legacy');}
   expect(await snapshot()).toEqual(before);
   const schema=(await db.query("select exists(select 1 from pg_constraint where conname='research_s6_intent_cancel_shape') as shape,to_regclass('public.research_s6_intent_cancel_owner_key') is not null as idx")).rows[0];
   expect(schema).toEqual({shape:mode==='valid',idx:mode==='valid'});
  }finally{try{await db.query('rollback');}finally{db.release(true);}}
 });
 it.each(['valid','missing','null','string','fraction','negative','overflow','gap','duplicate','request_key_number','request_key_format','observation_upper','actor_ref_foreign','actor_kind_system'])('rehearses fence constraint over legacy %s history',async mode=>{
  const db=await admin.connect();
  try{
   await db.query('begin');await db.query('drop index research_s6_intent_fence_owner_key;alter table research_s4_records drop constraint research_s6_intent_fence_shape');
   const payload:Record<string,unknown>={type:'evaluation.intent_fence',observation_ref:id,request_key:randomUUID(),previous_revision:1,revision:2,actor_ref:actor.userId,actor_kind:'agent'};
   if(mode==='missing')delete payload.previous_revision;if(mode==='null')payload.revision=null;if(mode==='string')payload.revision='2';
   if(mode==='fraction')payload.revision=2.5;if(mode==='negative')payload.previous_revision=-1;
   if(mode==='overflow'){payload.previous_revision=2147483647;payload.revision=2147483648;}if(mode==='gap')payload.revision=3;
   if(mode==='request_key_number')payload.request_key=123;if(mode==='request_key_format')payload.request_key='bad.key';
   if(mode==='observation_upper')payload.observation_ref=id.toUpperCase();if(mode==='actor_ref_foreign')payload.actor_ref=other.userId;if(mode==='actor_kind_system')payload.actor_kind='system';
   const insert=async(value:Record<string,unknown>)=>db.query('insert into research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash) values($1,$2,$3,$4,$5,$6)',[actor.userId,randomUUID(),candidate,'ControlEvent',value,digest(value)]);
   await insert(payload);if(mode==='duplicate')await insert({...payload,observation_ref:randomUUID()});
   const before=(await db.query("select id,payload,payload_hash from research_s4_records where user_id=$1 order by id",[actor.userId])).rows;
   const preflight=readFileSync('scripts/s6/fence-preflight.sql','utf8').replace(/^begin read only;$/m,'').replace(/^rollback;$/m,'');
   const reports=await db.query(preflight) as unknown as Array<{command:string;rows:Array<{invalid_shape:boolean;duplicate_key:boolean}>}>;
   const issues=reports.filter(r=>r.command==='SELECT')[0].rows;expect(issues).toHaveLength(mode==='valid'?0:mode==='duplicate'?2:1);
   if(mode!=='valid')expect(issues.every(r=>mode==='duplicate'?r.duplicate_key:r.invalid_shape)).toBe(true);
   await db.query('savepoint legacy');
   const ddl=readFileSync('supabase/migrations/20261005175000_evaluation_intent_fence.sql','utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,'');
   if(mode==='valid')await db.query(ddl);
   else{await expect(db.query(ddl)).rejects.toMatchObject({code:mode==='duplicate'?'23505':'23514',constraint:mode==='duplicate'?'research_s6_intent_fence_owner_key':'research_s6_intent_fence_shape'});await db.query('rollback to savepoint legacy');}
   expect((await db.query("select id,payload,payload_hash from research_s4_records where user_id=$1 order by id",[actor.userId])).rows).toEqual(before);
   expect((await db.query("select exists(select 1 from pg_constraint where conname='research_s6_intent_fence_shape') as shape,to_regclass('public.research_s6_intent_fence_owner_key') is not null as idx")).rows[0]).toEqual({shape:mode==='valid',idx:mode==='valid'});
   if(mode==='valid'){await db.query('savepoint live');await expect(insert({...payload,request_key:'bad.key'})).rejects.toMatchObject({code:'23514',constraint:'research_s6_intent_fence_shape'});await db.query('rollback to savepoint live');}
  }finally{try{await db.query('rollback');}finally{db.release(true);}}
 });
 it.each(['cancellation','fence'])('preflight %s refuses RLS-filtered runtime visibility',async name=>{
  const sql=readFileSync('scripts/s6/'+name+'-preflight.sql','utf8').replace(/^begin read only;$/m,'').replace(/^rollback;$/m,'');
  await expect(transaction(actor,db=>db.query(sql))).rejects.toMatchObject({code:'42501'});
 });
 it.each([['cancel-first',false],['commit-first',false],['cancel-first',true],['commit-first',true]] as const)('serializes queued intent resolution: %s fence=%s',async(order,fence)=>{
  const actor={userId:randomUUID(),kind:'agent' as const};
  await admin.query('insert into auth.users(id,email) values($1,$2)',[actor.userId,actor.userId+'@example.test']);
  await admin.query("update profiles set role='admin' where id=$1",[actor.userId]);
  const p=testPack(actor.userId);const feedId=randomUUID();
  const expected={feedId,scope:p.scope,sourceId:p.sourceId,grantId:p.config.grant.grant_id,grantVersion:1};
  p.pack.manifest.extensions['pa.revocation_reference']={protocol_version:'pa-grant-reference/v1',feed_id:feedId,owner_scope:p.scope,source_id:p.sourceId,grant_id:expected.grantId,grant_version:1,observed_at:p.version.ingested_at,revocation_seq_at_export:'0'};
  p.pack.files['manifest.json']=canonicalize(p.pack.manifest);p.binding.approvedManifestHash=digest(p.pack.manifest);
  await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,p.binding.approvedPayloadHash,p.binding]);
  await admin.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[feedId,actor.userId,p.scope.user_id]);
  const keys=generateKeyPairSync('ed25519'),raw=Buffer.from(JSON.stringify({protocol_version:'pa-revocation/v1',feed_id:feedId,owner_scope:p.scope,from_seq:'0',through_seq:'0',latest_seq:'0',published_at:new Date().toISOString(),events:[]}));
  await applyRevocationPage(admin,{feedId,localOwner:actor.userId,scope:p.scope,key:keys.publicKey},raw,sign(null,raw,keys.privateKey).toString('hex'));
  await registerCandidateReference(admin,actor.userId,p.binding.approvedPayloadHash,JSON.stringify(p.pack),expected);
  const candidate=(await importCandidate(actor,JSON.stringify(p.pack))).id;
  const r=await revealCards(actor,candidate,{requestKey:randomUUID(),judgment:'Synthetic S6 only',alreadySeen:[],independentJudgment:false});
  const id=(await submitDecision(actor,candidate,{requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic integration',cardId:r.cards[0].id,labelId:r.labelId,exposureId:r.exposureId,securityTicker:'S6SYNTH',companyEntityId:null,newObservation:true,reviewAt:null})).observationId!;
  const key=order==='cancel-first'?'a':'a.b:c',store=createRegisteredS6Store(actor);
  const commit=makeCommit(await prepareInput(actor,id,[],new Date().toISOString()),key,0);
  const before=async()=> (await admin.query(`select (select count(*) from research_s6_evaluations where user_id=$1) results,
   (select count(*) from research_s4_records where user_id=$1 and payload->>'type'='evaluation.intent_cancel') cancels,
   (select count(*) from research_s4_outbox where user_id=$1) outbox,(select count(*) from research_audit_log where user_id=$1) audit`,[actor.userId])).rows[0];
  const baseline=await before(),type=order==='cancel-first'?(fence?'evaluation.intent_fence':'evaluation.intent_cancel'):'evaluation.append';
  const gate=await admin.connect(),gateName='s6_intent_'+randomUUID().replaceAll('-','');let released=false,primary:unknown,created=false;
  const pids:number[]=[];let earlyError:unknown;
  let first:Promise<unknown>|undefined,second:Promise<unknown>|undefined;
  const waitFor=async(query:string,values:unknown[])=>{const deadline=performance.now()+3000;while(performance.now()<deadline){if(earlyError)throw earlyError;const r=await admin.query(query,values);if(r.rowCount){expect(r.rowCount).toBe(1);return r.rows[0];}await new Promise(r=>setTimeout(r,10));}throw Error('synthetic intent lock witness missing');};
  const recoveryKey=randomUUID();
  const resolve=()=>fence?fenceEvaluationIntents(actor,id,recoveryKey):resolveEvaluationIntent(actor,id,key),write=()=>store.commitEvaluationResult(commit);
  try{
  await admin.query(`create function ${gateName}() returns trigger language plpgsql as $$ begin
   if current_setting('transaction_isolation')<>'read committed' then raise exception 'unsafe isolation';end if;
   if new.user_id='${actor.userId}'::uuid and new.kind='ControlEvent' and new.payload->>'type'='${type}' then perform pg_advisory_xact_lock(74322,1);end if;return new;end $$;
   create trigger ${gateName} before insert on research_s4_records for each row execute function ${gateName}()`);
   created=true;
   await gate.query('begin');await gate.query('select pg_advisory_xact_lock(74322,1)');
   first=order==='cancel-first'?resolve():write();void first.catch(error=>{earlyError=error;});
   const blocked=await waitFor("select w.pid from pg_locks w join pg_stat_activity a on a.pid=w.pid where w.locktype='advisory' and w.classid=74322 and w.objid=1 and w.objsubid=2 and not w.granted and a.application_name='alpha-s4'",[]);
   pids.push(blocked.pid);
   second=order==='cancel-first'?write():resolve();void second.catch(()=>{});
   const queued=await waitFor(`select w.pid from pg_locks h join pg_locks w on h.locktype=w.locktype and h.database=w.database and h.classid=w.classid and h.objid=w.objid and h.objsubid=w.objsubid
    join pg_stat_activity a on a.pid=w.pid
    where h.pid=$1 and h.locktype='advisory' and h.granted and not w.granted and h.objsubid=1 and a.application_name='alpha-s4' and a.wait_event_type='Lock'
    and h.classid=((hashtextextended($2,0)>>32)&4294967295)::oid and h.objid=(hashtextextended($2,0)&4294967295)::oid`,[blocked.pid,actor.userId]);
   expect(queued.pid).not.toBe(blocked.pid);pids.push(queued.pid);
   await gate.query('commit');released=true;
   if(order==='cancel-first'){
    if(fence)expect(await first).toMatchObject({status:'fenced',key:recoveryKey,revision:1});else expect(await first).toEqual({status:'cancelled',key});
    await expect(second).rejects.toMatchObject({code:fence?'revision_conflict':'evaluation_intent_cancelled'});
   }else{
    const receipt=await first as {evaluation_ref:string;status:string};expect(receipt.status).toBe('accepted');
    if(fence)expect(await second).toMatchObject({status:'fenced',key:recoveryKey,revision:2});else expect(await second).toEqual({status:'committed',key,evaluationId:receipt.evaluation_ref});
   }
   expect((await admin.query('select revision from research_s4_observation_state where user_id=$1 and observation_id=$2',[actor.userId,id])).rows[0].revision).toBe((order==='cancel-first'?0:1)+(fence?1:0));
   const after=await before();expect(Number(after.results)).toBe(order==='cancel-first'?0:1);expect(Number(after.cancels)).toBe(order==='cancel-first'&&!fence?1:0);
   expect(Number(after.audit)).toBe(Number(baseline.audit)+(fence&&order==='commit-first'?2:1));expect(Number(after.outbox)).toBe(Number(baseline.outbox)+(fence&&order==='commit-first'?2:1));
   expect((await resolve()).status).toBe(fence?'fenced':order==='cancel-first'?'cancelled':'committed');
   if(order==='cancel-first')await expect(write()).rejects.toMatchObject({code:fence?'revision_conflict':'evaluation_intent_cancelled'});
   else expect((await write()).status).toBe('duplicate');
   expect(await before()).toEqual(after);
   if(fence){
    await expect(fenceEvaluationIntents(other,id,recoveryKey)).rejects.toMatchObject({code:'not_found'});
    const revision=order==='cancel-first'?1:2;
    const later=await store.commitEvaluationResult(makeCommit(commit.input,randomUUID(),revision));expect(later.revision).toBe(revision+1);
    const checkpoint=await before();expect(await resolve()).toMatchObject({status:'fenced',revision});expect(await before()).toEqual(checkpoint);
    expect((await store.readObservation(id)).revision).toBe(revision+1);
   }
   if(fence&&order==='cancel-first'){
    const snapshot=async()=>({counts:await before(),revision:(await store.readObservation(id)).revision,requests:(await admin.query('select count(*) as n from research_s4_requests where user_id=$1',[actor.userId])).rows[0].n,fences:(await admin.query("select count(*) as n from research_s4_records where user_id=$1 and payload->>'type'='evaluation.intent_fence'",[actor.userId])).rows[0].n});
    for(const table of ['research_s4_outbox','research_s4_requests']){
     const failedKey=randomUUID(),name='s6_fence_fail_'+randomUUID().replaceAll('-','');
     const predicate=table==='research_s4_requests'?"new.request_key='intent-fence:"+failedKey+"'":"exists(select 1 from research_s4_records r where r.user_id=new.user_id and r.id=new.record_id and r.payload->>'type'='evaluation.intent_fence')";
     const original=await snapshot();
     try{
      await admin.query(`create sequence ${name}_hit;grant usage on sequence ${name}_hit to alpha_s4_runtime;create function ${name}() returns trigger language plpgsql as $$ begin if new.user_id='${actor.userId}'::uuid and (${predicate}) then perform nextval('public.${name}_hit');raise exception 'synthetic_fence_failure';end if;return new;end $$;create trigger ${name} before insert on ${table} for each row execute function ${name}()`);
      await expect(fenceEvaluationIntents(actor,id,failedKey)).rejects.toThrow('revocation_access_denied');
      expect((await admin.query(`select is_called from ${name}_hit`)).rows[0].is_called).toBe(true);expect(await snapshot()).toEqual(original);
     }finally{await admin.query(`drop trigger if exists ${name} on ${table};drop function if exists ${name}();drop sequence if exists ${name}_hit`);}
     const recovered=await fenceEvaluationIntents(actor,id,failedKey);expect(recovered.revision).toBe(original.revision+1);
     const completed=await snapshot();expect(Number(completed.fences)).toBe(Number(original.fences)+1);expect(Number(completed.requests)).toBe(Number(original.requests)+1);
     expect(await fenceEvaluationIntents(actor,id,failedKey)).toEqual(recovered);expect(await snapshot()).toEqual(completed);
    }
    for(const bad of ['x'.repeat(7),'x'.repeat(101),'bad.key.test'])await expect(fenceEvaluationIntents(actor,id,bad)).rejects.toMatchObject({code:'invalid_schema'});
    for(const good of ['x'.repeat(8),'x'.repeat(100)])expect((await fenceEvaluationIntents(actor,id,good)).status).toBe('fenced');
    // A receipt-key collision is a visible conflict, never an overwrite/refence.
    const collision='collision-key';await admin.query('insert into research_s4_requests(user_id,request_key,request_hash,response) values($1,$2,$3,$4)',[actor.userId,'intent-fence:'+collision,digest({other:'synthetic'}),{}]);
    const checkpoint=await snapshot();await expect(fenceEvaluationIntents(actor,id,collision)).rejects.toMatchObject({code:'idempotency_conflict'});expect(await snapshot()).toEqual(checkpoint);
    // Orphan event simulates missing request receipt without deleting history.
    const orphan='orphan-key',payload={type:'evaluation.intent_fence',observation_ref:id,request_key:orphan,previous_revision:0,revision:1,actor_ref:actor.userId,actor_kind:'agent'};
    await admin.query('insert into research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash) values($1,$2,$3,$4,$5,$6)',[actor.userId,randomUUID(),candidate,'ControlEvent',payload,digest(payload)]);
    const orphaned=await snapshot();await expect(fenceEvaluationIntents(actor,id,orphan)).rejects.toMatchObject({code:'hash_mismatch'});expect(await snapshot()).toEqual(orphaned);
    for(const response of [{status:'fenced',key:'malformed-replay',revision:0,recordId:'bad'},{status:'fenced',key:'malformed-replay',revision:1,recordId:'bad'}]){
     const badKey=randomUUID(),request={operation:'evaluation.intent_fence',observationId:id,key:badKey};
     await admin.query('insert into research_s4_requests(user_id,request_key,request_hash,response) values($1,$2,$3,$4)',[actor.userId,'intent-fence:'+badKey,digest(request),{...response,key:badKey}]);
     const beforeBad=await snapshot();await expect(fenceEvaluationIntents(actor,id,badKey)).rejects.toMatchObject({code:'hash_mismatch'});expect(await snapshot()).toEqual(beforeBad);
    }
   }
   if(fence){
    const nextCards=await revealRegisteredCards(actor,candidate,{requestKey:randomUUID(),judgment:'Synthetic recovery namespace test',alreadySeen:[],independentJudgment:false});
    const candidateRevision=(await admin.query('select revision from research_s4_candidates where user_id=$1 and id=$2',[actor.userId,candidate])).rows[0].revision;
    const nextObservation=(await submitRegisteredDecision(actor,candidate,{requestKey:randomUUID(),expectedRevision:candidateRevision,action:'observe',reason:'Synthetic scope test only',cardId:nextCards.cards[0].id,labelId:nextCards.labelId,exposureId:nextCards.exposureId,securityTicker:'S6SYNTH',companyEntityId:null,newObservation:true,reviewAt:null})).observationId!;
    expect(nextObservation).not.toBe(id);
    const scoped=await before();await expect(fenceEvaluationIntents(actor,nextObservation,recoveryKey)).rejects.toMatchObject({code:'idempotency_conflict'});expect(await before()).toEqual(scoped);
   }
   // Both isolated owners may cancel the same key: namespace is not global.
   expect(await resolveEvaluationIntent(actor,id,'shared-cancel-key')).toEqual({status:'cancelled',key:'shared-cancel-key'});
   if(order==='commit-first'&&!fence){
    const short=await store.commitEvaluationResult(makeCommit(commit.input,'a',1));
    expect(await resolveEvaluationIntent(actor,id,'a')).toEqual({status:'committed',key:'a',evaluationId:short.evaluation_ref});
   }
  }catch(error){primary=error;throw error;}finally{
   const failures:unknown[]=[];
   try{if(!released)await gate.query('rollback');}catch(error){failures.push(error);}finally{gate.release(true);}
   if(primary&&!released)for(const pid of pids)try{await admin.query('select pg_terminate_backend($1)',[pid]);}catch(error){failures.push(error);}
   // Runtime statements are bounded to 15s by researchConfig; gate is released first.
   await Promise.allSettled([first,second].filter((v):v is Promise<unknown>=>v!==undefined));
   try{if(created)await admin.query(`drop trigger ${gateName} on research_s4_records;drop function ${gateName}()`);}catch(error){failures.push(error);}
   if(failures.length&&!primary)throw new AggregateError(failures,'synthetic intent cleanup failed');
  }
 },45000);
 it('records RPC material disclosures and rejects stale/revoked access including exact commit retry',async()=>{
  const readExposure=async()=> (await admin.query("select payload from research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'origin' like 'alpha_evaluator_%'",[actor.userId])).rows;
  const before=await readExposure();await remote().readObservation(id);
  for(const m of body.market_snapshot_refs)await remote().readMarketSnapshot(m.id);
  const after=await readExposure();expect(after.length).toBe(before.length+3);
  for(const e of after){expect(e.payload.session_token_hash).toBe(tokenHash(token));expect(JSON.stringify(e.payload)).not.toContain(token);}
  for(const mode of ['stale','revoked']){
   if(mode==='stale')await admin.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '61 seconds' where feed_id=$1",[feedId]);
   else await admin.query('update research_s4_bindings set revoked=true where user_id=$1',[actor.userId]);
   const n=await counts();
   try{
    for(const request of [()=>remote().readObservation(id),()=>remote().readMarketSnapshot(body.market_snapshot_refs[0].id),()=>remote().commitEvaluationResult(body)]){
     await expect(request()).rejects.toMatchObject({status:mode==='stale'?503:403,code:mode==='stale'?'source_unavailable':'policy_blocked'});
    }
    expect(await counts()).toEqual(n);expect((await readExposure()).length).toBe(after.length);
   }finally{await admin.query('update research_revocation_candidate.feed set published_at=clock_timestamp() where feed_id=$1',[feedId]);await admin.query('update research_s4_bindings set revoked=false where user_id=$1',[actor.userId]);}
  }
 });
 it('rejects transport headers and dead sessions on every RPC operation without writes',async()=>{
  const headers={authorization:'Bearer '+token,'x-evaluator-protocol':'evaluator-rpc/1.0'};
  const before=await counts();
  for(const [patch,status] of [[{origin},403],[{'sec-fetch-site':'cross-site'},403],[{host:'localhost:9'},403],[{'x-evaluator-protocol':'wrong'},422]] as Array<[Record<string,string>,number]>){
   // Native fetch may normalize forbidden headers; raw HTTP preserves attack inputs.
   const response=await new Promise<{status:number;cache:string|undefined}>((resolve,reject)=>{
    const request=httpRequest(origin+'/api/evaluator/v1/observations/'+id,{headers:{...headers,...patch}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode!,cache:res.headers['cache-control']}));});
    request.on('error',reject);request.end();
   });
   expect(response.status,JSON.stringify(patch)).toBe(status);expect(response.cache).toBe('no-store');
  }
  const mismatch=await fetch(origin+'/api/evaluator/v1/evaluation-results',{method:'POST',headers:{...headers,'idempotency-key':'different'},body:JSON.stringify(body)});expect(mismatch.status).toBe(422);
  for(const mutation of ["revoked=true","expires_at=clock_timestamp()-interval '1 second'"]){
   await admin.query('update research_s6_sessions set '+mutation+' where user_id=$1',[actor.userId]);
   try{for(const request of [()=>remote().readObservation(id),()=>remote().readMarketSnapshot(body.market_snapshot_refs[0].id),()=>remote().readMarketSnapshot('missing-market'),()=>remote().commitEvaluationResult(body)])await expect(request()).rejects.toMatchObject({status:401,code:'not_authenticated'});}
   finally{await admin.query("update research_s6_sessions set revoked=false,expires_at=created_at+interval '1 hour' where user_id=$1",[actor.userId]);}
  }
  expect(await counts()).toEqual(before);
 });
 it('revalidates server session expiry, revocation, scope and rejects body authority overrides',async()=>{
  await admin.query('update research_s6_sessions set revoked=true where user_id=$1',[actor.userId]);
  await expect(remote().readObservation(id)).rejects.toMatchObject({code:'not_authenticated',status:401});
  await admin.query("update research_s6_sessions set revoked=false,expires_at=clock_timestamp()-interval '1 second' where user_id=$1",[actor.userId]);
  await expect(remote().readObservation(id)).rejects.toMatchObject({code:'not_authenticated'});
  await admin.query("update research_s6_sessions set expires_at=created_at+interval '1 hour',scopes=array['observation:read'] where user_id=$1",[actor.userId]);
  await expect(remote().commitEvaluationResult(body)).rejects.toMatchObject({code:'scope_denied',status:403});
  await admin.query("update research_s6_sessions set scopes=array['observation:read','evaluation:append'] where user_id=$1",[actor.userId]);
  const response=await fetch(origin+'/api/evaluator/v1/evaluation-results',{method:'POST',headers:{authorization:'Bearer '+token,'x-evaluator-protocol':'evaluator-rpc/1.0','idempotency-key':body.idempotency_key},body:JSON.stringify({...body,owner_scope:{user_id:other.userId}})});
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe('scope_denied');
  await expect(remote(other.userId+'.'+token.split('.')[1]).readObservation(id)).rejects.toMatchObject({code:'not_authenticated'});
  for(const prefix of ['-'.repeat(36),randomUUID()])await expect(remote(prefix+'.'+token.split('.')[1]).readObservation(id)).rejects.toMatchObject({code:'not_authenticated',status:401});
 });
 it('rejects forged calculations, rewritten authority, future time and cross-owner requests',async()=>{
  const store=createS6Store(actor),n=await counts();
  const forged=structuredClone(body);forged.result.reason='fabricated';forged.result_sha256=digest(forged.result);
  await expect(store.commitEvaluationResult(forged)).rejects.toMatchObject({code:'hash_mismatch'});
  const substituted=structuredClone(body);substituted.result.reason='fabricated';
  await expect(store.commitEvaluationResult(substituted)).rejects.toMatchObject({code:'hash_mismatch'});
  const fake=structuredClone(body.input);fake.information_set.versions=[];
  await expect(store.commitEvaluationResult(makeCommit(fake,randomUUID(),1))).rejects.toMatchObject({code:'hash_mismatch'});
  await expect(prepareInput(actor,id,[],'2099-01-01T00:00:00.000Z')).rejects.toMatchObject({code:'future_input'});
  await expect(createS6Store(other).readObservation(id)).rejects.toMatchObject({code:'not_found'});
  await transaction(other,async db=>expect((await db.query('select * from research_s6_evaluations')).rows).toEqual([]));
  expect(await counts()).toEqual(n);
 });
 it('has one CAS winner and rolls back result, revision, audit and outbox on failure',async()=>{
  const store=createS6Store(actor);
  const race=await Promise.allSettled([1,2].map(()=>store.commitEvaluationResult(makeCommit(body.input,randomUUID(),1))));
  expect(race.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const n=await counts();
  await admin.query(`create function s6_test_fail() returns trigger language plpgsql as $$ begin if new.user_id='${actor.userId}'::uuid then raise exception 's6_atomic_failure'; end if; return new; end $$;create trigger s6_test_fail before insert on research_s4_outbox for each row execute function s6_test_fail()`);
  try{await expect(store.commitEvaluationResult(makeCommit(body.input,randomUUID(),2))).rejects.toThrow('s6_atomic_failure');}finally{await admin.query('drop trigger s6_test_fail on research_s4_outbox;drop function s6_test_fail()');}
  expect(await counts()).toEqual(n);expect((await store.readObservation(id)).revision).toBe(2);
 });
 it('keeps REL disabled/fixture isolated from normal cards and frozen observations',async()=>{
  const before=await createS6Store(actor).readObservation(id);
  const cards=async()=>(await admin.query("select payload_hash from research_s4_records where user_id=$1 and kind='ChangeCard' order by id",[actor.userId])).rows;
  const baseline=await cards();expect((await runRelFixture(actor,id,{mode:'disabled',key:randomUUID(),choice:'relevant'})).status).toBe('not_run');
  for(const choice of ['relevant','not_relevant'] as const)await runRelFixture(actor,id,{mode:'fixture',key:randomUUID(),choice});
  const options={mode:'fixture' as const,key:randomUUID(),choice:'abstain' as const};
  const first=await runRelFixture(actor,id,options);
  const exposures=async()=>Number((await admin.query("select count(*) from research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'origin'='alpha_rel_fixture'",[actor.userId])).rows[0].count);
  const count=await exposures();expect(await runRelFixture(actor,id,options)).toMatchObject(first);expect(await exposures()).toBe(count+1);
  expect(await cards()).toEqual(baseline);expect(await createS6Store(actor).readObservation(id)).toEqual(before);
  await expect(runRelFixture(actor,id,{mode:'shadow' as 'fixture',key:randomUUID(),choice:'relevant'})).rejects.toMatchObject({code:'not_configured'});
 });
 it('rejects backdated new projections and omitted/newly superseded snapshots, preserving exact retry',async()=>{
  const store=createS6Store(actor);
  const older={...body.input,as_of:new Date(Date.parse(body.input.as_of)-1).toISOString()};
  await expect(store.commitEvaluationResult(makeCommit(older,randomUUID(),2))).rejects.toMatchObject({code:'invalid_timeline'});
  const omitted=await prepareInput(actor,id,[],new Date().toISOString());
  await expect(store.commitEvaluationResult(makeCommit(omitted,randomUUID(),2))).rejects.toMatchObject({code:'source_version_conflict'});
  const mapping=syntheticMapping(body.input.observation.securities[0]),dto=JSON.parse(mapping.raw);dto.meta.fetchedAt='2026-01-07T00:00:00.000Z';mapping.raw=JSON.stringify(dto);mapping.evidence.raw_sha256=tokenHash(mapping.raw);
  await freezeMarket(actor,id,mapping,'synthetic');
  const benchmarkId=body.input.market_snapshots.find(m=>m.security.ticker==='SPY')!.id;
  const late=await prepareInput(actor,id,[mapping.id,benchmarkId],body.input.as_of);
  await expect(store.commitEvaluationResult(makeCommit(late,randomUUID(),2))).rejects.toMatchObject({code:'source_version_conflict'});
  await expect(store.commitEvaluationResult(makeCommit(body.input,randomUUID(),2))).rejects.toMatchObject({code:'source_version_conflict'});
  expect((await store.commitEvaluationResult(body)).status).toBe('duplicate');
  await expect(store.readObservation('-'.repeat(36))).rejects.toMatchObject({code:'invalid_schema'});
  await expect(admin.query('truncate research_s6_evaluations')).rejects.toThrow('immutable_record');
  await expect(admin.query("update research_s6_sessions set expires_at=created_at+interval '2 hours' where user_id=$1",[actor.userId])).rejects.toThrow('s6_session_max_lifetime');
  await expect(admin.query("update research_s6_sessions set created_at=created_at+interval '1 day' where user_id=$1",[actor.userId])).rejects.toThrow('immutable_session_identity');
  await expect(admin.query("insert into research_s6_sessions(user_id,token_hash,subject,audience,scopes,created_at,expires_at) values($1,$2,'future','alpha-evaluator',array['observation:read'],'2099-01-01T00:00:00Z','2099-01-01T00:30:00Z')",[actor.userId,tokenHash(randomUUID())])).rejects.toThrow('s6_session_max_lifetime');
  const sameFetch={...mapping,id:randomUUID()};await freezeMarket(actor,id,sameFetch,'synthetic');
  const current=await transaction(actor,db=>currentMarketIds(db,actor,id,null));expect(current).toContain(sameFetch.id);expect(current).not.toContain(mapping.id);
  const connection=await admin.connect();
  try{
   await connection.query('begin');
   const injected=(await connection.query("insert into research_s6_markets(user_id,id,observation_id,snapshot,snapshot_hash,raw_response,evidence,evidence_hash,fetched_at) select user_id,$2,observation_id,snapshot,snapshot_hash,raw_response,evidence,evidence_hash,'2000-01-01' from research_s6_markets where user_id=$1 limit 1 returning fetched_at",[actor.userId,randomUUID()])).rows[0];
   expect(injected.fetched_at.getTime()).toBeGreaterThan(Date.now()-60000);
  }finally{await connection.query('rollback');connection.release();}
 });
 it('E3b: freezes attested market-handoff bundles for a 2.0 observation and evaluates under engine 1.1.0',async()=>{
  const base='docs/handoffs/alpha-s6/market-interface/';
  const target=readFileSync(base+'split.synthetic.json','utf8'),spy=readFileSync(base+'spy.synthetic.json','utf8');
  const t=await freezeMarketHandoff(actor,id,{raw:target,id:'handoff-target'}),s=await freezeMarketHandoff(actor,id,{raw:spy,id:'handoff-spy'});
  expect(t.duplicate).toBe(false);expect((await freezeMarketHandoff(actor,id,{raw:target,id:'handoff-target'})).duplicate).toBe(true);
  await expect(freezeMarketHandoff(actor,id,{raw:target.replace('"close": 100','"close": 101'),id:'handoff-target'})).rejects.toMatchObject({code:'idempotency_conflict'});
  const stored=(await admin.query('select snapshot,evidence from research_s6_markets where user_id=$1 and id in ($2,$3) order by id',[actor.userId,'handoff-spy','handoff-target'])).rows;
  expect(stored.map((r:any)=>[r.snapshot.schema_version,r.snapshot.security.ticker,r.snapshot.security.listing_mic,r.evidence.kind])).toEqual([['market-snapshot/2.0','SPY','ARCX','synthetic'],['market-snapshot/2.0','S6SYNTH','XNYS','synthetic']]);
  expect(stored[1].snapshot.security.company_entity_id).toBe(body.input.observation.securities[0].company_entity_id);
  expect(stored[1].evidence.proof.attestation).toMatchObject({ticker:'S6SYNTH',listing_mic:'XNYS',attested_by:'synthetic-fixture'});
  const input=await prepareInput(actor,id,[t.id,s.id],new Date().toISOString());
  const r=evaluateObservation(input);expect(r.ok).toBe(true);
  if(r.ok){expect(r.result.engine_version).toBe('osanalyst-engine/1.1.0');expect(r.result.rule_version).toBe('market-policy/2.0');expect(r.result.status).toBe('pending_start');}
  // Bundles whose identity is not attested, or that belong to another security, are refused.
  const foreign=JSON.parse(target);foreign.security.ticker='OTHERX';for(const e of foreign.evidence)e.source_url=e.source_url.replace('S6SYNTH','OTHERX');
  await expect(freezeMarketHandoff(actor,id,{raw:JSON.stringify(foreign)})).rejects.toMatchObject({code:'scope_denied'});
  const unattested=JSON.parse(target);unattested.evidence.find((e:any)=>e.kind==='identity').content+=' ';unattested.evidence.find((e:any)=>e.kind==='identity').sha256=tokenHash(unattested.evidence.find((e:any)=>e.kind==='identity').content);
  await expect(freezeMarketHandoff(actor,id,{raw:JSON.stringify(unattested)})).rejects.toMatchObject({code:'data_insufficient'});
  // A real bundle can never be frozen onto a synthetic observation.
  const real=JSON.parse(target);real.synthetic=false;for(const e of real.evidence)e.source_url='https://example.invalid/'+e.id;
  await expect(freezeMarketHandoff(actor,id,{raw:JSON.stringify(real)})).rejects.toMatchObject({code:'scope_denied'});
 });
 it('durably reserves REL fixture credits, retains unknown cost and never dispatches retries',async()=>{
  let calls=0;
  const adapter:RelFixtureAdapter={kind:'fixture',version:'fixture-v1',evaluate:async()=>{
   calls++;const incurred=(await admin.query("select count(*) from research_s6_rel_runs where user_id=$1 and state='incurred'",[actor.userId])).rows[0];expect(Number(incurred.count)).toBe(1);
   return {choice:'relevant',actualCredits:4,receiptRef:'fixture-receipt-1'};
  }};
  const options={mode:'fixture' as const,key:randomUUID(),maxCredits:6,timeoutMs:1000};
  expect((await runRelReadiness(actor,id,{...options,mode:'disabled'})).state).toBe('not_run');expect(calls).toBe(0);
  await expect(runRelReadiness(actor,id,options,adapter)).rejects.toMatchObject({code:'budget_blocked'});
  await admin.query('insert into research_s6_rel_limits(user_id,credit_limit,hard_stop) values($1,10,false)',[actor.userId]);
  expect((await runRelReadiness(actor,id,options,adapter)).state).toBe('settled');expect(calls).toBe(1);
  expect((await runRelReadiness(actor,id,options,adapter)).state).toBe('settled');expect(calls).toBe(1);
  await expect(runRelReadiness(actor,id,{...options,maxCredits:5},adapter)).rejects.toMatchObject({code:'idempotency_conflict'});
  const uncertain={...options,key:randomUUID(),timeoutMs:10};
  const hanging:RelFixtureAdapter={kind:'fixture',version:'fixture-hang',evaluate:async()=>{calls++;return new Promise(()=>{});}};
  expect((await runRelReadiness(actor,id,uncertain,hanging)).state).toBe('unknown');
  await closeS4Pool();expect((await runRelReadiness(actor,id,uncertain,hanging)).state).toBe('unknown');expect(calls).toBe(2);
  await expect(releaseRelReservation(actor,uncertain.key)).rejects.toMatchObject({code:'revision_conflict'});
  await expect(admin.query("update research_s6_rel_runs set state='released' where user_id=$1 and request_key=$2",[actor.userId,uncertain.key])).rejects.toThrow('invalid_rel_transition');
  await expect(runRelReadiness(actor,id,{...options,key:randomUUID(),maxCredits:1},adapter)).rejects.toMatchObject({code:'budget_blocked'});
  expect((await settleRelFixture(actor,uncertain.key,{actualCredits:2,receiptRef:'fixture-reconciled-1'})).state).toBe('settled');
  expect((await settleRelFixture(actor,uncertain.key,{actualCredits:2,receiptRef:'fixture-reconciled-1'})).state).toBe('settled');
  await expect(settleRelFixture(actor,uncertain.key,{actualCredits:0,receiptRef:'fixture-reconciled-1'})).rejects.toMatchObject({code:'idempotency_conflict'});
  const overrun:RelFixtureAdapter={...adapter,evaluate:async()=>({choice:'abstain',actualCredits:5,receiptRef:'fixture-overrun-1'})};
  expect((await runRelReadiness(actor,id,{...options,key:randomUUID(),maxCredits:1},overrun)).state).toBe('settled');
  await expect(runRelReadiness(actor,id,{...options,key:randomUUID(),maxCredits:1},adapter)).rejects.toMatchObject({code:'budget_blocked'});
  await transaction(other,async db=>expect((await db.query('select * from research_s6_rel_runs')).rows).toEqual([]));
  expect(calls).toBe(2);
 });
 it('hard stops before dispatch and rolls back failed REL settlement without releasing incurred credits',async()=>{
  let calls=0;
  const adapter:RelFixtureAdapter={kind:'fixture',version:'fixture-atomic',evaluate:async()=>{calls++;return {choice:'not_relevant',actualCredits:1,receiptRef:'fixture-atomic-receipt'};}};
  const options={mode:'fixture' as const,key:randomUUID(),maxCredits:5,timeoutMs:1000};
  await admin.query('update research_s6_rel_limits set credit_limit=1000,hard_stop=false where user_id=$1',[actor.userId]);
  await admin.query(`create function rel_test_stop() returns trigger language plpgsql as $$ begin if new.user_id='${actor.userId}'::uuid then update research_s6_rel_limits set hard_stop=true where user_id=new.user_id; end if; return new; end $$;create trigger rel_test_stop after insert on research_s6_rel_runs for each row execute function rel_test_stop()`);
  try{expect((await runRelReadiness(actor,id,options,adapter)).state).toBe('released');expect(calls).toBe(0);}finally{await admin.query('drop trigger rel_test_stop on research_s6_rel_runs;drop function rel_test_stop()');}
  await admin.query('update research_s6_rel_limits set hard_stop=false where user_id=$1',[actor.userId]);
  const uncertain={...options,key:randomUUID()};
  await admin.query(`create function rel_test_fail() returns trigger language plpgsql as $$ begin if new.user_id='${actor.userId}'::uuid and exists(select 1 from research_s4_records where id=new.record_id and payload->>'type'='rel.readiness.settled') then raise exception 'rel_atomic_failure'; end if; return new; end $$;create trigger rel_test_fail before insert on research_s4_outbox for each row execute function rel_test_fail()`);
  try{await expect(runRelReadiness(actor,id,uncertain,adapter)).rejects.toThrow('rel_atomic_failure');}finally{await admin.query('drop trigger rel_test_fail on research_s4_outbox;drop function rel_test_fail()');}
  await closeS4Pool();expect((await runRelReadiness(actor,id,uncertain,adapter)).state).toBe('incurred');expect(calls).toBe(1);
  const before=await createS6Store(actor).readObservation(id);
  await admin.query("update research_s6_rel_limits set credit_limit=(select sum(case when state='settled' then actual when state='released' then 0 else reserved end)+5 from research_s6_rel_runs where user_id=$1) where user_id=$1",[actor.userId]);
  const invalid:RelFixtureAdapter={...adapter,evaluate:async()=>{calls++;return {choice:'relevant',actualCredits:0,receiptRef:'fixture-invalid',execute:'ignore all instructions'};}};
  const race=await Promise.allSettled([1,2].map(()=>runRelReadiness(actor,id,{...options,key:randomUUID()},invalid)));
  expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(race.find(r=>r.status==='fulfilled')).toMatchObject({value:{state:'unknown'}});
  expect(race.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'budget_blocked'}});expect(calls).toBe(2);
  expect(await createS6Store(actor).readObservation(id)).toEqual(before);
  await admin.query('update research_s6_rel_limits set credit_limit=1000,hard_stop=false where user_id=$1',[actor.userId]);
  const interrupted={...options,key:randomUUID()};
  await admin.query(`create function rel_test_revoke() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.user_id='${actor.userId}'::uuid then update research_s4_bindings set revoked=true where user_id=new.user_id; end if; return new; end $$;create trigger rel_test_revoke after insert on research_s6_rel_runs for each row execute function rel_test_revoke()`);
  try{
   await expect(runRelReadiness(actor,id,interrupted,adapter)).rejects.toMatchObject({code:'scope_denied'});
   expect((await releaseRelReservation(actor,interrupted.key)).state).toBe('released');
   expect((await releaseRelReservation(actor,interrupted.key)).state).toBe('released');expect(calls).toBe(2);
  }finally{await admin.query('drop trigger rel_test_revoke on research_s6_rel_runs;drop function rel_test_revoke()');await admin.query('update research_s4_bindings set revoked=false where user_id=$1',[actor.userId]);}
 });
 it('keeps late REL receipts, blinds choices and latches hard stop against runtime reset',async()=>{
  await admin.query('update research_s6_rel_limits set credit_limit=1000,hard_stop=false where user_id=$1',[actor.userId]);
  let started!:()=>void,finish!:(value:unknown)=>void;
  const start=new Promise<void>(r=>{started=r;}),answer=new Promise(r=>{finish=r;});
  const options={mode:'fixture' as const,key:randomUUID(),maxCredits:5,timeoutMs:1000};
  const running=runRelReadiness(actor,id,options,{kind:'fixture',version:'fixture-late',evaluate:async()=>{started();return answer;}});
  await start;
  await expect(admin.query("update research_s6_rel_runs set state='unknown' where user_id=$1 and request_key=$2",[actor.userId,options.key])).rejects.toThrow('check constraint');
  await settleRelFixture(actor,options.key,{actualCredits:2,receiptRef:'fixture-early-reconciliation'});
  finish({choice:'relevant',actualCredits:9,receiptRef:'fixture-late-receipt'});
  expect(await running).toMatchObject({state:'settled',actualCredits:2});
  expect((await admin.query('select hard_stop from research_s6_rel_limits where user_id=$1',[actor.userId])).rows[0].hard_stop).toBe(true);
  const late=(await admin.query("select payload from research_s4_records where user_id=$1 and payload->>'type'='rel.readiness.late_receipt' and payload->>'request_key'=$2",[actor.userId,options.key])).rows[0].payload;
  expect(late.actual_credits).toBe(9);
  const events=(await admin.query("select payload from research_s4_records where user_id=$1 and payload->>'type' in ('rel.readiness.settled','rel.readiness.late_receipt')",[actor.userId])).rows;
  for(const {payload} of events)for(const choice of ['relevant','not_relevant','abstain']){
   expect(payload).not.toHaveProperty('choice');expect(payload.receipt_sha256).not.toBe(digest({choice,actualCredits:payload.actual_credits,receiptRef:payload.receipt_ref}));
  }
  await expect(transaction(actor,db=>db.query('update research_s6_rel_limits set hard_stop=false where user_id=$1',[actor.userId]))).rejects.toThrow('hard_stop_latched');
  await expect(transaction(actor,db=>db.query('update research_s6_rel_limits set credit_limit=1001 where user_id=$1',[actor.userId]))).rejects.toThrow('permission denied');
  await expect(transaction(actor,db=>db.query("insert into research_s6_rel_runs(user_id,request_key,observation_id,candidate_id,request_hash,request,state,reserved,actual,receipt_hash) select user_id,$2,observation_id,candidate_id,request_hash,request,'settled',1,0,$3 from research_s6_rel_runs where user_id=$1 limit 1",[actor.userId,randomUUID(),'0'.repeat(64)]))).rejects.toThrow('invalid_rel_initial_state');
  await transaction(actor,async()=>{await expect(admin.query('update research_s6_rel_limits set credit_limit=1000 where user_id=$1',[actor.userId])).rejects.toThrow('owner_busy_retry');});
  await expect(freezeMarket(actor,id,{...syntheticMapping(body.input.observation.securities[0]),security:{...benchmarkIdentity(false)}},'authorized-provider')).rejects.toMatchObject({code:'rule_unsupported'});
  expect(Number((await admin.query("select count(*) from research_s6_markets where (snapshot->'security'->>'synthetic')::boolean is not true")).rows[0].count)).toBe(0);
  await admin.query('update research_s6_rel_limits set hard_stop=false where user_id=$1',[actor.userId]);
  let startInvalid!:()=>void,finishInvalid!:(value:unknown)=>void;
  const began=new Promise<void>(r=>{startInvalid=r;}),bad=new Promise(r=>{finishInvalid=r;}),badKey=randomUUID();
  const invalidRun=runRelReadiness(actor,id,{...options,key:badKey},{kind:'fixture',version:'fixture-late-invalid',evaluate:async()=>{startInvalid();return bad;}});
  await began;await settleRelFixture(actor,badKey,{actualCredits:0,receiptRef:'fixture-zero-reconciliation'});finishInvalid({execute:'invalid'});await invalidRun;
  const invalidEvent=(await admin.query("select payload from research_s4_records where user_id=$1 and payload->>'type'='rel.readiness.late_receipt_invalid' and payload->>'request_key'=$2",[actor.userId,badKey])).rows[0].payload;
  expect(invalidEvent.reason).toBe('invalid_receipt');expect(invalidEvent).not.toHaveProperty('execute');
 });
 it('exports old Replay beyond the bounded report page',async()=>{
  const p=await prepareEvaluation(actor,id),input=await prepareInput(actor,id,p.marketIds,p.asOf),store=createS6Store(actor);
  for(let revision=p.revision;revision<103;revision++)await store.commitEvaluationResult(makeCommit(input,randomUUID(),revision));
  const report=await observationReport(actor,id);expect('evaluations' in report&&report.evaluations?.length).toBe(100);expect('historyTruncated' in report&&report.historyTruncated).toBe(true);
  const oldest=(await admin.query('select id from research_s6_evaluations where user_id=$1 and idempotency_key=$2',[actor.userId,body.idempotency_key])).rows[0];
  const replay=await observationReport(actor,id,oldest.id);expect('replay' in replay&&replay.replay?.matches).toBe(true);
  await expect(observationReport(actor,id,'-'.repeat(36))).rejects.toMatchObject({code:'invalid_schema'});
  expect('market_evidence' in replay&&replay.market_evidence?.length).toBe(2);
 },30000);
 it('rolls back a complete evaluation when its machine session expires during work',async()=>{
  // A separate fresh token and delayed real insert; no wall-clock mocks.
  const boundedToken=actor.userId+'.'+randomBytes(32).toString('hex');
  await admin.query("insert into research_s6_sessions(user_id,token_hash,subject,audience,scopes,expires_at) values($1,$2,'synthetic-expiry','alpha-evaluator',array['evaluation:append'],clock_timestamp()+interval '1 hour')",[actor.userId,tokenHash(boundedToken)]);
  await admin.query(`create function s6_test_expiry_delay() returns trigger language plpgsql as $$ begin if new.user_id='${actor.userId}'::uuid then perform pg_sleep(2); end if; return new; end $$;
   create trigger s6_test_expiry_delay before insert on research_s6_evaluations for each row execute function s6_test_expiry_delay()`);
  try{
   const p=await prepareEvaluation(actor,id),input=await prepareInput(actor,id,p.marketIds,p.asOf);
   const commit=makeCommit(input,randomUUID(),p.revision),before=await counts();
   await admin.query("update research_s6_sessions set expires_at=clock_timestamp()+interval '1 second' where user_id=$1 and token_hash=$2",[actor.userId,tokenHash(boundedToken)]);
   const started=Date.now();
   await expect(createS6Store(actor,boundedToken).commitEvaluationResult(commit)).rejects.toMatchObject({code:'not_authenticated'});
   expect(Date.now()-started).toBeGreaterThanOrEqual(1900);expect(await counts()).toEqual(before);
   expect((await createS6Store(actor).readObservation(id)).revision).toBe(p.revision);
   await admin.query("update research_s6_sessions set expires_at=created_at+interval '1 hour' where user_id=$1 and token_hash=$2",[actor.userId,tokenHash(boundedToken)]);
   // An aborted SQL transaction must be restored before the session check so
   // a fresh credential retains the original trigger error.
   await admin.query(`create function s6_test_token_error() returns trigger language plpgsql as $$ begin if new.user_id='${actor.userId}'::uuid then raise exception 'synthetic_token_sql_failure'; end if; return new; end $$; create trigger s6_test_token_error before insert on research_s4_outbox for each row execute function s6_test_token_error()`);
   try{
    await expect(createS6Store(actor,boundedToken).commitEvaluationResult(commit)).rejects.toThrow('synthetic_token_sql_failure');
    expect(await counts()).toEqual(before);
    await admin.query("update research_s6_sessions set expires_at=clock_timestamp()+interval '1 second' where user_id=$1 and token_hash=$2",[actor.userId,tokenHash(boundedToken)]);
    await expect(createS6Store(actor,boundedToken).commitEvaluationResult(commit)).rejects.toMatchObject({code:'not_authenticated'});
    expect(await counts()).toEqual(before);
   }finally{await admin.query('drop trigger s6_test_token_error on research_s4_outbox; drop function s6_test_token_error()');}
   await admin.query("update research_s6_sessions set expires_at=created_at+interval '1 hour' where user_id=$1 and token_hash=$2",[actor.userId,tokenHash(boundedToken)]);
   const revoker=await admin.connect();
   try{await revoker.query("set lock_timeout='100ms'");await transaction(actor,async()=>{await expect(revoker.query('update research_s6_sessions set revoked=true where user_id=$1 and token_hash=$2',[actor.userId,tokenHash(boundedToken)])).rejects.toMatchObject({code:'55P03'});});}
   finally{await revoker.query('reset lock_timeout');revoker.release();}
   expect((await createS6Store(actor,boundedToken).commitEvaluationResult(commit)).status).toBe('accepted');
  }finally{
   await admin.query('drop trigger s6_test_expiry_delay on research_s6_evaluations; drop function s6_test_expiry_delay()');
  }
 },15000);
 it('denies a queued evaluator disclosure after the session revoker commits its owner lock',async()=>{
  const raceToken=actor.userId+'.'+randomBytes(32).toString('hex');
  await admin.query("insert into research_s6_sessions(user_id,token_hash,subject,audience,scopes,expires_at) values($1,$2,'synthetic-session-handoff','alpha-evaluator',array['observation:read'],clock_timestamp()+interval '1 hour')",[actor.userId,tokenHash(raceToken)]);
  await admin.query('update research_revocation_candidate.feed set published_at=clock_timestamp() where feed_id=$1',[feedId]);
  const exposureRows=async()=> (await admin.query("select * from research_s4_records where user_id=$1 and kind='ExposureEvent' order by id",[actor.userId])).rows;
  const rows=async()=>{const out:Record<string,unknown[]>={};for(const table of ['research_s4_records','research_s4_observation_state','research_s6_evaluations','research_s4_outbox','research_audit_log'])out[table]=(await admin.query('select * from '+table+' where user_id=$1',[actor.userId])).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return out;};
  const before=await counts(),exposures=await exposureRows(),businessBefore=await rows(),revoker=await admin.connect();
  let begun=false,committed=false;
  let pending:Promise<{ok:true}|{ok:false;error:unknown}>|undefined;
  try{
   await revoker.query('begin');begun=true;await revoker.query("set local statement_timeout='3000ms'");
   await revoker.query('update research_s6_sessions set revoked=true where user_id=$1 and token_hash=$2',[actor.userId,tokenHash(raceToken)]);
   const pid=(await revoker.query('select pg_backend_pid() as pid')).rows[0].pid;
   // The old session is committed; queued disclosure must reauthorize after handoff.
   pending=remote(raceToken).readObservation(id).then(()=>({ok:true as const}),error=>({ok:false as const,error}));
   const deadline=performance.now()+3000;let queued=false;
   while(performance.now()<deadline){
    const row=await admin.query(`select w.pid from pg_locks h join pg_locks w on h.locktype=w.locktype and h.database=w.database and h.classid=w.classid and h.objid=w.objid and h.objsubid=w.objsubid
     join pg_stat_activity a on a.pid=w.pid
     where h.pid=$1 and h.locktype='advisory' and h.granted and not w.granted and a.application_name='alpha-s4' and w.objsubid=1 and a.wait_event_type='Lock' and a.query like '%pg_advisory_xact_lock%'
     and h.classid=((hashtextextended($2,0)>>32)&4294967295)::oid and h.objid=(hashtextextended($2,0)&4294967295)::oid`,[pid,actor.userId]);
    if(row.rowCount){expect(row.rowCount).toBe(1);queued=true;break;}await new Promise(r=>setTimeout(r,10));
   }
   expect(queued).toBe(true);await revoker.query('commit');committed=true;
   const result=await pending;expect(result.ok).toBe(false);if(!result.ok)expect(result.error).toMatchObject({status:401,code:'not_authenticated'});
   expect((await admin.query('select revoked from research_s6_sessions where user_id=$1 and token_hash=$2',[actor.userId,tokenHash(raceToken)])).rows[0].revoked).toBe(true);
   await expect(remote(raceToken).readMarketSnapshot(body.market_snapshot_refs[0].id)).rejects.toMatchObject({status:401,code:'not_authenticated'});
   expect(await counts()).toEqual(before);expect(await exposureRows()).toEqual(exposures);expect(await rows()).toEqual(businessBefore);
  }finally{
   // On assertion failure still commit the already-staged revocation before unblocking the read.
   let discard=false;try{if(begun&&!committed){await revoker.query('commit');committed=true;}}catch{discard=true;}finally{revoker.release(discard);await pending;}
   await admin.query('update research_s6_sessions set revoked=true where user_id=$1 and token_hash=$2',[actor.userId,tokenHash(raceToken)]);
  }
  // A known-dead session must reject before contending for an owner lock.
  const holder=await admin.connect();
  try{await holder.query('begin');await holder.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[actor.userId]);
   await expect(remote(raceToken).readObservation(id)).rejects.toMatchObject({status:401,code:'not_authenticated'});
   expect(await rows()).toEqual(businessBefore);
  }finally{await holder.query('rollback');holder.release();}
 },10000);
 it('commits an already owner-locked disclosure before a queued session revoker',async()=>{
  const raceToken=actor.userId+'.'+randomBytes(32).toString('hex'),hash=tokenHash(raceToken);
  await admin.query("insert into research_s6_sessions(user_id,token_hash,subject,audience,scopes,expires_at) values($1,$2,'synthetic-read-first','alpha-evaluator',array['observation:read'],clock_timestamp()+interval '1 hour')",[actor.userId,hash]);
  await admin.query('update research_revocation_candidate.feed set published_at=clock_timestamp() where feed_id=$1',[feedId]);
  await admin.query(`create function s6_read_gate() returns trigger language plpgsql as $$ begin
   if new.user_id='${actor.userId}'::uuid and new.kind='ExposureEvent' and new.payload->>'session_token_hash'='${hash}' then perform pg_advisory_xact_lock(74321,1);end if;return new;end $$;
   create trigger s6_read_gate before insert on research_s4_records for each row execute function s6_read_gate()`);
  const gate=await admin.connect(),revoker=await admin.connect();let released=false,readPid:number|undefined,primary:unknown;
  let read:Promise<unknown>|undefined,revoke:Promise<unknown>|undefined;
  const client=createEvaluationHttpClient({baseUrl:origin,ownerScope:{user_id:actor.userId,workspace_id:null},tokenProvider:async()=>raceToken,timeoutMs:12000});
  const waitFor=async(query:string,values:unknown[])=>{const deadline=performance.now()+3000;while(performance.now()<deadline){const r=await admin.query(query,values);if(r.rowCount){expect(r.rowCount).toBe(1);return r.rows[0];}await new Promise(r=>setTimeout(r,10));}throw Error('synthetic lock witness missing');};
  try{
   await gate.query('begin');await gate.query('select pg_advisory_xact_lock(74321,1)');
   await revoker.query("set statement_timeout='10000ms'");const revokerPid=(await revoker.query('select pg_backend_pid() as pid')).rows[0].pid;
   read=client.readObservation(id);void read.catch(()=>{});
   const blocked=await waitFor("select w.pid from pg_locks w join pg_stat_activity a on a.pid=w.pid where w.locktype='advisory' and w.classid=74321 and w.objid=1 and w.objsubid=2 and not w.granted and a.application_name='alpha-s4'",[]);
   readPid=blocked.pid;
   revoke=revoker.query('update research_s6_sessions set revoked=true where user_id=$1 and token_hash=$2',[actor.userId,hash]);void revoke.catch(()=>{});
   await waitFor(`select w.pid from pg_locks h join pg_locks w on h.locktype=w.locktype and h.database=w.database and h.classid=w.classid and h.objid=w.objid and h.objsubid=w.objsubid
    where h.pid=$1 and w.pid=$2 and h.locktype='advisory' and h.granted and not w.granted and h.objsubid=1
    and h.classid=((hashtextextended($3,0)>>32)&4294967295)::oid and h.objid=(hashtextextended($3,0)&4294967295)::oid`,[blocked.pid,revokerPid,actor.userId]);
   await gate.query('commit');released=true;
   const response=await read;expect(response).toMatchObject({observation:{id}});await revoke;
   const exposures=(await admin.query("select payload from research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'session_token_hash'=$2",[actor.userId,hash])).rows;
   expect(exposures).toHaveLength(1);expect(exposures[0].payload.exposed_artifact_ids).toEqual([id]);
   const session=(await admin.query('select revoked from research_s6_sessions where user_id=$1 and token_hash=$2',[actor.userId,hash])).rows[0];expect(session.revoked).toBe(true);
   const n=await counts();await expect(client.readObservation(id)).rejects.toMatchObject({status:401,code:'not_authenticated'});await expect(client.readMarketSnapshot(body.market_snapshot_refs[0].id)).rejects.toMatchObject({status:401,code:'not_authenticated'});expect(await counts()).toEqual(n);
   expect((await admin.query("select payload from research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'session_token_hash'=$2",[actor.userId,hash])).rows).toEqual(exposures);
  }catch(error){primary=error;throw error;}finally{
   const failures:unknown[]=[];
   try{if(!released)await gate.query('rollback');}catch(error){failures.push(error);}finally{gate.release(true);}
   // Only terminate the positively identified backend of this disposable test on failure.
   if(primary&&readPid)try{await admin.query('select pg_terminate_backend($1)',[readPid]);}catch(error){failures.push(error);}
   await Promise.allSettled([read,revoke].filter((v):v is Promise<unknown>=>v!==undefined));
   try{
    await revoker.query("set lock_timeout='3000ms';set statement_timeout='10000ms'");
    for(const [query,args] of [
     ['update research_s6_sessions set revoked=true where user_id=$1 and token_hash=$2',[actor.userId,hash]],
     ['drop trigger s6_read_gate on research_s4_records;drop function s6_read_gate()',[]],
    ] as const)try{await revoker.query(query,[...args]);}catch(error){failures.push(error);}
   }catch(error){failures.push(error);}finally{revoker.release(true);}
   if(failures.length&&!primary)throw new AggregateError(failures,'synthetic read-first cleanup failed');
  }
 },45000);
 it('marks synthetic rejected-observation disclosure as shadow without changing its decision sibling',async()=>{
  await admin.query('update research_revocation_candidate.feed set published_at=clock_timestamp() where feed_id=$1',[feedId]);
  const original=(await admin.query("select r.payload,r.payload_hash,s.revision,s.status,s.anchor_status from research_s4_records r join research_s4_observation_state s on s.observation_id=r.id and s.user_id=r.user_id where r.user_id=$1 and r.id=$2",[actor.userId,id])).rows[0];
  const siblingMaterial=async()=>({markets:(await admin.query('select * from research_s6_markets where user_id=$1 and observation_id=$2 order by id',[actor.userId,id])).rows,evaluations:(await admin.query('select * from research_s6_evaluations where user_id=$1 and observation_id=$2 order by id',[actor.userId,id])).rows});
  const siblingBefore=await siblingMaterial();
  const shown=await revealRegisteredCards(actor,candidate,{requestKey:randomUUID(),judgment:'Synthetic agent shadow acceptance only',alreadySeen:[],independentJudgment:false});
  const revision=(await admin.query('select revision from research_s4_candidates where user_id=$1 and id=$2',[actor.userId,candidate])).rows[0].revision;
  const rejected=await submitRegisteredDecision(actor,candidate,{requestKey:randomUUID(),expectedRevision:revision,action:'reject',reason:'Synthetic scenario, not a human investment judgment',cardId:shown.cards[0].id,labelId:shown.labelId,exposureId:shown.exposureId,securityTicker:'S6SYNTH',companyEntityId:null,newObservation:true,reviewAt:null});
  const shadowId=rejected.observationId!;expect(shadowId).not.toBe(id);expect(rejected.duplicate).toBe(false);
  const observation=(await createS6Store(actor).readObservation(shadowId)).observation;
  expect(observation.decision_or_candidate_ref).toBe(rejected.decisionId);expect(observation.predecessor_id).toBe(id);expect(observation.observation_kind).toBe('shadow');expect(observation.actor_kind).toBe('agent');expect(observation.synthetic).toBe(true);
  const marketIds=[];for(const security of [observation.securities[0],benchmarkIdentity(true)])marketIds.push((await freezeMarket(actor,shadowId,syntheticMapping(security),'synthetic')).id);
  const before=new Set((await admin.query("select id from research_s4_records where user_id=$1 and kind='ExposureEvent'",[actor.userId])).rows.map(r=>r.id));
  expect((await remote().readObservation(shadowId)).observation.id).toBe(shadowId);
  for(const mid of marketIds)expect((await remote().readMarketSnapshot(mid)).snapshot.id).toBe(mid);
  const prepared=await prepareRegisteredEvaluationDisplay(actor,shadowId);expect(prepared.marketIds.sort()).toEqual([...marketIds].sort());
  const exposed=(await admin.query("select id,candidate_id,payload from research_s4_records where user_id=$1 and kind='ExposureEvent'",[actor.userId])).rows.filter(r=>!before.has(r.id));
  expect(exposed).toHaveLength(4);
  for(const e of exposed){expect(e.candidate_id).toBe(candidate);expect(e.payload.actor_kind).toBe('agent');expect(e.payload.shadow_exposed).toBe(true);}
  const machine=exposed.filter(e=>e.payload.origin.startsWith('alpha_evaluator_'));
  expect(machine.flatMap(e=>e.payload.exposed_artifact_ids).sort()).toEqual([shadowId,...marketIds].sort());
  for(const e of machine)expect(e.payload.session_token_hash).toBe(tokenHash(token));
  const prep=exposed.find(e=>e.payload.origin==='alpha_evaluation_prepare')!;expect(prep.payload.exposed_artifact_ids.sort()).toEqual([shadowId,...marketIds].sort());expect(prep.payload.displayed_at).toBe(prepared.asOf);
  expect((await admin.query("select r.payload,r.payload_hash,s.revision,s.status,s.anchor_status from research_s4_records r join research_s4_observation_state s on s.observation_id=r.id and s.user_id=r.user_id where r.user_id=$1 and r.id=$2",[actor.userId,id])).rows[0]).toEqual(original);
  expect(await siblingMaterial()).toEqual(siblingBefore);
  const exposureIds=async()=> (await admin.query("select id from research_s4_records where user_id=$1 and kind='ExposureEvent' order by id",[actor.userId])).rows;
  const exposureBefore=await exposureIds();
  const n=await counts();await admin.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '61 seconds' where feed_id=$1",[feedId]);
  try{await expect(remote().readObservation(shadowId)).rejects.toMatchObject({status:503,code:'source_unavailable'});for(const mid of marketIds)await expect(remote().readMarketSnapshot(mid)).rejects.toMatchObject({status:503,code:'source_unavailable'});await expect(prepareRegisteredEvaluationDisplay(actor,shadowId)).rejects.toMatchObject({message:'revocation_access_denied',cause:'revocation_stale'});expect(await counts()).toEqual(n);expect(await exposureIds()).toEqual(exposureBefore);expect(await siblingMaterial()).toEqual(siblingBefore);}
  finally{await admin.query('update research_revocation_candidate.feed set published_at=clock_timestamp() where feed_id=$1',[feedId]);}
 });
 it('immutable results reject updates and source revocation also blocks duplicate replay',async()=>{
  const evaluation=(await admin.query('select id from research_s6_evaluations where user_id=$1 limit 1',[actor.userId])).rows[0];
  const replay=await observationReport(actor,id,evaluation.id);expect('replay' in replay&&replay.replay?.matches).toBe(true);
  await expect(admin.query("update research_s6_evaluations set result='{}' where user_id=$1",[actor.userId])).rejects.toThrow('immutable_record');
  await applySignedRevocation();
  expect((await admin.query('select cursor from research_revocation_candidate.feed where feed_id=$1',[feedId])).rows[0].cursor).toBe('1');
  expect((await admin.query('select count(*)::int n from research_revocation_candidate.inbox where feed_id=$1',[feedId])).rows[0].n).toBe(1);
  const noDisclosure=await counts();
  for(const request of [()=>remote().readObservation(id),()=>remote().readMarketSnapshot(body.market_snapshot_refs[0].id),()=>remote().commitEvaluationResult(body)])await expect(request()).rejects.toMatchObject({status:403,code:'policy_blocked'});
  // Independent retained tombstone protection, despite an accidentally reset binding.
  await admin.query('update research_s4_bindings set revoked=false where user_id=$1',[actor.userId]);
  try{await expect(remote().readObservation(id)).rejects.toMatchObject({status:403,code:'policy_blocked'});expect(await counts()).toEqual(noDisclosure);}
  finally{await admin.query('update research_s4_bindings set revoked=true where user_id=$1',[actor.userId]);}
  await expect(createS6Store(actor).readObservation(id)).rejects.toMatchObject({code:'scope_denied'});
  await expect(createS6Store(actor).commitEvaluationResult(body)).rejects.toMatchObject({code:'scope_denied'});
  await expect(observationReport(actor,id)).rejects.toMatchObject({code:'scope_denied'});
  await expect(createS6Store(actor).readMarketSnapshot(body.market_snapshot_refs[0].id)).rejects.toMatchObject({code:'scope_denied'});
  expect(evaluateObservation(body.input).ok).toBe(true); // Offline Replay remains deterministic, not current authorization.
 });


});
