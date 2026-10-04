/** Two disposable databases, synthetic operator approval and signing only. */
import {readFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
import {testPack} from '../s4/test-pack';
import {canonicalize,digest} from '../../src/lib/research/ingest/pa-v1/json.js';
import {prepareRevocationCandidate} from '../../src/lib/research/revocation/candidate';
import {registerCandidateReference} from '../../src/lib/research/revocation/register';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
const wire=JSON.parse(readFileSync(process.argv[2],'utf8'));
let interrupted=false;const interrupt=()=>{interrupted=true;};process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function main(){
 const state=await startLocalDatabase(),db=new Pool({connectionString:state.adminUrl,max:3,connectionTimeoutMillis:5000,statement_timeout:10000});let primary:unknown;
 try{
  await db.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  const owner=randomUUID(),r=wire.reference,a=wire.authority;
  assert.equal(r.grant_id,wire.grant.grant_id);assert(wire.grant.input_selector.source_ids.includes(r.source_id));
  assert.deepEqual(r.owner_scope,wire.grant.scope);assert.deepEqual(r.owner_scope,wire.rights.owner_scope);
  assert.deepEqual(a,{feed_id:r.feed_id,source_id:r.source_id,grant_id:r.grant_id,grant_version:r.grant_version,owner_scope:r.owner_scope});
  for(const policy of [wire.rights,wire.grant])assert(Date.parse(policy.approved_at??policy.confirmed_at)<=Date.now()&&Date.now()<Date.parse(policy.valid_until));
  assert.equal(r.protocol_version,'pa-grant-reference/v1');assert.equal(r.grant_version,1);assert.equal(r.revocation_seq_at_export,'0');
  assert.deepEqual(wire.before_page.events,[]);assert.equal(wire.after_page.events.length,1);
  assert.equal(wire.after_page.feed_id,a.feed_id);assert.deepEqual(wire.after_page.owner_scope,a.owner_scope);
  assert.equal(wire.after_page.from_seq,'0');assert.equal(wire.after_page.through_seq,'1');assert.equal(wire.after_page.latest_seq,'1');assert.equal(wire.after_page.events[0].monotonic_seq,'1');
  assert.equal(wire.after_page.events[0].source_id,r.source_id);assert.equal(wire.after_page.events[0].grant_id,r.grant_id);assert.equal(wire.after_page.events[0].grant_version,r.grant_version);
  const t=testPack(owner,{sourceId:r.source_id,scope:r.owner_scope,config:{rights:wire.rights,grant:wire.grant}});
  t.pack.manifest.extensions['pa.revocation_reference']=r;t.pack.files['manifest.json']=canonicalize(t.pack.manifest);t.binding.approvedManifestHash=digest(t.pack.manifest);
  const raw=JSON.stringify(t.pack),hash=t.binding.approvedPayloadHash;
  // Synthetic authority is queried independently from PA snapshot/feed tables.
  // This shared fixture file does NOT establish a deployed authentication channel.
  const expected={feedId:a.feed_id,scope:wire.grant.scope,sourceId:a.source_id,grantId:wire.grant.grant_id,grantVersion:a.grant_version};
  prepareRevocationCandidate(raw,owner,t.binding,expected);
  const tampered=structuredClone(t.pack);tampered.manifest.extensions['pa.revocation_reference'].grant_version++;
  tampered.files['manifest.json']=canonicalize(tampered.manifest);
  assert.throws(()=>prepareRevocationCandidate(JSON.stringify(tampered),owner,t.binding,expected),/policy_blocked/);
  for(const patch of [{grant_id:randomUUID()},{source_id:randomUUID()},{owner_scope:{...r.owner_scope,user_id:randomUUID()}},{owner_scope:{...r.owner_scope,workspace_id:randomUUID()}},{grant_version:r.grant_version+1},{feed_id:randomUUID()},{protocol_version:'unsupported'}]){
   const changed=structuredClone(t.pack);changed.manifest.extensions['pa.revocation_reference']={...r,...patch};changed.files['manifest.json']=canonicalize(changed.manifest);
   assert.throws(()=>prepareRevocationCandidate(JSON.stringify(changed),owner,{...t.binding,approvedManifestHash:digest(changed.manifest)},expected),/invalid_revocation_candidate/);
  }
  await db.query('insert into auth.users(id) values($1)',[owner]);
  await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[owner,hash,t.binding]);
  await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user,workspace_id) values($1,$2,$3,$4)',[r.feed_id,owner,r.owner_scope.user_id,r.owner_scope.workspace_id]);
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const feed={feedId:r.feed_id,localOwner:owner,scope:r.owner_scope,key:publicKey};
  const apply=(page:unknown)=>{const b=Buffer.from(JSON.stringify(page));return applyRevocationPage(db,feed,b,sign(null,b,privateKey).toString('hex'));};
  await apply(wire.before_page);
  assert.equal((await registerCandidateReference(db,owner,hash,raw,expected)).status,'registered');
  assert.equal((await registerCandidateReference(db,owner,hash,raw,expected)).status,'duplicate');
  assert.equal((await apply(wire.after_page)).status,'applied');
  assert.equal((await db.query('select revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[owner,hash])).rows[0].revoked,true);
  await assert.rejects(registerCandidateReference(db,owner,hash,raw,expected),e=>e instanceof Error&&e.cause==='binding_revoked');
  const retry=testPack(owner,{sourceId:a.source_id,scope:wire.grant.scope,config:{rights:wire.rights,grant:wire.grant}});
  retry.pack.manifest.extensions['pa.revocation_reference']=r;retry.pack.files['manifest.json']=canonicalize(retry.pack.manifest);retry.binding.approvedManifestHash=digest(retry.pack.manifest);
  assert.notEqual(retry.binding.approvedPayloadHash,hash);
  await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[owner,retry.binding.approvedPayloadHash,retry.binding]);
  await assert.rejects(registerCandidateReference(db,owner,retry.binding.approvedPayloadHash,JSON.stringify(retry.pack),expected),e=>e instanceof Error&&e.cause==='grant_version_revoked');
  assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.binding_map')).rows[0].n,1);
  assert.equal((await apply(wire.after_page)).status,'duplicate');
  assert.equal((await db.query('select cursor from research_revocation_candidate.feed')).rows[0].cursor,'1');
  if(interrupted)throw new Error('interrupted');
  console.log('PASS: real PA reference -> approved synthetic Alpha pack -> atomic registration -> PA-produced source-withdrawal event (re-serialized, locally signed) -> denied original and repackaged registration.');
 }catch(error){primary=error;throw error;}finally{try{await db.end();}finally{stopLocalDatabase(state,primary);}}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'export conformance failed');process.exitCode=1;});
