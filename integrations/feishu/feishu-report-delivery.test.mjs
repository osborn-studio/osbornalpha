import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {makeReportSender,readReportDelivery} from './feishu-report-delivery.mjs';

const config={mode:'webhook',chatId:'oc_bound',url:'https://open.feishu.cn/open-apis/bot/v2/hook/fixture-123456',secret:'test-signature-key'};
const message={chatId:config.chatId,text:'正式模拟账户查询',replyTo:'om_request',uuid:'report-1',formalReport:true};

test('custom bot posts a signed report only in the bound group with zero application message calls',async()=>{
  const calls=[];
  const app=async input=>{calls.push(input);return {messageId:'om_native'};};
  let posts=0;
  const send=makeReportSender(app,config,{fetchImpl:async(url,opts)=>{
    posts++;
    assert.equal(url,config.url);
    assert.equal(opts.redirect,'error');
    assert.equal(opts.method,'POST');
    const body=JSON.parse(opts.body);
    assert.equal(body.sign,createHmac('sha256',body.timestamp+'\n'+config.secret).digest('base64'));
    assert.deepEqual(body.content,{text:message.text});
    assert.equal(body.msg_type,'text');
    assert.ok(!opts.headers.authorization);
    return Response.json({code:0});
  }});
  assert.equal(send.formalReportWebhook,true);
  assert.deepEqual(await send(message),{deliveredToWebhook:true});
  assert.equal(calls.length,0);
  await assert.rejects(send({...message,chatId:'oc_changed'}),{retriable:false});
  assert.equal(posts,1);
  await send({...message,formalReport:false});
  assert.equal(calls.length,1);
  assert.equal(posts,1);
  await makeReportSender(app,{...config,mode:'app'})(message);
  assert.equal(calls.length,2);
});

test('webhook rate limiting retries safely, a lost acknowledgment never falls back to a billed message',async()=>{
  const app=()=>assert.fail('unexpected app message');
  const cases=[
    [()=>{throw Error('unreachable');},{uncertain:true}],
    [()=>new Response(null,{status:503}),{uncertain:true}],
    [()=>Response.json({oops:true}),{uncertain:true}],
    [()=>Response.json({code:11232}),{retriable:true,safeRetry:true}],
    [()=>new Response(null,{status:429}),{retriable:true,safeRetry:true}],
    [()=>Response.json({code:19024}),{retriable:false}],
  ];
  for(const [fetchImpl,expected] of cases) await assert.rejects(makeReportSender(app,config,{fetchImpl})(message),expected);
});

test('an absent configuration opts out of reports; only official custom bot addresses can be used',t=>{
  const dir=mkdtempSync(join(tmpdir(),'osborn-report-dest-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  assert.equal(readReportDelivery(dir),undefined);
  const file=join(dir,'feishu-report-delivery.json');
  for(const bad of [{...config,url:'https://example.com/hook'}, {...config,chatId:''},{...config,secret:'a\nb'},{...config,mode:'unknown'}]){
    writeFileSync(file,JSON.stringify(bad));
    assert.throws(()=>readReportDelivery(dir));
  }
  writeFileSync(file,JSON.stringify(config));
  assert.deepEqual(readReportDelivery(dir),config);
});
