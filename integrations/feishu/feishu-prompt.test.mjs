import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPublishedPromptReader} from './feishu-prompt.mjs';
import {createFeishuLlmExtractor,createFeishuChatResponder} from './feishu-llm.mjs';

test('both running formal model adapters pick up the next published supplement and tolerate a partial file',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'feishu-hot-reload-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const path=join(directory,'active.json');
  const readPrompt=createPublishedPromptReader(path);
  const env={FEISHU_LLM_BASE_URL:'http://127.0.0.1:11434/v1',FEISHU_LLM_MODEL:'fixture'};
  const instructions=[];
  const fetchImpl=async(_url,request)=>{
    const payload=JSON.parse(request.body);
    instructions.push(payload.messages[0].content);
    const content=payload.response_format?JSON.stringify({intent:'other',fields:{}}):'在。';
    return Response.json({choices:[{finish_reason:'stop',message:{content}}]});
  };
  const extract=createFeishuLlmExtractor(env,{formalTrades:true,fetchImpl,readPrompt});
  const respond=createFeishuChatResponder(env,{fetchImpl,readPrompt});
  async function verify(version){
    await extract({text:'招呼一声',receivedAt:'2026-11-01T00:00:00Z'});
    await respond({text:'在吗'});
    assert.ok(instructions.at(-2).endsWith('提取'+version));
    assert.ok(instructions.at(-1).endsWith('群聊'+version));
  }
  for(const version of ['甲','乙']){
    writeFileSync(path+'.new',JSON.stringify({extraction:'提取'+version,chat:'群聊'+version}));
    renameSync(path+'.new',path);
    await verify(version);
  }
  writeFileSync(path,'{"extraction":');
  await verify('乙');
});
