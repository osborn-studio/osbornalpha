import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openFeishuWorkflow } from './feishu-workflow.mjs';
import { createFeishuSecurityLookup } from './feishu-security-lookup.mjs';

const owner = '91000000-0000-4000-8000-00000000000a';
const anotherOwner = '91000000-0000-4000-8000-00000000000b';
const recommendationId = '91000000-0000-4000-8000-00000000000c';
const decisionId = '91000000-0000-4000-8000-00000000000d';
const tradeId = '91000000-0000-4000-8000-00000000000e';
const group = 'oc_demo';
const proposer = 'ou_analyst';
const approver = 'ou_pm';
const proposedAt = '2026-06-16T08:30:00.000Z';
const approvedAt = '2026-06-16T08:31:00.000Z';
const command = '建议｜分析师：张三｜01810.HK｜加仓｜1000股｜模拟成交价：40.20港元｜理由：复核财报';
const quote = (value,evidence = String(value)) => ({value,evidence});
const packet = fields => ({intent:'proposal',fields});
const position = {ticker:quote('01810.HK'),action:quote('add','加仓')};
const signedOrder = (name, overrides = {}) => ({
  ...position, analyst:quote(name,'分析师：'+name), quantity:quote(1000,'1000股'),
  price:quote(40.2,'模拟成交价：40.20港元'), rationale:quote('复核财报','理由：复核财报'), ...overrides,
});
const modelFixtures = new Map([
  [command,packet(signedOrder('张三'))],
  [command.replace('张三','甲组研究员'),packet(signedOrder('甲组研究员'))],
  [command.replace('张三','乙组研究员'),packet(signedOrder('乙组研究员'))],
  [command.replace('1000股',''),packet(signedOrder('张三',{quantity:undefined}))],
  [command.replace('40.20港元','40.20美元'),packet(signedOrder('张三',{price:quote(40.2,'模拟成交价：40.20美元')}))],
  [command.replace('加仓','加仓｜卖出'),{intent:'ambiguous',fields:{}}],
  ['我想买入NVDA',packet({ticker:quote('NVDA'),action:quote('buy','买入')})],
  ['我想买01800.HK或者加仓',{intent:'ambiguous',fields:{}}],
  ['我想买01800.HK 港股 加仓',packet({ticker:quote('01800.HK'),action:quote('add','加仓')})],
  ['00700.HK',packet({ticker:quote('00700.HK')})],
  ['先观望',packet({action:quote('pass','先观望')})],
  ['我建议加仓，参考价 40 港元',packet({action:position.action,reference_price:quote(40,'参考价 40 港元')})],
  ['标的是 01810.HK，目标价 46，止损价 38',packet({
    ticker:position.ticker,target_price:quote(46,'目标价 46'),stop_loss:quote(38,'止损价 38'),
  })],
  ['建议｜加仓｜参考价：40',packet({action:position.action,reference_price:quote(40,'参考价：40')})],
  ['建议｜00700.HK｜100股｜参考价：447',packet({
    ticker:quote('00700.HK'),quantity:quote(100,'100股'),reference_price:quote(447,'参考价：447'),
  })],
  ['买入',packet({action:quote('buy','买入')})],
  ['模拟成交价 446',packet({price:quote(446,'模拟成交价 446')})],
  ['标的 01810.HK',packet({ticker:position.ticker})],
  ['建议｜01810.HK｜参考价：40',packet({ticker:position.ticker,reference_price:quote(40,'参考价：40')})],
  ['建议｜动作：加仓｜分析师：李四',packet({action:position.action,analyst:quote('李四','分析师：李四')})],
  ['加仓',packet({action:position.action})],
  ['建议｜01810.HK｜加仓｜100股',packet({...position,quantity:quote(100,'100股')})],
  ['建议｜01810.HK｜加仓',packet(position)],
]);

async function fixtureModel({text}) {
  const result = modelFixtures.get(text);
  assert.ok(result,'Missing model fixture for '+text);
  return {...result,fields:Object.fromEntries(Object.entries(result.fields).filter(([,value]) => value !== undefined))};
}

function harness(t, patch = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const registrations = [];
  const messages = [];
  let current = Date.parse(approvedAt);
  const config = {
    chatId:group, analystBySender:{[proposer]:'A',ou_second:'B'},
    analystNamesByRole:{A:'张三',B:'李四'},approverIds:[approver], ...patch,
  };
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const options = {
    config:() => config,
    now:() => current,
    extractWithModel:fixtureModel,
    register:async request => {
      registrations.push(request);
      return {id:recommendationId,status:'final',score:{hit:true,score_5d:2.3,hit_10d:false,score_10d:-6.5},
        analystStats:{hits:2,n:3,hitRate:66.67}};
    },
    sendMessage:async message => {
      messages.push(message);
      return {messageId:'om_sent_' + messages.length};
    },
  };
  return {db,config,registrations,messages, advance:ms => { current += ms; },
    open:overrides => openFeishuWorkflow(db,transaction,{...options,...overrides})};
}

function event(n, extra = {}) {
  return {eventId:'event_'+n,messageId:'om_'+n,chatId:group,senderId:proposer,
    createdAt:proposedAt,text:command,directedToBot:true,...extra};
}

function approval(n, parentId = 'om_sent_1', extra = {}) {
  return event(n,{senderId:approver,createdAt:approvedAt,text:'同意',parentId,...extra});
}

test('labeled cash budget and model name evidence produce a single NVDA advice with no fill', async t => {
  const h = harness(t);
  const workflow = h.open({extractWithModel:async () => ({intent:'proposal',fields:{
    action:{value:'buy',evidence:'买20万人民币的英伟达股票'},
    securityName:{value:'英伟达',evidence:'英伟达股票'},
    quantity:{value:200000,evidence:'20万人民币'},
    currency:{value:'CNY',evidence:'20万人民币'},
  }})});
  workflow.receive(event(1,{text:'买20万人民币的英伟达股票',directedToBot:true}));
  await workflow.drain();
  assert.match(h.messages[0].text,/NVDA · US · 买入/);
  assert.match(h.messages[0].text,/仅登记建议/);
  assert.equal(h.messages.length,1);
  assert.equal(h.registrations.length,0);
  workflow.receive(approval(2));
  await workflow.drain();
  assert.equal(h.registrations[0].fields.ticker,'NVDA');
  assert.equal(workflow.view().proposals[0].simulationStatus,'not_requested');
});

test('a Xiaomi listing name, short code and cash budget do not need a ticker correction', async t => {
  const h = harness(t);
  const text = '我要购买小米集团-W (1810) 100万港币用来建仓';
  const workflow = h.open({extractWithModel:async () => packet({
    securityName:quote('小米集团-W'),ticker:quote('1810'),action:quote('buy','购买'),
  })});
  workflow.receive(event(1,{text}));
  await workflow.drain();
  assert.match(h.messages[0].text,/01810.HK · HK · 买入/);
  assert.match(h.messages[0].text,/仅登记建议/);
});

test('named listings are checked against the security master and a conflicting follow-up cannot silently switch issuers', async t => {
  const h = harness(t);
  const listings = [{ticker:'02631.HK',market:'HK'},{ticker:'688234.SH',market:'A'}];
  const queryNames = [];
  const replies = new Map([
    ['我建议加仓天岳先进',packet({securityName:quote('天岳先进'),action:quote('add','加仓')})],
    ['600519.SH',packet({ticker:quote('600519.SH')})],
    ['港的那只',packet({market:quote('HK','港的那只')})],
  ]);
  const workflow = h.open({extractWithModel:async ({text}) => replies.get(text),
    searchSecurity:async name => { queryNames.push(name); return listings; }});
  workflow.receive(event(1,{text:'我建议加仓天岳先进'}));
  await workflow.drain();
  assert.match(h.messages[0].text,/02631\.HK.*688234\.SH/);
  workflow.receive(event(2,{text:'600519.SH',parentId:'om_sent_1',directedToBot:false}));
  await workflow.drain();
  assert.match(h.messages[1].text,/前面提到的是「天岳先进」/);
  assert.deepEqual(workflow.view().proposals,[]);
  workflow.receive(event(3,{text:'港的那只',parentId:'om_sent_2',directedToBot:false}));
  await workflow.drain();
  assert.match(h.messages[2].text,/02631\.HK · HK · 加仓/);
  assert.deepEqual(queryNames,['天岳先进','天岳先进','天岳先进']);
  assert.deepEqual(h.registrations,[]);
});

