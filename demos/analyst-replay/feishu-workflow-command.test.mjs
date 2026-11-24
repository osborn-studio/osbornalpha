import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProposal, summary } from './feishu-workflow-command.mjs';
import { parseRegistration } from './registrations.mjs';

const sentAt = '2025-06-16T08:30:00.000Z';
const parse = (text, draft) => evaluateProposal('A','分析师 A',text,sentAt,[],draft);
const interpret = (text, fields, draft) => evaluateProposal('A','分析师 A',text,sentAt,[],draft,{intent:'proposal',fields});
const quote = (value,evidence) => ({value,evidence});

test('ticker and name evidence preserves distinct issuers and comes from a complete mention', () => {
  const cases = [
    ['英伟达','NVDA','买英伟达供应商'],
    ['英伟达','NVDA','买英伟达相关ETF'],
    ['英伟达','NVDA','买英伟达股票基金'],
    ['NVIDIA','NVDA','买NVIDIA供应商'],
    ['NVIDIA','NVDA','买美股NVIDIA供应商'],
    ['腾讯','00700.HK','买腾讯音乐股票'],
  ];
  for (const [name,ticker,text] of cases) {
    const result = evaluateProposal('A','分析师 A',text,sentAt,[],{},{
      intent:'proposal',fields:{
        action:quote('buy','买'),
        ticker:{value:ticker,evidence:name},
        securityName:{value:name,evidence:name},
      },
    });
    assert.equal(result.body,null,text);
    assert.deepEqual(result.missing,['标的代码'],text);
  }
});

test('an LLM packet alone chooses fields even when a missing field is obvious in an old format', () => {
  const text = '建议｜标的：英伟达｜动作：买入｜200股｜模拟成交价150美元';
  const name = quote('英伟达','英伟达');
  const action = quote('buy','买入');
  assert.deepEqual(interpret(text,{securityName:name}).missing,['建议动作']);
  assert.deepEqual(interpret(text,{action}).missing,['标的代码']);
  const accepted = interpret(text,{action,securityName:name});
  assert.equal(accepted.body.recommendation.ticker,'NVDA');
  assert.equal(accepted.body.simulation,null);
  const conversational = interpret('把这家英伟达手头的头寸挪出去一半', {
    securityName:quote('英伟达','英伟达'),action:quote('trim','挪出去一半'),
  });
  assert.equal(conversational.fields.action,'trim');
});

test('grounded model contract accepts prices, quantity, date, optional details and role signature', () => {
  const text = '署名分析师 A，英伟达买200股，模拟成交价每股150美元，手续费2美元，参考价152美元，信心80%，期限10日，建议时间2025 年 6 月 15 日 16:30，理由增长，关联研究季度报告';
  const input = {
    analyst:quote('分析师 A','署名分析师 A'),
    securityName:quote('英伟达','英伟达'),action:quote('buy','买'),
    quantity:quote(200,'200股'),price:quote(150,'模拟成交价每股150美元'),fee:quote(2,'手续费2美元'),
    reference_price:quote(152,'参考价152美元'),confidence:quote(80,'信心80%'),
    horizon:quote('10d','期限10日'),recommended_at:quote('2025-06-15T08:30:00Z','建议时间2025 年 6 月 15 日 16:30'),
    rationale:quote('增长','理由增长'),thesis_ref:quote('季度报告','关联研究季度报告'),
  };
  const {body,missing} = interpret(text,input);
  assert.deepEqual(missing,[]);
  assert.equal(body.recommendation.ticker,'NVDA');
  assert.equal(body.recommendation.recommended_at,'2025-06-15T08:30:00.000Z');
  assert.equal(body.recommendation.horizon,'10d');
  assert.equal(body.recommendation.reference_price,152);
  assert.equal(body.recommendation.confidence,80);
  assert.equal(body.recommendation.rationale,'增长');
  assert.equal(body.recommendation.thesis_ref,'季度报告');
  assert.deepEqual(body.simulation,{direction:'buy',quantity:200,price:150,fee:2});
  assert.throws(()=>interpret(text,{...input,recommended_at:quote('2025-06-14T08:30:00Z','建议时间2025 年 6 月 15 日 16:30')}),/日期/);
});

test('model evidence cannot turn a cash budget into a simulated order or currency conflict', () => {
  const text = '买20万人民币的英伟达股票';
  const budget = quote(20,'20万人民币');
  const {body} = interpret(text,{securityName:quote('英伟达','英伟达'),action:quote('buy','买'),
    quantity:quote(200000,'20万人民币'),price:budget,reference_price:budget,currency:quote('CNY','人民币')});
  assert.equal(body.recommendation.ticker,'NVDA');
  assert.equal(body.recommendation.reference_price,undefined);
  assert.equal(body.simulation,null);
});

