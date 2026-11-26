import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {createFormalFeishuWorkflow} from './feishu-formal.mjs';
import {createFeishuChatResponder, createFeishuLlmExtractor} from './feishu-llm.mjs';

const localBase='http://127.0.0.1:11434/v1';
const cloudBase='https://dashscope.aliyuncs.com/compatible-mode/v1';
const env={
  FEISHU_LLM_BASE_URL:localBase, FEISHU_LLM_MODEL:'local-fixture', FEISHU_LLM_API_KEY:'fixture-local-key',
  FEISHU_LLM_FALLBACK_BASE_URL:cloudBase, FEISHU_LLM_FALLBACK_MODEL:'qwen-flash',
  FEISHU_LLM_FALLBACK_API_KEY:'fixture-cloud-key',
};
const receivedAt='2026-06-16T08:30:00.000Z';
const proposalText='仅登记建议，我想买入00700.HK';
const proposal={intent:'proposal',fields:{
  action:{value:'buy',evidence:'买入'},ticker:{value:'00700.HK',evidence:'00700.HK'},
  executionMode:{value:'advice_only',evidence:'仅登记建议'},
}};
const down=()=>new Response(null,{status:503});
function completion(content) {
  return Response.json({choices:[{finish_reason:'stop',message:{content:typeof content==='string'?content:JSON.stringify(content)}}]});
}

// All network operations terminate in these fixtures, including requests to the formal account.
function modelStub(handleLocal,handleCloud) {
  const calls=[];
  const fetchImpl=async (url,options)=>{
    const body=JSON.parse(options.body);
    const call={url:String(url),options,body,input:JSON.parse(body.messages[1].content)};
    calls.push(call);
    if (call.url===localBase+'/chat/completions') return handleLocal(call);
    if (call.url===cloudBase+'/chat/completions') return handleCloud(call);
    throw Error('Unexpected fixture destination');
  };
  return {calls,fetchImpl,allowCloudFallback:true,formalTrades:true};
}

test('a healthy primary serves chat and extraction; offline callers never use fallback credentials',async t=>{
  const settings={...env,FEISHU_LLM_TIMEOUT_MS:'35000',FEISHU_LLM_FALLBACK_AFTER_MS:'6500'};
  const timeout=AbortSignal.timeout.bind(AbortSignal),deadlines=[];
  t.mock.method(AbortSignal,'timeout',ms=>{deadlines.push(ms);return timeout(ms);});
  const fixtures=[
    [createFeishuChatResponder,{text:'在吗？',isApprover:true},'在。'],
    [createFeishuLlmExtractor,{text:proposalText,receivedAt},proposal],
  ];
  for (const [factory,input,answer] of fixtures) {
    const healthy=modelStub(()=>completion(answer),down);
    assert.deepEqual(await factory(settings,healthy)(input),answer);
    assert.deepEqual(healthy.calls.map(c=>c.url),[localBase+'/chat/completions']);
    const failed=modelStub(down,()=>completion(answer));
    await assert.rejects(factory(settings,{fetchImpl:failed.fetchImpl,formalTrades:true})(input));
    assert.deepEqual(deadlines.splice(0),[6500,35000]);
    assert.deepEqual(failed.calls.map(c=>c.url),[localBase+'/chat/completions']);
  }
});