test('a grounded registration request keeps the issuer, asks for the listing and action, and uses the verified selection', async t => {
  const h = harness(t);
  const request = '麻烦帮我建一条中芯国际的分析建议';
  const next = '港的那只，建议加仓';
  const replies = new Map([
    [request,{...packet({securityName:quote('中芯国际')}),intentEvidence:request}],
    [next,packet({market:quote('HK','港的那只'),action:quote('add','加仓')})],
  ]);
  const queries = [];
  const searchSecurity = createFeishuSecurityLookup({fetchImpl:async url => {
    queries.push(new URL(url).searchParams.get('q'));
    const row = (t,n,m,match_kind) => ({t,n,m,match_kind,selectable:true,verification_status:'verified',list_status:'listed'});
    return Response.json({source:'security-master',results:[
      row('00981.HK','中芯国际','HK','exact_alias'),row('688981.SH','中芯国际','A','exact_alias'),
      row('000928.SZ','中钢国际','A','fuzzy'),
    ]});
  }});
  const workflow = h.open({extractWithModel:async ({text}) => replies.get(text),searchSecurity});
  workflow.receive(event(1,{text:request}));
  await workflow.drain();
  assert.match(h.messages[0].text,/中芯国际.*00981\.HK.*688981\.SH/);
  assert.match(h.messages[0].text,/建议动作/);
  assert.doesNotMatch(h.messages[0].text,/000928|待确认提案/);
  workflow.receive(event(2,{text:next,parentId:'om_sent_1',directedToBot:false}));
  await workflow.drain();
  assert.match(h.messages[1].text,/00981\.HK · HK · 加仓/);
  assert.deepEqual(queries,['中芯国际','中芯国际']);
  assert.deepEqual(h.registrations,[]);
});

test('the group receipt identifies the Beijing suggestion time and New York pricing date', async t => {
  const h = harness(t);
  const workflow = h.open({register:async ({fields}) => ({
    id:recommendationId,status:'pending',recommendation:fields,
    evidence:{disclosure:'基准交易日为 2025-11-24。'},
  })});
  workflow.receive(event(1,{text:'我想买入NVDA',createdAt:'2025-11-25T03:19:13.474Z'}));
  await workflow.drain();
  workflow.receive(approval(2));
  await workflow.drain();
  assert.match(h.messages[1].text,/建议时间（北京时间）2025-11-25 11:19:13/);
  assert.match(h.messages[1].text,/纽约交易日.*2025-11-24/);
});

test('the model interprets directed language and an authorized follow-up without accepting invented fields', async t => {
  const h = harness(t);
  const requests = [];
  const workflow = h.open({extractWithModel:async request => {
    requests.push(request);
    return request.isSupplement
      ? {intent:'proposal',fields:{
        ticker:{value:'00700.HK',evidence:'腾讯控股'},
        price:{value:999,evidence:'腾讯控股'},
        quantity:{value:400,evidence:'腾讯控股'},
      }}
      : {intent:'proposal',fields:{
        action:{value:'add',evidence:'仓位往上调一点'},
        ticker:{value:'01810.HK',evidence:'原文没有的代码'},
      }};
  }});
  const speech = '这只股票的仓位往上调一点';
  assert.equal(workflow.receive(event(1,{text:speech,directedToBot:false})).accepted,false);
  assert.equal(workflow.receive(event(2,{text:speech,directedToBot:true,senderId:'ou_unbound'})).accepted,false);
  assert.equal(workflow.receive(event(3,{text:speech,directedToBot:true})).accepted,true);
  await workflow.drain();
  assert.match(h.messages[0].text,/补充标的代码/);
  assert.equal(workflow.view().proposals.length,0);
  assert.equal(workflow.receive(event(4,{text:'腾讯控股',parentId:'om_sent_1',senderId:'ou_second'})).accepted,false);
  workflow.receive(event(5,{text:'腾讯控股',parentId:'om_sent_1',directedToBot:false}));
  await workflow.drain();
  assert.equal(requests.length,2);
  assert.equal(requests[1].priorFields.action,'add');
  assert.match(h.messages[1].text,/00700.HK · HK · 加仓/);
  assert.match(h.messages[1].text,/仅登记建议/);
  assert.equal(h.registrations.length,0);
  workflow.receive(approval(6,'om_sent_2'));
  await workflow.drain();
  assert.deepEqual(h.registrations.map(r => [r.fields.ticker,r.fields.action]),[['00700.HK','add']]);
});

test('an ambiguous model result requires clarification even when the local fields are complete', async t => {
  const h = harness(t);
  const workflow = h.open({extractWithModel:async () => ({intent:'ambiguous',fields:{}})});
  workflow.receive(event(1,{text:'买入腾讯控股',directedToBot:true}));
  await workflow.drain();
  assert.match(h.messages[0].text,/存在歧义/);
  assert.equal(workflow.view().proposals.length,0);
});

test('an unavailable model asks the analyst to retry before any proposal or registration', async t => {
  const h = harness(t);
  let available = false;
  const workflow = h.open({extractWithModel:async () => {
    if (!available) throw Error('offline');
    return packet({ticker:quote('00700.HK','腾讯控股'),action:quote('buy','买入')});
  }});
  workflow.receive(event(1,{text:'买入腾讯控股',directedToBot:true}));
  await workflow.drain();
  assert.match(h.messages[0].text,/模型.*不可用.*重试/);
  assert.equal(workflow.view().proposals.length,0);
  workflow.receive(approval(2,'om_sent_1'));
  await workflow.drain();
  assert.equal(h.registrations.length,0);
  available = true;
  workflow.receive(event(3,{text:'买入腾讯控股',parentId:'om_sent_1',directedToBot:false}));
  await workflow.drain();
  assert.match(h.messages[1].text,/00700.HK · HK · 买入/);
  assert.equal(workflow.view().proposals.length,1);
  assert.equal(h.registrations.length,0);
});

test('a model omission is clarified and a nonproposal classification creates no proposal', async t => {
  const h = harness(t);
  const requests = [];
  const workflow = h.open({extractWithModel:async request => {
    requests.push(request.text);
    return request.text === command ? packet({ticker:position.ticker}) : {intent:'other',fields:{}};
  }});
  assert.equal(workflow.receive(event(0,{directedToBot:false})).accepted,false);
  workflow.receive(event(1,{text:'买入腾讯控股'}));
  await workflow.drain();
  assert.deepEqual(h.messages,[]);
  workflow.receive(event(2));
  await workflow.drain();
  assert.deepEqual(requests,['买入腾讯控股',command]);
  assert.match(h.messages[0].text,/补充建议动作/);
  assert.equal(workflow.view().proposals.length,0);
});

