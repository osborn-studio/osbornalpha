import {describe,expect,it} from 'vitest';
import {loadItemsDocument,runJudgeTriage,thesesForTriage} from './judge-triage';
import type {TriageItem,TriageItemsDocument} from './triage';

const item=(n:number):TriageItem=>({item_id:`cnt_${n}`,version_id:`ver_${n}`,title:`标题 ${n}`,source_url:null,text:`正文 ${n} `.repeat(3),body_sha256:'b'.repeat(64),local:{selected:true,disposition:'selected',semantic_conclusion:'read'}});
const doc=(items:TriageItem[]):TriageItemsDocument=>({schema_name:'brain-reading-triage-items',schema_version:'1.0',generated_at:'2026-09-26T00:00:00.000Z',plan_id:'plan_1',policy_version:'local-reading-v2',question:'AI 在券商',items,excluded:[]});
const reply=()=>new Response(JSON.stringify({model:'jev-1.13.0',answers:{t0_TR1:{type:'noul',noul:0.9},t0_TR2:{type:'noul',noul:0.1},t0_TR3:{type:'noul',noul:0.8}},usage:{input_tokens:100,output_tokens:10}}),{status:200});
const thesis={id:'t1',title:'T1',status:'ACTIVE',watch_metrics:['支柱'],invalidation_conditions:['失效'],catalysts:[{text:'催化',expected_date:null}],pillars:[{id:'p1',text:'支柱 P',resolvable_by:'2026-12-31',deadline:null}]} as any;

describe('loadItemsDocument',()=>{
 it('validates the Brain items shape',()=>{
  expect(loadItemsDocument(doc([item(1)])).items).toHaveLength(1);
  expect(()=>loadItemsDocument({...doc([item(1)]),schema_version:'2.0'})).toThrow(/items_schema/);
  expect(()=>loadItemsDocument('x')).toThrow(/items_schema/);
 });
});

describe('thesesForTriage',()=>{
 it('keeps ACTIVE/WATCH/AT_RISK theses and maps pillars, kill conditions and catalysts',()=>{
  const out=thesesForTriage([thesis,{...thesis,id:'t2',status:'DRAFT'},{...thesis,id:'t3',status:'WATCH',pillars:undefined}]);
  expect(out.map(t=>t.id)).toEqual(['t1','t3']);
  expect(out[0]).toEqual({id:'t1',title:'T1',pillars:['支柱 P'],invalidation_conditions:['失效'],catalysts:['催化']});
  // Without explicit pillars the watch metrics stand in.
  expect(out[1]!.pillars).toEqual(['支柱']);
 });
});

describe('runJudgeTriage',()=>{
 const fetchOk=(async()=>reply()) as unknown as typeof fetch;
 it('merges with an existing answers file for the same items and refuses a different one',async()=>{
  const items=doc([item(1),item(2)]);
  const theses=thesesForTriage([thesis]);
  const first=await runJudgeTriage({items,theses,existing:null,fetch:fetchOk,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T01:00:00.000Z'});
  expect(first.document.answers).toHaveLength(2);
  expect(first.document.theses).toEqual([{thesis_id:'t1',title:'T1'}]);
  await expect(runJudgeTriage({items:doc([item(1)]),theses,existing:first.document,fetch:fetchOk,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T02:00:00.000Z'})).rejects.toThrow(/items_mismatch/);
  const again=await runJudgeTriage({items,theses,existing:first.document,fetch:fetchOk,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T02:00:00.000Z'});
  expect(again.judged?.skipped_existing).toBe(2);
  expect(again.document.answers).toHaveLength(2);
 });
 it('refuses to run without active theses and plans a dry run without calls',async()=>{
  let calls=0;
  const counting=(async()=>{calls++;return reply();}) as unknown as typeof fetch;
  await expect(runJudgeTriage({items:doc([item(1)]),theses:[],existing:null,fetch:counting,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T01:00:00.000Z'})).rejects.toThrow(/no_active_theses/);
  const out=await runJudgeTriage({items:doc([item(1),item(2)]),theses:thesesForTriage([thesis]),existing:null,fetch:counting,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T01:00:00.000Z',dryRun:true});
  expect(calls).toBe(0);
  expect(out.plan).toEqual({items:2,to_judge:2,skipped_existing:0,theses:1,estimated_micros:expect.any(Number)});
 });
});


describe('Codex round 1 regressions',()=>{
 it('reuses answers only for the same thesis context and question version',async()=>{
  const items=doc([item(1),item(2)]);
  const theses=thesesForTriage([thesis]);
  const fetchOk=(async()=>reply()) as unknown as typeof fetch;
  const first=await runJudgeTriage({items,theses,existing:null,fetch:fetchOk,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T01:00:00.000Z'});
  expect(first.document.theses_hash).toMatch(/^[0-9a-f]{64}$/);
  const revised=thesesForTriage([{...thesis,invalidation_conditions:['新的失效条件']}]);
  await expect(runJudgeTriage({items,theses:revised,existing:first.document,fetch:fetchOk,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T02:00:00.000Z'})).rejects.toThrow(/theses_mismatch/);
  const added=thesesForTriage([thesis,{...thesis,id:'t2'}]);
  await expect(runJudgeTriage({items,theses:added,existing:first.document,fetch:fetchOk,apiKey:'k'.repeat(20),maxCostUsd:1,now:()=>'2026-09-26T02:00:00.000Z'})).rejects.toThrow(/theses_mismatch/);
 });
});
