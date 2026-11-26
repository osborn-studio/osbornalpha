import {beijingDateTime} from './beijing-time.mjs';
import {publicAnalystDirectory} from './feishu-analyst-roster.mjs';
import {createGroupScopedReader, validateNamedHeading} from './feishu-group-report.mjs';
import {renderGroupPositions, readPositionRows} from './feishu-position-report.mjs';

const sections = ['recommendations', 'scores', 'trades'];
const recommendationHeading = /^正式分析建议（共 (\d+) 条(?:，列最近 (\d+) 条)?）$/u;
const tradeHeading = /^(?:我的投资 · 建议关联的模拟成交|分析师建议关联的模拟成交)（共 (\d+) 条(?:，列最近 (\d+) 条)?）$/u;
const scoreSummary = /^有效建议 (\d+) 条｜(?:命中率 [\d.]+%（(\d+)\/(\d+)）|暂无可判定命中的样本)｜(?:平均分 (-?[\d.]+)（(\d+) 条有分数）|暂无已评分样本)$/u;
const invalid = () => { throw Error('正式返回的范围或格式无法核对，本次报表未生成。'); };

function readRows(lines, names) {
  return lines.map(line => {
    const parts = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}) (.+)$/u.exec(line);
    const name = parts && names.find(alias => parts[2].startsWith(alias + ' '));
    if (!name) invalid();
    const value = parts[2].slice(name.length + 1);
    const match = /^([^｜\p{Cc}\p{Cf}<>@]{1,60}?) (买入|卖出|加仓|减仓|持有|观望)(.*)$/u.exec(value);
    if (!match || /(?:\b(?:ou|oc|om|cli)_|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|https?:\/\/)/iu.test(value)) invalid();
    return {at:parts[1], ticker:match[1], action:match[2], details:match[3].replace(/^[｜ ]+/u,'').split('｜').filter(Boolean).join(' · ')};
  });
}

function readList(block, pattern, names) {
  const [heading, ...lines] = block.split('\n');
  const match = pattern.exec(heading);
  if (!match) invalid();
  const count = Number(match[1]);
  if (lines.length !== Math.min(5, count) || Number(match[2] ?? count) !== lines.length) invalid();
  return {count, rows:readRows(lines, names)};
}

// The deployed integration publishes full per-person counts alongside at most five example rows.
// Keep the three independent lists; timestamps and tickers are not unique recommendation keys.
export function parseNamedReport(text, label, names, includePositions = false) {
  const [heading, adviceBlock, scoresBlock, tradesBlock, positionsBlock, ...extra] = text.trim().split('\n\n');
  if (!validateNamedHeading(heading,names) || !adviceBlock || !scoresBlock || !tradesBlock || Boolean(positionsBlock)!==includePositions || extra.length) invalid();
  const recommendations = readList(adviceBlock, recommendationHeading, names);
  const prefix=names.find(name=>tradesBlock.startsWith(name+' · 建议关联的模拟成交（'));
  const trades = readList(prefix ? '分析师建议关联的模拟成交'+tradesBlock.slice((prefix+' · 建议关联的模拟成交').length) : tradesBlock, tradeHeading, names);
  const [scoreTitle, summary, detailTitle, ...scoreLines] = scoresBlock.split('\n');
  const score = scoreSummary.exec(summary);
  if (scoreTitle !== '正式建议评分' || !score || (detailTitle && detailTitle !== '最近有评分或命中判定的建议')) invalid();
  const active = Number(score[1]), hits = Number(score[2] ?? 0), assessed = Number(score[3] ?? 0);
  const average = score[4] === undefined ? null : Number(score[4]), scored = Number(score[5] ?? 0);
  if (active > recommendations.count || hits > assessed || assessed > active || scored > active ||
      (average !== null && !Number.isFinite(average)) || scoreLines.length > 5 ||
      scoreLines.length < Math.min(5,Math.max(assessed,scored))) invalid();
  return {label, recommendations, trades, ...(includePositions && {positions:readPositionRows(positionsBlock)}), active, hits, assessed, average, scored, scoreRows:readRows(scoreLines,names)};
}

export function summarizeReports(reports) {
  const sum = key => reports.reduce((total,r) => total+r[key],0);
  const registered = reports.reduce((n,r) => n+r.recommendations.count,0), trades = reports.reduce((n,r) => n+r.trades.count,0);
  const active = sum('active'), scored = sum('scored'), assessed = sum('assessed'), hits = sum('hits');
  const hitRate = assessed ? (hits/assessed*100).toFixed(1)+'%' : '—';
  // Per-person means in the live text API are rounded to one decimal.
  const approximate = reports.filter(r => r.scored).length > 1;
  const mean = scored ? (approximate?'≈ ':'')+(reports.reduce((n,r) => n+(r.average ?? 0)*r.scored,0)/scored).toFixed(1) : '—';
  return {registered, trades, active, scored, assessed, hits, hitRate, approximate, mean};
}

