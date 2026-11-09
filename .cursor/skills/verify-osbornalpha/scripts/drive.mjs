#!/usr/bin/env node
// osbornalpha journey driver. Drives the running instance like a user:
// browser journeys over CDP (headless Chrome started by launch.sh), API journeys over plain HTTP.
// Every journey writes screenshots / response bodies into the evidence dir and appends to results.json.
//
// Usage (from anywhere; resolves @playwright/test from the repo's node_modules):
//   node .cursor/skills/verify-osbornalpha/scripts/drive.mjs <journey...|all>
// Journeys: landing watchlist stock quote-api auth-gate      ("all" = every journey valid for the current mode)
// Env: OSB_PORT, OSB_CDP_PORT, OSB_RUN_DIR (same defaults as env.sh); OSB_EVIDENCE_DIR overrides the dir launch.sh chose.
// Exit code: 0 if every check passed, 1 otherwise. Never weakens a check to pass.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const { chromium } = createRequire(path.join(repoRoot, 'package.json'))('@playwright/test');

const PORT = process.env.OSB_PORT ?? '3107';
const CDP = `http://127.0.0.1:${process.env.OSB_CDP_PORT ?? '9333'}`;
const BASE = `http://127.0.0.1:${PORT}`;
const RUN_DIR = process.env.OSB_RUN_DIR ?? `/tmp/osbornalpha-verify-${PORT}`;
const MODE = fs.existsSync(`${RUN_DIR}/mode`) ? fs.readFileSync(`${RUN_DIR}/mode`, 'utf8').trim() : 'guest';
const EVIDENCE = process.env.OSB_EVIDENCE_DIR
  ?? (fs.existsSync(`${RUN_DIR}/evidence_dir`) ? fs.readFileSync(`${RUN_DIR}/evidence_dir`, 'utf8').trim() : null);
if (!EVIDENCE) { console.error('drive: no evidence dir (run scripts/launch.sh first or set OSB_EVIDENCE_DIR)'); process.exit(2); }
fs.mkdirSync(EVIDENCE, { recursive: true });
const verifierSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const productShaFile = path.join(RUN_DIR, 'product_sha');
const productSha = fs.existsSync(productShaFile) ? fs.readFileSync(productShaFile, 'utf8').trim() : null;