test('bot conversation replies keep history in the same group and with the original member', async t => {
  const h = harness(t);
  const calls = [];
  const question = '给我一个周会开场点子';
  const response = '可以先请大家分享本周各自的一个小进展。';
  const followup = '能给我一句可直接说的话吗？';
  const member = 'ou_guest_one';
  const stranger = 'ou_guest_two';
  const options = {respondToChat:async request => {
    calls.push(request);
    return request.text === question ? response : '大家好，我们先轮流分享本周做成的一件事。';
  }};
  let workflow = h.open(options);
  assert.equal(workflow.receive(event(1,{text:question,senderId:member,directedToBot:false})).accepted,false);
  assert.equal(workflow.receive(event(2,{text:question,senderId:member})).accepted,true);
  await workflow.drain();
  assert.equal(h.messages[0].replyTo,'om_2');
  assert.equal(h.messages[0].text,response);
  assert.deepEqual(calls.map(({text,history,isAnalyst,isApprover}) => ({text,history,isAnalyst,isApprover})),[
    {text:question,history:[],isAnalyst:false,isApprover:false},
  ]);

  workflow = h.open(options);
  const reply = {text:followup,parentId:'om_sent_1',senderId:member,directedToBot:false};
  assert.equal(workflow.receive(event(3,{...reply,senderId:stranger})).accepted,false);
  assert.equal(workflow.receive(event(4,{...reply,chatId:'oc_wrong'})).accepted,false);
  const ownReply = event(5,reply);
  assert.deepEqual(workflow.receive(ownReply),{accepted:true,duplicate:false});
  assert.deepEqual(workflow.receive(ownReply),{accepted:true,duplicate:true});
  await workflow.drain();
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].history,[{role:'user',content:question},{role:'assistant',content:response}]);
  assert.equal(h.messages[1].replyTo,'om_5');
  assert.match(h.messages[1].text,/大家好/);
  assert.deepEqual(workflow.view().proposals,[]);
  assert.deepEqual(h.registrations,[]);
});

test('a verified bare mention greets the member and accepts their direct chat reply', async t => {
  const h = harness(t);
  const chatCalls = [];
  const extractionCalls = [];
  const workflow = h.open({
    extractWithModel:async request => { extractionCalls.push(request); return {intent:'other',fields:{}}; },
    respondToChat:async request => { chatCalls.push(request); return '可以，请说。'; },
  });
  const mention = {text:'',senderId:approver};
  assert.equal(workflow.receive(event(1,{...mention,directedToBot:false})).accepted,false);
  assert.equal(workflow.receive(event(2,{...mention,chatId:'oc_wrong'})).accepted,false);
  assert.equal(workflow.receive(event(3,mention)).accepted,true);
  await workflow.drain();
  assert.equal(h.messages.length,1);
  assert.equal(h.messages[0].replyTo,'om_3');
  assert.equal(h.messages[0].text,'我在，你想问什么？');
  assert.deepEqual(chatCalls,[]);
  assert.deepEqual(extractionCalls,[]);

  const followup = '可以聊别的话题吗？';
  assert.equal(workflow.receive(event(4,{text:followup,senderId:approver,parentId:'om_sent_1',directedToBot:false})).accepted,true);
  await workflow.drain();
  assert.deepEqual(chatCalls.map(({text,isAnalyst,isApprover}) => [text,isAnalyst,isApprover]),[[followup,false,true]]);
  assert.equal(h.messages[1].replyTo,'om_4');
  assert.equal(h.messages[1].text,'可以，请说。');
  assert.deepEqual(extractionCalls,[]);
  assert.deepEqual(workflow.view().proposals,[]);
  assert.deepEqual(h.registrations,[]);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM feishu_workflow_drafts').get().n,0);
});

test('an analyst can chat and a ticker-only mention does not open a draft in conversation mode', async t => {
  const h = harness(t);
  const extractionCalls = [];
  const chatCalls = [];
  const workflow = h.open({
    extractWithModel:async request => {
      extractionCalls.push(request);
      return request.text === '00700.HK' ? packet({ticker:quote('00700.HK')}) : {intent:'other',fields:{}};
    },
    respondToChat:async request => {
      chatCalls.push(request);
      return request.text === '00700.HK' ? '你想了解这只股票的什么信息？' : '早上好，今天顺利！';
    },
  });
  workflow.receive(event(1,{text:'早呀，今天也加油'}));
  await workflow.drain();
  workflow.receive(event(2,{text:'00700.HK'}));
  await workflow.drain();
  assert.deepEqual(extractionCalls.map(request => request.text),['早呀，今天也加油','00700.HK']);
  assert.deepEqual(chatCalls.map(({text,isAnalyst,isApprover}) => [text,isAnalyst,isApprover]),[
    ['早呀，今天也加油',true,false],['00700.HK',true,false],
  ]);
  assert.deepEqual(h.messages.map(message => message.text),['早上好，今天顺利！','你想了解这只股票的什么信息？']);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM feishu_workflow_drafts').get().n,0);
  assert.deepEqual(workflow.view().proposals,[]);
  assert.deepEqual(h.registrations,[]);
});

test('PM and unbound members can chat without gaining proposal or approval rights from chat', async t => {
  const h = harness(t);
  const chatCalls = [];
  const workflow = h.open({respondToChat:async request => {
    chatCalls.push(request);
    return '你可以和我聊这条消息，登记建议由绑定的分析师提交。';
  }});
  const guest = 'ou_guest';
  assert.equal(workflow.receive(event(1,{senderId:guest})).accepted,true);
  assert.equal(workflow.receive(event(2,{senderId:approver})).accepted,true);
  await workflow.drain();
  assert.deepEqual(chatCalls.map(({isAnalyst,isApprover}) => [isAnalyst,isApprover]),[[false,false],[false,true]]);
  assert.equal(h.messages.length,2);
  assert.ok(h.messages.every(message => !/待确认提案/.test(message.text)));
  assert.deepEqual(workflow.view().proposals,[]);
  assert.deepEqual(h.registrations,[]);

  assert.equal(workflow.receive(event(3)).accepted,true);
  await workflow.drain();
  assert.match(h.messages[2].text,/待确认提案/);
  const {summaryId} = workflow.view().proposals[0];
  workflow.receive(approval(4,summaryId,{senderId:guest,directedToBot:false}));
  workflow.receive(approval(5,'om_sent_2',{directedToBot:false}));
  workflow.receive(approval(6,summaryId,{text:'同意这个方向，改天聊',directedToBot:true}));
  await workflow.drain();
  assert.equal(workflow.view().proposals[0].demoStatus,'awaiting_approval');
  assert.deepEqual(h.registrations,[]);
  workflow.receive(approval(7,summaryId,{directedToBot:false}));
  await workflow.drain();
  assert.equal(h.registrations.length,1);
  assert.equal(h.registrations[0].role,'A');
});

test('PM and the proposal author may ask about a sent summary without approving it', async t => {
  const h = harness(t);
  const chatCalls = [];
  const question = '摘要里的价格是每股还是总额？';
  const answer = '摘要显示每股 40.2 港元。';
  const workflow = h.open({
    extractWithModel:async request => request.text === question ? {intent:'help',fields:{}} : fixtureModel(request),
    respondToChat:async request => {
      chatCalls.push(request);
      return request.proposalContext ? answer : '可以聊聊周会流程。';
    },
  });
  workflow.receive(event(1,{text:'聊聊周会流程',senderId:approver}));
  await workflow.drain();
  workflow.receive(event(2));
  await workflow.drain();
  const {summaryId} = workflow.view().proposals[0];
  const reply = {text:question,parentId:summaryId,directedToBot:false};
  assert.equal(workflow.receive(event(3,{...reply,senderId:'ou_guest'})).accepted,false);
  assert.equal(workflow.receive(event(4,{...reply,senderId:approver,chatId:'oc_wrong'})).accepted,false);
  assert.equal(workflow.receive(event(5,{...reply,senderId:approver})).accepted,true);
  await workflow.drain();
  assert.equal(chatCalls[1].isApprover,true);
  assert.deepEqual(chatCalls[1].history,[]);
  const {status,...context} = chatCalls[1].proposalContext;
  assert.ok(status);
  assert.deepEqual(context,{ticker:'01810.HK',action:'add',execution:{price:40.2,quantity:1000,currency:'HKD',direction:'buy'}});
  const pmAnswer = h.messages.find(message => message.replyTo === 'om_5');
  assert.equal(pmAnswer.text,answer);

  const followup = {text:'同意这条解释。再说一下股数。',senderId:approver,parentId:'om_sent_3',directedToBot:false};
  assert.equal(workflow.receive(event(6,{...followup,senderId:'ou_guest'})).accepted,false);
  assert.equal(workflow.receive(event(7,{...followup,chatId:'oc_wrong'})).accepted,false);
  assert.equal(workflow.receive(event(8,followup)).accepted,true);
  await workflow.drain();
  assert.deepEqual(chatCalls[2].proposalContext,chatCalls[1].proposalContext);
  assert.deepEqual(chatCalls[2].history,[{role:'user',content:question},{role:'assistant',content:answer}]);
  assert.equal(workflow.receive(event(9,reply)).accepted,true);
  await workflow.drain();
  assert.equal(chatCalls[3].isAnalyst,true);
  assert.deepEqual(chatCalls[3].proposalContext,chatCalls[1].proposalContext);
  assert.equal(workflow.view().proposals[0].demoStatus,'awaiting_approval');
  assert.deepEqual(h.registrations,[]);

  workflow.receive(approval(10,summaryId,{directedToBot:false}));
  await workflow.drain();
  assert.equal(h.registrations.length,1);
});

