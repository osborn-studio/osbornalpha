import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {Pool} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
import {testPack} from '../s4/test-pack';
import {canonicalize,digest} from '../../src/lib/research/ingest/pa-v1/json.js';
import {prepareRevocationCandidate} from '../../src/lib/research/revocation/candidate';
import {registerCandidateReference} from '../../src/lib/research/revocation/register';
import {withRegisteredCandidate,withRegisteredCandidateInTransaction} from '../../src/lib/research/revocation/access';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
let interrupted=false;const interrupt=()=>{interrupted=true;};process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function main(){
 const state=await startLocalDatabase(),db=new Pool({connectionString:state.adminUrl,max:3,connectionTimeoutMillis:5000,statement_timeout:10000});let primary:unknown;
 try{
  await db.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  const actor=randomUUID(),t=testPack(actor),feedId=randomUUID();
  const expected={feedId,scope:t.scope,sourceId:t.sourceId,grantId:t.config.grant.grant_id,grantVersion:1};
  const reference={protocol_version:'pa-grant-reference/v1',feed_id:feedId,owner_scope:t.scope,source_id:t.sourceId,grant_id:expected.grantId,grant_version:1,observed_at:t.version.ingested_at,revocation_seq_at_export:'0'};
  t.pack.manifest.extensions['pa.revocation_reference']=reference;t.pack.files['manifest.json']=canonicalize(t.pack.manifest);t.binding.approvedManifestHash=digest(t.pack.manifest);
  const raw=JSON.stringify(t.pack),hash=t.binding.approvedPayloadHash;
  prepareRevocationCandidate(raw,actor,t.binding,expected);
  const rejected=(promise:Promise<unknown>,cause:string)=>assert.rejects(promise,e=>e instanceof Error&&e.message==='revocation_registration_failed'&&e.cause===cause);
  const register=()=>registerCandidateReference(db,actor,hash,raw,expected);
  await db.query('insert into auth.users(id) values($1)',[actor]);
  await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[feedId,actor,t.scope.user_id]);
  await rejected(register(),'binding_missing'); // no approval, no side-effect
  await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor,hash,t.binding]);
  await rejected(register(),'checkpoint_unavailable'); // no committed heartbeat
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const registration={feedId,localOwner:actor,scope:t.scope,key:publicKey};
  const page={protocol_version:'pa-revocation/v1',feed_id:feedId,owner_scope:t.scope,from_seq:'0',through_seq:'0',latest_seq:'0',published_at:new Date().toISOString(),events:[]};
  const apply=async(p:unknown)=>{const b=Buffer.from(JSON.stringify(p));return applyRevocationPage(db,registration,b,sign(null,b,privateKey).toString('hex'));};
  await apply(page);
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
   await client.query('begin isolation level read committed');
   const count=await withRegisteredCandidateInTransaction(client,actor,hash,expected,async same=>{
    await same.query('insert into research_revocation_candidate.synthetic_access_result values(9)');
    assert.equal(same,client);
    return (await same.query('select count(*)::int n from research_revocation_candidate.synthetic_access_result')).rows[0].n;
   });
   assert.equal(count,1);await client.query('rollback');
   assert.equal((await client.query('select count(*)::int n from research_revocation_candidate.synthetic_access_result')).rows[0].n,0);
   await client.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '55 seconds'");
   await client.query('begin');
   let postEntered=false;
   await assert.rejects(withRegisteredCandidateInTransaction(client,actor,hash,expected,async same=>{
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
  await rejected(register(),'binding_revoked');
  await assert.rejects(withRegisteredCandidate(db,actor,hash,expected,async()=>true),/revocation_access_denied/);
  // Even an accidentally reset binding must not bypass a retained tombstone.
  await db.query('update public.research_s4_bindings set revoked=false where user_id=$1',[actor]);await rejected(register(),'grant_version_revoked');await deniedAccess(expected,'grant_version_revoked');
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
 }catch(error){primary=error;throw error;}finally{try{await db.end();}finally{stopLocalDatabase(state,primary);}}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'registration test failed');process.exitCode=1;});
