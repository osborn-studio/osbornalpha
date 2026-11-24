import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import * as sdk from '@larksuiteoapi/node-sdk';
import { makeFeishuConnector, makeFeishuSender, normalizeGroupMessage } from './feishu-connector.mjs';

const appId = 'cli_0123456789abcdef';
const appSecret = 'test-only';
const event = () => ({
  schema: '2.0', header: { app_id: appId, event_type: 'im.message.receive_v1', event_id: 'ev_sample' },
  event: {
    sender: { sender_type: 'user', sender_id: { open_id: 'ou_pm' } },
    message: { chat_type: 'group', chat_id: 'oc_team', message_type: 'text', message_id: 'om_sample',
      create_time: '1735689600000',
      parent_id: 'om_summary', root_id: 'om_root', mentions: [{ key: '@_user_1' }],
      content: JSON.stringify({ text: ' @_user_1 通过\n原价 330.50' }) },
  },
});
const flattened = data => ({ ...data.header, ...data.event });

function fixture(workflow) {
  const logs = [];
  let socket;
  class MockSocket {
    constructor(options) { this.options = options; this.state = 'idle'; socket = this; }
    async start({ eventDispatcher }) { this.dispatch = data => eventDispatcher.invoke(data, { needCheck: false }); }
    close() { this.state = 'idle'; }
    getConnectionStatus() { return { state: this.state }; }
  }
  const connector = makeFeishuConnector({
    appId, appSecret, createWorkflow: () => workflow, log: text => logs.push(text), intervalMs: 60_000,
    sdk: { ...sdk, WSClient: MockSocket, Client: class {} },
  });
  return { connector, socket, logs };
}

test('only normalized group text from humans reaches the local workflow', () => {
  const data = flattened(event());
  assert.deepEqual(normalizeGroupMessage(data, appId), {
    eventId: 'ev_sample', messageId: 'om_sample', chatId: 'oc_team', senderId: 'ou_pm',
    text: '通过\n原价 330.50', createdAt: '2025-01-01T00:00:00.000Z',
    parentId: 'om_summary', rootId: 'om_root',
  });
  const skips = [
    { ...data, app_id: 'other' }, { ...data, event_id: [] }, { ...data, sender: { sender_type: 'app' } },
    ...[{ chat_type: 'p2p' }, { message_type: 'image' }, { create_time: '1735689600' },
      { create_time: 'invalid' }, { content: 'malformed' },
      { content: '{}' }, { content: JSON.stringify({ text: '@_user_1' }) }]
      .map(change => ({ ...data, message: { ...data.message, ...change } })),
  ];
  for (const sample of skips) assert.equal(normalizeGroupMessage(sample, appId), null);
  data.message.mentions = [];
  assert.match(normalizeGroupMessage(data, appId).text, /^@_user_1/);
});

test('SDK dispatcher only ACKs after the durable write, drains separately, and waits for work on stop', async () => {
  const seen = [];
  let drainCount = 0, closed = false, releaseDrain;
  const drainWait = new Promise(resolve => { releaseDrain = resolve; });
  const { connector, socket, logs } = fixture({
    receive: data => { seen.push(data); return { accepted: true }; },
    drain: async () => { drainCount++; await drainWait; },
    close: () => { closed = true; },
  });
  await connector.start();
  assert.equal(logs.length, 1);
  assert.equal(logs[0], '正在建立飞书长连接。');
  socket.state = 'connected';
  socket.options.onReady();
  assert.equal(connector.getStatus(), 'connected');
  assert.match(logs.at(-1), /已在线/);
  await socket.dispatch(event());
  await socket.dispatch(event());
  assert.equal(seen.length, 2); // SQLite receives both deliveries and owns deduplication.
  assert.equal(seen[0].eventId, 'ev_sample');
  assert.equal(drainCount, 0);
  await nextTurn();
  assert.equal(drainCount, 1);
  socket.options.onReconnecting();
  socket.options.onReconnected();
  assert.match(logs.at(-2), /断开/);
  assert.match(logs.at(-1), /恢复/);
  const stopping = connector.stop();
  assert.equal(closed, false);
  releaseDrain();
  assert.equal(await stopping, 0);
  assert.equal(await connector.stop(), 0);
  assert.equal(closed, true);
});

test('workflow write errors propagate to the SDK for redelivery; fatal configuration errors stop safely', async () => {
  let closed = 0;
  const { connector, socket, logs } = fixture({
    receive: () => { throw new Error('database busy'); }, drain: async () => {}, close: () => { closed++; },
  });
  await connector.start();
  await assert.rejects(socket.dispatch(event()), /database busy/);
  socket.options.onError(new Error('credential-should-not-appear'));
  assert.equal(await connector.done, 1);
  assert.equal(closed, 1);
  assert.ok(logs.every(line => !line.includes('credential-should-not-appear')));
});

test('the pinned SDK terminates on rejected discovery without claiming a connection', async () => {
  const logs = [];
  let calls = 0;
  class OfflineWS extends sdk.WSClient {
    constructor(options) {
      super({ ...options, httpInstance: {
        async request(config) {
          calls++;
          assert.equal(config.data.AppID, appId);
          return { code: 1000040345, msg: appSecret, data: {} };
        },
      } });
    }
  }
  const connector = makeFeishuConnector({
    appId, appSecret, createWorkflow: () => ({ receive() {}, drain() {}, close() {} }),
    sdk: { ...sdk, WSClient: OfflineWS }, log: text => logs.push(text),
  });
  await connector.start();
  assert.equal(await connector.done, 1);
  assert.equal(calls, 1);
  assert.ok(logs.every(line => !line.includes('已在线') && !line.includes(appSecret)));
});

test('sending and replying retain stable UUIDs and expose only confirmed message IDs', async () => {
  const requests = [];
  const send = makeFeishuSender({ im: { message: Object.fromEntries(['create', 'reply'].map(method =>
    [method, async payload => {
      requests.push({ method, payload });
      return { code: 0, data: { message_id: 'om_confirmation' } };
    }])) } });
  const input = { chatId: 'oc_group', text: '本人审核通过', uuid: 'stable-guid' };
  assert.deepEqual(await send(input), { messageId: 'om_confirmation' });
  await send({ ...input, replyTo: 'om_parent' });
  const data = { msg_type: 'text', content: JSON.stringify({ text: input.text }), uuid: input.uuid };
  assert.deepEqual(requests, [
    { method: 'create', payload: { params: { receive_id_type: 'chat_id' }, data: { ...data, receive_id: 'oc_group' } } },
    { method: 'reply', payload: { path: { message_id: 'om_parent' }, data } },
  ]);
});

test('business rejection, HTTP errors and absent message ID never look like delivery; errors are redacted', async () => {
  const responses = [
    [() => ({ code: 99991672, msg: appSecret }), false],
    [() => { throw { response: { status: 400, data: { code: 230020, msg: appSecret } } }; }, true],
    [() => { throw { response: { status: 403 }, config: { secret: appSecret } }; }, false],
    [() => { throw new Error(appSecret); }, true],
    [() => ({ code: 0, data: {} }), true],
  ];
  for (const [create, retriable] of responses) {
    const send = makeFeishuSender({ im: { message: { create } } });
    await assert.rejects(send({ chatId: 'oc_group', text: 'test', uuid: 'stable-guid' }), error =>
      error.retriable === retriable && !String(error).includes(appSecret));
  }
});
