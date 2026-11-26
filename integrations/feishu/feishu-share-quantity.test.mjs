import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeishuLlmExtractor } from './feishu-llm.mjs';
import { evaluateProposal } from './feishu-workflow-command.mjs';

const env = {FEISHU_LLM_BASE_URL:'http://localhost:11434/v1',FEISHU_LLM_MODEL:'test-fixture'};
const receivedAt = '2026-06-18T10:00:00Z';
const draft = {ticker:'NVDA',market:'US',action:'add',executionMode:'simulate',price:135};

async function checkQuantity(text, evidence, value, expected) {
  const packet = {intent:'proposal',fields:{quantity:{evidence,value}}};
  const extract = createFeishuLlmExtractor(env,{
    formalTrades:true,
    fetchImpl:async () => Response.json({choices:[{message:{content:JSON.stringify(packet)}}]}),
  });
  const interpretation = await extract({text,receivedAt,isSupplement:true,priorFields:draft,pendingFields:['quantity']});
  assert.equal(interpretation.fields.quantity?.value,expected,text);
  // Both the live extractor and an independent caller of the formal workflow must agree.
  for (const input of [interpretation,packet]) {
    const {body,missing} = evaluateProposal('A','分析师 A',text,receivedAt,[],draft,input);
    assert.equal(body?.simulation?.quantity,expected,text);
    assert.deepEqual(missing,expected === undefined ? ['模拟成交股数'] : [],text);
  }
}

test('an analyst can supply an explicit Chinese share count for the pending simulation', async () => {
  for (const [text,quote,quantity] of [
    ['这笔就三十股吧。','三十股',30],
    ['这次加两百零五股','两百零五股',205],
    ['这次买一万三千零二十股','这次买一万三千零二十股',13020],
    ['我持有三十股，这笔再加四十股','四十股',40],
    ['三十','三十',30],
    ['就买1.2万股','1.2万股',12000],
    ['就买0.29万股','0.29万股',2900],
    ['买入1,250 shares','1,250 shares',1250],
  ]) await checkQuantity(text,quote,quantity,quantity);
});

test('a selected quote cannot turn a budget, prior holding, range or clipped number into a trade size', async () => {
  for (const [text,quote,quantity] of [
    ['三十万美元买英伟达','三十万',300000],
    ['我手里已经有三十股，建议加仓','三十股',30],
    ['我上次买了三十股，这次应该补些','三十股',30],
    ['这笔买入1,250股','250股',250],
    ['按一百美元一股成交','一股',1],
    ['准备加到三十股','三十股',30],
    ['三十到五十股都可以','五十股',50],
    ['三十股或五十股都行','三十股',30],
    ['这次最多三十股','三十股',30],
    ['三十股以内','三十股',30],
    ['这次买负三十股','三十股',30],
    ['这笔三百三十股','三十股',30],
    ['要的是三四十股','三四十股',40],
    ['他说一百二股','一百二股',102],
    ['这次就三十股吧','三十股',300],
    ['我的意思是买三十股票','三十股',30],
    ['这个公司的三十股东','三十股',30],
  ]) await checkQuantity(text,quote,quantity,undefined);
});

test('a named simulation draft accepts only its requested bare quantity and verifies the original listing', async () => {
  const priorFields = {securityName:'微软',action:'buy',executionMode:'simulate',price:410,currency:'USD'};
  const input = {text:'35',receivedAt,isSupplement:true,priorFields,pendingFields:['quantity']};
  const shares = {value:35,evidence:'35'};
  const extractor = fields => createFeishuLlmExtractor(env,{
    formalTrades:true,
    fetchImpl:async () => Response.json({choices:[{message:{content:JSON.stringify({intent:'proposal',fields})}}]}),
  });
  const extract = extractor({quantity:shares});
  const packet = await extract(input);
  assert.deepEqual(packet.fields,{quantity:shares});
  const evaluate = (result,catalogue) => evaluateProposal('A','分析师 A','35',receivedAt,[],priorFields,result,catalogue);
  const msft = [{ticker:'MSFT',market:'US'}];
  assert.deepEqual(evaluate(packet,msft).body.simulation,{direction:'buy',quantity:35,price:410,fee:0});
  for (const listings of [[],[...msft,{ticker:'MSF',market:'US'}]]) {
    const unresolved=evaluate(packet,listings);
    assert.equal(unresolved.body,null);
    assert.equal(unresolved.fields.quantity,undefined);
  }
  for (const override of [
    {isSupplement:false}, {priorFields:{}}, {pendingFields:[]}, {pendingFields:undefined},
    {pendingFields:['quantity','ticker']}, {pendingFields:['price']}, {priorFields:{...priorFields,price:null}},
    {priorFields:{...priorFields,quantity:20}}, {priorFields:{...priorFields,action:'hold'}},
    {priorFields:{...priorFields,executionMode:'advice_only'}},
    {priorFields:{ticker:'MSFT',action:'buy',price:410},pendingFields:['market']},
  ]) assert.deepEqual((await extract({...input,...override})).fields,{});
  for (const fields of [{},{quantity:{value:53,evidence:'35'}},{quantity:{value:35,evidence:'35股'}}]) {
    assert.equal(evaluate(await extractor(fields)(input),msft).fields.quantity,undefined);
  }
});
