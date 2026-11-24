import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openFeishuWorkflow } from './feishu-workflow.mjs';

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
    createdAt:proposedAt,text:command,...extra};
}

function approval(n, parentId = 'om_sent_1', extra = {}) {
  return event(n,{senderId:approver,createdAt:approvedAt,text:'同意',parentId,...extra});
}

test('the group receipt identifies the Beijing suggestion time and New York pricing date', async t => {
  const h = harness(t);
  const workflow = h.open({register:async ({fields}) => ({
    id:recommendationId,status:'pending',recommendation:fields,
    evidence:{disclosure:'基准交易日为 2025-11-24。'},
  })});
  workflow.receive(event(1,{text:'我想买入NVDA',createdAt:'2025-11-25T03:19:13.474Z'}));
  await workflow.drain();
  workflow.receive(approval(2,'om_sent_1',{createdAt:'2025-11-25T03:20:00.000Z'}));
  await workflow.drain();
  assert.match(h.messages[1].text,/建议时间（北京时间）2025-11-25 11:19:13/);
  assert.match(h.messages[1].text,/纽约交易日.*2025-11-24/);
});

test('a colloquial buy plus add uses the exact HK ticker and the explicit add action', async t => {
  const h = harness(t);
  const workflow = h.open();
  workflow.receive(event(1,{text:'我想买01800.HK或者加仓'}));
  await workflow.drain();
  assert.match(h.messages[0].text,/多个不同的建议动作/);
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
  assert.equal(workflow.receive(event(1,{text:'00700.HK'})).accepted,false);
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
  assert.match(h.messages[3].text,/重复/);
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
  assert.match(h.messages.at(-1).text,/正式系统建议已登记/);
  assert.doesNotMatch(h.messages.at(-1).text,/模拟成交已登记/);
});
