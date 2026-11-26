import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {openFeishuWorkflow} from './feishu-workflow.mjs';
import {isAnalystRosterQuestion,analystRosterText} from './feishu-analyst-roster.mjs';

test('group roster questions stay distinct from analysis reports, signup, suggestions and confirmations',()=>{
  const questions=['本群分析师有哪些','本群有哪些分析师','请问现在本群里都有哪几位分析师呀？','谁是这个群的分析师',
    '你知道咱们群的分析师都有哪几位吗','能告诉我群里分析师叫什么名字吗','有谁是咱们群的分析师','我们的分析师是谁',
    '查看我们群的分析师','请列一下本群已绑定的分析师名单','分析师名单','本群分析师有几位？'];
  for(const text of questions)assert.equal(isAnalystRosterQuestion(text),true,text);
  for(const text of ['哪些分析师给过哪些建议','查本群分析师的评分','我想成为分析师','正式系统有哪些分析师','帮我登记建议',
    '能告诉我哪些分析师给过建议吗','你知道咱们群的分析师都买了哪几只股票吗',
    '本群分析师有哪些？顺便帮我登记一笔交易','你知道什么是分析师吗','同意','有谁能确认交易']){
    assert.equal(isAnalystRosterQuestion(text),false,text);
  }
});

test('uses only currently assigned public names; no sender IDs, contact identifiers or orphan profiles are rendered',()=>{
  const role='analyst-91000000-0000-4000-8000-00000000000a';
  const config={chatId:'oc_somegroup',approverIds:['pm_member'],analystBySender:{ou_secret:role,s2:'second',s3:'analystA',s4:'analystA'},
    analystNamesByRole:{[role]:'ou_secret',second:'pm_member',analystA:'analystA',unused:'未绑定人'},
    analystAliasesByRole:{second:['oc_somegroup','示例分析师乙'],analystA:['示例分析师甲','示例分析师甲']},demoOnlyRoles:['second'],demoMembershipUnavailable:true};
  const answer=analystRosterText(config);
  assert.match(answer,/3 位/);
  assert.match(answer,/示例分析师甲（analystA）/);assert.match(answer,/示例分析师乙（second） · 仅 Demo/);
  assert.match(answer,/尚未配置公开署名/);assert.match(answer,/Demo 自助绑定名单暂时无法核对/);
  assert.doesNotMatch(answer,/ou_secret|oc_somegroup|pm_member|analyst-|未绑定人/);
  assert.equal(analystRosterText({}),'当前可核实的绑定中还没有分析师。');
});

test('normal workflow answers the PM question from bindings even when all model and report services are unavailable',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const config={chatId:'group',approverIds:['pm'],analystBySender:{person:'analystA',person2:'analystB',person3:'analystC'},
    analystNamesByRole:{analystA:'analystA',analystB:'analystB',analystC:'analystC'},analystAliasesByRole:{analystA:['示例分析师甲'],analystB:['示例分析师乙'],analystC:['示例分析师丙']}};
  const messages=[],unexpected=[];
  const banned=async()=>{unexpected.push('unexpected dependency');throw Error('unavailable');};
  const flow=openFeishuWorkflow(db,fn=>fn(),{config:()=>config,sendMessage:async request=>{messages.push(request);return {messageId:'out'+messages.length};},
    extractWithModel:banned,respondToChat:banned,queryFormal:banned,syncFormal:banned,classifyAssistantCommand:banned});
  const receive=(n,patch={})=>flow.receive({eventId:'event_'+n,messageId:'in_'+n,chatId:'group',senderId:'pm',text:'本群分析师有哪些',directedToBot:true,...patch});
  assert.equal(receive(1,{chatId:'wrong-group'}).accepted,false);
  assert.equal(receive(2,{directedToBot:false}).accepted,false);
  assert.equal(receive(3).accepted,true);
  await flow.drain();
  assert.equal(messages.length,1);assert.deepEqual(messages[0].text.split('\n').slice(1),['示例分析师甲（analystA）','示例分析师乙（analystB）','示例分析师丙（analystC）']);
  assert.equal(messages[0].replyTo,'in_3');
  assert.equal(receive(3).duplicate,true);
  assert.equal(receive(4,{directedToBot:false,parentId:'out1'}).accepted,true);
  await flow.drain();
  assert.equal(messages.length,2);assert.equal(messages[0].text,messages[1].text);
  assert.equal(receive(5,{senderId:'visitor',directedToBot:false,parentId:'out1'}).accepted,false);
  assert.equal(receive(6,{senderId:'visitor'}).accepted,true);
  await flow.drain();
  assert.doesNotMatch(messages[2].text,/示例分析师甲|示例分析师乙|示例分析师丙/);
  assert.equal(receive(7,{senderId:'person'}).accepted,true);
  delete config.analystBySender.person;await flow.drain();
  assert.doesNotMatch(messages[3].text,/示例分析师甲|示例分析师乙|示例分析师丙/);
  assert.deepEqual(unexpected,[]);assert.equal(flow.view().proposals.length,0);
});
