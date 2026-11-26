import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fetchSnapshot,parseNamedReport,renderSnapshot} from './generate-report.mjs';

const row='2026/11/24 15:51 A 01810.HK 买入';
const packet=['正式模拟账户查询（指定分析师，北京时间）',
  '正式分析建议（共 9 条，列最近 5 条）\n'+Array(5).fill(row).join('\n'),
  '正式建议评分\n有效建议 8 条｜命中率 50.0%（1/2）｜平均分 0.0（2 条有分数）\n最近有评分或命中判定的建议\n'+Array(2).fill(row+'｜0.0 分｜未命中｜5日 0.00% / 20日 — / 60日 —').join('\n'),
  '分析师建议关联的模拟成交（共 1 条）\n'+row+' 300 股 × 20 HKD｜来源建议 买入（2026/11/24 15:00）'].join('\n\n');

test('snapshot keeps totals, scored zeros, denominators and detail limits distinct', async () => {
  const parsed=parseNamedReport(packet,'甲',['A']);
  assert.equal(parsed.recommendations.count,9);
  assert.equal(parsed.recommendations.rows.length,5);
  assert.equal(parsed.average,0);
  assert.equal(parsed.trades.rows[0].details,'300 股 × 20 HKD · 来源建议 买入（2026/11/24 15:00）');
  const {markdown}=await renderSnapshot([parsed],new Date('2026-11-24T12:00:00Z'));
  assert.match(markdown,/9 条建议，其中 8 条有效，1 条已撤回/u);
  assert.match(markdown,/展示的 5 条登记明细/u);
  assert.match(markdown,/平均分为 0\.0/u);
  assert.match(markdown,/2 条有效建议已有命中判定，其中 1 条命中，命中率为 50\.0%/u);
});

test('snapshot rejects unverified scope, unexpected attribution and a missing due row', () => {
  for(const text of [packet.replace('指定分析师','全账户'),packet.replace('15:51 A','15:51 X'),packet.replace('列最近 5 条','列最近 4 条')]){
    assert.throws(()=>parseNamedReport(text,'甲',['A']));
  }
});

test('fetch snapshot asks only a bound formal analyst and never requests the account overview', async () => {
  const requests=[];
  const config=()=>({chatId:'room',simulationAccount:{confirmed:true,id:'owner'},approverIds:['pm'],
    analystBySender:{one:'A',two:'B'},demoOnlyRoles:['B']});
  const rows=await fetchSnapshot(config,async request=>{requests.push(request);return packet;});
  assert.deepEqual(requests,[{expectedOwnerId:'owner',analystKey:'A',sections:['recommendations','scores','trades']}]);
  assert.equal(rows.length,1);
});
