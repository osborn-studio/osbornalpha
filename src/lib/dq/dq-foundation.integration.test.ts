// src/lib/dq/dq-foundation.integration.test.ts
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261105090000_dq_foundation.sql';
const TABLES=['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'];
const ds=()=>'dq-'+randomUUID().slice(0,8);

// Replays a migration in one transaction with a short lock_timeout, retrying lock timeouts
// (55P03) and deadlocks (40P01). Same policy as issuers.integration.test.ts: the DB suites
// run concurrently and the issuers migration alters research_entity_* tables that other suites use,
// so replays must not queue behind (and block) foreign locks.
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=3):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,500));
  }finally{c.release();}
 }
}

describe.skipIf(!enabled)('WP-F0 dq foundation on real PostgreSQL',()=>{
 let admin:Pool;
 const batches:string[]=[];
 const datasets:string[]=[];
 const newDs=()=>{const d=ds();datasets.push(d);return d;};
 const insertBatch=async(dataset:string)=>{
  const id=randomUUID();batches.push(id);
  await admin.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'test',$2)`,[id,dataset]);
  return id;
 };
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{
  if(admin){
   await admin.query(`delete from public.dq_quarantine where dataset=any($1) or batch_id=any($2::uuid[])`,[datasets,batches]);
   await admin.query(`delete from public.dq_reconciliations where dataset=any($1) or batch_id=any($2::uuid[])`,[datasets,batches]);
   await admin.query(`delete from public.ingest_batches where batch_id=any($1::uuid[]) or dataset=any($2)`,[batches,datasets]);
   await admin.query(`delete from public.dq_freshness where dataset=any($1)`,[datasets]);
   await admin.end();
  }
 });

 it('creates the four tables with RLS enabled and no policies, and replays without error',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES])).rows;
  expect(rows.map((r:{relname:string})=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows) expect(r.relrowsecurity).toBe(true);
  const policies=(await admin.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows[0].n;
  expect(policies).toBe(0);
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
 },30000);

 it('enforces named check, foreign-key and invariant constraints on all four tables',async()=>{
  const d=newDs();
  const batch=await insertBatch(d);
  const ins=(cols:string,vals:string,params:unknown[])=>admin.query(`insert into public.ingest_batches(batch_id,producer,dataset,${cols}) values($1,'test',$2,${vals})`,[randomUUID(),d,...params]);
  await expect(ins('status,finished_at',`'bogus',now()`,[])).rejects.toThrow(/ingest_batches_status_check/);
  await expect(ins('triggered_by',`'robot'`,[])).rejects.toThrow(/ingest_batches_triggered_by_check/);
  await expect(ins('status,started_at,finished_at',`'success',$3,$4`,['2026-01-02T00:00:00Z','2026-01-01T00:00:00Z'])).rejects.toThrow(/ingest_batches_finished_after_started/);
  await expect(ins('status',`'success'`,[])).rejects.toThrow(/ingest_batches_running_iff_unfinished/);
  await expect(ins('counts',`'[]'::jsonb`,[])).rejects.toThrow(/ingest_batches_counts_object/);

  const q=(extraCols:string,extraVals:string,batchId:string,params:unknown[]=[])=>admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id${extraCols}) values($1,$2,'t','k','range',$3${extraVals})`,[randomUUID(),d,batchId,...params]);
  // The FK case runs before the valid open insert: an open row with the same key would make the
  // open-key unique index fire first and mask the FK violation.
  await expect(q('','',randomUUID())).rejects.toThrow(/dq_quarantine_batch_id_fkey/);
  await q('','',batch);
  await expect(q(',status,resolved_by,resolved_at',`,'done',$4,now()`,batch,[randomUUID()])).rejects.toThrow(/dq_quarantine_status_check/);
  await expect(q(',status,resolved_by',`,'resolved_accept',$4`,batch,[randomUUID()])).rejects.toThrow(/dq_quarantine_open_iff_unresolved/);

  await admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'daily','missing')`,[d]);
  const f2=newDs();
  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'weekly','missing')`,[f2])).rejects.toThrow(/dq_freshness_expected_cadence_check/);
  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status,consecutive_errors) values($1,'daily','error',-1)`,[f2])).rejects.toThrow(/dq_freshness_consecutive_errors_check/);
  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'daily','fresh')`,[f2])).rejects.toThrow(/dq_freshness_ok_requires_last_ok/);
 });

 it('allows one open item per (dataset, table_name, natural_key, reason_code); resolved rows may repeat',async()=>{
  const d=newDs();
  const batch=await insertBatch(d);
  const open=()=>admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,$2,'t','k','range',$3)`,[randomUUID(),d,batch]);
  await open();
  await expect(open()).rejects.toThrow(/dq_quarantine_open_key_uniq/);
  // Same key on another reason or table is a different item.
  await admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,$2,'t','k','jump',$3)`,[randomUUID(),d,batch]);
  // A resolved row with the same key coexists with the open one and with a new open row once the first is resolved.
  await admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,status,resolved_by,resolved_at) values($1,$2,'t','k','range',$3,'resolved_reject',$4,now())`,[randomUUID(),d,batch,randomUUID()]);
  await admin.query(`update public.dq_quarantine set status='resolved_accept',resolved_by=$2,resolved_at=now() where dataset=$1 and natural_key='k' and reason_code='range' and status='open'`,[d,randomUUID()]);
  await open();
  const n=(await admin.query(`select status,count(*)::int n from public.dq_quarantine where dataset=$1 and reason_code='range' group by status order by status`,[d])).rows;
  expect(n).toEqual([{status:'open',n:1},{status:'resolved_accept',n:1},{status:'resolved_reject',n:1}]);
 });

 it('restricts batch deletion while quarantine evidence exists and nulls reconciliation batch_id on delete',async()=>{
  const d=newDs();
  const quarantined=await insertBatch(d);
  await admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,$2,'t','k','range',$3)`,[randomUUID(),d,quarantined]);
  await expect(admin.query(`delete from public.ingest_batches where batch_id=$1`,[quarantined])).rejects.toThrow(/dq_quarantine_batch_id_fkey/);

  const reconciled=await insertBatch(d);
  const recId=randomUUID();
  await admin.query(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,tolerance,passed,batch_id) values($1,$2,'a','b','k',0,true,$3)`,[recId,d,reconciled]);
  await admin.query(`delete from public.ingest_batches where batch_id=$1`,[reconciled]);
  const rec=(await admin.query(`select batch_id from public.dq_reconciliations where id=$1`,[recId])).rows[0];
  expect(rec.batch_id).toBeNull();
 });

 it('revokes SELECT/INSERT/TRUNCATE from anon and authenticated, denies anon reads, and service_role bypasses RLS',async()=>{
  for(const role of ['anon','authenticated']) for(const t of TABLES) for(const priv of ['SELECT','INSERT','TRUNCATE']){
   const allowed=(await admin.query(`select has_table_privilege($1,'public.'||$2,$3) ok`,[role,t,priv])).rows[0].ok;
   expect({role,t,priv,allowed}).toEqual({role,t,priv,allowed:false});
  }
  const bypass=(await admin.query(`select rolbypassrls from pg_roles where rolname='service_role'`)).rows[0]?.rolbypassrls;
  expect(bypass).toBe(true);
  const c=await admin.connect();
  try{
   await c.query(`set role anon`);
   await expect(c.query(`select * from public.ingest_batches`)).rejects.toThrow(/permission denied/);
  }finally{
   await c.query('reset role').catch(()=>{});
   c.release();
  }
 });
});
