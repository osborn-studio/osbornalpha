import { beijingInputValue, beijingInputToISO } from './beijing-time.mjs';

const el = id => document.getElementById(id);
const form = el('registration-form');
const field = name => form.elements.namedItem(name);
const escaped = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[char]);
const actions = {buy:'买入', add:'加仓', trim:'减仓', sell:'卖出', hold:'持有', pass:'观望'};
const horizons = {'5d':'5 日', '10d':'10 日', short:'短期', mid:'中期', long:'长期'};
const statuses = {pending:'待评分', provisional:'5 日暂评'};
const finite = Number.isFinite;
const fixed = (n, digits = 2) => finite(n) ? n.toFixed(digits) : '—';
const signed = (n, digits = 2, suffix = '') => finite(n) ? (n > 0 ? '+' : '') + n.toFixed(digits) + suffix : '—';
const tone = n => !finite(n) || n === 0 ? '' : n > 0 ? 'positive' : 'negative';
const hitLabel = value => value === true ? '命中' : value === false ? '未命中' : '—';
const finalDayOf = evidence => evidence?.finalDay ?? (evidence?.d20Date ? 20 : 10);
const beijingTime = iso => iso ? new Date(iso).toLocaleString('zh-CN', { timeZone:'Asia/Shanghai', hour12:false }) : '—';
const visible = new Map();
let currentScope = '';
let marketTouched = false;
let useCurrentTime = true;
let submitting = false;
let reviewGroups = new Map();

function update(id, html) {
  if (visible.get(id) === html) return;
  el(id).innerHTML = html;
  visible.set(id, html);
}

export function fillExample() {
  field('ticker').value = '00700.HK';
  field('market').value = 'HK';
  useCurrentTime = false;
  field('recommended_at').value = '2026-06-16T15:30';
  marketTouched = false;
  validateTicker();
}

function setBeijingTimeToNow() {
  useCurrentTime = true;
  field('recommended_at').value = beijingInputValue();
}

el('rec-use-now').addEventListener('click', setBeijingTimeToNow);
field('recommended_at').addEventListener('input', () => { useCurrentTime = false; });

function inferMarket(value) {
  const raw = value.replace(/\s/g, '').toUpperCase();
  if (/^(?:(?:SH|SZ|BJ)\d{6}|\d{6}(?:\.(?:SH|SZ|BJ|SS))?)$/.test(raw)) return 'A';
  if (/^\d{1,5}(?:\.HK)?$/.test(raw)) return 'HK';
  if (/^[A-Z][A-Z0-9./-]{0,7}(?:\.(?:O|N|A|K|OQ|NQ))?$/.test(raw)) return 'US';
  return null;
}

function validateTicker() {
  const ticker = field('ticker');
  const market = inferMarket(ticker.value);
  const invalid = Boolean(ticker.value.trim() && !market);
  ticker.setCustomValidity(invalid ? '仅支持 A 股 / 港股 / 美股代码' : '');
  ticker.setAttribute('aria-invalid', String(invalid));
  el('rec-ticker-hint').hidden = !invalid;
  if (market && !marketTouched) field('market').value = market;
  form.querySelector('button[type="submit"]').disabled = submitting || !ticker.value.trim() || invalid;
}

field('ticker').addEventListener('input', validateTicker);
field('market').addEventListener('change', () => { marketTouched = true; });
field('reference_price').addEventListener('input', event => {
  const input = event.target;
  input.setCustomValidity(input.value && input.valueAsNumber <= 0 ? '参考价须大于 0。' : '');
});
field('confidence').addEventListener('input', () => {
  el('rec-confidence-value').value = field('confidence').value + '%';
});

export function registrationFeedback(text, error = false) {
  el('registration-feedback').textContent = text;
  el('registration-feedback').toggleAttribute('data-error', error);
}

export function registrationBusy(value) {
  submitting = value;
  for (const control of form.elements) control.disabled = value;
  form.querySelector('button[type="submit"]').textContent = value ? '登记中…' : '登记建议';
  validateTicker();
}

function requestStorageKey(s) {
  return 'osborn.registration.pending.' + s.registrations.sessionId + '.' + s.role;
}

export async function registrationRequest(s) {
  const body = {ticker:field('ticker').value.trim(), market:field('market').value, action:field('action').value,
    confidence:Number(field('confidence').value), source_type:'manual'};
  for (const name of ['reference_price','target_price','stop_loss']) {
    if (field(name).value) body[name] = field(name).valueAsNumber;
  }
  for (const name of ['rationale','thesis_ref','horizon']) {
    if (field(name).value.trim()) body[name] = field(name).value.trim();
  }
  if (!useCurrentTime && field('recommended_at').value) {
    body.recommended_at = beijingInputToISO(field('recommended_at').value);
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const storageKey = requestStorageKey(s);
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* A fresh request can proceed. */ }
  if (pending?.fingerprint !== fingerprint || typeof pending.requestId !== 'string') {
    pending = {fingerprint, requestId:crypto.randomUUID()};
    sessionStorage.setItem(storageKey, JSON.stringify(pending));
  }
  return {...body, sessionId:s.registrations.sessionId, requestId:pending.requestId};
}

