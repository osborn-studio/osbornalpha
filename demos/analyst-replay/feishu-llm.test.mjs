import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeishuLlmExtractor } from './feishu-llm.mjs';

const local = {FEISHU_LLM_BASE_URL:'http://127.0.0.1:11434/v1/',FEISHU_LLM_MODEL:'local-instruct:8b'};
const input = {text:'腾讯控股的仓位往上调一点',receivedAt:'2026-06-16T08:30:00.000Z'};
const packet = {intent:'proposal',fields:{
  ticker:{value:'00700.HK',evidence:'腾讯控股'}, action:{value:'add',evidence:'仓位往上调一点'},
}};

function completion(content, finish_reason = 'stop') {
  return Response.json({choices:[{finish_reason,message:{content,reasoning_content:'untrusted reasoning'}}]});
}

test('only valid local and Bailian Chat Completions configurations opt in', () => {
  assert.equal(createFeishuLlmExtractor({}),undefined);
  assert.equal(createFeishuLlmExtractor({FEISHU_LLM_MODEL:'  '}),undefined);
  assert.throws(() => createFeishuLlmExtractor({FEISHU_LLM_MODEL:'model'}),/配置无效/);
  for (const url of ['http://192.168.0.12/v1','https://example.com/v1','http://dashscope.aliyuncs.com/compatible-mode/v1',
    'https://dashscope.aliyuncs.com.evil.test/compatible-mode/v1','https://dashscope.aliyuncs.com:8443/compatible-mode/v1',
    'http://secret@127.0.0.1/v1','http://127.0.0.1/v1?secret=true','http://127.0.0.1/v1/chat/completions']) {
    assert.throws(() => createFeishuLlmExtractor({...local,FEISHU_LLM_BASE_URL:url}),/配置无效/);
  }
  assert.throws(() => createFeishuLlmExtractor({...local,FEISHU_LLM_BASE_URL:'https://dashscope.aliyuncs.com/compatible-mode/v1'}),/配置无效/);
  assert.throws(() => createFeishuLlmExtractor({...local,FEISHU_LLM_BASE_URL:'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    FEISHU_LLM_API_KEY:'sk-sp-synthetic'}),/配置无效/);
});

test('uses the ambiguity classification without trusting any candidate actions in that response', async () => {
  const extract = createFeishuLlmExtractor(local,{fetchImpl:async () => completion(JSON.stringify({
    intent:'ambiguous',fields:{action:{value:'trim/add',evidence:'前者减仓，后者加仓'}},
  }))});
  assert.deepEqual(await extract({...input,text:'小米和腾讯，前者减仓，后者加仓'}),{intent:'ambiguous',fields:{}});
});

test('uses loopback JSON mode with scoped context, omitting identifiers and earlier free text', async () => {
  const extract = createFeishuLlmExtractor(local,{fetchImpl:async (url,options) => {
    assert.equal(url,'http://127.0.0.1:11434/v1/chat/completions');
    assert.equal(options.redirect,'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization,undefined);
    const {model,response_format,reasoning_effort,messages} = JSON.parse(options.body);
    assert.equal(model,'local-instruct:8b');
    assert.deepEqual(response_format,{type:'json_object'});
    assert.equal(reasoning_effort,'none');
    assert.match(messages[0].content,/JSON/);
    assert.deepEqual(JSON.parse(messages[1].content),{
      text:'[飞书标识] [飞书标识] ' + input.text, receivedAt:input.receivedAt,isSupplement:true,
      priorFields:{action:'add',reference_price:447.5},
    });
    return completion(JSON.stringify(packet));
  }});
  assert.deepEqual(await extract({...input,text:'@_user_1 ou_credentialless ' + input.text,isSupplement:true,
    priorFields:{action:'add',reference_price:447.5,analyst:'private-id',rationale:'private rationale',thesis_ref:'private report'}}),packet);
});

test('authenticates to the documented Bailian workspace host and disables thinking for JSON mode', async () => {
  const extract = createFeishuLlmExtractor({FEISHU_LLM_BASE_URL:'https://llm-fixture.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    FEISHU_LLM_MODEL:'qwen-flash',FEISHU_LLM_API_KEY:'synthetic-key'},{fetchImpl:async (url,options) => {
    assert.equal(url,'https://llm-fixture.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer synthetic-key');
    const body = JSON.parse(options.body);
    assert.equal(body.enable_thinking,false);
    assert.equal(body.reasoning_effort,undefined);
    assert.doesNotMatch(options.body,/synthetic-key/);
    return completion('<think>separate reasoning</think>\n```json\n' + JSON.stringify(packet) + '\n```');
  }});
  assert.deepEqual(await extract(input),packet);
});

test('drops evidence absent from the current text and rejects malformed or incomplete responses', async () => {
  const partial = {intent:'proposal',fields:{...packet.fields,price:{value:100,evidence:'未出现在原文的证据'}}};
  const extract = createFeishuLlmExtractor(local,{fetchImpl:async () => completion(JSON.stringify(partial))});
  assert.deepEqual(await extract(input),packet);

  for (const getResponse of [() => completion(JSON.stringify(packet),'length'),
    () => completion(JSON.stringify({intent:'proposal',fields:{quantity:{value:'12',evidence:'一点'}}})),
    () => completion('The JSON is ' + JSON.stringify(packet)),
    () => completion(JSON.stringify({intent:'proposal',fields:{approved:{value:'true',evidence:'仓位'}}})),
    () => new Response('private provider response', {status:429}),
    () => {throw Error('private header and message');}]) {
    const failed = createFeishuLlmExtractor(local,{fetchImpl:async () => getResponse()});
    await assert.rejects(failed(input),{message:'飞书建议识别模型暂时不可用。'});
  }
});

test('bounds the response body and honors request deadlines', async () => {
  const oversized = createFeishuLlmExtractor(local,{fetchImpl:async () => new Response('a'.repeat(256_001))});
  await assert.rejects(oversized(input),{message:'飞书建议识别模型暂时不可用。'});

  const delayed = createFeishuLlmExtractor({...local,FEISHU_LLM_TIMEOUT_MS:'2'}, {fetchImpl:async (_url,{signal}) => {
    await new Promise(resolve => setTimeout(resolve,15));
    assert.equal(signal.aborted,true);
    return completion(JSON.stringify(packet));
  }});
  await assert.rejects(delayed(input),{message:'飞书建议识别模型暂时不可用。'});
});
