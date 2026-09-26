import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {makeMockCtx,type MockStore} from '../test-support';
import type {ResearchCtx} from '../store';
import {closeS4Pool} from '../s4/db';
import {runFanout,type RunSummary} from './run';
import {ruleBackend} from './backends/rule';
import type {BackendResult,FanoutBackend,FanoutInput} from './backends/types';

const enabled=!!process.env.S4_TEST_STATE;
const flat=(a:number,b:number,c:number,d:number)=>({support:a,weaken:b,trigger_invalidation:c,related_insufficient:d});
const Q3={filing_or_regulator:0.1,executive_statement:0.1,third_party_data:0.1,analyst_or_media:0.6,retelling:0.05,unknown:0.05};
const Q4={completed:0.7,planned:0.1,denied:0.05,conditional:0.05,not_applicable:0.1};

/** Fake external backend: records inputs, answers every thesis; Q2 abstains for the first thesis when `escalate` is set. */
function fake(backend:'llm_deepseek'|'jev',opts:{escalate?:boolean}={}):FanoutBackend&{calls:FanoutInput[]}{
 const calls:FanoutInput[]=[];
 const fn=(async(input:FanoutInput):Promise<BackendResult>=>{
  calls.push(input);
  const answers=input.theses.flatMap((t,i)=>{
   const esc=opts.escalate&&i===0;
   return [
    {thesis_id:t.id,question_id:'Q1' as const,distribution:{true:0.9,false:0.1},selected:'true',confidence:null,abstained:false},
    esc?{thesis_id:t.id,question_id:'Q2' as const,distribution:flat(0.3,0.3,0.2,0.2),selected:null,confidence:0.1,abstained:true}
       :{thesis_id:t.id,question_id:'Q2' as const,distribution:flat(0.8,0.1,0.05,0.05),selected:'support',confidence:0.73,abstained:false},
    {thesis_id:t.id,question_id:'Q3' as const,distribution:Q3,selected:'analyst_or_media',confidence:0.52,abstained:false},
    {thesis_id:t.id,question_id:'Q4' as const,distribution:Q4,selected:'completed',confidence:0.62,abstained:false},
   ];
  });
  return {backend,backend_model:backend==='jev'?'jev-1.13.0':'deepseek-v4-flash',prompt_sha256:'a'.repeat(64),input_token_count:1000,latency_ms:5,cost_micros:backend==='jev'?45:280,answers};
 }) as FanoutBackend&{calls:FanoutInput[]};
 fn.calls=calls;return fn;
}

