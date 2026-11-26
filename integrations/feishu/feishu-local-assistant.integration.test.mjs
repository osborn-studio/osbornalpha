import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createFormalFeishuWorkflow } from './feishu-formal.mjs';

test('the live connector factory onboards a fourth analyst through the local OStag and Demo, then isolates Demo and formal writes', {timeout:45_000}, async t => {
  const root = await mkdtemp(join(tmpdir(),'osborn-local-assistant-'));
  const formal = join(root,'formal'), demo = join(root,'demo');
  for (const directory of [formal,demo]) await mkdir(directory);
  const chatId = 'oc_isolated', pm = 'ou_pm', newbie = 'ou_fourth';
  const bindings = {chatId,approverIds:[pm],analystBySender:{ou_first:'A',ou_second:'B',ou_third:'C'},
    analystNamesByRole:{A:'旧分析师一',B:'旧分析师二',C:'旧分析师三'},
    simulationAccount:{id:'91000000-0000-4000-8000-00000000000a',confirmed:true}};
  for (const directory of [formal,demo]) await writeFile(join(directory,'feishu-bindings.json'),JSON.stringify(bindings));

  // The Demo uses its committed HK fixture. Block every fetch in the Demo
  // subprocess so this exercise can never fetch market data or notify Feishu.
  const offline = join(root,'offline.mjs');
  await writeFile(offline,"globalThis.fetch=async()=>{ throw Error('external market feeds disabled for fixture'); };\n");
  const child = spawn(process.execPath,['--import','tsx','--import',offline,'demos/analyst-replay/server.mjs'],{
    env:{PATH:process.env.PATH,REPLAY_DATA_DIR:demo,REPLAY_PORT:'0',REPLAY_FEISHU_CONNECTOR_DIR:formal},
    stdio:['ignore','pipe','pipe'],
  });
  const closed = once(child,'close');
  let output = '', workflow, target, ledger;
  child.stderr.on('data',chunk => { output += chunk; });
  t.after(async () => {
    try {
      await workflow?.close();
      ledger?.close();
      if (target?.listening) await new Promise(resolve => target.close(resolve));
    } finally {
      if (child.exitCode == null) child.kill();
      await closed;
      await rm(root,{recursive:true,force:true});
    }
  });
  const live = new Promise(resolve => child.stdout.on('data',chunk => {
    output += chunk;
    const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) resolve(match[1]);
  }));
  const port = await Promise.race([live,closed.then(() => { throw Error(output || 'Demo exited before startup'); })]);
  const formalWrites = [];
  target = createServer(async (request,response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    formalWrites.push({url:request.url,payload:JSON.parse(Buffer.concat(chunks).toString())});
    response.writeHead(201,{'content-type':'application/json'}).end(JSON.stringify({
      recommendationId:'91000000-0000-4000-8000-00000000000c',replayed:false,
    }));
  });
  target.listen(0,'127.0.0.1');
  await once(target,'listening');
  const env = {OSBORN_FEISHU_LOCAL_ASSISTANT:'true',FEISHU_DATA_DIR:formal,REPLAY_DATA_DIR:demo,REPLAY_PORT:port,
    FEISHU_SIMULATION_ORIGIN:'http://127.0.0.1:' + target.address().port,FEISHU_SIMULATION_INGEST_TOKEN:'isolated-test-token'};
  const proposal = '仅登记建议，我想买入00700.HK';
  const messages = [];
  const open = () => createFormalFeishuWorkflow({
    env,searchSecurity:async () => [],
    extractWithModel:async ({text}) => {
      assert.equal(text,proposal);
      return {intent:'proposal',fields:{action:{value:'buy',evidence:'买入'},ticker:{value:'00700.HK',evidence:'00700.HK'},
        executionMode:{value:'advice_only',evidence:'仅登记建议'}}};
    },
    sendMessage:async message => {
      const messageId = 'om_bot_' + (messages.length + 1);
      messages.push({...message,messageId});
      return {messageId};
    },
  });
  workflow = open();
  ledger = new DatabaseSync(join(demo,'replay.sqlite'),{readOnly:true});
  let seq = 0;
  const send = async (senderId,text,parentId) => {
    seq += 1;
    const accepted = workflow.receive({eventId:'ev_'+seq,messageId:'om_'+seq,chatId,senderId,text,parentId,
      directedToBot:true,createdAt:'2026-06-16T08:30:00.000Z'});
    assert.equal(accepted.accepted,true,'must accept '+text);
    await workflow.drain();
    return messages.at(-1);
  };
  await send(newbie,'我想成为分析师，署名陈晨');
  await send(newbie,'我想成为分析师，署名陈晨');
  const memberships = ledger.prepare('SELECT analyst_id FROM feishu_demo_members WHERE sender_id=?').all(newbie);
  assert.equal(memberships.length,1);
  const role = memberships[0].analyst_id;
  assert.equal(ledger.prepare('SELECT COUNT(*) n FROM replay_analysts WHERE display_name=?').get('陈晨').n,1);
  assert.deepEqual(formalWrites,[]);
  const summary = await send(newbie,proposal);
  assert.match(summary.text,/待确认提案[\s\S]*陈晨/);
  const pending = await send(pm,'待办');
  assert.match(pending.text,/待确认 1 条[\s\S]*00700.HK/);
  const localId = workflow.view().proposals[0].id;
  await send(pm,'同意',summary.messageId);
  await send(pm,'同意',summary.messageId);
  const registered = workflow.view().proposals.find(p => p.id === localId);
  assert.equal(registered.demoStatus,'registered');
  assert.equal(registered.formalStatus,'demo_only');
  const rows = ledger.prepare('SELECT id,request_id FROM registrations WHERE role=?').all(role);
  assert.equal(rows.length,1);
  assert.deepEqual({...rows[0]},{id:registered.demoId,request_id:localId});
  assert.deepEqual(formalWrites,[]);
  await workflow.close();
  workflow = open();
  const status = await send(newbie,'查状态',summary.messageId);
  assert.match(status.text,/Demo/);
  assert.ok(status.text.includes(registered.demoId));
  const oldSummary = await send('ou_first',proposal);
  assert.match(oldSummary.text,/旧分析师一/);
  await send(pm,'同意',oldSummary.messageId);
  assert.equal(formalWrites.length,1);
  assert.equal(formalWrites[0].url,'/api/integrations/feishu/simulation');
  assert.equal(formalWrites[0].payload.analystKey,'A');
  assert.equal(formalWrites[0].payload.expectedOwnerId,bindings.simulationAccount.id);
  assert.equal(ledger.prepare('SELECT COUNT(*) n FROM registrations').get().n,1);
});
