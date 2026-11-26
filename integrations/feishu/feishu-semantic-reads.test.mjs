import {strict as assert} from 'node:assert';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {openFeishuWorkflow} from './feishu-workflow.mjs';
import {groundFormalRead} from './feishu-report-intent.mjs';

const owner='258ce2ae-c88c-408d-a948-0b1fc5fd4618';
const modelReport=(scope,sections,subject)=>({read:'formal_report',scope,sections,...(subject && {subject})});
function fixture(t,options={}) {
  const config={chatId:'room',approverIds:['pm'],simulationAccount:{id:owner,confirmed:true},
    analystBySender:{a:'analystA',b:'analystB',c:'analystC'},analystAliasesByRole:{analystA:['示例分析师甲'],analystB:['示例分析师乙'],analystC:['示例分析师丙']}};
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  const sent=[],queries=[],calls=[],extracts=[],writes=[],observations=[];
  const responders=new Map();
  let seq=0;
  const services={config:()=>config,sendMessage:async request=>{sent.push(request);return {messageId:'out'+sent.length};},
    respondToChat:async input=>{calls.push(input);return responders.get(input.text) ?? '收到。';},
    extractWithModel:async input=>{extracts.push(input);return {intent:'read',query:responders.get(input.text),fields:{}};},
    queryFormal:async req=>{queries.push(req);return options.query ? options.query(req) : '这份正式报表 '+req.sections.join('、');},
    syncFormal:async request=>{writes.push(request);throw Error('unexpected write');},monitor:{prune(){},observe(){},observeRead(evt){observations.push(evt);}}};
  const open=()=>openFeishuWorkflow(db,fn=>{
    db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}
  },services);
  let flow=open();
  const receive=(text,patch={})=>{seq++;return flow.receive({eventId:'ev'+seq,messageId:'in'+seq,chatId:'room',senderId:'pm',text,directedToBot:true,...patch});};
  const ask=async(text,patch={})=>{assert.equal(receive(text,patch).accepted,true);await flow.drain();return sent.at(-1);};
  return {config,queries,responders,sent,receive,ask,calls,extracts,writes,observations,db,get flow(){return flow;},restart(){flow=open();}};
}

test('different model read phrasings ground a selected analyst and persist each new query scope',async t=>{
  const h=fixture(t);
  await h.ask('本群分析师有哪些');
  h.responders.set('第二位在这件事上押对的比例呢',modelReport('context',['scores']));
  await h.ask('第二位在这件事上押对的比例呢');
  h.responders.set('她那些观点有变成纸面仓位的吗',modelReport('context',['trades']));
  await h.ask('她那些观点有变成纸面仓位的吗');
  h.responders.set('这些观点的原文我也想瞧瞧',modelReport('context',['recommendations']));
  await h.ask('这些观点的原文我也想瞧瞧');
  assert.deepEqual(h.queries,['scores','trades','recommendations'].map(section=>({expectedOwnerId:owner,analystKey:'analystB',sections:[section]})));
  assert.deepEqual(h.calls.at(-1).readContext,{source:'formal_report',scope:'named',analyst:'示例分析师乙（analystB）',sections:['trades']});
  assert.deepEqual(h.observations.map(e=>[e.readAction,e.modelSelected]),[['analyst_roster',false],['scores',true],['trades',true],['recommendations',true]]);
  assert.equal(h.flow.view().proposals.length,0);assert.deepEqual(h.writes,[]);
});

