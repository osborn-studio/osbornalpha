import { beijingInputValue, beijingInputToISO } from './beijing-time.mjs';

const markets = { A: 'A股', HK: '港股', US: '美股' };
const directions = { buy: '买入', sell: '卖出' };
const number = new Intl.NumberFormat('zh-CN', {maximumFractionDigits:8});
const money = new Intl.NumberFormat('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:4});
const escaped = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[c]);
const pnlClass = value => value > 0 ? 'positive' : value < 0 ? 'negative' : '';
const pnl = value => (value > 0 ? '+' : '') + money.format(value);
const beijingTime = iso => iso ? beijingInputValue(new Date(iso)).replace('T', ' ') : '—';
const numeric = (value, tone = '') => '<td class="number ' + tone + '">' + value + '</td>';

const entryForm = `
  <section id="trade-entry" class="panel">
    <div class="trade-panel-head"><h2>成交录入</h2></div>
    <form id="trade-form" autocomplete="off">
      <fieldset class="trade-fields">
        <legend class="trade-sr">成交信息</legend>
        <div class="trade-form-grid">
          <label class="trade-field trade-direction">方向
            <select name="direction"><option value="buy">买入成交</option><option value="sell">卖出成交</option></select>
          </label>
          <label class="trade-field trade-ticker">标的
            <input name="ticker" placeholder="600519.SH / 00700.HK / AAPL" spellcheck="false" autocapitalize="characters" maxlength="20" required>
          </label>
          <label class="trade-field">市场
            <select name="market"><option value="">按标的识别</option><option value="A">A股</option><option value="HK">港股</option><option value="US">美股</option></select>
          </label>
          <label class="trade-field">成交价格
            <input name="price" type="number" inputmode="decimal" min="0" step="any" required>
          </label>
          <label class="trade-field">成交数量（股）
            <input name="quantity" type="number" inputmode="decimal" min="0" step="any" required>
          </label>
          <label class="trade-field">费用
            <input name="fee" type="number" inputmode="decimal" min="0" step="any" placeholder="0">
          </label>
          <label class="trade-field trade-time">成交时间（北京时间，留空取现在）
            <input name="executed_at" type="datetime-local">
          </label>
        </div>
        <div class="trade-submit"><button class="btn primary" type="submit">确认成交</button></div>
      </fieldset>
      <p id="trade-feedback" class="trade-feedback" role="status" aria-live="polite"></p>
    </form>
  </section>`;

function layout(isPM) {
  const selector = isPM ? '<label class="trade-account-filter">查看账户<select id="trade-account"></select></label>' : '';
  return '<div class="hero"><div><h1>交易记录</h1><p class="sub">' +
    (isPM ? '按账户核对分析师登记的成交、持仓成本与已实现盈亏。' : '按券商成交回报录入。确认成交仅更新本地账本。') +
    '</p></div>' + selector + '</div>' + (isPM ? '' : entryForm) +
    '<section class="panel trade-overview"><div class="trade-panel-head"><h2>持仓概览</h2></div>' +
    '<div id="trade-summary" class="trade-metrics"></div></section>' +
    '<section class="panel trade-section"><div class="trade-panel-head"><h2>持仓明细 <span id="trade-position-count"></span></h2></div>' +
    '<div id="trade-positions"></div></section>' +
    '<section class="panel trade-section"><div class="trade-panel-head"><h2>成交流水 <span id="trade-history-count"></span></h2>' +
    '<span class="caption">北京时间</span></div><div id="trade-history"></div></section>';
}

function summary(positions, trades) {
  const realized = new Map();
  for (const p of positions) realized.set(p.currency, (realized.get(p.currency) || 0) + p.realized_pnl);
  const values = [...realized].sort(([a], [b]) => a.localeCompare(b)).map(([currency,value]) =>
    '<strong class="' + pnlClass(value) + '">' + pnl(value) + ' <small>' + escaped(currency) + '</small></strong>').join('');
  return '<div><span>持仓数</span><strong>' + positions.filter(p => p.shares > 0).length + '</strong></div>' +
    '<div><span>成交笔数</span><strong>' + trades.length + '</strong></div>' +
    '<div><span>已实现盈亏</span><div class="trade-pnls">' + (values || '<strong>—</strong>') + '</div></div>';
}

