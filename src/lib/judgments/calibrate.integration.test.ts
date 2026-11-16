// src/lib/judgments/calibrate.integration.test.ts
// spec §14.2 calibration resume on real PostgreSQL (pgJudgmentsDb over the F4 migration) with the
// in-memory CohortStore: R02/S01 (crash between upload and CAS → orphan never consumed, retry under
// a new attempt id; two concurrent workers → only the CAS winner's page in the manifest), R03
// (registrations on both sides of the cursor after the cutoff stay out), P1-10 (a registration open across the
// freeze stays out; members cleared with the unit), R04 (an unpublished method
// calibrates internally while the anon cohort is empty), R05 (an out-of-window withdrawal changes the
// fingerprint; duplicate clears the unit; a failed clear is retried), acceptance example 10
// (withdrawal during a run → stale_revision, the old report reads invalid). Rows are never cleaned
// up (append-only by design; test:db creates a fresh database per run); every test uses its own method.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {uuidV8} from './uuid-v8';
import {addDays} from './calibration';
import {runCalibrate,stepUnit,unitsOf} from './calibrate';
import type {StepContext,StepOutcome,Unit,UnitState} from './calibrate';
import {digest,inputsHash} from './canonical';
import {memoryCohortStore} from './cohort-store';
import type {CohortStore} from './cohort-store';
import {withClaimLock} from './db-contract';
import {pgJudgmentsDb} from './pg-judgments-db';
import type {Input,JudgmentInsert,JudgmentsDb,MethodologyRow,QueueRow} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const ADMIN=`admin:${randomUUID()}`;
const HEX=(c:string)=>c.repeat(64);

