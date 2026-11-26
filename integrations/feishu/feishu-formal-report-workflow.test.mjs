import {strict as assert} from 'node:assert';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {openFeishuWorkflow} from './feishu-workflow.mjs';
import {formalReportIntent} from './feishu-report-intent.mjs';

const account='13d1835d-a871-4ee4-8236-a5beea6ba4c0';
function configuration() {
  return {chatId:'group',approverIds:['pm'],analystBySender:{a:'analyst_a',b:'bin',c:'lin',d:'demo'},
    analystAliasesByRole:{analyst_a:['示例分析师'],bin:['陈斌'],lin:['林昕岚']},
    simulationAccount:{confirmed:true,id:account},demoOnlyRoles:['demo']};
}
function setup(t,options={}) {
  const config=configuration();
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  const calls=[],sent=[];
  let time=Date.UTC(2026,10,1);
  const sendMessage=async request=>{
    sent.push(request);
    if (options.send) return options.send(request,sent.length);
    return {messageId:'reply-'+sent.length};
  };
  sendMessage.formalReportWebhook=options.webhook??false;
  const services={config:()=>config,now:()=>time,sendMessage,queryFormal:async request=>{
    calls.push(request);
    if (options.query) return options.query(request,config);
    return '正式报表的结果';
  },extractWithModel:async()=>assert.fail('report must not enter proposal extraction'),
  respondToChat:async()=>assert.fail('report must not enter generative chat')};
  const transaction=fn=>{
    db.exec('BEGIN IMMEDIATE');
    try {const out=fn(); db.exec('COMMIT'); return out;} catch(err) {db.exec('ROLLBACK');throw err;}
  };
  const open=(overrides={})=>openFeishuWorkflow(db,transaction,{...services,...overrides});
  const flow=open();
  const event=(n,text,senderId='pm',patch={})=>({eventId:'event'+n,messageId:'in'+n,chatId:'group',senderId,text,directedToBot:true,...patch});
  return {config,db,calls,sent,open,flow,event,advance:ms=>{time+=ms;}};
}

test('natural read requests select formal tables, while help, casual chat and instructions to trade keep their existing routes',()=>{
  const c=configuration();
  const samples=[
    ['查看正式系统内分析模块的建议情况，打分情况',['recommendations','scores']],
    ['看下根据建议已经实现的模拟交易（我的投资模块）',['trades']],
    ['看看正式系统内分析模块的建议情况、打分情况，以及根据建议已经实现的模拟交易（我的投资模块）',['recommendations','scores','trades']],
    ['查一下正式系统里大家的建议、打分和已经落地的模拟交易',['recommendations','scores','trades']],
    ['查看建议情况和打分情况',['recommendations','scores']],
    ['查查记到组合里的买卖',['trades']],['哪些建议已经落单',['trades']],
    ['大家的建议准不准',['scores']],['大家的建议表现如何',['scores']],
    ['最近建议及打分',['recommendations','scores']],['看看我的投资模块里由建议产生的成交记录',['trades']],
    ['示例分析师提的建议，打分情况怎么样',['recommendations','scores']],['请报一下 lin 的评分',['scores']],
    ['查 analyst_a 的建议、命中率和模拟成交',['recommendations','scores','trades']],
  ];
  for (const [text,sections] of samples) assert.deepEqual(formalReportIntent(text,c)?.sections,sections,text);
  assert.equal(formalReportIntent('请报一下 lin 的评分',c).analystKey,'lin');
  assert.equal(formalReportIntent('示例分析师提的建议，打分情况怎么样',c).analystKey,'analyst_a');
  for (const text of ['你能解释打分规则吗','怎么查我的评分','这款手表准不准','你看我应该下单吗？','建议买入 100 股英伟达',
    '帮我登记一条加仓建议','已明白怎么查询','你有什么选股建议？','这笔成交了吗？']) {
    assert.equal(formalReportIntent(text,c),null,text);
  }
  for (const text of ['查王五的评分','查 TSLA 的成交记录','查昨天的评分','查 lin 和陈斌的模拟交易',
    '查lina最近 20 笔模拟成交','给我查一下腾讯的建议','查未绑定名字评分','我建议卖出 100 股，顺便看看打分情况','查一下我建议买入 100 股那条建议的评分']) assert.ok(formalReportIntent(text,c)?.error,text);
});

test('PM reads account-wide or named formal records; an analyst reads own data; only one tagged reply is emitted per message',async t=>{
  const h=setup(t);
  assert.equal(h.flow.receive(h.event(1,'查看正式系统建议、评分和模拟成交')).accepted,true);
  assert.equal(h.flow.receive(h.event(1,'查看正式系统建议、评分和模拟成交')).duplicate,true);
  h.flow.receive(h.event(2,'查陈斌的模拟成交')); h.flow.receive(h.event(3,'查我的评分','a'));
  await h.flow.drain();
  assert.deepEqual(h.calls,[
    {expectedOwnerId:account,analystKey:null,sections:['recommendations','scores','trades']},
    {expectedOwnerId:account,analystKey:'bin',sections:['trades']},
    {expectedOwnerId:account,analystKey:'analyst_a',sections:['scores']},
  ]);
  assert.deepEqual(h.sent.map(m=>[m.replyTo,m.text,m.formalReport]),[['in1','正式报表的结果',true],['in2','正式报表的结果',true],['in3','正式报表的结果',true]]);
  assert.equal(h.db.prepare('SELECT count(*) n FROM feishu_chat_turns').get().n,0);
  assert.equal(h.flow.view().proposals.length,0);
  assert.equal(h.flow.receive(h.event(4,'查我的评分','a',{parentId:'reply-3',directedToBot:false})).accepted,true);
  await h.flow.drain();
  assert.equal(h.calls.length,4);
});

