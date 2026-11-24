import { createTradesView } from './trades.js';
import { renderLedger } from './ledger.js';
import { createAnalystAdmin } from './analysts.js';
import { createFeishuBindings } from './feishu-bindings.js';
import {
  clearRegistrations, fillExample, registrationBusy, registrationFeedback, registrationRequest,
  registrationSaved, renderRegistrations, syncDeskButtons,
} from './registrations.js';

const el = (id) => document.getElementById(id);
const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const number = (v, digits = 2) => isNumber(v) ? v.toFixed(digits) : '—';
const signed = (v, digits = 1) => isNumber(v) ? (v > 0 ? '+' : '') + number(v, digits) : '—';
const pct = (v) => isNumber(v) ? number(v, 2) + '%' : '—';
const returns = (v) => isNumber(v) ? signed(v, 2) + '%' : '—';
const color = (v) => !isNumber(v) || v === 0 ? '' : v > 0 ? 'positive' : 'negative';
const ACT = {buy:'买入',add:'加仓',hold:'持有',trim:'减仓',sell:'卖出',pass:'观望'};
const PHASE = {idle:'待开场', collecting:'独立作答', locked:'建议已锁定', d5:'T+5 暂评', d10:'T+10 评分', d20:'T+20 评分（旧口径）', review:'待 PM 验收', complete:'验收通过', returned:'已退回'};
const STATUS = {pending:'排队中',sending:'发送中',sent:'已送达',delivered:'已送达',failed:'投递失败',uncertain:'送达待核实',unknown:'送达待核实',retry:'待重试'};
const storageKey = 'osborn.replay.roleKey.v1';
const launchParameters = new URLSearchParams(location.hash.slice(1));
const inviteKey = launchParameters.get('key');
const launchRole = launchParameters.get('role');
let key = inviteKey || sessionStorage.getItem(storageKey) || '';
if (inviteKey || launchRole) clearFragment();
let demoRoles = [];
let enteringRole = false;
let state = null;
let busy = false;
let requestId = 0;
let noticeTimer;
let serverReachable = true;
const rendered = new Map();
const tradeView = createTradesView(el('trades-view'), {api, reload});
const analystAdmin = createAnalystAdmin({api, reload, onAuthExpired:signOut, onLocalProfileCreated:addDemoRole});
const feishuBindings = createFeishuBindings({api, onAuthExpired:signOut});
let suggestedTrade = null;

function replace(id, html) {
  if (rendered.get(id) === html) return;
  if (id === 'controls') { rendered.delete('action-form'); rendered.delete('submissions'); }
  el(id).innerHTML = html;
  rendered.set(id, html);
}

function notice(message = '', error = false) {
  clearTimeout(noticeTimer);
  el('notice').innerHTML = message ? '<div class="notice-box ' + (error ? 'error' : '') + '"><span>' + escapeHTML(message) + '</span><button type="button" data-cmd="dismiss" aria-label="关闭提示">×</button></div>' : '';
  if (message && !error) noticeTimer = setTimeout(() => notice(), 4500);
}

function clearFragment() {
  history.replaceState(null, '', location.pathname + location.search);
}

function renderEntry() {
  const hasRolePicker = demoRoles.length > 0;
  el('entry-loading').hidden = true;
  el('role-picker').hidden = !hasRolePicker;
  el('role-key-entry').hidden = hasRolePicker;
  if (!hasRolePicker) return;
  replace('role-picker-cards', demoRoles.map(role => {
    const isPM = role.id === 'PM';
    const avatar = isPM || ['A','B'].includes(role.id) ? role.id : Array.from(role.display_name)[0];
    const subtitle = isPM ? '核对行情与验收评分' : '登记建议与查看账本';
    return '<button type="button" class="role-option" data-role="' + escapeHTML(role.id) + '">' +
      '<span class="avatar" aria-hidden="true">' + escapeHTML(avatar) + '</span>' +
      '<span class="role-option-content"><strong>' + escapeHTML(role.display_name) + '</strong>' +
      '<small>' + subtitle + '</small></span><span class="role-option-arrow" aria-hidden="true">→</span></button>';
  }).join(''));
  el('role-picker-cards').querySelectorAll('button').forEach(button => { button.disabled = enteringRole; });
}

function addDemoRole(profile) {
  if (!demoRoles.length || demoRoles.some(role => role.id === profile.id)) return;
  const pm = demoRoles.find(role => role.id === 'PM');
  demoRoles = [...demoRoles.filter(role => role.id !== 'PM'), profile, ...(pm ? [pm] : [])];
  if (!state) renderEntry();
}

async function loadDemoRoles() {
  try {
    const {roles} = await api('/api/demo/roles', undefined, {authenticated:false, signal:AbortSignal.timeout(6000)});
    if (Array.isArray(roles)) demoRoles = roles;
  } catch (error) {
    if (error.status === 404) demoRoles = [];
    else if (!demoRoles.length && !key) notice('暂时无法读取本机角色，可用邀请链接进入。', true);
  }
  renderEntry();
}