describe.skipIf(!enabled)('WP-A6 fan-out run against the real ledger',()=>{
 let admin:Pool,ctx:ResearchCtx,store:MockStore;
 const actor={userId:randomUUID(),kind:'agent' as const};
 const thesisA=randomUUID(),thesisB=randomUUID(),publicSrc=randomUUID(),privateSrc=randomUUID(),entity=randomUUID();
 const thesisRow=(id:string,title:string)=>({id,user_id:actor.userId,title,body:'b',company_ids:[entity],theme_ids:[],supporting_evidence_ids:[],invalidation_conditions:['券商 IT 投入连续两年下滑'],watch_metrics:['信创订单'],status:'ACTIVE',next_review_at:null,last_assessment:{},created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'});
 const sourceRow=(id:string,over:Record<string,unknown>)=>({id,user_id:actor.userId,source_type:'NEWS',title:'恒生电子完成上线',url:'https://news.example.com/'+id,author:null,published_at:null,ingested_at:new Date().toISOString(),raw_text:'恒生电子宣布已完成 UF3.0 上线。',content_hash:'hash-'+id,trust_level:'MEDIUM',entity_ids:[entity],metadata:{},event_time:null,available_at:new Date().toISOString(),source_version:'1',cluster_id:null,cluster_first:null,origin_type:null,market:'A',permission:'public',...over});
 const count=async(table:string)=>Number((await admin.query(`select count(*) n from public.${table} where user_id=$1`,[actor.userId])).rows[0].n);
 const judgments=async(where='true')=>(await admin.query(`select * from public.research_judgments where user_id=$1 and ${where}`,[actor.userId])).rows;

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  process.env.ALPHA_S4_ENABLED='1';process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
  admin=new Pool({connectionString:state.adminUrl});
  await admin.query('insert into auth.users(id,email) values($1,$2)',[actor.userId,`${actor.userId}@example.test`]);
  await admin.query("update public.profiles set role='admin' where id=$1",[actor.userId]);
  await admin.query(`insert into public.research_entities(id,user_id,type,name,aliases) values($1,$2,'COMPANY','Hundsun Technologies Inc.','["恒生电子"]')`,[entity,actor.userId]);
  for(const [id,title] of [[thesisA,'A'],[thesisB,'B']]) await admin.query(`insert into public.research_theses(id,user_id,title,body,company_ids,invalidation_conditions,watch_metrics,status) values($1,$2,$3,'b',$4,'["券商 IT 投入连续两年下滑"]','["信创订单"]','ACTIVE')`,[id,actor.userId,title,JSON.stringify([entity])]);
  for(const [id,perm,type] of [[publicSrc,'public','NEWS'],[privateSrc,'private','NOTE']]) await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash,permission) values($1,$2,$3,'t','恒生电子宣布已完成 UF3.0 上线。',$4,$5)`,[id,actor.userId,type,'hash-'+id,perm]);
  // Reads go through the Supabase-shaped mock seeded with the same rows; ledger writes go to PostgreSQL.
  ({ctx,store}=makeMockCtx({research_theses:[thesisRow(thesisA,'A'),thesisRow(thesisB,'B')],
   research_source_documents:[sourceRow(publicSrc,{}),sourceRow(privateSrc,{source_type:'NOTE',permission:'private',url:null})],
   research_entities:[{id:entity,user_id:actor.userId,type:'COMPANY',name:'Hundsun Technologies Inc.',aliases:['恒生电子'],ticker:'600570.SH',metadata:{},created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}],
   research_entity_keys:[],research_entity_securities:[]},actor.userId) as unknown as {ctx:ResearchCtx;store:MockStore});
 });
 afterAll(async()=>{await closeS4Pool();await admin?.end();});

 let first:RunSummary;const deepseek=fake('llm_deepseek'),jev=fake('jev');
 it('writes one judgment per backend × thesis × question for a public source and only rule judgments for a private one',async()=>{
  first=await runFanout({ctx,actor,backends:{rule:ruleBackend,deepseek,jev},escalate:null});
  expect(first.sources).toBe(2);expect(first.theses).toBe(2);
  // public: 3 backends × 2 theses × 4 questions = 24; private: rule only = 8.
  expect(first.judgments).toEqual({written:32,duplicate:0,conflict:0});
  expect(first.per_backend.rule.answers).toBe(16);
  expect(first.per_backend.llm_deepseek.answers).toBe(8);
  expect(first.per_backend.jev.answers).toBe(8);
  expect(first.private_sources_skipped_external).toBe(1);
  expect(deepseek.calls.map(c=>c.source.id)).toEqual([publicSrc]);
  expect(jev.calls.map(c=>c.source.id)).toEqual([publicSrc]);
  expect(await judgments(`source_id='${privateSrc}' and backend<>'rule'`)).toHaveLength(0);
  const row=(await judgments(`source_id='${publicSrc}' and backend='jev' and question_id='Q2' and thesis_id='${thesisA}'`))[0];
  expect(row).toMatchObject({question_set_version:'v1.0',backend_model:'jev-1.13.0',selected:'support',abstained:false,run_id:first.run_id});
  expect(row.snapshot).toMatchObject({source_id:publicSrc,thesis_id:thesisA,source_version:'1'});
  expect(row.snapshot.thesis_version).toMatch(/^[0-9a-f]{64}$/);
  expect(row.snapshot.entity_table_version).toMatch(/^[0-9a-f]{64}$/);
  // First phase never touches thesis events or status.
  expect(await count('research_thesis_events')).toBe(0);
  expect(store.count('research_thesis_events')).toBe(0);
  expect((await admin.query('select status from public.research_theses where user_id=$1',[actor.userId])).rows.every((r:any)=>r.status==='ACTIVE')).toBe(true);
 });
 it('records every answer with the shared response latency and gates Q2/Q4 on relevance',async()=>{
  const rows=await judgments(`source_id='${publicSrc}' and backend='jev'`);
  expect(rows.every((r:any)=>r.latency_ms===5)).toBe(true);
  // The fake answers Q1 true for every thesis, so nothing is gated here; the rule backend's own Q1 decides for it.
  const ruleRows=await judgments(`source_id='${privateSrc}' and backend='rule'`);
  const q1=ruleRows.filter((r:any)=>r.question_id==='Q1');
  for(const r of q1){const gated=ruleRows.filter((x:any)=>x.thesis_id===r.thesis_id&&['Q2','Q4'].includes(x.question_id));
   if(r.selected!=='true') expect(gated.every((x:any)=>x.abstained&&x.selected===null)).toBe(true);}
 });
 it('is idempotent and does not pay twice: a second run over the same material makes no external calls and adds no spend',async()=>{
  const ds=fake('llm_deepseek'),jv=fake('jev');
  const spentBefore=Number((await admin.query(`select coalesce(sum((detail->>'cost_micros')::bigint),0) n from public.research_audit_log where user_id=$1 and action='fanout.spend'`,[actor.userId])).rows[0].n);
  expect(spentBefore).toBe(325); // 280 deepseek + 45 jev for the one public source
  const second=await runFanout({ctx,actor,backends:{rule:ruleBackend,deepseek:ds,jev:jv},escalate:null});
  // External backends are not re-invoked for inputs they already judged, so only the rule rows are re-derived (as duplicates).
  expect(second.judgments).toEqual({written:0,duplicate:16,conflict:0});
  expect(second.per_backend.llm_deepseek.skipped).toBe(1);expect(second.per_backend.jev.skipped).toBe(1);
  expect(ds.calls).toHaveLength(0);expect(jv.calls).toHaveLength(0);
  expect(second.budget.spent_micros).toBe(325);
  expect(await count('research_judgments')).toBe(32);
 });
 it('escalates a jev Q2 abstention with a confident Q1 through the explanation LLM, still without state change',async()=>{
  const src=randomUUID();const fresh=new Date(Date.now()+1).toISOString();const sinceIso=fresh;
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,'NEWS','t2','恒生电子中标。',$3)`,[src,actor.userId,'hash-'+src]);
  store.seed('research_source_documents',[sourceRow(src,{raw_text:'恒生电子中标。',ingested_at:fresh,available_at:fresh})]);
  const explain=async()=>({content:'材料相关但作用方向不明。',model:'deepseek-v4-flash'});
  const s=await runFanout({ctx,actor,backends:{rule:ruleBackend,deepseek:fake('llm_deepseek'),jev:fake('jev',{escalate:true})},escalate:explain,sinceIso});
  expect(s.sources).toBe(1);
  expect(s.per_backend.jev_escalated.answers).toBe(1);
  const esc=await judgments(`backend='jev_escalated'`);
  expect(esc).toHaveLength(1);
  expect(esc[0]).toMatchObject({question_id:'Q2',thesis_id:thesisA,source_id:src,selected:null,abstained:true,backend_model:'deepseek-v4-flash'});
  expect(esc[0].distribution).toEqual({explanation:'材料相关但作用方向不明。'});
  expect(Number(esc[0].cost_micros)).toBeGreaterThan(0); // escalation is a paid call and is metered
  expect(s.per_backend.jev_escalated.cost_micros).toBe(Number(esc[0].cost_micros));
  expect(await count('research_thesis_events')).toBe(0);
 });
 it('never escalates once the budget is exhausted by the backend calls of the same run',async()=>{
  const src=randomUUID();const fresh=new Date(Date.now()+1).toISOString();const sinceIso=fresh;
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,'NEWS','t4','恒生电子扩大合作。',$3)`,[src,actor.userId,'hash-'+src]);
  store.seed('research_source_documents',[sourceRow(src,{raw_text:'恒生电子扩大合作。',ingested_at:fresh,available_at:fresh})]);
  let explained=0;const explain=async()=>{explained++;return {content:'x',model:'m'};};
  const spent=Number((await admin.query(`select coalesce(sum((detail->>'cost_micros')::bigint),0) n from public.research_audit_log where user_id=$1 and action='fanout.spend'`,[actor.userId])).rows[0].n);
  // Limit leaves room for exactly the two backend calls (325) but nothing for an escalation.
  const s=await runFanout({ctx,actor,backends:{rule:ruleBackend,deepseek:fake('llm_deepseek'),jev:fake('jev',{escalate:true})},escalate:explain,sinceIso,budget:{daily_budget_micros:spent+325,jev_micros_per_1k:45,deepseek_micros_per_1k:280}});
  expect(explained).toBe(0);
  expect(s.per_backend.jev_escalated.answers).toBe(0);
  expect(s.per_backend.jev_escalated.skipped).toBeGreaterThanOrEqual(1);
 });
 it('stops the external backends when the daily budget is spent and records the stop',async()=>{
  const src=randomUUID();const fresh=new Date(Date.now()+1).toISOString();const sinceIso=fresh;
  await admin.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash) values($1,$2,'NEWS','t3','恒生电子签约。',$3)`,[src,actor.userId,'hash-'+src]);
  store.seed('research_source_documents',[sourceRow(src,{raw_text:'恒生电子签约。',ingested_at:fresh,available_at:fresh})]);
  const ds=fake('llm_deepseek'),jv=fake('jev');
  const s=await runFanout({ctx,actor,backends:{rule:ruleBackend,deepseek:ds,jev:jv},escalate:null,budget:{daily_budget_micros:100,jev_micros_per_1k:45,deepseek_micros_per_1k:280},sinceIso});
  expect(s.budget.stopped).toBe(true);
  expect(s.budget.spent_micros).toBeGreaterThanOrEqual(100);
  expect(ds.calls).toHaveLength(0);expect(jv.calls).toHaveLength(0);
  expect(s.per_backend.rule.answers).toBe(8);
  expect(await judgments(`source_id='${src}'`)).toHaveLength(8);
  expect(Number((await admin.query(`select count(*) n from public.research_audit_log where user_id=$1 and action='fanout.budget_stop'`,[actor.userId])).rows[0].n)).toBeGreaterThanOrEqual(1);
 });

 it('keeps running when a backend changes its answer for an already-recorded address, counting and auditing the conflict',async()=>{
  // A new thesis makes every source "not fully judged" again, so jev is re-invoked; the abstaining fake now disagrees with the stored Q2 for thesis A on the first public source.
  const thesisC=randomUUID();
  await admin.query(`insert into public.research_theses(id,user_id,title,body,company_ids,invalidation_conditions,watch_metrics,status) values($1,$2,'C','b',$3,'["券商 IT 投入连续两年下滑"]','["信创订单"]','ACTIVE')`,[thesisC,actor.userId,JSON.stringify([entity])]);
  store.seed('research_theses',[thesisRow(thesisC,'C')]);
  const s=await runFanout({ctx,actor,backends:{rule:ruleBackend,deepseek:fake('llm_deepseek'),jev:fake('jev',{escalate:true})},escalate:null,sinceIso:'2000-01-01T00:00:00Z'});
  expect(s.theses).toBe(3);
  expect(s.judgments.conflict).toBe(1);
  expect(Number((await admin.query(`select count(*) n from public.research_audit_log where user_id=$1 and action='fanout.judgment_conflict'`,[actor.userId])).rows[0].n)).toBe(1);
 });
});
