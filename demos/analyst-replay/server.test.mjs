import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { openFeishuWorkflow } from '../../integrations/feishu/feishu-workflow.mjs';
import { pairingReference } from '../../integrations/feishu/feishu-pairing.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
async function startServer(directory, publicOrigin = '') {
  const child = spawn(process.execPath, ['--import', 'tsx', 'demos/analyst-replay/server.mjs'], {
    cwd: root,
    env: { ...process.env, REPLAY_DATA_DIR: directory, REPLAY_PORT: '0', REPLAY_PUBLIC_URL: publicOrigin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', data => { output += data; });
  child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
  const closed = once(child, 'close');
  const address = await Promise.race([
    (async () => {
      for (let n = 0; n < 150; n++) {
        const found = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (found) return found[0];
        if (child.exitCode !== null) break;
        await delay(25);
      }
      throw new Error('回放服务未启动 ' + stderr);
    })(),
    closed.then(() => { throw new Error('回放服务在启动时退出 ' + stderr); }),
  ]).catch(error => {
    child.kill();
    throw error;
  });
  return {
    address,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await closed;
    },
  };
}

test('the local role picker exchanges a selected role without embedding keys in the start page', { timeout: 15_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'osborn-replay-role-picker-'));
  const server = await startServer(directory);
  t.after(async () => {
    await server.stop();
    await rm(directory,{recursive:true,force:true});
  });
  const origin = server.address;
  const keys = JSON.parse(await readFile(join(directory,'role-keys.json'),'utf8'));
  const launcher = await readFile(join(directory,'start.html'),'utf8');
  const home = await (await fetch(origin)).text();
  const timeModule = await fetch(origin+'/beijing-time.mjs');
  assert.equal(timeModule.status,200);
  assert.match(timeModule.headers.get('content-type'),/^text\/javascript\b/);
  assert.match(await timeModule.text(),/export function beijingInputToISO\(/);
  const roster = await (await fetch(origin+'/api/demo/roles')).json();
  assert.deepEqual(roster.roles, [
    {id:'A',display_name:'分析师 A',kind:'human'},
    {id:'B',display_name:'分析师 B',kind:'human'},
    {id:'PM',display_name:'PM',kind:'pm'},
  ]);
  for (const role of ['A','B','PM']) {
    assert.ok(launcher.includes('href="'+origin+'/#role='+role+'"'));
    assert.ok(!launcher.includes(keys[role]) && !home.includes(keys[role]) && !JSON.stringify(roster).includes(keys[role]));
  }
  const select = (role, headers = {}) => fetch(origin+'/api/demo/role',{
    method:'POST', headers:{'content-type':'application/json',...headers}, body:JSON.stringify({role}),
  });
  assert.equal((await select('A')).status,403);
  assert.equal((await select('A',{origin:'https://untrusted.example'})).status,403);
  assert.equal((await select('A',{origin,'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await select('A',{origin,'sec-fetch-site':'same-site'})).status,403);
  assert.equal((await select('A',{origin,'sec-fetch-site':'none'})).status,403);
  assert.equal((await select('A',{origin,'x-forwarded-proto':'https'})).status,404);
  assert.equal((await fetch(origin+'/api/demo/roles',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal((await select('missing',{origin})).status,404);
  for (const role of ['A','B','PM']) {
    const selection = await select(role,{origin,'sec-fetch-site':'same-origin'});
    assert.equal(selection.status,200);
    assert.equal(selection.headers.get('cache-control'),'no-store');
    const {key} = await selection.json();
    assert.ok(key === keys[role], 'the local selector must return the same role key');
    const state = await fetch(origin+'/api/state',{headers:{authorization:'Bearer '+key}});
    assert.equal((await state.json()).role,role);
  }
  const added = await fetch(origin+'/api/analysts',{
    method:'POST', headers:{origin,'content-type':'application/json',authorization:'Bearer '+keys.PM},
    body:JSON.stringify({display_name:'第三位分析师',kind:'agent'}),
  });
  const {profile} = await added.json();
  assert.equal(added.status,201);
  const addedRoster = await (await fetch(origin+'/api/demo/roles')).json();
  assert.ok(addedRoster.roles.some(({id,display_name,kind}) => id === profile.id && display_name === '第三位分析师' && kind === 'agent'));
  const {key} = await (await select(profile.id,{origin})).json();
  const state = await fetch(origin+'/api/state',{headers:{authorization:'Bearer '+key}});
  assert.equal((await state.json()).role,profile.id);
});

test('local PM can pair an observed Feishu sender without changing existing account or alias settings', { timeout: 15_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'osborn-feishu-pairing-'));
  const server = await startServer(directory);
  const {address} = server;
  const settingsFile = join(directory,'feishu-bindings.json');
  const workflowFile = join(directory,'feishu-workflow.sqlite');
  const {A,PM} = JSON.parse(await readFile(join(directory,'role-keys.json'),'utf8'));
  let db;
  t.after(async () => {
    await server.stop();
    db?.close();
    await rm(directory,{recursive:true,force:true});
  });
  const call = (token, body, headers = {}) => fetch(address + '/api/feishu/bindings', {
    method:body === undefined ? 'GET' : 'POST',
    headers:{...(token ? {authorization:'Bearer ' + token} : {}),
      ...(body === undefined ? {} : {'content-type':'application/json',origin:address}), ...headers},
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const post = (path,token,body,headers = {}) => fetch(address + path,{
    method:'POST',headers:{authorization:'Bearer ' + token,origin:address,'content-type':'application/json',...headers},
    body:JSON.stringify(body),
  });
  assert.equal((await call()).status,401);
  assert.equal((await call(A)).status,403);
  assert.equal((await call(PM, undefined, {'x-forwarded-proto':'https'})).status,404);
  assert.deepEqual((await (await call(PM)).json()).pairings,[]);
  await assert.rejects(stat(workflowFile), {code:'ENOENT'});
  assert.equal((await post('/api/webhook',PM,{mode:'app'})).status,409);

  db = new DatabaseSync(workflowFile);
  db.exec('PRAGMA journal_mode=WAL');
  const replies = new Map();
  const workflow = openFeishuWorkflow(db, fn => fn(), {
    register() { throw new Error('Pairing must never register suggestions'); },
    sendMessage:async ({replyTo,text}) => {
      replies.set(replyTo,text);
      return {messageId:'reply_' + replyTo};
    },
  });
  const pair = (n, chatId, senderId, text = '联调') => workflow.receive({
    eventId:'event_' + n,messageId:'message_' + n,chatId,senderId,text,
  });
  assert.equal(pair(1,'oc_main','ou_analyst').accepted,true);
  assert.equal(pair(2,'oc_other','ou_other','绑定').accepted,true);
  await workflow.drain();
  assert.equal(pair(3,'oc_main','ou_approver').accepted,true);
  const current = {simulationAccount:{id:'fixture-owner',confirmed:true},
    accountMapping:{other:'fixture-account'},formalAliases:{A:'正式分析师'},analystNamesByRole:{A:'群内署名'},
    analystAliasesByRole:{A:['甲组研究员']}};
  await writeFile(settingsFile,JSON.stringify(current),{mode:0o600});

  const {chatId,pairings,analysts,...rest} = await (await call(PM)).json();
  assert.equal(chatId,null);
  assert.deepEqual(rest,{});
  assert.ok(analysts.some(item => item.id === 'A' && item.signature === '群内署名' && !item.assigned));
  assert.deepEqual(analysts.find(item => item.id === 'A').aliases, ['甲组研究员']);
  assert.deepEqual(analysts.find(item => item.id === 'B').aliases, []);
  assert.ok(pairings.some(pairing => pairing.chatId === 'oc_main' && pairing.senderId === 'ou_analyst' &&
    pairing.status === 'paired' && pairing.replyStatus === 'sent' &&
    pairing.pairingReference === pairingReference('oc_main','ou_analyst')));
  assert.ok(replies.get('message_1').includes('配对编号 ' + pairingReference('oc_main','ou_analyst')));
  assert.ok(pairings.some(pairing => pairing.senderId === 'ou_approver' && pairing.status === 'pending'));
  assert.ok(pairings.some(pairing => pairing.chatId === 'oc_other'));

  const make = (senderId, assignment, chatId = 'oc_main') => ({chatId,senderId,assignment});
  assert.equal((await call(PM,make('ou_unknown','A'))).status,409);
  assert.equal((await call(PM,make('ou_analyst','A'),{origin:'https://untrusted.invalid'})).status,403);
  assert.equal((await call(A,make('ou_analyst','A'))).status,403);
  assert.equal((await call(PM,make('ou_analyst','nonexistent'))).status,400);
  assert.deepEqual(JSON.parse(await readFile(settingsFile,'utf8')),current);
  const assigned = await call(PM,make('ou_analyst','A'));
  assert.equal(assigned.status,200);
  const result = await assigned.json();
  assert.equal(result.chatId,'oc_main');
  assert.ok(result.pairings.some(pairing => pairing.senderId === 'ou_analyst' && pairing.analyst === 'A' && !pairing.approver));
  assert.equal((await call(PM,make('ou_analyst','A'))).status,200);
  assert.equal((await call(PM,make('ou_analyst','B'))).status,409);
  assert.equal((await call(PM,make('ou_other','B','oc_other'))).status,409);
  assert.equal((await call(PM,make('ou_approver','A'))).status,409);
  assert.equal((await call(PM,make('ou_analyst','approver'))).status,409);
  assert.equal((await call(PM,make('ou_approver','approver'))).status,200);
  assert.deepEqual(JSON.parse(await readFile(settingsFile,'utf8')),{
    ...current, chatId:'oc_main', analystBySender:{ou_analyst:'A'}, approverIds:['ou_approver'],
  });
  assert.equal((await stat(settingsFile)).mode & 0o777,0o600);
  assert.equal((await fetch(address + '/feishu-bindings.json',{headers:{authorization:'Bearer ' + PM}})).status,404);
  assert.equal((await post('/api/webhook',A,{mode:'app'})).status,403);
  assert.equal((await post('/api/webhook',PM,{mode:'app'},{'x-forwarded-proto':'https'})).status,404);
  const appMode = await post('/api/webhook',PM,{mode:'app'});
  assert.equal(appMode.status,200);
  const appState = await appMode.json();
  assert.deepEqual(appState.webhook,{mode:'app',configured:true,signed:false,appAvailable:true});
  assert.doesNotMatch(JSON.stringify(appState),/oc_main|ou_analyst/);
  const appTest = await post('/api/webhook/test',PM,{});
  assert.equal((await appTest.json()).notifications[0].mode,'app');
  assert.equal((await post('/api/registrations',A,{requestId:'spoofed'},{'x-demo-registration-source':'feishu-app'})).status,403);

  const unscoped = {...current, analystBySender:{ou_other:'B'}};
  await writeFile(settingsFile,JSON.stringify(unscoped),{mode:0o600});
  assert.equal((await call(PM,make('ou_analyst','A'))).status,409);
  assert.deepEqual(JSON.parse(await readFile(settingsFile,'utf8')),unscoped);
  const malformed = {...current, analystAliasesByRole:{B:'非列表'}};
  await writeFile(settingsFile,JSON.stringify(malformed),{mode:0o600});
  assert.equal((await call(PM)).status,500);
  assert.equal((await call(PM,make('ou_analyst','A'))).status,500);
  assert.deepEqual(JSON.parse(await readFile(settingsFile,'utf8')),malformed);
});

test('three authenticated sessions, real loopback bot receipts, replay persistence and PM acceptance', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'osborn-replay-http-'));
  let server;
  t.after(async () => {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  });
  server = await startServer(directory);
  const keys = JSON.parse(await readFile(join(directory, 'role-keys.json'), 'utf8'));

  async function request(role, path, data, expected = 200) {
    const headers = {};
    if (role) headers.authorization = 'Bearer ' + keys[role];
    if (data !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(server.address + path, {
      method: data === undefined ? 'GET' : 'POST', headers, body: JSON.stringify(data), signal: AbortSignal.timeout(3000),
    });
    const raw = await res.text();
    assert.equal(res.status, expected, path + ' returned ' + res.status);
    for (const secret of Object.values(keys)) assert.equal(raw.includes(secret), false, 'role key leaked');
    return JSON.parse(raw);
  }
  const state = () => request('PM', '/api/state');
  function action(role, kind, context, fields = {}, expected = 200) {
    const { sessionId, round, phase } = context;
    return request(role, '/api/action', { sessionId, round, phase, kind, ...fields }, expected);
  }
  async function delivered() {
    for (let n = 0; n < 120; n++) {
      const current = await state();
      if (current.notifications.length && current.notifications.every(row => row.status === 'sent')) return current;
      await delay(40);
    }
    throw new Error('本地群播报未全部收到回执。');
  }
  const rec = action => ({ action, rationale: '仅本人可见，锁定以后公布', confidence: 70 });

  await request(null, '/api/state', undefined, 401);
  await request('A', '/tencent-hk00700.json', undefined, 404);
  await request('A', '/role-keys.json', undefined, 404);
  await request('A', '/api/webhook/test', {}, 403);
  await request('A', '/internal/mock-feishu', {}, 403);
  const idle = await state();
  assert.equal(idle.phase, 'idle');
  assert.equal(idle.webhook.mode, 'local');
  assert.equal((await request('A', '/api/state')).webhook, undefined);
  await action('A', 'start', idle, {}, 403);
  await request('PM', '/api/webhook/test', {});
  const first = await delivered();
  assert.equal(first.notifications.length, 1);
  await request('PM', '/api/webhook/retry', { id: first.notifications[0].id }, 409);

  let view = await action('PM', 'start', idle);
  await action('PM', 'start', idle, {}, 409);
  await action('PM', 'advance', view, {}, 409);
  const [submit1, submit2] = await Promise.all([0, 1].map(async () => {
    const res = await fetch(server.address + '/api/action', {
      method: 'POST', headers: { authorization: 'Bearer ' + keys.A, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: view.sessionId, round: view.round, phase: view.phase, kind: 'submit', ...rec('buy') }),
    });
    await res.text();
    return res.status;
  }));
  assert.deepEqual([submit1, submit2].sort(), [200, 409]);
  const hidden = await request('B', '/api/state');
  assert.deepEqual(hidden.submissions[0], { role: 'A', submitted: true });
  assert.equal(JSON.stringify(hidden).includes(rec('buy').rationale), false);
  assert.equal(hidden.market.asOf, '2026-06-16');

  // Persist the half-completed round and previously acknowledged bot delivery through a real process restart.
  await delivered();
  await server.stop();
  server = await startServer(directory);
  view = await request('A', '/api/state');
  assert.equal(view.sessionId, idle.sessionId);
  assert.equal(view.submissions[0].action, 'buy');
  assert.equal(view.notifications[0].attempts, 1);
  view = await action('B', 'submit', view, rec('pass'));
  assert.equal(view.phase, 'locked');
  assert.equal(view.submissions[0].rationale, rec('buy').rationale);
  view = await action('PM', 'advance', view);
  assert.equal(view.history[0].d10Close, null);
  assert.deepEqual(view.results.map(v => v.avgScore), [-4.2, 4.2]);
  view = await action('PM', 'advance', view);
  assert.equal(view.phase, 'd10');
  assert.equal(view.history[0].d10Close, 430.2);
  assert.deepEqual(view.results.map(v => v.avgScore), [-3.8, 3.8]);
  view = await action('PM', 'advance', view);
  assert.equal(view.round, 2);
  assert.equal(view.phase, 'collecting');
  await Promise.all([action('A', 'submit', view, rec('buy')), action('B', 'submit', view, rec('pass'))]);
  view = await state();
  for (let i = 0; i < 3; i++) view = await action('PM', 'advance', view);
  assert.equal(view.phase, 'review');
  await action('B', 'accept', view, { note: '越权' }, 403);
  const accepted = await action('PM', 'accept', view, { note: '核对收盘与账本一致' });
  assert.equal(accepted.phase, 'complete');
  assert.deepEqual(accepted.results.map(v => [v.hits, v.n, v.hitRate, v.avgScore]), [[0, 2, 0, -2.7], [2, 2, 100, 2.7]]);
  view = await delivered();
  assert.equal(view.notifications.length, 13);
  assert.match(view.notifications[0].text, /核对收盘与账本一致/);
  for (const role of ['A', 'B']) assert.deepEqual((await request(role, '/api/state')).review, accepted.review);

  // Inject the persisted state of a lost acknowledgement in this disposable database.
  // A retry after restart must reuse the existing receipt from the actual HTTP receiver.
  await server.stop();
  const localDb = new DatabaseSync(join(directory, 'replay.sqlite'));
  const event = view.notifications[0];
  try {
    const receipts = localDb.prepare('SELECT payload FROM replay_mock_receipts WHERE receipt_id=?').all(event.receiptId);
    assert.equal(receipts.length, 1);
    const card = JSON.parse(receipts[0].payload).card;
    assert.equal(card.header.title.content, event.title);
    assert.equal(card.elements[0].text.content, event.text);
    localDb.prepare("UPDATE replay_outbox SET status='failed',sent_at=NULL WHERE receipt_id=?").run(event.receiptId);
  } finally { localDb.close(); }
  server = await startServer(directory);
  await request('B', '/api/webhook/retry', { id: event.id }, 403);
  await request('PM', '/api/webhook/retry', { id: event.id });
  view = await delivered();
  assert.equal(view.notifications[0].receiptId, event.receiptId);
  assert.equal(view.notifications[0].attempts, 2);
  assert.equal(view.notifications[1].attempts, 1);
  assert.equal(view.notifications.length, 13);
  const persisted = new DatabaseSync(join(directory, 'replay.sqlite'), { readOnly: true });
  try {
    assert.equal(persisted.prepare('SELECT count(*) AS n FROM replay_mock_receipts').get().n, 13);
  } finally { persisted.close(); }

  const next = await action('PM', 'newSession', view);
  assert.equal(next.phase, 'idle');
  assert.notEqual(next.sessionId, accepted.sessionId);
  assert.deepEqual(next.notifications, []);
  await action('PM', 'newSession', view, {}, 409);
});


test('a configured HTTPS proxy preserves role boundaries and sends a credential-free card link', { timeout: 20_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'osborn-replay-share-http-'));
  const publicOrigin = 'https://shared-demo.example.test';
  const publicHost = new URL(publicOrigin).host;
  let server;
  t.after(async () => {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  });
  server = await startServer(directory, publicOrigin);
  const keys = JSON.parse(await readFile(join(directory, 'role-keys.json'), 'utf8'));
  const keepPrivate = text => assert.ok(Object.values(keys).every(key => !text.includes(key)), 'response contains a role key');
  const launcher = await readFile(join(directory, 'start.html'), 'utf8');
  for (const key of Object.values(keys)) {
    assert.ok(launcher.includes('href="' + publicOrigin + '/#key=' + key + '"'), 'role link must use HTTPS and a fragment');
  }

  async function request(path, { role, host = publicHost, origin, body, forwarded = {} } = {}) {
    const headers = {host, ...forwarded};
    if (role) headers.authorization = 'Bearer ' + keys[role];
    if (origin) headers.origin = origin;
    if (body !== undefined) headers['content-type'] = 'application/json';
    // Force the Host header exactly as the HTTPS proxy would send it.
    const {status,text} = await new Promise((resolve,reject) => {
      const req = httpRequest(server.address + path, {
        headers, method:body === undefined ? 'GET' : 'POST', signal:AbortSignal.timeout(3000),
      },response => {
        let text = '';
        response.setEncoding('utf8').on('data', chunk => { text += chunk; });
        response.on('end', () => resolve({status:response.statusCode,text}));
        response.on('error',reject);
      });
      req.on('error',reject);
      req.end(JSON.stringify(body));
    });
    keepPrivate(text);
    return {status,text};
  }
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/api/state')).status, 401);
  assert.equal((await request('/api/demo/roles')).status,404);
  assert.equal((await request('/api/demo/role',{origin:publicOrigin,body:{role:'PM'}})).status,404);
  assert.equal((await request('/api/demo/role',{host:new URL(server.address).host,origin:server.address,body:{role:'PM'}})).status,404);
  assert.equal((await request('/api/feishu/bindings',{role:'PM'})).status,404);
  assert.equal((await request('/api/feishu/bindings',{role:'PM',origin:publicOrigin,body:{}})).status,404);
  assert.equal((await request('/api/webhook',{role:'PM',origin:publicOrigin,body:{mode:'app'}})).status,404);
  for (const role of ['A', 'B', 'PM']) {
    const state = await request('/api/state', {role});
    assert.equal(state.status, 200);
    assert.equal(JSON.parse(state.text).role, role);
    if (role === 'PM') assert.equal(JSON.parse(state.text).webhook.appAvailable,false);
  }
  for (const path of ['/start.html','/role-keys.json','/replay.sqlite','/tencent-hk00700.json']) {
    assert.equal((await request(path, {role:'PM'})).status, 404);
  }
  assert.equal((await request('/', {host:'unknown.example.test',
    forwarded:{'x-forwarded-host':publicHost,'x-forwarded-proto':'https'}})).status, 403);
  assert.equal((await request('/api/webhook/test',
    {role:'PM',origin:'https://other.example.test',body:{}})).status, 403);
  assert.equal((await request('/api/webhook/test', {role:'A',origin:publicOrigin,body:{}})).status, 403);
  assert.equal((await request('/internal/mock-feishu', {role:'PM',origin:publicOrigin,body:{}})).status, 403);

  const loopbackHost = new URL(server.address).host;
  const queued = await request('/api/webhook/test', {role:'PM', host:loopbackHost, origin:publicOrigin, body:{},
    forwarded:{'x-forwarded-host':publicHost,'x-forwarded-proto':'https'}});
  assert.equal(queued.status, 200);
  let receipt;
  for (let n = 0; n < 100; n++) {
    const pm = await request('/api/state', {role:'PM'});
    receipt = JSON.parse(pm.text).notifications.find(item => item.status === 'sent');
    if (receipt) break;
    await delay(30);
  }
  assert.equal(receipt?.mode, 'local');
  const db = new DatabaseSync(join(directory, 'replay.sqlite'), {readOnly:true});
  try {
    const {payload} = db.prepare('SELECT payload FROM replay_mock_receipts WHERE receipt_id=?').get(receipt.receiptId);
    keepPrivate(payload);
    const actions = JSON.parse(payload).card.elements.find(element => element.tag === 'action').actions;
    assert.equal(actions.length,1);
    assert.equal(actions[0].url,publicOrigin + '/');
  } finally {
    db.close();
  }
});