function table(label, columns, rows, empty) {
  if (!rows.length) return '<p class="empty">' + empty + '</p>';
  return '<div class="table-wrap" tabindex="0" role="region" aria-label="' + label + '，可横向滚动"><table class="data-table" aria-label="' + label + '"><thead><tr>' +
    columns.map(([title,isNumber]) => '<th scope="col"' + (isNumber ? ' class="number"' : '') + '>' + title + '</th>').join('') +
    '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}

function tickerCell(row) {
  return '<td><strong class="mono">' + escaped(row.ticker) + '</strong><small>' +
    escaped(markets[row.market] || row.market) + ' · ' + escaped(row.currency) + '</small></td>';
}

function positionsTable(positions, isPM, names) {
  const rows = positions.map(p => '<tr>' + (isPM ? '<td>' + escaped(names[p.role]) + '</td>' : '') + tickerCell(p) +
    numeric(number.format(p.shares)) + numeric(p.shares ? money.format(p.avg_cost) : '—') +
    numeric(pnl(p.realized_pnl), pnlClass(p.realized_pnl)) + '<td>' + escaped(beijingTime(p.opened_at).slice(0,10)) +
    '</td><td>' + escaped(beijingTime(p.closed_at).slice(0,10)) + '</td></tr>');
  const columns = [...(isPM ? [['账户']] : []), ['标的'], ['股数',true], ['成本价',true], ['已实现盈亏',true], ['建仓日'], ['平仓日']];
  return table('持仓明细', columns, rows, '暂无持仓记录');
}

function tradesTable(trades, isPM, names) {
  const rows = trades.map(t => '<tr data-trade-id="' + escaped(t.id) + '">' + (isPM ? '<td>' + escaped(names[t.role]) + '</td>' : '') +
    '<td class="mono">' + escaped(beijingTime(t.executed_at)) + '</td>' + tickerCell(t) +
    '<td class="' + (t.direction === 'buy' ? 'positive' : 'negative') + '">' + escaped(directions[t.direction]) + '</td>' +
    numeric(money.format(t.price)) + numeric(number.format(t.quantity)) + numeric(money.format(t.fee)) + '</tr>');
  const columns = [...(isPM ? [['账户']] : []), ['成交时间'], ['标的'], ['方向'], ['价格',true], ['数量',true], ['费用',true]];
  return table('成交流水',columns,rows,'暂无成交记录');
}

async function makeRequest(fields, scope) {
  const storageKey = 'osborn.trades.pending.' + scope;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(fields)));
  const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
  let previous;
  try { previous = JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* Missing or expired request. */ }
  const requestId = previous?.fingerprint === fingerprint ? previous.requestId : crypto.randomUUID();
  sessionStorage.setItem(storageKey, JSON.stringify({fingerprint, requestId}));
  return {body:{...fields,requestId},storageKey};
}

export function createTradesView(root, {api,reload}) {
  const element = id => root.querySelector('#' + id);
  const cache = new Map();
  let current = null;
  let scope = '';
  let saving = false;

  function replace(id, html) {
    if (cache.get(id) !== html) {
      element(id).innerHTML = html;
      cache.set(id,html);
    }
  }

  function render(s) {
    if (!s.portfolio) return;
    const next = s.role + '.' + s.registrations.sessionId;
    if (scope !== next) {
      cache.clear();
      scope = next;
      saving = false;
      root.innerHTML = layout(s.role === 'PM');
    }
    current = s;
    const isPM = s.role === 'PM';
    if (isPM) {
      const account = element('trade-account');
      const selected = account.value;
      replace('trade-account','<option value="">全部分析师</option>' + s.analysts.map(profile =>
        '<option value="' + escaped(profile.id) + '">' + escaped(profile.display_name) + '</option>').join(''));
      account.value = s.analysts.some(profile => profile.id === selected) ? selected : '';
    }
    const filter = isPM ? element('trade-account').value : s.role;
    const positions = s.portfolio.positions.filter(p => !filter || p.role === filter);
    const trades = s.portfolio.trades.filter(t => !filter || t.role === filter);
    replace('trade-summary', summary(positions,trades));
    replace('trade-positions', positionsTable(positions,isPM,s.names));
    replace('trade-history', tradesTable(trades,isPM,s.names));
    element('trade-position-count').textContent = '· ' + positions.length;
    element('trade-history-count').textContent = '· ' + trades.length;
  }

  function feedback(text, error = false) {
    const line = element('trade-feedback');
    line.textContent = text;
    line.toggleAttribute('data-error',error);
  }

  function prefill(ticker, market) {
    if (!current || current.role === 'PM' || saving) return;
    const form = element('trade-form');
    form.reset();
    form.elements.ticker.value = ticker;
    form.elements.market.value = market;
    feedback('');
    form.elements.price.focus();
  }

  root.addEventListener('change', event => {
    if (event.target.id === 'trade-account' && current) render(current);
  });
  root.addEventListener('input', event => {
    if (['price','quantity'].includes(event.target.name)) {
      event.target.setCustomValidity(event.target.value && event.target.valueAsNumber <= 0 ? '请输入大于 0 的数值。' : '');
    }
  });
  root.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    if (form.id !== 'trade-form' || saving || current?.role === 'PM') return;
    const field = form.elements;
    const payload = {
      ticker:field.ticker.value.trim(),direction:field.direction.value,
      price:field.price.valueAsNumber,quantity:field.quantity.valueAsNumber,fee:field.fee.valueAsNumber || 0,
    };
    if (field.market.value) payload.market = field.market.value;
    if (field.executed_at.value) {
      try { payload.executed_at = beijingInputToISO(field.executed_at.value); }
      catch (error) { feedback(error.message, true); field.executed_at.focus(); return; }
    }
    const submittedScope = scope;
    saving = true;
    form.querySelector('fieldset').disabled = true;
    feedback('正在保存成交…');
    try {
      const {body,storageKey} = await makeRequest(payload,scope);
      if (scope !== submittedScope) return;
      const {trade} = await api('/api/trades',body);
      if (scope !== submittedScope) return;
      sessionStorage.removeItem(storageKey);
      form.reset();
      // Keep the instrument for another fill, requiring fresh price and quantity.
      field.ticker.value = trade.ticker;
      field.market.value = trade.market;
      feedback(trade.ticker + ' ' + directions[trade.direction] + ' ' + number.format(trade.quantity) + ' 股已记入成交流水。');
      await reload();
    } catch (error) {
      if (scope !== submittedScope) return;
      feedback(error.message || '尚未确认成交记录，请重试。', true);
      if (error.status === 401) await reload();
    } finally {
      if (scope === submittedScope) {
        saving = false;
        form.querySelector('fieldset').disabled = false;
      }
    }
  });

  function clear() {
    current = null;
    scope = '';
    cache.clear();
    root.replaceChildren();
  }
  return {render,clear,prefill};
}
