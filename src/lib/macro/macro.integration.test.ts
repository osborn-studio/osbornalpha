// src/lib/macro/macro.integration.test.ts
// Macro workbench migration on real PostgreSQL (spec §4.3, §0.2 M10/M16/M22/M24/N1/N2; plan 第 4 稿
// P1-4/P1-5/P1-6/P1-8/P1-11/P2-1/P2-4): twelve RLS tables, the private macro-raw bucket, per-role grants and
// policies, every branch of the macro_write_observations rules (insert / duplicate / versioned /
// unexpected_revision / conflicting_rows / stale_delivery / missing_evidence / missing_input, conflict
// observation ids, input_revision bump), publication eligibility (running / failed batches and their
// derivations never publish; the eligible read RPCs skip them), publish_macro_snapshot (manifest + history
// validation, supersede, stale_publisher on revision and on input_revision, two racing publishers),
// republish_macro_snapshot, record_failed_macro_snapshot, quarantine members with macro_resolve_conflict
// (accept one member, the rest rejected, reject_only in SQL, audit row), the ingest lease, chunk claiming
// and resumable finish progress, and the analysis-run quota. 第 5 稿: owner-token fencing of every ingest
// mutation after a takeover (P1-3/P2-1), exclusive finish with rotating finish tokens and publish-key replay
// (P1-4/P1-5), rejected-value finality (P1-2), quarantine reuse only from eligible/current batches and
// member_ineligible (P1-6), link-vs-resolve on the item row lock with two connections (P2-3). 第 6 稿: fenced finish side
// effects — macro_record_freshness (parity with computeFreshness, checkpoint in the same transaction, token mismatch before any
// terminal-state error) and macro_finalize_batch (AKShare finish and cron; a fatal abort finishes failed and its rows stay
// ineligible), with a barrier test (P1-1/P2-4); macro_regime_results service-only (P1-2); native_usable on chunks (P2-1); a
// closed item whose exact member was concurrently accepted / rejected completes the link (P2-3).
// Rows are never cleaned up (append-only by design; test:db creates a fresh database per run);
// every test uses its own series ids. Publish state rows (US/CN) are shared, so publish tests
// always read the current state right before publishing.
import {readFileSync} from 'node:fs';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {computeFreshness} from '../dq/freshness';
import type {Cadence} from '../dq/freshness';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261114090000_macro_workbench.sql';
const TABLES=['macro_series','macro_catalog_versions','macro_evidence_objects','macro_retrievals','macro_observations','macro_snapshots','macro_regime_results','macro_publish_state','macro_ingest_chunks','macro_ingest_runs','macro_quarantine_members','macro_analysis_runs'];
const SERVICE_READ=['macro_publish_state','macro_ingest_chunks','macro_ingest_runs','macro_quarantine_members','macro_regime_results'];   // regime results: 第 6 稿 P1-2
const PUBLIC_READ=['macro_series','macro_catalog_versions','macro_evidence_objects','macro_retrievals','macro_observations','macro_snapshots'];
const SERVICE_RPCS=[
 'public.macro_upsert_catalog(text,text,jsonb)',
 'public.macro_put_retrieval(text,text,text,text,bigint,text,text,int,timestamptz,uuid,jsonb,uuid)',
 'public.macro_write_observations(uuid,text,jsonb,uuid)',
 'public.publish_macro_snapshot(text,bigint,bigint,date,text,text,uuid[],uuid[],jsonb,jsonb,jsonb,text,numeric,text,uuid,uuid,uuid)',
 'public.macro_next_snapshot_cursor()',
 'public.republish_macro_snapshot(uuid,bigint,bigint)',
 'public.record_failed_macro_snapshot(text,date,text,text,text)',
 'public.macro_link_quarantine(uuid,uuid[],uuid,uuid)',
 'public.macro_resolve_conflict(uuid,text,uuid,uuid)',
 'public.macro_assert_owner(uuid,uuid,text[])',
 'public.macro_claim_ingest(uuid,text,interval,interval,boolean)',
 'public.macro_claim_chunk(uuid,int,int,uuid)',
 'public.macro_complete_chunk(uuid,int,jsonb,int,jsonb,jsonb,jsonb,uuid)',
 'public.macro_begin_finish(uuid,int,uuid)',
 'public.macro_record_finish_step(uuid,text,jsonb,uuid,uuid)',
 'public.macro_finalize_batch(uuid,uuid,uuid,text,jsonb,jsonb,timestamptz)',
 'public.macro_record_freshness(uuid,uuid,uuid,text,boolean,text,timestamptz,jsonb)',
 'public.macro_ineligible_ids(uuid[],uuid)',
 'public.macro_manifest_ok(text,uuid[])',
 'public.macro_latest_eligible_observations(text[],timestamptz,date,uuid)',
 'public.macro_eligible_history(text,date,date,timestamptz,uuid,date,int)',
 'public.create_macro_analysis_run(uuid,uuid,text,jsonb,jsonb,text,jsonb,text,text,text,text)',
];
const READ_RPCS=['public.macro_latest_observations(text[],timestamptz,date)','public.macro_snapshots_since(timestamptz,uuid,int)','public.macro_batch_eligible(uuid)'];

// Same replay policy as facts.integration.test.ts (not exported there): one transaction, short
// lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{c.release();}
 }
}

type PgErr={message:string;code?:string};
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
type Conflict={series_id:string;period_end:string;reason:string;value_text:string;current_value_text:string|null;observation_id:string|null};
type WriteResult={inserted:number;duplicates:number;versioned:number;quarantined:number;conflicts:Conflict[]};
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const T1='2026-11-01T05:30:00.000Z',T2='2026-11-02T05:30:00.000Z',T3='2026-11-03T05:30:00.000Z';