test('ambient messages, cross-analyst requests, unknown users, and unconfirmed accounts cannot obtain a report',async t=>{
  const h=setup(t);
  assert.equal(h.flow.receive(h.event(1,'查 analyst_a 的评分','pm',{directedToBot:false})).accepted,false);
  assert.equal(h.flow.receive(h.event(2,'查正式系统的建议','pm',{chatId:'other'})).accepted,false);
  for (const [n,text,sender] of [[3,'查bin的评分','a'],[4,'查看大家的评分','a'],[5,'查模拟成交','guest'],
    [6,'查我的建议','d'],[7,'查王五的评分','pm'],[8,'查我的评分','pm']]) h.flow.receive(h.event(n,text,sender));
  await h.flow.drain();
  assert.equal(h.calls.length,0);
  assert.equal(h.sent.length,6);
  h.config.simulationAccount.confirmed=false;
  h.flow.receive(h.event(10,'查 analyst_a 的评分'));
  await h.flow.drain();
  assert.equal(h.calls.length,0);
  assert.match(h.sent.at(-1).text,/尚未绑定/);
});

test('formal source failure and binding changes during read or before retry cannot expose earlier group data',async t=>{
  const h=setup(t,{query:(_r,config)=>{config.approverIds=[];return '敏感报表';}});
  h.flow.receive(h.event(1,'查模拟成交'));
  await h.flow.drain();
  assert.equal(h.calls.length,1);
  assert.equal(h.sent.length,0);
  const broken=setup(t,{query:()=>{throw Error('internal source detail') }});
  broken.flow.receive(broken.event(1,'查模拟成交')); await broken.flow.drain();
  assert.match(broken.sent[0].text,/未能读取/);
  assert.doesNotMatch(broken.sent[0].text,/internal/);

  const retry=setup(t,{send:()=>{throw Object.assign(Error(),{retriable:true});}});
  retry.flow.receive(retry.event(1,'查模拟成交')); await retry.flow.drain();
  retry.config.approverIds=[];retry.advance(60000);await retry.flow.drain();
  assert.equal(retry.sent.length,1);
  assert.deepEqual({...retry.db.prepare("SELECT status,text FROM feishu_workflow_messages WHERE kind='formal_report'").get()},
    {status:'blocked',text:''});
});

test('quota-exempt delivery has no native message ID; uncertain dispatch and interrupted delivery cannot be repeated',async t=>{
  const h=setup(t,{webhook:true,send:()=>({deliveredToWebhook:true})});
  h.flow.receive(h.event(1,'查模拟成交'));await h.flow.drain();
  assert.deepEqual({...h.db.prepare('SELECT status,message_id FROM feishu_workflow_messages').get()},{status:'sent',message_id:null});
  const lost=setup(t,{webhook:true,send:()=>{throw Object.assign(Error(),{uncertain:true});}});
  lost.flow.receive(lost.event(1,'查模拟成交'));await lost.flow.drain();
  lost.advance(3600000);await lost.flow.drain();
  assert.equal(lost.sent.length,1);
  assert.equal(lost.db.prepare('SELECT status FROM feishu_workflow_messages').get().status,'uncertain');
  lost.db.exec("UPDATE feishu_workflow_messages SET status='sending_webhook'");
  await lost.open().drain();
  assert.equal(lost.sent.length,1);
  assert.equal(lost.db.prepare('SELECT status FROM feishu_workflow_messages').get().status,'uncertain');

  const limited=setup(t,{webhook:true,send:(_r,n)=>{if(n===1)throw Object.assign(Error(),{retriable:true}); return {deliveredToWebhook:true};}});
  limited.flow.receive(limited.event(1,'查模拟成交')); await limited.flow.drain();
  limited.advance(60000); await limited.flow.drain();
  assert.equal(limited.sent.length,2);assert.equal(limited.calls.length,1);
  assert.equal(limited.db.prepare('SELECT status FROM feishu_workflow_messages').get().status,'sent');
});

test('queued report cannot be sent through the app when formal reporting is disabled before retry',async t=>{
  const h=setup(t,{webhook:true,send:()=>{throw Object.assign(Error(),{retriable:true});}});
  h.flow.receive(h.event(1,'查模拟成交'));
  await h.flow.drain();
  assert.equal(h.db.prepare('SELECT status FROM feishu_workflow_messages').get().status,'pending');
  h.advance(60000);
  const disabled=h.open({queryFormal:undefined,sendMessage:()=>assert.fail('inactive report must never fall back to app')});
  await disabled.drain();
  assert.deepEqual({...h.db.prepare('SELECT status,text FROM feishu_workflow_messages').get()},{status:'blocked',text:''});
});
