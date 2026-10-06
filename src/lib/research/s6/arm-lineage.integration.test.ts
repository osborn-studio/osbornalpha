import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {testPack} from '../../../../scripts/s4/test-pack';
import {importCandidate} from '../s4/import';
import {revealCards} from '../s4/cards';
import {submitDecision} from '../s4/decisions';
import {transaction,closeS4Pool} from '../s4/db';
import {validateArmS4Lineage,type ArmLineageRecord} from './arm-lineage';
import type {ArmRoutingRow} from './arm-eligibility';
import {loadArmRoutingWindow} from './arm-routing';
import {recordDecision} from '../s4/ledger';
import {parseArmCohort,ARM_PLAN_PROTOCOL} from './arm-plan';
import {digest} from '../ingest/pa-v1/json.js';
// Actual legacy S4 writers with synthetic agent input. Not registered disclosure acceptance.
describe.skipIf(!process.env.S4_TEST_STATE)('arm lineage actual writer JSONB round-trip',()=>{
 let admin:Pool;
 const actor={userId:randomUUID(),kind:'agent' as const};
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  admin=new Pool({connectionString:state.adminUrl});
  // Explicit isolated fixture DDL, deliberately not a deployable migration.
  await admin.query(readFileSync('docs/contracts/prototypes/arm-enrollment-storage.sql','utf8'));
  await admin.query('insert into auth.users(id,email) values($1,$2)',[actor.userId,actor.userId+'@example.test']);
  await admin.query("update profiles set role='admin' where id=$1",[actor.userId]);
  await admin.query(`insert into stocks_universe(ticker,name,market,exchange,currency,metadata) values('ARMSYNTH','Synthetic','US','XNYS','USD','{"synthetic":true}') on conflict do nothing`);
 });
 afterAll(async()=>{await closeS4Pool();await admin?.end();});
 it('validates fresh writer records and rejects DB-derived tampering without inventing human labels',async()=>{
  const company=randomUUID();
  await admin.query("insert into research_entities(id,user_id,type,name) values($1,$2,'COMPANY','Arm synthetic company')",[company,actor.userId]);
  const thesis=(await admin.query("insert into research_theses(user_id,title,body,company_ids) values($1,'Synthetic arm thesis','Synthetic only',$2) returning id",[actor.userId,JSON.stringify([company])])).rows[0].id;
  const p=testPack(actor.userId,{companyName:'Arm synthetic company'});
  await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,p.binding.approvedPayloadHash,p.binding]);
  const candidate=await importCandidate(actor,JSON.stringify(p.pack));
  const revealed=await revealCards(actor,candidate.id,{requestKey:randomUUID(),judgment:'Synthetic engineering sample; no human investment judgment',alreadySeen:[],independentJudgment:false});
  const card=revealed.cards.find((c:{payload:Record<string,unknown>})=>c.payload.thesis_id===thesis)!;expect(card).toBeTruthy();
  const input={requestKey:randomUUID(),expectedRevision:0,action:'adopt' as const,reason:'Synthetic writer acceptance only',cardId:card.id,labelId:revealed.labelId,exposureId:revealed.exposureId,securityTicker:'ARMSYNTH',companyEntityId:company,newObservation:true,reviewAt:null};
  const decision=await submitDecision(actor,candidate.id,input);
  const all=(await admin.query('select id,user_id,candidate_id,kind,payload,payload_hash from research_s4_records where user_id=$1 and candidate_id=$2',[actor.userId,candidate.id])).rows as ArmLineageRecord[];
  const o=all.find(r=>r.id===decision.observationId)!;
  const d=all.find(r=>r.id===o.payload.decision_or_candidate_ref)!;
  const s=all.find(r=>r.id===o.payload.input_snapshot_ref)!;
  const t=all.find(r=>r.id===o.payload.thesis_revision_ref)!;
  const l=all.find(r=>r.id===s.payload.label_ref)!;
  const c=all.find(r=>r.id===s.payload.card_ref)!;
  const records=[o,d,s,c,t,l];
  expect(l.payload.actor_kind).toBe('agent');expect(l.payload.independent).toBe(false);
  for(const r of records)expect(digest(r.payload)).toBe(r.payload_hash);
  // Routing values are synthetic projections, not proof of a persisted ledger/ResearchCard link.
  const row:ArmRoutingRow={decision_id:randomUUID(),research_card_id:randomUUID(),thesis_id:thesis,week_of:l.payload.evaluation_period_id as string,arm:'collab',action:'adopt',observation_id:o.id};
  expect(validateArmS4Lineage(actor.userId,row,records).s4_decision_id).toBe(d.id);
  expect(()=>validateArmS4Lineage(actor.userId,{...row,arm:'human_baseline'},records)).toThrow('not_configured');
  // Actual ledger read projection, still not proof that this synthetic card ID exists.
  expect(await transaction(actor,db=>loadArmRoutingWindow(db,actor))).toEqual([]);
  const ledger=await recordDecision(actor,{thesis_id:thesis,week_of:row.week_of,arm:'collab',action:'adopt',reason:'Synthetic routing test only',card_id:row.research_card_id,observation_id:o.id});
  const routed=await transaction(actor,db=>loadArmRoutingWindow(db,actor,row.week_of));
  expect(routed).toEqual([{...row,decision_id:ledger.id}]);
  expect(typeof routed[0].week_of).toBe('string');
  expect(await transaction(actor,db=>loadArmRoutingWindow(db,actor,'9999-12-31'))).toEqual([]);
  await recordDecision(actor,{thesis_id:thesis,week_of:'1900-01-01',arm:'collab',action:'adopt',reason:'Synthetic unsupported row with missing observation'});
  await expect(transaction(actor,db=>loadArmRoutingWindow(db,actor))).rejects.toThrow('not_configured');
  await recordDecision(actor,{thesis_id:thesis,week_of:'1900-01-08',arm:'collab',action:'adopt',reason:'Synthetic observation reuse across boundary',card_id:row.research_card_id,observation_id:o.id});
  await expect(transaction(actor,db=>loadArmRoutingWindow(db,actor,row.week_of))).rejects.toThrow('not_configured');
  const bad=structuredClone(records);bad[2].payload.card_hash='0'.repeat(64);bad[2].payload_hash=digest(bad[2].payload);bad[0].payload.input_snapshot_hash=bad[2].payload_hash;bad[0].payload_hash=digest(bad[0].payload);
  expect(()=>validateArmS4Lineage(actor.userId,row,bad)).toThrow('hash_mismatch');
  expect(()=>validateArmS4Lineage(randomUUID(),row,records)).toThrow('hash_mismatch');
  await submitDecision(actor,candidate.id,{...input,requestKey:randomUUID(),expectedRevision:decision.revision,action:'reject',newObservation:false});
  // Original observation lineage remains immutable, not a statement that it is still eligible.
  const after=(await admin.query('select payload,payload_hash from research_s4_records where id=$1',[o.id])).rows[0];
  expect(after).toEqual({payload:o.payload,payload_hash:o.payload_hash});
  expect(()=>validateArmS4Lineage(actor.userId,{...row,action:'reject'},records)).toThrow('not_configured');
  const shadow=await submitDecision(actor,candidate.id,{...input,requestKey:randomUUID(),expectedRevision:decision.revision+1,action:'reject',newObservation:true});
  const newer=(await admin.query('select id,user_id,candidate_id,kind,payload,payload_hash from research_s4_records where user_id=$1 and candidate_id=$2',[actor.userId,candidate.id])).rows as ArmLineageRecord[];
  const shadowObs=newer.find(r=>r.id===shadow.observationId)!;
  const shadowDecision=newer.find(r=>r.id===shadowObs.payload.decision_or_candidate_ref)!;
  const shadowSnapshot=newer.find(r=>r.id===shadowObs.payload.input_snapshot_ref)!;
  expect(shadowObs.payload.observation_kind).toBe('shadow');
  expect(validateArmS4Lineage(actor.userId,{...row,action:'reject',observation_id:shadowObs.id},[shadowObs,shadowDecision,shadowSnapshot,c,t,l]).observation_id).toBe(shadowObs.id);
 });
 it('detects 101 persisted rows before unsupported-row checks, rather than silently truncating at100',async()=>{
  const a={userId:randomUUID(),kind:'agent' as const};
  await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,a.userId+'@example.test']);
  await admin.query("update profiles set role='admin' where id=$1",[a.userId]);
  const thesis=(await admin.query("insert into research_theses(user_id,title,body) values($1,'Synthetic overflow','Synthetic only') returning id",[a.userId])).rows[0].id;
  for(let i=0;i<100;i++)await recordDecision(a,{thesis_id:thesis,week_of:'2026-10-05',arm:'collab',action:'adopt',reason:'Synthetic unlinked routing count'});
  await expect(transaction(a,db=>loadArmRoutingWindow(db,a))).rejects.toThrow('not_configured');
  await recordDecision(a,{thesis_id:thesis,week_of:'2026-10-05',arm:'collab',action:'adopt',reason:'Synthetic overflow row101'});
  await expect(transaction(a,db=>loadArmRoutingWindow(db,a))).rejects.toThrow('input_limit');
 });
 it('persists candidate-only arm enrollment storage with real owner RLS, immutable rows and rollback',async()=>{
  const p=testPack(actor.userId,{companyName:'Synthetic arm storage'});
  await admin.query('insert into research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)',[actor.userId,p.binding.approvedPayloadHash,p.binding]);
  const candidate=await importCandidate(actor,JSON.stringify(p.pack));
  const enrollment=randomUUID();const now=(await admin.query('select clock_timestamp() as t')).rows[0].t.getTime() as number;
  // Structural storage fixture only; never a confirmed human arm or comparison.
  const cohort=parseArmCohort({protocol:ARM_PLAN_PROTOCOL,owner_id:actor.userId,enrollment_id:enrollment,candidate_id:candidate.id,thesis_id:randomUUID(),security_identity_hash:'a'.repeat(64),calendar_hash:'b'.repeat(64),evaluation_policy_hash:'c'.repeat(64),enrolled_at:new Date(now-30000).toISOString(),confirmation_deadline:new Date(now+1800000).toISOString(),session_anchor:new Date(now+3600000).toISOString(),observation_ids:{human_baseline:randomUUID(),ai_candidate:randomUUID(),collab:randomUUID()}});
  const hash=digest(cohort),eventId=randomUUID(),key=randomUUID();
  await transaction(actor,async db=>{
   await db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[actor.userId,enrollment,candidate.id,cohort,hash]);
   const payload={reason:'refusal',previous_state:'enrolled'};
   await db.query(`insert into research_s6_arm_events(user_id,enrollment_id,id,sequence,event_type,payload,payload_hash,request_key,request_hash) values($1,$2,$3,1,'terminated',$4,$5,$6,$5)`,[actor.userId,enrollment,eventId,payload,digest(payload),key]);
  });
  const rows=await transaction(actor,db=>db.query('select cohort,cohort_hash from research_s6_arm_enrollments where id=$1',[enrollment]));
  expect(rows.rows[0]).toEqual({cohort,cohort_hash:hash});
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  const runtime=new Pool({connectionString:state.runtimeUrl});const db=await runtime.connect();
  try{
   await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[randomUUID()]);
   expect((await db.query('select * from research_s6_arm_enrollments where id=$1',[enrollment])).rowCount).toBe(0);
   expect((await db.query('select * from research_s6_arm_events where id=$1',[eventId])).rowCount).toBe(0);
   await expect(db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[actor.userId,randomUUID(),candidate.id,cohort,hash])).rejects.toMatchObject({code:'42501'});
  }finally{await db.query('rollback');db.release();await runtime.end();}
  for(const role of ['anon','authenticated','service_role'])for(const table of ['research_s6_arm_enrollments','research_s6_arm_events']){
   const db=await admin.connect();try{await db.query('begin');await db.query(`set local role ${role}`);await expect(db.query(`select * from ${table}`)).rejects.toMatchObject({code:'42501'});}finally{await db.query('rollback');db.release();}
   expect((await admin.query("select has_any_column_privilege($1,$2,'INSERT') as allowed",[role,table])).rows[0].allowed).toBe(false);
  }
  for(const table of ['research_s6_arm_enrollments','research_s6_arm_events']){
   for(const action of [`update ${table} set recorded_at=now()`,`delete from ${table}`,`truncate ${table}`])await expect(transaction(actor,db=>db.query(action))).rejects.toMatchObject({code:'42501'});
   await expect(admin.query(`truncate ${table} cascade`)).rejects.toMatchObject({code:'23514'});

   await expect(admin.query(`update ${table} set recorded_at=now() where user_id=$1`,[actor.userId])).rejects.toMatchObject({code:'23514'});
   await expect(admin.query(`delete from ${table} where user_id=$1`,[actor.userId])).rejects.toMatchObject({code:'23514'});
  }
  await expect(transaction(actor,db=>db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[actor.userId,randomUUID(),candidate.id,cohort,hash]))).rejects.toMatchObject({code:'23514'});
  for(const [sequence,previous,payload,requestKey] of [[1,null,{reason:'refusal',previous_state:'enrolled'},key],[2,null,{reason:'refusal',previous_state:'enrolled'},randomUUID()],[2,'a'.repeat(64),{},randomUUID()]] as const){
   await expect(transaction(actor,db=>db.query(`insert into research_s6_arm_events(user_id,enrollment_id,id,sequence,event_type,previous_event_hash,payload,payload_hash,request_key,request_hash) values($1,$2,$3,$4,'terminated',$5,$6,$7,$8,$7)`,[actor.userId,enrollment,randomUUID(),sequence,previous,payload,digest(payload),requestKey]))).rejects.toMatchObject({code:sequence===1?'23505':'23514'});
  }
  const assertValidCohortControl=async()=>{
   const id=randomUUID(),payload={...cohort,enrollment_id:id};
   await transaction(actor,db=>db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[actor.userId,id,candidate.id,payload,digest(payload)]));
  };
  await assertValidCohortControl();
  for(const patch of [{extra:true},{owner_id:randomUUID()},{calendar_hash:null},{enrolled_at:new Date(now+600000).toISOString(),confirmation_deadline:new Date(now+900000).toISOString(),session_anchor:new Date(now+1200000).toISOString()},{confirmation_deadline:cohort.enrolled_at},{observation_ids:{...cohort.observation_ids,collab:cohort.observation_ids.ai_candidate}},{session_anchor:'2026-10-07T24:00:00.000Z'}]){
   const id=randomUUID();const payload={...cohort,enrollment_id:id,...patch};await expect(transaction(actor,db=>db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[actor.userId,id,candidate.id,payload,digest(payload)]))).rejects.toMatchObject({code:'23514'});
  }
  await expect(transaction(actor,db=>db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash,recorded_at) values($1,$2,$3,$4,$5,now())',[actor.userId,randomUUID(),candidate.id,cohort,hash]))).rejects.toMatchObject({code:'42501'});
  const second=randomUUID();const secondCohort={...cohort,enrollment_id:second};
  await transaction(actor,db=>db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[actor.userId,second,candidate.id,secondCohort,digest(secondCohort)]));
  const terminalPayload={reason:'refusal',previous_state:'enrolled'};
  for(const [target,requestKey,constraint] of [[enrollment,randomUUID(),'research_s6_arm_events_user_id_enrollment_id_key'],[second,key,'research_s6_arm_events_user_id_request_key_key']]){
   await expect(transaction(actor,db=>db.query(`insert into research_s6_arm_events(user_id,enrollment_id,id,sequence,event_type,payload,payload_hash,request_key,request_hash) values($1,$2,$3,1,'terminated',$4,$5,$6,$5)`,[actor.userId,target,randomUUID(),terminalPayload,digest(terminalPayload),requestKey]))).rejects.toMatchObject({code:'23505',constraint});
  }

  // Matching owner claims do not permit a foreign owner's real candidate/enrollment.
  const other={userId:randomUUID(),kind:'agent' as const};
  await admin.query('insert into auth.users(id,email) values($1,$2)',[other.userId,other.userId+'@example.test']);
  await admin.query("update profiles set role='admin' where id=$1",[other.userId]);
  const foreignId=randomUUID(),foreignCohort={...cohort,owner_id:other.userId,enrollment_id:foreignId};
  await expect(transaction(other,db=>db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[other.userId,foreignId,candidate.id,foreignCohort,digest(foreignCohort)]))).rejects.toMatchObject({code:'23503',constraint:'research_s6_arm_enrollments_user_id_candidate_id_fkey'});
  await expect(transaction(other,db=>db.query(`insert into research_s6_arm_events(user_id,enrollment_id,id,sequence,event_type,payload,payload_hash,request_key,request_hash) values($1,$2,$3,1,'terminated',$4,$5,$6,$5)`,[other.userId,enrollment,randomUUID(),terminalPayload,digest(terminalPayload),randomUUID()]))).rejects.toMatchObject({code:'23503',constraint:'research_s6_arm_events_user_id_enrollment_id_fkey'});
  for(const role of ['anon','authenticated','service_role'])for(const table of ['research_s6_arm_enrollments','research_s6_arm_events']){
   const db=await admin.connect();try{
    await db.query('begin');await db.query(`set local role ${role}`);
    if(table==='research_s6_arm_enrollments')await expect(db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[actor.userId,second,candidate.id,secondCohort,digest(secondCohort)])).rejects.toMatchObject({code:'42501'});
    else await expect(db.query(`insert into research_s6_arm_events(user_id,enrollment_id,id,sequence,event_type,payload,payload_hash,request_key,request_hash) values($1,$2,$3,1,'terminated',$4,$5,$6,$5)`,[actor.userId,second,randomUUID(),terminalPayload,digest(terminalPayload),randomUUID()])).rejects.toMatchObject({code:'42501'});
   }finally{await db.query('rollback');db.release();}
  }
  const invalidCohorts:Record<string,unknown>[]=[];
  for(const field of ['thesis_id','security_identity_hash','calendar_hash','evaluation_policy_hash','enrolled_at','confirmation_deadline','session_anchor'])for(const value of [0,null,[]])invalidCohorts.push({...cohort,[field]:value});
  const missing={...cohort} as Record<string,unknown>;delete missing.thesis_id;invalidCohorts.push(missing,{...cohort,thesis_id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'},{...cohort,observation_ids:{...cohort.observation_ids,extra:randomUUID()}},{...cohort,session_anchor:cohort.confirmation_deadline});
  await assertValidCohortControl();
  for(const raw of invalidCohorts){
   const id=randomUUID(),payload={...raw,enrollment_id:id};await expect(transaction(actor,db=>db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[actor.userId,id,candidate.id,payload,digest(payload)]))).rejects.toMatchObject({code:'23514'});
  }
  // Any non-null previous hash is forbidden at seq1; no hash-format coverage claimed.
  // Unused enrollment isolates CHECK refusals from unique-enrollment collisions.
  for(const patch of [{sequence:0},{sequence:101},{event_type:'baseline.confirmed'},{previous_event_hash:'a'.repeat(64)},{request_key:'short'},{request_key:'invalid key'},{payload:[]},{payload:{reason:'revocation',previous_state:'enrolled'}},{payload:{reason:'refusal',previous_state:'ai_exposed'}},{payload:{reason:0,previous_state:'enrolled'}},{payload:{...terminalPayload,extra:true}}]){
   const input={sequence:1,event_type:'terminated',previous_event_hash:null,request_key:randomUUID(),payload:terminalPayload,...patch};
   await expect(transaction(actor,db=>db.query('insert into research_s6_arm_events(user_id,enrollment_id,id,sequence,event_type,previous_event_hash,payload,payload_hash,request_key,request_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$8)',[actor.userId,second,randomUUID(),input.sequence,input.event_type,input.previous_event_hash,input.payload,digest(input.payload),input.request_key]))).rejects.toMatchObject({code:'23514'});
  }
  const rollbackId=randomUUID();
  await expect(transaction(actor,async db=>{await db.query('insert into research_s6_arm_enrollments(user_id,id,candidate_id,cohort,cohort_hash) values($1,$2,$3,$4,$5)',[actor.userId,rollbackId,candidate.id,{...cohort,enrollment_id:rollbackId},hash]);throw new Error('synthetic rollback');})).rejects.toThrow('synthetic rollback');
  expect((await admin.query('select 1 from research_s6_arm_enrollments where id=$1',[rollbackId])).rowCount).toBe(0);
  expect((await admin.query('select 1 from research_s6_arm_events where enrollment_id=$1',[enrollment])).rowCount).toBe(1);
 });

});
