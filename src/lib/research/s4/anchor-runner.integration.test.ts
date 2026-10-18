import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {testPack} from '../../../../scripts/s4/test-pack';
import {importCandidate} from './import';
import {transaction,closeS4Pool} from './db';
import {addRecord} from './records';
import {canonicalize,digest} from '../ingest/pa-v1/json.js';
import {assertCheckpointed,anchorGateActive} from './anchor-gate';

// I1.4b: the anchor runner reaches the database only through four SECURITY DEFINER
// functions owned by alpha_anchor_fn_owner. The runner login has no table privileges,
// every function resolves its principal from session_user, and acknowledgements are
// fenced by the registered runtime identity generation (ADR 2026-10-18 §4, 06 §D).
const enabled=!!process.env.S4_TEST_STATE;
const ZERO='0'.repeat(64);
describe.skipIf(!enabled)('anchor runner functions on real PostgreSQL',()=>{
 let admin:Pool,runner:Pool,candidateId:string;
 const actor={userId:randomUUID(),kind:'agent' as const},other={userId:randomUUID(),kind:'agent' as const};
 const principal=randomUUID(),databaseIdentity=randomUUID(),storeId=randomUUID();
 const observations:string[]=[];
 const outbox=async(userId=actor.userId)=>(await admin.query('select sequence,record_id,event,event_hash,anchored_at,receipt_hash from research_s4_outbox where user_id=$1 order by sequence',[userId])).rows;
 const asRunner=async<T>(fn:(db:PoolClient)=>Promise<T>)=>{const db=await runner.connect();try{await db.query('begin');const r=await fn(db);await db.query('commit');return r;}catch(e){await db.query('rollback').catch(()=>{});throw e;}finally{db.release();}};
 const receiptFor=(row:any,previous:string)=>{const body={sequence:String(row.sequence),owner_scope_hash:digest(actor.userId),record_id:row.record_id,event_hash:row.event_hash,previous_hash:previous,exported_at:new Date().toISOString(),provenance_level:'local_receipt'};return {...body,receipt_hash:digest(body)};};
 const ack=(db:PoolClient,row:any,receipt:any,generation=1,overrides:Record<string,unknown>={})=>db.query('select * from public.research_s4_anchor_ack($1,$2,$3,$4,$5,$6,$7,$8,$9)',[
  overrides.owner??actor.userId,generation,String(row.sequence),overrides.event_hash??row.event_hash,receipt.receipt_hash,receipt.previous_hash,storeId,
  canonicalize({...receipt,store_id:storeId,execution_principal_id:principal}),digest({...receipt,store_id:storeId,execution_principal_id:principal})]);
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  admin=new Pool({connectionString:state.adminUrl});
  const password=randomBytes(18).toString('hex'),url=new URL(state.adminUrl);url.username='s4_anchor_test';url.password=password;
  await admin.query(`create role s4_anchor_test login password '${password}' nosuperuser nobypassrls inherit; grant alpha_anchor_runner to s4_anchor_test`);
  runner=new Pool({connectionString:url.toString(),max:2});
  for(const a of [actor,other]){await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,a.userId+'@example.test']);await admin.query("update profiles set role='admin' where id=$1",[a.userId]);}
  await admin.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('S4SYNTH','Synthetic','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
  const pack=testPack(actor.userId);
  await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,pack.binding.approvedPayloadHash,pack.binding]);
  candidateId=(await importCandidate(actor,JSON.stringify(pack.pack))).id;
  for(let i=0;i<3;i++){
   const record=await transaction(actor,db=>addRecord(db,actor,candidateId,'Observation',{synthetic:true,index:i,candidate_ref:candidateId,market_policy_hash:digest({synthetic_policy:i})}));
   await admin.query('insert into research_s4_observation_state(user_id,observation_id) values($1,$2)',[actor.userId,record.id]);observations.push(record.id);
  }
 });
 afterAll(async()=>{await closeS4Pool();await runner?.end();await admin?.end();});

 it('runner login holds no table privileges and the gate is inactive before identity registration',async()=>{
  await expect(asRunner(db=>db.query('select * from public.research_s4_outbox'))).rejects.toThrow(/permission denied/);
  await expect(asRunner(db=>db.query("insert into public.research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash) values($1,$2,$3,'Decision','{}',$4)",[actor.userId,randomUUID(),candidateId,ZERO]))).rejects.toThrow(/permission denied/);
  await expect(asRunner(db=>db.query('set role alpha_anchor_fn_owner'))).rejects.toThrow(/permission denied/);
  await expect(asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[actor.userId,1]))).rejects.toThrow(/anchor_principal_denied/);
  await transaction(actor,async db=>{expect(await anchorGateActive(db)).toBe(false);expect(await assertCheckpointed(db,actor,observations[0])).toEqual({active:false});});
 });

 it('registers identity and principal; mapping, expiry and generation are enforced per call',async()=>{
  await admin.query('insert into research_s4_runtime_identity(database_identity,generation) values($1,1)',[databaseIdentity]);
  await expect(asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[actor.userId,1]))).rejects.toThrow(/anchor_principal_denied/);
  await admin.query("insert into research_s4_anchor_principals(principal_id,session_role,user_id,environment,generation,valid_until) values($1,'s4_anchor_test',$2,'local',1,clock_timestamp()+interval '1 hour')",[principal,actor.userId]);
  const tail=(await asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[actor.userId,1]))).rows[0];
  expect(tail).toMatchObject({last_anchored_sequence:null,last_receipt_hash:null,checkpoint_sequence:null,database_identity:databaseIdentity,generation:'1'});
  expect(Number(tail.last_sequence)).toBeGreaterThan(0);
  await expect(asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[other.userId,1]))).rejects.toThrow(/anchor_principal_denied/);
  await expect(asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[actor.userId,2]))).rejects.toThrow(/anchor_generation_fenced/);
  // A caller-preset GUC is never an authority: tables stay closed and the mapping still decides.
  await expect(asRunner(async db=>{await db.query("select set_config('alpha.anchor_owner',$1,true)",[other.userId]);return db.query('select * from public.research_s4_anchor_tail($1,$2)',[other.userId,1]);})).rejects.toThrow(/anchor_principal_denied/);
  await admin.query("update research_s4_anchor_principals set valid_until=clock_timestamp()-interval '1 second' where principal_id=$1",[principal]);
  await expect(asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[actor.userId,1]))).rejects.toThrow(/anchor_principal_denied/);
  await admin.query("update research_s4_anchor_principals set valid_until=clock_timestamp()+interval '1 hour' where principal_id=$1",[principal]);
 });

 it('reads the outbox through the function with a bounded limit and no cross-owner rows',async()=>{
  const rows=(await asRunner(db=>db.query('select * from public.research_s4_anchor_read_outbox($1,$2,$3,$4)',[actor.userId,1,'0',500]))).rows;
  expect(rows.length).toBe((await outbox()).length);expect(rows.every(r=>r.anchored_at===null)).toBe(true);
  await expect(asRunner(db=>db.query('select * from public.research_s4_anchor_read_outbox($1,$2,$3,$4)',[actor.userId,1,'0',501]))).rejects.toThrow(/input_limit/);
  await expect(asRunner(db=>db.query('select * from public.research_s4_anchor_read_outbox($1,$2,$3,$4)',[other.userId,1,'0',10]))).rejects.toThrow(/anchor_principal_denied/);
 });

 let firstObs:any,secondObs:any,confirmedHash='';
 it('acknowledges in chain order, rejects hash conflicts and out-of-order or re-acknowledged sequences, and records the execution principal',async()=>{
  const rows=await outbox();const k=rows.findIndex(r=>r.event.kind==='Observation');expect(k).toBeGreaterThanOrEqual(1);
  // Import events precede the observations; the chain must be acknowledged from the first row.
  let previous=ZERO;
  await expect(asRunner(db=>ack(db,rows[k],receiptFor(rows[k],previous)))).rejects.toThrow(/anchor_order_violation/);
  for(const row of rows.slice(0,k)){const r=receiptFor(row,previous);expect((await asRunner(db=>ack(db,row,r))).rows[0]).toMatchObject({acknowledged:true,duplicate:false});previous=r.receipt_hash;}
  firstObs=rows[k];secondObs=rows[k+1];
  const r1=receiptFor(firstObs,previous);
  await expect(asRunner(db=>ack(db,secondObs,receiptFor(secondObs,r1.receipt_hash)))).rejects.toThrow(/anchor_order_violation/);
  await expect(asRunner(db=>ack(db,firstObs,r1,1,{event_hash:'f'.repeat(64)}))).rejects.toThrow(/anchor_hash_conflict/);
  await expect(asRunner(db=>ack(db,firstObs,r1,2))).rejects.toThrow(/anchor_generation_fenced/);
  expect((await asRunner(db=>ack(db,firstObs,r1))).rows[0]).toMatchObject({acknowledged:true,duplicate:false});
  expect((await asRunner(db=>ack(db,firstObs,r1))).rows[0]).toMatchObject({acknowledged:false,duplicate:true});
  await expect(asRunner(db=>ack(db,firstObs,{...r1,receipt_hash:'e'.repeat(64)}))).rejects.toThrow(/anchor_hash_conflict/);
  const after=(await outbox()).find(r=>r.sequence===firstObs.sequence)!;expect(after.receipt_hash).toBe(r1.receipt_hash);expect(after.anchored_at).not.toBeNull();
  const state=(await admin.query('select anchor_status,revision from research_s4_observation_state where user_id=$1 and observation_id=$2',[actor.userId,firstObs.record_id])).rows[0];
  expect(state).toEqual({anchor_status:'anchored',revision:1});
  const receipt=(await admin.query("select payload,payload_hash from research_s4_records where user_id=$1 and kind='AnchorReceipt' and payload->>'record_id'=$2",[actor.userId,firstObs.record_id])).rows[0];
  expect(receipt.payload).toMatchObject({execution_principal_id:principal,store_id:storeId,receipt_hash:r1.receipt_hash,provenance_level:'local_receipt'});
  expect(digest(receipt.payload)).toBe(receipt.payload_hash);
  const audit=(await admin.query("select actor,action,detail from research_audit_log where user_id=$1 and action='s4.AnchorReceipt'",[actor.userId])).rows;
  expect(audit).toHaveLength(k+1);expect(audit[0]).toMatchObject({actor:'agent'});expect(audit[0].detail).toMatchObject({execution_principal_id:principal});
  // The wrong previous hash for the next row is a chain break, not an acknowledgement.
  await expect(asRunner(db=>ack(db,secondObs,receiptFor(secondObs,ZERO)))).rejects.toThrow(/anchor_order_violation/);
  const r2=receiptFor(secondObs,r1.receipt_hash);
  expect((await asRunner(db=>ack(db,secondObs,r2))).rows[0]).toMatchObject({acknowledged:true});confirmedHash=r2.receipt_hash;
 });

 it('confirms checkpoints monotonically and only for anchored sequences of the registered identity',async()=>{
  const rows=await outbox();const pending=rows.find(r=>!r.anchored_at)!;const first=rows.find(r=>r.sequence===firstObs.sequence)!,second=rows.find(r=>r.sequence===secondObs.sequence)!;
  const confirm=(db:PoolClient,sequence:string,hash:string,identity=databaseIdentity,store=storeId)=>db.query('select * from public.research_s4_anchor_confirm_checkpoint($1,$2,$3,$4,$5,$6)',[actor.userId,1,store,identity,sequence,hash]);
  await expect(asRunner(db=>confirm(db,String(pending.sequence),'a'.repeat(64)))).rejects.toThrow(/anchor_checkpoint_unanchored/);
  await expect(asRunner(db=>confirm(db,String(first.sequence),'a'.repeat(64)))).rejects.toThrow(/anchor_hash_conflict/);
  await expect(asRunner(db=>confirm(db,String(first.sequence),first.receipt_hash,randomUUID()))).rejects.toThrow(/anchor_identity_mismatch/);
  expect((await asRunner(db=>confirm(db,String(second.sequence),second.receipt_hash))).rows[0]).toMatchObject({confirmed:true});
  await expect(asRunner(db=>confirm(db,String(first.sequence),first.receipt_hash))).rejects.toThrow(/anchor_checkpoint_regression/);
  expect((await asRunner(db=>confirm(db,String(second.sequence),second.receipt_hash))).rows[0]).toMatchObject({confirmed:true});
  await expect(asRunner(db=>confirm(db,String(second.sequence),second.receipt_hash,databaseIdentity,randomUUID()))).rejects.toThrow(/anchor_store_mismatch/);
  const tail=(await asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[actor.userId,1]))).rows[0];
  expect(tail).toMatchObject({last_anchored_sequence:String(second.sequence),last_receipt_hash:confirmedHash,checkpoint_sequence:String(second.sequence)});
 });

 it('gates evaluation on anchored and checkpoint-confirmed sequences once identity is registered',async()=>{
  const rows=await outbox();const pending=rows.find(r=>!r.anchored_at)!;
  await transaction(actor,async db=>{
   expect(await anchorGateActive(db)).toBe(true);
   expect(await assertCheckpointed(db,actor,secondObs.record_id)).toMatchObject({active:true,sequence:String(secondObs.sequence)});
   await expect(assertCheckpointed(db,actor,pending.record_id)).rejects.toThrow('anchor_checkpoint_pending');
  });
  // Anchored but not yet confirmed: still pending for evaluation.
  const r3=receiptFor(pending,confirmedHash);
  expect((await asRunner(db=>ack(db,pending,r3))).rows[0]).toMatchObject({acknowledged:true});
  await transaction(actor,async db=>{await expect(assertCheckpointed(db,actor,pending.record_id)).rejects.toThrow('anchor_checkpoint_pending');});
  await transaction(other,async db=>{await expect(assertCheckpointed(db,other,secondObs.record_id)).rejects.toThrow('anchor_checkpoint_pending');});
 });

 it('refuses a runner whose generation was fenced out after a registered generation advance',async()=>{
  await admin.query('update research_s4_runtime_identity set generation=2');
  await expect(asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[actor.userId,1]))).rejects.toThrow(/anchor_generation_fenced/);
  await expect(asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[actor.userId,2]))).rejects.toThrow(/anchor_generation_fenced/);
  await admin.query('update research_s4_anchor_principals set generation=2 where principal_id=$1',[principal]);
  expect((await asRunner(db=>db.query('select * from public.research_s4_anchor_tail($1,$2)',[actor.userId,2]))).rows[0]).toMatchObject({generation:'2'});
 });
});