test('query recognized by analyst extractor uses a single model call and survives restart before fetching',async t=>{
  const h=fixture(t);
  h.responders.set('我写过的东西还留着哪些',modelReport('self',['recommendations']));
  h.receive('我写过的东西还留着哪些',{senderId:'a'});
  await h.flow.drainPrimary();
  assert.equal(h.calls.length,0);
  assert.equal(h.queries.length,0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM feishu_model_report_jobs').get().n,1);
  h.restart();
  await h.flow.drain();
  assert.equal(h.calls.length,0);assert.equal(h.queries.length,1);
  assert.equal(h.queries[0].analystKey,'analystA');
  assert.equal(h.observations.at(-1).modelComponent,'extraction');
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM feishu_model_report_jobs').get().n,0);
  assert.equal(h.flow.view().proposals.length,0);
});

test('a zero-row report preserves the verified display subject for both models without exposing the internal role',async t=>{
  const h=fixture(t,{query:async()=> '正式模拟账户查询（指定分析师，北京时间）\n\n有效建议 0 条'});
  const role='analyst-98205c20-52ea-46b1-b87d-c417f37c844b';
  h.config.analystBySender.b=role;
  h.config.analystNamesByRole={[role]:'analystB'};
  h.config.analystAliasesByRole={[role]:['示例分析师乙']};
  await h.ask('查示例分析师乙的评分',{senderId:'b'});
  h.responders.set('后来这些想法真的变成纸面买卖了吗',modelReport('context',['trades']));
  const asker='后来这些想法真的变成纸面买卖了吗';
  await h.ask(asker,{senderId:'b'});
  const context=h.extracts.at(-1).readContext;
  assert.deepEqual(context,{source:'formal_report',scope:'named',analyst:'示例分析师乙（analystB）',sections:['scores']});
  assert.doesNotMatch(JSON.stringify(context),/analyst-98205c20/);
  assert.deepEqual(h.queries.map(x=>x.analystKey),[role,role]);
  assert.deepEqual(h.queries[1].sections,['trades']);
});

test('unknown or ambiguous subjects, manufactured target, changed role, unsupported filters and guest tools cannot trigger a formal lookup',async t=>{
  const h=fixture(t);
  await h.ask('本群分析师有哪些');
  for (const [text,tool,extra] of [
    ['那个人的表现吧',modelReport('named',['scores'],'analystC')],
    ['第九位的纸面输赢呢',modelReport('context',['scores'])],
    ['示例分析师乙这两天的东西，切给我',modelReport('named',['recommendations'],'analystA')],
    ['示例分析师乙跟示例分析师甲都押中过几次',modelReport('named',['scores'],'analystB')],
    ['昨天示例分析师乙的纸面单子',modelReport('named',['trades'],'analystB')],
    ['只看昨天示例分析师乙在纸面买卖情况',modelReport('named',['trades'],'analystB')],
    ['示例分析师乙上个礼拜押中几回',modelReport('named',['scores'],'analystB')],
    ['示例分析师乙这两天押中几回',modelReport('named',['scores'],'analystB')],
    ['示例分析师乙碰过 NVDA 那些主意呢',modelReport('named',['recommendations'],'analystB')],
    ['让我看看他手气',modelReport('all',['scores'])],
    ['示例分析师乙手气如何',modelReport('named',['scores'],'analystB'),{senderId:'a'}],
    ['大家的手气呢',modelReport('all',['scores']),{senderId:'visitor'}],
    ['来个新的',{read:'formal_report',scope:'all',sections:['trades'],expectedOwnerId:owner}],
    ['示例分析师乙那边还有哪些没弄完', {read:'pending'}, {senderId:'a'}],
    ['把这笔申请过掉',{read:'approve'}],
  ]) {
    h.responders.set(text,tool);
    await h.ask(text,extra);
  }
  assert.equal(h.queries.length,0,JSON.stringify(h.queries));
  assert.equal(h.flow.view().proposals.length,0);assert.deepEqual(h.writes,[]);
  h.responders.set('让我瞧瞧示例分析师乙的手气',modelReport('named',['scores'],'analystB'));
  h.receive('让我瞧瞧示例分析师乙的手气');
  await h.flow.drainChat();
  h.config.approverIds=[];
  await h.flow.drain();
  assert.equal(h.queries.length,0);
});

test('a read-only PM inbox question never confirms; an explicit group scope is supported',async t=>{
  const h=fixture(t);
  h.responders.set('轮到我拍板的东西还有没', {read:'pending'});
  assert.match((await h.ask('轮到我拍板的东西还有没')).text,/暂无待你确认/);
  h.receive('同意',{parentId:'out1',directedToBot:false});
  h.responders.set('全组在方向判断上的战果拿给我瞧瞧',modelReport('all',['scores']));
  await h.ask('全组在方向判断上的战果拿给我瞧瞧');
  assert.deepEqual(h.queries,[{expectedOwnerId:owner,analystKey:null,analystKeys:['analystA','analystB','analystC'],sections:['scores']}]);
  assert.equal(h.flow.view().proposals.length,0);assert.deepEqual(h.writes,[]);
});

test('PM scope answers continue the same trade query after restart, independent of the model and roster intent',async t=>{
  const h=fixture(t);
  const question='哪些建议已经完成了模拟成交';
  h.responders.set(question,modelReport('context',['trades']));
  h.responders.set('全组',{read:'analyst_roster'});
  assert.match((await h.ask(question)).text,/你想看哪位分析师/);
  assert.equal(h.queries.length,0);
  h.restart();
  await h.ask('全组');
  assert.deepEqual(h.queries,[{expectedOwnerId:owner,analystKey:null,analystKeys:['analystA','analystB','analystC'],sections:['trades']}]);
  assert.equal(h.calls.length,1);
  await h.ask('示例分析师乙',{parentId:'out1',directedToBot:false});
  assert.deepEqual(h.queries.at(-1),{expectedOwnerId:owner,analystKey:'analystB',sections:['trades']});
  await h.ask('全组',{senderId:'guest',parentId:'out1'});
  assert.equal(h.queries.length,2);
  assert.deepEqual(h.writes,[]);
});

test('a longer scope reply gives the model the pending report sections, including a fresh PM self-query',async t=>{
  const h=fixture(t);
  assert.match((await h.ask('查我的模拟成交')).text,/指定分析师/);
  const text='全组的情况都帮我过一遍';
  h.responders.set(text,modelReport('all',['trades']));
  await h.ask(text);
  assert.deepEqual(h.calls.at(-1).readContext,{source:'report_scope_question',sections:['trades']});
  assert.deepEqual(h.queries,[{expectedOwnerId:owner,analystKey:null,analystKeys:['analystA','analystB','analystC'],sections:['trades']}]);
});

test('membership changes or legacy group reports invalidate chat history and model-selected report jobs',async t=>{
  const h=fixture(t);
  h.responders.set('全组押中的比例呢',modelReport('all',['scores']));
  await h.ask('全组押中的比例呢');
  await h.ask('解释刚才的结果');
  assert.match(JSON.stringify(h.calls.at(-1).history),/这份正式报表/);
  h.db.exec('UPDATE feishu_formal_report_scopes SET group_keys=NULL');
  await h.ask('再解释',{parentId:'out2'});
  assert.deepEqual(h.calls.at(-1).history,[]);
  await h.ask('全组押中的比例呢');
  delete h.config.analystBySender.a;
  await h.ask('解释一下',{parentId:'out4'});
  assert.deepEqual(h.calls.at(-1).history,[]);
  h.receive('全组押中的比例呢');
  await h.flow.drainChat();
  delete h.config.analystBySender.c;
  await h.flow.drain();
  assert.equal(h.queries.length,2);
});

test('a model cannot supply arbitrary names or widen scope when a report source is replaced or lost',async t=>{
  const h=fixture(t);
  const source={kind:'formal_report',analyst_key:'analystB'};
  assert.ok(groundFormalRead(modelReport('named',['scores'],'analystA'),'那个人的呢',h.config,{source}).error);
  assert.ok(groundFormalRead(modelReport('context',['scores']),'查王五的评分',h.config,{source}).error);
  assert.ok(groundFormalRead(modelReport('context',['scores']),'第二位的呢',h.config,{source}).error);
  assert.ok(groundFormalRead(modelReport('context',['scores']),'那他判断准头呢',h.config,{source:{kind:'formal_report',analyst_key:null}}).error);
  assert.deepEqual(groundFormalRead(modelReport('named',['scores'],'示例分析师乙'),'照样看他的',h.config,{source}),
    {analystKey:'analystB',sections:['scores']});
});

test('a stalled formal API has its own lane and proceeds concurrently with a chat reply',async t=>{
  let started,finish;
  const fetching=new Promise(resolve=>{started=resolve;});
  const pause=new Promise(resolve=>{finish=resolve;});
  const h=fixture(t,{query:async()=>{started();await pause;return '正式报表';}});
  h.receive('查示例分析师乙的评分');
  const read=h.flow.drainReads();
  try {
    await fetching;
    h.receive('在聊什么呢');
    await h.flow.drainChat();
    await h.flow.drainPrimary();
    assert.ok(h.sent.some(item=>item.text==='收到。'));
  } finally {finish();await read;}
  await h.flow.drain();
  assert.ok(h.sent.some(item=>item.text==='正式报表'));
});

test('holdings group, owner, and named queries reuse a delivered group report for ordinal and named follow-ups',async t=>{
  const groupText='本群分析师正式记录（北京时间）\n\nlina\n分析师持仓（按成本，按币种分别计算）\n暂无归属持仓。\n\nbin\n分析师持仓（按成本，按币种分别计算）\n暂无归属持仓。';
  const h=fixture(t,{query:({analystKey})=>analystKey ? '正式模拟账户查询（分析师 '+analystKey+'，北京时间）' : groupText});
  h.config.analystBySender={a:'lina',b:'bin'};
  await h.ask('仓位占比各自是多少');
  await h.ask('后者');
  await h.ask('我要lina提案过的仓位');
  await h.ask('那 bin 呢');
  await h.ask('我的仓位',{senderId:'a'});
  assert.deepEqual(h.queries,[{expectedOwnerId:owner,analystKey:null,analystKeys:['bin','lina'],sections:['positions']},
    ...['bin','lina','bin','lina'].map(analystKey=>({expectedOwnerId:owner,analystKey,sections:['positions']}))]);
  assert.deepEqual(h.calls,[]);assert.deepEqual(h.extracts,[]);
  const successfulReads=h.observations.filter(e=>e.readAction==='positions').length;
  assert.equal(successfulReads,5);
  assert.match((await h.ask('仓位占比各自是多少',{senderId:'a'})).text,/跨分析师/u);
  assert.match((await h.ask('我要lina提案过的仓位',{senderId:'guest'})).text,/正式报表仅/u);
  assert.match((await h.ask('那 bin 呢',{senderId:'a',parentId:'out5'})).text,/跨分析师/u);
  assert.equal(h.queries.length,5);assert.deepEqual(h.writes,[]);
  assert.equal(h.observations.filter(e=>e.readAction==='positions').length,successfulReads);
});

test('a relative subject cannot broaden a report scope or infer a hidden analyst',t=>{
  const {config}=fixture(t);
  const names=['示例分析师甲（analystA）','示例分析师乙（analystB）','示例分析师丙（analystC）'];
  const tool=modelReport('context',['positions']);
  for(const text of [names[0],names.join('\n'),'无名单']){
    const source={kind:'formal_report',text:'本群分析师正式记录（北京时间）\n'+text,analyst_key:null};
    assert.ok(groundFormalRead(tool,'后者',config,{source}).scopeQuestion);
  }
});
