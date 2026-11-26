import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openFeishuWorkflow } from './feishu-workflow.mjs';

const account = '91000000-0000-4000-8000-00000000000a';
const formalId = '91000000-0000-4000-8000-00000000000b';
const call = '买入 00700.HK，100股，模拟成交价 447 港元';
function fixture(t,options={}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const messages=[],writes=[];
  let clock=Date.parse('2026-06-16T08:31:00.000Z');
  const config = {chatId:'group',approverIds:['pm'],analystBySender:{one:'A',two:'B'},analystNamesByRole:{A:'张三',B:'李四'},
    simulationAccount:{confirmed:true,id:account}};
  let messageNo=0, eventNo=0;
  const classifyAssistantCommand = async ({text}) => {
    if (text === '我的开通进度') return {intent:'membership'};
    if (text.startsWith('申请')) return {intent:'join',displayName:'小陈'};
    if (text === '待办') return {intent:'pending'};
    if (text.includes('改')) return {intent:'revise'};
    return {intent:'status',proposalId:text.startsWith('查提案 ') ? text.slice(4) : undefined};
  };
  const quote = (value,evidence) => ({value,evidence});
  const opts={config,now:() => clock,reminderAfterMs:1000,classifyAssistantCommand,
    extractWithModel:async ({text}) => ({intent:'proposal',fields:{
      ticker:quote('00700.HK','00700.HK'),action:quote('buy','买入'),
      ...(text===call && {quantity:quote(100,'100股'),price:quote(447,'模拟成交价 447 港元')})}}),
    sendMessage:async body => {
      const messageId='sent_'+(++messageNo);
      messages.push({...body,messageId});
      return {messageId};
    },
    syncFormal:async payload => {
      writes.push(payload); return {recommendationId:formalId,decisionId:formalId,tradeId:formalId};
    },...options};
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
  let worker=openFeishuWorkflow(db,tx,opts);
  const inbox=(text,sender='one',parentId=null) => {
    const id=++eventNo;
    return worker.receive({eventId:'event_'+id,messageId:'origin_'+id,senderId:sender,chatId:'group',
      directedToBot:true,text,parentId,createdAt:new Date(clock).toISOString()});
  };
  const send=async (...args)=>{inbox(...args);await worker.drain();return messages.at(-1);};
  return {db,messages,writes,inbox,send,config,get worker(){return worker;},tick:ms=>{clock+=ms;},
    reopen(){worker=openFeishuWorkflow(db,tx,opts);}};
}

test('revision uses same ID and pinned account; old summary, unrelated analyst and repeated approval cannot register it', async t=>{
  const h=fixture(t);
  const original=await h.send(call);
  const id=h.worker.view().proposals[0].id;
  assert.match(original.text,/待确认提案/);
  assert.match((await h.send('数量改成 200 股','two',original.messageId)).text,/有权查看/);
  assert.match((await h.send('数量改成 -200 股','one',original.messageId)).text,/明确价格|模拟成交股数/);
  assert.match((await h.send('数量从 99 股改成 200 股','one',original.messageId)).text,/原值与当前摘要不一致/);
  const current=await h.send('把 100 股改成 200 股','one',original.messageId);
  assert.match(current.text,/第 2 版/);
  assert.match(current.text,/200 股/);
  assert.equal(h.worker.view().proposals[0].id,id);
  assert.equal(h.worker.view().proposals.length,1);
  h.reopen();
  await h.send('同意','pm',original.messageId);
  assert.equal(h.writes.length,0);
  await h.send('同意','pm',current.messageId);
  await h.send('同意','pm',current.messageId);
  assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].sourceId,id);
  assert.equal(h.writes[0].execution.quantity,200);
  assert.match((await h.send('查状态','pm',original.messageId)).text,/正式模拟成交：已登记/);
  assert.match((await h.send('查提案 '+id)).text,/Demo 建议：未请求/);
  assert.match((await h.send('查提案 '+id,'two')).text,/有权查看/);
});

test('PM pending queue and reminders use the latest persisted summary and fire only once',async t=>{
  const h=fixture(t);
  const original=await h.send(call);
  const id=h.worker.view().proposals[0].id;
  assert.match((await h.send('待办','pm')).text,new RegExp(id));
  assert.match((await h.send('待办','one')).text,/只有当前群/);
  h.tick(999);
  await h.worker.drain();
  assert.ok(!h.messages.some(m=>m.text.startsWith('提醒 PM')));
  h.reopen();h.tick(2);await h.worker.drain();
  const reminder=h.messages.at(-1);
  assert.equal(reminder.replyTo,original.messageId);
  assert.match(reminder.text,/提醒 PM/);
  h.tick(5000);h.reopen();await h.worker.drain();
  assert.equal(h.messages.filter(m=>m.text.startsWith('提醒 PM')).length,1);
  const updated=await h.send('目标价改成 490 港元','one',original.messageId);
  assert.match(updated.text,/第 2 版/);
  h.tick(2000);await h.worker.drain();
  assert.equal(h.messages.filter(m=>m.text.startsWith('提醒 PM')).length,1);
  await h.send('同意','pm',updated.messageId);
  assert.match((await h.send('待办','pm')).text,/暂无/);
});

