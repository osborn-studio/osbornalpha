import {describe,expect,it} from 'vitest';
import {TRIAGE_QUESTION_VERSION,TRIAGE_QUESTIONS,buildTriageRequest,itemsHash,judgeTriageItems,parseTriageAnswers,type TriageItem,type TriageThesis} from './triage';

const item=(n:number,over:Partial<TriageItem>={}):TriageItem=>({item_id:`cnt_${n}`,version_id:`ver_${n}`,title:`标题 ${n}`,source_url:null,text:`正文 ${n}`.repeat(3),body_sha256:'b'.repeat(64),local:{selected:true,disposition:'selected',semantic_conclusion:'read'},...over});
const thesis=(id:string):TriageThesis=>({id,title:`T ${id}`,pillars:['支柱 A'],invalidation_conditions:['失效 B'],catalysts:['催化 C']});
const doc=(items:TriageItem[])=>({schema_name:'brain-reading-triage-items' as const,schema_version:'1.0' as const,generated_at:'2026-09-26T00:00:00.000Z',plan_id:'plan_1',policy_version:'local-reading-v2',question:'AI 在券商',items,excluded:[]});
const noul=(p:number)=>({type:'noul',noul:p});
const response=(answers:Record<string,unknown>,usage={input_tokens:1000,output_tokens:20})=>({model:'jev-1.13.0',answers,usage});
const fakeFetch=(replies:Array<unknown|Error>)=>{const calls:any[]=[];const fn=async(_u:string,init:RequestInit)=>{calls.push(JSON.parse(String(init.body)));const r=replies.shift();if(r instanceof Error)throw r;return new Response(JSON.stringify(r),{status:200});};return {fn:fn as unknown as typeof fetch,calls};};

describe('triage questions and request',()=>{
 it('asks three nouls per active thesis in one request',()=>{
  expect(TRIAGE_QUESTION_VERSION).toBe('triage/1.0');
  expect(Object.keys(TRIAGE_QUESTIONS)).toEqual(['TR1','TR2','TR3']);
  const req=buildTriageRequest(item(1),[thesis('a'),thesis('b')]);
  expect(Object.keys(req.questions).sort()).toEqual(['t0_TR1','t0_TR2','t0_TR3','t1_TR1','t1_TR2','t1_TR3']);
  expect(req.model).toBe('jev-1.13.0');
  expect(req.state).toMatchObject({material:{title:'标题 1'},theses:[{id:'a',pillars:['支柱 A'],invalidation_conditions:['失效 B'],catalysts:['催化 C']},{id:'b'}]});
  expect(JSON.stringify(req)).not.toContain('item_id');
  expect(JSON.stringify(req)).not.toContain('selected');
 });
 it('parses verdicts with the §6.1-style bands and derives the item-level triage',()=>{
  const theses=[thesis('a'),thesis('b')];
  const read=parseTriageAnswers(theses,{t0_TR1:noul(0.9),t0_TR2:noul(0.2),t0_TR3:noul(0.8),t1_TR1:noul(0.1),t1_TR2:noul(0.9),t1_TR3:noul(0.9)});
  expect(read.verdicts).toEqual([
   {thesis_id:'a',relevant:true,counter:false,novel:true,p_relevant:0.9,p_counter:0.2,p_novel:0.8},
   {thesis_id:'b',relevant:false,counter:true,novel:true,p_relevant:0.1,p_counter:0.9,p_novel:0.9},
  ]);
  expect(read.triage).toBe('read');
  // Relevant but neither counter-evidence nor novel → skip.
  expect(parseTriageAnswers([thesis('a')],{t0_TR1:noul(0.9),t0_TR2:noul(0.1),t0_TR3:noul(0.2)}).triage).toBe('skip');
  // Every relevance answer in the abstention band → abstain.
  const abst=parseTriageAnswers([thesis('a')],{t0_TR1:noul(0.5),t0_TR2:noul(0.9),t0_TR3:noul(0.9)});
  expect(abst.triage).toBe('abstain');
  expect(abst.verdicts[0]).toMatchObject({relevant:null,p_relevant:0.5});
  // Missing or malformed answers are nulls, not crashes.
  expect(parseTriageAnswers([thesis('a')],{}).verdicts[0]).toEqual({thesis_id:'a',relevant:null,counter:null,novel:null,p_relevant:null,p_counter:null,p_novel:null});
 });
});

describe('judgeTriageItems',()=>{
 it('judges new items, skips existing ones, charges failures and stops at the budget',async()=>{
  const theses=[thesis('a')];
  const ok=response({t0_TR1:noul(0.9),t0_TR2:noul(0.1),t0_TR3:noul(0.8)});
  const {fn,calls}=fakeFetch([ok,new Error('boom'),ok]);
  const out=await judgeTriageItems({items:[item(1),item(2),item(3),item(4)],theses,existing:[{item_id:'cnt_2'}],fetch:fn,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T01:00:00.000Z'});
  expect(calls).toHaveLength(3);
  expect(out.answers.map(a=>a.item_id)).toEqual(['cnt_1','cnt_4']);
  expect(out.answers[0]).toMatchObject({triage:'read',backend_model:'jev-1.13.0',cost_micros:46});
  expect(out.errors.map(e=>e.item_id)).toEqual(['cnt_3']);
  expect(out.skipped_existing).toBe(1);
  expect(out.failed_charged_micros).toBeGreaterThan(0);
  const tight=await judgeTriageItems({items:[item(1),item(2)],theses,existing:[],fetch:fakeFetch([response({t0_TR1:noul(0.9),t0_TR2:noul(0.1),t0_TR3:noul(0.8)},{input_tokens:20000,output_tokens:0})]).fn,apiKey:'k'.repeat(20),maxCostUsd:0.001,now:()=>'2026-09-26T01:00:00.000Z'});
  expect(tight.answers).toHaveLength(1);
  expect(tight.stopped).toBe(true);
 });
 it('hashes the items document without its timestamp',()=>{
  const a=itemsHash(doc([item(1)]));
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(itemsHash({...doc([item(1)]),generated_at:'2027-01-01T00:00:00.000Z'})).toBe(a);
  expect(itemsHash(doc([item(2)]))).not.toBe(a);
 });
});

describe('Codex round 2 regression',()=>{
 it('treats a 200 without an answers object as a retryable failure, not a cached abstention',async()=>{
  const {fn}=fakeFetch([{},{error:'overloaded'},response({t0_TR1:noul(0.9),t0_TR2:noul(0.1),t0_TR3:noul(0.8)})]);
  const out=await judgeTriageItems({items:[item(1),item(2),item(3)],theses:[thesis('a')],existing:[],fetch:fn,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T01:00:00.000Z'});
  expect(out.answers.map(a=>a.item_id)).toEqual(['cnt_3']);
  expect(out.errors.map(e=>e.item_id)).toEqual(['cnt_1','cnt_2']);
 });
});
