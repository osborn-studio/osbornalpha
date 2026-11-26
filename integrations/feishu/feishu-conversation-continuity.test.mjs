import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {openFeishuWorkflow} from './feishu-workflow.mjs';

const rosterQuestion = '本群分析师有哪些';
const followup = '你刚刚列的第二个是谁？';
const report = '示例分析师乙本期得分 84，已评分建议 5 条。';
const account = '91000000-0000-4000-8000-00000000000b';

function conversation(t, options = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const config = {chatId:'group', approverIds:['pm'], analystBySender:{a:'analystA',b:'analystB',c:'analystC'},
    analystNamesByRole:{analystA:'analystA',analystB:'analystB',analystC:'analystC'}, analystAliasesByRole:{analystA:['示例分析师甲'],analystB:['示例分析师乙'],analystC:['示例分析师丙']},
    simulationAccount:{id:account,confirmed:true}};
  let time = Date.UTC(2026,10,26);
  let sequence = 0;
  const messages = [], modelCalls = [], writes = [];
  const sendMessage = async request => {
    if (options.sendError) throw Object.assign(new Error('delivery failed'),{retriable:false});
    const messageId = 'out_' + (messages.length + 1);
    messages.push({...request,messageId});
    if (options.webhook && request.formalReport) return {deliveredToWebhook:true};
    return {messageId};
  };
  sendMessage.formalReportWebhook = options.webhook === true;
  const flow = openFeishuWorkflow(db, operation => operation(), {
    now:() => time, config:() => config, sendMessage,
    respondToChat:async request => {
      modelCalls.push(request);
      return options.reply?.(request) ?? '我看到了。';
    },
    register:async input => {writes.push(input); throw new Error('unexpected registration');},
    syncFormal:async input => {writes.push(input); throw new Error('unexpected sync');},
    queryFormal:async () => report,
    ...options.services,
  });
  const receive = (text, patch) => {
    sequence++;
    return flow.receive({eventId:'event_' + sequence,messageId:'in_' + sequence,chatId:'group',senderId:'pm',
      directedToBot:true,text,...patch});
  };
  const ask = async (text, patch) => {
    assert.equal(receive(text,patch).accepted,true,text);
    await flow.drain();
    return messages.at(-1);
  };
  return {flow,config,receive,ask,messages,modelCalls,writes,advance:ms => {time += ms;}};
}

test('a semantic roster request uses the current group bindings and becomes the source for the next reply', async t => {
  const question = '这里有哪几位同事以研究员身份给大家交意见？';
  const h = conversation(t,{reply:({text}) => text === question ? {read:'analyst_roster'} : '第二位是示例分析师乙。'});
  const roster = await h.ask(question);
  assert.equal(h.modelCalls.length,1);
  assert.match(roster.text,/示例分析师甲（analystA）\n示例分析师乙（analystB）\n示例分析师丙（analystC）/);
  await h.ask(followup,{parentId:roster.messageId,directedToBot:false});
  assert.deepEqual(h.modelCalls.at(-1).history,[
    {role:'user',content:question},{role:'assistant',content:roster.text},
  ]);
  const restricted = await h.ask(question,{senderId:'guest'});
  assert.doesNotMatch(restricted.text,/示例分析师乙|analystA/);
  assert.deepEqual(h.writes,[]);
});

for (const quoted of [false,true]) {
  test('PM can refer to the delivered roster ' + (quoted ? 'by replying without a mention' : 'in the next mention'), async t => {
    const h = conversation(t);
    const roster = await h.ask(rosterQuestion);
    assert.match(roster.text,/示例分析师甲（analystA）\n示例分析师乙（analystB）\n示例分析师丙（analystC）/);
    assert.equal(h.modelCalls.length,0);
    await h.ask(followup,quoted ? {parentId:roster.messageId,directedToBot:false} : {});
    const call = h.modelCalls.at(-1);
    assert.equal(call.text,followup);
    assert.ok(call.history.some(m => m.role === 'assistant' && m.content.includes('示例分析师乙（analystB）')),JSON.stringify(call.history));
    assert.deepEqual(h.flow.view().proposals,[]);
    assert.deepEqual(h.writes,[]);
  });
}

test('an analyst can discuss their roster reply without creating an investment suggestion', async t => {
  const h = conversation(t,{services:{extractWithModel:async () => ({intent:'other',fields:{}})}});
  const message = await h.ask(rosterQuestion,{senderId:'a'});
  await h.ask(followup,{senderId:'a',parentId:message.messageId,directedToBot:false});
  const call = h.modelCalls.at(-1);
  assert.equal(call.isAnalyst,true);
  assert.ok(call.history.some(m => m.role === 'assistant' && m.content.includes('示例分析师乙（analystB）')));
  assert.deepEqual(h.flow.view().proposals,[]);
  assert.deepEqual(h.writes,[]);
});

test('keeps the referenced list alongside the last two follow-ups during a longer exchange', async t => {
  const h = conversation(t);
  const roster = await h.ask(rosterQuestion);
  for (const text of ['这里有几个人？','那第一位呢？','再说一下第二位？','最后一位呢？']) {
    await h.ask(text);
  }
  const history = h.modelCalls.at(-1).history;
  assert.equal(history.length,6);
  assert.equal(history[1].content,roster.text);
  assert.deepEqual(history.filter(m => m.role === 'user').slice(1).map(m => m.content),['那第一位呢？','再说一下第二位？']);
});

