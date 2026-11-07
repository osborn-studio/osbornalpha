// src/lib/judgments/db-contract.ts
// Shared JudgmentsDb contract (spec §5.6, §5.7, §14.1–§14.2): the same scenarios run against
// memoryJudgmentsDb (db.test.ts) and pgJudgmentsDb (judgments-db.integration.test.ts), so the
// in-memory rules the unit tests rely on are exactly the SQL functions' rules. Not a test file: it
// registers describe/it only when called. Also exports the fixture factories later tasks use and the
// cross-file claim lock: every test that registers a due judgment and claims it must do so inside
// harness.exclusiveClaims (pg: pg_advisory_lock(F4_CLAIM_LOCK) on a dedicated connection), because
// claim_due_judgments is global and test files run in parallel. Judgments that are not claimed use
// the default far-future target (2099-01-01) and never become due.
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {TableClient} from '../db/table-client';
import {startBatch} from '../dq/batches';
import {quarantine} from '../dq/quarantine';
import {digest,inputsHash} from './canonical';
import {judgmentIdOf} from './contract';
import {JudgmentError} from './errors';
import {jobKey} from './job-keys';
import {operationDigest} from './settlement-digest';
import {settleWindowOf} from './time';
import type {CalibrationRow,Condition,Envelope,Input,JudgmentInsert,JudgmentsDb,LabelPolicy,MacroObservationSnapshot,MacroSnapshotSnapshot,MethodologyRow,Origin,ProbabilityClaim,PublicSubjectType,QuarantineOverride,QueuePatch,QueueRow,SettlementInsert,SettlementRow,Subject,Target} from './types';

export type MethodologySync=Omit<MethodologyRow,'created_at'|'synced_at'>;
export interface JudgmentsContractHarness{
 db:JudgmentsDb;
 /** The TableClient over the same store: ingest_batches, dq_quarantine, research_audit_log. */
 tables:TableClient;
 batch():Promise<string>;
 issuer(o?:{status?:'active'|'merged'|'dissolved';mergedInto?:string}):Promise<string>;
 /** A fresh industry_classifications row; returns the subject key scheme:version:code. */
 industry():Promise<string>;
 /** An auth.users id usable as override.resolved_by (research_audit_log.user_id FK). */
 adminUser():Promise<string>;
 exclusiveClaims<T>(fn:()=>Promise<T>):Promise<T>;
 close?():Promise<void>;
}

export const F4_CLAIM_LOCK=20261109;
/** Schema-change mutex: judgments.integration.test.ts's replayMigration takes it exclusively, pgJudgmentsDb calls take it shared (no deadlocks between DDL replays and the contract). */
export const F4_SCHEMA_LOCK=20261110;
/** Cross-file mutex for claim_due_judgments in integration tests (see header). */
export async function withClaimLock<T>(pool:Pool,fn:()=>Promise<T>):Promise<T>{
 const c=await pool.connect();
 try{await c.query('select pg_advisory_lock($1)',[F4_CLAIM_LOCK]);return await fn();}
 finally{await c.query('select pg_advisory_unlock($1)',[F4_CLAIM_LOCK]).catch(()=>{});c.release();}
}

