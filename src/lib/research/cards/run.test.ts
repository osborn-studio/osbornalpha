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
const axioms=AXIOM_SEEDS.map((a,i)=>({id:`ax${i}`,user_id:owner,code:a.code,title:a.title,description:a.description,severity:a.severity,active:true,created_at:at(-90)})); // research_axioms uses `active`
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
 it('seeds the card axioms when an older installation lacks them, and fails closed when AX006 is disabled',async()=>{
  const t1=thesis(1),s1=src(1);
  const rows=judge(s1,t1,'support');
  const advice=async()=>({content:JSON.stringify({title:'卡',fields:{change_and_timing:[{text:'建议买入',source_ids:[s1.id]}]}}),model:'x'});
  // No research_axioms rows at all (pre-A8 database): the runner backfills the seeds before generating.
  const fresh=makeMockCtx({research_theses:[t1],research_source_documents:[s1]}) as unknown as {ctx:ResearchCtx;store:any};
  const out=await runCards(fresh.ctx,{userId:owner,kind:'agent'},{weekOf:'2026-09-21',llm:advice,loadLedger:async()=>rows});
  expect(out.blocked).toBeGreaterThan(0);
  expect(fresh.store.rows('research_axioms').map((a:any)=>a.code)).toEqual(expect.arrayContaining(['AX005','AX006']));
  // AX006 deliberately disabled: never generate advice-unchecked cards.
  const disabled=makeMockCtx({research_theses:[t1],research_source_documents:[s1],research_axioms:axioms.map(a=>a.code==='AX006'?{...a,active:false}:a)}) as unknown as {ctx:ResearchCtx;store:any};
  await expect(runCards(disabled.ctx,{userId:owner,kind:'agent'},{weekOf:'2026-09-21',llm:advice,loadLedger:async()=>rows})).rejects.toThrow(/AX006/);
  expect(disabled.store.rows('research_cards')).toHaveLength(0);
 });
 it('honours the weekly limits across repeated runs: ≤4 evidence and ≤1 counter card per week including persisted cards',async()=>{
  const theses=Array.from({length:6},(_,i)=>thesis(i));
  const sources=theses.map((_,i)=>src(i,{url:`https://s${i}.example.com/a`}));
  const existing=theses.slice(0,3).map(t=>({id:randomUUID(),week_of:'2026-09-21',thesis_id:t.id,kind:'evidence',title:'old',fields:{},assertions:[],evidence:{},generation:{},axiom_results:[],status:'generated',created_at:at(3)}));
  existing.push({...existing[0],id:randomUUID(),kind:'counter'});
  const {ctx,store}=makeMockCtx({research_theses:theses,research_source_documents:sources,research_axioms:axioms,research_cards:existing}) as unknown as {ctx:ResearchCtx;store:any};
  // New judgments make theses 3,4,5 eligible (and give thesis 4 counter-evidence).
  const rows=[...judge(sources[3],theses[3],'support'),...judge(sources[4],theses[4],'weaken'),...judge(sources[5],theses[5],'support'),...judge(sources[0],theses[0],'support')];
  const llm=async({user}:{system:string;user:string})=>{const sid=sources.find(s=>user.includes(s.id))!.id;return {content:JSON.stringify(draft('卡',sid)),model:'fake'};};
  const out=await runCards(ctx,{userId:owner,kind:'agent'},{weekOf:'2026-09-21',llm,loadLedger:async()=>rows});
  // 3 evidence cards already exist → one slot left; a counter card already exists → none.
  expect(out).toMatchObject({written:1,skipped_existing:1,skipped_limit:expect.any(Number)});
  expect(out.skipped_limit).toBeGreaterThanOrEqual(1);
  const cards=store.rows('research_cards');
  expect(cards.filter((c:any)=>c.kind==='evidence')).toHaveLength(4);
  expect(cards.filter((c:any)=>c.kind==='counter')).toHaveLength(1);
 });
});
