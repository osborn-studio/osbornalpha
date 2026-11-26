import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {startFeishuModelWarmth} from './feishu-model-warmth.mjs';

const env={FEISHU_LLM_KEEP_WARM:'true',FEISHU_LLM_BASE_URL:'http://127.0.0.1:11434/v1',FEISHU_LLM_MODEL:'synthetic:small'};
test('preloads an idle local Ollama without a prompt and leaves already warm models alone',async()=>{
  const now=Date.now();
  for (const warm of [true,false]) {
    const paths=[];
    const stop=startFeishuModelWarmth(env,{now:()=>now,fetchImpl:async(url,options)=>{
      paths.push(url.pathname);
      if (url.pathname==='/api/ps') return Response.json({models:warm?
        [{name:env.FEISHU_LLM_MODEL,expires_at:new Date(now+600_000).toISOString()}]:[]});
      assert.deepEqual(JSON.parse(options.body),{model:env.FEISHU_LLM_MODEL,stream:false,keep_alive:'8m'});
      assert.equal(options.redirect,'error');
      return Response.json({done:true});
    }});
    await setImmediate();
    stop();
    assert.deepEqual(paths,warm?['/api/ps']:['/api/ps','/api/chat']);
  }
});

test('never probes an arbitrary model provider or a disabled connector',async()=>{
  for (const settings of [{...env,FEISHU_LLM_KEEP_WARM:'false'},{...env,FEISHU_LLM_BASE_URL:'https://an-external-host.test/v1'},
    {...env,FEISHU_LLM_BASE_URL:'http://127.0.0.1:11434/custom/v1'}]) {
    let hits=0;
    const stop=startFeishuModelWarmth(settings,{fetchImpl:async()=>{hits++;throw Error('unexpected');}});
    await setImmediate();
    stop();
    assert.equal(hits,0);
  }
});
