import {strict as assert} from 'node:assert';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {openFeishuWorkflow} from './feishu-workflow.mjs';
import {directGroupReport, formalReportIntent} from './feishu-report-intent.mjs';

const account='13d1835d-a871-4ee4-8236-a5beea6ba4c0';
function configuration() {
  return {chatId:'group',approverIds:['pm'],analystBySender:{a:'analyst_a',b:'analystB',c:'analystC',d:'demo'},
    analystAliasesByRole:{analyst_a:['示例分析师'],analystB:['示例分析师乙'],analystC:['示例分析师丙']},
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
    ['查查记到组合里的买卖',['trades']],['哪些建议已经落单',['trades']],['哪些建议已经完成了模拟成交',['trades']],
    ['大家的建议准不准',['scores']],['大家的建议表现如何',['scores']],
    ['最近建议及打分',['recommendations','scores']],['看看我的投资模块里由建议产生的成交记录',['trades']],
    ['示例分析师提的建议，打分情况怎么样',['recommendations','scores']],['请报一下 analystC 的评分',['scores']],
    ['查 analyst_a 的建议、命中率和模拟成交',['recommendations','scores','trades']],
  ];
  for (const [text,sections] of samples) assert.deepEqual(formalReportIntent(text,c)?.sections,sections,text);
  assert.equal(formalReportIntent('请报一下 analystC 的评分',c).analystKey,'analystC');
  assert.equal(formalReportIntent('示例分析师提的建议，打分情况怎么样',c).analystKey,'analyst_a');
  for (const text of ['你能解释打分规则吗','怎么查我的评分','这款手表准不准','你看我应该下单吗？','建议买入 100 股英伟达',
    '帮我登记一条加仓建议','已明白怎么查询','你有什么选股建议？','这笔成交了吗？']) {
    assert.equal(formalReportIntent(text,c),null,text);
  }
  for (const text of ['查王五的评分','查 TSLA 的成交记录','查昨天的评分','查 analystC 和示例分析师乙的模拟交易',
    '查analyst_a最近 20 笔模拟成交','给我查一下腾讯的建议','查未绑定名字评分','我建议卖出 100 股，顺便看看打分情况','查一下我建议买入 100 股那条建议的评分']) assert.ok(formalReportIntent(text,c)?.error,text);
});

