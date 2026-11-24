import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  setupDelivery, configureWebhook, configureAppDelivery, enqueue, getWebhookInfo, getNotifications,
  deliverAppPending, deliverPending, recordMockReceipt, retryDelivery, recoverAppDelivery,
} from './delivery.mjs';

const group = 'https://open.feishu.cn/open-apis/bot/v2/hook/aaaabbbb';
const localUrl = 'http://127.0.0.1:9154/internal/mock-feishu';
const localToken = 'loopback-test-secret';
const session = 'replay-1';
const event = { title: '第二轮 · 评分更新', text: 'A 命中 1/2；B 命中 2/2。' };

function open(t) {
  const db = new DatabaseSync(':memory:');
  setupDelivery(db);
  t.after(() => db.close());
  return db;
}

function hook(db, url = group, secret = 'demo') {
  configureWebhook(db, { url, secret });
}

test('a rollback rolls back the event; duplicate business actions only enqueue once', (t) => {
  const db = open(t);
  db.exec('BEGIN');
  enqueue(db, session, '1', event);
  db.exec('ROLLBACK');
  assert.deepEqual(getNotifications(db, session), []);
  enqueue(db, session, '1', event);
  enqueue(db, session, '1', event);
  assert.equal(getNotifications(db, session).length, 1);
});

test('validates the target and never exposes webhook secrets', (t) => {
  const db = open(t);
  for (const url of ['http://127.0.0.1/webhook', group+'?test', group+'#test', group.replace('.cn/', '.cn.invalid/'), group.replace('//','//user:pass@')]) {
    assert.throws(() => hook(db, url), {status: 400});
  }
  hook(db);
  assert.deepEqual(getWebhookInfo(db), {mode:'feishu', configured:true, signed:true});
  hook(db, '', '');
  assert.deepEqual(getWebhookInfo(db), {mode:'local', configured:false, signed:false});
});

test('local HTTP-shaped delivery persists the exact card receipt once and survives a configuration change', async (t) => {
  const db = open(t);
  enqueue(db, session, '1', event);
  hook(db); // an already queued local event stays local
  let sent = 0;
  const options = { localUrl, localToken, fetchImpl: async (url, init) => {
    assert.equal(String(url), localUrl);
    assert.equal(init.headers['x-demo-mock-token'], localToken);
    assert.equal(init.redirect, 'error');
    const payload = JSON.parse(init.body);
    assert.equal(payload.card.elements[0].text.content, event.text);
    assert.equal(recordMockReceipt(db, payload), recordMockReceipt(db, payload));
    sent++;
    return Response.json({code:0,msg:'success'});
  }};
  await Promise.all([deliverPending(db, options), deliverPending(db, options)]);
  assert.equal(sent, 1);
  const [notification] = getNotifications(db, session);
  assert.equal(notification.status, 'sent');
  assert.equal(notification.mode, 'local');
  assert.equal(notification.attempts, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM replay_mock_receipts').get().n, 1);
});

test('uses the Feishu timestamp/key HMAC and checks business response code even on HTTP 200', async (t) => {
  const db = open(t);
  hook(db);
  enqueue(db, session, '1', event);
  t.mock.method(Date, 'now', () => 1599360473000);
  let body;
  await deliverPending(db, {fetchImpl: async (url, init) => {
    assert.equal(url, group);
    assert.equal(init.headers['x-demo-mock-token'], undefined);
    body = JSON.parse(init.body);
    return Response.json({code:19021,msg:'diagnostic contains a sensitive webhook!'});
  }});
  assert.equal(body.timestamp, '1599360473');
  assert.equal(body.sign, 'l1N0gAcBjdwBvGm1xMjOF0XSyaLRpR7tuO5dHfhAYc8=');
  assert.equal(body.msg_type, 'interactive');
  const [result] = getNotifications(db, session);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /19021/);
  assert.doesNotMatch(result.error, /sensitive/);
});

test('uncertain deliveries require reconciliation, never silently redirect on a group change', async (t) => {
  const db = open(t);
  hook(db);
  enqueue(db, session, '1', event);
  let sent = 0;
  const fetchImpl = async () => {
    sent++;
    throw new DOMException('delivery unknown','TimeoutError');
  };
  await deliverPending(db,{fetchImpl});
  await deliverPending(db,{fetchImpl});
  assert.equal(getNotifications(db, session)[0].status, 'uncertain');
  assert.equal(sent, 1);
  hook(db, group+'2');
  assert.throws(() => retryDelivery(db, session, '1'), {status: 409});
  hook(db);
  retryDelivery(db, session, '1');
  await deliverPending(db,{fetchImpl:async () => Response.json({StatusCode:0})});
  assert.equal(getNotifications(db, session)[0].status, 'sent');
});

test('queued events cannot leak from a retired group to its replacement', async (t) => {
  const db = open(t);
  hook(db);
  enqueue(db, session, '1', event);
  hook(db, group+'2');
  let sent = false;
  await deliverPending(db, {fetchImpl:async () => {sent = true; return Response.json({code:0});}});
  const [result] = getNotifications(db, session);
  assert.equal(sent, false);
  assert.equal(result.status, 'failed');
  assert.throws(() => retryDelivery(db, session, '1'), /原目标/);
});

