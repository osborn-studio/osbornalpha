import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openFeishuAdmin } from './feishu-admin.mjs';
import { loadConnectorBindings, onboardLocalMember, parseOnboardingRequest } from './feishu-onboarding.mjs';

test('enrolment only recognizes an explicit first-person request or application command', () => {
  for (const text of ['我想成为分析师，署名陈晨','申请分析师，姓名：陈晨','我也想当一名分析师，名字叫陈晨。'])
    assert.deepEqual(parseOnboardingRequest(text),{displayName:'陈晨'});
  assert.deepEqual(parseOnboardingRequest('我想当分析师'),{displayName:''});
  for (const text of ['怎么申请分析师','他想成为分析师，署名陈晨','我想成为分析师吗？','买入腾讯','我想成为分析师，署名陈晨？'])
    assert.equal(parseOnboardingRequest(text),null);
});

test('only a local persisted self request can create the Demo identity; two stores share the durable mapping', {timeout:20000}, async t => {
  const root = await mkdtemp(join(tmpdir(),'osborn-demo-onboard-'));
  t.after(() => rm(root,{force:true,recursive:true}));
  const demo = join(root,'demo');
  const formal = join(root,'formal');
  const settings = {chatId:'oc_target',analystBySender:{ou_existing:'A'},approverIds:['ou_pm'],
    analystNamesByRole:{A:'旧署名'},analystAliasesByRole:{A:['旧别名']}};
  for (const dir of [demo,formal]) {
    await mkdir(dir);
    await writeFile(join(dir,'feishu-bindings.json'),JSON.stringify(settings));
  }
  const events = new DatabaseSync(join(formal,'feishu-workflow.sqlite'));
  t.after(() => events.close());
  events.exec("CREATE TABLE feishu_workflow_events (event_id TEXT, sender_id TEXT,chat_id TEXT,kind TEXT,status TEXT,text TEXT)");
  const event = events.prepare('INSERT INTO feishu_workflow_events VALUES (?,?,?,?,?,?)');
  const add = (id, sender, name, chat = 'oc_target', kind = 'assistant_command', status = 'pending') =>
    event.run(id,sender,chat,kind,status,'我想成为分析师，署名' + name);
  add('evt_1','ou_new','陈晨');
  add('evt_2','ou_new','另一个名字');
  add('evt_3','ou_other','陈晨');
  add('evt_4','ou_pm','陈晨');
  add('evt_5','ou_existing','旧署名');
  add('evt_6','ou_stranger','路人','oc_elsewhere');
  add('evt_7','ou_stranger','路人','oc_target','chat');
  add('evt_8','ou_stranger','路人','oc_target','assistant_command','processed');
  add('evt_9','ou_other','旧别名');

  const child = spawn(process.execPath,['--import','tsx','demos/analyst-replay/server.mjs'],{
    env:{...process.env,REPLAY_DATA_DIR:demo,REPLAY_PORT:'0',REPLAY_PUBLIC_URL:'',REPLAY_FEISHU_CONNECTOR_DIR:formal},
    stdio:['ignore','pipe','ignore'],
  });
  const closed = once(child,'close');
  t.after(async () => { child.kill(); await closed; });
  let text = '';
  const started = new Promise(resolve => child.stdout.on('data',chunk => {
    text += chunk.toString();
    const found = text.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (found) resolve(Number(found[1]));
  }));
  const port = await Promise.race([started,closed.then(() => { throw Error('server exited'); })]);
  const call = eventId => onboardLocalMember(port,{eventId});
  for (const h of [{'x-forwarded-for':'127.0.0.1'},{origin:'https://other.example'},{'sec-fetch-site':'same-origin'}]) {
    const r = await fetch('http://127.0.0.1:' + port + '/internal/feishu/onboarding',{
      method:'POST',headers:{'content-type':'application/json',...h},body:JSON.stringify({eventId:'evt_1'}),
    });
    assert.equal(r.status,403);
  }
  const first = await call('evt_1');
  assert.match(first.role,/^analyst-/);
  assert.deepEqual(first,{role:first.role,displayName:'陈晨',demoOnly:true});
  assert.deepEqual(await call('evt_1'),first);
  assert.deepEqual(await call('evt_2'),first);
  assert.deepEqual(await call('evt_5'),{role:'A',displayName:'分析师 A',demoOnly:false});
  for (const id of ['evt_3','evt_9']) await assert.rejects(call(id),{status:409});
  for (const id of ['evt_4','evt_6','evt_7','evt_8','absent']) await assert.rejects(call(id),{status:403});
  for (const source of [demo,formal]) {
    const b = loadConnectorBindings(source,demo);
    assert.equal(b.analystBySender.ou_new,first.role);
    assert.deepEqual(b.demoOnlyRoles,[first.role]);
    assert.equal(b.analystNamesByRole[first.role],'陈晨');
    assert.deepEqual(JSON.parse(await readFile(join(source,'feishu-bindings.json'),'utf8')),settings);
  }
  const refreshed = new DatabaseSync(join(demo,'replay.sqlite'));
  try {
    assert.equal(refreshed.prepare('SELECT count(*) AS n FROM replay_analysts').get().n,1);
    const admin = openFeishuAdmin(demo,() => [],{db:refreshed,connectorDirectory:formal});
    events.exec(`CREATE TABLE feishu_workflow_proposals (
      id TEXT, chat_id TEXT, role TEXT, sender_id TEXT, approver_id TEXT, approval TEXT, demo_status TEXT, body TEXT
    )`);
    const proposal = {ticker:'00700.HK',action:'hold'};
    const args = {requestId:'ref1',...proposal};
    events.prepare('INSERT INTO feishu_workflow_proposals VALUES (?,?,?,?,?,?,?,?)')
      .run(args.requestId,settings.chatId,first.role,'ou_new','ou_pm','approval','pending',JSON.stringify({recommendation:proposal}));
    assert.equal(admin.approvedRegistration(first.role,args),true);
    assert.equal(admin.approvedRegistration('A',args),false);
    assert.equal(admin.approvedRegistration(first.role,{...args,action:'buy'}),false);
    events.exec("UPDATE feishu_workflow_proposals SET approver_id=sender_id");
    assert.equal(admin.approvedRegistration(first.role,args),false);
  } finally { refreshed.close(); }
});

test('unavailable Demo database preserves manual formal bindings and marks dynamic identities unknown', async t => {
  const dir = await mkdtemp(join(tmpdir(),'osborn-bindings-read-'));
  t.after(() => rm(dir,{force:true,recursive:true}));
  const settings = {chatId:'oc_group',analystBySender:{ou_existing:'A'},approverIds:['ou_pm']};
  const file = join(dir,'feishu-bindings.json');
  await writeFile(file,JSON.stringify(settings));
  assert.deepEqual(loadConnectorBindings(dir),{...settings,demoMembershipUnavailable:true});
  await writeFile(join(dir,'replay.sqlite'),'broken demo database');
  assert.deepEqual(loadConnectorBindings(dir),{...settings,demoMembershipUnavailable:true});
  await writeFile(file,'{invalid:');
  assert.throws(() => loadConnectorBindings(dir));
});