test('a slow primary yields to one cloud chat request within the configured total deadline',async()=>{
  const settings={...env,FEISHU_LLM_TIMEOUT_MS:'600',FEISHU_LLM_FALLBACK_TIMEOUT_MS:'600'};
  const stall=async({options})=>{await delay(3000,null,{signal:options.signal});return completion('超时答复');};
  for (const [backup,expected] of [[()=>completion({reply:'在，听到了。'}),'在，听到了。'],[stall,undefined]]) {
    const mock=modelStub(stall,backup);
    const before=performance.now();
    const reply=createFeishuChatResponder(settings,mock)({text:'ou_example fixture@example.invalid 91000000-0000-4000-8000-00000000000a 能听到吗？',isApprover:true,
      history:[{role:'assistant',content:'fixture-private-report-rows'}],
      proposalContext:{ticker:'PRIVATE',action:'buy',status:'awaiting_approval'},
      readContext:{source:'formal_report',scope:'named',analyst:'fixture-private-name',sections:['scores']}});
    if (expected) assert.equal(await reply,expected);
    else await assert.rejects(reply,{code:'MODEL_TIMEOUT'});
    assert.ok(performance.now()-before<850,'model attempts exceeded the bounded request window');
    assert.deepEqual(mock.calls.map(c=>c.url),[localBase+'/chat/completions',cloudBase+'/chat/completions']);
    const [local,cloud]=mock.calls;
    assert.ok(local.options.signal.aborted);
    assert.ok(cloud.options.signal instanceof AbortSignal);
    assert.equal(cloud.options.signal.aborted,!expected);
    assert.equal(local.options.headers.Authorization,'Bearer fixture-local-key');
    assert.equal(cloud.options.headers.Authorization,'Bearer fixture-cloud-key');
    assert.equal(cloud.options.redirect,'error');
    assert.equal(cloud.body.model,'qwen-flash');
    assert.match(cloud.input.text,/能听到吗/);
    assert.doesNotMatch(cloud.options.body,/ou_example|fixture@example|91000000-0000|fixture-private|PRIVATE|fixture-cloud-key|fixture-local-key/);
  }
});

test('an unfinished response body is cancelled when its model attempt expires',async()=>{
  const settings={...env,FEISHU_LLM_FALLBACK_AFTER_MS:'60'};
  let cancelled=false;
  const local=new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"choices":')); },
    cancel() { cancelled=true; },
  }));
  const mock=modelStub(()=>local,()=>completion({reply:'收到。'}));
  // A real socket keeps the event loop alive while the response body is open.
  const keepAlive=setTimeout(()=>{},2000);
  try {
    assert.equal(await createFeishuChatResponder(settings,mock)({text:'在吗？'}),'收到。');
    assert.equal(cancelled,true);
    assert.deepEqual(mock.calls.map(c=>c.url),[localBase+'/chat/completions',cloudBase+'/chat/completions']);
  } finally { clearTimeout(keepAlive); }
});

test('Bailian arrears recover the timed-out read locally and suspend that account for chat and extraction',async t=>{
  const settings={...env,FEISHU_LLM_TIMEOUT_MS:'900',FEISHU_LLM_FALLBACK_AFTER_MS:'50'};
  const billing=()=>Response.json({error:{code:'Arrearage',message:'must not reach chat or logs'}},{status:400});
  const calls=[],parsed=[];
  let locals=0,paid=false;
  const mock=modelStub(async({body})=>{
    locals++;
    if (locals===1) {
      // Even a transport that ignores cancellation cannot parse this late reply.
      await delay(170);
      return completion({read:'pending'});
    }
    await delay(85);
    return completion(body.response_format ? proposal : {read:'group_report'});
  },()=>paid ? completion({reply:'在。'}) : billing());
  const options={...mock,onFallback:event=>calls.push(event)};
  const chat=createFeishuChatResponder(settings,options);
  const extract=createFeishuLlmExtractor(settings,options);
  assert.deepEqual(await chat({text:'帮群里整理一份报告',onSentHistory:h=>parsed.push(h)}),{read:'group_report'});
  assert.deepEqual(await extract({text:proposalText,receivedAt}),proposal);
  assert.deepEqual(parsed,[[]]);
  assert.deepEqual(calls,[{component:'chat',success:false,reason:'MODEL_BILLING_ARREARS'}]);
  const origin=call=>new URL(call.url).hostname;
  assert.deepEqual(mock.calls.map(origin),['127.0.0.1','dashscope.aliyuncs.com','127.0.0.1','127.0.0.1']);
  paid=true;
  const now=Date.now();
  t.mock.method(Date,'now',()=>now+300_001);
  assert.equal(await chat({text:'在吗？'}),'在。');
  assert.deepEqual(mock.calls.slice(-2).map(origin),['127.0.0.1','dashscope.aliyuncs.com']);
});