test('grounded follow-ups may fill exactly one missing trade field with a model candidate', () => {
  const draft = {ticker:'NVDA',market:'US',action:'buy',quantity:200};
  assert.deepEqual(interpret('150美元',{},draft).missing,['模拟成交价']);
  const {body} = interpret('150美元',{price:quote(150,'150美元')},draft);
  assert.deepEqual(body.simulation,{direction:'buy',price:150,quantity:200,fee:0});
  const otherDraft = {ticker:'NVDA',market:'US',action:'buy',price:150};
  assert.deepEqual(interpret('200',{quantity:quote(200,'200')},otherDraft).body.simulation,body.simulation);
  assert.equal(interpret('仅登记建议',{},otherDraft).body.simulation,null);
});

test('model quotes cannot clip a range, a negative quantity or a conflicting currency', () => {
  const recommendation = {securityName:quote('英伟达','英伟达'),action:quote('buy','买')};
  assert.deepEqual(interpret('买英伟达 -200股，模拟成交价150美元',{
    ...recommendation,quantity:quote(200,'200股'),price:quote(150,'模拟成交价150美元'),
  }).missing,['模拟成交股数']);
  assert.deepEqual(interpret('买英伟达 200股，模拟成交价150 至 155美元',{
    ...recommendation,quantity:quote(200,'200股'),price:quote(150,'模拟成交价150'),
  }).missing,['模拟成交价']);
  assert.throws(()=>interpret('买英伟达 200股，模拟成交价150人民币',{
    ...recommendation,quantity:quote(200,'200股'),price:quote(150,'模拟成交价150'),
  }),/币种/);
  assert.equal(interpret('买英伟达，目前每股150美元',{...recommendation,reference_price:quote(150,'每股150美元')})
    .body.recommendation.reference_price,150);
});

test('a model cannot use a forecast date, a different price label or an ambiguous share count', () => {
  const recommendation = {securityName:quote('英伟达','英伟达'),action:quote('buy','买入')};
  assert.throws(() => interpret('买入英伟达，2026年10月20日公布财报', {
    ...recommendation,recommended_at:quote('2026-10-19T16:00:00Z','2026年10月20日'),
  }), /建议日期/);
  const priceLabels = interpret('买入英伟达，目标价每股150美元', {
    ...recommendation,stop_loss:quote(150,'每股150美元'),target_price:quote(150,'目标价每股150美元'),
  }).body.recommendation;
  assert.equal(priceLabels.target_price,150);
  assert.equal(priceLabels.stop_loss,undefined);
  for (const count of ['100～200股','100–200股','原计划200股现改为100股']) {
    const result = interpret('买入英伟达 '+count+'，模拟成交价150美元', {
      ...recommendation,quantity:quote(200,'200股'),price:quote(150,'模拟成交价150美元'),
    });
    assert.deepEqual(result.missing,['模拟成交股数'],count);
    assert.equal(result.body,null,count);
  }
});

test('model market evidence disambiguates a previously extracted cross-listed issuer', () => {
  const first = interpret('买入中国平安',{securityName:quote('中国平安','中国平安'),action:quote('buy','买入')});
  assert.deepEqual(first.missing,['交易市场或标的代码']);
  const result = interpret('港股',{market:quote('HK','港股')},first.fields);
  assert.equal(result.body.recommendation.ticker,'02318.HK');
  assert.throws(()=>interpret('买入英伟达NVDA和小米01810.HK',{
    ticker:quote('NVDA','NVDA'),securityName:quote('小米','小米'),action:quote('buy','买入'),
  }),/不同的标的/);
});

test('negated and historical fragments cannot produce a model-driven recommendation', () => {
  const cases = [
    ['不要卖出腾讯控股，我建议买入腾讯控股', 'sell', '卖出'],
    ['我想买腾讯控股。昨天已经加仓了。', 'add', '加仓'],
  ];
  for (const [text, action, evidence] of cases) {
    const securityName = quote('腾讯控股','腾讯控股');
    assert.deepEqual(interpret(text,{securityName,action:quote(action,evidence)}).missing,['建议动作']);
    assert.equal(interpret(text,{securityName,action:quote('buy','买')}).body.recommendation.action,'buy');
  }
});

test('requires current position evidence before filling in a missing action', () => {
  const cases = [
    ['腾讯控股的股价提高了一点', '提高'],
    ['腾讯控股的仓位不要再往上调', '往上调'],
    ['不要把腾讯控股的仓位往上调', '仓位往上调'],
  ];
  for (const [text, evidence] of cases) {
    const result = interpret(text,{securityName:quote('腾讯控股','腾讯控股'),action:quote('add',evidence)});
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
