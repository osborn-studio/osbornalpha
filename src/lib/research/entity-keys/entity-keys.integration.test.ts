import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20260926010000_research_entity_keys.sql';
const TABLES=['research_entity_keys','research_entity_securities'];

describe.skipIf(!enabled)('WP-A2 entity keys on real PostgreSQL',()=>{
 let admin:Pool;const owner=randomUUID(),other=randomUUID();let entityId:string,otherEntityId:string;
 const entity=async(userId:string,name:string)=>{const id=randomUUID();await admin.query(`insert into public.research_entities(id,user_id,type,name) values($1,$2,'COMPANY',$3)`,[id,userId,name]);return id;};
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  for(const u of [owner,other]) await admin.query('insert into auth.users(id,email) values($1,$2)',[u,`${u}@example.test`]);
  entityId=await entity(owner,'Hundsun Technologies');otherEntityId=await entity(other,'Hundsun Technologies');
 });
 afterAll(async()=>{await admin?.end();});

 it('creates both tables with owner RLS, read-only runtime access, and replays without error',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES])).rows;
  expect(rows.map((r:any)=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows) expect(r.relrowsecurity).toBe(true);
  const policies=(await admin.query(`select tablename,policyname from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows;
  for(const t of TABLES) for(const op of ['select','insert','update','delete']) expect(policies.some((p:any)=>p.tablename===t&&p.policyname===`${t} self ${op}`)).toBe(true);
  const grants=(await admin.query(`select table_name,privilege_type from information_schema.role_table_grants where grantee='alpha_s4_runtime' and table_name=any($1)`,[TABLES])).rows;
  expect(grants.map((g:any)=>g.privilege_type)).toEqual(['SELECT','SELECT']);
  await expect(admin.query(readFileSync(MIGRATION,'utf8'))).resolves.toBeDefined();
 });

 it('binds keys and securities to the owner\'s entity and enforces shape, uniqueness and validity windows',async()=>{
  await admin.query(`insert into public.research_entity_keys(user_id,entity_id,lei,usci,home_market,in_scope,names_zh,names_en) values($1,$2,'3003003LS77D1DRDDE25','913300002539329145','A',true,'["恒生电子"]','["Hundsun Technologies Inc."]')`,[owner,entityId]);
  // Another owner's entity cannot be claimed; the same LEI cannot appear twice for one owner.
  await expect(admin.query(`insert into public.research_entity_keys(user_id,entity_id,home_market) values($1,$2,'A')`,[owner,otherEntityId])).rejects.toThrow(/foreign key/);
  const second=await entity(owner,'Dup');
  await expect(admin.query(`insert into public.research_entity_keys(user_id,entity_id,lei,home_market) values($1,$2,'3003003LS77D1DRDDE25','A')`,[owner,second])).rejects.toThrow(/duplicate key/);
  for(const [col,val] of [['lei','bad'],['usci','9133000025393291'],['cik','012'],['cninfo_org_id','  ']] as const)
   await expect(admin.query(`insert into public.research_entity_keys(user_id,entity_id,${col},home_market) values($1,$2,$3,'A')`,[owner,second,val])).rejects.toThrow(/check constraint/);
  await expect(admin.query(`insert into public.research_entity_keys(user_id,entity_id,home_market) values($1,$2,'EU')`,[owner,second])).rejects.toThrow(/check constraint/);
  await admin.query(`insert into public.research_entity_securities(user_id,id,entity_id,exchange_code,mic,isin,market,valid_from) values($1,$2,$3,'600570.SH','XSHG','CNE000001FN6','A','2003-12-16')`,[owner,randomUUID(),entityId]);
  await expect(admin.query(`insert into public.research_entity_securities(user_id,id,entity_id,exchange_code,market,valid_from) values($1,$2,$3,'600570.SH','A','2003-12-16')`,[owner,randomUUID(),entityId])).rejects.toThrow(/duplicate key/);
  await expect(admin.query(`insert into public.research_entity_securities(user_id,id,entity_id,exchange_code,market,valid_from,valid_to) values($1,$2,$3,'600570.SZ','A','2020-01-01','2020-01-01')`,[owner,randomUUID(),entityId])).rejects.toThrow(/check constraint/);
  await expect(admin.query(`insert into public.research_entity_securities(user_id,id,entity_id,exchange_code,market,valid_from,security_type) values($1,$2,$3,'X','A','2020-01-01','warrant')`,[owner,randomUUID(),entityId])).rejects.toThrow(/check constraint/);
  // Deleting the entity cascades to its keys and securities.
  await admin.query('delete from public.research_entities where id=$1',[entityId]);
  expect((await admin.query('select count(*) n from public.research_entity_keys where entity_id=$1',[entityId])).rows[0].n).toBe('0');
  expect((await admin.query('select count(*) n from public.research_entity_securities where entity_id=$1',[entityId])).rows[0].n).toBe('0');
 });
});
