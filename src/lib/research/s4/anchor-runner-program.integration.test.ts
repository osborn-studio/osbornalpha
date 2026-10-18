import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync,mkdtempSync,appendFileSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {ownedPool,startLocalDatabase,stopLocalDatabase} from '../../../../scripts/s4/local-db';
import {testPack} from '../../../../scripts/s4/test-pack';
import {importCandidate} from './import';
import {transaction,closeS4Pool} from './db';
import {addRecord} from './records';
import {assertCheckpointed} from './anchor-gate';
import {digest} from '../ingest/pa-v1/json.js';
import {checkpointRegistryConfig,createCheckpointRegistry} from './checkpoint-registry';
import {runAnchorCycle,type AnchorRunnerOptions} from './anchor-runner-program';
import type {RunnerManifest} from './anchor-manifest';

// I1.4c: the runner program composes the I1.4a store, the I1.4b scoped functions (runner login,
// no table privileges) and the I1.5 registry client. Uses the shared harness database like the
// runner-function suite and removes every row it registers.
const enabled=!!process.env.S4_TEST_STATE;
const h=(c:string)=>c.repeat(64);
describe.skipIf(!enabled)('anchor runner program on real PostgreSQL',()=>{
 let cluster:Awaited<ReturnType<typeof startLocalDatabase>>|undefined,admin:Pool,runnerPool:Pool,registryAdmin:Pool,registry:ReturnType<typeof createCheckpointRegistry>,candidateId:string,root:string,options:AnchorRunnerOptions;
 const actor={userId:randomUUID(),kind:'agent' as const},stranger={userId:randomUUID(),kind:'agent' as const};
 const principal=randomUUID(),databaseIdentity=randomUUID(),storeId=randomUUID();
 const dbName='alpha_anchor_registry_'+randomBytes(4).toString('hex');
 const observations:string[]=[];
 const manifest=(generation=1):RunnerManifest=>({store_id:storeId,database_identity:databaseIdentity,deployment_generation:generation,authorized_owner_scope:[digest(actor.userId)],format_version:1});
 const outbox=async()=>(await admin.query('select sequence::text as sequence,record_id,anchored_at,receipt_hash from research_s4_outbox where user_id=$1 order by sequence',[actor.userId])).rows;
 const journalLines=()=>{const dir=join(root,digest(actor.userId));return readdirSync(dir).includes('receipts.jsonl')?readFileSync(join(dir,'receipts.jsonl'),'utf8').split('\n').filter(Boolean):[];};
 const asOwner=async(sql:string,values:unknown[]=[])=>{const c=await registryAdmin.connect();try{await c.query('set role alpha_checkpoint_owner');return await c.query(sql,values);}finally{await c.query('reset role').catch(()=>{});c.release();}};
 async function addObservation(i:number){
  const record=await transaction(actor,db=>addRecord(db,actor,candidateId,'Observation',{synthetic:true,index:i,candidate_ref:candidateId,market_policy_hash:digest({synthetic_policy:i})}));
  await admin.query('insert into research_s4_observation_state(user_id,observation_id) values($1,$2)',[actor.userId,record.id]);observations.push(record.id);return record.id;
 }
 beforeAll(async()=>{
  // Own disposable cluster: the singleton runtime identity must not be shared with other suites.
  delete process.env.S4_TEST_STATE;delete process.env.ALPHA_S4_DATABASE_URL;
  cluster=await startLocalDatabase();
  const state={adminUrl:cluster.adminUrl,runtimeUrl:cluster.runtimeUrl};
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  admin=ownedPool({connectionString:state.adminUrl,max:1});
  const runnerPassword=randomBytes(18).toString('hex'),registryPassword=randomBytes(18).toString('hex');
  await admin.query(`create role s4_runner_prog_test login password '${runnerPassword}' nosuperuser nobypassrls inherit; grant alpha_anchor_runner to s4_runner_prog_test`);
  const runnerUrl=new URL(state.adminUrl);runnerUrl.username='s4_runner_prog_test';runnerUrl.password=runnerPassword;
  runnerPool=ownedPool({connectionString:runnerUrl.toString(),max:2});
  // Independent registry: a second database in the owned cluster, installed as its NOLOGIN owner.
  await admin.query(`create database ${dbName}`);
  await admin.query(`do $$ begin
    if not exists(select from pg_roles where rolname='alpha_checkpoint_owner') then create role alpha_checkpoint_owner nologin nosuperuser nobypassrls nocreaterole nocreatedb; end if;
    if not exists(select from pg_roles where rolname='alpha_checkpoint_client') then create role alpha_checkpoint_client nologin nosuperuser nobypassrls nocreaterole nocreatedb; end if;
   end $$`);
  await admin.query(`create role s4_registry_prog_test login password '${registryPassword}' nosuperuser nobypassrls inherit; grant alpha_checkpoint_client to s4_registry_prog_test`);
  const registryUrl=new URL(state.adminUrl);registryUrl.pathname='/'+dbName;
  registryAdmin=ownedPool({connectionString:registryUrl.toString(),max:1});
  await registryAdmin.query(`grant create on database ${dbName} to alpha_checkpoint_owner; grant alpha_checkpoint_owner to s4_admin`);
  const c=await registryAdmin.connect();
  try{await c.query('set role alpha_checkpoint_owner');await c.query(readFileSync('ops/anchor-checkpoint/schema.sql','utf8'));await c.query('reset role');}finally{c.release();}
  await asOwner('select anchor_private.register_identity($1,$2,1)',[databaseIdentity,storeId]);
  registry=createCheckpointRegistry(checkpointRegistryConfig({ALPHA_ANCHOR_REGISTRY_HOST:'127.0.0.1',ALPHA_ANCHOR_REGISTRY_PORT:registryUrl.port,ALPHA_ANCHOR_REGISTRY_DATABASE:dbName,ALPHA_ANCHOR_REGISTRY_USER:'s4_registry_prog_test',ALPHA_ANCHOR_REGISTRY_PASSWORD:registryPassword,ALPHA_ANCHOR_REGISTRY_INSECURE_LOOPBACK:'1'}));
  // Alpha side: identity, principal mapping, an imported candidate and three observations.
  for(const a of [actor,stranger]){await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,a.userId+'@example.test']);await admin.query("update profiles set role='admin' where id=$1",[a.userId]);}
  await admin.query('insert into research_s4_runtime_identity(database_identity,generation) values($1,1)',[databaseIdentity]);
  await admin.query("insert into research_s4_anchor_principals(principal_id,session_role,user_id,environment,generation,valid_until) values($1,'s4_runner_prog_test',$2,'local',1,clock_timestamp()+interval '1 hour')",[principal,actor.userId]);
  await admin.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('S4SYNTH','Synthetic','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
  const pack=testPack(actor.userId);
  await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,pack.binding.approvedPayloadHash,pack.binding]);
  candidateId=(await importCandidate(actor,JSON.stringify(pack.pack))).id;
  for(let i=0;i<3;i++)await addObservation(i);
  root=mkdtempSync(join(tmpdir(),'alpha-anchor-runner-'));
  options={manifest:manifest(),root,principalId:principal,owners:[actor.userId],db:runnerPool,registry,watchdogMs:5000};
 },180000);
 afterAll(async()=>{
  await closeS4Pool();await registry?.close();await runnerPool?.end();await registryAdmin?.end();
  if(admin){for(let i=0;i<50&&Number((await admin.query('select count(*) n from pg_stat_activity where datname=$1',[dbName])).rows[0].n)>0;i++)await new Promise(r=>setTimeout(r,100));await admin.end();}
  if(cluster)stopLocalDatabase(cluster);
 });

 it('drains the whole outbox through the scoped functions, journals receipts, confirms the registry and fills the cache',async()=>{
  const before=await outbox();expect(before.every(r=>r.anchored_at===null)).toBe(true);
  const [result]=await runAnchorCycle(options);
  expect(result).toMatchObject({owner_scope_hash:digest(actor.userId),status:'drained',appended:before.length,acknowledged:before.length,remaining:0,confirmed:{last_sequence:before[before.length-1].sequence}});
  expect(result.lock_hold_ms).toBeGreaterThan(0);
  const after=await outbox();expect(after.every(r=>r.anchored_at!==null&&/^[0-9a-f]{64}$/.test(r.receipt_hash))).toBe(true);
  const lines=journalLines();expect(lines).toHaveLength(before.length);
  expect(JSON.parse(lines[lines.length-1]).receipt_hash).toBe(after[after.length-1].receipt_hash);
  expect(statSync(join(root,digest(actor.userId),'receipts.jsonl')).mode&0o077).toBe(0);
  const latest=await registry.latest(databaseIdentity,digest(actor.userId));
  expect(latest).toMatchObject({ok:true,value:{lastSequence:after[after.length-1].sequence,lastHash:after[after.length-1].receipt_hash,generation:1,storeId}});
  const cache=(await admin.query('select last_sequence::text as last_sequence,last_hash,generation,store_id,principal_id from research_s4_anchor_checkpoints where user_id=$1',[actor.userId])).rows[0];
  expect(cache).toEqual({last_sequence:after[after.length-1].sequence,last_hash:after[after.length-1].receipt_hash,generation:'1',store_id:storeId,principal_id:principal});
  const receipts=(await admin.query("select payload from research_s4_records where user_id=$1 and kind='AnchorReceipt'",[actor.userId])).rows;
  expect(receipts).toHaveLength(before.length);expect(receipts.every(r=>r.payload.execution_principal_id===principal&&r.payload.store_id===storeId)).toBe(true);
  await transaction(actor,async db=>{for(const id of observations)expect(await assertCheckpointed(db,actor,id)).toMatchObject({active:true});});
 });
 it('is idempotent: a second cycle acknowledges nothing and adds no registry row',async()=>{
  const rows=Number((await asOwner('select count(*) n from anchor_private.checkpoints')).rows[0].n);
  const [result]=await runAnchorCycle(options);
  expect(result).toMatchObject({status:'drained',appended:0,acknowledged:0,remaining:0});
  expect(Number((await asOwner('select count(*) n from anchor_private.checkpoints')).rows[0].n)).toBe(rows);
  expect(journalLines()).toHaveLength((await outbox()).length);
 });
 it('anchors new rows incrementally with chain continuity and advances the registry',async()=>{
  const previousTail=(await outbox()).at(-1)!;
  const id=await addObservation(3);
  const [result]=await runAnchorCycle(options);
  expect(result).toMatchObject({status:'drained',appended:1,acknowledged:1,remaining:0});
  const lines=journalLines();const last=JSON.parse(lines[lines.length-1]);
  expect(last.previous_hash).toBe(previousTail.receipt_hash);expect(last.record_id).toBe(id);
  expect(await registry.latest(databaseIdentity,digest(actor.userId))).toMatchObject({ok:true,value:{lastSequence:(await outbox()).at(-1)!.sequence,lastHash:last.receipt_hash}});
  await transaction(actor,async db=>expect(await assertCheckpointed(db,actor,id)).toMatchObject({active:true}));
 });
 it('refuses owners outside the manifest scope and a principal the functions do not recognize',async()=>{
  const [result]=await runAnchorCycle({...options,owners:[stranger.userId]});
  expect(result).toMatchObject({owner_scope_hash:digest(stranger.userId),status:'error',code:'scope_denied',acknowledged:0});
  await addObservation(4);
  const [wrongPrincipal]=await runAnchorCycle({...options,principalId:randomUUID()});
  expect(wrongPrincipal).toMatchObject({status:'error',code:'invalid_schema',acknowledged:0});
  expect((await outbox()).filter(r=>r.anchored_at===null)).toHaveLength(1);
  expect(journalLines()).toHaveLength((await outbox()).length);
 });
 it('pauses on a registry generation advance until the database, mapping and manifest agree',async()=>{
  await asOwner("select anchor_private.advance_generation($1,2,'synthetic runner replacement')",[databaseIdentity]);
  const [paused]=await runAnchorCycle(options);
  expect(paused).toMatchObject({status:'paused',reason:'generation_mismatch',acknowledged:0});
  expect((await outbox()).filter(r=>r.anchored_at===null)).toHaveLength(1);
  await admin.query('update research_s4_runtime_identity set generation=2');
  await admin.query('update research_s4_anchor_principals set generation=2 where principal_id=$1',[principal]);
  const [stale]=await runAnchorCycle(options);
  expect(stale).toMatchObject({status:'paused',reason:'generation_mismatch'});
  options={...options,manifest:manifest(2)};
  const [resumed]=await runAnchorCycle(options);
  expect(resumed).toMatchObject({status:'drained',acknowledged:1,remaining:0,confirmed:{last_sequence:(await outbox()).at(-1)!.sequence}});
 });
 it('reports a tampered journal as an integrity failure without acknowledging or appending',async()=>{
  await addObservation(5);
  const path=join(root,digest(actor.userId),'receipts.jsonl');const before=readFileSync(path,'utf8');
  appendFileSync(path,'{"not":"a receipt"}\n');
  const [result]=await runAnchorCycle(options);
  expect(result).toMatchObject({status:'integrity_failed',acknowledged:0,appended:0});
  expect(readFileSync(path,'utf8')).toBe(before+'{"not":"a receipt"}\n');
  expect((await outbox()).filter(r=>r.anchored_at===null)).toHaveLength(1);
 });
});
