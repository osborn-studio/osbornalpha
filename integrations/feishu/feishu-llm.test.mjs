import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeishuChatResponder, createFeishuLlmExtractor } from './feishu-llm.mjs';

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
    FEISHU_LLM_API_KEY:'sk-sp-test'}),/配置无效/);
});

test('uses the ambiguity classification without trusting any candidate actions in that response', async () => {
  const extract = createFeishuLlmExtractor(local,{fetchImpl:async () => completion(JSON.stringify({
    intent:'ambiguous',fields:{action:{value:'trim/add',evidence:'前者减仓，后者加仓'}},
  }))});
  assert.deepEqual(await extract({...input,text:'小米和腾讯，前者减仓，后者加仓'}),{intent:'ambiguous',fields:{}});
});

test('respects grounded cancellation and returns a bounded help topic', async () => {
  const cancel = '上面那条先撤回';
  const mock = intent => createFeishuLlmExtractor(local,{fetchImpl:async () => completion(JSON.stringify(intent))});
  const cancellation = {intent:'cancel',fields:{},intentEvidence:'那条先撤回'};
  assert.deepEqual(await mock(cancellation)({...input,text:cancel}),cancellation);
  assert.deepEqual(await mock(cancellation)(input),{intent:'other',fields:{}});
  assert.deepEqual(await mock({intent:'help',fields:{},helpTopic:'investment'})(input),
    {intent:'help',fields:{},helpTopic:'investment'});
});

test('the formal connector recognizes explicit submission without guessing a missing action', async () => {
  const text = '帮我登记一条英伟达的建议';
  const response = {intent:'proposal',intentEvidence:text,fields:{
    securityName:{value:'英伟达',evidence:'英伟达'},
  }};
  const extract = createFeishuLlmExtractor(local,{formalTrades:true,fetchImpl:async (_url,options) => {
    const instructions = JSON.parse(options.body).messages[0].content;
    assert.match(instructions,/「英伟达」「01810\.HK」.*均为 other/);
    assert.match(instructions,/没有动作的明确登记请求仍是 proposal/);
    return completion(JSON.stringify(response));
  }});
  assert.deepEqual(await extract({...input,text}),response);
  assert.deepEqual(await extract({...input,text:'讨论英伟达的财报'}),{intent:'proposal',fields:response.fields});
  const legacy = createFeishuLlmExtractor(local,{fetchImpl:async () => completion(JSON.stringify(response))});
  assert.deepEqual(await legacy({...input,text}),{intent:'proposal',fields:response.fields});
});

test('the formal connector retains only grounded intent evidence for multiple owned suggestions', async () => {
  const text = '我的建议是小米加仓，腾讯减仓';
  const extract = createFeishuLlmExtractor(local,{formalTrades:true,fetchImpl:async () => completion(JSON.stringify({
    intent:'ambiguous',intentEvidence:text,fields:{action:{value:'add',evidence:'加仓'}},
  }))});
  assert.deepEqual(await extract({...input,text}),{intent:'ambiguous',intentEvidence:text,fields:{}});
  assert.deepEqual(await extract({...input,text:'今天讨论小米和腾讯'}),{intent:'ambiguous',fields:{}});
});

