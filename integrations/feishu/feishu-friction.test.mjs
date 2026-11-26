import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFrictionCollector, openFrictionMonitor } from './feishu-friction.mjs';
import { openFeishuWorkflow } from './feishu-workflow.mjs';
import { openFeishuRuntime } from './feishu-runtime.mjs';
import { createFeishuChatResponder, createFeishuLlmExtractor } from './feishu-llm.mjs';

const config = {
  chatId: 'oc_test', analystBySender: { ou_one: 'A' }, analystNamesByRole: { A: '测试者' },
  analystAliasesByRole: { A: ['成员甲'] }, approverIds: ['ou_pm']
};
function harness(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  let time = Date.parse('2026-11-24T00:00:00Z');
  const now = () => time;
  const collector = createFrictionCollector(db, { now });
  const observe = (id, patch) => collector.observe({
    chatId: config.chatId, senderId: 'ou_one', messageId: 'om_' + id, threadId: 'om_thread',
    component: 'chat', user: '股票', assistant: '答复', outcome: 'chat', ...patch
  }, config);
  const incidents = () => db.prepare('SELECT * FROM friction_incidents ORDER BY rowid').all()
    .map(({ episode_json, ...rest }) => ({ ...rest, ...JSON.parse(episode_json) }));
  return { db, collector, now, observe, incidents, advance: ms => { time += ms; } };
}

test('read correction learning requires independent evidence and retains only categorical outcomes',t=>{
  const h=harness(t);
  const observe=(id,readAction,modelSelected,text,patch={})=>h.collector.observeRead({
    chatId:config.chatId,senderId:'ou_one',threadId:'topic',messageId:'msg'+id,text,readAction,modelSelected,...patch
  },config);
  const scores={read:'formal_report',sections:['scores'],scope:'named',subject:'private name'};
  observe(1,{read:'pending'},true,'还有多少件？');
  observe(2,scores,false,'换个话题查评分');
  assert.deepEqual(h.incidents(),[]);
  observe(3,{read:'pending'},true,'还有多少件？');
  observe(4,scores,true,'我指的是某位的评分');
  assert.deepEqual(h.incidents(),[]);
  observe(5,{read:'pending'},true,'还有多少件？',{modelComponent:'extraction'});
  observe(6,scores,false,'我指的是 private name 的评分');
  observe(6,scores,false,'我指的是 private name 的评分');
  const incidents=h.incidents();
  assert.equal(incidents.length,1);
  assert.equal(incidents[0].component,'extraction');
  assert.deepEqual(incidents[0].turns,[{user:'',outcome:'verified_read_correction',previousRead:'pending',expectedRead:'scores'}]);
  assert.doesNotMatch(JSON.stringify(incidents),/private name|我指的是|还有多少件|ou_one/);
});

test('monitor receives the actual adapter and workflow outcomes; a normal initial clarification stays in memory', async t => {
  const h = harness(t);
  const business = new DatabaseSync(':memory:');
  t.after(() => business.close());
  const modelReplies = [
    { intent: 'proposal', fields: { action: { value: 'buy', evidence: '买入' } } },
    { intent: 'proposal', fields: { ticker: { value: 'NVDA', evidence: 'a hallucinated quote' } } },
  ];
  const extractor = createFeishuLlmExtractor({ FEISHU_LLM_BASE_URL: 'http://127.0.0.1:11434/v1', FEISHU_LLM_MODEL: 'mock' }, {
    formalTrades: true, fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(modelReplies.shift()) } }] })
  });
  const sent = [];
  const workflow = openFeishuWorkflow(business, fn => fn(), {
    monitor: h.collector, config, now: h.now,
    extractWithModel: extractor, respondToChat: async () => { throw Error('unexpected chat'); },
    sendMessage: async ({ text }) => { sent.push(text); return { messageId: 'om_sent_' + sent.length }; }
  });
  const receive = (id, text, patch) => workflow.receive({
    eventId: 'event_' + id, messageId: 'om_' + id, chatId: config.chatId,
    senderId: 'ou_one', text, directedToBot: true, ...patch
  });
  assert.equal(receive('outside', '你理解错了', { chatId: 'oc_unrelated' }).accepted, false);
  assert.equal(receive('ambient', '你理解错了', { directedToBot: false }).accepted, false);
  assert.equal(receive('first', '我建议买入').accepted, true);
  await workflow.drain();
  assert.match(sent[0], /标的/);
  assert.deepEqual(h.incidents(), []);
  assert.equal(receive('second', '标的是英伟达', { parentId: 'om_sent_1' }).accepted, true);
  await workflow.drain();
  const [incident] = h.incidents();
  assert.equal(h.incidents().length, 1);
  assert.equal(incident.signal, 'repeated_clarification');
  assert.equal(incident.component, 'extraction');
  assert.equal(incident.turns.length, 2);
  assert.equal(incident.turns[0].user, '我建议买入');
  assert.deepEqual(incident.turns[1].fields, {});
  assert.deepEqual(incident.turns[1].rawFields, { ticker: 'NVDA' });
  assert.deepEqual(incident.turns[1].priorFields, { action: 'buy' });
  assert.deepEqual(incident.turns[1].priorMissing, ['ticker']);
  assert.deepEqual(incident.turns[1].missing, ['ticker']);
  assert.equal(incident.turns[1].rawIntent, 'proposal');
  assert.doesNotMatch(JSON.stringify(incident), /测试者|ou_one|om_first|oc_test|hallucinated/);
  assert.equal(receive('second', '标的是英伟达', { parentId: 'om_sent_1' }).duplicate, true);
  receive('approval', '同意', { senderId: 'ou_pm', parentId: 'om_sent_1' });
  await workflow.drain();
  assert.equal(h.incidents().length, 1);
  assert.equal(workflow.view().proposals.length, 0);
});