test('help with a Hong Kong draft gives the missing price example in Hong Kong dollars', async t => {
  const h = harness(t);
  const question = '这个价格怎么写？';
  const workflow = h.open({
    extractWithModel:async request => request.text === question ? {intent:'help',helpTopic:'missing',fields:{}} : fixtureModel(request),
  });
  workflow.receive(event(1,{text:'建议｜01810.HK｜加仓｜100股'}));
  await workflow.drain();
  workflow.receive(event(2,{text:question,parentId:'om_sent_1',directedToBot:false}));
  await workflow.drain();
  assert.match(h.messages[1].text,/模拟成交价/);
  assert.match(h.messages[1].text,/港元/);
  assert.doesNotMatch(h.messages[1].text,/美元|USD/);
  assert.deepEqual(workflow.view().proposals,[]);
  assert.deepEqual(h.registrations,[]);
});

test('ordinary chat can wait for the model while the formal approval and receipt proceed', async t => {
  const h = harness(t,{simulationAccount:{confirmed:true,id:owner}});
  let respond;
  const chatAnswer = new Promise(resolve => { respond = resolve; });
  const writes = [];
  const workflow = h.open({register:undefined,respondToChat:() => chatAnswer,
    syncFormal:async request => { writes.push(request); return {recommendationId,decisionId,tradeId}; },
  });
  workflow.receive(event(1,{senderId:'ou_guest',text:'帮我想一句欢迎新同事的话'}));
  const chatting = workflow.drainChat();
  try {
    workflow.receive(event(2));
    await workflow.drainPrimary();
    const {summaryId} = workflow.view().proposals[0];
    assert.ok(summaryId);
    workflow.receive(approval(3,summaryId));
    await workflow.drainPrimary();
    assert.equal(writes.length,1);
    assert.match(h.messages.at(-1).text,/正式系统模拟成交已登记/);
  } finally {
    respond('欢迎加入，期待和你一起工作！');
    await chatting;
  }
  await workflow.drainPrimary();
  assert.match(h.messages.at(-1).text,/欢迎加入/);
  assert.equal(writes.length,1);
});

test('a summary question still gets exact proposal facts if the chat model times out', async t => {
  const h = harness(t);
  const workflow = h.open({respondToChat:async () => { throw Error('model timeout'); }});
  workflow.receive(event(1));
  await workflow.drain();
  const {summaryId} = workflow.view().proposals[0];
  workflow.receive(event(2,{senderId:approver,text:'这条是每股价格吗？',parentId:summaryId,directedToBot:false}));
  await workflow.drain();
  assert.match(h.messages[1].text,/01810\.HK.*1000 股，每股 40\.2 港元/);
  assert.match(h.messages[1].text,/尚未登记/);
  assert.deepEqual(h.registrations,[]);
});

test('a directed usage question receives an example without opening a draft', async t => {
  const h = harness(t);
  const requests = [];
  const workflow = h.open({extractWithModel:async request => {
    requests.push(request);
    return {intent:'help',fields:{}};
  }});
  const text = '我该怎么发买入建议？';
  assert.equal(workflow.receive(event(1,{text,directedToBot:false})).accepted,false);
  assert.equal(workflow.receive(event(2,{text})).accepted,true);
  await workflow.drain();
  assert.equal(requests.length,1);
  assert.equal(requests[0].isSupplement,false);
  assert.deepEqual(requests[0].priorFields,{});
  assert.equal(h.messages.length,1);
  assert.match(h.messages[0].text,/(?:例如|比如|示例)/);
  assert.match(h.messages[0].text,/标的|股票代码/);
  assert.match(h.messages[0].text,/买入/);
  assert.doesNotMatch(h.messages[0].text,/待确认提案/);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM feishu_workflow_drafts').get().n,0);
  assert.deepEqual(workflow.view().proposals,[]);
});

test('help and a request to guess repeat the current missing price, then a concrete reply completes the same draft', async t => {
  const h = harness(t);
  const requests = [];
  const initial = '00700.HK 我想买入200股';
  const help = '我还差什么，该怎么回你？';
  const guess = '这价格我没写，你自己帮我猜一个吧';
  const actual = '350港元';
  const replies = new Map([
    [initial,packet({ticker:quote('00700.HK'),action:quote('buy','买入'),quantity:quote(200,'200股')})],
    [help,{intent:'help',fields:{}}],
    [guess,{intent:'other',fields:{}}],
    [actual,packet({price:quote(350,actual)})],
  ]);
  const workflow = h.open({extractWithModel:async request => {
    requests.push(request);
    return replies.get(request.text);
  }});
  workflow.receive(event(1,{text:initial}));
  await workflow.drain();
  assert.match(h.messages[0].text,/模拟成交价/);
  for (const [index,text] of [help,guess].entries()) {
    const parentId = 'om_sent_' + (index + 1);
    assert.equal(workflow.receive(event(index + 2,{text,parentId,directedToBot:false})).accepted,true);
    await workflow.drain();
    const response = h.messages.at(-1).text;
    assert.match(response,/模拟成交价/);
    assert.doesNotMatch(response,/待确认提案/);
    assert.deepEqual(workflow.view().proposals,[]);
    assert.deepEqual(h.registrations,[]);
  }
  assert.match(h.messages[1].text,/(?:例如|比如|示例)/);
  workflow.receive(event(4,{text:actual,parentId:'om_sent_3',directedToBot:false}));
  await workflow.drain();
  assert.deepEqual(requests.map(request => request.text),[initial,help,guess,actual]);
  for (const request of requests.slice(1)) {
    assert.equal(request.isSupplement,true);
    assert.deepEqual(request.pendingFields,['price']);
    assert.equal(request.priorFields.ticker,'00700.HK');
    assert.equal(request.priorFields.quantity,200);
    assert.equal(request.priorFields.price,undefined);
  }
  assert.match(h.messages[3].text,/200 股 × 350 HKD/);
  assert.equal(workflow.view().proposals.length,1);
  assert.deepEqual(h.registrations,[]);
  workflow.receive(approval(5,'om_sent_4'));
  await workflow.drain();
  assert.equal(h.registrations.length,1);
  assert.equal(h.registrations[0].fields.recommended_at,proposedAt);
});

test('a reply in a verified draft thread can supplement it only for the same member and group', async t => {
  const h = harness(t);
  const requests = [];
  const workflow = h.open({extractWithModel:async request => {
    requests.push(request);
    return fixtureModel(request);
  }});
  workflow.receive(event(1,{text:'我建议加仓，参考价 40 港元'}));
  await workflow.drain();
  const reply = {text:'标的 01810.HK',parentId:'om_middle',rootId:'om_1',directedToBot:false};
  assert.equal(workflow.receive(event(2,{...reply,senderId:'ou_second'})).accepted,false);
  assert.equal(workflow.receive(event(3,{...reply,chatId:'oc_wrong'})).accepted,false);
  assert.equal(workflow.receive(event(4,{...reply,rootId:'om_unknown'})).accepted,false);
  assert.equal(workflow.receive(event(5,reply)).accepted,true);
  await workflow.drain();
  assert.equal(requests.length,2);
  assert.equal(requests[1].isSupplement,true);
  assert.deepEqual(requests[1].pendingFields,['ticker']);
  assert.equal(h.messages[1].replyTo,'om_5');
  assert.match(h.messages[1].text,/01810\.HK · HK · 加仓/);
  assert.match(h.messages[1].text,/参考价 40/);
  assert.equal(workflow.view().proposals.length,1);
  assert.deepEqual(h.registrations,[]);
});

