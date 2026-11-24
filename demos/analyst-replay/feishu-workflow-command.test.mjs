import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProposal, summary } from './feishu-workflow-command.mjs';
import { parseRegistration } from './registrations.mjs';

const sentAt = '2025-06-16T08:30:00.000Z';
const parse = (text, draft) => evaluateProposal('A','分析师 A',text,sentAt,[],draft);

test('a model fragment cannot override the direction from the full sentence', () => {
  const cases = [
    ['不要卖出腾讯控股，我建议买入腾讯控股', 'sell', '卖出'],
    ['我想买腾讯控股。昨天已经加仓了。', 'add', '加仓'],
  ];
  for (const [text, action, evidence] of cases) {
    const model = {intent:'proposal',fields:{action:{value:action,evidence}}};
    assert.equal(evaluateProposal('A','分析师 A',text,sentAt,[],{},model).body.recommendation.action,'buy');
  }
});

test('requires current position evidence before filling in a missing action', () => {
  const cases = [
    ['腾讯控股的股价提高了一点', '提高'],
    ['腾讯控股的仓位不要再往上调', '往上调'],
    ['不要把腾讯控股的仓位往上调', '仓位往上调'],
  ];
  for (const [text, evidence] of cases) {
    const model = {intent:'proposal',fields:{action:{value:'add',evidence}}};
    const result = evaluateProposal('A','分析师 A',text,sentAt,[],{},model);
    assert.deepEqual(result.missing,['建议动作']);
    assert.equal(result.body,null);
  }
});

test('a plain suggestion has the same registration payload as the minimal web form', () => {
  const {body,missing} = parse('我想加仓腾讯控股');
  assert.deepEqual(missing,[]);
  const web = parseRegistration('A',{ticker:'00700.HK',market:'HK',action:'add',confidence:70,recommended_at:sentAt});
  const {analyst_id,role,source_type,...payload} = web;
  assert.deepEqual(body.recommendation,payload);
  assert.equal(body.simulation,null);
  const preview = summary(body,'example','分析师 A',null);
  assert.match(preview,/70%（表单默认）/);
  assert.match(preview,/16:30（北京时间）/);
  assert.doesNotMatch(preview,/undefined|null|目标价|止损价|参考价|建议理由|关联研究/);
});

test('missing security prompts only for the ticker, preserving optional terms across replies', () => {
  const initial = parse('我想加仓，参考价40港元，信心80%');
  assert.deepEqual(initial.missing,['标的代码']);
  assert.throws(() => parse('股票代码 NVDA',initial.fields),/币种/);
  const {body} = parse('01810.HK',initial.fields);
  assert.equal(body.recommendation.reference_price,40);
  assert.equal(body.recommendation.confidence,80);
  assert.equal(body.recommendation.recommended_at,sentAt);
});

test('a missing execution price can be supplied as a short reply or omitted for advice only', () => {
  const {missing,fields} = parse('腾讯控股加仓200股，参考价447.4');
  assert.deepEqual(missing,['模拟成交价']);
  const {body} = parse('446港元',fields);
  assert.equal(body.recommendation.reference_price,447.4);
  assert.deepEqual(body.simulation,{direction:'buy',price:446,quantity:200,fee:0});
  assert.equal(parse('仅登记建议',fields).body.simulation,null);
});

test('the market alone can resolve a named cross-listed stock without repeating the suggestion', () => {
  const {fields,missing} = parse('我想买入中国平安');
  assert.deepEqual(missing,['交易市场或标的代码']);
  const {body} = parse('港股',fields);
  assert.equal(body.recommendation.ticker,'02318.HK');
  assert.equal(body.recommendation.action,'buy');
  assert.ok(!Object.hasOwn(body.recommendation,'securityName'));
});