test('member feedback is scoped to sender/thread and a routed extraction merges with its chat response', t => {
  const h = harness(t);
  h.observe(1, { user: '属于另一个发送人', senderId: 'ou_two' });
  h.observe(2, { user: '属于另一个提案', threadId: 'another' });
  h.observe(3, { user: '原问题', component: 'extraction', outcome: 'routed_chat', packet: { intent: 'other', fields: {} } });
  h.observe(3, { user: '原问题' });
  h.observe(4, { user: '你理解错了，我指的是股票', component: 'extraction', outcome: 'routed_chat' });
  assert.equal(h.incidents().length, 0);
  h.observe(4, { user: '你理解错了，我指的是股票' });
  const [incident] = h.incidents();
  assert.equal(incident.signal, 'negative_feedback');
  assert.deepEqual(incident.turns.map(x => x.user), ['原问题', '你理解错了,我指的是股票']);
  assert.equal(incident.turns[0].intent, 'other');
  h.observe(5, { user: '原先说了另一个提案', outcome: 'pm_summary', component: 'extraction', threadId: 'summary' });
  h.observe(6, { user: '我只是想问登记流程', threadId: 'summary' });
  assert.equal(h.incidents()[1].signal, 'misrouted_proposal');
  assert.equal(h.incidents()[1].component, 'extraction');
});

test('deidentification, TTL, count cap, and duplicate delivery also apply when a provider fails', t => {
  const h = harness(t);
  h.observe(1, { user: '成员甲 @li 测试者 ou_private person@example.io 13800138000 138-0000-0000 (650) 555-1234 650-555-5678', assistant: 'oc_secret' });
  h.observe(2, { user: 'api_key=private_key', assistant: 'Bearer secret-secret', outcome: 'chat_fallback' });
  h.observe(2, { user: 'api_key=private_key', assistant: 'Bearer secret-secret', outcome: 'chat_fallback' });
  assert.equal(h.incidents().length, 1);
  assert.doesNotMatch(JSON.stringify(h.incidents()), /成员甲|测试者|ou_private|person@example.io|13800138000|138-0000|555-1234|555-5678|oc_secret|@li|private_key|secret-secret/);
  h.advance(31 * 60_000);
  h.observe(3, { outcome: 'chat_fallback' });
  assert.equal(h.incidents()[1].turns.length, 1);
  for (let n = 4; n < 230; n++)h.observe(n, { outcome: 'chat_fallback' });
  assert.equal(h.incidents().length, 200);
  h.advance(14 * 24 * 60 * 60_000 + 1);
  h.collector.prune();
  assert.equal(h.incidents().length, 0);
});

test('unavailable or locked collector storage is private and cannot stop the workflow', async t => {
  const h = harness(t);
  const dir = mkdtempSync(join(tmpdir(), 'osborn-monitor-'));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const file = join(dir, 'occupied');
  writeFileSync(file, 'invalid sqlite');
  const warnings = [];
  const monitor = openFrictionMonitor(file, { now: h.now, log: msg => warnings.push(msg) });
  t.after(() => monitor.close());
  const replies = [];
  const workflow = openFeishuWorkflow(h.db, fn => fn(), {
    config, monitor, now: h.now,
    respondToChat: async () => { throw new Error('model down'); },
    sendMessage: async request => { replies.push(request.text); return { messageId: 'om_out' }; }
  });
  workflow.receive({ eventId: 'event_a', messageId: 'om_a', chatId: config.chatId, senderId: 'ou_pm', directedToBot: true, text: '在吗' });
  await workflow.drain();
  assert.equal(warnings.length, 1);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /聊天模型/);
  rmSync(file);
  h.advance(61_000);
  monitor.prune();
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const other = new DatabaseSync(file);
  t.after(() => other.close());
  other.exec('BEGIN EXCLUSIVE');
  monitor.observe({ component: 'chat', outcome: 'chat_fallback', chatId: config.chatId, senderId: 'ou_pm', threadId: 'thread', messageId: 'message' }, config);
  assert.equal(warnings.length, 2);
  other.exec('COMMIT');
});

