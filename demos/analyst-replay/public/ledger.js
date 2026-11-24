import { beijingDate, beijingDateTime } from './beijing-time.mjs';

const actions = { buy: '买入', add: '加仓', hold: '持有', pass: '观望', trim: '减仓', sell: '卖出' };
const markets = { HK: '港股', A: 'A股', US: '美股' };
const bands = { low: '低', mid: '中', high: '高' };
const horizons = { '5d': '5 日', '10d': '10 日', short: '短期', mid: '中期', long: '长期' };
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => entities[c]);
}

function valueOf(number, { digits = 2, signed = false, suffix = '' } = {}) {
  if (!Number.isFinite(number)) return '—';
  return (signed && number > 0 ? '+' : '') + number.toFixed(digits) + suffix;
}

const pct = number => valueOf(number, { suffix: '%' });
const change = number => valueOf(number, { signed: true, suffix: '%' });
const price = (number, market) => valueOf(number, { digits: market === 'HK' ? 3 : 2 });
const trend = number => number > 0 ? 'positive' : number < 0 ? 'negative' : '';
const numberCell = (value, color = '') => '<td class="number ' + color + '">' + value + '</td>';
const changeCell = number => numberCell(change(number), trend(number));

function panel(title, detail, body) {
  return '<section class="panel"><header class="ledger-block-head"><h2>' + title +
    '</h2><small>' + detail + '</small></header>' + body + '</section>';
}

function metric(label, value, detail, color = '') {
  return '<div class="ledger-metric"><dt>' + label + '</dt><dd class="' + color + '">' + value +
    '<small>' + detail + '</small></dd></div>';
}

function summaryPanel(s) {
  const legacy = s.legacy_n_score ? ' · ' + s.legacy_n_score + ' 条为旧 20 日评分' : '';
  const items = [
    metric('建议数', s.recommendations, '已登记'),
    metric('5 日命中率', pct(s.hit_rate), s.hits + ' / ' + s.scorable + ' 条方向建议'),
    metric('平均评分', valueOf(s.avg_score, { signed: true }), s.n_score + ' 条已纳入评分' + legacy, trend(s.avg_score)),
    metric('持仓数', s.open_positions, '模拟持有标的'),
    metric('平均浮盈亏', change(s.avg_unrealized_pct), s.n_unrealized + ' 个标的', trend(s.avg_unrealized_pct)),
    metric('平均已实现盈亏', change(s.avg_realized_pct), s.closed_units + ' 份已平仓', trend(s.avg_realized_pct)),
    metric('待定价', s.unpriced, '等待首次评分'),
    metric('无仓可卖', s.no_position_to_sell, '卖出或减仓建议'),
  ].join('');
  return panel('账本摘要', '等权模拟', '<dl class="ledger-metrics">' + items + '</dl>' +
    '<p class="method">模拟成交取建议日收盘价。买入、加仓各增 1 份，减仓减 1 份，卖出清仓。</p>');
}

function table(label, headers, rows) {
  const columns = headers.map(([name, numeric]) =>
    '<th scope="col"' + (numeric ? ' class="number"' : '') + '>' + name + '</th>').join('');
  return '<div class="table-wrap"><table class="data-table" aria-label="' + label + '">' +
    '<thead><tr>' + columns + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}

function selfAssessmentPanel(assessment) {
  if (!assessment) return '';
  const label = '自评（不可审计）';
  if (assessment.empty) {
    return panel(label, '仅本人可见', '<p class="empty">0 个独立样本，暂无可计算的自评指标。</p>' +
      '<p class="method">自评仅采纳事前登记、已有 5 日方向结果的建议。晚于建议日登记的历史回放属于回溯记录。</p>');
  }
  const items = [
    metric('已结算', assessment.settled, '事前登记的方向建议'),
    metric('独立样本', assessment.independent, '按标的去除重叠窗口'),
    metric('命中率', assessment.hitRate, '95% 区间 ' + (assessment.interval ?? '—')),
    metric('Brier', assessment.brier, '越接近 0 越准'),
    metric('Brier skill', assessment.brierSkill, '相对样本基准'),
  ].join('');
  const rows = assessment.bands.map(b => '<tr><td>' + bands[b.band] + '</td>' + numberCell(b.n) +
    numberCell(b.hits) + numberCell(b.rate) + numberCell(b.interval ?? '—') + '</tr>');
  return panel(label, '仅本人可见', '<dl class="ledger-metrics">' + items + '</dl>' +
    table('按信心档位的命中情况', [['登记信心档位'], ['独立样本', true], ['命中', true], ['命中率', true], ['Wilson 95% 区间', true]], rows));
}

function securityCells(row) {
  return '<td>' + escapeHTML(row.ticker) + '</td><td>' + escapeHTML(markets[row.market] ?? row.market) + '</td>';
}

