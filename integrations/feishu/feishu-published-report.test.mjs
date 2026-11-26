import assert from 'node:assert/strict';
import test from 'node:test';
import {createPublishedGroupReportReader, formatPublishedGroupReport} from './feishu-published-report.mjs';

const when = '2026-11-26T07:15:00Z';
const room = {chatId:'bound', simulationAccount:{id:'owner',confirmed:true}, approverIds:['pm'],
  analystBySender:{author1:'a',author2:'b',guestRole:'demo'}, analystNamesByRole:{a:'甲',b:'乙'},demoOnlyRoles:['demo']};
const scope = {chatId:'bound',expectedOwnerId:'owner',analystKeys:['a','b']};

function packet(name, count, active, scoreSummary, scoredRows = 0, tradeCount = 0) {
  const line = '2026/11/24 15:51 ' + name + ' 01810.HK 买入';
  const block = (label,n,detail) => [label+'（共 '+n+' 条'+(n>5?'，列最近 5 条':'')+'）',
    ...Array(Math.min(n,5)).fill(line+detail)].join('\n');
  return [
    '正式模拟账户查询（指定分析师，北京时间）',
    block('正式分析建议',count,'｜参考 227.22 HKD'),
    ['正式建议评分','有效建议 '+active+' 条｜'+scoreSummary,
      ...(scoredRows ? ['最近有评分或命中判定的建议',...Array(scoredRows).fill(line+'｜详细评语测试')] : [])].join('\n'),
    block('分析师建议关联的模拟成交',tradeCount,' 222 股 × 332.33 HKD｜来源建议 买入（2026/11/24 15:51）'),
  ].join('\n\n');
}

test('public report computes weighted aggregate denominators and bounds displayed detail to named group reads', async () => {
  const inputs = [];
  const generate = createPublishedGroupReportReader(async request => {
    inputs.push(request);
    return request.analystKey === 'a' ?
      packet('甲',10,9,'命中率 66.7%（2/3）｜平均分 1.0（3 条有分数）',3,6) :
      packet('乙',1,1,'命中率 0.0%（0/1）｜平均分 -3.0（1 条有分数）',1);
  },()=>room);
  const message = await generate(scope);
  assert.deepEqual(inputs.map(i=>[i.expectedOwnerId,i.analystKey,i.sections]),['a','b'].map(key=>['owner',key,['recommendations','scores','trades']]));
  assert.match(message,/11 条（有效 10，已撤回 1）/u);
  assert.match(message,/≈ 0\.0 分（4 条已评分）/u);
  assert.match(message,/50\.0%（命中 2 \/ 已判定 4）/u);
  assert.match(message,/本次涵盖 6 \/ 11 条/u);
  assert.match(message,/01810\.HK　买入 6 条/u);
  assert.match(message,/关联的模拟成交　6 笔/u);
  assert.match(message,/成交方向（涵盖 5 \/ 6 笔）　买入 5 笔/u);
  assert.doesNotMatch(message,/owner|author1|guestRole|227\.22|332\.33|222 股|详细评语测试|15:51/u);
});

test('public report distinguishes missing samples, real 0%, zero score, and an empty roster', async () => {
  const generate = createPublishedGroupReportReader(async ({analystKey}) => analystKey==='a'
    ? packet('甲',2,2,'暂无可判定命中的样本｜暂无已评分样本') : packet('乙',0,0,'暂无可判定命中的样本｜暂无已评分样本'),()=>room);
  const pending = await generate(scope);
  assert.match(pending,/平均评分　暂无已评分样本/u);
  assert.match(pending,/方向命中率　暂无已判定样本/u);
  assert.doesNotMatch(pending,/0\.0%|未命中/u);
  const zero = await createPublishedGroupReportReader(async () =>
    packet('甲',1,1,'命中率 0.0%（0/1）｜平均分 0.0（1 条有分数）',1),()=>({...room,analystBySender:{author1:'a'}}))({...scope,analystKeys:['a']});
  assert.match(zero,/0\.0 分（1 条已评分）/u);
  assert.match(zero,/0\.0%（命中 0 \/ 已判定 1）/u);
  assert.doesNotMatch(zero,/≈/u);
  assert.equal(formatPublishedGroupReport([],when),'Osborn 分析助手｜全组正式报告\n截至北京时间 2026-11-26 15:15 · 全部历史\n\n本群尚未绑定正式分析师。');
});

test('public report refuses missing or changed group snapshots and never falls back to the whole account', async () => {
  let config=room, reads=0;
  const generate=createPublishedGroupReportReader(async () => {
    reads++;
    config={...room,chatId:'moved'};
    return packet('甲',0,0,'暂无可判定命中的样本｜暂无已评分样本');
  },()=>config);
  for (const rejected of [undefined,{...scope,analystKeys:null},{...scope,analystKeys:['a','a']},
    {...scope,chatId:'wrong'},{...scope,expectedOwnerId:'other'},{...scope,analystKeys:['a']}]) {
    await assert.rejects(generate(rejected));
  }
  assert.equal(reads,0);
  await assert.rejects(generate(scope));
  assert.ok(reads>0);
});

test('PM group publication includes per-analyst holdings and a currency group cost share, with current authorization',async()=>{
  const calls=[];
  const generate=createPublishedGroupReportReader(async request=>{
    calls.push(request);
    const name=room.analystNamesByRole[request.analystKey];
    const ticker=name==='甲'?'ACME':'FOO';
    const cost=name==='甲'?10:30;
    const response=packet(name,0,0,'暂无可判定命中的样本｜暂无已评分样本')
      .replace('指定分析师','分析师 '+name).replace('分析师建议关联的模拟成交',name+' · 建议关联的模拟成交');
    return response+'\n\n分析师持仓（按成本，按币种分别计算）\n'+ticker+'｜净股数 1｜均价 '+cost+'｜持仓成本 '+cost+' USD｜已实现盈亏 0 USD｜占比 100%';
  },()=>room);
  for(const requesterId of [undefined,'guest','author1'])await assert.rejects(generate({...scope,includePositions:true,requesterId}));
  assert.deepEqual(calls,[]);
  const message=await generate({...scope,includePositions:true,requesterId:'pm'});
  assert.deepEqual(calls.map(x=>x.sections),Array(2).fill(['recommendations','scores','trades','positions']));
  assert.match(message,/甲\nACME[^\n]+占比 100%\n乙\nFOO[^\n]+占比 100%/u);
  const totals=message.split('全组持仓与占比（按同币种持仓成本）\n')[1];
  assert.match(totals,/ACME[^\n]+USD｜占比 25%\nFOO[^\n]+USD｜占比 75%/u);
});
