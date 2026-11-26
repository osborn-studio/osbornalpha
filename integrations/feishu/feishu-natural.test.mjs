import test from 'node:test';
import assert from 'node:assert/strict';
import {detectNaturalProposal,extractNatural,resolveModelSecurity} from './feishu-natural.mjs';

const receivedAt = '2026-11-23T17:08:29.000Z'; // November 24 in Beijing.

test('a free-form HK proposal separates prices, quantity, and stock without a template', () => {
  const text = '腾讯控股想买200股，现价447.4，目标480，跌破420止损';
  assert.ok(detectNaturalProposal(text));
  assert.deepEqual(extractNatural(text),{ticker:'00700.HK',market:'HK',action:'buy',quantity:200,
    reference_price:447.4,target_price:480,stop_loss:420});
  assert.deepEqual(extractNatural('想在港股加仓小米，现价40港元'),{market:'HK',action:'add',currency:'HKD',ticker:'01810.HK',reference_price:40});
  assert.deepEqual(extractNatural('建议买腾讯，现价447.4港元，预期涨到480，止损点420港元，理由是财报超预期'),{action:'buy',rationale:'财报超预期',reference_price:447.4,target_price:480,stop_loss:420,currency:'HKD',ticker:'00700.HK',market:'HK'});
  assert.deepEqual(extractNatural('我对腾讯控股有条建议，参考价447.4'),{reference_price:447.4,ticker:'00700.HK',market:'HK'});
  assert.deepEqual(extractNatural('建议买入700.HK'),{ticker:'00700.HK',market:'HK',action:'buy'});
});

test('a specific position adjustment can refine a colloquial direction but not a distinct instruction', () => {
  assert.deepEqual(extractNatural('我想买01800.HK 港股 加仓'),{ticker:'01800.HK',market:'HK',action:'add'});
  assert.deepEqual(extractNatural('我想卖01800.HK港股，减仓'),{ticker:'01800.HK',market:'HK',action:'trim'});
  assert.deepEqual(extractNatural('我想买01800.HK'),{ticker:'01800.HK',market:'HK',action:'buy'});
  for (const text of ['买01800.HK或者加仓','买01800.HK然后加仓','买入01800.HK并且加仓','买01800.HK减仓','加仓腾讯，卖出小米']) {
    assert.throws(() => extractNatural(text),/多个不同的建议动作/,text);
  }
});

test('spoken budgets do not obscure the stock name or turn into a trade size', () => {
  const expected = {ticker:'NVDA',market:'US',action:'buy'};
  for (const text of [
    '我想申请买100万美金英伟达',
    '买20万人民币的英伟达股票',
    '买200000人民币的英伟达股票',
    '买人民币200000的英伟达股票',
    '买英伟达吧。',
    '买英伟达！',
    '买入Nvidia',
    '买入 NVDA.',
  ]) assert.deepEqual(extractNatural(text),expected,text);
  assert.deepEqual(extractNatural('买200股英伟达股票'),{...expected,quantity:200});
  assert.deepEqual(extractNatural('买腾讯音乐股票'),{action:'buy'});
  assert.deepEqual(resolveModelSecurity('给英伟达投20万人民币，只记这条建议','英伟达',{},'英伟达'),
    {ticker:'NVDA',market:'US',securityName:undefined});
});

test('a condition next to an issuer name grounds that issuer without accepting related securities', () => {
  const listing = {ticker:'NVDA',market:'US',securityName:undefined};
  for (const text of ['英伟达如果跌破140就止损，眼下我建议继续持有','英伟达若跌破140就止损，先持有']) {
    assert.deepEqual(resolveModelSecurity(text,'英伟达',{},'英伟达'),listing,text);
  }
  for (const text of ['英伟达供应商如果有变化再减持','英伟达相关ETF若跌破140就止损','英伟达若干供应商']) {
    assert.deepEqual(resolveModelSecurity(text,'英伟达',{},'英伟达'),{},text);
  }
  assert.deepEqual(resolveModelSecurity('腾讯音乐如果跌破140就止损','腾讯',{},'腾讯'),{});
  assert.equal(detectNaturalProposal('如果英伟达跌破140再买入'),false);
});

test('initial intent includes partial suggestions and directed stock codes; ignores chatter, questions, conditional and negative orders', () => {
  for (const text of ['我想加仓，参考价40','我对腾讯控股有条建议，参考价447.4','加仓','买入','我建议买入未收录的公司']) {
    assert.equal(detectNaturalProposal(text),true,text);
  }
  for (const text of ['0700.HK','NVDA','腾讯控股','股票代码是01810.HK']) {
    assert.equal(detectNaturalProposal(text),false,text);
    assert.equal(detectNaturalProposal(text,{directedToBot:true}),true,text);
  }
  for (const text of ['腾讯今天有什么消息？','我想买苹果手机','去小米买手机','他说要卖出腾讯，我不同意','要不要买入？','不建议买入腾讯','如果腾讯跌破400再买入','回调到420再买入腾讯','建议明天开会','我对腾讯意见是谨慎']) {
    assert.equal(detectNaturalProposal(text,{directedToBot:true}),false,text);
  }
  assert.throws(()=>extractNatural('要不要买入？'),/明确陈述/);
  assert.throws(()=>extractNatural('不建议买入腾讯'),/明确陈述/);
  assert.throws(()=>extractNatural('回调到420再买入腾讯'),/明确陈述/);
  assert.deepEqual(extractNatural('暂不买入腾讯，先观望'),{ticker:'00700.HK',market:'HK',action:'pass'});
  assert.deepEqual(extractNatural('我建议加仓未知科技'),{action:'add'});
});