function positionsPanel(positions) {
  const rows = positions.map(p => '<tr>' + securityCells(p) + numberCell(p.units) +
    numberCell(price(p.avg_fill, p.market)) +
    numberCell(price(p.last_close, p.market) + '<small>' + escapeHTML(p.last_close_date) + '</small>') +
    changeCell(p.unrealized_pct) + numberCell(pct(p.weight * 100)) +
    '<td>' + escapeHTML(beijingDate(p.opened_at)) + '</td></tr>');
  return panel('模拟持仓', positions.length + ' 个标的', rows.length
    ? table('模拟持仓', [['标的'], ['市场'], ['份数', true], ['均价', true], ['最新收盘', true],
        ['浮盈亏', true], ['份数权重', true], ['建仓日（北京时间）']], rows)
    : '<p class="empty">暂无模拟持仓</p>');
}

function closedPanel(closed) {
  if (!closed.length) return '';
  const rows = closed.map(p => '<tr>' + securityCells(p) + numberCell(p.units) +
    numberCell(price(p.avg_fill, p.market)) + numberCell(price(p.exit_price, p.market)) +
    changeCell(p.realized_pct) + '<td>' + escapeHTML(beijingDate(p.closed_at)) + '</td></tr>');
  return panel('已平仓', closed.length + ' 笔', table('已平仓', [['标的'], ['市场'], ['份数', true],
    ['均价', true], ['平仓价', true], ['已实现盈亏', true], ['平仓日（北京时间）']], rows));
}

function legacyWindow(row) {
  return row.finalDay === 20 || (row.finalDay == null && Number.isFinite(row.return20));
}

function checkpointCell(pctReturn, points, hit) {
  if (!Number.isFinite(pctReturn)) return numberCell('—');
  const hitLabel = hit === true ? '命中' : hit === false ? '未命中' : hit === null ? '无方向' : '';
  const score = valueOf(points, { digits: 1, signed: true, suffix: ' 分' });
  return numberCell('<strong class="' + trend(points) + '">' + score + '</strong><small>' +
    (hitLabel ? hitLabel + ' · ' : '') + '<span class="' + trend(pctReturn) + '">' +
    change(pctReturn) + '</span></small>');
}

function timelineRow(row, showLegacy) {
  const confidence = row.band ? bands[row.band] + ' · 未校准' : '无方向';
  const registration = row.pairNo != null;
  const metadata = registration ? '<p>目标价 ' + price(row.target_price, row.market) + ' · 止损 ' + price(row.stop_loss, row.market) + '</p>' +
    '<p>建议期限 ' + (horizons[row.horizon] || '未定') + '</p>' +
    (row.thesis_ref ? '<p>关联研究 ' + escapeHTML(row.thesis_ref) + '</p>' : '') : '';
  return '<tr><td>' + escapeHTML(beijingDateTime(row.recommended_at ?? row.date)) + '<small>第 ' + escapeHTML(row.round) + (registration ? ' 组' : ' 轮') + '</small></td>' +
    '<td>' + escapeHTML(row.ticker) + '</td><td><span class="chip">' + escapeHTML(actions[row.action]) + '</span></td>' +
    numberCell(price(row.reference_price, row.market)) + numberCell(price(row.fill, row.market)) +
    checkpointCell(row.return5, row.score5 ?? (row.status === 'provisional' ? row.score : null), row.hit) +
    checkpointCell(row.return10, row.score10, row.hit10) +
    (showLegacy ? (legacyWindow(row) ? checkpointCell(row.return20, row.score) : numberCell('—')) : '') +
    '<td><details class="ledger-reason"><summary aria-label="' + confidence + '，查看登记信心与理由">' + confidence +
    '</summary><p>登记信心 ' + valueOf(row.confidence, { digits: 0, suffix: '%' }) +
    '</p><p>' + escapeHTML(row.rationale) + '</p>' + metadata + '</details></td></tr>';
}

function timelinePanel(timeline) {
  const showLegacy = timeline.some(legacyWindow);
  const headers = [['建议时间（北京时间）'], ['标的'], ['动作'], ['参考价', true], ['模拟成交价', true],
    ['5 日暂评与命中', true], ['10 日评分与命中', true]];
  if (showLegacy) headers.push(['20 日评分（旧口径）', true]);
  headers.push(['信心 / 理由']);
  const body = timeline.length ? table('建议时间线', headers, timeline.map(row => timelineRow(row, showLegacy))) +
    '<p class="method">收益按已完成交易日的收盘价计算。汇总命中率使用第 5 日结果。当前口径满 5 日暂评，满 10 日结算。</p>'
    : '<p class="empty">尚无可查看的建议</p>';
  return panel('建议时间线', timeline.length + ' 条', body);
}

export function renderLedger(state, role) {
  const book = state.books?.[role];
  if (!book) return '<p class="empty">暂无账本数据</p>';
  return '<div class="ledger">' + summaryPanel(book.summary) + selfAssessmentPanel(book.self_assessment) + positionsPanel(book.positions) +
    closedPanel(book.closed) + timelinePanel(book.timeline) + '</div>';
}
