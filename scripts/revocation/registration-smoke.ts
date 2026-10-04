import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {Pool} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
import {testPack} from '../s4/test-pack';
import {canonicalize,digest} from '../../src/lib/research/ingest/pa-v1/json.js';
import {prepareRevocationCandidate} from '../../src/lib/research/revocation/candidate';
import {registerCandidateReference} from '../../src/lib/research/revocation/register';
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
  await apply({...page,through_seq:'1',latest_seq:'1',published_at:new Date().toISOString(),events:[{revocation_id:randomUUID(),monotonic_seq:'1',source_id:t.sourceId,grant_id:expected.grantId,grant_version:1,effective_at:new Date().toISOString()}]});
  await rejected(register(),'binding_revoked');
  // Even an accidentally reset binding must not bypass a retained tombstone.
  await db.query('update public.research_s4_bindings set revoked=false where user_id=$1',[actor]);await rejected(register(),'grant_version_revoked');
  await assert.rejects(db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6) on conflict do nothing',[feedId,actor,t.sourceId,expected.grantId,1,hash]),/grant_version_revoked/);
  assert.equal((await db.query('select count(*)::int n from research_revocation_candidate.binding_map')).rows[0].n,1);
  await db.query('delete from research_revocation_candidate.inbox where feed_id=$1',[feedId]);
  await rejected(register(),'inbox_coverage_gap');
  if(interrupted)throw new Error('interrupted');
  console.log('Registration acceptance passed: missing approval, freshness/scope, rollback, concurrent idempotency, consumer revoke and tombstone denial.');
 }catch(error){primary=error;throw error;}finally{try{await db.end();}finally{stopLocalDatabase(state,primary);}}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'registration test failed');process.exitCode=1;});
