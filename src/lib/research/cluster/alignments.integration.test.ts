import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20260926100000_research_source_entity_alignments.sql';
const T='public.research_source_entity_alignments';

describe.skipIf(!enabled)('WP-A5 entity alignment table on real PostgreSQL',()=>{
 let admin:Pool;const owner=randomUUID(),other=randomUUID();let sourceId:string,entityId:string;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));admin=new Pool({connectionString:state.adminUrl});
  for(const u of [owner,other]) await admin.query('insert into auth.users(id,email) values($1,$2)',[u,`${u}@example.test`]);
  sourceId=randomUUID();entityId=randomUUID();
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,'NEWS','t','b',$3)`,[sourceId,owner,'h-'+sourceId]);
  await admin.query(`insert into public.research_entities(id,user_id,type,name) values($1,$2,'COMPANY','Hundsun')`,[entityId,owner]);
 });
 afterAll(async()=>{await admin?.end();});
 it('exists with owner RLS, replays, and enforces the contract',async()=>{
  const rows=(await admin.query(`select c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='research_source_entity_alignments'`)).rows;
  expect(rows).toHaveLength(1);expect(rows[0].relrowsecurity).toBe(true);
  const policies=(await admin.query(`select policyname from pg_policies where tablename='research_source_entity_alignments'`)).rows.map((p:any)=>p.policyname);
  for(const op of ['select','insert','update','delete']) expect(policies).toContain(`research_source_entity_alignments self ${op}`);
  await expect(admin.query(readFileSync(MIGRATION,'utf8'))).resolves.toBeDefined();
  await admin.query(`insert into ${T}(user_id,source_id,entity_id,method,status,confidence,evidence,decided_by) values($1,$2,$3,'rule','aligned',0.8,'{"alias":"Hundsun","hits":2}','rule')`,[owner,sourceId,entityId]);
  await expect(admin.query(`insert into ${T}(user_id,source_id,entity_id,method,status) values($1,$2,$3,'rule','aligned')`,[owner,sourceId,entityId])).rejects.toThrow(/duplicate key/);
  await expect(admin.query(`insert into ${T}(user_id,source_id,entity_id,method,status) values($1,$2,$3,'oracle','aligned')`,[owner,sourceId,randomUUID()])).rejects.toThrow(/check constraint|foreign key/);
  await expect(admin.query(`insert into ${T}(user_id,source_id,entity_id,method,status,confidence) values($1,$2,$3,'rule','aligned',1.5)`,[owner,sourceId,entityId])).rejects.toThrow(/check constraint|duplicate key/);
  await expect(admin.query(`insert into ${T}(user_id,source_id,entity_id,method,status) values($1,$2,$3,'rule','maybe')`,[owner,randomUUID(),entityId])).rejects.toThrow(/check constraint|foreign key/);
  // Another owner's source/entity cannot be referenced.
  await expect(admin.query(`insert into ${T}(user_id,source_id,entity_id,method,status) values($1,$2,$3,'rule','aligned')`,[other,sourceId,entityId])).rejects.toThrow(/foreign key/);
  // Human decisions overwrite in place (upsert semantics live in code; the table permits update).
  await admin.query(`update ${T} set method='human',status='rejected',decided_by='owner' where user_id=$1 and source_id=$2 and entity_id=$3`,[owner,sourceId,entityId]);
  expect((await admin.query(`select method,status from ${T} where user_id=$1`,[owner])).rows[0]).toEqual({method:'human',status:'rejected'});
 });
});