export function registrationSaved(s, entry) {
  sessionStorage.removeItem(requestStorageKey(s));
  for (const name of ['ticker','rationale','reference_price','target_price','stop_loss','thesis_ref']) field(name).value = '';
  field('horizon').value = '';
  marketTouched = false;
  setBeijingTimeToNow();
  validateTicker();
  const score = entry.score;
  const outcome = entry.evidence?.mode === 'unavailable' ? '已登记，行情暂缺，可刷新。' :
    entry.status === 'pending' ? '已登记，待取得评分窗口。' : entry.recommendation.action === 'hold' ?
    '已登记持有建议，可查看对应历史窗口的标的收益。' :
    '5 日' + hitLabel(score?.hit) + '，' + (statuses[entry.status] ?? finalDayOf(entry.evidence) + ' 日评分') +
      ' ' + signed(score?.score, 1) + '。';
  registrationFeedback('第 ' + entry.pairNo + ' 组 · ' + entry.recommendation.ticker + ' · ' + outcome);
}

function price(value, market) {
  return fixed(value, market === 'HK' ? 3 : 2);
}

function scoreMetric(label, value, color = '') {
  return '<div><dt>' + label + '</dt><dd class="' + color + '">' + value + '</dd></div>';
}

function checkpoints(entry) {
  const {evidence = {}, score, status} = entry;
  const first = {
    day:5, date:evidence.d5Date, close:evidence.d5Close, hit:score?.hit,
    points:score?.score_5d ?? (status === 'provisional' ? score?.score : null),
    change:score?.forward_5d_pct,
  };
  const final = finalDayOf(evidence) === 20
    ? {day:20, date:evidence.d20Date, close:evidence.d20Close, points:score?.score, change:score?.forward_20d_pct}
    : {day:10, date:evidence.d10Date, close:evidence.d10Close, hit:score?.hit_10d,
      points:score?.score_10d, change:score?.forward_10d_pct};
  return [first, final];
}

function renderCheckpoint(window, action) {
  const {day, hit, points, change} = window;
  const direction = action === 'hold' ? '无方向' : hitLabel(hit);
  const heading = day === 20 ? '第 20 日（旧口径）' : '第 ' + day + ' 日';
  const metrics = (day === 20 ? '' : scoreMetric('方向命中', direction)) +
    scoreMetric(day === 5 ? '暂评' : '评分', signed(points, 1), tone(points)) +
    scoreMetric('收益', signed(change, 2, '%'), tone(change));
  return '<section class="score-window" data-window="' + day + '"><h3>' + heading + '</h3>' +
    '<dl class="score-figures">' + metrics + '</dl></section>';
}

function evidenceDetails(entry, windows) {
  const e = entry.evidence || {}, r = entry.recommendation;
  const prices = [['建议基准', e.baseDate, e.baseClose], ...windows.map(w => ['第 ' + w.day + ' 个交易日', w.date, w.close])];
  const rows = prices.map(([label,date,close]) => '<tr><th scope="row">' + label + '</th><td>' + escaped(date || '—') +
    '</td><td class="number">' + price(close, r.market) + '</td></tr>').join('');
  const details = [['参考价', price(r.reference_price, r.market)], ['目标价', price(r.target_price, r.market)],
    ['止损', price(r.stop_loss, r.market)], ['建议期限', horizons[r.horizon] || '未定'],
    ['登记信心', finite(r.confidence) ? r.confidence + '%' : '—'], ['关联研究', r.thesis_ref || '—']];
  const modeLabel = {provider:'行情接口', snapshot:'历史快照'}[e.mode];
  const source = [e.source, modeLabel, e.adjustment, e.currency].filter(Boolean).join(' · ');
  return '<div class="table-wrap"><table class="data-table"><thead><tr><th>观察点</th><th>交易日</th><th class="number">收盘价</th></tr></thead><tbody>' +
    rows + '</tbody></table></div><div class="score-evidence"><p>行情来源 ' + escaped(source || '待取得行情') + '</p>' +
    (e.snapshotId ? '<p>快照 <span class="mono">' + escaped(e.snapshotId) + '</span></p>' : '') +
    (e.disclosure ? '<p>' + escaped(e.disclosure) + '</p>' : '') + '<p>建议时间（北京时间）' + escaped(beijingTime(r.recommended_at)) + '</p><p>实际登记（北京时间）' + escaped(beijingTime(r.created_at)) + '</p>' +
    '<div class="score-fields">' + details.map(([label,value]) => '<span>' + label + ' ' + escaped(value) + '</span>').join('') + '</div>' +
    (r.rationale ? '<p>理由 ' + escaped(r.rationale) + '</p>' : '') + '</div>';
}

