import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {openFeishuWorkflow} from './feishu-workflow.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(finish => { resolve=finish; });
  return {promise,resolve};
}

function harness(t,{summaryDelivery,...options}={}) {
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
    sendMessage:async input => {
      const messageId='out_'+(messages.length+1);
      messages.push({...input,messageId});
      if (summaryDelivery && input.text.includes('待确认提案')) await summaryDelivery.promise;
      return {messageId};
    },...options,
  });
  const receive = (id,text,senderId='author',parentId=null,rootId=null) => flow.receive({eventId:'ev_'+id,messageId:'in_'+id,
    chatId:'group',senderId,directedToBot:!parentId,parentId,rootId,text});
  function saveLegacyReceipt(id) {
    const messageId='legacy_receipt_'+id;
    db.prepare(`INSERT INTO feishu_workflow_messages (id,chat_id,reply_to,text,kind,message_id,status)
      VALUES (?,'group',?,'收到。','input_receipt',?,'sent')`).run(messageId,'in_'+id,messageId);
    return messageId;
  }
  async function seed() {
    receive(1,'我建议买入 NVDA');
    await flow.drain();
    const p=flow.view().proposals[0];
    assert.ok(p?.summaryId);
    assert.equal(writes.length,0);
    return p.summaryId;
  }
  return {flow,receive,seed,saveLegacyReceipt,model,write,messages,writes};
}

