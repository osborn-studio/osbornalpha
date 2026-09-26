import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20260926110000_research_thesis_extension.sql';
const T='public.research_theses';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');

describe.skipIf(!enabled)('WP-A7 thesis extension on real PostgreSQL',()=>{
 let admin:Pool;const owner=randomUUID();
 const insertThesis=async(over:Record<string,unknown>={})=>{
  const id=randomUUID();
  const cols={id,user_id:owner,title:'t',body:'b',invalidation_conditions:JSON.stringify(['k1']),watch_metrics:JSON.stringify(['m1']),...over};
  const keys=Object.keys(cols);
  await admin.query(`insert into ${T}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(cols));
  return id;
 };
 const row=async(id:string)=>(await admin.query(`select * from ${T} where id=$1`,[id])).rows[0];
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));admin=new Pool({connectionString:state.adminUrl});
  await admin.query('insert into auth.users(id,email) values($1,$2)',[owner,`${owner}@example.test`]);
 });
 afterAll(async()=>{await admin?.end();});

 it('adds the §5.3 columns with defaults and replays without error',async()=>{
  const r=await row(await insertThesis());
  expect(r).toMatchObject({opportunity_type:'other',pillars:[],catalysts:[],horizon_weeks:[4,13,26],supersedes:null,kill_condition_revisions:[]});
  await expect(admin.query(readFileSync(MIGRATION,'utf8'))).resolves.toBeDefined();
  expect(await row(r.id)).toMatchObject({opportunity_type:'other',horizon_weeks:[4,13,26]});
 });

 it('rejects values outside the contract',async()=>{
  const id=await insertThesis();
  await expect(admin.query(`update ${T} set opportunity_type='D' where id=$1`,[id])).rejects.toThrow(/check constraint/);
  await expect(admin.query(`update ${T} set horizon_weeks='{}' where id=$1`,[id])).rejects.toThrow(/check constraint/);
  await expect(admin.query(`update ${T} set horizon_weeks='{4,0}' where id=$1`,[id])).rejects.toThrow(/check constraint/);
  for(const col of ['pillars','catalysts','kill_condition_revisions']) await expect(admin.query(`update ${T} set ${col}='{"a":1}' where id=$1`,[id])).rejects.toThrow(/check constraint/);
  await expect(admin.query(`update ${T} set supersedes=id where id=$1`,[id])).rejects.toThrow(/check constraint/);
  // supersedes must point at the same owner's thesis
  const other=randomUUID();await admin.query('insert into auth.users(id,email) values($1,$2)',[other,`${other}@example.test`]);
  const theirs=await insertThesis({user_id:other});
  await expect(admin.query(`update ${T} set supersedes=$2 where id=$1`,[id,theirs])).rejects.toThrow(/foreign key/);
  await expect(admin.query(`update ${T} set supersedes=$2 where id=$1`,[id,randomUUID()])).rejects.toThrow(/foreign key/);
  const old=await insertThesis({status:'CLOSED'});
  await admin.query(`update ${T} set supersedes=$2 where id=$1`,[id,old]);
  expect((await row(id)).supersedes).toBe(old);
  // deleting the old thesis detaches, it does not cascade-delete the successor
  await admin.query(`delete from ${T} where id=$1`,[old]);
  expect((await row(id)).supersedes).toBeNull();
 });

 it('accepts the KILL_CONDITION_REVISED event kind',async()=>{
  const id=await insertThesis();
  await admin.query(`insert into public.research_thesis_events(user_id,thesis_id,kind,detail) values($1,$2,'KILL_CONDITION_REVISED','{"index":0}')`,[owner,id]);
  await expect(admin.query(`insert into public.research_thesis_events(user_id,thesis_id,kind,detail) values($1,$2,'BOGUS','{}')`,[owner,id])).rejects.toThrow(/check constraint/);
 });

 it('invalidating and superseding a thesis leaves an open S4 observation and the outbox untouched (§7.4.2)',async()=>{
  const thesis=await insertThesis({status:'ACTIVE'});
  const sourceId=randomUUID(),versionId=randomUUID(),candidateId=randomUUID(),observationId=randomUUID();
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,'MANUAL','t','body',$3)`,[sourceId,owner,sha('body'+sourceId)]);
  await admin.query(`insert into public.research_source_versions(user_id,id,source_document_id,version_identity,source_key,source_ref,source_version) values($1,$2,$3,$4,$5,'{}','{}')`,[owner,versionId,sourceId,'v-'+versionId,'k-'+versionId]);
  const payloadHash=sha('pack'+candidateId);
  await admin.query(`insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)`,[owner,payloadHash,{localUserId:owner,approvedPayloadHash:payloadHash}]);
  await admin.query(`insert into public.research_s4_candidates(user_id,id,source_version_id,external_candidate_id,payload_hash,imported,status) values($1,$2,$3,$4,$5,'{}','observe')`,[owner,candidateId,versionId,randomUUID(),payloadHash]);
  const payload={thesis_id:thesis,windows_weeks:[4,13,26]};
  await admin.query(`insert into public.research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash) values($1,$2,$3,'Observation',$4,$5)`,[owner,observationId,candidateId,JSON.stringify(payload),sha(JSON.stringify(payload))]);
  await admin.query(`insert into public.research_s4_observation_state(user_id,observation_id,status) values($1,$2,'open')`,[owner,observationId]);
  const before=(await admin.query('select * from public.research_s4_observation_state where observation_id=$1',[observationId])).rows[0];
  const outboxBefore=(await admin.query('select count(*)::int as n from public.research_s4_outbox where user_id=$1',[owner])).rows[0].n;
  // The service path: status update + STATUS_CHANGE event, then a successor thesis.
  await admin.query(`update ${T} set status='INVALIDATED',updated_at=now() where id=$1`,[thesis]);
  await admin.query(`insert into public.research_thesis_events(user_id,thesis_id,kind,detail) values($1,$2,'STATUS_CHANGE','{"from":"ACTIVE","to":"INVALIDATED"}')`,[owner,thesis]);
  await insertThesis({supersedes:thesis});
  const after=(await admin.query('select * from public.research_s4_observation_state where observation_id=$1',[observationId])).rows[0];
  expect(after).toEqual(before);
  expect((await admin.query('select count(*)::int as n from public.research_s4_outbox where user_id=$1',[owner])).rows[0].n).toBe(outboxBefore);
  expect((await admin.query('select status from public.research_s4_records r join public.research_s4_observation_state s on s.observation_id=r.id where r.id=$1',[observationId])).rows[0].status).toBe('open');
  // Nothing on research_theses reaches into S4: no user triggers at all.
  const triggers=(await admin.query(`select tgname from pg_trigger where tgrelid='public.research_theses'::regclass and not tgisinternal`)).rows.map((t:any)=>t.tgname);
  expect(triggers).toEqual([]);
 });
});