async function enterDemoRole(role) {
  if (enteringRole || busy || !demoRoles.length) return;
  if (!demoRoles.some(candidate => candidate.id === role)) {
    notice('当前场次没有此身份，请重新选择。', true);
    return;
  }
  if (key || state) signOut();
  notice();
  enteringRole = true;
  const picker = el('role-picker');
  const status = el('role-picker-status');
  picker.setAttribute('aria-busy', 'true');
  renderEntry();
  status.textContent = '正在进入工作台…';
  status.hidden = false;
  try {
    const result = await api('/api/demo/role', {role}, {authenticated:false, signal:AbortSignal.timeout(6000)});
    if (!result.key) throw new Error('未取得角色访问凭据。');
    key = result.key;
    serverReachable = true;
    if (!await reload() && !state) key = '';
  } catch (error) {
    if (error.status === 404) {
      demoRoles = [];
      renderEntry();
    }
    notice(error.message || '暂时无法进入演示，请重试。', true);
  } finally {
    enteringRole = false;
    picker.removeAttribute('aria-busy');
    status.hidden = true;
    renderEntry();
  }
}

function signOut(message = '') {
  key = '';
  state = null;
  clearRegistrations();
  analystAdmin.clear();
  feishuBindings.clear();
  suggestedTrade = null;
  tradeView.clear();
  requestId++;
  rendered.clear();
  sessionStorage.removeItem(storageKey);
  el('identity').replaceChildren();
  el('mast-nav').hidden = true;
  clearFragment();
  document.title = '分析师评分 · Osborn Alpha';
  el('work').hidden = true;
  el('login').hidden = false;
  el('hook-form').reset();
  el('access-key').value = '';
  renderEntry();
  if (demoRoles.length) el('role-picker-title').focus();
  notice(message, Boolean(message));
}

async function api(path, data, {authenticated = true, signal} = {}) {
  const headers = authenticated && key ? {Authorization: 'Bearer ' + key} : {};
  const options = {headers, cache: 'no-store', signal};
  if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.method = 'POST';
    options.body = JSON.stringify(data);
  }
  const response = await fetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(typeof body?.error === 'string' ? body.error : body?.message || '请求失败，请重试。');
    error.status = response.status;
    throw error;
  }
  if (!body) throw new Error('服务返回的数据无法读取。');
  return body;
}

async function reload() {
  if (!key) return false;
  const id = ++requestId;
  try {
    const next = await api('/api/state', undefined, {signal:AbortSignal.timeout(8000)});
    if (id !== requestId) return false;
    if (!next.role) throw new Error('本地服务返回的数据缺少角色。');
    if (!serverReachable) notice('已重新连接。');
    serverReachable = true;
    state = next;
    sessionStorage.setItem(storageKey, key);
    render();
    return true;
  } catch (err) {
    if (id !== requestId) return false;
    if (err.status === 401 || err.status === 403) {
      signOut(demoRoles.length ? '当前身份已失效，请重新选择。' : '角色密钥无效，请使用本场的新邀请链接。');
    }
    else if (serverReachable) {
      serverReachable = false;
      notice('暂时无法读取场次。' + (err.message || '请检查本地服务。'), true);
    }
    return false;
  }
}

function displayName(role) {
  return (state?.names?.[role] || ({A:'分析师 A', B:'分析师 B', PM:'PM'})[role]);
}

function person(role) {
  return '<span class="person"><span class="avatar ' + (role === 'B' ? 'b' : '') + '" aria-hidden="true">' + escapeHTML(role) + '</span>' + escapeHTML(displayName(role)) + '</span>';
}

function button(cmd, label, cls = '') {
  return '<button type="button" class="btn ' + cls + '" data-cmd="' + cmd + '">' + label + '</button>';
}

function renderProgress(s) {
  const groups = [['开场',['idle']],['提交建议',['collecting','locked']],['5 日暂评',['d5']],
    [s.finalDay + ' 日评分',['d' + s.finalDay]],['验收',['review','complete','returned']]];
  const current = groups.findIndex(([, phases]) => phases.includes(s.phase));
  return '<div class="steps" aria-label="当前场次进度">' + groups.map(([label], index) => (index ? '<i aria-hidden="true"></i>' : '') + '<span class="step ' + (index === current ? 'active' : index < current ? 'done' : '') + '"' + (index === current ? ' aria-current="step"' : '') + '><b>' + (index + 1) + '</b>' + label + '</span>').join('') + '</div>';
}

