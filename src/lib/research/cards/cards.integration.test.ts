import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20260926120000_research_cards.sql';
const T='public.research_cards';

describe.skipIf(!enabled)('WP-A8 research_cards on real PostgreSQL',()=>{
 let admin:Pool;const owner=randomUUID();let thesisId:string;
 const insert=(over:Record<string,unknown>={})=>{
  const cols={user_id:owner,id:randomUUID(),week_of:'2026-09-21',thesis_id:thesisId,kind:'evidence',title:'t',fields:'{}',assertions:'[]',evidence:'{}',generation:'{}',axiom_results:'[]',status:'generated',created_at:new Date().toISOString(),...over};
  const keys=Object.keys(cols);
  return admin.query(`insert into ${T}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(cols));
 };
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));admin=new Pool({connectionString:state.adminUrl});
  await admin.query('insert into auth.users(id,email) values($1,$2)',[owner,`${owner}@example.test`]);
  thesisId=randomUUID();
  await admin.query(`insert into public.research_theses(id,user_id,title,body,invalidation_conditions,watch_metrics) values($1,$2,'t','b','["k"]','["m"]')`,[thesisId,owner]);
 });
 afterAll(async()=>{await admin?.end();});

 it('exists with owner RLS policies and replays without error',async()=>{
  const rls=(await admin.query(`select relrowsecurity from pg_class where oid='${T}'::regclass`)).rows[0];
  expect(rls.relrowsecurity).toBe(true);
  const policies=(await admin.query(`select policyname from pg_policies where tablename='research_cards'`)).rows.map((p:any)=>p.policyname).sort();
  expect(policies).toEqual(['research_cards self insert','research_cards self select']);
  await expect(admin.query(readFileSync(MIGRATION,'utf8'))).resolves.toBeDefined();
 });

 it('enforces one card per (owner, week, thesis, kind) and the value contracts',async()=>{
  await insert();
  await expect(insert()).rejects.toThrow(/duplicate key/);
  await insert({kind:'counter'});
  await expect(insert({kind:'summary'})).rejects.toThrow(/check constraint/);
  await expect(insert({week_of:'2026-09-28',status:'draft'})).rejects.toThrow(/check constraint/);
  await expect(insert({week_of:'2026-09-28',fields:'[]'})).rejects.toThrow(/check constraint/);
  await expect(insert({week_of:'2026-09-28',assertions:'{}'})).rejects.toThrow(/check constraint/);
  await expect(insert({week_of:'2026-09-28',thesis_id:randomUUID()})).rejects.toThrow(/foreign key/);
  // Another owner's thesis cannot be referenced.
  const other=randomUUID();await admin.query('insert into auth.users(id,email) values($1,$2)',[other,`${other}@example.test`]);
  await expect(insert({week_of:'2026-09-28',user_id:other})).rejects.toThrow(/foreign key/);
 });
});