test('rate limit backoff is durable and later messages cannot overtake the earlier event', async (t) => {
  const db = open(t);
  hook(db);
  enqueue(db, session, '1', event);
  enqueue(db, session, '2', event);
  let now = 1700000000000;
  t.mock.method(Date, 'now', () => now);
  const deliveries = [];
  const fetchImpl = async (_url, init) => {
    deliveries.push(JSON.parse(init.body).card.elements.at(-1).elements[0].content);
    return Response.json({code: deliveries.length === 1 ? 11232 : 0});
  };
  await deliverPending(db,{fetchImpl});
  assert.equal(deliveries.length, 1);
  assert.equal(getNotifications(db, session)[0].attempts, 0);
  setupDelivery(db);
  now += 1999;
  await deliverPending(db,{fetchImpl});
  assert.equal(deliveries.length, 1);
  now += 1;
  await deliverPending(db,{fetchImpl});
  assert.equal(deliveries.length, 3);
  assert.equal(deliveries[0],deliveries[1]);
  assert.notEqual(deliveries[0],deliveries[2]);
  assert.ok(getNotifications(db, session).every(row => row.status === 'sent'));
});

test('recovers a crash without repeating an ambiguous remote request', (t) => {
  const db = open(t);
  hook(db);
  enqueue(db, session, '1', event);
  hook(db,'','');
  enqueue(db, session, '2', event);
  db.exec("UPDATE replay_outbox SET status='sending'");
  setupDelivery(db);
  const [local,remote] = getNotifications(db,session);
  assert.equal(local.status,'pending');
  assert.equal(remote.status,'uncertain');
});

test('bound app delivery sends only app rows and preserves history and stable receipt identifiers', async (t) => {
  const db = open(t);
  enqueue(db,session,'old-local',event);
  assert.throws(() => configureAppDelivery(db,undefined),{status:409});
  assert.deepEqual(configureAppDelivery(db,'oc_bound'),{mode:'app',configured:true,signed:false});
  enqueue(db,session,'app-new',event);
  enqueue(db,session,'app-new',event);
  const messages = [];
  const sendMessage = async message => { messages.push(message); return {messageId:'om_confirmed'}; };
  const options = {sendMessage,boundChatId:() => 'oc_bound'};
  await Promise.all([deliverAppPending(db,options),deliverAppPending(db,options)]);
  const [app,local] = getNotifications(db,session);
  assert.equal(app.status,'sent');
  assert.equal(app.mode,'app');
  assert.equal(local.status,'pending');
  assert.equal(local.mode,'local');
  assert.deepEqual(messages,[{chatId:'oc_bound',uuid:'oa-demo-'+app.receiptId,
    text:`${event.title}\n\n${event.text}\n\nOsborn Alpha · 场次 ${session} · 事件 ${app.receiptId}`}]);
  assert.doesNotMatch(JSON.stringify(getWebhookInfo(db)),/oc_bound/);
  await deliverPending(db,{localUrl,localToken,fetchImpl:async () => Response.json({code:0})});
  assert.ok(getNotifications(db,session).every(row => row.status === 'sent'));
});

test('changed app bindings and delivery modes never redirect existing events', async (t) => {
  const db = open(t);
  const messages = [];
  const sendMessage = async ({chatId}) => { messages.push(chatId); return {messageId:'om_new'}; };
  configureAppDelivery(db,'oc_first');
  enqueue(db,session,'first-app',event);
  await deliverAppPending(db,{boundChatId:() => 'oc_second',sendMessage});
  assert.equal(getNotifications(db,session)[0].status,'failed');
  assert.throws(() => retryDelivery(db,session,'first-app','oc_second'),{status:409});
  configureAppDelivery(db,'oc_second');
  enqueue(db,session,'second-app',event);
  hook(db);
  enqueue(db,session,'custom-hook',event);
  await deliverAppPending(db,{boundChatId:() => 'oc_second',sendMessage});
  assert.deepEqual(messages,[]);
  assert.throws(() => retryDelivery(db,session,'second-app','oc_second'),{status:409});
  const custom = [];
  await deliverPending(db,{fetchImpl:async url => { custom.push(url); return Response.json({code:0}); }});
  assert.deepEqual(custom,[group]);
  configureAppDelivery(db,'oc_second');
  retryDelivery(db,session,'second-app','oc_second');
  await deliverAppPending(db,{boundChatId:() => 'oc_second',sendMessage});
  assert.deepEqual(messages,['oc_second']);
  assert.equal(getNotifications(db,session).find(row => row.id === 'first-app').status,'failed');
});

test('ambiguous app sends await reconciliation and reuse the app UUID when retried', async (t) => {
  const db = open(t);
  configureAppDelivery(db,'oc_bound');
  enqueue(db,session,'1',event);
  const attempts = [];
  const options = {boundChatId:() => 'oc_bound',sendMessage:async ({uuid}) => {
    attempts.push(uuid);
    if (attempts.length === 1) throw new Error('sensitive app token diagnostic');
    return {messageId:'om_retry'};
  }};
  await deliverAppPending(db,options);
  await deliverAppPending(db,options);
  const [failed] = getNotifications(db,session);
  assert.equal(failed.status,'uncertain');
  assert.doesNotMatch(failed.error,/sensitive/);
  assert.equal(attempts.length,1);
  db.exec("UPDATE replay_outbox SET status='sending'");
  setupDelivery(db);
  assert.equal(db.prepare('SELECT status FROM replay_outbox').get().status,'sending');
  recoverAppDelivery(db);
  assert.equal(getNotifications(db,session)[0].status,'uncertain');
  retryDelivery(db,session,'1','oc_bound');
  await deliverAppPending(db,options);
  assert.equal(attempts[0],attempts[1]);
  assert.equal(getNotifications(db,session)[0].status,'sent');
});