test('PM reads bound analysts together or individually; an analyst reads own data; only one tagged reply is emitted per message',async t=>{
  const h=setup(t);
  assert.equal(h.flow.receive(h.event(1,'查看正式系统建议、评分和模拟成交')).accepted,true);
  assert.equal(h.flow.receive(h.event(1,'查看正式系统建议、评分和模拟成交')).duplicate,true);
  h.flow.receive(h.event(2,'查示例分析师乙的模拟成交')); h.flow.receive(h.event(3,'查我的评分','a'));
  await h.flow.drain();
  assert.deepEqual(h.calls,[
    {expectedOwnerId:account,analystKey:null,analystKeys:['analystB','analystC','analyst_a'],sections:['recommendations','scores','trades']},
    {expectedOwnerId:account,analystKey:'analystB',sections:['trades']},
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
  for (const [n,text,sender] of [[3,'查analystB的评分','a'],[4,'查看大家的评分','a'],[5,'查模拟成交','guest'],
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

test('whole-group reads freeze the non-Demo role set before fetch and recheck it again before delivery',async t=>{
  const changed=setup(t,{query:(_request,settings)=>{delete settings.analystBySender.a;return '过期的汇总';}});
  changed.flow.receive(changed.event(1,'看所有已完成的模拟成交'));
  await changed.flow.drain();
  assert.deepEqual(changed.calls[0].analystKeys,['analystB','analystC','analyst_a']);
  assert.deepEqual(changed.sent,[]);

  const retry=setup(t,{send:()=>{throw Object.assign(Error(),{retriable:true});}});
  retry.flow.receive(retry.event(1,'查全组模拟成交'));
  await retry.flow.drain();
  retry.config.demoOnlyRoles.push('analystB');
  retry.advance(60_000);
  await retry.open().drain();
  assert.equal(retry.sent.length,1);
  assert.equal(retry.db.prepare("SELECT status FROM feishu_workflow_messages WHERE kind='formal_report'").get().status,'blocked');
});


test('an explicit group publication can be requested by any mentioned human, including Demo analysts, across restart',async t=>{
  const h=setup(t,{webhook:true,send:()=>({deliveredToWebhook:true})});
  const requests=[],observations=[];
  const queryGroupReport=async request=>{requests.push(request);return '正式报告：群汇总';};
  const flow=()=>h.open({queryGroupReport,monitor:{prune(){},observeRead(record){observations.push(record);}}});
  for (const text of ['生成一份报告','来一份全组分析报告','请帮我整理一下本群报表','给我生成报告','发份群简报']) assert.ok(directGroupReport(text),text);
  for (const text of ['不用生成报告','怎么生成一份报告','生成关于英伟达的报告','生成一份英伟达研报','生成analyst_a的分析报告','报告我已经发了','同意']) assert.ok(!directGroupReport(text),text);
  const first=flow();
  for (const [n,sender] of ['guest','a','d','pm'].entries()) {
    const event=h.event(n+1,'生成一份报告',sender);
    assert.equal(first.receive(event).accepted,true);
    assert.equal(first.receive(event).duplicate,true);
  }
  assert.equal(first.receive(h.event(7,'生成一份报告','guest',{chatId:'unconfigured'})).accepted,false);
  assert.equal(first.receive(h.event(8,'生成一份报告','guest',{directedToBot:false})).accepted,false);
  assert.equal(first.receive(h.event(9,'同意','guest',{parentId:'old_pm_summary',directedToBot:false})).accepted,false);
  const resumed=flow(); await resumed.drain(); await resumed.drain();
  assert.equal(requests.length,4);
  const base={chatId:'group',expectedOwnerId:account,analystKeys:['analystB','analystC','analyst_a']};
  assert.deepEqual(requests,[base,base,base,{...base,requesterId:'pm',includePositions:true}]);
  assert.equal(h.calls.length,0);assert.equal(h.sent.length,4);
  for (const reply of h.sent) assert.equal(reply.formalReport,true);
  assert.equal(h.db.prepare("SELECT count(*) n FROM feishu_workflow_messages WHERE kind='group_report' AND status='sent' AND message_id IS NULL AND chat_source_id IS NULL").get().n,3);
  assert.equal(observations.length,4);
  assert.ok(observations.every(row=>row.text==='生成一份报告' && row.readAction==='group_report' && !JSON.stringify(row).includes('群汇总')));
  assert.deepEqual(resumed.view().proposals,[]);
  resumed.receive(h.event(11,'那 analystB 呢','pm'));await resumed.drain();
  assert.deepEqual(h.calls,[{expectedOwnerId:account,analystKey:'analystB',sections:['recommendations','scores','trades','positions']}]);
});

test('an aggregate public job cannot outlive group membership changes, disabled reporting, or an uncertain webhook dispatch',async t=>{
  const h=setup(t,{webhook:true,send:()=>{throw Object.assign(Error('limit'),{retriable:true});}});
  let calls=0;
  const flow=h.open({queryGroupReport:async()=>{calls++;return '正式分组统计';}});
  flow.receive(h.event(1,'生成报告','visitor'));
  delete h.config.analystBySender.b;
  await flow.drain();assert.equal(calls,0);assert.equal(h.sent.length,0);
  flow.receive(h.event(2,'生成报告','visitor'));
  const changed=h.open({queryGroupReport:async()=>{h.config.simulationAccount.confirmed=false;return '旧账户报告';}});
  await changed.drain(); assert.equal(h.sent.length,0);
  h.config.simulationAccount.confirmed=true;
  flow.receive(h.event(3,'生成报告','visitor')); await flow.drain(); assert.equal(h.sent.length,1);
  h.advance(6000);await h.open({queryGroupReport:undefined}).drain();
  assert.deepEqual({...h.db.prepare("SELECT status,text FROM feishu_workflow_messages WHERE kind='group_report'").get()},{status:'blocked',text:''});
  flow.receive(h.event(4,'生成报告','visitor'));await flow.drain();assert.equal(h.sent.length,2);
  h.db.exec("UPDATE feishu_workflow_messages SET status='sending_webhook' WHERE status='pending'");
  h.advance(60000);await h.open({queryGroupReport:async()=>{throw Error();}}).drain();
  assert.equal(h.sent.length,2); assert.equal(h.db.prepare("SELECT count(*) n FROM feishu_workflow_messages WHERE status='uncertain'").get().n,1);
});

test('a model can request the same fixed bulletin for a mentioned visitor or analyst, without opening other tools',async t=>{
  const h=setup(t);
  const queries=[],report={read:'group_report'};
  const paraphrase='能把咱们组那些想法最后有没有落实整理成一段发群里吗';
  const tools=new Map([[paraphrase,report],['analyst_a私下那份给我看看',report],
    ['给我看全部详情',{...report,sections:['trades']}],['未审批的有哪些',{read:'pending'}],
    ['再来点名的',{read:'formal_report',scope:'named',sections:['trades'],subject:'analystB'}],
    ['这个呢',report],['给我写一份英伟达研报',report]]);
  const flow=h.open({queryGroupReport:async r=>{queries.push(r);return '正式分组统计';},
    extractWithModel:async()=>({intent:'read',query:report,fields:{}}),
    respondToChat:async ({text})=>tools.get(text) ?? '我在。'});
  for (const [n,text] of [...tools.keys()].filter(text=>text!=='这个呢').entries()) {
    flow.receive(h.event(n+1,text,'visitor'));await flow.drain();
  }
  assert.equal(queries.length,1);assert.equal(h.calls.length,0);
  flow.receive(h.event(20,'你好','visitor'));await flow.drain();
  const parentId='reply-'+h.sent.length;
  flow.receive(h.event(21,'这个呢','visitor',{directedToBot:false,parentId}));await flow.drain();
  assert.equal(queries.length,1);
  flow.receive(h.event(22,paraphrase,'a'));await flow.drain();assert.equal(queries.length,2);
  assert.equal(h.sent.filter(m=>m.text==='正式分组统计').length,2);
  assert.deepEqual(flow.view().proposals,[]);
});
