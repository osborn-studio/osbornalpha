import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProposal, proposalSecurityQuery, summary } from './feishu-workflow-command.mjs';
import { parseRegistration } from '../../demos/analyst-replay/registrations.mjs';

const sentAt = '2025-06-16T08:30:00.000Z';
const parse = (text, draft) => evaluateProposal('A','分析师 A',text,sentAt,[],draft);
const interpret = (text, fields, draft) => evaluateProposal('A','分析师 A',text,sentAt,[],draft,{intent:'proposal',fields});
const quote = (value,evidence) => ({value,evidence});

test('explicit simulated intent asks for parameters and natural advice-only intent drops them', () => {
  const text = '我想模拟买入英伟达';
  const result = interpret(text,{securityName:quote('英伟达','英伟达'),action:quote('buy','买入'),
    executionMode:quote('simulate','模拟买入')});
  assert.deepEqual(result.missing,['模拟成交价','模拟成交股数']);
  const clear = '算了，取消成交，只登记建议';
  const body = interpret(clear,{executionMode:quote('advice_only','只登记建议')},result.fields).body;
  assert.equal(body.recommendation.ticker,'NVDA');
  assert.equal(body.simulation,null);
});

test('a quoted amount can be grounded by its adjacent execution label in the same sentence', () => {
  const fields = {securityName:quote('英伟达','英伟达'),action:quote('buy','买入'),quantity:quote(200,'200股'),
    price:quote(150,'150美元'),executionMode:quote('simulate','模拟买入')};
  const spoken = '我想模拟买入英伟达200股，成交价150美元';
  assert.equal(interpret(spoken,fields).body.simulation.price,150);
  assert.deepEqual(interpret(spoken.replace('成交价','参考价'),fields).missing,['模拟成交价']);
});

test('reversing a draft direction requires fresh simulation parameters', () => {
  const draft = {ticker:'NVDA',market:'US',action:'buy',quantity:200};
  assert.throws(() => interpret('改为卖出，模拟成交价150美元',{
    action:quote('sell','卖出'),price:quote(150,'模拟成交价150美元'),
  },draft),/重新说明本次成交的股数/);
  const body = interpret('改为卖出150股，模拟成交价150美元',{
    action:quote('sell','卖出'),quantity:quote(150,'150股'),price:quote(150,'模拟成交价150美元'),
  },draft).body;
  assert.deepEqual(body.simulation,{direction:'sell',quantity:150,price:150,fee:0});
});

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

