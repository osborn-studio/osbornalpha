import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {openFeishuWorkflow} from './feishu-workflow.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(finish => { resolve=finish; });
  return {promise,resolve};
}

function harness(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const model = deferred(), write = deferred();
  const messages = [], writes = [];
  const config = {chatId:'group',approverIds:['pm'],analystBySender:{author:'analystA',second:'analystB'},
    analystNamesByRole:{analystA:'示例分析师甲',analystB:'示例分析师乙'},simulationAccount:{id:'916597ee-ac91-4197-aa57-04ed5d6d4e9a',confirmed:true}};
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const value=fn();db.exec('COMMIT');return value; }
    catch(error) { db.exec('ROLLBACK');throw error; }
  };
  const flow=openFeishuWorkflow(db,transaction,{config,wake:()=>{},
    extractWithModel:async ({text}) => {
      if (text==='慢消息') return model.promise;
      if (text==='撤回') return {intent:'cancel',intentEvidence:'撤回',fields:{}};
      return {intent:'proposal',fields:{ticker:{value:'NVDA',evidence:'NVDA'},action:{value:'buy',evidence:'买入'}}};
    },
    syncFormal:async input => {writes.push(input);return write.promise;},
    sendMessage:async input => {const messageId='out_'+(messages.length+1);messages.push({...input,messageId});return {messageId};},
  });
  const receive = (id,text,senderId='author',parentId=null) => flow.receive({eventId:'ev_'+id,messageId:'in_'+id,
    chatId:'group',senderId,directedToBot:!parentId,parentId,text});
  async function seed() {
    receive(1,'我建议买入 NVDA');
    await flow.drain();
    const p=flow.view().proposals[0];
    assert.ok(p?.summaryId);
    assert.equal(writes.length,0);
    return p.summaryId;
  }
  return {flow,receive,seed,model,write,messages,writes};
}

test('submission receipt and validated PM decision bypass occupied inference; durable formal sync is sent once',async t => {
  const h=harness(t);
  const summary=await h.seed();
  h.receive(2,'慢消息','second');
  const busy=h.flow.drainPrimary();
  await h.flow.drainReceipts();
  assert.match(h.messages.at(-1).text,/收到/);
  assert.equal(h.flow.view().proposals.length,1);
  assert.equal(h.receive(3,'同意','pm',summary).duplicate,false);
  assert.equal(h.flow.view().proposals[0].formalStatus,'pending_formal_sync');
  const saving=h.flow.drainFormal();
  assert.equal(h.writes.length,1);
  assert.equal(h.receive(3,'同意','pm',summary).duplicate,true);
  h.receive(4,'同意','pm',summary);
  await h.flow.drainReceipts();
  assert.equal(h.messages.filter(m=>m.text.includes('已收到你的确认')).length,1);
  assert.equal(h.flow.view().proposals[0].formalStatus,'pending_formal_sync');
  h.write.resolve({recommendationId:'9e69bf30-0527-4c80-bfc7-75dcf3e55099',decisionId:null,tradeId:null});
  await saving;
  await h.flow.drainProposalReplies();
  assert.equal(h.flow.view().proposals[0].formalStatus,'registered');
  assert.match(h.messages.at(-1).text,/正式系统建议已登记/);
  h.model.resolve({intent:'other',fields:{}}); await busy;
  assert.equal(h.writes.length,1);
});

test('an immediate confirmation cannot overtake a withdrawal received on the same summary',async t=>{
  const h=harness(t);
  const summary=await h.seed();
  h.receive(2,'撤回','author',summary);
  h.receive(3,'同意','pm',summary);
  assert.equal(h.flow.view().proposals[0].formalStatus,'awaiting_approval');
  await h.flow.drain();
  assert.equal(h.flow.view().proposals[0].formalStatus,'withdrawn');
  assert.equal(h.writes.length,0);
  assert.ok(h.messages.every(m=>!m.text.includes('已收到你的确认')));
});
