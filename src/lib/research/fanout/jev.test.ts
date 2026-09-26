import {describe,expect,it,vi} from 'vitest';
import {JEV_MODEL,JEV_URL,buildJevRequest,createJevBackend} from './backends/jev';
import type {FanoutInput} from './backends/types';
import type {SourceDocument,Thesis} from '../types';

const T1='11111111-1111-4111-8111-111111111111',T2='33333333-3333-4333-8333-333333333333';
const thesis=(id:string):Thesis=>({id,title:'t'+id.slice(0,1),body:'b',company_ids:[],theme_ids:[],supporting_evidence_ids:[],invalidation_conditions:['条件A'],watch_metrics:['指标B'],status:'ACTIVE',created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'});
const source=(over:Partial<SourceDocument>={}):SourceDocument=>({id:'22222222-2222-4222-8222-222222222222',source_type:'NEWS',title:'t',url:'https://news.example.com/a',author:null,published_at:null,ingested_at:'2026-09-20T00:00:00Z',raw_text:'恒生电子宣布完成上线。',content_hash:'h',trust_level:'MEDIUM',entity_ids:[],metadata:{},event_time:null,available_at:'2026-09-20T00:00:00Z',source_version:'1',cluster_id:null,cluster_first:null,origin_type:null,market:'A',permission:'public',...over});
const input=(s=source()):FanoutInput=>({source:s,theses:[thesis(T1),thesis(T2)],aliases:new Map(),askQ5:false});
const fixture={model:'jev-1.13.0',answers:{
 t0_Q1:{type:'noul',noul:0.92},t0_Q2:{type:'choice',choice:'support',probabilities:{support:0.7,weaken:0.1,trigger_invalidation:0.1,related_insufficient:0.1},confidence:0.62},
 t0_Q4:{type:'choice',choice:'completed',probabilities:{completed:0.8,planned:0.1,denied:0.03,conditional:0.03,not_applicable:0.04},confidence:0.75},
 t1_Q1:{type:'noul',noul:0.5},t1_Q2:{type:'choice',choice:'weaken',probabilities:{support:0.3,weaken:0.4,trigger_invalidation:0.2,related_insufficient:0.1},confidence:0.2},
 t1_Q4:{type:'choice',choice:'planned',probabilities:{planned:0.5,completed:0.3,denied:0.1,conditional:0.05,not_applicable:0.05},confidence:0.45},
 Q3:{type:'choice',choice:'analyst_or_media',probabilities:{filing_or_regulator:0.1,executive_statement:0.05,third_party_data:0.05,analyst_or_media:0.7,retelling:0.05,unknown:0.05},confidence:0.64}},
 usage:{input_tokens:1200,output_tokens:40}};
const fetchWith=(status:number,body:unknown)=>vi.fn(async()=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));

describe('jev backend',()=>{
 it('is disabled without an API key and never calls the network',async()=>{
  const fetch=fetchWith(200,fixture);
  const r=await createJevBackend({apiKey:undefined,fetch})(input());
  expect(r).toMatchObject({backend:'jev',skipped:'disabled',answers:[]});
  expect(fetch).not.toHaveBeenCalled();
 });
 it('sends one fan-out request pinned to jev-1.13.0 with per-thesis Q1/Q2/Q4 and one Q3',async()=>{
  const fetch=fetchWith(200,fixture);
  await createJevBackend({apiKey:'k',fetch,microsPer1kTokens:45})(input());
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe(JEV_URL);
  expect(JEV_URL).toBe('https://api.typesafe.ai/v1/systemone');
  expect((init.headers as Record<string,string>).Authorization).toBe('Bearer k');
  const body=JSON.parse(init.body as string);
  expect(body.model).toBe(JEV_MODEL);expect(JEV_MODEL).toBe('jev-1.13.0');
  expect(Object.keys(body.questions).sort()).toEqual(['Q3','t0_Q1','t0_Q2','t0_Q4','t1_Q1','t1_Q2','t1_Q4']);
  expect(body.questions.t0_Q1).toMatchObject({type:'noul',criteria:{true:expect.any(String),false:expect.any(String)}});
  expect(body.questions.t0_Q2).toMatchObject({type:'choice',criteria:{support:expect.any(String),weaken:expect.any(String),trigger_invalidation:expect.any(String),related_insufficient:expect.any(String)}});
  expect(body.state.material.text).toContain('恒生电子');
  expect(body.state.theses.map((t:any)=>t.id)).toEqual([T1,T2]);
  expect(JSON.stringify(body)).not.toMatch(/holding|position|持仓/);
 });
 it('maps the response: Noul band, Choice thresholds, Q3 copied to each thesis, usage → tokens and cost',async()=>{
  const r=await createJevBackend({apiKey:'k',fetch:fetchWith(200,fixture),microsPer1kTokens:45})(input());
  expect(r).toMatchObject({backend:'jev',backend_model:'jev-1.13.0',input_token_count:1200,cost_micros:54});
  expect(r.skipped).toBeUndefined();
  const a=(t:string,q:string)=>r.answers.find(x=>x.thesis_id===t&&x.question_id===q)!;
  expect(a(T1,'Q1')).toMatchObject({selected:'true',abstained:false,confidence:null,distribution:{true:0.92,false:0.08}});
  expect(a(T2,'Q1')).toMatchObject({selected:null,abstained:true});
  expect(a(T1,'Q2')).toMatchObject({selected:'support',abstained:false,confidence:0.62});
  expect(a(T2,'Q2')).toMatchObject({selected:null,abstained:true,confidence:0.2});
  expect(a(T2,'Q4')).toMatchObject({selected:'not_applicable',abstained:false});
  expect(a(T1,'Q3')).toMatchObject({selected:'analyst_or_media',confidence:0.64});
  expect(a(T2,'Q3').distribution).toEqual(a(T1,'Q3').distribution);
  expect(r.answers).toHaveLength(8);
 });
 it('reports HTTP and contract failures as a skipped backend without throwing',async()=>{
  expect(await createJevBackend({apiKey:'k',fetch:fetchWith(500,'boom')})(input())).toMatchObject({skipped:'error',answers:[]});
  expect(await createJevBackend({apiKey:'k',fetch:fetchWith(200,{model:'jev-1.13.0'})})(input())).toMatchObject({skipped:'error'});
  const network=vi.fn(async()=>{throw new TypeError('fetch failed');});
  expect(await createJevBackend({apiKey:'k',fetch:network})(input())).toMatchObject({skipped:'error',error:expect.stringMatching(/fetch failed/)});
 });
 it('asks Q5 only when the caller requests it',async()=>{
  const fetch=fetchWith(200,{...fixture,answers:{...fixture.answers,t0_Q5:{type:'noul',noul:0.7},t1_Q5:{type:'noul',noul:0.2}}});
  const r=await createJevBackend({apiKey:'k',fetch})({...input(),askQ5:true,baseline:{source_id:'b1',title:'earliest',text:'最早材料正文'}});
  const body=JSON.parse((fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);
  expect(Object.keys(body.questions)).toContain('t0_Q5');
  expect(body.state.cluster_baseline).toMatchObject({source_id:'b1',text:'最早材料正文'});
  expect(r.answers.find(a=>a.thesis_id===T1&&a.question_id==='Q5')).toMatchObject({selected:'true'});
 });
 it('sends WP-A7 pillars and opportunity type to Jev, falling back to watch metrics for legacy theses',()=>{
  const legacy=buildJevRequest(input()).state as any;
  expect(legacy.theses[0]).toMatchObject({id:T1,pillars:['指标B'],opportunity_type:'other',invalidation_conditions:['条件A']});
  const modern={...input(),theses:[{...thesis(T1),opportunity_type:'B' as const,pillars:[{id:'p1',text:'推理需求增速高于训练',resolvable_by:'季报',deadline:null}]}]};
  const state=buildJevRequest(modern).state as any;
  expect(state.theses[0]).toMatchObject({pillars:['推理需求增速高于训练'],opportunity_type:'B'});
 });
});