let chartData = [];
function chart(bars) {
  if (!bars.length) return '<div class="chart-empty">开场后显示本轮可见的收盘行情。</div>';
  const narrow = matchMedia('(max-width: 550px), (min-width: 701px) and (max-width: 860px)').matches;
  const width = narrow ? 440 : 720, height = 215;
  const left = 51, right = 15, top = 12, bottom = 35;
  const closes = bars.map((b) => b.close);
  const low = Math.min(...closes), high = Math.max(...closes);
  const pad = Math.max((high-low) * .09, high * .0008, .01);
  const min = low - pad, max = high + pad;
  const areaWidth = width - left - right, areaHeight = height - top - bottom;
  const points = bars.map((bar, idx) => ({
    x: left + (bars.length === 1 ? .5 : idx / (bars.length - 1)) * areaWidth,
    y: top + ((max - bar.close) / (max - min)) * areaHeight,
    date: bar.date, close: bar.close,
  }));
  chartData = points;
  const grid = Array.from({length:4}, (_,idx) => {
    const frac = idx / 3, y = top + frac * areaHeight;
    return '<line class="grid" x1="' + left + '" x2="' + (width-right) + '" y1="' + y + '" y2="' + y + '"/><text text-anchor="end" x="' + (left-7) + '" y="' + (y+4) + '">' + number(max - (max-min) * frac, 1) + '</text>';
  }).join('');
  const axis = [...new Set([0, Math.floor((bars.length-1)/2), bars.length-1])].map((idx) => {
    const anchor = idx === 0 ? 'start' : idx === bars.length-1 ? 'end' : 'middle';
    return '<text text-anchor="' + anchor + '" x="' + points[idx].x + '" y="204">' + escapeHTML(String(bars[idx].date).slice(5)) + '</text>';
  }).join('');
  const path = points.map((p,i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' ');
  const end = points.at(-1);
  return '<div class="chart-shell" id="chart-shell" tabindex="0" role="group" aria-label="收盘价走势，左右方向键查看各交易日"><svg id="price-chart" role="img" aria-label="可见交易日收盘价曲线" viewBox="0 0 ' + width + ' ' + height + '" class="chart"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".21"/><stop offset="100%" stop-color="var(--accent)" stop-opacity=".02"/></linearGradient></defs>' + grid + '<path fill="url(#shade)" d="' + path + ' L' + end.x + ' ' + (height-bottom) + ' L' + points[0].x + ' ' + (height-bottom) + ' Z"/><path class="line" d="' + path + '"/>' + axis + '<line class="focus-line" id="chart-cursor" x1="' + end.x + '" x2="' + end.x + '" y1="12" y2="180"/><circle id="chart-dot" cx="' + end.x + '" cy="' + end.y + '" r="4" fill="var(--accent)" stroke="var(--bg-elevated)" stroke-width="1.5"/></svg></div>';
}

function marketPanel(s) {
  const m = s.market || {};
  const bars = (m.bars || []).filter((b) => isNumber(b.close));
  const last = bars.at(-1), previous = bars.at(-2);
  const move = previous ? (last.close / previous.close - 1) * 100 : null;
  const change = move === null ? '' : '<span class="day-change ' + color(move) + '" title="较上一交易日收盘">' + returns(move) + '</span>';
  return '<div class="panel-pad"><div class="panel-head"><div class="sec-label"><h2 class="symbol-name">' + escapeHTML(m.name || '历史行情') + '</h2>' + (m.ticker ? '<span class="ticker mono">' + escapeHTML(m.ticker) + '</span>' : '') + '</div><span class="date-tag">日线 · 收盘价</span></div><div class="price-line"><span class="price">' + number(last?.close) + '</span><span class="currency">' + escapeHTML(m.currency || '') + '</span>' + change + '<span class="date-tag asof">截至 <span class="mono">' + escapeHTML(m.asOf || '待开场') + '</span></span></div></div>' + chart(bars) + '<div class="chart-caption"><span>' + escapeHTML([m.source, m.adjustment].filter(Boolean).join(' · ') || '历史快照') + '</span><span class="chart-readout mono" id="chart-readout">' + (last ? escapeHTML(last.date) + ' · ' + number(last.close) : '') + '</span></div>' + (m.snapshotId ? '<details class="disclose-source"><summary>行情快照编号</summary><span class="snapshot mono">' + escapeHTML(m.snapshotId) + '</span></details>' : '');
}

function submissionList(s) {
  const list = s.submissions || [];
  if (!list.length || s.phase === 'idle') return '';
  return '<div class="submissions">' + list.map((sub) => {
    const detail = sub.action && ACT[sub.action] ? ACT[sub.action] + (isNumber(sub.confidence) ? ' · 信心 ' + sub.confidence + '%' : '') : sub.submitted ? '已提交' : '待提交';
    return '<div class="submission"><div class="submission-top">' + person(sub.role) + '<span class="chip ' + (sub.submitted ? '' : 'neutral') + '">' + escapeHTML(detail) + '</span></div>' + (sub.rationale ? '<p>' + escapeHTML(sub.rationale) + '</p>' : '') + '</div>';
  }).join('') + '</div>';
}

function pmControls(s) {
  if (s.phase === 'review') return '<form id="review-form"><label for="review-note">验收说明</label><textarea id="review-note" rows="2" maxlength="500" required placeholder="记录抽查的价格、评分和核对结论"></textarea><div class="buttons"><button class="btn primary" name="decision" value="accept">验收通过</button><button class="btn negative" name="decision" value="return">退回</button></div></form>';
  if (s.phase === 'complete' || s.phase === 'returned') return '<div class="review-note">' + escapeHTML(s.review?.note || PHASE[s.phase]) + (s.review?.at ? '<small>' + escapeHTML(showTime(s.review.at)) + '</small>' : '') + '</div><div class="buttons">' + button('newSession','新建场次') + '</div>';
  if (s.phase === 'collecting') return '<p class="help">两位分析师提交后，系统将同时公布判断并锁定本轮。</p>';
  const info = {
    idle:['开场后，两位分析师可阅读同一份历史行情并独立作答。','开始演练','start'],
    locked:['建议已锁定。揭晓第 5 个交易日后，系统将计算方向命中和暂评分。','揭晓 T+5','advance'],
    d5:['5 日命中和暂评分已确定。推进到第 ' + s.finalDay + ' 个交易日，核对本轮评分。','揭晓 T+' + s.finalDay,'advance'],
    ['d' + s.finalDay]:s.round < s.totalRounds ? ['本轮评分已记录。下一轮将开放新的作答截点。','开启下一轮','advance'] : ['两轮已结算。可查看个人账本，或在下方逐条核对评分。','进入验收','advance'],
  }[s.phase];
  return info ? '<p class="help">' + info[0] + '</p><div class="buttons">' + button(info[2],info[1],'primary') + '</div>' : '';
}

function analystControls(s) {
  if (!s.submissions?.some(item => item.role === s.role)) return '<p class="help">本页展示双人回放。请到「分析师评分」登记建议。</p>';
  const own = s.submissions?.find((item) => item.role === s.role);
  if (s.phase === 'collecting' && !own?.submitted) {
    const opts = Object.entries(ACT).map(([id, name]) => '<option value="' + id + '">' + name + '</option>').join('');
    const context = '<p class="form-context"><span class="mono">' + escapeHTML(s.market.ticker) + '</span> · 建议日 <span class="mono">' + escapeHTML(s.market.asOf) + '</span></p>';
    return '<form id="suggestion-form">' + context + '<div class="fields"><div><label for="direction">建议动作</label><select id="direction">' +
      opts + '</select></div><div><label for="confidence">信心 <output id="confidence-value" for="confidence">70%</output></label>' +
      '<input id="confidence" type="range" min="0" max="100" step="1" value="70"></div></div><label for="rationale">判断理由</label>' +
      '<textarea id="rationale" required maxlength="500" rows="2" placeholder="依据截至该日的行情，写下判断理由"></textarea>' +
      '<div class="buttons"><button class="btn primary" type="submit">提交本轮建议</button></div></form>';
  }
  const info = {idle:'等待 PM 开场。',collecting:'你的建议已提交，等待另一位分析师。',locked:'双方已提交，等待 PM 揭晓第 5 个交易日。',d5:'已按第 5 个交易日收盘价计算命中与暂评分。',['d' + s.finalDay]:'已按第 ' + s.finalDay + ' 个交易日收盘价更新本轮评分。',review:'两轮成绩已提交 PM 验收。',complete:'PM 已通过本场验收。',returned:'PM 已退回本场结果。'};
  return '<p class="help">' + (info[s.phase] || '') + '</p>' + (s.review?.note ? '<div class="review-note">' + escapeHTML(s.review.note) + '</div>' : '');
}

function renderOperation(s) {
  // Preserve active text, selection and focus when just the other analyst's receipt changes.
  const top = '<div class="block-head"><h2>' + (s.role === 'PM' ? 'PM 场次控制' : '登记建议') + '</h2><span class="caption">第 ' + escapeHTML(s.round) + ' 轮</span></div>';
  replace('controls',top + '<div id="action-form"></div><div id="submissions"></div>');
  replace('action-form',s.role === 'PM' ? pmControls(s) : analystControls(s));
  replace('submissions',submissionList(s));
}

function metric(label, value, detail = '', tone = '') {
  return '<div class="profile-metric"><span class="metric-label">' + label + '</span><strong class="' + tone + '">' +
    escapeHTML(value) + '</strong>' + (detail ? '<small>' + escapeHTML(detail) + '</small>' : '') + '</div>';
}

function analystProfiles(s) {
  return s.analysts ?? ['A','B'].map(id => ({id, kind:'human', display_name:displayName(id)}));
}

function canViewReplay(s) {
  return s.replayParticipant ?? ['A','B','PM'].includes(s.role);
}

function profiles(s, replay = false) {
  const books = replay ? s.books : s.registrations.books;
  const people = analystProfiles(s).filter(({id}) => !replay || id === 'A' || id === 'B');
  return people.map(profile => {
    const role = profile.id;
    const avatar = ['A','B'].includes(role) ? role : Array.from(profile.display_name)[0];
    const summary = books[role]?.summary ?? {};
    const sample = 'n=' + (summary.scorable ?? 0);
    const legacy = summary.legacy_n_score ? '另有旧 20 日评分 ' + summary.legacy_n_score + ' 条' : replay && s.finalDay === 20 ? '20 日旧口径' : '';
    return '<a href="#' + (replay ? 'replay-ledger-' : 'ledger-') + encodeURIComponent(role) + '" class="profile-card" aria-label="查看' + escapeHTML(profile.display_name) + '的账本">' +
      '<div class="profile-top"><span class="person"><span class="avatar ' + (role === 'B' ? 'b' : '') + '" aria-hidden="true">' + escapeHTML(avatar) +
      '</span><span class="profile-name">' + escapeHTML(profile.display_name) + '</span></span><span class="human-tag">' + (profile.kind === 'agent' ? 'Agent' : '真人') + '</span></div>' +
      '<div class="profile-metrics">' + metric('建议', summary.recommendations ?? 0) + metric('5 日命中率', pct(summary.hit_rate), sample) +
      metric('平均评分', signed(summary.avg_score, 2), legacy, color(summary.avg_score)) + metric('模拟持仓', summary.open_positions ?? 0) +
      '</div><span class="profile-link">查看账本 <span aria-hidden="true">→</span></span></a>';
  }).join('');
}

function priceCell(value, date) {
  return '<td class="number">' + number(value) + (date ? '<small>' + escapeHTML(date) + '</small>' : '') + '</td>';
}

function showTime(at) {
  const d = new Date(at);
  return Number.isNaN(d.valueOf()) ? '' : d.toLocaleString('zh-CN',{hour12:false});
}

function registeredEvidence(row) {
  const title = escapeHTML(ACT[row.action] || row.action);
  if (!row.rationale) return title;
  return '<details class="trade-detail"><summary>' + title + '</summary><div><p>' +
    escapeHTML(row.rationale) + '</p><small>信心 ' + escapeHTML(row.confidence) +
    '% · ' + escapeHTML(showTime(row.submittedAt)) + '</small></div></details>';
}

function evidence(s) {
  const history = s.history || [];
  const finalDay = s.finalDay;
  const legacy = finalDay === 20;
  const desc = '<p class="method">' + (legacy ? '本场沿用登记时的 20 日结算口径。' : '展示 T+5 和 T+10 的方向命中与评分。') +
    '总览命中率取 T+5，平均评分采用已有的 T+' + finalDay + ' 评分或 T+5 暂评。持有建议仅记录收益。</p>';
  if (!history.length) return '<p class="empty">等待揭晓首轮第 5 个交易日。</p>' + desc;
  return '<div class="table-wrap"><table class="data-table audit"><thead><tr><th>轮次 / 成员</th><th>动作 / 登记详情</th>' +
    '<th class="number">基准收盘</th><th class="number">T+5 收盘</th><th class="number">5 日收益</th><th>5 日命中</th><th class="number">5 日评分</th>' +
    '<th class="number">T+' + finalDay + ' 收盘</th><th class="number">' + finalDay + ' 日收益</th>' +
    (legacy ? '' : '<th>10 日命中</th>') + '<th class="number">' + finalDay + ' 日评分</th></tr></thead><tbody>' +
    history.map(r => '<tr><td>第 ' + escapeHTML(r.round) + ' 轮 · ' + escapeHTML(displayName(r.role)) + '</td><td>' +
      registeredEvidence(r) + '</td>' + priceCell(r.baseClose,r.baseDate) + priceCell(r.d5Close,r.d5Date) +
      '<td class="number">' + returns(r.return5) + '</td>' + replayHitCell(r.hit) + replayScoreCell(r.score5) +
      priceCell(r['d' + finalDay + 'Close'], r['d' + finalDay + 'Date']) + '<td class="number">' + returns(r['return' + finalDay]) + '</td>' +
      (legacy ? '' : replayHitCell(r.hit10)) +
      replayScoreCell(legacy ? r.d20Date && r.score : r.score10) + '</tr>').join('') + '</tbody></table></div>' + desc;
}

function replayHitCell(hit) {
  return '<td>' + (hit === true ? '命中' : hit === false ? '未命中' : '—') + '</td>';
}

function replayScoreCell(score) {
  return '<td class="number ' + color(score) + '">' + signed(score) + '</td>';
}

function broadcast(s) {
  const entries = s.notifications || [];
  if (!entries.length) return '<p class="empty">建议登记或回放开场后，可在这里核对群播报与投递状态。</p>';
  return entries.map((e) => {
    const failed = ['failed','uncertain','unknown'].includes(e.status);
    const receipt = e.receiptId ? '事件 ' + e.receiptId : e.id;
    const details = [
      receipt, channelLabel(e.mode),
      showTime(e.sentAt || e.createdAt), e.attempts ? e.attempts + ' 次投递' : '',
    ].filter(Boolean).join(' · ');
    const statusClass = failed ? 'error' : (['sent','delivered'].includes(e.status) ? '' : 'warn');
    const retry = failed && s.role === 'PM'
      ? '<button type="button" class="btn" data-retry="' + escapeHTML(e.id) +
        '" data-status="' + escapeHTML(e.status) + '">重试</button>' : '';
    return '<article class="log-row"><span class="log-dot" aria-hidden="true"></span>' +
      '<div class="log-copy"><strong>' + escapeHTML(e.title) + '</strong><p>' +
      escapeHTML(e.text) + '</p>' +
      (e.error ? '<p class="log-error">' + escapeHTML(e.error) + '</p>' : '') +
      '<div class="log-meta">' + escapeHTML(details) + '</div></div>' +
      '<div class="log-status"><span class="chip ' + statusClass + '">' +
      escapeHTML(STATUS[e.status] || e.status || '待发送') + '</span>' + retry + '</div></article>';
  }).join('');
}

function channelLabel(mode) {
  if (mode === 'app') return '已配对飞书群 · 应用机器人';
  if (mode === 'feishu') return '飞书群机器人';
  return '本地接收端';
}

function updateChannel(s) {
  const mode = s.deliveryMode;
  el('channel').textContent = channelLabel(mode);
  if (s.role !== 'PM') return;
  const appButton = el('paired-group-channel');
  const available = s.webhook?.appAvailable === true;
  const localPM = demoRoles.length > 0;
  appButton.disabled = busy || !localPM || !available || mode === 'app';
  let description = '在本机「飞书群配对」设定目标群后可启用。';
  if (mode === 'app') description = '评分与验收播报通过应用机器人投递，可在上方核对每条回执。';
  else if (!localPM) description = '请从本机 PM 入口切换到已配对的群。';
  else if (available) description = '群已配对。切换后，新的评分与验收消息将发往该群。';
  el('paired-group-status').textContent = description;
  el('hook-status').textContent = '当前播报渠道为' + channelLabel(mode) +
    (mode === 'feishu' && s.webhook?.signed ? '，Webhook 签名已配置。' : '。');
}

function renderView() {
  if (!state) return;
  const hash = location.hash.slice(1);
  const ledger = /^(replay-)?ledger-([A-Za-z0-9-]+)$/.exec(hash);
  const replayEnabled = canViewReplay(state);
  const replay = Boolean(ledger?.[1]);
  const profile = ledger && (!replay || (replayEnabled && ['A','B'].includes(ledger[2])))
    ? analystProfiles(state).find(candidate => candidate.id === ledger[2]) : null;
  const section = profile && replay ? 'replay'
    : ['activity','trades'].includes(hash) || (hash === 'replay' && replayEnabled) ? hash : 'overview';
  const view = profile ? 'ledger' : section;
  for (const name of ['overview', 'ledger', 'activity', 'replay', 'trades']) el(name + '-view').hidden = name !== view;
  feishuBindings.show(state.role === 'PM' && demoRoles.length > 0, view === 'activity');
  for (const link of el('mast-nav').querySelectorAll('a')) {
    link.hidden = link.dataset.nav === 'replay' && !replayEnabled;
    const active = link.dataset.nav === section;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const title = profile ? profile.display_name + '的账本' : {activity:'群播报',trades:'交易记录',replay:'双人回放',overview:'分析师评分'}[section];
  document.title = title + ' · Osborn Alpha';
  if (profile) {
    el('ledger-view').querySelector('.back-link').href = '#' + section;
    replace('ledger-head', '<div class="hero"><div><h1>' + escapeHTML(profile.display_name) +
      ' <span class="human-tag">' + (profile.kind === 'agent' ? 'Agent' : '真人') + '</span></h1><p class="sub">' +
      (replay ? '双人回放' : '登记建议') + ' · 模拟账本与建议时间线</p>' +
      (profile.note ? '<p class="sub">' + escapeHTML(profile.note) + '</p>' : '') + '</div></div>');
    replace('ledger-content', renderLedger(replay ? state : state.registrations, profile.id));
  }
}

let openSettingsOnArrival = false;
function focusSettings() {
  el('hook-panel').open = true;
  el('hook-panel').scrollIntoView({block:'center'});
  const group = el('paired-group-channel');
  (group.disabled ? el('hook-url') : group).focus({preventScroll:true});
}

window.addEventListener('hashchange', () => {
  const role = new URLSearchParams(location.hash.slice(1)).get('role');
  if (role) {
    clearFragment();
    void enterDemoRole(role);
    return;
  }
  renderView();
  if (suggestedTrade && location.hash === '#trades') tradeView.prefill(suggestedTrade.ticker, suggestedTrade.market);
  else if (openSettingsOnArrival && location.hash === '#activity') focusSettings();
  else window.scrollTo(0, 0);
  openSettingsOnArrival = false;
  suggestedTrade = null;
});

function render() {
  const s = state;
  el('login').hidden = true;
  el('work').hidden = false;
  el('mast-nav').hidden = false;
  el('access-key').value = '';
  const localPicker = demoRoles.length > 0;
  if (localPicker && Array.isArray(s.analysts)) {
    const pm = demoRoles.find(role => role.id === 'PM');
    demoRoles = pm ? [...s.analysts, pm] : s.analysts;
  }
  const hookShortcut = s.role === 'PM'
    ? '<button type="button" class="logout" aria-controls="hook-panel" data-cmd="settings">机器人设置</button>'
    : '';
  const exit = localPicker ? '<button type="button" class="logout" data-cmd="switch-role">切换身份</button>'
    : '<button type="button" class="logout" data-cmd="logout">退出</button>';
  replace('identity','<span class="identity-label">' + escapeHTML(displayName(s.role)) +
    '</span>' + hookShortcut + exit);
  const ownEntry = s.submissions.find(item => item.role === s.role);
  const jumpLabel = s.role === 'PM' ? '场次控制' : (s.phase === 'collecting' && ownEntry && !ownEntry.submitted ? '登记建议' : '');
  const jump = jumpLabel ? button('operation', jumpLabel + ' ↓', 'jump-action') : '';
  const registrationJump = s.role === 'PM' ? '核对评分' : '登记建议';
  replace('heading','<div class="hero"><div><h1>分析师评分</h1><p class="sub">分析师建议的模拟账本与前向评分。登记建议后，按真实历史行情核对成交和收益。</p></div>' +
    '<div class="buttons">' + button('registration',registrationJump + ' ↓','jump-action') + button('refresh-scores','刷新评分','refresh') + '</div></div>');
  el('analyst-count').textContent = '· ' + analystProfiles(s).length;
  replace('registration-profiles', profiles(s));
  analystAdmin.show(s.role, localPicker);
  renderRegistrations(s);
  tradeView.render(s);
  replace('replay-heading','<div class="hero"><div><h1>双人回放</h1><p class="sub">两位分析师在同一决策日独立提交，PM 逐轮揭晓行情并验收。</p></div>' +
    '<div class="buttons">' + jump + button('refresh','刷新结果','refresh') + '</div></div>');
  replace('results',profiles(s,true));
  replace('round-header','<div class="replay-heading"><h2>历史行情回放</h2><span class="round-label">第 ' + escapeHTML(s.round) + ' / ' +
    escapeHTML(s.totalRounds) + ' 轮</span></div><span class="phase-chip ' + (s.phase==='returned'?'returned':s.phase==='idle'?'idle':'') +
    '">' + escapeHTML(PHASE[s.phase] || s.phase) + '</span>');
  replace('session-progress',renderProgress(s));
  replace('market',marketPanel(s));
  renderOperation(s);
  replace('history',evidence(s));
  replace('messages',broadcast(s));
  el('hook-panel').hidden = s.role !== 'PM';
  el('activity-session').textContent = '登记 ' + s.registrations.sessionId + ' · 回放 ' + s.sessionId;
  updateChannel(s);
  renderView();
}

function setBusy(value) {
  busy = value;
  if (value) {
    for (const b of document.querySelectorAll('button:not(:disabled):not([data-cmd="dismiss"])')) {
      b.dataset.busy = 'true';
      b.disabled = true;
    }
  } else {
    for (const b of document.querySelectorAll('button[data-busy]')) {
      delete b.dataset.busy;
      b.disabled = false;
    }
    syncDeskButtons();
    if (state) updateChannel(state);
  }
}

async function post(path, body, ok) {
  if (busy) return false;
  setBusy(true);
  try {
    await api(path,body);
    await reload();
    notice(ok);
    return true;
  } catch (err) {
    if (err.status === 401) signOut('会话失效，请重新进入。');
    else {
      await reload();
      notice(err.message || '操作未完成，请重试。',true);
    }
    return false;
  } finally {setBusy(false);}
}

async function refreshScores(button) {
  if (busy) return;
  setBusy(true);
  let authError;
  try {
    if (!await reload()) return;
    const {registrations, role} = state;
    const remaining = registrations.entries.filter(entry => entry.status !== 'final' && (role === 'PM' || entry.role === role));
    if (!remaining.length) {
      notice('已同步当前评分，没有待更新的建议。');
      return;
    }
    const total = remaining.length;
    const counts = {final:0, provisional:0, pending:0, unavailable:0, failed:0};
    let completed = 0, firstError = '';
    const next = async () => {
      while (remaining.length && !authError) {
        const {id} = remaining.shift();
        try {
          const {entry} = await api('/api/registrations/refresh', {id,sessionId:registrations.sessionId});
          const kind = entry.evidence?.mode === 'unavailable' ? 'unavailable' : entry.status;
          counts[kind]++;
        } catch (err) {
          counts.failed++;
          if (err.status === 401) authError = err;
          if (!firstError) firstError = err.message;
        }
        completed++;
        button.textContent = '刷新中 ' + completed + '/' + total;
      }
    };
    button.textContent = '刷新中 0/' + total;
    await Promise.all(Array.from({length:Math.min(3,total)}, next));
    if (authError) return signOut('会话失效，请重新进入。');
    if (!await reload()) return;
    const labels = {final:'已结算', provisional:'暂评', pending:'观察期未满', unavailable:'行情暂缺', failed:'刷新失败'};
    const report = Object.entries(counts).filter(([,n]) => n).map(([k,n]) => labels[k] + ' ' + n + ' 条').join('，');
    notice('已核对 ' + total + ' 条建议。' + report + '。' + (firstError || ''), Boolean(counts.failed));
  } finally {
    button.textContent = '刷新评分';
    setBusy(false);
  }
}

function act(kind, data = {}, ok = '已更新场次。') {
  if (!state) return Promise.resolve(false);
  return post('/api/action',{kind,sessionId:state.sessionId,round:state.round,phase:state.phase,...data},ok);
}

document.addEventListener('input', event => {
  if (event.target.id === 'confidence') el('confidence-value').value = event.target.value + '%';
});

document.addEventListener('submit',async (event) => {
  const form = event.target;
  event.preventDefault();
  if (form.id === 'login-form') {
    let candidate = el('access-key').value.trim();
    try { const parsed = new URL(candidate); candidate = new URLSearchParams(parsed.hash.slice(1)).get('key') || candidate; } catch { /* A role key is accepted directly. */ }
    key = candidate;
    serverReachable = true;
    await reload();
  } else if (form.id === 'registration-form') {
    if (busy || !state || state.role === 'PM') return;
    const current = state;
    setBusy(true);
    registrationBusy(true);
    registrationFeedback('正在读取行情并计算评分…');
    try {
      const payload = await registrationRequest(current);
      const {entry} = await api('/api/registrations',payload);
      registrationSaved(current, entry);
      await reload();
    } catch (err) {
      if (err.status === 401) signOut('会话失效，请重新进入。');
      else registrationFeedback(err.message || '未能确认登记结果，请重试。', true);
    } finally {
      setBusy(false);
      registrationBusy(false);
    }
  } else if (form.id === 'instant-review-form') {
    const pairNo = Number(form.elements.pairNo.value), note = form.elements.note.value.trim();
    const decision = event.submitter?.value;
    if (!note) { form.elements.note.focus(); return notice('请填写验收说明。',true); }
    if (!['accept','return'].includes(decision)) return;
    const {groups, entries} = state.registrations;
    const byRole = new Map(entries.filter(entry => entry.pairNo === pairNo).map(entry => [entry.role, entry]));
    const memberIds = groups?.find(group => group.pairNo === pairNo)?.memberIds ?? [...byRole.keys()].sort();
    const evidenceIds = memberIds.map(role => byRole.get(role)?.evidence.snapshotId);
    if (!evidenceIds.length || evidenceIds.some(id => !id)) return notice('请等待本组成员登记齐全。', true);
    if (await post('/api/registrations/review',{pairNo,decision,note,evidenceIds,sessionId:state.registrations.sessionId},'已记录本组验收结论。')) {
      form.elements.note.value = '';
    }
  } else if (form.id === 'suggestion-form') {
    const rationale = el('rationale').value.trim();
    if (!rationale) {el('rationale').focus(); return notice('请填写判断理由。',true);}
    await act('submit',{action:el('direction').value,rationale,confidence:Number(el('confidence').value)},'本轮建议已提交。');
  } else if (form.id === 'review-form') {
    const note = el('review-note').value.trim();
    if (!note) {el('review-note').focus(); return notice('请填写验收说明。',true);}
    const decision = event.submitter?.value;
    if (decision === 'accept' || decision === 'return') await act(decision,{note},decision === 'accept' ? '本场验收通过。' : '已记录退回原因。');
  } else if (form.id === 'hook-form') {
    const url = el('hook-url').value.trim(), secret = el('hook-secret').value.trim();
    if (!url) {el('hook-url').focus(); return notice('请填写飞书机器人的 Webhook 地址。',true);}
    if (await post('/api/webhook',{url,secret},'飞书配置已保存。可发送测试消息核对连通性。')) form.reset();
  }
});

document.addEventListener('click',async (event) => {
  const b = event.target.closest('button');
  if (!b) return;
  if (b.dataset.role && b.closest('#role-picker')) return enterDemoRole(b.dataset.role);
  if (b.dataset.tradeTicker && state && state.role !== 'PM') {
    suggestedTrade = {ticker:b.dataset.tradeTicker, market:b.dataset.tradeMarket};
    location.hash = 'trades';
    return;
  }
  if (b.dataset.refreshEntry) return post('/api/registrations/refresh', {id:b.dataset.refreshEntry,sessionId:state.registrations.sessionId}, '已按最新完成的交易日核对评分。');
  if (b.dataset.retry) {
    const uncertain = ['uncertain','unknown'].includes(b.dataset.status);
    if (uncertain && !window.confirm('上次送达情况待核实。已按事件号检查群记录，并确认重发？')) return;
    return post('/api/webhook/retry',{id:b.dataset.retry},'已提交重试请求。');
  }
  switch (b.dataset.cmd) {
    case 'dismiss': return notice();
    case 'switch-role':
      signOut();
      return loadDemoRoles();
    case 'logout': return signOut();
    case 'example':
      fillExample();
      return;
    case 'registration': {
      const panel = state.role === 'PM' ? el('registration-results') : el('registration-panel');
      panel.scrollIntoView({block:'start'});
      if (state.role !== 'PM') el('registration-form').elements.ticker.focus({preventScroll:true});
      return;
    }
    case 'operation': {
      const panel = document.querySelector('.operation');
      panel.scrollIntoView({block:'start'});
      const control = panel.querySelector('select, textarea, button');
      (control || panel).focus({preventScroll:true});
      return;
    }
    case 'refresh-scores': return refreshScores(b);
    case 'refresh':
      if (await reload()) notice('已同步本场最新结果。');
      return;
    case 'settings':
      if (location.hash === '#activity') focusSettings();
      else { openSettingsOnArrival = true; location.hash = 'activity'; }
      return;
    case 'test-hook': return post('/api/webhook/test',{},'测试消息已提交，请核对投递状态。');
    case 'app-channel': return post('/api/webhook',{mode:'app'},'已切换至已配对的飞书群。');
    case 'local-hook': if (await post('/api/webhook',{url:'',secret:''},'已切换为本地接收。')) el('hook-form').reset(); return;
    case 'newSession':
      if (window.confirm('确认新建演练场次并切换到新场次？')) await act('newSession',{},'新场次已准备好。');
      return;
    case 'start': return act('start',{},'本场演练已开始。');
    case 'advance': return act('advance');
  }
});

let chartIndex = -1;
function moveChart(idx) {
  const p = chartData[idx];
  if (!p || !el('chart-dot')) return;
  chartIndex = idx;
  el('chart-dot').setAttribute('cx',p.x);
  el('chart-dot').setAttribute('cy',p.y);
  el('chart-cursor').setAttribute('x1',p.x);
  el('chart-cursor').setAttribute('x2',p.x);
  el('chart-readout').textContent = p.date + ' · ' + number(p.close);
}
el('market').addEventListener('pointermove',(event) => {
  const svg = event.target.closest('#price-chart');
  if (!svg || !chartData.length) return;
  const rect = svg.getBoundingClientRect();
  const cursor = new DOMPoint(event.clientX,event.clientY);
  const matrix = svg.getScreenCTM();
  if (!matrix || !rect.width) return;
  const x = cursor.matrixTransform(matrix.inverse()).x;
  let nearest = 0;
  chartData.forEach((p,i) => {if (Math.abs(p.x-x) < Math.abs(chartData[nearest].x-x)) nearest=i;});
  moveChart(nearest);
});
el('market').addEventListener('pointerleave',() => moveChart(chartData.length-1));
el('market').addEventListener('keydown',(event) => {
  if (event.target.id !== 'chart-shell' || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const current = chartIndex < 0 || chartIndex >= chartData.length ? chartData.length-1 : chartIndex;
  const idx = event.key === 'Home' ? 0 : event.key === 'End' ? chartData.length-1 : current + (event.key === 'ArrowLeft' ? -1 : 1);
  moveChart(Math.max(0,Math.min(chartData.length-1,idx)));
});

await loadDemoRoles();
if (!inviteKey && launchRole && demoRoles.length) await enterDemoRole(launchRole);
else await reload();
setInterval(() => {if (!busy && !enteringRole && key) void reload();}, 1800);
