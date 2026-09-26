import {describe,expect,it} from 'vitest';
import {createDeepseekBackend,buildFanoutPrompt} from './backends/deepseek';
import type {FanoutInput} from './backends/types';
import type {LlmFn} from '../memos';
import type {SourceDocument,Thesis} from '../types';

const T1='11111111-1111-4111-8111-111111111111',T2='33333333-3333-4333-8333-333333333333';
const thesis=(id:string,title:string):Thesis=>({id,title,body:'b',company_ids:[],theme_ids:[],supporting_evidence_ids:[],invalidation_conditions:['条件A'],watch_metrics:['指标B'],status:'ACTIVE',created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'});
const source=(raw='恒生电子宣布完成上线。'.repeat(3)):SourceDocument=>({id:'22222222-2222-4222-8222-222222222222',source_type:'NEWS',title:'t',url:'https://news.example.com/a',author:null,published_at:null,ingested_at:'2026-09-20T00:00:00Z',raw_text:raw,content_hash:'h',trust_level:'MEDIUM',entity_ids:[],metadata:{},event_time:null,available_at:'2026-09-20T00:00:00Z',source_version:'1',cluster_id:null,cluster_first:null,origin_type:null,market:'A',permission:'public'});
const input=(s=source()):FanoutInput=>({source:s,theses:[thesis(T1,'A'),thesis(T2,'B')],aliases:new Map(),askQ5:false});
const good={Q3:{filing_or_regulator:0.1,executive_statement:0.1,third_party_data:0.1,analyst_or_media:0.6,retelling:0.05,unknown:0.05},
 theses:{[T1]:{Q1:{true:0.9,false:0.1},Q2:{support:0.8,weaken:0.1,trigger_invalidation:0.05,related_insufficient:0.05},Q4:{completed:0.7,planned:0.1,denied:0.05,conditional:0.05,not_applicable:0.1}},
  [T2]:{Q1:{true:0.1,false:0.9},Q2:{support:0.25,weaken:0.25,trigger_invalidation:0.25,related_insufficient:0.25},Q4:{completed:0.2,planned:0.2,denied:0.2,conditional:0.2,not_applicable:0.2}}}};
const llmWith=(content:string,model='deepseek-v4-flash'):LlmFn=>async()=>({content,model});

describe('deepseek backend',()=>{
 it('maps a valid JSON distribution set to Q1/Q2/Q4 per thesis plus one material-level Q3',async()=>{
  const r=await createDeepseekBackend({llm:llmWith(JSON.stringify(good)),microsPer1kTokens:280})(input());
  expect(r).toMatchObject({backend:'llm_deepseek',backend_model:'deepseek-v4-flash'});
  expect(r.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(r.answers.map(a=>`${a.thesis_id.slice(0,1)}${a.question_id}`).sort()).toEqual(['1Q1','1Q2','1Q3','1Q4','3Q1','3Q2','3Q3','3Q4']);
  const a=(t:string,q:string)=>r.answers.find(x=>x.thesis_id===t&&x.question_id===q)!;
  expect(a(T1,'Q1')).toMatchObject({selected:'true',abstained:false});
  expect(a(T1,'Q2')).toMatchObject({selected:'support',abstained:false});
  expect(a(T2,'Q2')).toMatchObject({selected:null,abstained:true});        // flat → low confidence
  expect(a(T2,'Q4')).toMatchObject({selected:'not_applicable',abstained:false});
  expect(a(T1,'Q3').distribution).toEqual(good.Q3);
  expect(a(T2,'Q3').distribution).toEqual(good.Q3);
  expect(r.cost_micros).toBeGreaterThan(0);
  expect(r.input_token_count).toBeGreaterThan(0);
 });
 it('abstains per question on missing theses, bad keys, or probabilities that do not sum to one',async()=>{
  const bad={Q3:good.Q3,theses:{[T1]:{Q1:{yes:1},Q2:{support:0.9,weaken:0.4,trigger_invalidation:0,related_insufficient:0},Q4:good.theses[T1].Q4}}};
  const r=await createDeepseekBackend({llm:llmWith(JSON.stringify(bad))})(input());
  const a=(t:string,q:string)=>r.answers.find(x=>x.thesis_id===t&&x.question_id===q)!;
  expect(a(T1,'Q1')).toMatchObject({abstained:true,distribution:{},selected:null});
  expect(a(T1,'Q2')).toMatchObject({abstained:true,distribution:{}});
  expect(a(T1,'Q4')).toMatchObject({selected:'completed'});
  for(const q of ['Q1','Q2','Q4']) expect(a(T2,q)).toMatchObject({abstained:true,distribution:{}});
  expect(r.skipped).toBeUndefined();
 });
 it('treats non-JSON output as a full abstention and an LLM failure as a skipped backend',async()=>{
  const r=await createDeepseekBackend({llm:llmWith('抱歉，我无法回答。')})(input());
  expect(r.answers).toHaveLength(8);
  expect(r.answers.every(a=>a.abstained&&a.selected===null)).toBe(true);
  const failed=await createDeepseekBackend({llm:async()=>{throw new Error('llm 502: upstream');}})(input());
  expect(failed).toMatchObject({skipped:'error',answers:[]});
  expect(failed.error).toMatch(/502/);
 });
 it('builds a prompt that names every thesis id, truncates long material, and hashes stably',()=>{
  const long=source('字'.repeat(20000));
  const p1=buildFanoutPrompt(input(long)),p2=buildFanoutPrompt(input(long));
  expect(p1.user).toContain(T1);expect(p1.user).toContain(T2);
  expect(p1.user).toMatch(/截断/);
  expect(p1.user.length).toBeLessThan(15000);
  expect(p1.prompt_sha256).toBe(p2.prompt_sha256);
  expect(buildFanoutPrompt(input()).prompt_sha256).not.toBe(p1.prompt_sha256);
  expect(p1.system).toMatch(/JSON/);
  expect(p1.system).not.toMatch(/买入|卖出|建议/);
  const withBaseline=buildFanoutPrompt({...input(),askQ5:true,baseline:{source_id:'b1',title:'earliest',text:'最早材料正文'}});
  expect(withBaseline.user).toContain('最早材料正文');
  expect(withBaseline.user).toMatch(/Q5/);
 });
 it('lists WP-A7 pillars and opportunity type in the prompt when present',()=>{
  const modern={...input(),theses:[{...thesis(T1,'A'),opportunity_type:'C' as const,pillars:[{id:'p1',text:'支柱甲',resolvable_by:'季报',deadline:null}]}]};
  const {user}=buildFanoutPrompt(modern);
  expect(user).toContain('机会类型: C');
  expect(user).toContain('支柱: 支柱甲');
  expect(buildFanoutPrompt(input()).user).not.toContain('支柱:');
 });
});
