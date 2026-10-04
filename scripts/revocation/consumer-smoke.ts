import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {Pool} from 'pg';
import {startLocalDatabase,stopLocalDatabase} from '../s4/local-db';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
const id=(n:number)=>`2000000a-0000-4000-8000-${String(n).padStart(12,'0')}`;
let interrupted=false;const interrupt=()=>{interrupted=true;};
process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function main(){
 const state=await startLocalDatabase();const db=new Pool({connectionString:state.adminUrl,max:3,connectionTimeoutMillis:5000,statement_timeout:15000});let primary:unknown;
 try{
  await db.query(readFileSync('scripts/revocation/candidate-schema.sql','utf8'));
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const registration={feedId:id(1),localOwner:id(2),scope:{user_id:id(3),workspace_id:null},key:publicKey};
  await db.query('insert into auth.users(id) values($1),($2)',[id(2),id(9)]);
  for(const [owner,hash]of [[id(2),'a'.repeat(64)],[id(2),'b'.repeat(64)],[id(9),'a'.repeat(64)]])await db.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[owner,hash,{localUserId:owner,approvedPayloadHash:hash}]);
  await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[id(1),id(2),id(3)]);
  for(const [version,hash]of [[1,'a'.repeat(64)],[2,'b'.repeat(64)]])await db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[id(1),id(2),id(4),id(5),version,hash]);
  await db.query('insert into research_revocation_candidate.feed(feed_id,local_owner,upstream_user) values($1,$2,$3)',[id(10),id(9),id(3)]);
  await db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[id(10),id(9),id(4),id(5),1,'a'.repeat(64)]);
  const page={protocol_version:'pa-revocation/v1',feed_id:id(1),owner_scope:registration.scope,from_seq:'0',through_seq:'1',latest_seq:'1',published_at:new Date().toISOString(),events:[{revocation_id:id(6),monotonic_seq:'1',source_id:id(4),grant_id:id(5),grant_version:1,effective_at:new Date(Date.now()-1000).toISOString()}]};
  const encode=(value:unknown)=>{const raw=Buffer.from(JSON.stringify(value));return [raw,sign(null,raw,privateKey).toString('hex')] as const;};
  const checkClean=async()=>{assert.equal((await db.query('select count(*)::int as n from research_revocation_candidate.inbox')).rows[0].n,0);assert.equal((await db.query('select cursor from research_revocation_candidate.feed order by feed_id')).rows[0].cursor,'0');assert.equal((await db.query('select count(*)::int as n from public.research_s4_bindings where revoked and user_id=$1',[id(2)])).rows[0].n,0);};
  // Failure AFTER inbox and binding writes must roll back all three effects.
  await db.query(`create function research_revocation_candidate.fail_update() returns trigger language plpgsql as $$ begin if exists(select 1 from research_revocation_candidate.inbox where feed_id=new.feed_id) and exists(select 1 from public.research_s4_bindings where user_id=new.local_owner and revoked) then raise exception 'synthetic crash'; end if; return new; end $$;
   create trigger synthetic_crash before update on research_revocation_candidate.feed for each row execute function research_revocation_candidate.fail_update()`);
  await assert.rejects(applyRevocationPage(db,registration,...encode(page)),/revocation_apply_failed/);await checkClean();
  await db.query('drop trigger synthetic_crash on research_revocation_candidate.feed');
  await assert.rejects(applyRevocationPage(db,{...registration,scope:{...registration.scope,workspace_id:id(8)}},...encode(page)));await checkClean();
  await assert.rejects(applyRevocationPage(db,registration,...encode({...page,owner_scope:{...page.owner_scope,user_id:id(8)}})));await checkClean();
  const results=await Promise.all([applyRevocationPage(db,registration,...encode(page)),applyRevocationPage(db,registration,...encode(page))]);
  assert.deepEqual(results.map(r=>r.status).sort(),['applied','duplicate']);
  assert.deepEqual((await db.query('select payload_hash,revoked from public.research_s4_bindings where user_id=any($1::uuid[]) order by user_id,payload_hash',[[id(2),id(9)]])).rows.map(r=>r.revoked),[true,false,false]);
  assert.equal((await db.query('select cursor from research_revocation_candidate.feed order by feed_id')).rows[0].cursor,'1');
  // A repeated event identity at a new sequence must not advance or revoke another version.
  const next={...page,from_seq:'1',through_seq:'2',latest_seq:'2',events:[{...page.events[0],monotonic_seq:'2',grant_version:2}]};
  await assert.rejects(applyRevocationPage(db,registration,...encode(next)));
  assert.equal((await db.query('select cursor from research_revocation_candidate.feed order by feed_id')).rows[0].cursor,'1');
  assert.equal((await db.query('select revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[id(2),'b'.repeat(64)])).rows[0].revoked,false);
  assert.equal((await db.query('select count(*)::int as n from research_revocation_candidate.inbox')).rows[0].n,1);
  assert.equal((await applyRevocationPage(db,registration,...encode({...next,events:[{...next.events[0],revocation_id:id(7)}]}))).status,'applied');
  assert.equal((await db.query('select revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[id(2),'b'.repeat(64)])).rows[0].revoked,true);
  // Persist an unmapped tombstone, then refuse later mapping resurrection.
  await applyRevocationPage(db,registration,...encode({...page,from_seq:'2',through_seq:'3',latest_seq:'3',events:[{...page.events[0],monotonic_seq:'3',revocation_id:id(11),grant_version:3}]}));
  await assert.rejects(db.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[id(1),id(2),id(4),id(5),3,'a'.repeat(64)]),/grant_version_revoked/);
  const waitForBlocked=async(client:import('pg').PoolClient)=>{
   for(let i=0;i<200;i++){
    if((await client.query("select count(*)::int as n from pg_catalog.pg_locks where locktype='advisory' and not granted")).rows[0].n>0)return;
    await client.query('select pg_catalog.pg_sleep(0.01)');
   }throw new Error('expected advisory lock contention');
  };
  for(const [index,owner] of [id(2),id(2).toUpperCase()].entries()){
   const version=4+index*2;const writer=await db.connect(),mapper=await db.connect();
   try{
    await writer.query('begin');await writer.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::uuid::text,0))',[owner]);
    const event={...page.events[0],monotonic_seq:String(version),revocation_id:id(100+version),grant_version:version};
    await writer.query('insert into research_revocation_candidate.inbox values($1,$2,$3,$4)',[id(1),version,event.revocation_id,event]);
    await writer.query('update research_revocation_candidate.feed set cursor=$2,latest_seq=$2,last_page_hash=null where feed_id=$1',[id(1),version]);
    const pending=mapper.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[id(1),owner,id(4),id(5),version,'a'.repeat(64)]).then(()=>null,error=>error);
    await waitForBlocked(writer);await writer.query('commit');assert.match(String(await pending),/grant_version_revoked/);
    const hash=(index?'e':'d').repeat(64);
    await writer.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[id(2),hash,{localUserId:id(2),approvedPayloadHash:hash}]);
    await mapper.query('begin');await mapper.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[id(1),owner,id(4),id(5),version+1,hash]);
    const applying=applyRevocationPage(db,{...registration,localOwner:owner},...encode({...page,from_seq:String(version),through_seq:String(version+1),latest_seq:String(version+1),published_at:new Date().toISOString(),events:[{...event,monotonic_seq:String(version+1),revocation_id:id(101+version),grant_version:version+1}]})).then(value=>({value}),error=>({error}));
    await waitForBlocked(mapper);await mapper.query('commit');assert.equal('value' in await applying,true);
    assert.equal((await writer.query('select revoked from public.research_s4_bindings where user_id=$1 and payload_hash=$2',[id(2),hash])).rows[0].revoked,true);
    await mapper.query('begin isolation level repeatable read');
    await assert.rejects(mapper.query('insert into research_revocation_candidate.binding_map values($1,$2,$3,$4,$5,$6)',[id(1),owner,id(4),id(5),100+version,hash]),/unsupported_revocation_isolation/);await mapper.query('rollback');
   }finally{await writer.query('rollback');await mapper.query('rollback');writer.release();mapper.release();}
  }
  if(interrupted)throw new Error('interrupted');
  console.log('Late mapping resurrection rejected; fresh-ID control accepted.');
  console.log('Revocation transaction smoke passed: rollback, scope, concurrent replay, exact grant version, cross-owner isolation, duplicate-ID conflict. Production not accessed.');
 }catch(error){primary=error;throw error;}finally{try{await db.end();}finally{stopLocalDatabase(state,primary);}}
}
main().catch(()=>{console.error('Revocation transaction verification failed');process.exitCode=1;}).finally(()=>{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);});