test('approved Demo-only role calls local registration and tracks recap without attempting formal writes',async t=>{
  const local=[],recaps=[];
  const h=fixture(t,{registerDemoOnly:async args=>{local.push(args);return {id:'local_id',status:'pending'};},
    trackDemoRecap:(id,entry)=>recaps.push([id,entry.id])});
  h.config.demoOnlyRoles=['B'];
  const m=await h.send('买入 00700.HK','two');
  assert.match(m.text,/确认后可登记 Demo/);
  await h.send('同意','pm',m.messageId);
  assert.equal(local.length,1);
  assert.deepEqual(h.writes,[]);
  assert.deepEqual(recaps,[[local[0].proposalId,'local_id']]);
  const reply=await h.send('查状态','two',m.messageId);
  assert.match(reply.text,/Demo 建议：已登记 · local_id/);
  assert.match(reply.text,/正式建议：仅开通 Demo/);
  h.db.prepare(`INSERT INTO feishu_workflow_messages(id,chat_id,reply_to,text,kind,proposal_id)
    VALUES ('recap','group',?,'review','demo_recap',?)`).run(m.messageId,local[0].proposalId);
  h.config.approverIds=[];
  await h.worker.drain();
  assert.equal(h.db.prepare("SELECT status FROM feishu_workflow_messages WHERE id='recap'").get().status,'blocked');
  assert.ok(!h.messages.some(message=>message.text==='review'));
});

test('offline member provisioning survives restart and does not block suggestion, PM or other new jobs',async t=>{
  let attempts=0;
  const h=fixture(t,{provisionAnalyst:async ({senderId,eventId})=>{
    assert.equal(senderId,'newcomer');
    assert.equal(h.db.prepare('SELECT status FROM feishu_workflow_events WHERE event_id=?').get(eventId).status,'pending');
    if (++attempts===1) throw new Error('confidential network detail');
    return {text:'Demo 已开通。'};
  }});
  const queued=await h.send('申请成为分析师，署名小陈','newcomer');
  assert.match(queued.text,/自动继续/);
  assert.ok(!queued.text.includes('confidential'));
  h.reopen();
  assert.match((await h.send('我的开通进度','newcomer')).text,/已收到你的开通申请/);
  const original=await h.send(call);await h.send('同意','pm',original.messageId);
  assert.equal(h.writes.length,1);
  assert.equal(attempts,1);
  h.tick(2100);h.reopen();await h.worker.drain();
  assert.equal(attempts,2);assert.match(h.messages.at(-1).text,/Demo 已开通/);
  h.reopen();await h.worker.drain();assert.equal(attempts,2);
});

test('a temporarily unreadable Demo membership DB defers approvals and registration without blocking formal events',async t=>{
  const local=[];
  const h=fixture(t,{registerDemoOnly:async r=>{local.push(r);return {id:'local_id',status:'pending'};}});
  h.config.demoOnlyRoles=['B'];
  const demo=await h.send('买入 00700.HK','two');
  h.config.demoMembershipUnavailable=true;
  delete h.config.analystBySender.two;
  assert.throws(()=>h.inbox(call,'two'),/重投/);
  h.inbox('同意','pm',demo.messageId);
  const formal=await h.send(call);
  await h.send('同意','pm',formal.messageId);
  assert.equal(h.writes.length,1);assert.equal(local.length,0);
  h.config.demoMembershipUnavailable=false;
  h.config.analystBySender.two='B';
  h.tick(5001);await h.worker.drainPrimary();
  h.config.demoMembershipUnavailable=true;delete h.config.analystBySender.two;
  await h.worker.drainDemo();
  assert.equal(h.worker.view().proposals.find(p=>p.role==='B').demoStatus,'pending');
  h.config.demoMembershipUnavailable=false;h.config.analystBySender.two='B';
  h.tick(5001);await h.worker.drain();
  assert.equal(local.length,1);
});

test('a missing HTTP acknowledgement stays uncertain; a definitive Demo rejection fails',async t=>{
  for (const [error,expected] of [[Error('reply lost'),'uncertain'],[Object.assign(Error('rejected'),{status:403,retriable:false}),'failed']]) {
    const h=fixture(t,{register:async()=>{throw error;}});
    const initial=await h.send(call);
    await h.send('同意','pm',initial.messageId);
    for (let i=0;i<5;i++){h.tick(100_000);await h.worker.drain();}
    assert.equal(h.worker.view().proposals[0].demoStatus,expected);
  }
});
