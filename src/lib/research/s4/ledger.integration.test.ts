import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20260926000000_research_judgment_ledger.sql';
const TABLES=['research_judgments','research_labels','research_decisions','research_outcomes'];

describe.skipIf(!enabled)('WP-A3 judgment ledger on real PostgreSQL',()=>{
 let admin:Pool;
 const actor={userId:randomUUID(),kind:'agent' as const},other={userId:randomUUID(),kind:'agent' as const};
 let sourceId:string,thesisId:string;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  admin=new Pool({connectionString:state.adminUrl});
  for(const a of [actor,other]){
   await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,`${a.userId}@example.test`]);
   await admin.query("update public.profiles set role='admin' where id=$1",[a.userId]);
  }
  sourceId=randomUUID();thesisId=randomUUID();
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash,ingested_at) values($1,$2,'NEWS','t','body',$3,'2026-09-20T00:00:00Z')`,[sourceId,actor.userId,`hash-${randomUUID()}`]);
  await admin.query(`insert into public.research_theses(id,user_id,title) values($1,$2,'thesis')`,[thesisId,actor.userId]);
 });
 afterAll(async()=>{await admin?.end();});

 it('creates the four append-only tables with forced RLS and replays without error',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES])).rows;
  expect(rows.map((r:any)=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows){expect(r.relrowsecurity).toBe(true);expect(r.relforcerowsecurity).toBe(true);}
  const policies=(await admin.query(`select tablename,policyname,roles::text from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows;
  for(const t of TABLES){
   expect(policies.find((p:any)=>p.tablename===t&&p.policyname==='s4_owner')?.roles).toContain('alpha_s4_runtime');
   expect(policies.filter((p:any)=>p.tablename===t).map((p:any)=>p.policyname)).not.toContain(`${t} self update`);
  }
  await expect(admin.query(readFileSync(MIGRATION,'utf8'))).resolves.toBeDefined();
 });

 it('rejects every update and delete, even from the table owner',async()=>{
  const jid=randomUUID(),lid=randomUUID(),did=randomUUID(),oid=randomUUID();
  await admin.query(`insert into public.research_judgments(user_id,id,snapshot_id,snapshot,source_id,thesis_id,run_id,question_set_version,question_id,backend,backend_model,distribution,abstained,created_at)
   values($1,$2,repeat('a',64),'{}',$3,$4,$5,'v1.0','Q1','rule','rules-1','{}',false,now())`,[actor.userId,jid,sourceId,thesisId,randomUUID()]);
  await admin.query(`insert into public.research_labels(user_id,id,judgment_id,label,labeler,labeled_at) values($1,$2,$3,'true','owner',now())`,[actor.userId,lid,jid]);
  await admin.query(`insert into public.research_decisions(user_id,id,thesis_id,week_of,arm,action,reason,cited_judgment_ids,created_at) values($1,$2,$3,'2026-09-21','collab','adopt','r',$4,now())`,[actor.userId,did,thesisId,[jid]]);
  await admin.query(`insert into public.research_outcomes(user_id,id,decision_id,window_weeks,judged_by,judged_at) values($1,$2,$3,4,'owner',now())`,[actor.userId,oid,did]);
  const cases:[string,string,string][]=[['research_judgments','selected',jid],['research_labels','label',lid],['research_decisions','reason',did],['research_outcomes','judged_by',oid]];
  for(const [table,column,id] of cases){
   await expect(admin.query(`update public.${table} set ${column}='changed' where user_id=$1 and id=$2`,[actor.userId,id])).rejects.toThrow(/immutable_record/);
   await expect(admin.query(`delete from public.${table} where user_id=$1 and id=$2`,[actor.userId,id])).rejects.toThrow(/immutable_record/);
  }
  // Constraints: baseline decisions must carry the freeze timestamp; enums are closed.
  await expect(admin.query(`insert into public.research_decisions(user_id,id,thesis_id,week_of,arm,action,reason,created_at) values($1,$2,$3,'2026-09-21','human_baseline','adopt','r',now())`,[actor.userId,randomUUID(),thesisId])).rejects.toThrow(/research_decisions_baseline_frozen/);
  await expect(admin.query(`insert into public.research_judgments(user_id,id,snapshot_id,snapshot,source_id,thesis_id,run_id,question_set_version,question_id,backend,backend_model,distribution,abstained,created_at)
   values($1,$2,repeat('a',64),'{}',$3,$4,$5,'v1.0','Q1','oracle','x','{}',false,now())`,[actor.userId,randomUUID(),sourceId,thesisId,randomUUID()])).rejects.toThrow(/check constraint/);
 });
});
