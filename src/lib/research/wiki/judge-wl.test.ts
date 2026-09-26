import {describe,expect,it} from 'vitest';
import {makeMockCtx} from '../test-support';
import {loadPairsDocument,runJudgeWl,verifyPublicSources} from './judge-wl';
import type {WlAnswersDocument,WlPair,WlPairsDocument} from './wl';

const S=(n:number)=>`bbbbbbbb-0000-4000-8000-${String(n).padStart(12,'0')}`;
const pair=(n:number):WlPair=>({pair_id:String(n).repeat(64).slice(0,64),page:'wiki/entities/co.md',entity_id:'aaaaaaaa-0000-4000-8000-000000000001',assertion_index:n,assertion_text:`断言 ${n}。`,
 cited_snippets:[{source_id:S(1),source_version:'1',start:0,end:5,text:'quote'}],candidate:{source_id:S(9),source_version:'1',title:'Fresh',available_at:'2026-09-23T00:00:00.000Z',text:'Fresh text.'}});
const doc=(pairs:WlPair[]):WlPairsDocument=>({schema_name:'brain-wiki-wl-pairs',schema_version:'1.0',generated_at:'2026-09-26T00:00:00.000Z',pack_hash:'a'.repeat(64),pairs});
const row=(id:string,permission='public')=>({id,source_type:'FILING',title:'t',raw_text:'x',content_hash:'h',trust_level:'HIGH',entity_ids:[],metadata:{},permission,source_version:'1'});
const reply=()=>new Response(JSON.stringify({model:'jev-1.13.0',answers:{WL:{type:'choice',probabilities:{contradicts:0.9,superseded:0.05,consistent:0.03,unrelated:0.02},confidence:0.9}},usage:{input_tokens:100,output_tokens:10}}),{status:200});

describe('loadPairsDocument',()=>{
 it('accepts the Brain pairs shape and rejects anything else',()=>{
  expect(loadPairsDocument(doc([pair(1)])).pairs).toHaveLength(1);
  expect(()=>loadPairsDocument({...doc([pair(1)]),schema_version:'2.0'})).toThrow(/pairs_schema/);
  expect(()=>loadPairsDocument({...doc([{...pair(1),pair_id:'short'}])})).toThrow(/pairs_schema/);
  expect(()=>loadPairsDocument('x')).toThrow(/pairs_schema/);
 });
});

describe('verifyPublicSources',()=>{
 it('passes when every referenced source is public and fails closed otherwise',async()=>{
  const ok=makeMockCtx({research_source_documents:[row(S(1)),row(S(9))]});
  await expect(verifyPublicSources(ok.ctx,doc([pair(1)]))).resolves.toEqual({checked:2});
  const priv=makeMockCtx({research_source_documents:[row(S(1)),row(S(9),'private')]});
  await expect(verifyPublicSources(priv.ctx,doc([pair(1)]))).rejects.toThrow(/not_public/);
  const missing=makeMockCtx({research_source_documents:[row(S(1))]});
  await expect(verifyPublicSources(missing.ctx,doc([pair(1)]))).rejects.toThrow(/not_public/);
 });
});

describe('verifyPublicSources batching',()=>{
 it('checks more than 1000 distinct sources in bounded batches',async()=>{
  const ids=Array.from({length:1200},(_,i)=>S(1000+i));
  const {ctx}=makeMockCtx({research_source_documents:ids.map(id=>row(id))});
  const batches:number[]=[];
  const from=ctx.supabase.from.bind(ctx.supabase);
  (ctx.supabase as any).from=(table:string)=>{const q:any=from(table);const origIn=q.in.bind(q);q.in=(col:string,values:unknown[])=>{batches.push(values.length);return origIn(col,values);};return q;};
  const pairs=ids.map((id,i)=>({...pair(i),pair_id:String(i%10).repeat(64).slice(0,64),cited_snippets:[],candidate:{...pair(i).candidate,source_id:id}}));
  await expect(verifyPublicSources(ctx,doc(pairs))).resolves.toEqual({checked:1200});
  // Small batches keep the PostgREST GET URL well under gateway request-line limits.
  expect(batches.length).toBeGreaterThanOrEqual(12);
  expect(Math.max(...batches)).toBeLessThanOrEqual(100);
 });
});

describe('runJudgeWl',()=>{
 const fetchOk=(async()=>reply()) as unknown as typeof fetch;
 it('merges with an existing answers file for the same pairs and refuses a different one',async()=>{
  const pairs=doc([pair(1),pair(2)]);
  const first=await runJudgeWl({pairs,existing:null,fetch:fetchOk,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T01:00:00.000Z'});
  expect(first.document.answers).toHaveLength(2);
  expect(first.document.pairs_hash).toMatch(/^[0-9a-f]{64}$/);
  const more=doc([pair(1),pair(2),pair(3)]);
  await expect(runJudgeWl({pairs:more,existing:first.document,fetch:fetchOk,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T02:00:00.000Z'})).rejects.toThrow(/pairs_mismatch/);
  const again=await runJudgeWl({pairs,existing:first.document,fetch:fetchOk,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T02:00:00.000Z'});
  expect(again.judged?.skipped_existing).toBe(2);
  expect(again.document.answers).toHaveLength(2);
  expect(again.document.generated_at).toBe('2026-09-26T02:00:00.000Z');
 });
 it('dry run makes no calls and reports the plan',async()=>{
  let calls=0;
  const counting=(async()=>{calls++;return reply();}) as unknown as typeof fetch;
  const out=await runJudgeWl({pairs:doc([pair(1),pair(2)]),existing:null,fetch:counting,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T01:00:00.000Z',dryRun:true});
  expect(calls).toBe(0);
  expect(out.plan).toEqual({pairs:2,to_judge:2,skipped_existing:0,estimated_micros:expect.any(Number)});
  expect(out.document.answers).toEqual([]);
 });
});
