import {describe,expect,it} from 'vitest';
import {ruleBackend} from './backends/rule';
import type {FanoutInput} from './backends/types';
import type {SourceDocument,Thesis} from '../types';

const thesis=(over:Partial<Thesis>={}):Thesis=>({id:'11111111-1111-4111-8111-111111111111',title:'恒生电子受益于券商 IT 投入回升',body:'…',company_ids:['e1'],theme_ids:[],supporting_evidence_ids:[],
 invalidation_conditions:['券商 IT 投入连续两年下滑','核心客户流失'],watch_metrics:['信创订单','UF3.0 上线数量'],status:'ACTIVE',created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z',...over});
const source=(over:Partial<SourceDocument>={}):SourceDocument=>({id:'22222222-2222-4222-8222-222222222222',source_type:'NEWS',title:'t',url:'https://news.example.com/a',author:null,published_at:null,ingested_at:'2026-09-20T00:00:00Z',
 raw_text:'恒生电子今日宣布已完成 UF3.0 在两家头部券商的上线。',content_hash:'h',trust_level:'MEDIUM',entity_ids:['e1'],metadata:{},event_time:null,available_at:'2026-09-20T00:00:00Z',source_version:'1',cluster_id:null,cluster_first:null,origin_type:null,market:'A',permission:'public',...over});
const input=(s=source(),t=thesis(),aliases=['恒生电子','Hundsun']):FanoutInput=>({source:s,theses:[t],aliases:new Map([[t.id,aliases]]),askQ5:false});

describe('rule backend',()=>{
 it('answers Q1–Q4 deterministically for a relevant public news item',async()=>{
  const r=await ruleBackend(input());
  expect(r).toMatchObject({backend:'rule',backend_model:'rules-v1',prompt_sha256:null,input_token_count:null,cost_micros:0});
  const q=(id:string)=>r.answers.find(a=>a.question_id===id)!;
  expect(q('Q1').distribution.true).toBeGreaterThanOrEqual(0.65);
  expect(q('Q1').selected).toBe('true');
  expect(q('Q2').selected).toBe('support');          // 宣布/完成/上线 in the support lexicon
  expect(q('Q3').selected).toBe('analyst_or_media'); // news domain
  expect(q('Q4').selected).toBe('completed');        // 已完成
  expect(r.answers.map(a=>a.question_id).sort()).toEqual(['Q1','Q2','Q3','Q4']);
  expect(await ruleBackend(input())).toEqual(r);
 });
 it('flags an invalidation condition quoted in the material',async()=>{
  const r=await ruleBackend(input(source({raw_text:'报告称券商 IT 投入连续两年下滑，恒生电子订单承压。'})));
  expect(r.answers.find(a=>a.question_id==='Q2')!.selected).toBe('trigger_invalidation');
 });
 it('classifies filings and regulator domains as filing_or_regulator and notes as retelling',async()=>{
  const filing=await ruleBackend(input(source({source_type:'FILING',url:'https://www.sec.gov/Archives/x.htm',raw_text:'Palantir 10-K'}),thesis(),['Palantir']));
  expect(filing.answers.find(a=>a.question_id==='Q3')!.selected).toBe('filing_or_regulator');
  const cninfo=await ruleBackend(input(source({url:'http://www.cninfo.com.cn/new/disclosure/detail?x=1'})));
  expect(cninfo.answers.find(a=>a.question_id==='Q3')!.selected).toBe('filing_or_regulator');
  const note=await ruleBackend(input(source({source_type:'NOTE',url:null,permission:'private'})));
  expect(note.answers.find(a=>a.question_id==='Q3')!.selected).toBe('retelling');
 });
 it('reports irrelevance with a low Q1 and abstains on Q2/Q4 when nothing matches',async()=>{
  const r=await ruleBackend(input(source({raw_text:'The weather in Oslo was mild today.',url:'https://blog.example.org/x'}),thesis(),['Hundsun']));
  const q=(id:string)=>r.answers.find(a=>a.question_id===id)!;
  expect(q('Q1').distribution.true).toBe(0.05);
  expect(q('Q1').selected).toBe('false');
  expect(q('Q2').abstained).toBe(true);
  expect(q('Q4').selected).toBe('not_applicable');
  expect(q('Q3').selected).toBe('analyst_or_media'); // NEWS from any web host is media; 'unknown' is for typeless material
 });
 it('asks Q5 only when requested and treats a clustered follow-up without new facts as a retelling',async()=>{
  const r=await ruleBackend({...input(),askQ5:true});
  expect(r.answers.some(a=>a.question_id==='Q5')).toBe(true);
 });
});