test('other HTTP 400 errors and raw Arrearage messages never retry inference or open a billing circuit',async()=>{
  const settings={...env,FEISHU_LLM_TIMEOUT_MS:'500',FEISHU_LLM_FALLBACK_AFTER_MS:'30'};
  const mock=modelStub(async({options})=>{await delay(300,null,{signal:options.signal});},()=>
    Response.json({error:{code:'BadRequest',message:'Arrearage'}},{status:400}));
  const chat=createFeishuChatResponder(settings,mock);
  for (let i=0;i<2;i++) await assert.rejects(chat({text:'能看到我吗？'}),{code:'MODEL_HTTP',status:400});
  assert.equal(mock.calls.length,4);
});

test('a billing-recovery attempt keeps the original deadline, and key rotation can use a healthy backup',async()=>{
  const settings={...env,FEISHU_LLM_TIMEOUT_MS:'240',FEISHU_LLM_FALLBACK_AFTER_MS:'30'};
  const timeout=async({options})=>{await delay(700,null,{signal:options.signal});};
  const mock=modelStub(timeout,({options})=>options.headers.Authorization==='Bearer rotated-fixture-key' ?
    completion({reply:'收到。'}) : Response.json({code:'Arrearage'},{status:400}));
  const chat=createFeishuChatResponder(settings,mock);
  const before=performance.now();
  await assert.rejects(chat({text:'继续说'}),{code:'MODEL_TIMEOUT'});
  assert.ok(performance.now()-before<450);
  settings.FEISHU_LLM_FALLBACK_API_KEY='rotated-fixture-key';
  assert.equal(await createFeishuChatResponder(settings,mock)({text:'在吗？'}),'收到。');
  assert.equal(mock.calls.length,5);
});

test('provider output and model authorization errors fail closed',async()=>{
  for (const [factory,input,unsafe] of [
    [createFeishuChatResponder,{text:'了解了',isApprover:true},'我已经为你登记了这条建议。'],
    [createFeishuChatResponder,{text:'帮我看看',isApprover:true},{read:'approve'}],
    [createFeishuLlmExtractor,{text:proposalText,receivedAt},{intent:'read',fields:{},query:{read:'approve'}}],
  ]) {
    const rejected=modelStub(()=>completion(unsafe),()=>completion(unsafe));
    await assert.rejects(factory(env,rejected)(input));
    assert.equal(rejected.calls.length,1,'a rejected local answer must end the request');
    const cloudAnswer=typeof unsafe==='string'?{reply:unsafe}:unsafe;
    const rejectedCloud=modelStub(down,()=>completion(cloudAnswer));
    await assert.rejects(factory(env,rejectedCloud)(input));
    assert.equal(rejectedCloud.calls.length,2);
    const unauthorized=modelStub(()=>new Response(null,{status:401}),()=>completion(unsafe));
    await assert.rejects(factory(env,unauthorized)(input));
    assert.equal(unauthorized.calls.length,1);
  }
});

test('a completion with no visible answer can use backup; refusal and function calls stop inference',async()=>{
  const chatInput={text:'你还在吗',isAnalyst:true};
  const cases=[
    ['stop',{content:'   '},true],
    ['stop',{content:'<think>fixture reasoning</think>'},true],
    ['stop',{content:null,reasoning_content:'fixture reasoning'},true],
    ['length',{content:''},true],
    ['content_filter',{content:''},false],
    ['stop',{content:'',refusal:'fixture refusal'},false],
    ['tool_calls',{content:'',tool_calls:[{type:'function'}]},false],
    ['stop',{content:'',function_call:{name:'unavailable'}},false],
    ['stop',{content:null},false],
    ['stop',{content:'<think>one</think>我已经为你登记了。<think>two</think>'},false],
  ];
  for (const [finish_reason,message,retry] of cases) {
    const mock=modelStub(()=>Response.json({choices:[{finish_reason,message}]}),()=>completion({reply:'在。'}));
    const reply=createFeishuChatResponder(env,mock)(chatInput);
    if (retry) assert.equal(await reply,'在。');
    else await assert.rejects(reply,undefined,JSON.stringify({finish_reason,message}));
    assert.equal(mock.calls.length,retry?2:1);
  }
});

