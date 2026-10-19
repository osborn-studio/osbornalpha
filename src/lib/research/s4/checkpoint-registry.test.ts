import {describe,expect,it,vi} from 'vitest';
import {checkpointRegistryConfig,createCheckpointRegistry,type RegistryQuery} from './checkpoint-registry';

// Transport semantics only; the real functions are covered by the integration suite.
// A deadline or lost response is "unknown", never a failure and never a rollback.
const h=(c:string)=>c.repeat(64);
const env={ALPHA_ANCHOR_REGISTRY_HOST:'registry.example.test',ALPHA_ANCHOR_REGISTRY_PORT:'5432',ALPHA_ANCHOR_REGISTRY_DATABASE:'alpha_anchor_checkpoint',ALPHA_ANCHOR_REGISTRY_USER:'alpha_checkpoint_app',ALPHA_ANCHOR_REGISTRY_PASSWORD:'synthetic-secret'};
describe('checkpoint registry configuration',()=>{
 it('requires every explicit field, verifies TLS against the host name and never accepts a URL',()=>{
  const c=checkpointRegistryConfig(env);
  expect(c.db).toMatchObject({host:'registry.example.test',port:5432,database:'alpha_anchor_checkpoint',user:'alpha_checkpoint_app',max:1});
  expect(c.db.ssl).toMatchObject({rejectUnauthorized:true,servername:'registry.example.test'});
  expect(c.deadlineMs).toBe(4500);
  expect(JSON.stringify(c)).not.toContain('synthetic-secret');
  for(const k of Object.keys(env))expect(()=>checkpointRegistryConfig({...env,[k]:undefined})).toThrow('registry_configuration_invalid');
  expect(()=>checkpointRegistryConfig({...env,ALPHA_ANCHOR_REGISTRY_PORT:'0'})).toThrow('registry_configuration_invalid');
  expect(()=>checkpointRegistryConfig({...env,ALPHA_ANCHOR_REGISTRY_USER:'postgres'})).toThrow('registry_configuration_invalid');
  expect(()=>checkpointRegistryConfig({...env,ALPHA_ANCHOR_REGISTRY_URL:'postgres://x:y@z/db'} as any)).toThrow('registry_configuration_invalid');
 });
 it('trusts an operator-supplied provider CA file and refuses a relative, missing or non-PEM path',async()=>{
  const {writeFileSync,mkdtempSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');
  const dir=mkdtempSync(join(tmpdir(),'alpha-ca-'));const pem=join(dir,'ca.pem');writeFileSync(pem,'-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
  const c=checkpointRegistryConfig({...env,ALPHA_ANCHOR_REGISTRY_CA_FILE:pem});
  expect(c.db.ssl).toMatchObject({rejectUnauthorized:true,servername:'registry.example.test',ca:expect.stringContaining('BEGIN CERTIFICATE')});
  const bad=join(dir,'bad.txt');writeFileSync(bad,'not a certificate');
  for(const file of ['relative/ca.pem',join(dir,'missing.pem'),bad])expect(()=>checkpointRegistryConfig({...env,ALPHA_ANCHOR_REGISTRY_CA_FILE:file})).toThrow('registry_configuration_invalid');
  expect(()=>checkpointRegistryConfig({...env,ALPHA_ANCHOR_REGISTRY_HOST:'127.0.0.1',ALPHA_ANCHOR_REGISTRY_INSECURE_LOOPBACK:'1',ALPHA_ANCHOR_REGISTRY_CA_FILE:pem})).toThrow('registry_configuration_invalid');
 });
 it('omits SNI for an IP-literal registry host while still verifying the certificate',()=>{
  const ssl=checkpointRegistryConfig({...env,ALPHA_ANCHOR_REGISTRY_HOST:'10.60.2.10'}).db.ssl as Record<string,unknown>;
  expect(ssl.rejectUnauthorized).toBe(true);expect('servername' in ssl).toBe(false);
 });
 it('allows plaintext only for an explicit loopback test target',()=>{
  expect(()=>checkpointRegistryConfig({...env,ALPHA_ANCHOR_REGISTRY_INSECURE_LOOPBACK:'1'})).toThrow('registry_configuration_invalid');
  const c=checkpointRegistryConfig({...env,ALPHA_ANCHOR_REGISTRY_HOST:'127.0.0.1',ALPHA_ANCHOR_REGISTRY_INSECURE_LOOPBACK:'1'});
  expect(c.db.ssl).toBe(false);
 });
});
describe('checkpoint registry client outcomes',()=>{
 const request={requestId:'10000000-0000-4000-8000-000000000001',databaseIdentity:'10000000-0000-4000-8000-000000000002',ownerScopeHash:h('a'),storeId:'10000000-0000-4000-8000-000000000003',lastSequence:'7',lastHash:h('b'),generation:1};
 const client=(query:RegistryQuery)=>createCheckpointRegistry(checkpointRegistryConfig(env),{query});
 it('returns the confirmed checkpoint as a value and passes only typed parameters',async()=>{
  const query=vi.fn(async(_text:string,_values:unknown[])=>({rows:[{result:{checkpoint_id:'5',confirmed_at:'2026-10-18T00:00:00.000Z',duplicate:false,last_sequence:'7',generation:1}}]}));
  const r=await client(query).confirm(request);
  expect(r).toEqual({ok:true,value:{checkpointId:'5',confirmedAt:'2026-10-18T00:00:00.000Z',duplicate:false,lastSequence:'7',generation:1}});
  expect(query.mock.calls[0][0]).toMatch(/anchor_private\.confirm_checkpoint\(\$1,\$2,\$3,\$4,\$5,\$6,\$7\)/);
  expect(query.mock.calls[0][1]).toEqual([request.requestId,request.databaseIdentity,request.ownerScopeHash,request.storeId,'7',h('b'),1]);
 });
 it('maps a statement deadline or a lost connection to unknown, never to failure',async()=>{
  for(const error of [Object.assign(new Error('canceling statement due to statement timeout'),{code:'57014'}),Object.assign(new Error('Connection terminated unexpectedly'),{code:undefined}),Object.assign(new Error('connect ETIMEDOUT'),{code:'ETIMEDOUT'})]){
   const r=await client(async()=>{throw error;}).confirm(request);
   expect(r).toEqual({ok:false,outcome:'unknown',code:error.code??'transport'});
  }
 });
 it('maps denials, conflicts and durability refusals to their outcomes using the SQLSTATE and the function message only',async()=>{
  const cases:[string,string,string][]=[['42501','anchor_generation_fenced','denied'],['42501','anchor_store_mismatch','denied'],['23505','duplicate key value violates unique constraint "x"','conflict'],['58000','durability unavailable','unavailable'],['P0001','anchor_hash_conflict','conflict'],['P0001','anchor_checkpoint_regression','conflict']];
  for(const [code,message,outcome] of cases){
   const r=await client(async()=>{throw Object.assign(new Error(message+' secret-host:5432'),{code});}).confirm(request);
   expect(r.ok).toBe(false);if(r.ok)continue;
   expect(r.outcome).toBe(outcome);expect(r.code).toMatch(/^[a-z_0-9]+$/);expect(JSON.stringify(r)).not.toContain('secret-host');
  }
 });
 it('rejects malformed requests before touching the transport',async()=>{
  const query=vi.fn();
  for(const bad of [{...request,lastHash:'nope'},{...request,lastSequence:'0'},{...request,requestId:'not-a-uuid'},{...request,generation:0},{...request,ownerScopeHash:h('A')}]){
   const r=await client(query).confirm(bad as typeof request);
   expect(r).toEqual({ok:false,outcome:'denied',code:'invalid_schema'});
  }
  expect(query).not.toHaveBeenCalled();
 });
 it('reads the latest checkpoint and the identity state through the client functions only',async()=>{
  const query=vi.fn(async(text:string)=>text.includes('latest_checkpoint')?{rows:[{result:null}]}:{rows:[{result:{database_identity:request.databaseIdentity,store_id:request.storeId,generation:1,durability_ready:true}}]});
  expect(await client(query).latest(request.databaseIdentity,request.ownerScopeHash)).toEqual({ok:true,value:null});
  expect(await client(query).identityState(request.databaseIdentity)).toEqual({ok:true,value:{databaseIdentity:request.databaseIdentity,storeId:request.storeId,generation:1,durabilityReady:true}});
  for(const call of query.mock.calls)expect(call[0]).not.toMatch(/select \* from|update |delete |insert /i);
 });
});