test('an acknowledged per-share fill can be quoted before the amount, while a ceiling does not confirm a price', () => {
  const draft = {ticker:'NVDA',market:'US',action:'buy',quantity:200};
  const reply = '更正为每股135美元成交，200股还按原来。';
  for (const evidence of ['每股135美元成交','每股135美元']) {
    assert.equal(interpret(reply,{price:quote(135,evidence)},draft).body.simulation.price,135);
  }
  const bound = '最多每股170美元，不代表按这个价格成交。';
  const fields = {price:quote(170,'每股170美元'),reference_price:quote(170,'最多每股170美元')};
  const result = interpret(bound,fields,draft);
  assert.deepEqual(result.missing,['模拟成交价']);
  assert.equal(result.fields.reference_price,undefined);
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

test('model market evidence disambiguates a previously extracted cross-listed issuer', () => {
  const first = interpret('买入中国平安',{securityName:quote('中国平安','中国平安'),action:quote('buy','买入')});
  assert.deepEqual(first.missing,['交易市场或标的代码']);
  const result = interpret('港股',{market:quote('HK','港股')},first.fields);
  assert.equal(result.body.recommendation.ticker,'02318.HK');
  assert.throws(()=>interpret('买入英伟达NVDA和小米01810.HK',{
    ticker:quote('NVDA','NVDA'),securityName:quote('小米','小米'),action:quote('buy','买入'),
  }),/不同的标的/);
});

test('a complete issuer can be quoted independently of a locally known listing', () => {
  for (const [text,name] of [
    ['我要登记中芯国际的那条交易建议','中芯国际'],
    ['帮我建一份中国平安的投资提案','中国平安'],
    ['关于中芯国际，请登记一条建议','中芯国际'],
  ]) {
    const model = {intent:'proposal',intentEvidence:text,fields:{securityName:quote(name,name)}};
    assert.equal(proposalSecurityQuery(text,model),name);
    const result = evaluateProposal('A','分析师 A',text,sentAt,[],{},model,[]);
    assert.equal(result.fields.securityName,name);
    assert.deepEqual(result.missing,['交易市场或标的代码','建议动作']);
    const update = evaluateProposal('A','分析师 A','沪市',sentAt,[],result.fields,
      {intent:'proposal',fields:{market:quote('A','沪市')}},[]);
    assert.equal(update.fields.ticker,undefined,'no verified match for the requested market');
  }
  const name = quote('中芯国际','中芯国际');
  const choices = [{ticker:'688981.SH',market:'A'},{ticker:'00981.HK',market:'HK'}];
  const mismatch = {intent:'proposal',fields:{securityName:name,ticker:quote('NVDA','NVDA')}};
  assert.throws(()=>evaluateProposal('A','分析师 A','登记中芯国际 NVDA',sentAt,[],{},mismatch,choices),/不同的标的/);
  const sameMarket = [choices[1],{ticker:'80981.HK',market:'HK'}];
  const market = {intent:'proposal',fields:{market:quote('HK','港股')}};
  const unresolved = evaluateProposal('A','分析师 A','港股',sentAt,[],{securityName:'中芯国际'},market,sameMarket);
  assert.equal(unresolved.fields.ticker,undefined,'ask for the exact counter when the market alone is ambiguous');
  const clipped = {intent:'proposal',fields:{securityName:quote('中芯国际','中芯国际')}};
  assert.equal(proposalSecurityQuery('我想登记中芯国际的供应商的分析建议',clipped),null);
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

test('a converted ticker must match the draft issuer and cannot substitute another listing when unverified', () => {
  const text = '我说美股 COST';
  const draft = {securityName:'中芯国际',action:'buy'};
  const model = {intent:'proposal',fields:{ticker:{value:'COST',evidence:'美股 COST',requiresListing:true}}};
  assert.equal(proposalSecurityQuery(text,model,draft),'中芯国际');
  const result = evaluateProposal('A','测试',text,sentAt,[],draft,model,[{ticker:'00981.HK',market:'HK'}]);
  assert.equal(result.fields.ticker,undefined);
  assert.throws(()=>evaluateProposal('A','测试',text,sentAt,[],{ticker:'NVDA',action:'buy',market:'US'},model,[]),/未能.*核实新代码/);
});

test('an explicitly labeled acronym needs an exact US listing before reaching a proposal', () => {
  for (const ticker of ['A','AI','ADC']) {
    const text = `正式建议买入美股股票代码 ${ticker}`;
    const model = {intent:'proposal',fields:{ticker:{value:ticker,evidence:ticker,requiresListing:true},
      action:quote('buy','买入')}};
    const run = listings => evaluateProposal('A','测试',text,sentAt,[],{},model,listings);
    assert.equal(run([{ticker,market:'US'}]).body.recommendation.ticker,ticker);
    assert.equal(run([]).body,null);
    assert.equal(run([{ticker:'AAPL',market:'US'}]).body,null);
  }
});

test('draft prices support postposed roles and a complete compound currency', () => {
  const draft = {ticker:'600900.SH',market:'A',action:'buy',executionMode:'simulate',quantity:200};
  const text = '46.2是参考价，模拟成交用每股45.8元人民币。';
  const fields = {reference_price:quote(46.2,'46.2是参考价'),price:quote(45.8,'每股45.8元人民币'),
    currency:quote('CNY','45.8元人民币')};
  for (const reference of [fields.reference_price,quote(46.2,'46.2')]) {
    const result = interpret(text,{...fields,reference_price:reference},draft);
    assert.deepEqual(result.missing,[]);
    assert.equal(result.body.recommendation.reference_price,46.2);
    assert.deepEqual(result.body.simulation,{quantity:200,price:45.8,fee:0,direction:'buy'});
    assert.equal(result.fields.currency,'CNY');
  }
  assert.equal(interpret(text,{price:quote(45.8,'模拟成交用每股45.8元人民币')},draft).body.simulation.price,45.8);
  const swapped = interpret(text,{reference_price:fields.price,price:fields.reference_price},draft);
  assert.equal(swapped.fields.reference_price,undefined);
  assert.deepEqual(swapped.missing,['模拟成交价']);
  assert.throws(()=>interpret('模拟成交用每股45.8元人民币',{price:quote(45.8,'每股45.8元')},
    {...draft,ticker:'00700.HK',market:'HK'}),/币种/);
});

test('postposed price evidence must be current, exact, and unqualified', () => {
  const draft = {ticker:'600900.SH',market:'A',action:'buy',executionMode:'simulate',quantity:200};
  for (const [text,key,amount,evidence] of [
    ['46.2是参考价上限','reference_price',46.2,'46.2是参考价'],
    ['146.2是参考价','reference_price',46.2,'46.2是参考价'],
    ['-46.2是参考价','reference_price',46.2,'46.2是参考价'],
    ['昨天46.2是参考价','reference_price',46.2,'46.2是参考价'],
    ['41至46.2是参考价','reference_price',46.2,'46.2是参考价'],
    ['46.2是参考价吗？','reference_price',46.2,'46.2是参考价'],
    ['上次模拟成交用每股45.8元人民币','price',45.8,'每股45.8元人民币'],
    ['模拟成交用每股45.8元人民币以内','price',45.8,'每股45.8元人民币'],
    ['模拟成交用每股45.8元人民币','price',45.81,'每股45.8元人民币'],
  ]) {
    const result = interpret(text,{[key]:quote(amount,evidence)},draft);
    assert.equal(result.fields[key],undefined,text);
    assert.equal(result.body,null,text);
  }
});