test('a backup read keeps the prior report subject local and yields to a recovered primary on the next turn',async()=>{
  const query={read:'formal_report',scope:'context',sections:['trades']};
  const context={source:'formal_report',scope:'named',analyst:'fixture-private-analyst',sections:['scores']};
  const input={text:'那她后来有什么模拟交易？',isApprover:true,readContext:context};
  let recovered=false;
  const mock=modelStub(()=>recovered?completion(query):down(),()=>completion(query));
  const respond=createFeishuChatResponder(env,mock);
  assert.deepEqual(await respond(input),query);
  assert.deepEqual(mock.calls[1].input.readContext,{source:'formal_report',scope:'named',sections:['scores']});
  assert.doesNotMatch(mock.calls[1].options.body,/fixture-private-analyst/);
  recovered=true;
  assert.deepEqual(await respond(input),query);
  assert.deepEqual(mock.calls.map(c=>c.url),[localBase+'/chat/completions',cloudBase+'/chat/completions',localBase+'/chat/completions']);
});

test('cloud conversation accepts a single reply or a permitted read and withholds unverified account figures',async()=>{
  const input={text:'我这边情况如何？',isApprover:true};
  for (const packet of ['在。',{reply:'在。',read:'pending'},{reply:{read:'pending'}},{reply:'{"read":"pending"}'}]) {
    const mock=modelStub(down,()=>completion(packet));
    await assert.rejects(createFeishuChatResponder(env,mock)(input));
    assert.equal(mock.calls.length,2);
  }
  for (const statement of ['你手头有 2 条待确认的提案','手上还压着两笔需要点头的单子','命中率为八成','暂无模拟成交']) {
    const mock=modelStub(down,()=>completion({reply:statement}));
    const answer=await createFeishuChatResponder(env,mock)(input);
    assert.equal(typeof answer,'string');
    assert.match(answer,/待办.*评分.*模拟成交/);
    assert.doesNotMatch(answer,/2 条|两笔|八成|暂无模拟成交/);
    assert.deepEqual(mock.calls[1].body.response_format,{type:'json_object'});
  }
});

test('invalid backup configuration and sensitive current text keep cloud credentials off the wire',async()=>{
  const lookalike='https://dashscope.aliyuncs.com.example.invalid/compatible-mode/v1';
  const query='我想看看今天的待办';
  const cases=[
    ...[lookalike,cloudBase.replace('https:','http:'),localBase,cloudBase+'?key=fixture',
      cloudBase.replace('/compatible-mode','/unrelated'),cloudBase.replace('.com/','.com:8443/'),
      cloudBase.replace('https://','https://user@')].map(base=>[{FEISHU_LLM_FALLBACK_BASE_URL:base},query]),
    [{FEISHU_LLM_FALLBACK_MODEL:''},query],[{FEISHU_LLM_FALLBACK_API_KEY:''},query],
    [{FEISHU_LLM_FALLBACK_TIMEOUT_MS:'0'},query],[{FEISHU_LLM_FALLBACK_AFTER_MS:'-1'},query],
    [{},'这个是 fixture-cloud-key'],[{},'Authorization: Bearer fixture-secret-token'],
    [{},'检查一下这个 https://example.invalid/open-apis/bot/v2/hook/fixture'],
  ];
  for (const [patch,text] of cases) {
    const mock=modelStub(down,()=>completion({reply:'在。'}));
    await assert.rejects(createFeishuChatResponder({...env,...patch},mock)({text,isApprover:true}));
    assert.deepEqual(mock.calls.map(c=>c.url),[localBase+'/chat/completions']);
    assert.doesNotMatch(JSON.stringify(mock.calls[0].options.headers),/fixture-cloud-key/);
  }
});

