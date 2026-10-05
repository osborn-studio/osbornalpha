import {GET,POST} from '../../src/app/api/research/s4/candidates/route';
import {localSessionToken} from '../../src/lib/research/s4/auth';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {Pool} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
import {testPack} from '../s4/test-pack';
import {canonicalize,digest} from '../../src/lib/research/ingest/pa-v1/json.js';
import {registerCandidateReference} from '../../src/lib/research/revocation/register';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
import {listRegisteredCandidates,type CandidatePageCursor} from '../../src/lib/research/s4/registered-list';
import {closeS4Pool} from '../../src/lib/research/s4/db';
import {s4Http} from '../../src/lib/research/s4/http';
async function main(){
 const state=await startLocalDatabase(),db=new Pool({connectionString:state.adminUrl});let primary:unknown;
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
  const seeds=[];
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
  const event={revocation_id:randomUUID(),monotonic_seq:'1',source_id:affected.t.sourceId,grant_id:affected.t.config.grant.grant_id,grant_version:1,effective_at:new Date().toISOString()};
  const bytes=Buffer.from(JSON.stringify({...affected.page,through_seq:'1',latest_seq:'1',published_at:new Date().toISOString(),events:[event]}));
  await applyRevocationPage(db,affected.registration,bytes,sign(null,bytes,privateKey).toString('hex'));
  await db.query('update public.research_s4_bindings set revoked=false where user_id=$1 and payload_hash=$2',[actor.userId,affected.t.binding.approvedPayloadHash]);
  await assert.rejects(listRegisteredCandidates(actor,2),e=>e instanceof Error&&e.cause==='grant_version_revoked');
  await db.query('delete from research_revocation_candidate.inbox where feed_id=$1',[affected.feedId]);
  await assert.rejects(listRegisteredCandidates(actor,2),e=>e instanceof Error&&e.cause==='inbox_coverage_gap');
  console.log('Registered list acceptance passed: microsecond pagination, bounds, two feeds, stale/tombstone/pruning fail closed.');
 }catch(e){primary=e;throw e;}finally{try{await closeS4Pool();await db.end();}finally{stopLocalDatabase(state,primary);}}
}
void main().catch(e=>{console.error(e instanceof Error?e.message:'list test failed');process.exitCode=1;});