test('submission receipt and validated PM decision bypass occupied inference; durable formal sync is sent once',async t => {
  const h=harness(t);
  const summary=await h.seed();
  h.receive(2,'慢消息','second');
  const busy=h.flow.drainPrimary();
  await h.flow.drainReceipts();
  assert.ok(h.messages.every(m=>m.replyTo!=='in_2'),'silence while the intent is unknown');
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

test('a PM reply received before Feishu returns the summary ID is confirmed as soon as delivery resolves',async t=>{
  const summaryDelivery=deferred();
  const h=harness(t,{summaryDelivery});
  h.receive(1,'我建议买入 NVDA');
  await h.flow.drainPrimary();
  const sending=h.flow.drainProposalReplies();
  const summary=h.messages.at(-1).messageId;
  assert.equal(h.flow.view().proposals[0].summaryId,null);
  h.receive(2,'慢消息','second');
  const busy=h.flow.drainPrimary();
  h.receive(3,'同意','pm','unrelated_parent');
  h.receive(4,'同意','pm',summary);
  assert.equal(h.receive(4,'同意','pm',summary).duplicate,true);
  h.receive(5,'同意','pm',summary);
  assert.equal(h.flow.view().proposals[0].formalStatus,'awaiting_approval');
  assert.equal(h.writes.length,0);
  summaryDelivery.resolve();
  await sending;
  assert.equal(h.flow.view().proposals[0].formalStatus,'pending_formal_sync');
  await h.flow.drainReceipts();
  const received=h.messages.filter(m=>m.text.includes('已收到你的确认'));
  assert.deepEqual(received.map(m=>m.replyTo),['in_4']);
  assert.ok(h.messages.every(m=>m.replyTo!=='in_3'));
  h.write.resolve({recommendationId:'9e69bf30-0527-4c80-bfc7-75dcf3e55099',decisionId:null,tradeId:null});
  await h.flow.drainFormal();
  h.model.resolve({intent:'other',fields:{}}); await busy;
  await h.flow.drain();
  assert.equal(h.writes.length,1);
  assert.equal(h.flow.view().proposals[0].formalStatus,'registered');
});

test('only a classified proposal waiting for verification gets one delayed receipt',async t=>{
  const lookup=deferred(), started=deferred();
  let clock=Date.now();
  const h=harness(t,{now:()=>clock,
    extractWithModel:async()=>({intent:'proposal',fields:{action:{value:'buy',evidence:'买入'},securityName:{value:'示例公司',evidence:'示例公司'}}}),
    searchSecurity:async()=>{started.resolve();return lookup.promise;}
  });
  h.receive(1,'买入示例公司');
  const processing=h.flow.drainPrimary();
  await started.promise;
  await h.flow.drainReceipts();
  assert.equal(h.messages.length,0);
  clock+=3001;
  await h.flow.drainReceipts();
  await h.flow.drainReceipts();
  assert.deepEqual(h.messages.map(m=>m.text),['收到建议，正在核对标的。']);
  lookup.resolve([{ticker:'01999.HK',market:'HK',name:'示例公司'}]);await processing;
  await h.flow.drainProposalReplies();
  assert.match(h.messages.at(-1).text,/待确认提案/);
});

test('analyst chatter and navigation feedback produce a single useful reply each',async t=>{
  const h=harness(t,{respondToChat:async()=>'我在。',
    extractWithModel:async({text})=>text==='聊聊' ? {intent:'other',fields:{}} :
      {intent:'read',fields:{},query:{read:'navigation',target:'context',feedback:true}},
    navigation:{render:()=>'Osborn Alpha 正式站 https://osbornalpha.com/'}});
  h.receive(1,'聊聊');await h.flow.drain();
  h.receive(2,'最好能点进对应网页');await h.flow.drain();
  assert.deepEqual(h.messages.map(m=>m.text),['我在。','收到这个建议。\nOsborn Alpha 正式站 https://osbornalpha.com/']);
  assert.equal(h.writes.length,0);
});

test('a reply to a legacy receipt follows its exact active draft before or after extraction finishes',async t=>{
  const slow=deferred(),inputs=[];
  const h=harness(t,{extractWithModel:async input=>{
    inputs.push(input);
    if (input.text.includes('买入')) return slow.promise;
    if (input.text==='另一条建议') return {intent:'proposal',intentEvidence:input.text,fields:{}};
    if (input.text==='仍然没听懂') return {intent:'help',helpTopic:'missing',fields:{}};
    return {intent:'proposal',fields:{ticker:{value:'NVDA',evidence:'NVDA'}}};
  }});
  h.receive(1,'我要买入');
  const primary=h.flow.drainPrimary();
  const originalReceipt=h.saveLegacyReceipt(1);
  assert.equal(h.receive(2,'仍然没听懂','author',originalReceipt).accepted,true);
  const followupReceipt=h.saveLegacyReceipt(2);
  slow.resolve({intent:'proposal',fields:{action:{value:'buy',evidence:'买入'}}});
  await primary;
  await h.flow.drainProposalReplies();
  assert.equal(inputs[1].isSupplement,true);
  assert.deepEqual(inputs[1].priorFields,{action:'buy'});
  h.receive(3,'另一条建议');
  await h.flow.drain();
  assert.equal(h.receive(4,'NVDA','second',followupReceipt).accepted,false);
  assert.equal(h.receive(5,'NVDA','author',followupReceipt).accepted,true);
  await h.flow.drain();
  assert.deepEqual(inputs.at(-1).priorFields,{action:'buy'});
  assert.equal(inputs.at(-1).isSupplement,true);
  assert.equal(h.flow.view().proposals.length,1);
  assert.match(h.messages.at(-1).text,/NVDA.*买入/);
  assert.equal(h.writes.length,0);
});

test('a chat receipt cannot attach to an unrelated open draft through the thread root',async t=>{
  const conversation=deferred(), inputs=[];
  const h=harness(t,{respondToChat:async()=>'你好',extractWithModel:async input=>{
    inputs.push(input);
    if (input.text==='你好') return conversation.promise;
    return {intent:'proposal',fields:{action:{value:'buy',evidence:'买入'}}};
  }});
  h.receive(1,'我建议买入');
  await h.flow.drain();
  h.receive(2,'你好');
  const busy=h.flow.drainPrimary();
  const receipt=h.saveLegacyReceipt(2);
  conversation.resolve({intent:'other',fields:{}});
  await busy;
  await h.flow.drain();
  assert.equal(h.receive(3,'NVDA','author',receipt,'in_1').accepted,false);
  assert.equal(inputs.length,2);
  assert.equal(h.flow.view().proposals.length,0);
});

test('an approval receipt cannot be used as a proposal-draft anchor',async t=>{
  const h=harness(t,{extractWithModel:async ({text})=>({intent:'proposal',fields:{
    action:{value:'buy',evidence:'买入'},...(text.includes('NVDA') && {ticker:{value:'NVDA',evidence:'NVDA'}}),
  }})});
  const summary=await h.seed();
  h.receive(2,'我想买入');
  await h.flow.drain();
  h.receive(3,'同意','pm',summary);
  await h.flow.drainReceipts();
  const approvalReceipt=h.messages.at(-1);
  assert.match(approvalReceipt.text,/已收到你的确认/);
  assert.equal(h.receive(4,'NVDA','author',approvalReceipt.messageId,'in_2').accepted,false);
  assert.equal(h.flow.view().proposals.length,1);
});
