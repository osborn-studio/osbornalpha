/** Local synthetic wire conformance only, not endpoint/key-registration acceptance. */
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import assert from 'node:assert/strict';
import {verifyRevocationPage} from '../../src/lib/research/revocation/feed';
const raw=readFileSync(process.argv[2]);
const fixture=JSON.parse(raw.toString('utf8'));
const scope={user_id:'11111111-1111-4111-8111-111111111111',workspace_id:null};
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const result=verifyRevocationPage(raw,sign(null,raw,privateKey).toString('hex'),publicKey,{feedId:fixture.feed_id,scope,cursor:'0',latestSeq:'0',publishedAt:null},Date.now());
assert.equal(result.caughtUp,true);assert.equal(result.checkpoint.cursor,'2');
assert.deepEqual(result.events.map(e=>e.monotonic_seq),['1','2']);
assert.deepEqual(result.events.map(e=>e.grant_version),[1,2]);
assert(result.events.every(e=>e.source_id==='22222222-2222-4222-8222-222222222222'&&e.grant_id==='33333333-3333-4333-8333-333333333333'));
console.log('PASS: freshly generated PA SQL page conforms to Alpha signed validator; synthetic signing only.');

import {Pool} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
let interrupted=false;const interrupt=()=>{interrupted=true;};process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function persist(){
 const state=await startLocalDatabase();const db=new Pool({connectionString:state.adminUrl,connectionTimeoutMillis:5000,statement_timeout:15000});let primary:unknown;
 try{
  await db.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  const owner='70000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users(id) values($1)',[owner]);
  await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[fixture.feed_id,owner,scope.user_id]);
  for(const version of [1,2]){
   const hash=String(version).repeat(64);
   await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[owner,hash,{localUserId:owner,approvedPayloadHash:hash}]);
   await db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[fixture.feed_id,owner,result.events[0].source_id,result.events[0].grant_id,version,hash]);
  }
  const registration={feedId:fixture.feed_id,localOwner:owner,scope,key:publicKey};const signature=sign(null,raw,privateKey).toString('hex');
  assert.equal((await applyRevocationPage(db,registration,raw,signature)).status,'applied');
  assert.equal((await applyRevocationPage(db,registration,raw,signature)).status,'duplicate');
  assert.equal((await db.query('select count(*)::int as n from public.research_s4_bindings where user_id=$1 and revoked',[owner])).rows[0].n,2);
  assert.equal((await db.query('select cursor from research_revocation_candidate.feed')).rows[0].cursor,'2');
  if(interrupted)throw new Error('interrupted');
  console.log('PASS: PA-generated events atomically revoke both Alpha versions; replay is a no-op. Two isolated local databases, no production endpoint.');
 }catch(error){primary=error;throw error;}finally{try{await db.end();}finally{stopLocalDatabase(state,primary);}}
}
persist().catch(()=>{console.error('Cross-repository persistence verification failed');process.exitCode=1;}).finally(()=>{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);});
