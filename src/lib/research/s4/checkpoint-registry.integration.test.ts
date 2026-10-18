import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {ownedPool} from '../../../../scripts/s4/local-db';
import {checkpointRegistryConfig,createCheckpointRegistry} from './checkpoint-registry';

// I1.5: the independent checkpoint registry is a separate database (here: a second database in
// the owned test cluster, never the Alpha database). The client role can execute three functions
// and nothing else; the schema owner alone registers identities and advances generations.
const enabled=!!process.env.S4_TEST_STATE;
const h=(c:string)=>c.repeat(64);
describe.skipIf(!enabled)('independent checkpoint registry on real PostgreSQL',()=>{
 let admin:Pool,registryAdmin:Pool,client:ReturnType<typeof createCheckpointRegistry>,rawClient:Pool,clientPort='',clientPassword='';
 const databaseIdentity=randomUUID(),storeId=randomUUID(),owner=h('1'),otherOwner=h('2');
 const dbName='alpha_anchor_checkpoint_'+randomBytes(4).toString('hex');
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=ownedPool({connectionString:state.adminUrl,max:1});
  const password=randomBytes(18).toString('hex');clientPassword=password;
  await admin.query(`create database ${dbName}`);
  await admin.query(`do $$ begin
    if not exists(select from pg_roles where rolname='alpha_checkpoint_owner') then create role alpha_checkpoint_owner nologin nosuperuser nobypassrls nocreaterole nocreatedb; end if;
    if not exists(select from pg_roles where rolname='alpha_checkpoint_client') then create role alpha_checkpoint_client nologin nosuperuser nobypassrls nocreaterole nocreatedb; end if;
   end $$`);
  await admin.query(`create role s4_checkpoint_test login password '${password}' nosuperuser nobypassrls inherit; grant alpha_checkpoint_client to s4_checkpoint_test`);
  const url=new URL(state.adminUrl);url.pathname='/'+dbName;clientPort=url.port;
  registryAdmin=ownedPool({connectionString:url.toString(),max:1});
  await registryAdmin.query(`grant create on database ${dbName} to alpha_checkpoint_owner; grant alpha_checkpoint_owner to s4_admin`);
  const c=await registryAdmin.connect();
  try{await c.query('set role alpha_checkpoint_owner');await c.query(readFileSync('ops/anchor-checkpoint/schema.sql','utf8'));await c.query('reset role');}finally{c.release();}
  const clientUrl=new URL(url);clientUrl.username='s4_checkpoint_test';clientUrl.password=password;
  rawClient=ownedPool({connectionString:clientUrl.toString(),max:1});
  client=createCheckpointRegistry(checkpointRegistryConfig({ALPHA_ANCHOR_REGISTRY_HOST:'127.0.0.1',ALPHA_ANCHOR_REGISTRY_PORT:url.port,ALPHA_ANCHOR_REGISTRY_DATABASE:dbName,ALPHA_ANCHOR_REGISTRY_USER:'s4_checkpoint_test',ALPHA_ANCHOR_REGISTRY_PASSWORD:password,ALPHA_ANCHOR_REGISTRY_INSECURE_LOOPBACK:'1'}));
 });
 afterAll(async()=>{
  await client?.close();await rawClient?.end();await registryAdmin?.end();
  // pool.end() resolves before sockets close; a forced drop would FATAL those backends, so wait
  // until the server sees no session on the registry database before dropping it.
  if(admin){
   for(let i=0;i<50&&Number((await admin.query('select count(*) n from pg_stat_activity where datname=$1',[dbName])).rows[0].n)>0;i++)await new Promise(r=>setTimeout(r,100));
   await admin.query(`drop database if exists ${dbName}`).catch(()=>{});
   await admin.query('drop role if exists s4_checkpoint_test').catch(()=>{});
   await admin.end();
  }
 });
 const asOwner=async(sql:string,values:unknown[]=[])=>{const c=await registryAdmin.connect();try{await c.query('set role alpha_checkpoint_owner');return await c.query(sql,values);}finally{await c.query('reset role').catch(()=>{});c.release();}};

 it('refuses the client everything except the three granted functions',async()=>{
  for(const sql of ['select * from anchor_private.checkpoints','select * from anchor_private.identities','insert into anchor_private.checkpoints default values',"select anchor_private.advance_generation($1,2,'x')","select anchor_private.register_identity($1,$2,1)"]){
   await expect(rawClient.query(sql,sql.includes('$2')?[databaseIdentity,storeId]:sql.includes('$1')?[databaseIdentity]:[])).rejects.toThrow(/permission denied/);
  }
 });
 it('reports an unregistered identity as denied and confirms nothing before registration',async()=>{
  expect(await client.identityState(databaseIdentity)).toMatchObject({ok:false,outcome:'denied',code:'anchor_identity_unregistered'});
  expect(await client.confirm({requestId:randomUUID(),databaseIdentity,ownerScopeHash:owner,storeId,lastSequence:'1',lastHash:h('a'),generation:1})).toMatchObject({ok:false,outcome:'denied',code:'anchor_identity_unregistered'});
 });
 it('owner registers the identity once; a second registration with a different store or generation is refused',async()=>{
  expect((await asOwner('select anchor_private.register_identity($1,$2,1) as r',[databaseIdentity,storeId])).rows[0].r).toMatchObject({registered:true,generation:1});
  await expect(asOwner('select anchor_private.register_identity($1,$2,1)',[databaseIdentity,randomUUID()])).rejects.toThrow(/anchor_store_mismatch/);
  await expect(asOwner('select anchor_private.register_identity($1,$2,2)',[databaseIdentity,storeId])).rejects.toThrow(/anchor_generation_fenced/);
  expect(await client.identityState(databaseIdentity)).toEqual({ok:true,value:{databaseIdentity,storeId,generation:1,durabilityReady:true}});
  expect(await client.latest(databaseIdentity,owner)).toEqual({ok:true,value:null});
 });
 it('confirms monotonically per owner, idempotently per request and per (sequence, hash), and isolates owners',async()=>{
  const first={requestId:randomUUID(),databaseIdentity,ownerScopeHash:owner,storeId,lastSequence:'10',lastHash:h('a'),generation:1};
  const r1=await client.confirm(first);expect(r1).toMatchObject({ok:true,value:{duplicate:false,lastSequence:'10',generation:1}});
  expect(await client.confirm(first)).toMatchObject({ok:true,value:{duplicate:true,lastSequence:'10'}});
  expect(await client.confirm({...first,requestId:randomUUID()})).toMatchObject({ok:true,value:{duplicate:true,lastSequence:'10'}});
  expect(await client.confirm({...first,requestId:randomUUID(),lastHash:h('b')})).toMatchObject({ok:false,outcome:'conflict',code:'anchor_hash_conflict'});
  expect(await client.confirm({...first,requestId:randomUUID(),lastSequence:'9',lastHash:h('c')})).toMatchObject({ok:false,outcome:'conflict',code:'anchor_checkpoint_regression'});
  expect(await client.confirm({...first,requestId:first.requestId,lastSequence:'11'})).toMatchObject({ok:false,outcome:'conflict',code:'anchor_request_conflict'});
  expect(await client.confirm({...first,requestId:randomUUID(),storeId:randomUUID()})).toMatchObject({ok:false,outcome:'denied',code:'anchor_store_mismatch'});
  expect(await client.confirm({...first,requestId:randomUUID(),generation:2})).toMatchObject({ok:false,outcome:'denied',code:'anchor_generation_fenced'});
  expect(await client.confirm({...first,requestId:randomUUID(),lastSequence:'12',lastHash:h('d')})).toMatchObject({ok:true,value:{duplicate:false,lastSequence:'12'}});
  expect(await client.latest(databaseIdentity,owner)).toMatchObject({ok:true,value:{lastSequence:'12',lastHash:h('d'),generation:1,storeId}});
  expect(await client.latest(databaseIdentity,otherOwner)).toEqual({ok:true,value:null});
  expect(await client.confirm({...first,requestId:randomUUID(),ownerScopeHash:otherOwner,lastSequence:'3',lastHash:h('e')})).toMatchObject({ok:true,value:{duplicate:false,lastSequence:'3'}});
  expect(Number((await asOwner('select count(*) n from anchor_private.checkpoints')).rows[0].n)).toBe(3);
 });
 it('keeps history append-only even for the schema owner',async()=>{
  await expect(asOwner('delete from anchor_private.checkpoints')).rejects.toThrow(/append_only|permission denied/);
  await expect(asOwner('update anchor_private.checkpoints set last_hash=$1',[h('f')])).rejects.toThrow(/append_only|permission denied/);
  await expect(asOwner('truncate anchor_private.checkpoints')).rejects.toThrow(/append_only|permission denied/);
 });
 it('advancing the generation (owner only) fences the old generation and is itself append-only history',async()=>{
  expect((await asOwner("select anchor_private.advance_generation($1,2,'synthetic runner replacement') as r",[databaseIdentity])).rows[0].r).toMatchObject({generation:2,previous:1});
  await expect(asOwner("select anchor_private.advance_generation($1,2,'again')",[databaseIdentity])).rejects.toThrow(/anchor_generation_fenced/);
  expect(await client.confirm({requestId:randomUUID(),databaseIdentity,ownerScopeHash:owner,storeId,lastSequence:'13',lastHash:h('9'),generation:1})).toMatchObject({ok:false,outcome:'denied',code:'anchor_generation_fenced'});
  expect(await client.confirm({requestId:randomUUID(),databaseIdentity,ownerScopeHash:owner,storeId,lastSequence:'13',lastHash:h('9'),generation:2})).toMatchObject({ok:true,value:{generation:2}});
  expect(await client.identityState(databaseIdentity)).toMatchObject({ok:true,value:{generation:2}});
  expect((await asOwner('select generation from anchor_private.generations where database_identity=$1 order by generation',[databaseIdentity])).rows.map(r=>Number(r.generation))).toEqual([1,2]);
 });
 it('returns unknown, not failure, when the deadline expires',async()=>{
  const slow=createCheckpointRegistry({...checkpointRegistryConfig({ALPHA_ANCHOR_REGISTRY_HOST:'127.0.0.1',ALPHA_ANCHOR_REGISTRY_PORT:clientPort,ALPHA_ANCHOR_REGISTRY_DATABASE:dbName,ALPHA_ANCHOR_REGISTRY_USER:'s4_checkpoint_test',ALPHA_ANCHOR_REGISTRY_PASSWORD:clientPassword,ALPHA_ANCHOR_REGISTRY_INSECURE_LOOPBACK:'1'}),deadlineMs:1});
  try{
   const r=await slow.latest(databaseIdentity,owner);
   expect(r.ok===false?r.outcome:'value').toMatch(/unknown|value/);
   if(!r.ok)expect(r.outcome).toBe('unknown');
  }finally{await slow.close();}
 });
});