function scoreCard(entry, names, role) {
  const r = entry.recommendation, e = entry.evidence || {};
  const windows = checkpoints(entry);
  const [first, final] = windows;
  const modeLabel = {provider:'行情接口', snapshot:'历史快照'}[e.mode];
  const source = [e.source, modeLabel].filter(Boolean).map(label => ' · ' + escaped(label)).join('');
  const status = e.mode === 'unavailable' ? '行情暂缺' :
    (statuses[entry.status] ?? (final.day === 20 ? '旧 20 日口径' : '10 日已结算'));
  const period = final.date || first.date;
  return '<article class="registration-score" data-registration-id="' + escaped(entry.id) + '"><div class="score-heading">' +
    '<div class="score-identity"><strong>' + escaped(r.ticker) + '</strong><span>' + escaped(actions[r.action]) + '</span>' +
    '<span class="chip ' + (entry.status === 'final' ? '' : 'neutral') + '">' + escaped(status) + '</span></div>' +
    '<span class="score-identifiers">' + escaped(names[entry.role]) + ' · 第 ' + escaped(entry.pairNo) + ' 组</span></div>' +
    '<div class="score-windows">' + windows.map(window => renderCheckpoint(window, r.action)).join('') + '</div>' +
    '<p class="score-evidence">观察区间 <span class="mono">' + escaped(e.baseDate || '待取得基准日') +
    (period ? ' → ' + escaped(period) : '') + '</span>' + source + '</p>' +
    (entry.status === 'pending' && e.disclosure ? '<p class="score-evidence">' + escaped(e.disclosure) + '</p>' : '') +
    '<details class="score-metadata"><summary>核对行情与登记详情</summary>' + evidenceDetails(entry, windows) + '</details>' +
    (entry.status !== 'final' && (role === entry.role || role === 'PM') ? '<button type="button" class="btn" data-refresh-entry="' +
      escaped(entry.id) + '">刷新此条评分</button>' : '') +
    (entry.role === role ? '<button type="button" class="text-button" data-trade-ticker="' + escaped(r.ticker) +
      '" data-trade-market="' + escaped(r.market) + '">记录成交</button>' : '') + '</article>';
}

function renderEntries(s, book) {
  const entries = [...book.entries].reverse();
  const body = entries.map(entry => scoreCard(entry, s.names, s.role)).join('') ||
    '<p class="empty">' + (s.role === 'PM' ? '一组成员登记齐全后，可在这里核对本组的结果。' :
      '登记后，这里会显示你的命中结果、评分和对应交易日。') + '</p>';
  const previous = visible.get('registration-results');
  if (body !== previous) {
    const expanded = [...el('registration-results').querySelectorAll('details[open]')].map(node => node.closest('article').dataset.registrationId);
    update('registration-results', body);
    for (const card of el('registration-results').querySelectorAll('article')) {
      if (expanded.includes(card.dataset.registrationId)) card.querySelector('details').open = true;
    }
  }
  el('score-count').textContent = entries.length + ' 条建议';
}