test('failed extraction sends the current message and retains only fields supported by its evidence',async()=>{
  const offline=()=>{throw new TypeError('Local fixture is offline');};
  const mock=modelStub(offline,()=>completion({...proposal,fields:{...proposal.fields,
    quantity:{value:800,evidence:'800股'}}}));
  const result=await createFeishuLlmExtractor(env,mock)({text:proposalText,receivedAt,
    conversation:[{role:'user',content:'fixture-private-history 800股'}],
    priorFields:{rationale:'fixture-private-rationale',analyst:'fixture-private-analyst'},
    readContext:{source:'formal_report',scope:'named',analyst:'fixture-private-label',sections:['scores']}});
  assert.deepEqual(result,proposal);
  assert.equal(mock.calls.length,2);
  const cloud=mock.calls[1];
  assert.equal(cloud.input.text,proposalText);
  assert.doesNotMatch(JSON.stringify(cloud.input),/fixture-private|800股/);
  assert.deepEqual(cloud.body.response_format,{type:'json_object'});
});

test('formal workflow executes a scoped read and registers a cloud-extracted proposal once after PM approval',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'feishu-fallback-'));
  const chatId='oc_fallback_fixture',author='ou_fallback_author',pm='ou_fallback_pm';
  const account='91000000-0000-4000-8000-00000000000a',role='analyst-a';
  const formalOrigin='https://formal-fixture.invalid';
  const readText='我写过的东西还留着哪些',report='正式建议查询返回了测试记录';
  const chatText='能听到我这句话吗？',chatReply='听到了。';
  const selfOnly='我写下的那些主意还有什么';
  const reads=[],writes=[],messages=[],unexpected=[],diagnostics=[];
  t.mock.method(console,'info',(...args)=>diagnostics.push(args));
  const model=modelStub(down,({input})=>{
    if (input.text===readText) return completion({intent:'read',fields:{},query:{
      read:'formal_report',scope:'self',sections:['recommendations']}});
    if (input.text===selfOnly) return completion({intent:'read',fields:{},query:{
      read:'formal_report',scope:'all',sections:['recommendations']}});
    if (input.text===proposalText) return completion(proposal);
    if (input.text===chatText) return completion({reply:chatReply});
    unexpected.push(input.text);
    throw Error('Unexpected fixture question');
  });
  t.mock.method(globalThis,'fetch',async(raw,options)=>{
    const url=new URL(String(raw));
    if (url.origin===formalOrigin && url.pathname==='/api/integrations/feishu/overview') {
      reads.push({method:options.method,scope:Object.fromEntries(url.searchParams),headers:options.headers});
      return Response.json({text:report});
    }
    if (url.origin===formalOrigin && url.pathname==='/api/integrations/feishu/simulation') {
      writes.push({method:options.method,body:JSON.parse(options.body),headers:options.headers});
      return Response.json({recommendationId:'91000000-0000-4000-8000-00000000000c',replayed:false});
    }
    return model.fetchImpl(url,options);
  });
  let flow;
  t.after(async()=>{try{await flow?.close();}finally{rmSync(directory,{recursive:true,force:true});}});
  writeFileSync(join(directory,'feishu-bindings.json'),JSON.stringify({chatId,approverIds:[pm],analystBySender:{[author]:role},
    analystNamesByRole:{[role]:'示例分析师'},simulationAccount:{id:account,confirmed:true}}));
  writeFileSync(join(directory,'feishu-report-delivery.json'),JSON.stringify({mode:'app',chatId}));
  const open=()=>createFormalFeishuWorkflow({
    env:{...env,FEISHU_DATA_DIR:directory,FEISHU_SIMULATION_ORIGIN:formalOrigin,FEISHU_SIMULATION_INGEST_TOKEN:'fixture-ingest-key'},
    searchSecurity:async()=>[],sendMessage:async message=>{messages.push(message);return {messageId:'om_sent_'+messages.length};},
  });
  const event=(id,text,senderId,extra={})=>({eventId:'ev_'+id,messageId:'om_'+id,chatId,senderId,text,
    createdAt:receivedAt,directedToBot:true,...extra});
  const send=async event=>{
    assert.equal(flow.receive(event).accepted,true);
    await flow.drain();
  };
  flow=open();
  assert.equal(flow.receive(event(0,proposalText,author,{chatId:'oc_other'})).accepted,false);
  await send(event(1,chatText,pm));
  assert.equal(messages.at(-1).text,chatReply);
  await send(event(2,readText,author));
  assert.equal(messages.at(-1).text,report);
  await send(event('wider',selfOnly,author));
  assert.deepEqual(reads,[{method:'GET',scope:{owner:account,analyst:role,sections:'recommendations'},
    headers:{authorization:'Bearer fixture-ingest-key'}}]);
  const submitted=event(3,proposalText,author);
  await send(submitted);
  assert.equal(flow.receive(submitted).duplicate,true);
  const [pending]=flow.view().proposals;
  assert.equal(pending.formalStatus,'awaiting_approval');
  assert.equal(flow.receive(event(4,'同意',author,{parentId:pending.summaryId,directedToBot:false})).accepted,false);
  assert.deepEqual(writes,[]);
  const approval=event(5,'同意',pm,{parentId:pending.summaryId,directedToBot:false});
  await send(approval);
  await flow.close();
  flow=open();
  assert.equal(flow.receive(approval).duplicate,true);
  await send(event(6,'同意',pm,{parentId:pending.summaryId,directedToBot:false}));
  assert.deepEqual(flow.view().proposals.map(p=>p.formalStatus),['registered']);
  assert.equal(writes.length,1);
  assert.equal(writes[0].method,'POST');
  assert.equal(writes[0].body.sourceId,pending.id);
  assert.equal(writes[0].body.recommendation.ticker,'00700.HK');
  assert.deepEqual(writes[0].headers,{authorization:'Bearer fixture-ingest-key','content-type':'application/json'});
  assert.deepEqual(unexpected,[]);
  assert.equal(diagnostics.length,4);
  assert.doesNotMatch(JSON.stringify(diagnostics),/怎么|00700|fixture|留着|听到|主意/);
  assert.deepEqual(model.calls.map(c=>[c.body.model,c.input.text]),
    [chatText,readText,selfOnly,proposalText].flatMap(text=>[['local-fixture',text],['qwen-flash',text]]));
});

