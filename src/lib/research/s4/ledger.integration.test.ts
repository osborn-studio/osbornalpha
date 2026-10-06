import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {closeS4Pool,transaction} from './db';
import {addLabel,judgmentId,recordDecision,recordJudgment,recordOutcome,replayJudgments,replayTimestampFilteredJudgments,snapshotId,type DecisionInput,type JudgmentInput} from './ledger';

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
 afterAll(async()=>{await closeS4Pool();await admin?.end();});
 const judgment=(over:Partial<JudgmentInput>={}):JudgmentInput=>({snapshot:{source_id:sourceId,source_version:'1',thesis_id:thesisId,thesis_version:'1',entity_table_version:'2026-09-25'},run_id:randomUUID(),question_set_version:'v1.0',question_id:'Q1',backend:'rule',backend_model:'rules-1',distribution:{true:0.8,false:0.2},selected:'true',confidence:0.8,abstained:false,latency_ms:3,cost_micros:0,...over});
 const count=async(table:string,userId=actor.userId)=>Number((await admin.query(`select count(*) n from public.${table} where user_id=$1`,[userId])).rows[0].n);
 const audits=async(action:string,objectId:string)=>Number((await admin.query('select count(*) n from public.research_audit_log where user_id=$1 and action=$2 and object_id=$3',[actor.userId,action,objectId])).rows[0].n);

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

 it('records judgments idempotently by content address and audits each write once',async()=>{
  const input=judgment();
  const before=await count('research_judgments');
  const first=await recordJudgment(actor,input);
  const expectedSnapshot=snapshotId(input.snapshot);
  expect(first).toEqual({id:judgmentId({snapshot_id:expectedSnapshot,question_set_version:'v1.0',backend:'rule',backend_model:'rules-1',question_id:'Q1'}),snapshot_id:expectedSnapshot,duplicate:false});
  const row=(await admin.query('select * from public.research_judgments where user_id=$1 and id=$2',[actor.userId,first.id])).rows[0];
  expect(row).toMatchObject({snapshot_id:expectedSnapshot,source_id:sourceId,thesis_id:thesisId,backend:'rule',selected:'true',abstained:false,distribution:{true:0.8,false:0.2}});
  expect(row.snapshot).toEqual(input.snapshot);
  // Same content, new batch: runtime fields (run_id, latency, cost) do not change the address.
  expect(await recordJudgment(actor,judgment({run_id:randomUUID(),latency_ms:99,cost_micros:5}))).toEqual({...first,duplicate:true});
  expect(await count('research_judgments')).toBe(before+1);
  // Same address, different answer: the ledger refuses to silently keep either.
  await expect(recordJudgment(actor,judgment({selected:'false',distribution:{true:0.2,false:0.8}}))).rejects.toThrow('idempotency_conflict');
  expect(await count('research_judgments')).toBe(before+1);
  expect(await audits('ledger.judgment',first.id)).toBe(1);
 });

 it('stores the normalized five-field snapshot so retries with extra keys stay idempotent',async()=>{
  const noisy=judgment({question_id:'Q5',snapshot:{source_id:sourceId,source_version:'1',thesis_id:thesisId,thesis_version:'1',entity_table_version:'2026-09-25',fetched_by:'collector-7'} as any});
  const first=await recordJudgment(actor,noisy);
  expect(first.duplicate).toBe(false);
  const stored=(await admin.query('select snapshot from public.research_judgments where user_id=$1 and id=$2',[actor.userId,first.id])).rows[0].snapshot;
  expect(Object.keys(stored).sort()).toEqual(['entity_table_version','source_id','source_version','thesis_id','thesis_version']);
  expect(await recordJudgment(actor,noisy)).toEqual({...first,duplicate:true});
  expect(await recordJudgment(actor,judgment({question_id:'Q5'}))).toEqual({...first,duplicate:true});
 });

 it('validates judgment inputs before touching the database',async()=>{
  const before=await count('research_judgments');
  await expect(recordJudgment(actor,judgment({backend:'oracle' as any}))).rejects.toThrow('invalid_schema');
  await expect(recordJudgment(actor,judgment({confidence:1.5}))).rejects.toThrow('invalid_schema');
  await expect(recordJudgment(actor,judgment({distribution:[] as any}))).rejects.toThrow('invalid_schema');
  await expect(recordJudgment(actor,judgment({prompt_sha256:'abc'}))).rejects.toThrow('invalid_schema');
  await expect(recordJudgment(actor,judgment({run_id:'batch-1'}))).rejects.toThrow('invalid_schema');
  expect(await count('research_judgments')).toBe(before);
 });

 it('scopes judgments and labels to the owner of the source and thesis',async()=>{
  const mine=await recordJudgment(actor,judgment({question_id:'Q2'}));
  // Another owner cannot address my source/thesis, cannot see my rows, cannot label them.
  await expect(recordJudgment(other,judgment({question_id:'Q2'}))).rejects.toThrow('scope_denied');
  await transaction(other,async db=>expect((await db.query('select id from public.research_judgments')).rows).toEqual([]));
  await expect(addLabel(other,{judgment_id:mine.id,label:'true',labeler:'other'})).rejects.toThrow('scope_denied');
  await expect(addLabel(actor,{judgment_id:randomUUID(),label:'true',labeler:'owner'})).rejects.toThrow('scope_denied');
  await expect(addLabel(actor,{judgment_id:mine.id,label:' ',labeler:'owner'})).rejects.toThrow('invalid_schema');
  const label=await addLabel(actor,{judgment_id:mine.id,label:'true',labeler:'owner'});
  expect((await admin.query('select label,labeler,labeled_at from public.research_labels where user_id=$1 and id=$2',[actor.userId,label.id])).rows[0]).toMatchObject({label:'true',labeler:'owner'});
  expect(await audits('ledger.label',label.id)).toBe(1);
  expect(await count('research_labels',other.userId)).toBe(0);
 });

 it('records decisions that cite only the owner\'s judgments and freezes the human baseline',async()=>{
  const cited=await recordJudgment(actor,judgment({question_id:'Q3'}));
  const decision=(over:Partial<DecisionInput>={}):DecisionInput=>({thesis_id:thesisId,week_of:'2026-09-21',arm:'collab',action:'adopt',reason:'Q3 supports the thesis',cited_judgment_ids:[cited.id],card_id:'card-1',time_spent_minutes:7,...over});
  const before=await count('research_decisions');
  await expect(recordDecision(actor,decision({cited_judgment_ids:[randomUUID()]}))).rejects.toThrow('scope_denied');
  await expect(recordDecision(other,decision())).rejects.toThrow('scope_denied');
  await expect(recordDecision(actor,decision({arm:'human_baseline'}))).rejects.toThrow('invalid_schema');
  await expect(recordDecision(actor,decision({arm:'oracle' as any}))).rejects.toThrow('invalid_schema');
  await expect(recordDecision(actor,decision({action:'buy' as any}))).rejects.toThrow('invalid_schema');
  await expect(recordDecision(actor,decision({reason:'  '}))).rejects.toThrow('invalid_schema');
  await expect(recordDecision(actor,decision({week_of:'2026-9-1'}))).rejects.toThrow('invalid_schema');
  await expect(recordDecision(actor,decision({workspace:'team:'}))).rejects.toThrow('invalid_schema');
  expect(await count('research_decisions')).toBe(before);
  const made=await recordDecision(actor,decision());
  const baseline=await recordDecision(actor,decision({arm:'human_baseline',frozen_at:'2026-09-20T08:00:00Z',cited_judgment_ids:[]}));
  const rows=(await admin.query('select * from public.research_decisions where user_id=$1 and id=any($2::uuid[]) order by created_at',[actor.userId,[made.id,baseline.id]])).rows;
  expect(rows[0]).toMatchObject({thesis_id:thesisId,arm:'collab',action:'adopt',cited_judgment_ids:[cited.id],card_id:'card-1',time_spent_minutes:7,workspace:'personal',analyst_id:null});
  expect(rows[0].week_of.toISOString().slice(0,10)).toBe('2026-09-21');
  expect(rows[1].frozen_at.toISOString()).toBe('2026-09-20T08:00:00.000Z');
  expect(await audits('ledger.decision',made.id)).toBe(1);
 });

 it('E4: links a decision to one of the owner\'s S4 observations and refuses foreign or unknown observations',async()=>{
  await expect(admin.query(readFileSync('supabase/migrations/20260926130000_research_decisions_observation.sql','utf8'))).resolves.toBeDefined();
  const col=(await admin.query("select is_nullable from information_schema.columns where table_schema='public' and table_name='research_decisions' and column_name='observation_id'")).rows[0];
  expect(col?.is_nullable).toBe('YES');
  // Minimal S4 observation state for the owner (binding → source version → candidate → Observation record → state).
  const seedObservation=async(userId:string)=>{
   const {createHash}=await import('node:crypto');const sha=(x:string)=>createHash('sha256').update(x).digest('hex');
   const src=randomUUID(),ver=randomUUID(),cand=randomUUID(),obs=randomUUID(),hash=sha('pack'+cand);
   await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,'MANUAL','t','b',$3)`,[src,userId,sha('b'+src)]);
   await admin.query(`insert into public.research_source_versions(user_id,id,source_document_id,version_identity,source_key,source_ref,source_version) values($1,$2,$3,$4,$5,'{}','{}')`,[userId,ver,src,'v-'+ver,'k-'+ver]);
   await admin.query(`insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3)`,[userId,hash,{localUserId:userId,approvedPayloadHash:hash}]);
   await admin.query(`insert into public.research_s4_candidates(user_id,id,source_version_id,external_candidate_id,payload_hash,imported,status) values($1,$2,$3,$4,$5,'{}','observe')`,[userId,cand,ver,randomUUID(),hash]);
   const payload={synthetic:true};
   await admin.query(`insert into public.research_s4_records(user_id,id,candidate_id,kind,payload,payload_hash) values($1,$2,$3,'Observation',$4,$5)`,[userId,obs,cand,JSON.stringify(payload),sha(JSON.stringify(payload))]);
   await admin.query(`insert into public.research_s4_observation_state(user_id,observation_id,status) values($1,$2,'pending_start')`,[userId,obs]);
   return obs;
  };
  const mine=await seedObservation(actor.userId),theirs=await seedObservation(other.userId);
  const base:DecisionInput={thesis_id:thesisId,week_of:'2026-09-21',arm:'ai_candidate',action:'shadow',reason:'linked to an observation'};
  await expect(recordDecision(actor,{...base,observation_id:'not-a-uuid'})).rejects.toThrow('invalid_schema');
  await expect(recordDecision(actor,{...base,observation_id:randomUUID()})).rejects.toThrow('scope_denied');
  await expect(recordDecision(actor,{...base,observation_id:theirs})).rejects.toThrow('scope_denied');
  const linked=await recordDecision(actor,{...base,observation_id:mine});
  const row=(await admin.query('select observation_id from public.research_decisions where user_id=$1 and id=$2',[actor.userId,linked.id])).rows[0];
  expect(row.observation_id).toBe(mine);
  const detail=(await admin.query('select detail from public.research_audit_log where user_id=$1 and object_id=$2',[actor.userId,linked.id])).rows[0].detail;
  expect(detail.observation_id).toBe(mine);
  const unlinked=await recordDecision(actor,{...base,reason:'no observation yet'});
  expect((await admin.query('select observation_id from public.research_decisions where user_id=$1 and id=$2',[actor.userId,unlinked.id])).rows[0].observation_id).toBeNull();
 });

 it('records outcomes only against the owner\'s existing decisions',async()=>{
  const decision=await recordDecision(actor,{thesis_id:thesisId,week_of:'2026-09-21',arm:'ai_candidate',action:'shadow',reason:'shadow run'});
  const outcome={decision_id:decision.id,window_weeks:4,evaluation_id:'eval-1',pillar_results:{p1:'resolved_true'},price_result:{alpha:0.01},judged_by:'evaluator'};
  await expect(recordOutcome(other,outcome)).rejects.toThrow('scope_denied');
  await expect(recordOutcome(actor,{...outcome,decision_id:randomUUID()})).rejects.toThrow('scope_denied');
  await expect(recordOutcome(actor,{...outcome,window_weeks:0})).rejects.toThrow('invalid_schema');
  await expect(recordOutcome(actor,{...outcome,pillar_results:[] as any})).rejects.toThrow('invalid_schema');
  const made=await recordOutcome(actor,outcome);
  expect((await admin.query('select * from public.research_outcomes where user_id=$1 and id=$2',[actor.userId,made.id])).rows[0]).toMatchObject({decision_id:decision.id,window_weeks:4,evaluation_id:'eval-1',pillar_results:{p1:'resolved_true'},price_result:{alpha:0.01},judged_by:'evaluator'});
  expect(await audits('ledger.outcome',made.id)).toBe(1);
  expect(await count('research_outcomes',other.userId)).toBe(0);
 });

 it('replays judgments deterministically, filtered by source availability at as_of',async()=>{
  const thesis2=randomUUID(),late=randomUUID();
  await admin.query(`insert into public.research_theses(id,user_id,title) values($1,$2,'replay thesis')`,[thesis2,actor.userId]);
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash,ingested_at) values($1,$2,'NEWS','late','late body',$3,'2026-09-30T00:00:00Z')`,[late,actor.userId,`hash-${randomUUID()}`]);
  const early=await recordJudgment(actor,judgment({snapshot:{source_id:sourceId,source_version:'1',thesis_id:thesis2,thesis_version:'1',entity_table_version:'2026-09-25'},question_id:'Q1'}));
  const earlyQ2=await recordJudgment(actor,judgment({snapshot:{source_id:sourceId,source_version:'1',thesis_id:thesis2,thesis_version:'1',entity_table_version:'2026-09-25'},question_id:'Q2',backend:'jev',backend_model:'jev-1.13.0'}));
  const lateJ=await recordJudgment(actor,judgment({snapshot:{source_id:late,source_version:'1',thesis_id:thesis2,thesis_version:'1',entity_table_version:'2026-09-25'},question_id:'Q1'}));
  // Decision time before the late source existed: only early judgments, boundary inclusive.
  const ids=(rows:any[])=>rows.map(r=>r.id);
  expect(ids(await replayJudgments(actor,thesis2,'2026-09-25T00:00:00Z')).sort()).toEqual([early.id,earlyQ2.id].sort());
  expect(ids(await replayJudgments(actor,thesis2,'2026-09-20T00:00:00Z')).sort()).toEqual([early.id,earlyQ2.id].sort());
  expect(ids(await replayJudgments(actor,thesis2,'2026-09-19T23:59:59Z'))).toEqual([]);
  const all=await replayJudgments(actor,thesis2,'2026-10-01T00:00:00Z');
  expect(ids(all).sort()).toEqual([early.id,earlyQ2.id,lateJ.id].sort());
  // Order is by content address, not by insertion, and identical across calls.
  const key=(r:any)=>[r.snapshot_id,r.question_set_version,r.question_id,r.backend,r.backend_model,r.id].join('|');
  expect(all.map(key)).toEqual([...all].map(key).sort());
  expect(JSON.stringify(await replayJudgments(actor,thesis2,'2026-10-01T00:00:00Z'))).toBe(JSON.stringify(all));
  expect(all[0]).not.toHaveProperty('raw_text');
  expect(all.find(r=>r.id===lateJ.id)).toMatchObject({source_id:late,available_at:'2026-09-30T00:00:00.000Z',confidence:0.8,distribution:{true:0.8,false:0.2}});
  // Other theses and other owners never leak in; as_of must be a strict instant.
  expect(await replayJudgments(actor,randomUUID(),'2026-10-01T00:00:00Z')).toEqual([]);
  expect(await replayJudgments(other,thesis2,'2026-10-01T00:00:00Z')).toEqual([]);
  await expect(replayJudgments(actor,thesis2,'2026-10-01')).rejects.toThrow('invalid_schema');
  await expect(replayJudgments(actor,'thesis',  '2026-10-01T00:00:00Z')).rejects.toThrow('invalid_schema');
 });
 it('recorded-time replay excludes later judgments of an already available source, with inclusive cutoff',async()=>{
  const thesis=randomUUID();
  await admin.query("insert into public.research_theses(id,user_id,title) values($1,$2,'synthetic recorded-time replay')",[thesis,actor.userId]);
  const input=judgment({snapshot:{source_id:sourceId,source_version:'1',thesis_id:thesis,thesis_version:'1',entity_table_version:'fixture'},question_id:'EARLY'});
  const first=await recordJudgment(actor,input);
  const at=(await admin.query('select created_at from public.research_judgments where user_id=$1 and id=$2',[actor.userId,first.id])).rows[0].created_at.toISOString();
  await admin.query('select pg_sleep(0.01)'); // Only isolated DB; ensure a distinct persisted millisecond.
  const later=await recordJudgment(actor,{...input,question_id:'LATER',run_id:randomUUID()});
  const laterAt=(await admin.query('select created_at from public.research_judgments where user_id=$1 and id=$2',[actor.userId,later.id])).rows[0].created_at.toISOString();
  expect(Date.parse(laterAt)).toBeGreaterThan(Date.parse(at));
  expect((await replayJudgments(actor,thesis,at)).map(r=>r.id).sort()).toEqual([first.id,later.id].sort());
  const boundary=await replayTimestampFilteredJudgments(actor,thesis,at);
  expect(boundary.map(r=>r.id)).toEqual([first.id]);
  expect(await replayTimestampFilteredJudgments(actor,thesis,new Date(Date.parse(at)-1).toISOString())).toEqual([]);
  expect((await replayTimestampFilteredJudgments(actor,thesis,laterAt)).map(r=>r.id).sort()).toEqual([first.id,later.id].sort());
  expect(JSON.stringify(await replayTimestampFilteredJudgments(actor,thesis,at))).toBe(JSON.stringify(boundary));
  const future=randomUUID();
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash,ingested_at) values($1,$2,'NEWS','synthetic future availability','fixture',$3,clock_timestamp()+interval '1 day')`,[future,actor.userId,`hash-${randomUUID()}`]);
  const unavailable=await recordJudgment(actor,{...input,snapshot:{...input.snapshot,source_id:future},question_id:'UNAVAILABLE',run_id:randomUUID()});
  const afterFuture=(await admin.query('select created_at from public.research_judgments where user_id=$1 and id=$2',[actor.userId,unavailable.id])).rows[0].created_at.toISOString();
  expect((await replayTimestampFilteredJudgments(actor,thesis,afterFuture)).map(r=>r.id).sort()).toEqual([first.id,later.id].sort());
  // Privileged synthetic insert exposes the existing column's unconstrained stamp;
  // these rows prove SQL filtering/precision only, not valid origins or addresses.
  const tie=randomUUID(),micro=randomUUID(),microAt=at.slice(0,-1)+'500Z';
  for(const [id,q,time] of [[tie,'SYNTHETIC_TIE',at],[micro,'SYNTHETIC_MICRO',microAt]]){
   await admin.query(`insert into public.research_judgments(user_id,id,snapshot_id,snapshot,source_id,thesis_id,run_id,question_set_version,question_id,backend,backend_model,distribution,abstained,created_at)
    select user_id,$1,snapshot_id,snapshot,source_id,thesis_id,run_id,question_set_version,$2,backend,backend_model,distribution,abstained,$3::timestamptz
    from public.research_judgments where user_id=$4 and id=$5`,[id,q,time,actor.userId,first.id]);
  }
  expect((await replayTimestampFilteredJudgments(actor,thesis,at)).map(r=>r.id).sort()).toEqual([first.id,tie].sort());
  const exact=await replayTimestampFilteredJudgments(actor,thesis,microAt);
  expect(exact.find(r=>r.id===micro)?.created_at).toBe(microAt);
  expect(exact.map(r=>r.id).sort()).toEqual([first.id,tie,micro].sort());
  expect((await replayTimestampFilteredJudgments(actor,thesis,exact.find(r=>r.id===micro)!.created_at)).map(r=>r.id).sort()).toEqual([first.id,tie,micro].sort());
  expect(await replayTimestampFilteredJudgments(other,thesis,laterAt)).toEqual([]);
  await expect(replayTimestampFilteredJudgments(actor,thesis,'2026-10-06')).rejects.toThrow('invalid_schema');
 });

});
