// src/lib/judgments/db.test.ts
// memoryJudgmentsDb against the shared contract, memory-only behaviour (injectable clock, lease
// expiry, serialised operations), and the supabaseJudgmentsDb wiring over stub clients: which client
// (anon vs admin) each method uses, RPC names and argument names, request_digest from
// operationDigest, row normalisation, error mapping.
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import type {TableClient} from '../db/table-client';
import {startBatch} from '../dq/batches';
import {calibrationFixture,judgmentFixture,judgmentsDbContract,methodologyFixture,settlementFixture} from './db-contract';
import {envelopeFromRpc,supabaseJudgmentsDb,toJudgmentError,transitionAllowed} from './db';
import {JudgmentError} from './errors';
import {memoryJudgmentsDb} from './memory-judgments-db';
import {PUBLIC_RPC_NAMES,SERVICE_RPC_NAMES} from './rpc-inventory';
import {operationDigest} from './settlement-digest';

judgmentsDbContract('memoryJudgmentsDb contract',async()=>{
 const db=memoryJudgmentsDb();
 return {db,tables:db.tables,
  batch:async()=>(await startBatch(db.tables,{producer:'ts-judgments',dataset:'judgments.ztest'})).batchId,
  issuer:async(o={})=>{const id=randomUUID();db.addIssuer(id,o.status??'active',o.mergedInto??null);return id;},
  industry:async()=>{const code=randomUUID().slice(0,8);db.addIndustry('custom','ztest',code);return `custom:ztest:${code}`;},
  adminUser:async()=>randomUUID(),
  exclusiveClaims:fn=>fn()};
});

describe('memoryJudgmentsDb specifics',()=>{
 it('uses the injected clock for registered_at, due-ness and leases; expireLease frees a lease without changing its token',async()=>{
  const db=memoryJudgmentsDb();const m=methodologyFixture();
  db.setNow('2026-03-01T00:00:00.000Z');
  await db.syncMethodology(m,'script',null);
  const {batchId:b}=await startBatch(db.tables,{producer:'ts-judgments',dataset:'judgments.ztest'});
  const f=judgmentFixture(m,b,{as_of:'2026-03-01',target:{kind:'date',date:'2026-03-10'}});
  expect(await db.registerJudgment(f.row,f.queue)).toEqual({registered_at:'2026-03-01T00:00:00.000Z',retrospective:false});
  expect(await db.claimDue(10,600)).toEqual([]);
  db.setNow('2026-03-10T00:00:00.000Z');
  const [q]=await db.claimDue(10,600);
  expect(q).toMatchObject({judgment_id:f.row.judgment_id,leased_until:'2026-03-10T00:10:00.000Z'});
  expect(await db.claimDue(10,600)).toEqual([]);
  db.expireLease(f.row.judgment_id);
  const [q2]=await db.claimDue(10,600);
  expect(q2.lease_token).not.toBe(q.lease_token);
  await expect(db.releaseLease(f.row.judgment_id,q.lease_token!,{last_status:'pending',last_detail:{},next_attempt_at:'2026-03-01T00:00:00.000Z',attempts_increment:0})).rejects.toMatchObject({code:'lease_lost'});
  await db.releaseLease(f.row.judgment_id,q2.lease_token!,{last_status:'pending',last_detail:{},next_attempt_at:'2026-03-01T00:00:00.000Z',attempts_increment:0});
  expect((await db.queueRow(f.row.judgment_id))!.next_attempt_at).toBe('2026-03-10T00:00:00.000Z');   // clamped to the clock
  expect(db.snapshot().judgments.map(j=>j.judgment_id)).toEqual([f.row.judgment_id]);
 });
 it('serialises operations like row locks: two concurrent settlements of one judgment give applied + already_final',async()=>{
  const db=memoryJudgmentsDb();const m=methodologyFixture();await db.syncMethodology(m,'script',null);
  const {batchId:b}=await startBatch(db.tables,{producer:'ts-judgments',dataset:'judgments.ztest'});
  const f=judgmentFixture(m,b,{target:{kind:'date',date:'2026-01-10'}});await db.registerJudgment(f.row,f.queue);
  const [q]=await db.claimDue(10,600);const row=settlementFixture(b);
  const out=await Promise.all([db.appendSettlement(q.judgment_id,q.lease_token,'key-aaaaaaaa',row),db.appendSettlement(q.judgment_id,q.lease_token,'key-bbbbbbbb',row)]);
  expect(out.map(o=>o.status).sort()).toEqual(['already_final','applied']);
  expect((await db.settlementsOf([q.judgment_id])).length).toBe(1);
 });
 it('refuses table-constraint violations the database would refuse (unknown + constraint name)',async()=>{
  const db=memoryJudgmentsDb();const m=methodologyFixture();await db.syncMethodology(m,'script',null);
  const {batchId:b}=await startBatch(db.tables,{producer:'ts-judgments',dataset:'judgments.ztest'});
  const f=judgmentFixture(m,b);
  await expect(db.registerJudgment({...f.row,batch_id:randomUUID()},f.queue)).rejects.toMatchObject({code:'unknown',message:'judgments_batch_id_fkey'});
  await expect(db.registerJudgment({...f.row,code_version:'abc'},f.queue)).rejects.toMatchObject({code:'unknown',message:'judgments_code_version_check'});
  await expect(db.registerJudgment({...f.row,claim:null},f.queue)).rejects.toMatchObject({code:'unknown',message:'judgments_active_shape'});
  await expect(db.insertCalibration({...calibrationFixture(m,b,1),kind:'score',state:'calibrated'},1)).rejects.toMatchObject({code:'unknown',message:'judgment_calibrations_state_by_kind'});
  await expect(db.syncMethodology({...methodologyFixture(),methodology_id:'Bad-Id'},'script',null)).rejects.toMatchObject({code:'unknown',message:'judgment_methodologies_methodology_id_check'});
  await expect(db.syncMethodology(methodologyFixture(),'cron',null)).rejects.toMatchObject({code:'unknown',message:'judgment_methodology_events_actor_check'});
 });
});

