import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createFormalFeishuWorkflow } from './feishu-formal.mjs';

test('the formal connector persists and replays a PM-approved fill without a Demo service', {timeout:10_000}, async t => {
  const owner = '91000000-0000-4000-8000-00000000000a';
  const recommendationId = '91000000-0000-4000-8000-00000000000c';
  const decisionId = '91000000-0000-4000-8000-00000000000d';
  const tradeId = '91000000-0000-4000-8000-00000000000e';
  const token = 'generated-for-loopback-test-only';
  const chat = 'oc_formal_fixture';
  const author = 'ou_formal_analyst';
  const pm = 'ou_formal_pm';
  const createdAt = '2026-06-16T08:30:00.000Z';
  const approvedAt = '2026-06-16T08:31:00.000Z';
  const directory = mkdtempSync(join(tmpdir(),'osborn-formal-feishu-'));
  const requests = [];
  const committed = new Map();
  const server = createServer(async (req,res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({method:req.method,path:req.url,authorization:req.headers.authorization,payload});
    const replayed = committed.has(payload.sourceId);
    committed.set(payload.sourceId,{recommendationId,decisionId,tradeId});
    // The first write commits, but its receipt is lost before the connector can record it.
    res.writeHead(replayed ? 200 : 503, {'content-type':'application/json'});
    res.end(JSON.stringify(replayed ? {...committed.get(payload.sourceId),replayed} : {error:'lost_receipt'}));
  });
  let workflow;
  t.after(async () => {
    try {
      workflow?.close();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    } finally {
      rmSync(directory,{recursive:true,force:true});
    }
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');

  writeFileSync(join(directory,'feishu-bindings.json'),JSON.stringify({
    chatId:chat,analystBySender:{[author]:'analyst_a'},analystNamesByRole:{analyst_a:'示例分析师'},approverIds:[pm],
    simulationAccount:{id:owner,confirmed:true},
  }),{mode:0o600});
  const env = {
    FEISHU_DATA_DIR:directory,
    FEISHU_SIMULATION_ORIGIN:'http://127.0.0.1:' + server.address().port,
    FEISHU_SIMULATION_INGEST_TOKEN:token,
    REPLAY_PORT:'not-a-port',
  };
  const rawProposal = '我想模拟加仓00700.HK 200股';
  const rawPrice = '350港元';
  const messages = [];
  const modelCalls = [];
  const open = () => createFormalFeishuWorkflow({env,searchSecurity:async () => [],
    sendMessage:async message => {
      messages.push(message);
      return {messageId:'om_formal_sent_' + messages.length};
    },
    extractWithModel:async request => {
      modelCalls.push(request);
      if (request.text === rawProposal) return {intent:'proposal',fields:{
        action:{value:'add',evidence:'加仓'},ticker:{value:'00700.HK',evidence:'00700.HK'},
        quantity:{value:200,evidence:'200股'},executionMode:{value:'simulate',evidence:'模拟加仓'},
      }};
      if (request.text === rawPrice) return {intent:'proposal',fields:{price:{value:350,evidence:rawPrice}}};
      assert.fail('Unexpected text passed to the model');
    },
  });
  const event = (n, text, extra = {}) => ({
    eventId:'ev_formal_' + n,messageId:'om_formal_' + n,chatId:chat,senderId:author,
    createdAt,text,directedToBot:true,...extra,
  });
  const approval = (n,parentId,senderId = pm) => event(n,'同意',{parentId,senderId,createdAt:approvedAt,directedToBot:false});

  workflow = open();
  assert.equal(workflow.receive(event(1,rawProposal,{chatId:'oc_wrong'})).accepted,false);
  assert.equal(workflow.receive(event(2,rawProposal)).accepted,true);
  await workflow.drain();
  assert.match(messages[0].text,/模拟成交价/);
  assert.deepEqual(requests,[]);
  workflow.receive(approval(3,'om_formal_sent_1'));
  await workflow.drain();
  assert.deepEqual(workflow.view().proposals,[]);
  workflow.receive(event(4,rawPrice,{parentId:'om_formal_sent_1',directedToBot:false}));
  await workflow.drain();
  assert.deepEqual(modelCalls[1].pendingFields,['price']);
  assert.match(messages[1].text,/示例分析师/);
  assert.match(messages[1].text,/200 股 × 350 HKD/);
  assert.deepEqual(requests,[]);

  const pending = workflow.view().proposals[0];
  const pmReply = approval(6,pending.summaryId);
  assert.equal(workflow.receive(approval(5,pending.summaryId,author)).accepted,false);
  await workflow.drain();
  assert.deepEqual(requests,[]);
  assert.equal(workflow.receive(pmReply).accepted,true);
  await workflow.drain();
  assert.equal(requests.length,1);
  assert.equal(workflow.view().proposals[0].formalStatus,'pending_formal_sync');
  const [first] = requests;
  assert.equal(first.method,'POST');
  assert.equal(first.path,'/api/integrations/feishu/simulation');
  assert.equal(first.authorization,'Bearer ' + token);
  assert.equal(first.payload.expectedOwnerId,owner);
  assert.equal(first.payload.sourceId,pending.id);
  assert.equal(first.payload.analystKey,'analyst_a');
  assert.equal(first.payload.approvedAt,approvedAt);
  assert.equal(first.payload.recommendation.ticker,'00700.HK');
  assert.equal(first.payload.recommendation.action,'add');
  assert.equal(first.payload.recommendation.recommended_at,createdAt);
  assert.deepEqual(first.payload.execution,{price:350,quantity:200,fee:0,executed_at:approvedAt});

  workflow.close();
  workflow = undefined;
  workflow = open();
  await delay(2_100);
  await workflow.drain();
  assert.deepEqual(requests,[first,first]);
  assert.equal(committed.size,1);
  const registered = workflow.view().proposals[0];
  assert.equal(registered.formalStatus,'registered');
  assert.equal(registered.formalId,recommendationId);
  assert.equal(registered.decisionId,decisionId);
  assert.equal(registered.tradeId,tradeId);
  assert.equal(registered.demoId,null);
  assert.match(messages.at(-1).text,RegExp(tradeId));
  assert.equal(workflow.receive(pmReply).duplicate,true);
  workflow.receive(approval(7,pending.summaryId));
  await workflow.drain();
  assert.equal(requests.length,2);
  assert.equal(modelCalls.length,2);
  assert.equal(existsSync(join(directory,'replay.sqlite')),false);
  assert.equal(existsSync(join(directory,'feishu-workflow.sqlite')),true);
  assert.ok(messages.every(message => !/Demo|命中率|评分/.test(message.text)));
});