test('an unlinked mention can complete one recent draft and a full new proposal stays separate', async t => {
  const h = harness(t);
  const workflow = h.open();
  workflow.receive(event(1,{text:'我建议加仓，参考价 40 港元'}));
  await workflow.drain();
  workflow.receive(event(2,{text:'我想买入NVDA',createdAt:approvedAt}));
  await workflow.drain();
  assert.match(h.messages[1].text,/NVDA · US · 买入/);
  assert.doesNotMatch(h.messages[1].text,/参考价 40/);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM feishu_workflow_drafts').get().n,1);
  workflow.receive(event(3,{text:'标的 01810.HK',createdAt:approvedAt}));
  await workflow.drain();
  assert.match(h.messages[2].text,/01810\.HK · HK · 加仓/);
  assert.match(h.messages[2].text,/参考价 40/);
  assert.equal(workflow.view().proposals.length,2);
  workflow.receive(approval(4,'om_sent_2'));
  workflow.receive(approval(5,'om_sent_3'));
  await workflow.drain();
  assert.deepEqual(h.registrations.map(({fields}) => [fields.ticker,fields.action,fields.recommended_at]),[
    ['NVDA','buy',approvedAt],
    ['01810.HK','add',proposedAt],
  ]);
});

test('an unlinked mention does not choose between two recent open drafts', async t => {
  const h = harness(t);
  const workflow = h.open();
  workflow.receive(event(1,{text:'我建议加仓，参考价 40 港元'}));
  workflow.receive(event(2,{text:'先观望'}));
  await workflow.drain();
  assert.equal(h.messages.length,2);
  workflow.receive(event(3,{text:'00700.HK'}));
  await workflow.drain();
  assert.deepEqual(workflow.view().proposals,[]);
  workflow.receive(event(4,{text:'标的 01810.HK',parentId:'om_sent_1',directedToBot:false}));
  workflow.receive(event(5,{text:'00700.HK',parentId:'om_sent_2',directedToBot:false}));
  await workflow.drain();
  assert.match(h.messages.find(message => message.replyTo === 'om_4').text,/01810\.HK · HK · 加仓/);
  assert.match(h.messages.find(message => message.replyTo === 'om_5').text,/00700\.HK · HK · 观望/);
  assert.equal(workflow.view().proposals.length,2);
  assert.deepEqual(h.registrations,[]);
});

test('a missing model configuration prompts and keeps the pending advice out of registration', async t => {
  const h = harness(t);
  const workflow = h.open({extractWithModel:undefined});
  workflow.receive(event(1));
  await workflow.drain();
  assert.match(h.messages[0].text,/模型.*不可用.*重试/);
  assert.equal(workflow.view().proposals.length,0);
  assert.equal(h.registrations.length,0);
});

test('recognition of existing pending proposal events is delegated to the configured model', async t => {
  const h = harness(t);
  const seen = [];
  const workflow = h.open({extractWithModel:async request => {
    seen.push(request.text);
    return {intent:'other',fields:{}};
  }});
  const enqueue = h.db.prepare(`INSERT INTO feishu_workflow_events
    (event_id,message_id,chat_id,sender_id,kind,text,received_at) VALUES (?,?,?,?,?,?,?)`);
  for (const kind of ['proposal','proposal_ai']) {
    enqueue.run('event_'+kind,'om_'+kind,group,proposer,kind,command,proposedAt);
  }
  await workflow.drain();
  assert.deepEqual(seen,[command,command]);
  assert.deepEqual(h.messages,[]);
  assert.equal(workflow.view().proposals.length,0);
});

test('a colloquial buy plus add uses the exact HK ticker and the explicit add action', async t => {
  const h = harness(t);
  const workflow = h.open();
  workflow.receive(event(1,{text:'我想买01800.HK或者加仓'}));
  await workflow.drain();
  assert.match(h.messages[0].text,/存在歧义/);
  workflow.receive(event(2,{text:'我想买01800.HK 港股 加仓',parentId:'om_sent_1'}));
  await workflow.drain();
  assert.match(h.messages[1].text,/01800.HK · HK · 加仓/);
  assert.equal(h.registrations.length,0);
  workflow.receive(approval(3,'om_sent_2'));
  await workflow.drain();
  assert.equal(h.registrations.length,1);
  assert.equal(h.registrations[0].fields.ticker,'01800.HK');
  assert.equal(h.registrations[0].fields.action,'add');
});

test('an analyst can mention the bot with just a ticker and reply with the action alone', async t => {
  const h = harness(t);
  const workflow = h.open();
  assert.equal(workflow.receive(event(1,{text:'00700.HK',directedToBot:false})).accepted,false);
  assert.equal(workflow.receive(event(2,{text:'00700.HK',directedToBot:true})).accepted,true);
  await workflow.drain();
  assert.match(h.messages[0].text,/补充建议动作/);
  workflow.receive(event(3,{parentId:'om_sent_1',text:'先观望'}));
  await workflow.drain();
  assert.match(h.messages[1].text,/00700.HK · HK · 观望/);
  assert.equal(h.registrations.length,0);
  workflow.receive(approval(4,'om_sent_2'));
  await workflow.drain();
  assert.equal(h.registrations.length,1);
});

test('asks for missing fields by thread and remembers the original recommendation time after reopening', async t => {
  const h = harness(t);
  let workflow = h.open();
  workflow.receive(event(1,{text:'我建议加仓，参考价 40 港元'}));
  await workflow.drain();
  assert.match(h.messages[0].text,/标的/);
  assert.doesNotMatch(h.messages[0].text,/目标价|止损价|理由|研究/);
  assert.match(h.messages[0].text,/回复这条消息/);
  assert.doesNotMatch(h.messages[0].text,/待确认提案/);
  assert.equal(workflow.view().proposals.length,0);

  workflow = h.open();
  const supplement = {parentId:'om_sent_1',createdAt:approvedAt,text:'标的是 01810.HK，目标价 46，止损价 38'};
  assert.equal(workflow.receive(event(2,{...supplement,senderId:'ou_second'})).accepted,false);
  assert.equal(workflow.receive(event(3,{...supplement,chatId:'oc_wrong'})).accepted,false);
  workflow.receive(approval(4,'om_sent_1'));
  await workflow.drain();
  assert.equal(h.registrations.length,0);
  assert.equal(h.messages.length,1);
  const answer = event(5,supplement);
  assert.deepEqual(workflow.receive(answer),{accepted:true,duplicate:false});
  assert.deepEqual(workflow.receive(answer),{accepted:true,duplicate:true});
  await workflow.drain();
  assert.equal(h.messages[1].replyTo,'om_5');
  assert.match(h.messages[1].text,/待确认提案/);
  assert.match(h.messages[1].text,/参考价 40/);
  assert.match(h.messages[1].text,/目标价 46/);
  assert.match(h.messages[1].text,/止损价 38/);
  assert.equal(workflow.receive(event(6,{...supplement,text:command})).accepted,false);
  workflow.receive(approval(7,'om_sent_2'));
  await workflow.drain();
  assert.equal(h.registrations.length,1);
  const fields = h.registrations[0].fields;
  assert.equal(fields.recommended_at,proposedAt);
  assert.equal(fields.reference_price,40);
  assert.equal(fields.target_price,46);
  assert.equal(fields.stop_loss,38);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM feishu_workflow_drafts').get().n,0);
});