const results = [];
let current;
function check(name, pass, detail = '') {
  current.checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 400) });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${String(detail).slice(0, 160)}` : ''}`);
}
const save = (name, data) => fs.writeFileSync(path.join(EVIDENCE, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
const shot = (page, name) => page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: false });
async function getJson(url) {
  const r = await fetch(BASE + url, { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { status: r.status, location: r.headers.get('location'), body };
}

let browser;
async function newCtx(locale = 'zh-CN') {
  browser ??= await chromium.connectOverCDP(CDP);
  // Fresh incognito-like context per journey = fresh guest (empty localStorage).
  return browser.newContext({ locale, viewport: { width: 1440, height: 900 } });
}

const journeys = {
  async landing() {
    const ctx = await newCtx('zh-CN'); const page = await ctx.newPage();
    const r = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    check('GET / → 200', r?.status() === 200, r?.status());
    check('zh title contains "AI 投资监控工作台"', /AI 投资监控工作台/.test(await page.title()), await page.title());
    check('<html lang="zh-CN">', (await page.locator('html').getAttribute('lang')) === 'zh-CN');
    check('brand "osbornalpha" visible', await page.getByText('osbornalpha').first().isVisible());
    await shot(page, 'landing-zh');
    const en = await page.goto(BASE + '/en', { waitUntil: 'networkidle' });
    check('GET /en → 200', en?.status() === 200, en?.status());
    check('en title contains "AI Investment Cockpit"', /AI Investment Cockpit/.test(await page.title()), await page.title());
    check('<html lang="en">', (await page.locator('html').getAttribute('lang')) === 'en');
    await shot(page, 'landing-en');
    const d = await page.goto(BASE + '/design', { waitUntil: 'networkidle' });
    check('GET /design → 200 with "V3 Design System"', d?.status() === 200 && await page.getByText('V3 Design System').first().isVisible());
    await shot(page, 'design');
    await ctx.close();
  },

  async watchlist() {
    if (MODE !== 'guest') { check('watchlist journey needs guest mode', false, `mode=${MODE}`); return; }
    const ctx = await newCtx('zh-CN'); const page = await ctx.newPage();
    const TICKER = '300750.SZ', NAME = '宁德时代';
    await page.goto(BASE + '/watchlist', { waitUntil: 'networkidle' });
    // The 访客模式 banner only renders when Supabase IS configured and nobody is signed in; in guest
    // mode (Supabase unset) there is no banner, so assert the page itself instead.
    check('watchlist page heading "📋 股票池" visible', await page.getByText('📋 股票池').first().isVisible());
    const before = await page.evaluate(() => localStorage.getItem('stock-monitor:watchlist:v2'));
    check(`${TICKER} not in the default guest watchlist`, !(before ?? '').includes(TICKER) && await page.locator(`a[href="/stock/${TICKER}"]`).count() === 0);
    await shot(page, 'watchlist-1-initial');
    await page.getByRole('button', { name: '📋 看板' }).click();
    await page.getByRole('button', { name: '＋ 加入股票' }).first().click();
    const input = page.getByPlaceholder(/代码 \/ 名称/);
    await input.fill('300750');
    const result = page.getByRole('button', { name: new RegExp(`${NAME}.*${TICKER.replace('.', '\\.')}`) }).first();
    await result.waitFor({ timeout: 20_000 }).catch(() => {});
    check(`search "300750" offers ${NAME} ${TICKER}`, await result.isVisible());
    await shot(page, 'watchlist-2-search');
    await result.click();
    const card = page.locator(`a[href="/stock/${TICKER}"]`);
    await card.first().waitFor({ timeout: 10_000 }).catch(() => {});
    check(`card for ${TICKER} rendered exactly once`, await card.count() === 1, await card.count());
    check('post-add insight panel shown', await page.getByLabel(`已开始监控 ${TICKER}`).isVisible().catch(() => false));
    const stored = await page.evaluate(() => localStorage.getItem('stock-monitor:watchlist:v2'));
    save('watchlist-localStorage-after-add.json', stored ?? 'null');
    check(`localStorage stock-monitor:watchlist:v2 contains ${TICKER}`, (stored ?? '').includes(TICKER));
    // A live quote for the new ticker should arrive (batch quotes refetch when the ticker set changes).
    // Kanban card price sits OUTSIDE the <a href=/stock/..> link, so read it from the post-add panel and the table.
    const insight = page.getByLabel(`已开始监控 ${TICKER}`);
    let insightText = '';
    for (let i = 0; i < 40; i++) { insightText = await insight.innerText().catch(() => ''); if (/当前(涨幅|跌幅|波动)/.test(insightText)) break; await page.waitForTimeout(1000); }
    save('watchlist-post-add-insight.txt', insightText);
    check('post-add panel switches from "行情暂不可用" to a live move within 40s', /当前(涨幅|跌幅|波动)/.test(insightText), insightText.replace(/\s+/g, ' '));
    await shot(page, 'watchlist-3-added');
    await page.getByRole('button', { name: '📊 表格' }).click();
    const row = page.locator('tr', { hasText: TICKER }).first();
    const rowText = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check(`table view row for ${TICKER} shows a ¥ price`, /¥\d/.test(rowText), rowText);
    await shot(page, 'watchlist-3b-table');
    await page.getByRole('button', { name: '📋 看板' }).click();
    await page.reload({ waitUntil: 'networkidle' });
    check(`${TICKER} persists after reload`, await page.locator(`a[href="/stock/${TICKER}"]`).count() === 1);
    // Duplicate add is refused (toast), not added twice.
    await page.getByRole('button', { name: '＋ 加入股票' }).nth(1).click();
    await page.getByPlaceholder(/代码 \/ 名称/).fill('300750');
    const again = page.getByRole('button', { name: new RegExp(`${NAME}.*${TICKER.replace('.', '\\.')}`) }).first();
    await again.waitFor({ timeout: 20_000 }).catch(() => {});
    await again.click().catch(() => {});
    const dupToast = await page.getByText(`${TICKER} 已经在股票池中`).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    check('duplicate add shows "已经在股票池中" toast', dupToast);
    check(`still exactly one ${TICKER} card after duplicate attempt`, await page.locator(`a[href="/stock/${TICKER}"]`).count() === 1);
    await shot(page, 'watchlist-4-duplicate');
    await ctx.close();
  },

  async stock() {
    const ctx = await newCtx('en-US'); const page = await ctx.newPage();
    const T = '00700.HK';
    const klines = [];
    let liveQuote = null;
    page.on('response', async (r) => {
      const u = new URL(r.url());
      if (u.origin !== BASE) return;
      if (u.pathname === '/api/quote/batch' && r.status() === 200) {
        try {
          const quote = (await r.json()).quotes?.[T];
          if (typeof quote?.price === 'number' && quote.price > 0) liveQuote = quote;
        } catch {}
      }
      if (u.pathname === `/api/kline/${T}`) {
        let bars = null;
        try { bars = (await r.json()).bars?.length ?? null; } catch {}
        klines.push({ range: u.searchParams.get('range'), status: r.status(), bars });
      }
    });
    const target = `${BASE}/portfolio?s=${T}`;
    try {
      const r = await page.goto(target, { waitUntil: 'domcontentloaded' });
      check(`GET /portfolio?s=${T} → 200 at the focused portfolio URL`, r?.status() === 200 && page.url() === target, page.url());
      const chart = page.getByTestId('kline-chart');
      await chart.waitFor({ timeout: 30_000 }).catch(() => {});
      check('kline chart visible', await chart.isVisible());
      await chart.locator('canvas').first().waitFor({ timeout: 30_000 }).catch(() => {});
      check('chart canvas drawn', await chart.locator('canvas').first().isVisible().catch(() => false));
      const focus = page.locator('main').getByText(/Tencent|腾讯/).filter({ visible: true });
      check('live Tencent quote received with a positive price', liveQuote !== null);
      check('portfolio names the company (Tencent / 腾讯)', await focus.first().isVisible());
      await shot(page, 'stock-1-default');
      const oneYear = chart.getByRole('button', { name: '1Y', exact: true });
      const beforeClick = klines.length;
      const clicked = await oneYear.click({ timeout: 10_000 }).then(() => true, () => false);
      for (let i = 0; clicked && i < 30 && !klines.slice(beforeClick).some((k) => k.range === '1y'); i++) await page.waitForTimeout(1000);
      const y = klines.slice(beforeClick).find((k) => k.range === '1y');
      check('clicking 1Y requests /api/kline?range=1y → 200 with bars', clicked && y?.status === 200 && y.bars > 0, clicked ? JSON.stringify(y) : '1Y click failed');
      check('1Y button pressed', clicked && (await oneYear.getAttribute('aria-pressed')) === 'true');
      await page.waitForTimeout(1500);
      await shot(page, 'stock-2-1y');
    } finally {
      save('stock-kline-requests.json', klines);
      await ctx.close();
    }
  },

  async 'quote-api'() {
    const one = await getJson('/api/quote/600519.SH');
    save('api-quote-600519.SH.json', one);
    check('GET /api/quote/600519.SH → 200, numeric price > 0', one.status === 200 && one.body?.price > 0, `${one.status} price=${one.body?.price} source=${one.body?.source}`);
    check('single quote carries name/currency/updated_at', !!(one.body?.name && one.body?.currency && one.body?.updated_at));
    const tickers = ['600519.SH', '00700.HK', 'AAPL'];
    const b = await getJson(`/api/quote/batch?tickers=${tickers.join(',')}`);
    save('api-quote-batch.json', b);
    const got = Object.keys(b.body?.quotes ?? {});
    check('GET /api/quote/batch (3 markets) → 200 with all 3', b.status === 200 && tickers.every((t) => b.body.quotes[t]?.price > 0), `${b.status} keys=${got.join(',')}`);
    const bad = await getJson('/api/quote/NOTAREAL999.SH');
    save('api-quote-invalid.json', bad);
    check('unknown ticker → 4xx JSON error (not 200, not 5xx)', bad.status >= 400 && bad.status < 500, `${bad.status} ${JSON.stringify(bad.body).slice(0, 120)}`);
    const s = await getJson('/api/search?q=%E8%85%BE%E8%AE%AF');
    save('api-search-tencent.json', s);
    if (MODE === 'gate') {
      // Gate mode points Supabase at a dead port, so the security master is unreachable: search must fail closed.
      check('gate mode: search fails closed → 503 security_master_unavailable', s.status === 503 && s.body?.error === 'security_master_unavailable', `${s.status} ${JSON.stringify(s.body)}`);
    } else {
      check('GET /api/search?q=腾讯 → 00700.HK', s.status === 200 && s.body?.results?.some((x) => x.t === '00700.HK'), `${s.status} source=${s.body?.source}`);
    }
    const lim = await getJson('/api/search?q=AAPL&limit=99');
    check('search limit=99 → 400 invalid_limit', lim.status === 400 && lim.body?.error === 'invalid_limit', lim.status);
  },

  async 'auth-gate'() {
    const ctx = await newCtx('zh-CN'); const page = await ctx.newPage();
    const p = await getJson('/api/portfolio');
    save(`auth-api-portfolio-${MODE}.json`, p);
    check('GET /api/portfolio signed out → 401 JSON {error}', p.status === 401 && typeof p.body?.error === 'string', `${p.status} ${JSON.stringify(p.body)}`);
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    check('/login shows email + password inputs', await page.locator('input[type="email"]').isVisible() && await page.locator('input[type="password"]').isVisible());
    await shot(page, `auth-login-${MODE}`);
    for (const from of ['/today', '/dashboard']) {
      const response = await getJson(from);
      check(`${from} → 308 /macro`, response.status === 308 && response.location === '/macro', `${response.status} ${response.location}`);
    }
    if (MODE === 'gate') {
      for (const [from, next] of [['/portfolio', '/portfolio'], ['/macro', '/macro'], ['/today', '/macro'], ['/dashboard', '/macro'], ['/en/portfolio', '/portfolio'], ['/watchlist', '/watchlist']]) {
        await page.goto(BASE + from, { waitUntil: 'networkidle' });
        const u = new URL(page.url());
        check(`${from} → /login?next=${next}`, u.pathname === '/login' && u.searchParams.get('next') === next, page.url());
      }
      const home = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      check('public / stays 200 with gate on', home?.status() === 200 && new URL(page.url()).pathname === '/');
      await shot(page, 'auth-gate-redirect');
    } else {
      const r = await page.goto(BASE + '/today', { waitUntil: 'networkidle' });
      check('guest /today reaches the Macro Workbench at /macro', r?.status() === 200
        && new URL(page.url()).pathname === '/macro'
        && await page.getByRole('heading', { name: '宏观工作台', exact: true }).isVisible(), page.url());
      await shot(page, 'auth-today-guest');
    }
    await ctx.close();
  },
};

const ORDER = ['landing', 'watchlist', 'stock', 'quote-api', 'auth-gate'];
let wanted = process.argv.slice(2);
if (!wanted.length || wanted.includes('all')) wanted = MODE === 'gate' ? ['landing', 'quote-api', 'auth-gate'] : ORDER;
const unknown = wanted.filter((w) => !journeys[w]);
if (unknown.length) { console.error(`drive: unknown journey(s) ${unknown.join(',')}; known: ${ORDER.join(' ')}`); process.exit(2); }

console.log(`drive: mode=${MODE} base=${BASE} evidence=${EVIDENCE}`);
for (const name of wanted) {
  current = { journey: name, mode: MODE, verifierSha, productSha, startedAt: new Date().toISOString(), checks: [] };
  console.log(`journey ${name}`);
  try { await journeys[name](); } catch (e) { check('journey completed without exception', false, e?.stack ?? e); }
  current.passed = current.checks.every((c) => c.pass);
  results.push(current);
}
await browser?.close().catch(() => {}); // disconnects CDP; the Chrome process stays for cleanup.sh
const file = path.join(EVIDENCE, `results-${MODE}.json`);
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
fs.writeFileSync(file, JSON.stringify([...prev, ...results], null, 2));
const all = results.flatMap((r) => r.checks);
const failed = all.filter((c) => !c.pass).length;
console.log(`drive: ${all.length - failed}/${all.length} checks passed; ${results.filter((r) => r.passed).length}/${results.length} journeys passed → ${file}`);
process.exit(failed ? 1 : 0);
