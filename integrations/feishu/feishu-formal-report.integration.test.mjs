import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {normalizeGroupMessage} from './feishu-connector.mjs';
import {createFormalFeishuWorkflow} from './feishu-formal.mjs';

const owner='11ade467-5f79-4e5f-b8ee-db4ba102d2e8';
const chatId='oc_report_fixture',botId='ou_report_bot',pmId='ou_report_pm';
const appId='cli_0000000000000000',token='loopback-fixture-does-not-authorize-any-account';
const fixtureReport='正式分析建议：XYZ 买入\n正式建议评分：平均分 2.5\n我的投资：模拟成交 5 股';
const fakeHook='https://open.feishu.cn/open-apis/bot/v2/hook/test-webhook';

function mentionedReport(sender=pmId,content='帮我看看示例分析师的分析建议、打分和模拟交易情况。',messageId='om_pm_read') {
  return normalizeGroupMessage({
    app_id:appId,event_id:'event_'+messageId,sender:{sender_type:'user',sender_id:{open_id:sender}},
    message:{message_id:messageId,chat_type:'group',chat_id:chatId,create_time:'1795600000000',message_type:'text',
      mentions:[{key:'@_user_1',id:{open_id:botId},name:'Osborn 分析助手'}],
      content:JSON.stringify({text:'@_user_1 '+content})},
  },appId,botId);
}

