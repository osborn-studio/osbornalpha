import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {rowToSource} from '../sources';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20260925230000_research_source_extension.sql';
const TABLE='public.research_source_documents';

describe.skipIf(!enabled)('WP-A1 source extension on real PostgreSQL',()=>{
 let admin:Pool;const userId=randomUUID();
 const insertLegacy=async(sourceType:string,text:string)=>{
  const id=randomUUID();
  await admin.query(`insert into ${TABLE}(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,$3,$4,$5,$6)`,[id,userId,sourceType,`t ${text}`,text,`hash-${randomUUID()}`]);
  return id;
 };
 const row=async(id:string)=>(await admin.query(`select * from ${TABLE} where id=$1`,[id])).rows[0];
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  await admin.query('insert into auth.users(id,email) values($1,$2)',[userId,`${userId}@example.test`]);
 });
 afterAll(async()=>{await admin?.end();});

 it('adds the §5.1 columns and replays without error',async()=>{
  const columns=(await admin.query(`select column_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='research_source_documents' and column_name=any($1)`,[['event_time','available_at','source_version','cluster_id','cluster_first','origin_type','market','permission']])).rows;
  expect(columns.map((c:any)=>c.column_name).sort()).toEqual(['available_at','cluster_first','cluster_id','event_time','market','origin_type','permission','source_version']);
  expect(columns.find((c:any)=>c.column_name==='available_at').is_nullable).toBe('NO');
  expect(columns.find((c:any)=>c.column_name==='permission').is_nullable).toBe('NO');
  await expect(admin.query(readFileSync(MIGRATION,'utf8'))).resolves.toBeDefined();
 });

 it('backfills legacy-shaped rows: availability from ingestion, permission by type, market unknown',async()=>{
  const news=await row(await insertLegacy('NEWS','news body'));
  expect(news.available_at.toISOString()).toBe(news.ingested_at.toISOString());
  expect(news).toMatchObject({source_version:'1',permission:'public',market:null,cluster_id:null,cluster_first:null,origin_type:null,event_time:null});
  // NOTE/MANUAL inserted through the legacy path are private from the insert
  // trigger; replaying the migration (backfill included) changes nothing.
  const note=await row(await insertLegacy('NOTE','note body'));
  expect(note.permission).toBe('private');
  await admin.query(readFileSync(MIGRATION,'utf8'));
  expect((await row(note.id)).permission).toBe('private');
  expect((await row(news.id)).permission).toBe('public');
  // pg returns timestamptz as Date; rowToSource passes values through unchanged.
  const mapped=rowToSource(await row(news.id));
  expect(mapped).toMatchObject({available_at:news.available_at,source_version:'1',permission:'public',market:null,origin_type:null,event_time:null});
 });

 it('defaults every writer at insert time: permission by type, availability from the explicit ingestion instant',async()=>{
  // The S4 import writer inserts MANUAL rows with an explicit ingested_at and no permission.
  const id=randomUUID();const ingested='2026-09-20T01:02:03.004Z';
  await admin.query(`insert into ${TABLE}(id,user_id,source_type,title,raw_text,content_hash,ingested_at) values($1,$2,'MANUAL','t','controlled copy',$3,$4)`,[id,userId,`hash-${randomUUID()}`,ingested]);
  const r=await row(id);
  expect(r.permission).toBe('private');
  expect(r.available_at.toISOString()).toBe(ingested);
  // An explicit permission is kept even for MANUAL.
  const id2=randomUUID();
  await admin.query(`insert into ${TABLE}(id,user_id,source_type,title,raw_text,content_hash,permission) values($1,$2,'MANUAL','t','shared note',$3,'public')`,[id2,userId,`hash-${randomUUID()}`]);
  expect((await row(id2)).permission).toBe('public');
 });

 it('rejects values outside the contract',async()=>{
  const id=await insertLegacy('FILING','filing body');
  for(const [column,value] of [['market','EU'],['permission','secret'],['origin_type','rumor']] as const)
   await expect(admin.query(`update ${TABLE} set ${column}=$1 where id=$2`,[value,id])).rejects.toThrow(/check constraint/);
  // source_version is immutable after insert, so its shape is checked on insert.
  for(const bad of ['0','v2','']) await expect(admin.query(`insert into ${TABLE}(id,user_id,source_type,title,raw_text,content_hash,source_version) values($1,$2,'NEWS','t','b',$3,$4)`,[randomUUID(),userId,`hash-${randomUUID()}`,bad])).rejects.toThrow(/check constraint/);
 });

 it('keeps availability and vintage immutable while allowing enrichment updates',async()=>{
  const id=await insertLegacy('NEWS','immutable body');
  await expect(admin.query(`update ${TABLE} set available_at=now()+interval '1 day' where id=$1`,[id])).rejects.toThrow(/immutable/);
  await expect(admin.query(`update ${TABLE} set source_version='2' where id=$1`,[id])).rejects.toThrow(/immutable/);
  await admin.query(`update ${TABLE} set event_time=now(),permission='licensed',market='US',origin_type='filing',cluster_id=$2,cluster_first=true where id=$1`,[id,randomUUID()]);
  expect(await row(id)).toMatchObject({permission:'licensed',market:'US',origin_type:'filing',cluster_first:true});
 });

 it('indexes the new access paths',async()=>{
  const names=(await admin.query(`select indexname from pg_indexes where schemaname='public' and tablename='research_source_documents'`)).rows.map((r:any)=>r.indexname);
  for(const name of ['research_sources_user_available_idx','research_sources_user_cluster_idx','research_sources_user_market_idx','research_sources_user_permission_idx'])expect(names).toContain(name);
 });
});
