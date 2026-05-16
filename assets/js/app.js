// ─────────────────────────────────────────────────────────────
// Stock Monitor — Shared utilities
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'stock-monitor:watchlist:v1';

// Load mock data (cached)
let _dataCache = null;
async function loadData() {
  if (_dataCache) return _dataCache;
  const resp = await fetch('./assets/data/mock.json');
  _dataCache = await resp.json();
  return _dataCache;
}

// ── Watchlist persistence (localStorage) ──
function getWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function saveWatchlist(groups) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

async function getEffectiveWatchlist() {
  const local = getWatchlist();
  if (local) return local;
  const data = await loadData();
  return data.watchlist_groups;
}

function addToGroup(groups, ticker, groupId = 'opportunity') {
  const newGroups = JSON.parse(JSON.stringify(groups));
  // Remove from all groups first
  for (const g of newGroups) {
    g.tickers = g.tickers.filter(t => t !== ticker);
  }
  // Add to target group
  const target = newGroups.find(g => g.id === groupId) || newGroups[0];
  if (!target.tickers.includes(ticker)) {
    target.tickers.push(ticker);
  }
  return newGroups;
}

function removeFromAllGroups(groups, ticker) {
  return groups.map(g => ({ ...g, tickers: g.tickers.filter(t => t !== ticker) }));
}

function isInWatchlist(groups, ticker) {
  return groups.some(g => g.tickers.includes(ticker));
}

// ── Formatting ──
function formatPrice(v, currency = '') {
  return `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(v, withSign = true) {
  const s = withSign && v > 0 ? '+' : '';
  return `${s}${v.toFixed(2)}%`;
}

function formatChange(v, withSign = true) {
  const s = withSign && v > 0 ? '+' : '';
  return `${s}${v.toFixed(2)}`;
}

function formatVolume(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toString();
}

function changeClass(v) {
  return v > 0 ? 'up' : (v < 0 ? 'down' : '');
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function marketTag(m) {
  return { A: 'A 股', HK: '港股', US: '美股' }[m] || m;
}

// ── Toast ──
function showToast(msg, ms = 2200) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

// ── Search ──
function searchUniverse(universe, query, limit = 8) {
  if (!query || query.trim().length < 1) return [];
  const q = query.toLowerCase().trim();
  const scored = universe.map(item => {
    let score = 0;
    const t = item.t.toLowerCase();
    const n = item.n.toLowerCase();
    const py = (item.py || '').toLowerCase();
    if (t === q) score = 100;
    else if (t.startsWith(q)) score = 50;
    else if (n === q) score = 45;
    else if (n.startsWith(q)) score = 40;
    else if (py.startsWith(q)) score = 30;
    else if (t.includes(q)) score = 20;
    else if (n.includes(q)) score = 15;
    else if (py.includes(q)) score = 10;
    return { item, score };
  }).filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(s => s.item);
}

// ── Build the topbar + tabbar (shared component) ──
function renderShell(activeTab) {
  const topbar = `
    <header class="topbar">
      <a href="./index.html" class="logo">Stock<span>Monitor</span></a>
      <div class="search">
        <input id="global-search" type="text" placeholder="搜索代码或名称（如 腾讯 / AAPL / 600519）" autocomplete="off" />
        <div class="search-dropdown" id="search-dropdown"></div>
      </div>
      <a href="./about.html" class="icon-btn" title="关于">ⓘ</a>
    </header>
  `;
  const tabs = [
    { id: 'home', icon: '🏠', label: '首页', href: './index.html' },
    { id: 'watch', icon: '📋', label: '股票池', href: './watchlist.html' },
    { id: 'detail', icon: '📊', label: '详情', href: './stock.html?ticker=00700.HK' },
    { id: 'about', icon: 'ⓘ', label: '关于', href: './about.html' }
  ];
  const tabbar = `
    <nav class="tabbar">
      ${tabs.map(t => `<a href="${t.href}" class="${t.id === activeTab ? 'active' : ''}"><span class="icon">${t.icon}</span><span>${t.label}</span></a>`).join('')}
    </nav>
  `;
  return { topbar, tabbar };
}

// ── Wire global search ──
async function wireGlobalSearch() {
  const input = document.getElementById('global-search');
  const drop = document.getElementById('search-dropdown');
  if (!input || !drop) return;
  const data = await loadData();
  const universe = data.universe;
  let focusedIdx = -1;
  let lastResults = [];

  function render(results) {
    lastResults = results;
    focusedIdx = -1;
    if (!results.length) {
      drop.classList.remove('open');
      drop.innerHTML = '';
      return;
    }
    drop.innerHTML = results.map((r, i) => `
      <div class="search-result" data-idx="${i}" data-ticker="${r.t}">
        <span class="market-tag">${marketTag(r.m)}</span>
        <div>
          <div class="ticker-text">${r.n}</div>
          <div class="name-text">${r.t}</div>
        </div>
        <span style="color:var(--text-muted);font-size:11px">→ 详情</span>
      </div>
    `).join('');
    drop.classList.add('open');
  }

  input.addEventListener('input', e => {
    const q = e.target.value;
    render(searchUniverse(universe, q));
  });
  input.addEventListener('focus', () => {
    if (input.value) render(searchUniverse(universe, input.value));
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { drop.classList.remove('open'); input.blur(); }
    else if (e.key === 'ArrowDown' && lastResults.length) {
      e.preventDefault();
      focusedIdx = (focusedIdx + 1) % lastResults.length;
      updateFocus();
    } else if (e.key === 'ArrowUp' && lastResults.length) {
      e.preventDefault();
      focusedIdx = (focusedIdx - 1 + lastResults.length) % lastResults.length;
      updateFocus();
    } else if (e.key === 'Enter') {
      const target = focusedIdx >= 0 ? lastResults[focusedIdx] : lastResults[0];
      if (target) {
        window.location.href = `./stock.html?ticker=${encodeURIComponent(target.t)}`;
      }
    }
  });
  function updateFocus() {
    drop.querySelectorAll('.search-result').forEach((el, i) => {
      el.classList.toggle('focused', i === focusedIdx);
    });
  }

  drop.addEventListener('click', e => {
    const row = e.target.closest('.search-result');
    if (row) {
      const ticker = row.dataset.ticker;
      window.location.href = `./stock.html?ticker=${encodeURIComponent(ticker)}`;
    }
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !drop.contains(e.target)) {
      drop.classList.remove('open');
    }
  });

  // Cmd+K / Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

// ── Disclaimer footer ──
function renderDisclaimer() {
  return `
    <div class="disclaimer">
      <strong>免责声明</strong>：本站所有内容由 AI 自动生成，仅作为投资决策的辅助参考，
      不构成任何形式的投资建议、要约或推介。AI 生成的观点可能存在错误、遗漏或偏差。
      历史数据不代表未来表现。投资决策应基于您自身的研究和判断，您应自行承担所有投资风险。
      Stock Monitor 是个人开源工具，不提供任何投资建议许可服务。
    </div>
  `;
}

// Auto-attach on page load
document.addEventListener('DOMContentLoaded', () => {
  wireGlobalSearch();
});
