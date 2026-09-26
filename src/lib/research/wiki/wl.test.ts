import {describe,expect,it} from 'vitest';
import {WL_QUESTION,WL_QUESTION_VERSION,buildWlRequest,judgeWlPairs,pairsHash,parseWlAnswer,type WlPair} from './wl';

const S=(n:number)=>`bbbbbbbb-0000-4000-8000-${String(n).padStart(12,'0')}`;
const pair=(n:number,over:Partial<WlPair>={}):WlPair=>({pair_id:String(n).repeat(64).slice(0,64),page:'wiki/entities/co.md',entity_id:'aaaaaaaa-0000-4000-8000-000000000001',assertion_index:n,assertion_text:`断言 ${n}。`,
 cited_snippets:[{source_id:S(1),source_version:'1',start:22,end:58,text:'launched an AI assistant for brokers'}],
 candidate:{source_id:S(9),source_version:'2',title:'Fresh filing',available_at:'2026-09-23T00:00:00.000Z',text:'The company discontinued the AI assistant.'},...over});
const doc=(pairs:WlPair[])=>({schema_name:'brain-wiki-wl-pairs' as const,schema_version:'1.0' as const,generated_at:'2026-09-26T00:00:00.000Z',pack_hash:'a'.repeat(64),pairs});
const response=(probs:Record<string,number>,confidence:number,usage={input_tokens:1000,output_tokens:20})=>({model:'jev-1.13.0',answers:{WL:{type:'choice',choice:Object.entries(probs).sort((a,b)=>b[1]-a[1])[0]![0],probabilities:probs,confidence}},usage});
const fakeFetch=(replies:Array<unknown|Error>)=>{const calls:any[]=[];const fn=async(_url:string,init:RequestInit)=>{calls.push(JSON.parse(String(init.body)));const r=replies.shift();if(r instanceof Error)throw r;if(r&&typeof r==='object'&&'status' in (r as any))return new Response('rate limited',{status:(r as any).status});return new Response(JSON.stringify(r),{status:200,headers:{'content-type':'application/json'}});};return {fn:fn as unknown as typeof fetch,calls};};

describe('WL question and request',()=>{
 it('is a pinned choice question with four options and builds a System One request from a pair',()=>{
  expect(WL_QUESTION_VERSION).toBe('wl/1.0');
  expect(WL_QUESTION.options).toEqual(['contradicts','superseded','consistent','unrelated']);
  const req=buildWlRequest(pair(1));
  expect(req.model).toBe('jev-1.13.0');
  expect(Object.keys(req.questions)).toEqual(['WL']);
  expect(req.state).toMatchObject({assertion:'断言 1。',cited:[{source_id:S(1),text:'launched an AI assistant for brokers'}],candidate:{source_id:S(9),title:'Fresh filing'}});
  expect(JSON.stringify(req)).not.toContain('pair_id');
 });
 it('parses distributions, confidence and abstentions',()=>{
  const ok=parseWlAnswer({type:'choice',choice:'contradicts',probabilities:{contradicts:0.8,superseded:0.1,consistent:0.05,unrelated:0.05},confidence:0.8});
  expect(ok).toMatchObject({selected:'contradicts',confidence:0.8,abstained:false});
  expect(parseWlAnswer({type:'choice',probabilities:{contradicts:0.4,superseded:0.3,consistent:0.2,unrelated:0.1},confidence:0.4})).toMatchObject({selected:null,abstained:true,confidence:0.4});
  expect(parseWlAnswer({type:'choice',probabilities:{maybe:1}})).toMatchObject({selected:null,abstained:true,distribution:{}});
  expect(parseWlAnswer(undefined)).toMatchObject({abstained:true});
  expect(parseWlAnswer({type:'noul',noul:0.9})).toMatchObject({abstained:true});
 });
});

describe('judgeWlPairs',()=>{
 it('judges every new pair, skips existing ones, records cost and stops at the budget',async()=>{
  const pairs=[pair(1),pair(2),pair(3),pair(4)];
  const {fn,calls}=fakeFetch([
   response({contradicts:0.9,superseded:0.05,consistent:0.03,unrelated:0.02},0.9),
   response({consistent:0.7,contradicts:0.1,superseded:0.1,unrelated:0.1},0.7,{input_tokens:20000,output_tokens:10}),
   response({unrelated:0.9,contradicts:0.05,superseded:0.03,consistent:0.02},0.9),
  ]);
  const existing=[{pair_id:pair(2).pair_id}];
  const out=await judgeWlPairs({pairs,existing,fetch:fn,apiKey:'k'.repeat(20),maxCostUsd:0.0015,now:()=>'2026-09-26T01:00:00.000Z'});
  // pair 2 skipped; pair 1 (1020 tokens ≈ 46 micros) and pair 3 (20010 tokens ≈ 900 micros) judged; pair 4 would exceed 1500 micros only if estimated... 
  expect(calls).toHaveLength(3);
  expect(out.answers.map(a=>a.pair_id)).toEqual([pair(1).pair_id,pair(3).pair_id,pair(4).pair_id]);
  expect(out.answers[0]).toMatchObject({selected:'contradicts',confidence:0.9,backend_model:'jev-1.13.0'});
  expect(out.answers[0]!.cost_micros).toBe(46);
  expect(out.answers[1]!.cost_micros).toBe(900);
  expect(out.spent_micros).toBe(46+900+46);
  expect(out.stopped).toBe(false);
  expect(out.skipped_existing).toBe(1);
  const tight=await judgeWlPairs({pairs,existing:[],fetch:fakeFetch([response({contradicts:0.9,superseded:0.05,consistent:0.03,unrelated:0.02},0.9,{input_tokens:20000,output_tokens:0})]).fn,apiKey:'k'.repeat(20),maxCostUsd:0.001,now:()=>'2026-09-26T01:00:00.000Z'});
  expect(tight.answers).toHaveLength(1);
  expect(tight.stopped).toBe(true);
  expect(tight.spent_micros).toBe(900);
 });
 it('records transport errors as abstentions without throwing',async()=>{
  const {fn}=fakeFetch([new Error('boom'),{status:429}]);
  const out=await judgeWlPairs({pairs:[pair(1),pair(2)],existing:[],fetch:fn,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T01:00:00.000Z'});
  expect(out.answers.map(a=>a.abstained)).toEqual([true,true]);
  expect(out.errors).toHaveLength(2);
  expect(out.answers[0]!.cost_micros).toBe(0);
 });
 it('hashes the pairs document deterministically',()=>{
  const a=pairsHash(doc([pair(1),pair(2)]));
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(pairsHash(doc([pair(2),pair(1)]))).not.toBe(a);
  expect(pairsHash({...doc([pair(1),pair(2)]),generated_at:'2027-01-01T00:00:00.000Z'})).toBe(a);
 });
});
