import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {Pool} from 'pg';
import {importRegisteredCandidate} from '../../src/lib/research/s4/import';
import {submitRegisteredDecision,type DecisionInput} from '../../src/lib/research/s4/decisions';
import {registeredCandidateStatus,registeredCitation,registeredReviewHistory} from '../../src/lib/research/s4/read';
import {revealRegisteredCards} from '../../src/lib/research/s4/cards';
import {closeS4Pool} from '../../src/lib/research/s4/db';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
import {testPack} from '../s4/test-pack';
import {canonicalize,digest} from '../../src/lib/research/ingest/pa-v1/json.js';
import {prepareRevocationCandidate} from '../../src/lib/research/revocation/candidate';
import {registerCandidateReference} from '../../src/lib/research/revocation/register';
import {withRegisteredCandidate,withRegisteredCandidateInTransaction} from '../../src/lib/research/revocation/access';
import {withStoredCandidateInTransaction} from '../../src/lib/research/revocation/registered-access';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
let interrupted=false;const interrupt=()=>{interrupted=true;};process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function main(){
 const state=await startLocalDatabase(),db=new Pool({connectionString:state.adminUrl,max:3,connectionTimeoutMillis:5000,statement_timeout:10000});let primary:unknown;
 try{
  await db.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  // Disposable runtime role only; no production ACL provisioning is claimed.
  await db.query('grant usage on schema research_revocation_candidate to alpha_s4_runtime; grant select on all tables in schema research_revocation_candidate to alpha_s4_runtime');
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
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
  assert.deepEqual(await registeredCandidateStatus(s4Actor,imported.id),{revision:0,observations:[]});
  const revealInput={requestKey:randomUUID(),judgment:'Synthetic automated acceptance only',alreadySeen:[],independentJudgment:false};
  const shown=await revealRegisteredCards(s4Actor,imported.id,revealInput);
  assert.ok(shown);
  const label=(await db.query("select payload from public.research_s4_records where user_id=$1 and kind='HumanLabel'",[actor])).rows[0].payload;
  assert.equal(label.actor_kind,'agent');assert.equal(label.independent,false);
  await db.query(`insert into public.stocks_universe(ticker,name,market,exchange,currency,metadata) values('REVTEST','Synthetic','US','XNYS','USD','{"synthetic":true}')`);
  const decision:DecisionInput={requestKey:randomUUID(),expectedRevision:0,action:'observe',reason:'Synthetic automated test; not investment advice',cardId:shown.cards[0].id,labelId:shown.labelId,exposureId:shown.exposureId,securityTicker:'REVTEST',companyEntityId:null,newObservation:true,reviewAt:null};
  const decided=await submitRegisteredDecision(s4Actor,imported.id,decision);
  assert.equal(decided.revision,1);assert.equal(decided.duplicate,false);
  assert.equal((await submitRegisteredDecision(s4Actor,imported.id,decision)).duplicate,true);
  await assert.rejects(submitRegisteredDecision(s4Actor,imported.id,{...decision,reason:'changed'}),/idempotency_conflict/);
  await assert.rejects(submitRegisteredDecision(s4Actor,imported.id,{...decision,requestKey:randomUUID()}),/revision_conflict/);
  assert.equal((await registeredCitation(s4Actor,imported.id,shown.cards[0].id,0)).text,t.raw);
  assert.ok((await registeredReviewHistory(s4Actor,imported.id)).records.some((r:{kind:string})=>r.kind==='Decision'));

  const businessCounts=async()=>{
   const counts:Record<string,number>={};
   for(const table of ['research_s4_records','research_s4_requests','research_s4_outbox','research_audit_log','research_judgments','research_labels','research_decisions','research_s4_observation_state']){
    counts[table]=(await db.query('select count(*)::int n from public.'+table+' where user_id=$1',[actor])).rows[0].n;
   }
   return counts;
  };
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
   for(const op of [()=>registeredCitation(s4Actor,imported.id,shown.cards[0].id,0),()=>registeredReviewHistory(s4Actor,imported.id),()=>submitRegisteredDecision(s4Actor,imported.id,decision),()=>registeredCandidateStatus(s4Actor,imported.id),()=>revealRegisteredCards(s4Actor,imported.id,{...revealInput,requestKey:randomUUID()})]){
    await assert.rejects(op(),error=>error instanceof Error&&error.message===code);
   }
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
   for(const op of [()=>registeredCandidateStatus(s4Actor,imported.id),()=>revealRegisteredCards(s4Actor,imported.id,revealInput),()=>registeredCitation(s4Actor,imported.id,shown.cards[0].id,0),()=>registeredReviewHistory(s4Actor,imported.id),()=>submitRegisteredDecision(s4Actor,imported.id,decision)])await assert.rejects(op(),/source_version_conflict/);
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
  await assert.rejects(revealRegisteredCards(s4Actor,imported.id,slowInput),error=>error instanceof Error&&error.cause==='revocation_stale');
  assert.ok(performance.now()-slowStarted>=5900,'must reach delayed request insert before post-check denial');
  assert.deepEqual(await businessCounts(),beforeSlow);
  await assert.rejects(revealRegisteredCards(s4Actor,imported.id,slowInput),error=>error instanceof Error&&error.cause==='revocation_stale');
  await assert.rejects(registeredCandidateStatus(s4Actor,imported.id),/revocation_access_denied/);
  assert.deepEqual(await businessCounts(),beforeSlow);

  const delayedDecision={...decision,requestKey:randomUUID(),expectedRevision:2,action:'defer' as const,newObservation:false};
  const statusBefore=(await db.query('select revision,status,last_observation_id from public.research_s4_candidates where id=$1',[imported.id])).rows[0];
  const countsBefore=await businessCounts();
  await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
  const decisionStarted=performance.now();
  await assert.rejects(submitRegisteredDecision(s4Actor,imported.id,delayedDecision),error=>error instanceof Error&&error.cause==='revocation_stale');
  assert.ok(performance.now()-decisionStarted>=5900);
  assert.deepEqual((await db.query('select revision,status,last_observation_id from public.research_s4_candidates where id=$1',[imported.id])).rows[0],statusBefore);
  assert.deepEqual(await businessCounts(),countsBefore);
  for(const op of [()=>submitRegisteredDecision(s4Actor,imported.id,delayedDecision),()=>registeredReviewHistory(s4Actor,imported.id),()=>registeredCitation(s4Actor,imported.id,shown.cards[0].id,0)])await assert.rejects(op(),/revocation_access_denied/);
  await db.query('drop trigger synthetic_delay_request on public.research_s4_requests');
  await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp()');

  assert.deepEqual(await importRegisteredCandidate(s4Actor,raw),{id:imported.id,duplicate:true});
  await db.query("insert into public.research_s4_integrity(user_id,reason) values($1,'anchor_integrity_failed')",[actor]);
  await assert.rejects(importRegisteredCandidate(s4Actor,raw),/anchor_integrity_failed/);
  await db.query('delete from public.research_s4_integrity where user_id=$1',[actor]);
  for(const change of [{grant_version:2},{source_id:randomUUID()},{revocation_seq_at_export:'1'}]){
   const changed=structuredClone(t.pack);changed.manifest.extensions['pa.revocation_reference']={...reference,...change};changed.files['manifest.json']=canonicalize(changed.manifest);
   await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,{...t.binding,approvedManifestHash:digest(changed.manifest)}]);
   await assert.rejects(importRegisteredCandidate(s4Actor,JSON.stringify(changed)),change.revocation_seq_at_export?/export_watermark_ahead/:/invalid_revocation_candidate/);
   assert.equal((await db.query('select count(*)::int n from public.research_s4_candidates')).rows[0].n,1);
  }
  await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,t.binding]);
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
    await deniedAccess(expected,'grant_invalid_or_expired');
   }
  }
  await db.query('update public.research_s4_bindings set binding=$2 where user_id=$1',[actor,t.binding]);
  await db.query('create table research_revocation_candidate.synthetic_access_result(value integer)');
  // Compose on one checked-out client: require a clean outer transaction;
  // denied work cannot be committed by a catch-and-COMMIT caller. A single-connection pool would
  // deadlock if the helper tried to acquire a nested connection.
  const single=new Pool({connectionString:state.adminUrl,max:1,connectionTimeoutMillis:500,statement_timeout:10000});
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
  }),error=>error instanceof Error&&error.cause==='grant_invalid_or_expired');
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
  await assert.rejects(apply({...page,through_seq:'1',latest_seq:'1',published_at:new Date().toISOString(),events:[{revocation_id:randomUUID(),monotonic_seq:'1',source_id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',grant_id:expected.grantId,grant_version:1,effective_at:new Date().toISOString()}]}),/revocation_apply_failed/);
  assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.inbox')).rows[0].n,0);
  const operation=withRegisteredCandidate(db,actor,hash,expected,async client=>{
   holderPid=(await client.query('select pg_backend_pid() as pid')).rows[0].pid;entered();await barrier;
   await client.query('insert into research_revocation_candidate.synthetic_access_result values(2)');return 'committed before revocation';
  });
  await started;
  const consume=apply({...page,through_seq:'1',latest_seq:'1',published_at:new Date().toISOString(),events:[{revocation_id:randomUUID(),monotonic_seq:'1',source_id:t.sourceId,grant_id:expected.grantId,grant_version:1,effective_at:new Date().toISOString()}]});
  // Attach handlers immediately, and always release the transaction on failure.
  const settled=Promise.allSettled([operation,consume]);
  try{
   await lockWait(holderPid);
  }finally{release();await settled;}
  assert.equal(await operation,'committed before revocation');await consume;
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
  await assert.rejects(importRegisteredCandidate(s4Actor,raw),/revocation_access_denied/);
  assert.equal((await db.query('select count(*)::int n from public.research_s4_candidates')).rows[0].n,1);
  await assert.rejects(withRegisteredCandidate(db,actor,hash,expected,async()=>true),/revocation_access_denied/);
  // Even an accidentally reset binding must not bypass a retained tombstone.
  await db.query('update public.research_s4_bindings set revoked=false where user_id=$1',[actor]);await rejected(register(),'grant_version_revoked');await deniedAccess(expected,'grant_version_revoked');
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
void main().catch(error=>{console.error(error instanceof Error?error.message:'registration test failed');process.exitCode=1;});