test('PM can discuss a delivered todo reply without approving a pending proposal', async t => {
  // The command matcher normally reads its local OStag checkout. Keep this test independent of that installation.
  const recipe = mkdtempSync(join(tmpdir(),'osborn-todo-test-'));
  const previous = process.env.OSTAG_PROJECT_DIR;
  t.after(() => {
    if (previous === undefined) delete process.env.OSTAG_PROJECT_DIR;
    else process.env.OSTAG_PROJECT_DIR = previous;
    rmSync(recipe,{recursive:true,force:true});
  });
  const directory = join(recipe,'ostag','workflows');
  mkdirSync(directory,{recursive:true});
  writeFileSync(join(directory,'osbornalpha.json'),JSON.stringify([{pattern:'待办'}]));
  process.env.OSTAG_PROJECT_DIR = recipe;
  const h = conversation(t,{services:{
    classifyAssistantCommand:async () => ({intent:'pending'}),
    extractWithModel:async () => ({intent:'proposal',fields:{
      action:{value:'add',evidence:'加仓'},ticker:{value:'01810.HK',evidence:'01810.HK'},
    }}),
  }});
  await h.ask('建议加仓 01810.HK',{senderId:'a'});
  const pending = await h.ask('待办');
  assert.match(pending.text,/本群待确认 1 条/);
  const answer = await h.ask('这是要我处理的吗？',{parentId:pending.messageId,directedToBot:false});
  assert.ok(h.modelCalls.at(-1).history.some(m => m.role === 'assistant' && m.content.includes('01810.HK')));
  h.receive('同意',{parentId:answer.messageId,directedToBot:false});
  await h.flow.drain();
  assert.equal(h.flow.view().proposals.length,1);
  assert.equal(h.flow.view().proposals[0].demoStatus,'awaiting_approval');
  assert.deepEqual(h.writes,[]);
});

test('ambient remarks, other members, other groups and expired business turns stay out of chat history', async t => {
  const h = conversation(t);
  const roster = await h.ask(rosterQuestion);
  assert.equal(h.receive('未提及机器人的私人讨论',{directedToBot:false}).accepted,false);
  assert.equal(h.receive(followup,{parentId:roster.messageId,directedToBot:false,senderId:'guest'}).accepted,false);
  assert.equal(h.receive(followup,{parentId:roster.messageId,chatId:'other_group'}).accepted,false);
  await h.ask(followup,{senderId:'guest'});
  assert.deepEqual(h.modelCalls.at(-1).history,[]);
  h.advance(30 * 60_000 + 1);
  await h.ask(followup);
  assert.deepEqual(h.modelCalls.at(-1).history,[]);
  assert.deepEqual(h.writes,[]);
});

test('undelivered roster content never appears in the next model request', async t => {
  const h = conversation(t,{sendError:true});
  await h.ask(rosterQuestion);
  await h.ask(followup);
  assert.deepEqual(h.modelCalls.at(-1).history,[]);
});

test('quoting an earlier roster selects that exchange even after a separate report', async t => {
  const h = conversation(t);
  const roster = await h.ask(rosterQuestion);
  await h.ask('查示例分析师乙的评分');
  await h.ask(followup,{parentId:roster.messageId,directedToBot:false});
  const history = h.modelCalls.at(-1).history;
  assert.ok(history.some(m => m.role === 'assistant' && m.content.includes('示例分析师丙（analystC）')));
  assert.ok(history.every(m => !m.content.includes(report)));
});

test('losing access while the model is explaining a report cannot publish its answer', async t => {
  const answer = '示例分析师乙这批建议的得分是八十四。';
  let entered = false;
  const h = conversation(t,{services:{respondToChat:async () => {
    entered = true;
    h.config.approverIds = [];
    return answer;
  }}});
  const message = await h.ask('查示例分析师乙的评分');
  await h.ask('换个说法呢？',{parentId:message.messageId,directedToBot:false});
  assert.equal(entered,true);
  assert.ok(h.messages.every(m => m.text !== answer));
  assert.deepEqual(h.writes,[]);
});

for (const webhook of [false,true]) {
  test('a delivered formal report supports a scoped follow-up over ' + (webhook ? 'webhook' : 'the app bot'), async t => {
    const paraphrase = '总共有五条，得分八十四。';
    const reports = [];
    const reply = ({history}) => history.some(m => m.content.includes(report) || m.content.includes(paraphrase)) ? paraphrase : '请说明你指的记录。';
    const h = conversation(t,{webhook,reply,services:{queryFormal:async filters => {
      reports.push(filters);
      return report;
    }}});
    const message = await h.ask('查示例分析师乙的评分');
    assert.equal(message.text,report);
    assert.equal(h.modelCalls.length,0);
    await h.ask('这个分数是几条记录算出来的？',webhook ? {} : {parentId:message.messageId,directedToBot:false});
    assert.ok(h.modelCalls.at(-1).history.some(m => m.role === 'assistant' && m.content.includes(report)));
    assert.deepEqual(reports.map(filters => filters.analystKey),['analystB']);
    h.config.approverIds = [];
    await h.ask('帮我再解释一下');
    assert.equal(h.modelCalls.length,2);
    assert.ok(h.modelCalls.at(-1).history.every(m => !m.content.includes(report) && !m.content.includes(paraphrase)));
    assert.notEqual(h.messages.at(-1).text,paraphrase);
    assert.deepEqual(h.writes,[]);
  });
}