for(const mode of ['app','webhook']){
  test('a PM mention reads formal advice, scores and linked trades once across a restart using '+mode,async t=>{
    const directory=mkdtempSync(join(tmpdir(),'osborn-formal-read-'));
    const bindings={chatId,approverIds:[pmId],analystBySender:{ou_fixture_analyst:'analyst_a',ou_second_analyst:'analystB'},
      analystNamesByRole:{analyst_a:'analyst_a',analystB:'analystB'},analystAliasesByRole:{analyst_a:['示例分析师'],analystB:['示例分析师乙']},
      simulationAccount:{id:owner,confirmed:true}};
    writeFileSync(join(directory,'feishu-bindings.json'),JSON.stringify(bindings),{mode:0o600});
    writeFileSync(join(directory,'feishu-report-delivery.json'),JSON.stringify({
      mode,chatId,...(mode==='webhook'&&{url:fakeHook}),
    }),{mode:0o600});
    const reads=[],messages=[],posts=[],unexpected=[];
    let bulletinFixture=false;
    const server=createServer((req,res)=>{
      const url=new URL(req.url,'http://localhost');
      reads.push({method:req.method,url,authorization:req.headers.authorization});
      res.writeHead(200,{'content-type':'application/json'});
      if(url.searchParams.get('sections')==='positions'){
        const name=url.searchParams.get('analyst'),ticker=name==='analyst_a'?'ACME':'DEMO';
        const quantity=name==='analyst_a'?3:1;
        return res.end(JSON.stringify({text:'正式模拟账户查询（分析师 '+name+'，北京时间）\n\n分析师持仓（按成本，按币种分别计算）\n'+
          ticker+'｜净股数 '+quantity+'｜均价 10｜持仓成本 '+10*quantity+' USD｜已实现盈亏 0 USD｜占比 100%'}));
      }
      const emptyReport=['正式模拟账户查询（指定分析师，北京时间）','正式分析建议（共 0 条）',
        '正式建议评分\n有效建议 0 条｜暂无可判定命中的样本｜暂无已评分样本','分析师建议关联的模拟成交（共 0 条）'].join('\n\n');
      res.end(JSON.stringify({text:bulletinFixture?emptyReport:fixtureReport}));
    });
    let workflow;
    t.after(async()=>{
      try{await workflow?.close();}
      finally{
        if(server.listening)await new Promise(resolve=>server.close(resolve));
        rmSync(directory,{recursive:true,force:true});
      }
    });
    server.listen(0,'127.0.0.1');
    await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const localFetch=globalThis.fetch;
    t.mock.method(globalThis,'fetch',async(input,opts)=>{
      const url=new URL(String(input));
      if(url.origin===origin)return localFetch(input,opts);
      if(mode==='webhook'&&url.href===fakeHook){
        posts.push({method:opts.method,body:JSON.parse(opts.body),authorization:opts.headers?.authorization});
        return Response.json({code:0});
      }
      unexpected.push('external fetch');
      throw Error('Unexpected external connection');
    });
    const unexpectedCall=kind=>async()=>{unexpected.push(kind);throw Error('Unexpected '+kind);};
    const open=()=>createFormalFeishuWorkflow({
      env:{FEISHU_DATA_DIR:directory,FEISHU_SIMULATION_ORIGIN:origin,FEISHU_SIMULATION_INGEST_TOKEN:token},
      sendMessage:async message=>{messages.push(message);return {messageId:'om_native_report_'+messages.length};},
      extractWithModel:unexpectedCall('proposal extraction'),respondToChat:unexpectedCall('chat'),
      searchSecurity:unexpectedCall('security search'),
    });
    workflow=open();
    const event=mentionedReport();
    assert.equal(event.directedToBot,true);
    assert.equal(workflow.receive(event).accepted,true);
    await workflow.drain();
    assert.deepEqual(workflow.view().proposals,[]);
    await workflow.close();
    workflow=open();
    assert.equal(workflow.receive(event).duplicate,true);
    await workflow.drain();
    assert.deepEqual(workflow.view().proposals,[]);
    assert.deepEqual(unexpected,[]);
    assert.equal(reads.length,1);
    const [{method,url,authorization}]=reads;
    assert.equal(method,'GET');
    assert.equal(url.pathname,'/api/integrations/feishu/overview');
    assert.equal(authorization,'Bearer '+token);
    assert.deepEqual(Object.fromEntries(url.searchParams),{owner,analyst:'analyst_a',sections:'recommendations,scores,trades'});
    if(mode==='app'){
      assert.equal(messages.length,1);
      assert.equal(messages[0].chatId,chatId);
      assert.equal(messages[0].replyTo,event.messageId);
      assert.equal(messages[0].formalReport,true);
      assert.equal(messages[0].text,fixtureReport);
      assert.deepEqual(posts,[]);
    }else{
      assert.deepEqual(messages,[]);
      assert.equal(posts.length,1);
      assert.equal(posts[0].method,'POST');
      assert.deepEqual(posts[0].body,{msg_type:'text',content:{text:fixtureReport}});
      assert.equal(posts[0].authorization,undefined);
    }
    const db=new DatabaseSync(join(directory,'feishu-workflow.sqlite'),{readOnly:true});
    try{
      const rows=db.prepare('SELECT kind,status FROM feishu_workflow_messages ORDER BY seq').all();
      assert.deepEqual(rows.map(row=>({...row})),[{kind:'formal_report',status:'sent'}]);
      assert.equal(db.prepare('SELECT count(*) n FROM feishu_workflow_drafts').get().n,0);
    }finally{db.close();}

    bulletinFixture=true;
    const visitor=mentionedReport('ou_group_visitor','生成一份报告','om_visitor_report');
    assert.equal(workflow.receive(visitor).accepted,true);
    await workflow.close(); workflow=open();
    assert.equal(workflow.receive(visitor).duplicate,true);
    await workflow.drain();
    const requested=reads.slice(1);
    assert.deepEqual(requested.map(r=>r.url.searchParams.get('analyst')).sort(),['analystB','analyst_a']);
    assert.ok(requested.every(r=>r.method==='GET' && r.url.searchParams.get('owner')===owner &&
      r.url.searchParams.get('sections')==='recommendations,scores,trades'));
    const published=mode==='app'?messages.at(-1).text:posts.at(-1).body.content.text;
    assert.match(published,/全组正式报告/); assert.match(published,/暂无已评分样本/);
    assert.equal((mode==='app'?messages:posts).length,2);
    workflow.receive(mentionedReport(pmId,'仓位占比各自是多少','om_positions_group'));
    await workflow.drain();
    const group=mode==='app'?messages.at(-1).text:posts.at(-1).body.content.text;
    assert.match(group,/ACME[^\n]+USD｜占比 75%\nDEMO[^\n]+USD｜占比 25%/u);
    assert.deepEqual(reads.slice(-2).map(r=>r.url.searchParams.get('analyst')).sort(),['analystB','analyst_a']);
    workflow.receive(mentionedReport(pmId,'后者','om_positions_followup'));
    await workflow.drain();
    assert.equal(reads.at(-1).url.searchParams.get('analyst'),'analystB');
    const named=mode==='app'?messages.at(-1).text:posts.at(-1).body.content.text;
    assert.match(named,/分析师 analystB，北京时间/u);assert.doesNotMatch(named,/ACME/u);
    assert.deepEqual(unexpected,[]);assert.deepEqual(workflow.view().proposals,[]);
  });
}