describe.skipIf(!enabled)('F4 calibration job on real PostgreSQL',()=>{
 let pool:Pool;let db:JudgmentsDb;
 const q=async(text:string,values:unknown[]=[])=>(await pool.query(text,values)).rows as Record<string,unknown>[];
 const today=()=>new Date().toISOString().slice(0,10);
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ts-judgments','judgments.calibrate')`,[id]);return id;};
 const issuer=async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Calibrate Test')`,[id]);return id;};
 async function method(publishable:boolean):Promise<MethodologyRow>{
  const id=`zz_cal_${randomUUID().replace(/-/g,'').slice(0,12)}`;
  await db.syncMethodology({methodology_id:id,version:'v1',judgment_type:'synthetic_fact_metric',kind:'probability',producer_kind:'rule',subject_types:['issuer'],input_kinds:['financial_fact'],markets:null,
   title_zh:'校准测试',title_en:'Calibration test',doc_path:`docs/methodologies/${id}/v1.md`,doc_sha256:HEX('a'),implementation_sha256:HEX('b'),
   params:{grace_days:30,threshold_n:3,ece_max:0.1,window_years:3},params_json:{},horizon:{unit:'calendar_days',n:10},upstream:{},deps_sha256:HEX('c'),formula_hash:HEX('d'),
   status:'active',publishable,code_version:'abcdef1'},'script',null);
  return (await db.methodology(id,'v1'))!;
 }
 /** The register_judgment payload of one active probability judgment of `m` on `subject` at `asOf`. */
 async function rowFor(m:MethodologyRow,subject:string,asOf:string):Promise<{row:JudgmentInsert;queue:{settle_after:string;settle_by:string;label_policy:'first_observed'}}>{
  const factId=randomUUID();
  const snapshot={fact_id:factId,issuer_id:subject,market:'US' as const,concept:'revenue',period_start:'2025-07-01',period_end:'2025-09-30',duration:'3M',value_text:'100',unit:'USD',consolidation:'consolidated',available_date:asOf,filing_id:randomUUID(),mapping_gen:1};
  const inputs:Input[]=[{kind:'financial_fact',ref:{fact_id:factId},snapshot,hash:digest(snapshot),available_at:`${asOf}T00:00:00.000Z`,origin:{publisher:'SEC',adapter:'edgar',locator:'companyfacts'}}];
  const inputs_hash=inputsHash(inputs);
  const judgment_id=uuidV8(digest({subject_type:'issuer',subject_key:subject,judgment_type:m.judgment_type,methodology_id:m.methodology_id,methodology_version:m.version,as_of:asOf,inputs_hash,producer_nonce:''}));
  const date=addDays(asOf,10);
  const settle_after=`${date}T00:00:00.000Z`,settle_by=new Date(Date.parse(settle_after)+30*86_400_000).toISOString();
  const row:JudgmentInsert={judgment_id,subject_type:'issuer',subject_key:subject,judgment_type:m.judgment_type,methodology_id:m.methodology_id,methodology_version:m.version,kind:'probability',producer_kind:'rule',producer_ref:{},producer_nonce:'',
   as_of:asOf,inputs,inputs_hash,abstained:false,abstain_reason:null,claim:{p:0.7,event:{zh:'营收同比增长',en:'Revenue grows'}},
   condition:{resolver:'fact_metric',params:{issuer_id:subject,market:'US',metric:'revenue',period_start:'2025-10-01',period_end:'2025-12-31',duration:'3M',unit:'USD',input_unit:'USD',basis:'reported',formula_version:'metrics/1',compare:'yoy'},predicate:{op:'>',rhs:0},text:{zh:'营收同比 > 0',en:'Revenue YoY > 0'}},
   horizon:{unit:'calendar_days',n:10},target:{kind:'date',date},label_policy:'first_observed',settle_after,settle_by,code_version:'abcdef1',batch_id:await batch(),retrospective_hint:{label_available_at:null}};
  return {row,queue:{settle_after,settle_by,label_policy:'first_observed'}};
 }
 /** One active probability judgment of `m` on `subject` at `asOf` (producer_nonce '' — ids differ by as_of / subject). */
 async function register(m:MethodologyRow,subject:string,asOf:string):Promise<string>{
  return registerRow(await rowFor(m,subject,asOf));
 }
 async function registerRow({row,queue}:Awaited<ReturnType<typeof rowFor>>):Promise<string>{
  const judgment_id=row.judgment_id;
  // D6 / Task 4 rule: a due row is registered under the claim lock and parked (next_attempt_at far future) before the
  // lock is released, so no other suite's claimDue ever sees it; settle() makes it due again under the lock.
  await withClaimLock(pool,async()=>{
   await db.registerJudgment(row,queue);
   await q(`update public.judgment_settle_queue set next_attempt_at='2099-01-01T00:00:00Z' where judgment_id=$1`,[judgment_id]);
  });
  return judgment_id;
 }
 /** Under the claim lock only: claim until `id` is held (foreign rows are held too, so claimDue moves on), run fn, then release every foreign row untouched. */
 async function withLease<T>(id:string,fn:(own:QueueRow)=>Promise<T>):Promise<T>{
  const foreign:QueueRow[]=[];let own:QueueRow|undefined;
  try{
   while(!own){
    const rows=await db.claimDue(100,600);
    if(rows.length===0)throw new Error(`queue row ${id} is not due`);
    for(const r of rows)if(r.judgment_id===id)own=r;else foreign.push(r);
   }
   return await fn(own);
  }finally{
   for(const r of foreign)await db.releaseLease(r.judgment_id,r.lease_token!,{last_status:r.last_status??'pending',last_detail:r.last_detail,next_attempt_at:r.next_attempt_at,attempts_increment:0});
  }
 }
 /** D6: settlements go through the cron path — due under the lock, claimDue, appendSettlement with the lease token as 'cron'. */
 async function settle(id:string,outcome:'hit'|'miss'){
  await withClaimLock(pool,async()=>{
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[id]);
   const r=await withLease(id,async own=>db.appendSettlement(id,own.lease_token,`it:${randomUUID()}`,{kind:'settled',outcome,realized:{value:outcome==='hit'?0.1:-0.1,unit:'ratio',from:null,to:null,label_policy:'first_observed'},evidence:{test:true},resolver:'fact_metric',resolver_version:'1',reason:null,actor:'cron',code_version:'abcdef1',batch_id:await batch()}));
   expect(r.status).toBe('applied');
  });
 }
 async function withdraw(id:string){
  const r=await db.appendSettlement(id,null,`it:${randomUUID()}`,{kind:'withdrawn',outcome:null,realized:null,evidence:{test:true},resolver:'fact_metric',resolver_version:'1',reason:'test withdrawal',actor:ADMIN,code_version:'abcdef1',batch_id:await batch()});
  expect(r.status).toBe('applied');
 }
 /** n judgments on one issuer at as_of = today − 200 + 3i; the first `settled` of them settled hit/miss alternately. */
 async function cohort(m:MethodologyRow,n:number,settled:number){
  const subject=await issuer();const ids:string[]=[];
  for(let i=0;i<n;i++)ids.push(await register(m,subject,addDays(today(),-200+3*i)));
  for(let i=0;i<settled;i++)await settle(ids[i],i%2?'miss':'hit');
  return {subject,ids};
 }
 const ctxOf=async(store:CohortStore,prefix:string,over:Partial<StepContext>={}):Promise<StepContext>=>{let u=0;return {db,tables:pgTableClient(pool),store,codeVersion:'abcdef1',batchId:await batch(),uuid:()=>`${prefix}-aaaa-4aaa-8aaa-${String(++u).padStart(12,'0')}`,pageSize:2,...over};};
 const allUnit=(m:MethodologyRow)=>unitsOf(m)[0];
 const stateOf=async(u:Unit)=>((await db.jobState(u.job))?.state??{}) as unknown as UnitState|Record<string,never>;
 const rowsOf=(m:MethodologyRow)=>q(`select calibration_id,scope_type,n_registered,n_settled,validity_revision,fingerprint,cohort_sha256,cohort_path from public.judgment_calibrations where methodology_id=$1 order by computed_at`,[m.methodology_id]);
 async function finish(ctx:StepContext,u:Unit):Promise<StepOutcome>{
  for(let i=0;i<200;i++){const r=await stepUnit(ctx,u);if(r.kind==='finalized'||r.kind==='stale'||r.kind==='conflict')return r;}
  throw new Error('unit did not finish');
 }
 /** Wraps setJobState once; everything else is the real pg db. */
 const withSetJobState=(impl:JudgmentsDb['setJobState']):JudgmentsDb=>new Proxy(db,{get:(t,p)=>{if(p==='setJobState')return impl;const v=(t as unknown as Record<string|symbol,unknown>)[p];return typeof v==='function'?v.bind(t):v;}}) as JudgmentsDb;

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  pool=new Pool({connectionString:state.adminUrl,statement_timeout:8000});
  db=pgJudgmentsDb(pool);
 });
 afterAll(async()=>{await pool?.end();});

 it('R04: an unpublished method calibrates through calibration_cohort_internal while the anon cohort is empty',async()=>{
  const m=await method(false);
  await cohort(m,5,3);
  const cutoff=await db.serverTime();
  const w={from:addDays(today(),-3*366),to:today()};
  expect(await db.calibrationCohort(m.methodology_id,'v1',w,cutoff,null,100)).toEqual([]);
  expect(await db.calibrationCohortInternal(m.methodology_id,'v1',w,cutoff,null,100)).toHaveLength(5);
  const store=memoryCohortStore();
  const r=await runCalibrate({db,tables:pgTableClient(pool),store,methods:[{id:m.methodology_id,version:'v1'}],codeVersion:'abcdef1',deadline:null,pageSize:2,uuid:(()=>{let u=0;return ()=>`dddddddd-aaaa-4aaa-8aaa-${String(++u).padStart(12,'0')}`;})()});
  expect(r.units.map(u=>[u.scope.scope_type,u.outcome])).toEqual([['all','inserted'],['subject_type','inserted']]);
  const rows=await rowsOf(m);
  expect(rows.map(x=>[x.scope_type,x.n_registered,x.n_settled])).toEqual([['all',5,3],['subject_type',5,3]]);
  expect(await db.latestCalibration(m.methodology_id,'v1',{scope_type:'all',scope_key:''})).toBeNull();   // anon: unpublished
  expect(store.objects.has(String(rows[0].cohort_path))).toBe(true);
  expect(await stateOf(allUnit(m))).toEqual({});
 },60000);

 it('R02/S01: a crash between upload and CAS leaves an orphan no manifest names; the retry uses a new attempt id',async()=>{
  const m=await method(false);
  await cohort(m,5,2);
  const store=memoryCohortStore();const u=allUnit(m);
  let crashed=false;
  const crashing=withSetJobState(async(job,expected,state)=>{
   if(!crashed&&Array.isArray((state as {manifest?:unknown[]}).manifest)&&(state as {manifest:unknown[]}).manifest.length>0){crashed=true;throw new Error('process killed');}
   return db.setJobState(job,expected,state);
  });
  const a=await ctxOf(store,'aaaaaaaa',{db:crashing});
  expect((await stepUnit(a,u)).kind).toBe('started');
  await expect(stepUnit(a,u)).rejects.toThrow('process killed');
  const orphans=[...store.objects.keys()].filter(k=>k.startsWith('partial/'));
  expect(orphans).toHaveLength(1);
  store.objects.set(orphans[0],new TextEncoder().encode('{"tampered":true}'));
  const b=await ctxOf(store,'bbbbbbbb');
  const paged=await stepUnit(b,u);
  expect(paged.kind).toBe('paged');
  expect((paged as {path:string}).path).not.toBe(orphans[0]);
  const st=await stateOf(u) as UnitState;
  expect(st.manifest.map(x=>x.path)).not.toContain(orphans[0]);
  const done=await finish(b,u);
  expect(done).toMatchObject({kind:'finalized',status:'inserted',cleared:true});
  expect((await rowsOf(m))[0]).toMatchObject({n_registered:5,n_settled:2});
  expect(store.objects.has(orphans[0])).toBe(true);
 },60000);

 it('R02: two concurrent workers on the same page — only the CAS winner\'s object enters the manifest',async()=>{
  const m=await method(false);
  await cohort(m,4,0);
  const shared=memoryCohortStore();const u=allUnit(m);
  let reached!:()=>void;const atPut=new Promise<void>(r=>{reached=r;});
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const gated:CohortStore={async put(p,bytes,o){const r=await shared.put(p,bytes,o);reached();await gate;return r;},get:p=>shared.get(p),remove:p=>shared.remove(p)};
  const a=await ctxOf(gated,'aaaaaaaa'),b=await ctxOf(shared,'bbbbbbbb');
  expect((await stepUnit(b,u)).kind).toBe('started');
  const pa=stepUnit(a,u);
  await atPut;
  const rb=await stepUnit(b,u);
  expect(rb.kind).toBe('paged');
  release();
  const ra=await pa;
  expect(ra.kind).toBe('page_lost');
  const st=await stateOf(u) as UnitState;
  expect(st.manifest.map(x=>x.path)).toEqual([(rb as {path:string}).path]);
  expect(shared.objects.has((ra as {path:string}).path)).toBe(false);
  expect((await finish(b,u))).toMatchObject({kind:'finalized',status:'inserted'});
  expect((await rowsOf(m))[0].n_registered).toBe(4);
 },60000);

 it('R03: registrations after the cutoff on both sides of the cursor, and a settlement after it, stay out of the cohort',async()=>{
  const m=await method(false);
  const subject=await issuer();
  // Prepare valid content-derived IDs first: the middle four form the frozen cohort,
  // leaving one guaranteed late registration on each side of its page cursor.
  const candidates=[];
  for(let i=0;i<6;i++)candidates.push(await rowFor(m,subject,addDays(today(),-200+3*i)));
  candidates.sort((a,b)=>a.row.judgment_id<b.row.judgment_id?-1:1);
  expect(new Set(candidates.map(x=>x.row.judgment_id)).size).toBe(6);
  const ids=[];
  for(const row of candidates.slice(1,5))ids.push(await registerRow(row));
  await settle(ids[0],'hit');await settle(ids[1],'miss');
  const store=memoryCohortStore();const u=allUnit(m);
  const ctx=await ctxOf(store,'cccccccc');
  expect((await stepUnit(ctx,u)).kind).toBe('started');
  expect((await stepUnit(ctx,u)).kind).toBe('paged');
  const after=(await stateOf(u) as UnitState).after!;
  expect(after).toBe(ids[1]);
  const low=await registerRow(candidates[0]),high=await registerRow(candidates[5]);
  expect(low<after).toBe(true);expect(high>after).toBe(true);
  await settle(ids[3],'hit');                                       // settled after the cutoff
  expect(await finish(ctx,u)).toMatchObject({kind:'finalized',status:'inserted'});
  expect((await rowsOf(m))[0]).toMatchObject({n_registered:4,n_settled:2});
 },60000);

 it('P1-10: a registration whose transaction is open across the freeze stays out of the generation on every page; the members are cleared with the unit',async()=>{
  const m=await method(false);
  const {subject}=await cohort(m,3,1);
  const store=memoryCohortStore();const u=allUnit(m);
  const ctx=await ctxOf(store,'cdcdcdcd');
  const late=await rowFor(m,subject,addDays(today(),-50));
  const c=await pool.connect();
  try{
   await c.query('begin');
   await c.query(`select public.register_judgment($1::jsonb,$2::jsonb)`,[JSON.stringify(late.row),JSON.stringify(late.queue)]);
   await c.query(`update public.judgment_settle_queue set next_attempt_at='2099-01-01T00:00:00Z' where judgment_id=$1`,[late.row.judgment_id]);   // parked before it is ever visible (D6)
   expect((await stepUnit(ctx,u)).kind).toBe('started');                                     // freezes while that registration is uncommitted
   await c.query('commit');
  }finally{c.release();}
  const st=await stateOf(u) as UnitState;
  expect(st.query_bounds).toMatchObject({n:3,frozen_at:st.query_bounds.registered_at_lte});
  expect(await finish(ctx,u)).toMatchObject({kind:'finalized',status:'inserted',cleared:true});
  expect((await rowsOf(m))[0]).toMatchObject({n_registered:3,n_settled:1});                  // committed after the snapshot: consistently out
  expect(await q(`select count(*)::int n from public.judgment_calibration_cohort_members where generation=$1`,[st.generation])).toEqual([{n:0}]);
  // the next generation sees it
  expect(await finish(ctx,u)).toMatchObject({kind:'finalized',status:'inserted'});
  expect((await rowsOf(m))[1]).toMatchObject({n_registered:4});
 },60000);

 it('R05: duplicate clears the unit after a failed clear; an out-of-window withdrawal changes the fingerprint, not the cohort',async()=>{
  const m=await method(true);
  const subject=await issuer();
  const old=await register(m,subject,addDays(today(),-4*366));      // outside the 3-year window
  await settle(old,'hit');
  await cohort(m,3,2);
  const store=memoryCohortStore();const u=allUnit(m);
  let failClear=true;
  const flaky=withSetJobState(async(job,expected,state)=>{if(failClear&&Object.keys(state).length===0){failClear=false;return {ok:false,updated_at:null};}return db.setJobState(job,expected,state);});
  const c1=await ctxOf(store,'eeeeeeee',{db:flaky});
  expect(await finish(c1,u)).toMatchObject({kind:'finalized',status:'inserted',cleared:false});
  expect((await stateOf(u) as UnitState).done).toBe(true);
  const c2=await ctxOf(store,'ffffffff');
  expect(await stepUnit(c2,u)).toMatchObject({kind:'finalized',status:'duplicate',cleared:true});
  expect(await stateOf(u)).toEqual({});
  const [first]=await rowsOf(m);
  expect(first.n_registered).toBe(3);
  expect((await db.latestCalibration(m.methodology_id,'v1',{scope_type:'all',scope_key:''}))?.valid).toBe(true);
  await withdraw(old);                                               // revision + 1; the cohort does not contain `old`
  expect((await db.latestCalibration(m.methodology_id,'v1',{scope_type:'all',scope_key:''}))?.valid).toBe(false);
  expect(await finish(c2,u)).toMatchObject({kind:'finalized',status:'inserted'});
  const rows=await rowsOf(m);
  expect(rows).toHaveLength(2);
  expect(rows[1].n_registered).toBe(rows[0].n_registered);
  expect(Number(rows[1].validity_revision)).toBe(Number(rows[0].validity_revision)+1);
  expect(rows[1].fingerprint).not.toBe(rows[0].fingerprint);
  const entries=async(path:unknown)=>JSON.parse(new TextDecoder().decode((await store.get(String(path)))!)).entries;
  expect(await entries(rows[1].cohort_path)).toEqual(await entries(rows[0].cohort_path));
 },60000);

 it('acceptance example 10: a withdrawal during the run → stale_revision, no new report, the old report reads invalid',async()=>{
  const m=await method(true);
  const {ids}=await cohort(m,3,3);
  const store=memoryCohortStore();const u=allUnit(m);
  const c=await ctxOf(store,'abababab');
  expect(await finish(c,u)).toMatchObject({kind:'finalized',status:'inserted'});
  expect((await db.latestCalibration(m.methodology_id,'v1',{scope_type:'all',scope_key:''}))?.valid).toBe(true);
  expect((await stepUnit(c,u)).kind).toBe('started');
  expect((await stepUnit(c,u)).kind).toBe('paged');
  await withdraw(ids[0]);
  expect(await finish(c,u)).toEqual({kind:'stale',cleared:true});
  expect(await rowsOf(m)).toHaveLength(1);
  const latest=await db.latestCalibration(m.methodology_id,'v1',{scope_type:'all',scope_key:''});
  expect(latest?.valid).toBe(false);
  expect(await stateOf(u)).toEqual({});
 },60000);
});