test('two incomplete messages by the same analyst remain separate across repeated follow-ups', async t => {
  const h = harness(t);
  const workflow = h.open();
  workflow.receive(event(1,{text:'建议｜加仓｜参考价：40'}));
  workflow.receive(event(2,{text:'建议｜00700.HK｜100股｜参考价：447'}));
  await workflow.drain();
  assert.equal(h.messages.length,2);
  workflow.receive(event(3,{text:'买入',parentId:'om_sent_2'}));
  await workflow.drain();
  assert.match(h.messages[2].text,/模拟成交价/);
  assert.doesNotMatch(h.messages[2].text,/动作|目标价/);
  workflow.receive(event(4,{text:'模拟成交价 446',parentId:'om_sent_3'}));
  workflow.receive(event(5,{text:'标的 01810.HK',parentId:'om_sent_1'}));
  await workflow.drain();
  assert.equal(workflow.view().proposals.length,2);
  assert.match(h.messages[3].text,/00700.HK/);
  assert.match(h.messages[3].text,/100 股 × 446/);
  assert.match(h.messages[4].text,/01810.HK/);
  assert.match(h.messages[4].text,/参考价 40/);
  assert.match(h.messages[4].text,/仅登记建议/);
});

test('a rejected correction can be repaired by replying directly to its error without losing the draft', async t => {
  const h = harness(t);
  const workflow = h.open();
  workflow.receive(event(1,{text:'建议｜01810.HK｜参考价：40'}));
  await workflow.drain();
  workflow.receive(event(2,{text:'建议｜动作：加仓｜分析师：李四',parentId:'om_sent_1'}));
  await workflow.drain();
  assert.match(h.messages[1].text,/署名/);
  assert.match(h.messages[1].text,/回复这条消息/);
  assert.equal(workflow.view().proposals.length,0);
  workflow.receive(event(3,{text:'加仓',parentId:'om_sent_2'}));
  await workflow.drain();
  assert.equal(workflow.view().proposals.length,1);
  assert.match(h.messages[2].text,/参考价 40/);
  assert.match(h.messages[2].text,/仅登记建议/);
});

test('an analyst may drop an incomplete simulated fill and submit a plain suggestion', async t => {
  const h = harness(t);
  const workflow = h.open();
  workflow.receive(event(1,{text:'建议｜01810.HK｜加仓｜100股'}));
  await workflow.drain();
  assert.match(h.messages[0].text,/模拟成交价/);
  assert.match(h.messages[0].text,/回复「仅登记建议」/);
  workflow.receive(event(2,{parentId:'om_sent_1',text:'仅登记建议'}));
  await workflow.drain();
  assert.match(h.messages[1].text,/待确认提案/);
  assert.match(h.messages[1].text,/仅登记建议/);
  assert.doesNotMatch(h.messages[1].text,/成交申请/);
  workflow.receive(approval(3,'om_sent_2'));
  await workflow.drain();
  assert.equal(h.registrations.length,1);
  assert.equal(workflow.view().proposals[0].simulationStatus,'not_requested');
});

test('an analyst can cancel one of their drafts by reply and late answers cannot reopen it', async t => {
  const h = harness(t);
  const withdrawal = '这条建议先撤了';
  const workflow = h.open({extractWithModel:async request => request.text === withdrawal
    ? {intent:'cancel',fields:{},intentEvidence:withdrawal} : fixtureModel(request)});
  workflow.receive(event(1,{text:'我建议加仓，参考价 40 港元'}));
  workflow.receive(event(2,{text:'先观望'}));
  await workflow.drain();
  assert.equal(workflow.receive(event(3,{text:withdrawal,parentId:'om_sent_1',directedToBot:false})).accepted,true);
  await workflow.drain();
  assert.match(h.messages.find(message => message.replyTo === 'om_3').text,/撤回|取消/);
  workflow.receive(event(4,{text:'标的 01810.HK',parentId:'om_sent_1',directedToBot:false}));
  workflow.receive(event(5,{text:'标的 01810.HK',parentId:'om_sent_1',directedToBot:true}));
  await workflow.drain();
  assert.deepEqual(workflow.view().proposals,[]);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM feishu_workflow_drafts').get().n,1);
  workflow.receive(event(6,{text:'00700.HK',parentId:'om_sent_2',directedToBot:false}));
  await workflow.drain();
  assert.match(h.messages.find(message => message.replyTo === 'om_6').text,/00700\.HK · HK · 观望/);
  assert.equal(workflow.view().proposals.length,1);
  assert.deepEqual(h.registrations,[]);
});

test('only the proposing analyst can cancel a pending summary and a later PM approval has no effect', async t => {
  const h = harness(t,{simulationAccount:{confirmed:true,id:owner}});
  const withdrawal = '我撤回这条提案';
  const formalRequests = [];
  const workflow = h.open({
    extractWithModel:async request => request.text === withdrawal
      ? {intent:'cancel',fields:{},intentEvidence:withdrawal} : fixtureModel(request),
    syncFormal:async request => { formalRequests.push(request); },
  });
  workflow.receive(event(1));
  await workflow.drain();
  const reply = {text:withdrawal,parentId:'om_sent_1',directedToBot:false};
  workflow.receive(event(2,{...reply,senderId:'ou_second'}));
  await workflow.drain();
  assert.equal(workflow.view().proposals[0].demoStatus,'awaiting_approval');
  assert.equal(workflow.receive(event(3,reply)).accepted,true);
  await workflow.drain();
  assert.match(h.messages.find(message => message.replyTo === 'om_3').text,/撤回|取消/);
  workflow.receive(approval(4));
  await workflow.drain();
  assert.equal(workflow.view().proposals[0].demoStatus,'withdrawn');
  assert.equal(workflow.view().proposals[0].approvedAt,null);
  assert.deepEqual(h.registrations,[]);
  assert.deepEqual(formalRequests,[]);
});

test('a cancellation received after PM approval cannot undo the registration', async t => {
  const h = harness(t);
  const withdrawal = '请撤回这条建议';
  const workflow = h.open({extractWithModel:async request => request.text === withdrawal
    ? {intent:'cancel',fields:{},intentEvidence:withdrawal} : fixtureModel(request)});
  workflow.receive(event(1));
  await workflow.drain();
  workflow.receive(approval(2));
  workflow.receive(event(3,{text:withdrawal,parentId:'om_sent_1',directedToBot:false}));
  await workflow.drain();
  assert.equal(workflow.view().proposals[0].demoStatus,'registered');
  assert.equal(workflow.view().proposals[0].approvedAt,approvedAt);
  assert.equal(h.registrations.length,1);
});

test('natural advice-only correction replaces a pending trade with a separately approved recommendation', async t => {
  const h = harness(t,{simulationAccount:{confirmed:true,id:owner}});
  const text = '算了，取消成交，只登记建议';
  const synced = [];
  const workflow = h.open({extractWithModel:async request => request.text === text
    ? packet({executionMode:quote('advice_only','取消成交，只登记建议')}) : fixtureModel(request),
    syncFormal:async request => { synced.push(request); return {recommendationId}; },
  });
  workflow.receive(event(1));
  await workflow.drain();
  workflow.receive(event(2,{text,parentId:'om_sent_1',directedToBot:false}));
  await workflow.drain();
  assert.match(h.messages[1].text,/仅登记建议/);
  assert.doesNotMatch(h.messages[1].text,/模拟成交申请/);
  workflow.receive(approval(3,'om_sent_1'));
  await workflow.drain();
  assert.deepEqual(h.registrations,[]);
  workflow.receive(approval(4,'om_sent_2'));
  await workflow.drain();
  assert.equal(h.registrations.length,1);
  assert.equal(synced.length,1);
  assert.equal(synced[0].execution,undefined);
  assert.equal(synced[0].expectedOwnerId,owner);
});