test('a late local completion cannot delay either receipt or duplicate a cloud-extracted fill',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'feishu-late-local-'));
  const chatId='oc_receipts',author='ou_author',pm='ou_pm';
  const formalOrigin='https://formal-fixture.invalid';
  const thresholdMs=80;
  const releaseLocal=Promise.withResolvers();
  const localStarted=Promise.withResolvers();
  const writeStarted=Promise.withResolvers();
  const releaseWrite=Promise.withResolvers();
  // Release even a transport that ignores AbortSignal so a broken deadline fails without hanging the suite.
  const watchdog=setTimeout(releaseLocal.resolve,thresholdMs+1000);
  let localReturned=false,flow;
  const messages=[],writes=[];
  const model=modelStub(async()=>{
    localStarted.resolve();
    await releaseLocal.promise;
    localReturned=true;
    return completion({intent:'other',fields:{}});
  },()=>completion({intent:'proposal',fields:{
    action:{value:'buy',evidence:'买入'},ticker:{value:'NVDA',evidence:'NVDA'},
    quantity:{value:2,evidence:'2 股'},price:{value:150,evidence:'150 美元'},
    currency:{value:'USD',evidence:'美元'},executionMode:{value:'simulate',evidence:'模拟买入'},
  }}));
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if (String(url)!==formalOrigin+'/api/integrations/feishu/simulation') return model.fetchImpl(url,options);
    writes.push(JSON.parse(options.body));
    writeStarted.resolve();
    await releaseWrite.promise;
    return Response.json({recommendationId:'91000000-0000-4000-8000-00000000000c',
      decisionId:'91000000-0000-4000-8000-00000000000d',tradeId:'91000000-0000-4000-8000-00000000000e'});
  });
  t.after(async()=>{
    clearTimeout(watchdog);
    releaseLocal.resolve();releaseWrite.resolve();
    try { await flow?.close(); } finally { rmSync(directory,{recursive:true,force:true}); }
  });
  writeFileSync(join(directory,'feishu-bindings.json'),JSON.stringify({chatId,approverIds:[pm],
    analystBySender:{[author]:'analyst-a'},analystNamesByRole:{'analyst-a':'示例分析师'},
    simulationAccount:{id:'91000000-0000-4000-8000-00000000000a',confirmed:true}}));
  flow=createFormalFeishuWorkflow({wake:()=>{},searchSecurity:async()=>[],
    env:{...env,FEISHU_DATA_DIR:directory,FEISHU_LLM_TIMEOUT_MS:'35000',FEISHU_LLM_FALLBACK_AFTER_MS:String(thresholdMs),
      FEISHU_SIMULATION_ORIGIN:formalOrigin,FEISHU_SIMULATION_INGEST_TOKEN:'fixture-ingest-key'},
    sendMessage:async({text})=>{messages.push(text);return {messageId:'om_sent_'+messages.length};},
  });
  const submission={eventId:'ev_s',messageId:'om_s',chatId,senderId:author,createdAt:receivedAt,
    directedToBot:true,text:'我建议模拟买入 NVDA 2 股，每股模拟成交价 150 美元。'};
  assert.equal(flow.receive(submission).duplicate,false);
  const interpreting=flow.drainPrimary();
  await localStarted.promise;
  assert.equal(flow.receive(submission).duplicate,true);
  await flow.drainReceipts();
  assert.deepEqual(messages,['收到，正在处理这条消息。']);
  assert.equal(model.calls.length,1);
  await interpreting;
  await flow.drainProposalReplies();
  assert.equal(localReturned,false);
  assert.equal(model.calls[0].options.signal.aborted,true);
  assert.match(messages.at(-1),/待确认提案/);
  const [pending]=flow.view().proposals;
  assert.equal(writes.length,0);

  const approval={...submission,eventId:'ev_a',messageId:'om_a',senderId:pm,
    parentId:pending.summaryId,directedToBot:false,text:'同意'};
  assert.equal(flow.receive(approval).duplicate,false);
  const writing=flow.drainFormal();
  await writeStarted.promise;
  assert.equal(flow.receive(approval).duplicate,true);
  await flow.drainReceipts();
  assert.match(messages.at(-1),/已收到你的确认/);
  assert.equal(flow.view().proposals[0].formalStatus,'pending_formal_sync');
  releaseLocal.resolve();releaseWrite.resolve();
  await writing;
  await flow.drain();
  assert.equal(localReturned,true);
  assert.deepEqual(model.calls.map(call=>call.url),[localBase+'/chat/completions',cloudBase+'/chat/completions']);
  assert.deepEqual(writes.map(write=>write.sourceId),[pending.id]);
  assert.equal(writes[0].execution.quantity,2);
  assert.deepEqual(flow.view().proposals.map(p=>p.formalStatus),['registered']);
  assert.equal(messages.length,4); // Input receipt, summary, confirmation receipt, formal result.
  assert.match(messages.at(-1),/模拟成交已登记/);
});