describe('transitionAllowed (settlement_sequence twin)',()=>{
 it('matches the trigger table of spec §5.3',()=>{
  const A='admin:00000000-0000-4000-8000-000000000001';
  const ok:[string|null,string,string][]=[[null,'settled','cron'],[null,'void','script'],['void','reopened',A],['reopened','settled','cron'],['reopened','void','cron'],['settled','withdrawn',A],['withdrawn','reopened',A]];
  const no:[string|null,string,string][]=[[null,'withdrawn',A],[null,'reopened',A],['void','reopened','cron'],['void','settled','cron'],['settled','settled','cron'],['settled','withdrawn','cron'],['withdrawn','settled',A],['withdrawn','reopened','script'],['reopened','withdrawn',A]];
  for(const [p,n,a] of ok)expect({p,n,a,r:transitionAllowed(p as never,n as never,a)}).toEqual({p,n,a,r:true});
  for(const [p,n,a] of no)expect({p,n,a,r:transitionAllowed(p as never,n as never,a)}).toEqual({p,n,a,r:false});
 });
});

type Call={fn:string;args:Record<string,unknown>};
/** A stub SupabaseClient: rpc answers from `rpc` (an Error answers as a PostgREST error); from() is a chainable builder recording its calls. */
function stub(rpc:Record<string,unknown>={},tables:Record<string,unknown[]>={},cap=Infinity){
 const calls:Call[]=[];const reads:{table:string;ops:string[]}[]=[];
 const builder=(table:string)=>{
  const rec={table,ops:[] as string[]};reads.push(rec);
  const handler:ProxyHandler<object>={get:(_t,p)=>p==='then'
   ?(ok:(v:unknown)=>unknown,ko:(e:unknown)=>unknown)=>Promise.resolve({data:tables[table]??[],error:null}).then(ok,ko)
   :(...a:unknown[])=>{rec.ops.push(`${String(p)}(${a.map(x=>JSON.stringify(x)).join(',')})`);return proxy;}};
  const proxy:object=new Proxy({},handler);
  return proxy;
 };
 const client={
  // rpc() answers like a PostgREST builder: awaiting it gives the (capped) result, .range(a,b) gives that window of it (max_rows = cap).
  rpc:(fn:string,args:Record<string,unknown>)=>{
   calls.push({fn,args});const r=rpc[fn];
   const answer=(from:number,to:number)=>Promise.resolve(r instanceof Error?{data:null,error:{message:r.message,code:(r as Error&{code?:string}).code??null}}:{data:r===undefined?null:Array.isArray(r)?r.slice(from,Math.min(to+1,from+cap)):r,error:null});
   const b={then:(ok:(v:unknown)=>unknown,ko:(e:unknown)=>unknown)=>answer(0,Number.MAX_SAFE_INTEGER).then(ok,ko),range:(from:number,to:number)=>answer(from,to)};
   return b;
  },
  from:builder,
 };
 return {client:client as unknown as SupabaseClient,calls,reads};
}
const pgErr=(message:string,code:string)=>Object.assign(new Error(message),{code});
const TS='2026-11-06T03:00:00.123456+00:00';
const J='e1b53b0d-831f-8a78-a4ce-42858ea12057';
const JUDGMENT={judgment_id:J,subject_type:'macro_region',subject_key:'US',judgment_type:'synthetic_fact_metric',methodology_id:'ztest_m',methodology_version:'v1',kind:'probability',producer_kind:'rule',producer_ref:{},producer_nonce:'',as_of:'2026-11-06',registered_at:TS,retrospective:false,inputs:[],inputs_hash:'a'.repeat(64),abstained:true,abstain_reason:'no_inputs',claim:null,condition:null,horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null,code_version:'abcdef1',batch_id:'0b0e1d8e-0000-4000-8000-000000000001',created_at:TS};
const EVENT={event_id:'0b0e1d8e-0000-4000-8000-000000000002',methodology_id:'ztest_m',version:'v1',seq:'3',event:'resynced',status:'active',publishable:false,formula_hash:'b'.repeat(64),code_version:'abcdef1',actor:'script',reason:null,occurred_at:TS};
const NULL_EVENT={event_id:null,methodology_id:null,version:null,seq:null,event:null,status:null,publishable:null,formula_hash:null,code_version:null,actor:null,reason:null,occurred_at:null};

