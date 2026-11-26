import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateExample,pairedSummary,selectForHoldout} from './evaluate.mjs';
import {activePrompt,validatePromptCandidate} from '../feishu-prompt.mjs';

const settings = {FEISHU_LLM_BASE_URL:'http://127.0.0.1:11434/v1',FEISHU_LLM_MODEL:'local-fixture'};
const cases = JSON.parse(await readFile(new URL('cases.json',import.meta.url),'utf8'));
const metrics = (score,other={}) => ({score,passed:score===1,latencyMs:300,critical:false,...other});

test('paired decision rejects critical errors, per-task regressions, delays and ties', () => {
  const extraction = {kind:'extraction',baseline:metrics(0.7),candidate:metrics(1)};
  const chat = {kind:'chat',baseline:metrics(1),candidate:metrics(1)};
  assert.equal(pairedSummary([extraction,chat]).eligible,true);
  for (const delta of [{score:0.5},{critical:true},{rawCritical:true},{error:'timeout'},{latencyMs:6000}]) {
    assert.equal(pairedSummary([extraction,{...chat,candidate:{...chat.candidate,...delta}}]).eligible,false);
  }
  assert.equal(pairedSummary([{...extraction,candidate:extraction.baseline},chat]).eligible,false);
  assert.equal(pairedSummary([extraction,chat],activePrompt,activePrompt).eligible,false);
});

test('experiment uses only the selected prompt on the formal local adapter and captures original output', async () => {
  const example=cases.find(c=>c.split==='train' && c.kind==='extraction' && c.expect.intent==='other');
  const reply={intent:'other',fields:{}};
  const candidate={extraction:'离线提取版本',chat:'离线聊天版本'};
  const run=await evaluateExample(example,candidate,settings,async (url,options)=>{
    assert.equal(new URL(url).hostname,'127.0.0.1');
    const packet=JSON.parse(options.body);
    assert.ok(packet.messages[0].content.endsWith(candidate.extraction));
    assert.ok(!packet.messages[0].content.includes(candidate.chat));
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]});
  });
  assert.deepEqual(run.raw,reply);
  assert.deepEqual(run.result,reply);
  assert.equal(run.score,1);
  await assert.rejects(evaluateExample(example,candidate,{...settings,FEISHU_LLM_BASE_URL:'https://example.org/v1'}));
  assert.throws(()=>validatePromptCandidate({...activePrompt,chat:'a'.repeat(1201)}));
});

test('validation selects the two prompt components independently before holdout', () => {
  const original={extraction:'original extract',chat:'original chat'};
  const trial={extraction:'trial extract',chat:'trial chat'};
  const rows=[
    {id:'proposal',kind:'extraction',baseline:metrics(0.5),candidate:metrics(1)},
    {id:'qa',kind:'chat',baseline:metrics(1),candidate:metrics(0.8,{rawCritical:true})},
  ];
  assert.deepEqual(selectForHoldout(rows,original,trial),{extraction:trial.extraction,chat:original.chat});
  assert.deepEqual(pairedSummary(rows).newRawCritical,['qa']);
});

test('a separately frozen chat component can be confirmed on a fresh chat-only set', () => {
  const original={extraction:'fixed',chat:'old'};
  const trial={extraction:'fixed',chat:'trial'};
  const rows=[{id:'chat1',kind:'chat',baseline:metrics(1),candidate:metrics(1)}];
  const paired=pairedSummary(rows,original,trial,'chat');
  assert.equal(paired.meetsComparisonLimits,true);
  assert.equal(paired.eligible,false);
  assert.deepEqual(paired.changedComponents,['chat']);
  assert.throws(()=>pairedSummary(rows,original,trial));
  assert.throws(()=>pairedSummary(rows,original,trial,'extraction'));
});


test('only transport failures and temporary HTTP errors trigger offline retry',async()=>{
  const example=cases.find(c=>c.kind==='extraction');
  const run=fetchModel=>evaluateExample(example,activePrompt,settings,fetchModel);
  const network=await run(async()=>{throw new TypeError('fetch failed',{cause:Object.assign(Error(),{code:'ECONNRESET'})});});
  assert.equal(network.transportError,true);
  assert.equal((await run(async()=>new Response('',{status:503}))).transportError,true);
  assert.equal((await run(async()=>new Response('',{status:400}))).transportError,undefined);
  const invalid=await run(async()=>Response.json({choices:[{message:{content:'not valid json'}}]}));
  assert.ok(invalid.error);
  assert.equal(invalid.transportError,undefined);
});