const H=(c:string)=>c.repeat(64);
const ORIGIN:Origin={publisher:'fixture',adapter:'fixture',locator:'test'};
const CLAIM:ProbabilityClaim={p:0.6,event:{zh:'复苏',en:'recovery'}};
const CONDITION:Condition={resolver:'macro_regime_replay',params:{region:'US',reference_period:'2026-01',macro_methodology_version:'v1',catalog_version:'c1'},predicate:{op:'eq',rhs:'recovery'},text:{zh:'复苏',en:'recovery'}};
const DUE:Target={kind:'date',date:'2026-01-10'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function methodologyFixture(o:Partial<MethodologySync>={}):MethodologySync{
 return {methodology_id:`ztest_${randomUUID().replaceAll('-','').slice(0,16)}`,version:'v1',judgment_type:'synthetic_fact_metric',kind:'probability',producer_kind:'rule',
  subject_types:['macro_region','issuer','industry'],input_kinds:['macro_observation','macro_snapshot','financial_fact'],markets:null,title_zh:'测试方法',title_en:'Test methodology',
  doc_path:'docs/methodologies/ztest/v1.md',doc_sha256:H('a'),implementation_sha256:H('a'),params:{grace_days:30},params_json:{},horizon:{unit:'calendar_days',n:30},upstream:{},
  deps_sha256:H('a'),formula_hash:H('a'),status:'active',publishable:false,code_version:'abcdef1',...o};
}
export function inputFixture(o:{snapshotId?:string}={}):Input{
 if(o.snapshotId!==undefined){
  const snapshot:MacroSnapshotSnapshot={snapshot_id:o.snapshotId,region:'US',as_of:'2026-01-02',methodology_version:'v1',catalog_version:'c1',observation_ids:[],primary_state:'recovery',secondary_state:null,
   scores:{recovery:1,overheat:0,stagflation:0,recession:0},norm:{recovery:1,overheat:0,stagflation:0,recession:0},coverage:1,margin_pp:10,growth_axis:null,inflation_axis:null};
  return {kind:'macro_snapshot',ref:{snapshot_id:o.snapshotId},snapshot,hash:digest(snapshot),available_at:'2026-01-01T00:00:00.000Z',origin:ORIGIN};
 }
 const series=`S${randomUUID().slice(0,8)}`;
 const snapshot:MacroObservationSnapshot={series_id:series,period_end:'2025-12-31',value:3.1,unit:'pct',vintage_id:'v1',available_at:'2026-01-01T00:00:00.000Z'};
 return {kind:'macro_observation',ref:{series_id:series,period_end:'2025-12-31',vintage_id:'v1'},snapshot,hash:digest(snapshot),available_at:snapshot.available_at,origin:ORIGIN};
}
export interface JudgmentFixtureOptions{subject?:Subject;as_of?:string;target?:Target;abstained?:boolean;inputs?:Input[];label_available_at?:string|null;label_policy?:LabelPolicy}
/** A valid register_judgment payload for methodology m (ids, hashes and settle window from the Task 1 modules). */
export function judgmentFixture(m:MethodologySync,batchId:string,o:JudgmentFixtureOptions={}):{row:JudgmentInsert;queue:{settle_after:string;settle_by:string;label_policy:LabelPolicy}|null}{
 const subject=o.subject??{type:'macro_region',key:'US'};const as_of=o.as_of??'2026-01-02';const active=!o.abstained;
 const inputs=o.inputs??[inputFixture()];const inputs_hash=inputsHash(inputs);
 const target=o.target??{kind:'date',date:'2099-01-01'};const label_policy=o.label_policy??'first_observed';
 const win=active?settleWindowOf(target,m.horizon,m.params):null;
 const judgment_id=judgmentIdOf({subject_type:subject.type,subject_key:subject.key,judgment_type:m.judgment_type,methodology_id:m.methodology_id,methodology_version:m.version,as_of,inputs_hash,producer_nonce:''});
 const row:JudgmentInsert={judgment_id,subject_type:subject.type as PublicSubjectType,subject_key:subject.key,judgment_type:m.judgment_type,methodology_id:m.methodology_id,methodology_version:m.version,kind:m.kind,
  producer_kind:m.producer_kind as 'rule'|'model',producer_ref:{},producer_nonce:'',as_of,inputs,inputs_hash,abstained:!active,abstain_reason:active?null:'no_inputs',
  claim:active?CLAIM:null,condition:active?CONDITION:null,horizon:active?m.horizon:null,target:active?target:null,label_policy:active?label_policy:null,
  settle_after:win?.settle_after??null,settle_by:win?.settle_by??null,code_version:'abcdef1',batch_id:batchId,retrospective_hint:{label_available_at:o.label_available_at??null}};
 return {row,queue:win?{...win,label_policy}:null};
}
export function settlementFixture(batchId:string,o:Partial<SettlementInsert>={}):SettlementInsert{
 return {kind:'settled',outcome:'hit',realized:{value:'recovery',unit:null,from:null,to:null,label_policy:'first_observed'},evidence:{observed:true},resolver:'macro_regime_replay',resolver_version:'1.0.0',reason:null,actor:'cron',code_version:'abcdef1',batch_id:batchId,...o};
}
export function calibrationFixture(m:MethodologySync,batchId:string,revision:number,o:Partial<CalibrationRow>={}):CalibrationRow{
 const id=randomUUID();
 return {calibration_id:id,methodology_id:m.methodology_id,methodology_version:m.version,scope_type:'all',scope_key:'',window_from:'2023-01-01',window_to:'2026-01-01',n_registered:10,n_settled:8,n_independent:5,n_void:1,n_retrospective_excluded:1,
  threshold_n:100,ece_max:0.1,kind:m.kind,state:'insufficient',valid_until:'2099-01-01T00:00:00.000Z',validity_revision:revision,metrics:{brier:null},reliability:[],isotonic_segments:null,
  cohort_path:`judgments-calibration/${id}.json`,cohort_sha256:H('d'),query_bounds:{window_from:'2023-01-01',window_to:'2026-01-01',registered_at_lte:'2026-01-02T00:00:00.000Z',settled_at_lte:'2026-01-02T00:00:00.000Z',frozen_at:'2026-01-02T00:00:00.000Z',n:10},
  fingerprint:digest({calibration_id:id}),algorithm_version:'calib/1',code_version:'abcdef1',computed_at:new Date().toISOString(),batch_id:batchId,...o};
}

const PARK:QueuePatch={last_status:'pending',last_detail:{},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0};

export function judgmentsDbContract(label:string,setup:()=>Promise<JudgmentsContractHarness>):void{
 describe(label,()=>{
  let h:JudgmentsContractHarness;let db:JudgmentsDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof JudgmentError?e.code:`not_judgment_error:${String(e)}`);
  const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
  const synced=async(o:Partial<MethodologySync>={})=>{const m=methodologyFixture(o);expect(await db.syncMethodology(m,'script',null)).toEqual({changed:true,seq:1});return m;};
  const registered=async(m:MethodologySync,b:string,o:JudgmentFixtureOptions={})=>{const f=judgmentFixture(m,b,o);const r=await db.registerJudgment(f.row,f.queue);return {...f,...r,id:f.row.judgment_id};};
  const ids=(e:Envelope[])=>e.map(x=>x.judgment.judgment_id);

  it('syncMethodology: registered → resynced → status/publishable events; created_at fixed; formula_hash_drift; methodology, list, state-at, validity',async()=>{
   const m=methodologyFixture({status:'draft'});
   expect(await db.syncMethodology(m,'script',null)).toEqual({changed:true,seq:1});
   const first=(await db.methodology(m.methodology_id,'v1'))!;
   expect(first).toMatchObject(m);expect(first.created_at).toBe(first.synced_at);
   await pause(5);
   expect(await db.syncMethodology(m,'script',null)).toEqual({changed:false,seq:2});
   const second=(await db.methodology(m.methodology_id,'v1'))!;
   expect(second.created_at).toBe(first.created_at);expect(Date.parse(second.synced_at)).toBeGreaterThan(Date.parse(first.synced_at));
   expect(await db.syncMethodology({...m,status:'active',publishable:true},`admin:${randomUUID()}`,'licence confirmed')).toEqual({changed:true,seq:4});
   expect(await code(db.syncMethodology({...m,status:'active',publishable:true,formula_hash:H('f')},'script',null))).toBe('formula_hash_drift');
   expect(await code(db.syncMethodology({...m,status:'active',publishable:true,params:{grace_days:7}},'script',null))).toBe('formula_hash_drift');
   expect(await db.methodologyStateAt(m.methodology_id,'v1','2000-01-01T00:00:00.000Z')).toBeNull();
   expect(await db.methodologyStateAt(m.methodology_id,'v1',new Date(Date.now()+60_000).toISOString())).toMatchObject({seq:4,event:'publishable_changed',status:'active',publishable:true,formula_hash:m.formula_hash});
   expect((await db.listMethodologies()).some(r=>r.methodology_id===m.methodology_id)).toBe(true);
   expect((await db.listMethodologies('draft')).some(r=>r.methodology_id===m.methodology_id)).toBe(false);
   expect((await db.listMethodologies('active')).find(r=>r.methodology_id===m.methodology_id)).toMatchObject({status:'active',publishable:true});
   expect(await db.calibrationValidity(m.methodology_id,'v1')).toEqual({revision:1});
   expect(await code(db.calibrationValidity(`ztest_${'0'.repeat(16)}`,'v1'))).toBe('unknown_methodology');
   expect(await db.methodology(m.methodology_id,'v9')).toBeNull();
  });

  it('registerJudgment: server registered_at, retrospective rules, queue row, getJudgment round-trip, duplicate_key; abstained has no queue row; judgmentsBySnapshot',async()=>{
   const m=await synced();const b=await h.batch();
   const today=(await db.serverTime()).slice(0,10);
   const before=await db.serverTime();
   const p=await registered(m,b,{as_of:today});
   expect(p.retrospective).toBe(false);expect(Date.parse(p.registered_at)).toBeGreaterThanOrEqual(Date.parse(before));
   const row=(await db.getJudgment(p.id))!;
   const {retrospective_hint:hint,...insert}=p.row;
   expect(hint).toEqual({label_available_at:null});
   expect(row).toEqual({...insert,registered_at:p.registered_at,retrospective:false,created_at:row.created_at});
   const qr=(await db.queueRow(p.id))!;
   expect(qr).toEqual({judgment_id:p.id,settle_after:p.queue!.settle_after,settle_by:p.queue!.settle_by,label_policy:'first_observed',next_attempt_at:p.queue!.settle_after,attempts:0,last_status:null,last_detail:{},leased_until:null,lease_token:null,override:null,closed_at:null,updated_at:qr.updated_at});
   expect(await code(db.registerJudgment(p.row,p.queue))).toBe('duplicate_key');
   expect((await registered(m,b,{as_of:'2026-01-02'})).retrospective).toBe(true);
   expect((await registered(m,b,{as_of:today,label_available_at:'2026-01-01T00:00:00.000Z'})).retrospective).toBe(true);
   expect((await registered(m,b,{as_of:today,label_available_at:'2099-02-01T00:00:00.000Z'})).retrospective).toBe(false);
   const snap=randomUUID();
   const ab=await registered(m,b,{abstained:true,inputs:[inputFixture({snapshotId:snap})]});
   expect(ab.retrospective).toBe(true);
   expect(await db.queueRow(ab.id)).toBeNull();
   const act=await registered(m,b,{inputs:[inputFixture({snapshotId:snap})],subject:{type:'macro_region',key:'CN'}});
   expect((await db.judgmentsBySnapshot(snap)).sort()).toEqual([ab.id,act.id].sort());
   expect(await db.judgmentsBySnapshot(randomUUID())).toEqual([]);
   expect(await db.getJudgment(randomUUID())).toBeNull();
  });

  it('registerJudgment refuses what register_judgment refuses, with the same codes, and writes nothing',async()=>{
   const m=await synced();const draft=await synced({status:'draft'});const b=await h.batch();
   const d=judgmentFixture(draft,b);
   expect(await code(db.registerJudgment(d.row,d.queue))).toBe('methodology_unavailable');
   const ok=judgmentFixture(m,b);
   const cases:[JudgmentInsert,typeof ok.queue,string][]=[
    [{...ok.row,kind:'score'},ok.queue,'methodology_mismatch'],
    [{...ok.row,judgment_type:'macro_regime'},ok.queue,'methodology_mismatch'],
    [{...ok.row,producer_kind:'model'},ok.queue,'methodology_mismatch'],
    [{...ok.row,horizon:{unit:'calendar_days',n:31}},ok.queue,'methodology_mismatch'],
    [{...ok.row,subject_type:'security' as never,subject_key:'US:AAPL'},ok.queue,'subject_type_not_public'],
    [{...ok.row,inputs:[{...ok.row.inputs[0],kind:'price_bar'} as never]},ok.queue,'input_not_allowed'],
    [{...ok.row,inputs:[{...ok.row.inputs[0],kind:'document_span'} as never]},ok.queue,'input_not_allowed'],
    [{...ok.row,settle_by:'2099-02-01T00:00:00.000Z'},ok.queue,'settle_window_mismatch'],
    [ok.row,{...ok.queue!,label_policy:'cutoff_vintage'},'settle_window_mismatch'],
    [ok.row,null,'settle_window_mismatch'],
   ];
   for(const [row,queue,c] of cases)expect({c:await code(db.registerJudgment(row,queue))}).toEqual({c});
   const ab=judgmentFixture(m,b,{abstained:true});
   expect(await code(db.registerJudgment(ab.row,ok.queue))).toBe('settle_window_mismatch');
   expect(await db.getJudgment(ok.row.judgment_id)).toBeNull();
   await db.registerJudgment(ok.row,ok.queue);
   expect(await db.getJudgment(ok.row.judgment_id)).not.toBeNull();
  });

  it('subjectExists: issuers by status, industries by classification, macro regions; everything else missing',async()=>{
   const a=await h.issuer();const merged=await h.issuer({status:'merged',mergedInto:a});const ind=await h.industry();
   expect(await db.subjectExists({type:'issuer',key:a})).toBe('active');
   expect(await db.subjectExists({type:'issuer',key:merged})).toBe('inactive');
   expect(await db.subjectExists({type:'issuer',key:randomUUID()})).toBe('missing');
   expect(await db.subjectExists({type:'issuer',key:'not-a-uuid'})).toBe('missing');
   expect(await db.subjectExists({type:'industry',key:ind})).toBe('active');
   expect(await db.subjectExists({type:'industry',key:'custom:ztest:nope'})).toBe('missing');
   expect(await db.subjectExists({type:'macro_region',key:'US'})).toBe('active');
   expect(await db.subjectExists({type:'macro_region',key:'HK'})).toBe('missing');
   expect(await db.subjectExists({type:'macro_series',key:'US.CPI'})).toBe('missing');
   expect(await db.subjectExists({type:'security',key:'US:AAPL'})).toBe('missing');
  });

  it('claimDue / releaseLease: due order, fresh tokens, leased rows skipped, lease_lost, next_attempt_at clamp, attempts',async()=>{
   const m=await synced();const b=await h.batch();
   await h.exclusiveClaims(async()=>{
    const later=await registered(m,b,{target:{kind:'date',date:'2026-01-12'}});
    const early=await registered(m,b,{target:DUE});
    await registered(m,b);
    const got=(await db.claimDue(100,600)).filter(r=>[early.id,later.id].includes(r.judgment_id));
    expect(got.map(r=>r.judgment_id)).toEqual([early.id,later.id]);
    for(const r of got){expect(r.lease_token).toMatch(UUID);expect(Date.parse(r.leased_until!)).toBeGreaterThan(Date.now()+590_000);}
    expect(new Set(got.map(r=>r.lease_token)).size).toBe(2);
    expect((await db.claimDue(100,600)).filter(r=>[early.id,later.id].includes(r.judgment_id))).toEqual([]);
    expect(await code(db.claimDue(0,600))).toBe('invalid_parameter');
    expect(await code(db.claimDue(101,600))).toBe('invalid_parameter');
    const [e1,l1]=got;
    const before=await db.serverTime();
    const patch:QueuePatch={last_status:'unavailable',last_detail:{failure:'timeout'},next_attempt_at:'2000-01-01T00:00:00.000Z',attempts_increment:1};
    expect(await code(db.releaseLease(e1.judgment_id,randomUUID(),patch))).toBe('lease_lost');
    expect(await code(db.releaseLease(e1.judgment_id,e1.lease_token!,{...patch,attempts_increment:2 as never}))).toBe('invalid_parameter');
    await db.releaseLease(e1.judgment_id,e1.lease_token!,patch);
    const r1=(await db.queueRow(e1.judgment_id))!;
    expect(r1).toMatchObject({attempts:1,last_status:'unavailable',last_detail:{failure:'timeout'},leased_until:null,lease_token:null});
    expect(Date.parse(r1.next_attempt_at)).toBeGreaterThanOrEqual(Date.parse(before));
    expect(await code(db.releaseLease(e1.judgment_id,e1.lease_token!,patch))).toBe('lease_lost');
    const back=(await db.claimDue(100,600)).find(r=>r.judgment_id===e1.judgment_id)!;
    expect(back.lease_token).not.toBe(e1.lease_token);
    await db.releaseLease(e1.judgment_id,back.lease_token!,PARK);await db.releaseLease(l1.judgment_id,l1.lease_token!,PARK);
    expect((await db.queueRow(l1.judgment_id))!.next_attempt_at).toBe('2099-06-01T00:00:00.000Z');
   });
  });

  it('appendSettlement: applied, replay converges after the lease is cleared, request_key_conflict, already_final, lease_lost, admin transitions, settlement_sequence, validity bump; settlementsOf',async()=>{
   const m=await synced();const b=await h.batch();const A=`admin:${randomUUID()}`;
   await h.exclusiveClaims(async()=>{
    const j=await registered(m,b,{target:DUE});const j2=await registered(m,b,{target:DUE});
    const leased=(await db.claimDue(100,600)).filter(r=>[j.id,j2.id].includes(r.judgment_id));
    const tok=(id:string)=>leased.find(r=>r.judgment_id===id)!.lease_token!;
    const row=settlementFixture(b);const key=`${b}:${j.id}:1`;
    expect(await code(db.appendSettlement(j.id,randomUUID(),key,row))).toBe('lease_lost');
    expect(await db.appendSettlement(j.id,tok(j.id),key,row)).toEqual({seq:1,status:'applied'});
    const closed=(await db.queueRow(j.id))!;
    expect(closed).toMatchObject({lease_token:null,leased_until:null});expect(closed.closed_at).not.toBeNull();
    expect(await db.appendSettlement(j.id,tok(j.id),key,row)).toEqual({seq:1,status:'already_applied'});
    expect(await db.appendSettlement(j.id,null,key,row)).toEqual({seq:1,status:'already_applied'});
    expect(await db.appendSettlement(j.id,tok(j.id),key,{...row,resolver_version:'1.0.1'})).toEqual({seq:1,status:'request_key_conflict'});
    expect(await db.appendSettlement(j2.id,tok(j2.id),key,row)).toEqual({seq:1,status:'request_key_conflict'});
    expect(await db.appendSettlement(j.id,tok(j.id),`${b}:${j.id}:2`,row)).toEqual({seq:1,status:'already_final'});
    expect(await code(db.appendSettlement(j2.id,null,`${b}:${j2.id}:n`,row))).toBe('lease_lost');
    expect(await db.calibrationValidity(m.methodology_id,'v1')).toEqual({revision:1});
    const w=settlementFixture(b,{kind:'withdrawn',outcome:null,realized:null,reason:'bad data',actor:A});
    expect(await db.appendSettlement(j.id,null,`adm:${randomUUID()}`,w)).toEqual({seq:2,status:'applied'});
    expect(await db.calibrationValidity(m.methodology_id,'v1')).toEqual({revision:2});
    expect(await db.appendSettlement(j.id,null,`adm:${randomUUID()}`,settlementFixture(b,{kind:'reopened',outcome:null,realized:null,reason:'again',actor:A}))).toEqual({seq:3,status:'applied'});
    expect(await db.calibrationValidity(m.methodology_id,'v1')).toEqual({revision:3});
    expect(await db.queueRow(j.id)).toMatchObject({closed_at:null,attempts:0,lease_token:null});
    expect(await code(db.appendSettlement(j.id,null,`adm:${randomUUID()}`,w))).toBe('settlement_sequence');
    const again=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!;
    expect(await db.appendSettlement(j.id,again.lease_token!,`${b}:${j.id}:4`,row)).toEqual({seq:4,status:'applied'});
    expect(await db.appendSettlement(j2.id,tok(j2.id),`${b}:${j2.id}:1`,settlementFixture(b,{kind:'void',outcome:null,realized:null,reason:'no_data:test'}))).toEqual({seq:1,status:'applied'});
    const all=await db.settlementsOf([j2.id,j.id,randomUUID()]);
    expect(all.filter(s=>s.judgment_id===j.id).map(s=>`${s.seq}:${s.kind}`)).toEqual(['1:settled','2:withdrawn','3:reopened','4:settled']);
    expect(all.filter(s=>s.judgment_id===j2.id).map(s=>`${s.seq}:${s.kind}`)).toEqual(['1:void']);
    expect(all.map(s=>`${s.judgment_id}:${s.seq}`)).toEqual([...all].sort((a:SettlementRow,b2:SettlementRow)=>a.judgment_id<b2.judgment_id?-1:a.judgment_id>b2.judgment_id?1:a.seq-b2.seq).map(s=>`${s.judgment_id}:${s.seq}`));
    expect(all.find(s=>s.judgment_id===j.id&&s.seq===1)).toMatchObject({request_key:key,request_digest:operationDigest(j.id,row),actor:'cron',outcome:'hit',realized:row.realized,evidence:row.evidence,resolver:row.resolver,resolver_version:row.resolver_version,code_version:row.code_version,batch_id:b,reason:null});
    const ab=await registered(m,b,{abstained:true});
    expect(await code(db.appendSettlement(ab.id,null,`adm:${randomUUID()}`,{...row,actor:A}))).toBe('settlement_sequence');
    expect(await code(db.appendSettlement(randomUUID(),null,`adm:${randomUUID()}`,{...row,actor:A}))).toBe('unknown_judgment');
   });
  });

  it('public reads honour publishable: latestCards, historyOf, calibrationCohort and latestCalibration are empty while false; calibrationCohortInternal is ungated (acceptance 8, R04)',async()=>{
   const m=await synced();const b=await h.batch();const subject:Subject={type:'macro_region',key:'CN'};
   const j=await registered(m,b,{subject,as_of:'2025-06-01'});
   expect(await db.insertCalibration(calibrationFixture(m,b,1),1)).toBe('inserted');
   const cutoff=new Date(Date.now()+60_000).toISOString();const win={from:'2025-01-01',to:'2025-12-31'};
   const view=async()=>({
    cards:(await db.latestCards(subject,{view:'latest'})).filter(e=>e.judgment.methodology_id===m.methodology_id).length,
    hist:(await db.historyOf(subject,'synthetic_fact_metric',{id:m.methodology_id,version:'v1'},{view:'latest',limit:50})).length,
    cohort:(await db.calibrationCohort(m.methodology_id,'v1',win,cutoff,null,100)).length,
    cal:(await db.latestCalibration(m.methodology_id,'v1',{scope_type:'all',scope_key:''}))===null?0:1,
   });
   const internal=async()=>ids(await db.calibrationCohortInternal(m.methodology_id,'v1',win,cutoff,null,100));
   expect(await view()).toEqual({cards:0,hist:0,cohort:0,cal:0});
   expect(await internal()).toEqual([j.id]);
   await db.syncMethodology({...m,publishable:true},`admin:${randomUUID()}`,null);
   expect(await view()).toEqual({cards:1,hist:1,cohort:1,cal:1});
   await db.syncMethodology({...m,publishable:false},`admin:${randomUUID()}`,null);
   expect(await view()).toEqual({cards:0,hist:0,cohort:0,cal:0});
   expect(await internal()).toEqual([j.id]);
  });

  it('latestCards and historyOf: one envelope per (type, methodology), merged issuer expansion, calibration_valid, as_known with a resync (acceptance 9), keyset',async()=>{
   const m=await synced({publishable:true});const m2=await synced({publishable:true});const b=await h.batch();
   const x=await h.issuer();const y=await h.issuer({status:'merged',mergedInto:x});
   const X:Subject={type:'issuer',key:x},Y:Subject={type:'issuer',key:y};
   const a1=await registered(m,b,{subject:X,as_of:'2026-01-02'});
   await pause(20);const t1=await db.serverTime();await pause(20);
   const a2=await registered(m,b,{subject:X,as_of:'2026-01-05'});
   const a3=await registered(m,b,{subject:Y,as_of:'2026-01-04'});
   const bb=await registered(m2,b,{subject:Y,as_of:'2026-01-03'});
   expect(ids(await db.latestCards(X,{view:'latest'}))).toEqual([a2.id,bb.id]);
   expect(ids(await db.latestCards(Y,{view:'latest'}))).toEqual([a3.id,bb.id]);
   expect(await db.latestCards(X,{view:'latest',types:['macro_regime']})).toEqual([]);
   expect(await code(db.latestCards(X,{view:'as_known'}))).toBe('invalid_parameter');
   const env=(await db.latestCards(X,{view:'latest'}))[0];
   expect(env).toMatchObject({settlement:null,calibration:null,calibration_valid:false,methodology_state:{seq:1,event:'registered'}});
   expect(env.judgment).toEqual(await db.getJudgment(a2.id));
   expect(await db.insertCalibration(calibrationFixture(m,b,1),1)).toBe('inserted');
   expect((await db.latestCards(X,{view:'latest'}))[0].calibration_valid).toBe(true);
   await db.syncMethodology({...m,publishable:true},'script',null);
   const known=await db.latestCards(X,{view:'as_known',cutoff:t1});
   expect(ids(known)).toEqual([a1.id]);
   expect(known[0]).toMatchObject({calibration:null,calibration_valid:false,methodology_state:{seq:1,event:'registered'}});
   expect(await db.latestCards(X,{view:'as_known',cutoff:'2000-01-01T00:00:00.000Z'})).toEqual([]);
   const hist=(o:{before?:string;limit:number})=>db.historyOf(X,'synthetic_fact_metric',{id:m.methodology_id,version:'v1'},{view:'latest',...o}).then(ids);
   expect(await hist({limit:10})).toEqual([a2.id,a1.id]);
   expect(await hist({limit:1})).toEqual([a2.id]);
   expect(await hist({before:a2.id,limit:10})).toEqual([a1.id]);
   expect(await code(hist({limit:501}))).toBe('invalid_parameter');
   expect(await code(hist({before:randomUUID(),limit:5}))).toBe('unknown_judgment');
   expect(ids(await db.historyOf(X,'synthetic_fact_metric',{id:m.methodology_id,version:'v1'},{view:'as_known',cutoff:t1,limit:10}))).toEqual([a1.id]);
  });

  it('calibrationCohortInternal paging and cutoff (R03); insertCalibration inserted / duplicate / stale_revision; latestCalibration round-trip and validity (acceptance 10)',async()=>{
   const m=await synced({publishable:true});const b=await h.batch();
   const reg:string[]=[];
   for(const d of ['2025-03-01','2025-06-01','2025-09-01'])reg.push((await registered(m,b,{as_of:d})).id);
   await registered(m,b,{as_of:'2024-01-01'});await registered(m,b,{as_of:'2025-05-01',abstained:true});
   await pause(20);const cutoff=await db.serverTime();await pause(20);
   const late=await registered(m,b,{as_of:'2025-07-01'});
   const win={from:'2025-01-01',to:'2025-12-31'};
   const page=(after:string|null,limit:number,cut=cutoff)=>db.calibrationCohortInternal(m.methodology_id,'v1',win,cut,after,limit).then(ids);
   const sorted=[...reg].sort();
   const p1=await page(null,2);expect(p1).toEqual(sorted.slice(0,2));
   expect(await page(p1[1],2)).toEqual(sorted.slice(2));
   expect(await page(null,100,new Date(Date.now()+60_000).toISOString())).toEqual([...reg,late.id].sort());
   expect(await code(db.calibrationCohortInternal(m.methodology_id,'v1',{from:'2025-12-31',to:'2025-01-01'},cutoff,null,10))).toBe('invalid_parameter');
   expect(await code(db.calibrationCohortInternal(m.methodology_id,'v1',win,cutoff,null,1001))).toBe('invalid_parameter');
   const c=calibrationFixture(m,b,1);
   expect(await db.insertCalibration(c,1)).toBe('inserted');
   expect(await db.insertCalibration({...c,calibration_id:randomUUID()},1)).toBe('duplicate');
   expect(await db.insertCalibration(calibrationFixture(m,b,2),1)).toBe('stale_revision');
   const got=(await db.latestCalibration(m.methodology_id,'v1',{scope_type:'all',scope_key:''}))!;
   expect(got).toEqual({row:c,valid:true});
   await h.exclusiveClaims(async()=>{
    const s=await registered(m,b,{target:DUE});
    const t=(await db.claimDue(100,600)).find(r=>r.judgment_id===s.id)!.lease_token!;
    expect(await db.appendSettlement(s.id,t,`${b}:${s.id}:1`,settlementFixture(b))).toEqual({seq:1,status:'applied'});
    expect(await db.appendSettlement(s.id,null,`adm:${randomUUID()}`,settlementFixture(b,{kind:'withdrawn',outcome:null,realized:null,reason:'bad',actor:`admin:${randomUUID()}`}))).toEqual({seq:2,status:'applied'});
   });
   expect(await db.insertCalibration(calibrationFixture(m,b,1),1)).toBe('stale_revision');
   expect((await db.latestCalibration(m.methodology_id,'v1',{scope_type:'all',scope_key:''}))!.valid).toBe(false);
   expect(await db.insertCalibration(calibrationFixture(m,b,2),2)).toBe('inserted');
   expect((await db.latestCalibration(m.methodology_id,'v1',{scope_type:'all',scope_key:''}))!.valid).toBe(true);
  });

  it('jobState / setJobState: insert once, optimistic update on the exact updated_at, strictly increasing',async()=>{
   const job=jobKey('calibrate',`ztest_${randomUUID().replaceAll('-','').slice(0,16)}`,'v1',{scope_type:'market',scope_key:'港股'});
   expect(await db.jobState(job)).toBeNull();
   expect(await db.setJobState(job,null,{page:0})).toBe(true);
   expect(await db.setJobState(job,null,{page:1})).toBe(false);
   const s1=(await db.jobState(job))!;expect(s1.state).toEqual({page:0});
   expect(await db.setJobState(job,'2000-01-01T00:00:00.000Z',{page:1})).toBe(false);
   expect(await db.setJobState(job,s1.updated_at,{page:1})).toBe(true);
   const s2=(await db.jobState(job))!;expect(s2.state).toEqual({page:1});expect(Date.parse(s2.updated_at)).toBeGreaterThan(Date.parse(s1.updated_at));
   expect(await db.setJobState(job,s1.updated_at,{page:2})).toBe(false);
   expect(await db.setJobState(job,s2.updated_at,{page:2})).toBe(true);
   expect(await code(db.setJobState(job,null,[] as never))).toBe('invalid_parameter');
  });

  it('repairStaleBatches: fails running batches of the named judgments.* dataset older than the threshold',async()=>{
   const ds=`judgments.ztest_${randomUUID().replaceAll('-','').slice(0,12)}`;
   const {batchId:stale}=await startBatch(h.tables,{producer:'ts-judgments',dataset:ds});
   await h.tables.update('ingest_batches',{batch_id:stale},{started_at:new Date(Date.now()-3_600_000).toISOString()});
   const {batchId:fresh}=await startBatch(h.tables,{producer:'ts-judgments',dataset:ds});
   expect(await db.repairStaleBatches(ds,900)).toBe(1);
   const [s]=await h.tables.select('ingest_batches',{batch_id:stale});
   expect(s.status).toBe('failed');expect(s.finished_at).not.toBeNull();expect((s.errors as {code:string}[]).at(-1)).toMatchObject({code:'stale_running'});
   expect((await h.tables.select('ingest_batches',{batch_id:fresh}))[0].status).toBe('running');
   expect(await db.repairStaleBatches(ds,900)).toBe(0);
   expect(await code(db.repairStaleBatches('facts.us',900))).toBe('invalid_parameter');
   expect(await code(db.repairStaleBatches(ds,30))).toBe('invalid_parameter');
  });

  const CUT='2026-03-02T04:00:00.000Z';
  /** settle.ts's inconsistent patch (Q1-02), parked in 2099: top level = this attempt, incident = the open incident it raises (R3-01). */
  const incPatch=(hash:string,cutoff:string,quarantined_at=cutoff,reason='settlement_basis_mismatch'):QueuePatch=>{
   const attempt={reason_code:reason,evidence_hash:hash,cutoff};
   return {last_status:'inconsistent',last_detail:{...attempt,incident:{...attempt,quarantined_at}},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0};
  };
  /** A judgment whose queue is 'inconsistent' for `hash` with an open item of the same hash and cutoff, published the way settle.ts does
   *  it: ONE quarantineSettlement under the claimed lease (Q1-02). Call inside exclusiveClaims. */
  const inconsistent=async(m:MethodologySync,b:string,hash=H('e'),cutoff=CUT)=>{
   const j=await registered(m,b,{target:DUE});
   const mine=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!;
   const r=await db.quarantineSettlement(j.id,mine.lease_token!,'settlement_basis_mismatch',{evidence_hash:hash,cutoff,judgment_id:j.id},incPatch(hash,cutoff),b);
   expect(r.status).toBe('quarantined');
   return {j,itemId:r.quarantine_id!};
  };
  const EXP={evidence_hash:H('e'),cutoff:CUT};
  const overrideOf=(by:string,hash=H('e'),cutoff='2026-03-02T04:00:00.000Z'):QuarantineOverride=>({reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:hash,evidence:{bars:[]}},evidence_hash:hash,resolved_by:by,at:new Date().toISOString(),cutoff});
  const rejectRow=(b:string,by:string)=>settlementFixture(b,{kind:'void',outcome:null,realized:null,reason:'quarantine_rejected',actor:`admin:${by}`});

  it('applyQuarantineOverride: atomic acceptance of the CURRENT inconsistency — override, due now, lease revoked, item resolved_accept, one audit row; idempotent; stale / closed / item_not_open write nothing (P1-04)',async()=>{
   const m=await synced();const b=await h.batch();const by=await h.adminUser();
   await h.exclusiveClaims(async()=>{
    const {j,itemId}=await inconsistent(m,b);
    const override=overrideOf(by);
    const before=await db.serverTime();
    expect(await db.applyQuarantineOverride(j.id,override,itemId,{route:'contract'})).toBe('applied');
    const qr=(await db.queueRow(j.id))!;
    expect(qr.override).toEqual(override);expect(Date.parse(qr.next_attempt_at)).toBeGreaterThanOrEqual(Date.parse(before));
    expect({l:qr.leased_until,t:qr.lease_token,s:qr.last_status}).toEqual({l:null,t:null,s:'inconsistent'});
    const mine=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!;
    await db.releaseLease(j.id,mine.lease_token!,{...PARK,last_status:'inconsistent',last_detail:{reason_code:'settlement_basis_mismatch',evidence_hash:H('e')}});
    const [item]=await h.tables.select('dq_quarantine',{id:itemId});
    expect(item).toMatchObject({status:'resolved_accept',resolved_by:by});expect((item.detail as {override?:unknown}).override).toEqual(override);
    expect(await h.tables.select('research_audit_log',{object_id:itemId})).toHaveLength(1);
    expect(await db.applyQuarantineOverride(j.id,override,itemId,{route:'contract'})).toBe('applied');
    expect(await h.tables.select('research_audit_log',{object_id:itemId})).toHaveLength(1);
    expect(await db.applyQuarantineOverride(j.id,{...override,at:new Date(Date.now()+5).toISOString()},itemId,{})).toBe('item_not_open');
    // stale: the override does not match the item / queue it names → nothing written
    const w=await inconsistent(m,b);
    expect(await db.applyQuarantineOverride(w.j.id,overrideOf(by,H('e'),'2026-01-01T00:00:00.000Z'),w.itemId,{})).toBe('stale');   // cutoff differs from the item's
    expect(await db.applyQuarantineOverride(w.j.id,overrideOf(by,H('f')),w.itemId,{})).toBe('stale');                            // another inconsistency
    expect((await db.queueRow(w.j.id))!.override).toBeNull();
    expect((await h.tables.select('dq_quarantine',{id:w.itemId}))[0].status).toBe('open');
    const c=await inconsistent(m,b);
    expect(await db.appendSettlement(c.j.id,null,`adm:${randomUUID()}`,settlementFixture(b,{kind:'void',outcome:null,realized:null,reason:'manual',actor:`admin:${by}`}))).toMatchObject({status:'applied'});
    expect(await db.applyQuarantineOverride(c.j.id,overrideOf(by),c.itemId,{})).toBe('closed');
    expect(await db.applyQuarantineOverride(c.j.id,overrideOf(by),itemId,{})).toBe('item_not_open');                             // item of another judgment
   });
   expect(await code(db.applyQuarantineOverride(randomUUID(),overrideOf(by),randomUUID(),{}))).toBe('unknown_judgment');
   expect(await code(db.applyQuarantineOverride(randomUUID(),{...overrideOf(by),evidence_hash:'x'},randomUUID(),{}))).toBe('invalid_parameter');
   expect(await code(db.applyQuarantineOverride(randomUUID(),{...overrideOf(by),cutoff:undefined as unknown as string},randomUUID(),{}))).toBe('invalid_parameter');
  });

  it('applyQuarantineOverride revokes a held lease: the worker that claimed before the acceptance gets lease_lost on release and append (P1-04)',async()=>{
   const m=await synced();const b=await h.batch();const by=await h.adminUser();
   await h.exclusiveClaims(async()=>{
    const j=await registered(m,b,{target:DUE});
    const first=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!;
    // inconsistent (ONE quarantineSettlement, as settle.ts publishes it), and due again at once (a past next_attempt_at is clamped to now)
    const pub=await db.quarantineSettlement(j.id,first.lease_token!,'settlement_basis_mismatch',{evidence_hash:H('e'),cutoff:CUT,judgment_id:j.id},{...incPatch(H('e'),CUT),next_attempt_at:'2000-01-01T00:00:00.000Z'},b);
    const itemId=pub.quarantine_id!;
    const worker=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!;
    expect(await db.applyQuarantineOverride(j.id,overrideOf(by),itemId,{})).toBe('applied');
    expect((await db.queueRow(j.id))!).toMatchObject({lease_token:null,leased_until:null,last_status:'inconsistent'});
    expect(await code(db.releaseLease(j.id,worker.lease_token!,PARK))).toBe('lease_lost');
    expect(await code(db.appendSettlement(j.id,worker.lease_token!,`${b}:${j.id}:1`,settlementFixture(b)))).toBe('lease_lost');
    expect((await db.queueRow(j.id))!.override).toEqual(expect.objectContaining({evidence_hash:H('e')}));
    const mine=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!;await db.releaseLease(j.id,mine.lease_token!,PARK);
   });
  });

  it('rejectQuarantinedSettlement: void + item resolved_reject + audit at once; replay-safe; stale / item_not_open write nothing (P1-05)',async()=>{
   const m=await synced();const b=await h.batch();const by=await h.adminUser();
   await h.exclusiveClaims(async()=>{
    const {j,itemId}=await inconsistent(m,b);
    const key=`adm:${randomUUID()}`;const row=rejectRow(b,by);
    expect(await db.rejectQuarantinedSettlement(j.id,itemId,EXP,key,row,{route:'contract'})).toEqual({seq:1,status:'applied'});
    expect((await db.settlementsOf([j.id])).map(s=>[s.kind,s.reason,s.actor])).toEqual([['void','quarantine_rejected',`admin:${by}`]]);
    expect((await h.tables.select('dq_quarantine',{id:itemId}))[0]).toMatchObject({status:'resolved_reject',resolved_by:by});
    expect((await db.queueRow(j.id))!.closed_at).not.toBeNull();
    expect(await h.tables.select('research_audit_log',{object_id:itemId})).toHaveLength(1);
    expect(await db.rejectQuarantinedSettlement(j.id,itemId,EXP,key,row,{})).toEqual({seq:1,status:'already_applied'});
    expect(await db.rejectQuarantinedSettlement(j.id,itemId,EXP,key,{...row,reason:'x'},{})).toEqual({seq:1,status:'request_key_conflict'});
    expect(await db.rejectQuarantinedSettlement(j.id,itemId,EXP,`adm:${randomUUID()}`,row,{})).toEqual({seq:1,status:'item_not_open'});
    expect(await h.tables.select('research_audit_log',{object_id:itemId})).toHaveLength(1);
    const s=await inconsistent(m,b,H('e'));
    expect(await db.applyQuarantineOverride(s.j.id,overrideOf(by,H('f')),s.itemId,{})).toBe('stale');   // writes nothing
    const other=await quarantine(h.tables,{dataset:'judgments',table:'judgment_settlements',naturalKey:s.j.id,reasonCode:'settlement_benchmark_gap',batchId:b,payload:{evidence_hash:H('9'),cutoff:CUT}});
    expect(await db.rejectQuarantinedSettlement(s.j.id,other,{evidence_hash:H('9'),cutoff:CUT},`adm:${randomUUID()}`,row,{})).toEqual({seq:0,status:'stale'});   // the queue's inconsistency is not this item's
    // Q1-03: queue and item agree with each other but not with what the hook read → stale, nothing written
    expect(await db.rejectQuarantinedSettlement(s.j.id,s.itemId,{...EXP,evidence_hash:H('f')},`adm:${randomUUID()}`,row,{})).toEqual({seq:0,status:'stale'});
    expect(await db.rejectQuarantinedSettlement(s.j.id,s.itemId,{...EXP,cutoff:'2026-01-01T00:00:00.000Z'},`adm:${randomUUID()}`,row,{})).toEqual({seq:0,status:'stale'});
    expect(await db.settlementsOf([s.j.id])).toEqual([]);
    expect(await code(db.rejectQuarantinedSettlement(s.j.id,s.itemId,EXP,`adm:${randomUUID()}`,{...row,kind:'settled'},{}))).toBe('invalid_parameter');
    expect(await code(db.rejectQuarantinedSettlement(s.j.id,s.itemId,EXP,`adm:${randomUUID()}`,{...row,actor:'cron'},{}))).toBe('invalid_parameter');
    expect(await code(db.rejectQuarantinedSettlement(s.j.id,s.itemId,{evidence_hash:'x',cutoff:CUT},`adm:${randomUUID()}`,row,{}))).toBe('invalid_parameter');
    expect(await db.rejectQuarantinedSettlement(s.j.id,s.itemId,EXP,`adm:${randomUUID()}`,row,{})).toMatchObject({status:'applied'});
   });
  });

  it('quarantineSettlement: lease-checked single write — an expired worker refreshing after its replacement gets lease_lost and changes nothing; the open item is reused and refreshed; quarantined_at of the unresolved incident is kept; a refresh between the hook read and the verdict makes it stale (Q1-01, Q1-02, Q1-03)',async()=>{
   const m=await synced();const b=await h.batch();const by=await h.adminUser();
   const C2='2026-03-05T04:00:00.000Z';
   const pubOf=(id:string,token:string,hash:string,cutoff:string,next?:string)=>db.quarantineSettlement(id,token,'settlement_basis_mismatch',{evidence_hash:hash,cutoff,judgment_id:id},{...incPatch(hash,cutoff),...(next?{next_attempt_at:next}:{})},b);
   let jid='';
   await h.exclusiveClaims(async()=>{
    const j=await registered(m,b,{target:DUE});jid=j.id;
    // First publication; due again at once (a past next_attempt_at is clamped to now).
    const t1=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!.lease_token!;
    const first=await pubOf(j.id,t1,H('e'),CUT,'2000-01-01T00:00:00.000Z');
    expect(first.status).toBe('quarantined');const itemId=first.quarantine_id!;
    expect((await db.queueRow(j.id))!).toMatchObject({last_status:'inconsistent',lease_token:null,leased_until:null,attempts:0,
     last_detail:{evidence_hash:H('e'),cutoff:CUT,incident:{quarantine_id:itemId,reason_code:'settlement_basis_mismatch',evidence_hash:H('e'),cutoff:CUT,quarantined_at:CUT}}});
    const [item]=await h.tables.select('dq_quarantine',{id:itemId});
    expect(item).toMatchObject({dataset:'judgments',table_name:'judgment_settlements',natural_key:j.id,reason_code:'settlement_basis_mismatch',status:'open',batch_id:b});
    const read=item.payload as {evidence_hash:string;cutoff:string};                           // what the hook reads
    // Worker A claims with a 1 s lease and stalls past it; worker B claims the row with a new token and publishes.
    const a=(await db.claimDue(100,1)).find(r=>r.judgment_id===j.id)!;
    await pause(1100);
    const w=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!;
    expect(w.lease_token).not.toBe(a.lease_token);
    expect(await pubOf(j.id,w.lease_token!,H('f'),C2)).toEqual({status:'quarantined',quarantine_id:itemId});   // same open item, refreshed
    // A wakes up and refreshes after its replacement: lease_lost, neither the item nor the queue changes.
    expect(await pubOf(j.id,a.lease_token!,H('d'),C2)).toEqual({status:'lease_lost',quarantine_id:null});
    expect((await h.tables.select('dq_quarantine',{id:itemId}))[0].payload).toMatchObject({evidence_hash:H('f'),cutoff:C2});
    // Q1-01: the incident is still unresolved, so the first quarantined_at survives B's publish.
    expect((await db.queueRow(j.id))!.last_detail).toEqual({reason_code:'settlement_basis_mismatch',evidence_hash:H('f'),cutoff:C2,
     incident:{quarantine_id:itemId,reason_code:'settlement_basis_mismatch',evidence_hash:H('f'),cutoff:C2,quarantined_at:CUT}});
    expect(await h.tables.select('dq_quarantine',{natural_key:j.id,status:'open'})).toHaveLength(1);
    // Q1-03: the hook read (e, CUT) before B's refresh → both verdicts are stale and write nothing.
    expect(await db.rejectQuarantinedSettlement(j.id,itemId,read,`adm:${randomUUID()}`,rejectRow(b,by),{})).toEqual({seq:0,status:'stale'});
    expect(await db.applyQuarantineOverride(j.id,overrideOf(by,read.evidence_hash,read.cutoff),itemId,{})).toBe('stale');
    expect(await db.settlementsOf([j.id])).toEqual([]);
    expect((await h.tables.select('dq_quarantine',{id:itemId}))[0].status).toBe('open');
   });
   expect(await code(db.quarantineSettlement(randomUUID(),randomUUID(),'settlement_basis_mismatch',{evidence_hash:H('e'),cutoff:CUT},incPatch(H('e'),CUT),b))).toBe('unknown_judgment');
   expect(await code(db.quarantineSettlement(jid,randomUUID(),'settlement_basis_mismatch',{evidence_hash:H('e'),cutoff:CUT},{...incPatch(H('e'),CUT),last_status:'pending'},b))).toBe('invalid_parameter');
   expect(await code(db.quarantineSettlement(jid,randomUUID(),'settlement_basis_mismatch',{evidence_hash:H('e'),cutoff:'2026-01-01T00:00:00.000Z'},incPatch(H('e'),CUT),b))).toBe('invalid_parameter');
   expect(await code(db.quarantineSettlement(jid,randomUUID(),'settlement_basis_mismatch',{evidence_hash:H('e'),cutoff:CUT},{...incPatch(H('e'),CUT),attempts_increment:1},b))).toBe('invalid_parameter');
   expect(await code(db.quarantineSettlement(jid,randomUUID(),'settlement_basis_mismatch',{evidence_hash:H('e'),cutoff:CUT},{...incPatch(H('e'),CUT),last_detail:{reason_code:'settlement_basis_mismatch',evidence_hash:H('e'),cutoff:CUT}},b))).toBe('invalid_parameter');   // no incident
  });

  it('releaseLease carries the open incident through error / pending / unavailable and drops a patch incident; the same inconsistency keeps quarantined_at; the incident stays rejectable and the void clears it (R3-01)',async()=>{
   const m=await synced();const b=await h.batch();const by=await h.adminUser();
   await h.exclusiveClaims(async()=>{
    const j=await registered(m,b,{target:DUE});
    const claim=async()=>(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!.lease_token!;
    const PAST='2000-01-01T00:00:00.000Z';                                                     // clamped to now → due again at once
    const pub=await db.quarantineSettlement(j.id,await claim(),'settlement_basis_mismatch',{evidence_hash:H('e'),cutoff:CUT,judgment_id:j.id},{...incPatch(H('e'),CUT),next_attempt_at:PAST},b);
    const inc0={quarantine_id:pub.quarantine_id!,reason_code:'settlement_basis_mismatch',evidence_hash:H('e'),cutoff:CUT,quarantined_at:CUT};
    expect((await db.queueRow(j.id))!.last_detail.incident).toEqual(inc0);
    const transient:QueuePatch[]=[
     {last_status:'error',last_detail:{code:'resolver_failed',message:'boom'},next_attempt_at:PAST,attempts_increment:1},
     {last_status:'pending',last_detail:{reason:'awaiting_bars'},next_attempt_at:PAST,attempts_increment:0},
     {last_status:'unavailable',last_detail:{failure:'timeout',incident:{quarantined_at:'2099-01-01T00:00:00.000Z'}},next_attempt_at:PAST,attempts_increment:1},   // dropped
    ];
    for(const p of transient){
     await db.releaseLease(j.id,await claim(),p);
     const qr=(await db.queueRow(j.id))!;
     expect({s:qr.last_status,d:qr.last_detail}).toEqual({s:p.last_status,d:{...p.last_detail,incident:inc0}});
    }
    const C2='2026-03-09T04:00:00.000Z';
    expect(await db.quarantineSettlement(j.id,await claim(),'settlement_basis_mismatch',{evidence_hash:H('e'),cutoff:C2,judgment_id:j.id},{...incPatch(H('e'),C2),next_attempt_at:PAST},b))
     .toEqual({status:'quarantined',quarantine_id:inc0.quarantine_id});
    expect((await db.queueRow(j.id))!.last_detail.incident).toEqual({...inc0,cutoff:C2});           // first quarantine time kept
    await db.releaseLease(j.id,await claim(),{last_status:'error',last_detail:{code:'resolver_failed',message:'again'},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:1});
    expect(await db.rejectQuarantinedSettlement(j.id,inc0.quarantine_id,{evidence_hash:H('e'),cutoff:C2},`adm:${randomUUID()}`,rejectRow(b,by),{})).toMatchObject({status:'applied'});
    const closed=(await db.queueRow(j.id))!;
    expect(closed.closed_at).not.toBeNull();expect(closed.last_detail.incident).toBeUndefined();
   });
  });

  it('an expired lease is lost even with the matching token (release / append / quarantine write nothing); a reopen clears the override (review 78014c50)',async()=>{
   const m=await synced();const b=await h.batch();const by=await h.adminUser();
   await h.exclusiveClaims(async()=>{
    const j=await registered(m,b,{target:DUE});
    const t=(await db.claimDue(100,1)).find(r=>r.judgment_id===j.id)!.lease_token!;await pause(1150);                  // one claim, one wait: the token stays expired through all three refusals
    expect(await code(db.releaseLease(j.id,t,{...PARK,attempts_increment:1}))).toBe('lease_lost');
    expect(await code(db.appendSettlement(j.id,t,`${b}:${j.id}:1`,settlementFixture(b)))).toBe('lease_lost');
    expect(await db.quarantineSettlement(j.id,t,'settlement_basis_mismatch',{evidence_hash:H('e'),cutoff:CUT,judgment_id:j.id},incPatch(H('e'),CUT),b)).toEqual({status:'lease_lost',quarantine_id:null});
    expect(await db.settlementsOf([j.id])).toEqual([]);
    expect(await db.queueRow(j.id)).toMatchObject({attempts:0,last_status:null,closed_at:null});
    expect(await h.tables.select('dq_quarantine',{natural_key:j.id})).toEqual([]);
    const live=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!;
    await db.releaseLease(j.id,live.lease_token!,PARK);
    // reopened clears the accepted override
    const {j:k,itemId}=await inconsistent(m,b);
    expect(await db.applyQuarantineOverride(k.id,overrideOf(by),itemId,{})).toBe('applied');
    expect((await db.queueRow(k.id))!.override).not.toBeNull();
    const mine=(await db.claimDue(100,600)).find(r=>r.judgment_id===k.id)!;
    expect(await db.appendSettlement(k.id,mine.lease_token!,`${b}:${k.id}:1`,settlementFixture(b))).toEqual({seq:1,status:'applied'});
    expect((await db.queueRow(k.id))!.override).not.toBeNull();
    const A=`admin:${by}`;
    expect(await db.appendSettlement(k.id,null,`adm:${randomUUID()}`,settlementFixture(b,{kind:'withdrawn',outcome:null,realized:null,reason:'bad',actor:A}))).toEqual({seq:2,status:'applied'});
    expect(await db.appendSettlement(k.id,null,`adm:${randomUUID()}`,settlementFixture(b,{kind:'reopened',outcome:null,realized:null,reason:'again',actor:A}))).toEqual({seq:3,status:'applied'});
    expect(await db.queueRow(k.id)).toMatchObject({override:null,closed_at:null,attempts:0,last_status:null,last_detail:{}});
    const again=(await db.claimDue(100,600)).find(r=>r.judgment_id===k.id)!;await db.releaseLease(k.id,again.lease_token!,PARK);
   });
  });

  it('latest view: calibration_valid is judged at now, never at the supplied cutoff (cutoff < valid_until <= now → false)',async()=>{
   const m=await synced({publishable:true});const b=await h.batch();const subject:Subject={type:'macro_region',key:'CN'};
   await registered(m,b,{subject});
   const until=new Date(Date.now()-5000).toISOString();
   expect(await db.insertCalibration(calibrationFixture(m,b,1,{valid_until:until,computed_at:new Date(Date.now()-3_600_000).toISOString()}),1)).toBe('inserted');
   const mine=async(cutoff?:string)=>(await db.latestCards(subject,{view:'latest',cutoff})).find(e=>e.judgment.methodology_id===m.methodology_id)!;
   expect((await mine()).calibration_valid).toBe(false);
   expect((await mine(new Date(Date.parse(until)-1000).toISOString())).calibration_valid).toBe(false);
   expect((await mine(new Date(Date.parse(until)-1000).toISOString())).calibration).not.toBeNull();
  });

  it('apply / reject answer stale for an item that is not the queue incident\'s own: wrong quarantine_id or wrong table_name write nothing',async()=>{
   const m=await synced();const b=await h.batch();const by=await h.adminUser();
   await h.exclusiveClaims(async()=>{
    const {j,itemId}=await inconsistent(m,b);
    const payload={evidence_hash:H('e'),cutoff:CUT,judgment_id:j.id};
    const wrongTable=await quarantine(h.tables,{dataset:'judgments',table:'judgments',naturalKey:j.id,reasonCode:'settlement_basis_mismatch',batchId:b,payload});
    const wrongId=await quarantine(h.tables,{dataset:'judgments',table:'judgment_settlements',naturalKey:j.id,reasonCode:'settlement_benchmark_gap',batchId:b,payload});
    expect(new Set([wrongTable,wrongId,itemId]).size).toBe(3);
    for(const id of [wrongTable,wrongId]){
     expect(await db.applyQuarantineOverride(j.id,overrideOf(by),id,{})).toBe('stale');
     expect(await db.rejectQuarantinedSettlement(j.id,id,EXP,`adm:${randomUUID()}`,rejectRow(b,by),{})).toEqual({seq:0,status:'stale'});
     expect((await h.tables.select('dq_quarantine',{id}))[0].status).toBe('open');
    }
    expect((await db.queueRow(j.id))!.override).toBeNull();
    expect(await db.settlementsOf([j.id])).toEqual([]);
    expect(await h.tables.select('research_audit_log',{object_id:wrongId})).toEqual([]);
    expect(await db.applyQuarantineOverride(j.id,overrideOf(by),itemId,{})).toBe('applied');
    const mine=(await db.claimDue(100,600)).find(r=>r.judgment_id===j.id)!;await db.releaseLease(j.id,mine.lease_token!,PARK);
   });
  });

  it('insertCalibration: calibration_id is unique — a second row with the same id but another fingerprint is refused as duplicate_key (23505)',async()=>{
   const m=await synced();const b=await h.batch();
   const c=calibrationFixture(m,b,1);
   expect(await db.insertCalibration(c,1)).toBe('inserted');
   expect(await code(db.insertCalibration({...c,fingerprint:digest({other:c.calibration_id})},1))).toBe('duplicate_key');
   expect(await db.insertCalibration(c,1)).toBe('duplicate');
  });

  it('envelopeById: the history view semantics by id, publishable-gated; null for unknown ids (P2-01)',async()=>{
   const m=await synced({publishable:true});const hidden=await synced();const b=await h.batch();
   const j=await registered(m,b);const x=await registered(hidden,b);
   expect((await db.envelopeById(j.id,{view:'latest'}))?.judgment.judgment_id).toBe(j.id);
   expect(await db.envelopeById(j.id,{view:'as_known',cutoff:'2000-01-01T00:00:00.000Z'})).toBeNull();
   expect((await db.envelopeById(j.id,{view:'as_known',cutoff:new Date(Date.now()+60_000).toISOString()}))?.judgment.judgment_id).toBe(j.id);
   expect(await db.envelopeById(x.id,{view:'latest'})).toBeNull();
   expect(await db.envelopeById(randomUUID(),{view:'latest'})).toBeNull();
   expect(await code(db.envelopeById(j.id,{view:'as_known'}))).toBe('invalid_parameter');
  });

  it('freezeCalibrationCohort / cohortMembers / clearCalibrationGeneration: a frozen set with its settlements, stable across pages and later writes; a generation is claimed once, even when empty (P1-10, Q1-05)',async()=>{
   const m=await synced();const b=await h.batch();
   const ids:string[]=[];
   for(const as_of of ['2025-03-01','2025-06-01','2025-09-01'])ids.push((await registered(m,b,{as_of})).id);
   await registered(m,b,{as_of:'2024-01-01'});await registered(m,b,{as_of:'2025-05-01',abstained:true});
   await pause(5);   // E-01: frozen_at is truncated to the millisecond; members must be registered before it
   const w={from:'2025-01-01',to:'2025-12-31'};
   const gen=randomUUID();
   const f=await db.freezeCalibrationCohort(gen,m.methodology_id,'v1',w);
   expect(f).toMatchObject({status:'frozen',n:3});expect(Number.isFinite(Date.parse(f.frozen_at))).toBe(true);
   expect(f.frozen_at).toBe(new Date(f.frozen_at).toISOString());                             // E-01: a millisecond value, so adapters round-trip it exactly
   expect(ids.slice().sort()).toEqual((await db.calibrationCohortInternal(m.methodology_id,'v1',w,f.frozen_at,null,100)).map(e=>e.judgment.judgment_id));   // the same set at cutoff = frozen_at
   const later=await registered(m,b,{as_of:'2025-07-01'});                                    // after the freeze
   const p1=await db.cohortMembers(gen,null,2);
   expect(ids.slice().sort().slice(0,2)).toEqual(p1.map(e=>e.judgment.judgment_id));
   const p2=await db.cohortMembers(gen,p1[1].judgment.judgment_id,2);
   expect(p2.map(e=>e.judgment.judgment_id)).toEqual(ids.slice().sort().slice(2));
   expect(await db.cohortMembers(gen,p2[0].judgment.judgment_id,2)).toEqual([]);
   expect([...p1,...p2].map(e=>e.judgment.judgment_id)).not.toContain(later.id);
   expect([...p1,...p2].every(e=>e.settlement===null&&e.calibration===null&&e.calibration_valid===false)).toBe(true);
   expect(await db.freezeCalibrationCohort(gen,m.methodology_id,'v1',w)).toEqual({status:'already_frozen',frozen_at:f.frozen_at,n:3});   // Q1-05: the stored marker, no new members
   expect(await db.cohortMembers(gen,null,10)).toHaveLength(3);
   // Q1-05: an EMPTY generation is claimed too — reuse after a registration in its window stays empty
   const m0=await synced();const empty=randomUUID();
   expect(await db.freezeCalibrationCohort(empty,m0.methodology_id,'v1',w)).toMatchObject({status:'frozen',n:0});
   await registered(m0,b,{as_of:'2025-02-01'});
   expect(await db.freezeCalibrationCohort(empty,m0.methodology_id,'v1',w)).toMatchObject({status:'already_frozen',n:0});
   expect(await db.cohortMembers(empty,null,10)).toEqual([]);
   expect(await db.clearCalibrationGeneration(empty)).toBe(0);
   expect((await db.freezeCalibrationCohort(empty,m0.methodology_id,'v1',w)).status).toBe('frozen');   // cleared → claimable again
   await db.clearCalibrationGeneration(empty);
   expect(await code(db.freezeCalibrationCohort(randomUUID(),m.methodology_id,'v1',{from:'2025-12-31',to:'2025-01-01'}))).toBe('invalid_parameter');
   expect(await code(db.cohortMembers(gen,null,1001))).toBe('invalid_parameter');
   expect(await db.clearCalibrationGeneration(gen)).toBe(3);
   expect(await db.cohortMembers(gen,null,10)).toEqual([]);
   expect(await db.jobState(`cohort:${gen}`)).toBeNull();                                      // the marker goes with the members
   expect(await db.clearCalibrationGeneration(gen)).toBe(0);
  });

  it('queueRow / queueList: due, backoff, leased and all filters with keyset paging by judgment_id',async()=>{
   const m=await synced();const b=await h.batch();
   await h.exclusiveClaims(async()=>{
    const due=await registered(m,b,{target:DUE});const wait=await registered(m,b);const leasedJ=await registered(m,b,{target:DUE});
    const t=(await db.claimDue(100,600)).filter(r=>[due.id,leasedJ.id].includes(r.judgment_id));
    const tk=(id:string)=>t.find(r=>r.judgment_id===id)!.lease_token!;
    await db.releaseLease(due.id,tk(due.id),{last_status:'pending',last_detail:{},next_attempt_at:'2000-01-01T00:00:00.000Z',attempts_increment:0});
    const mineOnly=(rows:QueueRow[])=>rows.map(r=>r.judgment_id).filter(id=>[due.id,wait.id,leasedJ.id].includes(id));
    const list=async(filter:'due'|'backoff'|'leased'|'all')=>{const out:QueueRow[]=[];let after:string|undefined;for(;;){const pg=await db.queueList({filter,limit:500,after});if(pg.length===0)return out;out.push(...pg);after=pg.at(-1)!.judgment_id;}};
    expect(mineOnly(await list('due'))).toEqual([due.id]);
    expect(mineOnly(await list('backoff'))).toEqual([wait.id]);
    expect(mineOnly(await list('leased'))).toEqual([leasedJ.id]);
    const all=await list('all');
    expect(mineOnly(all).sort()).toEqual([due.id,wait.id,leasedJ.id].sort());
    expect(all.map(r=>r.judgment_id)).toEqual(all.map(r=>r.judgment_id).sort());
    expect(await code(db.queueList({filter:'all',limit:0}))).toBe('invalid_parameter');
    expect(await code(db.queueList({filter:'all',limit:501}))).toBe('invalid_parameter');
    const back=(await db.claimDue(100,600)).find(r=>r.judgment_id===due.id)!;
    await db.releaseLease(due.id,back.lease_token!,PARK);await db.releaseLease(leasedJ.id,tk(leasedJ.id),PARK);
   });
  });
 });
}