test('a third neutral follow-up in a real bot conversation triggers bounded semantic review', async t => {
  const h = harness(t);
  const sent = [];
  const workflow = openFeishuWorkflow(h.db, fn => fn(), {
    monitor: h.collector, config, now: h.now,
    respondToChat: createFeishuChatResponder({FEISHU_LLM_BASE_URL:'http://127.0.0.1:11434/v1',FEISHU_LLM_MODEL:'fixture'},{
      fetchImpl:async()=>Response.json({choices:[{message:{content:'我可以帮你处理提案。'}}]})}),
    sendMessage: async ({ text }) => { sent.push(text); return { messageId: 'om_review_' + sent.length }; }
  });
  async function chat(id, text, parent, patch) {
    const event = {
      eventId: 'event_' + id, messageId: 'om_in_' + id, chatId: config.chatId, senderId: 'ou_pm', text,
      directedToBot: !parent, parentId: parent, ...patch
    };
    const received = workflow.receive(event);
    await workflow.drain();
    return received;
  }
  await chat(1, '我想知道怎么处理');
  await chat(2, '要回复哪条呢', 'om_review_1');
  assert.deepEqual(h.incidents(), []);
  await chat(3, '在这里可以吗', 'om_review_2');
  const [incident] = h.incidents();
  assert.equal(incident.signal, 'conversation_review');
  assert.deepEqual(incident.turns.map(turn => turn.historyContainsPreviousUser),[false,true,true]);
  assert.equal(incident.turns.some(turn => Object.hasOwn(turn,'sentHistory')),false);
  assert.equal(incident.component, 'chat');
  assert.deepEqual(incident.turns.map(x => x.user), ['我想知道怎么处理', '要回复哪条呢', '在这里可以吗']);
  await chat(4, '如果再确认一次呢', 'om_review_3');
  await chat(5, '如果还需要补充呢', 'om_review_4');
  assert.equal(h.incidents().length, 1);
  await chat(6, '同意', 'om_review_5');
  assert.equal(h.incidents().length, 1);
});


test('only an opted-in formal connector initializes the private monitor store', async t => {
  const dir = mkdtempSync(join(tmpdir(),'osborn-opt-in-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const file = join(dir,'custom-monitor.sqlite');
  async function tick(enabled,formal) {
    const runtime = openFeishuRuntime(dir,{assistantEnv:{OSBORN_FEISHU_AUTO_OPTIMIZE:enabled,FEISHU_OPTIMIZATION_MONITOR_DB:file},
      syncFormal:formal ? () => assert.fail('no financial writes') : undefined});
    try { await runtime.drain(); } finally { await runtime.close(); }
  }
  await tick('false',true);
  assert.equal(existsSync(file),false);
  await tick('true',false);
  assert.equal(existsSync(file),false);
  await tick('true',true);
  assert.equal(statSync(file).mode & 0o777,0o600);
  const reader = new DatabaseSync(file,{readOnly:true});
  try { assert.equal(reader.prepare('SELECT COUNT(*) AS n FROM friction_incidents').get().n,0); }
  finally { reader.close(); }
});

test('timeout feedback reaches the group and only a sanitized failure category reaches diagnostics',async t=>{
  const h=harness(t),replies=[];
  const errors=[{code:'MODEL_TIMEOUT'},{code:'MODEL_HTTP',status:503},{code:'PRIVATE_ERROR_VALUE',status:497},{code:'MODEL_TRUNCATED'}];
  const workflow=openFeishuWorkflow(h.db,fn=>fn(),{config,monitor:h.collector,now:h.now,
    respondToChat:async()=>{throw Object.assign(Error('private provider error'),errors.shift());},
    sendMessage:async({text})=>{replies.push(text);return {messageId:'om_reply_'+replies.length};}});
  for(let i=0;i<4;i++){
    workflow.receive({eventId:'ev_f'+i,messageId:'om_f'+i,chatId:config.chatId,senderId:'ou_pm',directedToBot:true,text:'刚才说到哪里了？'});
    await workflow.drain();
  }
  assert.match(replies[0],/超时/);
  const turns=h.incidents().map(incident=>incident.turns.at(-1));
  assert.equal(turns[0].modelErrorCode,'MODEL_TIMEOUT');
  assert.equal(turns[1].modelHttpStatus,503);
  assert.equal(turns[2].modelErrorCode,undefined);
  assert.equal(turns[3].modelErrorCode,'MODEL_TRUNCATED');
  assert.match(replies[3],/长度|生成.{0,8}上限/);
  assert.doesNotMatch(JSON.stringify([turns,replies]),/PRIVATE_ERROR_VALUE|private provider error|497/);
});
