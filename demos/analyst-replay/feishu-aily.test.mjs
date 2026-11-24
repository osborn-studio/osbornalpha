import test from 'node:test';
import assert from 'node:assert/strict';
import * as Lark from '@larksuiteoapi/node-sdk';
import {createAilyExtractor} from './feishu-aily.mjs';

const env = {
  FEISHU_AILY_APP_ID:'spring_example__c',FEISHU_AILY_SKILL_ID:'skill_example',
  FEISHU_AILY_CHANNEL_APP_ID:'cli_0000000000000001',FEISHU_AILY_CHANNEL_APP_SECRET:'synthetic-test-secret',
};
const request = {
  text:'这个标的还是再添一些仓位',receivedAt:'2026-11-23T19:05:22-08:00',isSupplement:true,
  priorFields:{ticker:'01800.HK',market:'HK',reference_price:8.1,analyst:'analyst-name',senderId:'sender-id',
    rationale:'previous private rationale',thesis_ref:'previous private research',unknown:'another private value'},
};
const packet = {intent:'proposal',fields:{action:{value:'add',evidence:'再添一些仓位'}}};
const success = result => ({code:0,data:{status:'success',output:JSON.stringify({extraction:JSON.stringify(result)})}});

function fakeSdk(run) {
  const calls = [];
  const transport = {interceptors:{response:{use(fn){calls.push(['unwrap',fn]);}}}};
  const sdk = {
    Domain:{Feishu:'feishu'},defaultHttpInstance:{create(options){calls.push(['transport',options]);return transport;}},
    Client:class {
      constructor(options) {calls.push(['client',options]);}
      request(options) {calls.push(['request',options]);return run(options);}
    },
  };
  return {sdk,calls,transport};
}

test('the Aily extractor is opt-in and rejects a partial setup without echoing settings', () => {
  const {sdk,calls} = fakeSdk(() => {});
  assert.equal(createAilyExtractor({}, {sdk}),undefined);
  assert.throws(() => createAilyExtractor({FEISHU_AILY_CHANNEL_APP_SECRET:'sensitive-setting'}, {sdk}), {
    message:'飞书 Aily 配置不完整或格式不正确。',
  });
  assert.deepEqual(calls,[]);
});

test('passes only input needed by the published skill and reads the OpenAPI result', async () => {
  const {sdk,calls,transport} = fakeSdk(() => success(packet));
  const extract = createAilyExtractor({...env,FEISHU_APP_ID:'cli_0000000000000002'}, {sdk,timeoutMs:1000});
  assert.deepEqual(await extract(request),packet);
  assert.deepEqual(calls[0],['transport',{timeout:1000,maxRedirects:0,maxContentLength:256_000}]);
  assert.deepEqual(calls[1][1]({data:{sentinel:1}}),{sentinel:1});
  const [,client] = calls[2];
  assert.equal(client.appId,env.FEISHU_AILY_CHANNEL_APP_ID);
  assert.equal(client.appSecret,env.FEISHU_AILY_CHANNEL_APP_SECRET);
  assert.equal(client.domain,'feishu');
  assert.equal(client.httpInstance,transport);
  const [,outbound] = calls[3];
  assert.equal(outbound.method,'POST');
  assert.equal(outbound.url,'/open-apis/aily/v1/apps/spring_example__c/skills/skill_example/start');
  assert.equal(outbound.timeout,1000);
  assert.ok(outbound.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(outbound.data.input),{text:request.text,receivedAt:'2026-11-24T03:05:22.000Z',
    isSupplement:true,priorFields:'{"ticker":"01800.HK","market":"HK","reference_price":8.1}'});
});

test('the installed SDK obtains a channel tenant token for the official skill request', async () => {
  const requests = [];
  const sdk = {...Lark,defaultHttpInstance:{create(options) {
    return Lark.defaultHttpInstance.create({...options,adapter:async config => {
      requests.push(config);
      const data = config.url.endsWith('/tenant_access_token/internal') ?
        {code:0,tenant_access_token:'synthetic-channel-token',expire:7200} : success(packet);
      return {data,status:200,statusText:'OK',headers:{},config};
    }});
  }}};
  assert.deepEqual(await createAilyExtractor(env,{sdk})(request),packet);
  assert.equal(requests.length,2);
  assert.equal(requests[0].url,'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal');
  assert.deepEqual(JSON.parse(requests[0].data),{app_id:env.FEISHU_AILY_CHANNEL_APP_ID,app_secret:env.FEISHU_AILY_CHANNEL_APP_SECRET});
  assert.equal(requests[1].url,'https://open.feishu.cn/open-apis/aily/v1/apps/spring_example__c/skills/skill_example/start');
  assert.equal(requests[1].headers.Authorization,'Bearer synthetic-channel-token');
  assert.equal(JSON.parse(JSON.parse(requests[1].data).input).text,request.text);
});

test('rejects operation failures, invalid model output, and fields outside the extraction contract', async () => {
  for (const result of [
    {code:42,msg:'raw-secret'}, {code:0,data:{status:'failed',output:'raw-message'}},
    {code:0,data:{status:'success',output:'not JSON'}}, success({intent:'bad',fields:{}}),
    success({intent:'proposal',fields:{approval:{value:'approved',evidence:'同意'}}}),
    success({intent:'proposal',fields:{action:{value:'add',evidence:' '}}}),
    success({intent:'proposal',fields:{quantity:{value:'123',evidence:'123股'}}}),
  ]) {
    const {sdk} = fakeSdk(() => result);
    await assert.rejects(createAilyExtractor(env,{sdk})(request),{message:'飞书 Aily 技能调用失败。'});
  }
  const {sdk} = fakeSdk(() => {throw Error('Bearer private-token request-body');});
  await assert.rejects(createAilyExtractor(env,{sdk})(request),error =>
    error.message === '飞书 Aily 技能调用失败。' && error.cause === undefined);
});

test('a response arriving after the request deadline cannot produce a recommendation', async () => {
  const {sdk} = fakeSdk(({signal}) => new Promise(resolve => {
    signal.addEventListener('abort',() => resolve(success(packet)),{once:true});
    setTimeout(() => {},10);
  }));
  await assert.rejects(createAilyExtractor(env,{sdk,timeoutMs:1})(request),{message:'飞书 Aily 技能调用失败。'});
});