describe.skipIf(!enabled)('macro workbench migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const sid=(p='T')=>`${p}_${randomBytes(5).toString('hex').toUpperCase()}`;
 const src=(key:string)=>({adapter:'fred_csv',fetchHost:'fred.stlouisfed.org',publisher:{zh:'美国劳工统计局',en:'BLS'},via:{zh:'FRED（圣路易斯联储）',en:'FRED (St. Louis Fed)'},seriesKey:key,rights:'public_domain',attribution:{zh:'来源：BLS，经 FRED',en:'Source: BLS via FRED'}});
 const def=(id:string,o:Record<string,unknown>={})=>({id,region:'US',role:'indicator',type:'labor_rate',name:{zh:id,en:id},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:src(id),revisionPolicy:'revisable',weight:0,changeKind:'pp',definitionVersion:1,...o});
 const catalog=async(defs:Record<string,unknown>[])=>{
  const v=`macro-catalog/${randomBytes(6).toString('hex')}`;
  expect(await one(`select public.macro_upsert_catalog($1,'macro-rules/1',$2::jsonb) v`,[v,JSON.stringify(defs)])).toBe(defs.length);
  return v;
 };
 /** A running batch (status default 'running'), as startBatch leaves it. */
 const batch=async(dataset='macro.fred')=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ts-fred',$2)`,[id,dataset]);return id;};
 /** Finishes a batch as finishBatch would (status + finished_at together: the DQ invariant). */
 const finish=async(b:string,status='success')=>{await q(`update public.ingest_batches set status=$2, finished_at=now() where batch_id=$1 and status='running'`,[b,status]);};
 /** token: the run's owner token (AKShare path, 第 5 稿 P1-3); null = FRED cron (a batch without a run row). */
 const retrieval=async(b:string,fetchedAt:string,body:string=randomUUID(),token:string|null=null)=>{
  const h=sha(body);
  return await one(`select public.macro_put_retrieval($1,$2,'fred_csv','text/csv',$3,'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE','fred.stlouisfed.org',200,$4,$5,'{"node":"22"}'::jsonb,$6) v`,[h,`fred_csv/${h}.csv`,Buffer.byteLength(body),fetchedAt,b,token]) as string;
 };
 const write=async(b:string,rows:unknown[],token:string|null=null)=>(await one(`select public.macro_write_observations($1,'test-code',$2::jsonb,$3) v`,[b,JSON.stringify(rows),token])) as WriteResult;
 const native=(series:string,period:string,value:string,ret:string,at:string,revisable=true)=>({series_id:series,period_end:period,value_text:value,available_at:at,revisable,retrieval_id:ret,locator:{kind:'csv_row',line:2,column:1}});
 const derived=(series:string,period:string,value:string,from:string[],at:string)=>({series_id:series,period_end:period,value_text:value,available_at:at,revisable:true,derived_from:from,transform:'month_end@1'});
 const rows=async(series:string,period:string)=>q(`select observation_id,value_text,version,status,available_at from public.macro_observations where series_id=$1 and period_end=$2 order by version`,[series,period]);
 const state=async(region:'US'|'CN')=>(await q(`select revision::int r,input_revision::int i from public.macro_publish_state where region=$1`,[region]))[0] as {r:number;i:number};
 const asRole=async<T>(role:string,body:(c:PoolClient)=>Promise<T>,sub?:string):Promise<T>=>{
  const c=await admin.connect();
  try{
   await c.query(`set role ${role}`);
   if(sub)await c.query(`select set_config('request.jwt.claim.sub',$1,false)`,[sub]);
   return await body(c);
  }finally{
   await c.query('reset role').catch(()=>{});
   await c.query(`select set_config('request.jwt.claim.sub','',false)`).catch(()=>{});
   c.release();
  }
 };
 const user=async(plan='free',role='user')=>{
  const id=randomUUID();
  await q('insert into auth.users(id,email) values($1,$2)',[id,`${id}@example.test`]);
  await q(`insert into public.profiles(id,email,plan,role) values($1,$2,$3,$4) on conflict (id) do update set plan=excluded.plan, role=excluded.role`,[id,`${id}@example.test`,plan,role]);
  return id;
 };
 const counts={verified:1,missing:0,restricted:0};
 const publish=(region:'US'|'CN',rev:number,inputRev:number,catalogVersion:string,ids:string[],history:string[]=[],k:{key?:string;batch?:string;token?:string|null;ft?:string|null}={})=>
  one(`select public.publish_macro_snapshot($1,$2,$3,'2026-11-06','macro-method/1.0',$4,$5::uuid[],$6::uuid[],$7::jsonb,null,'[]'::jsonb,'macro-rules/1',0,$8,$9,$10,$11) v`,[region,rev,inputRev,catalogVersion,ids,history,JSON.stringify(counts),k.key??null,k.batch??null,k.token??null,k.ft??null]) as Promise<{snapshot_id:string;revision:number;replayed:boolean}>;
 /** A fresh US series with one ok observation (period 2026-09-30, value 4.1, fetched T2) in the FINISHED (success) batch b0, so
  *  the row is publication-eligible. b is a second RUNNING batch for the test's later writes. Returns ids. */
 const seeded=async(o:Record<string,unknown>={})=>{
  const s=sid();const v=await catalog([def(s,o)]);const b0=await batch();const r=await retrieval(b0,T2);
  expect((await write(b0,[native(s,'2026-09-30','4.1',r,T2)])).inserted).toBe(1);
  await finish(b0);
  const [row]=await rows(s,'2026-09-30');
  return {s,v,b0,b:await batch(),r,id:row.observation_id as string};   // b: a second, still RUNNING batch (a finished batch takes no writes, review R2)
 };
 /** macro_claim_ingest (第 5 稿 P1-3): timeout = the NEW run's processing_timeout; takeover lets this claim abort live runs whose
  *  processing chunk is older than their own timeout. */
 const claim=(dataset:string,b:string,maxAge='2 hours',o:{takeover?:boolean;timeout?:string}={})=>
  one(`select public.macro_claim_ingest($1,$2,$3::interval,$4::interval,$5) v`,[b,dataset,maxAge,o.timeout??'10 minutes',o.takeover??false]) as Promise<{status:string;owner_token?:string;aborted:string[];holder?:string}>;
 /** An open dq_quarantine item for series|period (macro.fred, macro_observations). */
 const qItem=async(series:string,b:string,reason='unexpected_revision',period='2026-09-30')=>{const id=randomUUID();await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,'macro.fred','macro_observations',$2,$3,$4)`,[id,`${series}|${period}`,reason,b]);return id;};
 const dataset=()=>`macro.t${randomBytes(4).toString('hex')}`;
 const ZERO={fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0};
 /** A claimed run of a fresh dataset already 'finishing' (total 0, no chunks): dataset, batch, owner token, finish token. */
 const finishingRun=async()=>{
  const ds=dataset();const b=await batch(ds);const t=(await claim(ds,b)).owner_token!;
  const ft=(await one(`select public.macro_begin_finish($1,0,$2) v`,[b,t])).finish_token as string;
  return {ds,b,t,ft};
 };
 /** macro_finalize_batch (第 6 稿 P1-1/P2-4); both tokens null = the cron path (a batch without a run row). */
 const finalize=(b:string,status:string,o:{t?:string|null;ft?:string|null;counts?:unknown;errors?:unknown[];at?:string}={})=>
  one(`select public.macro_finalize_batch($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) v`,[b,o.t??null,o.ft??null,status,JSON.stringify(o.counts??ZERO),JSON.stringify(o.errors??[]),o.at??new Date().toISOString()]) as Promise<{status:string;finalized:boolean}>;
 /** macro_record_freshness (第 6 稿 P1-1). */
 const freshness=(b:string,t:string,ft:string,ds:string,ok:boolean,now:string,o:{cadence?:string;detail?:unknown}={})=>
  one(`select public.macro_record_freshness($1,$2,$3,$4,$5,$6,$7,$8::jsonb) v`,[b,t,ft,ds,ok,o.cadence??'daily',now,JSON.stringify(o.detail??{})]) as Promise<Record<string,unknown>>;
 const freshRow=async(ds:string)=>(await q(`select expected_cadence,last_ok_at,last_attempt_at,consecutive_errors,status,detail from public.dq_freshness where dataset=$1`,[ds]))[0];

 beforeAll(async()=>{
  const st=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:st.adminUrl});
 });
 afterAll(async()=>{await admin?.end();});

 it('creates twelve RLS tables, the private macro-raw bucket, seeded publish state, select-only grants, service-only RPCs, and replays twice',async()=>{
  const t=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(t.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of t)expect(r.relrowsecurity).toBe(true);
  expect(await q(`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='macro-raw'`)).toEqual([{id:'macro-raw',public:false,file_size_limit:'52428800',allowed_mime_types:['text/csv','application/json','text/html','text/plain']}]);
  expect((await q(`select region from public.macro_publish_state order by region`)).map(r=>r.region)).toEqual(['CN','US']);
  const priv=(role:string,tb:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,tb,p]);
  for(const role of ['anon','authenticated','service_role'])for(const tb of TABLES)for(const p of ['INSERT','UPDATE','DELETE','TRUNCATE'])expect({role,tb,p,ok:await priv(role,tb,p)}).toEqual({role,tb,p,ok:false});
  for(const role of ['anon','authenticated','service_role'])for(const tb of PUBLIC_READ)expect({role,tb,ok:await priv(role,tb,'SELECT')}).toEqual({role,tb,ok:true});
  for(const tb of SERVICE_READ){for(const role of ['anon','authenticated'])expect({tb,role,ok:await priv(role,tb,'SELECT')}).toEqual({tb,role,ok:false});expect(await priv('service_role',tb,'SELECT')).toBe(true);}
  expect(await priv('anon','macro_analysis_runs','SELECT')).toBe(false);
  expect(await priv('authenticated','macro_analysis_runs','SELECT')).toBe(true);
  expect(await priv('service_role','macro_analysis_runs','SELECT')).toBe(true);
  const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  for(const sig of SERVICE_RPCS){for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});}
  for(const sig of READ_RPCS)for(const role of ['anon','authenticated','service_role'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:true});
  const before=await q(`select region,revision::text,input_revision::text from public.macro_publish_state order by region`);
  const sql=readFileSync(MIGRATION,'utf8');
  await expect(replayMigration(admin,sql)).resolves.toBeUndefined();
  await expect(replayMigration(admin,sql)).resolves.toBeUndefined();
  expect(await q(`select region,revision::text,input_revision::text from public.macro_publish_state order by region`)).toEqual(before);   // the seed never resets state
 },60000);

 it('refuses direct writes and service RPCs to anon and authenticated',async()=>{
  for(const role of ['anon','authenticated']){
   await asRole(role,async c=>{
    expect((await fails(c.query(`insert into public.macro_series(id) values('X_DENIED')`))).message).toMatch(/permission denied/);
    expect((await fails(c.query(`select public.macro_write_observations($1,'x','[]'::jsonb)`,[randomUUID()]))).message).toMatch(/permission denied/);
    expect((await fails(c.query(`select public.create_macro_analysis_run($1,$2,'change','{}','{}',$3,'{}','x','y','ok',null)`,[randomUUID(),randomUUID(),'a'.repeat(64)]))).message).toMatch(/permission denied/);
    expect((await fails(c.query(`select * from public.macro_publish_state`))).message).toMatch(/permission denied/);
    for(const tb of SERVICE_READ)expect((await fails(c.query(`select * from public.${tb}`))).message).toMatch(/permission denied/);
    expect((await fails(c.query(`select public.macro_latest_eligible_observations('{}'::text[],null,null,null)`))).message).toMatch(/permission denied/);
   });
  }
 });

 it('anon reads ok observations only (table and macro_latest_observations), never quarantined rows',async()=>{
  const {s,b}=await seeded({revisionPolicy:'immutable'});
  const r=await retrieval(b,T3);
  const res=await write(b,[native(s,'2026-09-30','4.3',r,T3,false)]);
  expect(res.quarantined).toBe(1);
  expect((await rows(s,'2026-09-30')).map(x=>x.status)).toEqual(['ok','quarantined']);
  await asRole('anon',async c=>{
   expect((await c.query(`select value_text,status from public.macro_observations where series_id=$1`,[s])).rows).toEqual([{value_text:'4.1',status:'ok'}]);
   expect((await c.query(`select value_text,version from public.macro_latest_observations($1::text[],null,null)`,[[s]])).rows).toEqual([{value_text:'4.1',version:1}]);
   expect((await c.query(`select count(*)::int n from public.macro_series where id=$1`,[s])).rows[0].n).toBe(1);
  });
 });

 it('write rules: insert, duplicate, versioned (revisable) with input_revision bumped only for touched regions',async()=>{
  const s=sid();await catalog([def(s)]);const b=await batch();
  const us0=await state('US');const cn0=await state('CN');
  const r1=await retrieval(b,T1);
  expect(await write(b,[native(s,'2026-08-31','4.1',r1,T1)])).toEqual({inserted:1,duplicates:0,versioned:0,quarantined:0,conflicts:[]});
  const [v1]=await rows(s,'2026-08-31');
  expect(v1).toMatchObject({value_text:'4.1',version:1,status:'ok'});expect((v1.available_at as Date).toISOString()).toBe(T1);
  expect((await state('US')).i).toBe(us0.i+1);expect((await state('CN')).i).toBe(cn0.i);
  const r2=await retrieval(b,T2);
  expect(await write(b,[native(s,'2026-08-31','4.1',r2,T2)])).toEqual({inserted:0,duplicates:1,versioned:0,quarantined:0,conflicts:[]});
  expect((await state('US')).i).toBe(us0.i+1);                                                    // nothing inserted ⇒ no bump
  const r3=await retrieval(b,T3);
  expect(await write(b,[native(s,'2026-08-31','4.2',r3,T3)])).toEqual({inserted:0,duplicates:0,versioned:1,quarantined:0,conflicts:[]});
  expect((await rows(s,'2026-08-31')).map(x=>[x.version,x.value_text,x.status])).toEqual([[1,'4.1','ok'],[2,'4.2','ok']]);
  expect((await q(`select value_text from public.macro_latest_observations($1::text[],null,null)`,[[s]]))[0].value_text).toBe('4.2');
  expect((await q(`select value_text from public.macro_latest_observations($1::text[],$2::timestamptz,null)`,[[s],T2]))[0].value_text).toBe('4.1');   // as-of view
  expect((await state('US')).i).toBe(us0.i+2);
  const big='12345678901234567890.123456789';
  const r4=await retrieval(b,T3);await write(b,[native(s,'2026-07-31',big,r4,T3)]);
  expect((await rows(s,'2026-07-31'))[0].value_text).toBe(big);
  expect(await one(`select value::text v from public.macro_observations where series_id=$1 and period_end='2026-07-31'`,[s])).toBe(big);   // value computed from value_text, exact
  const r5=await retrieval(b,T3);                                                                 // html_cell locator (ChinaBond / SAFE tables, Task 9)
  expect((await write(b,[{...native(s,'2026-06-30','2.04',r5,T3),locator:{kind:'html_cell',table:1,row:3,cell:13}}])).inserted).toBe(1);
  expect(await one(`select locator v from public.macro_observations where series_id=$1 and period_end='2026-06-30'`,[s])).toEqual({kind:'html_cell',table:1,row:3,cell:13});
  await expect(write(b,[{...native(s,'2026-05-31','1',r5,T3),locator:{kind:'xlsx_cell',sheet:0}}])).rejects.toThrow(/invalid_row/);
 });

 it('write rules: unexpected_revision quarantines once per value; conflicting_rows writes nothing',async()=>{
  const {s,b}=await seeded({revisionPolicy:'immutable'});
  const us0=await state('US');
  const r=await retrieval(b,T3);
  const c1=await write(b,[native(s,'2026-09-30','4.5',r,T3,false)]);
  expect(c1).toEqual({inserted:0,duplicates:0,versioned:0,quarantined:1,conflicts:[{series_id:s,period_end:'2026-09-30',reason:'unexpected_revision',value_text:'4.5',current_value_text:'4.1',observation_id:expect.any(String)}]});
  expect((await state('US')).i).toBe(us0.i+1);
  const c2=await write(b,[native(s,'2026-09-30','4.5',await retrieval(b,T3),T3,false)]);
  expect(c2.quarantined).toBe(1);expect(c2.conflicts[0].reason).toBe('unexpected_revision');
  expect(c2.conflicts[0].observation_id).toBe(c1.conflicts[0].observation_id);                    // the existing quarantined row
  expect(c1.conflicts[0].observation_id).toBe((await rows(s,'2026-09-30'))[1].observation_id);
  expect((await rows(s,'2026-09-30')).map(x=>[x.version,x.value_text,x.status])).toEqual([[1,'4.1','ok'],[2,'4.5','quarantined']]);   // no second quarantined row
  expect((await state('US')).i).toBe(us0.i+1);
  const r2=await retrieval(b,T3);
  const c3=await write(b,[native(s,'2026-10-31','5',r2,T3),native(s,'2026-10-31','5.1',r2,T3),native(s,'2026-10-31','5',r2,T3)]);   // a repeated value is one distinct value
  expect(c3).toEqual({inserted:0,duplicates:0,versioned:0,quarantined:1,conflicts:[
   {series_id:s,period_end:'2026-10-31',reason:'conflicting_rows',value_text:'5',current_value_text:null,observation_id:null},
   {series_id:s,period_end:'2026-10-31',reason:'conflicting_rows',value_text:'5.1',current_value_text:null,observation_id:null}]});
  expect(await rows(s,'2026-10-31')).toEqual([]);
  expect((await state('US')).i).toBe(us0.i+1);
 });

 it('write rules: stale_delivery, missing_evidence, missing_input, derived rows and input validation',async()=>{
  const {s,b,id}=await seeded();                                                                  // 4.1 available at T2
  const st=await write(b,[native(s,'2026-09-30','3.9',await retrieval(b,T1),T1)]);
  expect(st).toEqual({inserted:0,duplicates:0,versioned:0,quarantined:1,conflicts:[{series_id:s,period_end:'2026-09-30',reason:'stale_delivery',value_text:'3.9',current_value_text:'4.1',observation_id:expect.any(String)}]});
  expect((await rows(s,'2026-09-30')).map(x=>[x.version,x.value_text,x.status])).toEqual([[1,'4.1','ok'],[2,'3.9','quarantined']]);
  expect((await q(`select value_text from public.macro_latest_observations($1::text[],null,null)`,[[s]]))[0].value_text).toBe('4.1');
  const me=await write(b,[native(s,'2026-06-30','1',randomUUID(),T1)]);
  expect(me).toEqual({inserted:0,duplicates:0,versioned:0,quarantined:0,conflicts:[{series_id:s,period_end:'2026-06-30',reason:'missing_evidence',value_text:'1',current_value_text:null,observation_id:null}]});
  const d=sid('D');await catalog([def(d,{derive:{kind:'month_end',from:s}})]);
  const quarantinedId=(await rows(s,'2026-09-30'))[1].observation_id as string;
  for(const from of [[randomUUID()],[quarantinedId]]){
   const mi=await write(b,[derived(d,'2026-09-30','4.1',from,T2)]);
   expect(mi).toEqual({inserted:0,duplicates:0,versioned:0,quarantined:0,conflicts:[{series_id:d,period_end:'2026-09-30',reason:'missing_input',value_text:'4.1',current_value_text:null,observation_id:null}]});
  }
  expect((await fails(write(b,[derived(d,'2026-09-30','4.1',[id],T3)]))).message).toBe('invalid_available_at');   // derived available_at = max of inputs
  expect((await write(b,[derived(d,'2026-09-30','4.1',[id],T2)])).inserted).toBe(1);
  expect((await rows(d,'2026-09-30'))[0]).toMatchObject({value_text:'4.1',status:'ok'});
  const r=await retrieval(b,T3);
  expect((await fails(write(b,[native(s,'2026-05-31','1',r,T2)]))).message).toBe('invalid_available_at');       // native available_at = fetched_at
  expect((await fails(write(b,[native(s,'2026-05-31','1.50',r,T3)]))).message).toBe('invalid_value_text');
  expect((await fails(write(b,[native(s,'2026-05-31','-0',r,T3)]))).message).toBe('invalid_value_text');
  expect((await fails(write(b,[native(d,'2026-05-31','1',r,T3)]))).message).toBe('invalid_row');                 // derived series takes no native rows
  const m=sid('M');await catalog([def(m,{status:'missing',source:null,reason:{zh:'无来源',en:'no source'}})]);
  expect((await fails(write(b,[native(m,'2026-05-31','1',r,T3)]))).message).toBe('invalid_series');
  expect((await fails(write(randomUUID(),[]))).message).toBe('invalid_batch');
  expect((await rows(s,'2026-05-31'))).toEqual([]);                                               // a refused call writes nothing
 });

 it('evidence: one object per sha256, one retrieval per fetch, host must match the URL, ms-precision fetched_at',async()=>{
  const b=await batch();const body='observation_date,UNRATE\n2026-09-01,4.1\n';
  const r1=await retrieval(b,T1,body);const r2=await retrieval(b,T2,body);
  expect(r1).not.toBe(r2);
  expect(await one(`select count(*)::int v from public.macro_evidence_objects where sha256=$1`,[sha(body)])).toBe(1);
  expect(await one(`select count(*)::int v from public.macro_retrievals where sha256=$1`,[sha(body)])).toBe(2);
  const h=sha('other');
  expect((await fails(q(`select public.macro_put_retrieval($1,$2,'fred_csv','text/csv',5,'https://evil.example.com/x','fred.stlouisfed.org',200,$3,$4,'{}'::jsonb)`,[h,`fred_csv/${h}.csv`,T1,b]))).message).toMatch(/macro_retrievals_host/);
  expect((await fails(q(`select public.macro_put_retrieval($1,$2,'fred_csv','text/csv',5,'https://fred.stlouisfed.org/x','fred.stlouisfed.org',200,'2026-11-01T05:30:00.000123Z',$3,'{}'::jsonb)`,[h,`fred_csv/${h}.csv`,b]))).message).toBe('invalid_retrieval');
  expect((await fails(q(`select public.macro_put_retrieval($1,$2,'fred_csv','text/csv',999,'https://fred.stlouisfed.org/x','fred.stlouisfed.org',200,$3,$4,'{}'::jsonb)`,[sha(body),`fred_csv/${sha(body)}.csv`,T1,b]))).message).toBe('evidence_mismatch');
  expect((await fails(q(`select public.macro_put_retrieval($1,$2,'fred_csv','text/csv',5,'https://fred.stlouisfed.org/x','fred.stlouisfed.org',200,$3,$4,'{}'::jsonb)`,[h,`akshare/${h}.csv`,T1,b]))).message).toMatch(/macro_evidence_path/);
 });

 it('catalog: append-only versions, mirror upsert, a version never names two catalogs',async()=>{
  const s=sid();const v=await catalog([def(s)]);
  expect(await one(`select catalog_version v from public.macro_series where id=$1`,[s])).toBe(v);
  expect(await one(`select public.macro_upsert_catalog($1,'macro-rules/1',$2::jsonb) v`,[v,JSON.stringify([def(s)])])).toBe(1);   // same version, same JSON: idempotent
  expect((await fails(q(`select public.macro_upsert_catalog($1,'macro-rules/1',$2::jsonb)`,[v,JSON.stringify([def(s,{weight:5})])]))).message).toBe('catalog_version_conflict');
  expect((await fails(q(`select public.macro_upsert_catalog('v1','macro-rules/1',$1::jsonb)`,[JSON.stringify([def(s)])]))).message).toBe('invalid_catalog_version');
  expect((await fails(q(`update public.macro_catalog_versions set rules_version='x' where catalog_version=$1`,[v]))).message).toMatch(/append_only:/);
 });

 it('publish: manifest validation, supersede, stale_publisher on revision and on input_revision, failed snapshots leave active alone',async()=>{
  const {s,v,b,id}=await seeded();
  const cn=sid('C');await catalog([def(cn,{region:'CN'})]);const rcn=await retrieval(b,T2);await write(b,[native(cn,'2026-09-30','1',rcn,T2)]);
  const cnId=(await rows(cn,'2026-09-30'))[0].observation_id as string;
  const imm=await seeded({revisionPolicy:'immutable'});await write(imm.b,[native(imm.s,'2026-09-30','9',await retrieval(imm.b,T3),T3,false)]);
  const qId=(await rows(imm.s,'2026-09-30'))[1].observation_id as string;
  let st=await state('US');
  for(const bad of [[cnId],[qId],[randomUUID()],[id,id]])expect((await fails(publish('US',st.r,st.i,v,bad))).message).toBe('invalid_manifest');
  for(const bad of [[cnId],[qId],[id,id]])expect((await fails(publish('US',st.r,st.i,v,[id],bad))).message).toBe('invalid_manifest');   // history_ids validated like the manifest
  expect((await fails(publish('US',st.r,st.i,'macro-catalog/000000000000',[id]))).message).toBe('invalid_manifest');
  const p1=await publish('US',st.r,st.i,v,[id],[id]);
  expect(p1.revision).toBe(st.r+1);
  expect(await q(`select status,revision::int,observation_ids,history_ids from public.macro_snapshots where snapshot_id=$1`,[p1.snapshot_id])).toEqual([{status:'active',revision:st.r+1,observation_ids:[id],history_ids:[id]}]);
  expect(await q(`select region,regime,contributions,rules_version,uncovered_weight::text from public.macro_regime_results where snapshot_id=$1`,[p1.snapshot_id])).toEqual([{region:'US',regime:null,contributions:[],rules_version:'macro-rules/1',uncovered_weight:'0'}]);
  expect((await fails(publish('US',st.r,st.i,v,[id]))).message).toBe('stale_publisher');                     // revision moved
  st=await state('US');
  await write(b,[native(s,'2026-10-31','4.4',await retrieval(b,T3),T3)]);                                   // input_revision moves
  expect((await fails(publish('US',st.r,st.i,v,[id]))).message).toBe('stale_publisher');
  st=await state('US');
  const p2=await publish('US',st.r,st.i,v,[id]);
  expect(await q(`select snapshot_id,status from public.macro_snapshots where region='US' and status='active'`)).toEqual([{snapshot_id:p2.snapshot_id,status:'active'}]);
  expect(await one(`select status v from public.macro_snapshots where snapshot_id=$1`,[p1.snapshot_id])).toBe('superseded');
  const failed=await one(`select public.record_failed_macro_snapshot('US','2026-11-06','macro-method/1.0',$1,'evidence_upload_failed') v`,[v]) as string;
  expect(await q(`select status,failure_reason,observation_ids,revision::int from public.macro_snapshots where snapshot_id=$1`,[failed])).toEqual([{status:'failed',failure_reason:'evidence_upload_failed',observation_ids:[],revision:p2.revision}]);
  expect(await one(`select snapshot_id v from public.macro_snapshots where region='US' and status='active'`)).toBe(p2.snapshot_id);
  expect((await state('US')).r).toBe(p2.revision);
  const since=await q(`select snapshot_id from public.macro_snapshots_since(null,null,1000)`);
  expect(since.map(x=>x.snapshot_id)).toEqual(expect.arrayContaining([p1.snapshot_id,p2.snapshot_id]));
  expect(since.map(x=>x.snapshot_id)).not.toContain(failed);
 });

 it('publish: two racing publishers with the same expected state — exactly one wins',async()=>{
  const {v,id}=await seeded();
  const st=await state('US');
  const results=await Promise.allSettled([publish('US',st.r,st.i,v,[id]),publish('US',st.r,st.i,v,[id])]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const lost=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
  expect((lost.reason as PgErr).message).toBe('stale_publisher');
  expect((await state('US')).r).toBe(st.r+1);
  expect(await one(`select count(*)::int v from public.macro_snapshots where region='US' and status='active'`)).toBe(1);
 });

 it('quarantine members: one item binds two values; accept B leaves A rejected; rejected rows never return; reject_only in SQL; audit rows',async()=>{
  const {s,b}=await seeded({revisionPolicy:'immutable'});
  const ra=(await write(b,[native(s,'2026-09-30','4.5',await retrieval(b,T3),T3,false)])).conflicts[0].observation_id!;
  const rb=(await write(b,[native(s,'2026-09-30','4.6',await retrieval(b,T3),T3,false)])).conflicts[0].observation_id!;
  const resolver=await user();
  const item=async(series:string,o:{reason?:string;period?:string;dataset?:string}={})=>{const id=randomUUID();await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,$2,'macro_observations',$3,$4,$5)`,[id,o.dataset??'macro.fred',`${series}|${o.period??'2026-09-30'}`,o.reason??'unexpected_revision',b]);return id;};
  const link=(qid:string,ids:string[])=>one(`select public.macro_link_quarantine($1,$2::uuid[]) v`,[qid,ids]);
  const resolve=(qid:string,d:string,obs:string|null=null)=>one(`select public.macro_resolve_conflict($1,$2,$3,$4) v`,[qid,d,resolver,obs]);
  const qa=await item(s);
  expect(await link(qa,[ra])).toBe(1);
  expect(await link(qa,[ra,rb])).toBe(1);                                                           // re-linking is a no-op; one item, two values
  expect((await fails(link(qa,[randomUUID()]))).message).toBe('invalid_member');
  const other=await seeded();
  expect((await fails(link(qa,[other.id]))).message).toBe('invalid_member');                        // an ok row of another key
  expect((await fails(link(randomUUID(),[ra]))).message).toBe('not_found');
  const st0=await state('US');
  expect((await fails(resolve(qa,'accept'))).message).toBe('observation_required');
  expect((await fails(resolve(qa,'accept',other.id))).message).toBe('not_member');
  expect((await fails(resolve(qa,'accept',rb))).message).toBe('member_ineligible');                 // its batch is still running (review R1)
  expect((await rows(s,'2026-09-30')).map(x=>x.status)).toEqual(['ok','quarantined','quarantined']);   // nothing changed
  await finish(b);
  expect(await resolve(qa,'accept',rb)).toEqual({status:'resolved_accept',observation_id:rb,rejected:1});
  expect((await rows(s,'2026-09-30')).map(x=>[x.value_text,x.status])).toEqual([['4.1','ok'],['4.5','rejected'],['4.6','ok']]);
  expect((await q(`select value_text from public.macro_latest_observations($1::text[],null,null)`,[[s]]))[0].value_text).toBe('4.6');   // higher version is latest
  expect((await state('US')).i).toBe(st0.i+1);
  expect(await q(`select status,resolved_by from public.dq_quarantine where id=$1`,[qa])).toEqual([{status:'resolved_accept',resolved_by:resolver}]);
  expect(await q(`select user_id,action,object_type,object_id,detail->>'decision' decision,detail->>'observation_id' obs from public.research_audit_log where object_id=$1`,[qa])).toEqual([{user_id:resolver,action:'dq.quarantine_resolve',object_type:'dq',object_id:qa,decision:'accept',obs:rb}]);
  expect((await fails(resolve(qa,'accept',rb))).message).toBe('already_resolved');
  expect(await link(qa,[ra])).toBe(0);                                                              // closed, but its exact member was disposed by this item: complete (第 6 稿 P2-3)
  await asRole('anon',async c=>{expect((await c.query(`select value_text from public.macro_observations where series_id=$1 order by version`,[s])).rows).toEqual([{value_text:'4.1'},{value_text:'4.6'}]);});
  // the rejected value re-delivered is not inserted again: previously_rejected (counted as a duplicate, 第 5 稿 P1-2) points at the
  // rejected row; even a hand-made item binding it can only reject it
  const w2=await batch();
  const again=await write(w2,[native(s,'2026-09-30','4.5',await retrieval(w2,T3),T3,false)]);
  expect(again).toEqual({inserted:0,duplicates:1,versioned:0,quarantined:0,conflicts:[{series_id:s,period_end:'2026-09-30',reason:'previously_rejected',value_text:'4.5',current_value_text:'4.6',observation_id:ra}]});
  expect(await rows(s,'2026-09-30')).toHaveLength(3);
  const rc=(await write(w2,[native(s,'2026-09-30','4.7',await retrieval(w2,T3),T3,false)])).conflicts[0].observation_id!;
  expect((await fails(link(qa,[rc]))).message).toBe('quarantine_closed');                          // a row still quarantined: closed item (第 5 稿 P2-3)
  const qb=await item(s);await link(qb,[ra]);
  expect((await fails(resolve(qb,'accept',ra))).message).toBe('not_quarantined');                 // reject-then-accept elsewhere cannot resurrect
  expect(await resolve(qb,'reject')).toEqual({status:'resolved_reject',observation_id:null,rejected:0});
  // reject → every quarantined member rejected, input_revision unchanged
  const x=await seeded({revisionPolicy:'immutable'});
  const xr=(await write(x.b,[native(x.s,'2026-09-30','7',await retrieval(x.b,T3),T3,false)])).conflicts[0].observation_id!;
  const qx=await item(x.s);await link(qx,[xr]);const st1=await state('US');
  expect((await fails(resolve(qx,'reject',xr))).message).toBe('observation_not_allowed');
  expect(await resolve(qx,'reject')).toEqual({status:'resolved_reject',observation_id:null,rejected:1});
  expect((await rows(x.s,'2026-09-30')).map(r=>r.status)).toEqual(['ok','rejected']);
  expect((await state('US')).i).toBe(st1.i);
  expect(await one(`select count(*)::int v from public.research_audit_log where object_id=$1`,[qx])).toBe(1);
  // adapter_mismatch / rule_failed:* are reject-only in SQL, whatever the caller sends
  for(const reason of ['adapter_mismatch','rule_failed:macro.range']){
   const qr=await item(x.s,{reason,period:'2026-08-31'});
   expect((await fails(resolve(qr,'accept',xr))).message).toBe('reject_only');
   expect(await resolve(qr,'reject')).toEqual({status:'resolved_reject',observation_id:null,rejected:0});
  }
  expect((await fails(resolve(randomUUID(),'accept',xr))).message).toBe('not_found');
  expect((await fails(resolve(await item(x.s,{dataset:'facts.us',period:'2026-07-31'}),'accept',xr))).message).toBe('invalid_item');
  expect((await fails(resolve(await item(x.s,{period:'2026-06-30'}),'maybe'))).message).toBe('invalid_decision');
  await expect(q(`update public.macro_observations set status='quarantined' where observation_id=$1`,[xr])).rejects.toThrow(/append_only:/);   // rejected is final
 });

 it('publication eligibility: rows of running / failed batches and their derivations never reach a snapshot; the eligible reads skip them',async()=>{
  const {s,v,id}=await seeded();                                                                    // 4.1 for 2026-09-30 in a finished batch
  const d=sid('D');await catalog([def(d,{derive:{kind:'month_end',from:s}})]);
  const open=await batch();                                                                          // a collector run that never finishes
  expect((await write(open,[native(s,'2026-10-31','4.4',await retrieval(open,T3),T3)])).inserted).toBe(1);
  const pending=(await rows(s,'2026-10-31'))[0].observation_id as string;
  expect((await write(open,[derived(d,'2026-10-31','4.4',[pending],T3)])).inserted).toBe(1);         // the same batch may derive from its own rows
  const pendingDerived=(await rows(d,'2026-10-31'))[0].observation_id as string;
  const later=await batch();
  expect((await write(later,[derived(d,'2026-09-30','4.4',[pending],T3)])).conflicts.map(c=>c.reason)).toEqual(['missing_input']);   // another batch may not
  const latest=async(include:string|null=null)=>(await q(`select observation_id from public.macro_latest_eligible_observations($1::text[],null,null,$2)`,[[s,d],include])).map(x=>x.observation_id as string).sort();
  expect(await latest()).toEqual([id]);                                                              // d has no eligible row at all
  expect(await latest(open)).toEqual([pending,pendingDerived].sort());                               // include_batch admits the open batch
  expect((await q(`select period_end::text p from public.macro_eligible_history($1,null,null,null,null,null,1000)`,[s])).map(x=>x.p)).toEqual(['2026-09-30']);
  expect((await q(`select period_end::text p from public.macro_eligible_history($1,null,null,null,$2,null,1000)`,[s,open])).map(x=>x.p)).toEqual(['2026-09-30','2026-10-31']);
  expect((await q(`select period_end::text p from public.macro_eligible_history($1,null,null,null,$2,'2026-09-30',1000)`,[s,open])).map(x=>x.p)).toEqual(['2026-10-31']);   // keyset page
  let st=await state('US');
  for(const bad of [[pending],[pendingDerived]])expect((await fails(publish('US',st.r,st.i,v,bad))).message).toBe('invalid_manifest');
  expect((await fails(publish('US',st.r,st.i,v,[id],[pending]))).message).toBe('invalid_manifest');
  await finish(open,'failed');
  for(const bad of [[pending],[pendingDerived]])expect((await fails(publish('US',st.r,st.i,v,bad))).message).toBe('invalid_manifest');
  // a later batch re-delivering the same value is not a duplicate of the abandoned row: it is a new version that becomes eligible
  const again=await batch();
  expect(await write(again,[native(s,'2026-10-31','4.4',await retrieval(again,T3),T3)])).toMatchObject({inserted:1,duplicates:0});
  const fresh=(await rows(s,'2026-10-31')).find(x=>x.observation_id!==pending)!;
  expect(fresh.version).toBe(2);
  expect(await latest()).toEqual([id]);                                                              // still running: not yet eligible
  await finish(again,'partial');                                                                     // partial batches publish (spec §11)
  expect(await latest()).toEqual([fresh.observation_id as string]);
  st=await state('US');
  expect((await publish('US',st.r,st.i,v,[fresh.observation_id as string],[id,fresh.observation_id as string])).revision).toBe(st.r+1);
 });

 it('republish_macro_snapshot: rollback publishes a NEW active snapshot copying a frozen one after re-validating it; history rows never change',async()=>{
  const {v,id}=await seeded();
  let st=await state('US');const p1=await publish('US',st.r,st.i,v,[id],[id]);
  st=await state('US');const p2=await publish('US',st.r,st.i,v,[id]);
  const rp=(snap:string,r:number,i:number)=>one(`select public.republish_macro_snapshot($1,$2,$3) v`,[snap,r,i]) as Promise<{snapshot_id:string;revision:number;source_snapshot_id:string}>;
  st=await state('US');
  expect((await fails(rp(p1.snapshot_id,st.r-1,st.i))).message).toBe('stale_publisher');
  const back=await rp(p1.snapshot_id,st.r,st.i);
  expect(back).toMatchObject({revision:st.r+1,source_snapshot_id:p1.snapshot_id});
  expect(back.snapshot_id).not.toBe(p1.snapshot_id);
  expect(await q(`select status,observation_ids,history_ids,revision::int,catalog_version from public.macro_snapshots where snapshot_id=$1`,[back.snapshot_id])).toEqual([{status:'active',observation_ids:[id],history_ids:[id],revision:st.r+1,catalog_version:v}]);
  expect((await q(`select status from public.macro_snapshots where snapshot_id = any($1::uuid[])`,[[p1.snapshot_id,p2.snapshot_id]])).map(x=>x.status)).toEqual(['superseded','superseded']);
  expect(await q(`select regime,contributions,rules_version from public.macro_regime_results where snapshot_id=$1`,[back.snapshot_id])).toEqual([{regime:null,contributions:[],rules_version:'macro-rules/1'}]);
  expect((await state('US')).r).toBe(st.r+1);
  const failed=await one(`select public.record_failed_macro_snapshot('US','2026-11-06','macro-method/1.0',$1,'boom') v`,[v]) as string;
  st=await state('US');
  expect((await fails(rp(failed,st.r,st.i))).message).toBe('invalid_manifest');
  expect((await fails(rp(randomUUID(),st.r,st.i))).message).toBe('not_found');
  await asRole('authenticated',async c=>{expect((await fails(c.query(`select public.republish_macro_snapshot($1,0,0)`,[p1.snapshot_id]))).message).toMatch(/permission denied/);});
  await expect(q(`update public.macro_snapshots set status='active' where snapshot_id=$1`,[p1.snapshot_id])).rejects.toThrow(/append_only:/);   // the old way is still refused
 });

 it('ingest lease: concurrent starts → exactly one claim with an owner token; stale live runs are aborted first; aborted batches still running are listed until finished; a fresh processing chunk is not a stall',async()=>{
  const ds=dataset();
  const [b1,b2]=[await batch(ds),await batch(ds)];
  const out=await Promise.all([claim(ds,b1),claim(ds,b2)]);
  expect(out.map(o=>o.status).sort()).toEqual(['busy','claimed']);
  const winner=out[0].status==='claimed'?b1:b2;const won=out.find(o=>o.status==='claimed')!;
  expect(won.owner_token).toMatch(/^[0-9a-f-]{36}$/);
  expect(out.find(o=>o.status==='busy')).toMatchObject({holder:winner,aborted:[]});
  expect(out.find(o=>o.status==='busy')!.owner_token).toBeUndefined();                                 // the loser gets no token
  expect(await one(`select count(*)::int v from public.macro_ingest_runs where dataset=$1 and state in ('open','finishing')`,[ds])).toBe(1);
  expect(await one(`select owner_token::text v from public.macro_ingest_runs where batch_id=$1`,[winner])).toBe(won.owner_token);
  expect((await one(`select public.macro_claim_chunk($1,0,1,$2) v`,[winner,won.owner_token])).status).toBe('claimed');   // processing, but fresh
  expect(await claim(ds,await batch(ds),'2 hours',{takeover:true})).toMatchObject({status:'busy',holder:winner});   // a healthy chunk is never a stall
  await new Promise(r=>setTimeout(r,30));
  const b3=await batch(ds);
  const c3=await claim(ds,b3,'10 milliseconds');
  expect(c3).toEqual({status:'claimed',owner_token:expect.any(String),aborted:[winner]});              // older than max age → aborted, reported to the caller
  expect(await q(`select state,finish_progress from public.macro_ingest_runs where batch_id=$1`,[winner])).toEqual([{state:'aborted',finish_progress:{aborted:{by:b3,reason:'max_age'}}}]);
  expect((await claim(ds,await batch(ds))).aborted).toEqual([winner]);                                  // still running → listed again (self-healing sweep)
  await finish(winner,'failed');                                                                        // what the start route does
  expect((await claim(ds,await batch(ds))).aborted).toEqual([]);
  expect((await fails(claim(ds,await batch('macro.fred')))).message).toBe('invalid_batch');             // dataset must match the batch
  const done=await batch(ds);await finish(done);
  expect((await fails(claim(ds,done))).message).toBe('invalid_batch');                                   // only running batches claim
  await expect(q(`update public.macro_ingest_runs set state='open' where batch_id=$1`,[winner])).rejects.toThrow(/append_only:/);   // aborted is final
  await expect(q(`update public.macro_ingest_runs set owner_token=gen_random_uuid() where batch_id=$1`,[b3])).rejects.toThrow(/append_only:/);
 });

 it('chunks: claimed once (concurrent duplicates never both process), completion stores counts/errors/keys, finish begins when all are done and resumes from its progress with a new finish token',async()=>{
  const ds=dataset();const b=await batch(ds);const cl=await claim(ds,b);expect(cl.status).toBe('claimed');const t=cl.owner_token!;
  const c={fetched:3,inserted:2,duplicates:1,versioned:0,quarantined:0,failed:0};
  const cc=(seq:number,total:number,batchId=b,token:string=t)=>one(`select public.macro_claim_chunk($1,$2,$3,$4) v`,[batchId,seq,total,token]);
  const done=(seq:number,counts:unknown=c,errors:unknown[]=[],ck:string[]=[],lk:string[]=[],usable=3)=>one(`select public.macro_complete_chunk($1,$2,$3::jsonb,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8) v`,[b,seq,JSON.stringify(counts),usable,JSON.stringify(errors),JSON.stringify(ck),JSON.stringify(lk),t]);
  const begin=(total:number,batchId=b,token:string=t)=>one(`select public.macro_begin_finish($1,$2,$3) v`,[batchId,total,token]) as Promise<{status:string;missing?:number[];progress?:Record<string,unknown>;finish_token?:string}>;
  const step=(name:string,data:unknown,ft:string)=>one(`select public.macro_record_finish_step($1,$2,$3::jsonb,$4,$5) v`,[b,name,JSON.stringify(data),t,ft]) as Promise<Record<string,unknown>>;
  const both=await Promise.all([cc(0,2),cc(0,2)]);
  expect(both.map(x=>x.status).sort()).toEqual(['claimed','processing']);
  expect((await fails(cc(1,3))).message).toBe('chunk_total_mismatch');
  expect((await fails(cc(2,2))).message).toBe('invalid_chunk');
  expect((await fails(cc(0,1,randomUUID()))).message).toBe('batch_not_claimed');
  expect((await fails(cc(1,2,b,randomUUID()))).message).toBe('fenced');                                // another token
  expect(await begin(2)).toEqual({status:'incomplete',missing:[0,1]});
  expect((await fails(done(0,c,[],[],[],4))).message).toBe('invalid_chunk');                         // native_usable ≤ inserted+versioned+duplicates (第 6 稿 P2-1)
  expect((await fails(done(0,c,[],[],[],-1))).message).toBe('invalid_chunk');
  const stored=await done(0,c,[{code:'evidence_not_allowed',key:'CN_PMI_MFG'}],['CN_A|2026-09-30','CN_A|2026-10-31'],['CN_A|2026-09-30'],2);   // one duplicate was a previously_rejected redelivery
  expect(stored).toMatchObject({seq:0,total:2,state:'done',counts:c,native_usable:2,errors:[{code:'evidence_not_allowed',key:'CN_PMI_MFG'}],claim_keys:['CN_A|2026-09-30','CN_A|2026-10-31'],located_keys:['CN_A|2026-09-30']});
  expect((await fails(done(0))).message).toBe('chunk_not_processing');
  expect(await cc(0,2)).toMatchObject({status:'done',chunk:{seq:0,counts:c}});                      // a retry gets the stored receipt, nothing re-runs
  expect((await cc(1,2)).status).toBe('claimed');
  expect(await begin(2)).toEqual({status:'incomplete',missing:[1]});
  expect((await fails(done(1,{fetched:1}))).message).toBe('invalid_chunk');
  await done(1,{...c,fetched:1},[],['CN_A|2026-10-31'],[]);
  const f1=await begin(2);
  expect(f1).toEqual({status:'finishing',progress:{},finish_token:expect.any(String)});
  expect(await step('derived',{counts:c,errors:[]},f1.finish_token!)).toEqual({derived:{counts:c,errors:[]}});
  const f2=await begin(2);
  expect(f2).toEqual({status:'finishing',progress:{derived:{counts:c,errors:[]}},finish_token:expect.any(String)});   // a retried finish resumes from its progress…
  expect(f2.finish_token).not.toBe(f1.finish_token);                                                     // …with a new finish token
  expect((await fails(step('batch_finished',{status:'success',date:'2026-11-06'},f1.finish_token!))).message).toBe('fenced');   // the older finisher is fenced
  const ft=f2.finish_token!;
  await step('batch_finished',{status:'success',date:'2026-11-06'},ft);
  expect((await fails(step('nope',{},ft))).message).toBe('invalid_step');
  for(const gone of ['freshness_started','freshness_recorded'])expect((await fails(step(gone,{ok:true},ft))).message).toBe('invalid_step');   // only macro_record_freshness writes it (第 6 稿 P1-1)
  expect(await freshness(b,t,ft,ds,true,T2)).toMatchObject({batch_finished:{status:'success'},freshness_recorded:{ok:true,status:'fresh'}});
  const receipt={batch_id:b,status:'success'};
  await step('receipt',receipt,ft);
  expect(await begin(2)).toMatchObject({status:'finished',progress:{receipt,derived:{counts:c},batch_finished:{status:'success'},freshness_recorded:{ok:true}}});
  expect((await fails(step('published',{},ft))).message).toBe('run_not_finishing');                   // the current token on a finished run
  expect((await fails(step('published',{},f1.finish_token!))).message).toBe('fenced');                 // an obsolete token is fenced before any state error (第 6 稿 P1-1)
  expect((await fails(freshness(b,t,f1.finish_token!,ds,false,T3))).message).toBe('fenced');
  expect((await q(`select native_usable from public.macro_ingest_chunks where batch_id=$1 order by seq`,[b])).map(x=>x.native_usable)).toEqual([2,3]);
  expect(await q(`select seq,state,claim_keys,located_keys from public.macro_ingest_chunks where batch_id=$1 order by seq`,[b])).toEqual([
   {seq:0,state:'done',claim_keys:['CN_A|2026-09-30','CN_A|2026-10-31'],located_keys:['CN_A|2026-09-30']},
   {seq:1,state:'done',claim_keys:['CN_A|2026-10-31'],located_keys:[]}]);
  expect((await claim(ds,await batch(ds))).status).toBe('claimed');                                  // the finished run released the lease
  // a run with no chunks may finish (every series failed): total 0; claiming after finishing has begun is refused
  const ds2=dataset();const e=await batch(ds2);const te=(await claim(ds2,e)).owner_token!;
  expect(await begin(0,e,te)).toMatchObject({status:'finishing',progress:{}});
  expect((await fails(cc(0,1,e,te))).message).toBe('batch_not_open');
 });

 it('owner fence (第 5 稿 P1-3/P2-1): a takeover of a stalled run aborts it atomically; the paused old worker is fenced on every mutation; a new batch then succeeds and the old batch ends failed',async()=>{
  const ds=dataset();const s=sid();await catalog([def(s)]);
  const old=await batch(ds);const t1=(await claim(ds,old,'2 hours',{timeout:'10 milliseconds'})).owner_token!;
  const r1=await retrieval(old,T2,randomUUID(),t1);
  expect((await one(`select public.macro_claim_chunk($1,0,1,$2) v`,[old,t1])).status).toBe('claimed');
  expect((await write(old,[native(s,'2026-09-30','4.1',r1,T2)],t1)).inserted).toBe(1);               // the worker crashes here: rows written, completeChunk never called
  expect((await fails(write(old,[native(s,'2026-08-31','4',r1,T2)]))).message).toBe('fenced');         // a batch with a run never takes a token-less write
  const plain=await batch();expect((await fails(retrieval(plain,T2,randomUUID(),t1))).message).toBe('fenced');   // a token on a run-less batch is refused too
  await new Promise(r=>setTimeout(r,30));
  expect(await claim(ds,await batch(ds))).toMatchObject({status:'busy',holder:old});                    // without takeover a stalled chunk frees nothing
  const fresh=await batch(ds);
  const c2=await claim(ds,fresh,'2 hours',{takeover:true});
  expect(c2).toMatchObject({status:'claimed',aborted:[old]});const t2=c2.owner_token!;expect(t2).not.toBe(t1);
  expect(await q(`select state,finish_progress->'aborted' a from public.macro_ingest_runs where batch_id=$1`,[old])).toEqual([{state:'aborted',a:{by:fresh,reason:'stalled_chunk'}}]);
  // the paused worker wakes up: every mutation it attempts is refused
  const ids=(await rows(s,'2026-09-30')).map(x=>x.observation_id as string);
  const st=await state('US');const v=await catalog([def(sid())]);
  const zeroCounts=JSON.stringify({fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0});
  const attempts:[string,()=>Promise<unknown>][]=[
   ['put_retrieval',()=>retrieval(old,T3,randomUUID(),t1)],
   ['write',()=>write(old,[native(s,'2026-10-31','4.2',r1,T2)],t1)],
   ['link',()=>q(`select public.macro_link_quarantine($1,$2::uuid[],$3,$4)`,[randomUUID(),ids,old,t1])],
   ['claim_chunk',()=>q(`select public.macro_claim_chunk($1,0,1,$2)`,[old,t1])],
   ['complete_chunk',()=>q(`select public.macro_complete_chunk($1,0,$2::jsonb,1,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,$3)`,[old,zeroCounts,t1])],
   ['begin_finish',()=>q(`select public.macro_begin_finish($1,1,$2)`,[old,t1])],
   ['record_finish_step',()=>q(`select public.macro_record_finish_step($1,'derived','{}'::jsonb,$2,$3)`,[old,t1,randomUUID()])],
   ['finalize_batch',()=>finalize(old,'success',{t:t1,ft:randomUUID()})],                                // 第 6 稿 P1-1
   ['record_freshness',()=>freshness(old,t1,randomUUID(),ds,true,T3)],
   ['publish',()=>publish('US',st.r,st.i,v,[],[],{key:`ingest:${old}`,batch:old,token:t1})],
  ];
  for(const [name,call] of attempts)expect({name,code:(await fails(call())).message}).toEqual({name,code:'fenced'});
  expect(await rows(s,'2026-10-31')).toEqual([]);
  await finish(old,'failed');                                                                           // what the start route does with c2.aborted
  const r2=await retrieval(fresh,T3,randomUUID(),t2);
  expect(await write(fresh,[native(s,'2026-09-30','4.1',r2,T3)],t2)).toMatchObject({inserted:1,duplicates:0});   // not a duplicate of the abandoned row
  await finish(fresh,'success');
  const [, mine]=await rows(s,'2026-09-30');
  expect((await q(`select observation_id from public.macro_latest_eligible_observations($1::text[],null,null,null)`,[[s]])).map(x=>x.observation_id)).toEqual([mine.observation_id]);
 });

 it('exclusive finish (第 5 稿 P1-4/P1-5): only the owner begins; two concurrent begins of the same owner leave exactly one live finisher; publish_attempt appends; a publish key replays instead of publishing twice',async()=>{
  const {v,id}=await seeded();
  const ds=dataset();const b=await batch(ds);const t=(await claim(ds,b)).owner_token!;
  const begin=(token:string)=>one(`select public.macro_begin_finish($1,0,$2) v`,[b,token]) as Promise<{status:string;finish_token?:string;progress?:Record<string,unknown>}>;
  const step=(name:string,data:unknown,ft:string)=>one(`select public.macro_record_finish_step($1,$2,$3::jsonb,$4,$5) v`,[b,name,JSON.stringify(data),t,ft]) as Promise<Record<string,unknown>>;
  expect((await fails(begin(randomUUID()))).message).toBe('fenced');                                   // another owner
  const [x,y]=await Promise.all([begin(t),begin(t)]);                                                   // the same owner twice at once (a retry racing the original)
  expect([x.status,y.status]).toEqual(['finishing','finishing']);expect(x.finish_token).not.toBe(y.finish_token);
  const outcomes=await Promise.allSettled([step('derived',{counts:{},errors:[]},x.finish_token!),step('derived',{counts:{},errors:[]},y.finish_token!)]);
  expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);                                  // only the holder of the latest token proceeds
  expect(((outcomes.find(o=>o.status==='rejected') as PromiseRejectedResult).reason as PgErr).message).toBe('fenced');
  const ft=(await begin(t)).finish_token!;
  await step('publish_attempt',{at:T3,status:'stale',reason:null},ft);
  expect((await step('publish_attempt',{at:T3,status:'failed',reason:'rpc_failed'},ft)).attempts).toEqual([{at:T3,status:'stale',reason:null},{at:T3,status:'failed',reason:'rpc_failed'}]);
  let st=await state('US');
  // review A2: the publish carries the run's CURRENT finish token; a rotated-out or missing one is fenced and claims no key
  for(const bad of [x.finish_token!,y.finish_token!,null])expect({ft:bad,msg:(await fails(publish('US',st.r,st.i,v,[id],[],{key:`ingest:${b}`,batch:b,token:t,ft:bad}))).message}).toEqual({ft:bad,msg:'fenced'});
  expect((await fails(publish('US',st.r,st.i,v,[id],[],{key:`ingest:${b}`,batch:b,token:randomUUID(),ft}))).message).toBe('fenced');
  expect(await one(`select count(*)::int v from public.macro_snapshots where publish_key=$1`,[`ingest:${b}`])).toBe(0);
  const p1=await publish('US',st.r,st.i,v,[id],[],{key:`ingest:${b}`,batch:b,token:t,ft});
  expect(p1).toMatchObject({revision:st.r+1,replayed:false});
  // crash after the publish, before the 'published' checkpoint: the retry still holds the state it read before
  expect(await publish('US',st.r,st.i,v,[id],[],{key:`ingest:${b}`,batch:b,token:t,ft})).toEqual({snapshot_id:p1.snapshot_id,revision:p1.revision,replayed:true});
  expect((await state('US')).r).toBe(st.r+1);
  expect(await one(`select count(*)::int v from public.macro_snapshots where publish_key=$1`,[`ingest:${b}`])).toBe(1);
  st=await state('US');
  expect((await publish('US',st.r,st.i,v,[id],[],{key:`cron:${randomUUID()}`})).replayed).toBe(false);   // cron: a key, no run, no token
  await step('published',{status:'published',snapshot_id:p1.snapshot_id},ft);
  await step('receipt',{status:'success'},ft);
  expect(await begin(t)).toMatchObject({status:'finished',progress:{published:{snapshot_id:p1.snapshot_id}}});
 });

 it('macro_record_freshness (第 6 稿 P1-1): the stored status equals computeFreshness for every case; errors, last_ok_at and the freshness_recorded checkpoint commit together; a repeat for the same run writes nothing',async()=>{
  const DAY=86_400_000;const NOW=Date.parse('2026-11-06T05:30:00.000Z');const at=(ms:number)=>new Date(ms).toISOString();
  // [cadence, the previous dq_freshness row (consecutive errors, last ok this long before NOW; null = never ok) or none, ok]
  const cases:[Cadence,{errors:number;okAgo:number|null}|null,boolean][]=[
   ['daily',null,true],['daily',null,false],['daily',{errors:0,okAgo:3*DAY},false],['daily',{errors:0,okAgo:3*DAY+1},false],
   ['daily',{errors:1,okAgo:DAY},false],['daily',{errors:5,okAgo:DAY},true],['daily',{errors:0,okAgo:null},false],
   ['monthly',{errors:0,okAgo:34*DAY},false],['monthly',{errors:0,okAgo:34*DAY+1},false],['quarterly',{errors:0,okAgo:95*DAY},false],
   ['quarterly',{errors:1,okAgo:96*DAY},false],['event',{errors:0,okAgo:400*DAY},false],['event',null,false],['event',{errors:1,okAgo:DAY},false],
  ];
  for(const [cadence,prev,ok] of cases){
   const {ds,b,t,ft}=await finishingRun();
   if(prev)await q(`insert into public.dq_freshness(dataset,expected_cadence,last_ok_at,consecutive_errors,status) values($1,$2,$3,$4,$5)`,
    [ds,cadence,prev.okAgo===null?null:at(NOW-prev.okAgo),prev.errors,prev.okAgo===null?'missing':'stale']);
   const progress=await freshness(b,t,ft,ds,ok,at(NOW),{cadence,detail:{batch_id:b}});
   const consecutiveErrors=ok?0:(prev?.errors??0)+1;
   const lastOk=ok?new Date(NOW):prev?.okAgo==null?null:new Date(NOW-prev.okAgo);
   const expected=computeFreshness({cadence,lastOkAt:lastOk,consecutiveErrors,now:new Date(NOW)});
   const row=await freshRow(ds);
   expect({cadence,prev,ok,status:row.status,errors:row.consecutive_errors}).toEqual({cadence,prev,ok,status:expected,errors:consecutiveErrors});
   expect(row.last_ok_at===null?null:new Date(row.last_ok_at).toISOString()).toBe(lastOk?.toISOString()??null);
   expect([row.expected_cadence,new Date(row.last_attempt_at).toISOString(),row.detail]).toEqual([cadence,at(NOW),{batch_id:b}]);
   expect(progress.freshness_recorded).toEqual({ok,status:expected});
   expect(await freshness(b,t,ft,ds,!ok,at(NOW+DAY))).toEqual(progress);                             // already recorded for this run: nothing written
   expect((await freshRow(ds)).consecutive_errors).toBe(consecutiveErrors);
  }
  const {ds,b,t,ft}=await finishingRun();
  expect((await fails(freshness(b,t,ft,'macro.other',true,T2))).message).toBe('invalid_dataset');       // only the run's own dataset
  expect((await fails(freshness(b,t,ft,ds,true,T2,{cadence:'hourly'}))).message).toBe('invalid_freshness');
  expect((await fails(freshness(randomUUID(),t,ft,ds,true,T2))).message).toBe('batch_not_claimed');
  expect(await freshRow(ds)).toBeUndefined();
 });

 it('macro_finalize_batch (第 6 稿 P1-1/P2-4): native writes then a derivation link failure → the cron finalizes FAILED with the actual counts and the rows stay ineligible; a second finalize reads the status back; tokens must match the run (or be null without one)',async()=>{
  const s=sid();await catalog([def(s)]);
  const b=await batch();const r=await retrieval(b,T2);
  expect((await write(b,[native(s,'2026-09-30','4.1',r,T2)])).inserted).toBe(1);                       // native writes landed …
  const counts={fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0};
  const errors=[{code:'quarantine_link_failed',key:`${s}|2026-09-30`},{code:'sync_crashed'}];
  // … then deriveAndWrite threw IngestAbort('quarantine_link_failed'): explicit failed, not the partial batchStatusFromCounts would give
  expect(await finalize(b,'failed',{counts,errors,at:T1})).toEqual({status:'failed',finalized:true});
  expect(await q(`select status,counts,errors,finished_at>=started_at clamped from public.ingest_batches where batch_id=$1`,[b])).toEqual([{status:'failed',counts,errors,clamped:true}]);   // T1 < started_at: clamped
  expect(await q(`select observation_id from public.macro_latest_eligible_observations($1::text[],null,null,null)`,[[s]])).toEqual([]);
  expect(await q(`select observation_id from public.macro_eligible_history($1,null,null,null,null,null,1000)`,[s])).toEqual([]);
  expect(await finalize(b,'success',{counts})).toEqual({status:'failed',finalized:false});             // never finished twice
  expect((await q(`select status from public.ingest_batches where batch_id=$1`,[b]))[0].status).toBe('failed');
  expect((await fails(finalize(b,'success',{t:randomUUID(),ft:randomUUID()}))).message).toBe('fenced');   // a token on a run-less batch
  expect((await fails(finalize(randomUUID(),'success'))).message).toBe('not_found');
  expect((await fails(finalize(await batch(),'running'))).message).toBe('invalid_finalize');
  expect((await fails(finalize(await batch(),'success',{counts:{...ZERO,fetched:-1}}))).message).toBe('invalid_finalize');
  expect((await fails(finalize(await batch(),'success',{errors:Array.from({length:102},()=>({code:'x'}))}))).message).toBe('invalid_finalize');
  const {b:rb,t,ft}=await finishingRun();
  expect((await fails(finalize(rb,'success'))).message).toBe('fenced');                                 // a run batch never takes a token-less finalize
  expect((await fails(finalize(rb,'success',{t,ft:randomUUID()}))).message).toBe('fenced');
  expect(await finalize(rb,'success',{t,ft})).toEqual({status:'success',finalized:true});
 });

 it('barrier (第 6 稿 P1-1): finisher A pauses, B takes the finish over and completes, the next collection records freshness; A wakes up and every finalize / freshness / step call is fenced, changing neither ingest_batches nor dq_freshness',async()=>{
  const pub=await seeded();
  const ds=dataset();const b=await batch(ds);const t=(await claim(ds,b)).owner_token!;
  const begin=()=>one(`select public.macro_begin_finish($1,0,$2) v`,[b,t]) as Promise<{finish_token:string}>;
  const ftA=(await begin()).finish_token;                                                                // A begins … and pauses before its side effects
  const ftB=(await begin()).finish_token;                                                                // B (the same owner retrying) rotates the finish token
  expect(await finalize(b,'success',{t,ft:ftB,counts:{...ZERO,fetched:1,inserted:1}})).toEqual({status:'success',finalized:true});
  await freshness(b,t,ftB,ds,true,T2);
  await one(`select public.macro_record_finish_step($1,'receipt','{}'::jsonb,$2,$3) v`,[b,t,ftB]);    // B finishes: lease released
  const next=await batch(ds);const tn=(await claim(ds,next)).owner_token!;
  const ftn=(await one(`select public.macro_begin_finish($1,0,$2) v`,[next,tn])).finish_token as string;
  await freshness(next,tn,ftn,ds,false,T3);                                                              // the next collection records a failed attempt
  const batchBefore=await q(`select status,counts,errors,finished_at from public.ingest_batches where batch_id=$1`,[b]);
  const freshBefore=await freshRow(ds);
  expect(freshBefore).toMatchObject({consecutive_errors:1,status:'fresh'});                             // last ok T2, one error at T3
  const late:[string,()=>Promise<unknown>][]=[
   ['finalize',()=>finalize(b,'failed',{t,ft:ftA,counts:{...ZERO,fetched:9,failed:9}})],
   ['freshness',()=>freshness(b,t,ftA,ds,false,'2026-11-04T05:30:00.000Z')],
   ['step',()=>one(`select public.macro_record_finish_step($1,'published','{}'::jsonb,$2,$3) v`,[b,t,ftA])],
   ['publish (review A2)',async()=>{const st=await state('US');return publish('US',st.r,st.i,pub.v,[pub.id],[],{key:`ingest:${b}`,batch:b,token:t,ft:ftA});}],
  ];
  for(const [name,call] of late)expect({name,code:(await fails(call())).message}).toEqual({name,code:'fenced'});   // fenced, not run_not_finishing
  expect(await one(`select count(*)::int v from public.macro_snapshots where publish_key=$1`,[`ingest:${b}`])).toBe(0);   // A never claimed the immutable publish key
  expect(await q(`select status,counts,errors,finished_at from public.ingest_batches where batch_id=$1`,[b])).toEqual(batchBefore);
  expect(await freshRow(ds)).toEqual(freshBefore);
 });

 for(const decision of ['accept','reject'] as const){
  it(`link vs a concurrent ${decision} of a reused member (第 6 稿 P2-3): the link waits on the item row lock, finds its exact member disposed by this item's resolution and completes (0)`,async()=>{
   const {s,b}=await seeded({revisionPolicy:'immutable'});
   const obs=(await write(b,[native(s,'2026-09-30','4.9',await retrieval(b,T3),T3,false)])).conflicts[0].observation_id!;
   const qid=await qItem(s,b);
   expect(await one(`select public.macro_link_quarantine($1,$2::uuid[]) v`,[qid,[obs]])).toBe(1);       // an earlier delivery bound it
   expect((await write(b,[native(s,'2026-09-30','4.9',await retrieval(b,T3),T3,false)])).conflicts[0].observation_id).toBe(obs);   // the redelivery reuses it
   await finish(b);                                                                                     // accept needs a finished batch (review R1)
   const by=await user();const resolver=await admin.connect();
   try{
    await resolver.query('begin');
    await resolver.query(`select public.macro_resolve_conflict($1,$2,$3,$4)`,[qid,decision,by,decision==='accept'?obs:null]);   // holds the item row lock
    const linking=one(`select public.macro_link_quarantine($1,$2::uuid[]) v`,[qid,[obs]]);
    const waiting=()=>one(`select count(*)::int v from pg_stat_activity where wait_event_type='Lock' and query like '%macro_link_quarantine%' and pid<>pg_backend_pid()`);
    for(let i=0;i<100&&(await waiting())<1;i++)await new Promise(r=>setTimeout(r,20));
    expect(await waiting()).toBe(1);
    await resolver.query('commit');
    expect(await linking).toBe(0);                                                                       // linking already complete: no abort, no empty item
   }finally{await resolver.query('rollback').catch(()=>{});resolver.release();}
   expect(await one(`select status v from public.macro_observations where observation_id=$1`,[obs])).toBe(decision==='accept'?'ok':'rejected');
   const w2=await batch();
   const still=(await write(w2,[native(s,'2026-09-30','5.1',await retrieval(w2,T3),T3,false)])).conflicts[0].observation_id!;
   expect((await fails(q(`select public.macro_link_quarantine($1,$2::uuid[])`,[qid,[still]]))).message).toBe('quarantine_closed');   // a row still quarantined needs a new item
  });
 }

 it('rejected values are final (第 5 稿 P1-2): 4.1 ok → 4.2 rejected → a NEWER 4.2 redelivery stays rejected and inserts nothing',async()=>{
  const {s,b}=await seeded();                                                                          // revisable; 4.1 available at T2
  const stale=await write(b,[native(s,'2026-09-30','4.2',await retrieval(b,T1),T1)]);
  expect(stale.conflicts[0].reason).toBe('stale_delivery');const rej=stale.conflicts[0].observation_id!;
  const qid=await qItem(s,b,'stale_delivery');
  await one(`select public.macro_link_quarantine($1,$2::uuid[]) v`,[qid,[rej]]);
  await one(`select public.macro_resolve_conflict($1,'reject',$2,null) v`,[qid,await user()]);
  const st0=await state('US');
  const again=await write(b,[native(s,'2026-09-30','4.2',await retrieval(b,T3),T3)]);                 // newer than cur: 'versioned' without the finality check
  expect(again).toEqual({inserted:0,duplicates:1,versioned:0,quarantined:0,conflicts:[{series_id:s,period_end:'2026-09-30',reason:'previously_rejected',value_text:'4.2',current_value_text:'4.1',observation_id:rej}]});
  expect((await rows(s,'2026-09-30')).map(x=>[x.value_text,x.status])).toEqual([['4.1','ok'],['4.2','rejected']]);
  expect((await q(`select value_text from public.macro_latest_observations($1::text[],null,null)`,[[s]]))[0].value_text).toBe('4.1');
  expect((await state('US')).i).toBe(st0.i);                                                            // nothing inserted ⇒ no bump
 });

 it('quarantine reuse across failed batches (第 5 稿 P1-6): a successful redelivery gets its own quarantined version; accepting it publishes; the stranded member is member_ineligible',async()=>{
  const {s,v}=await seeded({revisionPolicy:'immutable'});                                             // 4.1 eligible
  const failedB=await batch();
  const stranded=(await write(failedB,[native(s,'2026-09-30','4.5',await retrieval(failedB,T3),T3,false)])).conflicts[0].observation_id!;
  await finish(failedB,'failed');
  const okB=await batch();
  const c=await write(okB,[native(s,'2026-09-30','4.5',await retrieval(okB,T3),T3,false)]);
  expect(c).toEqual({inserted:0,duplicates:0,versioned:0,quarantined:1,conflicts:[{series_id:s,period_end:'2026-09-30',reason:'unexpected_revision',value_text:'4.5',current_value_text:'4.1',observation_id:expect.any(String)}]});
  const own=c.conflicts[0].observation_id!;expect(own).not.toBe(stranded);
  expect((await write(okB,[native(s,'2026-09-30','4.5',await retrieval(okB,T3),T3,false)])).conflicts[0].observation_id).toBe(own);   // the current batch's row is reused
  expect(await q(`select version,status,batch_id from public.macro_observations where observation_id=any($1::uuid[]) order by version`,[[stranded,own]])).toEqual([{version:2,status:'quarantined',batch_id:failedB},{version:3,status:'quarantined',batch_id:okB}]);
  const qid=await qItem(s,failedB);
  expect(await one(`select public.macro_link_quarantine($1,$2::uuid[]) v`,[qid,[stranded,own]])).toBe(2);
  await finish(okB,'success');
  const by=await user();
  expect((await fails(q(`select public.macro_resolve_conflict($1,'accept',$2,$3)`,[qid,by,stranded]))).message).toBe('member_ineligible');
  expect(await one(`select public.macro_resolve_conflict($1,'accept',$2,$3) v`,[qid,by,own])).toEqual({status:'resolved_accept',observation_id:own,rejected:1});
  const st=await state('US');
  expect((await publish('US',st.r,st.i,v,[own])).revision).toBe(st.r+1);                              // eligible: ok + successful batch
 });

 it('link vs resolve (第 5 稿 P2-3): a link waiting on the item row lock behind a resolution gets quarantine_closed and binds nothing',async()=>{
  const {s,b}=await seeded({revisionPolicy:'immutable'});
  const obs=(await write(b,[native(s,'2026-09-30','4.9',await retrieval(b,T3),T3,false)])).conflicts[0].observation_id!;
  const qid=await qItem(s,b);const by=await user();
  const resolver=await admin.connect();
  try{
   await resolver.query('begin');
   await resolver.query(`select public.macro_resolve_conflict($1,'reject',$2,null)`,[qid,by]);      // holds the dq_quarantine row lock, uncommitted
   const linking=fails(q(`select public.macro_link_quarantine($1,$2::uuid[])`,[qid,[obs]]));
   const waiting=()=>one(`select count(*)::int v from pg_stat_activity where wait_event_type='Lock' and query like '%macro_link_quarantine%' and pid<>pg_backend_pid()`);
   for(let i=0;i<100&&(await waiting())<1;i++)await new Promise(r=>setTimeout(r,20));
   expect(await waiting()).toBe(1);                                                                      // the link is blocked on the row lock
   await resolver.query('commit');
   expect((await linking).message).toBe('quarantine_closed');
  }finally{await resolver.query('rollback').catch(()=>{});resolver.release();}
  expect(await one(`select count(*)::int v from public.macro_quarantine_members where quarantine_id=$1`,[qid])).toBe(0);
  expect(await one(`select status v from public.dq_quarantine where id=$1`,[qid])).toBe('resolved_reject');
 });

 it('anon eligibility RLS (review A1): ok rows of running / failed batches are service-only; they appear once the batch is success or partial',async()=>{
  const s=sid();await catalog([def(s)]);
  const anonCount=(role:string)=>asRole(role,async c=>{
   const t=(await c.query(`select count(*)::int n from public.macro_observations where series_id=$1`,[s])).rows[0].n as number;
   const l=(await c.query(`select count(*)::int n from public.macro_latest_observations($1::text[],null,null)`,[[s]])).rows[0].n as number;
   return [t,l];
  });
  const b=await batch();const r=await retrieval(b,T1);
  expect((await write(b,[native(s,'2026-08-31','4',r,T1)])).inserted).toBe(1);
  for(const role of ['anon','authenticated'])expect({role,n:await anonCount(role)}).toEqual({role,n:[0,0]});   // running batch
  expect(await anonCount('service_role')).toEqual([1,1]);                                                // unfinished inputs stay readable by the service
  await finish(b,'failed');
  for(const role of ['anon','authenticated'])expect({role,n:await anonCount(role)}).toEqual({role,n:[0,0]});   // failed batch
  expect(await anonCount('service_role')).toEqual([1,1]);
  const b2=await batch();const r2=await retrieval(b2,T2);
  expect((await write(b2,[native(s,'2026-09-30','4.1',r2,T2)])).inserted).toBe(1);
  expect(await anonCount('anon')).toEqual([0,0]);
  await finish(b2,'success');
  for(const role of ['anon','authenticated'])expect({role,n:await anonCount(role)}).toEqual({role,n:[1,1]});   // only the finished batch's row
  const b3=await batch();const r3=await retrieval(b3,T3);
  await write(b3,[native(s,'2026-10-31','4.2',r3,T3)]);
  expect(await anonCount('anon')).toEqual([1,1]);
  await finish(b3,'partial');
  expect(await anonCount('anon')).toEqual([2,1]);                                                 // two rows, one latest per series
  expect(await one(`select public.macro_batch_eligible($1) v`,[b])).toBe(false);
  expect(await one(`select public.macro_batch_eligible($1) v`,[b3])).toBe(true);
  expect(await one(`select public.macro_batch_eligible($1) v`,[randomUUID()])).toBe(false);
 });

 it('write and evidence need a running batch (review R2); an unknown batch is invalid_batch',async()=>{
  const s=sid();await catalog([def(s)]);const b=await batch();const r=await retrieval(b,T1);
  await finish(b,'success');
  expect((await fails(write(b,[native(s,'2026-08-31','4',r,T1)]))).message).toBe('batch_not_running');
  expect((await fails(retrieval(b,T1))).message).toBe('batch_not_running');
  const failed=await batch();await finish(failed,'failed');
  expect((await fails(write(failed,[]))).message).toBe('batch_not_running');
  expect((await fails(retrieval(randomUUID(),T1))).message).toBe('invalid_batch');
  expect(await rows(s,'2026-08-31')).toEqual([]);
 });

 it('macro_finalize_batch bumps input_revision of every region the batch wrote, in the same transaction (review A3): a publisher that read before finalization is stale',async()=>{
  const {ds,b,t,ft}=await finishingRun();void ds;
  const us=sid(),cn=sid('C');const v=await catalog([def(us),def(cn,{region:'CN'})]);
  const r=await retrieval(b,T1,randomUUID(),t);
  await write(b,[native(us,'2026-09-30','4.1',r,T1)],t);
  const stBefore=await state('US');const cnBefore=await state('CN');                                  // a publisher reads state here …
  expect(await finalize(b,'success',{t,ft,counts:{...ZERO,fetched:1,inserted:1}})).toEqual({status:'success',finalized:true});
  expect(await state('US')).toEqual({r:stBefore.r,i:stBefore.i+1});                                   // … finalization moved eligibility
  expect(await state('CN')).toEqual(cnBefore);                                                         // a region the batch never wrote is untouched
  const id=(await rows(us,'2026-09-30'))[0].observation_id as string;
  expect((await fails(publish('US',stBefore.r,stBefore.i,v,[id]))).message).toBe('stale_publisher');
  const st=await state('US');
  expect((await publish('US',st.r,st.i,v,[id])).revision).toBe(st.r+1);
  // a second finalize reads the status back and bumps nothing
  const after=await state('US');
  expect(await finalize(b,'failed',{t,ft})).toEqual({status:'success',finalized:false});
  expect(await state('US')).toEqual(after);
  // both regions written by one batch: both bump
  const f2=await finishingRun();const u2=sid(),c2=sid('C');await catalog([def(u2),def(c2,{region:'CN'})]);
  const r2=await retrieval(f2.b,T1,randomUUID(),f2.t);
  await write(f2.b,[native(u2,'2026-09-30','1',r2,T1),native(c2,'2026-09-30','2',r2,T1)],f2.t);
  const u0=await state('US'),c0=await state('CN');
  await finalize(f2.b,'partial',{t:f2.t,ft:f2.ft});
  expect([(await state('US')).i,(await state('CN')).i]).toEqual([u0.i+1,c0.i+1]);
 });

 it('snapshot cursor (review A4): created_at strictly increases in commit order across regions, also when a later transaction waits for an earlier one; republish and failed rows draw from the same cursor',async()=>{
  const {v,id}=await seeded();
  const ts=async(snapshotId:string)=>await one(`select created_at::text v from public.macro_snapshots where snapshot_id=$1`,[snapshotId]) as string;
  const stamps:string[]=[];
  for(let i=0;i<4;i++){
   const us=await state('US'),cn=await state('CN');
   stamps.push(await ts((await publish('US',us.r,us.i,v,[id])).snapshot_id));
   stamps.push(await ts((await publish('CN',cn.r,cn.i,v,[])).snapshot_id));
  }
  for(let i=1;i<stamps.length;i++)expect(Date.parse(stamps[i]+'+00')>Date.parse(stamps[i-1]+'+00')||stamps[i]>stamps[i-1]).toBe(true);
  expect(new Set(stamps).size).toBe(stamps.length);
  // transaction A (US) draws its cursor and stays open; transaction B (CN) starts later, must wait, and so commits after A with a larger value
  const sql=`select public.publish_macro_snapshot($1,$2,$3,'2026-11-06','macro-method/1.0',$4,$5::uuid[],'{}'::uuid[],$6::jsonb,null,'[]'::jsonb,'macro-rules/1',0) v`;
  const us=await state('US'),cn=await state('CN');
  const A=await admin.connect(),B=await admin.connect();let a:{snapshot_id:string},bRes:Promise<{snapshot_id:string}>|undefined;
  try{
   await A.query('begin');
   a=(await A.query(sql,['US',us.r,us.i,v,[id],JSON.stringify(counts)])).rows[0].v;
   bRes=B.query(sql,['CN',cn.r,cn.i,v,[],JSON.stringify(counts)]).then(x=>x.rows[0].v);
   const waiting=()=>one(`select count(*)::int v from pg_stat_activity where wait_event_type='Lock' and query like '%publish_macro_snapshot%' and pid<>pg_backend_pid()`);
   for(let i=0;i<100&&(await waiting())<1;i++)await new Promise(r=>setTimeout(r,20));
   expect(await waiting()).toBe(1);                                                                      // B waits for A's cursor lock
   await A.query('commit');
   const b2=await bRes;
   const [ta,tb]=[await ts(a.snapshot_id),await ts(b2.snapshot_id)];
   expect(tb>ta).toBe(true);
   const us2=await state('US');
   const rep=await one(`select public.republish_macro_snapshot($1,$2,$3) v`,[a.snapshot_id,us2.r,us2.i]) as {snapshot_id:string};
   const failed=await one(`select public.record_failed_macro_snapshot('US','2026-11-06','macro-method/1.0',$1,'x') v`,[v]) as string;
   const [tr,tf]=[await ts(rep.snapshot_id),await ts(failed)];
   expect(tr>tb&&tf>tr).toBe(true);
  }finally{await A.query('rollback').catch(()=>{});A.release();B.release();}
 });

 it('publish key is bound to its region (review R3): another region cannot replay it',async()=>{
  const {v,id}=await seeded();
  const us=await state('US');const key=`cron:${randomUUID()}`;
  const p=await publish('US',us.r,us.i,v,[id],[],{key});
  const cn=await state('CN');
  expect((await fails(publish('CN',cn.r,cn.i,v,[],[],{key}))).message).toBe('invalid_manifest');
  expect((await state('CN')).r).toBe(cn.r);
  expect(await publish('US',us.r,us.i,v,[id],[],{key})).toEqual({snapshot_id:p.snapshot_id,revision:p.revision,replayed:true});
 });

 it('accept needs a finished batch (review R1): a member of a running batch whose run was aborted is member_ineligible and its siblings stay quarantined',async()=>{
  const {s,v}=await seeded({revisionPolicy:'immutable'});void v;
  const ds=dataset();const old=await batch(ds);
  const t1=(await claim(ds,old,'2 hours',{timeout:'10 milliseconds'})).owner_token!;
  const r1=await retrieval(old,T3,randomUUID(),t1);
  await one(`select public.macro_claim_chunk($1,0,1,$2) v`,[old,t1]);
  const stranded=(await write(old,[native(s,'2026-09-30','4.5',r1,T3,false)],t1)).conflicts[0].observation_id!;
  await new Promise(r=>setTimeout(r,30));
  const next=await batch(ds);
  expect(await claim(ds,next,'2 hours',{takeover:true})).toMatchObject({status:'claimed',aborted:[old]});
  expect(await one(`select status v from public.ingest_batches where batch_id=$1`,[old])).toBe('running');   // not yet swept by the start route
  const okB=await batch();
  const sibling=(await write(okB,[native(s,'2026-09-30','4.6',await retrieval(okB,T3),T3,false)])).conflicts[0].observation_id!;
  await finish(okB,'success');
  const qid=await qItem(s,old);
  await one(`select public.macro_link_quarantine($1,$2::uuid[]) v`,[qid,[stranded]]);
  await one(`select public.macro_link_quarantine($1,$2::uuid[]) v`,[qid,[sibling]]);
  const by=await user();const st=await state('US');
  expect((await fails(q(`select public.macro_resolve_conflict($1,'accept',$2,$3)`,[qid,by,stranded]))).message).toBe('member_ineligible');
  expect(await q(`select status from public.macro_observations where observation_id=any($1::uuid[]) order by version`,[[stranded,sibling]])).toEqual([{status:'quarantined'},{status:'quarantined'}]);
  expect(await one(`select status v from public.dq_quarantine where id=$1`,[qid])).toBe('open');
  expect((await state('US')).i).toBe(st.i);
  expect(await one(`select public.macro_resolve_conflict($1,'accept',$2,$3) v`,[qid,by,sibling])).toEqual({status:'resolved_accept',observation_id:sibling,rejected:1});
 });

 it('ancestry deeper than 8 raises ancestry_too_deep instead of being waved through (review R4)',async()=>{
  const s=sid();const v=await catalog([def(s)]);const b=await batch();
  await write(b,[native(s,'2026-09-30','4.1',await retrieval(b,T2),T2)]);
  const root=(await rows(s,'2026-09-30'))[0].observation_id as string;
  await finish(b);
  const chain=Array.from({length:10},()=>sid('D'));
  await catalog(chain.map((c,i)=>def(c,{derive:{kind:'month_end',from:i===0?s:chain[i-1]}})));
  const d=await batch();const ids:string[]=[];let prev=root;
  for(let i=0;i<9;i++){
   expect((await write(d,[derived(chain[i],'2026-09-30','4.1',[prev],T2)])).inserted).toBe(1);
   prev=(await rows(chain[i],'2026-09-30'))[0].observation_id as string;ids.push(prev);
  }
  expect((await fails(write(d,[derived(chain[9],'2026-09-30','4.1',[prev],T2)]))).message).toBe('ancestry_too_deep');
  await finish(d);
  const st=await state('US');
  expect((await fails(publish('US',st.r,st.i,v,[ids[8]]))).message).toBe('ancestry_too_deep');
  expect((await fails(q(`select * from public.macro_latest_eligible_observations($1::text[],null,null,null)`,[[chain[8]]]))).message).toBe('ancestry_too_deep');
  expect((await publish('US',st.r,st.i,v,[ids[7]])).revision).toBe(st.r+1);                            // exactly 8 levels walk completely
 });

 it('analysis runs: free 10/24h then quota_exceeded, idempotent request_id, failed runs free, pro and admin limits, own-rows RLS',async()=>{
  const run=(u:string,req=randomUUID(),status='ok')=>one(`select public.create_macro_analysis_run($1,$2,'change','{}'::jsonb,'{}'::jsonb,$3,$4::jsonb,'test-code','macro-correlation/1',$5,$6) v`,[u,req,'a'.repeat(64),status==='ok'?'{}':null,status,status==='ok'?null:'boom']) as Promise<string>;
  const free=await user();const req=randomUUID();
  const first=await run(free,req);
  expect(await run(free,req)).toBe(first);                                                          // retry returns the same run
  for(let i=0;i<9;i++)await run(free);
  expect(await one(`select count(*)::int v from public.macro_analysis_runs where user_id=$1`,[free])).toBe(10);
  expect((await fails(run(free))).message).toBe('quota_exceeded');
  expect(await run(free,req)).toBe(first);                                                          // idempotent even at the limit
  await run(free,randomUUID(),'failed');                                                            // failures are recorded and never counted
  const pro=await user('pro');for(let i=0;i<11;i++)await run(pro);
  const adm=await user('free','admin');for(let i=0;i<12;i++)await run(adm);
  await asRole('authenticated',async c=>{
   expect((await c.query(`select count(*)::int n from public.macro_analysis_runs`)).rows[0].n).toBe(11);   // 10 ok + 1 failed, own rows only
   expect((await c.query(`select count(*)::int n from public.macro_analysis_runs where user_id=$1`,[pro])).rows[0].n).toBe(0);
  },free);
  await asRole('anon',async c=>{expect((await fails(c.query(`select * from public.macro_analysis_runs`))).message).toMatch(/permission denied/);});
 });
});
