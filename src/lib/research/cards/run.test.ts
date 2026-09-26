import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {makeMockCtx} from '../test-support';
import type {ResearchCtx} from '../store';
import {AXIOM_SEEDS} from '../seed';
import {runCards,weekOfMonday} from './run';
import type {LedgerRow} from './evidence';

const owner='00000000-0000-4000-8000-000000000001';
const at=(d:number)=>new Date(Date.UTC(2026,8,21+d,9)).toISOString();
const src=(i:number,over:Record<string,unknown>={})=>({id:randomUUID(),source_type:'NEWS',title:`材料 ${i}`,url:`https://site${i}.example.com/a`,author:null,published_at:null,ingested_at:at(1),available_at:at(1),raw_text:`正文 ${i}`,content_hash:'h'+i,trust_level:'MEDIUM',entity_ids:[],metadata:{},permission:'public',cluster_id:null,cluster_first:null,source_version:'1',...over});
const thesis=(i:number)=>({id:randomUUID(),title:`thesis ${i}`,body:'b',company_ids:[],theme_ids:[],supporting_evidence_ids:[],invalidation_conditions:['k'],watch_metrics:['m'],status:'ACTIVE',created_at:at(-30),updated_at:at(-30)});
let n=0;
const judge=(s:any,t:any,dir='support',extra:Partial<LedgerRow>[]=[]):LedgerRow[]=>[
 {id:`j${++n}`,source_id:s.id,thesis_id:t.id,question_id:'Q1',backend:'rule',selected:'true',abstained:false},
 {id:`j${++n}`,source_id:s.id,thesis_id:t.id,question_id:'Q2',backend:'rule',selected:dir,abstained:false},
 ...extra.map(e=>({id:`j${++n}`,source_id:s.id,thesis_id:t.id,backend:'rule',abstained:false,question_id:'Q3',selected:'filing_or_regulator',...e}))];
const axioms=AXIOM_SEEDS.map((a,i)=>({id:`ax${i}`,user_id:owner,code:a.code,title:a.title,description:a.description,severity:a.severity,enabled:true,created_at:at(-90)}));
const draft=(title:string,sid:string)=>({title,fields:{change_and_timing:[{text:'变化',source_ids:[sid]}],next_fact_to_verify:[{text:'核实',source_ids:[sid]}]}});

describe('weekOfMonday',()=>{
 it('returns the UTC Monday of the given instant',()=>{
  expect(weekOfMonday(new Date('2026-09-25T10:00:00Z'))).toBe('2026-09-21'); // Friday
  expect(weekOfMonday(new Date('2026-09-27T23:00:00Z'))).toBe('2026-09-21'); // Sunday
  expect(weekOfMonday(new Date('2026-09-21T00:00:00Z'))).toBe('2026-09-21');
 });
});

describe('runCards',()=>{
 it('writes ≤5 cards from the week\'s ledger, links assertions to source@version, audits, and is idempotent',async()=>{
  const t1=thesis(1),t2=thesis(2),s1=src(1),s2=src(2),s3=src(3,{permission:'private'}),old=src(9,{available_at:at(-20),url:'https://site1.example.com/old'});
  const {ctx,store}=makeMockCtx({research_theses:[t1,t2],research_source_documents:[s1,s2,s3,old],research_axioms:axioms}) as unknown as {ctx:ResearchCtx;store:any};
  const rows=[...judge(s1,t1,'support'),...judge(s2,t1,'weaken'),...judge(s2,t2,'support'),...judge(s3,t2,'support')];
  const calls:string[]=[];
  const llm=async({user}:{system:string;user:string})=>{calls.push(user);const sid=user.includes(s1.id)?s1.id:s2.id;return {content:JSON.stringify(draft('卡',sid)),model:'fake'};};
  const out=await runCards(ctx,{userId:owner,kind:'agent'},{weekOf:'2026-09-21',llm,loadLedger:async()=>rows});
  expect(out).toMatchObject({week_of:'2026-09-21',theses_with_evidence:2,excluded_private:1,counter_card:'counter_evidence',written:3,blocked:0,skipped_existing:0});
  const cards=store.rows('research_cards');
  expect(cards.map((c:any)=>`${c.kind}:${c.thesis_id===t1.id?'t1':'t2'}`).sort()).toEqual(['counter:t1','evidence:t1','evidence:t2']);
  const t1card=cards.find((c:any)=>c.kind==='evidence'&&c.thesis_id===t1.id);
  expect(t1card.assertions[0]).toMatchObject({source_version:'1',field:'change_and_timing'});
  expect(t1card.assertions[0].judgment_ids.length).toBeGreaterThan(0);
  // Private source text never reached the model.
  expect(calls.join('\n')).not.toContain(s3.id);
  expect(store.rows('research_audit_log').filter((a:any)=>a.action==='cards.run')).toHaveLength(1);
  expect(store.rows('research_audit_log').filter((a:any)=>a.action==='card.generate')).toHaveLength(3);
  const again=await runCards(ctx,{userId:owner,kind:'agent'},{weekOf:'2026-09-21',llm,loadLedger:async()=>rows});
  expect(again).toMatchObject({written:0,skipped_existing:3});
  expect(store.rows('research_cards')).toHaveLength(3);
 });
 it('dry-run selects but neither calls the model nor writes; blocked cards are stored as blocked',async()=>{
  const t1=thesis(1),s1=src(1);
  const {ctx,store}=makeMockCtx({research_theses:[t1],research_source_documents:[s1],research_axioms:axioms}) as unknown as {ctx:ResearchCtx;store:any};
  const rows=judge(s1,t1,'support');
  let called=0;
  const dry=await runCards(ctx,{userId:owner,kind:'agent'},{weekOf:'2026-09-21',llm:async()=>{called++;return {content:'{}',model:'x'};},loadLedger:async()=>rows,dryRun:true});
  // One thesis, host never seen before → evidence card + unfamiliar-source counter card.
  expect(dry).toMatchObject({selected:2,counter_card:'unfamiliar_source',written:0});expect(called).toBe(0);expect(store.rows('research_cards')).toHaveLength(0);
  const bad=await runCards(ctx,{userId:owner,kind:'agent'},{weekOf:'2026-09-21',llm:async()=>({content:JSON.stringify({title:'卡',fields:{change_and_timing:[{text:'建议买入',source_ids:[s1.id]}]}}),model:'x'}),loadLedger:async()=>rows});
  expect(bad).toMatchObject({written:2,blocked:2});
  expect(store.rows('research_cards').every((c:any)=>c.status==='blocked')).toBe(true);
 });
 it('returns an empty summary when the ledger has nothing relevant',async()=>{
  const {ctx}=makeMockCtx({research_axioms:axioms}) as unknown as {ctx:ResearchCtx};
  const out=await runCards(ctx,{userId:owner,kind:'agent'},{weekOf:'2026-09-21',llm:async()=>({content:'{}',model:'x'}),loadLedger:async()=>[]});
  expect(out).toMatchObject({theses_with_evidence:0,selected:0,written:0,counter_card:'none'});
 });
});