function renderReviews(s, book) {
  const reviews = book.reviews || [];
  const panel = el('registration-review');
  panel.hidden = s.role !== 'PM' && !reviews.length;
  if (panel.hidden) return;
  const reviewed = new Set(reviews.map(review => review.pairNo));
  const entriesByGroup = new Map();
  for (const entry of book.entries) {
    if (!entriesByGroup.has(entry.pairNo)) entriesByGroup.set(entry.pairNo, []);
    entriesByGroup.get(entry.pairNo).push(entry);
  }
  const groups = book.groups ?? [...entriesByGroup].map(([pairNo, entries]) => ({
    pairNo, memberIds:['A','B'], submittedIds:entries.map(entry => entry.role), complete:entries.length === 2,
  }));
  reviewGroups = new Map(groups.map(group => [group.pairNo, {...group, entries:entriesByGroup.get(group.pairNo) || []}]));
  const eligible = [...reviewGroups.values()].filter(group =>
    group.complete && group.entries.length === group.memberIds.length && !reviewed.has(group.pairNo));
  const activeGroups = s.role === 'PM' ? groups.filter(group => !group.complete) : [];
  el('pair-status').textContent = '进行中 ' + groups.filter(group => !group.complete).length + ' 组 · 已收齐 ' +
    book.paired + ' 组' + (s.role === 'PM' ? ' · 待验收 ' + eligible.length + ' 组' : '');
  el('group-progress').hidden = activeGroups.length === 0;
  update('group-progress', activeGroups.map(group => {
    const outstanding = group.memberIds.filter(role => !group.submittedIds.includes(role));
    return '<li><strong>第 ' + escaped(group.pairNo) + ' 组</strong><span>已提交 ' + group.submittedIds.length + '/' +
      group.memberIds.length + ' · 待登记 ' + escaped(outstanding.map(role => s.names[role] ?? role).join('、')) + '</span></li>';
  }).join(''));
  const reviewForm = el('instant-review-form');
  reviewForm.hidden = s.role !== 'PM' || !eligible.length;
  if (!reviewForm.hidden) {
    const select = el('pair-number'), selected = select.value;
    update('pair-number', eligible.map(({pairNo, entries}) => {
      const labels = entries.map(({recommendation, evidence}) => {
        const date = evidence.baseDate || beijingInputValue(recommendation.recommended_at).slice(0, 10);
        return recommendation.ticker + ' ' + date;
      });
      return '<option value="' + escaped(pairNo) + '">第 ' + escaped(pairNo) + ' 组 · ' + entries.length + ' 人 · ' +
        escaped([...new Set(labels)].join(' / ')) + '</option>';
    }).join(''));
    if (eligible.some(group => group.pairNo === Number(selected))) select.value = selected;
    else if (selected) el('pair-note').value = '';
    updateReviewDecision();
  }
  update('pair-review-log', [...reviews].reverse().map(review => '<p class="review-note">第 ' + escaped(review.pairNo) + ' 组 · ' +
    (review.decision === 'accept' ? '验收通过' : '已退回') + ' · ' + escaped(review.note) + '<small>' + escaped(beijingTime(review.at)) + '</small></p>').join(''));
}

function updateReviewDecision() {
  const pairNo = Number(el('pair-number').value);
  const group = reviewGroups.get(pairNo);
  const pair = group?.entries ?? [];
  const statuses = pair.map(entry => entry.status);
  const unavailable = pair.some(entry => entry.evidence.mode === 'unavailable');
  const pending = !group?.complete || statuses.length !== group.memberIds.length || statuses.includes('pending');
  el('instant-review-form').querySelector('[value="accept"]').disabled = pending;
  const windowStatus = unavailable ? '本组有建议暂缺行情，可刷新评分或退回。' : pending ? '有建议尚未满 5 个交易日，当前可退回。' :
    statuses.includes('provisional') ? '本组包含 5 日暂评。达到最终评分窗口后，可重新核对。' :
      pair.some(entry => finalDayOf(entry.evidence) === 20) ? '本组含旧 20 日口径的评分。请按各条记录的观察窗口核对。' :
      '本组建议均已完成 10 个交易日的观察窗口。';
  el('pair-window-status').textContent = windowStatus + ' 展开本组的「核对行情与登记详情」，核对基准收盘、观察日和评分。';
}
el('pair-number').addEventListener('change', () => { el('pair-note').value = ''; updateReviewDecision(); });

export function syncDeskButtons() {
  validateTicker();
  updateReviewDecision();
}

export function renderRegistrations(s) {
  const book = s.registrations;
  const scope = book.sessionId + ':' + s.role;
  if (currentScope !== scope) {
    currentScope = scope;
    resetDesk();
    field('analyst').options[0].text = s.names[s.role];
    field('analyst').options[0].value = s.role;
    setBeijingTimeToNow();
    validateTicker();
  } else if (useCurrentTime && document.activeElement !== field('recommended_at')) {
    field('recommended_at').value = beijingInputValue();
  }
  el('registration-panel').hidden = s.role === 'PM';
  const context = el('registration-group-context');
  const groups = book.groups;
  context.hidden = !groups;
  if (groups) {
    const nextGroup = groups.find(group => !group.complete && group.memberIds.includes(s.role) && !group.submittedIds.includes(s.role));
    context.textContent = nextGroup ? '待登记 · 第 ' + nextGroup.pairNo + ' 组（已提交 ' + nextGroup.submittedIds.length + '/' +
      nextGroup.memberIds.length + '）' : '提交后进入下一组。';
  }
  renderEntries(s, book);
  renderReviews(s, book);
}

function resetDesk() {
  form.reset();
  marketTouched = false;
  useCurrentTime = true;
  el('rec-confidence-value').value = '70%';
  field('reference_price').setCustomValidity('');
  el('instant-review-form').reset();
  reviewGroups.clear();
  registrationFeedback('');
  visible.clear();
}

export function clearRegistrations() {
  currentScope = '';
  resetDesk();
}