test('a reply arriving before the prompt send receipt resolves is durably associated with the correct thread', async t => {
  const h = harness(t);
  let workflow;
  workflow = h.open({sendMessage:async m => {
    h.messages.push(m);
    if (h.messages.length === 1) {
      const receipt = workflow.receive(event(2,{parentId:'om_sent_1',text:'标的 01810.HK'}));
      assert.equal(receipt.accepted,true);
    }
    return {messageId:'om_sent_'+h.messages.length};
  }});
  workflow.receive(event(1,{text:'建议｜加仓｜参考价：40'}));
  await workflow.drain();
  assert.equal(workflow.view().proposals.length,1);
  assert.match(h.messages[1].text,/待确认提案/);
});

test('unmapped chats support explicit pairing and send no proposal or trading callbacks', async t => {
  const h = harness(t,{chatId:null});
  let workflow = h.open();
  assert.deepEqual(workflow.receive(event(1)),{accepted:false});
  assert.deepEqual(workflow.receive(approval(2)),{accepted:false});
  assert.deepEqual(workflow.receive(event(3,{text:'联调'})),{accepted:true,duplicate:false});
  workflow = h.open();
  assert.deepEqual(workflow.receive(event(3,{eventId:'second_event_id',text:'联调'})),{accepted:true,duplicate:true});
  await workflow.drain();
  assert.deepEqual(workflow.view().pairings.map(row => [row.chatId,row.senderId,row.reference]),[[group,proposer,'C94348C93EEE']]);
  assert.match(h.messages[0].text,/配对编号 C94348C93EEE/);
  assert.doesNotMatch(h.messages[0].text,/ou_analyst|oc_demo/);
  h.config.chatId = group;
  workflow.receive(event(4,{text:'绑定'}));
  await workflow.drain();
  assert.match(h.messages[1].text,/配对编号 C94348C93EEE/);
  assert.deepEqual(workflow.view().proposals,[]);
  assert.deepEqual(h.registrations,[]);
});

test('a mapped analyst proposal registers only after a mapped approver directly replies to its summary', async t => {
  const h = harness(t);
  const workflow = h.open({syncFormal:async () => assert.fail('unconfigured account must never sync')});
  assert.equal(workflow.receive(event(0,{chatId:'oc_different'})).accepted,false);
  assert.equal(workflow.receive(event(0,{senderId:'ou_unmapped'})).accepted,false);
  assert.equal(workflow.receive(event(1)).accepted,true);
  await workflow.drain();
  assert.match(h.messages[0].text,/分析师 张三/);
  assert.match(h.messages[0].text,/1000 股 × 40.2 HKD/);
  assert.equal(h.messages[0].replyTo,'om_1');
  assert.equal(workflow.view().proposals[0].demoStatus,'awaiting_approval');
  assert.deepEqual(h.registrations,[]);
  assert.equal(workflow.receive(approval(2,'om_sent_1',{senderId:proposer})).accepted,false);
  assert.equal(workflow.receive(approval(2,undefined,{parentId:null,rootId:'om_sent_1'})).accepted,false);
  assert.equal(workflow.receive(approval(2,'om_1',{rootId:'om_sent_1'})).accepted,true);
  await workflow.drain();
  assert.deepEqual(h.registrations,[]);
  assert.equal(workflow.receive(approval(3)).accepted,true);
  await workflow.drain();
  assert.equal(workflow.receive(approval(4)).accepted,true);
  await workflow.drain();
  assert.equal(h.registrations.length,1);
  const [registration] = h.registrations;
  assert.equal(registration.role,'A');
  assert.equal(registration.fields.requestId,registration.proposalId);
  assert.equal(registration.fields.recommended_at,proposedAt);
  assert.equal(registration.fields.ticker,'01810.HK');
  assert.equal(registration.fields.action,'add');
  assert.equal(h.messages.length,2);
  assert.match(h.messages[1].text,/5 日 命中，评分 2.3/);
  assert.match(h.messages[1].text,/10 日 未命中，评分 -6.5/);
  assert.match(h.messages[1].text,/该分析师累计命中率 66\.67%（2\/3）/);
  const status = workflow.view().proposals[0];
  assert.equal(status.approvedAt,approvedAt);
  assert.equal(status.demoStatus,'registered');
  assert.equal(status.formalStatus,'awaiting_account');
  assert.equal(status.simulationStatus,'awaiting_account');
});

test('rejects analysts advertising another name, ambiguous or incomplete simulated orders and currency mismatches', async t => {
  const h = harness(t);
  const workflow = h.open();
  workflow.receive(event(1,{senderId:'ou_second'}));
  workflow.receive(event(2,{text:command.replace('1000股','')}));
  workflow.receive(event(3,{text:command.replace('40.20港元','40.20美元')}));
  workflow.receive(event(4,{text:command.replace('加仓','加仓｜卖出')}));
  await workflow.drain();
  assert.deepEqual(workflow.view().proposals,[]);
  assert.deepEqual(h.registrations,[]);
  assert.match(h.messages[0].text,/署名/);
  assert.match(h.messages[1].text,/格式|股数|数量/);
  assert.match(h.messages[2].text,/币种/);
  assert.match(h.messages[3].text,/存在歧义/);
});

test('only the bound group member can sign with their own formal name or configured group name', async t => {
  const h = harness(t, {analystAliasesByRole:{A:['甲组研究员'],B:['乙组研究员']}});
  const workflow = h.open();
  const sign = name => command.replace('张三', name);
  assert.equal(workflow.receive(event(1, {text:sign('甲组研究员'), senderId:'ou_unbound'})).accepted, false);
  assert.equal(workflow.receive(event(2, {text:sign('甲组研究员'), chatId:'oc_other'})).accepted, false);
  assert.equal(workflow.receive(event(3, {text:sign('甲组研究员'), senderId:approver})).accepted, false);
  workflow.receive(event(4, {text:sign('甲组研究员'), senderId:'ou_second'}));
  workflow.receive(event(5, {text:sign('乙组研究员')}));
  workflow.receive(event(6, {text:sign('甲组研究员')}));
  workflow.receive(event(7));
  await workflow.drain();
  assert.deepEqual(h.messages.map(m => [m.replyTo, /待确认提案/.test(m.text)]),
    [['om_4',false], ['om_5',false], ['om_6',true], ['om_7',true]]);
  assert.match(h.messages[0].text, /署名/);
  assert.match(h.messages[1].text, /署名/);
  assert.match(h.messages[2].text, /分析师 张三/);
  assert.equal(workflow.view().proposals.length, 2);
  workflow.receive(approval(8,'om_sent_3'));
  await workflow.drain();
  assert.deepEqual(h.registrations.map(item => item.role), ['A']);
});

test('malformed aliases and signatures overlapping another role fail before processing events', t => {
  const h = harness(t);
  const workflow = h.open();
  for (const config of [[], {A:'甲组研究员'}, {A:[1]}, {A:['甲\n乙']}, {A:['李四']},
    {A:['甲组研究员'],B:['甲组研究员']}]) {
    h.config.analystAliasesByRole = config;
    assert.throws(() => workflow.receive(event(1)), /群名/);
  }
  assert.deepEqual(h.db.prepare('SELECT COUNT(*) AS n FROM feishu_workflow_events').get().n, 0);
});

test('confirmed formal writes replay with stable identity and pinned account across failure and restart', async t => {
  const h = harness(t,{simulationAccount:{confirmed:true,id:owner}});
  const inputs = [];
  const syncFormal = async input => {
    inputs.push(input);
    if (inputs.length === 1) throw new Error('temporary transport error');
    return {recommendationId,decisionId,tradeId,replayed:true};
  };
  let workflow = h.open({syncFormal});
  workflow.receive(event(1));
  await workflow.drain();
  workflow.receive(approval(2));
  await workflow.drain();
  assert.equal(workflow.view().proposals[0].formalStatus,'pending_formal_sync');
  assert.equal(workflow.view().proposals[0].demoStatus,'registered');
  h.advance(2001);
  workflow = h.open({syncFormal});
  await workflow.drain();
  assert.deepEqual(inputs[0],inputs[1]);
  assert.equal(inputs[0].expectedOwnerId,owner);
  assert.equal(inputs[0].sourceId,h.registrations[0].proposalId);
  assert.equal(inputs[0].analystKey,'A');
  assert.equal(inputs[0].approvedAt,approvedAt);
  assert.equal(inputs[0].recommendation.recommended_at,proposedAt);
  assert.deepEqual(inputs[0].execution,{price:40.2,quantity:1000,fee:0,executed_at:approvedAt});
  assert.equal(workflow.view().proposals[0].formalId,recommendationId);
  assert.equal(workflow.view().proposals[0].tradeId,tradeId);
  assert.match(h.messages.at(-1).text,/正式系统模拟成交已登记/);
});