test('accepts a focused follow-up and does not invent an execution price', () => {
  assert.deepEqual(extractNatural('目标位48，止损放在35港元',{market:'HK'}),{target_price:48,stop_loss:35,currency:'HKD'});
  assert.deepEqual(extractNatural('以447.40港元买入200股'),{reference_price:447.4,currency:'HKD',action:'buy',quantity:200});
  assert.deepEqual(extractNatural('模拟以447.4港元买入200股，手续费2'),{price:447.4,currency:'HKD',action:'buy',quantity:200,fee:2});
  assert.deepEqual(extractNatural('模拟成交价447.4，数量200股'),{price:447.4,quantity:200});
  assert.deepEqual(extractNatural('手续费0'),{fee:0});
});

test('resolves markets conservatively and requires an explicit code when a name is ambiguous', () => {
  assert.deepEqual(extractNatural('我想买入腾讯音乐'),{action:'buy'});
  assert.deepEqual(extractNatural('买入nvda，八成把握'),{action:'buy',confidence:80,ticker:'NVDA',market:'US'});
  assert.deepEqual(extractNatural('我想买入中国平安'),{action:'buy',securityName:'中国平安'});
  assert.deepEqual(extractNatural('港股',{securityName:'中国平安'}),{ticker:'02318.HK',market:'HK'});
  assert.deepEqual(extractNatural('A股',{securityName:'中国平安'}),{ticker:'601318.SH',market:'A'});
  assert.deepEqual(extractNatural('港股腾讯音乐',{securityName:'中国平安'}),{market:'HK'});
  assert.deepEqual(extractNatural('换成腾讯',{securityName:'中国平安'}),{market:'HK',ticker:'00700.HK'});
  assert.deepEqual(extractNatural('我想买入中国平安A股'),{action:'buy',market:'A',ticker:'601318.SH'});
  assert.deepEqual(extractNatural('买入阿里巴巴，不设目标'),{action:'buy',securityName:'阿里巴巴'});
  assert.deepEqual(extractNatural('想卖出NVDA，参考价100美元'),{action:'sell',market:'US',ticker:'NVDA',currency:'USD',reference_price:100});
  assert.deepEqual(extractNatural('加仓贵州茅台，参考价1,500元'),{action:'add',market:'A',ticker:'600519.SH',reference_price:1500});
  assert.throws(()=>extractNatural('买入腾讯和小米'),/证券代码/);
  assert.throws(()=>extractNatural('港股600519.SH买入'),/市场不一致/);
  assert.throws(()=>extractNatural('目标480美元',{market:'HK'}),/币种/);
  assert.throws(()=>extractNatural('参考400港元，目标450美元'),/币种/);
});

test('reads date, confidence, horizon and labeled optional notes independently', () => {
  const text='2026年6月16日 下午4点30分，持有腾讯，信心80%，期限10个交易日，因为现金流改善，关联研究：季度业绩报告';
  assert.deepEqual(extractNatural(text,{receivedAt}),{recommended_at:'2026-06-16T08:30:00.000Z',action:'hold',ticker:'00700.HK',
    market:'HK',confidence:80,horizon:'10d',rationale:'现金流改善',thesis_ref:'季度业绩报告'});
  assert.deepEqual(extractNatural('我建议买入腾讯，预计2026年12月31日公布业绩',{receivedAt}),{action:'buy',ticker:'00700.HK',market:'HK'});
  assert.deepEqual(extractNatural('回放日期2026年6月16日 16:30，建议买入腾讯，预计2026年12月31日公布业绩',{receivedAt}),{recommended_at:'2026-06-16T08:30:00.000Z',action:'buy',ticker:'00700.HK',market:'HK'});
  assert.deepEqual(extractNatural('2026-06-16T16:30:00+08:00'),{recommended_at:'2026-06-16T08:30:00.000Z'});
  assert.deepEqual(extractNatural('昨天上午9:30',{receivedAt}),{recommended_at:'2026-11-23T01:30:00.000Z'});
  assert.deepEqual(extractNatural('今天',{receivedAt}),{recommended_at:receivedAt});
  assert.deepEqual(extractNatural('建议买入腾讯，理由：同业苹果可能卖出库存'),{rationale:'同业苹果可能卖出库存',action:'buy',market:'HK',ticker:'00700.HK'});
  assert.throws(()=>extractNatural('2月30日 16:00'),/年份/);
  assert.throws(()=>extractNatural('2026年2月30日'),/日期或时间无效/);
  assert.throws(()=>extractNatural('建议时间上周三'),/建议时间无法确认/);
});

test('rejects contradictory directions, range guesses and malformed explicit numeric fields', () => {
  for (const text of ['加仓腾讯或者卖出腾讯','目标40，目标50','参考价40-45','止损5%','成交价-10','数量-100股','100到200股','1手']) {
    assert.throws(()=>extractNatural(text),{status:400},text);
  }
  assert.deepEqual(extractNatural('买入AAPL持有10天'),{ticker:'AAPL',market:'US',action:'buy',horizon:'10d'});
});
