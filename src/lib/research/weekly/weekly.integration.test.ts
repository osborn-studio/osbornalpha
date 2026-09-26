import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {closeS4Pool} from '../s4/db';
import {recordJudgment} from '../s4/ledger';
import type {ResearchCard} from '../types';
import {decideCard,freezeBaseline,recordCardExposure,revealCards,thesisObservations,weeklyStatus} from './weekly';
import {loadArmRows} from '../s6/arm-report-db';
import {summarizeArms} from '../s6/arm-report';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('WP-A9 weekend flow on real PostgreSQL',()=>{
 let admin:Pool;const actor={userId:randomUUID(),kind:'human' as const},other={userId:randomUUID(),kind:'human' as const};
 const WEEK='2026-09-21';let t1:string,t2:string,sourceId:string,judgmentId:string;
 const cards:ResearchCard[]=[];
 const readCards=async(weekOf:string)=>cards.filter(c=>c.week_of===weekOf);
 const card=(thesis:string,kind:'evidence'|'counter',judgments:string[]):ResearchCard=>({id:randomUUID(),week_of:WEEK,thesis_id:thesis,kind,title:`${kind} card`,fields:{} as any,assertions:[{id:'a1',field:'change_and_timing',text:'x',source_id:sourceId,source_version:'1',judgment_ids:judgments}],
  evidence:{support:1,counter:0,independent_sources:1,uncertainty:'',excluded_private:0,unfamiliar_hosts:[]},generation:{model:'fake',prompt_sha256:'0'.repeat(64),run_id:'r',generated_at:'2026-09-25T00:00:00Z',unsupported_dropped:0},axiom_results:[],status:'generated',created_at:'2026-09-25T00:00:00Z'});
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  admin=new Pool({connectionString:state.adminUrl});
  for(const a of [actor,other]){await admin.query('insert into auth.users(id,email) values($1,$2)',[a.userId,`${a.userId}@example.test`]);await admin.query("update public.profiles set role='admin' where id=$1",[a.userId]);}
  t1=randomUUID();t2=randomUUID();sourceId=randomUUID();
  for(const [id,title] of [[t1,'thesis one'],[t2,'thesis two']])await admin.query(`insert into public.research_theses(id,user_id,title,body,invalidation_conditions,watch_metrics,status) values($1,$2,$3,'b','["k"]','["m"]','ACTIVE')`,[id,actor.userId,title]);
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,'NEWS','t','b',$3)`,[sourceId,actor.userId,'h-'+sourceId]);
  judgmentId=(await recordJudgment(actor,{snapshot:{source_id:sourceId,source_version:'1',thesis_id:t1,thesis_version:'v',entity_table_version:'e'},run_id:randomUUID(),question_set_version:'v1.0',question_id:'Q1',backend:'rule',backend_model:'m',distribution:{true:0.9,false:0.1},selected:'true',confidence:0.9,abstained:false,latency_ms:1,cost_micros:0})).id;
  cards.push(card(t1,'evidence',[judgmentId,randomUUID()]),card(t1,'counter',[]),card(t2,'evidence',[]));
 });
 afterAll(async()=>{await closeS4Pool();await admin?.end();});

 it('hides cards until the thesis baseline is frozen, then reveals them and records ai_candidate once',async()=>{
  const before=await weeklyStatus({actor,readCards,weekOf:WEEK});
  expect(before.all_unlocked).toBe(false);expect(before.locked_theses.sort()).toEqual([t1,t2].sort());
  expect(before.theses.every(t=>t.cards===null)).toBe(true);
  expect(before.theses.find(t=>t.thesis_id===t1)!.card_count).toBe(2);
  await expect(revealCards({actor,readCards,weekOf:WEEK})).resolves.toMatchObject({cards:[],ai_candidate_recorded:0});
  await expect(decideCard({actor,readCards,weekOf:WEEK,card_id:cards[0].id,action:'adopt',reason:'r',time_spent_minutes:3})).rejects.toThrow('policy_blocked');
  await expect(freezeBaseline({actor,weekOf:WEEK,thesis_id:t1,action:'shadow',reason:'not yet'})).resolves.toMatchObject({arm:'human_baseline'});
  await expect(freezeBaseline({actor,weekOf:WEEK,thesis_id:t1,action:'adopt',reason:'again'})).rejects.toThrow('idempotency_conflict');
  await expect(freezeBaseline({actor,weekOf:WEEK,thesis_id:randomUUID(),action:'adopt',reason:'x'})).rejects.toThrow('scope_denied');
  await expect(freezeBaseline({actor,weekOf:'2026-9-21',thesis_id:t1,action:'adopt',reason:'x'})).rejects.toThrow('invalid_schema');
  // Frozen but not yet revealed: cards stay hidden and cannot be decided, so the AI stance is always recorded first.
  const frozen=await weeklyStatus({actor,readCards,weekOf:WEEK});
  expect(frozen.theses.find(t=>t.thesis_id===t1)!.cards).toBeNull();expect(frozen.theses.find(t=>t.thesis_id===t1)!.revealed).toBe(false);
  await expect(decideCard({actor,readCards,weekOf:WEEK,card_id:cards[0].id,action:'adopt',reason:'r',time_spent_minutes:3})).rejects.toThrow('policy_blocked');
  const revealed=await revealCards({actor,readCards,weekOf:WEEK});
  expect(revealed.cards.map(c=>c.thesis_id)).toEqual([t1,t1]);expect(revealed.ai_candidate_recorded).toBe(2);
  expect((await revealCards({actor,readCards,weekOf:WEEK})).ai_candidate_recorded).toBe(0);
  const ai=(await admin.query("select card_id,action,cited_judgment_ids from public.research_decisions where user_id=$1 and arm='ai_candidate' order by card_id",[actor.userId])).rows;
  expect(ai).toHaveLength(2);
  expect(ai.find((r:any)=>r.card_id===cards[0].id)).toMatchObject({action:'adopt',cited_judgment_ids:[judgmentId]}); // unknown judgment ids are dropped, existing ones cited
  expect(ai.find((r:any)=>r.card_id===cards[1].id)).toMatchObject({action:'reject'});
  const mid=await weeklyStatus({actor,readCards,weekOf:WEEK});
  const one=mid.theses.find(t=>t.thesis_id===t1)!;expect(one.cards).toHaveLength(2);expect(one.revealed).toBe(true);expect(one.baseline).toMatchObject({action:'shadow'});
  expect(mid.theses.find(t=>t.thesis_id===t2)!.cards).toBeNull();expect(mid.all_unlocked).toBe(false);
 });
 it('records one collab decision per card with citations, timing and an optional owned observation',async()=>{
  const first=await decideCard({actor,readCards,weekOf:WEEK,card_id:cards[0].id,action:'adopt',reason:'convincing',time_spent_minutes:4});
  expect(first).toMatchObject({arm:'collab'});
  await expect(decideCard({actor,readCards,weekOf:WEEK,card_id:cards[0].id,action:'reject',reason:'changed my mind',time_spent_minutes:1})).rejects.toThrow('idempotency_conflict');
  await expect(decideCard({actor,readCards,weekOf:WEEK,card_id:randomUUID(),action:'adopt',reason:'r',time_spent_minutes:1})).rejects.toThrow('scope_denied');
  await expect(decideCard({actor,readCards,weekOf:WEEK,card_id:cards[2].id,action:'adopt',reason:'r',time_spent_minutes:1})).rejects.toThrow('policy_blocked'); // thesis two has no baseline
  await expect(decideCard({actor,readCards,weekOf:WEEK,card_id:cards[1].id,action:'buy' as any,reason:'r',time_spent_minutes:1})).rejects.toThrow('invalid_schema');
  await expect(decideCard({actor,readCards,weekOf:WEEK,card_id:cards[1].id,action:'reject',reason:'r',time_spent_minutes:1,observation_id:randomUUID()})).rejects.toThrow('scope_denied');
  const row=(await admin.query("select action,reason,card_id,cited_judgment_ids,time_spent_minutes,observation_id from public.research_decisions where user_id=$1 and arm='collab'",[actor.userId])).rows;
  expect(row).toHaveLength(1);expect(row[0]).toMatchObject({action:'adopt',reason:'convincing',card_id:cards[0].id,cited_judgment_ids:[judgmentId],time_spent_minutes:4,observation_id:null});
  const status=await weeklyStatus({actor,readCards,weekOf:WEEK});
  expect(status.theses.find(t=>t.thesis_id===t1)!.collab_by_card[cards[0].id]).toMatchObject({action:'adopt'});
  const report=summarizeArms(await loadArmRows(actor,{since:WEEK}));
  expect(report.arms.human_baseline.decisions).toBe(1);expect(report.arms.ai_candidate.decisions).toBe(2);expect(report.arms.collab.decisions).toBe(1);
  expect(await thesisObservations({actor,thesis_id:t1})).toEqual([]);
  // Another owner sees no decisions, so every thesis with cards stays locked (the card reader itself is owner-scoped in production).
  const theirs=await weeklyStatus({actor:other,readCards,weekOf:WEEK});
  expect(theirs.all_unlocked).toBe(false);expect(theirs.theses.every(t=>t.cards===null&&t.baseline===null)).toBe(true);
 });
 it('refuses a baseline for a thesis whose cards were already exposed through another read path',async()=>{
  const t3=randomUUID();await admin.query(`insert into public.research_theses(id,user_id,title,body,invalidation_conditions,watch_metrics,status) values($1,$2,'thesis three','b','["k"]','["m"]','ACTIVE')`,[t3,actor.userId]);
  const c3=card(t3,'evidence',[]);cards.push(c3);
  await recordCardExposure({actor,cards:[c3],origin:'cards_page'});
  await expect(freezeBaseline({actor,weekOf:WEEK,thesis_id:t3,action:'adopt',reason:'saw it already'})).rejects.toThrow('exposure_required');
  const audit=(await admin.query("select detail from public.research_audit_log where user_id=$1 and action='weekly.cards_exposed' and detail->>'thesis_id'=$2",[actor.userId,t3])).rows;
  expect(audit).toHaveLength(1);expect(audit[0].detail).toMatchObject({week_of:WEEK,thesis_id:t3,origin:'cards_page'});
  await recordCardExposure({actor,cards:[c3],origin:'cards_page'}); // exposure is recorded once per thesis-week
  expect((await admin.query("select count(*)::int n from public.research_audit_log where user_id=$1 and action='weekly.cards_exposed' and detail->>'thesis_id'=$2",[actor.userId,t3])).rows[0].n).toBe(1);
  // Exposure of a different week/thesis does not block this one.
  expect((await weeklyStatus({actor,readCards,weekOf:WEEK})).theses.find(t=>t.thesis_id===t3)!.exposed_before_baseline).toBe(true);
 });
 it('serializes concurrent freezes and decisions so the append-only ledger never gets duplicates',async()=>{
  const t4=randomUUID();await admin.query(`insert into public.research_theses(id,user_id,title,body,invalidation_conditions,watch_metrics,status) values($1,$2,'thesis four','b','["k"]','["m"]','ACTIVE')`,[t4,actor.userId]);
  const c4=card(t4,'evidence',[]);cards.push(c4);
  const freezes=await Promise.allSettled([1,2,3].map(()=>freezeBaseline({actor,weekOf:WEEK,thesis_id:t4,action:'adopt',reason:'race'})));
  expect(freezes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(freezes.filter(r=>r.status==='rejected'&&/idempotency_conflict/.test(String((r as PromiseRejectedResult).reason)))).toHaveLength(2);
  const reveals=await Promise.all([1,2].map(()=>revealCards({actor,readCards,weekOf:WEEK})));
  expect(reveals.reduce((n,r)=>n+r.ai_candidate_recorded,0)).toBe(1);
  const decides=await Promise.allSettled([1,2].map(()=>decideCard({actor,readCards,weekOf:WEEK,card_id:c4.id,action:'adopt',reason:'race',time_spent_minutes:1})));
  expect(decides.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const counts=(await admin.query("select arm,count(*)::int n from public.research_decisions where user_id=$1 and thesis_id=$2 group by arm order by arm",[actor.userId,t4])).rows;
  expect(counts).toEqual([{arm:'ai_candidate',n:1},{arm:'collab',n:1},{arm:'human_baseline',n:1}]);
 });
 it('ships the analyst identity map with owner RLS and replays',async()=>{
  await expect(admin.query(readFileSync('supabase/migrations/20260926140000_research_analyst_identities.sql','utf8'))).resolves.toBeDefined();
  await admin.query("insert into public.research_analyst_identities(user_id,channel,external_id,analyst_id) values($1,'feishu','ou_123',$2)",[actor.userId,randomUUID()]);
  await expect(admin.query("insert into public.research_analyst_identities(user_id,channel,external_id,analyst_id) values($1,'feishu','ou_123',$2)",[actor.userId,randomUUID()])).rejects.toThrow(/duplicate key/);
  await expect(admin.query("insert into public.research_analyst_identities(user_id,channel,external_id,analyst_id) values($1,'Bad Channel','x',$2)",[actor.userId,randomUUID()])).rejects.toThrow(/check constraint/);
  const policies=(await admin.query("select policyname from pg_policies where tablename='research_analyst_identities'")).rows.map((p:any)=>p.policyname).sort();
  expect(policies).toEqual(['research_analyst_identities self delete','research_analyst_identities self insert','research_analyst_identities self select']);
 });
});