export async function fetchSnapshot(config, reader, scope) {
  const initial = config();
  const includePositions=scope?.includePositions===true;
  const wanted=includePositions ? [...sections,'positions'] : sections;
  const members = publicAnalystDirectory(initial).filter(entry => !entry.demo);
  if (!initial.chatId || !initial.simulationAccount?.id || initial.simulationAccount.confirmed !== true ||
      !initial.approverIds?.length || !reader) invalid();
  if (scope && (scope.chatId !== initial.chatId || scope.expectedOwnerId !== initial.simulationAccount.id ||
      !Array.isArray(scope.analystKeys) || scope.analystKeys.length !== members.length ||
      !members.every(member => scope.analystKeys.includes(member.role)))) invalid();

  const verify = () => {
    const current = config();
    if (current.chatId !== initial.chatId || current.simulationAccount?.id !== initial.simulationAccount.id ||
        current.simulationAccount?.confirmed !== true || !current.approverIds?.length ||
        (includePositions && !current.approverIds.includes(scope.requesterId)) ||
        JSON.stringify(publicAnalystDirectory(current).filter(entry => !entry.demo)) !== JSON.stringify(members)) invalid();
    return current;
  };
  const scoped = createGroupScopedReader(reader, verify, {fullPositionRows:true});
  const reports = [];
  for (let offset = 0; offset < members.length; offset += 4) {
    const batch = await Promise.all(members.slice(offset, offset + 4).map(async ({role, label}) => {
      if (!label) invalid();
      const names = [initial.analystNamesByRole?.[role], ...(initial.analystAliasesByRole?.[role] ?? []), label, role]
        .filter(Boolean).sort((a,b) => b.length-a.length);
      const text = await scoped({expectedOwnerId: initial.simulationAccount.id, analystKey: role, sections:wanted});
      return parseNamedReport(text, label, names, includePositions);
    }));
    reports.push(...batch);
  }
  verify();
  return reports;
}

function addCount(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function actionCounts(counts, unit) {
  return [...counts].map(([action, n]) => action + ' ' + n + ' ' + unit).join('、');
}

export function formatPublishedGroupReport(reports, generated = new Date()) {
  const totals = summarizeReports(reports);
  const lines = [
    'Osborn 分析助手｜全组正式报告',
    '截至北京时间 ' + beijingDateTime(generated).slice(0,16) + ' · 全部历史',
  ];
  if (!reports.length) return [...lines, '', '本群尚未绑定正式分析师。'].join('\n');
  lines.push('', '建议登记　' + totals.registered + ' 条（有效 ' + totals.active + '，已撤回 ' + (totals.registered - totals.active) + '）',
    '平均评分　' + (totals.scored ? totals.mean + ' 分（' + totals.scored + ' 条已评分）' : '暂无已评分样本'),
    '方向命中率　' + (totals.assessed ? totals.hitRate + '（命中 ' + totals.hits + ' / 已判定 ' + totals.assessed + '）' : '暂无已判定样本'),
    '建议关联的模拟成交　' + totals.trades + ' 笔');

  const shown = reports.flatMap(r => r.recommendations.rows);
  const byTicker = new Map();
  for (const {ticker, action} of shown) {
    const entry = byTicker.get(ticker) ?? {count: 0, actions: new Map()};
    entry.count++;
    addCount(entry.actions, action);
    byTicker.set(ticker, entry);
  }
  if (shown.length) {
    const coverage = shown.length === totals.registered ? '共 ' + shown.length + ' 条' :
      '各分析师最近最多 5 条，本次涵盖 ' + shown.length + ' / ' + totals.registered + ' 条';
    lines.push('', '登记分布（' + coverage + '）');
    const ranked = [...byTicker].sort((a,b) => b[1].count-a[1].count || a[0].localeCompare(b[0]));
    for (const [ticker, entry] of ranked.slice(0,5)) lines.push('• ' + ticker + '　' + actionCounts(entry.actions, '条'));
    if (ranked.length > 5) lines.push('另外 ' + (ranked.length - 5) + ' 个标的也计入登记总数。');
  }

  if (totals.trades) {
    const fills = reports.flatMap(r => r.trades.rows);
    const sides = new Map();
    for (const fill of fills) addCount(sides, fill.action);
    lines.push('', '成交方向（涵盖 ' + fills.length + ' / ' + totals.trades + ' 笔）　' + actionCounts(sides, '笔'));
  }
  lines.push('', '按分析师汇总');
  const sorted = [...reports].sort((a,b) => b.recommendations.count - a.recommendations.count);
  for (const r of sorted.slice(0,12)) {
    const detail = [r.label + '　登记 ' + r.recommendations.count + ' 条', '成交 ' + r.trades.count + ' 笔'];
    if (r.scored) detail.push('均分 ' + r.average.toFixed(1) + '（' + r.scored + ' 条）');
    if (r.assessed) detail.push('命中 ' + r.hits + '/' + r.assessed);
    lines.push('• ' + detail.join(' · '));
  }
  if (sorted.length > 12) lines.push('其余 ' + (sorted.length - 12) + ' 位已计入全组统计。');
  if (reports.every(r=>Array.isArray(r.positions))) {
    lines.push('','按分析师持仓（按成本、分币种）');
    const fits=block=>{
      const message=[...lines,block].join('\n');
      return message.length<9500 && Buffer.byteLength(message,'utf8')<14500;
    };
    for (const [index,r] of reports.entries()) {
      const block=[r.label,...(r.positions.length ? r.positions.map(p=>p.text) : ['暂无归属持仓。'])].join('\n');
      if (!fits(block)) {
        lines.push('其余 '+(reports.length-index)+' 位的持仓明细请点名查询。');
        break;
      }
      lines.push(block);
    }
    const weights=renderGroupPositions(reports.flatMap(r=>r.positions));
    if(weights && fits(weights))lines.push('',weights);
    else if(weights)lines.push('全组按币种的占比明细超过单条消息上限。');
  }
  if (totals.active) {
    lines.push('', '正式评分按已保存的结果统计。方向命中依据建议基准日后第 5 个交易日的收盘表现。');
    if (totals.scored < totals.active) lines.push('完整日线可用后，可在正式系统「分析 → 刷新评分」计算，再生成群报告。');
    if (totals.approximate) lines.push('全组均分按各分析师已取整的均分及评分样本数加权估算。');
  }
  return lines.join('\n');
}

export function createPublishedGroupReportReader(reader, config) {
  return async scope => {
    if (!scope) invalid();
    return formatPublishedGroupReport(await fetchSnapshot(config, reader, scope));
  };
}
