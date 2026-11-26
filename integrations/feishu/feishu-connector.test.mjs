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

function fixture(workflow, Client = class {}) {
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
    sdk: { ...sdk, WSClient: MockSocket, Client },
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

test('plain-text links expose their display label and preserve adjacent ticker characters', () => {
  const data = flattened(event());
  data.message.mentions = [{key:'@_user_1',id:{open_id:'ou_bot'}}];
  data.message.content = JSON.stringify({text:'@_user_1 01810[.HK](http://00700.hk/)'});
  const linked = normalizeGroupMessage(data, appId, 'ou_bot');
  assert.equal(linked.text,'01810.HK');
  assert.equal(linked.directedToBot,true);
  assert.equal(linked.parentId,'om_summary');

  data.message.content = JSON.stringify({text:'我要购买小米集团－Ｗ（１８１０） 100万港币用来建仓'});
  assert.equal(normalizeGroupMessage(data, appId).text,'我要购买小米集团-W(1810) 100万港币用来建仓');
  data.message.content = JSON.stringify({text:'关联研究：[季度复盘](https://example.invalid/topic(2026))'});
  assert.equal(normalizeGroupMessage(data, appId).text,'关联研究：季度复盘');
});

test('reads the visible text of a Feishu post and retains inline formatting boundaries, paragraphs and reply IDs', () => {
  const data = flattened(event());
  const post = {title:'',content:[
    [{tag:'at',user_id:'@_user_1'}, {tag:'text',text:'我建议买入'}, {tag:'text',text:'00700.HK',style:['bold']}],
    [{tag:'text',text:'参考447.4，目标480，止损420。'}],
    [{tag:'text',text:'关联研究：'}, {tag:'a',text:'季度复盘',href:'https://example.invalid/?target=999'}],
  ]};
  data.message.message_type = 'post';
  for (const content of [post,{zh_cn:post}]) {
    data.message.content = JSON.stringify(content);
    const normalized = normalizeGroupMessage(data, appId);
    assert.equal(normalized.text,'我建议买入00700.HK\n参考447.4，目标480，止损420。\n关联研究：季度复盘');
    assert.equal(normalized.parentId,'om_summary');
    assert.equal(normalized.rootId,'om_root');
    assert.equal(normalized.senderId,'ou_pm');
  }
  data.message.content = JSON.stringify({title:'腾讯控股建议',content:[[{tag:'text',text:'目标480，止损420'}]]});
  assert.equal(normalizeGroupMessage(data, appId).text,'腾讯控股建议\n目标480，止损420');
});

test('a partial transcription or a malformed post cannot become an approval or proposal', () => {
  const data = flattened(event());
  const text = {tag:'text',text:'同意'};
  for (const post of [
    {content:[[text],[{tag:'img',image_key:'example'}]]},
    {content:[[text,{tag:'media',file_key:'example'}]]},
    {content:[[{...text,style:['lineThrough']}]]},
    {content:[[{tag:'a',href:'https://example.invalid/同意'}]]},
    {content:[[{tag:'at',user_id:'@_user_9'},text]]},
    {content:[[text],null]}, {content:[[null]]}, {content:'同意'}, {text:'同意'},
  ]) {
    const message = {...data.message,message_type:'post',content:JSON.stringify(post)};
    assert.equal(normalizeGroupMessage({...data,message},appId),null);
  }
  const message = {...data.message,message_type:'post',content:JSON.stringify({content:[[text]]})};
  assert.equal(normalizeGroupMessage({...data,message:{...message,chat_type:'p2p'}},appId),null);
  assert.equal(normalizeGroupMessage({...data,message,sender:{sender_type:'app'}},appId),null);
});

test('directedToBot requires a mention of its own verified open ID present in the actual text or post', () => {
  const data = flattened(event());
  data.message.mentions = [
    {key:'@_user_1',id:{open_id:'ou_colleague'}},
    {key:'@_user_10',id:{open_id:'ou_bot'}},
  ];
  for (const message_type of ['text','post']) {
    const normalized = key => {
      const content = message_type === 'text' ? {text:key + ' 腾讯'} :
        {content:[[{tag:'at',user_id:key},{tag:'text',text:'腾讯'}]]};
      const message = {...data.message,message_type,content:JSON.stringify(content)};
      return normalizeGroupMessage({...data,message},appId,'ou_bot');
    };
    assert.equal(normalized('@_user_10').directedToBot,true);
    assert.equal(normalized('@_user_10').text,'腾讯');
    assert.equal(normalized('@_user_1').directedToBot,undefined);
    assert.match(normalized('@_user_1').text,/^@_user_1\s+腾讯$/);
  }
  data.message.content = JSON.stringify({text:'同意 @_user_10'});
  assert.equal(normalizeGroupMessage(data,appId,'ou_bot').text,'同意');
  assert.equal(normalizeGroupMessage(data,appId).directedToBot,undefined);
});

test('a verified mention with no extra text remains an addressed group event', () => {
  const data = flattened(event());
  data.message.content = JSON.stringify({text:' @_user_1  '});
  data.message.mentions = [{key:'@_user_1',id:{open_id:'ou_bot'}}];
  assert.equal(normalizeGroupMessage(data,appId),null);
  assert.equal(normalizeGroupMessage(data,appId,'ou_other').directedToBot,undefined);
  const directed = normalizeGroupMessage(data,appId,'ou_bot');
  assert.equal(directed.text,'');
  assert.equal(directed.directedToBot,true);
});

test('an unverified mention cannot be removed to make an approval', () => {
  const data = flattened(event());
  data.message.content = JSON.stringify({text:'@_user_1 同意'});
  data.message.mentions = [{key:'@_user_1',id:{open_id:'ou_other'}}];
  assert.equal(normalizeGroupMessage(data,appId).text,'@_user_1 同意');
  assert.equal(normalizeGroupMessage(data,appId,'ou_bot').text,'@_user_1 同意');
  data.message.mentions[0].id.open_id = 'ou_bot';
  assert.equal(normalizeGroupMessage(data,appId,'ou_bot').text,'同意');
});

test('bot info discovery runs concurrently with the websocket and a failed lookup preserves the legacy path', async () => {
  for (const succeeds of [true,false]) {
    const seen = [], requests = [];
    let finish;
    class Client {
      request(options) {
        requests.push(options);
        return new Promise((resolve,reject) => {
          finish = () => succeeds ? resolve({code:0,bot:{open_id:'ou_bot'}}) : reject(new Error('sensitive lookup detail'));
        });
      }
    }
    const {connector,socket,logs} = fixture({
      receive: msg => { seen.push(msg); return {accepted:false}; }, drain() {}, close() {},
    },Client);
    await connector.start();
    const sample = event();
    sample.event.message.mentions = [{key:'@_user_1',id:{open_id:'ou_bot'}}];
    await socket.dispatch(sample);
    assert.equal(seen[0].directedToBot,undefined);
    assert.equal(requests.length,1);
    assert.equal(requests[0].method,'GET');
    assert.equal(requests[0].url,'/open-apis/bot/v3/info');
    finish();
    await nextTurn();
    await socket.dispatch(sample);
    assert.equal(seen[1].directedToBot,succeeds ? true : undefined);
    assert.equal(seen[1].text,'通过\n原价 330.50');
    assert.ok(logs.every(line => !line.includes('sensitive lookup detail')));
    await connector.stop();
  }
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
    sdk: { ...sdk, WSClient: OfflineWS, Client: class {} }, log: text => logs.push(text),
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