describe('supabaseJudgmentsDb wiring',()=>{
 it('normalises an envelope: ISO millisecond timestamps, null composites, numeric strings',()=>{
  const e=envelopeFromRpc({judgment:JUDGMENT,settlement:null,calibration:null,calibration_valid:false,methodology_state:EVENT});
  expect(e.judgment.registered_at).toBe('2026-11-06T03:00:00.123Z');
  expect(e).toMatchObject({settlement:null,calibration:null,calibration_valid:false,methodology_state:{seq:3,occurred_at:'2026-11-06T03:00:00.123Z'}});
  expect(envelopeFromRpc({judgment:JUDGMENT,settlement:null,calibration:null,calibration_valid:null,methodology_state:NULL_EVENT}).methodology_state).toBeNull();
 });
 it('routes public reads to the anon client with the migration argument names',async()=>{
  const a=stub({judgments_server_time:TS,latest_judgment_cards:[{judgment:JUDGMENT,settlement:null,calibration:null,calibration_valid:false,methodology_state:EVENT}],judgment_history:[],calibration_cohort:[],methodology_state_at:NULL_EVENT,judgment_envelope_by_id:[]},{judgment_methodologies:[],judgment_calibrations:[]});
  const s=stub();
  const db=supabaseJudgmentsDb({anon:a.client,admin:s.client});
  expect(await db.serverTime()).toBe('2026-11-06T03:00:00.123Z');
  expect((await db.latestCards({type:'issuer',key:J},{view:'latest'})).map(x=>x.judgment.judgment_id)).toEqual([J]);
  await db.latestCards({type:'macro_region',key:'US'},{view:'as_known',cutoff:'2026-11-01T23:59:59.999Z',types:['macro_regime']});
  await db.historyOf({type:'macro_region',key:'US'},'macro_regime',{id:'macro_regime',version:'v1'},{view:'latest',limit:50,before:J});
  await db.calibrationCohort('macro_regime','v1',{from:'2023-01-01',to:'2026-01-01'},'2026-11-06T00:00:00.000Z',null,500);
  expect(await db.methodologyStateAt('macro_regime','v1','2026-11-06T00:00:00.000Z')).toBeNull();
  expect(await db.envelopeById(J,{view:'as_known',cutoff:'2026-11-06T00:00:00.000Z'})).toBeNull();
  await db.listMethodologies('active');
  expect(await db.latestCalibration('macro_regime','v1',{scope_type:'all',scope_key:''})).toBeNull();
  expect(a.calls).toEqual([
   {fn:'judgments_server_time',args:{}},
   {fn:'latest_judgment_cards',args:{p_subject_type:'issuer',p_subject_key:J,p_types:null,p_view:'latest',p_cutoff:null}},   // page 1
   {fn:'latest_judgment_cards',args:{p_subject_type:'issuer',p_subject_key:J,p_types:null,p_view:'latest',p_cutoff:null}},   // the empty page that ends the drain (E-02)
   {fn:'latest_judgment_cards',args:{p_subject_type:'macro_region',p_subject_key:'US',p_types:['macro_regime'],p_view:'as_known',p_cutoff:'2026-11-01T23:59:59.999Z'}},
   {fn:'latest_judgment_cards',args:{p_subject_type:'macro_region',p_subject_key:'US',p_types:['macro_regime'],p_view:'as_known',p_cutoff:'2026-11-01T23:59:59.999Z'}},
   {fn:'judgment_history',args:{p_subject_type:'macro_region',p_subject_key:'US',p_type:'macro_regime',p_methodology:'macro_regime',p_version:'v1',p_view:'latest',p_cutoff:null,p_before:J,p_limit:50}},
   {fn:'calibration_cohort',args:{p_methodology:'macro_regime',p_version:'v1',p_window_from:'2023-01-01',p_window_to:'2026-01-01',p_cutoff:'2026-11-06T00:00:00.000Z',p_after:null,p_limit:500}},
   {fn:'methodology_state_at',args:{p_methodology:'macro_regime',p_version:'v1',p_cutoff:'2026-11-06T00:00:00.000Z'}},
   {fn:'judgment_envelope_by_id',args:{p_id:J,p_view:'as_known',p_cutoff:'2026-11-06T00:00:00.000Z'}},
  ]);
  expect(a.reads.map(r=>r.table)).toEqual(['judgment_methodologies','judgment_calibrations']);
  expect(a.reads[0].ops).toContain('eq("status","active")');
  expect(s.calls).toEqual([]);expect(s.reads).toEqual([]);
 });
 it('routes writes and service reads to the admin client; append_settlement carries operationDigest',async()=>{
  const a=stub({judgments_server_time:TS});
  const Q=(id:string,next:string)=>({judgment_id:id,settle_after:TS,settle_by:TS,label_policy:'first_observed',next_attempt_at:next,attempts:0,last_status:null,last_detail:{},leased_until:TS,lease_token:'0b0e1d8e-0000-4000-8000-0000000000aa',override:null,closed_at:null,updated_at:TS});
  const s=stub({register_judgment:{judgment_id:J,registered_at:TS,retrospective:true},append_settlement:{seq:2,status:'applied'},claim_due_judgments:[Q('b',TS),Q('a',TS),Q('c','2026-01-01T00:00:00+00:00')],release_lease:null,
   calibration_cohort_internal:[],sync_methodology:{changed:false,seq:3},insert_calibration:'stale_revision',set_job_state:{ok:true,updated_at:'2026-11-06T03:00:00.123456+00:00'},claim_judgment:{status:'claimed',lease_token:'0b0e1d8e-0000-4000-8000-0000000000aa',row:Q('a',TS)},repair_stale_batches:2,apply_quarantine_override:'stale',
   reject_quarantined_settlement:{seq:3,status:'applied'},freeze_calibration_cohort:{status:'already_frozen',frozen_at:'2026-11-06T03:00:00.123456+00:00',n:'7'},calibration_cohort_members:[],clear_calibration_generation:7,
   quarantine_settlement:{status:'quarantined',quarantine_id:'0b0e1d8e-0000-4000-8000-0000000000bb'}},{judgment_settle_queue:[]});
  const db=supabaseJudgmentsDb({anon:a.client,admin:s.client});
  const m=methodologyFixture();const f=judgmentFixture(m,'0b0e1d8e-0000-4000-8000-000000000001');
  expect(await db.registerJudgment(f.row,f.queue)).toEqual({registered_at:'2026-11-06T03:00:00.123Z',retrospective:true});
  const row=settlementFixture('0b0e1d8e-0000-4000-8000-000000000001');
  expect(await db.appendSettlement(J,null,'adm:key-0001',row)).toEqual({seq:2,status:'applied'});
  expect((await db.claimDue(20,600)).map(q=>q.judgment_id)).toEqual(['c','a','b']);
  await db.releaseLease(J,'0b0e1d8e-0000-4000-8000-0000000000aa',{last_status:'pending',last_detail:{},next_attempt_at:TS,attempts_increment:0});
  await db.calibrationCohortInternal('m','v1',{from:'2023-01-01',to:'2026-01-01'},TS,J,10);
  expect(await db.syncMethodology(m,'script','why')).toEqual({changed:false,seq:3});
  const cal=calibrationFixture(m,'0b0e1d8e-0000-4000-8000-000000000001',4);
  expect(await db.insertCalibration(cal,4)).toBe('stale_revision');
  expect(await db.setJobState('produce:m@v1',null,{x:1})).toEqual({ok:true,updated_at:'2026-11-06T03:00:00.123Z'});
  expect(await db.claimOne('a',600)).toMatchObject({status:'claimed',lease_token:'0b0e1d8e-0000-4000-8000-0000000000aa',row:{judgment_id:'a'}});
  expect(await db.repairStaleBatches('judgments.settle',900)).toBe(2);
  const override={reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched' as const,evidence_hash:'e'.repeat(64),evidence:{}},evidence_hash:'e'.repeat(64),resolved_by:J,at:TS,cutoff:TS};
  expect(await db.applyQuarantineOverride(J,override,'0b0e1d8e-0000-4000-8000-0000000000bb',{route:'x'})).toBe('stale');
  const voidRow=settlementFixture('0b0e1d8e-0000-4000-8000-000000000001',{kind:'void',outcome:null,realized:null,reason:'quarantine_rejected',actor:`admin:${J}`});
  expect(await db.rejectQuarantinedSettlement(J,'0b0e1d8e-0000-4000-8000-0000000000bb',{evidence_hash:'e'.repeat(64),cutoff:TS},'adm:key-0002',voidRow,{route:'x'})).toEqual({seq:3,status:'applied'});
  expect(await db.freezeCalibrationCohort('0b0e1d8e-0000-4000-8000-0000000000cc','m','v1',{from:'2023-01-01',to:'2026-01-01'})).toEqual({status:'already_frozen',frozen_at:'2026-11-06T03:00:00.123Z',n:7});
  await db.cohortMembers('0b0e1d8e-0000-4000-8000-0000000000cc',J,10);
  expect(await db.clearCalibrationGeneration('0b0e1d8e-0000-4000-8000-0000000000cc')).toBe(7);
  const qpatch={last_status:'inconsistent' as const,last_detail:{evidence_hash:'e'.repeat(64),cutoff:TS},next_attempt_at:TS,attempts_increment:0 as const};
  expect(await db.quarantineSettlement(J,'0b0e1d8e-0000-4000-8000-0000000000aa','settlement_basis_mismatch',{evidence_hash:'e'.repeat(64),cutoff:TS},qpatch,'0b0e1d8e-0000-4000-8000-000000000001')).toEqual({status:'quarantined',quarantine_id:'0b0e1d8e-0000-4000-8000-0000000000bb'});
  await db.queueList({filter:'due',limit:10,after:J});
  expect(s.calls).toEqual([
   {fn:'register_judgment',args:{p_row:f.row,p_queue:f.queue}},
   {fn:'append_settlement',args:{p_judgment_id:J,p_lease_token:null,p_request_key:'adm:key-0001',p_row:{...row,request_digest:operationDigest(J,row)}}},
   {fn:'claim_due_judgments',args:{p_limit:20,p_lease_seconds:600}},
   {fn:'release_lease',args:{p_judgment_id:J,p_lease_token:'0b0e1d8e-0000-4000-8000-0000000000aa',p_patch:{last_status:'pending',last_detail:{},next_attempt_at:TS,attempts_increment:0}}},
   {fn:'calibration_cohort_internal',args:{p_methodology:'m',p_version:'v1',p_window_from:'2023-01-01',p_window_to:'2026-01-01',p_cutoff:TS,p_after:J,p_limit:10}},
   {fn:'sync_methodology',args:{p_row:m,p_actor:'script',p_reason:'why'}},
   {fn:'insert_calibration',args:{p_row:cal,p_expected_revision:4}},
   {fn:'set_job_state',args:{p_job:'produce:m@v1',p_expected_updated_at:null,p_state:{x:1}}},
   {fn:'claim_judgment',args:{p_judgment_id:'a',p_lease_seconds:600}},
   {fn:'repair_stale_batches',args:{p_dataset:'judgments.settle',p_older_than:'900 seconds'}},
   {fn:'apply_quarantine_override',args:{p_judgment_id:J,p_override:override,p_quarantine_id:'0b0e1d8e-0000-4000-8000-0000000000bb',p_audit:{route:'x'}}},
   {fn:'reject_quarantined_settlement',args:{p_judgment_id:J,p_quarantine_id:'0b0e1d8e-0000-4000-8000-0000000000bb',p_expected:{evidence_hash:'e'.repeat(64),cutoff:TS},p_request_key:'adm:key-0002',p_row:{...voidRow,request_digest:operationDigest(J,voidRow)},p_audit:{route:'x'}}},
   {fn:'freeze_calibration_cohort',args:{p_generation:'0b0e1d8e-0000-4000-8000-0000000000cc',p_methodology:'m',p_version:'v1',p_window_from:'2023-01-01',p_window_to:'2026-01-01'}},
   {fn:'calibration_cohort_members',args:{p_generation:'0b0e1d8e-0000-4000-8000-0000000000cc',p_after:J,p_limit:10}},
   {fn:'clear_calibration_generation',args:{p_generation:'0b0e1d8e-0000-4000-8000-0000000000cc'}},
   {fn:'quarantine_settlement',args:{p_judgment_id:J,p_lease_token:'0b0e1d8e-0000-4000-8000-0000000000aa',p_reason_code:'settlement_basis_mismatch',p_payload:{evidence_hash:'e'.repeat(64),cutoff:TS},p_patch:qpatch,p_batch_id:'0b0e1d8e-0000-4000-8000-000000000001'}},
  ]);
  // Q1-06: the admin client calls only service RPCs, the anon client only public ones — both checked against the one inventory.
  for(const c of s.calls)expect({fn:c.fn,service:(SERVICE_RPC_NAMES as readonly string[]).includes(c.fn)}).toEqual({fn:c.fn,service:true});
  for(const c of a.calls)expect({fn:c.fn,public:(PUBLIC_RPC_NAMES as readonly string[]).includes(c.fn)}).toEqual({fn:c.fn,public:true});
  expect(s.reads.map(r=>r.table)).toEqual(['judgment_settle_queue']);
  expect(s.reads[0].ops).toEqual(expect.arrayContaining(['is("closed_at",null)','lte("next_attempt_at","2026-11-06T03:00:00.123Z")','gt("judgment_id","'+J+'")','limit(10)']));
  expect(a.calls.map(c=>c.fn)).toEqual(['judgments_server_time']);   // queueList asks the server clock through anon
 });
 it('maps SQL errors to JudgmentError codes',async()=>{
  const s=stub({append_settlement:pgErr('lease_lost','55P03'),register_judgment:pgErr('duplicate key value violates unique constraint "judgments_pkey"','23505'),sync_methodology:pgErr('formula_hash_drift: m@v1 stored abc','P0001'),insert_calibration:pgErr('boom','XX000')});
  const db=supabaseJudgmentsDb({anon:stub().client,admin:s.client});
  const m=methodologyFixture();const f=judgmentFixture(m,'0b0e1d8e-0000-4000-8000-000000000001');
  await expect(db.appendSettlement(J,null,'k-00000001',settlementFixture('x'))).rejects.toMatchObject({code:'lease_lost'});
  await expect(db.registerJudgment(f.row,f.queue)).rejects.toMatchObject({code:'duplicate_key'});
  await expect(db.syncMethodology(m,'script',null)).rejects.toMatchObject({code:'formula_hash_drift'});
  await expect(db.insertCalibration(calibrationFixture(m,'x',1),1)).rejects.toMatchObject({code:'unknown',message:'boom'});
  for(const [message,sqlCode,c] of [['settlement_sequence: settled -> settled by cron','23514','settlement_sequence'],['methodology_mismatch: horizon','22023','methodology_mismatch'],['invalid_parameter: limit','22023','invalid_parameter'],['unknown_judgment','P0002','unknown_judgment'],['append_only:judgments','23514','unknown'],['whatever','55P03','lease_lost']] as const)
   expect({message,c:toJudgmentError({message,code:sqlCode}).code}).toEqual({message,c});
  expect(toJudgmentError(new JudgmentError('lookahead'))).toBeInstanceOf(JudgmentError);
 });
});

describe('supabaseJudgmentsDb hardening',()=>{
 it('latestCards drains with .range() pages until an empty page, so a PostgREST max_rows cap below the card count loses nothing (E-02)',async()=>{
  const env=(n:number)=>({judgment:{...JUDGMENT,judgment_id:`0b0e1d8e-0000-4000-8000-0000000001${String(n).padStart(2,'0')}`,methodology_id:`ztest_m${n}`},settlement:null,calibration:null,calibration_valid:false,methodology_state:EVENT});
  const a=stub({latest_judgment_cards:[1,2,3,4,5].map(env)},{},2);
  const db=supabaseJudgmentsDb({anon:a.client,admin:stub().client});
  expect((await db.latestCards({type:'macro_region',key:'US'},{view:'latest'})).map(e=>e.judgment.methodology_id)).toEqual(['ztest_m1','ztest_m2','ztest_m3','ztest_m4','ztest_m5']);
  expect(a.calls.length).toBe(4);   // 2 + 2 + 1 rows, then the empty page
 });
 it('toJudgmentError keeps the original SQLSTATE, details and hint in detail',()=>{
  const e=toJudgmentError({message:'lease_lost',code:'55P03',details:'row locked',hint:'retry'});
  expect(e).toMatchObject({code:'lease_lost',detail:{sqlstate:'55P03',details:'row locked',hint:'retry'}});
  expect(toJudgmentError({message:'boom',code:'XX000',detail:'pg detail'})).toMatchObject({code:'unknown',detail:{sqlstate:'XX000',details:'pg detail'}});
 });
});

describe('memoryJudgmentsDb atomicity (E-04)',()=>{
 it('apply / reject that fail midway (audit insert throws) leave the queue, settlements, validity and item exactly as before, and work again once the audit store recovers',async()=>{
  const base=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],research_audit_log:['id']});
  let down=false;
  const tables:TableClient={...base,insert:async(t,r)=>{if(down&&t==='research_audit_log')throw new Error('audit down');return base.insert(t,r);}};
  const db=memoryJudgmentsDb({tables});const m=methodologyFixture();await db.syncMethodology(m,'script',null);
  const {batchId:b}=await startBatch(tables,{producer:'ts-judgments',dataset:'judgments.ztest'});
  const f=judgmentFixture(m,b,{target:{kind:'date',date:'2026-01-10'}});await db.registerJudgment(f.row,f.queue);const j=f.row.judgment_id;
  const [claimed]=await db.claimDue(10,600);
  const H='e'.repeat(64),CUT='2026-03-02T04:00:00.000Z';const attempt={reason_code:'settlement_basis_mismatch',evidence_hash:H,cutoff:CUT};
  const pub=await db.quarantineSettlement(j,claimed.lease_token!,'settlement_basis_mismatch',{evidence_hash:H,cutoff:CUT,judgment_id:j},{last_status:'inconsistent',last_detail:{...attempt,incident:{...attempt,quarantined_at:CUT}},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0},b);
  const by=randomUUID();const item=pub.quarantine_id!;
  const before=JSON.stringify([db.snapshot(),await tables.select('dq_quarantine',{id:item})]);
  const override={reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched' as const,evidence_hash:H,evidence:{}},evidence_hash:H,resolved_by:by,at:CUT,cutoff:CUT};
  down=true;
  await expect(db.applyQuarantineOverride(j,override,item,{})).rejects.toThrow('audit down');
  expect(JSON.stringify([db.snapshot(),await tables.select('dq_quarantine',{id:item})])).toBe(before);
  const row=settlementFixture(b,{kind:'void',outcome:null,realized:null,reason:'quarantine_rejected',actor:`admin:${by}`});
  await expect(db.rejectQuarantinedSettlement(j,item,{evidence_hash:H,cutoff:CUT},'adm:key-reject-1',row,{})).rejects.toThrow('audit down');
  expect(JSON.stringify([db.snapshot(),await tables.select('dq_quarantine',{id:item})])).toBe(before);
  expect((await tables.select('dq_quarantine',{id:item}))[0].status).toBe('open');
  expect(await db.settlementsOf([j])).toEqual([]);
  down=false;
  expect(await db.rejectQuarantinedSettlement(j,item,{evidence_hash:H,cutoff:CUT},'adm:key-reject-1',row,{})).toMatchObject({seq:1,status:'applied'});
 });
});