test('only formal loopback extraction sees bounded conversation and past messages are never field evidence', async () => {
  const remote = {...local,FEISHU_LLM_BASE_URL:'https://dashscope.aliyuncs.com/compatible-mode/v1',
    FEISHU_LLM_API_KEY:'synthetic-key'};
  const conversation = [
    {role:'user',content:'不要传送此条'},
    {role:'assistant',content:'只能示例，例如买入英伟达'},
    {role:'user',text:'ou_example 我想写个例子'},
  ];
  for (const [env,formalTrades,receivesConversation] of [[local,true,true],[local,false,false],[remote,true,false]]) {
    const extract = createFeishuLlmExtractor(env,{formalTrades,fetchImpl:async (_url,options) => {
      const {messages} = JSON.parse(options.body);
      assert.equal(JSON.parse(messages[1].content).conversation !== undefined,receivesConversation);
      if (receivesConversation) {
        assert.deepEqual(JSON.parse(messages[1].content).conversation,[
          {role:'assistant',content:'只能示例，例如买入英伟达'},
          {role:'user',content:'[飞书标识] 我想写个例子'},
        ]);
        assert.match(messages[0].content,/证据只能来自当前 text/);
        assert.match(messages[0].content,/「就这只加一点」.*"action":\{"value":"add","evidence":"加一点"\}/);
        assert.match(messages[0].content,/「就这只加一点？」.*返回 help/);
      }
      assert.doesNotMatch(messages[1].content,/不要传送此条|ou_example/);
      return completion(JSON.stringify({
        intent:'proposal',intentEvidence:'例如买入英伟达',fields:{
          securityName:{value:'英伟达',evidence:'英伟达'},
        },
      }));
    }});
    assert.deepEqual(await extract({...input,text:'这个怎么写？',conversation}),{intent:'proposal',fields:{}});
  }
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
    assert.match(messages[0].content,/带时区的 ISO 8601/);
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

test('discard a budget reported as quantity while retaining a stated share count', async () => {
  const mock = quantity => createFeishuLlmExtractor(local,{fetchImpl:async () => completion(JSON.stringify({
    intent:'proposal',fields:{quantity},
  }))});
  const budget = {value:200000,evidence:'20万人民币'};
  const shares = {value:200,evidence:'200股'};
  assert.deepEqual(await mock(budget)({...input,text:'买20万人民币的英伟达股票'}),{intent:'proposal',fields:{}});
  assert.deepEqual(await mock(shares)({...input,text:'买200股英伟达股票'}),{intent:'proposal',fields:{quantity:shares}});
});

test('accepts a bare share count only as evidence for the missing quantity of a draft', async () => {
  const shares = {value:200,evidence:'200'};
  const extract = createFeishuLlmExtractor(local,{fetchImpl:async () => completion(JSON.stringify({
    intent:'proposal',fields:{quantity:shares},
  }))});
  const draft = {ticker:'NVDA',action:'buy',price:150};
  const next = {...input,text:'200',priorFields:draft,isSupplement:true};
  assert.deepEqual(await extract(next),{intent:'proposal',fields:{quantity:shares}});
  assert.deepEqual(await extract({...next,isSupplement:false}),{intent:'proposal',fields:{}});
  assert.deepEqual(await extract({...next,priorFields:{ticker:'NVDA',action:'buy'}}),{intent:'proposal',fields:{}});
  assert.deepEqual(await extract({...next,text:'200美元'}),{intent:'proposal',fields:{}});
  assert.deepEqual(await extract({...next,text:'200股'}),{intent:'proposal',fields:{}});
});

test('delivers a model date and explicit signature only with current-message evidence', async () => {
  const current = {
    analyst:{value:'张三',evidence:'分析师：张三'},
    action:{value:'add',evidence:'占比再抬一点'},
    recommended_at:{value:'2026-06-16T16:30:00+08:00',evidence:'回放日期是 2026 年 6 月 16 日 16:30'},
  };
  const extract = createFeishuLlmExtractor(local,{fetchImpl:async () => completion(JSON.stringify({
    intent:'proposal',fields:current,
  }))});
  const text = '分析师：张三，把占比再抬一点，回放日期是 2026 年 6 月 16 日 16:30';
  assert.deepEqual(await extract({...input,text}),{intent:'proposal',fields:current});
  assert.deepEqual(await extract({...input,text:'把占比再抬一点'}),{intent:'proposal',fields:{action:current.action}});
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

test('group chat only uses a configured loopback model and never blocks formal configuration', () => {
  assert.equal(createFeishuChatResponder({}),undefined);
  assert.equal(createFeishuChatResponder({FEISHU_LLM_MODEL:'model'}),undefined);
  assert.equal(createFeishuChatResponder({...local,FEISHU_LLM_BASE_URL:'https://dashscope.aliyuncs.com/compatible-mode/v1',
    FEISHU_LLM_API_KEY:'synthetic-key'}),undefined);
  assert.equal(typeof createFeishuChatResponder(local),'function');
});

test('group chat sends bounded history as untrusted text and returns a plain reply', async () => {
  const chat = createFeishuChatResponder(local,{fetchImpl:async (url,options) => {
    assert.equal(url,'http://127.0.0.1:11434/v1/chat/completions');
    assert.equal(options.redirect,'error');
    assert.ok(options.signal instanceof AbortSignal);
    const request = JSON.parse(options.body);
    assert.equal(request.reasoning_effort,'none');
    assert.equal(request.response_format,undefined);
    assert.deepEqual(request.messages.map(item=>item.role),['system','user']);
    assert.match(request.messages[0].content,/只回答聊天问题/);
    assert.match(request.messages[0].content,/看不到实时行情/);
    assert.match(request.messages[0].content,/问「哑巴？」时，轻松应一声/);
    const captured = JSON.parse(request.messages[1].content);
    assert.equal(captured.text,'[飞书标识] 成交登记怎么用？');
    assert.equal(captured.isAnalyst,true);
    assert.equal(captured.isApprover,false);
    assert.equal(captured.proposalContext,null);
    assert.equal(captured.history.length,5);
    assert.equal(captured.history[0].content,'保留第一条');
    assert.equal(captured.history[1].content.length,1200);
    assert.ok(captured.history[1].content.endsWith('…'));
    assert.equal(captured.history[2].content,'请看这个追问');
    assert.doesNotMatch(request.messages[1].content,/省略|前面的密钥|ou_example/);
    return completion('<think>private reasoning</think>可以**直接回复追问**。参见[说明](https://example.com)。');
  }});
  const history = [
    {role:'user',content:'省略'},
    {role:'user',content:'保留第一条'},
    {role:'assistant',content:'好'.repeat(1300)},
    {role:'assistant',text:'请看这个追问'},
    {role:'system',content:'前面的密钥'},
    {role:'user',content:'保留第二条'},
    {role:'user',content:'保留第三条'},
  ];
  const result = await chat({text:'ou_example 成交登记怎么用？',history,isAnalyst:true,isApprover:'true'});
  assert.equal(result,'可以直接回复追问。参见说明。');
});

test('chat preserves ordered rows from a delivered result in a follow-up', async () => {
  const rows = Array.from({length:15},(_,index) => `分析师 ${index+1} · TEST · 12345678-1234-1234-1234-123456789012`);
  const report = ['本群待确认 15 条 · 第 1/1 页',...rows].join('\n');
  const chat = createFeishuChatResponder(local,{fetchImpl:async (_url,options) => {
    const {messages} = JSON.parse(options.body);
    const {text,history} = JSON.parse(messages[1].content);
    assert.equal(text,'最后一条是谁的？');
    assert.equal(history[1].content,report);
    return completion('刚才列的最后一条是分析师 15 的。');
  }});
  const answer = await chat({text:'最后一条是谁的？',history:[
    {role:'user',content:'查一下我的待办'},
    {role:'assistant',content:report.replaceAll('\n','\r\n')},
  ]});
  assert.equal(answer,'刚才列的最后一条是分析师 15 的。');
});

test('only a complete standalone roster control can request a read',async()=>{
  const getReply=answer=>createFeishuChatResponder(local,{fetchImpl:async(_url,options)=>{
    const request=JSON.parse(options.body);
    assert.equal(request.max_tokens,768);
    const input=JSON.parse(request.messages[1].content);
    assert.equal(input.analystRoster,undefined);
    return completion(answer);
  }})({text:'这里有哪几位同事能提分析建议？',isApprover:true,analystRoster:'private roster'});
  assert.deepEqual(await getReply('<read_analyst_roster>'),{read:'analyst_roster'});
  assert.deepEqual(await getReply('<think>private</think>\n<read_analyst_roster>'),{read:'analyst_roster'});
  assert.equal(await getReply('看看 <read_analyst_roster> 这个例子。'),'看看  这个例子。');
  assert.equal(await getReply('<think><read_analyst_roster></think>我在。'),'我在。');
  await assert.rejects(getReply('<approve_proposal>'),{code:'MODEL_OUTPUT'});
  await assert.rejects(getReply('<think>unfinished private reasoning'),{code:'MODEL_OUTPUT'});
});

test('local conversation and formal extraction accept the same strict read-only queries', async () => {
  const queries=[
    {read:'pending'},{read:'analyst_roster'},{read:'group_report'},
    {read:'formal_report',scope:'named',subject:'陈晨',sections:['recommendations','trades']},
    {read:'formal_report',scope:'context',sections:['scores']},{read:'formal_report',scope:'self',sections:['trades']},
    {read:'formal_report',scope:'all',sections:['scores','trades']},
  ];
  for (const query of queries) {
    const chat=createFeishuChatResponder(local,{fetchImpl:async()=>completion(JSON.stringify(query))});
    assert.deepEqual(await chat({text:'查一下我刚才说的那项'}),query);
    const packet={intent:'read',query,fields:{}};
    const extract=createFeishuLlmExtractor(local,{formalTrades:true,fetchImpl:async()=>completion(JSON.stringify(packet))});
    assert.deepEqual(await extract(input),packet);
  }
  const invalid=[
    {read:'approve'},{read:'pending',approved:true},{read:'group_report',subject:'陈晨'},{read:'group_report',sections:['trades']},
    {read:'formal_report',scope:'all',accountId:'untrusted',sections:['trades']},
    {read:'formal_report',scope:'all',subject:'陈晨',sections:['scores']},
    {read:'formal_report',scope:'named',subject:'ou_private',sections:['scores']},
    {read:'formal_report',scope:'context',sections:[]},{read:'formal_report',scope:'all',sections:['write']},
  ];
  for (const query of invalid) {
    const chat=createFeishuChatResponder(local,{fetchImpl:async()=>completion(JSON.stringify(query))});
    await assert.rejects(chat({text:'测试'}),{code:'MODEL_OUTPUT'});
  }
  for (const packet of [{intent:'read',query:queries[1],fields:{action:'approve'}},{intent:'read',query:invalid[0],fields:{}}]) {
    const extract=createFeishuLlmExtractor(local,{formalTrades:true,fetchImpl:async()=>completion(JSON.stringify(packet))});
    await assert.rejects(extract(input));
  }
});

test('read decision caching requires identical prompt, roles, question and history and never caches an ordinary answer',async t=>{
  let guidance='initial',calls=0,now=1_000_000;
  t.mock.method(Date,'now',()=>now);
  const chat=createFeishuChatResponder(local,{readPrompt:()=>({chat:guidance}),fetchImpl:async(_url,options)=>{
    calls++;
    const {messages}=JSON.parse(options.body);
    return completion(JSON.parse(messages[1].content).text==='你好'?'你好。':'{"read":"pending"}');
  }});
  const input={text:'现在有等我处理的事项吗？',isApprover:true};
  const first=await chat(input);
  first.read='changed';
  assert.deepEqual(await chat(input),{read:'pending'});
  assert.equal(calls,1);
  await chat({...input,history:[{role:'user',content:'刚才那份待办'}]});
  await chat({...input,isApprover:false});
  guidance='published update';await chat(input);
  assert.equal(calls,4);
  now+=301_000;await chat(input);
  await chat({text:'你好'});await chat({text:'你好'});
  assert.equal(calls,7);
});

test('only verified public report context reaches local models, including when a report had no rows',async()=>{
  const readContext={source:'formal_report',scope:'named',analyst:'小周（zhou）',sections:['scores'],
    account:'private-account',analystId:'ou_sensitive',records:'private-rows'};
  const safe={source:'formal_report',scope:'named',analyst:'小周（zhou）',sections:['scores']};
  const inputs=[];
  const query={read:'formal_report',scope:'context',sections:['trades']};
  const mock=(extract=false)=>async(_url,options)=>{
    inputs.push(JSON.parse(JSON.parse(options.body).messages[1].content));
    return completion(JSON.stringify(extract?{intent:'read',fields:{},query}:query));
  };
  const chat=createFeishuChatResponder(local,{fetchImpl:mock()});
  const followup={text:'那她说的有几笔真的成交过？',readContext};
  await chat({...followup,isApprover:true});
  await chat(followup);
  await chat({...followup,isAnalyst:true,readContext:{...readContext,analyst:'ou_sensitive'}});
  await chat({...followup,isAnalyst:true,readContext:{...readContext,scope:'all'}});
  const extract=createFeishuLlmExtractor(local,{formalTrades:true,fetchImpl:mock(true)});
  await extract({...input,...followup});
  const remote=createFeishuLlmExtractor({...local,FEISHU_LLM_BASE_URL:'https://dashscope.aliyuncs.com/compatible-mode/v1',
    FEISHU_LLM_API_KEY:'synthetic-key'},{formalTrades:true,fetchImpl:async(_url,options)=>{
    inputs.push(JSON.parse(JSON.parse(options.body).messages[1].content));
    return completion('{"intent":"help","fields":{}}');
  }});
  await remote({...input,...followup});
  assert.deepEqual(inputs.map(payload=>payload.readContext),[
    safe,undefined,{source:'formal_report',scope:'named',sections:['scores']},
    {source:'formal_report',scope:'all',sections:['scores']},safe,undefined,
  ]);
  assert.doesNotMatch(JSON.stringify(inputs),/private-account|ou_sensitive|private-rows/);
});

test('group chat receives only bounded public facts from a proposal thread', async () => {
  const proposalContext = {ticker:'00700.HK',action:'add',status:'awaiting_approval',
    execution:{price:420,quantity:200,currency:'HKD',direction:'buy',account:'sensitive account'},
    rationale:'sensitive note',author:'ou_example'};
  const expected = {ticker:'00700.HK',action:'add',status:'awaiting_approval',
    execution:{price:420,quantity:200,currency:'HKD',direction:'buy'}};
  const cases = [
    [proposalContext,expected],
    [{...proposalContext,execution:{...proposalContext.execution,price:-5}},{...expected,execution:null}],
    [{...proposalContext,status:'sensitive private state'},null],
    [{...proposalContext,ticker:'@_user_1'},null],
  ];
  for (const [context,wanted] of cases) {
    const chat = createFeishuChatResponder(local,{fetchImpl:async (_url,options) => {
      const {messages} = JSON.parse(options.body);
      assert.deepEqual(JSON.parse(messages[1].content).proposalContext,wanted);
      assert.doesNotMatch(messages[1].content,/sensitive|ou_example|@_user_1/);
      assert.match(messages[0].content,/拟模拟成交参数/);
      return completion('标的是腾讯控股，目前待确认。');
    }});
    assert.equal(await chat({text:'这条是什么情况？',proposalContext:context}),'标的是腾讯控股，目前待确认。');
  }
});

test('group chat blocks generated live claims and bounds plain reply length', async () => {
  for (const answer of ['我已经为你登记了这条建议。','NVDA 当前股价为 130 美元。','{"action":"buy"}']) {
    const chat = createFeishuChatResponder(local,{fetchImpl:async () => completion(answer)});
    await assert.rejects(chat({text:'测试问题'}),{message:'群聊助手暂时不可用。'});
  }
  const long = createFeishuChatResponder(local,{fetchImpl:async () => completion('😀'.repeat(540))});
  const result = await long({text:'测试问题'});
  assert.equal(Array.from(result).length,520);
  assert.equal(result.at(-1),'…');
});

test('group chat can state verified registration without claiming to perform a new action', async () => {
  const proposalContext = {ticker:'NVDA',action:'buy',status:'registered',execution:null};
  const text = '这条登记了吗？';
  const chat = createFeishuChatResponder(local,{fetchImpl:async () => completion('回执显示这条已登记。')});
  assert.equal(await chat({text,proposalContext}),'回执显示这条已登记。');
  await assert.rejects(chat({text}),{message:'群聊助手暂时不可用。'});
  await assert.rejects(chat({text,proposalContext:{...proposalContext,status:'awaiting_approval'}}),
    {message:'群聊助手暂时不可用。'});
  const claimedAction = createFeishuChatResponder(local,{fetchImpl:async () => completion('我刚刚帮你成功登记了。')});
  await assert.rejects(claimedAction({text,proposalContext}),{message:'群聊助手暂时不可用。'});
});

test('the formal extractor repairs a ticker-shaped issuer only with a matching current-message label and unit boundaries', async () => {
  async function read(text, value, evidence, otherFields = {}, conversation = []) {
    const fields = {securityName:{value,evidence},...otherFields};
    const extract = createFeishuLlmExtractor(local,{formalTrades:true,fetchImpl:async () =>
      completion(JSON.stringify({intent:'proposal',fields}))});
    return extract({...input,text,conversation});
  }
  for (const [text,value,evidence] of [
    ['正式建议是买入美股 COST，数量定为 14 股。','COST','美股 COST'],
    ['这次说的是 NASDAQ:QXYZ.','QXYZ','QXYZ'],
    ['这次的股票代码为 BRK-B','BRK-B','BRK-B'],
    ['建议买入美股股票代码 ADC','ADC','ADC'],
    ['建议加仓股票代码 AI','AI','AI'],
    ['建议买入美股 ticker A','A','A'],
  ]) {
    const packet = await read(text,value,evidence);
    assert.deepEqual(packet.fields.ticker,{value:value.replace('-','.'),evidence,requiresListing:true});
    assert.equal(packet.fields.securityName,undefined);
  }
  for (const [text,value,evidence] of [
    ['建议跟踪美股 ETF','ETF','ETF'],['建议关注美股 ROI','ROI','ROI'],
    ['关注美股 AI 板块','AI','AI'],['跟踪股票代码 ADC 的疗法','ADC','ADC'],
    ['看的是美股 ADC 药物','ADC','ADC'],['给美股 COST 的供应商建仓','COST','COST'],
    ['对美股 COSTCO 加仓','COST','COST'],['跟踪美股 QXYZ板块','QXYZ','QXYZ'],
    ['港股代码 COST','COST','COST'],['COST 怎么看','COST','美股 COST'],
  ]) {
    const result = await read(text,value,evidence);
    assert.equal(result.fields.ticker,undefined,text);
    assert.equal(result.fields.securityName,undefined,text);
  }
  const fields = {ticker:{value:'AI',evidence:'AI'}};
  const extract = createFeishuLlmExtractor(local,{formalTrades:true,fetchImpl:async () =>
    completion(JSON.stringify({intent:'proposal',fields}))});
  assert.deepEqual((await extract({...input,text:'这次的股票代码 AI'})).fields.ticker,
    {value:'AI',evidence:'AI',requiresListing:true});
  assert.deepEqual((await extract({...input,text:'说的是美股 AI 板块'})).fields,{});
  const prior = [{role:'user',content:'上条说的是美股 QXYZ'}];
  assert.equal((await read('我说的是 QXYZ','QXYZ','QXYZ',{},prior)).fields.ticker,undefined);
  const conflict = await read('我建议买美股 COST 和股票代码 AAPL','COST','美股 COST',{
    action:{value:'buy',evidence:'建议买'},ticker:{value:'AAPL',evidence:'AAPL'},
  });
  assert.equal(conflict.intent,'ambiguous');
  assert.deepEqual(conflict.fields,{});
});

test('casual and proposal-summary chat both give the loopback model the configured cold-start deadline',async t=>{
  const deadlines=[];
  const original=AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal,'timeout',ms=>{deadlines.push(ms);return original(ms);});
  const responder=createFeishuChatResponder({...local,FEISHU_LLM_TIMEOUT_MS:'35000'},{
    fetchImpl:async()=>completion('在，听到了。'),
  });
  await responder({text:'在吗'});
  await responder({text:'这条进度如何？',proposalContext:{ticker:'NVDA',action:'buy',status:'awaiting_approval'}});
  assert.deepEqual(deadlines,[35000,35000]);
});

test('chat diagnostics expose fixed categories and HTTP status without provider or message text',async()=>{
  const privateText='provider-private-diagnostic-marker';
  const cases=[
    {code:'MODEL_TRANSPORT',request:async()=>{throw Error(privateText);}},
    {code:'MODEL_HTTP',status:503,request:async()=>new Response(privateText,{status:503})},
    {code:'MODEL_OUTPUT',request:async()=>new Response(privateText)},
    {code:'MODEL_TRUNCATED',request:async()=>completion('', 'length')},
    {code:'MODEL_TRUNCATED',request:async()=>completion('不完整的可见内容', 'length')},
    {code:'MODEL_REPLY_BLOCKED',request:async()=>completion('我已经为你登记了这条建议。')},
    {code:'MODEL_TIMEOUT',timeout:'1',request:async()=>{
      await new Promise(resolve=>setTimeout(resolve,15));
      return completion('在。');
    }},
  ];
  for (const {code,status,request,timeout='35000'} of cases) {
    const responder=createFeishuChatResponder({...local,FEISHU_LLM_TIMEOUT_MS:timeout},{fetchImpl:request});
    await assert.rejects(responder({text:privateText}),err=>{
      assert.equal(err.code,code);
      assert.equal(err.status,status);
      assert.equal(err.message,'群聊助手暂时不可用。');
      assert.equal(err.cause,undefined);
      assert.ok(!JSON.stringify(err).includes(privateText));
      return true;
    });
  }
});