test('a retry under a different account does not attempt a formal write', async t => {
  const h = harness(t,{simulationAccount:{confirmed:true,id:owner}});
  const inputs = [];
  const syncFormal = async input => {
    inputs.push(input);
    throw new Error('temporary transport error');
  };
  const workflow = h.open({syncFormal});
  workflow.receive(event(1));
  await workflow.drain();
  workflow.receive(approval(2));
  await workflow.drain();
  h.config.simulationAccount.id = anotherOwner;
  h.advance(2001);
  await workflow.drain();
  assert.equal(inputs.length,1);
  assert.equal(inputs[0].expectedOwnerId,owner);
  assert.equal(workflow.view().proposals[0].formalStatus,'blocked');
  assert.equal(workflow.view().proposals[0].simulationStatus,'blocked');
  assert.match(h.messages.at(-1).text,/账户已变更/);
});

test('a proposer cannot approve, and the formal account shown to PM cannot change before approval', async t => {
  const h = harness(t,{simulationAccount:{confirmed:true,id:owner},approverIds:[proposer,approver]});
  const workflow = h.open({syncFormal:async () => assert.fail('changed account must never sync')});
  workflow.receive(event(1));
  await workflow.drain();
  assert.match(h.messages[0].text,/正式模拟账户尾号 00000a/);
  workflow.receive(approval(2,'om_sent_1',{senderId:proposer}));
  await workflow.drain();
  assert.equal(h.registrations.length,0);
  h.config.simulationAccount.id = anotherOwner;
  workflow.receive(approval(3));
  await workflow.drain();
  assert.equal(h.registrations.length,1);
  assert.equal(workflow.view().proposals[0].formalStatus,'blocked');
  assert.match(h.messages.at(-1).text,/联系 PM 核对/);
});

test('upgrades the prior SQLite proposal schema and keeps existing proposals', async t => {
  const h = harness(t);
  h.db.exec(`CREATE TABLE feishu_workflow_proposals (
    id TEXT PRIMARY KEY, origin TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    role TEXT NOT NULL, body TEXT NOT NULL, summary_id TEXT UNIQUE, approval TEXT UNIQUE, approver_id TEXT,
    demo_status TEXT NOT NULL DEFAULT 'awaiting_approval', demo_id TEXT,
    formal_status TEXT NOT NULL DEFAULT 'awaiting_approval', simulation_status TEXT NOT NULL,
    simulation_account TEXT, attempts INTEGER NOT NULL DEFAULT 0, due_at INTEGER NOT NULL DEFAULT 0,
    approved_at TEXT, error TEXT
  );
  INSERT INTO feishu_workflow_proposals (id,origin,chat_id,sender_id,role,body,simulation_status)
    VALUES ('old','om_old','oc_demo','ou_analyst','A','{}','not_requested');`);
  const workflow = h.open();
  assert.equal(workflow.view().proposals[0].id,'old');
  assert.equal(workflow.view().proposals[0].formalId,null);
  assert.equal(h.open().view().proposals[0].id,'old');
});

test('an accepted recommendation without explicit size and price never sends a fill', async t => {
  const h = harness(t,{simulationAccount:{confirmed:true,id:owner}});
  const workflow = h.open({syncFormal:async input => {
    assert.equal(Object.hasOwn(input,'execution'),false);
    return {recommendationId};
  }});
  workflow.receive(event(1,{text:'建议｜01810.HK｜加仓'}));
  await workflow.drain();
  workflow.receive(approval(2));
  await workflow.drain();
  assert.equal(workflow.view().proposals[0].simulationStatus,'not_requested');
  assert.equal(workflow.view().proposals[0].formalStatus,'registered');
  const formalReceipt = h.messages.find(message => /正式系统建议已登记/.test(message.text));
  assert.ok(formalReceipt);
  assert.doesNotMatch(formalReceipt.text,/模拟成交已登记/);
});

test('formal receipt is delivered while an approved Demo registration is still blocked', {timeout:5000}, async t => {
  const h = harness(t,{simulationAccount:{confirmed:true,id:owner}});
  let workflow = h.open();
  workflow.receive(event(1));
  await workflow.drainPrimary();
  workflow.receive(approval(2));
  await workflow.drainPrimary();
  assert.equal(workflow.view().proposals[0].formalStatus,'pending_formal_sync');

  const demoStarted = Promise.withResolvers();
  const demoResult = Promise.withResolvers();
  t.after(() => demoResult.resolve({id:recommendationId}));
  const demoRequests = [];
  const formalRequests = [];
  workflow = h.open({
    register:async request => {
      demoRequests.push(request);
      demoStarted.resolve();
      return demoResult.promise;
    },
    syncFormal:async request => {
      formalRequests.push(request);
      return {recommendationId,decisionId,tradeId};
    },
  });

  const pendingDemo = workflow.drainDemo();
  await demoStarted.promise;
  await workflow.drainPrimary();
  const proposal = workflow.view().proposals[0];
  assert.equal(proposal.demoStatus,'pending');
  assert.equal(proposal.formalStatus,'registered');
  assert.equal(proposal.tradeId,tradeId);
  assert.match(h.messages.at(-1).text,/正式系统模拟成交已登记/);
  assert.equal(formalRequests.length,1);

  demoResult.resolve({id:recommendationId});
  await pendingDemo;
  await workflow.drain();
  assert.equal(workflow.view().proposals[0].demoStatus,'registered');
  assert.equal(formalRequests.length,1);
  assert.equal(demoRequests.length,1);
  assert.equal(h.messages.filter(message => /正式系统模拟成交已登记/.test(message.text)).length,1);
});

test('an issuer interpreted as an explicit US ticker needs an exact listed symbol, then the draft can reach PM', async t => {
  const text = '正式建议是买入美股 COST，数量定为 14 股。';
  const initial = packet({action:quote('buy','买入'),market:quote('US','美股'),quantity:quote(14,'14 股'),
    ticker:{value:'COST',evidence:'美股 COST',requiresListing:true}});
  for (const reason of ['exact','alias','missing','timeout']) {
    const h = harness(t);
    const workflow = h.open({
      extractWithModel:async ({text:input}) => input === text ? initial : packet({price:quote(140,'模拟成交价140美元')}),
      searchSecurity:async query => {
        assert.equal(query,'COST');
        if (reason === 'timeout') throw Error('offline');
        if (reason === 'missing') return [];
        return [{market:'US',ticker:reason === 'exact' ? 'COST' : 'COSTX'}];
      },
    });
    workflow.receive(event(1,{text}));
    await workflow.drain();
    assert.match(h.messages[0].text,/模拟成交价/);
    if (reason === 'exact') {
      assert.doesNotMatch(h.messages[0].text,/标的代码/);
      workflow.receive(event(2,{text:'模拟成交价140美元',parentId:'om_sent_1',directedToBot:false}));
      await workflow.drain();
      assert.match(h.messages[1].text,/COST · US · 买入/);
      assert.match(h.messages[1].text,/14 股 × 140 USD/);
    } else {
      assert.match(h.messages[0].text,/标的代码/);
      assert.match(h.messages[0].text,/读到了 COST.*无法.*核实/);
      assert.deepEqual(workflow.view().proposals,[]);
    }
    assert.deepEqual(h.registrations,[]);
  }
});
