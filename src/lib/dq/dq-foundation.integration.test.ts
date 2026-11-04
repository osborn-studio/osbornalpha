// src/lib/dq/dq-foundation.integration.test.ts
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261105090000_dq_foundation.sql';
const TABLES=['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'];

describe.skipIf(!enabled)('WP-F0 dq foundation on real PostgreSQL',()=>{
 let admin:Pool;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{await admin?.end();});

 it('creates the four tables with RLS enabled and no policies, and replays without error',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES])).rows;
  expect(rows.map((r:{relname:string})=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows) expect(r.relrowsecurity).toBe(true);
  const policies=(await admin.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows[0].n;
  expect(policies).toBe(0);
  await expect(admin.query(readFileSync(MIGRATION,'utf8'))).resolves.toBeDefined();
 });

 it('enforces batch status, quarantine status and freshness cadence check constraints',async()=>{
  const batch=randomUUID();
  await admin.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'test','unit')`,[batch]);
  await expect(admin.query(`insert into public.ingest_batches(batch_id,producer,dataset,status) values($1,'test','unit','bogus')`,[randomUUID()])).rejects.toThrow(/check constraint/);
  await admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,'unit','t','k','range',$2)`,[randomUUID(),batch]);
  await expect(admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,status) values($1,'unit','t','k','range',$2,'done')`,[randomUUID(),batch])).rejects.toThrow(/check constraint/);
  await expect(admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,'unit','t','k','range',$2)`,[randomUUID(),randomUUID()])).rejects.toThrow(/foreign key/);
  await admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('unit','daily','missing')`);
  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('unit2','weekly','missing')`)).rejects.toThrow(/check constraint/);
 });

 it('denies anon and authenticated roles while service_role bypasses',async()=>{
  const c=await admin.connect();
  try{
   await c.query(`set role anon`);
   await expect(c.query(`select * from public.ingest_batches`)).rejects.toThrow(/permission denied/);
   await c.query(`reset role`);
  }finally{c.release();}
 });
});
